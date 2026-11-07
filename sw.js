/* Foxinix — service worker (W4): shell offline + stale-while-revalidate.
   - Precachea el shell (HTML + JS + CSS) en install.
   - GET same-origin: red al instante si hay copia + refresco en segundo
     plano (sin versionados manuales: cada visita actualiza la caché).
   - /api/* NUNCA se cachea (auth por token y mensajes en vivo).
   - W15: /media/* va cache-first SIN refresco y con clave = ruta sin la
     firma (que rota en cada respuesta de la API); el slug del fname es
     aleatorio por subida → el contenido de una ruta nunca cambia.
   Firefox 78 (Mypal) lo soporta; en orígenes http no seguros el registro
   falla en main.js y la app sigue funcionando sin SW. */
const SHELL_CACHE = 'foxinix-shell-v133';  // v133 (W96): fallback ignoreSearch al cachear shell con URLs ?v=BUILD_ID; v132 (W95): primera visita siembra fm.appVersion en silencio; v131 (W94): barra de versión + snooze modal APK
/* Los emojis Twemoji/Noto viven en su PROPIO caché: cambiar la versión
   del shell ya no obliga a volver a descargar cientos de SVG. */
const EMOJI_CACHE = 'foxinix-emoji-v1';
/* W50: el caché de medios y las descargas explícitas viven en cachés
   SEPARADAS del shell. Así una actualización de la app no borra los
   archivos ya vistos/descargados. El de medios se poda por tamaño; el de
   descargas explícitas (foxinix-downloads-v1, lo maneja downloads.js)
   no se poda automáticamente. */
const MEDIA_CACHE = 'foxinix-media-v1';
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;   // 512 MB
const MAX_MEDIA_ENTRIES = 500;
const SHELL = [
  '/',
  '/theme.js',           // tema de la portada antes del 1º pintado (data-theme)
  '/manifest.webmanifest',
  '/static/icon.svg',
  '/static/logo.svg',
  '/static/css/app.css',
  '/static/vendor/vue.global.prod.js',
  '/static/js/boot.js',       // W14: tema/pre-paint sin <script> inline (CSP)
  '/static/js/theme-detect.js',  // W70: en index.html; sin precachear se caía en la PWA offline
  '/static/js/main.js',
  '/static/js/store.js',
  '/static/js/i18n.js',
  '/static/js/api.js',
  '/static/js/actions.js',
  '/static/js/mediadl.js',    // W15: descarga con anillo de progreso
  '/static/js/downloads.js',  // W50: descargas persistentes (Cache + IndexedDB)
  '/static/js/realtime.js',
  '/static/js/call.js',       // W28h: señalización y ciclo de llamadas WebRTC
  '/static/js/tones.js',      // W63: catálogo y reproducción de tonos
  '/static/js/emoji.js',      // W13: selector de emoji completo
  '/static/js/views/auth.js',
  '/static/js/views/chat.js',
  '/static/js/views/bootscreen.js',  // W38: pantalla de arranque compartida
];

/* W36a/W40: precarga en background desde el manifiesto estático (se
   queda en la caché para SIEMPRE — cache-first, sin revalidar).
   W40: se PARTIÓ en dos lotes con su marcador cada uno:
   - GIFs de UI (/static/gifs/): siempre, en activate (son del shell).
   - SVG de emoji (/static/emoji/): SOLO si el cliente avisó estilo
     'twemoji' (emoPref, message más abajo); con 'system' no se
     descarga NADA de emoji y con 'noto' el lote lo baja el cliente
     en idle (prefetchEmojis). Corre en segundo plano: la instalación
     no puede esperar 1746 archivos o el SW tarda >8 s en activarse
     (w4). Los fallos individuales (p. ej. corta red) no rompen nada:
     lo que falte se descarga al primer uso. */
let emoPref = 'system';
function manifestAssets() {
  return fetch('/static/emoji-manifest.json').then(function (r) {
    if (!r.ok) throw new Error('manifest');
    return r.json();
  }).then(function (j) {
    return (j && j.assets) || [];
  });   /* sin catch: si falla el manifiesto NO se escribe el marcador
           y el próximo despertar del SW reintenta */
}

/* W36fix: 4 en paralelo + pausa entre tandas (no saturar el pool de
   conexiones: /api/* corre en paralelo) y c.match() ANTES de bajar:
   un SW cortado (navegador cerrado) REANUDA en vez de re-descargar
   todo; lo que falte se baja al primer uso. Escribe `marker` al
   terminar la lista. */
function precacheList(c, urls, marker) {
  let i = 0;
  const next = function () {
    const chunk = urls.slice(i, i + 4);
    i += chunk.length;
    if (!chunk.length) return c.put(marker, new Response('1'));
    return Promise.all(chunk.map(function (u) {
      return c.match(u).then(function (hit) {
        if (hit) return null;
        return fetch(u).then(function (r4) {
          if (r4 && r4.ok) return c.put(u, r4);
        }).catch(function () {});
      });
    })).then(function () {
      return new Promise(function (res) { setTimeout(res, 100); });
    }).then(next);
  };
  return next();
}

/* W36fix: una sola tanda a la vez por lote; el marcador en la caché
   dice que terminó (los fallos individuales ya se toleran arriba). */
const EXTRAS_DONE = '/static/.emoji-precache-done';   // GIFs de UI
const EMO_DONE = '/static/.emoji-twemoji-precache-done';  // SVGs twemoji
let extrasRunning = false;
let extrasDone = false;
let emoRunning = false;
let emoDone = false;
function maybeExtras(c) {
  if (extrasRunning || extrasDone) return;
  extrasRunning = true;
  c.match(EXTRAS_DONE).then(function (hit) {
    if (hit) { extrasDone = true; return null; }
    return manifestAssets().then(function (assets) {
      const gifs = assets.filter(function (u) {
        return u.indexOf('/static/emoji/') !== 0;
      });
      return precacheList(c, gifs, EXTRAS_DONE);
    }).then(function () { extrasDone = true; });
  }).catch(function () {}).then(function () { extrasRunning = false; });
}
function maybeEmo(c) {
  if (emoPref !== 'twemoji' || emoRunning || emoDone) return;
  emoRunning = true;
  c.match(EMO_DONE).then(function (hit) {
    if (hit) { emoDone = true; return null; }
    return manifestAssets().then(function (assets) {
      const svgs = assets.filter(function (u) {
        return u.indexOf('/static/emoji/') === 0;
      });
      return precacheList(c, svgs, EMO_DONE);
    }).then(function () { emoDone = true; });
  }).catch(function () {}).then(function () { emoRunning = false; });
}

self.addEventListener('install', function (e) {
  /* Sólo el shell: la activación es inmediata (la precarga de emojis
     arranca al terminar activate, sin bloquear). */
  e.waitUntil(
    caches.open(SHELL_CACHE)
      /* W50: `reload` evita que el HTTP cache del navegador meta JS/CSS
         viejos en el shell nuevo justo después de un despliegue.
         addAll falla si UN recurso falla; usamos Promise.all con catch
         individual para que un 404 o caída de red no bloquee el SW nuevo. */
      .then(function (c) {
        return Promise.all(SHELL.map(function (u) {
          return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/* W50: antes de borrar los shell viejos, mover sus /media/* al caché
   persistente. Sin esto, la primera actualización a v81 perdería todo lo
   ya descargado por los clientes que venían de v80. */
async function migrateMedia() {
  let names = [];
  try { names = await caches.keys(); } catch (e) { return; }
  const oldShells = names.filter(function (k) {
    return k.indexOf('foxinix-shell-') === 0 && k !== SHELL_CACHE;
  });
  if (!oldShells.length) return;
  const dest = await caches.open(MEDIA_CACHE);
  for (let i = 0; i < oldShells.length; i++) {
    const src = await caches.open(oldShells[i]);
    const keys = await src.keys();
    for (let j = 0; j < keys.length; j++) {
      const req = keys[j];
      let path = '';
      try { path = new URL(req.url).pathname; } catch (e) { continue; }
      if (path.indexOf('/media/') !== 0) continue;
      try {
        const hit = await src.match(req);
        if (hit && !(await dest.match(req))) await dest.put(req, hit);
      } catch (e) {}
    }
  }
  /* Por si la migración trae más de lo permitido. */
  try { await trimMedia(dest); } catch (e) {}
}

self.addEventListener('activate', function (e) {
  e.waitUntil(
    migrateMedia()
      .then(function () { return caches.keys(); })
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          /* Sólo borrar shells viejos; media y downloads se conservan. */
          return (k.indexOf('foxinix-shell-') === 0 && k !== SHELL_CACHE)
            ? caches.delete(k) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
  /* W36a: los GIFs de UI se precargan solos tras la activación (más
     abajo, maybeExtras); NO va en waitUntil (bloquearía la activación);
     si el SW se duerme a mitad, el fetch de abajo la reanuda con
     c.match(). W40: los SVG de emoji NO arrancan solos — esperan a que
     un cliente avise su estilo 'twemoji' (message). */
  caches.open(SHELL_CACHE).then(maybeExtras);
});

/* W40: el cliente avisa su estilo de emojis al conectar (y al cambiarlo
   en Ajustes); con 'twemoji' se (re)anuda la precarga del lote SVG. */
self.addEventListener('message', function (e) {
  const d = e.data || {};
  if (d.type !== 'emo-style') return;
  emoPref = d.style || 'system';
  if (emoPref === 'twemoji') caches.open(EMOJI_CACHE).then(maybeEmo);
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // externos: directo
  if (url.pathname.indexOf('/api/') === 0) return;      // API: siempre red
  /* W87: tonos de sonido (/tonos/…) van directo a la red: <audio> pide
     con Range (206), que Cache.put no acepta, y no son parte del shell. */
  if (url.pathname.indexOf('/tonos/') === 0) return;

  /* W36fix/W40: despertar del SW → reanudar la precarga si quedó a
     medias (los GIFs de UI siempre; los SVG de emoji solo con estilo
     twemoji; una tanda a la vez; el marcador dice si ya terminó). */
  if (!extrasDone && !extrasRunning) caches.open(SHELL_CACHE).then(maybeExtras);
  if (emoPref === 'twemoji' && !emoDone && !emoRunning) {
    caches.open(EMOJI_CACHE).then(maybeEmo);
  }

  /* W15/W50: media cache-first por RUTA (la firma `?exp&sig` rota en
     cada respuesta de la API, pero el slug del fname es único e inmutable).
     La miniatura (?thumb=1) se cachea aparte para no pisar el original.
     El caché de medios es independiente del shell y sobrevive a las
     actualizaciones. X-Fox-Download = descarga explícita: la guarda
     downloads.js en foxinix-downloads-v1, no la dupliques acá. */
  const isMedia = url.pathname.indexOf('/media/') === 0;
  if (isMedia) {
    /* W51/W53: el derivado compatible (?fmt=mp4/mp3/ogg/wav) se cachea
       aparte del original: si no, un cliente que primero guardó el
       WebM recibiría ese WebM aunque pidiera el respaldo. */
    const fmt = url.searchParams.get('fmt');
    const key = url.pathname +
      (url.search.indexOf('thumb=') >= 0 ? '?thumb' : (fmt ? '?fmt=' + fmt : ''));
    const explicit = req.headers.get('x-fox-download') === '1';
    e.respondWith(
      caches.open(MEDIA_CACHE).then(async function (c) {
        const hit = await c.match(key);
        if (hit) return hit;
        const res = await fetch(req).catch(function () { return null; });
        if (!explicit && res && res.status === 200 &&
            res.type === 'basic' && !req.headers.has('range')) {
          c.put(key, res.clone()).then(function () { queueTrim(c); });
        }
        return res || new Response('Sin conexión', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
    );
    return;
  }

  /* W30b/W40: los SVG/PNG de emojis son inmutables (self-hosted, sin
     query) → cache-first SIN revalidar. El genérico de abajo (SWR)
     re-pedía un SVG ya cacheado en CADA apertura del panel y
     saturaba la red con "demasiadas solicitudes"; aquí solo se va a
     la red la 1.ª vez. Cubre Twemoji (/static/emoji/) y Google Noto
     (/static/emoji-noto/). */
  const isEmoji = url.pathname.indexOf('/static/emoji/') === 0 ||
    url.pathname.indexOf('/static/emoji-noto/') === 0;
  if (isEmoji) {
    e.respondWith(
      caches.open(EMOJI_CACHE).then(async function (c) {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req).catch(function () { return null; });
        if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
        return res || new Response('Sin conexión', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.open(SHELL_CACHE).then(async function (c) {
      /* W79: RED PRIMERO. Antes el shell se servía desde la caché y
         sólo se refrescaba en segundo plano (stale-while-revalidate):
         el navegador cargaba el bundle viejo —el que no tenía
         openGroupProfile— y la app se rompía al entrar. Ahora, si hay
         red, va siempre a la red; la caché queda sólo para el modo
         offline. */
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
        return res;
      } catch (err) {
        let hit = await c.match(req);
        /* W96: las URLs del shell llevan ?v=<build>. Si esa URL exacta
           aún no está cacheada (p. ej. primera visita y sin red), se
           sirve la copia SIN query del precache (ignoreSearch) en vez de
           fallar: el contenido es el mismo archivo, solo cambia el
           versionado. */
        if (!hit) hit = await c.match(req, { ignoreSearch: true });
        /* W22: las rutas reales (/app/user/5) no están en la caché como
           documentos; el shell cacheado de '/' sirve de base offline. */
        if (!hit && req.mode === 'navigate') hit = await c.match('/');
        if (hit) return hit;
        return new Response('Sin conexión', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })
  );
});

/* W15/W50: poda el caché de medios por tamaño y cantidad. Las descargas
   explícitas viven en otro caché y no se tocan. Cache.keys() suele venir
   en orden de inserción: se van borrando las más viejas primero. */
let trimRunning = false;
function queueTrim(c) {
  if (trimRunning) return;
  trimRunning = true;
  trimMedia(c).catch(function () {}).then(function () { trimRunning = false; });
}

async function trimMedia(c) {
  const keys = await c.keys();
  const media = [];
  let total = 0;
  for (let i = 0; i < keys.length; i++) {
    const req = keys[i];
    let path = '';
    try { path = new URL(req.url).pathname; } catch (e) { continue; }
    if (path.indexOf('/media/') !== 0) continue;
    const res = await c.match(req);
    if (!res) continue;
    let size = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    if (!size) {
      try { size = (await res.clone().blob()).size; } catch (e) { size = 0; }
    }
    media.push({ req: req, size: size });
    total += size;
  }
  let count = media.length;
  for (let i = 0; i < media.length; i++) {
    if (total <= MAX_MEDIA_BYTES && count <= MAX_MEDIA_ENTRIES) break;
    await c.delete(media[i].req);
    total -= media[i].size;
    count--;
  }
}
