/* Foxinix — interacciones mínimas de la portada.
   Sin dependencias; pensado para funcionar también en navegadores antiguos. */
(function () {
    'use strict';

    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('nav-principal');

    function closeNav() {
        if (!toggle || !nav) {
            return;
        }
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    }

    if (toggle && nav) {
        toggle.addEventListener('click', function () {
            var open = nav.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        var links = nav.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', closeNav);
        }

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' || event.keyCode === 27) {
                closeNav();
            }
        });

        document.addEventListener('click', function (event) {
            if (!nav.classList.contains('is-open')) {
                return;
            }
            if (nav.contains(event.target) || toggle.contains(event.target)) {
                return;
            }
            closeNav();
        });
    }

    var year = document.querySelector('[data-year]');
    if (year) {
        year.textContent = String(new Date().getFullYear());
    }
})();
