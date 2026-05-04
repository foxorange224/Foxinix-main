/**
 * FoxWeb App Init - Inicialización unificada
 * Maneja: Theme, Service Worker, Lazy Loading, Prefetch
 */

(function() {
  'use strict';

  // Production check
  const isDev = window.location.hostname === 'localhost' || 
                window.location.hostname.includes('127.0.0.1') ||
                window.location.hostname.includes('.local');
  const log = (...args) => isDev && console.log(...args);

  // ============================================
  // 1. Theme Initialization (Unificado)
  // ============================================
  const ThemeManager = {
    KEY: 'foxweb_theme',
    DEFAULT: 'light',
    retries: 0,
    maxRetries: 10,
    
    init() {
      const saved = localStorage.getItem(this.KEY);
      const theme = saved || this.DEFAULT;
      this.set(theme);
      this.setupToggle();
      this.watchForHeader();
    },
    
    set(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(this.KEY, theme);
      this.updateIcons(theme);
    },
    
    updateIcons(theme) {
      const btn = document.getElementById('themeToggle');
      if (btn) {
        const moon = btn.querySelector('.fa-moon');
        const sun = btn.querySelector('.fa-sun');
        
        if (moon && sun) {
          // Both icons exist - toggle display
          moon.style.display = theme === 'dark' ? 'inline-block' : 'none';
          sun.style.display = theme === 'dark' ? 'none' : 'inline-block';
        } else if (moon || sun) {
          // Only one icon - swap class
          const icon = moon || sun;
          icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
      }
      return false;
    },
    
    updateIcon(theme) {
      // Alias for backward compatibility
      return this.updateIcons(theme);
    },
    
    syncIcons() {
      try {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        this.updateIcons(theme);
      } catch (e) {
        // Ignorar errores
      }
    },
    
    toggle() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      this.set(current === 'dark' ? 'light' : 'dark');
    },
    
    setupToggle() {
      const btn = document.getElementById('themeToggle');
      if (btn && !btn._themeListener) {
        btn._themeListener = true;
        btn.addEventListener('click', () => this.toggle());
      }
    },
    
    watchForHeader() {
      const checkHeader = () => {
        this.retries++;
        const btn = document.getElementById('themeToggle');
        
        if (!btn && this.retries < this.maxRetries) {
          setTimeout(checkHeader, 100);
          return;
        }
        
        if (btn) {
          this.setupToggle();
          this.updateIcons(document.documentElement.getAttribute('data-theme') || 'dark');
        }
      };
      
      // Iniciar observación
      setTimeout(checkHeader, 100);
    }
  };

  // ============================================
  // Service Worker eliminado

  // ============================================
  // 3. Lazy Loading Images
  // ============================================
  const LazyLoader = {
    init() {
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(
          (entries) => this.handleIntersection(entries),
          {
            rootMargin: '50px 0px',
            threshold: 0.01
          }
        );

        document.querySelectorAll('img[data-src]').forEach((img) => {
          this.observer.observe(img);
        });
      } else {
        this.loadAll();
      }
    },

    handleIntersection(entries) {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.loadImage(entry.target);
          if (this.observer) {
            this.observer.unobserve(entry.target);
          }
        }
      });
    },

    loadImage(img) {
      const src = img.dataset.src;
      if (!src) return;

      img.src = src;
      img.removeAttribute('data-src');
      img.classList.add('lazy-loaded');
      
      img.dispatchEvent(new CustomEvent('lazyloaded', { detail: { src } }));
    },

    loadAll() {
      document.querySelectorAll('img[data-src]').forEach((img) => {
        this.loadImage(img);
      });
    }
  };

  // ============================================
  // 4. Prefetch Manager
  // ============================================
  const PrefetchManager = {
    PREFETCH_PAGES: ['/downloads', '/blog', '/about'],
    
    init() {
      if (!('IntersectionObserver' in window)) return;
      
      const observer = new IntersectionObserver(
        (entries) => this.handleIntersection(entries),
        { rootMargin: '200px' }
      );

      document.querySelectorAll('a[data-prefetch]').forEach(function(link) {
        observer.observe(link);
      });

      // Prefetch en hover
      document.addEventListener('mouseover', function(e) {
        const link = e.target.closest('a[data-prefetch]');
        if (link) this.prefetch(link.href);
      }.bind(this));

      // Prefetch en touch
      document.addEventListener('touchstart', function(e) {
        const link = e.target.closest('a[data-prefetch]');
        if (link) this.prefetch(link.href);
      }.bind(this), { passive: true });
    },

    handleIntersection(entries) {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const link = entry.target;
          this.prefetch(link.href);
          link.__prefetchObserver.unobserve(link);
        }
      });
    },

    prefetch(url) {
      if (!url || document.querySelector('link[rel="prefetch"][href="' + url + '"]')) return;
      
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    }
  };

// ============================================
// 5. Navigation Preload
// ============================================
// Eliminado: Requiere Service Worker activo


// ============================================
// 6. Resource Hints
// ============================================
// Eliminado: Movido al HTML para mejor rendimiento


  // ============================================
  // Version Check - Clear cache on version change
  // ============================================
  const VersionManager = {
    KEY: 'foxweb_version',
    
    async init() {
      try {
        const response = await fetch('/version.json');
        const data = await response.json();
        const newVersion = data.version;
        const savedVersion = localStorage.getItem(this.KEY);
        
        if (savedVersion && savedVersion !== newVersion) {
          log('[Version] Nueva versión detectada: ' + newVersion + ' (antes: ' + savedVersion + ')');
          this.clearCache();
          this.notifyUpdate(newVersion);
        }
        
        localStorage.setItem(this.KEY, newVersion);
      } catch (e) {
        log('[Version] Error al verificar versión:', e);
      }
    },
    
    clearCache() {
      log('[Version] Limpiando cache y datos...');
      
      const keysToRemove = [
        'foxweb_favorites',
        'foxweb_download_history',
        'foxweb_stats',
        'foxweb_notifications',
        'foxweb_username',
        'foxweb_tabs_visibility',
        'foxweb_view_mode',
        'foxweb_welcome_done'
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      log('[Version] Datos limpiados');
    },
    
    notifyUpdate(version) {
      log('[Version] Nueva versión: ' + version);
    }
  };

  // ============================================
  // Initialization
  // ============================================
  async function init() {
    log('[App] Inicializando FoxWeb...');
    
    await VersionManager.init();
    ThemeManager.init();
    LazyLoader.init();
    PrefetchManager.init();
    
    log('[App] FoxWeb inicializado correctamente');
  }

  // Ejecutar cuando DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer API global
  window.FoxWeb = {
    theme: ThemeManager,
    lazy: LazyLoader,
    prefetch: PrefetchManager
  };
  
  // Exponer syncIcons para compatibilidad con código existente
  window.syncIcons = function() {
    ThemeManager.syncIcons();
  };
})();
