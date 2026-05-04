/**
 * Script principal para el blog/index.html
 */

// Función para escapar HTML y prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Función para abrir pestañas
function openBlogTab(tabName) {
    // Ocultar todos los contenidos de pestañas
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.style.display = 'none';
        content.setAttribute('aria-hidden', 'true');
    });

    // Desactivar todos los botones de pestañas
    const tabLinks = document.querySelectorAll('.tablink');
    tabLinks.forEach(link => {
        link.classList.remove('active');
        link.setAttribute('aria-selected', 'false');
    });

    // Mostrar el contenido de la pestaña seleccionada
    const selectedContent = document.getElementById(tabName);
    if (selectedContent) {
        selectedContent.style.display = 'block';
        selectedContent.setAttribute('aria-hidden', 'false');
    }

    // Activar el botón de la pestaña seleccionada
    const selectedLink = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedLink) {
        selectedLink.classList.add('active');
        selectedLink.setAttribute('aria-selected', 'true');
    }

    // Actualizar URL con el parámetro tab
    const tabParamMap = {
        'Todos': 'all',
        'Linux': 'linux',
        'Software': 'software',
        'Windows': 'windows',
        'Tutoriales': 'tutorials'
    };
    const paramValue = tabParamMap[tabName] || tabName.toLowerCase();
    const url = new URL(window.location);
    url.searchParams.set('tab', paramValue);
    history.replaceState({}, document.title, url);

    // Scroll al inicio
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Función para inicializar las pestañas desde el HTML (sin esperar a que carguen los posts)
function initBlogTabs() {
    // Mapeo de parámetros de URL a nombres de pestañas
    const urlTabMap = {
        'all': 'Todos',
        'linux': 'Linux',
        'software': 'Software',
        'windows': 'Windows',
        'tutorials': 'Tutoriales'
    };

    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const tabToOpen = (tabParam && urlTabMap[tabParam]) ? urlTabMap[tabParam] : 'Todos';

    openBlogTab(tabToOpen);
}

// Cargar posts desde posts.json
async function loadBlogPosts() {
    try {
        const response = await fetch('/database/posts.json?v=' + Date.now());
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const posts = await response.json();
        
        distributePosts(posts);
        setupBlogSearch(posts);
    } catch (error) {
        console.error('Error cargando posts:', error);
        const grids = document.querySelectorAll('.content-grid');
        grids.forEach(grid => {
            grid.innerHTML = '<p class="error-message">Error cargando artículos. Por favor, recarga la página.</p>';
        });
    }
}

function distributePosts(posts) {
    const categories = ['Todos', 'Linux', 'Software', 'Windows', 'Tutoriales'];
    
    // Mapeo de categorías a etiquetas válidas
    const tagMapping = {
        'Linux': ['Linux', 'Sistemas Operativos'],
        'Software': ['Software', 'Programas', 'Gratuito', 'Productividad'],
        'Windows': ['Windows', 'Optimización', 'Rendimiento'],
        'Tutoriales': ['Tutorial', 'Tutoriales', 'Guía']
    };
    
    categories.forEach(category => {
        const gridId = `grid-${category}`;
        const grid = document.getElementById(gridId);
        const countElement = document.getElementById(`count-${category}`);
        
        if (!grid) return;

        let filteredPosts;
        if (category === 'Todos') {
            filteredPosts = posts;
        } else {
            const validTags = tagMapping[category] || [category];
            filteredPosts = posts.filter(post => 
                post.tags.some(tag => validTags.includes(tag))
            );
        }

        // Actualizar contador
        if (countElement) {
            countElement.textContent = `(${filteredPosts.length})`;
        }

        // Generar tarjetas
        grid.innerHTML = filteredPosts.map(post => createBlogCard(post)).join('');
    });
}

function createBlogCard(post) {
    const iconClass = getCategoryIcon(post.tags);
    const badges = post.tags.map(tag => `<span class="item-badge"><i class="fa-solid fa-tag"></i> ${escapeHtml(tag)}</span>`).join('');
    const formattedDate = formatDate(post.date);
    
    return `
        <div class="content-card" role="article">
            <div class="card-header">
                <div class="card-icon"><i class="${iconClass}"></i></div>
            </div>
            <div class="card-content">
                <h3 class="card-title">
                    <span class="card-title-text">${escapeHtml(post.title)}</span>
                    ${post.featured ? '<span class="main-badge"><i class="fa-solid fa-star"></i> Destacado</span>' : ''}
                </h3>
                <p class="card-description">${escapeHtml(post.excerpt)}</p>
                <div class="card-badges" role="list">${badges}</div>
                <div class="card-meta">
                    <span class="card-date"><i class="fa-solid fa-calendar-days"></i> ${formattedDate}</span>
                    <span class="card-author"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(post.author)}</span>
                </div>
            </div>
            <div class="card-footer">
                <a href="${post.url}" class="download-btn" aria-label="Leer ${escapeHtml(post.title)}">
                    <i class="fa-solid fa-arrow-right"></i>Leer más
                </a>
            </div>
        </div>
    `;
}

function getCategoryIcon(tags) {
    if (tags.includes('Linux')) return 'fa-brands fa-linux';
    if (tags.includes('Windows')) return 'fa-brands fa-windows';
    if (tags.includes('Software')) return 'fa-solid fa-laptop-code';
    if (tags.includes('Tutorial')) return 'fa-solid fa-graduation-cap';
    return 'fa-solid fa-file-lines';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('es-ES', options);
}

function setupBlogSearch(posts) {
    const searchInput = document.getElementById('blogSearch');
    const clearBtn = document.getElementById('clearSearch');

    if (!searchInput || !clearBtn) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        clearBtn.style.display = query ? 'block' : 'none';

        const filtered = posts.filter(post =>
            post.title.toLowerCase().includes(query) ||
            post.excerpt.toLowerCase().includes(query) ||
            post.tags.some(tag => tag.toLowerCase().includes(query))
        );

        // Actualizar Todas las pestañas con los resultados filtrados
        updateAllGrids(filtered);
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        distributePosts(posts);
        searchInput.focus();
    });
}

function updateAllGrids(filteredPosts) {
    const categories = ['Todos', 'Linux', 'Software', 'Windows', 'Tutoriales'];
    
    // Mapeo de categorías a etiquetas válidas
    const tagMapping = {
        'Linux': ['Linux', 'Sistemas Operativos'],
        'Software': ['Software', 'Programas', 'Gratuito', 'Productividad'],
        'Windows': ['Windows', 'Optimización', 'Rendimiento'],
        'Tutoriales': ['Tutorial', 'Tutoriales', 'Guía']
    };
    
    categories.forEach(category => {
        const grid = document.getElementById(`grid-${category}`);
        const countElement = document.getElementById(`count-${category}`);
        
        if (!grid) return;

        let filtered;
        if (category === 'Todos') {
            filtered = filteredPosts;
        } else {
            const validTags = tagMapping[category] || [category];
            filtered = filteredPosts.filter(post => 
                post.tags.some(tag => validTags.includes(tag))
            );
        }

        // Actualizar contador
        if (countElement) {
            countElement.textContent = `(${filtered.length})`;
        }

        // Generar tarjetas
        if (filtered.length === 0) {
            grid.innerHTML = '<p class="no-results-message"><i class="fa-solid fa-search"></i> No se encontraron artículos</p>';
        } else {
            grid.innerHTML = filtered.map(post => createBlogCard(post)).join('');
        }
    });
}

// Scroll to top button con detección de dirección
(function() {
    const scrollThreshold = 300; // Umbral de scroll para mostrar el botón
    let lastScrollY = 0;
    let ticking = false;
    
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    
    if (!scrollTopBtn) return;
    
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
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
})();

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    // Primero inicializar las pestañas inmediatamente
    initBlogTabs();
    
    // Luego cargar los posts
    loadBlogPosts();
});
