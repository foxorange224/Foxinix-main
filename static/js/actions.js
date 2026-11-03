/* Foxinix — acciones de datos (chats, mensajes). Importa store + api; sin ciclos. */
import { store, toast, syncUrl } from './store.js';
import { api, uploadMedia, session } from './api.js';
import { t } from './i18n.js';

/* Puentes que registra realtime.js para mandar 'seen' por WS (fallback: REST). */
export const hooks = { sendSeen: null };

/* W61: tope de texto de un mensaje. Al superarlo, el compositor lo sube
   como `mensaje.txt`/`message.txt` en vez de enviar una burbuja enorme. */
export const MAX_TEXT_CHARS = 3000;

export function charCount(txt) {
  return Array.from(String(txt == null ? '' : txt)).length;
}

/* ------------------------------------------------------- utilidades */

/* URL de media. Las nuevas vienen firmadas (?exp=&sig=) y NO llevan token
   de cuenta (W11); a las viejas /api/media/{id} les seguimos pegando
   ?token= por compatibilidad. */
import { cachedUrl } from './mediadl.js';
import {
  autoDownload, dlCategory, listDownloads, hooks as dlHooks,
} from './downloads.js';

/* W58: las descargas guardadas en los datos de la app se reflejan en la
   UI (los botones de medios se ocultan cuando la automática ya terminó). */
export function hydrateDownloads() {
  return listDownloads().then(function (list) {
    const map = {};
    for (let i = 0; i < list.length; i++) {
      map[list[i].key] = list[i].size || 0;
    }
    store.dlSaved = map;
    store.dlRev++;
  }).catch(function () {});
}

dlHooks.onSaved = function (meta) {
  if (!meta || !meta.key) return;
  if (store.dlSaved[meta.key] == null) {
    store.dlSaved[meta.key] = meta.size || 0;
  }
  store.dlRev++;
};

/* W62: los avatares y las portadas se firman de nuevo en cada respuesta
   de la API. La firma cambia aunque el archivo sea el mismo, y el
   navegador descarga otra vez cada URL. Guardamos una URL estable por
   RUTA mientras su firma siga vigente (más de 5 min de margen), así todos
   los mensajes de una persona reutilizan la misma foto y carga. */
const profileUrlCache = new Map();

function stableProfileUrl(url) {
  const path = String(url).split('?')[0];
  if (path.indexOf('/media/profile/') !== 0) return url;
  const m = /(?:[?&])exp=(\d+)/.exec(url);
  const exp = m ? parseInt(m[1], 10) : 0;
  const now = Math.floor(Date.now() / 1000);
  const hit = profileUrlCache.get(path);
  if (hit && hit.exp > now + 300) return hit.url;
  profileUrlCache.set(path, { url: url, exp: exp });
  return url;
}

export function mediaUrl(url, noCache, full) {
  if (!url) return '';
  let u = stableProfileUrl(url);
  if (!/[?&](sig|token)=/.test(u) && u.indexOf('/media/') !== 0) {
    u = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(session.access || '');
  }
  /* W15: los avatares se piden como miniatura del server (?thumb=1, la
     genera y cachea el server): cargan de una y se ven nítidos al tamaño
     real del avatar. W61: el visor de imágenes pide el original (full). */
  if (!full && u.indexOf('/media/profile/') === 0 && u.indexOf('thumb=') < 0) {
    u = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'thumb=1';
  }
  /* W15: si el archivo ya se bajó en esta sesión, sirve el blob (memoria);
     la identidad sigue siendo la RUTA (el blob lo guarda mediadl.js). */
  return (!noCache && cachedUrl(u)) || u;
}

/* W57: precarga de imágenes/avatares por RUTA (la firma cambia, el
   archivo no). Reutiliza la misma promesa e Image para no pedir dos veces
   el mismo recurso durante el arranque. */
const imgPreloads = {};
export function preloadImage(url) {
  const u = mediaUrl(url);
  if (!u) return Promise.resolve();
  const key = u.split('?')[0];
  if (imgPreloads[key]) return imgPreloads[key];
  imgPreloads[key] = new Promise(function (resolve) {
    const im = new Image();
    im.onload = im.onerror = function () { resolve(im); };
    im.src = u;
  });
  return imgPreloads[key];
}

/* uuid (crypto.randomUUID llegó en FF92; acá fallback para FF78). */
export function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function dec(s) {
  /* Español neutro: separador decimal con coma (2,4 MB). */
  return s.indexOf('.') >= 0 ? s.replace('.', ',') : s;
}

export function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return dec((n / 1024).toFixed(n < 10240 ? 1 : 0)) + ' KB';
  return dec((n / 1048576).toFixed(1)) + ' MB';
}

/* Orden de la lista: fijados primero (W13); después, por actividad;
   los chats vacíos quedan arriba de su bloque. */
export function sortChats() {
  store.chats.sort(function (a, b) {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = a.last_message ? a.last_message.created_at : Infinity;
    const tb = b.last_message ? b.last_message.created_at : Infinity;
    return tb - ta;
  });
}

function findChat(id) {
  for (let i = 0; i < store.chats.length; i++) if (store.chats[i].id === id) return store.chats[i];
  return null;
}

export function chatTitle(chat) {
  if (!chat) return '';
  return (chat.title && (chat.title.display_name || chat.title.username)) || 'Chat';
}

/* ------------------------------------------------------- chats */

/* P0: la primera conexión de la WS y bootAll pedían /api/chats a la vez
   (duplicando el trabajo más caro del arranque). Se comparte la misma
   promesa mientras hay una petición en vuelo. */
let chatsInflight = null;

export function loadChats() {
  if (chatsInflight) return chatsInflight;
  chatsInflight = loadChatsOnce().finally(function () { chatsInflight = null; });
  return chatsInflight;
}

async function loadChatsOnce() {
  try {
    const r = await api('GET', '/api/chats');
    // W6: si la sesión se cerró mientras cargaba (respuesta tardía de un
    // fetch en vuelo), descartar: la pantalla principal queda sin datos.
    if (!store.hasSession) return;
    store.chats = r.chats || [];
    store.chatsReady = true;   // W65: incluso con 0 chats se resuelven enlaces
    /* W26: la presencia vive en store.presence (eventos WS + snapshot del
       server al reconectar). El REST solo rellena lo que aún no se sabe:
       un snapshot con fecha de consulta vieja no pisa un evento más
       reciente (carrera clásica reconectar → loadChats). */
    for (let i = 0; i < store.chats.length; i++) {
      const c = store.chats[i];
      if (c.type === 'dm' && c.title && store.presence[c.title.id] == null) {
        store.presence[c.title.id] = !!c.title.online;
      }
    }
    sortChats();
    resolvePendingChat();   // W22: el deep link pendiente ya tiene la lista
    resolveNotificationTarget();  // W57: aviso tocado durante el arranque
  } catch (e) {
    if (e && e.status !== 401) toast(e.detail || 'No se pudo cargar la lista', 'err');
  }
}

/* W22: abre el chat que pide la URL (deep link o botón atrás). Requiere la
   lista de chats para mapear peer→chat (DM) o id de chat (grupo); si aún
   no cargó, lo retoma loadChats. Devuelve true si quedó algo pendiente. */
export function resolvePendingChat() {
  const ref = store.pendingPath;
  if (!ref) return false;
  if (!store.chatsReady) return false;      // la lista todavía no llegó
  store.pendingPath = null;
  /* W68: el string crudo distingue ID público (16 dígitos usuario /
     12 grupo) de id interno (enlaces viejos). */
  const raw = String(ref.id || '');
  const pubUser = /^\d{16}$/.test(raw);
  const pubGroup = /^\d{12}$/.test(raw);
  const num = (pubUser || pubGroup) ? 0 : (parseInt(raw, 10) || 0);
  let id = 0;
  for (let i = 0; i < store.chats.length; i++) {
    const c = store.chats[i];
    if (ref.kind === 'user') {
      if (c.type === 'dm' && c.title &&
          (pubUser ? c.title.pub_id === raw : c.title.id === num)) {
        id = c.id; break;
      }
    } else if (pubGroup ? c.pub_id === raw : c.id === num) {
      id = c.id;
      break;
    }
  }
  if (id) {
    openChat(id, true);   // keepJump: el ?m= de la URL se aplica después
    return true;
  }
  if (ref.kind === 'user' && raw) {
    /* W65: /app/user/<id> sin MD. El perfil por ID decide: amistad →
       abrir/crear el DM; sin relación → solicitud automática + modal. */
    store.pendingUser = raw;
    resolveUserDeepLink(raw);
    return true;
  }
  if (ref.kind === 'group' && pubGroup) {
    /* W68: /app/group/<pub12> sin estar en mi lista → info pública
       del grupo y, si permite enlaces, modal para unirse. */
    resolveGroupDeepLink(raw);
    return true;
  }
  /* El chat no existe (o ya no está): volver al panel con la URL real. */
  if (store.activeChatId) closeChat();
  syncUrl();
  return false;
}

/* W65: resuelve un enlace público a una cuenta. El ID no cambia aunque
   la persona cambie su @usuario; el endpoint devuelve también la
   relación para no duplicar solicitudes ni abrir MD sin amistad. */
async function resolveUserDeepLink(uid) {
  try {
    const isPub = /^\d{16}$/.test(String(uid));
    const r = await api('GET', (isPub ? '/api/users/pub/' : '/api/users/id/') + uid,
                        undefined, { retry401: true });
    if (store.pendingUser !== uid) return;   // navegación nueva: descartar
    const u = r.user;
    if (r.relation === 'me') {
      store.profile = null;
      store.meProfileOpen = true;
      return;
    }
    /* Un amigo siempre entra a su MD (si ya existe, se reutiliza; si no,
       el servidor lo crea). */
    if (r.relation === 'friend') {
      const mine = store.chats.filter(function (c) {
        return c.type === 'dm' && c.title && c.title.id === u.id;
      })[0];
      if (mine) await openChat(mine.id, true);
      else {
        await createDm(u.username);
        const made = store.chats.filter(function (c) {
          return c.type === 'dm' && c.title && c.title.id === u.id;
        })[0];
        if (made) await openChat(made.id, true);
      }
      return;
    }
    store.profile = {
      loading: false, user: u, error: '', username: u.username,
      relation: r.relation,
    };
    if (r.relation === 'none') {
      try {
        await sendFriendRequest(u.username);
        if (store.pendingUser === uid && store.profile &&
            store.profile.user && store.profile.user.id === u.id) {
          store.profile.relation = 'sent';
          store.requestSent = {
            username: u.username,
            display_name: u.display_name || u.username,
          };
        }
      } catch (e) {
        /* 409: otra pestaña/dispositivo la envió entre la consulta y el
           POST. No es un error para la persona: el perfil queda como
           "Solicitud pendiente" y no se repite el aviso. */
        if (e && e.status === 409 && store.profile &&
            store.profile.user && store.profile.user.id === u.id) {
          store.profile.relation = 'sent';
        } else if (!e || e.status !== 409) {
          toast((e && e.detail) || t('No se pudo enviar la solicitud'), 'err');
        }
      }
    }
  } catch (e) {
    if (e && e.status !== 401) {
      toast(e.status === 404 ? t('Usuario no encontrado')
        : (e.detail || t('No se pudo abrir el perfil')), 'err');
    }
  } finally {
    if (store.pendingUser === uid) {
      store.pendingUser = 0;
      syncUrl();
    }
  }
}

/* W68: resuelve /app/group/<pub12> para quien NO está en la lista de chats.
   El endpoint público decide: miembro (abrir) / enlaces abiertos (modal de
   unión) / cerrado (403). El resultado viaja a store.joinPrompt (modal). */
let pendingGroupPub = '';   // token anti-carrera: navegación nueva lo cambia
async function resolveGroupDeepLink(pub) {
  pendingGroupPub = pub;
  try {
    const r = await api('GET', '/api/chats/pub/' + pub, undefined, { retry401: true });
    if (pendingGroupPub !== pub) return;   // navegación nueva: descartar
    if (r.is_member) {
      /* Puede pasar si el chat quedó fuera de la lista (p. ej. recién
         reabierto): refrescar y abrir por su id interno. */
      await loadChats();
      const c = store.chats.filter(function (x) { return x.id === r.chat_id; })[0];
      if (c) { openChat(c.id, true); return; }
    }
    store.joinPrompt = {
      pubId: pub, title: r.title, avatarUrl: r.avatar_url,
      memberCount: r.member_count, joining: false, error: '',
    };
  } catch (e) {
    if (pendingGroupPub !== pub) return;
    if (e && e.status === 401) return;   // bootstrap se encarga
    toast(e && e.status === 404 ? t('Grupo no encontrado')
      : (e && e.detail) || t('No se pudo abrir el grupo'), 'err');
    syncUrl();
  }
}

/* W68: unirse a un grupo por enlace desde el modal (joinPrompt). */
export async function joinGroupByPub() {
  const p = store.joinPrompt;
  if (!p || p.joining) return;
  p.joining = true;
  p.error = '';
  try {
    const r = await api('POST', '/api/chats/pub/' + p.pubId + '/join');
    store.joinPrompt = null;
    await loadChats();
    const c = store.chats.filter(function (x) { return x.id === r.chat_id; })[0];
    if (c) openChat(c.id, true);
  } catch (e) {
    p.joining = false;
    p.error = (e && e.detail) || t('No se pudo unir al grupo');
  }
}

/* W57: una notificación trae chat + mensaje. En Android puede llegar en
   arranque frío antes de que exista la lista, así que se guarda como
   destino pendiente y loadChats lo resuelve al terminar. */
export function openNotificationTarget(chatId, msgId) {
  const cid = parseInt(chatId, 10) || 0;
  const mid = parseInt(msgId, 10) || 0;
  if (!cid) return false;
  store.notifyTarget = { chatId: cid, msgId: mid, tries: 0 };
  if (!store.hasSession) return false;   // se resuelve tras iniciar sesión
  return resolveNotificationTarget();
}

export function resolveNotificationTarget() {
  const p = store.notifyTarget;
  if (!p) return false;
  if (!store.hasSession || !store.chats.length) return false;
  const chat = findChat(p.chatId);
  if (!chat) {
    /* La lista pudo quedar vieja (me agregaron a un grupo): recargarla
       una vez; si de verdad ya no existe, descartar el destino. */
    p.tries = (p.tries || 0) + 1;
    if (p.tries > 2) { store.notifyTarget = null; return false; }
    loadChats();
    return false;
  }
  store.notifyTarget = null;
  store.pendingPath = null;
  store.route = 'app';
  store.settingsOpen = false;
  store.peopleMobile = false;
  store.infoOpen = false;
  store.jumpMsg = p.msgId || 0;
  openChat(p.chatId, !!p.msgId);
  return true;
}

/* W27h: pedidos de mensajes en vuelo por chat — el doble clic o el
   deep link reutilizan la misma promesa en vez de pedir dos veces. */
const inflightMsgs = {};

/* W62: memoria de chats. Sólo se conservan hidratados los 3 últimos
   abiertos (más el activo); los anteriores se liberan entre 30 y 60 s
   después de dejar de usarse. Los mensajes se vuelven a pedir al abrir. */
const KEEP_HYDRATED = 3;
const RELEASE_MS = 45000;
const chatLastOpen = Object.create(null);
let releaseTimer = null;

function releaseOldChats() {
  const loaded = [];
  for (const id in store.loaded) {
    if (store.loaded[id]) loaded.push(String(id));
  }
  if (loaded.length <= KEEP_HYDRATED) return false;
  loaded.sort(function (a, b) {
    return (chatLastOpen[b] || 0) - (chatLastOpen[a] || 0);
  });
  const keep = {};
  for (let i = 0; i < KEEP_HYDRATED; i++) keep[loaded[i]] = 1;
  const active = String(store.activeChatId || 0);
  const now = Date.now();
  let pending = false;
  for (let i = 0; i < loaded.length; i++) {
    const id = loaded[i];
    if (keep[id] || id === active) continue;
    if (now - (chatLastOpen[id] || 0) < RELEASE_MS) { pending = true; continue; }
    /* Liberar la conversación, no la ficha del chat: la lista, el
       último mensaje y los contadores se quedan. */
    delete store.msgs[id];
    delete store.loaded[id];
    delete store.hasMore[id];
    delete store.syncNeeded[id];
    delete store.readSeqs[id];
    delete store.deliveredSeqs[id];
    delete store.spoilSeen[id];
    delete store.typing[id];
  }
  return pending;
}

function scheduleRelease() {
  if (releaseTimer) return;
  releaseTimer = setTimeout(function () {
    releaseTimer = null;
    if (releaseOldChats()) scheduleRelease();
  }, 15000);
}

function touchChat(id) {
  if (!id) return;
  chatLastOpen[String(id)] = Date.now();
  scheduleRelease();
}

/* W34d: visita de un chat — su contador baja (título "(N) Foxinix")
   y se confirma el visto al server. Sólo corre al ENTRAR al chat (o
   al volver la pestaña estando ya en él); nunca por el simple hecho
   de recibir mensajes.
   W37a: el seen se envía SIEMPRE (aunque el contador ya estuviera a
   0): los mensajes que llegan con la pestaña OCULTA en el chat abierto
   no suman unread, y al volver no se confirmaban — "las palomitas
   a veces no se marcaban". */
export function markChatRead(id) {
  const chat = findChat(id);
  if (chat && chat.unread) {
    chat.unread = 0;
    chat.unread_mentions = 0;   // W28b: el badge de menciones también
  }
  sendSeen(id, maxSeq(store.msgs[id]));
}

export async function openChat(id, keepJump) {
  store.activeChatId = id;
  touchChat(id);
  /* W27b: al entrar a un chat se cierra la pantalla Personas (móvil) */
  store.peopleMobile = false;
  /* W22: el salto ?m= pertenece al chat de la URL; al entrar a otro
     chat desde la lista se limpia. */
  if (!keepJump && store.jumpMsg) store.jumpMsg = 0;
  markChatRead(id);
  if (store.loaded[id]) {
    /* W45a: si la WS se reconectó mientras este chat estaba cerrado,
       pueden faltar mensajes. Se piden los que siguen al último seq en
       cuanto se vuelve a abrir, sin recargar todo el historial. */
    if (store.syncNeeded[id]) {
      /* catchUpChat borra la marca SOLO si termina bien; si falla, se
         reintenta al volver a abrir el chat. */
      catchUpChat(id).catch(function () {});
    }
    return;
  }
  if (inflightMsgs[id]) return inflightMsgs[id];
  /* W27h: la conversación muestra "Cargando…" hasta que lleguen. */
  store.chatLoading = true;
  inflightMsgs[id] = (async function () {
    try {
      const r = await api('GET', '/api/chats/' + id + '/messages?limit=50');
      const list = r.messages || [];
      mergeMessages(id, list);
      /* W59: del historial solo se completan los adjuntos MÁS RECIENTES
         (12) al abrir el chat. Así activar la descarga automática no
         dispara cientos de archivos viejos de golpe; los nuevos siguen
         bajando solos al llegar por WS. */
      autoDownloadMessages(list, 12);
      store.hasMore[id] = list.length >= 50;
      store.loaded[id] = true;
      touchChat(id);
      sendSeen(id, maxSeq(store.msgs[id]));
    } catch (e) {
      toast(e.detail || 'No se pudieron cargar los mensajes', 'err');
    } finally {
      delete inflightMsgs[id];
      /* solo si sigue siendo el chat activo (el usuario pudo cambiar) */
      if (store.activeChatId === id) store.chatLoading = false;
    }
  })();
  return inflightMsgs[id];
}

/* W45a: pide al server solo lo que vino DESPUÉS del último seq que ya
   tenemos. Se usa al reconectar la WS y al abrir un chat que quedó
   marcado como pendiente de sincronizar. */
export async function catchUpChat(chatId) {
  if (!chatId || !store.hasSession || !store.loaded[chatId]) return 0;
  let added = 0;
  let ok = false;
  try {
    for (let page = 0; page < 20; page++) {
      const arr = store.msgs[chatId] || [];
      const last = maxSeq(arr);
      /* Un chat que estaba VACÍO también puede recibir su primer mensaje
         mientras no había WS: after_seq=0 devuelve desde el principio y
         el bucle sigue hasta la última página. */
      const url = '/api/chats/' + chatId + '/messages?after_seq=' +
        (last || 0) + '&limit=100';
      const r = await api('GET', url, undefined, { retry401: true });
      if (!store.hasSession) break;
      const list = r.messages || [];
      if (!list.length) break;
      mergeMessages(chatId, list);
      /* P1: tras reconectar no se descarga el historial entero. Solo la
         primera página y como máximo 12 adjuntos; las páginas antiguas
         esperan a que el usuario abra/las pida. */
      if (page === 0) autoDownloadMessages(list.slice(-12), 12);
      added += list.length;
      if (list.length < 100) break;
      /* Si el eco de la WS ya insertó todo, maxSeq no cambió: cortar. */
      if (maxSeq(store.msgs[chatId]) <= last) break;
    }
    ok = true;
  } finally {
    if (ok) delete store.syncNeeded[chatId];
  }
  if (added && store.activeChatId === chatId && !document.hidden) {
    sendSeen(chatId, maxSeq(store.msgs[chatId]));
  }
  return added;
}

export function closeChat() {
  const prev = store.activeChatId;
  store.activeChatId = 0;
  if (store.jumpMsg) store.jumpMsg = 0;   // W22: sin salto fuera del chat
  /* W29d: al salir, los spoilers vuelven a taparse la próxima vez. */
  if (prev && store.spoilSeen[prev]) delete store.spoilSeen[prev];
}

export async function loadOlder(chatId) {
  if (store.loadingOlder || !store.hasMore[chatId]) return;
  const arr = store.msgs[chatId];
  if (!arr || !arr.length) return;
  store.loadingOlder = true;
  try {
    const before = arr[0].seq;
    const r = await api('GET', '/api/chats/' + chatId + '/messages?before_seq=' + before + '&limit=50');
    const list = r.messages || [];
    if (list.length) {
      store.msgs[chatId] = list.concat(arr);
      /* W59: las páginas viejas NO se descargan automáticamente. */
    }
    store.hasMore[chatId] = list.length >= 50;
  } catch (e) {
    toast(e.detail || 'Error al cargar mensajes anteriores', 'err');
  } finally {
    store.loadingOlder = false;
  }
}

export async function createDm(username) {
  const r = await api('POST', '/api/chats/dm', { username: username });
  const chat = r.chat;
  const i = store.chats.findIndex(function (c) { return c.id === chat.id; });
  if (i >= 0) store.chats[i] = chat;
  else store.chats.push(chat);
  sortChats();
  store.newChatOpen = false;
  openChat(chat.id);
  return chat;
}

/* Archivar/desarchivar un chat o grupo. */
export async function archiveChat(chatId, archived) {
  const r = await api('POST', '/api/chats/' + chatId + '/archive',
    { archived: !!archived }, { retry401: true });
  const c = findChat(chatId);
  if (c) c.archived = !!archived;
  if (archived && store.activeChatId === chatId) closeChat();
  return r;
}

/* Eliminar un MD de MI lista (el otro conserva su copia). */
export async function deleteDmChat(chatId) {
  const r = await api('DELETE', '/api/chats/' + chatId, undefined,
    { retry401: true });
  store.chats = store.chats.filter(function (c) { return c.id !== chatId; });
  if (store.activeChatId === chatId) closeChat();
  delete store.msgs[chatId];
  delete store.loaded[chatId];
  delete store.hasMore[chatId];
  delete store.syncNeeded[chatId];
  delete store.typing[chatId];
  delete store.readSeqs[chatId];
  delete store.deliveredSeqs[chatId];
  if (store.info && store.info.chatId === chatId) store.info = null;
  return r;
}

/* Grupo nuevo (yo = owner). members: usernames. */
export async function createGroup(title, members) {
  const r = await api('POST', '/api/chats/group',
    { title: title, members: members || [] });
  const chat = r.chat;
  const i = store.chats.findIndex(function (c) { return c.id === chat.id; });
  if (i >= 0) store.chats[i] = chat;
  else store.chats.push(chat);
  sortChats();
  store.newChatOpen = false;
  openChat(chat.id);
  return chat;
}

/* Agregar un miembro a un grupo activo (mensaje system + WS). */
export async function addMember(chatId, username) {
  const r = await api('POST', '/api/chats/' + chatId + '/members',
    { username: username });
  loadChats();
  return r;
}

/* W46: ascender/quitar admin y sacar a un miembro (owner/admin). El
   server también valida el rol y emite el mensaje system + eventos WS. */
function refreshAfterMemberChange(chatId) {
  loadChats();
  if (store.info && store.info.chatId === chatId) loadMembers(chatId);
}

export async function setMemberRole(chatId, userId, role) {
  const r = await api('PATCH', '/api/chats/' + chatId + '/members/' + userId,
    { role: role }, { retry401: true });
  refreshAfterMemberChange(chatId);
  return r;
}

export async function removeMember(chatId, userId) {
  const r = await api('DELETE', '/api/chats/' + chatId + '/members/' + userId,
    undefined, { retry401: true });
  refreshAfterMemberChange(chatId);
  return r;
}

/* El owner cede el grupo a otro miembro (evita grupos sin administrar). */
export async function transferOwner(chatId, username) {
  const r = await api('POST', '/api/chats/' + chatId + '/transfer-owner',
    { username: username }, { retry401: true });
  refreshAfterMemberChange(chatId);
  return r;
}

/* ---- W7: panel derecho "info del chat" ---- */

/* Miembros del chat activo con presencia. Guard por chatId: si mientras
   cargaba se cambió de chat, la respuesta vieja se descarta. */
export async function loadMembers(chatId) {
  if (!chatId) return;
  if (!store.info || store.info.chatId !== chatId) {
    store.info = { chatId: chatId, loading: true, members: [], error: '' };
  }
  try {
    const r = await api('GET', '/api/chats/' + chatId + '/members',
      undefined, { retry401: true });
    if (!store.hasSession) return;
    if (!store.info || store.info.chatId !== chatId) return;
    store.info = { chatId: chatId, loading: false, members: r.members || [], error: '' };
  } catch (e) {
    if (!store.info || store.info.chatId !== chatId) return;
    store.info = {
      chatId: chatId, loading: false, members: [],
      error: (e && e.detail) || 'No se pudo cargar la info del chat',
    };
  }
}

/* Salir de un grupo (W7): el server borra la membresía y avisa por WS.
   Si era el chat abierto, se cierra. */
export async function leaveGroup(chatId) {
  const r = await api('POST', '/api/chats/' + chatId + '/leave', {},
    { retry401: true });
  if (store.activeChatId === chatId) store.activeChatId = 0;
  if (store.info && store.info.chatId === chatId) store.info = null;
  await loadChats();
  return r;
}

export async function searchUsers(q) {
  if (!q || q.trim().length < 2) return [];
  const r = await api('GET', '/api/users/search?q=' + encodeURIComponent(q.trim()));
  return r.results || [];
}

/* ------------------------------------------------- W27: personas */

/* Amigos conectados + solicitudes enviadas/recibidas (panel Personas). */
export async function loadPeople() {
  try {
    const r = await api('GET', '/api/people', undefined, { retry401: true });
    if (!store.hasSession) return;
    store.people = r;
  } catch (e) {
    /* sin sesión o red: el panel muestra su estado vacío */
  }
}

/* W28e: usuarios que yo bloqueé — se guardan como ids para que el menú
   del perfil sepa si ofrecer "Bloquear" o "Desbloquear". */
export async function loadBlocks() {
  try {
    const r = await api('GET', '/api/people/blocks', undefined, { retry401: true });
    if (!store.hasSession) return;
    store.blocks = r.user_ids || [];
  } catch (e) {
    /* sin sesión o red: sin bloqueos cargados */
  }
}

/* W28e: bloquear (optimista) — el server además rompe amistad y
   solicitudes pendientes, por eso se recarga la gente. */
export async function blockUser(username) {
  const r = await api('POST', '/api/people/block', { username: username });
  if (r && typeof r.blocked === 'number' && store.blocks.indexOf(r.blocked) < 0) {
    store.blocks = store.blocks.concat([r.blocked]);
  }
  loadPeople();
  return r;
}

/* W28e: desbloquear (optimista). */
export async function unblockUser(username) {
  const r = await api('POST', '/api/people/unblock', { username: username });
  if (r && typeof r.blocked === 'number') {
    const id = r.blocked;
    store.blocks = store.blocks.filter(function (b) { return b !== id; });
  }
  loadPeople();
  return r;
}

export async function sendFriendRequest(username) {
  const r = await api('POST', '/api/people/requests', { username: username },
    { retry401: true });
  await loadPeople();
  return r;
}

/* Aceptar crea (o reutiliza) el DM: devuelve {chat} y se abre. */
export async function acceptFriendRequest(reqId) {
  const r = await api('POST', '/api/people/requests/' + reqId + '/accept', {},
    { retry401: true });
  await loadPeople();
  if (r && r.chat) await openChat(r.chat.id);
  return r;
}

export async function rejectFriendRequest(reqId) {
  const r = await api('POST', '/api/people/requests/' + reqId + '/reject', {},
    { retry401: true });
  await loadPeople();
  return r;
}

export async function cancelFriendRequest(reqId) {
  const r = await api('DELETE', '/api/people/requests/' + reqId, undefined,
    { retry401: true });
  await loadPeople();
  return r;
}

export async function unfriend(fid) {
  const r = await api('DELETE', '/api/people/friends/' + fid, undefined,
    { retry401: true });
  await loadPeople();
  return r;
}

/* ------------------------------------------------------- mensajes */

function maxSeq(arr) {
  let max = 0;
  if (arr) for (let i = 0; i < arr.length; i++) if (arr[i].seq > max) max = arr[i].seq;
  return max;
}

/* Inserta/actualiza un mensaje sin duplicar (REST + eco WS). */
export function upsertMessage(m) {
  const arr = store.msgs[m.chat_id];
  if (!arr) return;
  let stored = null;
  /* W31a: el reemplazo conserva la bandera de animación del objeto que
     estaba (el ack REST/WS no debe ni cortar la animación en curso ni
     re-dispararla: el mensaje ya animó al aparecer). */
  const keepIn = function (old, fresh) {
    if (old && old._in && fresh._in == null) fresh._in = old._in;
  };
  for (let i = 0; i < arr.length; i++) {
    /* W68: además del id interno, el ID público de 20 dígitos identifica
       el mensaje en REST/WS (dedup estable sin depender del id). */
    if (arr[i].id === m.id ||
        (m.pub_id && arr[i].pub_id && arr[i].pub_id === m.pub_id)) {
      keepIn(arr[i], m); arr[i] = m; stored = arr[i]; break;
    }
  }
  if (!stored && m.client_msg_id) {
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      if (x.pending && x.client_msg_id === m.client_msg_id) {
        keepIn(x, m); arr[i] = m; stored = arr[i]; break;
      }
    }
  }
  if (!stored) { arr.push(m); stored = arr[arr.length - 1]; }
}

/* Une la página inicial (o de WS) con lo ya presente, sin perder carreras. */
export function mergeMessages(chatId, list) {
  if (!store.msgs[chatId]) store.msgs[chatId] = [];
  const arr = store.msgs[chatId];
  for (let i = 0; i < list.length; i++) upsertMessage(list[i]);
  arr.sort(function (a, b) { return a.seq - b.seq; });
}

/* Marca leído: primero por WS, si no conectado vía REST (API.md §read).
   Con "recibos de lectura" apagado no se avisa a nadie (W6). */
export function sendSeen(chatId, seq) {
  if (!chatId || !seq) return;
  /* W45b: con los recibos apagados igual hay que avanzar MI
     last_read_seq en el server; si no, al recargar la lista todo vuelve
     a aparecer como no leído. silent evita avisar a los demás. */
  const silent = store.prefs.receipts === false;
  /* La WS es el camino rápido, pero no confirma la entrega. Se manda
     también por REST: si el socket está medio abierto, el recibo no se
     pierde. El server ignora el duplicado (last_read_seq no avanza). */
  if (!silent && hooks.sendSeen) hooks.sendSeen(chatId, seq);
  api('POST', '/api/chats/' + chatId + '/read',
    { seq: seq, silent: silent }).catch(function () {});
}

/* Mensaje entrante por WS: insertar + preview + badge + seen. */
export function onIncomingMessage(m) {
  finishIncoming(m);
}

/* W59: descarga automática según tipo y red. Se guarda en los datos de
   la app (web, PWA, escritorio y APK); nunca crea por sí sola una copia
   pública en Descargas. */
function maybeAutoDownload(m) {
  if (!m || !m.media || !m.media.url || m.kind === 'system') return;
  if (m.sender && store.user && m.sender.id === store.user.id) return;
  const name = m.media.name || 'archivo';
  const type = dlCategory(m.kind, m.media.mime, name);
  const url = mediaUrl(m.media.url, true);
  autoDownload(url, name, m.media.mime || '', type);
}

/* W58/W59: al abrir un chat se completan solo los últimos `max`
   ADJUNTOS del historial (no los últimos mensajes: puede haber texto
   entre medio). `catchUpChat` y la WS ya entregan lo nuevo. La cola
   evita ráfagas y `hasDownload` evita repetir. */
function autoDownloadMessages(list, max) {
  if (!list || !list.length) return;
  let seen = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || !m.media) continue;
    if (max && seen >= max) break;
    maybeAutoDownload(m);
    seen++;
  }
}

function finishIncoming(m) {
  const mine = !!(m.sender && store.user && m.sender.id === store.user.id);
  const open = store.activeChatId === m.chat_id;
  /* W45c: si el primer mensaje de un chat llega por WS justo mientras
     openChat espera el historial, store.msgs[chat] todavía no existe.
     Antes se perdía (la respuesta inicial ya no lo incluía). Se crea el
     carril para el chat activo y mergeMessages() lo une sin duplicar. */
  if (!store.msgs[m.chat_id] && open) store.msgs[m.chat_id] = [];
  if (store.msgs[m.chat_id]) {
    /* W31a: la bandera de animación SOLO para mensajes que aún no
       estaban (los que llegan nuevos); una fila ya presente — p. ej.
       el propio mensaje optimista que acaba de confirmarse y cambió de
       palomita — NO vuelve a animar. */
    const before = store.msgs[m.chat_id];
    let existed = false;
    for (let i = 0; i < before.length; i++) {
      const x = before[i];
      if (x.id === m.id ||
          (m.client_msg_id && x.pending &&
           x.client_msg_id === m.client_msg_id)) { existed = true; break; }
    }
    upsertMessage(m);
    if (!existed) {
      const arr = store.msgs[m.chat_id];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].id === m.id) { arr[i]._in = true; break; }
      }
    }
    /* W34d: con la pestaña OCULTA no se confirma el visto solo — el
       (N) del título espera a que entres al chat. */
    if (!mine && open && !document.hidden) sendSeen(m.chat_id, m.seq);
  }
  const chat = findChat(m.chat_id);
  if (chat) {
    chat.last_message = m;
    if (!mine && !open) {
      chat.unread = (chat.unread || 0) + 1;
      /* W28b: si la cita va dirigida a mí, suma en su contador aparte */
      const me = store.user && store.user.id;
      if (me != null && (m.mentions || []).indexOf(me) >= 0) {
        chat.unread_mentions = (chat.unread_mentions || 0) + 1;
      }
    }
    sortChats();
  } else if (!mine) {
    loadChats();   // chat que no conocí (me lo crearon): refrescar lista
  }
  if (!mine) maybeAutoDownload(m);
}

/* Stub de respuesta para el mensaje optimista (el real llega del server). */
function replyStub(src) {
  return {
    id: src.id,
    seq: src.seq,
    kind: src.kind || 'text',
    /* W32: cita el texto DESCIFRADO si existe (nunca el marcador). */
    body: (src.body || '').slice(0, 120),
    sender: src.sender ? (src.sender.display_name || src.sender.username) : null,
  };
}

/* Texto optimista → REST → reemplazo por el real (dedupe con eco WS).
   srcMsg (opcional) = mensaje al que se responde. */
export async function sendText(chatId, text, srcMsg, kind, opts) {
  text = (text || '').replace(/\s+$/, '');
  if (!text) return;
  kind = kind || 'text';   // W28g: 'sticker' reutiliza el mismo flujo
  opts = opts || {};
  /* W61: un mensaje de más de 3000 caracteres no se manda como burbuja:
     se sube como archivo de texto con el nombre del idioma activo. */
  if (kind === 'text' && charCount(text) > MAX_TEXT_CHARS) {
    const name = store.lang === 'en' ? 'message.txt' : 'mensaje.txt';
    const file = new File([text], name, { type: 'text/plain' });
    return sendMedia(chatId, file, 'file', srcMsg, '', null, null,
      { spoiler: !!opts.spoiler });
  }
  /* W29d: el server recibe el flag de spoiler. W67: el texto va SIEMPRE
     en claro — el cifrado de extremo a extremo se retiró. */
  const cid = uuid();
  const tmp = {
    id: -Math.floor(Date.now() + Math.random()),
    seq: 0,
    chat_id: chatId,
    kind: kind,
    body: text,
    spoiler: !!opts.spoiler,   // W29d
    media: null,
    reply_to: srcMsg ? replyStub(srcMsg) : null,
    client_msg_id: cid,
    created_at: Math.floor(Date.now() / 1000),
    sender: store.user,
    reactions: [],
    pending: true,
    _in: true,           // W29a: animación de entrada (solo mensajes nuevos)
  };
  if (!store.msgs[chatId]) store.msgs[chatId] = [];
  store.msgs[chatId].push(tmp);
  try {
    const r = await api('POST', '/api/chats/' + chatId + '/messages',
      { kind: kind, body: text, reply_to: srcMsg ? srcMsg.id : null,
        client_msg_id: cid, spoiler: !!opts.spoiler });
    upsertMessage(r.message);
    bumpPreview(chatId, r.message);
  } catch (e) {
    removePending(chatId, cid);
    /* W18: el aviso anti-spam ya explica el 429 (sin toast encima). */
    if (!e.spam) toast(e.detail || 'No se pudo enviar', 'err');
    throw e;
  }
}

/* W11: subidas en vuelo por client_msg_id → file + control del XHR. */
var _uploads = {};

/* W28g: enviar un GIF de la biblioteca local — se baja el archivo, se
   sube por el flujo normal de media (image/gif queda tal cual) y viaja
   como mensaje de imagen. */
export async function sendGif(chatId, name) {
  try {
    const r = await fetch('/static/gifs/' + encodeURIComponent(name));
    if (!r.ok) throw new Error('gif');
    const blob = await r.blob();
    const file = new File([blob], name, { type: 'image/gif' });
    sendMedia(chatId, file, 'image');
  } catch (e) {
    toast('No se pudo enviar el GIF', 'err');
  }
}

/* W22: resolución de una imagen local, para reservar el cuadro durante
   la subida (el server manda width/height en el mensaje final). */
function probeImg(url, cb) {
  const im = new Image();
  im.onload = function () { cb(im.naturalWidth, im.naturalHeight); };
  im.onerror = function () { cb(0, 0); };
  im.src = url;
}

/* W66c: ¿es un WebP animado? Mira solo la cabecera VP8X (bit de
   animación) sin decodificar el archivo. Los GIF se detectan por el
   type del File. Sirve para subirlos tal cual (el editor con canvas los
   dejaría quietos) y para tratarlos como GIF. */
export async function isAnimWebp(file) {
  if (!file || file.type !== 'image/webp') return false;
  try {
    const buf = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const tag = function (o) {
      return String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    };
    if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return false;
    if (tag(12) !== 'VP8X') return false;   // sin cabecera ext: 1 solo frame
    return !!(buf[20] & 0x02);              // bit 1 del byte de flags = anim
  } catch (e) { return false; }
}

function findPending(chatId, cid) {
  var arr = store.msgs[chatId];
  if (!arr) return null;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].pending && arr[i].client_msg_id === cid) return arr[i];
  }
  return null;
}

/* Cancelar la subida en vuelo: aborta el XHR, suelta la miniatura local
   y saca la burbuja sin dejar rastro. */
export function cancelUpload(chatId, cid) {
  var u = _uploads[cid];
  if (!u) return;
  u.aborted = true;
  if (u.ctl && u.ctl.abort) u.ctl.abort();
  delete _uploads[cid];
  if (u.localUrl) { try { URL.revokeObjectURL(u.localUrl); } catch (e) {} }
  removePending(chatId, cid);
}

/* Reintentar una subida fallida (si el archivo ya subió, repite solo el
   mensaje, que es lo que casi siempre falla: 429, conexión, etc.). */
export function retryUpload(chatId, cid) {
  var u = _uploads[cid];
  var row = findPending(chatId, cid);
  if (!u || !row) return;
  row.upload.state = 'up';
  row.upload.err = '';
  runUpload(chatId, cid);
}

function runUpload(chatId, cid) {
  var u = _uploads[cid];
  if (!u) return;
  var row = findPending(chatId, cid);
  var send = function (up) {
    u.up = up;
    if (row) row.upload.p = 1;
    return api('POST', '/api/chats/' + chatId + '/messages',
      { kind: u.kind, body: u.body || '', media_id: up.id,
        reply_to: u.srcMsg ? u.srcMsg.id : null, client_msg_id: cid,
        peaks: u.peaks ? JSON.stringify(u.peaks) : null,      // W13: onda
        dur: u.dur || null,                                   // W13: duración
        spoiler: !!u.spoiler });   // W29d
  };
  var chain;
  if (u.up) {
    chain = Promise.resolve(u.up);
  } else {
    u.ctl = {};
    chain = uploadMedia(u.file, function (p) {
      if (row) row.upload.p = p;
    }, u.ctl);
  }
  chain.then(send).then(function (r) {
    delete _uploads[cid];
    if (u.localUrl) { try { URL.revokeObjectURL(u.localUrl); } catch (e) {} }
    upsertMessage(r.message);
    bumpPreview(chatId, r.message);
  }).catch(function (e) {
    if (u.aborted || e.canceled) {
      delete _uploads[cid];
      removePending(chatId, cid);
      return;
    }
    // La burbuja queda en error con su botón de reintento (sin toasts).
    var row2 = findPending(chatId, cid);
    if (row2) { row2.upload.state = 'fail'; row2.upload.err = e.detail || ''; }
    else if (!e.spam) toast(e.detail || 'No se pudo enviar el archivo', 'err');   // W18
  });
}

/* Archivo/imagen/video/nota de voz: la burbuja pending sale YA con su
   círculo de progreso y la subida corre en background; al terminar se
   reemplaza por el mensaje real. Sin toasts de "Subiendo…" (W11).
   kind: 'image' | 'file' | 'voice' (opcional; si no, se infiere del MIME).
   srcMsg (opcional) = mensaje al que se responde. caption = texto bajo
   la imagen/video. */
export async function sendMedia(chatId, file, kind, srcMsg, caption, peaks, dur, opts) {
  /* W29a: un archivo vacío (0 bytes) no se envía: se avisa y no se
     crea la burbuja (antes el server respondía 400 y el mensaje
     quedaba marcado como error con reintento). */
  if (!file || !(file.size > 0)) {
    toast('El archivo está vacío', 'err');
    return;
  }
  kind = kind || (/^image\//.test(file.type || '') ? 'image' : 'file');
  opts = opts || {};
  /* W61: el pie de foto también es un mensaje; el server no acepta más
     de 3000 caracteres. Se acota en el cliente para no romper la subida. */
  caption = caption || '';
  if (charCount(caption) > MAX_TEXT_CHARS) {
    caption = Array.from(caption).slice(0, MAX_TEXT_CHARS).join('');
  }
  /* El pie de foto va SIEMPRE en claro. */
  const cid = uuid();
  const tmp = {
    id: -Math.floor(Date.now() + Math.random()),
    seq: 0,
    chat_id: chatId,
    kind: kind,
    body: caption || '',
    spoiler: !!opts.spoiler,   // W29d
    media: null,
    peaks: peaks || null,        // W13: onda de la nota de voz
    dur: dur || null,            // W13: duración real (los WebM no la traen)
    reply_to: srcMsg ? replyStub(srcMsg) : null,
    client_msg_id: cid,
    created_at: Math.floor(Date.now() / 1000),
    sender: store.user,
    reactions: [],
    pending: true,
    _in: true,           // W29a: animación de entrada
    /* W11: estado del círculo de progreso en la burbuja */
    upload: { p: 0, state: 'up', err: '' },
    fname: file.name || '',
    fsize: file.size || 0,
  };
  if (kind === 'image' && window.URL && URL.createObjectURL) {
    tmp.localUrl = URL.createObjectURL(file);   // preview local mientras sube
    /* W22: la resolución local reserva el cuadro (con el círculo de
       subida dentro) sin esperar a que el server responda. */
    probeImg(tmp.localUrl, function (w, h) {
      if (w && h) tmp.media = Object.assign({}, tmp.media, { width: w, height: h });
    });
  }
  if (!store.msgs[chatId]) store.msgs[chatId] = [];
  store.msgs[chatId].push(tmp);
  _uploads[cid] = { file: file, kind: kind, body: caption || '',
                    spoiler: !!opts.spoiler,
                    srcMsg: srcMsg || null, localUrl: tmp.localUrl || '',
                    peaks: peaks || null, dur: dur || null,
                    up: null, aborted: false, ctl: null };
  runUpload(chatId, cid);
}

/* Reacción: alterna la mía (el server admite 1 por usuario, PK message+user).
   Optimista + eco WS idempotente (realtime.js no duplica user+emoji). */
/* W28c: fijar/desfijar un mensaje (la info del chat lo lista). */
export async function togglePin(chatId, msgId, pin) {
  try {
    const r = await api('POST', '/api/chats/' + chatId + '/messages/' +
      msgId + '/pin', { pin: pin });
    if (r.message) upsertMessage(r.message);
  } catch (e) {
    toast(e.detail || 'No se pudo fijar el mensaje', 'err');
  }
}

export async function toggleReaction(chatId, msgId, emoji) {
  const arr = store.msgs[chatId];
  if (!arr || !store.user) return;
  let msg = null;
  for (let i = 0; i < arr.length; i++) if (arr[i].id === msgId) msg = arr[i];
  if (!msg) return;
  const prev = msg.reactions || [];
  let mineIdx = -1;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].user_id === store.user.id) mineIdx = i;
  }
  const remove = mineIdx >= 0 && prev[mineIdx].emoji === emoji;
  const next = prev.slice();
  if (mineIdx >= 0) next.splice(mineIdx, 1);   // 1 reacción por usuario
  if (!remove) next.push({ emoji: emoji, user_id: store.user.id });
  msg.reactions = next;
  try {
    await api(remove ? 'DELETE' : 'POST',
      '/api/chats/' + chatId + '/reactions/' + msgId, { emoji: emoji });
  } catch (e) {
    msg.reactions = prev;
    toast((e && e.detail) || 'No se pudo reaccionar', 'err');
  }
}

function bumpPreview(chatId, m) {
  const chat = findChat(chatId);
  if (chat) {
    chat.last_message = m;
    sortChats();
  }
}

/* ---- W8: editar y eliminar mensajes ---- */

/* Edita el texto de un mensaje propio (server: PUT + WS message_edited). */
export async function editMessage(chatId, msgId, text) {
  text = (text || '').replace(/\s+$/, '');
  if (!text) return;
  if (charCount(text) > MAX_TEXT_CHARS) {
    toast(t('El mensaje supera los 3000 caracteres'), 'err');
    return;
  }
  const r = await api('PUT', '/api/chats/' + chatId + '/messages/' + msgId,
    { body: text }, { retry401: true });
  if (r.message) upsertMessage(r.message);
  store.editFor = 0;
  store.editDraft = '';
  return r.message;
}

/* Elimina un mensaje propio con confirmación (server: DELETE + WS). */
export function askDeleteMessage(chatId, msg) {
  store.confirmBox = {
    title: 'Eliminar mensaje',
    text: 'Se borra el mensaje para ti y para todos los del chat.\nEsta acción no se puede deshacer.',
    danger: true,
    okLabel: 'Eliminar',
    onOk: async function () {
      await api('DELETE', '/api/chats/' + chatId + '/messages/' + msg.id,
        undefined, { retry401: true });
      const arr = store.msgs[chatId];
      if (arr) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].id === msg.id) arr.splice(i, 1);
        }
      }
      const chat = findChat(chatId);
      // si era el último mensaje, que el server recalcule el preview
      if (chat && chat.last_message && chat.last_message.id === msg.id) loadChats();
    },
  };
}

function removePending(chatId, cid) {
  const arr = store.msgs[chatId];
  if (!arr) return;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].pending && arr[i].client_msg_id === cid) arr.splice(i, 1);
  }
}

/* Aviso "escribiendo…" (best effort, con throttle).
   Con el aviso apagado no se emite nada (W6). */
let lastTyping = 0;
export function notifyTyping(chatId) {
  if (store.prefs.typing === false) return;
  const now = Date.now();
  if (now - lastTyping < 2500) return;
  lastTyping = now;
  api('POST', '/api/chats/' + chatId + '/typing', {}).catch(function () {});
}

/* ------------------------------------------------------- W13 */

/* Fijar/desfijar el chat en MI lista (se guarda en el server). */
export async function setPinned(chatId, v) {
  try {
    await api('POST', '/api/chats/' + chatId + '/pin', { pinned: !!v },
      { retry401: true });
    /* Re-resolver DESPUÉS del await: si un loadChats aterrizó mientras
       (reconexión WS), el objeto capturado antes ya no está en el store
       y la mutación se perdería en un objeto huérfano. */
    const chat = findChat(chatId);
    if (chat) { chat.pinned = !!v; sortChats(); }
  } catch (e) {
    toast((e && e.detail) || 'No se pudo fijar el chat', 'err');
  }
}

/* Silenciar/activar las notificaciones del chat (solo mías). */
export async function setMuted(chatId, v) {
  try {
    await api('POST', '/api/chats/' + chatId + '/mute', { muted: !!v },
      { retry401: true });
    const chat = findChat(chatId);   // ídem: objeto vigente, no huérfano
    if (chat) chat.muted = !!v;
  } catch (e) {
    toast((e && e.detail) || 'No se pudo silenciar el chat', 'err');
  }
}

/* Reenviar un mensaje a otro de mis chats: el server copia contenido y
   archivo (media_id compartido) y el nuevo mensaje es mío (forwarded=1). */
export async function forwardMessage(srcChatId, msgId, targetChatId) {
  const r = await api('POST',
    '/api/chats/' + srcChatId + '/messages/' + msgId + '/forward',
    { target_chat_id: targetChatId }, { retry401: true });
  if (r.message) {
    upsertMessage(r.message);       // aparece ya si el destino está cargado
    bumpPreview(targetChatId, r.message);
  }
  return r.message;
}
