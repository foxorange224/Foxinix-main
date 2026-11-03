/* W15: descarga de medios con anillo de progreso, cancelación y reintento.

   El template solo pone la clase `mframe` en el contenedor y usa `v-dl="url"`
   en el <img>/<video>/<audio>. El directorivo:
     1. si el archivo ya se bajó en esta sesión (caché por RUTA, sin la
        firma que rota en cada respuesta de la API) lo aplica al instante;
     2. si no, difumina la miniatura (?thumb=1) en imágenes, baja el archivo
        con XHR (progreso real: loaded/total) y pinta un anillo; ✕ cancela y
        si falla el ✕ se convierte en ↻ de reintento.
   Para archivos sueltos está startDownload(): mismo flujo, guarda los
   bytes en los datos de la app Y deja una copia en el dispositivo
   (Descargas del navegador en PC; en Android avisa "Descargando archivo"
   y guarda en Downloads/Foxinix).

   Sin dependencias. FF78: XHR + Blob + IntersectionObserver (todo disponible). */
import { t } from './i18n.js';
import { toast } from './store.js';
import {
  getDownloadBlob, saveDownload, requestPersistence,
  fetchBlob, saveBlobToDevice, saveBlobToDisk, androidBridge,
  dlCategory, dlTypeInfo,
} from './downloads.js';

const RING = 132;                 // circunferencia del círculo (r=21, igual que subidas)
const blobs = new Map();          // ruta (sin query) → objectURL de la sesión
const rawBlobs = new Map();       // objectURL → Blob (para decodificar sin fetch)
const prefetching = {};           // ruta → XHR de caché en segundo plano
const COMPAT_KEY = 'fm.mc.';      // W51: MIME → "1" si ya falló el original
/* W53: clave propia para no confundir un Ogg/Opus original (que Mypal
   puede no decodificar) con el Ogg/Vorbis de respaldo (que sí). */
const OGG_FAIL_KEY = 'audio/ogg-vorbis';

function pathKey(url) {
  const i = url.indexOf('?');
  return i < 0 ? url : url.slice(0, i);
}

function baseMime(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

function compatFlag(mime) {
  try { return localStorage.getItem(COMPAT_KEY + baseMime(mime)) === '1'; }
  catch (e) { return false; }
}

/* W51: recuerda que este navegador no pudo con el formato original y
   que el respaldo sí funciona. Se usa en las siguientes aperturas para
   pedir directamente MP4/Ogg/WAV, sin repetir el error visible. */
export function markMediaCompat(mime) {
  try { localStorage.setItem(COMPAT_KEY + baseMime(mime), '1'); } catch (e) {}
}

/* W53: el Ogg/Vorbis de respaldo tampoco se pudo decodificar. La próxima
   vez pedimos WAV PCM directamente (decodificador interno de Firefox). */
export function markOggBroken() {
  try { localStorage.setItem(COMPAT_KEY + OGG_FAIL_KEY, '1'); } catch (e) {}
}

export function forgetCached(url) {
  const k = pathKey(url);
  const obj = blobs.get(k);
  blobs.delete(k);
  if (obj) {
    rawBlobs.delete(obj);
    try { URL.revokeObjectURL(obj); } catch (e) {}
  }
}

/* Al cerrar sesión hay que soltar los blobs de la cuenta anterior: sin
   esto el límite de 200 entradas no acota la memoria real y la próxima
   cuenta puede seguir viendo objectURLs de la anterior. */
export function clearMediaBlobs() {
  /* Abortar también las descargas silenciosas en vuelo: si terminan
     después del logout, volverían a llenar la caché con media de la
     cuenta anterior. */
  for (const k in prefetching) {
    const xhr = prefetching[k];
    delete prefetching[k];
    try { xhr.abort(); } catch (e) {}
  }
  blobs.forEach(function (obj) {
    try { URL.revokeObjectURL(obj); } catch (e) {}
  });
  blobs.clear();
  rawBlobs.clear();
}

function canPlay(tag, type) {
  try {
    const el = document.createElement(tag === 'VIDEO' ? 'video' : 'audio');
    return !!el.canPlayType(type);
  } catch (e) { return false; }
}

/* W53: Ogg Vorbis es el primer respaldo de audio en Mypal/XP. Se decodifica
   dentro de Firefox (no usa WMF, ausente en XP) y pesa mucho menos que un
   WAV. Si hasta Vorbis falla, WAV PCM es el último recurso garantizado. */
export function audioFallbackFmt() {
  if (!compatFlag(OGG_FAIL_KEY) &&
      (canPlay('AUDIO', 'audio/ogg; codecs="vorbis"') ||
       canPlay('AUDIO', 'audio/ogg'))) return 'ogg';
  return 'wav';
}

/* El server guarda los videos como WebM/VP9+Opus y las notas de voz
   como WebM/Opus (o MP3 desde W51). Mypal 78 en XP anuncia WebM pero a
   veces falla al decodificarlo: si ya falló una vez (flag) o el
   canPlayType real no lo reconoce, pedimos el derivado compatible. */
function needsCompat(el, mime) {
  const m = baseMime(mime);
  if (!m || !el) return '';
  const tag = el.tagName;
  if (tag === 'VIDEO') {
    if (m === 'video/webm' &&
        (compatFlag(m) ||
         (!canPlay('VIDEO', 'video/webm; codecs="vp9, opus"') &&
          !canPlay('VIDEO', 'video/webm; codecs="vp8, opus"') &&
          !canPlay('VIDEO', 'video/webm; codecs="vp8, vorbis"') &&
          !canPlay('VIDEO', 'video/webm')))) return 'mp4';
  } else if (tag === 'AUDIO') {
    /* WAV ya es el último recurso: pedir ?fmt=wav sobre un WAV no ayuda. */
    if (m === 'audio/wav' || m === 'audio/x-wav') return '';
    if (compatFlag(m)) return audioFallbackFmt();
    if (m === 'audio/webm' || m === 'video/webm') {
      if (!canPlay('AUDIO', 'audio/webm; codecs="opus"') &&
          !canPlay('AUDIO', 'audio/webm')) return audioFallbackFmt();
    } else if (m === 'audio/ogg') {
      if (!canPlay('AUDIO', 'audio/ogg; codecs="opus"') &&
          !canPlay('AUDIO', 'audio/ogg')) return audioFallbackFmt();
    } else if (!canPlay('AUDIO', m)) {
      /* MP3/AAC en Mypal dependen de WMF (no existe en XP). canPlayType
         suele devolver '' para audio/mpeg; si miente, el evento error
         de chat.js hace el mismo cambio. */
      return audioFallbackFmt();
    }
  }
  return '';
}

function addFmt(url, fmt) {
  if (!url || url.indexOf('blob:') === 0 || !fmt) return url;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'fmt=' + fmt;
}

/* URL que debe pedir el elemento. Exportada para el fallback por error
   de chat.js (algunos navegadores mienten en canPlayType). Con force=1
   se pide el derivado aunque canPlayType diga que sí: el <audio>/<video>
   ya falló de verdad. forceFmt permite encadenar Ogg → WAV. */
export function compatUrl(url, mime, tag, force, forceFmt) {
  if (!url || url.indexOf('blob:') === 0) return url;
  const fake = { tagName: tag || 'VIDEO' };
  const m = baseMime(mime);
  let fmt = '';
  if (force) {
    if (fake.tagName === 'VIDEO' && m === 'video/webm') fmt = 'mp4';
    else if (fake.tagName === 'AUDIO') {
      if (forceFmt) fmt = forceFmt;
      else if (m === 'audio/wav' || m === 'audio/x-wav') fmt = '';
      else fmt = audioFallbackFmt();
    }
  } else {
    fmt = needsCompat(fake, mime);
  }
  return addFmt(url, fmt);
}

function storeBlob(url, obj, raw) {
  /* W51: si este navegador ya falló con WebM, no dejamos que una
     descarga en segundo plano del original vuelva a pisar el blob
     compatible (MP4/Ogg/WAV) que sí funciona. */
  const mt = raw && raw.type ? baseMime(raw.type) : '';
  if (mt && compatFlag(mt)) return;
  if (mt === 'audio/ogg' && compatFlag(OGG_FAIL_KEY)) return;
  blobs.set(pathKey(url), obj);
  rawBlobs.set(obj, raw);
  if (blobs.size > 200) {                    // poda: no guardamos media infinita en RAM
    const first = blobs.keys().next().value;
    const o = blobs.get(first);
    blobs.delete(first);
    if (o) {
      rawBlobs.delete(o);
      try { URL.revokeObjectURL(o); } catch (e) {}
    }
  }
}

/* W15: el Blob ya descargado, para decodificarlo en memoria (resolveDur de
   las notas de voz viejas) SIN fetch: el blob no viaja por la red ni toca
   el CSP. Acepta la URL firmada original o la objectURL. */
export function getBlob(url) {
  if (!url) return null;
  if (url.indexOf('blob:') === 0) return rawBlobs.get(url) || null;
  const obj = blobs.get(pathKey(url));
  return obj ? (rawBlobs.get(obj) || null) : null;
}

/* URL en blob si el archivo ya se bajó y es reproducible; '' si no. */
export function cachedUrl(url) {
  if (!url) return '';
  const obj = blobs.get(pathKey(url));
  if (!obj) return '';
  const raw = rawBlobs.get(obj);
  const mt = raw && raw.type ? baseMime(raw.type) : '';
  if (mt && compatFlag(mt)) return '';      // WebM ya falló: usar respaldo
  if (mt === 'audio/ogg' && compatFlag(OGG_FAIL_KEY)) return '';
  return obj;
}

/* Miniatura de la misma URL firmada (la firma cubre solo el slug). */
function thumbOf(url) {
  if (url.indexOf('/media/') !== 0 || url.indexOf('thumb=') >= 0) return '';
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'thumb=1';
}

function frameOf(el) {
  return el.closest ? el.closest('.mframe') : null;
}

function setBtnIcon(btn, href, title) {
  const use = btn && btn.querySelector('use');
  if (use) use.setAttribute('href', href);
  if (btn) btn.title = title;
}

/* Overlay estático (anillo + botón) creado UNA vez por marco. */
function ensureOverlay(frame) {
  let ov = frame.querySelector('.mf-ov');
  if (ov) return ov;
  ov = document.createElement('span');
  ov.className = 'mf-ov';
  ov.innerHTML =
    '<svg class="up-c" viewBox="0 0 48 48" aria-hidden="true">' +
    '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
    '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="' + RING +
    '" stroke-dashoffset="' + RING + '"></circle>' +
    '</svg>' +
    '<button class="up-btn-static mf-btn" type="button" tabindex="-1">' +
    '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>';
  ov.querySelector('.mf-btn').addEventListener('click', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const st = frame.__dlState;
    if (!st) return;
    if (frame.classList.contains('dl-err')) {   // falló o canceló → reintentar
      if (st.onRetry) st.onRetry();
      return;
    }
    paintErr(frame, st);                        // en curso → cancelar (✕)
  });
  frame.appendChild(ov);
  return ov;
}

/* W66g: tamaño legible para el título del botón de reintento. */
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}

/* Pinta el estado de error/cancelado: anillo fuera, botón como ⤓.
   W66g: icono de DESCARGA (antes ↻ "Reintentar") y, si se llegó a saber
   el total, el título lleva el tamaño del archivo. */
function paintErr(frame, st) {
  st.dead = true;
  if (st.xhr) { try { st.xhr.abort(); } catch (e) {} }
  /* W22: si el marco era "sin anillo" (imagen sin resolución conocida)
     el overlay aparece aquí igual, para poder reintentar. */
  ensureOverlay(frame);
  const sz = st.total > 0 ? ' (' + fmtBytes(st.total) + ')' : '';
  setBtnIcon(frame.querySelector('.mf-btn'), '#i-download',
    t('Reintentar descarga') + sz);
  setDlCls(frame, 'dl-err');
}

/* W43: estado dl-* del marco como FUENTE DE VERDAD. Vue escribe el
   atributo class COMPLETO cuando cambia un :class del marco (p. ej.
   .vhide del video al dejar de mover el ratón) y borraba las clases
   dl-* que aquí se añadieron a mano: reaparecía la ✕ de cancelar
   aunque la descarga hubiera terminado. syncDlCls se llama desde el
   hook `updated` de la directiva (post-flush: DESPUÉS del parche de
   Vue) y restaura el estado. */
function setDlCls(frame, cls) {
  frame.__dlCls = cls;
  syncDlCls(frame);
}
function syncDlCls(frame) {
  const want = frame.__dlCls || '';
  const list = ['dl-on', 'dl-err', 'dl-done'];
  for (let i = 0; i < list.length; i++) {
    const has = frame.classList.contains(list[i]);
    if (list[i] === want) {
      if (!has) frame.classList.add(list[i]);
    } else if (has) {
      frame.classList.remove(list[i]);
    }
  }
}
/* Para chat.js (vClearDlState): marcar "descarga terminada" y que el
   re-assert de W43 lo mantenga. */
export function markDlDone(frame) {
  if (frame) setDlCls(frame, 'dl-done');
}

/* Núcleo compartido: baja `url` con progreso visible en `frame`.
   W22: con data-noring="1" en el marco no se pinta el anillo (imagen sin
   resolución conocida: solo la miniatura difuminada, sin cuadro). */
function runDl(url, frame, onDone, explicit) {
  if (frame.__dlState && !frame.__dlState.dead &&
      frame.classList.contains('dl-on')) return;   // ya bajando en este marco
  const noRing = !!(frame.dataset && frame.dataset.noring === '1');
  const ov = noRing ? null : ensureOverlay(frame);
  const svg = ov ? ov.querySelector('svg.up-c') : null;
  const fg = ov ? ov.querySelector('circle.up-c-fg') : null;
  if (fg) {
    fg.setAttribute('stroke-dashoffset', String(RING));
    /* W49: si el server no informa el total, el anillo gira; cuando llega
       un progreso con total conocido se quita el giro y se ve el arco. */
    if (svg) svg.classList.add('indet');
    setBtnIcon(ov.querySelector('.mf-btn'), '#i-x', t('Cancelar descarga'));
  }
  setDlCls(frame, 'dl-on');

  const state = { url: url, xhr: null, dead: false, onRetry: null, total: 0 };
  frame.__dlState = state;
  state.onRetry = function () { runDl(url, frame, onDone, explicit); };

  const xhr = new XMLHttpRequest();
  state.xhr = xhr;
  xhr.open('GET', url);
  xhr.responseType = 'blob';
  /* W50: una descarga explícita la guarda downloads.js; el service worker
     no la duplica en el caché de medios. */
  if (explicit) {
    try { xhr.setRequestHeader('X-Fox-Download', '1'); } catch (e) {}
  }
  xhr.onprogress = function (ev) {
    if (ev.lengthComputable && ev.total > 0) state.total = ev.total;
    if (fg && ev.lengthComputable && ev.total > 0) {
      if (svg) svg.classList.remove('indet');
      fg.setAttribute('stroke-dashoffset',
        String(Math.round(RING * (1 - ev.loaded / ev.total))));
    }
  };
  xhr.onload = function () {
    if (state.dead) return;
    if (xhr.status < 200 || xhr.status >= 300) return paintErr(frame, state);
    const raw = xhr.response;
    const obj = URL.createObjectURL(raw);
    storeBlob(url, obj, raw);
    setDlCls(frame, 'dl-done');
    onDone(obj, raw);
  };
  xhr.onerror = function () { if (!state.dead) paintErr(frame, state); };
  xhr.send();
}

function applySrc(el, objUrl) {
  if (el.tagName === 'IMG') {
    if (el.src === objUrl) return;   // W51: no recargar la misma imagen
    el.addEventListener('load', function () {
      el.classList.remove('dl-blur');
    }, { once: true });
    el.src = objUrl;
  } else {
    /* W51: Vue re-renderiza al actualizar la duración/estado y la URL
       pasa de la firmada al blob. Antes se reasignaba el MISMO blob (o
       se cambiaba el src) y el video/audio se reiniciaba justo al pulsar
       play: el primer clic parpadeaba y el segundo ya sonaba. Asignar
       sólo si cambia de verdad elimina esa recarga. */
    if ((el.currentSrc || el.src) === objUrl) return;
    el.src = objUrl;                 // video/audio: listos para reproducir
    el.classList.remove('dl-blur');
  }
}

/* Descarga perezosa: solo cuando el MARCO está a tiro (antes: loading=lazy).
   Se observa el .mframe y NO el elemento: el <audio> va oculto con
   display:none (el player custom se ve) y un IntersectionObserver nunca
   dispara para algo invisible. */
const io = ('IntersectionObserver' in window)
  ? new IntersectionObserver(function (ents) {
      for (let i = 0; i < ents.length; i++) {
        if (!ents[i].isIntersecting) continue;
        const frame = ents[i].target;
        io.unobserve(frame);
        frame.__dlObs = false;
        const el = frame.__dlEl;
        const u = frame.__dlStart;
        frame.__dlEl = null;
        frame.__dlStart = '';
        if (el && u) startDl(el, u);
      }
    }, { rootMargin: '200px' })
  : null;

/* W51: elige el derivado compatible ANTES de descargar. Si el navegador
   anuncia WebM/MP3 pero luego falla, chat.js marca el MIME y la siguiente
   apertura ya pide MP4/Ogg/WAV directamente. */
function selectedUrl(el, url) {
  const mime = el && el.dataset ? el.dataset.mime : '';
  return addFmt(url, needsCompat(el, mime));
}

/* W51: caché silenciosa del derivado que ya está sonando por red. No
   cambia el src (no corta la reproducción): al terminar, la próxima
   apertura ya sale del blob. */
export function cacheMedia(url) {
  if (!url || url.indexOf('blob:') === 0 || cachedUrl(url)) return;
  const key = pathKey(url);
  if (prefetching[key]) return;
  const xhr = new XMLHttpRequest();
  prefetching[key] = xhr;
  xhr.open('GET', url);
  xhr.responseType = 'blob';
  const done = function () { delete prefetching[key]; };
  xhr.onload = function () {
    done();
    if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
      const obj = URL.createObjectURL(xhr.response);
      storeBlob(url, obj, xhr.response);
    }
  };
  xhr.onerror = done;
  xhr.onabort = done;
  xhr.send();
}

function startDl(el, url) {
  const frame = frameOf(el);
  url = selectedUrl(el, url);
  if (url.indexOf('blob:') === 0) {           // mediaUrl() ya sirve el blob
    if (frame) setDlCls(frame, 'dl-done');
    if (!el.__dlNoSwap) applySrc(el, url);
    return;
  }
  if (!frame) { el.src = url; return; }
  const hit = cachedUrl(url);
  if (hit) {
    if (!el.__dlNoSwap) applySrc(el, hit);
    setDlCls(frame, 'dl-done');
    return;
  }
  /* W60: una nota de voz o un audio NUNCA deben esperar a que termine
     la descarga completa para sonar. Se reproduce por streaming con la
     URL firmada (y el formato compatible elegido arriba) mientras el
     caché se llena en segundo plano. Antes, si la descarga fallaba a
     los 3 s, el reproductor se quedaba sin fuente y solo aparecía el
     botón de reintento. */
  if (el.tagName === 'AUDIO') {
    if (!el.currentSrc && !el.src) {
      el.src = url;
      try { el.load(); } catch (e) {}
    }
    setDlCls(frame, 'dl-done');
    cacheMedia(url);
    return;
  }
  if (el.tagName === 'IMG') {
    const th = thumbOf(url);
    if (th) { el.classList.add('dl-blur'); el.src = th; }
  }
  runDl(url, frame, function (obj) {
    if (!el.__dlNoSwap) applySrc(el, obj);
  });
}

/* Directiva Vue: v-dl="url" sobre el elemento multimedia. */
export const dlDirective = {
  mounted: function (el, binding) {
    if (!binding.value) return;
    if (binding.value.indexOf('blob:') === 0) {   // ya bajado: sin anillo
      const fr = frameOf(el);
      if (fr) setDlCls(fr, 'dl-done');
      applySrc(el, binding.value);
      return;
    }
    const frame = frameOf(el);
    if (!frame) { el.src = selectedUrl(el, binding.value); return; }
    const hit = cachedUrl(binding.value);
    if (hit) {
      if (!el.__dlNoSwap) applySrc(el, hit);
      setDlCls(frame, 'dl-done');
      return;
    }
    if (io) {                                   // perezosa: al entrar en pantalla
      frame.__dlEl = el;
      frame.__dlStart = binding.value;
      frame.__dlObs = true;
      io.observe(frame);                        // el MARCO (el <audio> va oculto)
      return;
    }
    startDl(el, binding.value);
  },
  updated: function (el, binding) {
    const fr = frameOf(el);
    /* W43: si Vue reescribió el class del marco (p. ej. .vhide) se
       restauran las clases dl-* — sin esto la ✕ de cancelar volvía a
       verse con la descarga ya terminada. */
    if (fr) syncDlCls(fr);
    if (!binding.value || binding.value === binding.oldValue) return;
    if (io && fr && fr.__dlObs) { io.unobserve(fr); fr.__dlObs = false; }
    startDl(el, binding.value);
  },
  unmounted: function (el) {
    const fr = frameOf(el);
    if (io && fr && fr.__dlObs) { io.unobserve(fr); fr.__dlObs = false; }
    /* El estado vive en el MARCO (fr.__dlState), no en el <img>/<video>.
       Antes se consultaba el.__dl (inexistente) y la XHR seguía viva
       aunque Vue eliminara el mensaje de la lista. */
    const st = fr && fr.__dlState;
    if (st) {
      st.dead = true;
      if (st.xhr) { try { st.xhr.abort(); } catch (e) {} }
    }
  },
};

/* W59: descarga manual. Además de los datos de la app (disponible sin
   red), deja una copia en el dispositivo: Descargas del navegador en PC;
   en Android avisa "Descargando archivo" y guarda en Downloads/Foxinix. */
export function startDownload(url, filename, frame, mime, kind) {
  if (!url) return;
  const type = dlCategory(kind, mime, filename);
  const info = dlTypeInfo(type);
  const label = t(info.label);
  const doneMsg = t(info.done);
  const startMsg = t('Descargando {type}...', { type: label });

  const saveOne = function (blob) {
    if (!blob) {
      toast(t('No se pudo descargar el archivo'), 'err');
      return Promise.resolve(null);
    }
    requestPersistence();

    /* Copia en el dispositivo, no solo en los datos de la app:
       PC/navegador → Descargas del navegador (<a download>);
       Android → notificación "Descargando archivo" + Downloads/Foxinix. */
    const dev = (function () {
      const a = androidBridge();
      if (a && typeof a.beginSave === 'function') {
        try {
          a.notify('Descargando archivo', String(filename || 'archivo'), null, null);
        } catch (e) {}
        return saveBlobToDevice(blob, filename, mime).then(function (r) {
          if (r.ok) toast(t('Guardado en Descargas/Foxinix'), 'ok');
          else if (r.permission) toast(t('Permiso de almacenamiento necesario para guardar en el dispositivo'), 'err');
          else toast(t('No se pudo guardar en el dispositivo'), 'err');
          return r;
        });
      }
      saveBlobToDisk(blob, filename || 'archivo');
      return Promise.resolve({ ok: true, native: false });
    })();

    const appDone = saveDownload(url, filename, blob, type, false).then(function (meta) {
      if (meta) toast(doneMsg, 'ok');
      else toast(t('No se pudo guardar en la app'), 'err');
    }).catch(function () {
      toast(t('No se pudo guardar en la app'), 'err');
    });
    return Promise.all([appDone, dev]).then(function () { return null; });
  };

  /* Si ya está en los datos de la app no se vuelve a bajar ni se
     exporta nada. El botón del mensaje, cuando está guardado, abre el
     archivo (openAppDownload) en vez de llamar aquí. */
  getDownloadBlob(url).then(function (saved) {
    if (saved) {
      /* W66g: el archivo ya está en los datos de la app, pero el botón
         de DESCARGAR debe exportarla al dispositivo igual: antes solo
         avisaba "Ya está descargado en la app" y el archivo nunca
         llegaba al PC (visores y descargas explícitas). */
      saveOne(saved);
      return;
    }
    const raw = getBlob(url);
    if (raw) { saveOne(raw); return; }
    if (frame && frame.appendChild) {
      toast(startMsg, 'info');
      runDl(url, frame, function (obj, blob) {
        saveOne(blob);
      }, true);
      return;
    }
    /* Sin reproductor visible: XHR silencioso. Nunca window.open: una
       descarga no debe abrir una pestaña nueva. */
    toast(startMsg, 'info');
    fetchBlob(url).then(saveOne).catch(function () {
      toast(t('No se pudo descargar el archivo'), 'err');
    });
  }).catch(function () {
    toast(t('No se pudo descargar el archivo'), 'err');
  });
}
