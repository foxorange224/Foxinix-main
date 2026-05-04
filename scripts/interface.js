// interface.js - Carga header y footer del blog
document.addEventListener('DOMContentLoaded', () => {
    // Cargar panel y footer desde archivos centralizados
    const panelUrl = '/components/panel.html';
    const footerUrl = '/components/footer.html';
    
    // Determinar la página actual para marcar enlace activo
    // Normalizar el path: quitar /index.html y / al final si existe
    let path = window.location.pathname;
    // Eliminar /index.html al final
    if (path.endsWith('/index.html')) {
        path = path.substring(0, path.length - 11); // /index.html = 11 chars
    }
    // Eliminar / al final si no es solo /
    if (path.length > 1 && path.endsWith('/')) {
        path = path.substring(0, path.length - 1);
    }
    
    let currentPage = 'inicio';
    // Usar comparación exacta o al inicio del path
    if (path === '/downloads' || path === '/software' || path === '/downloads.html' || path.startsWith('/software')) {
        currentPage = 'software';
    } else if (path === '/blog' || path === '/blog.html' || path.startsWith('/blog')) {
        currentPage = 'blog';
    } else if (path === '/about' || path === '/about.html' || path.startsWith('/about')) {
        currentPage = 'about';
    } else if (path === '/chat' || path === '/chat.html' || path.startsWith('/chat')) {
        currentPage = 'chat';
    } else if (path === '/profile' || path === '/profile.html' || path.startsWith('/profile')) {
        currentPage = 'profile';
    } else if (path === '/profile/config' || path === '/welcome' || path === '/welcome.html') {
        currentPage = 'config';
    }
    
    fetch(panelUrl)
        .then(response => response.text())
        .then(data => {
            const placeholder = document.getElementById('header-placeholder');
            if (placeholder) {
                // Sanitizar HTML del panel
                const sanitizedData = window.sanitizeHTML ? window.sanitizeHTML(data) : data;
                placeholder.innerHTML = sanitizedData;
                
                // Marcar enlace activo según la página actual
                const navLinks = placeholder.querySelectorAll('.logo-text a, .header-actions a');
                navLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href === '/' && currentPage === 'inicio') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else if (href === '/downloads' && currentPage === 'software') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else if (href === '/blog' && currentPage === 'blog') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else if (href === '/about' && currentPage === 'about') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else if (href === '/chat' && currentPage === 'chat') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else if (href === '/profile' && currentPage === 'profile') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else if ((href === '/profile/config' || href === '/welcome') && currentPage === 'config') {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    }
                });

                // Sincronizar iconos del tema después de cargar el panel (con delay para asegurar renderizado)
                if (typeof window.syncIcons === 'function') {
                    setTimeout(() => window.syncIcons(), 50);
                }
                
                // Ocultar botón de notificaciones en páginas no permitidas
                const notificationBtn = placeholder.querySelector('#notificationBtn');
                if (notificationBtn) {
                    const path = window.location.pathname;
                    const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '');
                    const allowedRoutes = ['/', '/downloads', '/blog'];
                    const isAllowed = allowedRoutes.some(route => {
                        const normalizedRoute = route === '/' ? '/' : route.replace(/\/$/, '');
                        // Coincidencia exacta o cuando es la ruta raíz
                        return normalizedPath === normalizedRoute || 
                               (normalizedRoute !== '/' && normalizedPath === normalizedRoute + '/');
                    });
                    if (!isAllowed) {
                        notificationBtn.style.display = 'none';
                    }
                }
            }
        })
        .catch(err => {
            console.error('Error cargando panel de navegación:', err);
        });

    fetch(footerUrl)
        .then(res => res.text())
        .then(html => {
            const footer = document.getElementById('footer-placeholder');
            if (footer) {
                // Sanitizar HTML del footer
                const sanitizedHtml = window.sanitizeHTML ? window.sanitizeHTML(html) : html;
                footer.innerHTML = sanitizedHtml;
            }
        })
        .catch(err => {
            console.error('Error cargando footer:', err);
        });
});
