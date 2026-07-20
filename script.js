        const DB_URL = 'https://db.foxinix.qzz.io';
        const sourceIcons = {
            'open': {
                class: 'source-open',
                title: 'Código Abierto',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M392.8 65.2C375.8 60.3 358.1 70.2 353.2 87.2L225.2 535.2C220.3 552.2 230.2 569.9 247.2 574.8C264.2 579.7 281.9 569.8 286.8 552.8L414.8 104.8C419.7 87.8 409.8 70.1 392.8 65.2zM457.4 201.3C444.9 213.8 444.9 234.1 457.4 246.6L530.8 320L457.4 393.4C444.9 405.9 444.9 426.2 457.4 438.7C469.9 451.2 490.2 451.2 502.7 438.7L598.7 342.7C611.2 330.2 611.2 309.9 598.7 297.4L502.7 201.4C490.2 188.9 469.9 188.9 457.4 201.4zM182.7 201.3C170.2 188.8 149.9 188.8 137.4 201.3L41.4 297.3C28.9 309.8 28.9 330.1 41.4 342.6L137.4 438.6C149.9 451.1 170.2 451.1 182.7 438.6C195.2 426.1 195.2 405.8 182.7 393.3L109.3 320L182.6 246.6C195.1 234.1 195.1 213.8 182.6 201.3z"/></svg>`
            },
            'close': {
                class: 'source-close',
                title: 'Código Cerrado/Propietario',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M256 160L256 224L384 224L384 160C384 124.7 355.3 96 320 96C284.7 96 256 124.7 256 160zM192 224L192 160C192 89.3 249.3 32 320 32C390.7 32 448 89.3 448 160L448 224C483.3 224 512 252.7 512 288L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 288C128 252.7 156.7 224 192 224z"/></svg>`
            }
        };
        let allData = {};
        let allNotifications = [];
        let currentCategory = '';
        let _searchQuery = '';
        let _page = 1;
        const _perPage = 48;

        const _p = ['X9f2', 'K7wQ', 'M5pZ', 'V2tRt', 'XyZ99'];

        function _b64decode(s) {
            return Uint8Array.from(atob(s), c => c.charCodeAt(0));
        }

        async function _deriveKey(password, salt) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
            );
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt, iterations: 2000, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-CBC', length: 256 },
                false,
                ['decrypt']
            );
        }

        async function decryptEnlace(encryptedB64) {
            try {
                const raw = _b64decode(encryptedB64);
                if (raw.length < 1) return null;

                const version = raw[0];
                const password = _p.join('-');
                const enc = new TextEncoder();

                if (version === 2 && raw.length >= 81) {
                    const salt = raw.slice(1, 17);
                    const iv = raw.slice(17, 33);
                    const ct = raw.slice(33, -32);
                    const mac = raw.slice(-32);

                    const keyMaterial = await crypto.subtle.importKey(
                        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
                    );
                    const derived = await crypto.subtle.deriveBits(
                        { name: 'PBKDF2', salt, iterations: 2000, hash: 'SHA-256' },
                        keyMaterial, 384
                    );
                    const derivedBytes = new Uint8Array(derived);
                    const aesKeyBytes = derivedBytes.slice(0, 32);
                    const macKeyBytes = derivedBytes.slice(32, 48);

                    const macKey = await crypto.subtle.importKey(
                        'raw', macKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
                    );
                    const macData = new Uint8Array([2, ...salt, ...iv, ...ct]);
                    const valid = await crypto.subtle.verify('HMAC', macKey, mac, macData);
                    if (!valid) return null;

                    const aesKey = await crypto.subtle.importKey(
                        'raw', aesKeyBytes, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
                    );
                    const decrypted = await crypto.subtle.decrypt(
                        { name: 'AES-CBC', iv }, aesKey, ct
                    );
                    return new TextDecoder().decode(decrypted);
                }

                const salt = raw.slice(0, 16);
                const iv = raw.slice(16, 32);
                const ct = raw.slice(32);
                const key = await _deriveKey(password, salt);
                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-CBC', iv }, key, ct
                );
                return new TextDecoder().decode(decrypted);
            } catch (e) {
                console.error('Decryption failed:', e);
                return null;
            }
        }

        function escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = str;
            return d.innerHTML;
        }

        function hashColor(str) {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            const hue = Math.abs(h) % 360;
            return `hsl(${hue}, 15%, 20%)`;
        }

        function renderPagination(total) {
            const el = document.getElementById('pagination');
            const pages = Math.ceil(total / _perPage);
            if (pages <= 1) { el.innerHTML = ''; return; }
            let html = '';
            html += `<button onclick="goPage(${_page - 1})" ${_page <= 1 ? 'disabled' : ''}>\u00AB Anterior</button>`;
            for (let p = 1; p <= pages; p++) {
                if (pages > 10 && p > 2 && p < pages - 1 && Math.abs(p - _page) > 2) {
                    if (p === 3 || p === pages - 2) html += '<span style="color:var(--muted);padding:0 4px;">...</span>';
                    continue;
                }
                html += `<button onclick="goPage(${p})" class="${p === _page ? 'active-page' : ''}">${p}</button>`;
            }
            html += `<button onclick="goPage(${_page + 1})" ${_page >= pages ? 'disabled' : ''}>Siguiente \u00BB</button>`;
            html += `<span class="page-info">${(_page - 1) * _perPage + 1}-${Math.min(_page * _perPage, total)} de ${total}</span>`;
            el.innerHTML = html;
        }

        function goPage(p) {
            _page = p;
            renderCategory(currentCategory);
        }

        function scrollToSearch() {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => searchInput.focus(), 500);
            }
        }

        function updateFloatingButtons() {
            const topBtn = document.getElementById('back-to-top');
            const bottomBtn = document.getElementById('scroll-to-bottom');
            const searchBtn = document.getElementById('scroll-to-search');

            const hasScrollbar = document.documentElement.scrollHeight > window.innerHeight;
            if (!hasScrollbar) {
                if (topBtn) topBtn.classList.remove('visible');
                if (bottomBtn) bottomBtn.classList.remove('visible');
                if (searchBtn) searchBtn.classList.remove('visible');
                return;
            }
            
            if (topBtn && bottomBtn) {
                const isScrolled = window.scrollY > 400;
                topBtn.classList.toggle('visible', isScrolled);
                bottomBtn.classList.toggle('visible', !isScrolled);
            }
            if (searchBtn) {
                searchBtn.classList.toggle('visible', window.scrollY > 400);
            }
        }

        async function init() {
            const grid = document.getElementById('content-grid');

            grid.innerHTML = `
            <div id="catalog-loader" style="grid-column: 1/-1; text-align: center; padding: 10px 0;">
            <div class="spinner" style="margin-top: 5px;"></div>
            <p id="loader-text" style="color: var(--muted-text); font-size: 1.2rem; text-shadow: 0 2px 6px rgba(0,0,0,0.6);">Cargando...</p>
            </div>
            `;

            const startTime = Date.now();
            const loaderText = document.getElementById('loader-text');
            const timer = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed >= 16) {
                    loaderText.innerText = 'Al parecer esto esta durando más de lo normal...';
                } else if (elapsed >= 6) {
                    loaderText.innerText = 'Sigue cargando, no te desesperes...';
                }
            }, 1000);

            try {
                const response = await fetch(`${DB_URL}/data.json`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                allData = await response.json();

                clearInterval(timer);
                grid.innerHTML = '';
                setupCategories();

                const hash = window.location.hash.substring(1);
                const categories = Object.keys(allData);
                const targetCat = categories.find(c => c.toLowerCase() === hash.toLowerCase());
                switchCategory(targetCat || categories[0]);

                setupNotifications();

                const searchInput = document.getElementById('search-input');
                const clearBtn = document.getElementById('clear-btn');
                searchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        clearSearch();
                    }
                });
                searchInput.addEventListener('input', function() {
                    _searchQuery = this.value;
                    clearBtn.style.display = this.value ? 'block' : 'none';
                    const url = new URL(window.location.href);
                    if (this.value) {
                        url.searchParams.set('search', this.value);
                        document.getElementById('category-nav').classList.add('hidden');
                        document.querySelector('.search-bar').classList.add('compact');
                        renderGlobalSearch(this.value);
                    } else {
                        url.searchParams.delete('search');
                        document.getElementById('category-nav').classList.remove('hidden');
                        document.querySelector('.search-bar').classList.remove('compact');
                        if (currentCategory) renderCategory(currentCategory);
                    }
                    updateFloatingButtons();
                    window.history.replaceState({}, '', url);
                });

                const urlParams = new URLSearchParams(window.location.search);
                const searchParam = urlParams.get('search');
                const itemParam = urlParams.get('item');

                if (searchParam) {
                    searchInput.value = searchParam;
                    _searchQuery = searchParam;
                    clearBtn.style.display = 'block';
                    document.getElementById('category-nav').classList.add('hidden');
                    document.querySelector('.search-bar').classList.add('compact');
                    renderGlobalSearch(searchParam);
                }

                    if (itemParam) {
                        setTimeout(() => {
                            openItemById(itemParam);
                        }, 100);
                    }
                    updateFloatingButtons();
                } catch (e) {
                clearInterval(timer);
                console.error('Error loading data:', e);
                grid.innerHTML = '';
                document.querySelector('.search-header').innerHTML = `
                <div class="error-banner">
                <i style="display: flex; justify-content: center;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="84" height="84"><path fill="currentColor" d="M320 64C334.7 64 348.2 72.1 355.2 85L571.2 485C577.9 497.4 577.6 512.4 570.4 524.5C563.2 536.6 550.1 544 536 544L104 544C89.9 544 76.8 536.6 69.6 524.5C62.4 512.4 62.1 497.4 68.8 485L284.8 85C291.8 72.1 305.3 64 320 64zM320 416C302.3 416 288 430.3 288 448C288 465.7 302.3 480 320 480C337.7 480 352 465.7 352 448C352 430.3 337.7 416 320 416zM320 224C301.8 224 287.3 239.5 288.6 257.7L296 361.7C296.9 374.2 307.4 384 319.9 384C332.5 384 342.9 374.3 343.8 361.7L351.2 257.7C352.5 239.5 338.1 224 319.8 224z"/></svg>
                </i>
                <h2>Error al cargar los datos</h2>
                <p>No se pudo conectar con la base de datos. <br><strong>Error: ${escapeHtml(e.message)}</strong></p>
                <button onclick="location.reload()">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" style="vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M129.9 292.5C143.2 199.5 223.3 128 320 128C373 128 421 149.5 455.8 184.2C456 184.4 456.2 184.6 456.4 184.8L464 192L416.1 192C398.4 192 384.1 206.3 384.1 224C384.1 241.7 398.4 256 416.1 256L544.1 256C561.8 256 576.1 241.7 576.1 224L576.1 96C576.1 78.3 561.8 64 544.1 64C526.4 64 512.1 78.3 512.1 96L512.1 149.4L500.8 138.7C454.5 92.6 390.5 64 320 64C191 64 84.3 159.4 66.6 283.5C64.1 301 76.2 317.2 93.7 319.7C111.2 322.2 127.4 310 129.9 292.6zM573.4 356.5C575.9 339 563.7 322.8 546.3 320.3C528.9 317.8 512.6 330 510.1 347.4C496.8 440.4 416.7 511.9 320 511.9C267 511.9 219 490.4 184.2 455.7C184 455.5 183.8 455.3 183.6 455.1L176 447.9L223.9 447.9C241.6 447.9 255.9 433.6 255.9 415.9C255.9 398.2 241.6 383.9 223.9 383.9L96 384C87.5 384 79.3 387.4 73.3 393.5C67.3 399.6 63.9 407.7 64 416.3L65 543.3C65.1 561 79.6 575.2 97.3 575C115 574.8 129.2 560.4 129 542.7L128.6 491.2L139.3 501.3C185.6 547.4 249.5 576 320 576C449 576 555.7 480.6 573.4 356.5z"/></svg>
                Reintentar
                </button>
                </div>
                `;
            }
        }

        function setupCategories() {
            const nav = document.getElementById('category-nav');
            const categories = Object.keys(allData);
            const icons = {
                'Programas': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="24" height="24"><path d="M64 160C64 124.7 92.7 96 128 96L512 96C547.3 96 576 124.7 576 160L576 400L512 400L512 160L128 160L128 400L64 400L64 160zM0 467.2C0 456.6 8.6 448 19.2 448L620.8 448C631.4 448 640 456.6 640 467.2C640 509.6 605.6 544 563.2 544L76.8 544C34.4 544 0 509.6 0 467.2zM281 273L250 304L281 335C290.4 344.4 290.4 359.6 281 368.9C271.6 378.2 256.4 378.3 247.1 368.9L199.1 320.9C189.7 311.5 189.7 296.3 199.1 287L247.1 239C256.5 229.6 271.7 229.6 281 239C290.3 248.4 290.4 263.6 281 272.9zM393 239L441 287C450.4 296.4 450.4 311.6 441 320.9L393 368.9C383.6 378.3 368.4 378.3 359.1 368.9C349.8 359.5 349.7 344.3 359.1 335L390.1 304L359.1 273C349.7 263.6 349.7 248.4 359.1 239.1C368.5 229.8 383.7 229.7 393 239.1z"/></svg>`,
                'Sistemas': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="24" height="24"><path d="M240 88C240 74.7 229.3 64 216 64C202.7 64 192 74.7 192 88L192 128C156.7 128 128 156.7 128 192L88 192C74.7 192 64 202.7 64 216C64 229.3 74.7 240 88 240L128 240L128 296L88 296C74.7 296 64 306.7 64 320C64 333.3 74.7 344 88 344L128 344L128 400L88 400C74.7 400 64 410.7 64 424C64 437.3 74.7 448 88 448L128 448C128 483.3 156.7 512 192 512L192 552C192 565.3 202.7 576 216 576C229.3 576 240 565.3 240 552L240 512L296 512L296 552C296 565.3 306.7 576 320 576C333.3 576 344 565.3 344 552L344 512L400 512L400 552C400 565.3 410.7 576 424 576C437.3 576 448 565.3 448 552L448 512C483.3 512 512 483.3 512 448L552 448C565.3 448 576 437.3 576 424C576 410.7 565.3 400 552 400L512 400L512 344L552 344C565.3 344 576 333.3 576 320C576 306.7 565.3 296 552 296L512 296L512 240L552 240C565.3 240 576 229.3 576 216C576 202.7 565.3 192 552 192L512 192C512 156.7 483.3 128 448 128L448 88C448 74.7 437.3 64 424 64C410.7 64 400 74.7 400 88L400 128L344 128L344 88C344 74.7 333.3 64 320 64C306.7 64 296 74.7 296 88L296 128L240 128L240 88zM224 192L416 192C433.7 192 448 206.3 448 224L448 416C448 433.7 433.7 448 416 448L224 448C206.3 448 192 433.7 192 416L192 224C192 206.3 206.3 192 224 192zM240 240L240 400L400 400L400 240L240 240z"/></svg>`,
                'Juegos': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="24" height="24"><path d="M448 128C554 128 640 214 640 320C640 426 554 512 448 512L192 512C86 512 0 426 0 320C0 214 86 128 192 128L448 128zM192 240C178.7 240 168 250.7 168 264L168 296L136 296C122.7 296 112 306.7 112 320C112 333.3 122.7 344 136 344L168 344L168 376C168 389.3 178.7 400 192 400C205.3 400 216 389.3 216 376L216 344L248 344C261.3 344 272 333.3 272 320C272 306.7 261.3 296 248 296L216 296L216 264C216 250.7 205.3 240 192 240zM432 336C414.3 336 400 350.3 400 368C400 385.7 414.3 400 432 400C449.7 400 464 385.7 464 368C464 350.3 449.7 336 432 336zM496 240C478.3 240 464 254.3 464 272C464 289.7 478.3 304 496 304C513.7 304 528 289.7 528 272C528 254.3 513.7 240 496 240z"/></svg>`,
                'Apks': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="24" height="24"><path d="M131.2 125.9C136.5 125.4 141.8 126.5 146.5 128.9C151.2 131.3 155.1 135.1 157.8 139.7C174.8 169.2 192 198.6 209 228.1C212.5 226.7 216 225.4 219.5 224.2C250.8 213.3 283.7 207.6 316.9 207.3C317.9 207.3 319 207.3 320.1 207.3C358.2 207.3 396.3 214.3 431.7 228.4L483 139.7C484.8 136.5 487.3 133.7 490.2 131.5C493.1 129.3 496.4 127.6 500 126.7C503.1 125.9 506.4 125.6 509.6 125.9C513.8 126.3 517.9 127.6 521.5 129.7C525.5 132.1 528.8 135.4 531.2 139.4C533.2 142.8 534.5 146.6 535 150.6C535.5 154.6 535.1 158.6 533.8 162.3C533.2 164.2 532.4 166 531.4 167.8L481.7 253.6C501.2 265.8 519.3 280.1 535.6 296.4C547.9 308.6 559.1 321.8 569.1 335.9C577.3 347.4 584.7 359.5 591.3 372.1C608.8 405.7 619.9 442.6 624 480.2L16 480.2C20.1 442.5 31.2 405.7 48.7 372.1C63.2 344.2 82.1 318.6 104.4 296.4C120.9 280 139.1 265.5 158.9 253.3L109.4 167.9C105.7 161.5 104.7 153.8 106.6 146.7C108.5 139.6 113 133.6 119.3 129.9C122.9 127.7 127 126.4 131.2 126.1zM198.5 341.7C186.3 333.6 168.4 339.2 158.4 354.2C148.4 369.2 150.2 388 162.3 396.1C174.4 404.2 192.4 398.6 202.4 383.6C212.4 368.6 210.6 349.8 198.5 341.7zM482.1 354.2C472.1 339.2 454.2 333.6 442 341.7C429.8 349.8 428.1 368.6 438.1 383.6C448.1 398.6 466 404.2 478.2 396.1C490.4 388 492.1 369.2 482.1 354.2z"/></svg>`,
                'Extras': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="24" height="24"><path d="M341.5 45.1C337.4 37.1 329.1 32 320.1 32C311.1 32 302.8 37.1 298.7 45.1L225.1 189.3L65.2 214.7C56.3 216.1 48.9 222.4 46.1 231C43.3 239.6 45.6 249 51.9 255.4L166.3 369.9L141.1 529.8C139.7 538.7 143.4 547.7 150.7 553C158 558.3 167.6 559.1 175.7 555L320.1 481.6L464.4 555C472.4 559.1 482.1 558.3 489.4 553C496.7 547.7 500.4 538.8 499 529.8L473.7 369.9L588.1 255.4C594.5 249 596.7 239.6 593.9 231C591.1 222.4 583.8 216.1 574.8 214.7L415 189.3L341.5 45.1z"/></svg>`
            };

            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'cat-btn';
                btn.id = `btn-${cat}`;
                const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
                const icon = icons[catName] || '';
                btn.innerHTML = `${icon} ${catName} (${allData[cat].length})`;
                btn.onclick = () => { window.location.hash = cat; };
                nav.appendChild(btn);
            });
        }

        function switchCategory(cat) {
            currentCategory = cat;
            _page = 1;
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            const activeBtn = document.getElementById(`btn-${cat}`);
            if (activeBtn) activeBtn.classList.add('active');
            document.getElementById('search-input').value = '';
            _searchQuery = '';
            renderCategory(cat);
        }

        window.onhashchange = () => {
            const hash = window.location.hash.substring(1);
            const categories = Object.keys(allData);
            const targetCat = categories.find(c => c.toLowerCase() === hash.toLowerCase());
            if (targetCat) switchCategory(targetCat);
        };

        function renderCategory(cat) {
            const mainGrid = document.getElementById('content-grid');
            
            // Ensure we have a search container and category containers separate
            let searchGrid = document.getElementById('search-results-grid');
            if (!searchGrid) {
                searchGrid = document.createElement('div');
                searchGrid.id = 'search-results-grid';
                searchGrid.className = 'category-grid grid-hidden';
                mainGrid.appendChild(searchGrid);
            }

            let catGrid = document.getElementById(`grid-${cat}`);
            if (!catGrid) {
                catGrid = document.createElement('div');
                catGrid.id = `grid-${cat}`;
                catGrid.className = 'category-grid grid-hidden';
                mainGrid.appendChild(catGrid);
                catGrid.dataset.page = '0'; // Track rendered page
            }

            // Hide all grids
            document.querySelectorAll('.category-grid').forEach(g => g.classList.add('grid-hidden'));
            
            if (_searchQuery) {
                searchGrid.classList.remove('grid-hidden');
                renderGlobalSearch(_searchQuery);
                return;
            }

            // If we are on the page already rendered, just show it and skip re-rendering
            if (catGrid.dataset.page == _page) {
                catGrid.classList.remove('grid-hidden');
                renderPagination( (allData[cat] || []).length ); // Need total for pagination
                updateFloatingButtons();
                return;
            }

            catGrid.classList.remove('grid-hidden');
            catGrid.dataset.page = _page;
            catGrid.innerHTML = '';

            const items = allData[cat] || [];
            const filtered = _searchQuery
            ? items.filter(item =>
            (item.name || '').toLowerCase().includes(_searchQuery.toLowerCase()) ||
            (item.info || '').toLowerCase().includes(_searchQuery.toLowerCase()) ||
            (item.badges || []).some(b => b.toLowerCase().includes(_searchQuery.toLowerCase()))
            )
            : items;

            if (filtered.length === 0) {
                catGrid.innerHTML = `<div class="no-results">
                <div class="no-results-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M64 128C51.1 128 39.4 135.8 34.4 147.8C29.4 159.8 32.2 173.5 41.4 182.6L224 365.3L224 480C224 488.5 227.4 496.6 233.4 502.6L297.4 566.6C299.9 569.1 302.7 571.1 305.7 572.6C284.5 541.7 272.1 504.3 272.1 464C272.1 364.6 347.6 282.9 444.4 273L534.8 182.6C544 173.4 546.7 159.7 541.7 147.7C536.7 135.7 524.9 128 512 128L64 128zM464 608C543.5 608 608 543.5 608 464C608 384.5 543.5 320 464 320C384.5 320 320 384.5 320 464C320 543.5 384.5 608 464 608zM523.3 427.3L486.6 464L523.3 500.7C529.5 506.9 529.5 517.1 523.3 523.3C517.1 529.5 506.9 529.5 500.7 523.3L464 486.6L427.3 523.3C421.1 529.5 410.9 529.5 404.7 523.3C398.5 517.1 398.5 506.9 404.7 500.7L441.4 464L404.7 427.3C398.5 421.1 398.5 410.9 404.7 404.7C410.9 398.5 421.1 398.5 427.3 404.7L464 441.4L500.7 404.7C506.9 398.5 517.1 398.5 523.3 404.7C529.5 410.9 529.5 421.1 523.3 427.3z"/></svg>
                </div>
                <div>${_searchQuery ? 'Sin resultados para "' + escapeHtml(_searchQuery) + '"' : 'No hay elementos en esta categoría.'}</div>
                </div>`;
                document.getElementById('pagination').innerHTML = '';
                updateFloatingButtons();
                return;
            }

            _page = Math.min(_page, Math.ceil(filtered.length / _perPage) || 1);
            const start = (_page - 1) * _perPage;
            const pageItems = filtered.slice(start, start + _perPage);

            pageItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'card';
                card.tabIndex = 0;
                card.role = 'button';
                card.setAttribute('aria-label', `Abrir ${item.name || ''}`);
                card.title = item.name || '';

                const badgesHtml = (item.badges || []).map(b => `<span class="badge">${escapeHtml(b)}</span>`).join('');
                const iconUrl = `${DB_URL}/icons/${item.id}.webp`;

                const sourceInfo = sourceIcons[item.source] || { class: '', svg: '', title: '' };
                const sourceIndicator = sourceInfo.svg 
                    ? `<div class="source-indicator ${sourceInfo.class}" title="${sourceInfo.title}">${sourceInfo.svg}</div>` 
                    : '';

                card.innerHTML = `
                <div class="icon-wrapper">
                    <img src="${iconUrl}" alt="${escapeHtml(item.name || '')}" loading="lazy" onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" fill="%23333"><rect width="84" height="84" rx="8"/><text x="42" y="48" text-anchor="middle" fill="%23666" font-size="28">?</text></svg>')}'"">
                    ${sourceIndicator}
                </div>
                <h3>${escapeHtml(item.name || '')}</h3>
                <div class="badges">${badgesHtml}</div>
                `;

                card.onclick = () => openDescription(item);
                card.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDescription(item);
                    }
                };
                catGrid.appendChild(card);
            });

            renderPagination(filtered.length);
            updateFloatingButtons();
        }

            function filterCards() {
                if (currentCategory) renderCategory(currentCategory);
            }

            function clearSearch() {
                const input = document.getElementById('search-input');
                input.value = '';
                _searchQuery = '';
                document.getElementById('clear-btn').style.display = 'none';
                document.getElementById('category-nav').classList.remove('hidden');
                document.querySelector('.search-bar').classList.remove('compact');
                const url = new URL(window.location.href);
                url.searchParams.delete('search');
                window.history.replaceState({}, '', url);
                if (currentCategory) renderCategory(currentCategory);
                input.focus();
            }

            function openItemById(id) {
                for (const items of Object.values(allData)) {
                    const item = items.find(it => it.id === id);
                    if (item) { openDescription(item); return; }
                }
            }

            function renderGlobalSearch(query) {
                // Hide all category grids first
                document.querySelectorAll('.category-grid').forEach(g => g.classList.add('grid-hidden'));

                const grid = document.getElementById('search-results-grid');
                if (!grid) return;
                grid.classList.remove('grid-hidden');
                const q = query.toLowerCase();
                const results = [];

                for (const [cat, items] of Object.entries(allData)) {
                    const matches = items.filter(item =>
                    (item.name || '').toLowerCase().includes(q) ||
                    (item.info || '').toLowerCase().includes(q) ||
                    (item.badges || []).some(b => b.toLowerCase().includes(q))
                    );
                    if (matches.length) results.push({ cat, matches });
                }

                if (!results.length) {
                    grid.innerHTML = `<div class="no-results">
                    <div class="no-results-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M64 128C51.1 128 39.4 135.8 34.4 147.8C29.4 159.8 32.2 173.5 41.4 182.6L224 365.3L224 480C224 488.5 227.4 496.6 233.4 502.6L297.4 566.6C299.9 569.1 302.7 571.1 305.7 572.6C284.5 541.7 272.1 504.3 272.1 464C272.1 364.6 347.6 282.9 444.4 273L534.8 182.6C544 173.4 546.7 159.7 541.7 147.7C536.7 135.7 524.9 128 512 128L64 128zM464 608C543.5 608 608 543.5 608 464C608 384.5 543.5 320 464 320C384.5 320 320 384.5 320 464C320 543.5 384.5 608 464 608zM523.3 427.3L486.6 464L523.3 500.7C529.5 506.9 529.5 517.1 523.3 523.3C517.1 529.5 506.9 529.5 500.7 523.3L464 486.6L427.3 523.3C421.1 529.5 410.9 529.5 404.7 523.3C398.5 517.1 398.5 506.9 404.7 500.7L441.4 464L404.7 427.3C398.5 421.1 398.5 410.9 404.7 404.7C410.9 398.5 421.1 398.5 427.3 404.7L464 441.4L500.7 404.7C506.9 398.5 517.1 398.5 523.3 404.7C529.5 410.9 529.5 421.1 523.3 427.3z"/></svg>
                    </div>
                    <div>Sin resultados para "${escapeHtml(query)}"</div>
                    </div>`;
                    document.getElementById('pagination').innerHTML = '';
                    updateFloatingButtons();
                    return;
                }

                results.sort((a, b) => b.matches.length - a.matches.length);

                const icons = {
                    'Programas': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="32" height="32"><path d="M64 160C64 124.7 92.7 96 128 96L512 96C547.3 96 576 124.7 576 160L576 400L512 400L512 160L128 160L128 400L64 400L64 160zM0 467.2C0 456.6 8.6 448 19.2 448L620.8 448C631.4 448 640 456.6 640 467.2C640 509.6 605.6 544 563.2 544L76.8 544C34.4 544 0 509.6 0 467.2zM281 273L250 304L281 335C290.4 344.4 290.4 359.6 281 368.9C271.6 378.2 256.4 378.3 247.1 368.9L199.1 320.9C189.7 311.5 189.7 296.3 199.1 287L247.1 239C256.5 229.6 271.7 229.6 281 239C290.3 248.4 290.4 263.6 281 272.9zM393 239L441 287C450.4 296.4 450.4 311.6 441 320.9L393 368.9C383.6 378.3 368.4 378.3 359.1 368.9C349.8 359.5 349.7 344.3 359.1 335L390.1 304L359.1 273C349.7 263.6 349.7 248.4 359.1 239.1C368.5 229.8 383.7 229.7 393 239.1z"/></svg>`,
                    'Sistemas': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="32" height="32"><path d="M240 88C240 74.7 229.3 64 216 64C202.7 64 192 74.7 192 88L192 128C156.7 128 128 156.7 128 192L88 192C74.7 192 64 202.7 64 216C64 229.3 74.7 240 88 240L128 240L128 296L88 296C74.7 296 64 306.7 64 320C64 333.3 74.7 344 88 344L128 344L128 400L88 400C74.7 400 64 410.7 64 424C64 437.3 74.7 448 88 448L128 448C128 483.3 156.7 512 192 512L192 552C192 565.3 202.7 576 216 576C229.3 576 240 565.3 240 552L240 512L296 512L296 552C296 565.3 306.7 576 320 576C333.3 576 344 565.3 344 552L344 512L400 512L400 552C400 565.3 410.7 576 424 576C437.3 576 448 565.3 448 552L448 512C483.3 512 512 483.3 512 448L552 448C565.3 448 576 437.3 576 424C576 410.7 565.3 400 552 400L512 400L512 344L552 344C565.3 344 576 333.3 576 320C576 306.7 565.3 296 552 296L512 296L512 240L552 240C565.3 240 576 229.3 576 216C576 202.7 565.3 192 552 192L512 192C512 156.7 483.3 128 448 128L448 88C448 74.7 437.3 64 424 64C410.7 64 400 74.7 400 88L400 128L344 128L344 88C344 74.7 333.3 64 320 64C306.7 64 296 74.7 296 88L296 128L240 128L240 88zM224 192L416 192C433.7 192 448 206.3 448 224L448 416C448 433.7 433.7 448 416 448L224 448C206.3 448 192 433.7 192 416L192 224C192 206.3 206.3 192 224 192zM240 240L240 400L400 400L400 240L240 240z"/></svg>`,
                    'Juegos': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="32" height="32"><path d="M448 128C554 128 640 214 640 320C640 426 554 512 448 512L192 512C86 512 0 426 0 320C0 214 86 128 192 128L448 128zM192 240C178.7 240 168 250.7 168 264L168 296L136 296C122.7 296 112 306.7 112 320C112 333.3 122.7 344 136 344L168 344L168 376C168 389.3 178.7 400 192 400C205.3 400 216 389.3 216 376L216 344L248 344C261.3 344 272 333.3 272 320C272 306.7 261.3 296 248 296L216 296L216 264C216 250.7 205.3 240 192 240zM432 336C414.3 336 400 350.3 400 368C400 385.7 414.3 400 432 400C449.7 400 464 385.7 464 368C464 350.3 449.7 336 432 336zM496 240C478.3 240 464 254.3 464 272C464 289.7 478.3 304 496 304C513.7 304 528 289.7 528 272C528 254.3 513.7 240 496 240z"/></svg>`,
                    'Apks': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="32" height="32"><path d="M131.2 125.9C136.5 125.4 141.8 126.5 146.5 128.9C151.2 131.3 155.1 135.1 157.8 139.7C174.8 169.2 192 198.6 209 228.1C212.5 226.7 216 225.4 219.5 224.2C250.8 213.3 283.7 207.6 316.9 207.3C317.9 207.3 319 207.3 320.1 207.3C358.2 207.3 396.3 214.3 431.7 228.4L483 139.7C484.8 136.5 487.3 133.7 490.2 131.5C493.1 129.3 496.4 127.6 500 126.7C503.1 125.9 506.4 125.6 509.6 125.9C513.8 126.3 517.9 127.6 521.5 129.7C525.5 132.1 528.8 135.4 531.2 139.4C533.2 142.8 534.5 146.6 535 150.6C535.5 154.6 535.1 158.6 533.8 162.3C533.2 164.2 532.4 166 531.4 167.8L481.7 253.6C501.2 265.8 519.3 280.1 535.6 296.4C547.9 308.6 559.1 321.8 569.1 335.9C577.3 347.4 584.7 359.5 591.3 372.1C608.8 405.7 619.9 442.6 624 480.2L16 480.2C20.1 442.5 31.2 405.7 48.7 372.1C63.2 344.2 82.1 318.6 104.4 296.4C120.9 280 139.1 265.5 158.9 253.3L109.4 167.9C105.7 161.5 104.7 153.8 106.6 146.7C108.5 139.6 113 133.6 119.3 129.9C122.9 127.7 127 126.4 131.2 126.1zM198.5 341.7C186.3 333.6 168.4 339.2 158.4 354.2C148.4 369.2 150.2 388 162.3 396.1C174.4 404.2 192.4 398.6 202.4 383.6C212.4 368.6 210.6 349.8 198.5 341.7zM482.1 354.2C472.1 339.2 454.2 333.6 442 341.7C429.8 349.8 428.1 368.6 438.1 383.6C448.1 398.6 466 404.2 478.2 396.1C490.4 388 492.1 369.2 482.1 354.2z"/></svg>`,
                    'Extras': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" width="32" height="32"><path d="M341.5 45.1C337.4 37.1 329.1 32 320.1 32C311.1 32 302.8 37.1 298.7 45.1L225.1 189.3L65.2 214.7C56.3 216.1 48.9 222.4 46.1 231C43.3 239.6 45.6 249 51.9 255.4L166.3 369.9L141.1 529.8C139.7 538.7 143.4 547.7 150.7 553C158 558.3 167.6 559.1 175.7 555L320.1 481.6L464.4 555C472.4 559.1 482.1 558.3 489.4 553C496.7 547.7 500.4 538.8 499 529.8L473.7 369.9L588.1 255.4C594.5 249 596.7 239.6 593.9 231C591.1 222.4 583.8 216.1 574.8 214.7L415 189.3L341.5 45.1z"/></svg>`
                };

                let html = '';
                results.forEach(r => {
                    const catName = r.cat.charAt(0).toUpperCase() + r.cat.slice(1);
                    const catIcon = icons[catName] || '';
                    html += `<div class="search-cat-section">
                    <div class="search-cat-header" style="display: flex; align-items: center; gap: 8px;">${catIcon} ${catName} (${r.matches.length})</div>
                    <div class="search-cat-line"></div>
                    <div class="search-cat-grid">`;
                    r.matches.forEach(item => {
                        const iconUrl = `${DB_URL}/icons/${item.id}.webp`;
                        const badgesHtml = (item.badges || []).map(b => `<span class="badge">${escapeHtml(b)}</span>`).join('');
                        
                        const sourceInfo = sourceIcons[item.source] || { class: '', svg: '', title: '' };
                        const sourceIndicator = sourceInfo.svg 
                            ? `<div class="source-indicator ${sourceInfo.class}" title="${sourceInfo.title}">${sourceInfo.svg}</div>` 
                            : '';

                        html += `<div class="card" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(item.name || '')}" title="${escapeHtml(item.name || '')}" onclick="openItemById('${escapeHtml(item.id)}')">
                        <div class="icon-wrapper">
                            <img src="${iconUrl}" alt="${escapeHtml(item.name || '')}" loading="lazy" onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" fill="%23333"><rect width="84" height="84" rx="8"/><text x="42" y="48" text-anchor="middle" fill="%23666" font-size="28">?</text></svg>')}'"">
                            ${sourceIndicator}
                        </div>
                        <h3>${escapeHtml(item.name || '')}</h3>
                        <div class="badges">${badgesHtml}</div>
                        </div>`;
                    });
                    html += `</div></div>`;
                });

                grid.innerHTML = html;
                document.getElementById('pagination').innerHTML = '';
                updateFloatingButtons();
            }

            let _mdCache = {};

            function loadScript(src) {
                return new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = src;
                    s.onload = resolve;
                    s.onerror = reject;
                    document.body.appendChild(s);
                });
            }

            async function openDescription(item) {
                const overlay = document.getElementById('description-overlay');
                const container = document.getElementById('desc-container');
                const iconUrl = `${DB_URL}/icons/${item.id}.webp`;

                const url = new URL(window.location.href);
                url.searchParams.set('item', item.id);
                window.history.replaceState({}, '', url);

                document.body.classList.add('no-scroll');
                overlay.style.display = 'block';
                container.classList.add('pop-in');
                container.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--muted-text);margin-top:10px;">Cargando contenido...</p>';

                try {
                    let mdText = '';
                    if (_mdCache[item.id] !== undefined) {
                        mdText = _mdCache[item.id];
                    } else {
                        const mdResponse = await fetch(`${DB_URL}/mds/${item.id}.md`);
                        if (mdResponse.ok) {
                            mdText = await mdResponse.text();
                            _mdCache[item.id] = mdText;
                        } else {
                            _mdCache[item.id] = mdText;
                        }
                    }

                    if (!mdText && !item.info) {
                        container.innerHTML = '<div class="error-banner"><h2>No hay contenido</h2><p>Este elemento no tiene una descripción disponible.</p></div>';
                        container.classList.remove('pop-in');
                        void container.offsetWidth;
                        container.classList.add('pop-in');
                        return;
                    }

                    const link = item.enlace || '';
                    const safeLink = escapeHtml(link);

                    // Pre-process mermaid blocks
                    const mermaidBlocks = [];
                    let processedMd = mdText.replace(/```mermaid\n?([\s\S]*?)```/g, (match, code) => {
                        const idx = mermaidBlocks.length;
                        mermaidBlocks.push(code);
                        return `<!--MERMAID_${idx}-->`;
                    });

                      // Pre-process download buttons
                      const buttonHtmls = [];
                      processedMd = processedMd.replace(/\[button,\s*url="([^"]+)",\s*title="([^"]+)"\]/g, (match, linkUrl, title) => {
                          const idx = buttonHtmls.length;
                          const safeUrl = escapeHtml(linkUrl);
                          const safeTitle = escapeHtml(title);
                          
                          let bgColor = '#d24500';
                          let textColor = 'white';
                          let borderColor = 'transparent';
                          let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" style="vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M384 64C366.3 64 352 78.3 352 96C352 113.7 366.3 128 384 128L466.7 128L265.3 329.4C252.8 341.9 252.8 362.2 265.3 374.7C277.8 387.2 298.1 387.2 310.6 374.7L512 173.3L512 256C512 273.7 526.3 288 544 288C561.7 288 576 273.7 576 256L576 96C576 78.3 561.7 64 544 64L384 64zM144 160C99.8 160 64 195.8 64 240L64 496C64 540.2 99.8 576 144 576L400 576C444.2 576 480 540.2 480 496L480 416C480 398.3 465.7 384 448 384C430.3 384 416 398.3 416 416L416 496C416 504.8 408.8 512 400 512L144 512C135.2 512 128 504.8 128 496L128 240C128 231.2 135.2 224 144 224L224 224C241.7 224 256 209.7 256 192C256 174.3 241.7 160 224 160L144 160z"/></svg>`;
 
                          if (linkUrl.includes('github.com')) {
                              bgColor = '#000';
                              textColor = '#fff';
                              borderColor = '#fff';
                              iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" style="vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M280.5 426.5C214.5 418.5 168 371 168 309.5C168 284.5 177 257.5 192 239.5C185.5 223 186.5 188 194 173.5C214 171 241 181.5 257 196C276 190 296 187 320.5 187C345 187 365 190 383 195.5C398.5 181.5 426 171 446 173.5C453 187 454 222 447.5 239C463.5 258 472 283.5 472 309.5C472 371 425.5 417.5 358.5 426C375.5 437 387 461 387 488.5L387 540.5C387 555.5 399.5 564 414.5 558C505 523.5 576 433 576 321C576 179.5 461 64 319.5 64C178 64 64 179.5 64 321C64 432 134.5 524 229.5 558.5C243 563.5 256 554.5 256 541L256 501C249 504 240 506 232 506C199 506 179.5 488 165.5 454.5C160 441 154 433 142.5 431.5C136.5 431 134.5 428.5 134.5 425.5C134.5 419.5 144.5 415 154.5 415C169 415 181.5 424 194.5 442.5C204.5 457 215 463.5 227.5 463.5C240 463.5 248 459 259.5 447.5C268 439 274.5 431.5 280.5 426.5z"/></svg>`;
                          } else if (linkUrl.includes('mediafire.com')) {
                              bgColor = '#07f';
                              textColor = '#fff';
                              iconSvg = `<svg viewBox="-6.8887712 -3.69853465 81.96659882 46.80035628" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="m20.7 8.3a51.47 51.47 0 0 1 9.34 1c2.9.55 5.85 1.56 8.83 1.55 2.28 0 4.12-1.6 4.1-3.53s-1.85-3.57-4.17-3.56a13.35 13.35 0 0 0 -3.9.65c.33-.23.66-.47 1-.68a26.14 26.14 0 0 1 15.1-3.68c5.6.26 11.46 2 15.8 5.72a19.9 19.9 0 0 1 6.62 17.82 19.75 19.75 0 0 1 -12.17 15.07 24 24 0 0 1 -14.45.52c-6.2-1.58-11.64-5-17.48-7.54a46.86 46.86 0 0 0 -10.57-2.68h.05a9 9 0 0 0 4.1-.7c1.74-.83 1.73-2.83.83-4.3-1.07-1.73-3.23-2.44-5.1-3a24.36 24.36 0 0 0 -10-.48 15.06 15.06 0 0 0 -6.83 2.52 5.67 5.67 0 0 0 -1.8 2.2c3.08-8.53 9.2-7.57 13-9.9a2.16 2.16 0 0 0 -1.57-3.94 7.24 7.24 0 0 0 -2.92 1.46l-.85.65s3.04-5.17 13.04-5.17z" fill="#fff"/><path d="m23.64 23.78.06.06zm32.46-10.73c-4.08 0-5.76 2.57-10.18 5-7.65 4.18-12.2 2.4-12.2 2.62s3.1 1.53 10.7 5.22a27 27 0 0 0 11.73 3.15 8 8 0 1 0 0-16z" fill="#07f"/></svg>`;
                          }

                          buttonHtmls.push(`<a href="${safeUrl}" style="background-color:${bgColor};color:${textColor};border: 1px solid ${borderColor};padding:6px 14px;border-radius:4px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;margin:4px 2px;font-weight:bold;" target="_blank" rel="nofollow noopener noreferrer">${iconSvg} ${safeTitle}</a>`);
                          return `<!--BTN_${idx}-->`;
                      });



                    let renderedMd;
                    if (typeof marked === 'undefined') {
                        await loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js');
                    }
                    renderedMd = marked.parse(processedMd, { breaks: true, gfm: true });
                    renderedMd = renderedMd.replace(/<!--BTN_(\d+)-->/g, (_, idx) => buttonHtmls[idx] || '');
                    renderedMd = renderedMd.replace(/<!--MERMAID_(\d+)-->/g, (_, idx) => `<div class="mermaid">${mermaidBlocks[idx] || ''}</div>`);
                    renderedMd = renderedMd.replace(/src="(mds\/media\/[^"]+)"/g, (_, p) => `src="${DB_URL}/${p}"`);
                    renderedMd = renderedMd.replace(/<p>((?:\s*<img[^>]*>(?:\s*<a[^>]*>)?(?:\s*<\/a>)?\s*)+)<\/p>/g, (_, content) => {
                        const count = (content.match(/<img\s/g) || []).length;
                        return count >= 2 ? `<div class="image-row">${content}</div>` : `<p>${content}</p>`;
                    });

                    const hasDownload = safeLink && safeLink !== '#';
                    let btnLabel = 'Sitio oficial';
                    let btnBg = '#d24500';
                    let btnSvg = '';
                    let btnIconClass = '';

                    if (hasDownload) {
                        let resolvedLink = link;
                        if (!resolvedLink.startsWith('http://') && !resolvedLink.startsWith('https://')) {
                            try { resolvedLink = await decryptEnlace(link) || link; } catch {}
                        }
                        if (resolvedLink.includes('mediafire.com')) {
                            btnLabel = 'Descargar desde MediaFire';
                            btnBg = '#07f';
                            btnBorder = 'none';
                            btnSvg = `<svg viewBox="-6.8887712 -3.69853465 81.96659882 46.80035628" xmlns="http://www.w3.org/2000/svg"><path d="m20.7 8.3a51.47 51.47 0 0 1 9.34 1c2.9.55 5.85 1.56 8.83 1.55 2.28 0 4.12-1.6 4.1-3.53s-1.85-3.57-4.17-3.56a13.35 13.35 0 0 0 -3.9.65c.33-.23.66-.47 1-.68a26.14 26.14 0 0 1 15.1-3.68c5.6.26 11.46 2 15.8 5.72a19.9 19.9 0 0 1 6.62 17.82 19.75 19.75 0 0 1 -12.17 15.07 24 24 0 0 1 -14.45.52c-6.2-1.58-11.64-5-17.48-7.54a46.86 46.86 0 0 0 -10.57-2.68h.05a9 9 0 0 0 4.1-.7c1.74-.83 1.73-2.83.83-4.3-1.07-1.73-3.23-2.44-5.1-3a24.36 24.36 0 0 0 -10-.48 15.06 15.06 0 0 0 -6.83 2.52 5.67 5.67 0 0 0 -1.8 2.2c3.08-8.53 9.2-7.57 13-9.9a2.16 2.16 0 0 0 -1.57-3.94 7.24 7.24 0 0 0 -2.92 1.46l-.85.65s3.04-5.17 13.04-5.17z" fill="#fff"/><path d="m23.64 23.78.06.06zm32.46-10.73c-4.08 0-5.76 2.57-10.18 5-7.65 4.18-12.2 2.4-12.2 2.62s3.1 1.53 10.7 5.22a27 27 0 0 0 11.73 3.15 8 8 0 1 0 0-16z" fill="#07f"/></svg>`;
                        } else if (resolvedLink.includes('github.com')) {
                            btnLabel = 'Descargar desde GitHub';
                            btnBg = '#000';
                            btnBorder = '1px solid #fff';
                            btnSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="24" height="24" style="vertical-align: middle; margin-right: 8px;"><path fill="white" d="M280.5 426.5C214.5 418.5 168 371 168 309.5C168 284.5 177 257.5 192 239.5C185.5 223 186.5 188 194 173.5C214 171 241 181.5 257 196C276 190 296 187 320.5 187C345 187 365 190 383 195.5C398.5 181.5 426 171 446 173.5C453 187 454 222 447.5 239C463.5 258 472 283.5 472 309.5C472 371 425.5 417.5 358.5 426C375.5 437 387 461 387 488.5L387 540.5C387 555.5 399.5 564 414.5 558C505 523.5 576 433 576 321C576 179.5 461 64 319.5 64C178 64 64 179.5 64 321C64 432 134.5 524 229.5 558.5C243 563.5 256 554.5 256 541L256 501C249 504 240 506 232 506C199 506 179.5 488 165.5 454.5C160 441 154 433 142.5 431.5C136.5 431 134.5 428.5 134.5 425.5C134.5 419.5 144.5 415 154.5 415C169 415 181.5 424 194.5 442.5C204.5 457 215 463.5 227.5 463.5C240 463.5 248 459 259.5 447.5C268 439 274.5 431.5 280.5 426.5z"/></svg>`;
                        } else {
                            btnBorder = 'none';
                            btnSvg = _faLoaded
                            ? ''
                            : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320zM188.7 308.7L292.7 204.7C297.3 200.1 304.2 198.8 310.1 201.2C316 203.6 320 209.5 320 216L320 272L416 272C433.7 272 448 286.3 448 304L448 336C448 353.7 433.7 368 416 368L320 368L320 424C320 430.5 316.1 436.3 310.1 438.8C304.1 441.3 297.2 439.9 292.7 435.3L188.7 331.3C182.5 325.1 182.5 314.9 188.7 308.7z"/></svg>';
                            }

                    }
                    const btnIcon = '';
                     const downloadButton = hasDownload
                     ? `<button type="button" class="btn-download" onclick="handleDownload(event,'${safeLink}')" style="background:${btnBg}; border:${btnBorder}">${btnSvg}${btnIcon} ${btnLabel}</button>`
                     : '';


                      const info = (item.info || '').trim();
                      const safeInfo = escapeHtml(info);
                      const verifiedBadge = item.verified 
                         ? `<div class="verified-badge">
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M320 576C178.6 576 64 461.4 64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576zM438 209.7C427.3 201.9 412.3 204.3 404.5 215L285.1 379.2L233 327.1C223.6 317.7 208.4 317.7 199.1 327.1C189.8 336.5 189.7 351.7 199.1 361L271.1 433C276.1 438 282.9 440.5 289.9 440C296.9 439.5 303.3 435.9 307.4 430.2L443.3 243.2C451.1 232.5 448.7 217.5 438 209.7z"/></svg>
                                <span>Probado</span>
                            </div>` 
                         : '';

                      const infoSection = info 
                         ? `<div class="desc-body">${safeInfo}</div>`
                         : '';

                      const _reqSvgs = {
                        os: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M128 96C92.7 96 64 124.7 64 160L64 416C64 451.3 92.7 480 128 480L272 480L256 528L184 528C170.7 528 160 538.7 160 552C160 565.3 170.7 576 184 576L456 576C469.3 576 480 565.3 480 552C480 538.7 469.3 528 456 528L384 528L368 480L512 480C547.3 480 576 451.3 576 416L576 160C576 124.7 547.3 96 512 96L128 96zM160 160L480 160C497.7 160 512 174.3 512 192L512 352C512 369.7 497.7 384 480 384L160 384C142.3 384 128 369.7 128 352L128 192C128 174.3 142.3 160 160 160z"/></svg>',
                        cpu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M240 88C240 74.7 229.3 64 216 64C202.7 64 192 74.7 192 88L192 128C156.7 128 128 156.7 128 192L88 192C74.7 192 64 202.7 64 216C64 229.3 74.7 240 88 240L128 240L128 296L88 296C74.7 296 64 306.7 64 320C64 333.3 74.7 344 88 344L128 344L128 400L88 400C74.7 400 64 410.7 64 424C64 437.3 74.7 448 88 448L128 448C128 483.3 156.7 512 192 512L192 552C192 565.3 202.7 576 216 576C229.3 576 240 565.3 240 552L240 512L296 512L296 552C296 565.3 306.7 576 320 576C333.3 576 344 565.3 344 552L344 512L400 512L400 552C400 565.3 410.7 576 424 576C437.3 576 448 565.3 448 552L448 512C483.3 512 512 483.3 512 448L552 448C565.3 448 576 437.3 576 424C576 410.7 565.3 400 552 400L512 400L512 344L552 344C565.3 344 576 333.3 576 320C576 306.7 565.3 296 552 296L512 296L512 240L552 240C565.3 240 576 229.3 576 216C576 202.7 565.3 192 552 192L512 192C512 156.7 483.3 128 448 128L448 88C448 74.7 437.3 64 424 64C410.7 64 400 74.7 400 88L400 128L344 128L344 88C344 74.7 333.3 64 320 64C306.7 64 296 74.7 296 88L296 128L240 128L240 88zM224 192L416 192C433.7 192 448 206.3 448 224L448 416C448 433.7 433.7 448 416 448L224 448C206.3 448 192 433.7 192 416L192 224C192 206.3 206.3 192 224 192zM240 240L240 400L400 400L400 240L240 240z"/></svg>',
                        ram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M128 128C92.7 128 64 156.7 64 192L64 199.4C64 206.2 68.4 212 74.1 215.7C87.3 224.3 96 239.1 96 256C96 272.9 87.3 287.7 74.1 296.3C68.4 300 64 305.8 64 312.6L64 368L576 368L576 312.6C576 305.8 571.6 300 565.9 296.3C552.7 287.7 544 272.9 544 256C544 239.1 552.7 224.3 565.9 215.7C571.6 212 576 206.2 576 199.4L576 192C576 156.7 547.3 128 512 128L128 128zM576 480L576 416L64 416L64 480C64 497.7 78.3 512 96 512L160 512L160 488C160 474.7 170.7 464 184 464C197.3 464 208 474.7 208 488L208 512L296 512L296 488C296 474.7 306.7 464 320 464C333.3 464 344 474.7 344 488L344 512L432 512L432 488C432 474.7 442.7 464 456 464C469.3 464 480 474.7 480 488L480 512L544 512C561.7 512 576 497.7 576 480zM224 224L224 288C224 305.7 209.7 320 192 320C174.3 320 160 305.7 160 288L160 224C160 206.3 174.3 192 192 192C209.7 192 224 206.3 224 224zM352 224L352 288C352 305.7 337.7 320 320 320C302.3 320 288 305.7 288 288L288 224C288 206.3 302.3 192 320 192C337.7 192 352 206.3 352 224zM480 224L480 288C480 305.7 465.7 320 448 320C430.3 320 416 305.7 416 288L416 224C416 206.3 430.3 192 448 192C465.7 192 480 206.3 480 224z"/></svg>',
                        gpu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M512 160L512 416L128 416L128 160L512 160zM128 96C92.7 96 64 124.7 64 160L64 416C64 451.3 92.7 480 128 480L272 480L256 528L184 528C170.7 528 160 538.7 160 552C160 565.3 170.7 576 184 576L456 576C469.3 576 480 565.3 480 552C480 538.7 469.3 528 456 528L384 528L368 480L512 480C547.3 480 576 451.3 576 416L576 160C576 124.7 547.3 96 512 96L128 96z"/></svg>',
                        spc: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="currentColor" d="M160 96C124.7 96 96 124.7 96 160L96 324.1C114.1 311.4 136.2 304 160 304L480 304C503.8 304 525.9 311.4 544 324.1L544 160C544 124.7 515.3 96 480 96L160 96zM544 416C544 380.7 515.3 352 480 352L160 352C124.7 352 96 380.7 96 416L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 416zM320 448C320 430.3 334.3 416 352 416C369.7 416 384 430.3 384 448C384 465.7 369.7 480 352 480C334.3 480 320 465.7 320 448zM448 416C465.7 416 480 430.3 480 448C480 465.7 465.7 480 448 480C430.3 480 416 465.7 416 448C416 430.3 430.3 416 448 416z"/></svg>'
                      };
                      const _reqLabels = { os: 'Sistema', cpu: 'Procesador', ram: 'RAM', gpu: 'Gráficos', spc: 'Disco' };
                      const reqSection = item.minRequirements ? `
                        <div class="req-section">
                          <div class="req-title">Requisitos Mínimos</div>
                          <div class="req-grid">
                            ${Object.entries(item.minRequirements).map(([k, v]) => `
                              <div class="req-item">
                                <span class="req-icon">${_reqSvgs[k] || ''}</span>
                                <span class="req-label">${_reqLabels[k] || k}</span>
                                <span class="req-value">${escapeHtml(v)}</span>
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      ` : '';

                     container.innerHTML = `
                     <div class="desc-header">
                         <img src="${iconUrl}" alt="${escapeHtml(item.name || '')}" onerror="this.style.display='none'">
                         <div class="title-group">
                             <h1>${escapeHtml(item.name || '')}</h1>
                             ${verifiedBadge}
                         </div>
                     </div>
                     ${infoSection}
                     ${reqSection}
                     ${downloadButton}
                     <div class="desc-md-content">${renderedMd}</div>
                     `;
                    container.classList.remove('pop-in');
                    void container.offsetWidth;
                    container.classList.add('pop-in');

                    if (mermaidBlocks.length > 0) {
                        if (typeof mermaid === 'undefined') {
                            await loadScript('https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js');
                            mermaid.initialize({ startOnLoad: false });
                        }
                        mermaid.run({ nodes: [container.querySelector('.desc-md-content')] });
                    }
                } catch (e) {
                    console.error('Error loading description:', e);
                    container.innerHTML = '<div class="error-banner"><h2>Error</h2><p>No se pudo cargar la descripción.</p></div>';
                    container.classList.remove('pop-in');
                    void container.offsetWidth;
                    container.classList.add('pop-in');
                }
            }

            function closeDescription() {
                const url = new URL(window.location.href);
                url.searchParams.delete('item');
                window.history.replaceState({}, '', url);

                const overlay = document.getElementById('description-overlay');
                const container = document.getElementById('desc-container');
                container.classList.remove('pop-in');
                container.classList.add('pop-out');
                setTimeout(() => {
                    overlay.style.display = 'none';
                    container.innerHTML = '';
                    container.classList.remove('pop-out');
                    document.body.classList.remove('no-scroll');
                }, 150);
            }

            async function handleDownload(e, enlace) {
                e.preventDefault();
                if (!enlace || enlace === '#') return;
                if (enlace.startsWith('http://') || enlace.startsWith('https://')) {
                    window.open(enlace, '_blank');
                    return;
                }
                const decrypted = await decryptEnlace(enlace);
                if (decrypted) {
                    window.open(decrypted, '_blank');
                } else {
                    showToast('Error al desencriptar el enlace', 'error');
                }
            }

            function showToast(msg, type) {
                const container = document.getElementById('notification-container');
                if (!container) return;
                const div = document.createElement('div');
                div.className = `notification ${type === 'error' ? 'info' : 'success'}`;
                div.innerHTML = `<strong>${msg}</strong>`;
                container.appendChild(div);
                setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.5s'; setTimeout(() => div.remove(), 500); }, 4000);
            }

            async function setupNotifications() {
                try {
                    const response = await fetch(`${DB_URL}/notifications.json`);
                    if (!response.ok) return;
                    const data = await response.json();
                    allNotifications = data.notifications || [];

                    const isNewUser = !localStorage.getItem('fw_visited');
                    localStorage.setItem('fw_visited', '1');

                    const seenNotifs = JSON.parse(localStorage.getItem('seen_notifications') || '[]');
                    const activeNotifs = getActiveNotifications();
                    const newNotifs = activeNotifs.filter(n =>
                    !seenNotifs.includes(n.id) &&
                    (isNewUser ? n.forNewUsers : n.forOldUsers)
                    );

                    newNotifs.forEach((notif, index) => {
                        setTimeout(() => {
                            showNotification(notif);
                            markAsSeen(notif.id);
                        }, index * 3000);
                    });
                    updateNotificationBadge();
                } catch (e) {
                    console.error('Error loading notifications:', e);
                }
            }

            function getActiveNotifications() {
                const deletedNotifs = JSON.parse(localStorage.getItem('deleted_notifications') || '[]');
                return allNotifications.filter(n => !deletedNotifs.includes(n.id));
            }

            function updateNotificationBadge() {
                const badge = document.getElementById('notif-badge');
                if (!badge) return;
                const count = getActiveNotifications().length;
                if (count === 0) {
                    badge.style.display = 'none';
                } else {
                    badge.style.display = 'flex';
                    badge.textContent = count > 9 ? '+9' : count;
                }
            }

            function markAsSeen(id) {
                const seenNotifs = JSON.parse(localStorage.getItem('seen_notifications') || '[]');
                if (!seenNotifs.includes(id)) {
                    seenNotifs.push(id);
                    localStorage.setItem('seen_notifications', JSON.stringify(seenNotifs));
                }
            }

            function showNotification(notif) {
                const container = document.getElementById('notification-container');
                if (!container) return;
                const div = document.createElement('div');
                div.className = `notification ${notif.type}`;
                div.innerHTML = `<strong>${escapeHtml(notif.title)}</strong><br>${escapeHtml(notif.message)}`;
                container.appendChild(div);
                setTimeout(() => {
                    div.style.opacity = '0';
                    div.style.transition = 'opacity 0.5s';
                    setTimeout(() => div.remove(), 500);
                }, 5000);
            }

            function openNotificationsModal() {
                const modal = document.getElementById('notifications-modal');
                const content = modal.querySelector('.notifications-modal-content');
                const list = document.getElementById('notif-list');
                modal.style.display = 'flex';
                content.classList.remove('pop-in');
                void content.offsetWidth;
                content.classList.add('pop-in');
                list.innerHTML = '';

                const activeNotifs = getActiveNotifications();

            const clearBtn = document.getElementById('clear-all-btn');

            if (activeNotifs.length === 0) {
                clearBtn.disabled = true;
                list.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 20px;color:#666;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="64" height="64" style="color:#4CAF50;"><path fill="currentColor" d="M320 576C178.6 576 64 461.4 64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576zM438 209.7C427.3 201.9 412.3 204.3 404.5 215L285.1 379.2L233 327.1C223.6 317.7 208.4 317.7 199.1 327.1C189.8 336.5 189.7 351.7 199.1 361L271.1 433C276.1 438 282.9 440.5 289.9 440C296.9 439.5 303.3 435.9 307.4 430.2L443.3 243.2C451.1 232.5 448.7 217.5 438 209.7z"/></svg>
                        <span style="font-size:16px;font-weight:500;text-align:center;">¡Estas al dia! No hay nada aqui.</span>
                    </div>
                `;
                return;
            }

            clearBtn.disabled = false;

            activeNotifs.forEach(notif => {
                    const item = document.createElement('div');
                    item.className = 'notif-item';
                    item.innerHTML = `
                    <button class="btn-del" onclick="deleteNotification('${notif.id}')" aria-label="Eliminar notificación">&times;</button>
                    <span class="notif-title">${escapeHtml(notif.title)}</span>
                    <span class="notif-msg">${escapeHtml(notif.message)}</span>
                    <span class="notif-date">${new Date(notif.date).toLocaleString()}</span>
                    `;
                    list.appendChild(item);
                });
            }

            function closeNotificationsModal() {
                const modal = document.getElementById('notifications-modal');
                const content = modal.querySelector('.notifications-modal-content');
                content.classList.remove('pop-in');
                content.classList.add('pop-out');
                setTimeout(() => {
                    modal.style.display = 'none';
                    content.classList.remove('pop-out');
                }, 150);
            }

            function deleteNotification(id) {
                const deletedNotifs = JSON.parse(localStorage.getItem('deleted_notifications') || '[]');
                if (!deletedNotifs.includes(id)) {
                    deletedNotifs.push(id);
                    localStorage.setItem('deleted_notifications', JSON.stringify(deletedNotifs));
                }
                openNotificationsModal();
                updateNotificationBadge();
            }

            function clearAllNotifications() {
                const allIds = allNotifications.map(n => n.id);
                localStorage.setItem('deleted_notifications', JSON.stringify(allIds));
                openNotificationsModal();
                updateNotificationBadge();
            }

            window.addEventListener('scroll', updateFloatingButtons, { passive: true });



            document.addEventListener('DOMContentLoaded', init);

            let _faLoaded = false;
            function detectFa() {
                const test = document.createElement('i');
                test.className = '';
                test.style.cssText = 'position:absolute;visibility:hidden';
                document.body.appendChild(test);
                const font = getComputedStyle(test).fontFamily;
                document.body.removeChild(test);
                _faLoaded = font.includes('FontAwesome') || font.includes('Font Awesome');
            }
            if (document.readyState === 'complete') detectFa();
            else window.addEventListener('load', detectFa);

            function upgradeBackToTopIcon() {
                const btn = document.getElementById('back-to-top');
                if (!btn) return;
                if (_faLoaded) {
                    btn.innerHTML = '';
                }
            }
            if (document.readyState === 'complete') upgradeBackToTopIcon();
            else window.addEventListener('load', upgradeBackToTopIcon);
