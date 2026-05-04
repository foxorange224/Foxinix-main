/**
 * Script para cargar las últimas incorporaciones dinámicamente en la página principal
 */

// Función para escapar HTML y prevenir XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Helper function to render icon
function renderRecentIcon(icon) {
    if (!icon) return '<i class="fa-solid fa-folder"></i>';
    if (icon.match(/^(http|https|\/|data:)/i)) {
        return '<img src="'+icon+'" alt="icon" class="recent-icon-img">';
    }
    return '<i class="'+escapeHtml(icon)+'"></i>';
}

async function loadRecentItems() {
    const container = document.getElementById('recent-items-container');
    if (!container) return;
    
    try {
        // Cargar el script de datos
        const response = await fetch('/database/data.json?v=' + Date.now());
        if (!response.ok) throw new Error('Error cargando datos');
        
        const data = await response.json();
        
        // Combinar todos los elementos y tomar los últimos 4
        const allItems = [
            ...(data.programas || []).map(item => ({...item, category: 'Programas', categoryLink: '/downloads?tab=programs&page=1'})),
            ...(data.sistemas || []).map(item => ({...item, category: 'Sistemas', categoryLink: '/downloads?tab=systems&page=1'})),
            ...(data.juegos || []).map(item => ({...item, category: 'Juegos', categoryLink: '/downloads?tab=games&page=1'})),
            ...(data.extras || []).map(item => ({...item, category: 'Extras', categoryLink: '/downloads?tab=extras&page=1'})),
            ...(data.apks || []).map(item => ({...item, category: 'APKs', categoryLink: '/downloads?tab=apks&page=1'}))
        ];
        
        // Tomar solo los últimos 4 elementos
        const recentItems = allItems.slice(-4);
        
        if (recentItems.length === 0) {
            container.innerHTML = '<p class="no-items">No hay elementos disponibles</p>';
            return;
        }
        
        // Generar HTML con sanitización
        container.innerHTML = recentItems.map(item => {
            const safeName = escapeHtml(item.name);
            const safeInfo = item.info ? escapeHtml(item.info.substring(0, 80) + (item.info.length > 80 ? '...' : '')) : '';
            const iconHtml = renderRecentIcon(item.icon);
            return `
                <article class="recent-card">
                    <div class="recent-icon">${iconHtml}</div>
                    <h3>${safeName}</h3>
                    <p>${safeInfo}</p>
                    <a href="${item.categoryLink}" class="recent-link">Ver más <i class="fas fa-arrow-right"></i></a>
                </article>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error cargando recientes:', error);
        container.innerHTML = '<p class="error-loading">Error al cargar el contenido. <a href="/downloads">Ver catálogo</a></p>';
    }
}

// Cargar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', loadRecentItems);
