/**
 * Script para abrir modales desde URL - se ejecuta después de cargar los scripts
 */

// Función local de sanitización por si window.sanitizeHTML no está disponible
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const modalParam = urlParams.get('openModal');

    if (modalParam) {
        // Función para intentar abrir modal
        function tryOpenModal(attempts = 0) {
            const modal = document.getElementById(modalParam);

            if (modal) {
                // Modal ya existe, abrirlo
                if (typeof openModal === 'function') {
                    openModal(modalParam);
                }
                // Limpiar la URL
                history.replaceState({}, document.title, window.location.pathname);
            } else if (attempts < 10) {
                // Reintentar en 100ms
                setTimeout(() => tryOpenModal(attempts + 1), 100);
            } else {
                console.warn('Modal no encontrado después de múltiples intentos:', modalParam);
            }
        }

        // Primero verificar si los modales ya están cargados
        const container = document.getElementById('modales-container');
        if (container && container.innerHTML.trim() === '') {
            // No hay modales cargados, necesitamos cargarlos
            fetch('database/modals.html?v=' + Date.now())
                .then(response => {
                    if (!response.ok) throw new Error('HTTP error');
                    return response.text();
                })
                .then(html => {
                    // Sanitizar HTML antes de inyectar
                    const sanitizeFn = window.sanitizeHTML || escapeHtml;
                    const sanitizedHtml = typeof sanitizeFn === 'function' ? sanitizeFn(html) : html;
                    container.innerHTML = sanitizedHtml;
                    // Ahora intentar abrir el modal
                    setTimeout(tryOpenModal, 150);
                })
                .catch(error => {
                    console.error('Error cargando modales:', error);
                });
        } else {
            // Los modales ya están en el HTML, intentar abrir directamente
            tryOpenModal();
        }
    }
})();
