/* FoxWeb - JS Consolidado para Homepage */
// Combina: theme.js + index-recent.js + index-modal-url.js

// Recent items (de index-recent.js)
function loadRecentItems() {

function loadRecentItems() {
    var container = document.getElementById('recent-items-container');
    if (!container) return;
    
    fetch('/database/data.json?v=' + Date.now())
    .then(function(response) { if (!response.ok) throw new Error('Error cargando datos'); return response.json(); })
    .then(function(data) {
        var allItems = [].concat(
            (data.programas||[]).map(function(i){return Object.assign(i,{category:'Programas',categoryLink:'/downloads?tab=programs&page=1'});}),
            (data.sistemas||[]).map(function(i){return Object.assign(i,{category:'Sistemas',categoryLink:'/downloads?tab=systems&page=1'});}),
            (data.juegos||[]).map(function(i){return Object.assign(i,{category:'Juegos',categoryLink:'/downloads?tab=games&page=1'});}),
            (data.extras||[]).map(function(i){return Object.assign(i,{category:'Extras',categoryLink:'/downloads?tab=extras&page=1'});}),
            (data.apks||[]).map(function(i){return Object.assign(i,{category:'APKs',categoryLink:'/downloads?tab=apks&page=1'});})
        );
        var recentItems = allItems.slice(-4);
        if (recentItems.length === 0) { container.innerHTML = '<p class="no-items">No hay elementos disponibles</p>'; return; }
        
        // Sanitizar datos antes de renderizar
        var escapeHtml = window.sanitizeHTML ? function(str) {
            const div = document.createElement('div');
            div.textContent = String(str);
            return div.innerHTML;
        } : function(str) { return str; };
        
        function renderIndexIcon(icon) {
            if (!icon) return '<i class="fa-solid fa-folder"></i>';
            if (icon.match(/^(http|https|\/|data:)/i)) {
                return '<img src="'+icon+'" alt="icon" class="recent-icon-img">';
            }
            return '<i class="'+escapeHtml(icon)+'"></i>';
        }
        
        container.innerHTML = recentItems.map(function(i){
            var safeName = escapeHtml(i.name);
            var safeInfo = i.info ? escapeHtml(i.info.substring(0,80) + (i.info.length>80?'...':'')) : '';
            var iconHtml = renderIndexIcon(i.icon);
            return '<article class="recent-card"><div class="recent-icon">'+iconHtml+'</div><h3>'+safeName+'</h3><p>'+safeInfo+'</p><a href="'+i.categoryLink+'" class="recent-link">Ver más <i class="fas fa-arrow-right"></i></a></article>';
        }).join('');
    })
    .catch(function(error) {
        console.error('Error cargando recientes:', error);
        container.innerHTML = '<p class="error-loading">Error al cargar el contenido. <a href="/downloads">Ver catálogo</a></p>';
    });
}

// Modal URL (de index-modal-url.js)
(function() {
    var urlParams = new URLSearchParams(window.location.search);
    var modalParam = urlParams.get('openModal');
    if (!modalParam) return;

    function tryOpenModal(attempts) {
        attempts = attempts || 0;
        var modal = document.getElementById(modalParam);
        if (modal) {
            if (typeof openModal === 'function') openModal(modalParam);
            history.replaceState({}, document.title, window.location.pathname);
        } else if (attempts < 10) {
            setTimeout(function(){ tryOpenModal(attempts+1); }, 100);
        }
    }

    var container = document.getElementById('modales-container');
    if (container && container.innerHTML.trim() === '') {
        fetch('/database/modals.html?v=' + Date.now())
        .then(function(r){ if(!r.ok)throw new Error('HTTP'); return r.text(); })
        .then(function(html){ 
            // Sanitizar HTML antes de inyectar
            var sanitizedHtml = window.sanitizeHTML ? window.sanitizeHTML(html) : html;
            container.innerHTML = sanitizedHtml; 
            setTimeout(tryOpenModal,150); 
        })
        .catch(function(e){ console.error('Error:',e); });
    } else {
        tryOpenModal();
    }
})();

// Init
document.addEventListener('DOMContentLoaded', function() {
    loadModals();
    loadRecentItems();
    // Inicializar botones flotantes (scroll-top)
    if (typeof initFloatingButtons === 'function') {
        initFloatingButtons();
    }
});
