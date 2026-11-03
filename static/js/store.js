/* Estado global + router W22 (History API: rutas reales, sin #).
   No importa api.js (sin ciclos). */
const { reactive, watch } = Vue;

export function readLs(key) {
  try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

export const store = reactive({
  route: 'boot',          // boot | login | register | profile | verify | forgot | reset | app
  hasSession: false,      // espejo de los tokens en localStorage
  user: null,             // usuario público (scope full)
  pendingEmail: '',       // correo enmascarado para la verificación
  pendingInfo: null,      // {email_masked, resend_after, attempts_left, retry_after}

  /* W27h: "Cargando…" del arranque: la pantalla principal se revela
     cuando ya están la lista de chats, la gente (perfiles) y los
     mensajes del chat inicial. */
  booting: true,
  /* W38: fase real del arranque — la pantalla de carga la muestra con
     su barra de progreso y su texto ("Descargando los recursos…",
     "Iniciando sesión…", …). La avanzan bootstrap() (api.js) y
     bootAll() (views/chat.js) al terminar cada fase. */
  bootPhase: 'resources',
  /* ---- chat (W2) ---- */
  chats: [],
  activeChatId: 0,
  /* W22: chat pendiente de abrir desde la URL (deep link o botón atrás):
     {kind:'user'|'group', id} — lo resuelve actions.resolvePendingChat. */
  pendingPath: null,
  /* W65: un enlace /app/user/<id> sin MD se resuelve contra la API de
     perfiles (amistad → abrir MD; sin relación → solicitud automática).
     Mientras tanto la URL no debe reescribirse. */
  pendingUser: 0,
  /* W65: loadChats ya terminó (aunque no haya ni un chat). */
  chatsReady: false,
  /* W65: modal único de "Solicitud enviada" (enlace directo y ＋). */
  requestSent: null,      // {username, display_name} | null
  requestsJump: 0,        // gatillo: abrir Personas → Solicitudes
  /* W57: destino de una notificación {chatId, msgId, tries}. Se resuelve
     cuando la lista de chats ya está cargada (también en arranque frío). */
  notifyTarget: null,
  jumpMsg: 0,             // W22: id de mensaje al que saltar (?m= en la URL)
  /* W29d: spoilers revelados por chat — se vacía al salir del chat */
  spoilSeen: {},           // chatId → {msgId: 1}
  /* W35c: caché de "portadas" de enlaces por URL (en memoria) */
  linkPrev: {},            // url → {status, type, url, title, desc, image, icon, site}
  /* W36k: favoritos de GIFs (biblioteca y subidos) */
  gifFavs: [],             // [{media_id, name, url}]
  gifFavsLoaded: false,
  /* W60: stickers favoritos (el emoji ES el sticker). Persisten en el
     dispositivo para que el panel abra con los de siempre. */
  stkFavs: (function () {
    try {
      const v = JSON.parse(readLs('fm.stkFavs') || '[]');
      return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string' && s; }) : [];
    } catch (e) { return []; }
  })(),
  /* W61: biblioteca personal de GIFs/stickers subidos (máx. 10 de cada
     tipo). Los carga /assets al abrir el selector. */
  userAssets: { gifs: [], stickers: [] },
  userAssetsLoaded: false,
  pinsRev: 0,             // W28c: gatillo para refrescar los fijados abiertos
  msgs: {},               // chatId → array de mensajes (crudos)
  loaded: {},             // chatId → mensajes iniciales ya pedidos
  syncNeeded: {},         // chatId → la WS se reconectó; falta catch-up
  hasMore: {},            // chatId → quedan antiguos por cargar
  loadingOlder: false,
  /* W27h: pedidos de mensajes en vuelo del chat abierto ("Cargando…") */
  chatLoading: false,
  typing: {},             // chatId → true mientras el peer escribe
  presence: {},           // W26: userId → online (eventos WS + snapshot al reconectar)
  /* W58: descargas de la app (clave de ruta → tamaño). Se hidrata al
     arrancar y la actualizan las descargas automáticas/manuales. */
  dlSaved: {},
  dlRev: 0,
  dlAutoRev: 0,
  /* W58: puerta de permisos a pantalla completa. */
  permGate: null,
  versionUpdate: false,
  versionInfo: null,
  versionDownloading: false,
  versionProgress: 0,
  versionError: false,         // {kind, icon, title, text, state, index, total, busy, error}
  permStates: {},         // kind → granted | denied | prompt | unavailable
  readSeqs: {},           // chatId → {userId: seq} (eventos 'read' recibidos)
  deliveredSeqs: {},      // chatId → {userId: seq} (eventos 'delivered', W12)
  ws: 'connecting',       // off | connecting | on
  call: null,             // W28h: llamada WebRTC 1:1 en curso | null
  /* W64: presencia de salas de grupo ajenas a mi llamada:
     chatId → {callId, count, video, host}. Permite el botón verde y el
     contador sin que el usuario esté dentro de la llamada. */
  groupCalls: {},
  search: '',             // filtro de la lista de chats
  showArchived: false,    // ver la pestaña de chats/grupos archivados
  /* W60: la sección Archivados es privada. El bloqueo se guarda como
     hash SHA-256 en localStorage y se desbloquea por sesión. */
  archiveUnlocked: false,
  archiveLockPrompt: false,
  archiveLockErr: '',
  /* Se hidrata al cargar; las funciones de abajo lo mantienen al día. */
  archiveHasLock: !!readLs('fm.archive.lock'),
  archiveLockBusy: false,
  /* Visor de descargas dentro de la app (sin abrir pestañas). */
  dlViewer: null,         // {name, mime, url, kind, size} | null
  newChatOpen: false,     // modal "nuevo chat"
  newChatMode: 'dm',      // dm | group | add (agregar miembro al grupo activo)
  /* ---- W27: panel Personas/Amigos (en el centro, sin chat abierto) ---- */
  people: null,           // {friends:[], sent:[], received:[]} | null
  blocks: [],             // W28e: ids de los usuarios que yo bloqueé
  /* ---- W6: panel de usuario, perfil y ajustes ---- */
  settingsOpen: false,    // modal "Ajustes"
  /* W62: Ajustes en móvil muestra la barra inferior en la portada de
     categorías y la oculta al entrar a una categoría. */
  settingsAtHome: false,
  settingsTab: 'apariencia',  // apariencia | notificaciones | chat | privacidad | descargas | atajos | cuenta (W8: cuenta = última)
  meProfileOpen: false,   // modal "Tu perfil" (solo vista; W27b)
  meEditOpen: false,      // modal "Editar perfil" (foto, nombre, estado, bio)
  unameOpen: false,       // W60: modal aparte para cambiar el @usuario
  peopleMobile: false,    // W27b: pantalla Personas a pantalla completa (móvil)
  peopleTab: 'active',    // W27c: pestaña de Personas (la reinicia el sidebar)
  /* W27b: foto de grupo en edición { chatId, src, initial } — vive en el
     panel de info del chat */
  grpEdit: { chatId: 0, src: '' },
  /* W68: modal "unirse al grupo por enlace": {pubId, title, avatarUrl,
     memberCount, joining, error} | null (lo abre resolvePendingChat) */
  joinPrompt: null,
  profile: null,          // ventana flotante de perfil: {loading, user, error} | null
  confirmBox: null,       // {title, text, danger, requireUser, requirePassword, ...}
  /* W57: renombrar grupo (solo owner/admin) */
  renameGroupId: 0,
  renameGroupTitle: '',
  readsBox: null,         // W28f: {chatId, msgId, rows: null|[usuarios], total, loading, error}
  lb: null,               // W8: visor de imágenes {url} — W29l: también desde la info
  pwOpen: false,          // W8: ventana "cambiar contraseña" (desde Ajustes)
  emOpen: false,          // W8: ventana "cambiar correo" (desde Ajustes)
  /* ---- W7: info del chat, menú contextual, picker de reacciones ---- */
  infoOpen: false,        // panel derecho "info del chat" (default: pantalla ancha)
  info: null,             // {chatId, loading, members: [], error} | null
  groupProfile: null,     // W78: {chat, members[], gallery[]} para el modal de perfil de grupo
  pinsModal: false,       // W29l: modal "Mensajes fijados" (abre desde la info)
  galModal: false,        // W29l: modal "Archivos y medios" (abre desde la info)
  ctx: null,              // menú contextual {x, y, items: [{label, danger, fn}]}
  reactFor: 0,            // id de mensaje cuyo picker se abre desde el menú
  /* ---- W8: editar mensaje en línea ---- */
  editFor: 0,             // id del mensaje que se está editando (0 = ninguno)
  editDraft: '',          // texto en curso de la edición
  /* apariencia: el pre-paint de index.html ya los aplicó al DOM */
  theme: document.documentElement.getAttribute('data-theme') || 'dark',
  accent: readLs('fm.accent') || '#ff751f',
  wall: readLs('fm.wall'),
  /* W19: foto de fondo (data-URL) y sidebar contraído (escritorio) */
  wallimg: readLs('fm.wallimg'),
  sideCollapsed: readLs('fm.side') === '1',
  /* W20: ajustes del fondo — opacidad del velo (0-100, 50 por defecto),
     difuminado en px (0-20) — y dispositivo de micrófono preferido */
  wdim: readLs('fm.wdim') === '' ? 50 : parseInt(readLs('fm.wdim'), 10) || 0,
  wblur: parseInt(readLs('fm.wblur'), 10) || 0,
  micDev: readLs('fm.mic'),
  wallPanelOpen: false,
  font: document.documentElement.getAttribute('data-font') || 'normal',
  /* W10: idioma de la interfaz (pre-paint setea <html lang> sin parpadeo) */
  lang: document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'es',
  /* preferencias de chat (dispositivo): default encendido si no hay clave */
  prefs: {
    sound: readLs('fm.p.sound') !== '0',
    typing: readLs('fm.p.typing') !== '0',
    receipts: readLs('fm.p.receipts') !== '0',
    enter: readLs('fm.p.enter') !== '0',
    /* W17: hora de 12 horas (am/pm). Default: 24 h. */
    h12: readLs('fm.p.h12') === '1',
    /* W63: tono de mensaje y de llamada seleccionados. 'default' = el
       tono del sistema; otro valor es la clave del tono (archivo bajo
       /tonos/) o un tono subido por el usuario. */
    messageTone: readLs('fm.p.messageTone') || 'default',
    callTone: readLs('fm.p.callTone') || 'default',
    /* W40: estilo de los emojis — 'system' (fuente del sistema,
       default: cero descargas), 'noto' (imágenes de Google) o
       'twemoji' (imágenes Twemoji del sitio). */
    emo: (function (v) {
      return (v === 'noto' || v === 'twemoji') ? v : 'system';
    })(readLs('fm.p.emo')),
    /* W78: desactiva TODAS las animaciones/transiciones/desenfoques de la
       UI para PCs de gama baja o fatiga visual. Se lee al arranque y se
       persiste como fm.p.noAnim. */
    noAnim: readLs('fm.p.noAnim') === '1',
    /* W78: desactiva la reproducción automática de GIFs, stickers
       animados y efectos de pantalla completa para evitar distracciones
       o crisis de fotosensibilidad (TDAH, autismo, epilepsia).
       Persiste como fm.p.reduceStimuli. */
    reduceStimuli: readLs('fm.p.reduceStimuli') === '1',
  },
  drafts: {},             // chatId → borrador de entrada
  /* W17: el selector de emojis del composer vive aquí para que solo
     haya UN panel flotante abierto a la vez (chips/menú lo cierran).
     W29g: ese panel ahora tiene 3 pestañas (Emojis/Stickers/GIFs). */
  emoOpen: false,
  /* W18: ms (Date.now) hasta los que el aviso anti-spam bloquea la
     pantalla. Lo levanta api.js con el 429 {spam:true} del server. */
  spamUntil: 0,

  online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  toasts: [],
});

/* W38: fases del arranque, en orden — su texto y el progreso de la
   barra de la pantalla de carga (views/bootscreen.js). store.bootPhase
   guarda la clave de la fase activa; la avanzan bootstrap() (api.js)
   y bootAll() (views/chat.js). */
export const BOOT_PHASES = [
  { key: 'resources', progress: 0.15, txt: 'Descargando los recursos…' },
  { key: 'session', progress: 0.35, txt: 'Iniciando sesión…' },
  { key: 'chats', progress: 0.60, txt: 'Cargando los mensajes…' },
  { key: 'people', progress: 0.80, txt: 'Cargando usuarios…' },
  { key: 'previews', progress: 0.93, txt: 'Cargando vista previas…' },
  { key: 'ready', progress: 1, txt: 'Cargando…' },
];

const PUBLIC_ROUTES = ['login', 'register', 'forgot', 'reset'];
const AUTH_ROUTES = ['profile', 'verify', 'app'];

function guard(name) {
  if (AUTH_ROUTES.includes(name) && !store.hasSession) return 'login';
  return name;
}

/* ---------- W22: router con History API (rutas reales, sin #) ----------

   La URL se deriva del estado (fuente única de verdad) y el estado se
   aplica desde la URL (arranque y botón atrás/adelante):

     /login /register /profile /verify /forgot /reset   vistas públicas
     /app                                                sin chat abierto
     /app/user/<id del peer>                             chat DM
     /app/group/<id del chat>                            grupo
     ?settings=1                                         Ajustes abierto
     ?m=<id del mensaje>                                 salto (permalink)

   Al abrir algo la app empuja una entrada; al cerrar usa atrás si la
   entrada inferior ya es el destino (el historial no se ensucia) o
   replace si venimos de un deep link. */
const ROUTE_PATHS = {
  boot: '/',
  login: '/login',
  register: '/register',
  profile: '/profile',
  verify: '/verify',
  forgot: '/forgot',
  reset: '/reset',
  app: '/app',
};
const KNOWN_ROUTES = Object.keys(ROUTE_PATHS);

/* W65: nombres públicos de las categorías de Ajustes en la URL. Los
   valores internos siguen en español (no rompen el estado ni los tests),
   pero la URL usa nombres semánticos en inglés.
   ?settings=main solo tiene sentido en móvil (portada de categorías). */
export const SETTINGS_SLUGS = {
  apariencia: 'appearance',
  notificaciones: 'notifications',
  chat: 'chat',
  privacidad: 'privacy',
  descargas: 'downloads',
  atajos: 'shortcuts',
  cuenta: 'account',
};
const SETTINGS_TABS = Object.keys(SETTINGS_SLUGS).reduce(function (out, tab) {
  out[SETTINGS_SLUGS[tab]] = tab;
  return out;
}, {});

/** Categoría interna → nombre de la URL. */
export function settingsSlug(tab) {
  return SETTINGS_SLUGS[tab] || SETTINGS_SLUGS.apariencia;
}

let nav = null;   // espejo de las entradas que empuja la app (atrás/cierre)

function locPath() { return location.pathname + location.search; }

function chatById(id) {
  if (!id) return null;
  for (let i = 0; i < store.chats.length; i++) {
    if (store.chats[i].id === id) return store.chats[i];
  }
  return null;
}

function splitPath(p) {
  const i = p.indexOf('?');
  const path = i < 0 ? p : p.slice(0, i);
  const params = {};
  const qs = i < 0 ? '' : p.slice(i + 1);
  qs.split('&').forEach(function (kv) {
    if (!kv) return;
    const j = kv.indexOf('=');
    params[decodeURIComponent(j < 0 ? kv : kv.slice(0, j))] =
      decodeURIComponent(j < 0 ? '' : kv.slice(j + 1));
  });
  return { path: path, params: params };
}

/** URL que corresponde al estado actual. */
export function urlForState() {
  if (store.route !== 'app') return ROUTE_PATHS[store.route] || '/';
  let path = '/app';
  const chat = chatById(store.activeChatId);
  if (chat) {
    /* W68: el DM se direcciona por el ID público del PEER (16 dígitos) y
       el grupo por el suyo (12); el id interno queda como fallback para
       datos aún no serializados. */
    if (chat.type === 'dm' && chat.title && chat.title.id) {
      path = '/app/user/' + (chat.title.pub_id || chat.title.id);
    } else {
      path = '/app/group/' + (chat.pub_id || chat.id);
    }
  } else if (store.profile && store.profile.user && store.profile.user.id) {
    /* W65: el perfil abierto sin chat también es una vista direccionable.
       Así un enlace directo a alguien sin amistad conserva su URL y al
       recargar se vuelve a resolver (sin duplicar solicitudes). */
    path = '/app/user/' + (store.profile.user.pub_id || store.profile.user.id);
  }
  const q = [];
  if (store.settingsOpen) {
    const home = store.settingsAtHome && window.innerWidth <= 760;
    q.push('settings=' + (home ? 'main' : settingsSlug(store.settingsTab)));
  }
  if (store.jumpMsg) q.push('m=' + store.jumpMsg);
  return path + (q.length ? '?' + q.join('&') : '');
}

function writeUrl(path, mode) {
  if (!nav) nav = [locPath()];
  if (locPath() === path) return;   // ya está ahí: nada que tocar
  if (mode === 'push') {
    nav.push(path);
    history.pushState({ fm: 1, nav: nav.length - 1 }, '', path);
  } else {
    nav[nav.length - 1] = path;
    history.replaceState({ fm: 1, nav: nav.length - 1 }, '', path);
  }
}

function closeUrl(want) {
   /* Cerrar desde la UI: si la entrada inferior ya es el destino, atrás
      (el historial queda limpio); si no (deep link), reemplazar. */
  if (nav && nav.length >= 2 && nav[nav.length - 2] === want) {
    history.back();               // el popstate recorta nav (estado ya aplicado)
  } else {
    writeUrl(want, 'replace');
  }
}

/** Cambia de ruta (misma firma que antes). Empuja entrada; con `replace`
    reescribe la actual (redirecciones, arranque y logout). */
export function go(name, replace) {
  const g = guard(name);
  store.route = g;
  writeUrl(ROUTE_PATHS[g] || '/', replace ? 'replace' : 'push');
}

/** Igual que go(), reescribiendo la entrada actual (sin volver atrás). */
export function goReplace(name) { go(name, true); }

/** Ruta a la que volver si no hay sesión válida. */
export function authFallback() {
  const cur = store.route;
  if (PUBLIC_ROUTES.includes(cur)) return null; // quedarse (ej. /register recién abierto)
  return 'login';
}

/** Reemplaza la URL por la que corresponde al estado (sin empujar). */
export function syncUrl() { writeUrl(urlForState(), 'replace'); }

/** Aplica la URL al estado (arranque y botón atrás/adelante). */
function applyState(p) {
  const sp = splitPath(p);
  const seg = sp.path.split('/').filter(function (s) { return s; });
  let route = null;
  let chatRef = null;
  let unknown = false;
  if (!seg.length) {
    /* '/' lo decide la sesión (bootstrap termina el trabajo si hace falta) */
    if (store.user) route = 'app';
    else if (store.hasSession) route = 'boot';
    else route = 'login';
  } else if (seg[0] === 'app') {
    route = 'app';
    /* W68: el segmento es el ID público (16 dígitos usuario / 12 grupo)
       o, en enlaces viejos, el id interno. Se guarda el string CRUDO:
       parseInt perdería precisión (>2^53) y el resolver distingue por
       longitud de dígitos en actions.resolvePendingChat. */
    if (seg[1] === 'user' && seg[2]) {
      chatRef = { kind: 'user', id: seg[2] };
    } else if (seg[1] === 'group' && seg[2]) {
      chatRef = { kind: 'group', id: seg[2] };
    }
  } else if (KNOWN_ROUTES.indexOf(seg[0]) >= 0) {
    route = seg[0];
  } else {
    unknown = true;
    route = store.user ? 'app' : 'login';
  }

  /* guardas */
  if (AUTH_ROUTES.indexOf(route) >= 0 && !store.hasSession) {
    route = 'login';
    chatRef = null;
    writeUrl('/login', 'replace');
  } else if (route === 'login' && store.user) {
    /* Con sesión iniciada el login no existe: de vuelta al chat. */
    route = 'app';
    chatRef = null;
    writeUrl('/app', 'replace');
  } else if (route === 'app' && !store.hasSession) {
    route = 'login';
    chatRef = null;
    writeUrl('/login', 'replace');
  } else if (unknown) {
    writeUrl(ROUTE_PATHS[route], 'replace');
  } else if (route === 'login' && !seg.length) {
    /* sin sesión, la raíz canónica es /login (evita '/' y '/login' vivos) */
    writeUrl('/login', 'replace');
  } else if (route === 'app' && !seg.length) {
    writeUrl('/app', 'replace');
  }

  store.route = route;
  store.pendingUser = 0;   // una navegación nueva cancela la resolución anterior
  if (route === 'app') {
    const rawSettings = sp.params.settings;
    store.settingsOpen = rawSettings != null;
    store.jumpMsg = parseInt(sp.params.m, 10) || 0;
    if (store.settingsOpen) {
      /* W65: slugs semánticos (appearance, notifications, …). `1` sigue
         funcionando para enlaces viejos; `main` es la portada móvil. */
      if (rawSettings === 'main') {
        store.settingsAtHome = window.innerWidth <= 760;
      } else if (rawSettings === '1') {
        store.settingsAtHome = window.innerWidth <= 760;
      } else if (SETTINGS_TABS[rawSettings]) {
        store.settingsTab = SETTINGS_TABS[rawSettings];
        store.settingsAtHome = false;
      } else {
        store.settingsAtHome = window.innerWidth <= 760;
      }
    } else {
      store.settingsAtHome = false;
    }
    if (chatRef && chatRef.id) {
      store.profile = null;          // la URL de chat manda sobre el perfil
      store.pendingPath = chatRef;   // lo abre actions.resolvePendingChat
    } else {
      store.pendingPath = null;
      store.profile = null;          // volver a /app cierra el perfil
      if (store.activeChatId) store.activeChatId = 0;   // volver al panel
    }
  } else {
    /* Fuera de la app (ChatShell se desmonta y limpia sus estados). */
    store.pendingPath = null;
    store.profile = null;
    store.settingsOpen = false;
    store.settingsAtHome = false;
    store.jumpMsg = 0;
  }
}

/** Lee la URL actual y aplica guardas. Se llama al arrancar; además
    convierte enlaces viejos #/ruta a la ruta real equivalente. */
export function syncPath() {
  if (location.hash && location.hash !== '#/') {
    const legacy = location.hash.replace(/^#\/?/, '').split('?')[0];
    const target = KNOWN_ROUTES.indexOf(legacy) >= 0 ? ROUTE_PATHS[legacy] : '/';
    history.replaceState(null, '', target);
  }
  nav = [locPath()];
  applyState(locPath());
}

window.addEventListener('popstate', function () {
  const p = locPath();
  if (nav) {
    const st = history.state;
    if (st && typeof st.nav === 'number' && st.nav < nav.length && nav[st.nav] === p) {
      nav = nav.slice(0, st.nav + 1);
    } else {
      nav = [p];
    }
  }
  applyState(p);
});

/* Estado → URL: cada cambio de vista/chat/ajustes/salto deja la URL al
   día. push al abrir; al cerrar, atrás si la entrada inferior ya es el
   destino o replace si no (deep link). */
watch(
  function () {
    const profileId = (store.profile && store.profile.user && store.profile.user.id) || 0;
    return [
      store.route, store.activeChatId, store.settingsOpen, store.jumpMsg,
      store.settingsTab, store.settingsAtHome, profileId,
    ];
  },
  function (nv, ov) {
    if (store.pendingPath || store.pendingUser) return; // deep link en curso
    const want = urlForState();
    if (want === locPath()) return;
    const routeChanged = nv[0] !== ov[0];
    const chatClosed = !!ov[1] && !nv[1];
    const settingsClosed = !!ov[2] && !nv[2];
    const chatSwitched = !!ov[1] && !!nv[1] && ov[1] !== nv[1];
    const jumpChanged = nv[3] !== ov[3];
    const settingsNav = !routeChanged && nv[2] && ov[2] &&
      (nv[4] !== ov[4] || nv[5] !== ov[5]);
    const profileOpened = !nv[1] && !ov[6] && !!nv[6];
    const profileClosed = !nv[1] && !!ov[6] && !nv[6];
    if (!routeChanged && (chatClosed || settingsClosed || profileClosed)) {
      closeUrl(want);
    }
    /* replace para cambios "en el sitio" (categoría de Ajustes, ?m=);
       abrir un chat o un perfil empuja una entrada nueva. */
    else if (!routeChanged && !chatSwitched && (jumpChanged || settingsNav)) {
      writeUrl(want, 'replace');
    } else if (profileOpened && !routeChanged && !chatSwitched) {
      writeUrl(want, 'push');
    } else writeUrl(want, 'push');
  }
);

/* ---------- toasts ---------- */
let tid = 0;
export function toast(msg, kind = 'info', onRetry) {
  const id = ++tid;
  /* Máximo 1 toast visible a la vez */
  store.toasts.splice(0, store.toasts.length);
  store.toasts.push({ id, msg, kind, onRetry });
  setTimeout(() => {
    const i = store.toasts.findIndex((t) => t.id === id);
    if (i >= 0) store.toasts.splice(i, 1);
  }, 4000);
}

/* ---------- tema ---------- */
/* data-theme siempre está (html + script pre-paint); acá solo damos vuelta
   y persistimos — lo aplica el CSS sin parpadeo. */
/* W59: iconos de las barras de Android. En tema claro se piden oscuros;
   en oscuro, claros. También sincroniza <meta name="theme-color"> para
   la PWA y el navegador. Si el APK es viejo y no tiene el método, no
   pasa nada. */
function syncNativeTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const header = String(cs.getPropertyValue('--header') || '').trim();
    const color = header || (store.theme === 'light' ? '#f2f3f5' : '#2b2d31');
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    for (let i = 0; i < metas.length; i++) metas[i].setAttribute('content', color);
  } catch (e) {}
  try {
    const a = window.FoxinixAndroid;
    if (a && typeof a.setSystemBars === 'function') {
      a.setSystemBars(store.theme === 'light');
    }
  } catch (e) {}
}

export function setTheme(mode) {
  if (mode !== 'dark' && mode !== 'light' && mode !== 'black') return;
  document.documentElement.setAttribute('data-theme', mode);
  store.theme = mode;
  try { localStorage.setItem('fm.theme', mode); } catch (e) {}
  updateMetaContrast();
  syncNativeTheme();
}

export function toggleTheme() {
  /* W65: claro → intermedio → negro → claro. */
  setTheme(store.theme === 'light' ? 'dark'
    : (store.theme === 'dark' ? 'black' : 'light'));
}

/* ---------- acento y fondo (W4) ---------- */

function applyAccent(hex) {
  const n = parseInt(hex.slice(1), 16);
  const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  const r = Math.round(R * 0.72),
        g = Math.round(G * 0.72),
        b = Math.round(B * 0.72);
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-d', '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
  /* W9: tinte translúcido del acento (chips activos, hover de fila, etc.) */
  root.setProperty('--accent-wash', 'rgba(' + R + ', ' + G + ', ' + B + ', .18)');
  updateMetaContrast();   /* W12: el acento manda el fondo de "mi burbuja" */
}

export function setAccent(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  store.accent = hex;
  applyAccent(hex);
  try { localStorage.setItem('fm.accent', hex); } catch (e) {}
}

/* W12: la hora y las palomitas se pintan del color que CONTRASTE con el
   fondo real de la burbuja (blanco sobre oscuro, negro sobre claro).
   FF78: sin color-mix() — calculamos la luminancia y seteamos dos vars. */
function lum(css) {
  const s = String(css || '').trim();
  if (s.charAt(0) === '#') {
    const n = parseInt(s.slice(1), 16);
    if (isNaN(n)) return 0;
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return 0;
  return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
}

export function updateMetaContrast() {
  const cs = getComputedStyle(document.documentElement);
  const root = document.documentElement.style;
  const mine = lum(cs.getPropertyValue('--bubble-me'));   /* acento oscurecido */
  root.setProperty('--meta-mine', mine > 0.5 ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.92)');
  const you = lum(cs.getPropertyValue('--bubble-you'));
  root.setProperty('--meta-you', you > 0.5 ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.7)');
}
/* El pre-paint de index.html ya aplicó tema y acento: afinar al cargar. */
updateMetaContrast();
syncNativeTheme();
if (window.addEventListener) window.addEventListener('load', syncNativeTheme);
setTimeout(syncNativeTheme, 0);

/* '' = automático (el color del tema vía var(--bg)). */
export function setWall(hex) {
  store.wall = hex || '';
  const root = document.documentElement.style;
  if (store.wall) root.setProperty('--wall', store.wall);
  else root.removeProperty('--wall');
  try {
    if (store.wall) localStorage.setItem('fm.wall', store.wall);
    else localStorage.removeItem('fm.wall');
  } catch (e) {}
}

/* W19: foto de fondo de la conversación. Es apariencia del dispositivo
   (igual que el color): se guarda ya achicada como data-URL y el CSS la
   pone sobre --wall con un velo oscuro para que las burbujas se lean. */
export function setWallImg(dataUrl) {
  store.wallimg = dataUrl || '';
  const root = document.documentElement.style;
  if (store.wallimg) {
    root.setProperty('--wallimg', 'url("' + store.wallimg + '")');
    document.documentElement.classList.add('wallimg');
  } else {
    root.removeProperty('--wallimg');
    document.documentElement.classList.remove('wallimg');
  }
  try {
    if (store.wallimg) localStorage.setItem('fm.wallimg', store.wallimg);
    else localStorage.removeItem('fm.wallimg');
  } catch (e) {}
}

/* W19: contraer el sidebar (solo escritorio; el CSS de móvil lo ignora).
   El <html> lleva la clase desde boot.js para que no parpadee. */
export function setSideCollapsed(v) {
  store.sideCollapsed = !!v;
  if (store.sideCollapsed) document.documentElement.classList.add('side-collapsed');
  else document.documentElement.classList.remove('side-collapsed');
  try { localStorage.setItem('fm.side', store.sideCollapsed ? '1' : '0'); } catch (e) {}
}

/* W20: opacidad del velo oscuro del fondo (0-100) y difuminado (0-20 px).
   Ambos viven como variables en :root para que la preview del panel de
   fondo y la conversación real se muevan juntas, en vivo. */
export function setWallDim(v) {
  store.wdim = Math.max(0, Math.min(100, Math.round(+v) || 0));
  document.documentElement.style
    .setProperty('--wall-dim', (store.wdim / 100).toFixed(2));
  try { localStorage.setItem('fm.wdim', String(store.wdim)); } catch (e) {}
}

export function setWallBlur(v) {
  store.wblur = Math.max(0, Math.min(20, Math.round(+v) || 0));
  document.documentElement.style
    .setProperty('--wall-blur', store.wblur + 'px');
  try { localStorage.setItem('fm.wblur', String(store.wblur)); } catch (e) {}
}

/* W20: micrófono preferido (deviceId; '' = el del sistema). */
export function setMicDev(id) {
  store.micDev = id || '';
  try {
    if (store.micDev) localStorage.setItem('fm.mic', store.micDev);
    else localStorage.removeItem('fm.mic');
  } catch (e) {}
}

/* ---------- preferencias de chat (W6) ---------- */

export function setPref(key, val) {
  if (!(key in store.prefs)) return;
  store.prefs[key] = !!val;
  try { localStorage.setItem('fm.p.' + key, val ? '1' : '0'); } catch (e) {}
}

/* W40: preferencia de valor libre (estilo de emojis: system/noto/
   twemoji). */
export function setPrefStr(key, val) {
  if (!(key in store.prefs)) return;
  store.prefs[key] = val;
  try { localStorage.setItem('fm.p.' + key, val); } catch (e) {}
}

/* Tamaño de letra: data-font lo aplica el CSS (--fs); el pre-paint lo
   re-aplica en la próxima carga sin parpadeo. */
export function setFont(size) {
  if (size !== 'small' && size !== 'normal' && size !== 'large') return;
  store.font = size;
  document.documentElement.setAttribute('data-font', size);
  try { localStorage.setItem('fm.font', size); } catch (e) {}
}

/* ---------- W60: bloqueo de la sección Archivados ----------

   La contraseña NUNCA se guarda en claro: solo un hash SHA-256 con un
   prefijo fijo. En contextos no seguros (http:// en LAN, donde
   crypto.subtle no existe) se usa un hash local FNV-1a repetido: no es
   criptográfico, pero evita dejar la clave escrita y sigue protegiendo
   la sección de miradas casuales. La comprobación es local y por
   dispositivo, igual que el resto de preferencias. */
const ARCHIVE_LOCK_KEY = 'fm.archive.lock';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

function localHash(pw) {
  /* 4 rondas con sal distinta: suficiente para que el valor guardado no
     sea la contraseña ni un hash trivial de una sola pasada. */
  let out = '';
  let seed = 'foxinix-archivo:' + pw;
  for (let i = 0; i < 4; i++) {
    out += fnv1a(seed + ':' + i) + fnv1a(seed.split('').reverse().join('') + i);
  }
  return 's1:' + out;
}

function bytesToHex(buf) {
  const b = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
  return out;
}

function archiveDigest(pw) {
  const text = 'foxinix-archivo:' + pw;
  if (window.crypto && window.crypto.subtle && window.TextEncoder) {
    try {
      const data = new TextEncoder().encode(text);
      return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
        return bytesToHex(buf);
      }).catch(function () { return localHash(pw); });
    } catch (e) { /* cae al hash local */ }
  }
  return Promise.resolve(localHash(pw));
}

export function hasArchiveLock() {
  return !!readLs(ARCHIVE_LOCK_KEY);
}

export async function setArchiveLock(pw) {
  if (!pw || String(pw).length < 4) throw new Error('short');
  const hash = await archiveDigest(String(pw));
  localStorage.setItem(ARCHIVE_LOCK_KEY, hash);
  store.archiveHasLock = true;
  store.archiveUnlocked = true;
}

export async function checkArchiveLock(pw) {
  const saved = readLs(ARCHIVE_LOCK_KEY);
  if (!saved) return true;
  const hash = await archiveDigest(String(pw || ''));
  return hash === saved;
}

export function clearArchiveLock() {
  try { localStorage.removeItem(ARCHIVE_LOCK_KEY); } catch (e) {}
  store.archiveHasLock = false;
  store.archiveUnlocked = false;
  store.archiveLockPrompt = false;
  store.archiveLockErr = '';
}
