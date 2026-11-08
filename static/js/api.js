/* Cliente API: fetch + refresh de token + sesión en localStorage.
   Reglas: 401 → refresh y reintenta una vez; 403 → cuenta sin verificar. */
import { store, go, goReplace, authFallback, toast } from './store.js';
import { t } from './i18n.js';
import { resetDownloadStore } from './downloads.js';
import { HttpClient } from './platform/net.js';
import { StorageAdapter } from './platform/storage.js';
import { DomAdapter } from './platform/dom.js';
import { CookieAdapter } from './platform/cookies.js';

const SKEY = 'fm.session';

/* W80: base de la API. Cuando la app se sirve desde foxinix.qzz.io (GitHub
   Pages) las peticiones van a api.foxinix.qzz.io vía cloudflared tunnel. */
export const API_BASE = 'https://api.foxinix.qzz.io';
/* W80: CDN de media en subdominio aparte. Las URLs firmadas
   (/media/{kind}/{fname}?exp=&sig=) se sirven desde aquí. */
export const CDN_BASE = 'https://cdn.foxinix.qzz.io';
/* Base del sitio (recursos estáticos: GIFs, iconos). En NS no hay
   document.location, así que la ruta es explícita. */
export const WEB_BASE = 'https://foxinix.qzz.io';

export const session = {
  access: '', refresh: '', user: null, pendingEmail: '',
  /* W30e: true = sesión legada (inyectada con tokens en localStorage,
     como hacen las pruebas). En modo normal el refresh vive solo en la
     cookie HttpOnly y aquí ni se guarda. */
  legacy: false,
};

/* W45g: realtime.js registra aquí su stopWS. api.js no lo importa
   directamente para no crear un ciclo; así CUALQUIER salida de sesión
   (logout, 401 real, cancelar verificación) corta la WebSocket. */
export const sessionHooks = { onLogout: null };

export class ApiError extends Error {
  constructor(status, detail, retryAfter = 0, spam = false) {
    super(detail);
    this.status = status;   // 0 = sin conexión / timeout
    this.detail = detail;
    this.retryAfter = retryAfter;
    this.spam = spam;       // W18: 429 del anti-spam de mensajes
  }
}

/* W77: traduce errores técnicos de red/servidor a mensajes humanos
   para mostrar al usuario en lugar de códigos crudos como "Error 500"
   o "Fallo de red". Devuelve una cadena ya traducida (vía t()). */
export function humanError(e) {
  if (!(e instanceof ApiError)) return t('Algo salió mal. Inténtalo de nuevo.');
  /* status 0 = fallo de red / timeout / sin conexión */
  if (e.status === 0) {
    if (e.detail && e.detail.includes('tiempo')) return t('El servidor tardó demasiado en responder. Inténtalo de nuevo.');
    return t('No se pudo conectar con el servidor. Revisa tu conexión a internet.');
  }
  /* 5xx = caída del servidor */
  if (e.status >= 500) {
    return t('Algo salió mal en nuestros servidores. Por favor, inténtalo de nuevo más tarde.');
  }
  /* 4xx (excepto 401/403 que se manejan aparte) -> usar el detalle si es legible.
     W97: el backend responde en español, así que pasa por t() — si no hay
     clave EN, t() devuelve el original y no se pierde nada. */
  if (e.detail && e.detail.length > 0 && !e.detail.includes('Error')) {
    return t(e.detail);
  }
  return t('Algo salió mal. Inténtalo de nuevo.');
}

/* ---------- persistencia ---------- */
/* W30e: el refresh ya NO se guarda en localStorage — vive en una cookie
   HttpOnly del servidor (fm_rt); el access solo en memoria. En el
   localStorage queda {user, pendingEmail}. Se conserva la lectura del
   formato legado (con access/refresh) porque las pruebas inyectan la
   sesión así; a eso se le llama modo "legacy" y saveSession escribe los
   tokens tal cual para no romperlas. */
export function loadSession() {
  try {
    const raw = JSON.parse(StorageAdapter.getItem(SKEY) || 'null');
    if (raw && (raw.access || raw.refresh || raw.user || raw.pendingEmail)) {
      session.access = raw.access || '';
      session.refresh = raw.refresh || '';
      session.user = raw.user || null;
      session.pendingEmail = raw.pendingEmail || '';
      session.legacy = !!(raw.access || raw.refresh);
      store.hasSession = true;
      if (session.user) store.user = session.user;
      if (session.pendingEmail) store.pendingEmail = session.pendingEmail;
      return;
    }
  } catch (e) {}
  session.access = session.refresh = '';
  session.user = null;
  session.pendingEmail = '';
  session.legacy = false;
  store.hasSession = false;
}

export function saveSession() {
  try {
    const out = { user: session.user, pendingEmail: session.pendingEmail };
    if (session.legacy) { out.access = session.access; out.refresh = session.refresh; }
    StorageAdapter.setItem(SKEY, JSON.stringify(out));
  } catch (e) {}
}

export function clearSession() {
  if (sessionHooks.onLogout) {
    try { sessionHooks.onLogout(); } catch (e) {}
  }
  try { StorageAdapter.removeItem(SKEY); } catch (e) {}
  session.access = session.refresh = '';
  session.user = null;
  session.pendingEmail = '';
  session.legacy = false;
  store.hasSession = false;
  store.user = null;
  store.chats = [];
  store.chatsReady = false;   // W65
  store.activeChatId = 0;
  store.pendingEmail = '';
  store.pendingInfo = null;
  /* chat (W2): soltar todo el estado en vivo */
  store.msgs = {};
  store.loaded = {};
  store.syncNeeded = {};
  store.hasMore = {};
  store.loadingOlder = false;
  store.chatLoading = false;   // W27h
  store.typing = {};
  store.readSeqs = {};
  store.deliveredSeqs = {};
  store.ws = 'off';
  store.search = '';
  store.showArchived = false;
  store.newChatOpen = false;
  store.newChatMode = 'dm';
  /* W6: nada de la cuenta puede quedar visible en la pantalla principal.
     También se limpian los estados que antes sobrevivían al logout y
     reaparecían al entrar con otra cuenta en el mismo dispositivo. */
  store.settingsOpen = false;
  store.settingsAtHome = false;
  store.settingsTab = 'apariencia';
  store.meProfileOpen = false;
  store.meEditOpen = false;
  store.profile = null;
  store.requestSent = null;
  store.requestsJump = 0;
  store.pendingUser = 0;
  store.confirmBox = null;
  store.drafts = {};
  store.gifFavs = [];
  store.gifFavsLoaded = false;
  store.pinsRev = 0;
  store.spoilSeen = {};
  store.linkPrev = {};
  store.presence = {};
  store.notifyTarget = null;
  store.jumpMsg = 0;
  store.pendingPath = null;
  store.people = null;
  store.blocks = [];
  store.peopleMobile = false;
  store.peopleTab = 'active';
  store.call = null;
  store.dlSaved = {};
  store.dlRev++;
  store.dlAutoRev++;
  store.readsBox = null;
  store.lb = null;
  store.pinsModal = false;
  store.galModal = false;
  store.ctx = null;
  store.reactFor = 0;
  store.editFor = 0;
  store.editDraft = '';
  store.infoOpen = false;
  store.info = null;
  store.grpEdit = { chatId: 0, src: '' };
  store.pwOpen = false;
  store.emOpen = false;
  store.renameGroupId = 0;
  store.renameGroupTitle = '';
  store.wallPanelOpen = false;
  store.permGate = null;
  resetDownloadStore();
}

/** Aplica la respuesta de register/login (tokens + usuario + verificación).
    W30e: en un login real el refresh viaja en la cookie HttpOnly que el
    server setea; en memoria queda SOLO el access. */
export function applyAuth(res) {
  /* En la web el refresh viaja en una cookie HttpOnly (`fm_rt`) y el
     access solo vive en memoria. NativeScript NO tiene cookie jar, así
     que ahí se guarda el refresh en el almacenamiento local (modo
     "legado") y se manda en el body del POST /auth/refresh. */
  session.legacy = !CookieAdapter.supportsCookies();
  session.refresh = (session.legacy && res.tokens && res.tokens.refresh)
    ? res.tokens.refresh : '';
  if (res.tokens) {
    session.access = res.tokens.access;
  }
  store.hasSession = !!session.access || !!session.refresh;
  if (res.user) {
    session.user = res.user;
    store.user = res.user;
  }
  if (res.verification && res.verification.required) {
    session.pendingEmail = res.verification.email_masked || session.pendingEmail;
    store.pendingEmail = session.pendingEmail;
    store.pendingInfo = res.verification;
  } else if (res.user) {
    session.pendingEmail = '';
    store.pendingEmail = '';
    store.pendingInfo = null;
  }
  saveSession();
}

/* ---------- HTTP ---------- */
function authHeaders(extra) {
  const h = Object.assign({}, extra);
  if (session.access) h.Authorization = 'Bearer ' + session.access;
  return h;
}

async function errDetail(res) {
  let detail = t('Error {n}', { n: res.status });
  let retryAfter = 0;
  let spam = false;
  try {
    const j = await res.json();
    const d = j.detail;
    if (typeof d === 'string') {
      detail = d;
    } else if (d && typeof d === 'object' && !Array.isArray(d)) {
      if (d.message) detail = d.message;
      if (d.retry_after != null) {
        retryAfter = d.retry_after;
        /* W18: el server marca los 429 del anti-spam de mensajes. */
        if (d.spam) spam = true;
        // Dinámico: se traduce ya armado (t() deja pasar el inglés).
        if (!d.message) detail = t('Espera {n}s antes de reintentar', { n: d.retry_after });
      }
    } else if (d) {
      detail = 'Datos inválidos';
    }
  } catch (e) {}
  return { detail, retryAfter, spam };
}

let refreshing = null;
/* W29a: el refresh reintenta (hasta 3) ante red caída o 5xx con un
   pequeño backoff; solo un 401/403 REAL del refresh cuenta como
   sesión vencida. Así un corte de red o un 500 momentáneo del server
   ya no provocan el falso "Sesión expirada" con re-login. Las
   peticiones paralelas siguen compartiendo el mismo refresh. */
export function refreshTokens() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      /* W30e: si la sesión se cerró mientras refrescábamos (logout o
         cancelación de verificación en el arranque), abortar: un refresh
         en vuelo jamás debe reanimar el estado local. */
      if (!store.hasSession) throw new ApiError(401, 'Sesión expirada');
      if (attempt) {
        await new Promise(function (r) { setTimeout(r, 800 * attempt); });
      }
      let res;
      try {
        /* W30e: si hay refresh legado en memoria va en el body; si no,
           el server usa su cookie HttpOnly (credentials lo incluye). */
        res = await HttpClient.fetch(API_BASE + '/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ refresh: session.refresh || '' }),
        });
      } catch (e) {
        lastErr = new ApiError(0, 'Sin conexión con el servidor');
        continue;   // red caída: vale la pena un reintento
      }
      if (res.ok) {
        const j = await res.json();
        /* W30e: la sesión pudo cerrarse mientras el refresh volvía; en ese
           caso ni el access en memoria ni la clave en localStorage se
           tocan (clearSession() mandó). Así un refresh en vuelo no puede
           reescribir fm.session después de borrarla. */
        if (!store.hasSession) throw new ApiError(401, 'Sesión expirada');
        session.access = j.tokens.access;
        /* En modo normal el refresh nuevo ya está en la cookie; solo el
           modo legado lo sigue guardando en memoria/localStorage. */
        if (session.legacy) session.refresh = j.tokens.refresh;
        saveSession();
        return;
      }
      if (res.status === 401 || res.status === 403) {
        // El refresh token ya no sirve: esto SÍ es sesión vencida.
        throw new ApiError(401, 'Sesión expirada');
      }
      /* 5xx: reintenta, pero NO es una sesión vencida. El texto evita
         que un fallo temporal del refresh se muestre como "Sesión
         expirada" en el toast de la acción que lo disparó. */
      lastErr = new ApiError(res.status, 'No se pudo renovar la sesión');
    }
    throw lastErr || new ApiError(0, 'Sin conexión con el servidor');
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export function authLost() {
  clearSession();
  const fb = authFallback();
  if (fb) go(fb);
}

/* Renueva el access. Solo cierra la sesión si el refresh rechazó el
   token (401/403); un 5xx o una caída de red se propagan sin tocar la
   sesión, para no sacar al usuario por un fallo temporal. */
async function renewSession() {
  try {
    await refreshTokens();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      authLost();
      throw new ApiError(401, 'Tu sesión expiró, vuelve a iniciar sesión');
    }
    throw e;
  }
}

/* Un 401 de estos significa que el ACCESS ya no sirve (vencido, corrupto,
   revocado o ausente). Los 401 de operación —contraseña actual incorrecta,
   código de verificación incorrecto, credenciales de login— NO deben
   refrescar ni cerrar la sesión: el usuario tiene que ver su error real.
   Distinguirlos por el detalle evita mantener una lista de rutas y cubre
   también verify/resend con un access pendiente vencido. */
const TOKEN_401_RE = /^(?:Sesión expirada|Sesión inválida|Falta el token|Token inválido)/i;

async function isToken401(res) {
  try {
    const j = await res.clone().json();
    const d = j && j.detail;
    const msg = typeof d === 'string' ? d : ((d && d.message) || '');
    return TOKEN_401_RE.test(msg);
  } catch (e) {
    /* Sin cuerpo JSON reconocible: ante la duda, intentar el refresh es
       más seguro que dejar al usuario con un falso "Sesión expirada". */
    return true;
  }
}

/** api('GET', '/...', body?, {retry401}) → JSON | null. Lanza ApiError.
    Por defecto, un 401 de token refresca el access y reintenta una vez.
    Antes era opt-in y casi ninguna llamada lo activaba: al vencer el access
    de 3 h, enviar/abrir un chat mostraba el 401 crudo ("Sesión expirada…")
    aunque la cookie de refresh siguiera válida; al recargar, bootstrap sí
    refrescaba y todo volvía a funcionar.
    retry401:false es solo para el reintento interno. */
export async function api(method, path, body, opts = {}) {
  const retry401 = opts.retry401 !== false;
  /* W82: al recargar el access NO existe (solo vive en memoria), así que
     los cargadores iniciales (/chats, /assets, /gifs/favorites) salían SIN
     Bearer → 401 en consola → refresh → reintento (ráfaga cosmética que se
     auto-cura). Con sesión local y sin access se espera aquí el refresh —
     compartido: UNA POST para toda la ráfaga — y la petición ya sale con
     token. Si el pre-refresh falla (red, 5xx, sesión muerta) se ignora y
     todo sigue exactamente como antes: el flujo 401 → refresh → retry de
     abajo sigue siendo el respaldo. */
  if (retry401 && store.hasSession && !session.access) {
    try { await refreshTokens(); } catch (e) {}
  }
  /* W81: la API vive en OTRO origen (api.foxinix.qzz.io). Sin
     credentials:'include' el navegador ni envía ni GUARDA la cookie
     fm_rt que setea el login, así que cada recarga moría en 401
     (refresh sin cookie → cascada). Cubre login/register y el resto. */
  const http = {
    method,
    credentials: 'include',
    headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  if (body !== undefined) http.body = JSON.stringify(body);

  let res;
  try {
    res = await HttpClient.fetch(API_BASE + path, http);
  } catch (e) {
    throw new ApiError(0, 'Sin conexión con el servidor');
  }

  /* W30e: el refresh puede venir de la cookie HttpOnly aunque en memoria
     no quede session.refresh; por eso ya no se exige ese guard. */
  if (res.status === 401 && retry401 && (await isToken401(res))) {
    await renewSession();
    /* Un solo refresh por llamada. Si el reintento vuelve a dar 401, se
       propaga el detalle del endpoint: puede ser un 401 legítimo de la
       operación (p. ej. contraseña actual incorrecta), no del token. */
    return api(method, path, body, Object.assign({}, opts, { retry401: false }));
  }
  if (!res.ok) {
    const e = await errDetail(res);
    /* W18: un 429 del anti-spam levanta la pantalla de aviso (bloquea
       10 s y solo se cierra con "Ok, perdón"). Si ya está arriba no se
       reinicia la cuenta regresiva. */
    if (e.spam && (!store.spamUntil || store.spamUntil < Date.now())) {
      store.spamUntil = Date.now() + 10000;
    }
    throw new ApiError(res.status, e.detail, e.retryAfter, e.spam);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ---------- subida de archivos (XHR: da progreso y acepta 401→refresh) ---------- */
/* W27: foto del grupo (multipart; el server valida owner/admin). La lista
   se refresca sola con el evento WS 'chat_updated'. */
export async function uploadChatAvatar(chatId, file, _retried) {
  const fd = new FormData();
  fd.append('file', file);
  let res;
  try {
    res = await HttpClient.fetch(API_BASE + '/chats/' + chatId + '/avatar', {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
  } catch (e) {
    throw new ApiError(0, 'Sin conexión con el servidor');
  }
  /* W45b: este fetch no pasa por api(); sin esto, la foto de grupo
     mostraba "Sesión expirada" al vencer el access aunque el refresh
     siguiera válido. Reintenta una sola vez con el access nuevo. */
  if (res.status === 401 && !_retried) {
    await renewSession();
    return uploadChatAvatar(chatId, file, true);
  }
  if (!res.ok) {
    const e = await errDetail(res);
    throw new ApiError(res.status, e.detail, e.retryAfter, e.spam);
  }
  return res.json();
}

/* ctl (opcional): recibe ctl.abort() para cancelar; el rechazo entonces
   lleva e.canceled = true y el llamador no lo trata como error (W11). */
export function uploadMedia(file, onProgress, ctl) {
  return new Promise((resolve, reject) => {
    let xhr = null;
    let settled = false;
    if (ctl) {
      ctl.abort = function () {
        settled = true;
        if (xhr) { try { xhr.abort(); } catch (e) {} }
        const err = new ApiError(0, 'Subida cancelada');
        err.canceled = true;
        reject(err);
      };
    }
    const attempt = (retried) => {
      const x = new XMLHttpRequest();
      xhr = x;
      x.open('POST', API_BASE + '/media');
      x.setRequestHeader('Authorization', 'Bearer ' + session.access);
      x.timeout = 300000; // 5 min para enlaces lentos
      x.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      x.onload = () => {
        if (settled) return;
        if (x.status >= 200 && x.status < 300) {
          try { resolve(JSON.parse(x.responseText)); }
          catch (e) { reject(new ApiError(500, 'Respuesta inválida del servidor')); }
        } else if (x.status === 401 && !retried) {   // W30e: refresh vía cookie
          /* renewSession cierra solo si el refresh rechazó el token; un
             5xx/red se propaga sin logout. */
          renewSession().then(() => attempt(true)).catch((e) => {
            if (!settled) reject(e);
          });
        } else {
          let detail = 'Error ' + x.status;
          try {
            const d = JSON.parse(x.responseText).detail;
            if (typeof d === 'string') detail = d;
            else if (d && d.message) detail = d.message;
            else if (x.status === 413) detail = 'El archivo supera los 15 MB';
            else if (x.status === 507) detail = 'Se llenó la cuota de almacenamiento';
          } catch (e) {}
          reject(new ApiError(x.status, detail));
        }
      };
      x.onerror = () => { if (!settled) reject(new ApiError(0, 'Sin conexión con el servidor')); };
      x.ontimeout = () => { if (!settled) reject(new ApiError(0, 'La subida tardó demasiado')); };
      const fd = new FormData();
      fd.append('file', file);
      x.send(fd);
    };
    attempt(false);
  });
}

/* ---------- arranque de sesión ---------- */
/* W38: fase "Descargando los recursos…" — el SW da de alta el shell y
   la caché de emojis; se espera a que esté ACTIVO (rápido desde la
   segunda visita) con tope de 2,5 s para no colgar el arranque. */
function resourcesReady() {
  return DomAdapter.waitForServiceWorker(2500);
}

/* W70: reintento del arranque cuando falló por red y la sesión sigue
   abierta pero todavía no hay usuario cacheado (no hay nada que
   mostrar). El listener de 'online' en main.js también lo relanza. */
let bootRetryTimer = 0;
function scheduleBootRetry() {
  if (bootRetryTimer) return;
  bootRetryTimer = setTimeout(function () {
    bootRetryTimer = 0;
    bootstrap();
  }, 4000);
}

export async function bootstrap() {
  loadSession();
  if (bootRetryTimer) { clearTimeout(bootRetryTimer); bootRetryTimer = 0; }
  if (!store.hasSession) {
    const fb = authFallback();
    if (fb) goReplace(fb);
    else if (store.route === 'boot') goReplace('login');
    return;
  }
  /* W38: recursos listos → "Iniciando sesión…" y a la vez se pide el
     usuario al server (con retry401: refresca el token si venció). */
  await resourcesReady();
  store.bootPhase = 'session';
  /* W66g: en un login normal el access solo vive en memoria (el refresh
     es cookie HttpOnly): al recargar, la primera petición salía SIN
     Bearer, devolvía 401 y se auto-resolvía con retry401 —funcionaba,
     pero la consola se llenaba de 401s. Se renueva ANTES. Si falla, el
     /users/me de abajo replica el comportamiento de siempre. */
  if (!session.access) {
    try { await renewSession(); } catch (e) {}
  }
  try {
    const r = await api('GET', '/users/me', undefined, { retry401: true });
    // W6: si la sesión se cerró durante el arranque, no revivir el usuario
    if (!store.hasSession) return;
    /* W59: /users/me también trae username_changed_at. No reescribimos
       localStorage aquí: otra pestaña pudo cambiar de sesión mientras
       la petición estaba en vuelo. La marca se refresca en cada arranque
       y el cambio explícito de usuario sí guarda la sesión. */
    store.user = r.user;
    if (store.route !== 'app') goReplace('app');
  } catch (e) {
    if (e.status === 403) {
      // Scope 'pending' (cuenta sin verificar): la verificación NO se retoma
      // al recargar. Se cancela la sesión local y vuelve al login; la cuenta
      // queda sin usar y un registro nuevo con el mismo correo la reemplaza
      // (el server descarta los registros sin verificar).
      clearSession();
      goReplace('login');
      toast('Verificación cancelada. Vuelve a iniciar sesión o regístrate de nuevo', 'info');
    } else if (e.status === 401) {
      const fb = authFallback();
      goReplace(fb || 'login');
    } else if ((e.status === 0 || e.status >= 500) && store.hasSession) {
      /* W70: sin conexión (status 0) o el server respondió 5xx con la
         sesión abierta: ANTES esto mandaba al login — "perder" la sesión
         por un fallo de red. Ahora el usuario cacheado entra al chat en
         modo offline (el overlay "Sin conexión" avisa y la lista se
         recarga al volver la red); sin usuario cacheado no hay nada que
         mostrar todavía: se queda en el arranque y se reintenta. La
         verificación pendiente se respeta (su flujo decide). */
      if (store.user) {
        if (store.route !== 'app') goReplace('app');
      } else if (store.route !== 'verify') {
        scheduleBootRetry();
      } else {
        toast(humanError(e), 'err');
      }
    } else {
      const fb = authFallback();
      goReplace(fb || 'login');
      toast(humanError(e), 'err');
    }
  }
}

export function logout() {
  /* W30e: avisa al server para revocar la sesión (sube token_version y
     borra la cookie del refresh); el refresh legado (en memoria) va en
     el body porque sin cookie no hay otra forma de identificarlo.
     Fire-and-forget: si no hay red el cierre local igual procede. */
  try {
    HttpClient.fetch(API_BASE + '/auth/logout', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: session.refresh || '' }),
    }).catch(function () {});
  } catch (e) {}
  clearSession();
  goReplace('login');
}

/* ---------- W35c: vista previa de enlaces ---------- */

/* Pide la "portada" (og:title/og:image/…) de un enlace http(s) al
   server y la guarda en store.linkPrev (caché por sesión). Dedupe por
   URL: si ya se pidió no se repite; un error no se reintenta (evita
   bucles contra un sitio caído). */
export function ensurePreview(url) {
  const cur = store.linkPrev[url];
  if (cur && cur.status !== 'err') return;
  store.linkPrev[url] = { status: 'loading' };
  api('POST', '/link-preview', { url: url }).then(function (r) {
    store.linkPrev[url] = {
      status: 'ok', type: r.type || 'link', url: r.url || url,
      title: r.title || '', desc: r.desc || '', image: r.image || '',
      icon: r.icon || '', site: r.site || '',
    };
  }).catch(function () {
    store.linkPrev[url] = { status: 'err' };
  });
}
