/**
 * ============================================
 * FOXWEB CMS - Sistema de Gestión de Contenido
 * ============================================
 * 
 * Este script maneja:
 * - Carga de posts desde JSON
 * - Generación dinámica de contenido
 * - Buscador con filtrado en tiempo real
 * - Renderizado de índice de blog
 * 
 * Para usar:
 * 1. Edita database/posts.json para agregar/editar/eliminar posts
 * 2. Crea los archivos HTML en blog/[nombre-del-post]/index.html
 * 3. El sitio se actualiza automáticamente
 * 
 * 
 * @version 2.1 - Error fix: posts variable corrected
 */

// ============================================
// CONFIGURACIÓN DEL CMS
// ============================================
const CMS_CONFIG = {
    postsUrl: '/database/posts.json',
    containerId: 'blog-index',
    searchId: 'blogSearch',
    clearId: 'clearSearch',
    itemsPerPage: 10,
    cacheKey: 'foxweb_posts_cache',
    cacheTime: 1000 * 60 * 5 // 5 minutos
};

// ============================================
// UTILIDADES
// ============================================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Sanitizar HTML para prevenir XSS
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Formatear fecha
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
}

// ============================================
// SISTEMA DE CACHÉ
// ============================================
const Cache = {
    get(key) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;
            const { value, timestamp } = JSON.parse(data);
            if (Date.now() - timestamp > CMS_CONFIG.cacheTime) {
                localStorage.removeItem(key);
                return null;
            }
            return value;
        } catch (e) {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify({
                value,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('No se pudo guardar en caché:', e);
        }
    }
};

// ============================================
// RENDERIZADO DE POSTS
// ============================================
function renderPostItem(post, index) {
    const item = document.createElement('li');
    item.className = 'blog-post-item';
    item.style.cssText = `
        border-bottom: 1px solid var(--border);
        padding: 15px 10px;
        display: flex;
        align-items: center;
        cursor: pointer;
        transition: background-color 0.2s ease;
    `;
    
    item.innerHTML = `
        <div class="post-icon" style="margin-right: 15px; color: var(--primary);">
            <i class="fa-solid fa-file-lines"></i>
        </div>
        <div class="post-content" style="flex-grow: 1;">
            <a href="${sanitizeHTML(post.url)}" 
               style="color: var(--text-main); text-decoration: none; font-size: 1.1rem; display: block;">
                ${sanitizeHTML(post.title)}
            </a>
            ${post.date ? `<span style="font-size: 0.85rem; color: var(--text-dim);">${formatDate(post.date)}</span>` : ''}
            ${post.excerpt ? `<p style="font-size: 0.9rem; color: var(--text-secondary); margin: 5px 0 0 0; opacity: 0.8;">${sanitizeHTML(post.excerpt)}</p>` : ''}
        </div>
        <div class="post-arrow" style="color: var(--primary); font-size: 0.8rem;">
            <i class="fa-solid fa-angle-right"></i>
        </div>
    `;
    
    // Eventos de hover
    item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'rgba(255,255,255,0.05)';
    });
    item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
    });
    
    // Click en toda la tarjeta
    item.addEventListener('click', () => {
        window.location.href = post.url;
    });
    
    return item;
}

function renderNoResults(container, query) {
    container.innerHTML = `
        <li style="padding: 40px 20px; color: var(--text-dim); text-align: center; border: none;">
            <i class="fa-solid fa-face-frown" style="display: block; font-size: 2.5rem; margin-bottom: 15px; color: var(--primary);"></i>
            No hay resultados de "${query}"
        </li>
    `;
}

function renderLoading(container) {
    container.innerHTML = `
        <li style="padding: 40px 20px; color: var(--text-dim); text-align: center; border: none;">
            <i class="fa-solid fa-spinner fa-spin" style="display: block; font-size: 2rem; margin-bottom: 15px; color: var(--primary);"></i>
            <span>Cargando artículos...</span>
        </li>
    `;
}

// ============================================
// BÚSQUEDA
// ============================================
function createSearchFilter(posts) {
    return (term) => {
        if (!term.trim()) return posts;
        
        const searchTerm = term.toLowerCase().trim();
        return posts.filter(post => {
            const title = (post.title || '').toLowerCase();
            const excerpt = (post.excerpt || '').toLowerCase();
            const tags = (post.tags || []).join(' ').toLowerCase();
            
            return title.includes(searchTerm) || 
                   excerpt.includes(searchTerm) || 
                   tags.includes(searchTerm);
        });
    };
}

// ============================================
// PAGINACIÓN
// ============================================
function createPagination(posts, itemsPerPage) {
    const totalPages = Math.ceil(posts.length / itemsPerPage);
    
    return {
        getPage(page) {
            const start = (page - 1) * itemsPerPage;
            return posts.slice(start, start + itemsPerPage);
        },
        totalPages,
        hasNext: (page) => page < totalPages,
        hasPrev: (page) => page > 1
    };
}

// ============================================
// INICIALIZACIÓN DEL CMS
// ============================================
async function initCMS() {
    const container = $(`#${CMS_CONFIG.containerId}`);
    const searchInput = $(`#${CMS_CONFIG.searchId}`);
    const clearBtn = $(`#${CMS_CONFIG.clearId}`);
    
    if (!container || !searchInput || !clearBtn) {
        // Los elementos del CMS no existen en esta página (ej. blog posts)
        return;
    }
    
    // Mostrar loading
    renderLoading(container);
    
    try {
        // Intentar obtener de caché primero
        let posts = Cache.get(CMS_CONFIG.cacheKey);
        
        if (!posts) {
            // Fetch desde JSON
            const response = await fetch(CMS_CONFIG.postsUrl);
            if (!response.ok) throw new Error('Error al cargar posts');
            posts = await response.json();
            
            // Guardar en caché
            Cache.set(CMS_CONFIG.cacheKey, posts);
        }
        
        // Verificar que sea array
        if (!Array.isArray(posts)) {
            posts = [];
        }
        
        // Crear utilidades
        const filterPosts = createSearchFilter(posts);
        const pagination = createPagination(posts, CMS_CONFIG.itemsPerPage);
        let currentPage = 1;
        let currentSearchTerm = '';
        
        // Función principal de renderizado
        function render(filteredPosts = posts, searchTerm = '') {
            container.innerHTML = '';
            currentSearchTerm = searchTerm;
            
            if (filteredPosts.length === 0) {
                renderNoResults(container, searchTerm);
                return;
            }
            
            const pagePosts = pagination.getPage(currentPage);
            pagePosts.forEach((post, index) => {
                const item = renderPostItem(post, index);
                container.appendChild(item);
            });
            
            // Agregar paginación si es necesario
            if (pagination.totalPages > 1) {
                renderPaginationControls(filteredPosts.length);
            }
        }
        
        // Controles de paginación
        function renderPaginationControls(totalItems) {
            const footer = document.createElement('li');
            footer.style.cssText = 'padding: 15px; text-align: center; border: none;';
            footer.innerHTML = `
                <span style="color: var(--text-dim); font-size: 0.9rem;">
                    Mostrando ${Math.min((currentPage - 1) * CMS_CONFIG.itemsPerPage + 1, totalItems)} - 
                    ${Math.min(currentPage * CMS_CONFIG.itemsPerPage, totalItems)} 
                    de ${totalItems} artículos
                </span>
            `;
            container.appendChild(footer);
        }
        
        // Evento de búsqueda
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.trim();
            clearBtn.style.display = term.length > 0 ? 'block' : 'none';
            currentPage = 1;
            render(filterPosts(term), term);
        });
        
        // Evento de limpiar
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            currentPage = 1;
            render(posts, '');
            searchInput.focus();
        });
        
        // Render inicial
        render(posts, '');
        
        console.debug(`CMS: ${posts.length} artículos cargados`);
        
    } catch (error) {
        console.error('CMS Error:', error);
        container.innerHTML = `
            <li style="padding: 20px; color: var(--primary); text-align: center;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Error al cargar los artículos.</p>
                <p style="font-size: 0.85rem; color: var(--text-dim);">${error.message}</p>
            </li>
        `;
    }
}

// ============================================
// EXPORTAR PARA USO GLOBAL
// ============================================
window.FoxWebCMS = {
    config: CMS_CONFIG,
    refresh: () => {
        localStorage.removeItem(CMS_CONFIG.cacheKey);
        initCMS();
    },
    search: (term) => {
        const filterPosts = createSearchFilter([]);
        return filterPosts(term);
    }
};

// ============================================
// INICIALIZAR AL CARGAR DOM
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCMS);
} else {
    initCMS();
}
