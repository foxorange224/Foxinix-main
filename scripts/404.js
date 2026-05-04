        document.addEventListener('DOMContentLoaded', function () {
            const currentUrl = window.location.href;
            const urlElement = document.getElementById('currentUrl');
            if (currentUrl && !currentUrl.endsWith('/404.html') && currentUrl !== window.location.origin + '/') {
                // Sanitizar URL para prevenir XSS
                const div = document.createElement('div');
                div.textContent = currentUrl;
                const safeUrl = div.innerHTML;
                urlElement.innerHTML = `<i class="fa-solid fa-link"></i> URL: ${safeUrl}`;
                urlElement.style.display = 'block';
            } else {
                urlElement.style.display = 'none';
            }
        });
