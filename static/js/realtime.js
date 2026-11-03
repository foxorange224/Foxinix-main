/* Foxinix — WebSocket de tiempo real. Reconecta con backoff y refresca
   la lista al reconectar (API.md §tiempo real). */
import { store, toast } from './store.js';
import { session, API_BASE, refreshTokens, authLost, ApiError, sessionHooks } from './api.js';
import { hooks, loadChats, loadMembers, loadPeople, loadBlocks,
  onIncomingMessage, catchUpChat, mediaUrl, openNotificationTarget } from './actions.js';
import { t } from './i18n.js';
/* W28h: la señalización de llamadas WebRTC reutiliza este socket */
import { initCall, handleCallEvent, abortCall } from './call.js';
/* W63: el aviso de mensaje nuevo usa el tono elegido en Ajustes. */
import { selectedToneSrc } from './tones.js';
import { clearMediaBlobs } from './mediadl.js';

let ws = null;
let pingTimer = null;
let reconnectTimer = null;
let backoff = 1000;
let stopped = true;
let hasOpened = false;
let lastPong = 0;

/* W55: el APK inyecta este puente; en web/escritorio no existe y se
   sigue usando la Notification del navegador. Se consulta en cada aviso
   porque el objeto nativo puede inyectarse después del módulo. */
function androidNotifier() {
  if (typeof window === 'undefined' || !window.FoxinixAndroid) return null;
  if (typeof window.FoxinixAndroid.notify !== 'function') return null;
  return window.FoxinixAndroid;
}

/* Solo cuenta como aviso nativo si Android ya concedió el permiso. Si no,
   el bip sigue sonando y el usuario puede activarlo desde Ajustes. */
function nativeNotifyReady() {
  const a = androidNotifier();
  if (!a) return null;
  try { return a.permission() === 'granted' ? a : null; } catch (e) { return null; }
}

/* W45g: cualquier clearSession() (logout, 401 real, cancelación) corta
   la WS en el acto; no queda recibiendo eventos de una cuenta cerrada.
   P0: además cierra la llamada y libera cámara/micrófono y blobs. */
sessionHooks.onLogout = function () {
  clearMediaBlobs();
  stopWS();
};

/* chatId → timer para ocultar "escribiendo…". */
const typingTimers = {};

function findChatById(id) {
  for (let i = 0; i < store.chats.length; i++) {
    if (store.chats[i].id === id) return store.chats[i];
  }
  return null;
}

/* Preview del chat, solo si el mensaje editado/borrado es el último. */
function findChatPreview(chatId, msgId) {
  const chat = findChatById(chatId);
  if (chat && chat.last_message && chat.last_message.id === msgId) return chat.last_message;
  return null;
}

/* W62: al volver a la app se refrescan las solicitudes de amistad.
   Sin esto, un evento perdido con la pestaña dormida exigía recargar. */
let focusBound = false;
let lastPeopleRefresh = 0;
function refreshPeopleSoon() {
  if (!store.hasSession || store.bootPhase !== 'ready') return;
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastPeopleRefresh < 4000) return;
  lastPeopleRefresh = now;
  loadPeople();
  loadBlocks();
}
function bindFocusRefresh() {
  if (focusBound || typeof document === 'undefined') return;
  focusBound = true;
  document.addEventListener('visibilitychange', refreshPeopleSoon);
  window.addEventListener('focus', refreshPeopleSoon);
}

export function startWS() {
  stopped = false;
  backoff = 1000;
  hasOpened = false;
  bindFocusRefresh();
  connect();
}

export function stopWS() {
  stopped = true;
  /* P0: al desmontar/logout no puede quedar una llamada con la cámara
     encendida ni un RTCPeerConnection abierto. */
  abortCall('hangup');
  store.groupCalls = {};
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  lastPong = 0;
  store.ws = 'off';
}

/* W70: reintento inmediato al volver la red (evento 'online' en main.js):
   limpia el backoff pendiente para no esperar hasta los 30 s. */
export function reconnectNow() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  backoff = 1000;
  connect();   // connect() se protege solo: stopped o socket vivo
}

function connect() {
  if (stopped || ws) return;
  if (!session.access) {
    /* W30e: con la sesión en cookie el access llega del refresh después
       de recargar; si aún no está y hay sesión, pídalo y vuelva. */
    if (!store.hasSession) return;
    refreshTokens().then(connect).catch(function (e) {
      /* Si el refresh rechazó el token, la sesión terminó de verdad.
         Un 5xx/red se reintenta con backoff (no cerrar la sesión). */
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) authLost();
      else {
        /* W70: sin red el access nunca llega y store.ws se quedaba en su
           valor inicial 'connecting' (no hubo socket que cerrar): el watch
           del overlay offline no disparaba y "Sin conexión" no salía
           nunca. Se marca 'off' igual que al cerrarse el socket. */
        store.ws = 'off';
        scheduleReconnect();
      }
    });
    return;
  }
  store.ws = 'connecting';
  /* W80: el WebSocket va a api.foxinix.qzz.io vía cloudflared tunnel. */
  const url = API_BASE.replace(/^https:/i, 'wss:') + '/api/ws';
  let sock;
  try {
    /* W14: el token viaja como subprotocolo (2.º valor), no en la URL,
       para que no quede en los logs de acceso del servidor. */
    sock = new WebSocket(url, ['foxinix', session.access]);
  } catch (e) {
    scheduleReconnect();
    return;
  }
  ws = sock;

  sock.onopen = function () {
    if (stopped) { try { sock.close(); } catch (e) {} return; }
    const reconnected = hasOpened;
    hasOpened = true;
    store.ws = 'on';
    backoff = 1000;
    lastPong = Date.now();
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(function () {
      /* P1: un socket medio abierto puede seguir en readyState=1 y
         tragarse los 'seen'. Si el server no responde a dos pings,
         cerramos y dejamos que el backoff reconecte. */
      if (ws && ws.readyState === 1 && Date.now() - lastPong > 70000) {
        try { ws.close(); } catch (e) {}
        return;
      }
      send({ type: 'ping' });
    }, 25000);
    if (!reconnected) {
      /* Primera conexión: si bootAll ya terminó y hay un chat abierto,
         lo que llegó entre la carga inicial y este handshake se recupera
         con el mismo catch-up. Durante el arranque, bootAll sigue en vuelo. */
      /* W70: si la app ARRANCÓ sin conexión, bootAll terminó con la lista
         vacía (y sin gente): esta primera conexión real es el único
         evento que se entera de que volvió la red, así que carga lo que
         faltó. Si bootAll sigue en vuelo (booting), él lo hace ya. */
      if (!store.booting) {
        if (!store.chatsReady) loadChats();
        if (!store.people) loadPeople();
      }
      const firstActive = store.activeChatId;
      if (store.bootPhase === 'ready' && firstActive && store.loaded[firstActive]) {
        catchUpChat(firstActive).catch(function () {});
      }
      return;
    }
    /* W45a: al reconectar pueden faltar mensajes de CUALQUIER chat
       abierto antes. La lista se refresca (previews/no leídos) y los
       chats ya cargados se marcan para catch-up; el activo se pide ya
       mismo y el resto al abrirlos. */
    for (const id in store.loaded) store.syncNeeded[id] = true;
    if (store.bootPhase === 'ready') {
      loadChats();
      /* W62: una solicitud de amistad pudo llegar mientras el socket
         estaba caído (app en segundo plano, cambio de red…). Al
         reconectar se refrescan Personas y bloqueos, no sólo los chats. */
      loadPeople();
      loadBlocks();
    }
    const active = store.activeChatId;
    if (active && store.loaded[active]) {
      catchUpChat(active).catch(function () {});
    }
  };

  sock.onmessage = function (e) {
    let ev;
    try { ev = JSON.parse(e.data); } catch (err) { return; }
    handle(ev);
  };

  sock.onclose = function (e) {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (ws === sock) ws = null;
    lastPong = 0;
    store.ws = 'off';
    if (stopped) return;
    if (e.code === 4401) refreshThenReconnect();   // token vencido
    else scheduleReconnect();
  };

  sock.onerror = function () {};   // onclose se encarga
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    connect();
  }, backoff);
  backoff = Math.min(backoff * 2, 30000);
}

async function refreshThenReconnect() {
  try {
    await refreshTokens();
  } catch (e) {
    /* Solo cerrar si el refresh rechazó el token; si fue red/5xx,
       mantener la sesión y reintentar la conexión. */
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      authLost();
      return;
    }
  }
  scheduleReconnect();
}

function send(obj) {
  if (ws && ws.readyState === 1) {
    if (lastPong && Date.now() - lastPong > 70000) {
      try { ws.close(); } catch (e) {}
      return false;
    }
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) {}
  }
  return false;
}

/* W28h: la señalización de llamadas usa este mismo socket */
initCall(send);

/* 'seen' por WS si está conectado; si no, que REST lo intente. */
hooks.sendSeen = function (chatId, seq) {
  return send({ type: 'seen', chat_id: chatId, seq: seq });
};

/* ------------------------------------------------- avisos (W6) */

let actx = null;
let msgAudio = null;

/* W63: si hay un tono de mensaje elegido, suena el archivo; el pitido
   WebAudio queda como "Predeterminado" y como respaldo si el asset falla. */
function blip() {
  const src = selectedToneSrc('message');
  if (src) {
    try {
      if (msgAudio) {
        msgAudio.pause();
        msgAudio.src = '';
        msgAudio = null;
      }
      const a = new Audio(src);
      a.volume = 0.75;
      msgAudio = a;
      a.addEventListener('ended', function () {
        if (msgAudio === a) msgAudio = null;
      });
      a.play().catch(function () {});
      return;
    } catch (e) { /* cae al pitido */ }
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    const t0 = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t0);
    o.frequency.exponentialRampToValueAtTime(620, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t0);
    o.stop(t0 + 0.2);
  } catch (e) {}
}

function previewBody(m) {
  // Notificación del navegador: se arma en el idioma vigente (no es reactiva).
  /* W45: no destapar spoilers en la notificación del sistema. */
  if (m.spoiler) return t('Spoiler');
  if (m.kind === 'voice') return t('Nota de voz');
  if (m.kind === 'image') return t('Imagen');
  if (m.kind === 'file') return t('Archivo adjunto');
  return m.body || '';
}

/* W56: en No molestar se silencian sonido y avisos, salvo que el mensaje
   mencione directamente a la cuenta (las menciones de grupo vienen en
   m.mentions como ids). Un DM normal NO es una mención: si quieres que te
   avise, usa @usuario. */
function hasDirectMention(m) {
  if (!store.user) return false;
  const me = String(store.user.id);
  const ms = m && m.mentions;
  if (ms && ms.length) {
    for (let i = 0; i < ms.length; i++) {
      if (String(ms[i]) === me) return true;
    }
  }
  const text = m && m.body;
  if (typeof text !== 'string' || text.indexOf('@') < 0) return false;
  if (/@(everyone|todos)\b/i.test(text)) return true;
  if (/@(online|activos)\b/i.test(text)) return true;
  const uname = String(store.user.username || '').toLowerCase();
  if (!uname) return false;
  const names = text.match(/@([A-Za-z0-9_.]{3,20})/g) || [];
  for (let i = 0; i < names.length; i++) {
    if (names[i].slice(1).toLowerCase() === uname) return true;
  }
  return false;
}

function dndSilences(m) {
  if (!store.user || (store.user.status_preset || '') !== 'dnd') return false;
  return !hasDirectMention(m);
}

/* La foto de perfil viaja como URL absoluta al APK. Si el navegador ya
   tiene el avatar como blob local, el WebView nativo no puede leerlo:
   en ese caso se usa el icono de la app. */
function absoluteAvatar(url) {
  if (!url || url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return '';
  try { return new URL(url, location.href).href; } catch (e) { return ''; }
}

/* Para el APK no sirve mediaUrl() si el avatar ya está cacheado como
   blob: el WebView nativo no puede descargarlo. Partimos de la ruta del
   servidor y le añadimos token/miniatura sin mirar el caché del navegador. */
function nativeAvatarUrl(raw) {
  if (!raw || raw.indexOf('blob:') === 0 || raw.indexOf('data:') === 0) return '';
  let u = raw;
  if (!/[?&](sig|token)=/.test(u) && u.indexOf('/media/') !== 0) {
    u += (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(session.access || '');
  }
  if (u.indexOf('/media/profile/') === 0 && u.indexOf('thumb=') < 0) {
    u += (u.indexOf('?') >= 0 ? '&' : '?') + 'thumb=1';
  }
  return absoluteAvatar(u);
}

/* Aviso del navegador — se extrae para poder reutilizarlo desde el
   manejo de mensajes entrantes. */
function browserNotify(m) {
  /* W55: resolver el puente ANTES del guard de Notification: el WebView
     de Android no define Notification, pero sí FoxinixAndroid. */
  const native = nativeNotifyReady();
  if (!native && (typeof Notification === 'undefined' ||
      Notification.permission !== 'granted')) return;
  const who = m.sender ? (m.sender.display_name || m.sender.username) : '';
  /* W34c: más contexto — quién escribió, en qué grupo, y su foto de
     perfil como icono de la notificación. */
  const c = findChatById(m.chat_id);
  const chatName = c && c.title
    ? (c.title.display_name || c.title.username || '')
    : ((c && c.name) || '');
  let title;
  if (c && c.type === 'dm') title = who || chatName || 'Foxinix';
  else title = who ? (chatName ? who + ' · ' + chatName : who)
    : (chatName || 'Foxinix');
  const avatarRaw = (m.sender && m.sender.avatar_url) ||
    (c && c.avatar_url) || '';
  /* W15: mediaUrl elige la miniatura del servidor y añade el token de las
     rutas antiguas; en navegador también sirve el blob ya cacheado. */
  const icon = avatarRaw ? mediaUrl(avatarRaw) : '/static/icon-192.png';

  /* W55/W56: dentro del APK, Android WebView no tiene Notification.
     Usamos la notificación nativa; las versiones nuevas reciben además la
     URL absoluta del avatar para componer foto + icono de la app. */
  if (native) {
    try {
      const cid = String(m.chat_id == null ? '' : m.chat_id);
      const mid = String(m.id == null ? '' : m.id);
      const snd = store.prefs && store.prefs.sound ? '1' : '0';
      const body = previewBody(m);
      const avatar = avatarRaw ? nativeAvatarUrl(avatarRaw) : '';
      if (typeof native.notifyWithAvatarAndMessage === 'function') {
        native.notifyWithAvatarAndMessage(title, body, cid, snd, avatar, mid);
      } else if (typeof native.notifyWithMessage === 'function') {
        native.notifyWithMessage(title, body, cid, snd, mid);
      } else if (typeof native.notifyWithAvatar === 'function') {
        native.notifyWithAvatar(title, body, cid, snd, avatar);
      } else {
        native.notify(title, body, cid, snd);
      }
    } catch (e) {}
    return;
  }

  try {
    const n = new Notification(title, {
      body: previewBody(m),
      icon: icon,
      tag: 'foxmsg-' + m.chat_id,
    });
    n.onclick = function () {
      window.focus();
      try { n.close(); } catch (e) {}
      openNotificationTarget(m.chat_id, m.id);
    };
  } catch (e) {}
}

/* Sonido + notificación del navegador para mensajes entrantes.
   El sonido suena solo si el chat NO está abierto o la pestaña está
   oculta (si no, sería ruido mientras charlas). */
function notifyIncoming(m) {
  if (!m || !store.user) return;
  const mine = !!(m.sender && m.sender.id === store.user.id);
  if (mine) return;
  const open = store.activeChatId === m.chat_id;
  /* W13: chat silenciado → sin sonido ni notificación del navegador */
  let muted = false;
  for (let i = 0; i < store.chats.length; i++) {
    if (store.chats[i].id === m.chat_id) { muted = !!store.chats[i].muted; break; }
  }
  if (muted) return;
  /* W56: No molestar apaga sonido y aviso, pero una mención directa
     (@usuario) sigue avisando. */
  if (dndSilences(m)) return;
  /* W55: el sonido del aviso nativo lo pone Android; no duplicamos el bip. */
  if (store.prefs.sound && (!open || document.hidden) && !nativeNotifyReady()) blip();
  if (document.hidden) {
    browserNotify(m);
  }
}

function markTyping(chatId, userId, username) {
  if (store.user && userId === store.user.id) return;
  /* W29c: lista por chat y por usuario (varios pueden escribir a la vez);
     cada quien tiene su propio timeout de 3,5 s. */
  if (!store.typing[chatId]) store.typing[chatId] = {};
  store.typing[chatId][userId] = { u: username || '', exp: Date.now() + 3500 };
  if (!typingTimers[chatId]) typingTimers[chatId] = {};
  if (typingTimers[chatId][userId]) clearTimeout(typingTimers[chatId][userId]);
  typingTimers[chatId][userId] = setTimeout(function () {
    clearTyping(chatId, userId);
  }, 3500);
}

function clearTyping(chatId, userId) {
  const c = store.typing[chatId];
  const ts = typingTimers[chatId];
  if (userId == null) {                     // limpiar el chat entero
    if (ts) {
      for (const k in ts) clearTimeout(ts[k]);
      delete typingTimers[chatId];
    }
    if (c) delete store.typing[chatId];
    return;
  }
  if (ts && ts[userId]) {
    clearTimeout(ts[userId]);
    delete ts[userId];
  }
  if (c) delete c[userId];
}

/* W15: aplica un cambio de perfil (evento 'profile') a todo lo cargado:
   lista de chats (DM), mensajes ya renderizados (incl. respuestas),
   panel de miembros y el perfil propio si cambió en otra pestaña. */
export function applyProfileFields(target, u) {
  if (!target || typeof target !== 'object') return;
  target.display_name = u.display_name;
  target.username = u.username;
  target.avatar_url = u.avatar_url;
  target.banner_url = u.banner_url || null;
  target.bio = u.bio;
  target.status_text = u.status_text || '';
  target.status_preset = u.status_preset || '';
  if (u.online !== undefined) target.online = u.online;
  if (u.last_seen !== undefined) target.last_seen = u.last_seen;
}

function applyProfileUpdate(u) {
  if (!u || u.id == null) return;
  if (store.user && store.user.id === u.id) applyProfileFields(store.user, u);
  for (let i = 0; i < store.chats.length; i++) {
    const c = store.chats[i];
    if (c.type === 'dm' && c.title && c.title.id === u.id) {
      applyProfileFields(c.title, u);
    }
  }
  for (const k in store.msgs) {
    const arr = store.msgs[k];
    for (let j = 0; j < arr.length; j++) {
      const s = arr[j].sender;
      if (s && typeof s === 'object' && s.id === u.id) applyProfileFields(s, u);
      const r = arr[j].ref && arr[j].ref.sender;
      if (r && typeof r === 'object' && r.id === u.id) applyProfileFields(r, u);
    }
  }
  if (store.info && store.info.members) {
    for (let m = 0; m < store.info.members.length; m++) {
      const mb = store.info.members[m];
      if (mb.id === u.id) applyProfileFields(mb, u);
    }
  }
  if (store.profile) {
    if (store.profile.user && store.profile.user.id === u.id) {
      applyProfileFields(store.profile.user, u);
    } else if (store.profile.loading && store.profile.username === u.username) {
      /* W63: el perfil aún carga; guardar el evento para no pisarlo con
         la respuesta (más vieja) de la petición en curso. */
      store.profile.liveUser = u;
    }
  }
  /* W58: Personas (amigos/enviadas/recibidas) también se actualiza en
     vivo. Las filas envueltas guardan el usuario en `user`. */
  const ppl = store.people;
  if (ppl) {
    const groups = [ppl.friends, ppl.sent, ppl.received];
    for (let g = 0; g < groups.length; g++) {
      const arrG = groups[g] || [];
      for (let i = 0; i < arrG.length; i++) {
        const row = arrG[i];
        if (row && row.id === u.id) applyProfileFields(row, u);
        else if (row && row.user && row.user.id === u.id) applyProfileFields(row.user, u);
      }
    }
  }
}

/* W46: un cambio de rol se refleja YA en la etiqueta [Admin] de los
   mensajes ya cargados, en el panel de miembros y en mi propio rol
   (para habilitar/ocultar las acciones de administración sin esperar
   a que termine loadChats). */
function applyMemberRole(chatId, userId, role) {
  if (store.info && store.info.chatId === chatId && store.info.members) {
    for (let i = 0; i < store.info.members.length; i++) {
      if (store.info.members[i].id === userId) {
        store.info.members[i].role = role;
        break;
      }
    }
  }
  const arr = store.msgs[chatId];
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i].sender;
      if (s && typeof s === 'object' && s.id === userId) s.role = role;
      const r = arr[i].ref && arr[i].ref.sender;
      if (r && typeof r === 'object' && r.id === userId) r.role = role;
    }
  }
  const c = findChatById(chatId);
  if (c) {
    const lm = c.last_message;
    if (lm && lm.sender && lm.sender.id === userId) lm.sender.role = role;
    if (store.user && store.user.id === userId) c.my_role = role;
  }
}

/* W46: al expulsarme, el server no puede usar el broadcast del chat
   (ya no soy miembro); llega un evento puntual y cerramos el chat. */
function dropRemovedChat(chatId) {
  if (store.activeChatId === chatId) {
    store.activeChatId = 0;
    store.infoOpen = false;
    store.info = null;
    store.pinsModal = false;
    store.galModal = false;
    store.readsBox = null;
  }
  store.chats = store.chats.filter(function (c) { return c.id !== chatId; });
  delete store.msgs[chatId];
  delete store.loaded[chatId];
  delete store.syncNeeded[chatId];
  delete store.hasMore[chatId];
  if (store.groupCalls) delete store.groupCalls[chatId];
  clearTyping(chatId);
}

function chatName(chatId) {
  const c = findChatById(chatId);
  if (!c) return '';
  return (c.title && (c.title.display_name || c.title.username)) || '';
}

function handle(ev) {
  // W6: la sesión se cerró → ignorar cualquier evento que llegue tarde
  // (el WS se corta en el desmontaje, pero puede haber uno en vuelo).
  if (!store.hasSession) return;
  switch (ev.type) {
    case 'connected':
      /* W64: el servidor manda justo después la presencia de las salas
         de grupo que siguen activas. Vaciar primero evita botones verdes
         fantasma tras un reinicio del servidor o una reconexión. */
      store.groupCalls = {};
      return;

    case 'pong':
      lastPong = Date.now();
      return;

    case 'message':
      if (ev.message) {
        /* UX: el "escribiendo…" del emisor desaparece EN EL MOMENTO en que
           llega su mensaje (sin esperar los 3,5 s del timeout). En grupos
           solo se limpia si el que escribía era ese emisor. */
        const wt = store.typing[ev.message.chat_id];
        const senderId = ev.message.sender ? ev.message.sender.id : 0;
        if (wt && senderId && wt[senderId]) {
          clearTyping(ev.message.chat_id, senderId);
        }
        onIncomingMessage(ev.message);
        notifyIncoming(ev.message);
      }
      return;

    case 'chat_created':
      loadChats();
      return;

    case 'chat_updated':
      /* W27: cambió algo del chat (p. ej. la foto del grupo). */
      loadChats();
      return;

    case 'people':
      /* W27: cambió una solicitud de amistad o una amistad.
         W28e: también un bloqueo (la lista de ids manda para el menú). */
      loadPeople();
      loadBlocks();
      if (ev.kind === 'request' && ev.from) {
        toast(t('Nueva solicitud de amistad de {n}', { n: ev.from }), 'info');
      }
      return;

    case 'typing':
      markTyping(ev.chat_id, ev.user_id, ev.username);
      return;

    case 'read': {
      const chatId = ev.chat_id;
      if (!store.readSeqs[chatId]) store.readSeqs[chatId] = {};
      const cur = store.readSeqs[chatId][ev.user_id] || 0;
      if (ev.seq > cur) store.readSeqs[chatId][ev.user_id] = ev.seq;
      return;
    }

    case 'delivered': {
      /* W12: 'recibido' — el seq llegó a los dispositivos de user_ids.
         (El propio receptor lo ignora: sus filas solo miran a los demás.) */
      const chatId = ev.chat_id;
      if (!store.deliveredSeqs[chatId]) store.deliveredSeqs[chatId] = {};
      const ids = ev.user_ids || [];
      for (let i = 0; i < ids.length; i++) {
        const cur = store.deliveredSeqs[chatId][ids[i]] || 0;
        if (ev.seq > cur) store.deliveredSeqs[chatId][ids[i]] = ev.seq;
      }
      return;
    }

    case 'presence': {
      const uid = ev.user_id;
      store.presence[uid] = ev.online;   // W26: fuente única (sobrevive a loadChats)
      for (let i = 0; i < store.chats.length; i++) {
        const c = store.chats[i];
        if (c.type === 'dm' && c.title && c.title.id === uid) c.title.online = ev.online;
      }
      // W7: el panel de info y la ventana de perfil abiertos también.
      if (store.info && store.info.members) {
        for (let k = 0; k < store.info.members.length; k++) {
          if (store.info.members[k].id === uid) store.info.members[k].online = ev.online;
        }
      }
      if (store.profile && store.profile.user && store.profile.user.id === uid) {
        store.profile.user.online = ev.online;
      }
      return;
    }

    case 'reaction':
    case 'reaction_removed': {
      const arr = store.msgs[ev.chat_id];
      if (!arr) return;
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (m.id !== ev.message_id) continue;
        const rs = m.reactions ? m.reactions.slice() : [];
        if (ev.type === 'reaction') {
          // 1 reacción por usuario (PK message+user en el server): el
          // emoji nuevo REEMPLAZA al anterior en TODOS los clientes.
          // Antes solo se agregaba y el otro veía los dos (bug W7).
          for (let j = rs.length - 1; j >= 0; j--) {
            if (rs[j].user_id === ev.user_id && rs[j].emoji !== ev.emoji) rs.splice(j, 1);
          }
          let found = false;
          for (let k = 0; k < rs.length; k++) {
            if (rs[k].user_id === ev.user_id && rs[k].emoji === ev.emoji) found = true;
          }
          if (!found) {
            /* W29c: el evento trae el nombre (tooltip "quién reaccionó") */
            rs.push({
              emoji: ev.emoji, user_id: ev.user_id,
              username: ev.username || '', name: ev.name || ev.username || '',
            });
          }
        } else {
          // reaction_removed: sin emoji = el server borró la única
          // reacción de ese usuario; con emoji, solo esa.
          for (let j = rs.length - 1; j >= 0; j--) {
            if (rs[j].user_id === ev.user_id &&
                (!ev.emoji || rs[j].emoji === ev.emoji)) rs.splice(j, 1);
          }
        }
        arr[i] = Object.assign({}, m, { reactions: rs });
        return;
      }
      return;
    }

    /* W28c: alguien fijó/desfijó un mensaje del chat — se pinta la
       bandera en la burbuja y se refresca el panel si está abierto. */
    case 'message_pinned': {
      const arr = store.msgs[ev.chat_id];
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (m.id === ev.message_id) {
            arr[i] = Object.assign({}, m, {
              pinned: ev.pinned, pinned_by: ev.pinned_by,
            });
            break;
          }
        }
      }
      store.pinsRev = (store.pinsRev || 0) + 1;
      return;
    }

    case 'message_edited': {
      const arr = store.msgs[ev.chat_id];
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].id === ev.message_id) {
            arr[i] = Object.assign({}, arr[i], {
              body: ev.body, edited_at: ev.edited_at,
            });
            break;
          }
        }
      }
      const ce = findChatPreview(ev.chat_id, ev.message_id);
      if (ce) {
        ce.body = ev.body;
      }
      return;
    }

    case 'message_deleted': {
      const arr = store.msgs[ev.chat_id];
      if (arr) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].id === ev.message_id) arr.splice(i, 1);
        }
      }
      const chat = findChatById(ev.chat_id);
      // si el borrado era el último mensaje, refrescar el preview
      if (chat && chat.last_message && chat.last_message.id === ev.message_id) {
        loadChats();
      }
      return;
    }

    case 'member_role': {
      applyMemberRole(ev.chat_id, ev.user_id, ev.role);
      if (store.user && ev.user_id === store.user.id) {
        const n = chatName(ev.chat_id) || t('el grupo');
        toast(ev.role === 'admin'
          ? t('Ahora eres admin de "{n}"', { n: n })
          : t('Ya no eres admin de "{n}"', { n: n }),
          ev.role === 'admin' ? 'ok' : 'info');
      }
      return;
    }

    case 'member_removed': {
      const n = ev.title || chatName(ev.chat_id) || t('el grupo');
      dropRemovedChat(ev.chat_id);
      toast(t('Te eliminaron de "{n}"', { n: n }), 'err');
      return;
    }

    case 'members_changed':
    case 'member_joined':
    case 'member_left':
      loadChats();
      // W7: el panel de info abierto se refresca con la lista nueva.
      if (store.info && store.info.chatId) loadMembers(store.info.chatId);
      return;

    case 'profile':
      // W15: el server avisa cuando alguien cambió su perfil (en los chats
      // que comparten): se aplica en vivo sin refrescar nada.
      applyProfileUpdate(ev.user);
      return;

    /* W28h/W62/W64: señalización de llamadas WebRTC (solo relé del
       server). call_state es la presencia drop-in de las salas de grupo;
       call_join es la entrada a la malla. */
    case 'call_state':
    case 'call_invite':
    case 'call_join':
    case 'call_offer':
    case 'call_answer':
    case 'call_ice':
    case 'call_hangup':
    case 'call_error':
      handleCallEvent(ev);
      return;

    default:
      return;   // eventos futuros: ignorar (compatibilidad)
  }
}
