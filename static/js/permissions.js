/* Foxinix W58 — permisos del dispositivo y onboarding de arranque.

   Android (WebView) usa el puente nativo; el navegador/PWA usa las APIs
   del navegador. La pantalla de permisos es una sola pieza compartida:
   icono grande, explicación, "Conceder" y "Saltar por ahora".

   Política:
   - Al arrancar se revisan los permisos aplicables. En Android/PWA/móvil
     se muestra el onboarding completo; en un navegador de escritorio se
     revisan en Ajustes y al usar la función.
   - Saltar no bloquea la app: la función queda indisponible y vuelve a
     pedir el permiso cuando se usa por primera vez.
   - Un permiso concedido no vuelve a preguntarse; uno bloqueado ofrece
     "Abrir ajustes" cuando el sistema lo permite.
*/
import { store } from './store.js';
import { t } from './i18n.js';
import { hooks as dlHooks } from './downloads.js';

export const PERMISSIONS = [
  { id: 'mic', icon: 'i-mic', label: 'Micrófono' },
  { id: 'camera', icon: 'i-camera', label: 'Cámara' },
  { id: 'notif', icon: 'i-bell', label: 'Notificaciones' },
  { id: 'storage', icon: 'i-download', label: 'Almacenamiento' },
];

const PERM_TITLE = {
  mic: 'Usar el micrófono',
  camera: 'Usar la cámara',
  notif: 'Recibir notificaciones',
  storage: 'Guardar en el dispositivo',
};
const PERM_TEXT = {
  mic: 'Sirve para grabar notas de voz y hablar en llamadas. Solo se activa cuando tú lo pides.',
  camera: 'Sirve para videollamadas y para enviar fotos o videos desde la cámara.',
  notif: 'Avisa de mensajes nuevos aunque Foxinix esté en segundo plano. Muestra el texto del mensaje.',
  storage: 'Permite guardar una copia de tus descargas en Descargas/Foxinix. Las descargas normales ya quedan en los datos de la app.',
};
const PERM_DENIED = {
  mic: 'El micrófono está bloqueado. Puedes activarlo en los ajustes del sistema.',
  camera: 'La cámara está bloqueada. Puedes activarla en los ajustes del sistema.',
  notif: 'Las notificaciones están bloqueadas. Puedes activarlas en los ajustes del sistema.',
  storage: 'El almacenamiento está bloqueado. Puedes activarlo en los ajustes del sistema.',
};

function bridge() {
  try { return window.FoxinixAndroid || null; } catch (e) { return null; }
}

function nativeKind(kind) {
  return kind === 'storage' ? 'storage' : kind;
}

function isBootPlatform() {
  if (bridge()) return true;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch (e) {}
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
}

function webPermissionQuery(kind) {
  if (!navigator.permissions || !navigator.permissions.query) return null;
  const name = kind === 'mic' ? 'microphone' : 'camera';
  try { return navigator.permissions.query({ name: name }); }
  catch (e) { return null; }
}

export async function permissionState(kind) {
  const a = bridge();
  if (a) {
    try {
      const fn = kind === 'storage' ? 'storagePermission' : 'permissionState';
      if (typeof a[fn] === 'function') {
        let st = String(a[fn](nativeKind(kind)) || '');
        /* W62: APKs anteriores devolvían "unavailable" para storage en
           Android 10+, donde ya no hace falta permiso (MediaStore). */
        if (kind === 'storage' && st === 'unavailable') st = 'granted';
        if (st === 'granted' || st === 'denied' || st === 'prompt' ||
            st === 'unavailable') return st;
      }
      if (kind === 'notif' && typeof a.permission === 'function') {
        const st = String(a.permission() || '');
        if (st) return st === 'default' ? 'prompt' : st;
      }
    } catch (e) {}
  }
  if (kind === 'notif') {
    if (typeof Notification === 'undefined') return 'unavailable';
    const p = Notification.permission;
    return p === 'default' ? 'prompt' : p;
  }
  if (kind === 'mic' || kind === 'camera') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unavailable';
    const q = webPermissionQuery(kind);
    if (q) {
      try {
        const r = await q;
        return r.state === 'prompt' ? 'prompt' :
          (r.state === 'granted' ? 'granted' : 'denied');
      } catch (e) {}
    }
    /* Firefox 78/Mypal puede no exponer Permissions API para estos
       nombres: no bloqueamos el arranque; se pedirá al usar la función. */
    return 'unknown';
  }
  /* El navegador no tiene "permiso de almacenamiento" equivalente al
     legacy de Android: Cache Storage y las descargas funcionan sin
     diálogo. Se muestra como concedido, no como "No disponible". */
  if (kind === 'storage') return 'granted';
  return 'unavailable';
}

export async function refreshPermissionStates() {
  const out = {};
  for (let i = 0; i < PERMISSIONS.length; i++) {
    out[PERMISSIONS[i].id] = await permissionState(PERMISSIONS[i].id);
  }
  store.permStates = out;
  return out;
}

function emitPermissionResult(kind, state) {
  if (pendingNative && pendingNative.kind === kind) {
    const fn = pendingNative.fn;
    pendingNative = null;
    fn(state);
  }
}
let pendingNative = null;
/* El puente Android llama a esta global desde onRequestPermissionsResult. */
try {
  window.__foxinixPermissionResult = function (kind, state) {
    let k = kind;
    let s = state;
    if (kind && typeof kind === 'object') {
      k = kind.kind;
      s = kind.state;
    }
    emitPermissionResult(String(k || ''), String(s || 'prompt'));
  };
} catch (e) {}

function requestNative(kind) {
  const a = bridge();
  if (!a || typeof a.requestPermissionFor !== 'function') return null;
  return new Promise(function (resolve) {
    pendingNative = { kind: nativeKind(kind), fn: resolve };
    let immediate = '';
    try { immediate = String(a.requestPermissionFor(nativeKind(kind)) || ''); }
    catch (e) { immediate = ''; }
    if (immediate === 'granted' || immediate === 'denied' ||
        immediate === 'unavailable') {
      pendingNative = null;
      resolve(immediate);
      return;
    }
    setTimeout(function () {
      if (pendingNative && pendingNative.kind === nativeKind(kind)) {
        pendingNative = null;
        resolve('prompt');
      }
    }, 90000);
  });
}

function requestWebNotify() {
  return new Promise(function (resolve) {
    if (typeof Notification === 'undefined') { resolve('unavailable'); return; }
    try {
      const p = Notification.requestPermission(function (r) { resolve(r || 'denied'); });
      if (p && typeof p.then === 'function') {
        p.then(function (r) { resolve(r || 'denied'); }).catch(function () {
          resolve('denied');
        });
      }
    } catch (e) { resolve('denied'); }
  });
}

export async function requestPermission(kind) {
  const native = requestNative(kind);
  if (native) return native;
  if (kind === 'notif') return requestWebNotify();
  if (kind === 'storage') return 'unavailable';
  if (kind === 'mic' || kind === 'camera') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'unavailable';
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: kind === 'mic',
        video: kind === 'camera',
      });
      stream.getTracks().forEach(function (tr) { tr.stop(); });
      return 'granted';
    } catch (e) {
      const st = await permissionState(kind);
      return st === 'denied' ? 'denied' : 'prompt';
    }
  }
  return 'unavailable';
}

let activeFinish = null;
let queue = Promise.resolve();

function showGate(kind, meta) {
  meta = meta || {};
  return permissionState(kind).then(function (state) {
    store.permStates[kind] = state;
    return new Promise(function (resolve) {
      activeFinish = resolve;
      store.permGate = {
        kind: kind,
        icon: (PERMISSIONS.filter(function (p) { return p.id === kind; })[0] || {}).icon || 'i-shield',
        title: t(PERM_TITLE[kind] || 'Permiso'),
        text: t(PERM_TEXT[kind] || ''),
        state: state,
        index: meta.index || 1,
        total: meta.total || 1,
        boot: !!meta.boot,
        busy: false,
        error: state === 'denied' ? t(PERM_DENIED[kind] || '') : '',
        native: !!bridge(),
      };
    });
  });
}

/* Encola una petición para que dos funciones no abran dos pantallas a la
   vez. Cada petición espera a que se cierre la anterior y muestra SU
   permiso: si una función pide el micrófono mientras está abierto el
   onboarding de la cámara, no recibe por error la respuesta de cámara. */
export function askPermission(kind, meta) {
  const run = queue.then(function () {
    return showGate(kind, meta);
  });
  queue = run.then(function () {}, function () {});
  return run;
}

function finishGate(ok) {
  if (activeFinish) {
    const fn = activeFinish;
    activeFinish = null;
    store.permGate = null;
    fn(!!ok);
  }
}

export async function grantCurrent() {
  const g = store.permGate;
  if (!g || g.busy) return;
  g.busy = true;
  g.error = '';
  const st = await requestPermission(g.kind);
  store.permStates[g.kind] = st;
  if (st === 'granted' || st === 'unavailable') {
    finishGate(st === 'granted');
    return;
  }
  g.state = st;
  g.busy = false;
  g.error = t(PERM_DENIED[g.kind] || 'No se pudo conceder el permiso');
}

export function skipCurrent() {
  const g = store.permGate;
  if (!g || g.busy) return;
  finishGate(false);
}

export function openCurrentSettings() {
  const g = store.permGate;
  const a = bridge();
  if (!g || !a) return;
  try {
    if (typeof a.openPermissionSettings === 'function') {
      a.openPermissionSettings(g.kind);
    } else if (typeof a.openSettings === 'function') {
      a.openSettings();
    }
  } catch (e) {}
}

export function closeCurrent() {
  skipCurrent();
}

/* Onboarding de arranque. Solo bloquea en Android, PWA instalada o web
   móvil; en escritorio se revisa en Ajustes y al usar cada función. */
export async function bootPermissions() {
  if (!isBootPlatform()) {
    refreshPermissionStates();
    return;
  }
  // W63: sólo pedir permisos en el primer arranque / instalación
  if (localStorage.getItem('fm.perm.booted') === '1') {
    refreshPermissionStates();
    return;
  }
  const states = await refreshPermissionStates();
  const missing = [];
  for (let i = 0; i < PERMISSIONS.length; i++) {
    const id = PERMISSIONS[i].id;
    /* NO pedir mic/cámara al arranque: getUserMedia enciende el LED
       y asusta al usuario. Se piden solo al hacer llamadas. */
    if (id === 'mic' || id === 'camera') continue;
    const st = states[id];
    if (st === 'prompt' || st === 'denied') missing.push(id);
  }
  for (let i = 0; i < missing.length; i++) {
    const id = missing[i];
    const st = await permissionState(id);
    if (st === 'granted' || st === 'unavailable') continue;
    await askPermission(id, { boot: true, index: i + 1, total: missing.length });
  }
  localStorage.setItem('fm.perm.booted', '1');
}

/* Revisión manual desde Ajustes: vuelve a mostrar las que falten. */
export async function reviewPermissions() {
  const states = await refreshPermissionStates();
  const missing = [];
  for (let i = 0; i < PERMISSIONS.length; i++) {
    const id = PERMISSIONS[i].id;
    if (states[id] === 'prompt' || states[id] === 'denied' ||
        states[id] === 'unknown') missing.push(id);
  }
  for (let i = 0; i < missing.length; i++) {
    const id = missing[i];
    if (await askPermission(id, { index: i + 1, total: missing.length })) {
      /* concedido: sigue con el próximo */
    }
  }
  return refreshPermissionStates();
}

/* Comprobación antes de usar una función. Si el usuario salta, la
   función debe abortar sin romper la app. En escritorio se deja que el
   navegador muestre su propio diálogo; la puerta a pantalla completa es
   solo para Android APK, PWA instalada y web móvil. */
export async function ensurePermission(kind) {
  const st = await permissionState(kind);
  store.permStates[kind] = st;
  if (st === 'granted' || st === 'unavailable') return true;
  if (!isBootPlatform()) {
    const res = await requestPermission(kind);
    store.permStates[kind] = res;
    return res === 'granted' || res === 'unavailable';
  }
  return askPermission(kind, { index: 1, total: 1 });
}

export function permissionLabel(kind) {
  const p = PERMISSIONS.filter(function (x) { return x.id === kind; })[0];
  return t(p ? p.label : kind);
}

export function permissionStateLabel(kind) {
  const st = store.permStates[kind];
  if (st === 'granted') return t('Concedido');
  if (st === 'denied') return t('Bloqueado');
  if (st === 'unavailable') {
    /* W62: el almacenamiento del navegador no necesita permiso; la
       cámara sin getUserMedia se deja como pendiente para poder
       reintentar en lugar de declararla muerta. */
    if (kind === 'storage') return t('No requiere permiso');
    if (kind === 'camera') return t('Pendiente');
    return t('No disponible');
  }
  return t('Pendiente');
}

/* downloads.js pide el permiso legacy de almacenamiento antes de crear
   la copia pública en Android 9 o anterior. */
dlHooks.ensurePermission = ensurePermission;

/* Toque de refresco para la sección de Ajustes al enfocar la app. */
try {
  window.addEventListener('focus', function () {
    if (store.user) refreshPermissionStates();
  });
} catch (e) {}
