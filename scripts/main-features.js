'use strict';

// =============================================================================
// FOXWEB MAIN FEATURES - Funcionalidades adicionales (Búsqueda, Pestañas, Modales, UI)
// Este archivo contiene funcionalidades extendidas que dependen de main-core.js
// =============================================================================

// Mapeo de nombres de pestañas a valores cortos para query parameters
const TAB_QUERY_MAP = {
    'Programas': 'programs',
    'Sistemas': 'systems',
    'Juegos': 'games',
    'Extras': 'extras',
    'APKs': 'apks'
};

// Mapeo inverso: de valores de query a nombres de pestañas
const QUERY_TAB_MAP = {
    'programs': 'Programas',
    'systems': 'Sistemas',
    'games': 'Juegos',
    'extras': 'Extras',
    'apks': 'APKs'
};

// Función para escapar HTML y prevenir XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// =============================================================================
// PESTAÑAS Y CONTENIDO
// =============================================================================

function renderAllTabs() {
    if (!AppState.dbData) return;
    try {
        TABS_CONFIG.forEach(({ key, id }) => renderTab(id, AppState.dbData[key]));
        // Actualizar iconos de favoritos después de renderizar
        TABS_CONFIG.forEach(({ id }) => {
            if (typeof updateAllFavoriteIconsInTab === 'function') {
                updateAllFavoriteIconsInTab(id);
            }
        });
        setTimeout(() => activateCurrentTab(), 50);
    } catch (error) {
        console.error('Error renderizando pestañas:', error);
        showErrorScreen('Error al renderizar el contenido. Por favor, recarga la página.');
    }
}

const SEARCH_PLACEHOLDERS = {
    'Programas': 'Buscar programas...',
    'Sistemas': 'Buscar sistemas...',
    'Juegos': 'Buscar juegos...',
    'Extras': 'Buscar extras...',
    'APKs': 'Buscar APKs...'
};

function updateSearchPlaceholder() {
    try {
        const searchInput = document.getElementById('mainSearch');
        if (!searchInput) return;
        const placeholder = SEARCH_PLACEHOLDERS[AppState.currentTab] || 'Buscar programas, juegos, sistemas...';
        searchInput.setAttribute('placeholder', placeholder);
    } catch (error) {
        console.error('Error actualizando placeholder de búsqueda:', error);
    }
}

function activateCurrentTab() {
    try {
        const loader = document.getElementById('global-loader');
        if (loader) loader.style.display = 'none';

        document.querySelectorAll('.tab-content').forEach(tab => { tab.classList.remove('active'); tab.setAttribute('aria-hidden', 'true'); }); 
        const activeTab = document.getElementById(AppState.currentTab); 
        if (activeTab) { activeTab.classList.add('active'); activeTab.setAttribute('aria-hidden', 'false'); }
        document.querySelectorAll('.tablink').forEach(btn => { 
            const tabName = btn.getAttribute('data-tab') || btn.textContent.trim() || btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]; 
            const isActive = tabName === AppState.currentTab; 
            btn.classList.toggle('active', isActive); 
            btn.setAttribute('aria-selected', isActive); 
        });
        
        updateHash(AppState.currentTab);
        
        // Actualizar iconos de favoritos al cambiar de pestaña
        if (typeof updateAllFavoriteIconsInTab === 'function') {
            updateAllFavoriteIconsInTab(AppState.currentTab);
        }
        
        updateSearchPlaceholder();

        // Si la pestaña es 'Programas' y la página se cargó sin query parameters,
        // nos aseguramos de que la URL esté limpia.
        if (AppState.currentTab === 'Programas' && !AppState.hasInitialHash) {
            if (history.replaceState) {
                const url = new URL(window.location.href);
                // Solo mantener query parameters si existen
                if (!url.searchParams.has('tab')) {
                    history.replaceState(null, null, url.pathname);
                }
            }
        }
    } catch (error) { 
        console.error('Error activando pestaña:', error); 
    }
}

function updateHash(tabName) {
    if (AppState.navigationLock) return; 
    try {
        AppState.navigationLock = true; 
        
        // Obtener el valor corto para query parameter
        const tabValue = TAB_QUERY_MAP[tabName] || tabName.toLowerCase();
        
        // Construir nueva URL con query parameters
        const url = new URL(window.location.href);
        const currentTab = url.searchParams.get('tab');
        const currentPage = url.searchParams.get('page');
        
        // Solo actualizar si la pestaña es diferente
        if (currentTab !== tabValue) {
            url.searchParams.set('tab', tabValue);
            // Resetear página a 1 cuando se cambia de pestaña
            url.searchParams.set('page', '1');
            
            AppState.previousHash = tabName; 
            
            if (history.replaceState) { 
                history.replaceState(null, null, url.toString()); 
            } else { 
                window.location.href = url.toString(); 
            } 
        }
        
        setTimeout(() => { AppState.navigationLock = false; }, 100);
    } catch (error) { 
        console.error('Error actualizando URL:', error); 
        AppState.navigationLock = false; 
    }
}

/**
 * Actualiza el query parameter de página en la URL
 * @param {number} page - Número de página
 */
function updatePageQueryParam(page) {
    try {
        const url = new URL(window.location.href);
        const currentPage = url.searchParams.get('page');
        
        // Solo actualizar si la página es diferente
        if (currentPage !== page.toString()) {
            url.searchParams.set('page', page.toString());
            
            if (history.replaceState) { 
                history.replaceState(null, null, url.toString()); 
            } else { 
                window.location.href = url.toString(); 
            }
        }
    } catch (error) { 
        console.error('Error actualizando query parameter de página:', error); 
    }
}

function renderTab(tabId, items) {
    const grid = document.getElementById(`grid-${tabId}`); 
    if (!grid) return; 
    try {
        // Mostrar estado de carga mientras se procesa
        grid.innerHTML = `
            <div class="loading-placeholder" role="status">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Cargando...</p>
            </div>
        `;

        // Si el sistema de paginación está disponible, usarlo
        if (window.PaginationSystem && window.PaginationSystem.renderTab) {
            window.PaginationSystem.renderTab(tabId);
            // Actualizar iconos de favoritos después de renderizar
            requestAnimationFrame(() => {
                try { updateAllFavoriteIconsInTab(tabId); } catch(e) {}
            });
            return;
        }

        // Fallback: renderizado sin paginación
        grid.innerHTML = ''; 
        if (!items || items.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" role="status">
                    <i class="fa-solid fa-box-open" aria-hidden="true"></i>
                    <h3>No hay contenido disponible</h3>
                    <p>Pronto agregaremos más ${tabId.toLowerCase()}.</p>
                </div>
            `; 
            return;
        }
        // Get current view mode from grid class
        const viewMode = grid.classList.contains('compact-view') ? 'compact' : 'cards';
        const fragment = document.createDocumentFragment(); 
        items.forEach((item, index) => { 
            const itemId = `${tabId.toLowerCase()}_${index}`; 
            const card = createContentCard(item, tabId, itemId, viewMode); 
            if (card) fragment.appendChild(card); 
        }); 
        grid.appendChild(fragment); 
        initContentCardsEvents();
    } catch (error) {
        console.error(`Error renderizando pestaña ${tabId}:`, error); 
        grid.innerHTML = '<div class="empty-state" role="status"><i class="fa-solid fa-exclamation-triangle"></i><h3>Error cargando contenido</h3><p>Intenta recargar la página.</p></div>';
    }
        // Actualizar iconos de favoritos después de renderizar
        requestAnimationFrame(() => {
            try { updateAllFavoriteIconsInTab(tabId); } catch(e) {}
        });

        // Cargar iconos de programas si hay conexión
        if (window.reloadIcons) {
            window.reloadIcons();
        }
    }

function createContentCard(item, category, itemId, viewMode = 'cards') {
    try {
        // Always use manual card creation for consistent behavior
        return createCardManually(item, category, itemId, viewMode);
    } catch (error) { 
        console.error('Error creando card:', error); 
        return null; 
    }
}

// Render icon - supports Font Awesome classes or image URLs
function renderIcon(icon) {
    if (!icon) return '<i class="fa-solid fa-folder"></i>';
    
    // Check if it's a URL (starts with http, https, /, or data:)
    if (icon.match(/^(http|https|\/|data:)/i)) {
        return `<img src="${icon}" alt="icon" class="card-icon-img">`;
    }
    
    // Otherwise treat as Font Awesome class
    return `<i class="${icon}" aria-hidden="true"></i>`;
}

function createCardFromTemplate(template, item, category, itemId) {
    try {
        const clone = template.content.cloneNode(true); 
        const card = clone.querySelector('.content-card'); 
        if (!card) return createCardManually(item, category, itemId); 
        card.dataset.id = itemId; 
        card.dataset.category = category.toLowerCase(); 
        card.dataset.type = getItemType(item); 
        const iconContainer = card.querySelector('.card-icon'); 
        if (iconContainer) { iconContainer.innerHTML = renderIcon(item.icon); }
        const titleText = card.querySelector('.card-title-text'); 
        const mainBadge = card.querySelector('.main-badge'); 
        if (titleText) { titleText.textContent = item.name; }
        if (mainBadge && item.badges && item.badges.length > 0) { mainBadge.textContent = item.badges[0]; } else if (mainBadge) { mainBadge.style.display = 'none'; }
        const description = card.querySelector('.card-description'); 
        if (description) { description.textContent = item.info; }
        const badgesContainer = card.querySelector('.card-badges'); 
        if (badgesContainer && item.badges && item.badges.length > 1) { 
            for (let i = 1; i < item.badges.length; i++) { 
                const badge = document.createElement('span'); 
                badge.className = 'item-badge'; 
                badge.textContent = item.badges[i]; 
                badge.setAttribute('role', 'listitem'); 
                badgesContainer.appendChild(badge); 
            } 
        }
        const favoriteBtn = card.querySelector('.card-action-btn:nth-child(1)'); 
        if (favoriteBtn) { favoriteBtn.onclick = () => toggleFavorite(itemId); updateFavoriteIcon(favoriteBtn, itemId); }
        const copyLinkBtn = card.querySelector('.copy-link-btn'); 
        if (copyLinkBtn) { 
            if (item.modal && item.modal !== 'null') { 
                copyLinkBtn.style.display = 'none'; 
                copyLinkBtn.remove(); 
            } else if (item.enlace && item.enlace !== '#') { 
                copyLinkBtn.onclick = () => copyItemLink(itemId); 
            } else { 
                copyLinkBtn.style.display = 'none'; 
                copyLinkBtn.remove(); 
            } 
        }
        const downloadBtn = card.querySelector('.download-btn');
        const cardFooter = card.querySelector('.card-footer');
        if (downloadBtn && cardFooter) {
            if (item.modal && item.modal !== 'null') {
                downloadBtn.onclick = () => openModal(item.modal);
            } else if (item.enlace && item.enlace !== '#') {
                downloadBtn.onclick = () => window.open(item.enlace, '_blank');
            } else {
                downloadBtn.disabled = true;
                downloadBtn.innerHTML = '<i class="fa-solid fa-ban" aria-hidden="true"></i> No disponible';
            }
            // Añadir badge de seguridad si existe
            if (item.security && item.security.verified) {
                const securityDiv = document.createElement('div'); 
                securityDiv.className = 'security-badge'; 
                securityDiv.title = item.security.note || 'Archivo verificado por el equipo de FoxWeb';
                const shieldIcon = document.createElement('i'); 
                shieldIcon.className = 'fa-solid fa-shield-check';
                securityDiv.appendChild(shieldIcon);
                const verifiedText = document.createTextNode(' Verificado'); 
                securityDiv.appendChild(verifiedText);
                cardFooter.appendChild(securityDiv);
            }
        }
        return card;
    } catch (error) { 
        console.error('Error creando card desde template:', error); 
        return createCardManually(item, category, itemId); 
    }
}

function createCardManually(item, category, itemId, viewMode = 'cards') {
    try {
        const card = document.createElement('div'); 
        card.className = 'content-card'; 
        card.dataset.id = itemId; 
        card.dataset.category = category.toLowerCase(); 
        card.dataset.type = getItemType(item); 
        
        const showCopyLink = !(item.modal && item.modal !== 'null') && item.enlace && item.enlace !== '#'; 
        const mainBadge = item.badges && item.badges.length > 0 ? item.badges[0] : null; 
        const remainingBadges = item.badges && item.badges.length > 1 ? item.badges.slice(1) : []; 
        
        if (viewMode === 'compact') {
            // Vista compacta: [icono] [fav] Nombre Badge Descripcion -------- [Copiar] [Detalles] [Abrir enlace]
            const showCopyLink = item.enlace && item.enlace !== '#';
            const hasModal = item.modal && item.modal !== 'null';
            const iconHtml = renderIcon(item.icon);
            
            card.innerHTML = `
                <div class="card-compact-container" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                        <div class="card-icon" style="flex-shrink: 0;">
                            ${iconHtml}
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;">
                            <h3 class="card-title" style="margin: 0; font-size: 0.9rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1;">
                                ${escapeHtml(item.name)}
                            </h3>
                            ${mainBadge ? `<span class="main-badge" style="width: fit-content; font-size: 0.6rem; flex-shrink: 0;">${escapeHtml(mainBadge)}</span>` : ''}
                            <p class="card-description" style="margin: 0; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-dim);">
                                ${escapeHtml(item.info)}
                            </p>
                        </div>
                    </div>
                    <div class="card-actions" style="display: flex; gap: 8px; align-items: center; flex-shrink: 0; margin-left: auto;">
                        <button class="card-action-btn favorite-btn" aria-label="Agregar a favoritos" title="Favorito">
                            <i class="fa-regular fa-heart"></i>
                        </button>
                        ${hasModal ? `
                            <button class="download-btn details-btn" data-modal="${escapeHtml(item.modal)}">
                                <i class="fa-solid fa-circle-info"></i><span>Detalles</span>
                            </button>
                        ` : `
                            ${showCopyLink ? `
                                <button class="download-btn copy-link-btn" data-item-id="${escapeHtml(itemId)}" title="Copiar enlace">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                            ` : ''}
                            ${item.enlace && item.enlace !== '#' ? `
                                <button class="download-btn" data-url="${escapeHtml(item.enlace)}">
                                    <i class="fa-solid fa-download"></i><span>Abrir</span>
                                </button>
                            ` : ''}
                        `}
                    </div>
                </div>
            `;

            
            // Event listeners para vista compacta (evita XSS en onclick)
            const favoriteBtnCompact = card.querySelector('button.favorite-btn');
            if (favoriteBtnCompact) {
                favoriteBtnCompact.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleFavorite(itemId);
                    updateFavoriteIcon(favoriteBtnCompact, itemId);
                });
            }

            const copyLinkBtn = card.querySelector('button.copy-link-btn[data-item-id]');

        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                copyItemLink(itemId);
            });
        }

        const detailsBtnCompact = card.querySelector('button.details-btn[data-modal]');
        if (detailsBtnCompact) {
            detailsBtnCompact.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                openModal(item.modal);
            });
        }

        const downloadBtnCompact = card.querySelector('button.download-btn[data-url]');
        if (downloadBtnCompact) {
            downloadBtnCompact.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                window.open(item.enlace, '_blank');
            });
        }
        } else {
            // Vista de tarjetas normal
            const hasModal = item.modal && item.modal !== 'null';
            const showCopyLink = item.enlace && item.enlace !== '#';
            
            // Escapar contenido dinámico para prevenir XSS
            const safeName = escapeHtml(item.name);
            const safeInfo = escapeHtml(item.info);
            const safeModal = item.modal ? escapeHtml(item.modal) : '';
            const safeEnlace = item.enlace ? escapeHtml(item.enlace) : '';
            const safeBadge = mainBadge ? escapeHtml(mainBadge) : '';
            const safeRemainingBadges = remainingBadges.map(b => escapeHtml(b));
            const safeSecurityNote = item.security && item.security.note ? escapeHtml(item.security.note) : '';
            const iconHtml = renderIcon(item.icon);
            
            card.innerHTML = `
                <div class="card-body" style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; gap: 8px; align-items: flex-start;">
                        <div class="card-icon" style="flex-shrink: 0; margin-top: 2px;">
                            ${iconHtml}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <h3 class="card-title" style="margin: 0; font-size: 0.95rem; line-height: 1.2;">
                                    <span class="card-title-text">${safeName}</span>
                                    </h3>
                                    ${safeBadge ? `<span class="main-badge" style="width: fit-content; font-size: 0.65rem;">${safeBadge}</span>` : ''}
                                </div>
                                <button class="card-action-btn favorite-btn" aria-label="Agregar a favoritos" title="Favorito">
                                    <i class="fa-regular fa-heart"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <p class="card-description" style="margin: 0; padding-left: 0;">${safeInfo}</p>
                    ${safeRemainingBadges.length > 0 ? `
                    <div class="card-badges" style="margin-top: 4px; padding-left: 0;">
                        ${safeRemainingBadges.map(b => `<span class="item-badge">${b}</span>`).join('')}
                    </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    ${hasModal ? `
                    <button class="download-btn details-btn" data-modal="${safeModal}">
                        <i class="fa-solid fa-circle-info"></i><span>Detalles</span>
                    </button>` : ''}
                    ${item.enlace && item.enlace !== '#' ? `
                    <div style="display: inline-flex; gap: 8px; align-items: center;">
                        ${showCopyLink ? `
                        <button class="copy-link-btn copy-link-btn-footer" data-item-id="${escapeHtml(itemId)}" title="Copiar enlace">
                            <i class="fa-solid fa-link"></i>
                        </button>` : ''}
                        <button class="download-btn" ${hasModal ? '' : 'style="flex:1"'} data-url="${safeEnlace}">
                            <i class="fa-solid fa-download"></i>
                            ${hasModal ? 'Abrir' : 'Descargar'}
                        </button>
                    </div>` : (!hasModal ? `
                    <button class="download-btn" disabled style="flex:1">
                        <i class="fa-solid fa-ban"></i>No disponible
                    </button>` : '')}
                    ${item.security && item.security.verified ? `
                    <div class="security-badge" title="${safeSecurityNote || 'Archivo verificado'}">
                        <i class="fa-solid fa-shield-check"></i> Verificado
                    </div>
                    ` : ''}
                </div>
            `;
            
            // Añadir event listeners para vista normal (evita XSS en onclick)
            // Botón de COPIAR en footer - selector específico
            const copyLinkBtn = card.querySelector('button.copy-link-btn-footer[data-item-id]');
            if (copyLinkBtn) {
                copyLinkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    copyItemLink(itemId);
                });
            }

            // Botón de FAVORITOS - selector específico
            const favoriteBtn = card.querySelector('button.favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleFavorite(itemId);
                    updateFavoriteIcon(favoriteBtn, itemId);
                });
            }

            // Botón de DETALLES (modal)
            const detailsBtnNormal = card.querySelector('button.details-btn[data-modal]');
            if (detailsBtnNormal && hasModal) {
                detailsBtnNormal.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    openModal(item.modal);
                });
            }

            // Botón de ABRIR/DESCARGAR
            const mainDownloadBtnNormal = card.querySelector('button.download-btn[data-url]');
            if (mainDownloadBtnNormal && !mainDownloadBtnNormal.disabled && item.enlace && item.enlace !== '#') {
                mainDownloadBtnNormal.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    window.open(item.enlace, '_blank');
                });
            }
        }
        
        return card;
    } catch (error) {
        console.error('Error creando card manualmente:', error);
        return null;
    }
}

function getItemType(item) {
    if (item.badges && item.badges.some(b => b.toLowerCase().includes('juego'))) return 'juego';
    if (item.badges && item.badges.some(b => b.toLowerCase().includes('sistema'))) return 'sistema';
    if (item.badges && item.badges.some(b => b.toLowerCase().includes('apk'))) return 'apk';
    if (item.badges && item.badges.some(b => b.toLowerCase().includes('driver') || b.toLowerCase().includes('utilidad'))) return 'utilidad';
    return 'standard';
}

/**
 * Busca un item por su ID en AppState.dbData
 * @param {string} itemId - ID del item (ej: "programas_0")
 * @returns {Object|null} Item encontrado o null
 */
function findItemById(itemId) {
    if (!AppState || !AppState.dbData) {
        console.warn('AppState.dbData no disponible');
        return null;
    }
    try {
        // 1. Intentar buscar por ID único (formato "000001")
        for (const category in AppState.dbData) {
            if (category === 'modales') continue;
            const item = AppState.dbData[category].find(i => i.id === itemId);
            if (item) return item;
        }
        
        // 2. Fallback: Buscar por formato antiguo "categoria_indice"
        const [category, indexStr] = itemId.split('_');
        const index = parseInt(indexStr, 10);
        if (AppState.dbData[category] && AppState.dbData[category][index]) {
            return AppState.dbData[category][index];
        }
    } catch (e) {
        console.warn('Error buscando item:', itemId, e);
    }
    return null;
}


// =============================================================================
// BÚSQUEDA
// =============================================================================

function initSearch() { 
    const searchInput = document.getElementById('mainSearch'); 
    const clearBtn = document.getElementById('clearSearch'); 
    if (!searchInput || !clearBtn) return; 
    try { 
        searchInput.addEventListener('input', debounce(performSearch, 150)); 
        clearBtn.addEventListener('click', clearSearch); 
        searchInput.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape') clearSearch(); 
            if (e.key === 'Enter') performSearch(); 
        }); 
        searchInput.addEventListener('input', () => { 
            const hasValue = searchInput.value.trim() !== ''; 
            clearBtn.style.display = hasValue ? 'flex' : 'none'; 
            AppState.searchActive = hasValue; 
            updateSearchState(); 
        }); 
        searchInput.addEventListener('focus', () => { 
            AppState.searchActive = true; 
            updateSearchState(); 
        }); 
        searchInput.addEventListener('blur', () => { 
            if (searchInput.value.trim() === '') { 
                AppState.searchActive = false; 
                updateSearchState(); 
            } 
        }); 
        if (AppState.currentSearch) { 
            searchInput.value = AppState.currentSearch; 
            clearBtn.style.display = 'flex'; 
            performSearch(); 
        } 
    } catch (error) { 
        console.error('Error inicializando búsqueda:', error); 
    } 
}

function updateSearchState() {
    try {
        if (!searchSectionElement || !navElement) {
            navElement = document.querySelector('.main-nav');
            searchSectionElement = document.querySelector('.search-section');
        }

        if (!searchSectionElement || !navElement) return;

        if (AppState.searchActive) {
            searchSectionElement.classList.add('active-search');
            navElement.classList.add('search-active');
        } else {
            searchSectionElement.classList.remove('active-search');
            navElement.classList.remove('search-active');
        }
    } catch (error) {
        console.error('Error actualizando estado de búsqueda:', error);
    }
}

function performSearch() {
    const searchInput = document.getElementById('mainSearch');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    const activeTab = AppState.currentTab; // Usamos currentTab que es el que usa tu AppState
    
    // Actualizar estado de búsqueda
    AppState.currentSearch = query;
    AppState.searchActive = query.length > 0;
    
    // Si el sistema de paginación está disponible, usarlo
    if (window.PaginationSystem && window.PaginationSystem.renderTab) {
        // Disparar evento de cambio de búsqueda
        document.dispatchEvent(new CustomEvent('searchChanged', { 
            detail: { query: query, tabId: activeTab } 
        }));
        return;
    }
    
    // Fallback: búsqueda sin paginación
    const grid = document.getElementById(`grid-${activeTab}`);
    if (!grid) return;

    const cards = grid.querySelectorAll('.content-card, .card'); // Buscamos ambos por si acaso
    let hasResults = false;

    cards.forEach(card => {
        // Buscamos el texto dentro del título y la descripción
        const title = card.querySelector('.card-title-text')?.textContent.toLowerCase() || "";
        const desc = card.querySelector('.card-description')?.textContent.toLowerCase() || "";

        if (title.includes(query) || desc.includes(query)) {
            card.style.display = ""; // Mostramos
            card.classList.remove('hidden');
            hasResults = true;
        } else {
            card.style.display = "none"; // Ocultamos
            card.classList.add('hidden');
        }
    });

    // Actualizar contador del span
    const countElement = document.getElementById(`count-${activeTab}`);
    if (countElement) {
        const visibleCount = grid.querySelectorAll('.content-card:not([style*="display: none"]), .card:not(.hidden)').length;
        countElement.textContent = `(${visibleCount})`;
    }

    // Gestionar mensaje de "No encontrado"
    handleSearchEmptyState(activeTab, !hasResults, query);
}

function clearSearch() {
    const searchInput = document.getElementById('mainSearch');
    const clearBtn = document.getElementById('clearSearch');

    if (searchInput) {
        searchInput.value = '';
        AppState.currentSearch = '';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    performSearch(); // Al estar vacío, mostrará todo de nuevo
    updateCounters(); // Restaura los números totales
}

function handleSearchEmptyState(tabId, isEmpty, query) {
    const grid = document.getElementById(`grid-${tabId}`);
    if (!grid) return;

    let msg = grid.querySelector('.no-results-msg');
    if (isEmpty && query !== '') {
        if (!msg) {
            msg = document.createElement('div');
            msg.className = 'no-results-msg';
            msg.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-dim);';
            grid.appendChild(msg);
        }
        // Actualizar el mensaje con el query actual
        const safeQuery = escapeHtml(query);
        msg.innerHTML = `<i class="fa-solid fa-face-frown"></i> No hay resultados de "${safeQuery}"`;
    } else if (msg) {
        msg.remove();
    }
}

window.openTab = function(tabName) {
    if (typeof AppState === 'undefined') {
        console.warn('[openTab] AppState not yet loaded, deferring tab open:', tabName);
        setTimeout(() => openTab(tabName), 50);
        return;
    }
    if (AppState.navigationLock || AppState.currentTab === tabName) return;
    try {
        AppState.currentTab = tabName; 
        document.querySelectorAll('.tab-content').forEach(tab => { tab.classList.remove('active'); tab.setAttribute('aria-hidden', 'true'); }); 
        const activeTab = document.getElementById(tabName); 
        if (activeTab) { activeTab.classList.add('active'); activeTab.setAttribute('aria-hidden', 'false'); }
        document.querySelectorAll('.tablink').forEach(btn => { 
            const tabNameFromBtn = btn.getAttribute('data-tab') || btn.textContent.trim() || btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]; 
            const isActive = tabNameFromBtn === tabName; 
            btn.classList.toggle('active', isActive); 
            btn.setAttribute('aria-selected', isActive); 
        }); 
        updateHash(tabName); 
        if (AppState.currentSearch) { setTimeout(performSearch, 50); }
        updateSearchPlaceholder();
        saveAppState();
        
        // Disparar evento personalizado para cambio de pestaña
        document.dispatchEvent(new CustomEvent('tabChanged', { 
            detail: { tabId: tabName } 
        }));
    } catch (error) { 
        console.error(`Error abriendo pestaña ${tabName}:`, error); 
    }
}

function openTab(tabName) {
    // Esta función ahora es un wrapper interno, la lógica principal está en window.openTab
    window.openTab(tabName);
}

// =============================================================================
// SCROLL
// =============================================================================

function initScrollHideNav() {
    let ticking = false;
    window.addEventListener('scroll', function () {
        if (!ticking) {
            window.requestAnimationFrame(function () {
                handleScroll();
                ticking = false;
            });
            ticking = true;
        }
    });
}

function handleScroll() {
    try {
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (!navElement || !searchSectionElement) {
            navElement = document.querySelector('.main-nav');
            searchSectionElement = document.querySelector('.search-section');
        }

        if (!navElement || !searchSectionElement) return;

        if (window.innerWidth <= 768) {
            const scrollDifference = currentScrollTop - AppState.lastScrollTop;
            if (scrollDifference > 10 && currentScrollTop > 100) {
                navElement.classList.add('hidden-by-search');
                searchSectionElement.classList.add('hiding-nav');
            } else if (scrollDifference < -10) {
                navElement.classList.remove('hidden-by-search');
                searchSectionElement.classList.remove('hiding-nav');
            }
        }

        AppState.lastScrollTop = currentScrollTop;
    } catch (error) {
        console.error('Error manejando scroll:', error);
    }
}

// =============================================================================
// MODALES Y SUGERENCIAS
// =============================================================================

function checkUrlForModal() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const modalParam = urlParams.get('modal');
        if (modalParam) {
            openModal(modalParam);
            // Limpiar la URL
            if (history.replaceState) {
                history.replaceState(null, null, window.location.pathname);
            }
        }
    } catch (error) {
        console.error('Error verificando modal en URL:', error);
    }
}

// =============================================================================
// FORMULARIO DE SUGERENCIAS
// =============================================================================

function initSuggestionForm() {
    const form = document.getElementById('suggestionForm');
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        submitSuggestion();
    });
}

// Rate limiting for suggestions
const suggestionRateLimit = {
    lastSubmit: 0,
    limit: 60000 // 1 minute between submissions
};

function submitSuggestion() {
    const form = document.getElementById('suggestionForm');
    if (!form) return;
    
    // Rate limiting check
    const now = Date.now();
    if (now - suggestionRateLimit.lastSubmit < suggestionRateLimit.limit) {
        showToast('Por favor, espera un momento antes de enviar otra sugerencia', 'warning');
        return;
    }
    
    const nombre = (document.getElementById('suggestionName')?.value.trim() || '').slice(0, 100);
    const email = (document.getElementById('suggestionEmail')?.value.trim() || '').slice(0, 100);
    const tipo = (document.getElementById('suggestionType')?.value || 'programa').slice(0, 50);
    const mensaje = (document.getElementById('suggestionMessage')?.value.trim() || '').slice(0, 1000);
    
    if (!mensaje) {
        showToast('Por favor, escribe tu sugerencia', 'warning');
        return;
    }
    
    // Validar email si se proporciona
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Por favor, introduce un email válido', 'warning');
        return;
    }
    
    // Sanitize inputs to prevent XSS
    const sanitize = (str) => str.replace(/[<>]/g, '');
    
    const suggestion = {
        nombre: sanitize(nombre) || 'Anónimo',
        email: sanitize(email) || 'No proporcionado',
        tipo: sanitize(tipo),
        mensaje: sanitize(mensaje),
        fecha: new Date().toISOString()
    };
    
    suggestionRateLimit.lastSubmit = now;
    
    showToast('¡Gracias por tu sugerencia! La Tendremos en cuenta.', 'success');
    
    // Cerrar modal y resetear formulario
    closeModal('sugerenciaModal');
    form.reset();
}

function resetSuggestionForm() {
    const form = document.getElementById('suggestionForm');
    if (form) form.reset();
}

// =============================================================================
// UTILIDADES VARIAS
// =============================================================================


// Utilidad debounce para búsquedas
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Inicializar componentes flotantes
let floatingButtonsInitialized = false;
let floatingButtonsRetries = 0;
const MAX_FLOATING_BUTTON_RETRIES = 3;

function initFloatingButtons() {
    // Evitar inicialización múltiple
    if (floatingButtonsInitialized) return;
    
    // Máximo de reintentos para evitar bucles infinitos
    if (floatingButtonsRetries >= MAX_FLOATING_BUTTON_RETRIES) {
        floatingButtonsInitialized = true; // Marcar como inicializado para no seguir intentando
        return;
    }
    
    // Usar setTimeout para asegurar que el DOM esté completamente cargado
    setTimeout(function() {
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        
        // Si el botón no existe (página de inicio, etc.), salir
        if (!scrollTopBtn) {
            floatingButtonsRetries++;
            // Solo reintentar si hay oportunidades restantes
            if (floatingButtonsRetries < MAX_FLOATING_BUTTON_RETRIES) {
                setTimeout(initFloatingButtons, 500);
            } else {
                floatingButtonsInitialized = true;
            }
            return;
        }
        
        // Marcar como inicializado exitosamente
        floatingButtonsInitialized = true;
        
        const scrollThreshold = 300;
        let lastScrollY = 0;
        let ticking = false;
        
        function updateScrollButton() {
            const currentScrollY = window.scrollY;
            
            // Si está en la parte superior, ocultar el botón
            if (currentScrollY <= scrollThreshold) {
                scrollTopBtn.classList.remove('show');
                scrollTopBtn.classList.add('hide');
            }
            // Si hace scroll hacia arriba y está visible, ocultar
            else if (currentScrollY < lastScrollY) {
                scrollTopBtn.classList.add('show');
                scrollTopBtn.classList.remove('hide');
            }
            // Si hace scroll hacia abajo y está oculto, mostrar
            else if (currentScrollY > lastScrollY && currentScrollY > scrollThreshold) {
                scrollTopBtn.classList.add('show');
                scrollTopBtn.classList.remove('hide');
            }
            
            lastScrollY = currentScrollY;
            ticking = false;
        }
        
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    updateScrollButton();
                });
                ticking = true;
            }
        }, { passive: true });
        
        // Click para volver arriba
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        console.debug('Botones flotantes inicializados correctamente');
    }, 100);
}

// =============================================================================
// TOASTS Y ERRORES
// =============================================================================

function showToast(message, type = 'info', persistent = false) {
    try {
        // Eliminar toast anterior si existe
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) existingToast.remove();
        
        // Sanitizar mensaje
        const safeMessage = escapeHtml(String(message));
        
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.innerHTML = `
            <i class="${getToastIcon(type)}" aria-hidden="true"></i>
            <span>${safeMessage}</span>
            <button onclick="this.parentElement.remove()" aria-label="Cerrar">
                <i class="fa-solid fa-times"></i>
            </button>
        `;
        document.body.appendChild(toast);
        if (!persistent) {
            setTimeout(() => { if (toast.parentNode) { toast.parentNode.removeChild(toast); } }, 3000);
        }
    } catch (error) { 
        console.error('Error mostrando toast:', error); 
    }
}

// Exponer funciones globalmente para que estén disponibles antes de que otros scripts las llamen
window.showToast = showToast;
window.getToastIcon = getToastIcon;
window.showErrorScreen = showErrorScreen;
window.closeErrorScreen = closeErrorScreen;
window.hideLoading = hideLoading;
window.openTab = openTab;
window.renderTab = renderTab;

function getToastIcon(type) { 
    const icons = { 
        success: 'fa-solid fa-check-circle', 
        error: 'fa-solid fa-exclamation-circle', 
        warning: 'fa-solid fa-exclamation-triangle', 
        info: 'fa-solid fa-info-circle',
        check: 'fa-solid fa-check-circle' 
    }; 
    return icons[type] || icons.info; 
}

function hideLoading() { 
    try { 
        const overlay = document.getElementById('loadingOverlay'); 
        if (!overlay) return; 
        overlay.style.display = 'none'; 
        overlay.setAttribute('aria-busy', 'false'); 
    } catch (error) { 
        console.error('Error ocultando overlay de carga:', error); 
    } 
}

function showErrorScreen(message) {
    try {
        hideLoading(); 
        document.querySelector('.page-container')?.style.setProperty('display', 'none', 'important'); 
        const errorScreen = document.getElementById('errorScreen'); 
        const errorMessage = document.getElementById('errorMessage'); 
        if (errorScreen && errorMessage) {
            errorMessage.textContent = message; 
            errorScreen.classList.add('show'); 
            errorScreen.setAttribute('aria-hidden', 'false'); 
            const retryBtn = document.getElementById('retryBtn'); 
            const reportBtn = document.getElementById('reportBtn'); 
            if (retryBtn) { 
                retryBtn.onclick = function () { location.reload(); }; 
            }
            if (reportBtn) { 
                reportBtn.onclick = function () { closeErrorScreen(); openModal('sugerenciaModal'); }; 
            }
        }
    } catch (error) {
        console.error('Error mostrando pantalla de error:', error); 
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; background: #000; color: #fff; height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                <h1 style="color: #ff4500;"> Error Crítico</h1>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #ff4500; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Recargar Página
                </button>
            </div>
        `;
    }
}

function closeErrorScreen() {
    try {
        const errorScreen = document.getElementById('errorScreen'); 
        if (errorScreen) { 
            errorScreen.classList.remove('show'); 
            errorScreen.setAttribute('aria-hidden', 'true'); 
        }
        document.querySelector('.page-container')?.style.removeProperty('display');
    } catch (error) { 
        console.error('Error cerrando pantalla de error:', error); 
    }
}

// =============================================================================
// ESTADO DE LA APP
// =============================================================================

function loadAppState() { 
    try { 
        const saved = localStorage.getItem('foxweb_state'); 
        if (saved) { 
            const state = JSON.parse(saved); 
            AppState.currentSearch = state.currentSearch || ''; 
            AppState.currentFilter = state.currentFilter || 'all'; 
            // Theme ya se establece correctamente desde initTheme() usando foxweb_theme
            AppState.recentItems = state.recentItems || []; 
            if (AppState.currentSearch) { 
                const searchInput = document.getElementById('mainSearch'); 
                if (searchInput) { 
                    searchInput.value = AppState.currentSearch; 
                } 
            } 
        } 
    } catch (error) { 
        console.error('Error cargando estado:', error); 
    } 
}

function saveAppState() { 
    try { 
        const state = { 
            currentTab: AppState.currentTab, 
            currentSearch: AppState.currentSearch, 
            currentFilter: AppState.currentFilter, 
            // Theme no se guarda aquí - se gestiona单独 via foxweb_theme
            recentItems: AppState.recentItems.slice(-CONFIG.maxRecentItems), 
            lastSaved: new Date().toISOString() 
        }; 
        localStorage.setItem('foxweb_state', JSON.stringify(state)); 
    } catch (error) { 
        console.error('Error guardando estado:', error); 
    } 
}

function initContentCardsEvents() { 
    // Placeholder para eventos de tarjetas de contenido 
}

// =============================================================================
// DETAIL MODAL (para mostrar descripción completa en "Ver más")
// =============================================================================

/**
 * Trunca una descripción si es muy larga y añade el enlace "Ver más"
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima antes de truncar (default: 200)
 * @returns {Object} { hasMore, text, truncated }
 */
function truncateDescription(text, maxLength = 100) {
    if (!text || text.length <= maxLength) {
        return { hasMore: false, text: text || '', truncated: text };
    }
    const truncated = text.substring(0, maxLength).trim();
    return { hasMore: true, text, truncated };
}

/**
 * Crea y muestra un modal con el detalle completo del item
 * @param {Object} item - Datos del item (name, info, enlace, etc.)
 * @param {string} itemId - ID del item
 */
window.showDetailModal = function(item, itemId) {
    try {
        const safeName = escapeHtml(item.name || 'Sin título');
        const safeInfo = escapeHtml(item.info || '');
        const enlace = item.enlace && item.enlace !== '#' ? item.enlace : null;
        const hasModal = item.modal && item.modal !== 'null';

        // Generar un ID único para este modal temporal
        const modalId = 'detailModal_' + Date.now();

        const modalHTML = `
        <div id="${modalId}" class="modal" role="dialog" aria-modal="true" aria-labelledby="${modalId}_title">
            <div class="modal-content modal-wide">
                <button type="button" class="close" onclick="closeModal('${modalId}')" aria-label="Cerrar modal">&times;</button>
                <h2 id="${modalId}_title" style="color:var(--primary);margin-bottom:15px;display:flex;align-items:center;justify-content:center;gap:10px;">${renderIcon(item.icon)} <span>${safeName}</span></h2>
                <div class="detail-modal-body" style="max-height:60vh;overflow-y:auto;padding:10px 0;">
                    <p style="white-space:pre-line;line-height:1.6;font-size:1.05em;">${safeInfo}</p>
                </div>
                </div>
            </div>
        </div>
        `;

        // Insertar el modal en el contenedor de modales
        const container = document.getElementById('modales-container');
        if (!container) {
            console.error('No se encontró el contenedor de modales');
            return;
        }

        // Crear elemento temporal para parsear
        const temp = document.createElement('div');
        temp.innerHTML = modalHTML;
        const modalEl = temp.firstElementChild;
        container.appendChild(modalEl);

        // Mostrar el modal
        openModal(modalId);

        // Limpiar el modal al cerrarlo usando MutationObserver
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.type === 'attributes' && m.attributeName === 'style') {
                    const el = document.getElementById(modalId);
                    if (el && el.style.display === 'none') {
                        setTimeout(() => el.remove(), 100);
                        observer.disconnect();
                    }
                }
            });
        });
        setTimeout(() => observer.observe(modalEl, { attributes: true }), 100);

    } catch (error) {
        console.error('Error mostrando modal de detalle:', error);
        showErrorScreen('Error al mostrar detalles. Por favor, recarga la página.');
    }
};

/**
 * Renderiza el HTML de descripción con "Ver más" si aplica
 * @param {string} text - Texto completo
 * @param {Object} item - Item completo para el modal
 * @param {string} itemId - ID del item
 * @returns {string} HTML renderizado
 */
window.renderDescriptionWithReadMore = function(text, item, itemId) {
    const result = truncateDescription(text || '', 100);
    const safeTruncated = escapeHtml(result.truncated);
    const hasContent = result.text && result.text.trim().length > 0;
    
    if (!result.hasMore) {
        if (!hasContent) {
            return `<p class="card-description"><span style="color:var(--text-dim)">Sin descripción disponible</span></p>`;
        }
        return `<p class="card-description">${safeTruncated}</p>`;
    }

    // Escapar el texto truncado y añadir "Ver más" en naranja
    const moreSuffix = `<span class="read-more-trigger" data-item-id="${itemId}" style="color:var(--primary);cursor:pointer;font-weight:600;">... Ver más</span>`;
    
    return `<p class="card-description">${safeTruncated}<span style="display:none">${escapeHtml(result.text)}</span>${moreSuffix}</p>`;
};

// Manejador global de clics en "Ver más" (delegación de eventos)
document.addEventListener('click', function(e) {
    const trigger = e.target.closest('.read-more-trigger');
    if (trigger) {
        e.preventDefault();
        const itemId = trigger.dataset.itemId;
        if (!itemId || typeof findItemById !== 'function') {
            console.warn('No se pudo obtener el item ID o la función findItemById');
            return;
        }
        const item = findItemById(itemId);
        if (item) {
            window.showDetailModal(item, itemId);
        } else {
            console.warn('Item no encontrado:', itemId);
        }
    }
});

// =============================================================================
// EXPORTAR API PÚBLICA
// =============================================================================

window.FoxWeb = {
    state: typeof AppState !== 'undefined' ? AppState : null,
    config: typeof CONFIG !== 'undefined' ? CONFIG : null,
    openTab: typeof openTab !== 'undefined' ? openTab : null,
    openModal: typeof openModal !== 'undefined' ? openModal : null,
    closeModal: typeof closeModal !== 'undefined' ? closeModal : null,
    toggleTheme: typeof toggleTheme !== 'undefined' ? toggleTheme : null,
    showToast: typeof showToast !== 'undefined' ? showToast : null,
    copyItemLink: typeof copyItemLink !== 'undefined' ? copyItemLink : null,
    toggleFavorite: typeof toggleFavorite !== 'undefined' ? toggleFavorite : null,
    findItemById: typeof findItemById !== 'undefined' ? findItemById : null,
    getItemType: typeof getItemType !== 'undefined' ? getItemType : null,
    showErrorScreen: typeof showErrorScreen !== 'undefined' ? showErrorScreen : null,
    closeErrorScreen: typeof closeErrorScreen !== 'undefined' ? closeErrorScreen : null
};



// Función para actualizar contadores durante búsqueda
function updateCounterOnSearch(tabId) {
    const grid = document.getElementById(`grid-${tabId}`);
    if (!grid) return;
    
    const visibleCards = grid.querySelectorAll('.card:not(.hidden), .program-card:not([style*="display: none"])');
    const count = visibleCards.length;
    
    const countElement = document.getElementById(`count-${tabId}`);
    if (countElement) {
        countElement.textContent = `(${count})`;
    }
}

// Exponer globalmente
window.loadAppState = loadAppState;
