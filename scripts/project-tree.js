/**
 * Project Tree Generator
 * Genera dinámicamente la estructura del proyecto FoxWeb
 * 
 * @author FoxWeb Team
 * @version 2.0.0
 */

(function() {
    'use strict';

    // Configuración de la estructura del proyecto
    const PROJECT_STRUCTURE = {
        name: 'foxweb',
        type: 'directory',
        description: 'Proyecto principal FoxWeb',
        children: [
            {
                name: 'index.html',
                type: 'file',
                description: 'Página principal con redirección inteligente',
                badge: 'SPA'
            },
            {
                name: 'welcome.html',
                type: 'file',
                description: 'Página de configuración inicial',
                badge: 'NEW'
            },
            {
                name: 'downloads.html',
                type: 'file',
                description: 'Catálogo de descargas principal',
                badge: 'MAIN'
            },
            {
                name: 'about.html',
                type: 'file',
                description: 'Documentación del proyecto'
            },
            {
                name: 'blog.html',
                type: 'file',
                description: 'Página del blog'
            },
            {
                name: 'redirect.html',
                type: 'file',
                description: 'Página de redirección de enlaces'
            },
            {
                name: 'chat.html',
                type: 'file',
                description: 'Sistema de chat'
            },
            {
                name: '404.html',
                type: 'file',
                description: 'Página de error personalizada'
            },
            {
                name: 'offline.html',
                type: 'file',
                description: 'Página offline (PWA)'
            },
            {
                name: 'sw.js',
                type: 'file',
                description: 'Service Worker (PWA)'
            },
            {
                name: 'assets/',
                type: 'directory',
                description: 'Imágenes, estilos y recursos',
                children: [
                    {
                        name: 'css/',
                        type: 'directory',
                        description: 'Hojas de estilo',
                        children: [
                            { name: 'main.css', type: 'file', description: 'Estilos generales' },
                            { name: 'bg-main.css', type: 'file', description: 'Fondos y hero' },
                            { name: 'welcome.css', type: 'file', description: 'Estilos de bienvenida' },
                            { name: 'about.css', type: 'file', description: 'Estilos de documentación' },
                            { name: 'blog.css', type: 'file', description: 'Estilos del blog' },
                            { name: 'pagination.css', type: 'file', description: 'Sistema de paginación' }
                        ]
                    },
                    {
                        name: 'logo.webp',
                        type: 'file',
                        description: 'Logo del proyecto'
                    },
                    {
                        name: 'background.webp',
                        type: 'file',
                        description: 'Imagen de fondo'
                    }
                ]
            },
            {
                name: 'scripts/',
                type: 'directory',
                description: 'Archivos JavaScript',
                children: [
                    { name: 'main-core.js', type: 'file', description: 'Núcleo de la aplicación' },
                    { name: 'main-features.js', type: 'file', description: 'Características principales' },
                    { name: 'app-init.js', type: 'file', description: 'Inicialización de la app' },
                    { name: 'interface.js', type: 'file', description: 'Gestión de interfaz' },
                    { name: 'pagination.js', type: 'file', description: 'Sistema de paginación' },
                    { name: 'project-tree.js', type: 'file', description: 'Generador de árbol' },
                    { name: 'modals.js', type: 'file', description: 'Gestión de modales' }
                ]
            },
            {
                name: 'database/',
                type: 'directory',
                description: 'Datos y contenido',
                children: [
                    { name: 'data.json', type: 'file', description: 'Base de datos principal' },
                    { name: 'posts.json', type: 'file', description: 'Artículos del blog' },
                    { name: 'modals.html', type: 'file', description: 'Modales dinámicos' }
                ]
            },
            {
                name: 'components/',
                type: 'directory',
                description: 'Componentes reutilizables',
                children: [
                    { name: 'header.html', type: 'file', description: 'Encabezado' },
                    { name: 'footer.html', type: 'file', description: 'Pie de página' },
                    { name: 'panel.html', type: 'file', description: 'Panel de navegación' }
                ]
            },
            {
                name: 'blog/',
                type: 'directory',
                description: 'Artículos del blog',
                children: [
                    { name: 'como-es-linux/', type: 'directory', description: 'Artículo sobre Linux' },
                    { name: 'instalar-arch-linux/', type: 'directory', description: 'Guía de Arch Linux' },
                    { name: 'optimizar-windows-rendimiento/', type: 'directory', description: 'Optimizar Windows' },
                    { name: 'mejores-programas-gratis/', type: 'directory', description: 'Programas gratis' }
                ]
            },
            {
                name: 'about/',
                type: 'directory',
                description: 'Páginas informativas',
                children: [
                    { name: 'policy.html', type: 'file', description: 'Política de privacidad' },
                    { name: 'terms.html', type: 'file', description: 'Términos de servicio' },
                    { name: 'license.html', type: 'file', description: 'Licencia del proyecto' }
                ]
            },
            {
                name: 'docs/',
                type: 'directory',
                description: 'Documentación técnica',
                children: [
                    { name: 'IMPROVEMENTS_MADE.md', type: 'file', description: 'Mejoras realizadas' },
                    { name: 'PAGINATION_SYSTEM.md', type: 'file', description: 'Sistema de paginación' }
                ]
            },
            {
                name: 'README.md',
                type: 'file',
                description: 'Documentación del proyecto'
            },
            {
                name: 'site.webmanifest',
                type: 'file',
                description: 'Manifest PWA'
            }
        ]
    };

    /**
     * Genera el HTML para un elemento del árbol
     * @param {Object} item - Elemento del árbol
     * @param {number} depth - Profundidad actual
     * @returns {string} HTML generado
     */
    function generateTreeItem(item, depth = 0) {
        const itemType = item.type === 'directory' ? 'directory' : 'file';
        const badge = item.badge ? `<span class="project-tree__badge project-tree__badge--${item.badge}">${item.badge.toUpperCase()}</span>` : '';
        
        let childrenHtml = '';
        if (item.children && item.children.length > 0) {
            const childrenItems = item.children.map(child => generateTreeItem(child, depth + 1)).join('');
            childrenHtml = `<ul class="project-tree__list" role="group" aria-label="Contenido de ${item.name}">${childrenItems}</ul>`;
        }

        return `
            <li class="project-tree__item project-tree__item--${itemType}" role="treeitem" aria-expanded="${item.type === 'directory' ? 'true' : undefined}">
                <span class="project-tree__name">${item.name}</span>
                <span class="project-tree__description">${item.description}</span>
                ${badge}
                ${childrenHtml}
            </li>
        `;
    }

    /**
     * Genera el árbol completo del proyecto
     * @param {Object} structure - Estructura del proyecto
     * @returns {string} HTML del árbol completo
     */
    function generateProjectTree(structure) {
        const rootItem = `
            <div class="project-tree__root" role="treeitem" aria-expanded="true">
                <span class="project-tree__name">${structure.name}/</span>
                <span class="project-tree__description">${structure.description}</span>
            </div>
        `;

        const childrenHtml = structure.children.map(child => generateTreeItem(child, 1)).join('');

        return `
            <div class="project-tree" role="tree" aria-label="Estructura del proyecto FoxWeb">
                ${rootItem}
                <ul class="project-tree__list" role="group" aria-label="Archivos y carpetas raíz">
                    ${childrenHtml}
                </ul>
            </div>
        `;
    }

    /**
     * Inicializa el árbol del proyecto en el DOM
     */
    function initProjectTree() {
        const container = document.getElementById('project-tree-container');
        
        if (!container) {
            console.warn('[ProjectTree] Contenedor no encontrado: #project-tree-container');
            return;
        }

        try {
            const treeHtml = generateProjectTree(PROJECT_STRUCTURE);
            container.innerHTML = treeHtml;
            
            // Agregar interactividad para expandir/colapsar
            setupTreeInteraction(container);
            
            console.debug('[ProjectTree] Árbol del proyecto generado correctamente');
        } catch (error) {
            console.error('[ProjectTree] Error al generar el árbol:', error);
            container.innerHTML = `
                <div class="project-tree project-tree--error" role="alert">
                    <p>Error al cargar la estructura del proyecto. Por favor, recarga la página.</p>
                </div>
            `;
        }
    }

    /**
     * Configura la interactividad del árbol (expandir/colapsar)
     * @param {HTMLElement} container - Contenedor del árbol
     */
    function setupTreeInteraction(container) {
        const directories = container.querySelectorAll('.project-tree__item--directory');
        
        directories.forEach(dir => {
            const nameElement = dir.querySelector('.project-tree__name');
            const childList = dir.querySelector('.project-tree__list');
            
            if (nameElement && childList) {
                nameElement.style.cursor = 'pointer';
                nameElement.setAttribute('tabindex', '0');
                nameElement.setAttribute('role', 'button');
                nameElement.setAttribute('aria-label', `Expandir/colapsar ${nameElement.textContent}`);
                
                // Click handler
                nameElement.addEventListener('click', function() {
                    toggleDirectory(dir, childList);
                });
                
                // Keyboard handler (Enter and Space)
                nameElement.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleDirectory(dir, childList);
                    }
                });
            }
        });
    }

    /**
     * Alterna la visibilidad de un directorio
     * @param {HTMLElement} dir - Elemento del directorio
     * @param {HTMLElement} childList - Lista de hijos
     */
    function toggleDirectory(dir, childList) {
        const isExpanded = dir.getAttribute('aria-expanded') === 'true';
        dir.setAttribute('aria-expanded', !isExpanded);
        childList.style.display = isExpanded ? 'none' : 'block';
    }

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProjectTree);
    } else {
        initProjectTree();
    }

    // Exponer función para uso externo si es necesario
    window.FoxWebProjectTree = {
        init: initProjectTree,
        structure: PROJECT_STRUCTURE
    };

})();
