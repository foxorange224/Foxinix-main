'use strict';

// =============================================================================
// SISTEMA DE PAGINACIÓN FOXWEB
// Maneja la paginación de contenido en las pestañas principales
// =============================================================================

// Configuración de paginación
const PAGINATION_CONFIG = {
    itemsPerPage: 12, // Número de elementos por página
    maxVisiblePages: 5, // Máximo de páginas visibles en la navegación
    showFirstLast: true, // Mostrar botones primera/última página
    showEllipsis: true, // Mostrar elipsis cuando hay muchas páginas
    animateTransition: true, // Animar transiciones entre páginas
    transitionDuration: 300 // Duración de la animación en ms
};

// Estado de paginación por pestaña
const PaginationState = {
    // Estado por defecto para cada pestaña
    _state: {},

    // Inicializar estado para una pestaña
    init(tabId) {
        if (!this._state[tabId]) {
            this._state[tabId] = {
                currentPage: 1,
                totalItems: 0,
                totalPages: 1,
                itemsPerPage: PAGINATION_CONFIG.itemsPerPage
            };
        }
        return this._state[tabId];
    },

    // Obtener estado de una pestaña
    get(tabId) {
        return this._state[tabId] || this.init(tabId);
    },

    // Actualizar estado de una pestaña
    set(tabId, updates) {
        const state = this.get(tabId);
        Object.assign(state, updates);
        return state;
    },

    // Establecer página actual
    setPage(tabId, page, skipValidation = false) {
        const state = this.get(tabId);
        let validPage;
        if (skipValidation) {
            // No validar contra totalPages (útil para establecer página inicial)
            validPage = Math.max(1, page);
        } else {
            // Validar contra totalPages
            validPage = Math.max(1, Math.min(page, state.totalPages));
        }
        state.currentPage = validPage;
        return validPage;
    },

    // Obtener página actual
    getPage(tabId) {
        return this.get(tabId).currentPage;
    },

    // Calcular total de páginas
    calculateTotalPages(tabId, totalItems) {
        const state = this.get(tabId);
        state.totalItems = totalItems;
        state.totalPages = Math.max(1, Math.ceil(totalItems / state.itemsPerPage));
        
        // Ajustar página actual si es necesario
        if (state.currentPage > state.totalPages) {
            state.currentPage = state.totalPages;
        }
        
        return state.totalPages;
    },

    // Obtener items para la página actual
    getPaginatedItems(tabId, allItems) {
        const state = this.get(tabId);
        const startIndex = (state.currentPage - 1) * state.itemsPerPage;
        const endIndex = startIndex + state.itemsPerPage;
        return allItems.slice(startIndex, endIndex);
    },

    // Resetear estado de una pestaña
    reset(tabId) {
        this._state[tabId] = {
            currentPage: 1,
            totalItems: 0,
            totalPages: 1,
            itemsPerPage: PAGINATION_CONFIG.itemsPerPage
        };
    }
};

// =============================================================================
// FUNCIONES DE RENDERIZADO DE PAGINACIÓN
// =============================================================================

/**
 * Genera el HTML de los controles de paginación
 * @param {string} tabId - ID de la pestaña
 * @returns {string} HTML de los controles
 */
function generatePaginationControls(tabId) {
    const state = PaginationState.get(tabId);
    const { currentPage, totalPages, totalItems, itemsPerPage } = state;

    // Si no hay items, mostrar estado vacío
    if (totalItems === 0) {
        return '';
    }

    // Calcular rango de items mostrados
    const startItem = ((currentPage - 1) * itemsPerPage) + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    // Generar botones de página
    const pageButtons = generatePageButtons(tabId, currentPage, totalPages);

    // Generar HTML
    return `
        <div class="pagination-container" role="navigation" aria-label="Paginación de ${tabId}" data-tab="${tabId}">
            <!-- Indicador de resultados -->
            <div class="pagination-info" aria-live="polite" aria-atomic="true">
                <i class="fa-solid fa-list-ol pagination-info__icon" aria-hidden="true"></i>
                <span>Mostrando</span>
                <span class="pagination-info__count">${startItem}-${endItem}</span>
                <span>de</span>
                <span class="pagination-info__count">${totalItems}</span>
                <span>resultados</span>
            </div>

            <!-- Controles de navegación -->
            <div class="pagination-controls" role="group" aria-label="Controles de paginación">
                <!-- Botón Primera Página -->
                ${PAGINATION_CONFIG.showFirstLast ? `
                    <button class="pagination-btn pagination-btn--nav" 
                            data-action="first" 
                            data-tab="${tabId}"
                            ${currentPage === 1 ? 'disabled' : ''}
                            aria-label="Ir a la primera página"
                            title="Primera página">
                        <i class="fa-solid fa-angles-left" aria-hidden="true"></i>
                        <span class="pagination-btn__text">Primera</span>
                    </button>
                ` : ''}

                <!-- Botón Anterior -->
                <button class="pagination-btn pagination-btn--nav" 
                        data-action="prev" 
                        data-tab="${tabId}"
                        ${currentPage === 1 ? 'disabled' : ''}
                        aria-label="Ir a la página anterior"
                        title="Página anterior">
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                    <span class="pagination-btn__text">Atrás</span>
                </button>

                <!-- Botones de página -->
                <div class="pagination-pages" role="group" aria-label="Páginas">
                    ${pageButtons}
                </div>

                <!-- Botón Siguiente -->
                <button class="pagination-btn pagination-btn--nav" 
                        data-action="next" 
                        data-tab="${tabId}"
                        ${currentPage === totalPages ? 'disabled' : ''}
                        aria-label="Ir a la página siguiente"
                        title="Página siguiente">
                    <span class="pagination-btn__text">Siguiente</span>
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </button>

                <!-- Botón Última Página -->
                ${PAGINATION_CONFIG.showFirstLast ? `
                    <button class="pagination-btn pagination-btn--nav" 
                            data-action="last" 
                            data-tab="${tabId}"
                            ${currentPage === totalPages ? 'disabled' : ''}
                            aria-label="Ir a la última página"
                            title="Última página">
                        <span class="pagination-btn__text">Última</span>
                        <i class="fa-solid fa-angles-right" aria-hidden="true"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Genera los botones de página numérica
 * @param {string} tabId - ID de la pestaña
 * @param {number} currentPage - Página actual
 * @param {number} totalPages - Total de páginas
 * @returns {string} HTML de los botones
 */
function generatePageButtons(tabId, currentPage, totalPages) {
    if (totalPages <= 1) {
        return '';
    }

    const maxVisible = PAGINATION_CONFIG.maxVisiblePages;
    let pages = [];

    if (totalPages <= maxVisible) {
        // Mostrar todas las páginas
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        // Calcular rango de páginas visibles
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        // Ajustar si estamos cerca del final
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        // Agregar primera página y elipsis si es necesario
        if (startPage > 1) {
            pages.push(1);
            if (startPage > 2 && PAGINATION_CONFIG.showEllipsis) {
                pages.push('ellipsis-start');
            }
        }

        // Agregar páginas del rango
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        // Agregar última página y elipsis si es necesario
        if (endPage < totalPages) {
            if (endPage < totalPages - 1 && PAGINATION_CONFIG.showEllipsis) {
                pages.push('ellipsis-end');
            }
            pages.push(totalPages);
        }
    }

    // Generar HTML de los botones
    return pages.map(page => {
        if (typeof page === 'string' && page.startsWith('ellipsis')) {
            return `<span class="pagination-ellipsis" aria-hidden="true">...</span>`;
        }

        const isActive = page === currentPage;
        return `
            <button class="pagination-btn pagination-btn--page ${isActive ? 'pagination-btn--active' : ''}" 
                    data-action="page" 
                    data-page="${page}" 
                    data-tab="${tabId}"
                    ${isActive ? 'aria-current="page"' : ''}
                    aria-label="Ir a la página ${page}"
                    title="Página ${page}">
                ${page}
            </button>
        `;
    }).join('');
}

/**
 * Renderiza la paginación para una pestaña específica
 * @param {string} tabId - ID de la pestaña
 * @param {Array} allItems - Todos los items de la pestaña
 */
function renderPagination(tabId, allItems) {
    try {
        // Calcular total de páginas
        const totalItems = allItems ? allItems.length : 0;
        PaginationState.calculateTotalPages(tabId, totalItems);

        // Obtener contenedor de paginación existente o crear uno nuevo
        let paginationContainer = document.querySelector(`.pagination-container[data-tab="${tabId}"]`);
        
        if (!paginationContainer) {
            // Crear contenedor de paginación
            const grid = document.getElementById(`grid-${tabId}`);
            if (!grid) return;

            paginationContainer = document.createElement('div');
            grid.parentNode.insertBefore(paginationContainer, grid.nextSibling);
        }

        // Generar y insertar HTML de paginación
        const paginationHtml = generatePaginationControls(tabId);
        paginationContainer.outerHTML = paginationHtml;

        // Configurar eventos de paginación
        setupPaginationEvents(tabId);

    } catch (error) {
        console.error(`[Pagination] Error renderizando paginación para ${tabId}:`, error);
    }
}

/**
 * Configura los eventos de los controles de paginación
 * @param {string} tabId - ID de la pestaña
 */
function setupPaginationEvents(tabId) {
    // Remover listeners anteriores para evitar duplicados
    const container = document.querySelector(`.pagination-container[data-tab="${tabId}"]`);
    if (!container) return;

    // Usar event delegation para mejor rendimiento
    container.addEventListener('click', function(e) {
        const button = e.target.closest('.pagination-btn');
        if (!button || button.disabled) return;

        const action = button.dataset.action;
        const tab = button.dataset.tab;
        
        if (tab !== tabId) return;

        handlePaginationAction(tabId, action, button.dataset.page);
    });

    // Soporte para navegación por teclado
    container.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            const button = e.target.closest('.pagination-btn');
            if (button && !button.disabled) {
                e.preventDefault();
                button.click();
            }
        }
    });
}

/**
 * Maneja las acciones de paginación
 * @param {string} tabId - ID de la pestaña
 * @param {string} action - Acción a realizar
 * @param {string} page - Número de página (opcional)
 */
function handlePaginationAction(tabId, action, page) {
    const state = PaginationState.get(tabId);
    let newPage = state.currentPage;

    switch (action) {
        case 'first':
            newPage = 1;
            break;
        case 'prev':
            newPage = Math.max(1, state.currentPage - 1);
            break;
        case 'next':
            newPage = Math.min(state.totalPages, state.currentPage + 1);
            break;
        case 'last':
            newPage = state.totalPages;
            break;
        case 'page':
            newPage = parseInt(page, 10);
            break;
        default:
            return;
    }

    // Actualizar página y re-renderizar
    if (newPage !== state.currentPage) {
        PaginationState.setPage(tabId, newPage);
        
        // Actualizar query parameter de página en la URL
        if (typeof updatePageQueryParam === 'function') {
            updatePageQueryParam(newPage);
        }
        
        // Animación de transición
        if (PAGINATION_CONFIG.animateTransition) {
            animatePageTransition(tabId, () => {
                renderTabWithPagination(tabId);
            });
        } else {
            renderTabWithPagination(tabId);
        }

        // Scroll suave hacia arriba del grid
        scrollToGridTop(tabId);
    }
}

/**
 * Anima la transición entre páginas
 * @param {string} tabId - ID de la pestaña
 * @param {Function} callback - Función a ejecutar después de la animación
 */
function animatePageTransition(tabId, callback) {
    const grid = document.getElementById(`grid-${tabId}`);
    if (!grid) {
        callback();
        return;
    }

    // Aplicar clase de animación
    grid.style.opacity = '0';
    grid.style.transform = 'translateY(10px)';
    grid.style.transition = `opacity ${PAGINATION_CONFIG.transitionDuration}ms ease, transform ${PAGINATION_CONFIG.transitionDuration}ms ease`;

    setTimeout(() => {
        callback();
        
        // Restaurar opacidad
        setTimeout(() => {
            grid.style.opacity = '1';
            grid.style.transform = 'translateY(0)';
        }, 50);
    }, PAGINATION_CONFIG.transitionDuration / 2);
}

/**
 * Hace scroll suave hacia la parte superior del grid
 * @param {string} tabId - ID de la pestaña
 */
function scrollToGridTop(tabId) {
    const grid = document.getElementById(`grid-${tabId}`);
    if (!grid) return;

    const header = grid.closest('.tab-content')?.querySelector('.content-header');
    if (header) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Renderiza una pestaña con paginación aplicada
 * @param {string} tabId - ID de la pestaña
 */
function renderTabWithPagination(tabId) {
    // Obtener configuración de la pestaña
    const tabConfig = TABS_CONFIG.find(t => t.id === tabId);
    if (!tabConfig) return;

    if (!AppState.dbData) {
        const grid = document.getElementById(`grid-${tabId}`);
        if (grid) {
            grid.innerHTML = `
                <div class="loading-placeholder" role="status">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <p>Cargando...</p>
                </div>
            `;
        }
        return;
    }

    const allItems = AppState.dbData[tabConfig.key] || [];
    
    // Aplicar búsqueda si está activa
    let filteredItems = allItems;
    if (AppState.searchActive && AppState.currentSearch) {
        filteredItems = filterItemsBySearch(allItems, AppState.currentSearch);
    }

    // Si hay una página inicial desde query parameter, establecerla primero
    // Solo establecer si la pestaña actual coincide con la pestaña de la URL
    if (AppState.initialPage !== null && AppState.initialPage !== undefined && AppState.currentTab === tabId) {
        PaginationState.setPage(tabId, AppState.initialPage, true);
        AppState.initialPage = null;
    }

    PaginationState.calculateTotalPages(tabId, filteredItems.length);
    const paginatedItems = PaginationState.getPaginatedItems(tabId, filteredItems);

    // Renderizar items en el grid
    const grid = document.getElementById(`grid-${tabId}`);
    if (!grid) return;

    grid.innerHTML = '';
    
    if (paginatedItems.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" role="status">
                <i class="fa-solid fa-box-open" aria-hidden="true"></i>
                <h3>No hay contenido disponible</h3>
                <p>No se encontraron resultados${AppState.searchActive ? ' para tu búsqueda' : ''}.</p>
            </div>
        `;
        return;
    }

    // Renderizar items
    const fragment = document.createDocumentFragment();
    const viewMode = grid.classList.contains('compact-view') ? 'compact' : 'cards';
    
    paginatedItems.forEach((item, index) => {
        const globalIndex = ((PaginationState.getPage(tabId) - 1) * PAGINATION_CONFIG.itemsPerPage) + index;
        const itemId = `${tabId.toLowerCase()}_${globalIndex}`;
        const card = createContentCard(item, tabId, itemId, viewMode);
        if (card) fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    
    // Inicializar eventos de las tarjetas
    if (typeof initContentCardsEvents === 'function') {
        initContentCardsEvents();
    }

    // Actualizar contador de la categoría
    updateCategoryCount(tabId, filteredItems.length);

    // Renderizar controles de paginación
    renderPagination(tabId, filteredItems);
}

/**
 * Filtra items por término de búsqueda
 * @param {Array} items - Items a filtrar
 * @param {string} searchTerm - Término de búsqueda
 * @returns {Array} Items filtrados
 */
function filterItemsBySearch(items, searchTerm) {
    if (!searchTerm) return items;
    
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
        const name = (item.name || '').toLowerCase();
        const info = (item.info || '').toLowerCase();
        const badges = (item.badges || []).join(' ').toLowerCase();
        
        return name.includes(term) || info.includes(term) || badges.includes(term);
    });
}

/**
 * Actualiza el contador de items en la pestaña
 * @param {string} tabId - ID de la pestaña
 * @param {number} count - Número de items
 */
function updateCategoryCount(tabId, count) {
    const countElement = document.getElementById(`count-${tabId}`);
    if (countElement) {
        countElement.textContent = `(${count})`;
    }
}

// =============================================================================
// INTEGRACIÓN CON EL SISTEMA EXISTENTE
// =============================================================================

/**
 * Inicializa el sistema de paginación
 */
function initPagination() {
    try {
        // Configurar eventos globales para cambio de pestaña
        document.addEventListener('tabChanged', function(e) {
            const tabId = e.detail?.tabId || AppState.currentTab;
            if (tabId) {
                // Pequeño delay para asegurar que el DOM esté listo
                setTimeout(() => {
                    renderTabWithPagination(tabId);
                }, 100);
            }
        });

        // Escuchar cambios en la búsqueda
        document.addEventListener('searchChanged', function(e) {
            const tabId = AppState.currentTab;
            if (tabId && AppState.dbData) {
                // Resetear a página 1 cuando se busca
                PaginationState.setPage(tabId, 1);
                renderTabWithPagination(tabId);
            }
        });

        console.debug('[Pagination] Sistema de paginación inicializado');
    } catch (error) {
        console.error('[Pagination] Error al inicializar:', error);
    }
}

// Exponer funciones globalmente para integración
window.PaginationSystem = {
    init: initPagination,
    renderTab: renderTabWithPagination,
    renderPagination: renderPagination,
    state: PaginationState,
    config: PAGINATION_CONFIG
};
