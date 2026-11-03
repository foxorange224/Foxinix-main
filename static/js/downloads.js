/* Foxinix — descargas persistentes (W50/W58).

   Los bytes de una descarga se guardan en los datos de la app: Cache
   Storage (`foxinix-downloads-v1`) + ficha (nombre, tamaño, tipo, fecha)
   en IndexedDB. Así se pueden abrir o volver a guardar sin bajarlos de
   nuevo, incluso después de recargar. La copia pública en
   `Downloads/Foxinix` (Android) o en la carpeta de descargas del
   navegador SOLO se crea con "Guardar en el dispositivo".

   El caché de medios que usa el service worker es distinto y se poda
   por tamaño; las descargas de la app NO se podan automáticamente.
   Si el navegador borra el almacenamiento, la ficha se limpia sola al
   abrir la lista y se puede volver a descargar.

   Sin dependencias. FF78: Cache API + IndexedDB + Blob + XHR. */
import { store } from './store.js';

/* P1: las descargas persistentes son por CUENTA. Antes el mismo caché e
   IndexedDB se compartían entre usuarios del mismo dispositivo y la
   siguiente cuenta veía archivos de la anterior. */
const DL_CACHE_BASE = 'foxinix-downloads-v1';
export const DL_CACHE = DL_CACHE_BASE;   // nombre base (compatibilidad)

/* Tipos de descarga y preferencias automáticas por red. Se guardan en
   el dispositivo (localStorage), igual que el resto de preferencias. */
export const DL_TYPES = [
  { id: 'video', label: 'Videos', done: 'Video descargado' },
  { id: 'image', label: 'Imágenes', done: 'Imagen descargada' },
  { id: 'audio', label: 'Audios', done: 'Audio descargado' },
  { id: 'file', label: 'Archivos', done: 'Archivo descargado' },
  { id: 'document', label: 'Documentos', done: 'Documento descargado' },
];
const DL_AUTO_KEY = 'fm.dl.auto';

/* Permite que permisos.js conecte la verificación de almacenamiento sin
   crear un ciclo de imports. */
export const hooks = {
  ensurePermission: null,   // async (kind) -> bool
  onSaved: null,            // (meta) -> void
};

export function dlTypeInfo(type) {
  for (let i = 0; i < DL_TYPES.length; i++) {
    if (DL_TYPES[i].id === type) return DL_TYPES[i];
  }
  return DL_TYPES[3];
}

export function dlCategory(kind, mime, name) {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (kind === 'image' || m.indexOf('image/') === 0 ||
      /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/.test(n)) return 'image';
  if (kind === 'voice' || kind === 'audio' || m.indexOf('audio/') === 0 ||
      /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/.test(n)) return 'audio';
  if (kind === 'video' || m.indexOf('video/') === 0 ||
      /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/.test(n)) return 'video';
  if (/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|md|epub)$/.test(n) ||
      m.indexOf('application/pdf') === 0 ||
      m.indexOf('application/msword') === 0 ||
      m.indexOf('application/vnd.openxmlformats') === 0 ||
      m.indexOf('application/vnd.oasis.opendocument') === 0 ||
      m.indexOf('text/plain') === 0) return 'document';
  return 'file';
}

function emptyAuto() {
  const out = {};
  for (let i = 0; i < DL_TYPES.length; i++) {
    /* W59: por defecto se descarga solo el contenido que llega por
       Wi-Fi. En datos móviles queda apagado para no gastar el plan;
       se puede activar por tipo en Ajustes → Descargas. */
    out[DL_TYPES[i].id] = { wifi: true, mobile: false };
  }
  return out;
}

export function autoDlPrefs() {
  const out = emptyAuto();
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(DL_AUTO_KEY) || '{}'); } catch (e) { raw = null; }
  let hadStored = false;
  if (raw && typeof raw === 'object') {
    for (let i = 0; i < DL_TYPES.length; i++) {
      const id = DL_TYPES[i].id;
      const v = raw[id];
      if (v && typeof v === 'object') {
        hadStored = true;
        out[id].wifi = !!v.wifi;
        out[id].mobile = !!v.mobile;
      }
    }
  }
  /* W59: W58 guardaba todos los tipos apagados por defecto. Al actualizar,
     una sola vez volvemos a dejar Wi-Fi encendido para quien ya tenía
     preferencias guardadas; móvil conserva lo que eligió (por defecto,
     apagado). Quien quiera apagarlo, lo hace en Ajustes → Descargas. */
  try {
    if (hadStored && localStorage.getItem('fm.dlauto.v') !== '2') {
      for (let i = 0; i < DL_TYPES.length; i++) out[DL_TYPES[i].id].wifi = true;
      localStorage.setItem(DL_AUTO_KEY, JSON.stringify(out));
      localStorage.setItem('fm.dlauto.v', '2');
    }
  } catch (e) {}
  return out;
}

export function setAutoDl(type, network, on) {
  const prefs = autoDlPrefs();
  if (!prefs[type] || (network !== 'wifi' && network !== 'mobile')) return prefs;
  prefs[type][network] = !!on;
  try {
    localStorage.setItem(DL_AUTO_KEY, JSON.stringify(prefs));
    /* W59: una elección explícita ya no se pisa con la migración. */
    localStorage.setItem('fm.dlauto.v', '2');
  } catch (e) {}
  return prefs;
}

export function autoDlEnabled(type, network) {
  if (network !== 'wifi' && network !== 'mobile') return false;
  const prefs = autoDlPrefs();
  return !!(prefs[type] && prefs[type][network]);
}

export function androidBridge() {
  try {
    const a = window.FoxinixAndroid;
    return a || null;
  } catch (e) { return null; }
}

export function nativeDownloadAvailable() {
  const a = androidBridge();
  return !!(a && typeof a.download === 'function');
}

export function nativeNetwork() {
  const a = androidBridge();
  if (!a || typeof a.networkType !== 'function') return '';
  try { return String(a.networkType() || '').toLowerCase(); } catch (e) { return ''; }
}

/* Red actual. En Android manda el puente nativo (ConnectivityManager);
   en el navegador usamos Network Information API. Si no se puede
   determinar, devuelve '' y las descargas automáticas NO se ejecutan:
   asumir Wi-Fi podía gastar gigabytes de datos móviles. */
export function currentNetwork() {
  const native = nativeNetwork();
  if (native === 'wifi' || native === 'mobile') return native;
  try {
    const conn = navigator.connection || navigator.mozConnection ||
      navigator.webkitConnection;
    if (conn) {
      const type = String(conn.type || '').toLowerCase();
      if (type === 'wifi' || type === 'ethernet' || type === 'bluetooth') return 'wifi';
      if (type === 'cellular' || type === '4g' || type === '3g' || type === '2g') return 'mobile';
      if (conn.saveData) return 'off';
      if (conn.effectiveType) {
        if (/^(slow-2g|2g|3g)$/.test(conn.effectiveType)) return 'mobile';
        if (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '')) return 'mobile';
      }
    }
  } catch (e) {}
  return '';
}

export function shouldAutoDownload(type) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const net = currentNetwork();
  if (net) return autoDlEnabled(type, net);
  /* W60: el límite Wi-Fi/datos es cosa del CELULAR. Si el navegador no
     puede decir la red (Firefox de escritorio, por ejemplo), en PC se
     usa el ajuste de Wi-Fi; en un móvil sin puente nativo no se asume
     nada para no gastar el plan de datos. */
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return false;
  return autoDlEnabled(type, 'wifi');
}

/* Firma antigua conservada para las webs cacheadas de W57. Las descargas
   nuevas usan `saveDownloadToDevice()`. */
export function nativeDownload(url, name, mime, type, silent) {
  const a = androidBridge();
  if (!a || typeof a.download !== 'function' || !url ||
      String(url).indexOf('blob:') === 0) return false;
  let full = String(url);
  if (full.charAt(0) === '/' && full.charAt(1) !== '/') {
    full = window.location.origin + full;
  }
  try {
    return !!a.download(full, String(name || 'archivo'),
      String(mime || ''), String(type || 'file'), !!silent);
  } catch (e) { return false; }
}

const DB_BASE = 'foxinix-downloads';
const DB_VERSION = 1;
const STORE = 'files';
let dbPromise = null;

function ownerTag() {
  const u = store.user;
  return u && u.id ? 'u' + u.id : 'anon';
}

export function dlCacheName() {
  return DL_CACHE_BASE + '-' + ownerTag();
}

function dbName() {
  return DB_BASE + '-' + ownerTag();
}

/* Al cerrar sesión se suelta la conexión lógica; la próxima cuenta abre
   otra base de datos (sus descargas no se mezclan con las anteriores). */
export function resetDownloadStore() {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    try { pending.then(function (db) { try { db.close(); } catch (e) {} }); }
    catch (e) {}
  }
}

function hasIDB() {
  return typeof indexedDB !== 'undefined';
}

function dbOpen() {
  if (!hasIDB()) return Promise.reject(new Error('sin IndexedDB'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    const rq = indexedDB.open(dbName(), DB_VERSION);
    rq.onupgradeneeded = function () {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    rq.onsuccess = function () { resolve(rq.result); };
    rq.onerror = function () { reject(rq.error); };
  });
  return dbPromise;
}

function idbPut(meta) {
  return dbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(meta);
      tx.oncomplete = function () { resolve(meta); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function idbGet(key) {
  return dbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { reject(rq.error); };
    });
  });
}

function idbAll() {
  return dbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).getAll();
      rq.onsuccess = function () { resolve(rq.result || []); };
      rq.onerror = function () { reject(rq.error); };
    });
  });
}

function idbDel(key) {
  return dbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function idbClear() {
  return dbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

/* La identidad es la RUTA sin la firma, igual que en mediadl.js. */
export function downloadKey(url) {
  if (!url) return '';
  const s = String(url);
  const i = s.indexOf('?');
  return i < 0 ? s : s.slice(0, i);
}

function cacheOpen() {
  if (typeof caches === 'undefined') return Promise.resolve(null);
  return caches.open(dlCacheName()).catch(function () { return null; });
}

/* Blob -> archivo público. La objectURL se revoca al terminar el clic. */
export function saveBlobToDisk(blob, name) {
  if (!blob) return false;
  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = name || 'archivo';
  a.style.display = 'none';
  a.target = '_self';           /* nunca abrir pestaña nueva */
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(obj); }, 1200);
  return true;
}

/* Guarda los bytes + la ficha. Devuelve la ficha o null si no se pudo. */
export async function saveDownload(url, name, blob, kind, auto) {
  if (!url || !blob) return null;
  const key = downloadKey(url);
  if (!key) return null;
  const c = await cacheOpen();
  if (!c) return null;
  const mime = blob.type || 'application/octet-stream';
  try {
    await c.put(key, new Response(blob, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(blob.size),
      },
    }));
  } catch (e) {
    return null;                       // cuota llena o Cache API bloqueada
  }
  const cat = dlCategory(kind, mime, name);
  const meta = {
    key: key,
    url: String(url),       // URL firmada original (se renueva al listar)
    name: name || 'archivo',
    size: blob.size,
    mime: mime,
    kind: cat,
    auto: !!auto,
    saved_at: Date.now(),
  };
  try { await idbPut(meta); } catch (e) {}
  if (hooks.onSaved) {
    try { hooks.onSaved(meta); } catch (e) {}
  }
  return meta;
}

/* Busca los bytes por URL o por clave. */
export async function getDownloadBlob(urlOrKey) {
  const key = downloadKey(urlOrKey);
  if (!key) return null;
  const c = await cacheOpen();
  if (!c) return null;
  try {
    const res = await c.match(key);
    return res ? await res.blob() : null;
  } catch (e) {
    return null;
  }
}

export async function downloadMeta(urlOrKey) {
  const key = downloadKey(urlOrKey);
  if (!key) return null;
  try {
    const meta = await idbGet(key);
    if (!meta) return null;
    const c = await cacheOpen();
    if (!c) return null;
    const hit = await c.match(key);
    return hit ? meta : null;
  } catch (e) {
    return null;
  }
}

export async function hasDownload(urlOrKey) {
  return !!(await downloadMeta(urlOrKey));
}

/* Lista las fichas cuya entrada de caché sigue existiendo. */
export async function listDownloads() {
  let list = [];
  try { list = await idbAll(); } catch (e) { return []; }
  const c = await cacheOpen();
  if (!c) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    item.kind = item.kind || dlCategory('', item.mime, item.name);
    try {
      const hit = await c.match(item.key);
      if (hit) out.push(item);
      else await idbDel(item.key).catch(function () {});
    } catch (e) {}
  }
  out.sort(function (a, b) { return (b.saved_at || 0) - (a.saved_at || 0); });
  return out;
}

export async function deleteDownload(urlOrKey) {
  const key = downloadKey(urlOrKey);
  if (!key) return false;
  const c = await cacheOpen();
  if (c) { try { await c.delete(key); } catch (e) {} }
  try { await idbDel(key); } catch (e) {}
  return true;
}

export async function clearDownloads() {
  const c = await cacheOpen();
  if (c) {
    try {
      const keys = await c.keys();
      await Promise.all(keys.map(function (k) { return c.delete(k); }));
    } catch (e) {}
  }
  try { await idbClear(); } catch (e) {}
  return true;
}

/* Abre una descarga ya guardada en los datos de la app (nunca baja ni
   crea una copia pública). Devuelve true si pudo abrirla.

   W60: NO abre pestañas ni ventanas. En la app móvil eso descolocaba la
   interfaz (la WebView se quedaba en blanco al volver). El archivo se
   muestra en el visor interno (store.dlViewer) y se revoca el objectURL
   al cerrarlo. */
export async function openAppDownload(urlOrKey) {
  const blob = await getDownloadBlob(urlOrKey);
  if (!blob) return false;
  const meta = await downloadMeta(urlOrKey);
  const mime = blob.type || (meta && meta.mime) || '';
  const name = (meta && meta.name) || 'archivo';
  const kind = (meta && meta.kind) || dlCategory('', mime, name);
  const url = URL.createObjectURL(blob);
  store.dlViewer = {
    url: url,
    name: name,
    mime: mime,
    size: blob.size,
    kind: kind,
    key: downloadKey(urlOrKey),
  };
  return true;
}

/* Vuelve a guardar una descarga ya almacenada, sin tocar la red.
   Web: <a download>. Android: MediaStore / carpeta pública. */
export async function saveDownloadToDevice(urlOrKey, name, mime) {
  const blob = await getDownloadBlob(urlOrKey);
  if (!blob) return { ok: false, error: 'missing' };
  return saveBlobToDevice(blob, name, mime);
}

export async function saveBlobToDevice(blob, name, mime) {
  if (!blob) return { ok: false, error: 'missing' };
  const a = androidBridge();
  if (a && typeof a.beginSave === 'function') {
    let state = '';
    try {
      if (typeof a.storagePermission === 'function') {
        state = String(a.storagePermission() || '');
      }
    } catch (e) { state = ''; }
    if (state && state !== 'granted' && state !== 'unavailable') {
      if (hooks.ensurePermission) {
        const allowed = await hooks.ensurePermission('storage');
        if (!allowed) return { ok: false, permission: true };
      } else {
        return { ok: false, permission: true };
      }
    }
    try {
      let begin = String(a.beginSave(String(name || 'archivo'),
        String(mime || blob.type || 'application/octet-stream'), blob.size) || '');
      if (begin === 'permission') {
        if (hooks.ensurePermission &&
            await hooks.ensurePermission('storage')) {
          begin = String(a.beginSave(String(name || 'archivo'),
            String(mime || blob.type || 'application/octet-stream'), blob.size) || '');
        }
      }
      if (begin !== 'ok') return { ok: false, permission: begin === 'permission' };
      const step = 384 * 1024;
      for (let off = 0; off < blob.size; off += step) {
        const part = blob.slice(off, Math.min(blob.size, off + step));
        const b64 = await blobToBase64(part);
        if (!a.appendSave(b64)) {
          try { a.cancelSave(); } catch (e) {}
          return { ok: false, error: 'write' };
        }
      }
      const done = String(a.finishSave() || '');
      if (done.indexOf('ok:') !== 0) return { ok: false, error: 'finish' };
      return { ok: true, name: done.slice(3) || name, native: true };
    } catch (e) {
      try { a.cancelSave(); } catch (e2) {}
      return { ok: false, error: 'native' };
    }
  }
  return saveBlobToDisk(blob, name) ? { ok: true, native: false } : { ok: false };
}

/* Compatibilidad con llamadas W50/W57. */
export async function saveDownloadToDisk(key, name) {
  const r = await saveDownloadToDevice(key, name);
  return !!r.ok;
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload = function () {
      const s = String(fr.result || '');
      const i = s.indexOf(',');
      resolve(i < 0 ? '' : s.slice(i + 1));
    };
    fr.onerror = function () { reject(fr.error); };
    fr.readAsDataURL(blob);
  });
}

/* Pide al navegador que no borre el almacenamiento si puede. */
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(function () { return false; });
    }
  } catch (e) {}
  return Promise.resolve(false);
}

/* GET silencioso con XHR (FF78, progreso no necesario) para las
   descargas automáticas, que no tienen un reproductor de fondo. */
export function fetchBlob(url) {
  return new Promise(function (resolve, reject) {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.responseType = 'blob';
    x.timeout = 120000;
    try { x.setRequestHeader('X-Fox-Download', '1'); } catch (e) {}
    x.onload = function () {
      if (x.status >= 200 && x.status < 300 && x.response) resolve(x.response);
      else reject(new Error('HTTP ' + x.status));
    };
    x.onerror = function () { reject(new Error('red')); };
    x.ontimeout = function () { reject(new Error('tiempo')); };
    x.send();
  });
}

const autoQueue = [];
const autoPending = {};
let autoActive = 0;

/* Descarga automática a los datos de la app. No crea copia pública:
   eso solo ocurre al pulsar "Guardar en el dispositivo". */
export function autoDownload(url, name, mime, kind) {
  if (!url || String(url).indexOf('blob:') === 0) return false;
  const cat = dlCategory(kind, mime, name);
  if (!shouldAutoDownload(cat)) return false;
  const key = downloadKey(url);
  if (!key || autoPending[key]) return false;
  autoPending[key] = true;
  autoQueue.push({
    url: String(url), name: name || 'archivo', mime: mime || '', kind: cat, key: key,
  });
  pumpAuto();
  return true;
}

function pumpAuto() {
  while (autoActive < 2 && autoQueue.length) {
    const job = autoQueue.shift();
    autoActive++;
    runAuto(job).then(function () {
      autoActive--;
      delete autoPending[job.key];
      pumpAuto();
    });
  }
}

async function runAuto(job) {
  if (!shouldAutoDownload(job.kind)) return;
  if (await hasDownload(job.key)) return;
  requestPersistence();
  try {
    const blob = await fetchBlob(job.url);
    if (blob && blob.size > 0) {
      await saveDownload(job.url, job.name, blob, job.kind, true);
    }
  } catch (e) {
    /* Sin conexión o el medio caducó: se reintentará al abrir el chat. */
  }
}
