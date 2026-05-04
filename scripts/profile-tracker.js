// FoxWeb Profile Tracker - Tracks user activity for profile page

(function() {
    'use strict';
    
    const CONFIG = {
        maxHistoryItems: 50,
        statsKey: 'foxweb_stats',
        historyKey: 'foxweb_download_history',
        favoritesKey: 'foxweb_favorites'
    };
    
    function getCategoryFromCard(card) {
        const grid = card?.closest('.content-grid');
        if (!grid) return 'Unknown';
        
        const gridId = grid.id.replace('grid-', '');
        
        const categoryMap = {
            'Programas': 'Programas',
            'Sistemas': 'Sistemas',
            'Juegos': 'Juegos',
            'Extras': 'Extras',
            'APKs': 'APKs'
        };
        
        return categoryMap[gridId] || 'Unknown';
    }
    
    function getFavoritesList() {
        try {
            const favNames = JSON.parse(localStorage.getItem(CONFIG.favoritesKey)) || [];
            if (typeof favNames[0] === 'string') {
                return favNames.map(f => {
                    const [name, category] = f.split('_');
                    return { name, category };
                });
            }
            return favNames;
        } catch (e) {
            return [];
        }
    }
    
    function updateFavoriteIcon(btn, isFavorite) {
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            icon.style.color = isFavorite ? '#ff4757' : '';
        }
    }
    
    function updateAllFavoriteIcons() {
        const favorites = getFavoritesList();
        const cards = document.querySelectorAll('.content-card');
        
        cards.forEach(card => {
            const name = card.querySelector('.card-title-text')?.textContent;
            const category = getCategoryFromCard(card);
            const favBtn = card.querySelector('.card-action-btn');
            
            const isFav = favorites.some(f => f.name === name && f.category === category);
            if (favBtn && isFav) {
                updateFavoriteIcon(favBtn, true);
            }
        });
    }
    
    function addToHistory(name, category) {
        try {
            let history = JSON.parse(localStorage.getItem(CONFIG.historyKey)) || [];
            
            history = history.filter(item => !(item.name === name && item.category === category));
            
            history.unshift({
                name: name,
                category: category,
                date: new Date().toISOString(),
                url: window.location.href
            });
            
            if (history.length > CONFIG.maxHistoryItems) {
                history = history.slice(0, CONFIG.maxHistoryItems);
            }
            
            localStorage.setItem(CONFIG.historyKey, JSON.stringify(history));
        } catch (e) {
            console.error('Error adding to history:', e);
        }
    }
    
    function incrementStat(name, category) {
        try {
            let stats = JSON.parse(localStorage.getItem(CONFIG.statsKey)) || {};
            
            const key = name + '_' + category;
            stats[key] = (stats[key] || 0) + 1;
            
            localStorage.setItem(CONFIG.statsKey, JSON.stringify(stats));
        } catch (e) {
            console.error('Error incrementing stat:', e);
        }
    }
    
    function toggleFavorite(name, category, btn) {
        try {
            let favorites = getFavoritesList();
            
            const exists = favorites.some(f => f.name === name && f.category === category);
            
            if (exists) {
                favorites = favorites.filter(f => !(f.name === name && f.category === category));
                showToast('Eliminado de favoritos', 'info');
                updateFavoriteIcon(btn, false);
            } else {
                favorites.push({ name, category });
                showToast('Agregado a favoritos', 'success');
                updateFavoriteIcon(btn, true);
            }
            
            localStorage.setItem(CONFIG.favoritesKey, JSON.stringify(favorites.map(f => f.name + '_' + f.category)));
        } catch (e) {
            console.error('Error toggling favorite:', e);
        }
    }
    
    function showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.debug('[' + type + '] ' + message);
        }
    }
    
     function initTracker() {
         document.addEventListener('click', function(e) {
             const card = e.target.closest('.content-card');
             const downloadBtn = e.target.closest('.download-btn');
             
             if (downloadBtn && card) {
                 const name = card.querySelector('.card-title-text')?.textContent;
                 const category = getCategoryFromCard(card);
                 
                 if (name) {
                     addToHistory(name, category);
                     incrementStat(name, category);
                 }
             }
             
             const favBtn = e.target.closest('.card-action-btn');
             if (favBtn && card) {
                 const name = card.querySelector('.card-title-text')?.textContent;
                 const category = getCategoryFromCard(card);
                 
                 if (name) {
                     e.preventDefault();
                     e.stopPropagation();
                     toggleFavorite(name, category, favBtn);
                 }
             }
         }, true);
         
         // Función para verificar y actualizar favoritos de forma segura
         function updateFavoritesSafe() {
             try {
                 // Usar requestAnimationFrame para evitar parpadeo
                 requestAnimationFrame(updateAllFavoriteIcons);
             } catch (e) {
                 // Fallback directo si requestAnimationFrame falla
                 updateAllFavoriteIcons();
             }
         }
         
         // Verificar favoritos inmediatamente al iniciar
         updateFavoritesSafe();
         
          // También actualizar cuando se muestre la página (incluye volver desde caché)
          window.addEventListener('pageshow', updateFavoritesSafe);
         
         // Crear un observer específico para cada grid de contenido
         function setupGridObserver() {
             const grids = document.querySelectorAll('.content-grid');
             grids.forEach(grid => {
                 // Observer para cambios dentro de cada grid
                 const gridObserver = new MutationObserver(function(mutations) {
                     let hasContentChanges = false;
                     mutations.forEach(function(mutation) {
                         if (mutation.type === 'childList') {
                             // Verificar si se agregaron o eliminaron tarjetas de contenido
                             mutation.addedNodes.forEach(function(node) {
                                 if (node.nodeType === 1 && (node.matches('.content-card') || node.querySelector('.content-card'))) {
                                     hasContentChanges = true;
                                 }
                             });
                             mutation.removedNodes.forEach(function(node) {
                                 if (node.nodeType === 1 && (node.matches('.content-card') || node.querySelector('.content-card'))) {
                                     hasContentChanges = true;
                                 }
                             });
                         }
                     });
                     
                     if (hasContentChanges) {
                         updateFavoritesSafe();
                     }
                 });
                 
                 gridObserver.observe(grid, {
                     childList: true,
                     subtree: true
                 });
                 
                 // Guardar referencia para evitar memoria leaks (opcional, pero buena práctica)
                 if (!grid.__favoriteObserver) {
                     grid.__favoriteObserver = gridObserver;
                 }
             });
             
             // También observar cuando se agreguen nuevos grids al DOM
             const containerObserver = new MutationObserver(function(mutations) {
                 mutations.forEach(function(mutation) {
                     if (mutation.type === 'childList') {
                         mutation.addedNodes.forEach(function(node) {
                             if (node.nodeType === 1) {
                                 if (node.matches('.content-grid')) {
                                     // Nuevo grid agregado, configurar su observer
                                     setupGridObserverForNode(node);
                                 } else if (node.querySelector && node.querySelector('.content-grid')) {
                                     // Contenedor que tiene grids internos
                                     node.querySelectorAll('.content-grid').forEach(grid => {
                                         setupGridObserverForNode(grid);
                                     });
                                 }
                             }
                         });
                     }
                 });
             });
             
             containerObserver.observe(document.body, {
                 childList: true,
                 subtree: true
             });
         }
         
         function setupGridObserverForNode(node) {
             if (node.nodeType === 1 && node.matches('.content-grid')) {
                 const gridObserver = new MutationObserver(function(mutations) {
                     let hasContentChanges = false;
                     mutations.forEach(function(mutation) {
                         if (mutation.type === 'childList') {
                             mutation.addedNodes.forEach(function(addedNode) {
                                 if (addedNode.nodeType === 1 && (addedNode.matches('.content-card') || addedNode.querySelector('.content-card'))) {
                                     hasContentChanges = true;
                                 }
                             });
                             mutation.removedNodes.forEach(function(removedNode) {
                                 if (removedNode.nodeType === 1 && (removedNode.matches('.content-card') || removedNode.querySelector('.content-card'))) {
                                     hasContentChanges = true;
                                 }
                             });
                         }
                     });
                     
                     if (hasContentChanges) {
                         updateFavoritesSafe();
                     }
                 });
                 
                 gridObserver.observe(node, {
                     childList: true,
                     subtree: true
                 });
                 
                 if (!node.__favoriteObserver) {
                     node.__favoriteObserver = gridObserver;
                 }
             }
         }
         
         // Inicializar observers para grids existentes
         setupGridObserver();
         
          // También verificar periódicamente como mecanismo de respaldo
          // Verificar más frecuentemente al inicio para corregir rápidamente cualquier corrupción
          const favoritesInterval = setInterval(function() {
              // Solo actualizar si estamos en la página de descargas o perfil donde importan los favoritos
              if (window.location.pathname === '/downloads' || 
                  window.location.pathname === '/profile.html' ||
                  window.location.pathname.includes('/blog/')) {
                  updateFavoritesSafe();
              }
          }, 2000); // Cada 2 segundos en lugar de 5
          
          // Verificación adicional alrededor de los 3 segundos para abordar problemas específicos de timing
          setTimeout(function() {
              if (window.location.pathname === '/downloads' || 
                  window.location.pathname === '/profile.html' ||
                  window.location.pathname.includes('/blog/')) {
                  updateFavoritesSafe();
              }
          }, 3200); // Un poco después de los 3 segundos sospechosos
     }
    
    document.addEventListener('DOMContentLoaded', initTracker);
    
    window.ProfileTracker = {
        addToHistory: addToHistory,
        incrementStat: incrementStat,
        toggleFavorite: toggleFavorite,
        updateFavoriteIcons: updateAllFavoriteIcons
    };
})();