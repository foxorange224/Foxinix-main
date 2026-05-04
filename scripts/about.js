/**
 * Script para la página about/index.html
 */

// ============================================================================
// SISTEMA DE TEMAS
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    let theme = 'dark';
    try {
        theme = localStorage.getItem('foxweb_theme') || 'dark';
    } catch (e) {}
    setTheme(theme);
});

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
        localStorage.setItem('foxweb_theme', theme);
    } catch (e) {}
}

function showModal(type) {
    const messages = {
        privacy: 'Política de Privacidad',
        terms: 'Términos de Uso',
        cookies: 'Política de Cookies',
        license: 'Licencia MIT'
    };

    alert(`Esta funcionalidad está disponible en la página principal.\n\n${messages[type]}: Visita la página de inicio para ver los detalles.`);
}
