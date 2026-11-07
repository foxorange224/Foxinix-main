/* W77: toast de error que traduce detalles técnicos de la API a lenguaje
   natural mediante humanError(). fallback es el mensaje genérico si no hay
   error de API. */
const toastErr = function (err, fallback) {
  toast(humanError(err || { detail: fallback || '' }), 'err');
};

/* Foxinix — pantalla principal: lista de chats + conversación (W2). */
import {
  store, toast, toggleTheme, setTheme, setAccent, setWall, setPref, setFont,
  setPrefStr,   /* W40: estilo de emojis (valor libre) */
  setWallImg, setWallDim, setWallBlur, setSideCollapsed, setMicDev,
  setArchiveLock, checkArchiveLock, clearArchiveLock, hasArchiveLock,
  syncUrl,      /* W68: modal join vuelve a la URL real al cancelar */
} from '../store.js';
import { logout, api, session, saveSession, uploadMedia,
  uploadChatAvatar, ensurePreview, humanError } from '../api.js';
import { t, setLang, LANGS } from '../i18n.js';
/* W78: utilidades de accesibilidad para lectores de pantalla. */
import { formatEmojisForA11y } from '../a11y.js';
/* W63: catálogo y reproducción de tonos de mensaje/llamada. */
import { MESSAGE_TONES, CALL_TONES, customTone, toneSrc } from '../tones.js';
/* W28h: llamadas de voz/video 1:1 (WebRTC) */
import { startCall, joinGroupCall, acceptCall, rejectCall, hangupCall,
  toggleMute, toggleCam, getLocalStream, getLocalPreviewStream,
  getRemoteStream, getPeerStream, shareScreen, stopScreenShare } from '../call.js';
import {
  listDownloads, saveDownloadToDevice, deleteDownload, clearDownloads,
  openAppDownload,
  DL_TYPES, autoDlPrefs, setAutoDl, downloadKey,
} from '../downloads.js';
import {
  bootPermissions, ensurePermission, reviewPermissions,
  refreshPermissionStates, permissionLabel, permissionStateLabel,
  grantCurrent, skipCurrent, openCurrentSettings,
  PERMISSIONS, permissionState,
} from '../permissions.js';
import {
  openChat, closeChat, loadChats, loadOlder, sendText, sendMedia,
  createDm, createGroup, addMember, setMemberRole, removeMember,
  transferOwner, archiveChat, deleteDmChat,
  toggleReaction, loadMembers, leaveGroup,
  /* W28c */
  togglePin,
  /* W28g */
  sendGif,
  /* W8 */
  editMessage, askDeleteMessage,
  searchUsers, notifyTyping, chatTitle, mediaUrl, fmtSize,
  preloadImage,   /* W57: precarga sin repetir recursos */
  /* W11 */
  cancelUpload, retryUpload,
  /* W13 */
  setPinned, setMuted, forwardMessage, mergeMessages,
  /* W22 */
  resolvePendingChat,
  /* W57: destinos de notificaciones */
  openNotificationTarget,
  /* W27: panel Personas/Amigos */
  loadPeople, sendFriendRequest, acceptFriendRequest,
  rejectFriendRequest, cancelFriendRequest, unfriend,
  /* W28e */
  loadBlocks, blockUser, unblockUser,
  /* W58 */
  hydrateDownloads,
  /* W61 */
  charCount, MAX_TEXT_CHARS,
  /* W66c */
  isAnimWebp,
  /* W68: unirse a grupo por enlace */
  joinGroupByPub,
} from '../actions.js';
/* W15: descarga de archivos con progreso, cancelación y reintento. */
import {
  startDownload, getBlob, markDlDone, compatUrl, markMediaCompat,
  markOggBroken, audioFallbackFmt, forgetCached, cacheMedia,
} from '../mediadl.js';
import { emojiCats, emojiCat, emojiRecent, emojiSearch, emojiPush,
  emojiCode, shortcodesToEmoji, emojiCodesPrefix,
  emoFile, emoSrc, emoStyle, emoAnySrc, splitEmojis, isEmojiBurst,
  reactBump, reactRank } from '../emoji.js';
import { startWS, stopWS, applyProfileFields } from '../realtime.js';
import { AvatarEditor } from './avatar-editor.js';

/* ------------------------------------------------------- fechas/horas */

const pad = function (n) { return n < 10 ? '0' + n : '' + n; };

function dayKey(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function dayLabel(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return t('HOY');
  if (diff === 1) return t('AYER');
  if (d.getFullYear() === now.getFullYear()) return d.getDate() + '/' + (d.getMonth() + 1);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
}

/* W17: 12/24 h. fmtTime es llamado dentro de computed/render, así que
   leer store.prefs.h12 lo vuelve reactivo: cambiarlo repinta los tiempos. */
function fmtTime(d) {
  const h = d.getHours();
  if (store.prefs.h12) {
    const h12 = h % 12 || 12;
    return h12 + ':' + pad(d.getMinutes()) + (h < 12 ? ' am' : ' pm');
  }
  return pad(h) + ':' + pad(d.getMinutes());
}

function fmtListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return fmtTime(d);
  /* W17: ayer se muestra como "Ayer" en vez de la fecha. */
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= new Date(today - 86400000)) return t('Ayer');
  if (d.getFullYear() === now.getFullYear()) return d.getDate() + '/' + (d.getMonth() + 1);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
}

function fmtLastSeen(ts) {
  if (!ts) return t('desconectado');
  const d = new Date(ts * 1000);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return t('últ. vez {n}', { n: fmtTime(d) });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= new Date(today - 86400000)) return t('últ. vez ayer, {n}', { n: fmtTime(d) });
  return t('últ. vez {n}', { n: d.getDate() + '/' + (d.getMonth() + 1) + ' ' + fmtTime(d) });
}

/* ------------------------------------------------------- estados (W6)

   W9: presets con los nombres y colores de Discord —
   En línea (verde #23a55a), Ausente (ámbar idle #f0b232),
   No molestar (rojo #f23f43), Invisible (gris offline #80848e).
   El valor interno 'busy' se conserva por compatibilidad con el server
   (validador + datos ya guardados).
   W10: se quitó "Sin estado" (como en Discord todo el mundo tiene estado):
   el default de las cuentas nuevas es 'online' y el valor vacío heredado
   se trata como En línea.
   W56: en pantallas de teléfono estos mismos presets se dibujan como
   teléfonos de color (CSS), manteniendo los colores y la semántica. */

const STATUS_PRESETS = [
  { val: 'online', label: 'En línea', dot: 'sd-online' },
  { val: 'busy', label: 'Ausente', dot: 'sd-busy' },
  { val: 'dnd', label: 'No molestar', dot: 'sd-dnd' },
  { val: 'invisible', label: 'Invisible', dot: 'sd-off' },
];

function presetLabel(val) {
  for (let i = 0; i < STATUS_PRESETS.length; i++) {
    if (STATUS_PRESETS[i].val === val) return t(STATUS_PRESETS[i].label);
  }
  return '';
}

/* ------------------------------------------------------- W7: utilidades */

/* Puntito de estado en el avatar (W9, colores Discord):
   En línea → verde; Ausente → ámbar; No molestar → rojo;
   Invisible → gris. W13: **desconectado también muestra el puntito,
   pero gris** (lo pidió el usuario); los grupos (sin usuario) no llevan
   puntito. selfOn (opcional) = yo mismo: el "online" sale del WS. */
function dotClass(u, selfOn) {
  const explicit = selfOn !== undefined;
  if (!explicit && !u) return { on: false };   // grupo/sin usuario
  /* W26: u.online (REST) es solo el primer relleno; manda store.presence
     (eventos WS + snapshot al reconectar). */
  const on = explicit ? !!selfOn
    : !!(u && (store.presence[u.id] != null ? store.presence[u.id] : u.online));
  const out = { on: true };
  if (!on) { out['st-off'] = true; return out; }   // gris si desconectado
  const p = (u && u.status_preset) || '';
  if (p === 'busy') out['st-busy'] = true;
  else if (p === 'dnd') out['st-dnd'] = true;
  else if (p === 'invisible') out['st-off'] = true;
  return out;
}

function statusOf(u) {
  if (u && u.status_text) return u.status_text;
  if (u && u.status_preset) return presetLabel(u.status_preset);
  return '';
}

/* W58: la burbuja citada del perfil muestra el mensaje personalizado o
   un preset relevante; el "En línea" por defecto no se repite (la
   presencia ya la dice el aro del avatar). */
function profileQuote(u) {
  if (!u) return '';
  if (u.status_text) return u.status_text;
  if (u.status_preset && u.status_preset !== 'online') {
    return presetLabel(u.status_preset);
  }
  return '';
}

function connLine(u) {
  const on = u && (store.presence[u.id] != null ? store.presence[u.id] : u.online);
  return on ? t('En línea') : fmtLastSeen(u ? u.last_seen : 0);
}

/* W27: píldora de estado (perfil y info del directo) — si está
   DESCONECTADO se dice "Desconectado": el preset "en línea" guardado en
   el perfil no es un estado del usuario. Si está activo, manda SU estado
   (texto o preset) por encima de lo genérico. */
function connPill(u) {
  if (!u) return '';
  const on = store.presence[u.id] != null ? store.presence[u.id] : u.online;
  return on ? statusOf(u) : t('Desconectado');
}

/* Perfil de otro usuario en ventana flotante (clic repetido = cerrar). */
async function openProfile(username) {
  if (!username) return;
  const cur = store.profile;
  if (cur && cur.user && cur.user.username === username) {
    store.profile = null;
    return;
  }
  store.profile = { loading: true, user: null, error: '', username: username };
  try {
    const r = await api('GET', '/users/' + encodeURIComponent(username),
      undefined, { retry401: true });
    /* W63: si un evento de perfil llegó mientras cargaba, la respuesta
       del GET puede ser más vieja: el evento manda. */
    const live = store.profile && store.profile.username === username
      ? store.profile.liveUser : null;
    if (live && r.user && live.id === r.user.id) {
      applyProfileFields(r.user, live);
    }
    store.profile = { loading: false, user: r.user, error: '', username: username };
  } catch (e) {
    store.profile = {
      loading: false, user: null, error: (e && t(e.detail)) || t('No se pudo cargar el perfil'),
      username: username,
    };
  }
}

/* W78: abre el modal de perfil de grupo con descripción, miembros y
   archivos compartidos. Carga los datos del endpoint /chats/:id. */
async function openGroupProfile(chatId) {
  if (!chatId) return;
  const cur = store.groupProfile;
  if (cur && cur.chat && cur.chat.id === chatId) {
    store.groupProfile = null;
    return;
  }
  store.groupProfile = { loading: true, chat: null, members: [], gallery: [], error: '' };
  try {
    const r = await api('GET', '/chats/' + chatId,
      undefined, { retry401: true });
    store.groupProfile = {
      loading: false,
      chat: r,
      members: r.members || [],
      gallery: r.gallery || [],
      error: '',
    };
  } catch (e) {
    store.groupProfile = {
      loading: false,
      chat: null, members: [], gallery: [],
      error: (e && t(e.detail)) || t('No se pudo cargar la información del grupo'),
    };
  }
}

/* Confirmación antes de salirse de un grupo (menú contextual / panel). */
function askLeave(c) {
  if (!c) return;
  store.confirmBox = {
    title: 'Salir del grupo',
    // Dinámico: se arma ya traducido (ConfirmBox solo repite el texto).
    text: t('Vas a salir de "{n}".\nEste chat se borra de tu lista y no vas a recibir más mensajes. Puedes volver si alguien te vuelve a agregar.',
      { n: chatTitle(c) }),
    danger: true,
    okLabel: 'Salir del grupo',
    onOk: async function () {
      await leaveGroup(c.id);
    },
  };
}

/* Eliminar un MD de mi lista. El otro usuario conserva su copia. */
function askDeleteDm(c) {
  if (!c) return;
  store.confirmBox = {
    title: 'Eliminar chat',
    text: t('Vas a eliminar "{n}" de tu lista.\nEl otro usuario conservará su copia. Si te vuelve a escribir, el chat reaparecerá.',
      { n: chatTitle(c) }),
    danger: true,
    okLabel: 'Eliminar chat',
    onOk: async function () {
      await deleteDmChat(c.id);
      toast(t('Chat eliminado'), 'ok');
    },
  };
}

/* W46: confirmación y aviso al ascender/quitar admin o sacar del grupo.
   El mensaje system del server es el aviso permanente en el chat; acá
   además se pide confirmación y se muestra un toast al actor. */
function askSetRole(c, m, role) {
  if (!c || !m) return;
  const name = m.display_name || m.username;
  const promoting = role === 'admin';
  store.confirmBox = {
    title: promoting ? 'Hacer admin' : 'Quitar admin',
    text: promoting
      ? t('¿Hacer admin a {n}? Podrá administrar el grupo y todos verán el aviso en el chat.',
          { n: name })
      : t('¿Quitar admin a {n}? Ya no podrá administrar el grupo y todos verán el aviso en el chat.',
          { n: name }),
    danger: false,
    okLabel: promoting ? 'Hacer admin' : 'Quitar admin',
    onOk: async function () {
      await setMemberRole(c.id, m.id, role);
      toast(promoting
        ? t('{n} ahora es admin', { n: name })
        : t('{n} ya no es admin', { n: name }), 'ok');
    },
  };
}

function askTransferOwner(c, m) {
  if (!c || !m) return;
  const name = m.display_name || m.username;
  store.confirmBox = {
    title: 'Transferir propiedad',
    text: t('¿Transferir la propiedad de este grupo a {n}? Tú pasarás a ser admin y {n} podrá administrar el grupo.',
      { n: name }),
    danger: true,
    okLabel: 'Transferir propiedad',
    onOk: async function () {
      await transferOwner(c.id, m.username);
      toast(t('La propiedad pasó a {n}', { n: name }), 'ok');
    },
  };
}

function askRemoveMember(c, m) {
  if (!c || !m) return;
  const name = m.display_name || m.username;
  store.confirmBox = {
    title: 'Eliminar del grupo',
    text: t('¿Eliminar a {n} del grupo? Dejará de ver el chat y todos verán el aviso de la expulsión.',
      { n: name }),
    danger: true,
    okLabel: 'Eliminar del grupo',
    onOk: async function () {
      await removeMember(c.id, m.id);
      toast(t('{n} fue eliminado del grupo', { n: name }), 'ok');
    },
  };
}

/* --------------------------------------------------------- W27: ⋮ y foto */

/* Menú contextual compartido: lo abren la lista (⋮), el panel de info (⋮)
   y la ventana de perfil (⋮). Antes vivía solo en ChatShell; ahora está
   al nivel del módulo para que cualquier vista lo use (el ancla del menú
   se resuelve por clase porque no hay ref compartida). */
const clampPos = function (v, max) {
  return Math.max(4, Math.min(v, max - 8));
};
/* W37b: en móvil/táctil no hay hover — la barra flotante no sirve y el
   menú contextual se abre como BOTTOM SHEET abajo de la pantalla. */
function isTouchUI() {
  try {
    return window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth < 640;
  } catch (e) { return window.innerWidth < 640; }
}
const openCtx = function (e, items, anchor, key, head) {
  /* W36i: si el menú de ESTE botón ya está abierto, un segundo clic
     lo cierra (antes sólo se cerraba tocando afuera). */
  if (key && store.ctx && store.ctx.key === key) {
    store.ctx = null;
    return;
  }
  /* W17: un solo panel flotante: abrir el menú cierra pickers. */
  store.emoOpen = false;
  store.reactFor = 0;
  /* W37b: bottom sheet en táctil — sin anclas ni cálculo de posición.
     W54c: en el teléfono la hoja lleva una cabecera con la foto y el
     nombre cuando el menú pertenece a un chat o grupo. */
  if (isTouchUI()) {
    store.ctx = {
      x: 0, y: 0, items: items, key: key || '', sheet: true,
      head: head || null,
    };
    return;
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const estW = 200;
  const estH = items.length * 37 + 10;
  let x;
  let y;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    /* A la derecha de la burbuja si cabe; si no, a su izquierda. */
    x = (r.right + 8 + estW <= vw - 4) ? r.right + 8 : r.left - estW - 8;
    if (x < 4) x = clampPos(r.right, vw);
    y = clampPos(r.top, vh);
    if (y + estH > vh - 4) y = clampPos(vh - estH, vh);
  } else {
    x = clampPos(e.clientX, vw);
    y = clampPos(e.clientY, vh);
    /* W29c: la rama sin ancla también estimaba y NO corregía: el menú
       podía desbordar por abajo (p. ej. clic derecho cerca del borde). */
    if (y + estH > vh - 4) y = clampPos(vh - estH, vh);
  }
  store.ctx = { x: x, y: y, items: items, key: key || '', head: head || null };
  /* W29c: corrección con medida REAL — corre SIEMPRE (antes solo con
     ancla); offset* es inmune al transform de la animación de entrada. */
  Vue.nextTick(function () {
    const el = document.querySelector('.ctx-menu');
    if (!el || !store.ctx) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let nx = store.ctx.x;
    let ny = store.ctx.y;
    if (nx + w > vw - 4) nx = Math.max(4, vw - w - 4);
    if (ny + h > vh - 4) ny = Math.max(4, vh - h - 4);
    store.ctx.x = nx;
    store.ctx.y = ny;
  });
};

/* W27b: encuadre aplicado a la última foto editada, por contexto
   ('me' para mi perfil, 'chat-<id>' para el grupo). Vive en MEMORIA:
   se restaura al reeditar dentro de la sesión (decisión W27b; el archivo
   original solo existe en memoria, así que no tiene sentido más allá). */
const cropStates = {};
function cropStateFor(key) { return cropStates[key] || null; }
function saveCropState(key, st) { if (key && st) cropStates[key] = st; }

/* Foto del grupo (W27b): selector de imagen y, ANTES de subirla, el
   editor de encuadre en el panel de info (mismo componente que el
   perfil). El resultado compuesto se sube ya recortado. Solo owner/admin
   la usan (c.my_role) y el server vuelve a validar el rol. */
function pickGroupPhoto(c) {
  if (!c) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  /* W27b: va al DOM (oculto) para poder manipularlo desde fuera */
  inp.className = 'tmp-file';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', function () {
    inp.remove();
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Elige una imagen', 'err'); return; }
    if (f.size > 15 * 1024 * 1024) { toast('La imagen supera los 15 MB', 'err'); return; }
    /* el editor vive en el panel de info: abre ese chat con el panel */
    store.infoOpen = true;
    openChat(c.id);
    loadMembers(c.id);
    if (store.grpEdit && store.grpEdit.src) URL.revokeObjectURL(store.grpEdit.src);
    store.grpEdit = {
      chatId: c.id,
      src: URL.createObjectURL(f),
      initial: cropStateFor('chat-' + c.id),
    };
  });
  inp.click();
}

/* W54c: cabecera de la hoja móvil para los menús de chat/grupo. */
function ctxChatHead(c) {
  if (!c) return null;
  const name = chatTitle(c) || '';
  const raw = c.type === 'dm'
    ? (c.title && c.title.avatar_url)
    : c.avatar_url;
  return {
    name: name,
    avatar: raw ? mediaUrl(raw) : '',
    ini: name ? name.charAt(0).toUpperCase() : '?',
    sub: c.type === 'group'
      ? t('Grupo')
      : (c.title && c.title.username ? '@' + c.title.username : t('Chat')),
  };
}

/* ⋮ de la lista de chats y del panel de info: administrar el chat. */
function chatMenu(e, c, key) {
  if (!c) return;
  const items = [{
    label: 'Abrir chat', icon: 'i-users',
    fn: function () { openChat(c.id); },
  }];
  if (c.type === 'group') {
    items.push({
      label: 'Ver info del chat', icon: 'i-info',
      fn: function () { store.infoOpen = true; openChat(c.id); loadMembers(c.id); },
    });
    /* W27: foto del grupo — solo owner/admin (el server también lo valida). */
    if (c.my_role === 'owner' || c.my_role === 'admin') {
      items.push({
        label: 'Cambiar foto del grupo', icon: 'i-image',
        fn: function () { pickGroupPhoto(c); },
      });
      items.push({
        label: 'Renombrar grupo', icon: 'i-pencil',
        fn: function () {
          store.renameGroupId = c.id;
          store.renameGroupTitle = chatTitle(c);
        },
      });
    }
    items.push({
      label: 'Salir del grupo', icon: 'i-back', danger: true,
      fn: function () { askLeave(c); },
    });
  } else if (c.title && c.title.username) {
    items.push({
      label: 'Ver perfil', icon: 'i-user',
      fn: function () { openChat(c.id); openProfile(c.title.username); },
    });
  }
  /* W13: fijar / silenciar (ajustes personales, por chat) */
  items.push({
    label: c.pinned ? 'Desfijar chat' : 'Fijar chat',
    icon: c.pinned ? 'i-x' : 'i-pin',
    fn: function () { setPinned(c.id, !c.pinned); },
  });
  items.push({
    label: c.muted ? 'Activar notificaciones' : 'Silenciar notificaciones',
    icon: c.muted ? 'i-bell' : 'i-bell-off',
    fn: function () { setMuted(c.id, !c.muted); },
  });
  items.push({
    label: c.archived ? 'Desarchivar chat' : 'Archivar chat',
    icon: 'i-archive',
    fn: function () {
      const want = !c.archived;
      Promise.resolve(archiveChat(c.id, want)).then(function () {
        toast(want ? 'Chat archivado' : 'Chat desarchivado', 'ok');
      }).catch(function (err) {
        toastErr(err, 'No se pudo archivar el chat');
      });
    },
  });
  if (c.type === 'dm') {
    items.push({
      label: 'Eliminar chat', icon: 'i-trash', danger: true,
      fn: function () { askDeleteDm(c); },
    });
  }
  /* W36i: key = el mismo botón alterna abrir/cerrar. El ⋮ de la INFO
     usa 'info' (distinta de la lista): abrir uno no cierra el otro
     con un segundo clic, cada botón se auto-gestiona. */
  openCtx(e, items, null, key || 'chat:' + c.id, ctxChatHead(c));
}

/* ⋮ de la ventana de perfil de OTRO usuario: administrar la amistad
   (enviar / cancelar / aceptar solicitud, eliminar amistad). */
function personMenu(e, u) {
  if (!u || !u.username) return;
  const meId = store.user ? store.user.id : 0;
  if (u.id === meId) return;
  const p = store.people;
  let isFriend = false;
  let sentId = 0;
  let recvId = 0;
  if (p) {
    let i;
    for (i = 0; i < (p.friends || []).length; i++) {
      if (p.friends[i].id === u.id) { isFriend = true; break; }
    }
    for (i = 0; i < (p.sent || []).length; i++) {
      if (p.sent[i].user && p.sent[i].user.id === u.id) sentId = p.sent[i].id;
    }
    for (i = 0; i < (p.received || []).length; i++) {
      if (p.received[i].user && p.received[i].user.id === u.id) recvId = p.received[i].id;
    }
  }
  const run = function (fn) {
    Promise.resolve(fn()).catch(function (err) {
      toastErr(err, 'No se pudo completar la acción');
    });
  };
  const items = [];
  if (isFriend) {
    items.push({
      label: 'Eliminar amistad', icon: 'i-userminus', danger: true,
      fn: function () {
        store.confirmBox = {
          title: 'Eliminar amistad',
          /* Armado ya traducido: ConfirmBox lo repite vía t() y las
             claves con {n} ya sustituido no vuelven a coincidir (ok). */
          text: t('¿Dejar de ser amigos con {n}?',
            { n: u.display_name || u.username }),
          okLabel: 'Eliminar amistad',
          danger: true,
          onOk: function () { run(function () { return unfriend(u.id); }); },
        };
      },
    });
  } else if (sentId) {
    items.push({
      label: 'Cancelar solicitud', icon: 'i-x',
      fn: function () { run(function () { return cancelFriendRequest(sentId); }); },
    });
  } else if (recvId) {
    items.push({
      label: 'Aceptar solicitud', icon: 'i-check',
      fn: function () { run(function () { return acceptFriendRequest(recvId); }); },
    });
    items.push({
      label: 'Rechazar solicitud', icon: 'i-x', danger: true,
      fn: function () { run(function () { return rejectFriendRequest(recvId); }); },
    });
  } else {
    items.push({
      label: 'Enviar solicitud de amistad', icon: 'i-userplus',
      fn: function () {
        run(function () {
          return sendFriendRequest(u.username).then(function () {
            toast('Solicitud enviada', 'ok');
          });
        });
      },
    });
  }
  /* W28e: bloquear / desbloquear — siempre al final del menú de OTRO
     usuario; mientras dure, el server corta solicitudes y directos. */
  const blocked = (store.blocks || []).indexOf(u.id) >= 0;
  if (!blocked) {
    items.push({
      label: 'Bloquear usuario', icon: 'i-ban', danger: true,
      fn: function () {
        store.confirmBox = {
          title: 'Bloquear usuario',
          /* Armado ya traducido (mismo criterio que 'Eliminar amistad'). */
          text: t('¿Bloquear a {n}?', { n: u.display_name || u.username }),
          okLabel: 'Bloquear usuario',
          danger: true,
          onOk: function () {
            run(function () {
              return blockUser(u.username).then(function () {
                toast('Usuario bloqueado');
              });
            });
          },
        };
      },
    });
  } else {
    items.push({
      label: 'Desbloquear usuario', icon: 'i-unlock',
      fn: function () {
        run(function () {
          return unblockUser(u.username).then(function () {
            toast('Usuario desbloqueado');
          });
        });
      },
    });
  }
  /* W36i: el mismo ⋮ alterna abrir/cerrar */
  openCtx(e, items, null, 'person:' + (u && u.id ? u.id : 0));
}

/* Apertura del ⋮ con teclado (Enter sobre el span): mismo menú que con
   el ratón, posicionado bajo el elemento. */
function menuKey(ev, c) {
  const el = ev.target;
  const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  chatMenu({ clientX: r ? r.left : 8, clientY: r ? r.bottom : 8 }, c);
}

/* Copiar al portapapeles (FF78: execCommand, sin depender de clipboard API). */
function copyText(t) {
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {
    toast('No se pudo copiar el texto', 'err');
  }
}

/* W19: achica una imagen para el fondo de la conversación (≤1280px,
   JPEG) y la devuelve como data-URL por callback(url, err). Se guarda
   en el dispositivo (mismo criterio que el color de pared). */
function shrinkWall(file, cb) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = function () {
    const max = 1280;
    let w = img.width, h = img.height;
    if (w > max || h > max) {
      const k = Math.min(max / w, max / h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    try {
      let out = c.toDataURL('image/jpeg', 0.75);
      if (out.length > 3000000) out = c.toDataURL('image/jpeg', 0.5);
      /* prueba de espacio: si no entra, avisar sin romper nada */
      localStorage.setItem('fm.wallimg.probe', out);
      localStorage.removeItem('fm.wallimg.probe');
      cb(out, '');
    } catch (e) {
      cb('', 'La foto es muy pesada: prueba con una más chica');
    }
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    cb('', 'No se pudo leer la imagen');
  };
  img.src = url;
}

/* W16: panel flotante a dentro del área de mensajes.
   El overflow de .msgs (hidden/auto) recortaba los paneles de emojis que
   se salían de la caja: los chips quedaban cortados a la izquierda/arriba
   y el panel completo se cortaba por abajo. La solución es el mismo
   patrón que el menú contextual: position: fixed + clamp a la caja de
   .msgs (nunca tapa la cabecera ni el sidebar y nunca se sale).
   - el panel completo dentro de los chips: si no cabe debajo, va arriba
     (para no tapar los propios chips);
   - los chips en el toolbar: si quedaron sobre la cabecera, van debajo;
   - el grid se achica si la altura disponible no da. */
const clampPanel = function (el, anim) {
  if (!el) return;
  const par = el.parentElement;
  const enChips = !!(par && par.classList && par.classList.contains('react-picker'));
  const sonChips = !!(el.classList && el.classList.contains('react-picker'));
  const msgsEl = document.querySelector('.msgs');
  const bb = msgsEl ? msgsEl.getBoundingClientRect() : null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const L = Math.max(bb ? bb.left : 0, 4);
  const T = Math.max(bb ? bb.top : 0, 4);
  const R = Math.min(bb ? bb.right : vw, vw - 4);
  const B = Math.min(bb ? bb.bottom : vh, vh - 4);
  const animWas = el.style.animation;
  if (anim) el.style.animation = 'none';     // medir sin la animación de entrada
  // volver al ancla natural (CSS) para no arrastrar un clamp anterior
  el.style.position = ''; el.style.left = ''; el.style.top = '';
  el.style.right = ''; el.style.bottom = ''; el.style.maxWidth = '';
  el.style.height = '';              /* W36fix: recorte previo del panel */
  const nat = el.getBoundingClientRect();
  // achicar la zona scrolleable si la altura no da (el resto es fijo):
  // W29b: el panel de emoji scrollea en .ep-body (estilo Discord); el
  // de stickers/gif conserva el .ep-grid con scroll interno (W28g).
  const body = el.querySelector('.ep-body');
  const grid = body || el.querySelector('.ep-grid');
  if (grid) {
    const rest = el.offsetHeight - grid.offsetHeight;
    grid.style.maxHeight = Math.max(body ? 140 : 60,
      Math.min(body ? 258 : 236, B - T - rest - 6)) + 'px';
  }
  /* W36fix: el panel del compositor tiene alto FIJO (344px, igual en
     las 3 pestañas); si la ventana no da (msgs acotado), se recorta
     aquí para que SIEMPRE quepa — en ventanas normales no se toca. */
  if (el.classList && el.classList.contains('st-panel')
      && el.offsetHeight > B - T - 6) {
    el.style.height = Math.max(200, B - T - 6) + 'px';
  }
  if (R - L < el.offsetWidth) {
    el.style.maxWidth = Math.max(200, Math.floor(R - L)) + 'px';
  }
  const w = el.offsetWidth, h = el.offsetHeight;
  let y = nat.top;
  if (enChips && nat.top + h > B) {          // panel completo sin aire abajo
    const above = par.getBoundingClientRect().top - 4 - h;
    y = above >= T ? above : nat.top;        // mejor arriba de los chips
  }
  if (sonChips && nat.top < T && par) {      // chips sobre la cabecera
    y = par.getBoundingClientRect().bottom + 4;
  }
  const x = Math.min(Math.max(nat.left, L), R - w);
  y = Math.min(Math.max(y, T), B - h);
  el.style.position = 'fixed';
  // right/bottom del CSS siguen vigentes y, con position: fixed, estiran el
  // panel (height:auto + top + bottom ⇒ altura resuelta por el viewport):
  // hay que anularlos explícitamente.
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
  // Gecko puede renderizar el panel corrido unos píxeles (márgenes u otro
  // quirk del ancestro): se mide el rectángulo real y se corrige el delta.
  const r2 = el.getBoundingClientRect();
  el.style.left = Math.round(x + (x - r2.left)) + 'px';
  el.style.top = Math.round(y + (y - r2.top)) + 'px';
  if (anim) el.style.animation = animWas || '';  // la entrada arranca en su sitio
};

/* W13: selector de emoji completo (buscar + categorías + recientes).
   Se usa en el composer (insertar) y en el picker de reacciones. */
/* W28g: stickers (emojis grandes que viajan como kind 'sticker') y
   biblioteca local de GIFs (generados en web/gifs, subidos por el
   flujo normal de media como image/gif). */
const STICKERS = ['👍', '🔥', '🎉', '❤️', '😂', '🤔', '👻', '🎃',
  '👏', '🙌', '💪', '☕', '🌈', '⭐', '🎯', '💌', '🤝', '😺',
  '💩', '🥶', '🥳', '😴', '🫡', '🎄'];
const GIF_LIST = ['heart-pulse.gif', 'ball-bounce.gif', 'star-spin.gif',
  'smiley-wink.gif', 'fire.gif', 'sparkle.gif', 'confetti.gif',
  'loader.gif', 'boom-ring.gif', 'clock-spin.gif'];

/* W60: favoritos de stickers. El sticker es un emoji, así que guardar
   uno recibido (o de la biblioteca) es guardar su carácter. */
const isStkFav = function (ch) {
  return !!(ch && (store.stkFavs || []).indexOf(ch) >= 0);
};
const toggleStkFav = function (ch) {
  ch = ch || '';
  if (!ch) return;
  const on = isStkFav(ch);
  if (on) {
    store.stkFavs = (store.stkFavs || []).filter(function (s) { return s !== ch; });
  } else {
    store.stkFavs = [ch].concat(store.stkFavs || []);
  }
  try {
    localStorage.setItem('fm.stkFavs', JSON.stringify(store.stkFavs));
  } catch (e) {}
};

/* W36k: favoritos de GIFs — la biblioteca estática (name) y los GIFs
   subidos que viajan en mensajes (media_id). Se cargan una vez al abrir
   la pestaña GIFs o al pintar una estrella; viven en store.gifFavs. */
const ensureGifFavs = function () {
  if (store.gifFavsLoaded) return Promise.resolve();
  store.gifFavsLoaded = true;
  return api('GET', '/gifs/favorites').then(function (r) {
    store.gifFavs = (r && r.favorites) || [];
  }).catch(function () { store.gifFavsLoaded = false; });
};
/* W61: biblioteca propia de GIFs/stickers subidos (máx. 10 por tipo). */
const ASSET_MAX = 10;
const assetList = function (kind) {
  return kind === 'gif' ? store.userAssets.gifs : store.userAssets.stickers;
};
const ensureUserAssets = function () {
  if (store.userAssetsLoaded) return Promise.resolve();
  store.userAssetsLoaded = true;
  return api('GET', '/assets').then(function (r) {
    store.userAssets = {
      gifs: (r && r.gifs) || [],
      stickers: (r && r.stickers) || [],
    };
  }).catch(function () { store.userAssetsLoaded = false; });
};
const assetWithMedia = function (kind, mediaId) {
  const list = assetList(kind);
  for (let i = 0; i < list.length; i++) {
    if (list[i].media_id === mediaId) return list[i];
  }
  return null;
};
const uploadUserAsset = async function (kind, file) {
  if (!file) return null;
  if (assetList(kind).length >= ASSET_MAX) {
    toast(kind === 'gif' ? t('Máximo 10 GIFs') : t('Máximo 10 stickers'), 'err');
    return null;
  }
  const up = await uploadMedia(file);
  const r = await api('POST', '/assets', { kind: kind, media_id: up.id });
  if (r && r.asset) {
    const list = assetList(kind).slice();
    list.unshift(r.asset);
    if (kind === 'gif') store.userAssets.gifs = list;
    else store.userAssets.stickers = list;
    return r.asset;
  }
  return null;
};
const removeUserAsset = function (kind, asset) {
  if (!asset) return Promise.resolve();
  return api('DELETE', '/assets/' + asset.id).then(function () {
    const list = assetList(kind).filter(function (x) { return x.id !== asset.id; });
    if (kind === 'gif') store.userAssets.gifs = list;
    else store.userAssets.stickers = list;
  });
};
const toggleStickerAsset = function (m) {
  if (!m || !m.media) return;
  const found = assetWithMedia('sticker', m.media.id);
  if (!found && assetList('sticker').length >= ASSET_MAX) {
    toast(t('Máximo 10 stickers'), 'err');
    return;
  }
  const p = found
    ? removeUserAsset('sticker', found)
    : api('POST', '/assets', { kind: 'sticker', media_id: m.media.id })
      .then(function (r) {
        if (r && r.asset) store.userAssets.stickers = [r.asset].concat(store.userAssets.stickers || []);
      });
  p.catch(function (e) {
    toastErr(e, 'No se pudo guardar el favorito');
  });
};
/* W62: un GIF puede estar guardado por media_id (subido) o por nombre
   (biblioteca). El mensaje de un GIF de biblioteca se sube con el mismo
   nombre de archivo, así que la estrella también debe reconocerlo. */
const gifFavFor = function (m) {
  ensureGifFavs();
  const md = m && m.media;
  const fid = md ? md.id : 0;
  const fname = md && md.name ? String(md.name).toLowerCase() : '';
  const fs = store.gifFavs || [];
  for (let i = 0; i < fs.length; i++) {
    if (fid && fs[i].media_id === fid) return fs[i];
  }
  if (fname) {
    for (let j = 0; j < fs.length; j++) {
      if (fs[j].name && String(fs[j].name).toLowerCase() === fname) return fs[j];
    }
  }
  return null;
};
/* W66c: para la burbuja, un "GIF" es un gif O un WebP animado (los dos
   se guardan tal cual y el server marca animated=1). */
const isGifMedia = function (m) {
  return !!(m && (m.mime === 'image/gif'
    || (m.mime === 'image/webp' && m.animated)));
};
const isGifFav = function (m) {
  return !!gifFavFor(m);
};
const isLibGifFav = function (name) {
  ensureGifFavs();
  const fs = store.gifFavs || [];
  for (let i = 0; i < fs.length; i++) if (fs[i].name === name) return true;
  return false;
};
const toggleFavGif = function (m) {
  const md = m && m.media;
  const fid = md ? md.id : 0;
  if (!fid) return;
  const fname = md && md.name ? String(md.name).toLowerCase() : '';
  const matches = (store.gifFavs || []).filter(function (f) {
    if (fid && f.media_id === fid) return true;
    return !!(fname && f.name && String(f.name).toLowerCase() === fname);
  });
  const reqs = matches.length
    ? matches.map(function (f) {
        return api('DELETE', '/gifs/favorites',
          f.media_id ? { media_id: f.media_id } : { name: f.name });
      })
    : [api('POST', '/gifs/favorites', { media_id: fid })];
  Promise.all(reqs).then(function () {
    if (matches.length) {
      store.gifFavs = (store.gifFavs || []).filter(function (f) {
        return matches.indexOf(f) < 0;
      });
    } else {
      store.gifFavs.unshift({ media_id: fid, name: '', url: md.url });
    }
  }).catch(function () { toast('No se pudo guardar el favorito', 'err'); });
};
const toggleLibGif = function (name) {
  const on = isLibGifFav(name);
  api(on ? 'DELETE' : 'POST', '/gifs/favorites', { name: name })
    .then(function () {
      if (on) {
        store.gifFavs = store.gifFavs.filter(function (f) {
          return f.name !== name;
        });
      } else {
        store.gifFavs.unshift({ media_id: 0, name: name,
          url: '/static/gifs/' + name });
      }
    })
    .catch(function () { toast('No se pudo guardar el favorito', 'err'); });
};

const EmojiPicker = {
  /* W29g: embed = embebido en el panel unificado del compositor (3
     pestañas); ahí el tamaño y el clamp los lleva el padre. */
  props: { embed: Boolean, anchored: Boolean },
  emits: ['pick'],
  setup: function (props, ctxEmit) {
    const q = Vue.ref('');
    const tab = Vue.ref('recientes');
    const cats = emojiCats();
    /* W65: si el estilo elegido es Noto/Twemoji, la grilla sólo muestra
       emojis con imagen de ESE set. Antes los que faltaban caían a la
       fuente del sistema y el panel quedaba mezclado (o "entrecortado").
       Es preferible un hueco/una lista más corta a mezclar estilos. */
    const usable = function (items) {
      if (emoStyle() === 'system') return items;
      return items.filter(function (ch) { return !!emoFile(ch); });
    };
    /* W29b: UNA sola lista con subtítulos por categoría ("Recientes:",
       "Caras y emociones:", …); la búsqueda plana reemplaza la lista. */
    const sections = Vue.computed(function () {
      if (q.value.trim()) return [];
      const rec = usable(emojiRecent());
      const out = [];
      if (rec.length) out.push({ id: 'recientes', label: 'Recientes', items: rec });
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].id === 'recientes') continue;
        const items = usable(emojiCat(cats[i].id));
        if (items.length) {
          out.push({ id: cats[i].id, label: cats[i].name, items: items });
        }
      }
      return out;
    });
    const flat = Vue.computed(function () {
      return q.value.trim() ? usable(emojiSearch(q.value)) : [];
    });
    const empty = Vue.computed(function () {
      return q.value.trim() ? t('Sin coincidencias.') : t('Aún no usas emojis.');
    });
    const pick = function (ch) {
      emojiPush(ch);          // recientes compartidos entre ambos usos
      ctxEmit.emit('pick', ch);
    };
    /* W29b: clic en el ícono de categoría → salta la lista a ella. */
    const scrollEl = Vue.ref(null);
    const jump = function (id) {
      q.value = '';
      tab.value = id;
      Vue.nextTick(function () {
        const sc = scrollEl.value;
        const el = sc && sc.querySelector('#ep-' + id);
        if (sc && el) sc.scrollTop = el.offsetTop;
      });
    };
    /* W29b: al pasar de sección (o al saltar) el ícono activo se ilumina. */
    const onScroll = function () {
      if (q.value.trim()) return;
      const sc = scrollEl.value;
      if (!sc) return;
      const subs = sc.querySelectorAll('.ep-sub');
      const list = sections.value;
      if (!list.length) return;
      let cur = list[0].id;
      for (let i = 0; i < subs.length; i++) {
        if (subs[i].offsetTop <= sc.scrollTop + 4) {
          cur = subs[i].id.slice(3);
        }
      }
      tab.value = cur;
    };
    const fileOf = function (ch) { return emoFile(ch); };
    const srcOf = function (ch) { return emoSrc(ch); };
    const titleOf = function (ch) { return emojiCode(ch); };
    /* En modo nativo no hay archivo: se pinta el glyph. En Noto/Twemoji
       nunca se cae al glyph del sistema (eso era la mezcla). */
    const emoSystem = Vue.computed(function () { return emoStyle() === 'system'; });
    /* W16: el panel queda fijo y clampeado al área de mensajes; se recalcula
       al abrir (sin la animación de entrada) y al redimensionar la ventana. */
    const rootEl = Vue.ref(null);
    const doClamp = function (first) {
      clampPanel(rootEl.value, !!first);
    };
    /* W29g: embebido, el padre (.st-panel) hace el clamp; aquí la
       posición no se toca. W57: anchored = el picker de reacciones ya
       viaja teletransportado y lo coloca su contenedor. */
    const noClamp = function () { return props.embed || props.anchored; };
    if (!noClamp()) Vue.onMounted(function () { doClamp(true); });
    const onPanelResize = function () { if (!noClamp()) doClamp(false); };
    window.addEventListener('resize', onPanelResize);
    /* W16: el panel puede crecer después de montar (fuentes, lista, etc.):
       el ResizeObserver vuelve a ajustarlo, dejando pasar la animación
       de entrada (140 ms) para no medir a mitad del transform. */
    let roTimer = 0;
    const roPanel = new ResizeObserver(function () {
      clearTimeout(roTimer);
      roTimer = setTimeout(function () { if (!noClamp()) doClamp(false); }, 180);
    });
    if (!noClamp()) Vue.onMounted(function () { roPanel.observe(rootEl.value); });
    Vue.onUnmounted(function () {
      window.removeEventListener('resize', onPanelResize);
      clearTimeout(roTimer);
      roPanel.disconnect();
    });
    return { q, tab, cats, sections, flat, empty, pick, t, rootEl,
             scrollEl, jump, onScroll, fileOf, srcOf, titleOf, emoSystem };
  },
  template:
    '<div class="emo-picker" ref="rootEl" @click.stop>' +
      '<div class="ep-search">' +
        '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
        '<input v-model="q" :placeholder="t(\'Buscar emoji\')" ' +
          ':aria-label="t(\'Buscar emoji\')" @keydown.esc.stop="q = \'\'">' +
        '<button class="clr-x" :class="{ show: !!q }" type="button" ' +
          ':title="t(\'Borrar\')" @click="q = \'\'">' +
          '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
      '</div>' +
      '<div class="ep-body">' +
        '<div class="ep-cats">' +
          '<button class="ep-cat" v-for="c in cats" :key="c.id" ' +
            ':class="{ on: !q.trim() && tab === c.id }" type="button" ' +
            ':title="t(c.name)" @click="jump(c.id)">' +
            '<img v-if="fileOf(c.icon)" class="emo" :src="srcOf(c.icon)" ' +
              'alt="" loading="lazy">' +
            '<span v-else-if="emoSystem">{{ c.icon }}</span>' +
          '</button>' +
        '</div>' +
        '<div class="ep-scroll" ref="scrollEl" @scroll.passive="onScroll">' +
          '<template v-if="!q.trim()">' +
            '<div class="ep-sec" v-for="s in sections" :key="s.id">' +
              '<div class="ep-sub" :id="\'ep-\' + s.id">{{ t(s.label) }}:</div>' +
              '<div class="ep-grid">' +
                '<button class="ep-e" type="button" v-for="e in s.items" ' +
                  ':key="e" @click="pick(e)" :title="titleOf(e)">' +
                  '<img v-if="fileOf(e)" class="emo" :src="srcOf(e)" ' +
                    'alt="" loading="lazy">' +
                  '<span v-else-if="emoSystem">{{ e }}</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</template>' +
          '<div class="ep-grid" v-else>' +
            '<button class="ep-e" type="button" v-for="e in flat" :key="e" ' +
              '@click="pick(e)" :title="titleOf(e)">' +
              '<img v-if="fileOf(e)" class="emo" :src="srcOf(e)" ' +
                'alt="" loading="lazy">' +
              '<span v-else-if="emoSystem">{{ e }}</span>' +
            '</button>' +
          '</div>' +
          '<div class="ep-empty" v-if="!q.trim() ? !sections.length : !flat.length">' +
            '{{ empty }}</div>' +
        '</div>' +
      '</div>' +
    '</div>',
};

/* ------------------------------------------------------- MessageRow */

/* W8: sólo un audio suena a la vez en toda la app. */
let currentAudioEl = null;

const MessageRow = {
  components: { EmojiPicker },
  props: { row: { type: Object, required: true } },
  emits: ['imgload', 'reply', 'react', 'openprofile', 'zoom', 'saveedit', 'upcancel', 'upretry', 'menu', 'scrolltoreply'],
  setup: function (props, ctx) {
    const emit = ctx.emit;
    /* W17: el picker vive en store.reactFor (antes era un ref local por
       fila). Así solo hay UN panel de reacciones abierto a la vez, el
       clic exterior lo cierra (onDocClick) y el composer/menú contextual
       lo cierran al abrirse. */

    const replyName = function (row) {
      const rp = row.ref.reply_to;
      if (!rp || !rp.sender) return '';
      // El servidor manda sender como string (display_name o username).
      if (typeof rp.sender === 'string') return rp.sender;
      return rp.sender.display_name || rp.sender.username || '';
    };
    const replyText = function (row) {
      const rp = row.ref.reply_to;
      if (!rp) return '';
      /* W45: citar un spoiler no lo destapa (ni con el texto local). */
      if (rp.spoiler) return t('Spoiler');
      const txt = rp.body;
      if (txt) return txt;
      if (rp.kind === 'voice') return t('Nota de voz');
      if (rp.kind === 'image') return t('Imagen');
      if (rp.kind === 'system') return '';
      return t('Archivo adjunto');
    };
    const groupReactions = function (m) {
      const out = [];
      const rs = m.reactions || [];
      for (let i = 0; i < rs.length; i++) {
        let g = null;
        for (let j = 0; j < out.length; j++) if (out[j].emoji === rs[i].emoji) g = out[j];
        if (g) g.count++;
        else out.push({ emoji: rs[i].emoji, count: 1 });
      }
      return out;
    };

    /* Mi reacción actual en este mensaje (server: 1 por usuario). */
    const myReaction = function (m) {
      if (!store.user) return '';
      const rs = m.reactions || [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user_id === store.user.id) return rs[i].emoji;
      }
      return '';
    };

    const doReply = function (row) {
      store.reactFor = 0;
      emit('reply', row.ref);
    };
    const doReact = function (row, emoji) {
      store.reactFor = 0;
      fullReact.value = false;
      /* W17: quitar la propia reacción no cuenta como "uso"; agregar
         sí la sube de puesto en la barra rápida. */
      if (myReaction(row.ref) !== emoji) reactBump(emoji);
      emit('react', row.ref, emoji);
    };

    /* Picker de reacciones: hover (botón emoji) o menú contextual
       (store.reactFor). Clic en el chip propio = quitar. */
    const pickerOpen = function (row) {
      return store.reactFor !== 0 && store.reactFor === row.ref.id;
    };
    const togglePicker = function () {
      const open = pickerOpen(props.row);
      store.emoOpen = false;     // W17: un solo panel flotante a la vez
      store.ctx = null;
      store.reactFor = open ? 0 : props.row.ref.id;
      fullReact.value = false;
    };
    /* W13: desde el picker chico se abre el selector completo. */
    const fullReact = Vue.ref(false);
    const toggleFull = function () {
      fullReact.value = !fullReact.value;
    };
    /* W17: ⋯ de la barra hover → el menú contextual del mensaje. */
    const openMenu = function (row, ev) {
      emit('menu', { row: row, ev: ev });
    };

    /* W17: los 12 chips rápidos ordenados por uso (reactRank es reactivo:
       al reaccionar se reordena al instante). */
    const emojis = Vue.computed(function () { return reactRank(12); });

    /* W57: el picker se teletransporta a <body> y se coloca con
       position:fixed. Antes vivía dentro de la burbuja; cuando un
       ancestro tenía transform/animación, Gecko tomaba ese ancestro como
       bloque contenedor y el clamp terminaba mandando el panel fuera de
       la pantalla. Ahora la referencia es siempre el viewport. */
    const rpEl = Vue.ref(null);
    const rpPos = Vue.ref({ left: '0px', top: '0px' });
    const placeRp = function () {
      Vue.nextTick(function () {
        const el = rpEl.value;
        if (!el) return;
        const msg = document.querySelector(
          '.msg[data-msg-id="' + props.row.ref.id + '"]');
        const bub = msg && msg.querySelector('.bubble');
        const msgs = document.querySelector('.msgs');
        if (!bub || !msgs) return;
        const br = bub.getBoundingClientRect();
        const mb = msgs.getBoundingClientRect();
        /* El ancho se decide por el estado, no por offsetWidth: al abrir
           el panel completo la clase .rp-wide puede aplicarse un instante
           después de esta medición. */
        const w = fullReact.value ? 320 : (el.offsetWidth || 216);
        const h = el.offsetHeight || 81;
        const m = 4;
        const gap = 6;
        /* Alinear a la derecha de la burbuja, sin salir del área de
           mensajes. */
        let x = br.right - w;
        x = Math.max(mb.left + m, Math.min(x, mb.right - m - w));
        /* Preferencia: encima; si no cabe, debajo; y al final se limita
           al área visible incluso en ventanas muy bajas. */
        let y = br.top - gap - h;
        if (y < mb.top + m) y = br.bottom + gap;
        y = Math.min(y, mb.bottom - m - h);
        y = Math.max(mb.top + m, y);
        rpPos.value = {
          left: Math.round(x) + 'px',
          top: Math.round(y) + 'px',
        };
      });
    };
    /* W57: si el usuario desplaza el área de mensajes o cambia el
       tamaño de la ventana, el panel fijo sigue pegado a su burbuja. */
    let rpScrollEl = null;
    const rpMove = function () { placeRp(); };
    const bindRpMove = function (on) {
      if (on && !rpScrollEl) {
        rpScrollEl = document.querySelector('.msgs');
        if (rpScrollEl) rpScrollEl.addEventListener('scroll', rpMove, { passive: true });
        window.addEventListener('resize', rpMove);
      } else if (!on && rpScrollEl) {
        rpScrollEl.removeEventListener('scroll', rpMove);
        window.removeEventListener('resize', rpMove);
        rpScrollEl = null;
      }
    };
    Vue.watch(function () { return store.reactFor; }, function () {
      if (!pickerOpen(props.row)) {
        fullReact.value = false;
        bindRpMove(false);
        return;
      }
      fullReact.value = false;
      bindRpMove(true);
      placeRp();
    });
    Vue.watch(fullReact, function () {
      if (pickerOpen(props.row)) placeRp();
    });
    Vue.onUnmounted(function () { bindRpMove(false); });

    /* ---- W8: reproductor de audio propio (no usa <audio controls>) ---- */
    const aEl = Vue.ref(null);
    const aPlaying = Vue.ref(false);
    const aCur = Vue.ref(0);
    const aDur = Vue.ref(0);

    const fmtTime = function (s) {
      if (!s || s < 0 || !isFinite(s)) return '0:00';
      const m = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      return m + ':' + (ss < 10 ? '0' : '') + ss;
    };
    /* W51: play() puede rechazar (sin fuente, códec ausente, gesto
       bloqueado). Sin .catch, Mypal llenaba la consola de
       "Uncaught (in promise) NotSupportedError". */
    const safePlay = function (el) {
      if (!el) return;
      try {
        const p = el.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    };
    /* W53: qué formato tiene realmente la fuente actual. Con blob no se
       puede leer ?fmt=, así que miramos el MIME del Blob descargado. */
    const audioSrcFmt = function (el) {
      if (!el) return '';
      const src = el.currentSrc || el.src || '';
      const fm = /[?&]fmt=([a-z0-9]+)/i.exec(src);
      if (fm) return fm[1].toLowerCase();
      const raw = getBlob(src);
      const mt = raw && raw.type
        ? String(raw.type).split(';')[0].trim().toLowerCase() : '';
      if (mt === 'audio/ogg' || mt === 'application/ogg') return 'ogg';
      if (mt === 'audio/wav' || mt === 'audio/x-wav') return 'wav';
      if (mt === 'audio/mpeg') return 'mp3';
      if (mt === 'audio/webm') return 'webm';
      return '';
    };
    /* W51/W53: si el navegador no decodifica el original, cambia el src
       al derivado compatible del server (MP4/Ogg/WAV), conserva la
       descarga en segundo plano y deja la URL para la próxima apertura.
       Audio: Ogg Vorbis primero y WAV PCM como último recurso. */
    const compatFallback = function (el, tag, tries) {
      const m = props.row.ref.media;
      if (!m || !m.url) return '';
      const cur = tag === 'AUDIO' ? audioSrcFmt(el) : '';
      let forceFmt = '';
      if (tag === 'AUDIO') {
        if (cur === 'wav') return '';
        if (cur === 'ogg' || tries > 0) forceFmt = 'wav';
        else forceFmt = audioFallbackFmt();
      }
      const alt = compatUrl(m.url, m.mime, tag, true, forceFmt);
      /* W93: la comparación ya no puede ser `alt === m.url` (compatUrl
         prefixea CDN_BASE): un respaldo "sin fmt" significa que no hay
         derivado aplicable (p. ej. vídeo no-WebM) — no swap, para no
         entrar en bucle con el mismo archivo. */
      if (!alt || alt.indexOf('fmt=') < 0) return '';
      if (tag === 'AUDIO' && cur === 'ogg') markOggBroken();
      markMediaCompat(m.mime);
      forgetCached(m.url);
      el.__dlNoSwap = true;
      cacheMedia(alt);
      return alt;
    };
    const aTime = Vue.computed(function () {
      return fmtTime(aCur.value) + ' / ' + fmtTime(aDur.value);
    });
    const aPct = Vue.computed(function () {
      if (!aDur.value) return 0;
      return Math.min(100, (aCur.value / aDur.value) * 100);
    });
    let aWantPlay = false;
    const togglePlay = function () {
      const el = aEl.value;
      if (!el) return;
      if (el.paused) {
        if (currentAudioEl && currentAudioEl !== el) {
          try { currentAudioEl.pause(); } catch (e) {}
        }
        currentAudioEl = el;
        aWantPlay = true;
        /* W51: si por cualquier motivo el <audio> aún no tiene fuente,
           empieza a reproducir la URL firmada (sin esperar al blob). */
        if (!el.currentSrc && !el.src) {
          const m = props.row.ref.media;
          if (!m || !m.url) return;
          el.__dlNoSwap = true;
          el.src = compatUrl(m.url, m.mime, 'AUDIO');
          try { el.load(); } catch (e) {}
        }
        /* W13 fix: notas viejas sin dur → resolverla al primer play */
        if (!aDur.value) resolveDur(el);
        safePlay(el);
      } else {
        el.pause();
      }
    };

    /* W13: último recurso para WebM sin duración (notas viejas): decodifica
       el archivo. Solo al pulsar reproducir (no al cargar).
       W15: usa el blob YA descargado (mediadl.js) — sin fetch, sin red y
       sin depender del CSP; si no está en memoria, cae al fetch de antes. */
    const aResolving = Vue.ref(false);
    const decodeDurBuf = function (buf) {
      if (!buf) { aResolving.value = false; return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { aResolving.value = false; return; }
      let ctx;
      try { ctx = new AC(); } catch (e) { aResolving.value = false; return; }
      let closed = false;
      const finish = function () {
        aResolving.value = false;
        if (closed) return;
        closed = true;
        try { ctx.close(); } catch (e) {}
      };
      const got = function (ab) {
        /* decodeAudioData entrega un AudioBuffer (no un número): la duración
           está en ab.duration. (Antes se hacía isFinite(sobre el buffer) y
           nunca guardaba; solo se enmascaraba porque el seek resolvía antes.) */
        const dd = ab && ab.duration;
        if (dd && isFinite(dd) && dd > 0) aDur.value = dd;
        finish();
      };
      const failed = function () { finish(); };
      try {
        /* FF78 devuelve una promesa aunque se pasen callbacks. Si el códec
           no está disponible, esa promesa se rechaza y sin catch quedaba
           "Uncaught (in promise) EncodingError" en Mypal. */
        const p = ctx.decodeAudioData(buf, got, failed);
        if (p && typeof p.catch === 'function') p.catch(failed);
      } catch (e) { finish(); }
    };
    const resolveDur = function (el) {
      if (aResolving.value || aDur.value) return;
      const src = el.currentSrc || el.src;
      if (!src) return;
      aResolving.value = true;
      const raw = getBlob(src);
      if (raw && raw.arrayBuffer) {            // en memoria: decodificar ya
        raw.arrayBuffer()
          .then(decodeDurBuf)
          .catch(function () { aResolving.value = false; });
        return;
      }
      if (typeof fetch !== 'function') { aResolving.value = false; return; }
      fetch(src, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(decodeDurBuf)
        .catch(function () { aResolving.value = false; });
    };
    const seek = function (e) {
      const el = aEl.value;
      if (!el || !aDur.value) return;
      const bar = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
      el.currentTime = ratio * aDur.value;
    };
    /* W63: arrastrar el círculo/barra para buscar posición (scrubbing).
       El rectángulo se captura del .wave real: en los listeners de window
       e.currentTarget es window, no la barra. También soporta táctil. */
    let waveDrag = false;
    const waveBarOf = function (target) {
      if (!target) return null;
      if (target.closest) return target.closest('.wave');
      return null;
    };
    const waveSeekTo = function (bar, clientX) {
      const el = aEl.value;
      if (!el || !aDur.value || !bar) return;
      const r = bar.getBoundingClientRect();
      if (!r.width) return;
      const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      el.currentTime = ratio * aDur.value;
    };
    const waveDown = function (e) {
      const el = aEl.value;
      const bar = waveBarOf(e.currentTarget);
      if (!el || !aDur.value || !bar) return;
      waveDrag = true;
      if (e.preventDefault) e.preventDefault();
      waveSeekTo(bar, e.clientX);
      const move = function (ev) { waveSeekTo(bar, ev.clientX); };
      const up = function () {
        waveDrag = false;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    const waveDownTouch = function (e) {
      const el = aEl.value;
      const bar = waveBarOf(e.currentTarget);
      if (!el || !aDur.value || !bar || !e.touches || !e.touches.length) return;
      if (e.preventDefault) e.preventDefault();
      waveDrag = true;
      waveSeekTo(bar, e.touches[0].clientX);
      const move = function (ev) {
        if (!ev.touches || !ev.touches.length) return;
        if (ev.preventDefault) ev.preventDefault();
        waveSeekTo(bar, ev.touches[0].clientX);
      };
      const up = function () {
        waveDrag = false;
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', up);
        window.removeEventListener('touchcancel', up);
      };
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
      window.addEventListener('touchcancel', up);
    };
    /* W37d: velocidad de la NOTA DE VOZ (1× → 1,5× → 2× → 1×) */
    const aRateV = Vue.ref(1);
    const aRate = function () {
      const el = aEl.value;
      const next = aRateV.value === 1 ? 1.5 : (aRateV.value === 1.5 ? 2 : 1);
      aRateV.value = next;
      if (el) el.playbackRate = next;
    };
    const aMeta = function (e) {
      const d = e.target.duration;
      /* Fix W13: los WebM de MediaRecorder no traen duración en el
         encabezado (el elemento reporta Infinity → se veía "0:00").
         Preferimos la duración que guardó quien grabó; si no la hay
         (audios viejos), forzamos la carga total con un seek lejano. */
      if (isFinite(d) && d > 0) { aDur.value = d; return; }
      const known = props.row.ref.dur;
      if (known && known > 0) { aDur.value = known; return; }
      aDur.value = 0;
      /* W15: si el blob está en memoria lo decodificamos para la duración;
         el truco del seek lejano (W13) rompía la reproducción cuando el
         audio ya venía cargado entero como blob (webm de MediaRecorder
         sin duración en el encabezado). Solo se usa el seek en streaming. */
      const msrc = e.target.currentSrc || e.target.src;
      if (getBlob(msrc)) { resolveDur(e.target); return; }
      try { e.target.currentTime = 1e6; } catch (err) {}
    };
    /* W51/W53: el audio original no se pudo decodificar (Mypal 78 con
       WebM/Opus o MP3/WMF). Se prueba Ogg Vorbis y, si también falla,
       WAV PCM; no se muestra un error porque el reproductor sigue siendo
       el mismo. */
    let aErrTries = 0;
    const aErrEv = function (e) {
      if (aErrTries >= 2) return;
      const el = e.target;
      const alt = compatFallback(el, 'AUDIO', aErrTries);
      if (!alt) return;
      aErrTries++;
      el.src = alt;
      try { el.load(); } catch (err) {}
      /* Si el usuario ya había pulsado play, el cambio de formato no debe
         costarle un segundo clic. */
      if (aWantPlay) safePlay(el);
    };
    /* Tras el seek lejano el navegador calcula la duración real; si no,
       el extremo cargado da una pista (W13 fix del "0:00" eterno). */
    const aDurEv = function (e) {
      const el = e.target;
      if (isFinite(el.duration) && el.duration > 0) { aDur.value = el.duration; return; }
      try {
        if (el.seekable && el.seekable.length && el.seekable.end(0) > 0.5) {
          aDur.value = el.seekable.end(0);
        }
      } catch (err) { /* sin seekable: seguir esperando */ }
    };
    const aTimeUpd = function (e) { aCur.value = e.target.currentTime || 0; };
    /* W16: progreso suave. En Firefox timeupdate llega ~1 vez por segundo
       (y con 34 barras la onda se movía literalmente a "1 fps"): mientras
       suena, requestAnimationFrame mantiene barra y tiempo a ~60 fps.
       timeupdate queda como respaldo (seek con el audio pausado). */
    let aRaf = 0;
    const aRafStop = function () {
      if (aRaf) { cancelAnimationFrame(aRaf); aRaf = 0; }
      const el = aEl.value;
      if (el) aCur.value = el.currentTime || 0;   /* estado final exacto */
    };
    const aTick = function () {
      aRaf = 0;
      const el = aEl.value;
      if (!el || el.paused || el.ended) return;   /* sin nueva tanda */
      aCur.value = el.currentTime || 0;
      aRaf = requestAnimationFrame(aTick);
    };
    const aPlayEv = function () {
      aWantPlay = false;
      aPlaying.value = true;
      if (!aRaf) aRaf = requestAnimationFrame(aTick);
    };
    const aPauseEv = function () {
      aWantPlay = false;
      aPlaying.value = false;
      aRafStop();
    };
    const aEndEv = function () {
      aPlaying.value = false;
      aRafStop();
      /* W13: tras escucharla completa ya sabemos cuánto dura */
      if (!aDur.value && aCur.value) aDur.value = aCur.value;
      aCur.value = 0;
      try { aEl.value.currentTime = 0; } catch (e) {}
    };
    Vue.onUnmounted(aRafStop);

    /* ---- W36c: reproductor PROPIO de video (controles dentro del
       video): play/pausa al centro, barra + hora + silencio + pantalla
       completa abajo; los controles se ocultan a los 1 s de inactividad
       mientras reproduce (con pausa siempre se ven). ---- */
    const vEl = Vue.ref(null);
    const vWrapEl = Vue.ref(null);
    const vPlaying = Vue.ref(false);
    const vCur = Vue.ref(0);
    const vDur = Vue.ref(0);
    const vMuted = Vue.ref(false);
    const vHide = Vue.ref(false);
    let vHideT = 0;
    const vArmHide = function () {
      if (vHideT) { clearTimeout(vHideT); vHideT = 0; }
      if (!vPlaying.value) { vHide.value = false; return; }
      vHideT = setTimeout(function () { vHide.value = true; }, 1000);
    };
    const vPeek = function () {
      vHide.value = false;
      vArmHide();
    };
    const vCurTxt = Vue.computed(function () { return fmtTime(vCur.value); });
    const vDurTxt = Vue.computed(function () { return fmtTime(vDur.value); });
    const vPct = Vue.computed(function () {
      if (!vDur.value) return '0%';
      return Math.min(100, (vCur.value / vDur.value) * 100) + '%';
    });
    let vWantPlay = false;
    const toggleV = function () {
      const el = vEl.value;
      if (!el) return;
      if (el.paused) {
        if (currentAudioEl && currentAudioEl !== el) {
          try { currentAudioEl.pause(); } catch (e) {}
        }
        currentAudioEl = el;
        vWantPlay = true;
        /* W51: primer clic mientras v-dl todavía baja el archivo. Antes
           el video no tenía src y el clic se perdía. Ahora arranca el
           streaming firmado al instante; la descarga completa sigue en
           segundo plano y NO reemplaza la fuente que ya suena. */
        if (!el.currentSrc && !el.src) {
          const m = props.row.ref.media;
          if (!m || !m.url) return;
          el.__dlNoSwap = true;
          el.src = compatUrl(m.url, m.mime, 'VIDEO');
          try { el.load(); } catch (e) {}
        }
        safePlay(el);
      } else {
        el.pause();
      }
    };
    const vSeekTo = function (e) {
      const el = vEl.value;
      if (!el || !vDur.value) return;
      const bar = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
      el.currentTime = ratio * vDur.value;
      vPeek();
    };
    const vMute = function () {
      const el = vEl.value;
      if (!el) return;
      el.muted = !el.muted;
      vMuted.value = el.muted;
    };
    /* W43: el botón ALTERNA — si este video ya está en pantalla
       completa, el segundo clic SALE (antes pedir fullscreen estando
       en fullscreen era no-op: no había forma de salir con el botón).
       vFs cambia icono (expand/collapse) y rótulo. */
    const vFs = Vue.ref(false);
    const vFsChange = function () {
      const doc = document;
      vFs.value = (doc.fullscreenElement || doc.webkitFullscreenElement)
        === vWrapEl.value;
    };
    document.addEventListener('fullscreenchange', vFsChange);
    document.addEventListener('webkitfullscreenchange', vFsChange);
    Vue.onUnmounted(function () {
      document.removeEventListener('fullscreenchange', vFsChange);
      document.removeEventListener('webkitfullscreenchange', vFsChange);
    });
    const vFull = function () {
      const el = vWrapEl.value;
      const doc = document;
      if (!el) return;
      const cur = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (cur === el) {
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        return;
      }
      let p = null;
      if (el.requestFullscreen) p = el.requestFullscreen();
      else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
      if (p && p.catch) p.catch(function () {});   /* bloqueado: no-op */
    };
    const vMeta = function (e) {
      const d = e.target.duration;
      vDur.value = (isFinite(d) && d > 0) ? d : 0;
      /* W29a: sin pista de video (sonido solo) → el bloque cae al
         reproductor de audio (misma prueba que antes en vidMeta). */
      if (e.target && !e.target.videoHeight) vidOk.value = false;
      const nw = e.target && +e.target.videoWidth;
      const nh = e.target && +e.target.videoHeight;
      if (nw > 0 && nh > 0) {
        vNatW.value = nw;
        vNatH.value = nh;
      }
    };
    const vTimeUpd = function (e) { vCur.value = e.target.currentTime || 0; };
    const vPlayEv = function () {
      vWantPlay = false;
      vPlaying.value = true;
      vArmHide();
      /* W37d: si reproduce, la descarga ya terminó: limpia el overlay
         residual (anillo/✕) que a veces quedaba visible. */
      vClearDlState();
    };
    const vPauseEv = function () {
      vWantPlay = false;
      vPlaying.value = false;
      if (vHideT) { clearTimeout(vHideT); vHideT = 0; }
      vHide.value = false;
    };
    const vEndEv = function () {
      vPlaying.value = false;
      vHide.value = false;
      vCur.value = 0;
      try { vEl.value.currentTime = 0; } catch (e) {}
    };
    /* W37d: control de VOLUMEN con popup (slider) — al abrirlo la hora
       se desvanece (transition) para no amontonar la barra. */
    const vVol = Vue.ref(1);
    const vVolOpen = Vue.ref(false);
    const vSetVol = function (e) {
      const el = vEl.value;
      const v = Math.max(0, Math.min(1, parseFloat(e.target.value)));
      vVol.value = v;
      if (!el) return;
      el.volume = v;
      if (v > 0 && el.muted) { el.muted = false; vMuted.value = false; }
    };
    const vToggleVol = function () {
      vVolOpen.value = !vVolOpen.value;
      vPeek();
    };
    /* W37d: errores de decodificación/mime — "Este video tiene un error
       y no se puede reproducir" con icono de advertencia. */
    const vErr = Vue.ref(false);
    let vErrTried = false;
    const vErrEv = function (e) {
      if (!vErrTried) {
        vErrTried = true;
        const alt = compatFallback(e.target, 'VIDEO');
        if (alt) {                       /* sigue el player con MP4 */
          e.target.src = alt;
          try { e.target.load(); } catch (err) {}
          /* El primer clic en Mypal no se pierde: si el usuario quiso
             reproducir, el MP4 arranca al estar listo. */
          if (vWantPlay) safePlay(e.target);
          return;
        }
      }
      vErr.value = true;
    };
    /* W37d: si el video ya REPRODUCE, la descarga terminó — cualquier
       estado de overlay (anillo/✕) es residual: se limpia aquí (el bug
       era que la ✕ de cancelar quedaba visible con el video sonando).
       W43: markDlDone actualiza la fuente de verdad de las clases dl-*
       (si no, el re-assert de mediadl restauraría el estado viejo). */
    const vClearDlState = function () {
      markDlDone(vWrapEl.value);
    };
    /* clic en el centro del video = play/pausa (como en los players
       comerciales); el botón central usa .stop para no duplicar */
    const vClickCenter = function () {
      vPeek();
      toggleV();
    };
    Vue.onUnmounted(function () {
      if (vHideT) clearTimeout(vHideT);
    });

    /* ---- W36c: audio adjunto (mp3/ogg/…) con el MISMO player propio
       que las notas de voz: play/pausa, barra, hora y velocidad. El
       <audio> queda oculto (los tests y la descarga lo siguen usando). ---- */
    const afEl = Vue.ref(null);
    const afPlaying = Vue.ref(false);
    const afCur = Vue.ref(0);
    const afDur = Vue.ref(0);
    const afRateV = Vue.ref(1);
    const afCurTxt = Vue.computed(function () { return fmtTime(afCur.value); });
    const afDurTxt = Vue.computed(function () { return fmtTime(afDur.value); });
    const afPct = Vue.computed(function () {
      if (!afDur.value) return '0%';
      return Math.min(100, (afCur.value / afDur.value) * 100) + '%';
    });
    let afWantPlay = false;
    const afToggle = function () {
      const el = afEl.value;
      if (!el) return;
      if (el.paused) {
        if (currentAudioEl && currentAudioEl !== el) {
          try { currentAudioEl.pause(); } catch (e) {}
        }
        currentAudioEl = el;
        afWantPlay = true;
        if (!el.currentSrc && !el.src) {
          const m = props.row.ref.media;
          if (!m || !m.url) return;
          el.__dlNoSwap = true;
          el.src = compatUrl(m.url, m.mime, 'AUDIO');
          try { el.load(); } catch (e) {}
        }
        safePlay(el);
      } else {
        el.pause();
      }
    };
    const afSeek = function (e) {
      const el = afEl.value;
      if (!el || !afDur.value) return;
      const bar = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
      el.currentTime = ratio * afDur.value;
    };
    const afRate = function () {
      const el = afEl.value;
      const next = afRateV.value === 1 ? 1.5 : (afRateV.value === 1.5 ? 2 : 1);
      afRateV.value = next;
      if (el) el.playbackRate = next;
    };
    const afMeta = function (e) {
      const d = e.target.duration;
      afDur.value = (isFinite(d) && d > 0) ? d : 0;
    };
    let afErrTries = 0;
    const afErrEv = function (e) {
      if (afErrTries >= 2) return;
      const alt = compatFallback(e.target, 'AUDIO', afErrTries);
      if (!alt) return;
      afErrTries++;
      e.target.src = alt;
      try { e.target.load(); } catch (err) {}
      if (afWantPlay) safePlay(e.target);
    };
    const afTimeUpd = function (e) { afCur.value = e.target.currentTime || 0; };
    const afPlayEv = function () { afWantPlay = false; afPlaying.value = true; };
    const afPauseEv = function () { afWantPlay = false; afPlaying.value = false; };
    const afEndEv = function () {
      afPlaying.value = false;
      afCur.value = 0;
      try { afEl.value.currentTime = 0; } catch (e) {}
    };

    /* W13: onda de voz — 34 barras. Si el server trae los picos de la
       grabación se dibuja la forma real; si no (grabaciones viejas),
       un perfil neutro. La barra clickeada hace seek. */
    const WAVE_N = 34;
    const wave = Vue.computed(function () {
      const p = props.row.ref.peaks;
      const out = [];
      if (p && p.length) {
        const step = p.length / WAVE_N;
        for (let i = 0; i < WAVE_N; i++) {
          const a = Math.floor(i * step);
          const b = Math.max(a + 1, Math.floor((i + 1) * step));
          let s = 0;
          for (let j = a; j < b && j < p.length; j++) if (p[j] > s) s = p[j];
          out.push(Math.max(10, Math.min(100, s)));
        }
      } else {
        for (let i = 0; i < WAVE_N; i++) out.push(30 + ((i * 7) % 5) * 9);
      }
      return out;
    });
    const aBarF = Vue.computed(function () {
      return (aPct.value / 100) * WAVE_N;
    });
    const aBar = Vue.computed(function () {
      return Math.floor(aBarF.value);
    });
    /* W16: la barra "líder" (a medio llenar) se atenúa con opacity para
       que el borde de la onda avance de forma continua en vez de saltar
       de a 34 escalones; en el resto devuelve null (sin estilo inline).
       Sólo opacity → permitido y barato en FF78. */
    const waveOp = function (i) {
      if (i !== aBar.value + 1) return null;
      return (0.35 + 0.6 * (aBarF.value - aBar.value)).toFixed(3);
    };

    /* ---- W8: edición en línea (store.editFor desde el menú contextual) ---- */
    const editing = Vue.computed(function () {
      return store.editFor !== 0 && store.editFor === props.row.ref.id;
    });
    const editEl = Vue.ref(null);
    Vue.watch(editing, function (on) {
      if (!on) return;
      /* W32: el texto DESCIFRADO al editar (nunca el marcador). */
      const ref0e = props.row.ref;
      store.editDraft = ref0e.body || '';
      Vue.nextTick(function () {
        const el = editEl.value;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(el.value.length, el.value.length);
          } catch (e) {}
        }
      });
    });
    const cancelEdit = function () {
      store.editFor = 0;
      store.editDraft = '';
    };
    const saveEdit = function () {
      const txt = store.editDraft;
      if (!txt.trim()) { cancelEdit(); return; }
      /* W17: los ":código:" se convierten igual que al enviar. */
      emit('saveedit', props.row.ref, shortcodesToEmoji(txt));
    };

    /* W11: helpers del círculo de subida (r=21 → circunferencia 132) */
    const isVideo = function (m) {
      return !!(m && /^video\//.test(m.mime || ''));
    };
    /* W29a: archivos de AUDIO (mp3/ogg/m4a/…) → reproductor <audio>
       nativo en vez de la fila de descarga. */
    const isAudio = function (m) {
      if (!m) return false;
      if (/^audio\//.test(m.mime || '')) return true;
      const n = (m.name || '').toLowerCase();
      return /\.(mp3|ogg|oga|m4a|wav|flac|aac|opus|weba)$/.test(n);
    };
    /* W29a: probe del <video> — si al cargar los metadatos no hay
       pista de video (videoHeight = 0, p. ej. un webm de audio) la
       burbuja cambia a <audio> en vez de mostrar un recuadro negro. */
    const vidOk = Vue.ref(true);
    /* W51: resolución real del video para reservar el marco antes de
       descargarlo (el server ya la manda en media.width/height; este
       respaldo cubre filas viejas hasta que se rellenen). */
    const vNatW = Vue.ref(0);
    const vNatH = Vue.ref(0);
    const vBox = Vue.computed(function () {
      const md = props.row.ref.media;
      const w = (md && +md.width) || vNatW.value;
      const h = (md && +md.height) || vNatH.value;
      if (w < 1 || h < 1) return null;
      /* tope 360×340, manteniendo la proporción; en móvil se ajusta al
         ancho visible para que el marco no desborde la burbuja. */
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1000;
      const cap = Math.max(160, Math.min(360, vw - 96));
      const bw = Math.min(cap, Math.round(340 * w / h), w);
      return {
        width: bw + 'px',
        height: Math.max(1, Math.round(bw * h / w)) + 'px',
      };
    });
    /* W36c: la prueba de pista de video ahora vive en vMeta (player propio). */
    /* W29a: la animación de entrada corre una sola vez; al terminar se
       quita la bandera para no repetirla en re-renders. */
    const animEnd = function (e) {
      if (e.target !== e.currentTarget) return;
      if (props.row.ref && props.row.ref._in) props.row.ref._in = false;
    };
    /* W22: si el server conoce la resolución de la imagen, el marco se
       reserva con esa proporción desde el principio y el spinner de
       descarga/subida queda dentro del cuadro. Sin resolución conocida
       (archivos viejos, SVG) → null: solo la miniatura difuminada. */
    const imgBox = Vue.computed(function () {
      const md = props.row.ref.media;
      const w = (md && +md.width) || 0;
      const h = (md && +md.height) || 0;
      if (w < 1 || h < 1) return null;
      /* tope 300×340 (los mismos del .b-img), manteniendo la proporción;
         en pantallas angostas se descuenta el avatar/margen para que la
         imagen no desborde la burbuja (W51, sin aspect-ratio). */
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1000;
      const cap = Math.max(120, Math.min(300, vw - 96));
      const bw = Math.min(cap, Math.round(340 * w / h), w);
      return {
        width: bw + 'px',
        height: Math.max(1, Math.round(bw * h / w)) + 'px',
      };
    });
    const upPct = function (up) {
      return Math.round((up.p || 0) * 100) + '%';
    };
    const upOff = function (up) {
      return 132 - 132 * (up.p || 0);
    };

    /* W29b: dentro de cada trozo de texto, los emojis salen como
       segmentos propios con su archivo Twemoji (e); las menciones se
       conservan enteras. */

    /* W35a: enlaces con cualquier protocolo seguro de la lista (https,
       ftp, mailto, tel, …). javascript:/data: NO están en la lista,
       así que quedan como texto plano. Se trae la puntuación final
       (",." del final de la oración) fuera del enlace. */
    const LINK_OK = /^(?:https?|ftps?|mailto|tel|sms|geo|magnet|xmpp|ircs?|news|matrix|skype|tg|whatsapp|steam|spotify|market|callto)$/i;
    const LINK_RE = /[a-z][a-z0-9+.\-]*:(?:\/\/)?[^\s<>"']*/gi;

    const splitLinks = function (txt) {
      const res = [];
      let last = 0;
      LINK_RE.lastIndex = 0;
      let m = LINK_RE.exec(txt);
      while (m) {
        const raw = m[0];
        const start = m.index;
        const colon = raw.indexOf(':');
        const scheme = raw.slice(0, colon).toLowerCase();
        const url = raw.replace(/[.,;:!?)\]}'"]+$/, '');
        if (LINK_OK.test(scheme) && url.length > colon + 2) {
          if (start > last) res.push({ t: txt.slice(last, start) });
          res.push({ t: url, u: url });
          last = start + url.length;
          LINK_RE.lastIndex = last;
        } else {
          LINK_RE.lastIndex = start + colon + 1;   // sigue buscando dentro
        }
        m = LINK_RE.exec(txt);
      }
      if (last < txt.length) res.push({ t: txt.slice(last) });
      return res;
    };

    const splitSegs = function (arr) {
      const res = [];
      for (let i = 0; i < arr.length; i++) {
        const sg = arr[i];
        if (sg.m) { res.push(sg); continue; }
        const lks = splitLinks(sg.t);          /* W35a */
        for (let k = 0; k < lks.length; k++) {
          if (lks[k].u) { res.push(lks[k]); continue; }
          const parts = splitEmojis(lks[k].t);
          for (let j = 0; j < parts.length; j++) {
            res.push({ t: parts[j].t, e: parts[j].e || '', m: '', me: false });
          }
        }
      }
      return res;
    };

    /* W29b: título de un emoji = su :shortcode: (o el carácter solo). */
    const titleOf = function (ch) { return emojiCode(ch); };
    const emoNative = Vue.computed(function () { return emoStyle() === 'system'; });

    /* W62: si una foto de avatar falla (firma vencida, red), la fila cae
       a la inicial en vez de dejar el hueco roto. Al cambiar la URL se
       reintenta sola. */
    const avErr = Vue.ref(false);
    const avRetried = Vue.ref(false);
    const onAvatarError = () => {
      if (!avRetried.value && props.row.avatar && props.row.avatar.url) {
        avRetried.value = true;
        // Reintenta con parámetro de cache-busting
        try {
          const url = new URL(props.row.avatar.url, location.href);
          url.searchParams.set('retry', Date.now().toString());
          // Actualiza la URL en el objeto avatar para que Vue la relea
          props.row.avatar.url = url.href;
        } catch(e) {}
        return;
      }
      avErr.value = true;
    };
    Vue.watch(function () { return props.row.avatar && props.row.avatar.url; },
      function () { avErr.value = false; avRetried.value = false; });

    /* W41/W61: 1–3 emojis en el cuerpo → el mensaje se pinta como
       sticker (emoji grande, sin caja y con la hora en pastillita).
       No con cita (el bloque .b-reply rompería el look transparente)
       ni en edición (se ve el textarea). */
    const emoBig = function () {
      const ref0 = props.row.ref;
      if (ref0.kind !== 'text' || editing.value || ref0.reply_to) return false;
      const txt = ref0.body || '';
      return isEmojiBurst(txt);
    };
    /* W61: un sticker con imagen se puede guardar en la biblioteca. */
    const stickerAssetOn = function () {
      const m = props.row.ref.media;
      return !!(m && assetWithMedia('sticker', m.id));
    };
    const saveStickerAsset = function () {
      toggleStickerAsset(props.row.ref);
    };

    /* W29c: hover en un chip → quiénes reaccionaron ("😂 juan, maria"). */
    const reactTitle = function (msg, emoji) {
      const rs = msg.reactions || [];
      const names = [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].emoji === emoji) {
          names.push(rs[i].name || rs[i].username || ('#' + rs[i].user_id));
        }
      }
      if (!names.length) return emojiCode(emoji);
      if (names.length > 3) {
        return emoji + ' ' + names.slice(0, 3).join(', ') + ' ' +
          t('y {n} más', { n: names.length - 3 });
      }
      return emoji + ' ' + names.join(', ');
    };

    /* W28b: texto de la burbuja partido en trozos, con las @menciones
       de los MIEMBROS del grupo marcadas (sólo en grupos: el server
       sólo cuenta menciones ahí). */
    const bodySegs = Vue.computed(function () {
      const ref0 = props.row.ref;
      const txt = ref0.body || '';
      const c = store.chats.find(function (x) {
        return x.id === store.activeChatId;
      });
      const inf = store.info;
      const mem = (c && c.type === 'group' && inf &&
                   inf.chatId === store.activeChatId && inf.members)
        ? inf.members : null;
      if (!mem || !mem.length) return splitSegs([{ t: txt, m: '', me: false }]);
      const names = {};
      for (let i = 0; i < mem.length; i++) {
        if (mem[i].username) names[mem[i].username.toLowerCase()] = 1;
      }
      const me = ((store.user && store.user.username) || '').toLowerCase();
      const out = [];
      const re = /@([A-Za-z0-9_.]{3,20})/g;
      let last = 0;
      let mm = re.exec(txt);
      while (mm) {
        const w = mm[1].toLowerCase();
        /* W37e: menciones globales — se reconocen escritas en CUALQUIER
           idioma (@everyone/@todos, @online/@activos) y se muestran en
           EL IDIOMA DEL LECTOR (@todos en es, @everyone en en). */
        if (w === 'everyone' || w === 'todos') {
          if (mm.index > last) out.push({ t: txt.slice(last, mm.index), m: '' });
          out.push({ t: t('@todos'), m: 'everyone', me: false });
          last = mm.index + mm[0].length;
        } else if (w === 'online' || w === 'activos') {
          if (mm.index > last) out.push({ t: txt.slice(last, mm.index), m: '' });
          out.push({ t: t('@activos'), m: 'online', me: false });
          last = mm.index + mm[0].length;
        } else if (names[w]) {
          if (mm.index > last) out.push({ t: txt.slice(last, mm.index), m: '' });
          out.push({ t: '@' + mm[1], m: mm[1], me: w === me });
          last = mm.index + mm[0].length;
        }
        mm = re.exec(txt);
      }
      if (last < txt.length || !out.length) out.push({ t: txt.slice(last), m: '' });
      return splitSegs(out);
    });

    /* W35b: imagen inline — una URL con extensión de imagen (.gif se
       ve ANIMADO) se pinta como <img>; el resto de links http(s) pide
       la "portada" al server (W35c) y, si resulta ser una imagen, se
       pinta igual. */
    const IMG_EXT = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:$|\?)/i;
    const isHttp = function (u) { return /^https?:\/\//i.test(u); };
    const imgInline = function (u) {
      if (IMG_EXT.test(u)) return true;
      const p = store.linkPrev[u];
      return !!(p && p.status === 'ok' && p.type === 'image');
    };

    /* W35c: links http(s) sin extensión de imagen → tarjeta "portada"
       con título/descripción/imagen del sitio. */
    const msgLinks = Vue.computed(function () {
      const out = [];
      const segs = bodySegs.value;
      for (let i = 0; i < segs.length; i++) {
        const u = segs[i].u;
        if (u && isHttp(u) && !IMG_EXT.test(u) && out.indexOf(u) < 0) out.push(u);
      }
      return out;
    });
    Vue.watch(function () { return msgLinks.value; }, function (ls) {
      for (let i = 0; i < ls.length; i++) ensurePreview(ls[i]);
    }, { immediate: true });

    const linkCards = Vue.computed(function () {
      const out = [];
      const segs = bodySegs.value;
      const seen = {};
      for (let i = 0; i < segs.length; i++) {
        const u = segs[i].u;
        if (!u || !isHttp(u) || IMG_EXT.test(u) || seen[u]) continue;
        seen[u] = 1;
        const p = store.linkPrev[u];
        if (p && p.status === 'ok' && p.type === 'page') out.push({ url: u, d: p });
      }
      return out;
    });

    /* W29d: spoilers — tapado hasta que el usuario toque la capa. El
       estado vive en store.spoilSeen[chatId] y se vacía al salir. */
    const isSeen = function (m) {
      const s = store.spoilSeen[store.activeChatId];
      return !!(s && s[m.id]);
    };
    const spoiled = Vue.computed(function () {
      return !!props.row.ref.spoiler && !isSeen(props.row.ref);
    });
    /* W62: los spoilers de imagen/GIF/sticker muestran la propia media
       difuminada de fondo. El texto sigue con la capa oscura. */
    const spoilBg = Vue.computed(function () {
      if (!spoiled.value) return null;
      const r = props.row.ref;
      const m = r.media;
      if (!m || !m.url) return null;
      if (r.kind !== 'image' && r.kind !== 'sticker') return null;
      if (String(m.mime || '').indexOf('image/') !== 0) return null;
      return { backgroundImage: 'url("' + mediaUrl(m.url) + '")' };
    });
    const spoilShow = function (m) {
      if (!store.spoilSeen[store.activeChatId]) {
        store.spoilSeen[store.activeChatId] = {};
      }
      store.spoilSeen[store.activeChatId][m.id] = 1;
    };
    const spoilHide = function (m) {
      const s = store.spoilSeen[store.activeChatId];
      if (s && s[m.id]) delete s[m.id];
    };
    return {
      store, emojis, rpEl, rpPos, avErr, spoilBg,
      onAvatarError,   /* W66c: faltaba en el return; el @error del avatar
                          reventaba en consola en vez de mostrar la inicial */
      bodySegs,
      /* W78: etiqueta accesible para lectores de pantalla (emojis agrupados) */
      formatEmojisForA11y,
      /* W35a–c: enlaces, imagen inline y tarjetas */
      imgInline, linkCards,
      /* W36c: reproductores propios de video y audio adjunto */
      vEl, vWrapEl, vPlaying, vMuted, vHide, vCurTxt, vDurTxt, vPct,
      vPeek, toggleV, vSeekTo, vMute, vFull, vMeta, vTimeUpd, vFs,
      vPlayEv, vPauseEv, vEndEv, vClickCenter,
      /* W37d: volumen con popup, error de mime y descarga del video */
      vVol, vVolOpen, vSetVol, vToggleVol, vErr, vErrEv, vBox,
      afEl, afPlaying, afRateV, afCurTxt, afDurTxt, afPct,
      afToggle, afSeek, afRate, afMeta, afTimeUpd, afPlayEv, afErrEv,
      afPauseEv, afEndEv,
      /* W37d: velocidad de la nota de voz */
      aRate, aRateV,
      /* W36k: ★ favorito del GIF */
      isGifFav, toggleFavGif, isGifMedia,   /* W66c: gif o webp animado */
      isStkFav, toggleStkFav,   /* W60 */
      spoiled, spoilShow, spoilHide,   /* W29d */
      replyName, replyText, groupReactions, myReaction,
      doReply, doReact, mediaUrl, fmtSize,
      pickerOpen, togglePicker, openMenu,
      /* W13 */
      fullReact, toggleFull, wave, aBar, waveOp,
      /* W22 */
      imgBox,
      /* W8 */
      aEl, aPlaying, aTime, aPct, togglePlay, seek, waveDown, waveDownTouch,
      aMeta, aTimeUpd, aPlayEv, aPauseEv, aEndEv, aDurEv, aErrEv,
      editing, editEl, cancelEdit, saveEdit,
      /* W11: círculo de subida + video */
      isVideo, upPct, upOff,
      /* W29a */
      isAudio, vidOk, animEnd,
      /* W29b/W65: mensajes usan el set alternativo si al elegido le
         falta ese emoji (nunca la fuente del sistema). */
      emoAnySrc, emoNative, titleOf, reactTitle,
      emoBig,   /* W41 */
      stickerAssetOn, saveStickerAsset,   /* W61 */
    };
  },
  template:
    '<div class="msg" role="message" :data-msg-id="row.ref.id" :aria-label="formatEmojisForA11y(row.ref.body || \'\')" :class="{ mine: row.mine, tight: row.tight, system: row.ref.kind === \'system\', reacts: !!(row.ref.reactions && row.ref.reactions.length), anim: !!row.ref._in, \'has-av\': row.avCol && (row.mine ? row.showTime : (row.showTime || row.showSender)) }" @animationend="animEnd">' +
      /* W66: avatar del remitente junto a cada mensaje (propios y ajenos,
         grupos y MDs). En los entrantes aparece cuando hay nombre (primero
         de la tanda) u hora —nunca un nombre sin cara—; en los propios,
         cuando hay hora. Para los entrantes va a la izquierda de la
         burbuja; para los propios, a la derecha. */
      '<span class="msg-av" v-if="row.avCol && !row.mine && (row.showTime || row.showSender)" :class="{ \'is-av\': row.avatar, \'has-photo\': !!(row.avatar && row.avatar.url) }" ' +
        ':title="row.avatar ? row.avatar.name : \'\'">' +
        '<img v-if="row.avatar && row.avatar.url && !avErr" :src="mediaUrl(row.avatar.url)" alt="" loading="lazy" decoding="async" crossorigin="anonymous" @error="onAvatarError()">' +
        '<i v-else-if="row.avatar">{{ row.avatar.ini }}</i>' +
      '</span>' +
      '<div v-if="row.ref.kind === \'system\'" class="sys-msg">{{ row.ref.body }}</div>' +
      '<div v-else class="bubble" :class="{ picking: pickerOpen(row), sticker: row.ref.kind === \'sticker\', \'emo-big\': emoBig(), \'is-spoiled\': spoiled, gif: !!(row.ref.kind === \'image\' && row.ref.media && isGifMedia(row.ref.media)), vid: !!(row.ref.kind === \'file\' && row.ref.media && isVideo(row.ref.media) && vidOk) }">' +
        /* W29d: capa de spoiler — tapa TODO lo de adentro (texto,
           medios y acciones) hasta que se toque; al tocar se muestra
           y el puntito del pie lo vuelve a ocultar. Mientras está
           tapado, los hijos se ocultan (visibility): con sólo el
           fondo translúcido el texto asomaba sobre burbujas claras. */
        '<div v-if="spoilBg" class="b-spoil-bg" :style="spoilBg" aria-hidden="true"></div>' +
        '<button v-if="spoiled" class="b-spoil-ov" :class="{ \'has-bg\': !!spoilBg }" type="button" ' +
          '@click.stop="spoilShow(row.ref)">' +
          '<span class="b-spoil-pill">' +
            '<svg class="ic"><use href="#i-eye-off"></use></svg>' +
            '<span>{{ t(\'Mostrar Spoiler\') }}</span>' +
          '</span>' +
        '</button>' +
        '<div class="b-actions">' +
          '<button class="b-act" type="button" :title="t(\'Responder\')" @click="doReply(row)">' +
            '<svg class="ic ic-sm"><use href="#i-reply"></use></svg>' +
          '</button>' +
          '<button class="b-act" type="button" :title="t(\'Reaccionar\')" @click.stop="togglePicker">' +
            '<svg class="ic ic-sm"><use href="#i-smile"></use></svg>' +
          '</button>' +
          /* W36k: ★ favorito — sólo para GIFs (biblioteca o subidos;
             W66c: también WebP animados, que viajan como GIF) */
          '<button v-if="row.ref.kind === \'image\' && row.ref.media && ' +
            'isGifMedia(row.ref.media)" class="b-act" type="button" ' +
            ':title="isGifFav(row.ref) ? t(\'Quitar de favoritos\') : t(\'Agregar a favoritos\')" ' +
            '@click.stop="toggleFavGif(row.ref)">' +
            '<svg class="ic ic-sm"><use :href="isGifFav(row.ref) ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
          '</button>' +
          /* W60/W61: guardar un sticker recibido (emoji o imagen) */
          '<button v-if="row.ref.kind === \'sticker\' && !row.ref.media" class="b-act" type="button" ' +
            ':title="isStkFav(row.ref.body) ? t(\'Quitar de favoritos\') : t(\'Guardar en stickers\')" ' +
            '@click.stop="toggleStkFav(row.ref.body)">' +
            '<svg class="ic ic-sm"><use :href="isStkFav(row.ref.body) ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
          '</button>' +
          '<button v-else-if="row.ref.kind === \'sticker\' && row.ref.media" class="b-act" type="button" ' +
            ':title="stickerAssetOn() ? t(\'Quitar de favoritos\') : t(\'Guardar en stickers\')" ' +
            '@click.stop="saveStickerAsset">' +
            '<svg class="ic ic-sm"><use :href="stickerAssetOn() ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
          '</button>' +
          /* W17: ⋯ abre el mismo menú del clic derecho, anclado a la
             burbuja (no tapa el mensaje). Accesible también con Enter/
             Espacio desde el teclado o un pulsador (Switch). */
          '<button class="b-act b-more" type="button" :title="t(\'Más opciones\')" ' +
            '@click.stop="openMenu(row, $event)" ' +
            '@keydown.enter.stop="openMenu(row, $event)" ' +
            '@keydown.space.stop="openMenu(row, $event)" ' +
            '>' +
            '<svg class="ic ic-sm"><use href="#i-dots"></use></svg>' +
          '</button>' +
        '</div>' +
        /* W57: picker teletransportado; su posición fixed se calcula
           contra el viewport, sin heredar transforms de la burbuja. */
        '<Teleport to="body">' +
          '<span class="react-picker rp-portal" :class="{ \'rp-wide\': fullReact }" ' +
            'ref="rpEl" v-if="pickerOpen(row)" :style="rpPos" @click.stop>' +
            '<button class="rp" :class="{ mine: myReaction(row.ref) === e }" type="button" ' +
              'v-for="e in emojis" :key="e" :title="titleOf(e)" @click="doReact(row, e)">' +
              '<img v-if="emoAnySrc(e)" class="emo" :src="emoAnySrc(e)" ' +
                'alt="" :title="e" loading="lazy">' +
              '<span v-else-if="emoNative">{{ e }}</span></button>' +
            '<button class="rp rp-more" type="button" :title="t(\'Más emojis\')" ' +
              '@click="toggleFull">{{ fullReact ? \'–\' : \'＋\' }}</button>' +
            '<emoji-picker v-if="fullReact" :anchored="true" ' +
              '@pick="doReact(row, $event)"></emoji-picker>' +
          '</span>' +
        '</Teleport>' +
        /* W29c: el nombre del emisor va ARRIBA de la cita (antes la
           cita se dibujaba primero y "tapaba" al nombre); después la
           etiqueta de reenviado, la cita y el cuerpo del mensaje. */
        '<div v-if="row.showSender" class="b-sender">' +
          '<button type="button" :title="t(\'Ver perfil\')" ' +
            '@click="$emit(\'openprofile\', row.ref.sender.username)">' +
            '{{ row.ref.sender.display_name || row.ref.sender.username }}</button>' +
          '<span class="b-role" v-if="row.ref.sender.role === \'admin\' || row.ref.sender.role === \'owner\'">[Admin]</span>' +
        '</div>' +
        /* W13: etiqueta de mensaje reenviado (estilo WhatsApp) */
        '<div class="b-fwd" v-if="row.ref.forwarded">{{ t(\'Reenviado\') }}</div>' +
        '<div v-if="row.ref.reply_to" class="b-reply" style="cursor:pointer" @click="$emit(\'scrolltoreply\', row.ref.reply_to.id)">' +
          '<span class="br-name">{{ replyName(row) }}</span>' +
          '<span class="br-text">{{ replyText(row) }}</span>' +
        '</div>' +
        /* W11: subida en curso → burbuja con círculo de progreso.
           W22: si la resolución local ya se conoce, el cuadro se reserva
           igual que con la imagen descargada. */
        '<span class="b-media b-upmedia" v-if="row.ref.pending && row.ref.upload && row.ref.kind === \'image\'" ' +
          ':class="{ imgbox: imgBox }" :style="imgBox">' +
          '<img class="b-img" :src="row.ref.localUrl || \'\'" alt="" @load="$emit(\'imgload\')">' +
          /* W23: anillo + ✕/↻ DENTRO del círculo (centrados al 50%) */
          '<span class="up-ov" :class="{ \'is-fail\': row.ref.upload.state === \'fail\' }">' +
            '<svg class="up-c" viewBox="0 0 48 48" aria-hidden="true" v-if="row.ref.upload.state === \'up\'">' +
              '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
              '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="132" ' +
                ':stroke-dashoffset="upOff(row.ref.upload)"></circle>' +
            '</svg>' +
            '<span class="up-pct" v-if="row.ref.upload.state === \'up\'">{{ upPct(row.ref.upload) }}</span>' +
            '<button class="up-btn" v-if="row.ref.upload.state === \'up\'" type="button" ' +
              ':title="t(\'Cancelar subida\')" @click.stop="$emit(\'upcancel\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
            '<button class="up-btn" v-else type="button" ' +
              ':title="t(\'Reintentar subida\')" @click.stop="$emit(\'upretry\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>' +
          '</span>' +
        '</span>' +
        /* W22: nota de voz subiendo → fila con el aspecto del player y
           el anillo de progreso EN EL LUGAR DEL PLAY; el botón real de
           reproducción aparece cuando el server ya la tiene. */
        '<div class="b-player b-upvoice" v-else-if="row.ref.pending && row.ref.upload && row.ref.kind === \'voice\'">' +
          /* W23: anillo + ✕/↻ dentro del slot del play (centrado) */
          '<span class="au-btn">' +
            '<svg class="up-c" viewBox="0 0 48 48" v-if="row.ref.upload.state === \'up\'">' +
              '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
              '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="132" ' +
                ':stroke-dashoffset="upOff(row.ref.upload)"></circle>' +
            '</svg>' +
            '<button class="up-btn-static" v-if="row.ref.upload.state === \'up\'" type="button" ' +
              ':title="t(\'Cancelar subida\')" @click.stop="$emit(\'upcancel\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
            '<button class="up-btn-static" v-else type="button" ' +
              ':title="t(\'Reintentar subida\')" @click.stop="$emit(\'upretry\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>' +
          '</span>' +
          '<span class="wave">' +
            '<i v-for="(h, i) in wave" :key="i" :style="{ height: h + \'%\' }"></i>' +
          '</span>' +
          '<span class="au-time" :class="{ \'is-err\': row.ref.upload.state === \'fail\' }">' +
            '{{ row.ref.upload.state === \'fail\' ? (row.ref.upload.err || t(\'No se pudo enviar la nota de voz\')) : fmtSize(row.ref.fsize) }}' +
          '</span>' +
        '</div>' +
        '<div class="b-file b-upfile" v-else-if="row.ref.pending && row.ref.upload">' +
          '<svg class="ic ic-sm"><use href="#i-file"></use></svg>' +
          '<span class="bf-col">' +
            '<span class="bf-name">{{ row.ref.fname || (row.ref.kind === \'voice\' ? t(\'Nota de voz\') : t(\'Archivo\')) }}</span>' +
            '<span class="bf-size" :class="{ \'is-err\': row.ref.upload.state === \'fail\' }">' +
              '{{ row.ref.upload.state === \'fail\' ? (row.ref.upload.err || t(\'No se pudo enviar el archivo\')) : fmtSize(row.ref.fsize) }}' +
            '</span>' +
          '</span>' +
          /* W23: anillo + ✕/↻ dentro de un slot circulante */
          '<span class="up-slot">' +
            '<svg class="up-c" viewBox="0 0 48 48" aria-hidden="true" v-if="row.ref.upload.state === \'up\'">' +
              '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
              '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="132" ' +
                ':stroke-dashoffset="upOff(row.ref.upload)"></circle>' +
            '</svg>' +
            '<button class="up-btn-static" v-if="row.ref.upload.state === \'up\'" type="button" ' +
              ':title="t(\'Cancelar subida\')" @click.stop="$emit(\'upcancel\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
            '<button class="up-btn-static" v-else type="button" ' +
              ':title="t(\'Reintentar subida\')" @click.stop="$emit(\'upretry\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>' +
          '</span>' +
        '</div>' +
        /* W61: sticker subido (imagen) — se pinta grande, sin marco. */
        '<span class="b-sticker-img" v-else-if="row.ref.kind === \'sticker\' && row.ref.media" ' +
          'role="button" :title="t(\'Ver con zoom\')" ' +
          '@click="$emit(\'zoom\', { url: mediaUrl(row.ref.media.url, false, true), ' +
            'orig: mediaUrl(row.ref.media.url, true, true), name: row.ref.media.name || \'sticker\', ' +
            'mime: row.ref.media.mime, kind: \'sticker\' })">' +
          '<img class="b-sticker" :src="mediaUrl(row.ref.media.url)" ' +
            ':alt="row.ref.media.name || \'sticker\'" loading="lazy" @load="$emit(\'imgload\')">' +
        '</span>' +
        /* W8: clic en la imagen → vista previa con zoom (lightbox).
           W15: v-dl baja el original con anillo; mientras tanto se ve la
           miniatura del server difuminada (?thumb=1).
           W22: con resolución conocida el marco se reserva (imgbox) y el
           anillo queda dentro del cuadro; sin ella solo la miniatura
           difuminada, sin anillo (data-noring). */
        '<span class="b-media mframe" v-else-if="row.ref.kind === \'image\' && row.ref.media" ' +
          ':class="{ imgbox: imgBox }" :style="imgBox" :data-noring="imgBox ? null : \'1\'" ' +
          'role="button" :title="t(\'Ver con zoom\')" ' +
          '@click="$emit(\'zoom\', { url: mediaUrl(row.ref.media.url), ' +
            'orig: mediaUrl(row.ref.media.url, true), name: row.ref.media.name, ' +
            'mime: row.ref.media.mime, kind: row.ref.kind })">' +
          '<img class="b-img" v-dl="mediaUrl(row.ref.media.url)" :alt="row.ref.media.name || \'\'" @load="$emit(\'imgload\')">' +
        '</span>' +
        /* W11: video adjunto → player inline (W15: baja con anillo y ✕).
           W29a: si el archivo NO tiene pista de video (vidOk=false tras
           el probe de metadatos) cae al reproductor de audio.
           W36c: reproductor PROPIO — controles dentro del video (play
           al centro, hora/barra/fullscreen abajo, ocultos a los 1 s). */
        '<div class="b-video mframe" ref="vWrapEl" v-else-if="row.ref.kind === \'file\' && row.ref.media && isVideo(row.ref.media) && vidOk && !vErr" ' +
          ':class="{ vhide: vHide, vbox: vBox }" :style="vFs ? null : vBox" ' +
          '@mousemove="vPeek" @touchstart="vPeek" @click="vClickCenter">' +
          '<video class="b-vid" ref="vEl" playsinline preload="metadata" ' +
            ':data-mime="row.ref.media.mime" ' +
            'v-dl="mediaUrl(row.ref.media.url)" @loadedmetadata="vMeta" ' +
            '@timeupdate="vTimeUpd" @play="vPlayEv" @pause="vPauseEv" ' +
            '@ended="vEndEv" @error="vErrEv"></video>' +
          '<button class="v-center" type="button" ' +
            ':title="vPlaying ? t(\'Pausar\') : t(\'Reproducir\')" @click.stop="toggleV">' +
            '<svg class="ic"><use :href="vPlaying ? \'#i-pause\' : \'#i-play\'"></use></svg>' +
          '</button>' +
          '<div class="v-bar" @click.stop>' +
            '<button class="v-btn v-fs" type="button" ' +
              ':title="vFs ? t(\'Salir de pantalla completa\') : t(\'Pantalla completa\')" ' +
              '@click.stop="vFull"><svg class="ic ic-sm">' +
              '<use :href="vFs ? \'#i-collapse\' : \'#i-expand\'"></use></svg></button>' +
            /* W37d: al abrir el control de VOLUMEN la hora se desvanece */
            '<transition name="fade">' +
            '<span class="v-time" v-if="!vVolOpen">{{ vCurTxt }} / {{ vDurTxt }}</span>' +
            '</transition>' +
            '<span class="v-seek" @click.stop="vSeekTo"><i :style="{ width: vPct }"></i></span>' +
            /* W43: popup de volumen VERTICAL por ENCIMA del botón (en
               videos angostos el slider horizontal no cabía en la
               barra); mute abajo, slider girado arriba; fade al abrir */
            '<transition name="fade">' +
            '<span class="v-vol" v-if="vVolOpen" @click.stop>' +
              '<span class="v-vol-vt">' +
                '<input class="v-slider" type="range" min="0" max="1" step="0.05" ' +
                  ':value="vVol" aria-label="Volumen" @input="vSetVol">' +
              '</span>' +
              '<button class="v-btn" type="button" ' +
                ':title="vMuted ? t(\'Activar sonido\') : t(\'Silenciar\')" @click.stop="vMute">' +
                '<svg class="ic ic-sm"><use :href="vMuted ? \'#i-mute\' : \'#i-vol\'"></use></svg>' +
              '</button>' +
            '</span>' +
            '</transition>' +
            '<button class="v-btn" type="button" ' +
              ':title="vVolOpen ? t(\'Cerrar volumen\') : t(\'Volumen\')" @click.stop="vToggleVol">' +
              '<svg class="ic ic-sm"><use :href="vMuted ? \'#i-mute\' : \'#i-vol\'"></use></svg>' +
            '</button>' +
          '</div>' +
          /* W36c: hora y palomitas DENTRO del video (abajo a la derecha) */
          '<div class="b-meta v-meta">' +
            '<span class="b-time" v-if="row.showTime && !row.ref.pending">{{ row.time }}</span>' +
            '<svg v-if="row.ref.pending" class="ic tick t-pend"><use href="#i-clock"></use></svg>' +
            '<svg v-else-if="row.mine" class="ic tick" :class="\'t-\' + row.state">' +
              '<use :href="row.state === \'sent\' ? \'#i-check\' : \'#i-check2\'"></use></svg>' +
          '</div>' +
        '</div>' +
        /* W37d: video con error (mime roto o decodificación imposible):
           aviso claro con icono en vez de un rectángulo negro mudo. */
        '<div class="b-video v-err" v-else-if="row.ref.kind === \'file\' && row.ref.media && isVideo(row.ref.media)">' +
          '<svg class="ic"><use href="#i-alert"></use></svg>' +
          '<span>{{ t(\'Este video tiene un error y no se puede reproducir\') }}</span>' +
        '</div>' +
        /* W29a: audio adjunto (mp3/ogg/… o webm sin video). W36c: player
           propio (play/pausa, barra, hora y velocidad); el <audio> queda
           oculto pero en el DOM (tests y descarga lo usan). */
        '<div class="b-afile mframe" v-else-if="row.ref.kind === \'file\' && row.ref.media && (isAudio(row.ref.media) || isVideo(row.ref.media))">' +
          '<audio ref="afEl" class="b-audio" preload="metadata" ' +
            ':data-mime="row.ref.media.mime" ' +
            'v-dl="mediaUrl(row.ref.media.url)" @loadedmetadata="afMeta" ' +
            '@timeupdate="afTimeUpd" @play="afPlayEv" @pause="afPauseEv" ' +
            '@ended="afEndEv" @error="afErrEv"></audio>' +
          '<button class="au-btn" type="button" ' +
            ':title="afPlaying ? t(\'Pausar\') : t(\'Reproducir\')" @click="afToggle">' +
            '<svg class="ic"><use :href="afPlaying ? \'#i-pause\' : \'#i-play\'"></use></svg>' +
          '</button>' +
          '<span class="au-seek" @click="afSeek"><i :style="{ width: afPct }"></i></span>' +
          '<span class="au-time">{{ afCurTxt }} / {{ afDurTxt }}</span>' +
          '<button class="au-rate" type="button" :title="t(\'Velocidad\')" ' +
            '@click="afRate">{{ afRateV }}×</button>' +
        '</div>' +
        /* W15: el archivo ya no es un <a> nativo: la descarga pasa por
           mediadl.js (anillo de progreso, ✕ de cancelar y reintento). */
        '<span v-else-if="row.ref.kind === \'file\' && row.ref.media" class="b-file mframe">' +
          '<svg class="ic ic-sm"><use href="#i-file"></use></svg>' +
          '<span class="bf-col"><span class="bf-name">{{ row.ref.media.name || t(\'archivo\') }}</span>' +
          '<span class="bf-size">{{ fmtSize(row.ref.media.size) }}</span></span>' +
        '</span>' +
        /* W8: reproductor propio (el <audio> queda oculto para los tests).
           W15: el audio se baja con anillo (v-dl) y queda listo para sonar. */
        '<div class="b-player mframe" v-else-if="row.ref.kind === \'voice\' && row.ref.media">' +
          '<audio ref="aEl" class="b-audio" ' +
            ':data-mime="row.ref.media.mime" ' +
            'v-dl="mediaUrl(row.ref.media.url)" ' +
            '@loadedmetadata="aMeta" @durationchange="aDurEv" ' +
            '@timeupdate="aTimeUpd" @play="aPlayEv" ' +
            '@pause="aPauseEv" @ended="aEndEv" @error="aErrEv"></audio>' +
          '<button class="au-btn" type="button" ' +
            ':title="aPlaying ? t(\'Pausar\') : t(\'Reproducir\')" @click="togglePlay">' +
            '<svg class="ic ic-sm"><use :href="aPlaying ? \'#i-pause\' : \'#i-play\'"></use></svg>' +
          '</button>' +
          /* W13: onda con progreso (clic = buscar posición). W63: círculo
             arrastrable para scrubbing. */
          '<span class="wave" @click="seek" @mousedown="waveDown" @touchstart="waveDownTouch">' +
            '<i v-for="(h, i) in wave" :key="i" :class="{ on: i <= aBar }" ' +
              ':style="{ height: h + \'%\', opacity: waveOp(i) }"></i>' +
            '<span class="wave-thumb" :style="{ left: aPct + \'%\' }" @mousedown.stop="waveDown" @touchstart.stop="waveDownTouch"></span>' +
          '</span>' +
          '<span class="au-time">{{ aTime }}</span>' +
          /* W37d: velocidad de la nota de voz (1×/1,5×/2×) */
          '<button class="au-rate" type="button" :title="t(\'Velocidad\')" ' +
            '@click="aRate">{{ aRateV }}×</button>' +
        '</div>' +
        '<div v-else-if="row.ref.kind === \'voice\'" class="b-voice">' +
          '<svg class="ic ic-sm"><use href="#i-mic"></use></svg> {{ t(\'Nota de voz\') }}' +
        '</div>' +
        /* W11: texto bajo imagen/video (caption) y de mensajes de
           texto: UN solo bloque (W29a: eran dos bloques gemelos con
           cadena v-if y el caption salía DUPLICADO en la burbuja). */
        '<div class="b-text" v-if="!editing && row.ref.body">' +
          '<span v-for="(sg, i) in bodySegs" :key="i">' +
            '<b class="mention" :class="{ me: sg.me }" v-if="sg.m">{{ sg.t }}</b>' +
            /* W40: el segmento trae el carácter; el estilo activo
               decide imagen (noto/twemoji) o texto del sistema. */
            '<img v-else-if="emoAnySrc(sg.e)" class="emo" :src="emoAnySrc(sg.e)" ' +
              'alt="" :title="sg.t" loading="lazy">' +
            /* W65: en Noto/Twemoji un emoji sin imagen no cae al glyph
               del sistema (se prefiere el hueco a mezclar estilos). */
            '<span v-else-if="sg.e && !emoNative"></span>' +
            /* W35b: link a imagen → la imagen misma (gif animado) */
            '<a v-else-if="sg.u && imgInline(sg.u)" class="msgimg" ' +
              ':href="sg.u" target="_blank" rel="noopener noreferrer">' +
              '<img class="linkimg" :src="sg.u" alt="" loading="lazy"></a>' +
            /* W35a: cualquier link con protocolo de la lista segura */
            '<a v-else-if="sg.u" class="msglink" :href="sg.u" ' +
              'target="_blank" rel="noopener noreferrer">{{ sg.t }}</a>' +
            '<template v-else>{{ sg.t }}</template>' +
          '</span></div>' +
        /* W35c: tarjetas "portada" bajo el texto del mensaje */
        '<div class="b-cards" v-if="!editing && linkCards.length">' +
          '<a class="linkcard" v-for="lc in linkCards" :key="lc.url" ' +
            ':href="lc.d.url" target="_blank" rel="noopener noreferrer">' +
            '<img v-if="lc.d.image" class="lc-img" :src="lc.d.image" ' +
              'alt="" loading="lazy">' +
            '<div class="lc-meta">' +
              '<img v-if="lc.d.icon" class="lc-fav" :src="lc.d.icon" ' +
                'alt="" loading="lazy">' +
              '<div class="lc-txt">' +
                '<div class="lc-title">{{ lc.d.title || lc.d.site }}</div>' +
                '<div class="lc-desc" v-if="lc.d.desc">{{ lc.d.desc }}</div>' +
                '<div class="lc-site">{{ lc.d.site }}</div>' +
              '</div>' +
            '</div>' +
          '</a>' +
        '</div>' +
        /* W8: edición en línea del mensaje propio */
        '<div class="b-editform" v-if="editing">' +
          '<textarea class="input" ref="editEl" rows="2" maxlength="3000" ' +
            'v-model="store.editDraft" ' +
            '@keydown.esc="cancelEdit" @keydown.ctrl.enter="saveEdit"></textarea>' +
          '<div class="bef-btns">' +
            '<button class="btn btn-ghost btn-sm" type="button" @click="cancelEdit">{{ t(\'Cancelar\') }}</button>' +
            '<button class="btn btn-sm" type="button" :disabled="!store.editDraft.trim()" ' +
              '@click="saveEdit">{{ t(\'Guardar\') }}</button>' +
          '</div>' +
        '</div>' +
        /* W7: la hora va ABAJO del texto (antes flotaba arriba). */
        '<div class="b-meta" v-if="row.showTime || row.ref.pending || row.mine || row.ref.pinned || row.ref.edited_at || (row.ref.spoiler && !spoiled)">' +
          /* W29d/h: revelado → ojo + "Ocultar" para volver a tapar */
          '<button v-if="row.ref.spoiler && !spoiled" class="b-spoil-dot" ' +
            'type="button" :title="t(\'Ocultar\')" ' +
            '@click.stop="spoilHide(row.ref)">' +
            '<svg class="ic ic-sm"><use href="#i-eye"></use></svg>' +
            '<span>{{ t(\'Ocultar\') }}</span>' +
          '</button>' +
          '<svg v-if="row.ref.pinned" class="ic ic-sm b-pin" ' +
            ':title="t(\'Fijado\')"><use href="#i-pin"></use></svg>' +
          '<span class="b-edit" v-if="row.ref.edited_at">{{ t(\'editado\') }}</span>' +
          '<span class="b-time" v-if="row.showTime && !row.ref.pending">{{ row.time }}</span>' +
          '<svg v-if="row.ref.pending" class="ic tick t-pend"><use href="#i-clock"></use></svg>' +
          '<svg v-else-if="row.mine" class="ic tick" :class="\'t-\' + row.state">' +
            '<use :href="row.state === \'sent\' ? \'#i-check\' : \'#i-check2\'"></use></svg>' +
        '</div>' +
        '<div class="b-reacts" v-if="row.ref.reactions && row.ref.reactions.length">' +
          '<button class="react-chip" type="button" ' +
            ':class="{ mine: myReaction(row.ref) === rr.emoji }" ' +
            'v-for="(rr, i) in groupReactions(row.ref)" :key="i" ' +
            '@click="doReact(row, rr.emoji)" :title="reactTitle(row.ref, rr.emoji)">' +
            '<img v-if="emoAnySrc(rr.emoji)" class="emo" :src="emoAnySrc(rr.emoji)" ' +
              'alt="" loading="lazy">' +
            '<span v-else-if="emoNative">{{ rr.emoji }}</span>' +
            '<i>{{ rr.count > 1 ? rr.count : \'\' }}</i>' +
          '</button>' +
        '</div>' +
      '</div>' +
      /* W66: avatar del remitente a la derecha de la burbuja para los
         mensajes propios (la flechita apunta hacia él). Solo cuando hay
         hora (no en mensajes continuos del mismo remitente sin hora). */
      '<span class="msg-av" v-if="row.avCol && row.mine && row.showTime" :class="{ \'is-av\': row.avatar, \'has-photo\': !!(row.avatar && row.avatar.url) }" ' +
        ':title="row.avatar ? row.avatar.name : \'\'">' +
        '<img v-if="row.avatar && row.avatar.url && !avErr" :src="mediaUrl(row.avatar.url)" alt="" loading="lazy" decoding="async" crossorigin="anonymous" @error="onAvatarError()">' +
        '<i v-else-if="row.avatar">{{ row.avatar.ini }}</i>' +
      '</span>' +
    '</div>',
};

/* ------------------------------------------------------- RenameGroupModal (W57) */

const RenameGroupModal = {
  setup: function () {
    const title = Vue.ref(store.renameGroupTitle || '');
    const busy = Vue.ref(false);
    const err = Vue.ref('');
    const inputEl = Vue.ref(null);
    Vue.onMounted(function () {
      Vue.nextTick(function () { if (inputEl.value) inputEl.value.focus(); });
    });
    const close = function () {
      if (busy.value) return;
      store.renameGroupId = 0;
      store.renameGroupTitle = '';
    };
    const save = async function () {
      const id = store.renameGroupId;
      const name = title.value.trim();
      if (!id || !name) { err.value = t('Escribe un nombre para el grupo'); return; }
      busy.value = true;
      err.value = '';
      try {
        await api('PATCH', '/chats/' + id, { title: name });
        store.renameGroupId = 0;
        store.renameGroupTitle = '';
        toast(t('Nombre del grupo actualizado'), 'ok');
        await loadChats();
      } catch (e) {
        err.value = (e && t(e.detail)) || t('No se pudo cambiar el nombre');
      } finally {
        busy.value = false;
      }
    };
    return { store, title, busy, err, inputEl, close, save };
  },
  template: `
    <div class="modal-veil" @click.self="close">
      <div class="modal confirm" role="dialog" :aria-label="t('Renombrar grupo')">
        <header>{{ t('Renombrar grupo') }}</header>
        <div class="cf-body">
          <p class="cf-text">{{ t('El nuevo nombre lo verán todos los miembros.') }}</p>
          <div class="field">
            <label>{{ t('Nombre del grupo') }}</label>
            <input class="input group-rename-input" ref="inputEl" v-model="title"
              maxlength="60" :placeholder="t('Nombre del grupo (máx. 60)')"
              @keydown.enter.prevent="save">
          </div>
          <div class="form-err st-err" v-if="err" role="alert">
            <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ err }}</span>
          </div>
        </div>
        <div class="m-foot st-btns">
          <button class="btn btn-ghost" type="button" :disabled="busy" @click="close">
            {{ t('Cancelar') }}</button>
          <button class="btn" type="button" :disabled="busy || !title.trim()" @click="save">
            {{ busy ? t('Guardando…') : t('Guardar') }}</button>
        </div>
      </div>
    </div>`,
};

/* ------------------------------------------------------- NewChatModal */

const NewChatModal = {
  setup: function () {
    const q = Vue.ref('');
    const results = Vue.ref([]);
    const inputEl = Vue.ref(null);
    const gtitle = Vue.ref('');
    const picked = Vue.ref([]);   // modo group: [{id, username, display_name, avatar_url}]
    let timer = null;

    Vue.onMounted(function () {
      // inputEl es un ref: el foco se le pide al .value (antes fallaba
      // con TypeError y el autofocus nunca funcionaba).
      if (inputEl.value) inputEl.value.focus();
      // Para decidir «Mensaje» vs «Enviar solicitud» hacen falta las
      // amistades; si el panel Personas aún no cargó, se piden ahora.
      if (!store.people) loadPeople().catch(function () {});
    });

    const title = Vue.computed(function () {
      if (store.newChatMode === 'group') return t('Nuevo grupo');
      if (store.newChatMode === 'add') return t('Agregar al grupo');
      return t('Nuevo chat');
    });

    const onQuery = function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 300);
    };

    const run = async function () {
      if (q.value.trim().length < 2) { results.value = []; return; }
      try {
        results.value = await searchUsers(q.value);
      } catch (e) { results.value = []; }
    };

    const isFriend = function (u) {
      const fs = (store.people && store.people.friends) || [];
      for (let i = 0; i < fs.length; i++) if (fs[i].id === u.id) return true;
      return false;
    };
    const sentTo = function (u) {
      const rs = (store.people && store.people.sent) || [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user && rs[i].user.id === u.id) return true;
      }
      return false;
    };
    const receivedFrom = function (u) {
      const rs = (store.people && store.people.received) || [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user && rs[i].user.id === u.id) return rs[i];
      }
      return null;
    };

    /* dm: crear chat (solo amigos); group: sumar a la selección;
       add: agregar al grupo. */
    const pick = async function (u) {
      const mode = store.newChatMode;
      if (mode === 'group') {
        let found = -1;
        for (let i = 0; i < picked.value.length; i++) {
          if (picked.value[i].id === u.id) found = i;
        }
        if (found >= 0) picked.value.splice(found, 1);
        else picked.value.push(u);
        q.value = '';
        results.value = [];
        if (inputEl.value) inputEl.value.focus();
        return;
      }
      if (mode === 'add') {
        try {
          await addMember(store.activeChatId, u.username);
          close();
        } catch (e) {
          toastErr(e, 'No se pudo agregar');
        }
        return;
      }
      /* Regla del producto: sin solicitud aceptada no se abre un MD.
         Si aún no son amigos, este click envía la solicitud. */
      if (!isFriend(u)) {
        if (sentTo(u)) {
          toast(t('Ya enviaste una solicitud a @{n}', { n: u.username }), 'info');
          return;
        }
        const incoming = receivedFrom(u);
        if (incoming) {
          try {
            await acceptFriendRequest(incoming.id);
            toast('Solicitud aceptada', 'ok');
            q.value = '';
            results.value = [];
          } catch (e) {
              toastErr(e, 'No se pudo aceptar la solicitud');
          }
          return;
        }
        try {
          await sendFriendRequest(u.username);
          q.value = '';
          results.value = [];
          /* W65: el flujo ＋ usa el mismo modal que un enlace directo. */
          close();
          store.requestSent = {
            username: u.username,
            display_name: u.display_name || u.username,
          };
        } catch (e) {
          toastErr(e, 'No se pudo enviar la solicitud');
        }
        return;
      }
      try {
        await createDm(u.username);
      } catch (e) {
        toastErr(e, 'No se pudo crear el chat');
      }
    };

    const unpick = function (u) {
      for (let i = 0; i < picked.value.length; i++) {
        if (picked.value[i].id === u.id) { picked.value.splice(i, 1); return; }
      }
    };

    const isSelected = function (u) {
      for (let i = 0; i < picked.value.length; i++) {
        if (picked.value[i].id === u.id) return true;
      }
      return false;
    };

    const createTheGroup = async function () {
      const gname = gtitle.value.trim();
      if (!gname) { toast('Escribe un nombre para el grupo', 'err'); return; }
      try {
        const names = picked.value.map(function (u) { return u.username; });
        await createGroup(gname, names);
      } catch (e) {
        toastErr(e, 'No se pudo crear el grupo');
      }
    };

    const pickFirst = function () {
      if (results.value.length) pick(results.value[0]);
    };

    const close = function () { store.newChatOpen = false; };

    return {
      store, title, q, results, inputEl, gtitle, picked,
      onQuery, pick, pickFirst, unpick, isSelected, isFriend, sentTo,
      receivedFrom,
      createTheGroup, close, mediaUrl,
    };
  },
  template:
    '<div class="modal-veil" @click.self="close">' +
      '<div class="modal" role="dialog" :aria-label="title">' +
        '<header>{{ title }}' +
          '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="close">' +
            '<svg class="ic"><use href="#i-x"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="m-tabs" v-if="store.newChatMode !== \'add\'">' +
          '<button class="m-tab" type="button" :class="{ on: store.newChatMode === \'dm\' }" ' +
            '@click="store.newChatMode = \'dm\'">{{ t(\'Chat\') }}</button>' +
          '<button class="m-tab" type="button" :class="{ on: store.newChatMode === \'group\' }" ' +
            '@click="store.newChatMode = \'group\'">{{ t(\'Grupo\') }}</button>' +
        '</div>' +
        '<div class="m-title" v-if="store.newChatMode === \'group\'">' +
          '<input v-model="gtitle" :placeholder="t(\'Nombre del grupo (máx. 60)\')" maxlength="60">' +
        '</div>' +
        '<div class="g-chips" v-if="store.newChatMode === \'group\' && picked.length">' +
          '<span class="g-chip" v-for="u in picked" :key="u.id">' +
            '{{ u.display_name || u.username }}' +
            '<button type="button" :title="t(\'Quitar\')" @click="unpick(u)">' +
              '<svg class="ic ic-xs"><use href="#i-x"></use></svg>' +
            '</button>' +
          '</span>' +
        '</div>' +
        '<div class="m-search">' +
          '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
          '<input ref="inputEl" v-model="q" :placeholder="t(\'Buscar por nombre o usuario…\')" ' +
            '@input="onQuery" @keydown.enter.prevent="pickFirst">' +
          '<button class="clr-x" :class="{ show: !!q }" type="button" ' +
            ':title="t(\'Borrar\')" @click="q = \'\'; onQuery()">' +
            '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
        '</div>' +
        '<div class="results">' +
          '<button class="res-item" type="button" v-for="u in results" :key="u.id" @click="pick(u)">' +
            '<span class="avatar av36" :class="{ \'has-photo\': !!u.avatar_url }">' +
              '<img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">' +
              '<span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>' +
            '</span>' +
            '<span class="ri-col"><span class="ri-name">{{ u.display_name }}</span>' +
            '<span class="ri-user">@{{ u.username }}' +
              '<span v-if="store.newChatMode === \'dm\' && !isFriend(u)"> · ' +
                '{{ sentTo(u) ? t(\'Solicitud pendiente\') : receivedFrom(u) ? t(\'Aceptar solicitud\') : t(\'Enviar solicitud\') }}</span>' +
            '</span></span>' +
            '<svg class="ic ic-sm ri-check" v-if="store.newChatMode === \'group\' && isSelected(u)">' +
              '<use href="#i-check"></use></svg>' +
            '<svg class="ic ic-sm ri-check" v-else-if="store.newChatMode === \'dm\' && !isFriend(u)">' +
              '<use href="#i-userplus"></use></svg>' +
          '</button>' +
          '<div class="res-empty" v-if="q.trim().length >= 2 && !results.length">{{ t(\'Sin resultados\') }}</div>' +
          '<div class="res-empty dim" v-else-if="q.trim().length < 2">{{ t(\'Escribe al menos 2 letras\') }}</div>' +
        '</div>' +
        '<div class="m-foot" v-if="store.newChatMode === \'group\'">' +
          '<button class="btn" type="button" :disabled="!gtitle.trim()" @click="createTheGroup">' +
            '{{ t(\'Crear grupo\') }}</button>' +
        '</div>' +
      '</div>' +
    '</div>',
};

/* ------------------------------------------- W6: ajustes, perfil, avisos */

/* Confirmación antes de cerrar sesión: al confirmar, clearSession() deja
   la pantalla principal sin rastro de la cuenta. */
function askLogout() {
  store.confirmBox = {
    title: 'Cerrar sesión',
    text: 'Vas a salir de Foxinix en este dispositivo.\nSe limpia todo lo local: la sesión, los chats en memoria y los borradores. Puedes volver a entrar cuando quieras.',
    danger: false,
    okLabel: 'Cerrar sesión',
    onOk: async function () {
      logout();
    },
  };
}

/* Borrado definitivo: exige usuario + contraseña (advertencia explícita). */
function askDeleteAccount() {
  store.confirmBox = {
    title: 'Eliminar cuenta',
    text: 'Esta acción es PERMANENTE y no se puede deshacer:\n• Se borra tu cuenta, tu perfil y tu correo.\n• Se borran tus mensajes y tus archivos (fotos, notas de voz).\n• Tus MD se eliminan por completo; en los grupos queda un aviso de que tu cuenta fue eliminada.\n\nEscribe tu usuario y contraseña para confirmar.',
    danger: true,
    requireUser: true,
    requirePassword: true,
    okLabel: 'Eliminar mi cuenta',
    onOk: async function (creds) {
      await api('DELETE', '/auth/account', {
        password: creds.password,
        username: creds.username,
      }, { retry401: true });
      logout();
    },
  };
}

/* ------------------------------------------------------- SettingsModal */

const SettingsModal = {
  setup: function () {
    /* Acentos/fondos: viven en el dispositivo, no en la cuenta (W4). */
    const accents = ['#ff751f', '#1f9dfa', '#7c6cf0', '#e64980', '#f59f00', '#e8590c', '#2f9e44'];
    const walls = [
      { val: '', name: 'Auto' },
      { val: '#0d1614', name: 'Petróleo' },
      { val: '#15121c', name: 'Uva' },
      { val: '#171310', name: 'Madera' },
      { val: '#e9e3d8', name: 'Papel' },
      { val: '#dfe9e7', name: 'Menta' },
    ];
    /* W65: las tres apariencias se eligen por muestra de color; sin
       botones con el nombre. `dark` mantiene su valor histórico (ahora
       se llama "Intermedio") para no romper preferencias guardadas. */
    const themes = [
      { val: 'light', name: 'Claro', bg: '#e3e5e8', panel: '#f2f3f5', snap: '#ffffff' },
      { val: 'dark', name: 'Intermedio', bg: '#1e1f22', panel: '#2b2d31', snap: '#383a40' },
      { val: 'black', name: 'Oscuro puro', bg: '#000000', panel: '#0b0b0b', snap: '#202020' },
    ];
    /* W8: "Cuenta" queda como ÚLTIMA pestaña: ahí se administra la cuenta
       (correo, contraseña, sesión y baja) y así el cierre de sesión no queda
       a la vista. W9: `group` abre un rótulo de sección en la nav lateral.
       W10: "Ajustes de la aplicación" pasa a llamarse "Preferencias".
       W60: en móvil la primera pantalla es una LISTA de categorías; cada
       una abre su subpantalla con botón atrás. En escritorio se mantiene
       la nav lateral de siempre. */
    const tabs = [
      { val: 'apariencia', name: 'Apariencia', group: 'Preferencias', icon: 'i-palette',
        desc: 'Tema, color, fondo y tamaño de letra' },
      { val: 'notificaciones', name: 'Notificaciones', group: 'Preferencias', icon: 'i-bell',
        desc: 'Avisos, sonidos y tonos' },
      { val: 'chat', name: 'Chat', group: 'Preferencias', icon: 'i-chat',
        desc: 'Mensajes, micrófono y permisos' },
      { val: 'privacidad', name: 'Privacidad', group: 'Preferencias', icon: 'i-shield',
        desc: 'Bloqueo con contraseña de Archivados' },
      { val: 'descargas', name: 'Descargas', group: 'Preferencias', icon: 'i-download',
        desc: 'Descargas automáticas y archivos guardados' },
      { val: 'atajos', name: 'Atajos', group: 'Preferencias', icon: 'i-key',
        desc: 'Atajos de teclado' },
      { val: 'accessibility', name: 'Accesibilidad', group: 'Preferencias',
        icon: 'i-a11y', desc: 'Animaciones y estímulos visuales' },
      { val: 'cuenta', name: 'Cuenta', group: 'Cuenta', icon: 'i-user',
        desc: 'Correo, contraseña y sesión' },
    ];

    const settingsMobile = Vue.ref(window.innerWidth <= 760);
    /* W65: la portada móvil y la categoría activa viven en el store
       porque ahora también forman parte de la URL (?settings=main,
       ?settings=appearance…). Así el botón atrás y los enlaces directos
       quedan sincronizados sin un ref local duplicado. */
    const settingsHome = Vue.computed(function () {
      return settingsMobile.value && !!store.settingsAtHome;
    });
    const currentTabName = Vue.computed(function () {
      const tab = store.settingsTab;
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].val === tab) return t(tabs[i].name);
      }
      return t('Ajustes');
    });
    const setSettingsHome = function (v) {
      store.settingsAtHome = !!(v && settingsMobile.value);
    };
    const onSettingsResize = function () {
      settingsMobile.value = window.innerWidth <= 760;
      if (!settingsMobile.value) store.settingsAtHome = false;
    };
    window.addEventListener('resize', onSettingsResize);
    Vue.onUnmounted(function () {
      window.removeEventListener('resize', onSettingsResize);
      store.settingsAtHome = false;
    });

    const close = function () {
      stopPreview();
      store.settingsOpen = false;
      /* W66f: abrir Ajustes desde Archivados dejó la lista detrás (para
         no parpadear); al cerrar se vuelve a Chats como siempre. */
      store.showArchived = false;
    };
    const setTab = function (tv) { stopPreview(); store.settingsTab = tv; };
    const openCat = function (tv) {
      stopPreview();
      /* Sin categoría → portada de ajustes (?settings=main en móvil) */
      if (!tv) { setSettingsHome(true); return; }
      setTab(tv);
      setSettingsHome(false);
    };
    const goSettingsHome = function () { setSettingsHome(true); };
    const pickTheme = function (m) { setTheme(m); };
    const pickAccent = function (c) { setAccent(c); };
    const pickWall = function (v) { setWall(v); };
    /* W20: la foto de fondo y sus ajustes (opacidad, difuminado) viven
       en el panel dedicado, que se abre donde está la lista de chats. */
    const openWallPanel = function () {
      store.settingsOpen = false;
      store.showArchived = false;   /* W66f: el panel se abre sobre Chats */
      store.wallPanelOpen = true;
    };
    /* W20: micrófono — dispositivo preferido + prueba de nivel */
    const micDev = Vue.ref(store.micDev);
    const micDevices = Vue.ref([]);
    const micTesting = Vue.ref(false);
    const micLevel = Vue.ref(0);
    let testStream = null;
    let testTimer = 0;
    let testCtx = null;
    const loadMics = async function () {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        micDevices.value = list.filter(function (d) { return d.kind === 'audioinput'; });
      } catch (e) {}
    };
    Vue.onMounted(loadMics);
    /* Con el permiso concedido aparecen las etiquetas reales: recargar. */
    const pickMic = function () { setMicDev(micDev.value); loadMics(); };
    const stopMicTest = function () {
      if (testTimer) { clearInterval(testTimer); testTimer = 0; }
      if (testStream) {
        testStream.getTracks().forEach(function (tr) { tr.stop(); });
        testStream = null;
      }
      if (testCtx) { try { testCtx.close(); } catch (e) {} testCtx = null; }
      micTesting.value = false;
      micLevel.value = 0;
    };
    const testMic = async function () {
      if (micTesting.value) { stopMicTest(); return; }
      if (!(await ensurePermission('mic'))) {
        toast(t('Permiso de micrófono necesario para probar el micrófono'), 'err');
        return;
      }
      try {
        testStream = await navigator.mediaDevices.getUserMedia({
          audio: store.micDev ? { deviceId: { exact: store.micDev } } : true,
        });
      } catch (e) {
        /* W20: si el dispositivo guardado ya no existe, con el del sistema */
        if (store.micDev) {
          try { testStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
          catch (e2) { testStream = null; }
        }
      }
      if (!testStream) {
        toast(window.isSecureContext === false
          ? 'El micrófono necesita HTTPS (o abrir Foxinix en localhost)'
          : 'No se pudo acceder al micrófono', 'err');
        return;
      }
      loadMics();                     /* con permiso aparecen las etiquetas */
      micTesting.value = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        testCtx = new AC();
        const aSrc = testCtx.createMediaStreamSource(testStream);
        const an = testCtx.createAnalyser();
        an.fftSize = 512;
        aSrc.connect(an);
        const buf = new Uint8Array(an.fftSize);
        testTimer = setInterval(function () {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          micLevel.value = Math.min(100, Math.round(peak * 160));
        }, 120);
      } catch (e) { micLevel.value = 0; }
    };
    Vue.onUnmounted(stopMicTest);
    const pickFont = function (v) { setFont(v); };
    /* W10: idioma de la interfaz (es | en), por dispositivo. */
    const pickLang = function (v) { setLang(v); };
    const langs = LANGS;
    const toggle = function (key) { setPref(key, !store.prefs[key]); };
    /* W29e: "Formato de hora" como menú desplegable 12/24 h (antes
       era un interruptor); store.prefs.h12 sigue marcando 12 h. */
    const setH12 = function (e) { setPref('h12', e.target.value === '12'); };
    /* W40: estilo de emojis — system (fuente del SO), noto (imágenes
       de Google) o twemoji (imágenes Twemoji del sitio). */
    const setEmo = function (e) { setPrefStr('emo', e.target.value); };

    /* ---------- W63: tonos de mensaje y llamada ---------- */
    /* Los tonos personalizados se reflejan en refs para que el <select>
       se actualice en el acto al subir uno (localStorage no es reactivo). */
    const customMsgTone = Vue.ref(customTone('message'));
    const customCallTone = Vue.ref(customTone('call'));
    const saveCustomTone = function (kind, dataUrl, fileName) {
      const obj = {
        id: 'custom-' + kind,
        name: fileName || (kind === 'call' ? t('Tono de llamada') : t('Tono de mensaje')),
        file: dataUrl,
      };
      try { localStorage.setItem('fm.p.customTone.' + kind, JSON.stringify(obj)); } catch (e) {}
      if (kind === 'call') customCallTone.value = obj;
      else customMsgTone.value = obj;
    };
    const messageTones = Vue.computed(function () {
      const list = MESSAGE_TONES.slice();
      if (customMsgTone.value) list.push(customMsgTone.value);
      return list;
    });
    const callTones = Vue.computed(function () {
      const list = CALL_TONES.slice();
      if (customCallTone.value) list.push(customCallTone.value);
      return list;
    });
    const messageTone = Vue.computed({
      get: function () { return store.prefs.messageTone; },
      set: function (v) { setPrefStr('messageTone', v); },
    });
    const callTone = Vue.computed({
      get: function () { return store.prefs.callTone; },
      set: function (v) { setPrefStr('callTone', v); },
    });
    let previewAudio = null;
    let previewTimer = null;
    const previewingId = Vue.ref(null);   // id del tono reproduciéndose
    const previewingKind = Vue.ref(null); // 'message' | 'call' — evita que ambos botones cambien con el mismo id
    const msgToneInput = Vue.ref(null);
    const callToneInput = Vue.ref(null);
    const stopPreview = function () {
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
      if (previewAudio) { try { previewAudio.pause(); previewAudio.src = ''; } catch (e) {} previewAudio = null; }
      previewingId.value = null;
      previewingKind.value = null;
    };
    /* Tono "predeterminado": pitido generado con Web Audio (no depende de archivos). */
    const playBeep = function () {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
      ctx.close().catch(function () {});
    };
    const previewTone = function (id, kind) {
      /* Si ya se reproduce este tono, detener */
      if (previewingId.value === id && previewingKind.value === kind) { stopPreview(); return; }
      stopPreview();
      const tone = (kind === 'call' ? callTones.value : messageTones.value).find(function (t) { return t.id === id; });
      if (!tone) return;
      previewingId.value = id;
      previewingKind.value = kind;
      if (!tone.file) { playBeep(); previewingId.value = null; previewingKind.value = null; return; }
      previewAudio = new Audio(toneSrc(tone.file));
      previewAudio.play().catch(function () {});
      previewAudio.onended = function () { previewingId.value = null; previewingKind.value = null; };
      /* Sin límite de tiempo: el tono suena hasta terminar */
    };
    const pickMessageTone = function (e) {
      const id = e && e.target ? e.target.value : messageTone.value;
      messageTone.value = id;
      /* No auto-previsualizar: el usuario usa el botón */
    };
    const pickCallTone = function (e) {
      const id = e && e.target ? e.target.value : callTone.value;
      callTone.value = id;
      /* No auto-previsualizar: el usuario usa el botón */
    };
    /* En el APK, target="_blank" no abre el navegador: usamos el puente
       nativo. En web/escritorio se deja el comportamiento normal (nueva
       pestaña). */
    const openToneNote = function (e) {
      const bridge = window.FoxinixAndroid;
      if (bridge && typeof bridge.openUrl === 'function') {
        if (e) e.preventDefault();
        try { bridge.openUrl('https://tonosdellamada.es'); } catch (err) {}
      }
    };
    const readFileDataUrl = function (file) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    };
    /* Valida duración y tamaño del archivo de audio */
    const validateAudio = function (file, maxSec, maxKB) {
      return new Promise(function (resolve, reject) {
        if (file.size > maxKB * 1024) {
          reject(new Error(t('El archivo supera {n} KB', { n: maxKB })));
          return;
        }
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        audio.onloadedmetadata = function () {
          URL.revokeObjectURL(url);
          if (audio.duration > maxSec) {
            reject(new Error(t('La duración máxima es {n} segundos', { n: maxSec })));
          } else {
            resolve();
          }
        };
        audio.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('Archivo de audio no valido'));
        };
        audio.src = url;
      });
    };
    const uploadMessageTone = async function (e) {
      const file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await validateAudio(file, 5, 200);
        const data = await readFileDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, '');
        saveCustomTone('message', data, name);
        messageTone.value = 'custom-message';
        toast(t('Tono de mensaje guardado'));
      } catch (err) {
        toast(err.message || t('No se pudo subir el tono'), 'err');
      }
      e.target.value = '';
    };
    const uploadCallTone = async function (e) {
      const file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await validateAudio(file, 120, 1024);
        const data = await readFileDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, '');
        saveCustomTone('call', data, name);
        callTone.value = 'custom-call';
        toast(t('Tono de llamada guardado'));
      } catch (err) {
        toast(err.message || t('No se pudo subir el tono'), 'err');
      }
      e.target.value = '';
    };

    /* ---- cambiar contraseña ---- */
    const pwCur = Vue.ref('');
    const pwNew = Vue.ref('');
    const pwRep = Vue.ref('');
    const pwErr = Vue.ref('');
    const pwBusy = Vue.ref(false);
    const pwReady = Vue.computed(function () {
      return !!pwCur.value && pwNew.value.length >= 8 && pwNew.value === pwRep.value;
    });

    const changePw = async function () {
      pwErr.value = '';
      if (pwNew.value.length < 8) {
        pwErr.value = 'La contraseña nueva necesita 8 caracteres o más';
        return;
      }
      if (pwNew.value !== pwRep.value) {
        pwErr.value = 'Las contraseñas nuevas no coinciden';
        return;
      }
      pwBusy.value = true;
      try {
        const r = await api('POST', '/auth/password', {
          current_password: pwCur.value,
          new_password: pwNew.value,
        }, { retry401: true });
        // token_version subió: el servidor manda tokens frescos para esta sesión
        if (r.tokens) {
          session.access = r.tokens.access;
          session.refresh = r.tokens.refresh;
        }
        if (r.user) {
          session.user = r.user;
          store.user = r.user;
        }
        saveSession();
        pwCur.value = '';
        pwNew.value = '';
        pwRep.value = '';
        store.pwOpen = false;              // W8: cerrar la ventana al terminar
      } catch (e) {
        pwErr.value = (e && t(e.detail)) || t('No se pudo cambiar la contraseña');
      } finally {
        pwBusy.value = false;
      }
    };

    /* ---- cambiar correo (código al correo nuevo) ---- */
    const emNew = Vue.ref('');
    const emCode = Vue.ref('');
    const emMask = Vue.ref('');
    const emStep = Vue.ref(0);   // 0: escribir correo | 1: ingresar código
    const emErr = Vue.ref('');
    const emBusy = Vue.ref(false);

    const sendEmCode = async function () {
      emErr.value = '';
      if (!emNew.value.trim()) return;
      emBusy.value = true;
      try {
        const r = await api('POST', '/auth/email/change',
          { email: emNew.value.trim() }, { retry401: true });
        emMask.value = r.email_masked || emNew.value.trim();
        emStep.value = 1;
        emCode.value = '';
      } catch (e) {
        emErr.value = (e && t(e.detail)) || t('No se pudo enviar el código');
      } finally {
        emBusy.value = false;
      }
    };

    const confirmEmCode = async function () {
      emErr.value = '';
      if (emCode.value.length !== 6) {
        emErr.value = 'El código tiene 6 dígitos';
        return;
      }
      emBusy.value = true;
      try {
        const r = await api('POST', '/auth/email/change/verify',
          { code: emCode.value }, { retry401: true });
        if (r.user) {
          session.user = r.user;
          store.user = r.user;
          saveSession();
        }
        emStep.value = 0;
        emNew.value = '';
        emCode.value = '';
        store.emOpen = false;              // W8: cerrar la ventana al terminar
      } catch (e) {
        emErr.value = (e && t(e.detail)) || t('Código incorrecto');
      } finally {
        emBusy.value = false;
      }
    };

    const cancelEmCode = function () {
      emStep.value = 0;
      emCode.value = '';
      emErr.value = '';
    };

    /* ---- notificaciones (navegador o APK Android) ---- */
    const nativeNotif = (function () {
      try {
        const a = window.FoxinixAndroid;
        return a && typeof a.notify === 'function' ? a : null;
      } catch (e) { return null; }
    })();
    const nativeNotifAvail = !!nativeNotif;
    const nativeNotifPerm = function () {
      if (!nativeNotif) return 'unsupported';
      try { return nativeNotif.permission() || 'prompt'; } catch (e) { return 'prompt'; }
    };
    const notifOn = nativeNotifAvail || typeof Notification !== 'undefined';
    const notifPerm = Vue.ref(nativeNotifAvail
      ? nativeNotifPerm()
      : (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
    const notifTitle = Vue.computed(function () {
      return nativeNotifAvail
        ? t('Notificaciones de Android')
        : t('Notificaciones del navegador');
    });
    const notifLabel = Vue.computed(function () {
      if (!notifOn) return t('Este navegador no las soporta');
      if (notifPerm.value === 'granted') {
        return nativeNotifAvail
          ? t('Activas: avisan con la app en segundo plano')
          : t('Activas: avisan con la pestaña oculta');
      }
      if (notifPerm.value === 'denied') {
        return nativeNotifAvail
          ? t('Bloqueadas: actívalas en Ajustes de Android')
          : t('Bloqueadas: actívalas en el navegador');
      }
      return nativeNotifAvail
        ? t('Android te va a pedir permiso')
        : t('El navegador te va a pedir permiso');
    });
    const refreshNotif = function () {
      permissionState('notif').then(function (st) {
        notifPerm.value = st === 'unavailable' ? 'unsupported' : st;
      }).catch(function () {
        if (nativeNotif) notifPerm.value = nativeNotifPerm();
      });
    };
    const openNotifSettings = function () {
      if (!nativeNotif) return;
      try { nativeNotif.openSettings(); } catch (e) {}
    };
    const askNotif = async function () {
      if (!notifOn) return;
      await ensurePermission('notif');
      refreshNotif();
      refreshPermissionStates();
    };
    Vue.onMounted(function () {
      window.addEventListener('focus', refreshNotif);
      document.addEventListener('visibilitychange', refreshNotif);
    });
    Vue.onUnmounted(function () {
      window.removeEventListener('focus', refreshNotif);
      document.removeEventListener('visibilitychange', refreshNotif);
    });

    /* ---- W50/W58: descargas persistentes (Cache Storage + IndexedDB) ---- */
    const dlList = Vue.ref([]);
    const dlTotal = Vue.ref(0);
    const dlBusy = Vue.ref(false);
    const dlMsg = Vue.ref('');
    const dlSaving = Vue.ref('');
    const dlOpen = Vue.reactive({});
    const dlLoad = function () {
      dlBusy.value = true;
      dlMsg.value = '';
      listDownloads().then(function (list) {
        dlList.value = list;
        let total = 0;
        let first = '';
        for (let i = 0; i < list.length; i++) {
          total += list[i].size || 0;
          if (!first) first = list[i].kind || 'file';
        }
        dlTotal.value = total;
        if (first && !Object.keys(dlOpen).length) dlOpen[first] = true;
      }).catch(function () {
        dlMsg.value = t('No se pudieron cargar las descargas');
      }).then(function () { dlBusy.value = false; });
    };
    /* W58: agrupadas por categoría, con cantidad y tamaño total. */
    const dlGroups = Vue.computed(function () {
      const out = [];
      for (let t = 0; t < DL_TYPES.length; t++) {
        const tp = DL_TYPES[t];
        const items = dlList.value.filter(function (d) {
          return (d.kind || 'file') === tp.id;
        });
        if (!items.length) continue;
        let size = 0;
        for (let i = 0; i < items.length; i++) size += items[i].size || 0;
        out.push({
          id: tp.id, label: tp.label, count: items.length, size: size, items: items,
          icon: tp.id === 'image' ? 'i-image' : (tp.id === 'audio' ? 'i-vol' :
            (tp.id === 'video' ? 'i-video' : 'i-file')),
        });
      }
      return out;
    });
    const dlToggle = function (id) { dlOpen[id] = !dlOpen[id]; };
    /* W60: las categorías ya no se expanden dentro de Ajustes (se veía
       desordenado): cada una abre su propio modal con la lista. */
    const dlCat = Vue.ref('');
    const dlCatGroup = Vue.computed(function () {
      if (!dlCat.value) return null;
      for (let i = 0; i < dlGroups.value.length; i++) {
        if (dlGroups.value[i].id === dlCat.value) return dlGroups.value[i];
      }
      return null;
    });
    const dlOpenCat = function (id) { dlCat.value = id; };
    const dlCloseCat = function () { dlCat.value = ''; };
    const dlSave = async function (item) {
      dlMsg.value = '';
      dlSaving.value = item.key;
      try {
        const r = await saveDownloadToDevice(item.key, item.name, item.mime);
        if (r && r.ok) {
          toast(r.native ? t('Guardado en Descargas/Foxinix') :
            t('Guardado en el dispositivo'), 'ok');
        } else if (r && r.permission) {
          dlMsg.value = t('Permiso de almacenamiento necesario para guardar en el dispositivo');
        } else {
          dlMsg.value = t('El archivo ya no está disponible');
          dlLoad();
        }
      } catch (e) {
        dlMsg.value = t('El archivo ya no está disponible');
      } finally {
        dlSaving.value = '';
      }
    };
    /* W58: abrir una descarga guardada desde los datos de la app. El
       blob local no pasa por la red; si el navegador bloquea la pestaña
       nueva se avisa sin abrir nada raro. */
    const dlOpenFile = async function (item) {
      const ok = await openAppDownload(item.key);
      if (!ok) {
        dlMsg.value = t('El archivo ya no está disponible');
        dlLoad();
      }
    };
    const dlDelete = function (item) {
      if (!window.confirm(t('¿Eliminar esta descarga guardada?'))) return;
      deleteDownload(item.key).then(dlLoad);
    };
    const dlClear = function () {
      if (!window.confirm(t('¿Eliminar todas las descargas guardadas?'))) return;
      clearDownloads().then(dlLoad);
    };
    const dlDate = function (item) {
      if (!item || !item.saved_at) return '';
      try {
        return new Date(item.saved_at).toLocaleDateString(store.lang === 'en' ? 'en' : 'es');
      } catch (e) { return ''; }
    };
    /* W58: la descarga automática ya no es exclusiva del APK: se guarda
       en los datos de la app también en web/PWA/escritorio. */
    const dlAuto = Vue.ref(autoDlPrefs());
    const dlAutoSet = function (type, network, ev) {
      setAutoDl(type, network, !!(ev && ev.target && ev.target.checked));
      dlAuto.value = autoDlPrefs();
      store.dlAutoRev++;
    };
    /* W60: bloqueo de Archivados — activar, cambiar y quitar. La
       contraseña actual solo se pide para cambiar o quitar; nunca se
       guarda en claro. */
    const archivePw = Vue.ref('');
    const archiveNew = Vue.ref('');
    const archiveNew2 = Vue.ref('');
    const archiveChange = Vue.ref(false);
    const archiveBusy = Vue.ref(false);
    const archiveErr = Vue.ref('');
    const archiveOk = Vue.ref('');
    const archiveReset = function () {
      archivePw.value = '';
      archiveNew.value = '';
      archiveNew2.value = '';
      archiveChange.value = false;
    };
    const archiveActivate = async function () {
      archiveErr.value = '';
      archiveOk.value = '';
      if (archiveNew.value.length < 4) {
        archiveErr.value = t('La contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (archiveNew.value !== archiveNew2.value) {
        archiveErr.value = t('Las contraseñas no coinciden');
        return;
      }
      archiveBusy.value = true;
      try {
        await setArchiveLock(archiveNew.value);
        store.archiveUnlocked = true;
        archiveOk.value = t('Archivados protegidos con contraseña');
        archiveReset();
      } catch (e) {
        archiveErr.value = (e && e.message === 'short')
          ? t('La contraseña debe tener al menos 4 caracteres')
          : t('No se pudo activar la protección');
      } finally {
        archiveBusy.value = false;
      }
    };
    const archiveDisable = async function () {
      archiveErr.value = '';
      archiveOk.value = '';
      if (!archivePw.value) {
        archiveErr.value = t('Escribe la contraseña actual');
        return;
      }
      archiveBusy.value = true;
      try {
        if (!(await checkArchiveLock(archivePw.value))) {
          archiveErr.value = t('Contraseña incorrecta');
          return;
        }
        clearArchiveLock();
        store.showArchived = false;
        archiveOk.value = t('Protección desactivada');
        archiveReset();
      } catch (e) {
        archiveErr.value = t('No se pudo quitar la protección');
      } finally {
        archiveBusy.value = false;
      }
    };
    const archiveChangePw = async function () {
      archiveErr.value = '';
      archiveOk.value = '';
      if (archiveNew.value.length < 4) {
        archiveErr.value = t('La contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (archiveNew.value !== archiveNew2.value) {
        archiveErr.value = t('Las contraseñas no coinciden');
        return;
      }
      archiveBusy.value = true;
      try {
        if (!(await checkArchiveLock(archivePw.value))) {
          archiveErr.value = t('Contraseña incorrecta');
          return;
        }
        await setArchiveLock(archiveNew.value);
        store.archiveUnlocked = true;
        archiveOk.value = t('Contraseña actualizada');
        archiveReset();
      } catch (e) {
        archiveErr.value = t('No se pudo cambiar la contraseña');
      } finally {
        archiveBusy.value = false;
      }
    };

    /* W58: resumen de permisos para volver a pedirlos desde Ajustes. */
    const permRows = Vue.computed(function () {
      return PERMISSIONS.map(function (p) {
        return {
          id: p.id, icon: p.icon, label: permissionLabel(p.id),
          state: store.permStates[p.id] || '',
          stateLabel: permissionStateLabel(p.id),
        };
      });
    });
    const permReview = async function () {
      await reviewPermissions();
    };
    const permRefresh = function () { refreshPermissionStates(); };
    Vue.onMounted(function () {
      dlLoad();
      hydrateDownloads();
      refreshPermissionStates();
    });

    return {
      store, tabs, close, setTab, openCat, goSettingsHome,
      settingsMobile, settingsHome, currentTabName,
      accents, walls, themes,
      pickTheme, pickAccent, pickWall, pickFont, pickLang, langs, toggle, setH12,
      setEmo,   /* W40 */
      /* W20: panel de fondo + micrófono */
      openWallPanel, micDev, micDevices, micTesting, micLevel, pickMic, testMic,
      pwCur, pwNew, pwRep, pwErr, pwBusy, pwReady, changePw,
      emNew, emCode, emMask, emStep, emErr, emBusy,
      sendEmCode, confirmEmCode, cancelEmCode,
      notifOn, notifPerm, notifLabel, notifTitle, askNotif,
      nativeNotifAvail, openNotifSettings,
      /* W50/W58: descargas persistentes + automáticas */
      dlList, dlTotal, dlBusy, dlMsg, dlSaving, dlSave, dlOpenFile, dlDelete,
      dlClear, dlDate, dlGroups, dlOpen, dlToggle, fmtSize,
      dlCat, dlCatGroup, dlOpenCat, dlCloseCat,
      dlAuto, dlAutoSet, dlTypes: DL_TYPES,
      /* W60: contraseña de Archivados */
      archivePw, archiveNew, archiveNew2, archiveChange,
      archiveBusy, archiveErr, archiveOk,
      archiveActivate, archiveDisable, archiveChangePw,
      /* W58: permisos del dispositivo */
      permRows, permReview, permRefresh,
      /* W63: tonos de mensaje y llamada */
      messageTones, callTones, messageTone, callTone, previewTone, previewingId, previewingKind,
      pickMessageTone, pickCallTone, openToneNote, uploadMessageTone, uploadCallTone,
      msgToneInput, callToneInput,
      doLogout: askLogout, doDelete: askDeleteAccount,
    };
  },
  template: `
    <div class="modal-veil settings-veil" @click.self="close">
      <div class="modal settings" :class="{ 'is-home': settingsMobile && settingsHome }"
        role="dialog" :aria-label="t('Ajustes')">
        <header>
          <span class="m-head-title">
            <template v-if="settingsMobile && !settingsHome">
              <button class="st-back" type="button" @click="openCat(null)">
                <svg class="ic"><use href="#i-back"></use></svg>
              </button>
              <b>{{ currentTabName }}</b>
            </template>
            <template v-else>
              <b>{{ t('Ajustes') }}</b>
            </template>
          </span>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>

        <!-- W60: en móvil, la página principal de Ajustes es una lista de
             categorías. Cada una abre su subpantalla con botón atrás. -->
        <div class="st-mobile-home" v-if="settingsMobile && settingsHome">
          <button class="st-cat" type="button" v-for="tb in tabs" :key="tb.val"
            @click="openCat(tb.val)">
            <span class="st-cat-ic"><svg class="ic"><use :href="'#' + tb.icon"></use></svg></span>
            <span class="st-cat-col"><b>{{ t(tb.name) }}</b><span>{{ t(tb.desc) }}</span></span>
            <svg class="ic ic-sm st-cat-chev"><use href="#i-back"></use></svg>
          </button>
        </div>

        <!-- W9: navegación lateral agrupada (estilo Discord); .m-tab y el
             orden se conservan: Cuenta siempre la ÚLTIMA pestaña. -->
        <div class="st-cols" v-if="!settingsMobile || !settingsHome">
        <div class="m-tabs" role="tablist">
          <template v-for="(tb, i) in tabs">
            <div class="st-group" v-if="tb.group && (i === 0 || tabs[i - 1].group !== tb.group)"
              :key="'g-' + tb.group">{{ t(tb.group) }}</div>
            <button class="m-tab" type="button" :key="tb.val"
              :class="{ on: store.settingsTab === tb.val }" @click="setTab(tb.val)">
              <!-- W80: icono en la columna lateral de Ajustes (PC) -->
              <svg class="ic ic-sm m-tab-ic"><use :href="'#' + tb.icon"></use></svg>
              <span class="m-tab-t">{{ t(tb.name) }}</span>
            </button>
          </template>
        </div>

        <div class="st-body">
          <!-- ============ cuenta ============ -->
          <template v-if="store.settingsTab === 'cuenta'">
            <div class="st-title">{{ t('Cuenta') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Tu cuenta') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Usuario') }}</b><span>@{{ store.user ? store.user.username : '' }}</span></div>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Correo') }}</b><span>{{ (store.user && store.user.email) || '—' }}</span></div>
              </div>
            </div>

            <!-- W8: cambiar correo/contraseña cada uno en su propia ventana -->
            <div class="st-sec">
              <div class="st-h">{{ t('Seguridad') }}</div>
              <div class="st-btns st-btns-left">
                <button class="btn btn-ghost" type="button" @click="store.emOpen = true">{{ t('Cambiar correo') }}</button>
                <button class="btn btn-ghost" type="button" @click="store.pwOpen = true">{{ t('Cambiar contraseña') }}</button>
              </div>
            </div>

            <div class="st-sec">
              <div class="st-h">{{ t('Sesión') }}</div>
              <button class="btn btn-ghost btn-full" type="button" :title="t('Cerrar sesión')" @click="doLogout">{{ t('Cerrar sesión') }}</button>
            </div>

            <div class="st-sec">
              <div class="st-h">{{ t('Zona de peligro') }}</div>
              <div class="danger-zone">
                <p><b>{{ t('Eliminar cuenta') }}</b>: {{ t('borra para siempre tu perfil, tus mensajes y tus archivos. Tus MD se eliminan por completo; en los grupos queda un aviso. No se puede deshacer.') }}</p>
                <button class="btn btn-danger btn-full" type="button" @click="doDelete">{{ t('Eliminar mi cuenta') }}</button>
              </div>
            </div>
          </template>

          <!-- ============ apariencia ============ -->
          <template v-else-if="store.settingsTab === 'apariencia'">
            <div class="st-title">{{ t('Apariencia') }}</div>
            <div class="ap-sec">{{ t('Tema') }}</div>
            <div class="ap-themes" role="group" :aria-label="t('Tema')">
              <button class="ap-theme" type="button" v-for="th in themes" :key="th.val"
                :class="{ on: store.theme === th.val }"
                :title="t(th.name)" :aria-label="t(th.name)" :aria-pressed="store.theme === th.val"
                @click="pickTheme(th.val)">
                <span class="ap-theme-art" :style="{ background: th.bg }">
                  <i class="ap-theme-side" :style="{ background: th.panel }"></i>
                  <i class="ap-theme-bubble" :style="{ background: th.snap }"></i>
                  <i class="ap-theme-accent" :style="{ background: store.accent }"></i>
                </span>
                <span class="ap-theme-check" v-if="store.theme === th.val">
                  <svg class="ic ic-sm"><use href="#i-check"></use></svg>
                </span>
              </button>
            </div>
            <div class="ap-sec">{{ t('Color de acento') }}</div>
            <div class="ap-swatches">
              <button class="ap-sw" type="button" v-for="c in accents" :key="c"
                :style="{ background: c }"
                :class="{ on: store.accent.toLowerCase() === c }"
                :title="c" @click="pickAccent(c)"></button>
            </div>
            <div class="ap-sec">{{ t('Fondo de la conversación') }}</div>
            <div class="ap-walls">
              <button class="ap-wl" type="button" v-for="w in walls" :key="w.val"
                :class="{ on: store.wall === w.val }" @click="pickWall(w.val)">
                <span class="wl-chip" :style="{ background: w.val || 'var(--bg)' }"></span>{{ t(w.name) }}</button>
            </div>
            <!-- W20: foto de fondo + opacidad/difuminado: panel dedicado
                 que ocupa la columna del lista de chats (hoja inferior
                 en celular) y trae una preview de ejemplo -->
            <div class="ap-row ap-wallrow">
              <button class="btn btn-ghost btn-sm" type="button" @click="openWallPanel">
                {{ t('Personalizar fondo…') }}</button>
            </div>
            <div class="ap-sec">{{ t('Tamaño de letra') }}</div>
            <div class="ap-row">
              <button class="ap-opt" type="button" :class="{ on: store.font === 'small' }"
                @click="pickFont('small')">{{ t('Pequeño') }}</button>
              <button class="ap-opt" type="button" :class="{ on: store.font === 'normal' }"
                @click="pickFont('normal')">{{ t('Normal') }}</button>
              <button class="ap-opt" type="button" :class="{ on: store.font === 'large' }"
                @click="pickFont('large')">{{ t('Grande') }}</button>
            </div>
            <!-- W10: idioma de la interfaz (es | en), guardado por dispositivo.
                 W37b: ahora es un cuadro desplegable (select). -->
            <div class="ap-sec">{{ t('Idioma de la interfaz') }}</div>
            <div class="ap-row">
              <select class="input lang-select" :value="store.lang"
                @change="pickLang($event.target.value)">
                <option v-for="lg in langs" :key="lg.val" :value="lg.val">{{ lg.name }}</option>
              </select>
            </div>
          </template>

          <!-- ============ chat ============ -->
          <template v-else-if="store.settingsTab === 'chat'">
            <div class="st-title">{{ t('Chat') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Mensajes') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Avisar cuando escribo') }}</b><span>{{ t('Tus contactos ven “escribiendo…”') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.typing"
                  @change="toggle('typing')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Recibos de lectura') }}</b><span>{{ t('Mostrar ✓✓ y avisar cuando lees') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.receipts"
                  @change="toggle('receipts')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Enter para enviar') }}</b><span>{{ t('Shift + Enter hace un salto de línea') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.enter"
                  @change="toggle('enter')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Formato de hora') }}</b><span>{{ t('En vez de 20:30, mostrar 8:30 pm') }}</span></div>
                <!-- W29e: desplegable 12/24 h (antes era un interruptor) -->
                <select class="input h12-select" :value="store.prefs.h12 ? '12' : '24'"
                  @change="setH12" :aria-label="t('Formato de hora')">
                  <option value="24">24 h</option>
                  <option value="12">12 h</option>
                </select>
              </div>
              <!-- W40: estilo de los emojis — nativo (fuente del SO,
                   cero descargas), Google (Noto) o Twemoji -->
              <div class="st-row">
                <div class="st-col"><b>{{ t('Estilo de emojis') }}</b>
                  <span>{{ t('Nativo usa la fuente de tu sistema') }}</span></div>
                <select class="input emo-select" :value="store.prefs.emo"
                  @change="setEmo" :aria-label="t('Estilo de emojis')">
                  <option value="system">{{ t('Nativo del sistema') }}</option>
                  <option value="noto">{{ t('Emojis de Google') }}</option>
                  <option value="twemoji">Twemoji</option>
                </select>
              </div>
            </div>
            <!-- W20: micrófono — dispositivo preferido y prueba de nivel -->
            <div class="st-sec">
              <div class="st-h">{{ t('Micrófono') }}</div>
              <div class="st-row">
                <select class="input mic-select" v-model="micDev" @change="pickMic">
                  <option value="">{{ t('Micrófono del sistema') }}</option>
                  <option v-for="(d, i) in micDevices" :key="d.deviceId" :value="d.deviceId">
                    {{ d.label || t('Micrófono {n}', { n: i + 1 }) }}</option>
                </select>
              </div>
              <div class="st-row mic-test-row">
                <button class="btn btn-ghost btn-sm" type="button" @click="testMic">
                  {{ micTesting ? t('Escuchando…') : t('Probar micrófono') }}</button>
                <span class="mic-bar"><i :style="{ width: micLevel + '%' }"></i></span>
              </div>
            </div>
            <!-- W58: permisos del dispositivo (micrófono, cámara, avisos,
                 almacenamiento legacy). Se pueden revisar sin reiniciar. -->
            <div class="st-sec">
              <div class="st-h">{{ t('Permisos del dispositivo') }}</div>
              <p class="st-hint">{{ t('Si saltaste un permiso al entrar, puedes concederlo aquí. La app sigue funcionando sin él.') }}</p>
              <div class="st-row perm-row" v-for="p in permRows" :key="p.id">
                <svg class="ic ic-sm perm-row-ic"><use :href="'#' + p.icon"></use></svg>
                <div class="st-col"><b>{{ p.label }}</b><span>{{ p.stateLabel }}</span></div>
                <span class="perm-state" :class="'is-' + p.state">{{ p.stateLabel }}</span>
              </div>
              <div class="st-btns st-btns-left">
                <button class="btn btn-ghost btn-sm" type="button" @click="permRefresh">{{ t('Actualizar') }}</button>
                <button class="btn btn-sm" type="button" @click="permReview">{{ t('Revisar permisos') }}</button>
              </div>
            </div>

          </template>

          <!-- ============ notificaciones ============ -->
          <template v-else-if="store.settingsTab === 'notificaciones'">
            <div class="st-title">{{ t('Notificaciones') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Avisos') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Habilitar notificaciones') }}</b><span>{{ t('Hace sonar los mensajes') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.sound"
                  @change="toggle('sound')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row" v-if="notifOn && nativeNotifAvail && notifPerm === 'denied'">
                <div class="st-col"><b>{{ t('Permiso de notificaciones') }}</b><span>{{ t('Bloqueado por el sistema') }}</span></div>
                <button class="btn btn-ghost btn-sm" type="button"
                  @click="openNotifSettings">{{ t('Abrir ajustes') }}</button>
              </div>
            </div>

            <!-- W63: tonos de mensaje y llamada (W65: categoría propia) -->
            <div class="st-sec tone-sec">
              <div class="st-h">{{ t('Sonidos') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Tono de mensaje') }}</b><span>{{ t('Suena cuando llega un mensaje nuevo') }}</span></div>
                <div class="tone-pick">
                  <select class="input tone-select" :value="messageTone" @change="pickMessageTone">
                    <option v-for="tm in messageTones" :key="tm.id" :value="tm.id">{{ t(tm.name) }}</option>
                  </select>
                  <button class="btn btn-ghost btn-sm tone-play" type="button"
                    :title="(previewingId === messageTone && previewingKind === 'message') ? t('Detener') : t('Previsualizar')"
                    @click="previewTone(messageTone, 'message')">
                    <svg class="ic ic-sm"><use :href="(previewingId === messageTone && previewingKind === 'message') ? '#i-pause' : '#i-play'"></use></svg>
                  </button>
                </div>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Tono de llamada') }}</b><span>{{ t('Suena cuando te llaman') }}</span></div>
                <div class="tone-pick">
                  <select class="input tone-select" :value="callTone" @change="pickCallTone">
                    <option v-for="tc in callTones" :key="tc.id" :value="tc.id">{{ t(tc.name) }}</option>
                  </select>
                  <button class="btn btn-ghost btn-sm tone-play" type="button"
                    :title="(previewingId === callTone && previewingKind === 'call') ? t('Detener') : t('Previsualizar')"
                    @click="previewTone(callTone, 'call')">
                    <svg class="ic ic-sm"><use :href="(previewingId === callTone && previewingKind === 'call') ? '#i-pause' : '#i-play'"></use></svg>
                  </button>
                </div>
              </div>
              <div class="st-row tone-upload">
                <input type="file" ref="msgToneInput" accept="audio/mpeg, audio/wav, audio/ogg" @change="uploadMessageTone" style="display: none">
                <input type="file" ref="callToneInput" accept="audio/mpeg, audio/wav, audio/ogg" @change="uploadCallTone" style="display: none">
                <button class="btn btn-ghost btn-sm" type="button" @click="msgToneInput && msgToneInput.click()">
                  <svg class="ic ic-sm"><use href="#i-plus"></use></svg>
                  {{ t('Subir tono de mensaje') }} (max 5s, 200KB)
                </button>
                <button class="btn btn-ghost btn-sm" type="button" @click="callToneInput && callToneInput.click()">
                  <svg class="ic ic-sm"><use href="#i-plus"></use></svg>
                  {{ t('Subir tono de llamada') }} (max 120s, 1MB)
                </button>
              </div>
            </div>
          </template>

          <!-- ============ privacidad ============ -->
          <template v-else-if="store.settingsTab === 'privacidad'">
            <div class="st-title">{{ t('Privacidad') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Archivados') }}</div>
              <p class="st-hint">{{ t('Protege la sección de chats archivados con una contraseña. Se pedirá al entrar y se guarda solo en este dispositivo; no se envía al servidor.') }}</p>

              <template v-if="store.archiveHasLock">
                <div class="st-privacy-state">
                  <svg class="ic ic-sm"><use href="#i-lock"></use></svg>
                  <span>{{ t('Archivados protegidos con contraseña') }}</span>
                </div>
                <div class="field">
                  <label>{{ t('Contraseña actual') }}</label>
                  <input class="input" type="password" v-model="archivePw"
                    autocomplete="current-password" :placeholder="t('Para cambiar o quitar la protección')">
                </div>
                <div class="st-btns st-btns-left">
                  <button class="btn btn-ghost btn-sm" type="button"
                    @click="archiveChange = !archiveChange">{{ archiveChange ? t('Cancelar cambio') : t('Cambiar contraseña') }}</button>
                  <button class="btn btn-ghost btn-sm" type="button"
                    :disabled="archiveBusy || !archivePw" @click="archiveDisable">{{ t('Quitar protección') }}</button>
                </div>
                <div class="archive-new" v-if="archiveChange">
                  <div class="field">
                    <label>{{ t('Nueva contraseña') }}</label>
                    <input class="input" type="password" v-model="archiveNew" autocomplete="new-password">
                  </div>
                  <div class="field">
                    <label>{{ t('Repite la nueva contraseña') }}</label>
                    <input class="input" type="password" v-model="archiveNew2" autocomplete="new-password">
                  </div>
                  <button class="btn btn-sm" type="button" :disabled="archiveBusy" @click="archiveChangePw">
                    {{ archiveBusy ? t('Guardando…') : t('Guardar nueva contraseña') }}</button>
                </div>
              </template>

              <template v-else>
                <div class="field">
                  <label>{{ t('Contraseña') }}</label>
                  <input class="input" type="password" v-model="archiveNew"
                    autocomplete="new-password" :placeholder="t('Mínimo 4 caracteres')">
                </div>
                <div class="field">
                  <label>{{ t('Repite la contraseña') }}</label>
                  <input class="input" type="password" v-model="archiveNew2"
                    autocomplete="new-password">
                </div>
                <button class="btn btn-sm" type="button" :disabled="archiveBusy" @click="archiveActivate">
                  {{ archiveBusy ? t('Guardando…') : t('Activar protección') }}</button>
              </template>

              <div class="form-err st-err" v-if="archiveErr" role="alert">
                <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ archiveErr }}</span>
              </div>
              <div class="st-ok st-ok-line" v-if="archiveOk">
                <svg class="ic ic-sm"><use href="#i-check"></use></svg><span>{{ archiveOk }}</span>
              </div>
            </div>
          </template>

          <!-- ============ descargas (W50/W58) ============ -->
          <template v-else-if="store.settingsTab === 'descargas'">
            <div class="st-title">{{ t('Descargas') }}</div>
            <div class="st-sec dl-auto-sec">
              <div class="st-h">{{ t('Descargas automáticas') }}</div>
              <p class="st-hint">{{ t('Wi-Fi: activado por defecto; los archivos se descargan solos a los datos de la app. Datos móviles: desactivado por defecto para no gastar tu plan. Nada se copia a Descargas hasta que pulses “Guardar en el dispositivo”.') }}</p>
              <div class="dl-auto-row" v-for="tp in dlTypes" :key="tp.id">
                <b class="dl-auto-name">{{ t(tp.label) }}</b>
                <label class="dl-auto-opt">
                  <span class="tgl"><input type="checkbox" :checked="dlAuto[tp.id].wifi"
                    @change="dlAutoSet(tp.id, 'wifi', $event)"><span class="tgl-track"><span class="tgl-knob"></span></span></span>
                  <span>Wi-Fi</span>
                </label>
                <label class="dl-auto-opt">
                  <span class="tgl"><input type="checkbox" :checked="dlAuto[tp.id].mobile"
                    @change="dlAutoSet(tp.id, 'mobile', $event)"><span class="tgl-track"><span class="tgl-knob"></span></span></span>
                  <span>{{ t('Datos móviles') }}</span>
                </label>
              </div>
            </div>
            <div class="st-sec">
              <div class="st-h">{{ t('Archivos guardados') }}</div>
              <p class="st-hint">{{ t('Se guardan en este dispositivo para abrirlos sin volver a descargarlos. Puedes exportar una copia a Descargas cuando quieras.') }}</p>
              <div class="dl-empty" v-if="dlBusy">{{ t('Cargando…') }}</div>
              <div class="dl-empty" v-else-if="!dlList.length">{{ t('No hay descargas guardadas.') }}</div>
              <div class="dl-groups" v-else>
                <button class="dl-group" type="button" v-for="g in dlGroups" :key="g.id"
                  @click="dlOpenCat(g.id)">
                  <span class="dl-group-head">
                    <svg class="ic ic-sm"><use :href="'#' + g.icon"></use></svg>
                    <b>{{ t(g.label) }}</b>
                    <span class="dl-gcount">({{ g.count }})</span>
                    <span class="dl-gsize">{{ fmtSize(g.size) }}</span>
                    <svg class="ic ic-sm dl-gchev"><use href="#i-back"></use></svg>
                  </span>
                </button>
              </div>
              <div class="form-err st-err" v-if="dlMsg" role="alert">
                <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ dlMsg }}</span>
              </div>
            </div>
            <div class="st-sec" v-if="dlList.length">
              <div class="st-row">
                <div class="st-col"><b>{{ t('Espacio usado') }}</b><span>{{ fmtSize(dlTotal) }}</span></div>
                <button class="btn btn-ghost btn-sm" type="button" @click="dlClear">{{ t('Borrar todas') }}</button>
              </div>
            </div>
          </template>

          <!-- ============ atajos ============ -->
          <template v-else-if="store.settingsTab === 'atajos'">
            <div class="st-title">{{ t('Atajos') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Atajos de teclado') }}</div>
              <p style="margin-bottom:10px;color:var(--txt-2);font-size:.85em;">NOTA: Estos atajos solamente funcionan en teclado físico.</p>
              <div class="kbd-row"><span class="kbd">Enter</span><span>{{ t('Enviar mensaje') }}</span></div>
              <div class="kbd-row"><span class="kbd">Shift + Enter</span><span>{{ t('Salto de línea') }}</span></div>
              <div class="kbd-row"><span class="kbd">Ctrl + Enter</span><span>{{ t('Enviar con “Enter para enviar” apagado') }}</span></div>
              <div class="kbd-row"><span class="kbd">Esc</span><span>{{ t('Cerrar ventanas y paneles') }}</span></div>
            </div>
          </template>

          <!-- ============ accesibilidad ============ -->
          <template v-else-if="store.settingsTab === 'accessibility'">
            <div class="st-title">{{ t('Accesibilidad') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Animaciones y efectos') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Quitar animaciones') }}</b><span>{{ t('Desactiva los movimientos visuales, transiciones y efectos de la interfaz para mejorar el rendimiento del equipo o reducir la fatiga visual.') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.noAnim" @change="toggle('noAnim')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
            </div>
            <div class="st-sec">
              <div class="st-h">{{ t('Estímulos visuales') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Reducir estímulos visuales') }}</b><span>{{ t('Desactiva la reproducción automática de GIFs, stickers animados y efectos de pantalla completa para evitar distracciones o crisis de fotosensibilidad (TDAH, autismo, epilepsia).') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.reduceStimuli" @change="toggle('reduceStimuli')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
            </div>
          </template>
        </div><!-- /.st-body -->
        </div><!-- /.st-cols -->
      </div>

      <!-- W8: ventana propia para cambiar la contraseña -->
      <div class="modal-veil" v-if="store.pwOpen" @click.self="store.pwOpen = false">
        <div class="modal small" role="dialog" :aria-label="t('Cambiar contraseña')">
          <header>{{ t('Cambiar contraseña') }}
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="store.pwOpen = false">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="m-body">
            <div class="field">
              <label>{{ t('Contraseña actual') }}</label>
              <input class="input" type="password" v-model="pwCur" autocomplete="current-password">
            </div>
            <div class="field">
              <label>{{ t('Contraseña nueva') }}</label>
              <input class="input" type="password" v-model="pwNew" autocomplete="new-password">
            </div>
            <div class="field">
              <label>{{ t('Repite la contraseña nueva') }}</label>
              <input class="input" type="password" v-model="pwRep" autocomplete="new-password">
            </div>
            <div class="form-err st-err" v-if="pwErr" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(pwErr) }}</span>
            </div>
          </div>
          <div class="m-foot st-btns">
            <button class="btn btn-ghost" type="button" :disabled="pwBusy" @click="store.pwOpen = false">{{ t('Cancelar') }}</button>
            <button class="btn" type="button" :disabled="!pwReady || pwBusy" @click="changePw">
              {{ pwBusy ? t('Guardando…') : t('Guardar') }}</button>
          </div>
        </div>
      </div>

      <!-- W8: ventana propia para cambiar el correo -->
      <div class="modal-veil" v-if="store.emOpen" @click.self="store.emOpen = false">
        <div class="modal small" role="dialog" :aria-label="t('Cambiar correo')">
          <header>{{ t('Cambiar correo') }}
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="store.emOpen = false">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="m-body">
            <template v-if="emStep === 0">
              <div class="field">
                <label>{{ t('Nuevo correo') }}</label>
                <input class="input" type="email" v-model.trim="emNew"
                  :placeholder="t('tucorreo@ejemplo.com')" autocomplete="email">
              </div>
              <p class="st-hint">{{ t('Te enviamos un código de 6 dígitos. Tu correo actual sigue activo hasta que confirmes.') }}</p>
            </template>
            <template v-else>
              <p class="st-hint">{{ t('Enviamos un código de 6 dígitos a {n}. Tu correo actual sigue activo hasta que confirmes.', { n: emMask }) }}</p>
              <div class="field">
                <label>{{ t('Código') }}</label>
                <input class="input" inputmode="numeric" maxlength="6" v-model.trim="emCode" placeholder="123456">
              </div>
            </template>
            <div class="form-err st-err" v-if="emErr" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(emErr) }}</span>
            </div>
          </div>
          <div class="m-foot st-btns" v-if="emStep === 0">
            <button class="btn btn-ghost" type="button" :disabled="emBusy" @click="store.emOpen = false">{{ t('Cancelar') }}</button>
            <button class="btn" type="button" :disabled="!emNew || emBusy" @click="sendEmCode">
              {{ emBusy ? t('Enviando…') : t('Enviar código') }}</button>
          </div>
          <div class="m-foot st-btns" v-else>
            <button class="btn btn-ghost" type="button" :disabled="emBusy" @click="cancelEmCode">{{ t('Cancelar') }}</button>
            <button class="btn btn-ghost" type="button" :disabled="emBusy" @click="sendEmCode">{{ t('Reenviar') }}</button>
            <button class="btn" type="button" :disabled="emCode.length !== 6 || emBusy" @click="confirmEmCode">
              {{ emBusy ? t('Confirmando…') : t('Confirmar') }}</button>
          </div>
        </div>
      </div>

      <!-- W60: cada categoría de descargas se abre en su propio modal;
           nada de listas expandibles dentro de Ajustes. -->
      <div class="modal-veil" v-if="dlCat && dlCatGroup" @click.self="dlCloseCat">
        <div class="modal dl-cat-modal" role="dialog" :aria-label="t(dlCatGroup.label)">
          <header>
            <span class="m-head-title">
              <svg class="ic"><use :href="'#' + dlCatGroup.icon"></use></svg>
              <b>{{ t(dlCatGroup.label) }}</b>
            </span>
            <span class="dl-gsize">{{ fmtSize(dlCatGroup.size) }}</span>
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="dlCloseCat">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="m-body dl-cat-body dl-group-body">
            <div class="dl-item" v-for="d in dlCatGroup.items" :key="d.key">
              <div class="dl-info">
                <b>{{ d.name }}</b>
                <span>{{ fmtSize(d.size) }}<template v-if="d.auto"> · {{ t('Automática') }}</template><template v-if="dlDate(d)"> · {{ dlDate(d) }}</template></span>
              </div>
              <button class="btn btn-ghost btn-sm" type="button"
                @click="dlOpenFile(d)">{{ t('Abrir') }}</button>
              <button class="btn btn-ghost btn-sm" type="button"
                :disabled="dlSaving === d.key" @click="dlSave(d)">
                {{ dlSaving === d.key ? t('Guardando…') : t('Guardar en el dispositivo') }}</button>
              <button class="icon-btn" type="button" :title="t('Eliminar')" @click="dlDelete(d)">
                <svg class="ic"><use href="#i-trash"></use></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`,
};

/* ------------------------------------------------ ArchiveLockModal (W60) */

const ArchiveLockModal = {
  setup: function () {
    const pw = Vue.ref('');
    const show = Vue.ref(false);
    const busy = Vue.ref(false);
    const inputEl = Vue.ref(null);
    const err = Vue.computed(function () { return store.archiveLockErr; });
    const close = function () {
      store.archiveLockPrompt = false;
      store.showArchived = false;
      store.archiveLockErr = '';
      pw.value = '';
      show.value = false;
    };
    const unlock = async function () {
      if (busy.value) return;
      if (!pw.value) { store.archiveLockErr = t('Escribe la contraseña'); return; }
      busy.value = true;
      store.archiveLockErr = '';
      try {
        const ok = await checkArchiveLock(pw.value);
        if (!ok) {
          store.archiveLockErr = t('Contraseña incorrecta');
          pw.value = '';
          if (inputEl.value) inputEl.value.focus();
          return;
        }
        store.archiveUnlocked = true;
        store.archiveLockPrompt = false;
        store.showArchived = true;
        store.archiveLockErr = '';
        pw.value = '';
      } catch (e) {
        store.archiveLockErr = t('No se pudo comprobar la contraseña');
      } finally {
        busy.value = false;
      }
    };
    Vue.onMounted(function () {
      setTimeout(function () { if (inputEl.value) inputEl.value.focus(); }, 80);
    });
    return { store, pw, show, busy, inputEl, err, close, unlock };
  },
  template: `
    <div class="archive-lock-veil" role="dialog" aria-modal="true" :aria-label="t('Archivados bloqueados')"
      @click.self="close">
      <div class="al-top">
        <svg class="mobile-page-logo" aria-hidden="true"><use href="#i-logo-mark"></use></svg>
        <b>{{ t('Archivados') }}</b>
      </div>
      <div class="archive-lock-card">
        <div class="al-ic"><svg class="ic"><use href="#i-lock"></use></svg></div>
        <h2>{{ t('Archivados bloqueados') }}</h2>
        <p>{{ t('La sección de archivados está bloqueada, por favor ingresa la contraseña.') }}</p>
        <div class="al-field">
          <input ref="inputEl" class="input" :type="show ? 'text' : 'password'"
            v-model="pw" autocomplete="current-password" :placeholder="t('Contraseña')"
            @keydown.enter.prevent="unlock">
          <button class="al-eye" type="button" :title="show ? t('Ocultar') : t('Mostrar')"
            @click="show = !show">
            <svg class="ic ic-sm"><use :href="show ? '#i-eye-off' : '#i-eye'"></use></svg>
          </button>
        </div>
        <div class="form-err st-err" v-if="err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <button class="btn btn-full al-unlock" type="button" :disabled="busy || !pw" @click="unlock">
          {{ busy ? t('Comprobando…') : t('Desbloquear') }}
        </button>
        <button class="al-back" type="button" @click="close">{{ t('Volver a Chats') }}</button>
      </div>
    </div>`,
};

/* ------------------------------------------------ DownloadViewer (W60) */

const DownloadViewer = {
  setup: function () {
    const saved = Vue.ref(false);
    const saving = Vue.ref(false);
    const close = function () {
      const v = store.dlViewer;
      if (v && v.url && v.url.indexOf('blob:') === 0) {
        try { URL.revokeObjectURL(v.url); } catch (e) {}
      }
      store.dlViewer = null;
    };
    const onKey = function (e) {
      if (e.key === 'Escape') close();
    };
    Vue.onMounted(function () { document.addEventListener('keydown', onKey); });
    Vue.onUnmounted(function () { document.removeEventListener('keydown', onKey); });
    const save = async function () {
      const v = store.dlViewer;
      if (!v || !v.key) return;
      saving.value = true;
      saved.value = false;
      try {
        const r = await saveDownloadToDevice(v.key, v.name, v.mime);
        saved.value = !!(r && r.ok);
      } finally {
        saving.value = false;
      }
    };
    return { store, close, save, saved, saving, fmtSize };
  },
  template: `
    <div class="dl-viewer-veil" @click.self="close" role="dialog" :aria-label="store.dlViewer.name">
      <div class="dl-viewer" v-if="store.dlViewer">
        <header>
          <span class="dlv-title" :title="store.dlViewer.name">{{ store.dlViewer.name }}</span>
          <span class="dlv-size">{{ fmtSize(store.dlViewer.size) }}</span>
          <button class="btn btn-ghost btn-sm dlv-save" type="button"
            :disabled="saving" @click="save">
            <svg class="ic ic-sm"><use :href="saved ? '#i-check' : '#i-download'"></use></svg>
            <span>{{ saved ? t('Guardado') : (saving ? t('Guardando…') : t('Guardar')) }}</span>
          </button>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="dlv-body">
          <img v-if="store.dlViewer.kind === 'image'" :src="store.dlViewer.url"
            :alt="store.dlViewer.name">
          <video v-else-if="store.dlViewer.kind === 'video'" :src="store.dlViewer.url"
            controls autoplay ref="dlVideo"></video>
          <audio v-else-if="store.dlViewer.kind === 'audio'" :src="store.dlViewer.url"
            controls autoplay></audio>
          <iframe v-else-if="store.dlViewer.mime === 'application/pdf'"
            :src="store.dlViewer.url" :title="store.dlViewer.name"></iframe>
          <div v-else class="dlv-other">
            <svg class="ic"><use href="#i-file"></use></svg>
            <b>{{ store.dlViewer.name }}</b>
            <span>{{ t('Este tipo de archivo no se puede previsualizar aquí.') }}</span>
            <button class="btn" type="button" :disabled="saving" @click="save">
              {{ saving ? t('Guardando…') : t('Guardar en el dispositivo') }}</button>
          </div>
        </div>
      </div>
    </div>`,
};

/* W61: posición vertical de la portada (0 = arriba, 100 = abajo). */
function bannerPositionOf(u) {
  const n = Number(u && u.banner_position);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function bannerStyle(u) {
  return { objectPosition: '50% ' + bannerPositionOf(u) + '%' };
}

/* W61: abre una portada/avatar en el visor existente, con el original
   (sin la miniatura ?thumb=1) para poder ampliarlo y descargarlo. */
function openMediaViewer(url, name) {
  if (!url) return;
  store.lb = {
    url: mediaUrl(url, false, true),
    orig: mediaUrl(url, true, true),
    name: name || '',
  };
}

/* W61: bio con "Ver más". A partir de 100 caracteres se recorta en una
   palabra completa y el botón despliega el texto completo (300 máx.). */
const BioText = {
  props: {
    text: { type: String, default: '' },
    limit: { type: Number, default: 100 },
  },
  setup: function (props) {
    const open = Vue.ref(false);
    const more = Vue.computed(function () {
      return charCount(props.text) > props.limit;
    });
    const shown = Vue.computed(function () {
      const txt = props.text || '';
      if (!more.value || open.value) return txt;
      const chars = Array.from(txt);
      let cut = chars.slice(0, props.limit).join('');
      const sp = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
      if (sp > Math.floor(props.limit * 0.6)) cut = cut.slice(0, sp);
      return cut.replace(/[\s,;:.!?]+$/, '') + '…';
    });
    return { open, more, shown, md: mdToHtml, t };
  },
  template:
    '<div class="pf-bio-wrap">' +
      '<div class="pp-bio md-body" v-html="md(shown)"></div>' +
      '<button v-if="more" class="pf-bio-more" type="button" @click="open = !open">' +
        '{{ open ? t(\'Ver menos\') : t(\'Ver más\') }}' +
      '</button>' +
    '</div>',
};

/* ---------------------------------------------------- MeProfileModal */

const MeProfileModal = {
  setup: function () {
    const close = function () { store.meProfileOpen = false; };
    const edit = function () {
      store.meProfileOpen = false;
      store.meEditOpen = true;
    };
    /* W58: el estado se cambia desde la burbuja citada del perfil, con
       un menú desplegable estilo Discord. Solo MI perfil permite editar:
       este modal siempre es el propio. */
    const menuOpen = Vue.ref(false);
    const statusDraft = Vue.ref((store.user && store.user.status_text) || '');
    const statusBusy = Vue.ref(false);
    const statusErr = Vue.ref('');
    const myStatus = Vue.computed(function () {
      return statusOf(store.user) || t('En línea');
    });
    const myPreset = Vue.computed(function () {
      return (store.user && store.user.status_preset) || 'online';
    });
    const toggleStatus = function () {
      if (!menuOpen.value) {
        statusDraft.value = (store.user && store.user.status_text) || '';
        statusErr.value = '';
      }
      menuOpen.value = !menuOpen.value;
    };
    const saveStatus = async function (preset, text) {
      statusErr.value = '';
      statusBusy.value = true;
      try {
        const r = await api('PUT', '/auth/profile', {
          status_preset: preset,
          status_text: text,
        }, { retry401: true });
        if (r && r.user) {
          store.user = Object.assign({}, store.user, r.user);
          session.user = store.user;
          saveSession();
        } else {
          store.user.status_preset = preset;
          store.user.status_text = text;
          session.user = store.user;
          saveSession();
        }
        menuOpen.value = false;
      } catch (e) {
        statusErr.value = (e && t(e.detail)) || t('No se pudo actualizar el estado');
      } finally {
        statusBusy.value = false;
      }
    };
    const choosePreset = function (p) {
      saveStatus(p.val, statusDraft.value.trim());
    };
    const saveCustom = function () {
      saveStatus(myPreset.value, statusDraft.value.trim());
    };
    const clearCustom = function () {
      statusDraft.value = '';
      saveStatus(myPreset.value, '');
    };
    /* W68: copiar mi ID público (16 dígitos) para compartir el enlace
       /app/user/<id> y que otra persona pueda enviar solicitud. */
    const copyMyId = function () {
      if (store.user && store.user.pub_id) {
        copyText(store.user.pub_id);
        toast(t('ID copiado'), 'ok');
      }
    };
    return {
      store, close, edit, myStatus, myPreset, presets: STATUS_PRESETS,
      menuOpen, statusDraft, statusBusy, statusErr,
      toggleStatus, choosePreset, saveCustom, clearCustom, copyMyId,
      dotClass, statusOf, joinedLine, md: mdToHtml, mediaUrl,
      bannerStyle, viewMedia: openMediaViewer,
    };
  },
  components: { BioText },
  template: `
    <div class="modal-veil" @click.self="close">
      <div class="modal meprof" role="dialog" :aria-label="t('Tu perfil')">
        <header>{{ t('Tu perfil') }}
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="mp-body">
          <div class="mp-view pf-view" v-if="store.user">
            <!-- W58: portada + avatar solapado a la mitad + estado citado -->
            <div class="pf-banner" :class="{ 'is-empty': !store.user.banner_url }">
              <img v-if="store.user.banner_url" :src="mediaUrl(store.user.banner_url)"
                :style="bannerStyle(store.user)" alt="" class="pf-zoom"
                :title="t('Ver portada')" @click="viewMedia(store.user.banner_url, 'portada')">
              <span v-else class="pf-banner-art" aria-hidden="true">
                <svg class="fox"><use href="#i-logo-mark"></use></svg>
              </span>
            </div>
            <div class="pf-idrow">
              <span class="av-wrap pf-avwrap" :class="dotClass(store.user, store.ws === 'on')">
                <span class="avatar pp-av" :class="{ 'has-photo': !!store.user.avatar_url }">
                  <img v-if="store.user.avatar_url" :src="mediaUrl(store.user.avatar_url)"
                    alt="" class="pf-zoom" :title="t('Ver foto')"
                    @click="viewMedia(store.user.avatar_url, 'foto')">
                  <span v-else class="avatar-initial">{{ (store.user.display_name || store.user.username || '?').charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <div class="pf-status-wrap">
                <button class="pf-quote pf-status-btn" type="button"
                  :title="t('Cambiar estado')" :aria-expanded="menuOpen ? 'true' : 'false'"
                  @click.stop="toggleStatus">
                  <span class="sdot" :class="store.ws === 'on' ? (myPreset === 'busy' ? 'sd-busy' : (myPreset === 'dnd' ? 'sd-dnd' : (myPreset === 'invisible' ? 'sd-off' : 'sd-online'))) : 'sd-off'"></span>
                  <span class="pf-quote-text">{{ myStatus }}</span>
                  <svg class="ic ic-sm pf-quote-chev" :class="{ open: menuOpen }"><use href="#i-chevron-down"></use></svg>
                </button>
              </div>
            </div>
            <div class="pf-idbelow">
              <div class="pp-name">{{ store.user.display_name || store.user.username }}</div>
              <div class="pp-user">@{{ store.user.username }}</div>
              <!-- W68: ID público copiable (enlace /app/user/<id>) -->
              <button class="pf-pubid" type="button" v-if="store.user.pub_id"
                :title="t('Copiar ID')" @click="copyMyId">
                <span class="pf-pubid-l">{{ t('ID') }}</span>
                <code class="pf-pubid-v">{{ store.user.pub_id }}</code>
                <svg class="ic ic-sm"><use href="#i-copy"></use></svg>
              </button>
            </div>
            <bio-text v-if="store.user.bio" :text="store.user.bio"></bio-text>
            <div class="pp-rows pf-rows">
              <div class="pp-row" v-if="store.user.created_at"><b>{{ t('Miembro desde') }}</b><span>{{ joinedLine(store.user) }}</span></div>
            </div>
          </div>
        </div>
        <div class="m-foot st-btns">
          <button class="btn btn-full" type="button" @click="edit">
            <svg class="ic ic-sm"><use href="#i-pencil"></use></svg>{{ t('Editar perfil') }}</button>
        </div>
      </div>

      <!-- W60: el menú de estado vive FUERA del modal de perfil, en su
           propia capa fija: nunca se sale de la pantalla ni queda
           recortado por el scroll del perfil. -->
      <div class="pf-status-veil" v-if="menuOpen" @click.self="menuOpen = false">
        <div class="pf-status-menu" role="dialog" :aria-label="t('Estado')" @click.stop>
          <div class="pf-menu-title">
            <span>{{ t('Estado') }}</span>
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="menuOpen = false">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </div>
          <label class="pf-menu-label" for="pf-status-input">{{ t('Mensaje personalizado') }}</label>
          <input id="pf-status-input" class="input pf-status-input" type="text"
            v-model="statusDraft" maxlength="80" :placeholder="t('¿Qué estás haciendo?')"
            @keydown.enter.prevent="saveCustom">
          <div class="pf-menu-meta">
            <span>{{ statusDraft.length }}/80</span>
            <button class="pf-link" type="button" v-if="statusDraft"
              @click="clearCustom" :disabled="statusBusy">{{ t('Quitar mensaje') }}</button>
          </div>
          <div class="pf-menu-presets">
            <button class="pf-preset" type="button" v-for="p in presets" :key="p.val"
              :class="{ on: myPreset === p.val }" :disabled="statusBusy"
              @click="choosePreset(p)">
              <span class="sdot" :class="p.dot"></span>
              <span>{{ t(p.label) }}</span>
              <svg class="ic ic-sm pf-preset-check" v-if="myPreset === p.val"><use href="#i-check"></use></svg>
            </button>
          </div>
          <div class="pf-menu-error" v-if="statusErr" role="alert">{{ statusErr }}</div>
          <button class="btn btn-full pf-menu-save" type="button"
            :disabled="statusBusy" @click="saveCustom">
            {{ statusBusy ? t('Guardando…') : t('Guardar mensaje') }}</button>
          <p class="pf-menu-hint">{{ t('No molestar silencia los avisos; Invisible te deja conectado sin aparecer en línea.') }}</p>
        </div>
      </div>
    </div>`,
};

/* W27b: el formulario (foto + nombre + estado + bio) vive en un modal
   PROPIO; "Tu perfil" solo muestra la ficha y el lápiz entra aquí. */
const MeProfileEditModal = {
  setup: function () {
    const u = store.user || {};
    const name = Vue.ref(u.display_name || '');
    const bio = Vue.ref(u.bio || '');
    const statusText = Vue.ref(u.status_text || '');
    /* W10: todo el mundo tiene estado (como en Discord). El valor vacío
       heredado se abre como En línea y se guarda como tal al guardar. */
    const preset = Vue.ref(u.status_preset || 'online');
    const file = Vue.ref(null);
    const preview = Vue.ref('');
    const hadAvatar = !!u.avatar_url;
    const avatarGone = Vue.ref(false);
    /* W58: portada del perfil (imagen propia, recorte tipo cover). */
    const bannerFile = Vue.ref(null);
    const bannerPreview = Vue.ref('');
    const hadBanner = !!u.banner_url;
    const bannerGone = Vue.ref(false);
    /* W61: foco vertical de la portada. Se puede arrastrar o mover con
       la barra; se guarda en el perfil para todas las vistas. */
    const bannerPos = Vue.ref(bannerPositionOf(u));
    const bannerEl = Vue.ref(null);
    const bannerDragging = Vue.ref(false);
    const bannerPosStyle = Vue.computed(function () {
      return { objectPosition: '50% ' + Math.round(bannerPos.value) + '%' };
    });
    const hasBanner = Vue.computed(function () {
      return !!bannerPreview.value ||
        (!bannerGone.value && !!(store.user && store.user.banner_url));
    });
    const busy = Vue.ref(false);
    const err = Vue.ref('');
    /* W60: el cambio de @usuario vive en un modal APARTE. Aquí solo
       queda el acceso; no se mezcla con nombre, foto, estado y bio. */
    const openUname = function () { store.unameOpen = true; };
    /* W27: al elegir foto se abre el editor (encuadre + rotación); el
       archivo y el preview viejos NO cambian hasta APLICAR. */
    const edSrc = Vue.ref('');
    const edInitial = Vue.ref(null);
    const rawFile = Vue.ref(null);

    const hasPhoto = Vue.computed(function () {
      return !!preview.value ||
        (!avatarGone.value && !!(store.user && store.user.avatar_url));
    });

    const pick = async function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.value = 'Elige una imagen'; return; }
      /* W66c: la foto de perfil pesa hasta 3 MB (el server también). */
      if (f.size > 3 * 1024 * 1024) { err.value = 'La imagen supera los 3 MB'; return; }
      err.value = '';
      /* W66c: GIF o WebP animado → se sube tal cual. El editor (canvas)
         los dejaría quietos en el primer fotograma. rawFile queda para
         que "Ajustar foto" abra este archivo (y aplicar lo aplane, si
         el usuario lo pide). */
      if (f.type === 'image/gif' || await isAnimWebp(f)) {
        if (preview.value) URL.revokeObjectURL(preview.value);
        if (edSrc.value) URL.revokeObjectURL(edSrc.value);
        file.value = f;
        rawFile.value = f;
        edSrc.value = '';
        preview.value = URL.createObjectURL(f);
        avatarGone.value = false;
        return;
      }
      rawFile.value = f;
      if (edSrc.value) URL.revokeObjectURL(edSrc.value);
      edInitial.value = null;          // foto nueva: encuadre fresco
      edSrc.value = URL.createObjectURL(f);
    };

    /* W27: reencuadrar la foto actual (o la última elegida ya cargada);
       el encuadre aplicado antes se restaura (guardado en sesión). */
    const startEdit = function () {
      if (edSrc.value) URL.revokeObjectURL(edSrc.value);
      edInitial.value = cropStateFor('me');
      if (rawFile.value) {
        edSrc.value = URL.createObjectURL(rawFile.value);
      } else if (store.user && store.user.avatar_url) {
        edSrc.value = mediaUrl(store.user.avatar_url);
      }
    };
    const onEdCancel = function () {
      if (edSrc.value) { URL.revokeObjectURL(edSrc.value); edSrc.value = ''; }
    };
    const onEdConfirm = function (blob, st) {
      onEdCancel();
      if (preview.value) URL.revokeObjectURL(preview.value);
      if (st) saveCropState('me', st);
      file.value = new File([blob], 'avatar.png', { type: 'image/png' });
      preview.value = URL.createObjectURL(file.value);
      avatarGone.value = false;
    };

    const pickBanner = function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.value = 'Elige una imagen'; return; }
      /* W66c: la portada también pesa hasta 3 MB (GIF/WebP animados
         se suben tal cual y se ven animados). */
      if (f.size > 3 * 1024 * 1024) { err.value = 'La imagen supera los 3 MB'; return; }
      err.value = '';
      if (bannerPreview.value) URL.revokeObjectURL(bannerPreview.value);
      bannerFile.value = f;
      bannerPreview.value = URL.createObjectURL(f);
      bannerGone.value = false;
      bannerPos.value = 50;          // una portada nueva empieza centrada
    };

    const removeBanner = function () {
      if (!hasBanner.value) return;
      if (bannerPreview.value) URL.revokeObjectURL(bannerPreview.value);
      bannerFile.value = null;
      bannerPreview.value = '';
      bannerGone.value = hadBanner;
      bannerPos.value = 50;
    };

    /* W61: arrastrar la portada (ratón o dedo) para elegir qué franja se
       ve. Arriba muestra la parte superior (0 %), abajo la inferior. */
    const startBannerDrag = function (e) {
      if (!hasBanner.value) return;
      if (e && e.button) return;
      const el = bannerEl.value;
      if (!el) return;
      if (e && e.preventDefault) e.preventDefault();
      const h = Math.max(1, el.getBoundingClientRect().height || 96);
      const y0 = e.clientY;
      const p0 = bannerPos.value;
      bannerDragging.value = true;
      const move = function (ev) {
        const dy = ev.clientY - y0;
        bannerPos.value = Math.max(0, Math.min(100, p0 - (dy / h) * 100));
      };
      const up = function () {
        bannerDragging.value = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };

    const removeAvatar = function () {
      if (!preview.value && !hadAvatar) return;
      /* W17: quitar la foto pide confirmación (es un cambio que se
         aprecia en todo el chat; no debe pasar por accidente). */
      store.confirmBox = {
        title: 'Quitar foto de perfil',
        text: '¿Seguro que quieres quitar tu foto de perfil? Se quitará cuando guardes los cambios.',
        okLabel: 'Quitar foto',
        danger: true,
        onOk: function () {
          if (preview.value) URL.revokeObjectURL(preview.value);
          file.value = null;
          rawFile.value = null;
          preview.value = '';
          if (hadAvatar) avatarGone.value = true;
        },
      };
    };

    Vue.onUnmounted(function () {
      if (preview.value) URL.revokeObjectURL(preview.value);
      if (edSrc.value) URL.revokeObjectURL(edSrc.value);
      if (bannerPreview.value) URL.revokeObjectURL(bannerPreview.value);
    });

    /* Cancelar (o guardar) vuelve a la ficha "Tu perfil". */
    const close = function () {
      store.meEditOpen = false;
      store.meProfileOpen = true;
    };

    const save = async function () {
      err.value = '';
      if (name.value.length > 50) { err.value = 'El nombre supera los 50 caracteres'; return; }
      if (charCount(bio.value) > 300) { err.value = 'La bio supera los 300 caracteres'; return; }
      if (statusText.value.length > 80) { err.value = 'El estado supera los 80 caracteres'; return; }
      busy.value = true;
      try {
        const body = {
          display_name: name.value.trim(),
          bio: bio.value.trim(),
          status_text: statusText.value.trim(),
          status_preset: preset.value,
          banner_position: Math.round(bannerPos.value),
        };
        if (file.value) {
          const up = await uploadMedia(file.value);
          body.avatar_media_id = up.id;
        } else if (avatarGone.value) {
          body.avatar_media_id = null;
        }
        if (bannerFile.value) {
          const upBanner = await uploadMedia(bannerFile.value);
          body.banner_media_id = upBanner.id;
        } else if (bannerGone.value) {
          body.banner_media_id = null;
        }
        const r = await api('PUT', '/auth/profile', body, { retry401: true });
        if (r.user) {
          store.user = Object.assign({}, store.user, r.user);
          session.user = store.user;
          saveSession();
        }
        close();
      } catch (e) {
        err.value = (e && t(e.detail)) || t('No se pudo guardar el perfil');
      } finally {
        busy.value = false;
      }
    };

    return {
      store, name, bio, statusText, preset, preview, hasPhoto, avatarGone,
      bannerPreview, hasBanner, bannerGone, pickBanner, removeBanner,
      bannerPos, bannerPosStyle, bannerDragging, bannerEl, startBannerDrag,
      bioCount: Vue.computed(function () { return charCount(bio.value); }),
      bioMax: 300, maxText: MAX_TEXT_CHARS,
      busy, err, pick, removeAvatar, close, save,
      openUname,   /* W60: modal aparte para el @usuario */
      /* W27: editor de foto (encuadre + rotación); W27b: recuerda el
         encuadre de la sesión */
      edSrc, edInitial, startEdit, onEdConfirm, onEdCancel,
      presets: STATUS_PRESETS, mediaUrl,
      /* W8: la config de la cuenta vive SOLO en el engranaje (Ajustes). */
    };
  },
  components: { AvatarEditor },
  template: `
    <div class="modal-veil" :class="{ 'veil-cropping': !!edSrc }" @click.self="close">
      <div class="modal meprof mp-edit" :class="{ 'is-cropping': !!edSrc }"
        role="dialog" :aria-label="t('Editar perfil')">
        <header>{{ edSrc ? t('Ajustar foto') : t('Editar perfil') }}
          <button class="icon-btn" type="button" :title="t('Cerrar')"
            @click="edSrc ? onEdCancel() : close()">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="mp-body">
          <!-- W58: portada del perfil. Se sube tal cual y se muestra
               como cover; no hay recorte para no añadir otro editor. -->
          <div class="pf-edit-banner" v-if="!edSrc">
            <div class="pf-edit-banner-img" ref="bannerEl"
              :class="{ 'is-empty': !hasBanner, 'can-drag': hasBanner, 'is-dragging': bannerDragging }"
              @pointerdown="startBannerDrag">
              <img v-if="bannerPreview" :src="bannerPreview" :style="bannerPosStyle"
                alt="" draggable="false">
              <img v-else-if="hasBanner && store.user && store.user.banner_url"
                :src="mediaUrl(store.user.banner_url)" :style="bannerPosStyle"
                alt="" draggable="false">
              <span v-else class="pf-banner-art" aria-hidden="true">
                <svg class="fox"><use href="#i-logo-mark"></use></svg>
              </span>
              <span class="pf-pos-hint" v-if="hasBanner">{{ t('Arrastra para encuadrar') }}</span>
            </div>
            <!-- W59: la foto va MONTADA sobre la portada, no debajo.
                 Mientras se recorta se oculta y manda el editor. -->
            <div class="avatar-pick" v-if="!edSrc">
              <div class="av-img" :class="{ 'has-photo': !!preview || !!(hasPhoto && store.user && store.user.avatar_url) }">
                <img v-if="preview" :src="preview" alt="">
                <img v-else-if="hasPhoto && store.user && store.user.avatar_url"
                  :src="mediaUrl(store.user.avatar_url)" alt="">
                <span v-else class="avatar-initial">{{ (store.user.display_name || store.user.username || '?').charAt(0).toUpperCase() }}</span>
              </div>
              <label class="av-btn" :title="t('Elegir foto')">
                <svg class="ic ic-sm"><use href="#i-image"></use></svg>
                <input type="file" accept="image/*" style="display:none" @change="pick">
              </label>
              <button v-if="hasPhoto" type="button" class="av-edit" :title="t('Ajustar foto')" @click="startEdit">
                <svg class="ic ic-sm"><use href="#i-pencil"></use></svg>
              </button>
              <button v-if="hasPhoto" type="button" class="av-clear" @click="removeAvatar" :aria-label="t('Quitar foto')">
                <svg class="ic ic-sm"><use href="#i-x"></use></svg>
              </button>
            </div>
            <div class="pf-edit-banner-actions">
              <label class="btn btn-ghost btn-sm">
                <svg class="ic ic-sm"><use href="#i-image"></use></svg>
                {{ t('Cambiar portada') }}
                <input class="pf-banner-input" type="file" accept="image/*" style="display:none" @change="pickBanner">
              </label>
              <button class="btn btn-ghost btn-sm" type="button" v-if="hasBanner"
                @click="removeBanner">{{ t('Quitar portada') }}</button>
            </div>
            <div class="pf-pos-row" v-if="hasBanner">
              <label for="pf-banner-pos">{{ t('Posición de la portada') }}</label>
              <input id="pf-banner-pos" class="pf-pos-range" type="range"
                min="0" max="100" step="1" v-model.number="bannerPos">
              <span class="pf-pos-val">{{ Math.round(bannerPos) }}%</span>
            </div>
          </div>
          <!-- W27: con el editor abierto ocupa el centro; al aplicar
               vuelve la ficha con el recorte ya aplicado -->
          <avatar-editor v-if="edSrc" :src="edSrc" :initial="edInitial"
            @confirm="onEdConfirm" @cancel="onEdCancel"></avatar-editor>
          <template v-if="!edSrc">
            <div class="form-err st-err" v-if="err" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
            </div>
            <div class="field">
              <label>{{ t('Nombre') }}</label>
              <input class="input" v-model.trim="name" maxlength="50" :placeholder="t('Tu nombre')">
            </div>
            <!-- W60: el @usuario se cambia en un modal APARTE, con
                 advertencia y contraseña. El botón Guardar NO lo toca. -->
            <div class="field uname-field">
              <label>{{ t('Usuario') }}</label>
              <div class="uname-current">
                <span class="uname-at">@</span>
                <b>{{ store.user && store.user.username }}</b>
                <button class="btn btn-ghost btn-sm" type="button" @click="openUname">
                  {{ t('Cambiar usuario') }}</button>
              </div>
              <p class="st-hint">{{ t('Sirve para iniciar sesión y para que te mencionen con @.') }}</p>
            </div>
            <div class="field">
              <label>{{ t('Estado') }}</label>
              <input class="input" v-model.trim="statusText" maxlength="80" :placeholder="t('jugando a algo…')">
            </div>
            <div class="mp-presets">
              <button class="ap-chip" type="button" v-for="p in presets" :key="p.val"
                :class="{ on: preset === p.val }" @click="preset = p.val"><span
                class="sdot" :class="p.dot"></span>{{ t(p.label) }}</button>
            </div>
            <p class="st-hint mp-preset-hint">{{ t('No molestar silencia los avisos; solo las menciones directas (@usuario) te avisan. Invisible te deja conectado sin aparecer en línea.') }}</p>
            <div class="field">
              <label>Bio</label>
              <textarea class="input" v-model.trim="bio" maxlength="300" rows="3"
                :placeholder="t('Cuéntanos algo sobre ti…')"></textarea>
              <div class="pf-bio-count">{{ bioCount }}/300</div>
              <p class="st-hint">{{ t('Se muestra con') }} <b>markdown</b>: {{ t('**negrita**, *cursiva*, \`código\`, ~~tachado~~ y [links](https://…)') }}</p>
            </div>
          </template>
        </div>
        <div class="m-foot st-btns" v-if="!edSrc">
          <button class="btn btn-ghost" type="button" @click="close" :disabled="busy">{{ t('Cancelar') }}</button>
          <button class="btn" type="button" @click="save" :disabled="busy">
            {{ busy ? t('Guardando…') : t('Guardar') }}</button>
        </div>
      </div>
    </div>`,
};

/* ------------------------------------------------ UsernameModal (W60) */

/* El @usuario se cambia en un modal propio: el perfil (nombre, foto,
   estado, bio) se guarda aparte y el cambio de usuario exige contraseña
   y espera 12 horas. */
const UsernameModal = {
  setup: function () {
    const UNAME_WAIT = 12 * 60 * 60;
    const name = Vue.ref((store.user && store.user.username) || '');
    const pw = Vue.ref('');
    const err = Vue.ref('');
    const busy = Vue.ref(false);
    const nameEl = Vue.ref(null);
    const clock = Vue.ref(Date.now());
    let timer = null;

    const changedAt = Vue.computed(function () {
      return Number(store.user && store.user.username_changed_at) || 0;
    });
    const locked = Vue.computed(function () {
      return clock.value < changedAt.value * 1000 + UNAME_WAIT * 1000;
    });
    const lockText = Vue.computed(function () {
      const secs = Math.max(0,
        changedAt.value + UNAME_WAIT - Math.floor(clock.value / 1000));
      let h = Math.floor(secs / 3600);
      let m = Math.ceil((secs % 3600) / 60);
      if (m >= 60) { h += 1; m = 0; }
      return t('Podrás cambiarlo en {h} h {m} min.', { h: h, m: m });
    });
    const canSave = Vue.computed(function () {
      return !locked.value && !!name.value.trim() && !!pw.value;
    });

    const close = function () {
      if (busy.value) return;
      store.unameOpen = false;
      pw.value = '';
      err.value = '';
    };

    const submit = async function () {
      if (locked.value) return;
      err.value = '';
      const val = String(name.value || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.]{2,19}$/.test(val)) {
        err.value = t('Usuario: 3-20 caracteres, letras/números/punto/guion bajo, empieza alfanumérico');
        return;
      }
      if (store.user && val === store.user.username) {
        err.value = t('Ese ya es tu usuario actual');
        return;
      }
      if (!pw.value) {
        err.value = t('Escribe tu contraseña actual');
        return;
      }
      busy.value = true;
      try {
        const r = await api('PUT', '/auth/username',
          { username: val, password: pw.value }, { retry401: true });
        if (r.user) {
          store.user = Object.assign({}, store.user, r.user);
          session.user = store.user;
          saveSession();
        }
        store.unameOpen = false;
        pw.value = '';
        toast(t('Usuario actualizado') + ': @' + val, 'ok');
      } catch (e) {
        err.value = (e && t(e.detail)) || t('No se pudo cambiar el usuario');
      } finally {
        busy.value = false;
      }
    };

    Vue.onMounted(function () {
      timer = setInterval(function () { clock.value = Date.now(); }, 30000);
      Vue.nextTick(function () {
        if (!locked.value && nameEl.value) nameEl.value.focus();
      });
    });
    Vue.onUnmounted(function () {
      if (timer) clearInterval(timer);
    });

    return {
      store, t, name, pw, err, busy, nameEl, locked, lockText, canSave,
      close, submit,
    };
  },
  template: `
    <div class="modal-veil" @click.self="close">
      <div class="modal confirm uname-modal" role="dialog" aria-modal="true"
        :aria-label="t('Cambiar nombre de usuario')">
        <header>
          <span>{{ t('Cambiar nombre de usuario') }}</span>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="cf-body">
          <p class="cf-text">{{ t('Tu @usuario sirve para iniciar sesión y para que te mencionen. Se puede cambiar una vez cada 12 horas.') }}</p>

          <div class="uname-current uname-current-lg">
            <span class="uname-at">@</span>
            <b>{{ store.user && store.user.username }}</b>
          </div>

          <div class="uname-wait" v-if="locked">
            <svg class="ic ic-sm"><use href="#i-clock"></use></svg>
            <span>{{ lockText }}</span>
          </div>

          <template v-if="!locked">
            <div class="uname-warn">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg>
              <span>{{ t('Solo puedes cambiarlo una vez cada 12 horas. Las menciones con @ a tu usuario anterior dejarán de funcionar.') }}</span>
            </div>
            <div class="field">
              <label>{{ t('Nuevo usuario') }}</label>
              <input class="input" ref="nameEl" v-model.trim="name" maxlength="20"
                autocomplete="username" spellcheck="false"
                :placeholder="t('3-20 caracteres, empieza con letra o número')">
              <p class="st-hint">{{ t('Minúsculas, números, punto y guion bajo; empieza con letra o número.') }}</p>
            </div>
            <div class="field">
              <label>{{ t('Contraseña actual') }}</label>
              <input class="input" type="password" v-model="pw"
                autocomplete="current-password" :placeholder="t('Para confirmar el cambio')"
                @keydown.enter.prevent="submit">
            </div>
            <div class="form-err st-err" v-if="err" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg>
              <span>{{ err }}</span>
            </div>
          </template>
        </div>
        <div class="m-foot st-btns">
          <button class="btn btn-ghost" type="button" :disabled="busy" @click="close">
            {{ t('Cancelar') }}</button>
          <button class="btn" type="button" v-if="!locked" :disabled="busy || !canSave"
            @click="submit">
            {{ busy ? t('Cambiando…') : t('Cambiar usuario') }}</button>
        </div>
      </div>
    </div>`,
};

/* -------------------------------------------------- PermissionGate (W58) */

const PermissionGate = {
  setup: function () {
    return { store, grantCurrent, skipCurrent, openCurrentSettings };
  },
  template: `
    <div class="perm-gate" v-if="store.permGate" role="dialog" aria-modal="true"
      :aria-label="store.permGate.title">
      <div class="perm-card">
        <div class="perm-step" v-if="store.permGate.total > 1">
          {{ t('Permiso {n} de {total}', { n: store.permGate.index, total: store.permGate.total }) }}
        </div>
        <div class="perm-icon">
          <svg class="ic"><use :href="'#' + store.permGate.icon"></use></svg>
        </div>
        <h2>{{ store.permGate.title }}</h2>
        <p>{{ store.permGate.text }}</p>
        <div class="perm-error" v-if="store.permGate.error" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg>
          <span>{{ store.permGate.error }}</span>
        </div>
        <div class="perm-actions">
          <button class="btn btn-ghost" type="button" :disabled="store.permGate.busy"
            @click="skipCurrent">{{ t('Saltar por ahora') }}</button>
          <button class="btn" type="button" :disabled="store.permGate.busy"
            @click="grantCurrent">{{ store.permGate.busy ? t('Solicitando…') : t('Conceder') }}</button>
        </div>
        <button class="perm-settings" type="button"
          v-if="store.permGate.native && store.permGate.state === 'denied'"
          @click="openCurrentSettings">{{ t('Abrir ajustes del sistema') }}</button>
      </div>
    </div>`,
};

/* --------------------------------------------------------- ConfirmBox */

const ConfirmBox = {
  setup: function () {
    const uname = Vue.ref('');
    const pw = Vue.ref('');

    const okDisabled = Vue.computed(function () {
      const b = store.confirmBox;
      if (!b || b.busy) return true;
      if (b.requireUser) {
        const me = store.user ? store.user.username : '';
        if (uname.value.trim().toLowerCase() !== me) return true;
      }
      if (b.requirePassword && !pw.value) return true;
      return false;
    });

    const cancel = function () {
      if (store.confirmBox && !store.confirmBox.busy) store.confirmBox = null;
    };

    const confirm = async function () {
      const b = store.confirmBox;
      if (!b || okDisabled.value) return;
      b.busy = true;
      b.error = '';
      try {
        await b.onOk({ username: uname.value.trim(), password: pw.value });
      } catch (e) {
        if (store.confirmBox === b) {
          b.busy = false;
          b.error = (e && t(e.detail)) || t('No se pudo completar la acción');
        }
        return;
      }
      if (store.confirmBox === b) store.confirmBox = null;
    };

    return { store, uname, pw, okDisabled, cancel, confirm };
  },
  template: `
    <div class="modal-veil" @click.self="cancel">
      <div class="modal confirm" role="alertdialog" :aria-label="t(store.confirmBox.title)">
        <header>{{ t(store.confirmBox.title) }}</header>
        <div class="cf-body">
          <p class="cf-text">{{ t(store.confirmBox.text) }}</p>
          <div class="field" v-if="store.confirmBox.requireUser">
            <label>{{ t('Escribe tu usuario para confirmar') }}</label>
            <input class="input" v-model.trim="uname"
              :placeholder="'@' + (store.user ? store.user.username : '')" autocomplete="off">
          </div>
          <div class="field" v-if="store.confirmBox.requirePassword">
            <label>{{ t('Contraseña') }}</label>
            <input class="input" type="password" v-model="pw" autocomplete="current-password">
          </div>
          <div class="form-err st-err" v-if="store.confirmBox.error" role="alert">
            <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(store.confirmBox.error) }}</span>
          </div>
        </div>
        <div class="m-foot st-btns">
          <button class="btn btn-ghost" type="button" :disabled="store.confirmBox.busy" @click="cancel">
            {{ t('Cancelar') }}</button>
          <button class="btn" :class="{ 'btn-danger': store.confirmBox.danger }" type="button"
            :disabled="okDisabled" @click="confirm">
            {{ store.confirmBox.busy ? t('Un momento…') : t(store.confirmBox.okLabel || 'Confirmar') }}</button>
        </div>
      </div>
    </div>`,
};

/* ----------------------------------------------------- ReadsBox (W28f)

   "Visto por": lista de miembros que ya leyeron un mensaje mío en un
   grupo. No hay eventos en vivo: se carga al abrir (y el header lleva
   el recuento "N"). */

const ReadsBox = {
  setup: function () {
    const close = function () { store.readsBox = null; };
    return { store, close, mediaUrl };
  },
  template: `
    <div class="modal-veil" v-if="store.readsBox" @click.self="close" role="dialog" :aria-label="t('Visto por')">
      <div class="modal reads-box">
        <header>{{ t('Visto por') }}<i v-if="store.readsBox.rows"> ({{ store.readsBox.rows.length }})</i>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="pp-loading" v-if="store.readsBox.loading">{{ t('Cargando…') }}</div>
        <div class="pp-loading" v-else-if="store.readsBox.error">{{ t(store.readsBox.error) }}</div>
        <div class="pp-loading" v-else-if="!store.readsBox.rows || !store.readsBox.rows.length">{{ t('Nadie lo ha leído todavía') }}</div>
        <ul class="reads-list" v-else>
          <li class="mi-row" v-for="u in store.readsBox.rows" :key="u.id">
            <span class="avatar av36" :class="{ 'has-photo': !!u.avatar_url }">
              <img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">
              <span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>
            </span>
            <span class="mi-col">
              <span class="mi-name">{{ u.display_name || u.username }}</span>
              <span class="mi-sub">@{{ u.username }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>`,
};

/* W60: banner difuminado PREPROCESADO. Se reduce la portada a 48x27 en
   un canvas y se cachea como data URL; el CSS solo escala esa imagen
   diminuta y le aplica un blur barato (nada de backdrop-filter). */
const callBlurCache = {};
function callBlurBanner(url, position) {
  if (!url) return Promise.resolve('');
  const pos = Math.max(0, Math.min(100, Number(position) || 50));
  const cacheKey = url + '|' + pos;
  if (callBlurCache[cacheKey] !== undefined) {
    return Promise.resolve(callBlurCache[cacheKey]);
  }
  return new Promise(function (resolve) {
    let done = false;
    const finish = function (v) {
      if (done) return;
      done = true;
      callBlurCache[cacheKey] = v;
      resolve(v);
    };
    const img = new Image();
    img.onload = function () {
      try {
        const c = document.createElement('canvas');
        c.width = 48;
        c.height = 27;
        const ctx = c.getContext('2d');
        const sw = img.naturalWidth || img.width || 1;
        const sh = img.naturalHeight || img.height || 1;
        const scale = Math.max(48 / sw, 27 / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        ctx.drawImage(img, (48 - dw) / 2, (27 - dh) * (pos / 100), dw, dh);
        finish(c.toDataURL('image/jpeg', 0.55));
      } catch (e) {
        finish('');
      }
    };
    img.onerror = function () { finish(''); };
    img.src = mediaUrl(url);
  });
}

const CallBox = {
  setup: function () {
    const elapsed = Vue.ref('00:00');
    const remoteEl = Vue.ref(null);
    const pipEl = Vue.ref(null);
    const minimized = Vue.ref(false);
    const callText = Vue.ref('');
    const chatListEl = Vue.ref(null);
    const peerBg = Vue.ref('');
    const myBg = Vue.ref('');
    const peerSpeak = Vue.ref(false);
    const mySpeak = Vue.ref(false);
    const remoteMuted = Vue.ref(false);
    const menu = Vue.ref(null);
    /* W61: la burbuja minimizada se puede arrastrar a cualquier parte. */
    const fabEl = Vue.ref(null);
    const fabDragging = Vue.ref(false);
    const fabPos = Vue.ref(null);        // {left, top} en píxeles
    let fabDragEnd = 0;
    /* W62: ventana de llamada arrastrable, limitada al viewport, con
       modo pantalla completa y mosaico para grupos. */
    const panelEl = Vue.ref(null);
    const panelPos = Vue.ref(null);      // {left, top, width, height}
    const panelDragging = Vue.ref(false);
    const full = Vue.ref(false);
    const peerBgs = Vue.reactive({});
    const peerBgKeys = {};
    const peerMutedMap = Vue.reactive({});
    let timer = null;
    let speakTimer = null;
    let audioCtx = null;
    let anLocal = null;
    let anRemote = null;
    let lastLocal = null;
    let lastRemote = null;
    let peerBanner = null;
    let myBanner = null;

    const fmt = function (ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    };
    const retick = function () {
      const c = store.call;
      elapsed.value = (c && c.startedAt) ? fmt(Date.now() - c.startedAt) : '00:00';
    };

    const peer = function () { return store.call ? store.call.peer : null; };
    const isGroup = function () { return !!(store.call && store.call.group); };
    const groupPeerList = Vue.computed(function () {
      const c = store.call;
      if (!c || !c.group) return [];
      const list = c.peers || [];
      if (!list.length && c.state === 'incoming' && c.peer) {
        return [Object.assign({}, c.peer, { video: false, placeholder: true })];
      }
      return list;
    });
    const callTitle = function () {
      const c = store.call;
      if (!c) return t('Llamada');
      if (c.group) return c.chatName || t('Llamada de grupo');
      return peerName() || t('Llamada');
    };
    const participantCount = function () {
      const c = store.call;
      if (!c || !c.group) return 0;
      return (groupPeerList.value.length || 0) + (c.state === 'incoming' ? 0 : 1);
    };
    const peerNameOf = function (p) {
      if (!p) return '';
      return p.display_name || p.username || '';
    };
    const peerIniOf = function (p) {
      return (peerNameOf(p) || '?').charAt(0).toUpperCase();
    };
    const peerAvatarOf = function (p) {
      return p && p.avatar_url ? mediaUrl(p.avatar_url) : '';
    };
    const peerHasVideo = function (p) { return !!(p && p.video); };
    const peerBgOf = function (p) {
      return p && peerBgs[p.id] ? peerBgs[p.id] : '';
    };
    const ensurePeerBgs = function () {
      if (!isGroup()) return;
      const list = groupPeerList.value;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p || !p.id) continue;
        const key = (p.banner_url || '') + '|' + bannerPositionOf(p);
        if (peerBgKeys[p.id] === key) continue;
        peerBgKeys[p.id] = key;
        peerBgs[p.id] = '';
        if (!p.banner_url) continue;
        (function (pid) {
          callBlurBanner(p.banner_url, bannerPositionOf(p)).then(function (u) {
            if (peerBgs[pid] !== undefined) peerBgs[pid] = u;
          });
        })(p.id);
      }
    };
    /* W61: respaldo para señales antiguas que solo traían nombre. Si el
       peer no trae avatar/portada, se completa con su perfil público. */
    let peerFetch = '';
    const ensurePeerProfile = function () {
      if (isGroup()) return;
      const p = peer();
      if (!p || !p.username) return;
      if (p.avatar_url && p.banner_url) return;
      const key = (p.id || 0) + '|' + p.username;
      if (peerFetch === key) return;
      peerFetch = key;
      api('GET', '/users/' + encodeURIComponent(p.username))
        .then(function (r) {
          if (r && r.user && store.call && store.call.peer) {
            store.call.peer = Object.assign({}, store.call.peer, r.user);
          }
        })
        .catch(function () {});
    };
    const peerName = function () {
      const p = peer();
      if (!p) return '';
      return p.display_name || p.username || '';
    };
    const peerIni = function () { return (peerName() || '?').charAt(0).toUpperCase(); };
    const peerAvatar = function () {
      const p = peer();
      return p && p.avatar_url ? mediaUrl(p.avatar_url) : '';
    };
    const myAvatar = function () {
      return store.user && store.user.avatar_url ? mediaUrl(store.user.avatar_url) : '';
    };
    const myIni = function () {
      const u = store.user || {};
      return String(u.display_name || u.username || '?').charAt(0).toUpperCase();
    };
    const isIncoming = function () {
      return !!(store.call && store.call.state === 'incoming');
    };
    const inCall = function () {
      const c = store.call;
      return !!c && (c.state === 'connecting' || c.state === 'active');
    };
    const hasVideo = function () {
      return !!(store.call && store.call.remoteVideo);
    };
    const selfCamOn = function () {
      const c = store.call;
      return !!(c && (c.screen || (c.hasCam && !c.camOff)));
    };
    const canScreenShare = function () {
      const c = store.call;
      if (!c || !c.hasCam) return false;
      try {
        return !!(navigator.mediaDevices &&
          typeof navigator.mediaDevices.getDisplayMedia === 'function');
      } catch (e) { return false; }
    };
    const toggleScreen = function () {
      if (store.call && store.call.screen) stopScreenShare();
      else shareScreen();
    };
    const stateLine = function () {
      const c = store.call;
      if (!c) return '';
      if (c.state === 'incoming') return t('Llamada entrante');
      if (c.state === 'outgoing') return t('Llamando…');
      if (c.state === 'connecting') return t('Conectando…');
      if (c.group && !(c.peers || []).length) {
        return t('Esperando a que se unan');
      }
      return elapsed.value;
    };
    const bgStyle = function (data) {
      return data ? { backgroundImage: 'url(' + data + ')' } : {};
    };

    const makeBgs = function () {
      if (isGroup()) ensurePeerBgs();
      const p = peer();
      const b = p && p.banner_url ? p.banner_url : '';
      const bp = p ? bannerPositionOf(p) : 50;
      if (b + '|' + bp !== peerBanner) {
        peerBanner = b + '|' + bp;
        peerBg.value = '';
        callBlurBanner(b, bp).then(function (u) { peerBg.value = u; });
      }
      const mb = store.user && store.user.banner_url ? store.user.banner_url : '';
      const mp = bannerPositionOf(store.user);
      if (mb + '|' + mp !== myBanner) {
        myBanner = mb + '|' + mp;
        myBg.value = '';
        callBlurBanner(mb, mp).then(function (u) { myBg.value = u; });
      }
    };

    const scrollChat = function (force) {
      const el = chatListEl.value;
      if (!el) return;
      if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 64) {
        el.scrollTop = el.scrollHeight;
      }
    };

    /* W60: aro verde al hablar. Se analiza la forma de onda del micrófono
       local y del flujo remoto SIN conectarlos a la salida (no hay eco). */
    const bindAudio = function (local, remote) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) {
        try { audioCtx = new AC(); } catch (e) { return; }
      }
      if (audioCtx.state === 'suspended') {
        try {
          const pr = audioCtx.resume();
          if (pr && pr.catch) pr.catch(function () {});
        } catch (e) {}
      }
      const wire = function (stream, side) {
        if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return;
        const prev = side === 'local' ? lastLocal : lastRemote;
        if (prev === stream) return;
        try {
          const src = audioCtx.createMediaStreamSource(stream);
          const an = audioCtx.createAnalyser();
          an.fftSize = 256;
          an.smoothingTimeConstant = 0.65;
          src.connect(an);
          if (side === 'local') {
            anLocal = an;
            lastLocal = stream;
          } else {
            anRemote = an;
            lastRemote = stream;
          }
        } catch (e) {}
      };
      wire(local, 'local');
      wire(remote, 'remote');
    };

    const levelOf = function (an) {
      if (!an) return 0;
      try {
        const arr = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(arr);
        let peak = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = Math.abs(arr[i] - 128);
          if (v > peak) peak = v;
        }
        return peak;
      } catch (e) { return 0; }
    };
    const pollSpeaking = function () {
      let remote = getRemoteStream();
      if (store.call && store.call.group) {
        const list = store.call.peers || [];
        remote = null;
        for (let i = 0; i < list.length; i++) {
          if (list[i].connected) { remote = getPeerStream(list[i].id); break; }
        }
        if (!remote && list.length) remote = getPeerStream(list[0].id);
      }
      bindAudio(getLocalStream(), remote);
      const c = store.call;
      mySpeak.value = levelOf(anLocal) > 7 && !(c && c.muted);
      peerSpeak.value = levelOf(anRemote) > 7 && !remoteMuted.value;
    };

    const attach = function () {
      const group = isGroup();
      const st = getRemoteStream();
      const st2 = getLocalPreviewStream();
      if (remoteEl.value) {
        if (st && remoteEl.value.srcObject !== st) {
          remoteEl.value.srcObject = st;
          try {
            const p = remoteEl.value.play();
            if (p && typeof p.catch === 'function') p.catch(function () {});
          } catch (e) {}
        }
        remoteEl.value.muted = remoteMuted.value;
      }
      if (pipEl.value) {
        if (st2 && pipEl.value.srcObject !== st2) {
          pipEl.value.srcObject = st2;
          try {
            const p2 = pipEl.value.play();
            if (p2 && typeof p2.catch === 'function') p2.catch(function () {});
          } catch (e) {}
        }
        pipEl.value.muted = true;
      }
      if (group && panelEl.value) {
        const vids = panelEl.value.querySelectorAll('video[data-peer]');
        for (let i = 0; i < vids.length; i++) {
          const el = vids[i];
          const pid = Number(el.getAttribute('data-peer'));
          const pst = getPeerStream(pid);
          if (pst && el.srcObject !== pst) {
            el.srcObject = pst;
            try {
              const pr = el.play();
              if (pr && typeof pr.catch === 'function') pr.catch(function () {});
            } catch (e) {}
          }
          el.muted = !!peerMutedMap[pid];
        }
      }
      let remoteAudio = st;
      if (group && store.call) {
        const list = store.call.peers || [];
        remoteAudio = null;
        for (let i = 0; i < list.length; i++) {
          if (list[i].connected) {
            remoteAudio = getPeerStream(list[i].id);
            if (remoteAudio) break;
          }
        }
        if (!remoteAudio && list.length) remoteAudio = getPeerStream(list[0].id);
      }
      bindAudio(getLocalStream(), remoteAudio);
      scrollChat(false);
    };

    const callMessages = Vue.computed(function () {
      const c = store.call;
      if (!c) return [];
      const all = store.msgs[c.chatId] || [];
      const out = [];
      const meId = store.user ? store.user.id : 0;
      for (let i = 0; i < all.length; i++) {
        const m = all[i];
        if (m.kind === 'system') continue;
        let txt = '';
        if (m.kind === 'image') txt = t('Imagen');
        else if (m.kind === 'voice') txt = t('Nota de voz');
        else if (m.kind === 'file') {
          txt = m.media && /^video\//.test(m.media.mime || '') ? t('Video') : t('Archivo');
        } else if (m.kind === 'gif') txt = t('GIF');
        else txt = m.body || '' || '';
        if (!txt) continue;
        const mine = !!(m.sender && meId && m.sender.id === meId);
        const nm = m.sender
          ? (m.sender.display_name || m.sender.username || '')
          : (mine && store.user ? (store.user.display_name || store.user.username) : '');
        out.push({
          id: m.id,
          key: 'cm' + m.id,
          txt: txt,
          mine: mine,
          name: nm,
          time: m.created_at ? fmtTime(new Date(m.created_at * 1000)) : '',
        });
      }
      return out.slice(-40);
    });

    const sendChat = function () {
      const c = store.call;
      const text = callText.value.trim();
      if (!c || !text) return;
      callText.value = '';
      sendText(c.chatId, text).catch(function (e) {
        toastErr(e, 'No se pudo enviar el mensaje');
      });
      Vue.nextTick(function () { scrollChat(true); });
    };

    const closeMenu = function () { menu.value = null; };
    const openMenu = function (ev, who) {
      const w = 210;
      const h = 190;
      const x = Math.max(8, Math.min(ev.clientX, (window.innerWidth || 360) - w - 8));
      const y = Math.max(8, Math.min(ev.clientY, (window.innerHeight || 640) - h - 8));
      menu.value = { x: x, y: y, who: who };
    };
    const menuThen = function (fn) {
      menu.value = null;
      if (typeof fn === 'function') fn();
    };
    const menuPeer = function () {
      if (!menu.value) return null;
      if (menu.value.who === 'peer') return peer();
      const who = String(menu.value.who || '');
      if (who.indexOf('p:') === 0) {
        const id = Number(who.slice(2));
        const list = store.call && store.call.peers ? store.call.peers : [];
        for (let i = 0; i < list.length; i++) {
          if (Number(list[i].id) === id) return list[i];
        }
        if (store.call && store.call.peer && Number(store.call.peer.id) === id) {
          return store.call.peer;
        }
      }
      return null;
    };
    const menuPeerMuted = Vue.computed(function () {
      const p = menuPeer();
      if (!p) return false;
      if (menu.value && menu.value.who === 'peer') return remoteMuted.value;
      return !!peerMutedMap[p.id];
    });
    const viewPeer = function () {
      const p = menuPeer();
      menu.value = null;
      if (p && p.username) openProfile(p.username);
    };
    const toggleRemoteMute = function () {
      const p = menuPeer();
      const isGroupPeer = !!(menu.value && String(menu.value.who).indexOf('p:') === 0);
      menu.value = null;
      if (isGroupPeer && p) {
        peerMutedMap[p.id] = !peerMutedMap[p.id];
        if (panelEl.value) {
          const el = panelEl.value.querySelector('video[data-peer="' + p.id + '"]');
          if (el) el.muted = !!peerMutedMap[p.id];
        }
        return;
      }
      remoteMuted.value = !remoteMuted.value;
      if (remoteEl.value) remoteEl.value.muted = remoteMuted.value;
      if (remoteMuted.value) peerSpeak.value = false;
    };

    const minimize = function () {
      menu.value = null;
      full.value = false;
      minimized.value = true;
    };
    const restore = function () { minimized.value = false; };

    const panelStyle = Vue.computed(function () {
      const p = panelPos.value;
      if (!p || full.value) return {};
      return {
        left: p.left + 'px', top: p.top + 'px',
        width: p.width + 'px', height: p.height + 'px',
        right: 'auto', bottom: 'auto',
      };
    });
    const clampPanel = function () {
      const p = panelPos.value;
      if (!p || full.value) return;
      const m = 6;
      const vw = window.innerWidth || 360;
      const vh = window.innerHeight || 640;
      const w = Math.min(p.width, vw - m * 2);
      const h = Math.min(p.height, vh - m * 2);
      panelPos.value = {
        left: Math.max(m, Math.min(p.left, vw - w - m)),
        top: Math.max(m, Math.min(p.top, vh - h - m)),
        width: w, height: h,
      };
    };
    const startPanelDrag = function (e) {
      if (!e || e.button) return;
      if (full.value || minimized.value) return;
      if (window.innerWidth <= 760) return;
      if (e.target && e.target.closest && e.target.closest('button, input')) return;
      const el = panelEl.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const w = r.width;
      const h = r.height;
      let moved = false;
      e.preventDefault();
      panelDragging.value = true;
      const move = function (ev) {
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
        moved = true;
        const m = 6;
        const vw = window.innerWidth || 360;
        const vh = window.innerHeight || 640;
        panelPos.value = {
          left: Math.max(m, Math.min(r.left + (ev.clientX - x0), vw - w - m)),
          top: Math.max(m, Math.min(r.top + (ev.clientY - y0), vh - h - m)),
          width: w, height: h,
        };
      };
      const up = function () {
        panelDragging.value = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
    const toggleFull = function () {
      full.value = !full.value;
      if (!full.value) Vue.nextTick(clampPanel);
    };

    const fabStyle = Vue.computed(function () {
      const p = fabPos.value;
      if (!p) return {};
      return { left: p.left + 'px', top: p.top + 'px', right: 'auto', bottom: 'auto' };
    });
    const clampFab = function () {
      const p = fabPos.value;
      if (!p) return;
      const size = 62;
      const m = 6;
      fabPos.value = {
        left: Math.max(m, Math.min(p.left, (window.innerWidth || 360) - size - m)),
        top: Math.max(m, Math.min(p.top, (window.innerHeight || 640) - size - m)),
      };
    };
    const startFabDrag = function (e) {
      if (e && e.button) return;
      const el = fabEl.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let moved = false;
      fabDragging.value = true;
      const move = function (ev) {
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
        moved = true;
        const size = 62;
        const m = 6;
        fabPos.value = {
          left: Math.max(m, Math.min(r.left + (ev.clientX - x0),
            (window.innerWidth || 360) - size - m)),
          top: Math.max(m, Math.min(r.top + (ev.clientY - y0),
            (window.innerHeight || 640) - size - m)),
        };
      };
      const up = function () {
        fabDragging.value = false;
        if (moved) fabDragEnd = Date.now();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
    const fabClick = function () {
      /* Un arrastre no debe restaurar la llamada al soltar. */
      if (Date.now() - fabDragEnd < 400) return;
      restore();
    };

    Vue.onMounted(function () {
      retick();
      timer = setInterval(retick, 1000);
      speakTimer = setInterval(pollSpeaking, 250);
      setTimeout(attach, 0);
      makeBgs();
      ensurePeerProfile();
      document.addEventListener('click', closeMenu);
      document.addEventListener('keydown', closeMenu);
      window.addEventListener('resize', clampFab);
      window.addEventListener('resize', clampPanel);
    });
    Vue.onUpdated(function () {
      attach();
      makeBgs();
      ensurePeerProfile();
    });
    Vue.onUnmounted(function () {
      if (timer) clearInterval(timer);
      if (speakTimer) clearInterval(speakTimer);
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('keydown', closeMenu);
      window.removeEventListener('resize', clampFab);
      window.removeEventListener('resize', clampPanel);
      if (audioCtx) {
        try { audioCtx.close(); } catch (e) {}
      }
    });
    Vue.watch(inCall, function (v) {
      if (v) Vue.nextTick(function () { scrollChat(true); });
    });

    return {
      store, t, remoteEl, pipEl, elapsed, minimized, callText, chatListEl,
      peerBg, myBg, peerSpeak, mySpeak, remoteMuted, menu,
      fabEl, fabStyle, fabDragging, startFabDrag, fabClick,
      peerName, peerIni, peerAvatar, myAvatar, myIni,
      isGroup, groupPeerList, callTitle, participantCount,
      peerNameOf, peerIniOf, peerAvatarOf, peerHasVideo, peerBgOf,
      peerMutedMap,
      panelEl, panelStyle, panelDragging, startPanelDrag, full, toggleFull,
      canScreenShare, toggleScreen,
      isIncoming, inCall, hasVideo, selfCamOn, stateLine, bgStyle,
      callMessages, sendChat, scrollChat,
      openMenu, menuThen, viewPeer, toggleRemoteMute, menuPeer, menuPeerMuted,
      minimize, restore,
      accept: acceptCall, reject: rejectCall, hangup: hangupCall,
      mute: toggleMute, cam: toggleCam,
    };
  },
  template:
    '<div class="callbox" :class="{ incoming: isIncoming(), calling: !inCall() && !isIncoming(), active: inCall(), minimized: minimized, full: full, dragging: panelDragging }"' +
      ' :style="panelStyle" role="dialog" :aria-label="t(\'Llamada\')">' +
      '<button class="call-fab" type="button" v-if="minimized" ref="fabEl"' +
        ' :class="{ dragging: fabDragging, moved: !!fabStyle.left }"' +
        ' :style="fabStyle" @pointerdown="startFabDrag" @click.stop="fabClick"' +
        ' :title="t(\'Volver a la llamada\')">' +
        '<span class="call-fab-ic"><svg class="ic"><use href="#i-phone"></use></svg></span>' +
        '<span class="call-fab-t">{{ elapsed }}</span>' +
      '</button>' +
      '<div class="call-panel" ref="panelEl" v-show="!minimized">' +
        '<header class="call-head" @pointerdown="startPanelDrag">' +
          '<span class="call-col">' +
            '<b>{{ callTitle() }}</b>' +
            '<span class="call-state">{{ stateLine() }}' +
              '<template v-if="isGroup() && participantCount()"> · {{ participantCount() }}</template>' +
            '</span>' +
          '</span>' +
          '<button class="icon-btn call-full" type="button"' +
            ' @click.stop="toggleFull" :title="full ? t(\'Salir de pantalla completa\') : t(\'Pantalla completa\')">' +
            '<svg class="ic"><use :href="full ? \'#i-collapse\' : \'#i-expand\'"></use></svg>' +
          '</button>' +
          '<button class="icon-btn call-min" type="button" v-if="!isIncoming()"' +
            ' @click.stop="minimize" :title="t(\'Minimizar\')">' +
            '<svg class="ic"><use href="#i-chevron-down"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="call-participants" :class="{ solo: isIncoming(), group: isGroup() }">' +
          '<div class="call-tile peer" v-if="!isGroup()" :class="{ speaking: peerSpeak, video: hasVideo() }"' +
            ' @contextmenu.prevent.stop="openMenu($event, \'peer\')">' +
            '<div class="call-tile-bg" :style="bgStyle(peerBg)"></div>' +
            '<video class="call-remote" ref="remoteEl" autoplay playsinline' +
              ' v-show="hasVideo()"></video>' +
            '<div class="call-avatar" v-if="!hasVideo()">' +
              '<span class="avatar av72" :class="{ \'has-photo\': !!peerAvatar() }">' +
                '<img v-if="peerAvatar()" :src="peerAvatar()" alt="">' +
                '<span v-else>{{ peerIni() }}</span>' +
              '</span>' +
            '</div>' +
            '<span class="call-tile-foot">' +
              '<span class="call-tile-name">{{ peerName() }}</span>' +
            '</span>' +
          '</div>' +
          '<div class="call-tile peer group-tile" v-for="p in groupPeerList" :key="\'gp\' + p.id"' +
            ' :class="{ video: peerHasVideo(p) }" @contextmenu.prevent.stop="openMenu($event, \'p:\' + p.id)">' +
            '<div class="call-tile-bg" :style="bgStyle(peerBgOf(p))"></div>' +
            '<video class="call-peer-video" :data-peer="p.id" autoplay playsinline' +
              ' v-show="peerHasVideo(p)"></video>' +
            '<div class="call-avatar" v-if="!peerHasVideo(p)">' +
              '<span class="avatar av72" :class="{ \'has-photo\': !!peerAvatarOf(p) }">' +
                '<img v-if="peerAvatarOf(p)" :src="peerAvatarOf(p)" alt="">' +
                '<span v-else>{{ peerIniOf(p) }}</span>' +
              '</span>' +
            '</div>' +
            '<span class="call-tile-foot">' +
              '<span class="call-tile-name">{{ peerNameOf(p) }}</span>' +
              '<svg class="ic ic-sm" v-if="peerMutedMap[p.id]" :title="t(\'Silenciado\')">' +
                '<use href="#i-mute"></use></svg>' +
            '</span>' +
          '</div>' +
          '<div class="call-tile self" v-if="!isIncoming()" :class="{ speaking: mySpeak, video: selfCamOn() }"' +
            ' @contextmenu.prevent.stop="openMenu($event, \'self\')">' +
            '<div class="call-tile-bg" :style="bgStyle(myBg)"></div>' +
            '<video class="call-pip" ref="pipEl" autoplay muted playsinline' +
              ' v-show="selfCamOn()"></video>' +
            '<div class="call-avatar" v-if="!selfCamOn()">' +
              '<span class="avatar av72" :class="{ \'has-photo\': !!myAvatar() }">' +
                '<img v-if="myAvatar()" :src="myAvatar()" alt="">' +
                '<span v-else>{{ myIni() }}</span>' +
              '</span>' +
            '</div>' +
            '<span class="call-tile-foot">' +
              '<span class="call-tile-name">{{ t(\'Tú\') }}</span>' +
              '<svg class="ic ic-sm" v-if="store.call.muted" :title="t(\'Silenciado\')">' +
                '<use href="#i-mic-off"></use></svg>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="call-controls">' +
          '<template v-if="isIncoming()">' +
            '<button type="button" class="call-round accept call-accept" @click="accept"' +
              ' :title="t(\'Contestar\')" :aria-label="t(\'Contestar\')">' +
              '<svg class="ic"><use href="#i-phone"></use></svg></button>' +
            '<button type="button" class="call-round reject call-reject" @click="reject"' +
              ' :title="t(\'Rechazar\')" :aria-label="t(\'Rechazar\')">' +
              '<svg class="ic"><use href="#i-phone-down"></use></svg></button>' +
          '</template>' +
          '<template v-else>' +
            '<button type="button" class="call-round" v-if="inCall()"' +
              ' :class="{ off: store.call.muted }" @click="mute"' +
              ' :title="store.call.muted ? t(\'Activar el micrófono\') : t(\'Silenciar\')"' +
              ' :aria-label="store.call.muted ? t(\'Activar el micrófono\') : t(\'Silenciar\')">' +
              '<svg class="ic"><use :href="store.call.muted ? \'#i-mic-off\' : \'#i-mic\'"></use></svg></button>' +
            '<button type="button" class="call-round" v-if="inCall() && store.call.hasCam"' +
              ' :class="{ off: store.call.camOff }" @click="cam"' +
              ' :title="store.call.camOff ? t(\'Encender la cámara\') : t(\'Apagar la cámara\')"' +
              ' :aria-label="store.call.camOff ? t(\'Encender la cámara\') : t(\'Apagar la cámara\')">' +
              '<svg class="ic"><use :href="store.call.camOff ? \'#i-video-off\' : \'#i-video\'"></use></svg></button>' +
            '<button type="button" class="call-round call-screen" v-if="inCall() && canScreenShare()"' +
              ' :class="{ on: store.call.screen }" @click="toggleScreen"' +
              ' :title="store.call.screen ? t(\'Dejar de compartir\') : t(\'Compartir pantalla\')"' +
              ' :aria-label="store.call.screen ? t(\'Dejar de compartir\') : t(\'Compartir pantalla\')">' +
              '<svg class="ic"><use href="#i-screen"></use></svg></button>' +
            '<button type="button" class="call-round hang call-hang" @click="hangup"' +
              ' :title="t(\'Colgar\')" :aria-label="t(\'Colgar\')">' +
              '<svg class="ic"><use href="#i-phone-down"></use></svg></button>' +
          '</template>' +
        '</div>' +
        '<div class="call-chat" v-if="inCall()">' +
          '<div class="call-chat-hd">{{ t(\'Chat de la llamada\') }}</div>' +
          '<div class="call-chat-list" ref="chatListEl">' +
            '<div class="call-msg" :class="{ mine: m.mine }" v-for="m in callMessages" :key="m.key">' +
              '<span class="call-msg-name" v-if="!m.mine">{{ m.name }}</span>' +
              '<span class="call-msg-txt">{{ m.txt }}</span>' +
              '<span class="call-msg-time">{{ m.time }}</span>' +
            '</div>' +
            '<div class="call-chat-empty" v-if="!callMessages.length">' +
              '{{ t(\'No hay mensajes todavía.\') }}</div>' +
          '</div>' +
          '<form class="call-chat-form" @submit.prevent="sendChat">' +
            '<input class="call-chat-in" v-model="callText" maxlength="3000"' +
              ' :placeholder="t(\'Escribe un mensaje…\')" :aria-label="t(\'Mensaje\')">' +
            '<button class="icon-btn call-send" type="submit" :disabled="!callText.trim()"' +
              ' :title="t(\'Enviar\')" :aria-label="t(\'Enviar\')">' +
              '<svg class="ic"><use href="#i-send"></use></svg></button>' +
          '</form>' +
        '</div>' +
      '</div>' +
      '<div class="call-menu" v-if="menu" :style="{ left: menu.x + \'px\', top: menu.y + \'px\' }"' +
        ' @click.stop>' +
        '<button type="button" v-if="menuPeer()" @click="viewPeer">' +
          '<svg class="ic ic-sm"><use href="#i-user"></use></svg>' +
          '<span>{{ t(\'Ver perfil\') }}</span></button>' +
        '<button type="button" v-if="menuPeer()" @click="toggleRemoteMute">' +
          '<svg class="ic ic-sm"><use :href="menuPeerMuted ? \'#i-vol\' : \'#i-mute\'"></use></svg>' +
          '<span>{{ menuPeerMuted ? t(\'Escuchar de nuevo\') : t(\'Silenciar para mí\') }}</span></button>' +
        '<button type="button" v-if="menu.who === \'self\'" @click="menuThen(mute)">' +
          '<svg class="ic ic-sm"><use :href="store.call.muted ? \'#i-mic-off\' : \'#i-mic\'"></use></svg>' +
          '<span>{{ store.call.muted ? t(\'Activar el micrófono\') : t(\'Silenciar\') }}</span></button>' +
        '<button type="button" v-if="menu.who === \'self\' && store.call.hasCam"' +
          ' @click="menuThen(cam)">' +
          '<svg class="ic ic-sm"><use :href="store.call.camOff ? \'#i-video-off\' : \'#i-video\'"></use></svg>' +
          '<span>{{ store.call.camOff ? t(\'Encender la cámara\') : t(\'Apagar la cámara\') }}</span></button>' +
        '<button type="button" class="danger" @click="menuThen(hangup)">' +
          '<svg class="ic ic-sm"><use href="#i-phone-down"></use></svg>' +
          '<span>{{ t(\'Colgar\') }}</span></button>' +
      '</div>' +
    '</div>',
};

/* --------------------------------------------------------- SpamBox (W18)

   Aviso anti-spam: pantalla completa que bloquea la UI 10 s y solo se
   cierra con el botón (ni Esc ni el fondo la cierran). El server manda
   el 429 con {retry_after, spam} al exceder el límite de mensajes y
   api.js levanta store.spamUntil. El botón se activa al terminar la
   cuenta regresiva: "Ok, perdón (3s)" → "Ok, perdón". */

const SpamBox = {
  setup: function () {
    const now = Vue.ref(Date.now());
    let timer = 0;
    Vue.onMounted(function () {
      timer = setInterval(function () { now.value = Date.now(); }, 500);
    });
    Vue.onUnmounted(function () { clearInterval(timer); });
    const left = Vue.computed(function () {
      return Math.max(0, Math.ceil((store.spamUntil - now.value) / 1000));
    });
    const close = function () { store.spamUntil = 0; };
    return { left, close };
  },
  template:
    '<div class="spam-veil" role="alertdialog" ' +
      ':aria-label="t(\'¡OYE! Estás haciendo SPAM!\')">' +
      '<div class="spam-box">' +
        '<svg class="ic spam-ic"><use href="#i-alert"></use></svg>' +
        '<h2 class="spam-title">{{ t(\'¡OYE! Estás haciendo SPAM!\') }}</h2>' +
        '<p class="spam-text">' +
          '{{ t(\'Si sigues así pueden bloquearte la cuenta por 5 minutos; ' +
          'si sigues otra vez, el tiempo aumentará, pero disminuirá poco a poco ' +
          'si dejas de hacer spam por un tiempo.\') }}</p>' +
        '<button class="btn spam-ok" type="button" :disabled="left > 0" @click="close">' +
          '{{ left > 0 ? t(\'Ok, perdón ({n}s)\', { n: left }) : t(\'Ok, perdón\') }}' +
        '</button>' +
      '</div>' +
    '</div>',
};

/* ------------------------------------------------------- ProfilePanel */

function joinedLine(u) {
  if (!u || !u.created_at) return '—';
  const d = new Date(u.created_at * 1000);
  return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
}

/* W8: markdown mínimo y SEGURO para las bios. Primero se escapa todo el
   texto del usuario y recién después se agregan etiquetas propias:
   **negrita**, *cursiva*, ~~tachado~~, `código`, [links](https://…) y
   saltos de línea. No se acepta HTML ajeno (sin riesgo de inyección). */
function mdToHtml(text) {
  let out = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    /* W37f: la comilla simple también se escapa (defensa en profundidad
       si algún atributo futuro usa comillas simples). */
    .replace(/'/g, '&#39;');
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

const ProfilePanel = {
  setup: function () {
    const close = function () { store.profile = null; };

    const friendState = Vue.computed(function () {
      const p = store.profile;
      if (!p || !p.user) return 'none';
      if (p.relation === 'blocked') return 'blocked';
      const fs = (store.people && store.people.friends) || [];
      for (let i = 0; i < fs.length; i++) if (fs[i].id === p.user.id) return 'friend';
      const sent = (store.people && store.people.sent) || [];
      for (let i = 0; i < sent.length; i++) {
        if (sent[i].user && sent[i].user.id === p.user.id) return 'sent';
      }
      const recv = (store.people && store.people.received) || [];
      for (let i = 0; i < recv.length; i++) {
        if (recv[i].user && recv[i].user.id === p.user.id) return 'received';
      }
      /* W65: un enlace directo puede abrir el perfil antes de que la
         lista de Personas termine de cargar. `relation` viene del mismo
         endpoint por ID y evita ofrecer dos veces "Enviar solicitud". */
      if (p.relation === 'blocked') return 'blocked';
      if (p.relation === 'friend' || p.relation === 'sent' ||
          p.relation === 'received') return p.relation;
      return 'none';
    });

    const startChat = async function () {
      const p = store.profile;
      if (!p || !p.user) return;
      const username = p.user.username;
      if (friendState.value === 'blocked') {
        toast(t('Usuario bloqueado'), 'info');
        return;
      }
      if (friendState.value === 'sent') {
        toast(t('Ya enviaste una solicitud de amistad'), 'info');
        return;
      }
      if (friendState.value === 'received') {
        const findReq = function () {
          const recv = (store.people && store.people.received) || [];
          for (let i = 0; i < recv.length; i++) {
            if (recv[i].user && recv[i].user.id === p.user.id) return recv[i];
          }
          return null;
        };
        let req = findReq();
        if (!req) {
          /* El enlace directo puede llegar antes que Personas. Se pide
             la lista y se reintenta una sola vez; así "Aceptar" funciona
             sin obligar a recargar. */
          try { await loadPeople(); } catch (e) {}
          req = findReq();
        }
        if (!req) { toast(t('La solicitud ya no está disponible'), 'info'); return; }
        close();
        try {
          await acceptFriendRequest(req.id);
          toast(t('Solicitud aceptada'), 'ok');
        } catch (e) {
            toastErr(e, 'No se pudo aceptar la solicitud');
        }
        return;
      }
      if (friendState.value !== 'friend') {
        close();
        try {
          await sendFriendRequest(username);
          toast(t('Solicitud enviada'), 'ok');
        } catch (e) {
          toastErr(e, 'No se pudo enviar la solicitud');
        }
        return;
      }
      close();
      try {
        await createDm(username);
      } catch (e) {
        toastErr(e, 'No se pudo abrir el chat');
      }
    };

    /* "Mensaje" solo si NO estoy ya en el directo con esa persona (W7). */
    const inActiveDm = Vue.computed(function () {
      const p = store.profile;
      if (!p || !p.user) return false;
      const id = store.activeChatId;
      for (let i = 0; i < store.chats.length; i++) {
        const c = store.chats[i];
        if (c.id === id && c.type === 'dm' && c.title && c.title.id === p.user.id) return true;
      }
      return false;
    });

    /* W27: la píldora de estado la resuelve connPill (módulo): fuera de
       línea dice "Desconectado"; activo manda SU estado (texto o preset). */

    return {
      store, close, startChat, friendState, inActiveDm, dotClass,
      statusOf, profileQuote, personMenu, joinedLine, md: mdToHtml,
      mediaUrl, bannerStyle, viewMedia: openMediaViewer,
      /* W68: copiar el ID público del perfil abierto */
      copyPubId: function () {
        const p = store.profile;
        if (p && p.user && p.user.pub_id) {
          copyText(p.user.pub_id);
          toast(t('ID copiado'), 'ok');
        }
      },
    };
  },
  components: { BioText },
  template: `
    <div class="modal-veil" v-if="store.profile" @click.self="close" role="dialog" :aria-label="t('Perfil')">
      <div class="modal pmodal">
        <header>{{ t('Perfil') }}
          <button class="icon-btn pp-more" type="button" :title="t('Administrar')"
            v-if="store.profile.user && store.user && store.profile.user.id !== store.user.id"
            @click.stop="personMenu($event, store.profile.user)">
            <svg class="ic"><use href="#i-dots"></use></svg>
          </button>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <!-- W66g: misma animación de "cuadritos" que al cargar un chat,
             aquí SIN el texto de "Cargando…" -->
        <div class="pp-loading" v-if="store.profile.loading">
          <span class="cubes"><span class="cube"></span><span class="cube"></span></span>
        </div>
        <div class="pp-loading" v-else-if="store.profile.error">{{ t(store.profile.error) }}</div>
        <template v-else-if="store.profile.user">
          <div class="pp-body pf-body">
            <div class="pf-banner" :class="{ 'is-empty': !store.profile.user.banner_url }">
              <img v-if="store.profile.user.banner_url"
                :src="mediaUrl(store.profile.user.banner_url)"
                :style="bannerStyle(store.profile.user)" alt="" loading="lazy"
                class="pf-zoom" :title="t('Ver portada')"
                @click="viewMedia(store.profile.user.banner_url, 'portada')">
              <span v-else class="pf-banner-art" aria-hidden="true">
                <svg class="fox"><use href="#i-logo-mark"></use></svg>
              </span>
            </div>
            <div class="pf-idrow">
              <span class="av-wrap pf-avwrap" :class="dotClass(store.profile.user)">
                <span class="avatar pp-av" :class="{ 'has-photo': !!store.profile.user.avatar_url }">
                  <img v-if="store.profile.user.avatar_url"
                    :src="mediaUrl(store.profile.user.avatar_url)" alt="" loading="lazy"
                    class="pf-zoom" :title="t('Ver foto')"
                    @click="viewMedia(store.profile.user.avatar_url, 'foto')">
                  <span v-else>{{ (store.profile.user.display_name || store.profile.user.username).charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <div class="pf-status-wrap" v-if="profileQuote(store.profile.user)">
                <div class="pf-quote pf-quote-static">
                  <span class="pf-quote-text">{{ profileQuote(store.profile.user) }}</span>
                </div>
              </div>
            </div>
            <div class="pf-idbelow">
              <div class="pp-name">{{ store.profile.user.display_name }}</div>
              <div class="pp-user">@{{ store.profile.user.username }}</div>
              <!-- W68: ID público copiable (enlace /app/user/<id>) -->
              <button class="pf-pubid" type="button" v-if="store.profile.user.pub_id"
                :title="t('Copiar ID')" @click="copyPubId">
                <span class="pf-pubid-l">{{ t('ID') }}</span>
                <code class="pf-pubid-v">{{ store.profile.user.pub_id }}</code>
                <svg class="ic ic-sm"><use href="#i-copy"></use></svg>
              </button>
            </div>
            <bio-text v-if="store.profile.user.bio" :text="store.profile.user.bio"></bio-text>
            <div class="pp-rows pf-rows">
              <div class="pp-row" v-if="store.profile.user.created_at"><b>{{ t('Miembro desde') }}</b><span>{{ joinedLine(store.profile.user) }}</span></div>
            </div>
          </div>
          <div class="pp-foot" v-if="!inActiveDm">
            <button class="btn btn-full" type="button" @click="startChat"
              :disabled="friendState === 'sent' || friendState === 'blocked'">
              {{ friendState === 'friend' ? t('Mensaje') : friendState === 'sent' ? t('Solicitud pendiente') : friendState === 'received' ? t('Aceptar solicitud') : friendState === 'blocked' ? t('Bloqueado') : t('Enviar solicitud') }}
            </button>
          </div>
        </template>
      </div>
    </div>`,
};

/* ------------------------------------------------- RequestSentModal (W65) */

/* Confirmación única para una solicitud enviada desde un enlace directo
   o desde el flujo "＋". No usa `alert()`: mantiene el lenguaje visual
   de los demás modales y deja un acceso directo a Solicitudes. */
const RequestSentModal = {
  setup: function () {
    const close = function () { store.requestSent = null; };
    const goRequests = function () {
      store.requestSent = null;
      store.requestsJump++;
    };
    return { store, close, goRequests };
  },
  template: `
    <div class="modal-veil reqsent-veil" @click.self="close" role="dialog"
      aria-modal="true" :aria-label="t('Solicitud enviada.')">
      <div class="modal req-sent">
        <header>
          <span class="m-head-title"><b>{{ t('Solicitud enviada.') }}</b></span>
        </header>
        <div class="req-sent-body">
          <span class="req-sent-check" aria-hidden="true">
            <svg class="ic"><use href="#i-check"></use></svg>
          </span>
          <p class="req-sent-lead">{{ t('Se ha enviado solicitud a @{n}',
            { n: store.requestSent ? store.requestSent.username : '' }) }}</p>
          <p class="req-sent-wait">{{ t('Espera a que acepte, podés ir a la sección') }}
            <button class="req-link" type="button" @click="goRequests">{{ t('Solicitudes') }}</button></p>
        </div>
        <div class="req-sent-foot">
          <button class="btn req-ok" type="button" @click="close">{{ t('Okey') }}</button>
        </div>
      </div>
    </div>`,
};

/* ------------------------------------------- JoinGroupModal (W68) */

/* Unirse a un grupo por enlace (/app/group/<id de 12 dígitos>). Muestra
   la ficha pública (nombre, avatar, miembros) y pide confirmación; el
   dueño del enlace no ve esto (los miembros abren el chat directo). */
const JoinGroupModal = {
  setup: function () {
    const close = function () {
      if (store.joinPrompt && store.joinPrompt.joining) return;
      store.joinPrompt = null;
      syncUrl();   // la URL vuelve a la real (no quedarse en el enlace)
    };
    const join = function () { joinGroupByPub(); };
    return { store, close, join };
  },
  template: `
    <div class="modal-veil" @click.self="close" role="dialog" aria-modal="true"
      :aria-label="t('Unirse al grupo')">
      <div class="modal join-group">
        <header>
          <span class="m-head-title"><b>{{ t('Unirse al grupo') }}</b></span>
        </header>
        <div class="join-body" v-if="store.joinPrompt">
          <img v-if="store.joinPrompt.avatarUrl" class="join-av"
            :src="store.joinPrompt.avatarUrl" alt="">
          <span v-else class="join-av join-av-ph" aria-hidden="true">
            <svg class="ic"><use href="#i-users"></use></svg>
          </span>
          <p class="join-title">{{ store.joinPrompt.title }}</p>
          <p class="join-meta">{{ t('{n} miembros', { n: store.joinPrompt.memberCount }) }}</p>
          <p v-if="store.joinPrompt.error" class="join-err">{{ store.joinPrompt.error }}</p>
        </div>
        <div class="join-foot">
          <button class="btn ghost" type="button" @click="close"
            :disabled="store.joinPrompt && store.joinPrompt.joining">{{ t('Cancelar') }}</button>
          <button class="btn primary" type="button" @click="join"
            :disabled="store.joinPrompt && store.joinPrompt.joining">{{
            store.joinPrompt && store.joinPrompt.joining ? t('Uniéndote…')
            : t('Unirse') }}</button>
        </div>
      </div>
    </div>`,
};

/* --------------------------------------------------- GroupProfileModal (W78)
   Modal de información de un grupo: avatar con zoom, nombre, descripción,
   lista de miembros con rol y galería de archivos compartidos. Se abre
   desde la cabecera del chat al pulsar el nombre/avatar del grupo. */
const GroupProfileModal = {
  setup: function () {
    const close = function () { store.groupProfile = null; };
    const isGroup = function () {
      const p = store.groupProfile;
      return p && p.chat && p.chat.type === 'group';
    };
    const memberLine = function (m) {
      const role = m.role || 'member';
      return role === 'owner' ? t('Dueño') : role === 'admin' ? t('Administrador') : t('Miembro');
    };
    return { store, close, isGroup, memberLine, mediaUrl, viewMedia: openMediaViewer };
  },
  components: { BioText },
  template: `
    <div class="modal-veil" v-if="store.groupProfile" @click.self="close" role="dialog" :aria-label="t('Info del grupo')">
      <div class="modal pmodal">
        <header>{{ isGroup() ? t('Info del grupo') : t('Info del chat') }}
          <button class="icon-btn pp-more" type="button" :title="t('Administrar')"
            v-if="isGroup() && store.groupProfile.chat && store.user && store.groupProfile.chat.my_role"
            @click.stop="infoMenu($event)">
            <svg class="ic"><use href="#i-dots"></use></svg>
          </button>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="pp-loading" v-if="store.groupProfile.loading">
          <span class="cubes"><span class="cube"></span><span class="cube"></span></span>
        </div>
        <div class="pp-loading" v-else-if="store.groupProfile.error">{{ t(store.groupProfile.error) }}</div>
        <template v-else-if="store.groupProfile.chat">
          <div class="pp-body pf-body">
            <div class="pf-banner" :class="{ 'is-empty': !store.groupProfile.chat.avatar_url }">
              <img v-if="store.groupProfile.chat.avatar_url"
                :src="store.groupProfile.chat.avatar_url" alt="" loading="lazy"
                class="pf-zoom" :title="t('Ver foto')"
                @click="viewMedia(store.groupProfile.chat.avatar_url, 'foto')">
              <span v-else class="pf-banner-art" aria-hidden="true">
                <svg class="fox"><use href="#i-logo-mark"></use></svg>
              </span>
            </div>
            <div class="pf-idrow">
              <span class="av-wrap pf-avwrap">
                <span class="avatar pp-av" :class="{ 'has-photo': !!store.groupProfile.chat.avatar_url }">
                  <img v-if="store.groupProfile.chat.avatar_url"
                    :src="store.groupProfile.chat.avatar_url" alt="" loading="lazy"
                    class="pf-zoom" :title="t('Ver foto')"
                    @click="viewMedia(store.groupProfile.chat.avatar_url, 'foto')">
                  <span v-else>{{ store.groupProfile.chat.title ? store.groupProfile.chat.title.charAt(0).toUpperCase() : '?' }}</span>
                </span>
              </span>
              <div class="pf-status-wrap">
                <div class="pf-quote pf-quote-static">
                  <span class="pf-quote-text">{{ store.groupProfile.chat.title }}</span>
                </div>
              </div>
            </div>
            <div class="pf-idbelow">
              <div class="pp-name">{{ store.groupProfile.chat.title }}</div>
              <div class="pp-user">{{ t('{n} miembro{p}', { n: store.groupProfile.member_count || store.groupProfile.members.length, p: (store.groupProfile.member_count || store.groupProfile.members.length) === 1 ? '' : 's' }) }}</div>
              <div class="pp-user">{{ t('Tu rol: {n}', { n: memberLine(store.groupProfile.chat) }) }}</div>
            </div>
            <div class="pp-rows pf-rows" v-if="store.groupProfile.members.length">
              <div class="pp-row"><b>{{ t('Miembros') }}</b></div>
              <div class="pp-row" v-for="m in store.groupProfile.members" :key="m.id">
                <span class="av-wrap"><span class="avatar av24" :class="{ 'has-photo': !!m.avatar_url }">
                  <img v-if="m.avatar_url" :src="m.avatar_url" alt="" loading="lazy">
                  <span v-else>{{ (m.display_name || m.username).charAt(0).toUpperCase() }}</span>
                </span></span>
                <span>{{ m.display_name || m.username }}</span>
                <span class="pp-row-meta">{{ memberLine(m) }}</span>
              </div>
            </div>
            <div class="pp-rows pf-rows" v-if="store.groupProfile.gallery.length">
              <div class="pp-row"><b>{{ t('Archivos compartidos') }}</b></div>
              <div class="gal-row" v-for="g in store.groupProfile.gallery" :key="g.id">
                <img v-if="g.thumb_url" :src="g.thumb_url" class="gal-thumb" alt=""
                  @click="viewMedia(g.media_url, g.kind)">
                <span v-else class="gal-thumb gal-noimg" @click="viewMedia(g.media_url, g.kind)">
                  <svg class="ic ic-sm"><use href="#i-file"></use></svg>
                </span>
                <span class="gal-name">{{ g.sender }}</span>
              </div>
            </div>
          </div>
          <div class="pp-foot">
            <button class="btn btn-full" type="button" @click="close">{{ t('Cerrar') }}</button>
          </div>
        </template>
      </div>
    </div>`,
};

/* --------------------------------------------------- ChatInfoPanel (W7)
   Panel derecho con la info del chat activo: en directos, la ficha del
   contacto (sin botón "Mensaje": ya estás en la conversación); en
   grupos, la lista de miembros con quién está conectado y la salida
   del grupo. Se abre con el botón de la cabecera. */

const ChatInfoPanel = {
  setup: function () {
    const close = function () { store.infoOpen = false; };

    const chat = Vue.computed(function () {
      const id = store.activeChatId;
      for (let i = 0; i < store.chats.length; i++) if (store.chats[i].id === id) return store.chats[i];
      return null;
    });

    /* Directo: el contacto (el OTRO miembro, no yo) con presencia
       fresca; si todavía no cargó, el title de la lista. */
    const peer = Vue.computed(function () {
      const c = chat.value;
      if (!c || c.type !== 'dm') return null;
      const info = store.info;
      if (info && info.chatId === c.id && info.members && info.members.length) {
        const meId = store.user ? store.user.id : 0;
        for (let i = 0; i < info.members.length; i++) {
          if (info.members[i].id !== meId) return info.members[i];
        }
      }
      return c.title || null;
    });

    const members = Vue.computed(function () {
      const info = store.info;
      const c = chat.value;
      if (!info || !c || info.chatId !== c.id) return [];
      /* W27: en línea primero y desconectados al final (orden estable). */
      const ms = info.members || [];
      return ms.slice().sort(function (a, b) {
        return (memberOn(b) ? 1 : 0) - (memberOn(a) ? 1 : 0);
      });
    });

    /* W26: presencia del panel de info desde el mapa único (eventos WS +
       snapshot al reconectar); el online del REST es solo el primer relleno. */
    const memberOn = function (m) {
      return !!(m && (store.presence[m.id] != null ? store.presence[m.id] : m.online));
    };

    const onlineCount = Vue.computed(function () {
      const ms = members.value;
      let n = 0;
      for (let i = 0; i < ms.length; i++) if (memberOn(ms[i])) n++;
      return n;
    });

    const infoError = Vue.computed(function () {
      const info = store.info;
      const c = chat.value;
      if (!info || !c || info.chatId !== c.id) return '';
      return info.error || '';
    });

    const loading = Vue.computed(function () {
      const info = store.info;
      const c = chat.value;
      return !!(info && c && info.chatId === c.id && info.loading && !info.members.length);
    });

    const isMe = function (m) {
      return !!(m && store.user && m.id === store.user.id);
    };

    const memberLine = function (m) {
      if (!memberOn(m)) return fmtLastSeen(m.last_seen);
      if (m.status_text) return m.status_text;
      if (m.status_preset) return presetLabel(m.status_preset);
      return t('En línea');
    };

    const openMember = function (m) {
      if (m && m.username) openProfile(m.username);
    };

    /* W46: etiqueta [Admin] para owner y admin del grupo. El owner
       conserva ese rol superior para las acciones sensibles. */
    const isAdmin = function (m) {
      return !!(m && (m.role === 'owner' || m.role === 'admin'));
    };

    /* El menú de administración sólo aparece cuando la acción tiene
       sentido: no sobre uno mismo, ni sobre el owner; un admin sólo
       administra miembros comunes. */
    const canManageMember = function (m) {
      const c = chat.value;
      if (!c || c.type !== 'group' || !m || isMe(m) || m.role === 'owner') {
        return false;
      }
      if (c.my_role === 'owner') return true;
      return c.my_role === 'admin' && m.role === 'member';
    };

    const memberMenu = function (e, m) {
      const c = chat.value;
      if (!c || !canManageMember(m)) return;
      const items = [];
      if (m.role === 'member') {
        items.push({
          label: 'Hacer admin', icon: 'i-shield',
          fn: function () { askSetRole(c, m, 'admin'); },
        });
      } else if (m.role === 'admin') {
        items.push({
          label: 'Quitar admin', icon: 'i-user',
          fn: function () { askSetRole(c, m, 'member'); },
        });
      }
      if (c.my_role === 'owner') {
        items.push({
          label: 'Transferir propiedad', icon: 'i-shield', danger: true,
          fn: function () { askTransferOwner(c, m); },
        });
      }
      items.push({
        label: 'Eliminar del grupo', icon: 'i-trash', danger: true,
        fn: function () { askRemoveMember(c, m); },
      });
      openCtx(e, items, null, 'member:' + c.id + ':' + m.id);
    };

    /* W29c: pelotita si este miembro está escribiendo en ESTE chat. */
    const memberTyping = function (m) {
      const c = chat.value;
      const bag = c && store.typing[c.id];
      return !!(bag && bag[m.id]);
    };

    /* W39: showProfile() (botón "Ver perfil completo" al pie del panel)
       se eliminó junto con el botón — el perfil completo se abre con
       un clic en la cabecera del chat. */

    /* W27d: "Salir del grupo" ya no es un botón grande al pie (poco
       estético); vive en el ⋮ del panel (chatMenu). */

    /* W27: ⋮ del panel — administrar el grupo (o el directo). */
    const infoMenu = function (e) {
      const c = chat.value;
      if (!c) return;
      if (c.type === 'group') {
        chatMenu(e, c, 'info');
        return;
      }
      const items = [];
      const p = peer.value;
      if (p && p.username && !isMe(p)) {
        items.push({
          label: 'Ver perfil', icon: 'i-user',
          fn: function () { openProfile(p.username); },
        });
      }
      items.push({
        label: c.pinned ? 'Desfijar chat' : 'Fijar chat',
        icon: c.pinned ? 'i-x' : 'i-pin',
        fn: function () { setPinned(c.id, !c.pinned); },
      });
      items.push({
        label: c.muted ? 'Activar notificaciones' : 'Silenciar notificaciones',
        icon: c.muted ? 'i-bell' : 'i-bell-off',
        fn: function () { setMuted(c.id, !c.muted); },
      });
      /* W36i: el mismo ⋮ alterna abrir/cerrar */
      openCtx(e, items, null, 'info');
    };

    /* W27: la lista en dos bloques: en línea primero y desconectados
       después, con etiqueta solo cuando conviven los dos. */
    const memberSections = Vue.computed(function () {
      const ms = members.value;
      const on = [];
      const off = [];
      for (let i = 0; i < ms.length; i++) {
        if (memberOn(ms[i])) on.push(ms[i]);
        else off.push(ms[i]);
      }
      const both = on.length > 0 && off.length > 0;
      const out = [];
      if (on.length) out.push({ key: 'on', label: 'En línea', show: both, ms: on });
      if (off.length) out.push({ key: 'off', label: 'Desconectados', show: both, ms: off });
      return out;
    });

    /* W27: foto del grupo en la info; quien puede cambiarla ve el botón. */
    const grpAvatar = Vue.computed(function () {
      const c = chat.value;
      return c && c.avatar_url ? mediaUrl(c.avatar_url) : '';
    });
    const canPhoto = Vue.computed(function () {
      const c = chat.value;
      return !!(c && (c.my_role === 'owner' || c.my_role === 'admin'));
    });
    const pickPhoto = function () { pickGroupPhoto(chat.value); };

    /* W68: enlace de invitación (solo owner/admin gestiona; el resto
       de miembros no ve la sección). El toggle hace PATCH invites_open. */
    const canInvite = Vue.computed(function () {
      const c = chat.value;
      return !!(c && c.type === 'group' &&
        (c.my_role === 'owner' || c.my_role === 'admin'));
    });
    const inviteLink = Vue.computed(function () {
      const c = chat.value;
      const id = c && (c.pub_id || '');
      return id ? location.origin + '/app/group/' + id : '';
    });
    const toggleInvites = function (e) {
      const c = chat.value;
      if (!c) return;
      const on = !!e.target.checked;
      api('PATCH', '/chats/' + c.id, { invites_open: on }).then(function () {
        c.invites_open = on;
        toast(on ? t('Enlace de invitación activado')
                 : t('Enlace de invitación desactivado'), 'ok');
      }).catch(function (err) {
        e.target.checked = !on;   // revertir el toggle visual
        toastErr(err, 'No se pudo cambiar el ajuste');
      });
    };
    const copyInvite = function () {
      const txt = inviteLink.value;
      if (!txt) return;
      copyText(txt);
      toast(t('Enlace copiado'), 'ok');
    };
    const copyPubId = function () {
      const c = chat.value;
      if (c && c.pub_id) { copyText(c.pub_id); toast(t('ID copiado'), 'ok'); }
    };

    /* W27b: mientras store.grpEdit apunte a ESTE chat, el panel muestra
       el editor de encuadre en lugar de la foto; al aplicar se sube el
       PNG compuesto y el encuadre queda guardado para reeditar. */
    const grpEditing = Vue.computed(function () {
      const c = chat.value;
      const ge = store.grpEdit;
      return !!(c && ge && ge.src && ge.chatId === c.id);
    });
    const onGrpPhotoCancel = function () {
      const ge = store.grpEdit;
      if (ge && ge.src) URL.revokeObjectURL(ge.src);
      store.grpEdit = { chatId: 0, src: '' };
    };
    const onGrpPhoto = function (blob, st) {
      const c = chat.value;
      onGrpPhotoCancel();
      if (!c) return;
      const f = new File([blob], 'grupo.png', { type: 'image/png' });
      Promise.resolve(uploadChatAvatar(c.id, f)).then(function () {
        saveCropState('chat-' + c.id, st);
        toast('Foto del grupo actualizada', 'ok');
      }).catch(function (err) {
        toastErr(err, 'No se pudo subir la foto');
      });
    };

    /* W28c/W29l: mensajes fijados — el CONTEO se carga al abrir el
       panel de la info (W29l: modal, no acordeón) y un message_pinned
       por WS mantiene el badge siempre al día. */
    const pins = Vue.ref([]);
    const pinsLoading = Vue.ref(false);
    const loadPins = async function () {
      const c = chat.value;
      if (!c) return;
      pinsLoading.value = true;
      try {
        const r = await api('GET', '/chats/' + c.id + '/pins');
        if (!chat.value || chat.value.id !== c.id) return;
        pins.value = r.messages || [];
      } catch (e) {
        pins.value = [];            // sin permiso/chat cerrado: vacío
      } finally {
        pinsLoading.value = false;
      }
    };
    const openPins = function () {
      store.pinsModal = true;
      loadPins();                  // siempre fresco al abrir el modal
    };
    const closePins = function () { store.pinsModal = false; };
    const goPin = function (msg) {
      if (!msg) return;
      store.pinsModal = false;     // W29l: el modal deja ver el chat
      store.jumpMsg = msg.id;      // el watcher de ChatShell hace el scroll
    };
    Vue.watch(function () { return store.pinsRev; }, function () {
      if (store.infoOpen) loadPins();  // W29l: badge y modal al día
    });
    Vue.watch(function () { return chat.value && chat.value.id; }, function () {
      pins.value = [];
      gal.value = null;
      store.pinsModal = false;
      store.galModal = false;
      if (store.infoOpen) { loadPins(); loadGal(); }   // W29l: al cambiar de chat
    });

    /* W28d/W29l: archivos y medios del chat — el modal "Archivos y
       medios" (visor) con el conteo cargado junto con los fijados. */
    const gal = Vue.ref(null);
    const galLoading = Vue.ref(false);
    const loadGal = async function () {
      const c = chat.value;
      if (!c) return;
      galLoading.value = true;
      try {
        const r = await api('GET', '/chats/' + c.id + '/gallery');
        if (!chat.value || chat.value.id !== c.id) return;
        gal.value = { images: r.images || [], files: r.files || [] };
      } catch (e) {
        gal.value = { images: [], files: [] };
      } finally {
        galLoading.value = false;
      }
    };
    const openGal = function () {
      store.galModal = true;
      loadGal();                    // siempre fresco al abrir el modal
    };
    const closeGal = function () { store.galModal = false; };
    const goGal = function (item) {
      if (!item) return;
      store.galModal = false;       // W29l: el modal deja ver el chat
      store.jumpMsg = item.msg_id;   // el watcher de ChatShell hace el scroll
    };
    /* W29d: miniatura con spoiler — el primer toque revela (y también
       la burbuja); el segundo abre el visor (W29l: lightbox). */
    const galSpoiled = function (item) {
      if (!item || !item.spoiler) return false;
      const s = store.spoilSeen[store.activeChatId];
      return !(s && s[item.msg_id]);
    };
    const galClick = function (item) {
      if (galSpoiled(item)) {
        if (!store.spoilSeen[store.activeChatId]) {
          store.spoilSeen[store.activeChatId] = {};
        }
        store.spoilSeen[store.activeChatId][item.msg_id] = 1;
        return;
      }
      /* W29l: en el modal, la imagen se ve en el visor (lightbox);
         el salto al mensaje queda para los archivos (goGal). */
      store.lb = { url: mediaUrl(item.media.url) };
    };

    /* W29l: al abrir la info se piden fijados y galería de una vez
       (los conteos de los accesos se ven "de una"); al cerrar, los
       modales que hubiera se apagan. */
    Vue.watch(function () { return store.infoOpen; }, function (open) {
      if (open) { loadPins(); loadGal(); }
      else { store.pinsModal = false; store.galModal = false; }
    }, { immediate: true });

    return {
      store, close, chat, peer, members, onlineCount, infoError, loading,
      isMe, memberLine, openMember,
      isAdmin, canManageMember, memberMenu,
      infoMenu, memberSections, grpAvatar, canPhoto, pickPhoto,
      grpEditing, onGrpPhoto, onGrpPhotoCancel,
      dotClass, statusOf, profileQuote, joinedLine, mediaUrl, md: mdToHtml,
      bannerStyle, viewMedia: openMediaViewer,
      titleOf: chatTitle,
      openGroupProfile,
      /* W28c/W29l */
      pins, pinsLoading, openPins, closePins, goPin,
      /* W28d/W29l */
      gal, galLoading, openGal, closeGal, goGal, galClick, galSpoiled, fmtSize,
      /* W29c */
      memberTyping,
      /* W68: enlace de invitación del grupo */
      canInvite, inviteLink, toggleInvites, copyInvite, copyPubId,
    };
  },
  components: { AvatarEditor, BioText },
  template: `
    <aside class="profile-panel" v-if="store.infoOpen && chat" :aria-label="t(chat.type === 'dm' ? 'Info del usuario' : 'Info del grupo')">
      <header class="pp-head" @click.stop="openGroupProfile(chat.id)">
        <b>{{ t(chat.type === 'dm' ? 'Info del usuario' : 'Info del grupo') }}</b>
        <button class="icon-btn pp-more" type="button" :title="t('Administrar')"
          @click.stop="infoMenu($event)">
          <svg class="ic"><use href="#i-dots"></use></svg>
        </button>
        <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
          <svg class="ic"><use href="#i-x"></use></svg>
        </button>
      </header>

      <template v-if="chat.type === 'dm'">
        <div class="pp-body pf-body" v-if="peer">
          <div class="pf-banner pf-banner-sm" :class="{ 'is-empty': !peer.banner_url }">
            <img v-if="peer.banner_url" :src="mediaUrl(peer.banner_url)"
              :style="bannerStyle(peer)" alt="" loading="lazy"
              class="pf-zoom" :title="t('Ver portada')"
              @click="viewMedia(peer.banner_url, 'portada')">
            <span v-else class="pf-banner-art" aria-hidden="true">
              <svg class="fox"><use href="#i-logo-mark"></use></svg>
            </span>
          </div>
          <div class="pf-idrow">
            <span class="av-wrap pf-avwrap" :class="dotClass(peer)">
              <span class="avatar pp-av" :class="{ 'has-photo': !!peer.avatar_url }">
                <img v-if="peer.avatar_url" :src="mediaUrl(peer.avatar_url)" alt="" loading="lazy"
                  class="pf-zoom" :title="t('Ver foto')"
                  @click="viewMedia(peer.avatar_url, 'foto')">
                <span v-else>{{ (peer.display_name || peer.username).charAt(0).toUpperCase() }}</span>
              </span>
            </span>
            <div class="pf-status-wrap" v-if="profileQuote(peer)">
              <div class="pf-quote pf-quote-static">
                <span class="pf-quote-text">{{ profileQuote(peer) }}</span>
              </div>
            </div>
          </div>
          <div class="pf-idbelow">
            <div class="pp-name">{{ peer.display_name || peer.username }}</div>
            <div class="pp-user">@{{ peer.username }}</div>
          </div>
          <bio-text v-if="peer.bio" :text="peer.bio"></bio-text>
          <div class="pp-rows pf-rows">
            <div class="pp-row" v-if="peer.created_at"><b>{{ t('Miembro desde') }}</b><span>{{ joinedLine(peer) }}</span></div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="pp-body pp-left" v-if="infoError">
          <div class="pp-loading">{{ t(infoError) }}</div>
        </div>
        <div class="pp-body pp-left" v-else-if="loading">
          <!-- W66g: cuadritos animados como al cargar un chat (sin texto) -->
          <div class="pp-loading">
            <span class="cubes"><span class="cube"></span><span class="cube"></span></span>
          </div>
        </div>
        <div class="pp-body pp-left" v-else-if="members.length">
          <!-- W27: foto del grupo; subirla solo owner/admin. W27b: al
               elegirla se abre el editor de encuadre ANTES de subir -->
          <avatar-editor v-if="grpEditing" :src="store.grpEdit.src"
            :initial="store.grpEdit.initial"
            @confirm="onGrpPhoto" @cancel="onGrpPhotoCancel"></avatar-editor>
          <div class="grp-av" v-else-if="chat.type === 'group'">
            <span class="av-wrap pf-zoom" :title="t('Ver foto')"
              @click="grpAvatar ? viewMedia(grpAvatar, 'foto') : openGroupProfile(chat.id)">
              <span class="avatar av72 grp-av-img" :class="{ 'has-photo': !!grpAvatar }">
                <img v-if="grpAvatar" :src="grpAvatar" alt="" loading="lazy">
                <span v-else>{{ titleOf(chat).charAt(0).toUpperCase() }}</span>
              </span>
            </span>
            <button class="grp-av-btn" type="button" v-if="canPhoto"
              :title="t('Cambiar foto del grupo')" @click="pickPhoto">
              <svg class="ic ic-sm"><use href="#i-image"></use></svg>
            </button>
          </div>
          <div class="mi-head" @click="openGroupProfile(chat.id)">
            <b>{{ titleOf(chat) }}</b>
            <span>{{ t('{n} miembro{p}', { n: members.length, p: members.length === 1 ? '' : 's' }) }}<i v-if="onlineCount"> · {{ t('{n} en línea', { n: onlineCount }) }}</i></span>
          </div>
          <!-- W27: en línea primero, desconectados después (con etiqueta
               solo si conviven los dos bloques) -->
          <template v-for="sec in memberSections" :key="sec.key">
            <div class="mi-sec" v-if="sec.show"><span>{{ t(sec.label) }}</span></div>
            <div class="mi-row" role="button" tabindex="0" v-for="m in sec.ms" :key="m.id" @click="openMember(m)" @keydown.enter.prevent="openMember(m)" @keydown.space.prevent="openMember(m)">
              <span class="av-wrap" :class="dotClass(m)">
                <span class="avatar av36" :class="{ 'has-photo': !!m.avatar_url }">
                  <img v-if="m.avatar_url" :src="mediaUrl(m.avatar_url)" alt="" loading="lazy">
                  <span v-else>{{ (m.display_name || m.username).charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <span class="mi-col">
                <span class="mi-name-line">
                  <span class="mi-name">{{ m.display_name || m.username }}<i class="mi-me" v-if="isMe(m)">{{ t('Tú') }}</i></span>
                  <i class="mi-role" v-if="isAdmin(m)" :title="t(m.role === 'owner' ? 'Propietario' : 'Administrador')">[Admin]</i>
                </span>
                <span class="mi-sub">{{ memberLine(m) }}</span>
              </span>
              <span class="ci-typing" v-if="memberTyping(m)" :title="t('escribiendo…')"><i></i><i></i><i></i></span>
              <button class="mi-more" type="button" v-if="canManageMember(m)" :title="t('Administrar')" aria-haspopup="menu" @click.stop="memberMenu($event, m)" @keydown.enter.stop @keydown.space.stop>
                <svg class="ic ic-sm"><use href="#i-dots"></use></svg>
              </button>
            </div>
          </template>
          <!-- W68: enlace de invitación (solo owner/admin): el ID
               público de 12 dígitos permite unirse por /app/group/<id> -->
          <div class="mi-sec gi-sec" v-if="canInvite">
            <span>{{ t('Enlace de invitación') }}</span>
          </div>
          <div class="gi-body" v-if="canInvite">
            <div class="gi-tgl-row">
              <div class="st-col">
                <b>{{ t('Permitir añadir por enlace') }}</b>
                <span>{{ t('Cualquiera con el enlace puede unirse') }}</span>
              </div>
              <label class="tgl"><input type="checkbox" :checked="chat.invites_open"
                @change="toggleInvites"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
            </div>
            <div class="gi-link" v-if="chat.invites_open && inviteLink">
              <input class="gi-link-i" type="text" readonly :value="inviteLink"
                :aria-label="t('Enlace de invitación')" @focus="$event.target.select()">
              <button class="icon-btn" type="button" :title="t('Copiar enlace')" @click="copyInvite">
                <svg class="ic ic-sm"><use href="#i-copy"></use></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="pp-body pp-left" v-else>
          <div class="pp-loading">{{ t('Sin miembros') }}</div>
        </div>
      </template>

      <!-- W29l: fijados y archivos abren MODALES; aquí solo quedan
           los accesos con su conteo (los datos se cargan al abrir la
           info: el número se ve de una) -->
      <div class="pp-acts">
        <button class="pp-pinhead" type="button" aria-haspopup="dialog"
          :aria-expanded="store.pinsModal ? 'true' : 'false'"
          :title="t('Mensajes fijados')" @click="openPins">
          <svg class="ic ic-sm"><use href="#i-pin"></use></svg>
          <b>{{ t('Mensajes fijados') }}</b>
          <i class="pp-ncount" v-if="pins.length">({{ pins.length }})</i>
          <svg class="ic ic-sm pp-chev"><use href="#i-chevron-down"></use></svg>
        </button>
        <button class="pp-pinhead" type="button" aria-haspopup="dialog"
          :aria-expanded="store.galModal ? 'true' : 'false'"
          :title="t('Archivos y medios')" @click="openGal">
          <svg class="ic ic-sm"><use href="#i-file"></use></svg>
          <b>{{ t('Archivos y medios') }}</b>
          <i class="pp-ncount" v-if="gal && (gal.images.length + gal.files.length)">({{ gal.images.length + gal.files.length }})</i>
          <svg class="ic ic-sm pp-chev"><use href="#i-chevron-down"></use></svg>
        </button>
      </div>

      <!-- W29l: modal de mensajes fijados (clic en la fila = salto) -->
      <div class="modal-veil" v-if="store.pinsModal" @click.self="closePins"
        role="dialog" :aria-label="t('Mensajes fijados')">
        <div class="modal pp-modal">
          <!-- W36h: título + (cantidad) juntos; cerrar al extremo derecho -->
          <header><span>{{ t('Mensajes fijados') }}<i v-if="pins.length"> ({{ pins.length }})</i></span>
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="closePins">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="pp-mbody">
            <div class="pp-loading" v-if="pinsLoading && !pins.length">{{ t('Cargando…') }}</div>
            <div class="pp-loading" v-else-if="!pins.length">{{ t('Sin mensajes fijados') }}</div>
            <button class="pp-pinrow" type="button" v-for="p in pins" :key="p.id"
              @click="goPin(p)">
              <b>{{ p.sender ? (p.sender.display_name || p.sender.username) : '' }}</b>
              <span>{{ p.spoiler ? t('Spoiler') : (p.body || (p.kind === 'voice' ? t('Nota de voz') : (p.media ? (p.media.name || t('Archivo')) : ''))) }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- W29l: modal de archivos y medios — el visor: miniaturas
           grandes con spoiler + lightbox; los archivos saltan al mensaje -->
      <div class="modal-veil gal-veil" v-if="store.galModal" @click.self="closeGal"
        role="dialog" :aria-label="t('Archivos y medios')">
        <div class="modal pp-modal">
          <!-- W36h: título + (cantidad) juntos; cerrar al extremo derecho -->
          <header><span>{{ t('Archivos y medios') }}<i v-if="gal && (gal.images.length + gal.files.length)"> ({{ gal.images.length + gal.files.length }})</i></span>
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="closeGal">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="pp-mbody">
            <div class="pp-loading" v-if="galLoading && !gal">{{ t('Cargando…') }}</div>
            <div class="pp-loading" v-else-if="!gal || (!gal.images.length && !gal.files.length)">{{ t('Sin archivos') }}</div>
            <div class="pp-galgrid" v-if="gal && gal.images.length">
              <button class="pp-galimg" type="button" v-for="im in gal.images"
                :key="im.msg_id" :title="galSpoiled(im) ? t('Spoiler') : (im.media.name || '')" @click="galClick(im)">
                <!-- W79: la miniatura spoiler va desenfocada hasta que se toca -->
                <img :class="{ 'gal-blur': galSpoiled(im) }" :src="mediaUrl(im.media.url)" alt="" loading="lazy">
                <!-- W29d: miniatura de spoiler tapada hasta tocarla -->
                <span class="gal-spoil" v-if="galSpoiled(im)">
                  <svg class="ic"><use href="#i-eye-off"></use></svg>
                </span>
              </button>
            </div>
            <button class="pp-pinrow" type="button" v-for="f in gal && gal.files"
              :key="f.msg_id" @click="goGal(f)">
              <b>{{ galSpoiled(f) ? t('Spoiler') : (f.media.name || t('Archivo')) }}</b>
              <span>{{ fmtSize(f.media.size) }}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>`,
};

/* ----------------------------------------------------- WallPanel (W20)

   Panel de "Fondo del chat": en desktop/tablet ocupa la columna del
   lista de chats (v-else del <aside class="sidebar">) y en celular es
   una hoja inferior. Muestra una conversación de EJEMPLO —Carlos y
   Javier, con las horas del pedido— con el fondo actual mientras se
   ajustan foto, opacidad del velo y difuminado: los sliders tocan las
   mismas variables (:root) que la conversación real, así que el cambio
   se ve en vivo de los dos lados. */
const WallPanel = {
  setup: function () {
    const wallEl = Vue.ref(null);
    const pickWallImg = function () { if (wallEl.value) wallEl.value.click(); };
    const clearWallImg = function () { setWallImg(''); };
    const onWallFile = function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      shrinkWall(f, function (url, err) {
        if (err) { toast(err, 'err'); return; }
        setWallImg(url);
        toast('Foto de fondo aplicada');
      });
    };
    const dim = Vue.computed({
      get: function () { return store.wdim; },
      set: function (v) { setWallDim(+v); },
    });
    const blur = Vue.computed({
      get: function () { return store.wblur; },
      set: function (v) { setWallBlur(+v); },
    });
    const close = function () { store.wallPanelOpen = false; };

    return {
      store, wallEl, pickWallImg, clearWallImg, onWallFile,
      dim, blur, close,
    };
  },
  template:
    '<aside class="wall-panel">' +
      '<header class="side-head">' +
        '<b>{{ t(\'Fondo del chat\') }}</b>' +
        '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="close">' +
          '<svg class="ic"><use href="#i-x"></use></svg>' +
        '</button>' +
      '</header>' +
      '<div class="wp-body">' +
        '<p class="wp-hint">{{ t(\'La vista previa se ve en el centro, con la conversación de ejemplo.\') }}</p>' +
        '<div class="wp-ctl">' +
          '<div class="ap-sec">{{ t(\'Foto de fondo\') }}</div>' +
          '<div class="wp-row">' +
            '<img v-if="store.wallimg" class="ap-wp-prev" :src="store.wallimg" alt="">' +
            '<button class="btn btn-ghost btn-sm" type="button" @click="pickWallImg">' +
              '{{ t(\'Elegir foto\') }}</button>' +
            '<button v-if="store.wallimg" class="btn btn-ghost btn-sm" type="button"' +
              ' @click="clearWallImg">{{ t(\'Quitar foto\') }}</button>' +
            '<input ref="wallEl" type="file" accept="image/*" class="ap-wall-input"' +
              ' @change="onWallFile">' +
          '</div>' +
        '</div>' +
        /* W27d: sin foto de fondo las opciones no están disponibles
           (opacidad y difuminado solo aplican a la imagen) */
        '<div class="wp-ctl" :class="{ off: !store.wallimg }">' +
          '<div class="ap-sec">{{ t(\'Opacidad del velo\') }}:' +
            ' <span class="wp-val">{{ dim }}%</span></div>' +
          '<input class="wp-range" type="range" min="0" max="100" step="5" v-model="dim"' +
            ' :disabled="!store.wallimg" :aria-label="t(\'Opacidad del velo\')">' +
        '</div>' +
        '<div class="wp-ctl" :class="{ off: !store.wallimg }">' +
          '<div class="ap-sec">{{ t(\'Difuminado\') }}:' +
            ' <span class="wp-val">{{ blur }} px</span></div>' +
          '<input class="wp-range" type="range" min="0" max="20" step="1" v-model="blur"' +
            ' :disabled="!store.wallimg" :aria-label="t(\'Difuminado\')">' +
        '</div>' +
      '</div>' +
    '</aside>',
};

/* --------------------------------------------------- WallPreview (W21c)

   Vista previa a TAMAÑO REAL: ocupa el centro (donde va la
   conversación) mientras el panel de fondo está abierto. Copia el
   layout de .chat-pane, así que las MISMAS capas --wallimg /
   --wall-dim / --wall-blur le aplican: lo que se ve es exactamente lo
   que se verá en el chat real al cerrar el panel. */
const WallPreview = {
  setup: function () {
    /* Muestra del pedido: Carlos (derecha) y Javier (izquierda), con
       nombre en la primera de la ronda y hora en la última (W12). */
    const SAMPLE = [
      { mine: true, name: 'Carlos', time: '6:10 p.m.',
        texts: ['¡Hola!', '¿Qué tal tu día?'] },
      { mine: false, name: 'Javier', time: '6:11 p.m.',
        texts: ['¡Hola! Todo bien por aquí', 'Acomodando unas cosas', '¿Y tú qué tal?'] },
      { mine: true, name: 'Carlos', time: '6:11 p.m.',
        texts: ['Bien también, descansando un rato', 'Hablamos más tarde'] },
      { mine: false, name: 'Javier', time: '6:12 p.m.',
        texts: ['¡Dale, perfecto!', 'Un abrazo 👍'] },
    ];
    const rows = [];
    SAMPLE.forEach(function (g) {
      g.texts.forEach(function (tx, i) {
        rows.push({
          mine: g.mine,
          name: g.name,
          showName: i === 0,
          time: i === g.texts.length - 1 ? g.time : '',
          text: tx,
        });
      });
    });
    const bodyEl = Vue.ref(null);
    Vue.onMounted(function () {
      /* como un chat real: abierta al último mensaje */
      if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight;
    });
    return { rows, bodyEl };
  },
  template:
    '<main class="wall-preview">' +
      '<header class="chat-head wp-head">' +
        '<div class="ch-col">' +
          '<div class="ch-name">{{ t(\'Vista previa del fondo\') }}</div>' +
          '<div class="ch-status">{{ t(\'Así se verá tu conversación con el fondo.\') }}</div>' +
        '</div>' +
      '</header>' +
      '<div class="msgs wp-prev" ref="bodyEl">' +
        '<div class="msg" :class="{ mine: r.mine }" v-for="(r, i) in rows" :key="i">' +
          '<div class="bubble">' +
            '<div class="b-sender wp-name" v-if="r.showName">{{ r.name }}</div>' +
            '<div class="b-text">{{ t(r.text) }}</div>' +
            '<div class="b-meta" v-if="r.time"><span class="b-time">{{ t(r.time) }}</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</main>',
};

/* ------------------------------------------- PeoplePanel (W27)
   Panel Personas/Amigos del sidebar: pestañas "Activos" (amigos, en
   línea primero) y "Solicitudes" (bloques Enviados y Recibidas con
   Aceptar / Rechazar / Cancelar). La app arranca en esta vista. */
/* W66e: frases del estado vacío de "Activos" cuando no hay nadie en
   línea — las tres primeras van directas y el resto con un toque de
   humor; se elige una al azar (nunca la misma dos veces seguidas). */
const OFFLINE_LINES = [
  'No hay nadie en línea por ahora.',
  'Parece que no hay contactos activos en este momento.',
  'Sin conexiones activas.',
  'Todo muy silencioso por aquí... No hay nadie en línea.',
  'Silencio total. Tus contactos están desconectados.',
  '¡Cero actividad! Todos andan desconectados o buscando café.',
  'Parece que el servidor está solo en este momento.',
];
function _pickOffLine(prev) {
  let i = Math.floor(Math.random() * OFFLINE_LINES.length);
  if (OFFLINE_LINES[i] === prev && OFFLINE_LINES.length > 1) {
    i = (i + 1) % OFFLINE_LINES.length;
  }
  return OFFLINE_LINES[i];
}

const PeoplePanel = {
  name: 'PeoplePanel',
  setup: function () {
    /* W27c: la pestaña vive en el store: la opción "Personas" del
       sidebar (o abrir un chat) la devuelve a la pantalla principal. */
    const tab = Vue.computed({
      get: function () { return store.peopleTab; },
      set: function (v) { store.peopleTab = v; },
    });
    const q = Vue.ref('');
    const results = Vue.ref([]);

    const people = Vue.computed(function () {
      return store.people || { friends: [], sent: [], received: [] };
    });
    const nReq = Vue.computed(function () {
      return people.value.received.length;
    });
    const loaded = Vue.computed(function () { return !!store.people; });

    const friendOn = function (u) {
      return !!(u && (store.presence[u.id] != null ? store.presence[u.id] : u.online));
    };
    const lineOf = function (u) {
      if (!friendOn(u)) return t('Desconectado');
      if (u.status_text) return u.status_text;
      if (u.status_preset) return presetLabel(u.status_preset);
      return t('En línea');
    };

    /* W27e: Activos muestra SOLO amigos conectados. "Ausente" (busy)
       y "No molestar" (dnd) son estados de quien está en línea, así
       que sus filas siguen aquí; los desconectados no aparecen (los
       invisibles ya llegan marcados como desconectados por el server). */
    const activeOnline = Vue.computed(function () {
      const fs = people.value.friends;
      const out = [];
      for (let i = 0; i < fs.length; i++) if (friendOn(fs[i])) out.push(fs[i]);
      return out;
    });

    /* W66e: "nadie en línea" (con amigos pero todos desconectados) →
       frase aleatoria con icono grande. Se renueva cada vez que la lista
       queda vacía; la inicial ya viene al azar en cada carga. */
    const nobodyOnline = Vue.computed(function () {
      return loaded.value && people.value.friends.length > 0
        && !activeOnline.value.length;
    });
    const emptyLine = Vue.ref(_pickOffLine());
    Vue.watch(nobodyOnline, function (on) {
      if (on) emptyLine.value = _pickOffLine(emptyLine.value);
    });

    /* Búsqueda de personas para enviar solicitud (mismo debounce que la
       lupa de chats: 300 ms y mínimo 2 caracteres).
       W68: una query de EXACTAMENTE 16 dígitos busca por ID público. */
    let timer = 0;
    Vue.watch(q, function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        const s = q.value.trim();
        if (s.length < 2) { results.value = []; return; }
        if (/^\d{16}$/.test(s)) {
          api('GET', '/users/pub/' + s).then(function (r) {
            results.value = r && r.user ? [r.user] : [];
          }).catch(function () {
            results.value = [];
          });
          return;
        }
        searchUsers(s).then(function (rs) {
          results.value = rs;
        }).catch(function () {
          results.value = [];
        });
      }, 300);
    });

    const isFriend = function (u) {
      const fs = people.value.friends;
      for (let i = 0; i < fs.length; i++) if (fs[i].id === u.id) return true;
      return false;
    };
    const sentTo = function (u) {
      const rs = people.value.sent;
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user && rs[i].user.id === u.id) return rs[i].id;
      }
      return 0;
    };

    const run = function (fn, okMsg) {
      Promise.resolve(fn()).then(function () {
        if (okMsg) toast(okMsg, 'ok');
      }).catch(function (err) {
        toastErr(err, 'No se pudo completar la acción');
      });
    };

    /* Clic en un amigo: abre el DM (o lo crea si aún no existe). */
    const openFriend = function (u) {
      for (let i = 0; i < store.chats.length; i++) {
        const c = store.chats[i];
        if (c.type === 'dm' && c.title && c.title.id === u.id) {
          openChat(c.id);
          return;
        }
      }
      run(function () { return createDm(u.username); });
    };

    const send = function (u) {
      run(function () { return sendFriendRequest(u.username); }, 'Solicitud enviada');
    };
    const cancel = function (r) {
      run(function () { return cancelFriendRequest(r.id); });
    };
    const reject = function (r) {
      run(function () { return rejectFriendRequest(r.id); });
    };
    /* Aceptar crea (o abre) el DM y salta a la pestaña Chats con el chat
       listo (acceptFriendRequest lo hace en actions). */
    const accept = function (r) {
      run(function () { return acceptFriendRequest(r.id); });
    };

    /* W27b: en Solicitudes la búsqueda filtra las listas. */
    const qReq = Vue.ref('');
    const matchR = function (r) {
      const s = qReq.value.trim().toLowerCase();
      if (!s) return true;
      const u = r.user || {};
      return (u.display_name || '').toLowerCase().indexOf(s) >= 0 ||
        (u.username || '').toLowerCase().indexOf(s) >= 0;
    };
    const sentF = Vue.computed(function () {
      return people.value.sent.filter(matchR);
    });
    const recF = Vue.computed(function () {
      return people.value.received.filter(matchR);
    });
    /* "Buscar personas": mismo efecto que el ＋ del sidebar (abre el
       modal de chat nuevo con la búsqueda de personas). */
    const buscarPersonas = function () {
      store.newChatMode = 'dm';
      store.newChatOpen = true;
    };

    return {
      store, tab, q, results, people, nReq, loaded, activeOnline,
      nobodyOnline, emptyLine,   /* W66e: frase aleatoria "sin nadie" */
      lineOf, isFriend, sentTo, openFriend, send, cancel, reject, accept,
      qReq, sentF, recF, buscarPersonas,
      dotClass, mediaUrl,
    };
  },
  template: `
    <div class="ppl">
      <!-- W66f: iconito delante del texto en cada pestaña -->
      <div class="ppl-tabs">
        <button class="ppl-tab" type="button" :class="{ on: tab === 'active' }"
          @click="tab = 'active'">
          <svg class="ic tab-ic" aria-hidden="true"><use href="#i-users"></use></svg>
          {{ t('Activos') }}</button>
        <button class="ppl-tab" type="button" :class="{ on: tab === 'req' }"
          @click="tab = 'req'">
          <svg class="ic tab-ic" aria-hidden="true"><use href="#i-userplus"></use></svg>
          {{ t('Solicitudes') }}
          <i class="ppl-badge" v-if="nReq">{{ nReq }}</i></button>
      </div>

      <template v-if="tab === 'active'">
        <div class="search-pill ppl-find">
          <svg class="ic ic-sm"><use href="#i-search"></use></svg>
          <input v-model="q" :placeholder="t('Buscar personas por usuario')"
            :aria-label="t('Buscar personas por usuario')">
          <button class="clr-x" :class="{ show: !!q }" type="button"
            :title="t('Borrar')" @click="q = ''">
            <svg class="ic ic-xs"><use href="#i-x"></use></svg></button>
        </div>

        <div class="ppl-list" v-if="q.trim().length >= 2">
          <div class="ppl-row" v-for="u in results" :key="u.id">
            <span class="av-wrap" :class="dotClass(u)">
              <span class="avatar av36" :class="{ 'has-photo': !!u.avatar_url }">
                <img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">
                <span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>
              </span>
            </span>
            <span class="ppl-col">
              <b>{{ u.display_name || u.username }}</b>
              <i>@{{ u.username }}</i>
            </span>
            <span class="ppl-acts">
              <button class="btn btn-xs" v-if="isFriend(u)" type="button"
                @click="openFriend(u)">{{ t('Mensaje') }}</button>
              <button class="btn btn-xs btn-ghost" v-else-if="sentTo(u)" type="button"
                disabled>{{ t('Solicitud enviada') }}</button>
              <button class="btn btn-xs" v-else type="button"
                @click="send(u)">{{ t('Enviar solicitud') }}</button>
            </span>
          </div>
          <div class="list-empty" v-if="!results.length">{{ t('Sin resultados') }}</div>
        </div>

        <div class="ppl-list" v-else>
          <button class="ppl-row" type="button" v-for="u in activeOnline" :key="u.id"
            @click="openFriend(u)">
            <span class="av-wrap" :class="dotClass(u)">
              <span class="avatar av36" :class="{ 'has-photo': !!u.avatar_url }">
                <img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">
                <span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>
              </span>
            </span>
            <span class="ppl-col">
              <b>{{ u.display_name || u.username }}</b>
              <i>{{ lineOf(u) }}</i>
            </span>
          </button>
          <div class="list-empty" v-if="loaded && !people.friends.length">
            {{ t('Aún no tienes amigos. ¡Busca personas arriba para empezar!') }}
          </div>
          <!-- W66e: icono grande + frase aleatoria (directa o con humor) -->
          <div class="list-empty empty-mood" v-else-if="nobodyOnline">
            <svg class="ic mood-ic" aria-hidden="true"><use href="#i-users"></use></svg>
            <p class="mood-line">{{ t(emptyLine) }}</p>
            <p class="mood-sub">{{ t('Cuando tus contactos se conecten, aparecerán en esta lista.') }}</p>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="search-pill ppl-find">
          <svg class="ic ic-sm"><use href="#i-search"></use></svg>
          <input v-model="qReq" :placeholder="t('Buscar solicitudes')"
            :aria-label="t('Buscar solicitudes')">
          <button class="clr-x" :class="{ show: !!qReq }" type="button"
            :title="t('Borrar')" @click="qReq = ''">
            <svg class="ic ic-xs"><use href="#i-x"></use></svg></button>
        </div>
        <div class="ppl-cta">
          <button class="btn btn-ghost btn-full" type="button" @click="buscarPersonas">
            <svg class="ic ic-sm"><use href="#i-plus"></use></svg>{{ t('Buscar personas') }}
          </button>
        </div>
        <div class="ppl-list">
          <template v-if="sentF.length">
            <div class="mi-sec mi-sec-always"><span>{{ t('Enviados') }}</span></div>
            <div class="ppl-row" v-for="r in sentF" :key="'s' + r.id">
              <span class="av-wrap" :class="dotClass(r.user)">
                <span class="avatar av36" :class="{ 'has-photo': !!r.user.avatar_url }">
                  <img v-if="r.user.avatar_url" :src="mediaUrl(r.user.avatar_url)" alt="" loading="lazy">
                  <span v-else>{{ (r.user.display_name || r.user.username).charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <span class="ppl-col">
                <b>{{ r.user.display_name || r.user.username }}</b>
                <i>@{{ r.user.username }}</i>
              </span>
              <span class="ppl-acts">
                <button class="btn btn-xs btn-ghost" type="button"
                  @click="cancel(r)">{{ t('Cancelar') }}</button>
              </span>
            </div>
          </template>
          <template v-if="recF.length">
            <div class="mi-sec mi-sec-always"><span>{{ t('Recibidas') }}</span></div>
            <div class="ppl-row" v-for="r in recF" :key="'r' + r.id">
              <span class="av-wrap" :class="dotClass(r.user)">
                <span class="avatar av36" :class="{ 'has-photo': !!r.user.avatar_url }">
                  <img v-if="r.user.avatar_url" :src="mediaUrl(r.user.avatar_url)" alt="" loading="lazy">
                  <span v-else>{{ (r.user.display_name || r.user.username).charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <span class="ppl-col">
                <b>{{ r.user.display_name || r.user.username }}</b>
                <i>@{{ r.user.username }}</i>
              </span>
              <span class="ppl-acts">
                <button class="btn btn-xs" type="button"
                  @click="accept(r)">{{ t('Aceptar') }}</button>
                <button class="btn btn-xs btn-ghost" type="button"
                  @click="reject(r)">{{ t('Rechazar') }}</button>
              </span>
            </div>
          </template>
          <div class="list-empty" v-if="!sentF.length && !recF.length && qReq.trim()">
            {{ t('Sin resultados') }}
          </div>
          <!-- W66f: sin solicitudes → icono + frase amable (la búsqueda
               vacía se queda con "Sin resultados" de siempre). -->
          <div class="list-empty empty-mood" v-else-if="!sentF.length && !recF.length">
            <svg class="ic mood-ic" aria-hidden="true"><use href="#i-userplus"></use></svg>
            <p class="mood-line">{{ t('Parece que aún no hay solicitudes. ¡Pronto serás famoso!') }}</p>
          </div>
        </div>
      </template>
    </div>`,
};

/* ------------------------------------------------------- ChatShell */

export const ChatShell = {
  components: { MessageRow, NewChatModal, SettingsModal, MeProfileModal, MeProfileEditModal, UsernameModal, ArchiveLockModal, DownloadViewer, ConfirmBox, RequestSentModal, JoinGroupModal, PermissionGate, ReadsBox, CallBox, ProfilePanel, ChatInfoPanel, GroupProfileModal, EmojiPicker, SpamBox, WallPanel, WallPreview, PeoplePanel, RenameGroupModal },
  setup: function () {
    const scroller = Vue.ref(null);
    const input = Vue.ref(null);
    const fileInput = Vue.ref(null);
    const draft = Vue.ref('');
    const stick = Vue.ref(true);
    /* W29d: marcar el PRÓXIMO mensaje/archivo/nota como spoiler. */
    const spoilNext = Vue.ref(false);
    /* W29h: mantener ENVIAR 3 s → el mensaje sale como spoiler. */
    const holdOn = Vue.ref(false);
    let holdTimer = 0;
    let holdFired = false;     /* el clic al soltar ya no reenvía */
    let spoilOnce = false;     /* spoiler de UN solo envío (long-press) */
    const rootEl = Vue.ref(null);     // W11: raíz p/ drag & drop de archivos
    /* W27h: al (re)montar la pantalla principal, el "Cargando…" del
       arranque cubre la carga de chats, gente y mensajes iniciales. */
    store.booting = true;

    /* ---------- lista ---------- */

    const filteredChats = Vue.computed(function () {
      const q = store.search.trim().toLowerCase();
      /* La lista normal no muestra archivados; la pestaña Archivados
         muestra sólo esos. */
      const wantArchived = !!store.showArchived;
      return store.chats.filter(function (c) {
        if (!!c.archived !== wantArchived) return false;
        if (!q) return true;
        return chatTitle(c).toLowerCase().indexOf(q) >= 0 ||
          (c.title && c.title.username && c.title.username.toLowerCase().indexOf(q) >= 0);
      });
    });

    const archivedCount = Vue.computed(function () {
      let n = 0;
      for (let i = 0; i < store.chats.length; i++) if (store.chats[i].archived) n++;
      return n;
    });

    const listEmpty = Vue.computed(function () {
      return !filteredChats.value.length;
    });

    const activeChat = Vue.computed(function () {
      const id = store.activeChatId;
      for (let i = 0; i < store.chats.length; i++) if (store.chats[i].id === id) return store.chats[i];
      return null;
    });

    /* W27h: "Cargando…" de la conversación — solo mientras el chat
       activo aún no tiene mensajes (si el flag quedó de otro chat que
       sigue en vuelo, un chat ya cargado no se tapa). */
    const chatLoading = Vue.computed(function () {
      return !!(store.chatLoading && store.activeChatId &&
        !store.loaded[store.activeChatId]);
    });

    const avatarOf = function (c) {
      if (!c) return '';
      const url = c.type === 'dm' ? (c.title && c.title.avatar_url) : c.avatar_url;
      return url ? mediaUrl(url) : '';
    };
    const initialsOf = function (c) {
      const t = chatTitle(c);
      return t ? t.charAt(0).toUpperCase() : '?';
    };

    const previewText = function (c) {
      const lm = c.last_message;
      if (!lm) return c.type === 'dm' ? t('Escribe para empezar') : t('Grupo nuevo');
      const mine = !!(lm.sender && store.user && lm.sender.id === store.user.id);
      let who = '';
      if (mine) who = t('Tú: ');
      else if (c.type === 'group' && lm.sender) who = (lm.sender.display_name || lm.sender.username) + ': ';
      if (lm.kind === 'system') return lm.body || '';
      /* W45: el preview de la lista no debe destapar un spoiler. */
      if (lm.spoiler) return who + t('Spoiler');
      if (lm.kind === 'image') return who + t('Imagen');
      if (lm.kind === 'sticker') {
        return who + (lm.media ? t('Sticker') : (lm.body || ''));
      }
      if (lm.kind === 'voice') return who + t('Nota de voz');
      if (lm.kind === 'file') {
        /* W11: los videos se distinguen de los archivos comunes */
        return who + (lm.media && /^video\//.test(lm.media.mime || '') ? t('Video') : t('Archivo'));
      }
      return who + (lm.body || '');
    };

    /* W29c: pelotita de "escribiendo…" para la lista de chats. */
    const chatTyping = function (c) {
      const bag = store.typing[c.id];
      if (!bag) return 0;
      let n = 0;
      for (const k in bag) n++;
      return n;
    };

    const listTime = function (c) {
      return c.last_message ? fmtListTime(c.last_message.created_at) : '';
    };

    /* ---------- conversación ---------- */

    /* P1/W62: no meter miles de filas en el DOM. Se renderiza la ventana
       más reciente por trozos de 80 y se amplía con "Ver anteriores" o al
       llegar arriba; el historial sigue completo en store.msgs. */
    const ROWS_PAGE = 80;
    const renderLimit = Vue.ref(ROWS_PAGE);

    const rows = Vue.computed(function () {
      const all = store.msgs[store.activeChatId];
      const out = [];
      if (!all) return out;
      /* Copia: más abajo se recorta con splice y NO hay que tocar el
         store.msgs original. */
      const arr = all.slice();
      if (arr.length > renderLimit.value) {
        arr.splice(0, arr.length - renderLimit.value);
      }
      const meId = store.user ? store.user.id : 0;
      const chat = activeChat.value;
      const isGroup = !!(chat && chat.type === 'group');
      /* W12: ✓ enviado → ✓✓ recibido → ✓✓ azul leído.
         W29c: en GRUPOS ✓✓ = "todos" → MÍNIMO entre los demás (semilla
         peer_*_min_seq + eventos en vivo); en DM (un solo par) máx y
         mín dan lo mismo y sigue sembrándose con peer_*_seq. */
      let rseq; let dseq;
      const rs = store.readSeqs[store.activeChatId];
      const ds = store.deliveredSeqs[store.activeChatId];
      if (isGroup) {
        /* W29c: ✓✓ de grupo = "todos" → mínimo entre los demás. La
           semilla (peer_*_min_seq) vale para quienes no han dicho nada
           en vivo; si los eventos en vivo ya cubren a todos los demás,
           manda el mínimo en vivo (la semilla 0 ya no estorba). */
        const others = Math.max(1,
          (chat && chat.member_count ? chat.member_count : 2) - 1);
        const liveMin = function (bag) {
          let cov = 0; let mn = 0; let seen = 0;
          if (bag) {
            for (const k in bag) {
              if (+k === meId) continue;
              cov++;
              if (!seen || bag[k] < mn) { mn = bag[k]; seen = 1; }
            }
          }
          return seen ? { cov: cov, mn: mn } : null;
        };
        const lr = liveMin(rs);
        rseq = chat && chat.peer_read_min_seq != null ? chat.peer_read_min_seq : 0;
        if (lr) rseq = lr.cov >= others ? lr.mn : Math.min(rseq, lr.mn);
        const ld = liveMin(ds);
        dseq = chat && chat.peer_delivered_min_seq != null ? chat.peer_delivered_min_seq : 0;
        if (ld) dseq = ld.cov >= others ? ld.mn : Math.min(dseq, ld.mn);
      } else {
        rseq = chat && chat.peer_read_seq ? chat.peer_read_seq : 0;
        if (rs) for (const k in rs) { if (+k !== meId && rs[k] > rseq) rseq = rs[k]; }
        dseq = chat && chat.peer_delivered_seq ? chat.peer_delivered_seq : 0;
        if (ds) for (const k in ds) { if (+k !== meId && ds[k] > dseq) dseq = ds[k]; }
      }
      let prevDay = null;
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        const p = i > 0 ? arr[i - 1] : null;
        const n = i + 1 < arr.length ? arr[i + 1] : null;
        const d = new Date(m.created_at * 1000);
        const dk = dayKey(d);
        const mine = !!(m.sender && meId && m.sender.id === meId);
        const sameSender = !!(p && p.sender && m.sender && p.sender.id === m.sender.id);
        const tight = !!(p && sameSender && dk === prevDay && m.kind !== 'system' &&
          p.kind !== 'system' && m.created_at - p.created_at < 600);
        /* W12: la hora se ve SOLO en el último mensaje del minuto (WhatsApp):
           mismo emisor, mismo minuto y siguiente no-sistema → sin hora. */
        const sameRun = !!(n && n.sender && m.sender && n.sender.id === m.sender.id &&
          n.kind !== 'system' && m.kind !== 'system');
        const showTime = !sameRun ||
          Math.floor(n.created_at / 60) !== Math.floor(m.created_at / 60);
        /* W29c: nombre visible del emisor —la cara del avatar usa el
           MISMO criterio (solo en la primera fila de la tanda). Las
           RESPUESTAS siempre lo muestran: el nombre va sobre la cita. */
        const withName = isGroup && !mine && m.kind !== 'system' &&
          !!m.sender && (!tight || !!m.reply_to);
        out.push({
          ref: m,
          day: dk !== prevDay ? dayLabel(d) : null,
          tight: tight,
          mine: mine,
          /* W29c: columna de avatar en TODOS los entrantes de grupo
             (burbujas alineadas); foto/letra solo en el primero de la
             tanda —donde se ve el nombre del emisor—, estilo WhatsApp.
             Los mensajes del sistema van centrados: sin columna. */
          avCol: m.kind !== 'system',
          avatar: m.sender ? {
            url: m.sender.avatar_url || '',
            ini: (m.sender.display_name || m.sender.username || '?')
              .charAt(0).toUpperCase(),
            name: m.sender.display_name || m.sender.username || '',
          } : null,
          showSender: withName,
          /* recibos apagados (W6): solo ✓, nunca ✓✓ ni azul */
          state: !mine || !m.seq ? 'sent'
            : (!store.prefs.receipts ? 'sent'
              : (rseq >= m.seq ? 'read'
                : (dseq >= m.seq ? 'delivered' : 'sent'))),
          showTime: showTime,
          time: fmtTime(d),
        });
        prevDay = dk;
      }
      return out;
    });

    const hiddenRows = Vue.computed(function () {
      const all = store.msgs[store.activeChatId];
      if (!all) return 0;
      return Math.max(0, all.length - renderLimit.value);
    });

    /* W29c: "escribiendo…" por USUARIO: varios pueden escribir a la vez
       (grupos); store.typing[chatId] = { userId: {u, exp} }. */
    const typingIds = Vue.computed(function () {
      const c = store.typing[store.activeChatId] || {};
      const out = [];
      for (const k in c) out.push(+k);
      return out;
    });
    const typingActive = Vue.computed(function () {
      return typingIds.value.length > 0;
    });
    const typingNames = Vue.computed(function () {
      const ids = typingIds.value;
      const c = activeChat.value;
      const bag = store.typing[store.activeChatId] || {};
      const mem = (store.info && store.info.chatId === store.activeChatId &&
                   store.info.members) ? store.info.members : null;
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const ent = bag[ids[i]];
        let nm = ent && ent.u ? ent.u : '';
        if (!nm && c && c.type === 'dm' && c.title && c.title.id === ids[i]) {
          nm = c.title.display_name || c.title.username || '';
        }
        if (!nm && mem) {
          for (let j = 0; j < mem.length; j++) {
            if (mem[j].id === ids[i]) {
              nm = mem[j].display_name || mem[j].username || '';
              break;
            }
          }
        }
        if (!nm) nm = '#' + ids[i];
        out.push(nm);
      }
      return out;
    });
    const typingLabel = Vue.computed(function () {
      const ns = typingNames.value;
      if (!ns.length) return '';
      const c = activeChat.value;
      if (ns.length === 1) {
        return t('{n} está escribiendo…', { n: ns[0] });
      }
      if (c && c.type !== 'dm' && ns.length > 3) {
        return t('{a}, {b} y {m} más están escribiendo…',
          { a: ns[0], b: ns[1], m: ns.length - 2 });
      }
      return t('{n} están escribiendo…', { n: ns.join(', ') });
    });
    /* Avatares apilados tipo cartas junto a los puntos (sólo grupos). */
    const typingAvs = Vue.computed(function () {
      const c = activeChat.value;
      const ids = typingIds.value;
      if (!c || c.type !== 'group' || !ids.length) return [];
      const mem = (store.info && store.info.chatId === store.activeChatId &&
                   store.info.members) ? store.info.members : null;
      const out = [];
      if (!mem) return out;
      for (let i = 0; i < ids.length && out.length < 3; i++) {
        for (let j = 0; j < mem.length; j++) {
          if (mem[j].id === ids[i] && mem[j].avatar_url) {
            out.push(mediaUrl(mem[j].avatar_url));
            break;
          }
        }
      }
      return out;
    });

    /* W26: la presencia del peer se lee de store.presence (eventos WS +
       snapshot al reconectar); c.title.online del REST es solo el primer
       relleno y puede traer un estado con fecha vieja. */
    const peerOn = Vue.computed(function () {
      const c = activeChat.value;
      if (!c || c.type !== 'dm' || !c.title) return false;
      const tt = c.title;
      return !!(store.presence[tt.id] != null ? store.presence[tt.id] : tt.online);
    });

    const statusLine = Vue.computed(function () {
      const c = activeChat.value;
      if (!c) return '';
      if (typingActive.value) return t('escribiendo…');
      if (c.type === 'group') {
        const n = c.member_count || 0;
        return t('{n} participante{p}', { n: n, p: n === 1 ? '' : 's' });
      }
      const tt = c.title || {};
      const on = store.presence[tt.id] != null ? store.presence[tt.id] : tt.online;
      return on ? t('en línea') : fmtLastSeen(tt.last_seen);
    });

    /* ---------- scroll ---------- */

    const scrollBottom = function () {
      const el = scroller.value;
      if (el) el.scrollTop = el.scrollHeight;
    };

    /* W54d: al abrir el teclado el alto cambia después de la animación
       del sistema; bajamos la conversación para que el último mensaje
       quede a la vista junto al composer. */
    const keepComposerVisible = function () {
      setTimeout(function () {
        if (document.activeElement === input.value) scrollBottom();
      }, 280);
    };
    const onKeyboardViewport = function () {
      if (document.activeElement !== input.value) return;
      setTimeout(function () {
        if (document.activeElement === input.value) scrollBottom();
      }, 80);
    };

    /* La imagen crece el layout al terminar de cargar: si estábamos
       pegados al final, volver a scrollear. */
    const onImgLoad = async function () {
      if (!stick.value) return;
      await Vue.nextTick();
      scrollBottom();
    };

    const onScroll = function () {
      const el = scroller.value;
      if (!el) return;
      stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (el.scrollTop <= 40 && store.hasMore[store.activeChatId] &&
          !store.loadingOlder && store.loaded[store.activeChatId]) {
        doLoadOlder();
      }
    };

    const doLoadOlder = async function () {
      const el = scroller.value;
      const id = store.activeChatId;
      if (!id || store.loadingOlder) return;
      const prevH = el ? el.scrollHeight : 0;
      const prevTop = el ? el.scrollTop : 0;
      if (store.hasMore[id]) await loadOlder(id);
      if (store.activeChatId !== id) return;
      /* La página recién cargada (o la ya cargada que estaba fuera de la
         ventana) se hace visible. */
      renderLimit.value += ROWS_PAGE;
      await Vue.nextTick();
      if (el) el.scrollTop = el.scrollHeight - prevH + prevTop;
    };

    /* W27: el alto de una fila cambia cuando un medio termina de cargar
       (imagen, video, nota, archivo) o una subida se confirma. Un
       ResizeObserver por fila (no por .msgs: su alto propio no varía al
       cargar medios) y, si estamos cerca del final, la vista baja sola. */
    let rowRO = null;
    const syncRowsRO = function () {
      const el = scroller.value;
      if (!el || !window.ResizeObserver) return;
      if (!rowRO) {
        rowRO = new ResizeObserver(function () {
          if (stick.value) scrollBottom();
        });
      }
      rowRO.disconnect();
      for (let i = 0; i < el.children.length; i++) rowRO.observe(el.children[i]);
    };

    Vue.watch(rows, async function () {
      await Vue.nextTick();
      syncRowsRO();
      if (stick.value) scrollBottom();
    });

    /* W25: los puntos de "escribiendo…" se montan al final de la lista y
       empujan el alto del scroll: si estamos cerca del final (stick), la
       vista baja solita para mostrarlos; si el usuario está leyendo
       historial, no se la arrastra. */
    Vue.watch(typingActive, async function (on) {
      if (!on || !stick.value) return;
      await Vue.nextTick();
      scrollBottom();
    });

    Vue.watch(function () { return store.activeChatId; }, async function (id) {
      stick.value = true;
      renderLimit.value = ROWS_PAGE;
      draft.value = '';
      replyTo.value = null;
      /* W7: al cambiar de chat se limpian menú, picker y panel de info */
      store.ctx = null;
      store.reactFor = 0;
      store.emoOpen = false;
      clearAc();
      store.info = null;
      /* W13: nada de búsqueda ni reenvío cruzando chats */
      searchOpen.value = false;
      sQ.value = '';
      sResults.value = [];
      sErr.value = '';
      fwdFor.value = null;
      /* W8: nada de zoom ni ediciones cruzando chats */
      closeLb();
      store.editFor = 0;
      store.editDraft = '';
      /* W28b: en grupos los miembros se cargan aunque el panel de info
         esté cerrado (la burbuja pinta las @menciones con esa lista). */
      const esGrupo = id && store.chats.some(function (c) {
        return c.id === id && c.type === 'group';
      });
      if (id && (store.infoOpen || esGrupo) &&
          (!store.info || store.info.chatId !== id || store.info.error)) {
        loadMembers(id);
      }
      if (rec.value === 'on') stopRec(false);   // no mandar media al cambiar de chat
      if (input.value) input.value.style.height = 'auto';
      if (!id) return;
      await Vue.nextTick();
      scrollBottom();
    });

    /* ---------- responder ---------- */

    const replyTo = Vue.ref(null);

    const startReply = function (m) {
      replyTo.value = m;
      if (input.value) input.value.focus();
    };
    const cancelReply = function () { replyTo.value = null; };

    const replySender = Vue.computed(function () {
      const s = replyTo.value;
      if (!s || !s.sender) return '';
      if (typeof s.sender === 'string') return s.sender;
      return s.sender.display_name || s.sender.username || '';
    });

    const replyPreview = Vue.computed(function () {
      const s = replyTo.value;
      if (!s) return '';
      /* W45: al responder un spoiler, la barra de respuesta tampoco lo
         muestra. */
      if (s.spoiler) return t('Spoiler');
      const txt = s.body || '';
      if (txt) return txt.length > 90 ? txt.slice(0, 90) + '…' : txt;
      if (s.kind === 'voice') return t('Nota de voz');
      if (s.kind === 'image') return t('Imagen');
      if (s.kind === 'system') return '';
      return t('Archivo adjunto');
    });

    const onReact = function (m, emoji) {
      toggleReaction(store.activeChatId, m.id, emoji);
    };

    /* ---------- notas de voz ---------- */

    const rec = Vue.ref('off');        // off | on
    const recSecs = Vue.ref(0);
    let recorder = null;
    let recStream = null;
    let recTimer = null;
    let recChunks = [];
    let recSend = false;
    /* W13: onda de voz (picos tomados del stream mientras graba) */
    let recCtx = null;
    let recAnalyser = null;
    let recPeaks = [];
    let recPeakTimer = null;
    /* W24: onda EN VIVO del micrófono (estilo WhatsApp): ventana móvil con
       los últimos picos; las barras se dibujan con esos datos reales. Si el
       AnalyserNode falla, la grabación sigue y se ve la onda falsa de CSS. */
    const REC_WAVE_N = 22;
    const recWave = Vue.ref([]);

    const recTime = Vue.computed(function () {
      const s = recSecs.value;
      return Math.floor(s / 60) + ':' + pad(s % 60);
    });

    function clearRec() {
      if (recTimer) { clearInterval(recTimer); recTimer = null; }
      if (recPeakTimer) { clearTimeout(recPeakTimer); recPeakTimer = null; }
      recAnalyser = null;
      if (recCtx) { try { recCtx.close(); } catch (e) {} recCtx = null; }
      recPeaks = [];
      recWave.value = [];
      if (recStream) {
        const ts = recStream.getTracks();
        for (let i = 0; i < ts.length; i++) { try { ts[i].stop(); } catch (e) {} }
        recStream = null;
      }
      recorder = null;
      recChunks = [];
      rec.value = 'off';
      recSecs.value = 0;
    }

    /* W24: escala Y (scaleY) de la barra i de la onda en vivo. Sin dato aún
       (analyser caído o primeros 80 ms) devuelve el valor plano de la onda. */
    const recBar = function (i) {
      const v = recWave.value[i];
      if (v == null) return 0.18;
      return Math.max(0.07, Math.min(1, v / 100));
    };

    const startRec = async function () {
      if (rec.value === 'on') return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        /* W19: sobre HTTP con IP ajena a localhost el navegador BLOQUEA
           el micrófono (contexto inseguro): decirlo claro, no culpar al
           navegador. */
        toast(window.isSecureContext === false
          ? 'El micrófono necesita HTTPS (o abrir Foxinix en localhost)'
          : 'Tu navegador no soporta notas de voz', 'err');
        return;
      }
      if (!(await ensurePermission('mic'))) {
        toast(t('Permiso de micrófono necesario para la nota de voz'), 'err');
        return;
      }
      try {
        /* W20: si hay un micrófono elegido en Ajustes → Chat, se usa ese
           (deviceId exact); si ya no existe o falla, el del sistema.
           W66g: AGC/ruido/eco explícitos: sin autoGainControl muchos
           móviles graban las notas de voz bajísimas y no se escuchan. */
        const recAudio = {
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: true,
        };
        recStream = await navigator.mediaDevices.getUserMedia({
          audio: store.micDev
            ? Object.assign({ deviceId: { exact: store.micDev } }, recAudio)
            : recAudio,
        });
      } catch (e) {
        let lastErr = e;
        if (store.micDev) {
          try {
            recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e2) {
            lastErr = e2;
            recStream = null;
          }
        }
        if (!recStream) {
          toast(lastErr && (lastErr.name === 'NotAllowedError' ||
            lastErr.name === 'SecurityError')
            ? 'Permiso de micrófono bloqueado. Actívalo en Ajustes de Android > Foxinix > Permisos.'
            : 'No se pudo acceder al micrófono', 'err');
          return;
        }
      }
      /* W13/W24: picos de la onda — mismo stream, AnalyserNode cada 80 ms
         (alimenta la onda EN VIVO mientras graba y la del mensaje enviado).
         Si falla, el audio se manda igual (onda falsa CSS al grabar). */
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          recCtx = new AC();
          const aSrc = recCtx.createMediaStreamSource(recStream);
          recAnalyser = recCtx.createAnalyser();
          recAnalyser.fftSize = 1024;
          aSrc.connect(recAnalyser);
          recPeaks = [];
          const buf = new Uint8Array(recAnalyser.fftSize);
          const tick = function () {
            if (!recAnalyser) return;
            recAnalyser.getByteTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = Math.abs(buf[i] - 128) / 128;
              if (v > peak) peak = v;
            }
            const p = Math.min(100, Math.round(peak * 130));
            recPeaks.push(p);
            /* W24: onda en vivo — media móvil (ataque rápido, caída suave)
               para que las barras sigan el volumen real del micrófono. */
            const last = recWave.value.length ? recWave.value[recWave.value.length - 1] : p;
            recWave.value.push(Math.round(p * 0.65 + last * 0.35));
            while (recWave.value.length > REC_WAVE_N) recWave.value.shift();
            recPeakTimer = setTimeout(tick, 80);
          };
          tick();
        }
      } catch (e) { recAnalyser = null; }
      let rec1;
      try {
        let mime = '';
        const cands = ['audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
        for (let i = 0; i < cands.length; i++) {
          if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(cands[i])) {
            mime = cands[i]; break;
          }
        }
        rec1 = mime
          ? new window.MediaRecorder(recStream, { mimeType: mime })
          : new window.MediaRecorder(recStream);
      } catch (e) {
        clearRec();
        toast('No se pudo iniciar la grabación', 'err');
        return;
      }
      recorder = rec1;
      recChunks = [];
      rec1.ondataavailable = function (e) {
        if (e.data && e.data.size) recChunks.push(e.data);
      };
      rec1.onstop = function () {
        const blob = new Blob(recChunks, { type: rec1.mimeType || 'audio/webm' });
        const doSend = recSend;
        const chatId = store.activeChatId;
        const durBefore = recSecs.value;   // ANTES de clearRec (lo reinicia)
        /* W13: onda — downsample a ≤96 picos (0..100), ANTES de clearRec */
        let peaks = null;
        if (recPeaks.length) {
          const N = Math.min(96, recPeaks.length);
          const step = recPeaks.length / N;
          peaks = [];
          for (let i = 0; i < N; i++) {
            const a = Math.floor(i * step);
            const b = Math.max(a + 1, Math.floor((i + 1) * step));
            let s = 0;
            for (let j = a; j < b && j < recPeaks.length; j++) if (recPeaks[j] > s) s = recPeaks[j];
            peaks.push(s);
          }
        }
        clearRec();
        if (doSend && blob.size) {
          const f = new File([blob], 'nota-de-voz.webm', { type: blob.type || 'audio/webm' });
          stick.value = true;
          /* dur = segundos grabados (el WebM no los trae en el header) */
          const durSecs = Math.max(1, Math.round(durBefore));
          /* W29d: la nota de voz también respeta el interruptor. */
          const spoV = spoilNext.value;
          sendMedia(chatId, f, 'voice', null, null, peaks, durSecs,
            { spoiler: spoV })
            .catch(function () { /* toast ya mostrado */ });
          if (spoV) spoilNext.value = false;
        }
      };
      try {
        rec1.start(250);
      } catch (e) {
        clearRec();
        toast('No se pudo iniciar la grabación', 'err');
        return;
      }
      rec.value = 'on';
      recSecs.value = 0;
      recTimer = setInterval(function () {
        recSecs.value++;
        if (recSecs.value >= 300) stopRec(true);   // tope 5 min
      }, 1000);
    };

    const stopRec = function (sendIt) {
      if (!recorder) return;
      recSend = !!sendIt;
      if (recorder.state === 'inactive') { clearRec(); return; }
      try { recorder.stop(); } catch (e) { clearRec(); }
    };

    /* ---------- entrada ---------- */

    const send = async function () {
      const text = shortcodesToEmoji(draft.value);   // W17: :fire: → 🔥
      /* W62: enviar todos los adjuntos en cola */
      if (pendingAtts.value.length > 0) {
        const src = replyTo.value;
        const spo = spoilNext.value || spoilOnce;
        spoilOnce = false;
        replyTo.value = null;
        stick.value = true;
        const items = pendingAtts.value.slice();
        pendingAtts.value = [];
        /* OJO: aquí NO va cancelAtt() — ese reset ponía spoilNext=false y
           sendAtt releía el interruptor ya apagado (la imagen salía sin
           spoiler). La cola ya está vacía; cada item revoca su thumb. */
        att.value = null;
        for (let i = 0; i < items.length; i++) {
          const a = items[i];
          att.value = a;
          const cap = i === 0 ? (text.trim() ? text : '') : '';
          await sendAtt(cap, spo);
          att.value = null;
        }
        draft.value = '';
        store.emoOpen = false;
        clearAc();
        mOpen.value = false;
        if (input.value) input.value.style.height = 'auto';
        if (spo && !draft.value.trim()) spoilNext.value = false;
        return;
      }
      /* W23: con adjunto único (compatibilidad), el texto (aunque sea vacío) viaja como mensaje */
      if (att.value) { await sendAtt(text.trim() ? text : ''); return; }
      if (!text.trim()) return;
      const src = replyTo.value;
      const spo = spoilNext.value || spoilOnce;   // W29d/h: interruptor o long-press
      spoilOnce = false;
      draft.value = '';
      replyTo.value = null;
      store.emoOpen = false;                  // W7: se cierra al enviar
      clearAc();
      mOpen.value = false;                    // W28b
      if (input.value) input.value.style.height = 'auto';
      stick.value = true;
      try {
        await sendText(store.activeChatId, text, src, undefined, { spoiler: spo });
        /* W29d: el spoiler marca UN mensaje; suelto el interruptor. */
        if (spo && !att.value && !draft.value.trim()) spoilNext.value = false;
      } catch (e) {
        if (!draft.value) { draft.value = text; replyTo.value = src; }   // devolver texto y respuesta
      }
    };

    const onInput = function (e) {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
      notifyTyping(store.activeChatId);
      updAc();                                  // W17: :código: → emoji
    };

    const onAttach = async function (e) {
      const files = e.target.files ? Array.prototype.slice.call(e.target.files) : [];
      e.target.value = '';
      pickFiles(files);
    };

    /* ---------- W11/W23: adjuntar (ficha con datos + texto del compositor) ---------- */

    const att = Vue.ref(null);   // {file, thumb} antes de enviar
    const pendingAtts = Vue.ref([]);   // lista de adjuntos en cola (W62)

    /* Ficha: nombre con extensión, tipo y tamaño. Si no hay
       previsualización suelta (att), manda el primer ítem de la cola. */
    const typeLabel = function (mime) {
      mime = mime || '';
      if (/^image\//.test(mime)) return t('Imagen');
      if (/^video\//.test(mime)) return t('Video');
      if (/^audio\//.test(mime)) return t('Audio');
      return t('Archivo');
    };
    const sizeOf = function (f) { return fmtSize((f && f.size) || 0); };
    const attFile = function () {
      return (att.value && att.value.file) ||
        (pendingAtts.value[0] && pendingAtts.value[0].file) || null;
    };
    const attName = Vue.computed(function () {
      const f = attFile();
      return (f && f.name) || t('Archivo');
    });
    const attType = Vue.computed(function () {
      const f = attFile();
      return typeLabel(f && f.type);
    });
    const attSize = Vue.computed(function () {
      const f = attFile();
      return f ? sizeOf(f) : '';
    });

    const cancelAtt = function () {
      const a = att.value;
      att.value = null;
      // W62: limpiar también la cola
      for (let i = 0; i < pendingAtts.value.length; i++) {
        const p = pendingAtts.value[i];
        if (p.thumb) { try { URL.revokeObjectURL(p.thumb); } catch (e) {} }
      }
      pendingAtts.value = [];
      spoilNext.value = false;   /* W29g: el interruptor vive con el adjunto */
      if (a && a.thumb) { try { URL.revokeObjectURL(a.thumb); } catch (e) {} }
    };

    /* Quitar UN archivo de la cola (la lista de adjuntos permite quitar
       cada ítem por separado sin vaciar todo). */
    const removeAtt = function (i) {
      const p = pendingAtts.value[i];
      if (!p) return;
      if (p.thumb) { try { URL.revokeObjectURL(p.thumb); } catch (e) {} }
      pendingAtts.value.splice(i, 1);
      if (att.value === p) att.value = null;
      /* Con un solo ítem que sí se previsualiza, vuelve la ficha clásica. */
      const last = pendingAtts.value[pendingAtts.value.length - 1];
      if (pendingAtts.value.length === 1 && last &&
          /^(image|video)\//.test(last.file.type || '')) {
        att.value = last;
      }
      if (!pendingAtts.value.length) {
        att.value = null;
        spoilNext.value = false;
      }
    };

    const sendAtt = async function (cap, spoArg) {
      const a = att.value;
      if (!a) return;
      const src = replyTo.value;
      /* W23: el mensaje se escribe en el compositor (puede venir vacío) */
      const body = typeof cap === 'string' ? cap : draft.value;
      /* W61: si el pie supera 3000, el adjunto va sin pie y el texto se
         archiva aparte como mensaje.txt/message.txt. */
      const longBody = charCount(body) > MAX_TEXT_CHARS;
      /* W29d/h: el interruptor (o el long-press) marca este adjunto. El
         lote de envío (send) pasa el spoiler ya calculado para que todos
         los ítems salgan igual. */
      const spo = typeof spoArg === 'boolean' ? spoArg
        : (spoilNext.value || spoilOnce);
      spoilOnce = false;
      replyTo.value = null;
      att.value = null;
      stick.value = true;
      if (a.thumb) { try { URL.revokeObjectURL(a.thumb); } catch (e) {} }
      draft.value = '';
      store.emoOpen = false;                  // W7: se cierra al enviar
      clearAc();
      mOpen.value = false;                    // W28b
      if (input.value) input.value.style.height = 'auto';
      try {
        await sendMedia(store.activeChatId, a.file, null, src,
          longBody ? '' : body, null, null, { spoiler: spo });
        if (longBody) {
          await sendText(store.activeChatId, body, src, 'text',
            { spoiler: false });
        }
        if (spo && !draft.value.trim()) spoilNext.value = false;
      } catch (err) {
        /* la burbuja queda con su reintento; el interruptor se suelta
           para que el próximo adjunto no salga spoiler sin querer (W29g) */
        spoilNext.value = false;
      }
    };

    /* W61: aviso discreto cuando el texto se archivará como .txt. */
    const draftCount = Vue.computed(function () { return charCount(draft.value); });
    const draftLong = Vue.computed(function () { return draftCount.value > MAX_TEXT_CHARS; });

    /* Una imagen/video sola abre la ficha (W23: el texto va en el
       compositor); el resto se manda de una. También entra por Ctrl+V
       y por arrastrar y soltar. */
    const pickFiles = function (files) {
      if (!files || !files.length || !store.activeChatId) return;
      for (let i = 0; i < files.length; i++) {
        if (!files[i].size) {
          /* W29a: un archivo vacío no se adjunta ni se envía. */
          toast(t('El archivo está vacío'), 'err');
          return;
        }
        if (files[i].size > 15 * 1024 * 1024) {
          toast(t('Máximo 15 MB por archivo'), 'err');
          return;
        }
      }
      // W62: añadir todos los archivos a la cola, nunca enviar de una vez
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const obj = {
          file: f,
          thumb: (/^image\//.test(f.type || '') && window.URL && URL.createObjectURL)
            ? URL.createObjectURL(f) : '',
        };
        pendingAtts.value.push(obj);
      }
      // Mantener compatibilidad visual: si hay un solo archivo imagen/vídeo, también lo ponemos en att para la previsualización clásica. OJO: antes aquí se llamaba cancelAtt() y borraba la cola recién cargada (el archivo desaparecía).
      if (files.length === 1 && /^(image|video)\//.test(files[0].type || '')) {
        att.value = pendingAtts.value[pendingAtts.value.length - 1];
        Vue.nextTick(() => { if (input.value) input.value.focus(); });
      } else {
        /* Cola múltiple (o archivo no-imagen): la ficha se arma desde la
           cola; no queda una previsualización suelta apuntando a un
           archivo que ya no es el único. */
        att.value = null;
      }
    };

    /* Ctrl+V: pegar una imagen (o lo que traiga el portapapeles como archivo) */
    const onPasteEv = function (e) {
      const cd = e.clipboardData;
      if (!cd || !cd.items) return;
      const files = [];
      for (let i = 0; i < cd.items.length; i++) {
        if (cd.items[i].kind === 'file') {
          const f = cd.items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) { e.preventDefault(); pickFiles(files); }
      /* W65: el texto pegado NO se reescribe en el compositor. Los
         :código: y emojis Unicode se convierten al enviar (sendText). */
    };

    /* W65: una imagen de emoji que falle se oculta; el `alt` vacío ya
       evita que el navegador pinte el glyph del sistema encima. */
    const onEmojiImgError = function (e) {
      const el = e.target;
      if (el && el.tagName === 'IMG' && el.classList.contains('emo')) {
        el.classList.add('emo-broken');
      }
    };

    /* Arrastrar y soltar archivos sobre la conversación */
    const dropping = Vue.ref(false);

    const onDragOver = function (e) {
      const dt = e.dataTransfer;
      if (!dt || !dt.types) return;
      for (let i = 0; i < dt.types.length; i++) {
        if (dt.types[i] === 'Files') {
          e.preventDefault();
          dropping.value = true;
          return;
        }
      }
    };

    const onDragLeave = function (e) {
      const cur = e.currentTarget;
      if (!e.relatedTarget || !cur || !cur.contains || !cur.contains(e.relatedTarget)) {
        dropping.value = false;
      }
    };

    const onDropEv = function (e) {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      e.preventDefault();
      dropping.value = false;
      pickFiles(Array.prototype.slice.call(dt.files));
    };

    /* W11: cancelar/reintentar la subida desde la burbuja */
    const onUpCancel = function (row) {
      cancelUpload(store.activeChatId, row.client_msg_id);
    };
    const onUpRetry = function (row) {
      retryUpload(store.activeChatId, row.client_msg_id);
    };

    /* W57: el APK entrega el chat/mensaje de la notificación por el
       puente nativo. Se consume al terminar el arranque y cada vez que la
       app vuelve a primer plano (una notificación pudo tocarse mientras
       el WebView estaba suspendido). */
    const consumeNativeTarget = function () {
      const an = window.FoxinixAndroid;
      if (!an || typeof an.pendingTarget !== 'function') return;
      let raw = '';
      try { raw = an.pendingTarget(); } catch (e) { return; }
      if (!raw) return;
      try {
        const o = JSON.parse(raw);
        openNotificationTarget(o.chat_id, o.message_id);
      } catch (e) {}
    };
    window.__foxinixNativeTarget = consumeNativeTarget;

    /* W57: popups animados al terminar/fallar una descarga nativa. El
       APK manda el tipo (video, imagen…), no un texto ya conjugado. */
    const dlDoneText = function (type) {
      for (let i = 0; i < DL_TYPES.length; i++) {
        if (DL_TYPES[i].id === type) return t(DL_TYPES[i].done);
      }
      return t('Archivo guardado');
    };
    const dlFailText = function (type) {
      for (let i = 0; i < DL_TYPES.length; i++) {
        if (DL_TYPES[i].id === type) {
          return t('No se pudo guardar {type}', { type: t(DL_TYPES[i].label) });
        }
      }
      return t('No se pudo guardar el archivo');
    };
    window.__foxinixDownloadDone = function (raw) {
      let o = raw;
      try { if (typeof raw === 'string') o = JSON.parse(raw); } catch (e) { return; }
      if (!o) return;
      toast(dlDoneText(o.type), 'ok');
    };
    window.__foxinixDownloadError = function (raw) {
      let o = raw;
      try { if (typeof raw === 'string') o = JSON.parse(raw); } catch (e) { return; }
      if (!o) return;
      toast(dlFailText(o.type), 'err');
    };
    const onNativeVisible = function () {
      if (!document.hidden) consumeNativeTarget();
    };
    document.addEventListener('visibilitychange', onNativeVisible);
    window.addEventListener('focus', onNativeVisible);

    /* ---------- ciclo de vida ---------- */

    /* W38: la fase "Cargando vista previas…" precarga las fotos de la
       lista (avatares + la última imagen de cada chat + perfiles);
       las ondas de audio ya vienen con el último mensaje. Acotado: 40
       imágenes y tope de 3 s (la app no se queda esperando red lenta). */
    const warmPreviews = function () {
      const urls = [];
      const seen = {};
      const push = function (u) {
        if (!u) return;
        const key = String(u).split('?')[0];
        if (!seen[key] && urls.length < 40) { seen[key] = 1; urls.push(u); }
      };
      const list = store.chats || [];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        push(c.type === 'dm' ? (c.title && c.title.avatar_url) : c.avatar_url);
        const lm = c.last_message;
        if (lm && lm.media && (lm.media.mime || '').indexOf('image/') === 0) {
          push(lm.media.url);
        }
      }
      const ppl = store.people || {};
      const groups = [ppl.friends, ppl.sent, ppl.received];
      for (let g = 0; g < groups.length; g++) {
        const arr = groups[g] || [];
        for (let i = 0; i < arr.length; i++) push(arr[i] && arr[i].avatar_url);
      }
      const loads = urls.map(function (u) { return preloadImage(u); });
      return Promise.race([
        Promise.all(loads),
        new Promise(function (r) { setTimeout(r, 3000); }),
      ]);
    };

    /* W27h: arranque de la interfaz — la pantalla de carga (W38) muestra
       cada fase real: chats ("Cargando los mensajes…"), gente/bloques
       ("Cargando usuarios…"), fotos de la lista ("Cargando vista
       previas…") y, si la URL pide un chat, sus mensajes: la app se
       revela completa de una vez. */
    const bootAll = async function () {
      try {
        store.bootPhase = 'chats';
        await loadChats();
        resolvePendingChat();   // por si la lista ya existía (reentrada)
        store.bootPhase = 'people';
        await Promise.all([loadPeople(), loadBlocks()]);
        store.bootPhase = 'previews';
        await warmPreviews();
        store.bootPhase = 'ready';
        if (store.activeChatId && !store.loaded[store.activeChatId]) {
          await openChat(store.activeChatId, true);
        }
      } finally {
        store.booting = false;
      }
    };

    Vue.onMounted(function () {
      hydrateDownloads();
      /* W58: onboarding de permisos antes de arrancar la conexión y la
         interfaz. Si el usuario salta, la app sigue y las funciones
         vuelven a pedir el permiso cuando se usan. */
      const start = function () {
        startWS();
        bootAll().then(consumeNativeTarget);   // W27h + W57: aviso nativo al final
        initInfoPanel();                       // W7: info por defecto si hay lugar
      };
      bootPermissions().catch(function () {}).then(start);
      /* W61/W62: favoritos y biblioteca se cargan al arrancar para que
         las estrellas de mensajes ya salgan rellenas, sin esperar a que
         se abra el selector. */
      ensureGifFavs();
      ensureUserAssets();
      document.addEventListener('click', onDocClick);
      window.addEventListener('keydown', onEsc);
      /* W54d: teclado de Android (resize del WebView o viewport visual) */
      window.addEventListener('resize', onKeyboardViewport);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onKeyboardViewport);
      }
      /* W11: pegar (Ctrl+V) + arrastrar y soltar archivos */
      document.addEventListener('paste', onPasteEv);
      document.addEventListener('error', onEmojiImgError, true);
      const root = rootEl.value;
      if (root) {
        root.addEventListener('dragover', onDragOver);
        root.addEventListener('dragleave', onDragLeave);
        root.addEventListener('drop', onDropEv);
      }
      if (store.activeChatId) {
        Vue.nextTick(function () { scrollBottom(); });
      }
    });

    Vue.onUnmounted(function () {
      if (rec.value === 'on') stopRec(false);
      clearRec();
      stopWS();
      window.removeEventListener('resize', onPickResize);   // W29g
      window.removeEventListener('resize', onKeyboardViewport);
      window.removeEventListener('focus', onNativeVisible);   // W57
      document.removeEventListener('visibilitychange', onNativeVisible);
      if (window.__foxinixNativeTarget === consumeNativeTarget) {
        window.__foxinixNativeTarget = null;
      }
      window.__foxinixDownloadDone = null;
      window.__foxinixDownloadError = null;
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onKeyboardViewport);
      }
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onEsc);
      document.removeEventListener('paste', onPasteEv);
      document.removeEventListener('error', onEmojiImgError, true);
      const root = rootEl.value;
      if (root) {
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('dragleave', onDragLeave);
        root.removeEventListener('drop', onDropEv);
      }
      cancelAtt();                                 // W11: suelta la miniatura
      store.activeChatId = 0;
      store.search = '';
      store.newChatOpen = false;
      store.newChatMode = 'dm';
      /* W6: ningún panel/ajuste sobrevive a la pantalla */
      store.profile = null;
      store.settingsOpen = false;
      store.settingsAtHome = false;
      store.settingsTab = 'apariencia';
      store.requestSent = null;
      store.pendingUser = 0;
      store.meProfileOpen = false;
      store.confirmBox = null;
      /* W7 */
      store.infoOpen = false;
      store.info = null;
      store.ctx = null;
      store.reactFor = 0;
      /* W8 */
      store.pwOpen = false;
      store.emOpen = false;
      store.editFor = 0;
      store.editDraft = '';
      closeLb();
    });

    const startNewChat = function () {
      store.newChatMode = 'dm';
      store.newChatOpen = true;
    };

    /* "+" del header del grupo: agregar miembros al grupo activo. */
    const openAddMember = function () {
      store.newChatMode = 'add';
      store.newChatOpen = true;
    };

    const wsLabel = Vue.computed(function () {
      return store.ws === 'connecting' ? t('Conectando…') : t('Sin conexión');
    });

    /* ---------- W6: panel de usuario, perfil, ajustes ---------- */

    const myStatusLine = Vue.computed(function () {
      /* W36d: sin conexión (WS caído) el pie muestra "Desconectado",
         sin importar el estado de perfil guardado. */
      if (store.ws !== 'on') return t('Desconectado');
      const u = store.user;
      if (!u) return '';
      if (u.status_text) return u.status_text;
      if (u.status_preset) return presetLabel(u.status_preset);
      return '@' + u.username;
    });

    const openSettings = function (tab) {
      /* W8: sin pestaña fija, abre en la última vista (default: la primera).
         W65: en móvil la URL ?settings=main abre la portada de categorías;
         un enlace a una categoría concreta entra directo a ella. */
      if (tab) store.settingsTab = tab;
      /* W66f: Archivados NO se apaga aquí. La velada del modal (0,16 s)
         deja ver el fondo y pasar de Archivados a Chats de golpe
         parpadeaba: la lista se queda detrás mientras Ajustes entra y se
         limpia al cerrar (close/openWallPanel), igual que antes. */
      store.settingsAtHome = !tab && window.innerWidth <= 760;
      store.settingsOpen = true;
    };

    /* Perfil de otro usuario: openProfile() es de nivel módulo (lo usan
       también la cabecera, el menú contextual y el panel de info). */

    /* ---------- W7: info del chat, menús contextuales, emojis ---------- */

    /* W29g: UN solo panel de emojis con 3 pestañas (Emojis/Stickers/
       GIFs); pickTab elige el cuerpo y el clamp lo hace el padre. */
    const pickEl = Vue.ref(null);
    const pickTab = Vue.ref('emo');
    const emoNative = Vue.computed(function () { return emoStyle() === 'system'; });
    const setPickTab = function (id) {
      pickTab.value = id;
      /* W36k/W61: abrir GIFs o Stickers trae la biblioteca propia. */
      if (id === 'gif') ensureGifFavs();
      if (id === 'gif' || id === 'st') ensureUserAssets();
      if (pickEl.value) {
        Vue.nextTick(function () { clampPanel(pickEl.value, true); });
      }
    };
    const onPickResize = function () {
      if (store.emoOpen && pickEl.value) clampPanel(pickEl.value, false);
    };
    window.addEventListener('resize', onPickResize);
    /* W17: el selector de emojis vive en store.emoOpen (compartido). */
    const toggleEmo = function () {
      const on = !store.emoOpen;
      store.ctx = null;          // un solo panel flotante a la vez
      store.reactFor = 0;
      store.emoOpen = on;
      if (on) {
        pickTab.value = 'emo';   // al abrir, muestra los emojis
        clearAc();
        ensureUserAssets();
        Vue.nextTick(function () { clampPanel(pickEl.value, true); });
      }
    };
    const onSticker = function (ch) {
      store.emoOpen = false;
      sendText(store.activeChatId, ch, null, 'sticker').catch(function () {});
    };
    const onGif = function (name) {
      store.emoOpen = false;
      sendGif(store.activeChatId, name);
    };

    /* W36k: enviar un GIF favorito (los subidos ya viven en el server:
       sólo se referencia su media_id) y quitarlo de la lista. */
    const onGifFav = function (f) {
      store.emoOpen = false;
      if (!f.media_id) { onGif(f.name); return; }
      api('POST', '/chats/' + store.activeChatId + '/messages',
        { kind: 'image', body: '', media_id: f.media_id,
          client_msg_id: String(Date.now()) }).catch(function () {
        toast('No se pudo enviar el GIF', 'err');
      });
    };
    const onFavDel = function (f) {
      const body = f.media_id ? { media_id: f.media_id } : { name: f.name };
      api('DELETE', '/gifs/favorites', body).then(function () {
        store.gifFavs = store.gifFavs.filter(function (x) {
          return f.media_id ? x.media_id !== f.media_id : x.name !== f.name;
        });
      }).catch(function () { toast('No se pudo quitar el favorito', 'err'); });
    };

    /* W61: subir y enviar GIFs/stickers propios. */
    const assetBusy = Vue.ref(false);
    const onAssetUpload = async function (kind, ev) {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      /* W66c: como GIF vale el .gif o un WebP animado (viaja tal cual). */
      if (kind === 'gif' && f.type !== 'image/gif' &&
          !(f.type === 'image/webp' && await isAnimWebp(f))) {
        toast(t('Elige un archivo GIF o WebP animado'), 'err');
        return;
      }
      if (kind === 'sticker' && !/^image\//.test(f.type || '')) {
        toast(t('Elige una imagen'), 'err');
        return;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast(t('Máximo 15 MB por archivo'), 'err');
        return;
      }
      if (assetList(kind).length >= ASSET_MAX) {
        toast(kind === 'gif' ? t('Máximo 10 GIFs') : t('Máximo 10 stickers'), 'err');
        return;
      }
      assetBusy.value = true;
      try {
        const a = await uploadUserAsset(kind, f);
        if (a) toast(kind === 'gif' ? t('GIF agregado') : t('Sticker agregado'), 'ok');
      } catch (e) {
        toastErr(e, 'No se pudo subir el archivo');
      } finally {
        assetBusy.value = false;
      }
    };
    const sendAsset = function (kind, a) {
      if (!a || !a.media_id) return;
      store.emoOpen = false;
      api('POST', '/chats/' + store.activeChatId + '/messages', {
        kind: kind === 'gif' ? 'image' : 'sticker',
        body: '',
        media_id: a.media_id,
        client_msg_id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      }).catch(function (e) {
        toastErr(e, 'No se pudo enviar el archivo');
      });
    };
    const delAsset = function (kind, a) {
      removeUserAsset(kind, a).catch(function (e) {
        toastErr(e, 'No se pudo borrar el archivo');
      });
    };
    const favGifSrc = function (f) {
      /* los de la biblioteca son estáticos; los subidos llevan firma
         que se refresca en cada listado */
      return f.media_id ? mediaUrl(f.url) : f.url;
    };

    /* W29h: mantener ENVIAR presionado 3 s → el mensaje sale como
       spoiler (con relleno de progreso); si se suelta antes, es el
       clic normal de siempre. */
    const clickSend = function () {
      if (holdFired) { holdFired = false; return; }  // ya disparó el hold
      send();
    };
    const holdUp = function () {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
      holdOn.value = false;
    };
    const holdDown = function (e) {
      if (holdTimer || holdOn.value) return;
      if (e && e.button) return;                    // sólo botón principal
      if (!draft.value.trim() && !att.value) return;
      if (spoilNext.value) return;                  // ya armado por el interruptor
      holdFired = false;
      holdOn.value = true;
      holdTimer = setTimeout(function () {
        holdTimer = 0;
        holdOn.value = false;
        holdFired = true;
        spoilOnce = true;
        toast(t('Enviado como spoiler'));
        send();
      }, 3000);
    };

    /* W17: autocompletado ":fire" → 🔥 en la caja de escritura. Al
       escribir ':' se arma la lista desde los códigos de emoji.js;
       Tab/Enter/flechas eligen y al enviar ":código:" se convierte. */
    const acEl = Vue.ref(null);
    const acList = Vue.ref([]);
    const acIdx = Vue.ref(0);
    const acTok = Vue.ref(null);     // {s, e, word} sobre el borrador

    const clearAc = function () {
      acList.value = [];
      acTok.value = null;
      acIdx.value = 0;
    };
    const updAc = function () {
      mScan();                                   // W28b: también sigue el @
      const el = input.value;
      const cur = draft.value || '';
      let pos = cur.length;
      if (el && typeof el.selectionStart === 'number') pos = el.selectionStart;
      const before = cur.slice(0, pos);
      const m = before.match(/:([A-Za-z0-9_+-]{1,40})$/);
      if (!m) { clearAc(); return; }
      const list = emojiCodesPrefix(m[1].toLowerCase(), 8);
      if (!list.length) { clearAc(); return; }
      acTok.value = { s: pos - m[0].length, e: pos, word: m[1] };
      acList.value = list;
      if (acIdx.value >= list.length) acIdx.value = 0;
    };
    const pickAc = function (i) {
      const tok = acTok.value;
      const it = acList.value[i];
      if (!tok || !it) return;
      const cur = draft.value || '';
      draft.value = cur.slice(0, tok.s) + it.ch + cur.slice(tok.e);
      clearAc();
      Vue.nextTick(function () {
        if (!input.value) return;
        input.value.focus();
        const pos = tok.s + it.ch.length;
        try {
          input.value.selectionStart = pos;
          input.value.selectionEnd = pos;
        } catch (err) { /* sin selección */ }
        onInput({ target: input.value });
      });
    };
    /* W28b: autocompletado de @menciones en grupos (misma idea que el
       de :código: — Tab/Enter eligen, Esc cierra; el popup vive en el
       composer). La lista sale del panel de info del chat. */
    const mOpen = Vue.ref(false);
    const mIdx = Vue.ref(0);
    const mStart = Vue.ref(0);   // índice del '@' en el draft
    const mQ = Vue.ref('');      // letras escritas tras el '@'
    const isGroupChat = Vue.computed(function () {
      const c = activeChat.value;
      return !!(c && c.type === 'group');
    });
    const mList = Vue.computed(function () {
      if (!mOpen.value || !isGroupChat.value) return [];
      const inf = store.info;
      if (!inf || inf.chatId !== store.activeChatId) return [];
      const q = mQ.value.toLowerCase();
      const out = (inf.members || []).filter(function (u) {
        return u.username &&
          (!q || u.username.toLowerCase().indexOf(q) >= 0);
      });
      return out.slice(0, 6);
    });
    const mScan = function () {
      const el = input.value;
      if (!el || !isGroupChat.value) { mOpen.value = false; return; }
      const pos = typeof el.selectionStart === 'number'
        ? el.selectionStart : (el.value || '').length;
      const before = (el.value || '').slice(0, pos);
      const mm = before.match(/(?:^|[\s(])@([A-Za-z0-9_.]*)$/);
      if (!mm) { mOpen.value = false; return; }
      mStart.value = pos - mm[1].length - 1;
      mQ.value = mm[1];
      mIdx.value = 0;
      mOpen.value = true;
    };
    const mPick = function (u) {
      const el = input.value;
      if (!el || !u) return;
      const v = el.value || '';
      const caret = typeof el.selectionStart === 'number'
        ? el.selectionStart : v.length;
      const ins = '@' + u.username + ' ';
      draft.value = v.slice(0, mStart.value) + ins + v.slice(caret);
      mOpen.value = false;
      Vue.nextTick(function () {
        const p = mStart.value + ins.length;
        el.focus();
        try {
          el.selectionStart = p;
          el.selectionEnd = p;
        } catch (err) { /* sin selección */ }
      });
    };

    /* El popup se reclampea al área de mensajes (mismo truco que los
       chips; clampPanel mide la caja real de .msgs). */
    const onAcResize = function () {
      if (!acList.value.length) return;
      Vue.nextTick(function () { clampPanel(acEl.value, false); });
    };
    Vue.watch(acList, onAcResize);

    /* Puntito propio del side-head y del panel de usuario. */
    const myDot = Vue.computed(function () {
      return dotClass(store.user, store.ws === 'on');
    });

    /* Cabecera de la conversación: en directos abre el perfil del
       contacto; en grupos, alterna el panel de info. */
    const headDotClass = Vue.computed(function () {
      const c = activeChat.value;
      const d = dotClass(c && c.type === 'dm' ? c.title : null);
      d.clickable = true;
      return d;
    });
    const headTitle = Vue.computed(function () {
      const c = activeChat.value;
      return c && c.type === 'dm' ? t('Ver perfil') : t('Info del chat');
    });

    /* W57: actividad sin leer en OTROS chats, para el contador discreto
       del botón atrás (móvil). No estorba dentro del chat abierto. */
    const backUnread = Vue.computed(function () {
      let n = 0;
      const list = store.chats || [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === store.activeChatId) continue;
        n += parseInt(list[i].unread, 10) || 0;
      }
      return n;
    });
    const onHeadClick = function () {
      const c = activeChat.value;
      if (!c) return;
      if (c.type === 'dm') openPeerProfile();
      else openGroupProfile(c.id);
    };

    const toggleInfo = function () {
      store.infoOpen = !store.infoOpen;
      if (store.infoOpen && store.activeChatId) loadMembers(store.activeChatId);
    };

    /* El panel derecho queda abierto por defecto si hay lugar (W7). */
    const initInfoPanel = function () {
      store.infoOpen = window.innerWidth > 1100;
    };

    /* W19: sidebar colapsable (solo escritorio; en móvil manda el
       layout de pantalla completa y el botón queda oculto). */
    const toggleSide = function () { setSideCollapsed(!store.sideCollapsed); };
    const unfoldSide = function () { setSideCollapsed(false); };

    /* W27c: la opción "Personas" vive en el PANEL DE CHATS (sidebar),
       arriba de la lista. En escritorio lleva al centro (y cierra el
       chat si hay uno abierto); en móvil va a pantalla completa. Siempre
       vuelve a la pantalla principal (pestaña Activos). */
    const isNarrow = Vue.ref(window.innerWidth <= 760);
    const onResizeW = function () {
      isNarrow.value = window.innerWidth <= 760;
    };
    window.addEventListener('resize', onResizeW);
    Vue.onUnmounted(function () {
      window.removeEventListener('resize', onResizeW);
    });
    const peopleActive = Vue.computed(function () {
      if (store.showArchived) return false;
      return isNarrow.value ? !!store.peopleMobile : !store.activeChatId;
    });
    /* W29a: globo con las solicitudes de amistad recibidas (tope 9+). */
    const reqCount = Vue.computed(function () {
      const p = store.people;
      return (p && p.received) ? p.received.length : 0;
    });
    const leaveArchiveLock = function () {
      store.archiveLockPrompt = false;
      store.archiveLockErr = '';
    };
    const enterArchived = function () {
      /* Salir de Ajustes (si estaba abierto) para ver la lista */
      store.settingsOpen = false;
      store.settingsAtHome = false;
      store.peopleMobile = false;
      store.search = '';
      if (isNarrow.value && store.activeChatId) closeChat();
      /* W60: si está bloqueada, la lista NO se revela detrás del modal
         de escritorio. Al desbloquear (o si no hay clave) se muestra. */
      const locked = store.archiveHasLock && !store.archiveUnlocked;
      store.showArchived = !locked;
      if (locked) {
        store.archiveLockErr = '';
        store.archiveLockPrompt = true;
      }
    };
    const toggleArchived = function () {
      /* W60: la sección es privada. Si está bloqueada, primero se abre
         la pantalla/modal de desbloqueo; la lista queda detrás. */
      if (store.archiveLockPrompt) {
        leaveArchiveLock();
        store.showArchived = false;
        return;
      }
      if (store.showArchived) {
        store.showArchived = false;
        store.search = '';
        return;
      }
      enterArchived();
    };
    /* La pestaña/botón de navegación NO alternar: estando ya en
       Archivados el toque se queda ahí (salir es trabajo de la
       flecha "Volver a Chats"). */
    const goArchived = function () {
      /* W66f: con Ajustes abierto ENCIMA de Archivados (la lista ya no se
         apaga al abrir Ajustes para no parpadear), el toque en la pestaña
         cierra Ajustes y deja ver la lista tal cual estaba. */
      if (store.showArchived) {
        if (store.settingsOpen) {
          store.settingsOpen = false;
          store.settingsAtHome = false;
        }
        return;
      }
      if (store.archiveLockPrompt) return;
      enterArchived();
    };
    const goPeople = function () {
      store.settingsOpen = false;
      store.showArchived = false;
      leaveArchiveLock();
      store.peopleTab = 'active';
      if (isNarrow.value) {
        if (store.activeChatId) closeChat();
        store.peopleMobile = true;
      } else if (store.activeChatId) {
        closeChat();
      }
    };
    const closePeople = function () { store.peopleMobile = false; };

    /* W65: el modal "Solicitud enviada" enlaza a esta pantalla. */
    const goRequests = function () {
      store.settingsOpen = false;
      store.settingsAtHome = false;
      store.showArchived = false;
      store.profile = null;
      leaveArchiveLock();
      store.peopleTab = 'req';
      if (isNarrow.value) {
        if (store.activeChatId) closeChat();
        store.peopleMobile = true;
      } else if (store.activeChatId) {
        closeChat();
      }
    };
    Vue.watch(function () { return store.requestsJump; }, function (nv, ov) {
      if (nv && nv !== ov) goRequests();
    });

    /* W54: navegación móvil. En el teléfono la app usa una barra inferior
       (Chats / Personas / Ajustes) en vez de la fila "Personas" y el panel
       de usuario del sidebar de escritorio. */
    const mobileChats = function () {
      store.settingsOpen = false;
      store.peopleMobile = false;
      store.showArchived = false;
      leaveArchiveLock();
      if (store.activeChatId) closeChat();
    };

    /* W54: en la cabecera del chat, en pantalla chica, las llamadas y
       "agregar miembros" viven en un menú ⋮ para no aplastar el nombre
       del chat. En escritorio siguen como botones directos. */
    const chatMore = function (e) {
      const c = activeChat.value;
      if (!c) return;
      const items = [];
      if (canJoinGroup.value) {
        /* W64: en el teléfono el menú muestra la sala abierta con su
           aforo: "Entrar en la llamada - [persona] N". */
        items.push({
          label: 'Entrar en la llamada', icon: 'i-phone',
          pill: { icon: 'i-user', text: String(activeGroupCall.value.count) },
          fn: joinCall,
        });
      } else if (canCall.value) {
        items.push({
          label: 'Llamar', icon: 'i-phone',
          fn: function () { doCall(false); },
        });
        items.push({
          label: 'Videollamada', icon: 'i-video',
          fn: function () { doCall(true); },
        });
      }
      if (c.type === 'group') {
        items.push({
          label: 'Agregar miembros', icon: 'i-userplus',
          fn: function () { openAddMember(); },
        });
        /* W57: en el APK/móvil el menú ⋮ es la vía natural para
           renombrar el grupo (solo owner/admin, el server revalida). */
        if (c.my_role === 'owner' || c.my_role === 'admin') {
          items.push({
            label: 'Renombrar grupo', icon: 'i-pencil',
            fn: function () {
              store.renameGroupId = c.id;
              store.renameGroupTitle = chatTitle(c);
            },
          });
        }
      }
      items.push({
        label: c.pinned ? 'Desfijar chat' : 'Fijar chat',
        icon: c.pinned ? 'i-x' : 'i-pin',
        fn: function () { setPinned(c.id, !c.pinned); },
      });
      items.push({
        label: c.muted ? 'Activar notificaciones' : 'Silenciar notificaciones',
        icon: c.muted ? 'i-bell' : 'i-bell-off',
        fn: function () { setMuted(c.id, !c.muted); },
      });
      openCtx(e, items, null, 'chat-more', ctxChatHead(c));
    };

    /* ---------- W13: buscar dentro del chat ---------- */

    const searchOpen = Vue.ref(false);
    const sQ = Vue.ref('');
    const sResults = Vue.ref([]);
    const sBusy = Vue.ref(false);
    const sErr = Vue.ref('');
    let sTimer = null;

    const toggleSearch = function () {
      searchOpen.value = !searchOpen.value;
      /* W37b: al abrir el modal, el cursor queda listo para escribir */
      if (searchOpen.value) {
        Vue.nextTick(function () {
          const el = document.querySelector('.search-modal input');
          if (el) el.focus();
        });
      }
      if (!searchOpen.value) {
        sQ.value = '';
        sResults.value = [];
        sErr.value = '';
      }
    };

    const runSearch = async function () {
      const q = sQ.value.trim();
      const cid = store.activeChatId;
      if (!q) { sResults.value = []; sErr.value = ''; return; }
      sBusy.value = true;
      sErr.value = '';
      try {
        const r = await api('GET',
          '/chats/' + cid + '/search?q=' + encodeURIComponent(q));
        /* respuesta tardía de un chat o búsqueda que ya no aplica */
        if (cid === store.activeChatId && q === sQ.value.trim()) {
          sResults.value = r.messages || [];
        }
      } catch (e) {
        sErr.value = (e && t(e.detail)) || t('No se pudo buscar');
      } finally {
        sBusy.value = false;
      }
    };
    const onSearchInput = function () {
      if (sTimer) clearTimeout(sTimer);
      sTimer = setTimeout(runSearch, 300);
    };
    const sSnippet = function (m) {
      /* W45: defensa extra para servidores viejos que aún devolvían el
         cuerpo del spoiler en la búsqueda. */
      if (m.spoiler) return t('Spoiler');
      const b = (m.body || '').replace(/\s+/g, ' ').trim();
      return b.length > 90 ? b.slice(0, 90) + '…' : b;
    };
    const sTime = function (ts) {
      return fmtTime(new Date(ts * 1000));
    };
    const scrollToMsg = function (id) {
      const root = rootEl.value;
      const attempt = function (tries) {
        const el = root ? root.querySelector('.msg[data-mid="' + id + '"]') : null;
        if (el) {
          try { el.scrollIntoView({ block: 'center' }); } catch (e) { el.scrollIntoView(); }
          el.classList.add('flash');
          setTimeout(function () { el.classList.remove('flash'); }, 1800);
          return;
        }
        if (tries > 0) setTimeout(function () { attempt(tries - 1); }, 250);
      };
      attempt(6);
    };
    /* Clic en una cita → salta al mensaje original */
    const jumpToReply = function (replyId) {
      if (!replyId) return;
      const cid = store.activeChatId;
      const arr = store.msgs[cid] || [];
      let found = false;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === replyId) { found = true; break; }
      }
      if (found) { scrollToMsg(replyId); return; }
      /* Si no está cargado, intenta traerlo */
      api('GET', '/chats/' + cid + '/messages?around=' + replyId + '&limit=1')
        .then(function (r) {
          const msgs = r.messages || [];
          if (msgs.length) {
            /* Merge into store */
            const existing = store.msgs[cid] || [];
            const ids = new Set(existing.map(function (m) { return m.id; }));
            for (let i = 0; i < msgs.length; i++) {
              if (!ids.has(msgs[i].id)) existing.unshift(msgs[i]);
            }
            existing.sort(function (a, b) { return a.id - b.id; });
            store.msgs[cid] = existing;
            Vue.nextTick(function () { scrollToMsg(replyId); });
          }
        })
        .catch(function () {});
    };
    /* W22: el salto deja su permalink en la URL (?m=<id>) al final de
       jumpResult; tryJump es el camino inverso (URL → scroll) para
       deep links y para el botón atrás. */
    let lastJump = 0;
    /* Un mensaje antiguo puede estar cargado pero fuera de la ventana
       renderizada; antes de hacer scroll hay que ampliarla. */
    const ensureRendered = function (cid, id) {
      const arr = store.msgs[cid] || [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          const need = arr.length - i;
          if (need > renderLimit.value) {
            renderLimit.value = Math.ceil(need / ROWS_PAGE) * ROWS_PAGE;
          }
          return;
        }
      }
    };
    const jumpResult = async function (m) {
      const cid = store.activeChatId;
      const arr = store.msgs[cid];
      let found = false;
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].id === m.id) { found = true; break; }
        }
      }
      if (!found) {
        /* no está cargado: traer una ventana alrededor del resultado */
        try {
          const r = await api('GET', '/chats/' + cid +
            '/messages?before_seq=' + (m.seq + 1) + '&limit=50');
          mergeMessages(cid, r.messages || []);
        } catch (e) { return; }
      }
      lastJump = m.id;
      store.jumpMsg = m.id;
      store.infoOpen = false;   // el panel de info cede el lugar
      ensureRendered(cid, m.id);
      await Vue.nextTick();
      scrollToMsg(m.id);
    };
    /* W22: saltar a un mensaje por id (?m= de la URL). Si no está en lo
       cargado, pagina hacia atrás hasta encontrarlo (tope: 15 páginas). */
    const tryJump = async function (id) {
      if (!id) { lastJump = 0; return; }
      const cid = store.activeChatId;
      if (!cid || id === lastJump) return;
      if (!store.loaded[cid]) return;   // aún sin mensajes: lo retoma loaded
      lastJump = id;
      const find = function () {
        const arr = store.msgs[cid] || [];
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
        return null;
      };
      let m = find();
      let tries = 0;
      while (!m && store.hasMore[cid] && tries < 15) {
        tries++;
        await loadOlder(cid);
        m = find();
      }
      if (!m) return;
      store.infoOpen = false;   // el panel de info cede el lugar
      ensureRendered(cid, m.id);
      await Vue.nextTick();
      scrollToMsg(m.id);
    };

    /* W22: la URL manda — el chat que pide la ruta (deep link o atrás)
       se abre al tener la lista; el ?m= salta cuando los mensajes
       están cargados. */
    Vue.watch(function () { return store.pendingPath; }, function () {
      resolvePendingChat();
    });
    Vue.watch(function () { return store.jumpMsg; }, function (v) {
      tryJump(v);
    });
    Vue.watch(function () { return store.loaded[store.activeChatId]; }, function (v) {
      if (v && store.jumpMsg) tryJump(store.jumpMsg);
    });

    /* ---------- W13: reenviar mensajes ---------- */

    const fwdFor = Vue.ref(null);   // {msg, src} mientras está el modal abierto
    const fwdQ = Vue.ref('');
    const fwdBusy = Vue.ref(false);

    const openForward = function (m) {
      fwdFor.value = { msg: m, src: store.activeChatId };
      fwdQ.value = '';
    };
    const fwdChats = Vue.computed(function () {
      const f = fwdFor.value;
      if (!f) return [];
      const q = fwdQ.value.trim().toLowerCase();
      return store.chats.filter(function (c) {
        if (c.id === f.src) return false;   // el chat origen no es destino
        if (!q) return true;
        return chatTitle(c).toLowerCase().indexOf(q) >= 0;
      });
    });
    const doForward = async function (targetId) {
      const f = fwdFor.value;
      if (!f || fwdBusy.value) return;
      fwdBusy.value = true;
      try {
        await forwardMessage(f.src, f.msg.id, targetId);
        fwdFor.value = null;
      } catch (e) { /* toast ya mostrado en actions */ }
      finally { fwdBusy.value = false; }
    };

    /* Menús contextuales: openCtx y chatMenu ahora son de módulo (los
       usan también el panel de info y la ventana de perfil). */
    /* W28a: enlace directo a un mensaje — la URL del chat + ?m=<id>
       (el salto a mensajes ya existía con store.jumpMsg). */
    const msgLink = function (m) {
      const chat = activeChat.value;
      if (!chat || !m) return '';
      let path;
      if (chat.type === 'dm' && chat.title && chat.title.id) {
        path = '/app/user/' + chat.title.id;
      } else {
        path = '/app/group/' + chat.id;
      }
      return location.origin + path + '?m=' + m.id;
    };

    /* W28a: doble clic en un mensaje = reacciona con tu emoji reciente
       (o 👍 si aún no usas ninguno). No cuenta sobre imagen/video/
       enlace: ahí el clic ya hace zoom o descarga.
       W66d: en PC el doble clic NO reacciona — molesta al doble-clic para
       seleccionar texto o por accidente. El clic de ratón trae su
       contador en detail (1, 2…); el doble toque táctil llega con
       detail 0, que es el único caso en el que sigue activo. */
    const quickReact = function (ev, r) {
      if (ev && ev.detail > 0) return;
      const t = ev && ev.target;
      if (t && t.closest && t.closest('img, video, a')) return;
      const m = r && r.ref;
      if (!m || m.kind === 'system') return;
      const rec = emojiRecent();
      toggleReaction(store.activeChatId, m.id, rec.length ? rec[0] : '👍');
    };

    /* W28f: "Visto por" — carga la lista de lectores de un mensaje mío
       en un grupo y la abre en el modal ReadsBox. */
    const openReads = function (chatId, msgId) {
      store.readsBox = {
        chatId: chatId, msgId: msgId,
        rows: null, total: 0, loading: true, error: '',
      };
      api('GET', '/chats/' + chatId + '/messages/' + msgId + '/reads')
        .then(function (r) {
          if (store.readsBox && store.readsBox.msgId === msgId) {
            store.readsBox.rows = r.reads || [];
            store.readsBox.total = r.total || 0;
            store.readsBox.loading = false;
          }
        })
        .catch(function (e) {
          if (store.readsBox && store.readsBox.msgId === msgId) {
            store.readsBox.loading = false;
            store.readsBox.error = (e && t(e.detail)) || t('No se pudo cargar');
          }
        });
    };

    const msgMenu = function (e, r) {
      const m = r && r.ref;
      if (!m || m.kind === 'system') return;
      const items = [
        { label: 'Responder', icon: 'i-reply', fn: function () { startReply(m); } },
        { label: 'Reaccionar', icon: 'i-smile', fn: function () { store.reactFor = m.id; } },
      ];
      const cpTxt = m.body || '';
      if (cpTxt) {
        items.push({
          label: 'Copiar texto', icon: 'i-copy',
          fn: function () { copyText(cpTxt); },
        });
      }
      /* W28a: enlace directo al mensaje */
      items.push({
        label: 'Copiar enlace al mensaje', icon: 'i-link',
        fn: function () { copyText(msgLink(m)); toast('Enlace copiado'); },
      });
      /* W60/W61: guardar/quitar un sticker recibido (emoji o imagen) */
      if (m.kind === 'sticker' && m.media) {
        const on = !!assetWithMedia('sticker', m.media.id);
        items.push(on
          ? { label: 'Quitar de favoritos', icon: 'i-star-fill',
              fn: function () { toggleStickerAsset(m); } }
          : { label: 'Guardar en stickers', icon: 'i-star',
              fn: function () { toggleStickerAsset(m); } });
      } else if (m.kind === 'sticker' && m.body) {
        items.push(isStkFav(m.body)
          ? { label: 'Quitar de favoritos', icon: 'i-star-fill',
              fn: function () { toggleStkFav(m.body); } }
          : { label: 'Guardar en stickers', icon: 'i-star',
              fn: function () { toggleStkFav(m.body); } });
      }
      /* W28c: fijar el mensaje en la info del chat */
      items.push(m.pinned
        ? { label: 'Desfijar mensaje', icon: 'i-pin-off',
            fn: function () { togglePin(store.activeChatId, m.id, false); } }
        : { label: 'Fijar mensaje', icon: 'i-pin',
            fn: function () { togglePin(store.activeChatId, m.id, true); } });
      /* W13: reenviar a otro chat (menos los mensajes del sistema) */
      items.push({
        label: 'Reenviar…', icon: 'i-forward',
        fn: function () { openForward(m); },
      });
      /* W62: la descarga ya no ocupa una pastilla debajo del adjunto;
         sigue disponible desde el menú del mensaje y el visor. */
      if (m.media && m.media.url) {
        const dlUrl = mediaUrl(m.media.url, true);
        const dlKey = downloadKey(dlUrl);
        const dlSaved = !!(dlKey && store.dlSaved[dlKey]);
        items.push({
          label: dlSaved ? 'Abrir archivo descargado' : 'Descargar archivo',
          icon: dlSaved ? 'i-check' : 'i-download',
          fn: function () {
            if (dlSaved) {
              openAppDownload(dlKey).then(function (ok) {
                if (!ok) toast(t('El archivo ya no está disponible'), 'err');
              });
            } else {
              startDownload(dlUrl, m.media.name || 'archivo', null,
                m.media.mime || '', m.kind || 'file');
            }
          },
        });
      }
      /* W8: editar y eliminar sólo lo tuyo */
      if (r.mine) {
        /* W28f: quién leyó tu mensaje — solo en grupos */
        const cNow = activeChat.value;
        if (cNow && cNow.type === 'group') {
          items.push({
            label: 'Visto por', icon: 'i-eye',
            fn: function () { openReads(store.activeChatId, m.id); },
          });
        }
        if (m.kind === 'text' && !m.media) {
          items.push({
            label: 'Editar', icon: 'i-pencil',
            fn: function () {
              /* W32: texto descifrado al editar (nunca el marcador). */
              store.editFor = m.id;
              store.editDraft = m.body || '';
            },
          });
        }
        items.push({
          label: 'Eliminar', icon: 'i-trash', danger: true,
          fn: function () { askDeleteMessage(store.activeChatId, m); },
        });
      }
      /* W36g: en grupos, los owner/admin también pueden eliminar
         mensajes de otros miembros (el server revalida el rol). */
      else {
        const cAdm = activeChat.value;
        if (cAdm && cAdm.type === 'group' &&
            (cAdm.my_role === 'owner' || cAdm.my_role === 'admin')) {
          items.push({
            label: 'Eliminar mensaje', icon: 'i-trash', danger: true,
            fn: function () { askDeleteMessage(store.activeChatId, m); },
          });
        }
      }
      /* W17: ancla a la burbuja (tanto clic derecho como el ⋯ hover).
         W36i: el mismo ⋯ alterna abrir/cerrar. */
      const tgt = e && e.target;
      const bubble = tgt && tgt.closest ? tgt.closest('.bubble') : null;
      openCtx(e, items, bubble, 'msg:' + m.id);
    };
    const runCtx = function (it) {
      store.ctx = null;
      if (it && it.fn) it.fn();
    };

    /* Clic en cualquier lado: cierra menú, selector de emojis del
       composer y chips de reacción (W17: los tres son "paneles
       flotantes" y solo puede haber uno abierto). El autocompletado
       :código: solo se cierra si el clic fue fuera del composer. */
    const onDocClick = function (e) {
      store.ctx = null;
      store.emoOpen = false;
      store.reactFor = 0;
      const tgt = e && e.target;
      if (!tgt || !tgt.closest || !tgt.closest('.comp-row')) clearAc();
    };

    /* Emojis en la caja de escritura (W7): inserta en la posición del
       cursor y devuelve el foco al textarea. */
    const insertEmoji = function (ch) {
      const el = input.value;
      const cur = draft.value;
      let s = cur.length;
      let t = cur.length;
      if (el && typeof el.selectionStart === 'number') {
        s = el.selectionStart;
        t = el.selectionEnd;
      }
      draft.value = cur.slice(0, s) + ch + cur.slice(t);
      Vue.nextTick(function () {
        if (!input.value) return;
        input.value.focus();
        const pos = s + ch.length;
        try {
          input.value.selectionStart = pos;
          input.value.selectionEnd = pos;
        } catch (err) { /* sin selección: se queda al final */ }
        onInput({ target: input.value });
      });
    };

    const openPeerProfile = function () {
      const c = activeChat.value;
      if (c && c.type === 'dm' && c.title && c.title.username) {
        openProfile(c.title.username);
      }
    };

    /* ---------- W8: vista previa de imágenes con zoom ---------- */
    /* W29l: el estado vive en el store para que el visor también se
       abra desde el modal "Archivos y medios" de la info. */
    const lb = Vue.computed(function () { return store.lb; });
    const lbScale = Vue.ref(1);
    const lbTx = Vue.ref(0);
    const lbTy = Vue.ref(0);
    const lbDragging = Vue.ref(false);
    let lbMoveOff = null;            // apaga el arrastre al cerrar

    const lbReset = function () {
      lbScale.value = 1;
      lbTx.value = 0;
      lbTy.value = 0;
    };
    const openLb = function (v) {
      /* W59: el visor puede recibir solo la URL (modal de medios) o un
         objeto con la URL original para descargar a los datos de la app
         aunque la vista esté usando un blob en memoria. */
      if (v && typeof v === 'object') store.lb = v;
      else store.lb = { url: v, orig: v };
      lbReset();
    };
    const lbDl = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      const v = lb.value;
      if (!v) return;
      const orig = v.orig || v.url;
      startDownload(orig, v.name || 'imagen', null, v.mime || '', v.kind || 'image');
    };
    const closeLb = function () {
      if (lbMoveOff) { lbMoveOff(); lbMoveOff = null; }
      store.lb = null;
    };
    /* W29l: si el visor lo abre el modal de la info, el zoom parte en 1x */
    Vue.watch(lb, function (v) { if (v) lbReset(); });
    const lbStyle = Vue.computed(function () {
      return {
        transform: 'translate(' + lbTx.value + 'px,' + lbTy.value + 'px)' +
          ' scale(' + lbScale.value + ')',
        cursor: lbDragging.value ? 'grabbing' : (lbScale.value > 1 ? 'grab' : 'zoom-in'),
      };
    });
    let lbMoved = false;            // W22: hubo arrastre → el clic NO zoom
    /* W54c: al ampliar, la imagen puede recorrer la pantalla pero nunca
       se pierde fuera de ella. El visor queda entre los controles. */
    const lbClamp = function () {
      if (lbScale.value <= 1) { lbTx.value = 0; lbTy.value = 0; return; }
      const img = document.querySelector('.lightbox .lb-img');
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const baseW = rect.width / lbScale.value;
      const baseH = rect.height / lbScale.value;
      const maxX = Math.max(0, (baseW * lbScale.value - window.innerWidth) / 2 + 10);
      const maxY = Math.max(0, (baseH * lbScale.value - window.innerHeight) / 2 + 10);
      lbTx.value = Math.max(-maxX, Math.min(maxX, lbTx.value));
      lbTy.value = Math.max(-maxY, Math.min(maxY, lbTy.value));
    };
    const lbZoom = function () {
      /* clic sobre la imagen: alterna ajustado ↔ ampliado (2.5x).
         W22: si el clic cierra un arrastre no alterna (antes soltar el
         drag hacía zoom-out sin querer). */
      if (lbMoved) { lbMoved = false; return; }
      if (lbScale.value > 1) lbReset();
      else { lbScale.value = 2.5; lbClamp(); }
    };
    const lbWheel = function (e) {
      /* rueda/trackpad: zoom continuo entre 1x y 5x */
      const d = e.deltaY < 0 ? 0.25 : -0.25;
      lbScale.value = Math.max(1, Math.min(5, lbScale.value + d));
      if (lbScale.value === 1) lbReset();
      else lbClamp();
    };
    const lbDown = function (e) {
      /* arrastrar para recorrer la imagen ampliada */
      if (lbScale.value <= 1) return;
      e.preventDefault();
      const px = e.clientX, py = e.clientY;   // W22: umbral de arrastre
      lbMoved = false;
      const sx = e.clientX - lbTx.value;
      const sy = e.clientY - lbTy.value;
      lbDragging.value = true;
      const move = function (ev) {
        if (Math.abs(ev.clientX - px) > 4 || Math.abs(ev.clientY - py) > 4) {
          lbMoved = true;
        }
        lbTx.value = ev.clientX - sx;
        lbTy.value = ev.clientY - sy;
        lbClamp();
      };
      const up = function () {
        lbDragging.value = false;
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        lbMoveOff = null;
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      lbMoveOff = up;
    };

    /* W54c: en el teléfono se amplía con dos dedos y se arrastra con
       uno; así el visor funciona como una galería táctil. */
    let lbTouches = null;
    const lbTouchStart = function (e) {
      const t = e.touches;
      if (t.length === 2) {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        lbTouches = {
          mode: 'pinch',
          dist: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
          scale: lbScale.value,
          tx: lbTx.value, ty: lbTy.value,
          mx: (t[0].clientX + t[1].clientX) / 2,
          my: (t[0].clientY + t[1].clientY) / 2,
        };
      } else if (t.length === 1 && lbScale.value > 1) {
        lbTouches = {
          mode: 'pan',
          x: t[0].clientX, y: t[0].clientY,
          tx: lbTx.value, ty: lbTy.value,
        };
      } else {
        lbTouches = null;
      }
    };
    const lbTouchMove = function (e) {
      if (!lbTouches) return;
      const t = e.touches;
      if (lbTouches.mode === 'pinch' && t.length >= 2) {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const mx = (t[0].clientX + t[1].clientX) / 2;
        const my = (t[0].clientY + t[1].clientY) / 2;
        lbScale.value = Math.max(1, Math.min(5, lbTouches.scale * dist / lbTouches.dist));
        lbTx.value = lbTouches.tx + mx - lbTouches.mx;
        lbTy.value = lbTouches.ty + my - lbTouches.my;
        if (lbScale.value === 1) { lbTx.value = 0; lbTy.value = 0; }
        else lbClamp();
        lbMoved = true;
        if (e.cancelable) e.preventDefault();
      } else if (lbTouches.mode === 'pan' && t.length === 1) {
        lbTx.value = lbTouches.tx + t[0].clientX - lbTouches.x;
        lbTy.value = lbTouches.ty + t[0].clientY - lbTouches.y;
        lbClamp();
        lbMoved = true;
        if (e.cancelable) e.preventDefault();
      }
    };
    const lbTouchEnd = function (e) {
      const t = e.touches;
      if (!t.length) { lbTouches = null; return; }
      if (t.length === 1 && lbScale.value > 1) {
        lbTouches = {
          mode: 'pan',
          x: t[0].clientX, y: t[0].clientY,
          tx: lbTx.value, ty: lbTy.value,
        };
      } else {
        lbTouches = null;
      }
    };

    /* Guardar la edición en línea de un mensaje propio (W8). */
    const onSaveEdit = function (m, text) {
      editMessage(store.activeChatId, m.id, text).catch(function (err) {
        toast(err.message || 'No se pudo editar el mensaje', 'err');
      });
    };

    /* Enter / Shift+Enter / Ctrl+Enter según la preferencia del usuario.
       W17: con el autocompletado ':código:' abierto, Enter/Tab eligen
       el emoji (y ↑ ↓ recorren la lista) antes de enviar. */
    const onComposerKey = function (e) {
      if (mOpen.value && mList.value.length) { // W28b: popup de @menciones
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          mIdx.value = (mIdx.value + 1) % mList.value.length;
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          mIdx.value = (mIdx.value + mList.value.length - 1) % mList.value.length;
          return;
        }
        if (e.key === 'Tab' ||
            (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey)) {
          e.preventDefault();
          mPick(mList.value[mIdx.value]);
          return;
        }
        if (e.key === 'Escape') { mOpen.value = false; return; }
      }
      if (acList.value.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          acIdx.value = (acIdx.value + 1) % acList.value.length;
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          acIdx.value = (acIdx.value + acList.value.length - 1) % acList.value.length;
          return;
        }
        if (e.key === 'Tab' ||
            (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey)) {
          e.preventDefault();
          pickAc(acIdx.value);
          return;
        }
        if (e.key === 'Escape') { clearAc(); return; }
      }
      if (e.key !== 'Enter' || e.isComposing) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        send();
        return;
      }
      if (e.shiftKey) return;            // salto de línea
      /* W60: en el móvil el teclado (Gboard) muestra una tecla de enviar
         y Enter envía; en escritorio manda la preferencia del usuario. */
      const touchKb = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
      if (store.prefs.enter || touchKb) {
        e.preventDefault();
        send();
      }
      // apagado en escritorio: Enter salta de línea; envía con el botón
    };

    /* Esc cierra de arriba hacia abajo lo que esté encima (atajo documentado). */
    const onEsc = function (e) {
      if (e.key !== 'Escape') return;
      /* W18: el aviso anti-spam solo sale con su botón. */
      if (store.spamUntil > Date.now()) return;
      if (store.confirmBox) {
        if (!store.confirmBox.busy) store.confirmBox = null;
        return;
      }
      if (store.requestSent) { store.requestSent = null; return; }  // W65
      if (lb.value) { closeLb(); return; }                      // W8
      if (store.ctx) { store.ctx = null; return; }              // W7
      if (acList.value.length) { clearAc(); return; }           // W17
      if (store.emoOpen) { store.emoOpen = false; return; }     // W7/W29g
      if (fwdFor.value) { fwdFor.value = null; return; }        // W13
      if (searchOpen.value) { toggleSearch(); return; }         // W13
      if (store.unameOpen) { store.unameOpen = false; return; }  // W60
      if (store.meProfileOpen) { store.meProfileOpen = false; return; }
      if (store.pwOpen) { store.pwOpen = false; return; }       // W8
      if (store.emOpen) { store.emOpen = false; return; }       // W8
      if (store.settingsOpen) { store.settingsOpen = false; return; }
      if (store.renameGroupId) {
        store.renameGroupId = 0; store.renameGroupTitle = '';
        return;
      }
      if (store.wallPanelOpen) { store.wallPanelOpen = false; return; }  // W21c
      if (store.newChatOpen) { store.newChatOpen = false; return; }
      if (store.profile) { store.profile = null; return; }
      if (store.reactFor) { store.reactFor = 0; return; }       // W7
      if (store.editFor) { store.editFor = 0; store.editDraft = ''; return; }  // W8
      if (store.pinsModal) { store.pinsModal = false; return; }  // W29l
      if (store.galModal) { store.galModal = false; return; }    // W29l
      if (store.infoOpen) { store.infoOpen = false; return; }   // W7
      if (att.value) { cancelAtt(); return; }                   // W11
      if (replyTo.value) { replyTo.value = null; }
    };

    /* ---------- W28h: llamadas 1:1 ---------- */

    /* W64: presencia de una sala de grupo (aunque yo no esté dentro). */
    const groupCallOf = function (c) {
      if (!c || c.type !== 'group' || !store.groupCalls) return null;
      return store.groupCalls[c.id] || null;
    };
    const activeGroupCall = Vue.computed(function () {
      return groupCallOf(activeChat.value);
    });
    const canJoinGroup = Vue.computed(function () {
      const c = activeChat.value;
      return !!(c && c.type === 'group' && !store.call &&
        activeGroupCall.value && activeGroupCall.value.count);
    });
    const canCall = Vue.computed(function () {
      const c = activeChat.value;
      if (!c || store.call) return false;
      /* Si ya hay sala, el botón de llamada es el verde de entrar; no
         se ofrece iniciar otra llamada en paralelo. */
      if (c.type === 'group') return !activeGroupCall.value;
      if (c.type !== 'dm') return false;
      const peer = c.title;   // en un DM, title ES el brief del peer
      return !!(peer && peer.id) && (store.blocks || []).indexOf(peer.id) < 0;
    });
    const doCall = function (video) {
      const c = activeChat.value;
      if (c && (c.type === 'dm' || c.type === 'group')) startCall(c, !!video);
    };
    const joinCall = function () {
      const c = activeChat.value;
      if (c && c.type === 'group') joinGroupCall(c);
    };

    return {
      store,
      scroller, input, fileInput, draft,
      draftCount, draftLong, maxText: MAX_TEXT_CHARS,
      rootEl,
      canCall, canJoinGroup, activeGroupCall, groupCallOf,
      doCall, joinCall,   /* W28h/W64 */
      /* W13 */
      searchOpen, sQ, sResults, sBusy, sErr,
      toggleSearch, onSearchInput, sSnippet, sTime, jumpResult,
      fwdFor, fwdQ, fwdBusy, fwdChats, doForward,
      filteredChats, archivedCount, listEmpty, activeChat, rows, hiddenRows, showOlder: doLoadOlder,
      chatLoading,   /* W27h */
      quickReact, msgLink,   /* W28a */
      mList, mIdx, mPick,    /* W28b: @menciones */
      typingActive, typingLabel, typingAvs, chatTyping,   /* W29c */
      peerOn, statusLine,
      avatarOf, initialsOf, previewText, listTime, titleOf: chatTitle,
      onScroll, send, onInput, onAttach, onImgLoad,
      keepComposerVisible,   /* W54d: teclado de Android */
      stick, scrollBottom,   /* W44: botón "ir hacia abajo" */
      replyTo, replySender, replyPreview, startReply, cancelReply, onReact,
      spoilNext,   /* W29d: spoiler del próximo mensaje */
      rec, recTime, startRec, stopRec, recWave, recBar,
      open: openChat, close: closeChat,
      toggleTheme, logout, startNewChat, openAddMember, mediaUrl, wsLabel,
      viewMedia: openMediaViewer,
      /* W6 */
      myStatusLine, openSettings, openProfile, openPeerProfile, openGroupProfile,
      goRequests,
      onComposerKey, askLogout,
      /* W7 */
      myDot, headDotClass, headTitle, onHeadClick, toggleInfo,
      backUnread,   /* W57: (N) en el botón atrás */
      chatMenu, msgMenu, runCtx, dotClass,
      /* W27 */
      menuKey,
      emoOpen: Vue.computed(function () { return store.emoOpen; }),
      toggleEmo, insertEmoji,
      /* W29g: panel unificado con 3 pestañas (Emojis/Stickers/GIFs) */
      pickEl, pickTab, setPickTab, onSticker, onGif,
      /* W36a/W65: imágenes del estilo elegido, con respaldo del otro set */
      emoFile, emoSrc, emoAnySrc, emoNative,
      /* W36k */
      onGifFav, onFavDel, favGifSrc, isLibGifFav, toggleLibGif,
      isStkFav, toggleStkFav,
      /* W61: biblioteca propia de GIFs/stickers */
      assetBusy, onAssetUpload, sendAsset, delAsset, assetList, assetMax: ASSET_MAX,
      stkList: STICKERS, gifList: GIF_LIST,
      /* W29h: enviar manteniendo presionado 3 s = spoiler */
      holdOn, holdDown, holdUp, clickSend,
      /* W17: autocompletado :código: */
      acEl, acList, acIdx, pickAc, updAc,
      jumpToReply,
      /* W8 */
      lb, lbStyle, openLb, closeLb, lbZoom, lbWheel, lbDown, lbDl,
      lbTouchStart, lbTouchMove, lbTouchEnd,   /* W54c: pinza y arrastre */
      lbScale,   // W22: la ayuda (v-if) se va cuando hay zoom
      onSaveEdit,
      /* W11 */
      att, attName, attType, attSize, cancelAtt, removeAtt, typeLabel, sizeOf,
      sendAtt, dropping, onUpCancel, onUpRetry,
      pendingAtts,   /* W62: cola de adjuntos múltiples */
      /* W19: sidebar colapsable */
      toggleSide, unfoldSide,
      /* W27c: "Personas" en el panel de chats (sidebar) */
      goPeople, closePeople, toggleArchived, goArchived, peopleActive, reqCount,
      /* W54: barra inferior y menú ⋮ de la cabecera en móvil */
      mobileChats, chatMore,
    };
  },
  template:
    '<div class="app-shell" ref="rootEl" :class="{ \'show-chat\': !!store.activeChatId, \'show-people\': !!store.peopleMobile }">' +

      /* W20: el panel de fondo (si está abierto) ocupa el sitio del
         sidebar en desktop; en celular CSS lo convierte en hoja inferior */
      '<aside class="sidebar" v-if="!store.wallPanelOpen">' +
        '<header class="side-head">' +
          '<svg class="side-logo side-logo-word" viewBox="0 0 500 200" role="img" aria-label="Foxinix"><use href="#i-logo-word"></use></svg>' +
          '<svg class="side-logo-mark" aria-hidden="true"><use href="#i-logo-mark"></use></svg>' +
          '<span class="side-title">{{ store.showArchived ? t(\'Archivados\') : t(\'Chats\') }}</span>' +
          '<span class="ws-dot" v-if="store.ws !== \'on\'" :title="wsLabel"></span>' +
          '<button class="icon-btn side-new" type="button" :title="t(\'Nuevo chat\')" @click="startNewChat">' +
            '<svg class="ic"><use href="#i-plus"></use></svg>' +
          '</button>' +
          /* W54: perfil a mano en móvil (el panel de usuario de abajo se
             oculta para dejarle el lugar a la barra inferior). */
          '<button class="icon-btn mobile-me" type="button" :title="t(\'Tu perfil\')" ' +
            '@click="store.meProfileOpen = true">' +
            '<span class="avatar av30" :class="{ \'has-photo\': !!(store.user && store.user.avatar_url) }">' +
              '<img v-if="store.user && store.user.avatar_url" :src="mediaUrl(store.user.avatar_url)" alt="">' +
              '<span v-else>{{ store.user ? (store.user.display_name || store.user.username).charAt(0).toUpperCase() : \'?\' }}</span>' +
            '</span>' +
          '</button>' +
          /* W19: contraer el sidebar (el hamburger del chat lo devuelve).
             Va DESPUÉS del ＋: los tests (y el ojo) dan por sentado que el
             primer .icon-btn del header es "Nuevo chat". */
          '<button class="icon-btn side-fold" type="button" :title="t(\'Contraer menú\')" ' +
            '@click="toggleSide">' +
            '<svg class="ic"><use href="#i-fold"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="side-search">' +
          '<div class="search-pill">' +
            '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
            '<input v-model="store.search" :placeholder="store.showArchived ? t(\'Buscar archivados\') : t(\'Buscar chats y grupos\')" :aria-label="store.showArchived ? t(\'Buscar archivados\') : t(\'Buscar chats y grupos\')">' +
            '<button class="clr-x" :class="{ show: !!store.search }" type="button" ' +
              ':title="t(\'Borrar\')" @click="store.search = \'\'">' +
              '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
          '</div>' +
        '</div>' +
        /* W27c: opción "Personas" en el panel de chats, arriba de todos
           los usuarios: vuelve a la pantalla principal (centro en
           escritorio; a pantalla completa en móvil) */
        '<button class="side-people" type="button" v-if="!store.showArchived" ' +
          ':class="{ on: peopleActive }" :title="t(\'Personas\')" @click="goPeople">' +
          '<svg class="ic ic-sm"><use href="#i-users"></use></svg>' +
          '<span>{{ t(\'Personas\') }}</span>' +
          /* W29a: globo rojo con las solicitudes recibidas (tope 9+) */
          '<i class="side-badge" v-if="reqCount > 0">' +
            '{{ reqCount > 9 ? \'9+\' : reqCount }}</i>' +
        '</button>' +
        '<button class="side-people side-archive" type="button" v-if="!store.showArchived" ' +
          ':title="t(\'Archivados\')" @click="goArchived">' +
          '<svg class="ic ic-sm"><use href="#i-archive"></use></svg>' +
          '<span>{{ t(\'Archivados\') }}</span>' +
        '</button>' +
        /* W60: en escritorio los archivados son una sección aparte: el
           buscador de arriba es solo para ellos y aquí se vuelve a Chats.
           En móvil manda la barra inferior (este botón se oculta). */
        '<button class="archive-back" type="button" v-if="store.showArchived" @click="toggleArchived">' +
          '<svg class="ic ic-sm"><use href="#i-back"></use></svg>' +
          '<span>{{ t(\'Volver a Chats\') }}</span>' +
        '</button>' +
        '<div class="chat-list">' +
          '<button class="chat-item" type="button" v-for="c in filteredChats" :key="c.id" ' +
            ':data-chat-id="c.id" ' +
            ':class="{ active: c.id === store.activeChatId }" @click="open(c.id)" ' +
            '@contextmenu.prevent="chatMenu($event, c)">' +
            '<span class="av-wrap" :class="dotClass(c.type === \'dm\' ? c.title : null)">' +
              '<span class="avatar" :class="{ \'has-photo\': !!avatarOf(c) }">' +
                '<img v-if="avatarOf(c)" :src="avatarOf(c)" alt="" loading="lazy">' +
                '<span v-else>{{ initialsOf(c) }}</span>' +
              '</span>' +
            '</span>' +
            '<span class="ci-main">' +
              '<span class="ci-top"><span class="ci-name">{{ titleOf(c) }}</span>' +
              /* W60: fijado / silenciado pegados a la hora, a su izquierda. */
              '<span class="ci-meta">' +
                '<span class="ci-icons" v-if="c.pinned || c.muted || (store.call && store.call.chatId === c.id) || groupCallOf(c)">' +
                  '<svg class="ic ic-sm ci-call" v-if="store.call && store.call.chatId === c.id"' +
                    ' :title="store.call.state === \'incoming\' ? t(\'Llamada entrante\') : t(\'En llamada\')">' +
                    '<use href="#i-phone"></use></svg>' +
                  /* W64: sala de grupo abierta a la que puedo entrar. */
                  '<span class="ci-call-live" v-else-if="groupCallOf(c)"' +
                    ' :title="t(\'Llamada de grupo · {n}\', { n: groupCallOf(c).count })">' +
                    '<svg class="ic ic-sm"><use href="#i-phone"></use></svg>' +
                    '<b>{{ groupCallOf(c).count }}</b></span>' +
                  '<svg class="ic ic-sm" v-if="c.pinned" :title="t(\'Fijado\')"><use href="#i-pin"></use></svg>' +
                  '<svg class="ic ic-sm" v-if="c.muted" :title="t(\'Silenciado\')"><use href="#i-bell-off"></use></svg>' +
                '</span>' +
                '<span class="ci-time">{{ listTime(c) }}</span>' +
              '</span></span>' +
              '<span class="ci-bot">' +
                /* W29c: pelotita de "escribiendo…" en la lista de chats */
                '<span class="ci-typing" v-if="chatTyping(c)" ' +
                  ':title="t(\'escribiendo…\')"><i></i><i></i><i></i></span>' +
                '<span class="ci-prev">{{ previewText(c) }}</span>' +
              /* W28b: contador aparte para los mensajes que me citan */
              '<span class="badge mention" v-if="c.unread_mentions">{{ c.unread_mentions > 99 ? \'99+\' : c.unread_mentions }}</span>' +
              '<span class="badge" :class="{ muted: c.muted }" v-if="c.unread">{{ c.unread > 99 ? \'99+\' : c.unread }}</span></span>' +
            '</span>' +
            /* W27: ⋮ administrar el chat (mismo menú del clic derecho) */
            '<span class="ci-menu" role="button" tabindex="0" :title="t(\'Administrar\')" ' +
              '@click.stop="chatMenu($event, c)" ' +
              '@keydown.enter.stop.prevent="menuKey($event, c)">' +
              '<svg class="ic ic-sm"><use href="#i-dots"></use></svg>' +
            '</span>' +
          '</button>' +
          '<div class="list-empty" v-if="listEmpty">' +
            '<template v-if="store.showArchived">{{ t(\'No hay chats archivados.\') }}</template>' +
            '<template v-else-if="store.chats.length">{{ t(\'Sin resultados para “{n}”\', { n: store.search }) }}</template>' +
            '<template v-else>{{ t(\'Aún no tienes chats.\') }}<br>{{ t(\'Crea uno con el botón ＋.\') }}</template>' +
          '</div>' +
        '</div>' +
        /* panel de usuario (W6/W8): perfil abajo a la izquierda; la
           configuración vive SOLO en el engranaje (Ajustes). */
        '<div class="user-panel">' +
          '<button class="up-main" type="button" :title="t(\'Tu perfil\')" @click="store.meProfileOpen = true">' +
            '<span class="av-wrap" :class="myDot">' +
              '<span class="avatar av36" :class="{ \'has-photo\': !!(store.user && store.user.avatar_url) }">' +
                '<img v-if="store.user && store.user.avatar_url" :src="mediaUrl(store.user.avatar_url)" alt="">' +
                '<span v-else>{{ store.user ? (store.user.display_name || store.user.username).charAt(0).toUpperCase() : \'?\' }}</span>' +
              '</span>' +
            '</span>' +
            '<span class="up-col">' +
              '<span class="up-name">{{ store.user ? (store.user.display_name || store.user.username) : \'\' }}</span>' +
              '<span class="up-status">{{ myStatusLine }}</span>' +
            '</span>' +
          '</button>' +
          '<button class="icon-btn" type="button" :title="t(\'Ajustes\')" @click="openSettings()">' +
            '<svg class="ic"><use href="#i-gear"></use></svg>' +
          '</button>' +
        '</div>' +
      '</aside>' +
      '<wall-panel v-if="store.wallPanelOpen"></wall-panel>' +

      /* W21c: con el panel de fondo abierto, el centro muestra la
         vista previa a tamaño real (el chat vuelve al cerrar) */
      '<wall-preview v-if="store.wallPanelOpen"></wall-preview>' +
      '<main class="chat-pane" v-else-if="activeChat">' +
        '<header class="chat-head">' +
          /* W19: si el sidebar está contraído, el hamburger lo devuelve */
          '<button class="icon-btn side-open" type="button" :title="t(\'Mostrar chats\')" ' +
            '@click="unfoldSide">' +
            '<svg class="ic"><use href="#i-unfold"></use></svg>' +
          '</button>' +
          '<button class="icon-btn back" type="button" :title="t(\'Volver\')" @click="close">' +
            '<svg class="ic"><use href="#i-back"></use></svg>' +
            '<span class="back-unread" v-if="backUnread > 0" ' +
              ':title="t(\'Mensajes sin leer en otros chats\')">{{ backUnread > 99 ? \'99+\' : backUnread }}</span>' +
          '</button>' +
          '<span class="av-wrap" :class="headDotClass" :title="headTitle" @click="onHeadClick">' +
            '<span class="avatar av36" :class="{ \'has-photo\': !!avatarOf(activeChat) }">' +
              '<img v-if="avatarOf(activeChat)" :src="avatarOf(activeChat)" alt="" class="pf-zoom" :title="t(\'Ver foto\')" @click.stop="viewMedia(avatarOf(activeChat), \'foto\')">' +
              '<span v-else>{{ initialsOf(activeChat) }}</span>' +
            '</span>' +
          '</span>' +
          '<span class="ch-col clickable" :title="headTitle" @click="onHeadClick">' +
            '<span class="ch-name">{{ titleOf(activeChat) }}</span>' +
            '<span class="ch-status" :class="{ typing: typingActive }">{{ statusLine }}</span>' +
          '</span>' +
          '<span class="ws-pill" v-if="store.ws !== \'on\'">{{ wsLabel }}</span>' +
          /* W13: buscar dentro del chat */
          '<button class="icon-btn" :class="{ on: searchOpen }" type="button" ' +
            ':title="t(\'Buscar en el chat\')" @click="toggleSearch">' +
            '<svg class="ic"><use href="#i-search"></use></svg>' +
          '</button>' +
          /* W64: sala de grupo abierta — botón verde con aforo. Al
             pulsarlo se entra a la llamada; no suena en ningún lado. */
          '<button class="icon-btn call-action call-live" v-if="canJoinGroup" type="button" ' +
            ':title="t(\'Entrar en la llamada · {n}\', { n: activeGroupCall.count })" ' +
            ':aria-label="t(\'Entrar en la llamada · {n}\', { n: activeGroupCall.count })" ' +
            '@click="joinCall">' +
            '<svg class="ic"><use href="#i-phone"></use></svg>' +
            '<span class="call-count">{{ activeGroupCall.count }}</span>' +
          '</button>' +
          /* W28h: llamadas 1:1 (solo DM; si ya hay una, el .callbox manda) */
          '<button class="icon-btn call-action" v-if="canCall" type="button" ' +
            ':title="t(\'Llamar\')" @click="doCall(false)">' +
            '<svg class="ic"><use href="#i-phone"></use></svg>' +
          '</button>' +
          '<button class="icon-btn call-action" v-if="canCall" type="button" ' +
            ':title="t(\'Videollamada\')" @click="doCall(true)">' +
            '<svg class="ic"><use href="#i-video"></use></svg>' +
          '</button>' +
          /* W34b: "Agregar miembros" ocupa el primer slot de la derecha
             y la info del chat/usuario queda en el último (donde antes
             estaba el +). W36f: el icono lleva "+" (añadir personas). */
          '<button class="icon-btn add-member-action" v-if="activeChat.type === \'group\'" type="button" ' +
            ':title="t(\'Agregar miembros\')" @click="openAddMember">' +
            '<svg class="ic"><use href="#i-userplus"></use></svg>' +
          '</button>' +
          /* W54: en móvil estas acciones se juntan en un menú ⋮ para
             que el nombre del chat tenga espacio. */
          '<button class="icon-btn chat-more" type="button" ' +
            ':title="t(\'Más acciones\')" @click.stop="chatMore($event)">' +
            '<svg class="ic"><use href="#i-dots"></use></svg>' +
          '</button>' +
          /* W7: botón del panel derecho (info del chat / miembros) */
          '<button class="icon-btn" :class="{ on: store.infoOpen }" type="button" ' +
            ':title="store.infoOpen ? t(\'Ocultar info del grupo\') : t(activeChat.type === \'dm\' ? \'Info del usuario\' : \'Info del grupo\')" @click="toggleInfo">' +
            '<svg class="ic"><use href="#i-info"></use></svg>' +
          '</button>' +
        '</header>' +

        '<div class="msgs" ref="scroller" @scroll.passive="onScroll">' +
          /* W27h: "Cargando…" mientras se piden los mensajes del chat.
             W38: el spinner es la animación de cubitos. */
          '<div class="msgs-load" v-if="chatLoading">' +
            '<span class="cubes"><span class="cube"></span><span class="cube"></span></span>' +
            '<span>{{ t(\'Cargando…\') }}</span>' +
          '</div>' +
          '<div class="load-older" v-if="store.loadingOlder">{{ t(\'Cargando anteriores…\') }}</div>' +
          '<button class="load-older load-more-older" type="button" v-else-if="hiddenRows" ' +
            '@click="showOlder">' +
            '{{ t(\'Ver {n} mensajes anteriores\', { n: hiddenRows }) }}</button>' +
          /* W39: la key es estable entre el pendiente y su ack (el
             id temporal NEGATIVO cambiaba por el del server → Vue
             recreaba el nodo y la animación de entrada se veía como
             "se borra y se reenvía"). Sin client_msg_id (mensajes de
             sistema) se usa el id. */
          '<template v-for="r in rows" :key="r.ref.client_msg_id || r.ref.pub_id || r.ref.id">' +
            '<div v-if="r.day" class="day-pill">{{ r.day }}</div>' +
            '<message-row :row="r" :data-mid="r.ref.id" @dblclick="quickReact($event, r)" ' +
              '@imgload="onImgLoad" @reply="startReply" ' +
              '@react="onReact" @openprofile="openProfile" ' +
              '@zoom="openLb" @saveedit="onSaveEdit" ' +
              '@upcancel="onUpCancel" @upretry="onUpRetry" ' +
              '@scrolltoreply="jumpToReply" ' +
              '@menu="msgMenu($event.ev, $event.row)" ' +
              '@contextmenu.prevent="msgMenu($event, r)"></message-row>' +
          '</template>' +
          '<transition name="typ">' +
          '<div class="msg theirs tight typ-row" v-if="typingActive" key="typing">' +
            '<span class="typ-avs" v-if="typingAvs.length">' +
              '<img v-for="(a, i) in typingAvs" :key="i" :src="a" alt="" loading="lazy">' +
            '</span>' +
            /* columna vacía: las burbujas del grupo quedan alineadas */
            '<span class="msg-av" v-else-if="activeChat && activeChat.type === \'group\'"></span>' +
            '<div class="bubble dots typing-line"><i></i><i></i><i></i>' +
              '<span class="typ-txt">{{ typingLabel }}</span></div>' +
          '</div>' +
          '</transition>' +
        '</div>' +

        /* W44: botón "ir hacia abajo" — aparece solo cuando el chat no
           está pegado al final (stick=false); el clic salta al final
           (scrollBottom) y onScroll lo esconde al llegar. */
        '<footer class="composer">' +
          /* W59: el botón vive DENTRO del compositor y se ancla a su
             borde superior. Así nunca se monta sobre la barra inferior
             ni sobre el campo de texto, aunque haya respuesta o archivo
             adjunto (el compositor crece). */
          '<button class="jump-bottom" type="button" v-if="!stick" ' +
            ':title="t(\'Ir hacia abajo\')" @click="scrollBottom">' +
            '<svg class="ic"><use href="#i-chevron-down"></use></svg>' +
          '</button>' +
          '<div class="reply-bar" v-if="replyTo">' +
            '<svg class="ic ic-sm rb-ic"><use href="#i-reply"></use></svg>' +
            '<span class="rb-col">' +
              '<b>{{ replySender }}</b>' +
              '<span>{{ replyPreview }}</span>' +
            '</span>' +
            '<button class="icon-btn" type="button" :title="t(\'Cancelar respuesta\')" @click="cancelReply">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg>' +
            '</button>' +
          '</div>' +
          /* W23: ficha del archivo (nombre + tipo/tamaño); el texto del
             mensaje se escribe en el compositor de abajo */
          '<div class="cap-strip" v-if="att || pendingAtts.length" :class="{ multi: pendingAtts.length > 1 }">' +
            /* Cola con varios: lista REAL (cada archivo con su nombre,
               tipo/tamaño y quitar individual). */
            '<template v-if="pendingAtts.length > 1">' +
              '<div class="cs-item" v-for="(p, i) in pendingAtts" :key="i">' +
                '<img v-if="p.thumb" class="cs-thumb" :src="p.thumb" alt="">' +
                '<svg v-else class="ic cs-ic"><use href="#i-file"></use></svg>' +
                '<span class="cs-col">' +
                  '<span class="cs-name">{{ p.file.name }}</span>' +
                  '<span class="cs-meta">' +
                    '<span class="cs-type">{{ typeLabel(p.file.type) }}</span>' +
                    '<span class="cs-size">{{ sizeOf(p.file) }}</span>' +
                  '</span>' +
                '</span>' +
                '<button class="icon-btn" type="button" :title="t(\'Quitar\')" @click="removeAtt(i)">' +
                  '<svg class="ic ic-sm"><use href="#i-x"></use></svg>' +
                '</button>' +
              '</div>' +
            '</template>' +
            /* Un archivo: la ficha clásica (W23). att puede ser null con
               la cola llena (MP3/PDF): la miniatura solo si existe. */
            '<template v-else>' +
              '<img v-if="att && att.thumb" class="cs-thumb" :src="att.thumb" alt="">' +
              '<svg v-else class="ic cs-ic"><use href="#i-file"></use></svg>' +
              '<span class="cs-col">' +
                '<span class="cs-name">{{ attName }}</span>' +
                '<span class="cs-meta">' +
                  '<span class="cs-type">{{ attType }}</span>' +
                  '<span class="cs-size">{{ attSize }}</span>' +
                '</span>' +
              '</span>' +
              '<button class="icon-btn" type="button" :title="t(\'Quitar\')" @click="cancelAtt">' +
                '<svg class="ic ic-sm"><use href="#i-x"></use></svg>' +
              '</button>' +
            '</template>' +
          '</div>' +
          /* W61: texto de más de 3000 → se enviará como archivo. */
          '<div class="composer-long" v-if="draftLong">' +
            '<svg class="ic ic-sm"><use href="#i-file"></use></svg>' +
            '<span>{{ t(\'Se enviará como archivo de texto\') }} · {{ draftCount }}/{{ maxText }}</span>' +
          '</div>' +
          '<div class="comp-row" v-if="rec === \'off\'">' +
            '<label class="icon-btn att-btn" :title="t(\'Adjuntar archivo\')">' +
              '<svg class="ic"><use href="#i-clip"></use></svg>' +
              '<input type="file" hidden multiple ref="fileInput" ' +
                'accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" @change="onAttach">' +
            '</label>' +
            '<textarea class="composer-input" ref="input" rows="1" v-model="draft" ' +
              'inputmode="text" enterkeyhint="send" autocomplete="off" ' +
              ':placeholder="t(\'Mensaje\')" @input="onInput" @click="updAc" ' +
              '@focus="keepComposerVisible" ' +
              '@keydown="onComposerKey" @keydown.esc="cancelReply"></textarea>' +
            /* W7: selector de emojis para escribir en el mensaje */
            '<button class="icon-btn comp-emo" :class="{ on: emoOpen }" type="button" ' +
              ':title="t(\'Emojis\')" @click.stop="toggleEmo">' +
              '<svg class="ic"><use href="#i-smile"></use></svg>' +
            '</button>' +
            /* W29d/g: "Mensaje Spoiler: On/Off" — SOLO con adjunto */
            '<button class="icon-btn comp-spoil" v-if="att || pendingAtts.length" :class="{ on: spoilNext }" type="button" ' +
              ':title="t(\'Mensaje Spoiler\') + \': \' + (spoilNext ? \'On\' : \'Off\')" ' +
              '@click="spoilNext = !spoilNext">' +
              '<svg class="ic"><use href="#i-eye-off"></use></svg>' +
            '</button>' +
            '<button class="icon-btn comp-mic" v-if="!draft.trim() && !att" type="button" ' +
              ':title="t(\'Nota de voz\')" @click="startRec">' +
              '<svg class="ic"><use href="#i-mic"></use></svg>' +
            '</button>' +
            /* W29h: mantener 3 s → se envía como spoiler (relleno) */
            '<button class="send-btn" type="button" :class="{ holding: holdOn }" ' +
              ':title="t(\'Enviar\')" :disabled="!draft.trim() && !att" ' +
              '@click="clickSend" @pointerdown="holdDown" @pointerup="holdUp" ' +
              '@pointerleave="holdUp" @pointercancel="holdUp">' +
              '<span class="send-fill" aria-hidden="true"></span>' +
              '<svg class="ic"><use href="#i-send"></use></svg>' +
            '</button>' +
            /* W29g: un panel con 3 pestañas: Emojis / Stickers / GIFs.
               W36j: tamaño fijo (las 3 pestañas miden lo mismo) y sin
               animación de apertura: un "pasar página" al entrar y al
               cambiar de pestaña. W36k: pestaña GIFs con Favoritos. */
            '<div class="st-panel" ref="pickEl" v-if="emoOpen" @click.stop>' +
              '<div class="ep-tabs">' +
                '<button class="ep-tab" :class="{ on: pickTab === \'emo\' }" ' +
                  'type="button" @click="setPickTab(\'emo\')">' +
                  '<svg class="ic ic-sm"><use href="#i-smile"></use></svg>{{ t(\'Emojis\') }}</button>' +
                '<button class="ep-tab" :class="{ on: pickTab === \'st\' }" ' +
                  'type="button" @click="setPickTab(\'st\')">' +
                  '<svg class="ic ic-sm"><use href="#i-sticker"></use></svg>{{ t(\'Stickers\') }}</button>' +
                '<button class="ep-tab" :class="{ on: pickTab === \'gif\' }" ' +
                  'type="button" @click="setPickTab(\'gif\')">' +
                  '<svg class="ic ic-sm"><use href="#i-image"></use></svg>{{ t(\'GIFs\') }}</button>' +
              '</div>' +
              '<transition name="epfade" mode="out-in">' +
              '<emoji-picker v-if="pickTab === \'emo\'" key="emo" :embed="true" ' +
                '@pick="insertEmoji">' +
              '</emoji-picker>' +
              /* W36a/W60: stickers con los emojis del sitio (Twemoji),
                 no los nativos; los favoritos van primero y cada tile
                 tiene su estrella para guardarlo. */
              '<div class="st-body" v-else-if="pickTab === \'st\'" key="st">' +
                '<template v-if="store.stkFavs.length">' +
                  '<div class="st-sec">{{ t(\'Favoritos\') }}</div>' +
                  '<div class="st-grid">' +
                    '<span class="st-wrap" v-for="s in store.stkFavs" :key="\'fav-\' + s">' +
                      '<button class="st-e" type="button" @click="onSticker(s)" :title="s">' +
                        '<img v-if="emoAnySrc(s)" class="emo" :src="emoAnySrc(s)" alt="">' +
                        '<span v-else-if="emoNative">{{ s }}</span></button>' +
                      '<button class="st-fav on" type="button" ' +
                        ':title="t(\'Quitar de favoritos\')" @click.stop="toggleStkFav(s)">' +
                        '<svg class="ic ic-sm"><use href="#i-star-fill"></use></svg></button>' +
                    '</span>' +
                  '</div>' +
                '</template>' +
                /* W61: stickers subidos por el usuario (máx. 10). */
                '<div class="st-sec st-sec-row">' +
                  '<span>{{ t(\'Mis stickers\') }}' +
                    ' <i class="st-count">{{ store.userAssets.stickers.length }}/10</i></span>' +
                  '<label class="st-up" :class="{ busy: assetBusy }" :title="t(\'Subir sticker\')">' +
                    '<svg class="ic ic-sm"><use href="#i-plus"></use></svg>' +
                    '<input type="file" accept="image/png,image/webp,image/gif,image/jpeg" ' +
                      'style="display:none" @change="onAssetUpload(\'sticker\', $event)">' +
                  '</label>' +
                '</div>' +
                '<div class="st-grid" v-if="store.userAssets.stickers.length">' +
                  '<span class="st-g-wrap" v-for="a in store.userAssets.stickers" :key="\'sa-\' + a.id">' +
                    '<button class="st-g st-sticker" type="button" @click="sendAsset(\'sticker\', a)" ' +
                      ':title="t(\'Enviar\')">' +
                      '<img :src="mediaUrl(a.url)" alt="" loading="lazy"></button>' +
                    '<button class="st-fav on" type="button" :title="t(\'Borrar de mi biblioteca\')" ' +
                      '@click.stop="delAsset(\'sticker\', a)">' +
                      '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
                  '</span>' +
                '</div>' +
                '<div class="st-empty" v-else>{{ t(\'Aún no has subido stickers\') }}</div>' +
                '<div class="st-sec">{{ t(\'Todos los stickers\') }}</div>' +
                '<div class="st-grid">' +
                  '<span class="st-wrap" v-for="s in stkList" :key="s">' +
                    '<button class="st-e" type="button" @click="onSticker(s)" :title="s">' +
                      '<img v-if="emoAnySrc(s)" class="emo" :src="emoAnySrc(s)" alt="">' +
                      '<span v-else-if="emoNative">{{ s }}</span></button>' +
                    '<button class="st-fav" :class="{ on: isStkFav(s) }" type="button" ' +
                      ':title="isStkFav(s) ? t(\'Quitar de favoritos\') : t(\'Guardar en stickers\')" ' +
                      '@click.stop="toggleStkFav(s)">' +
                      '<svg class="ic ic-sm"><use :href="isStkFav(s) ? \'#i-star-fill\' : \'#i-star\'"></use></svg></button>' +
                  '</span>' +
                '</div>' +
              '</div>' +
              '<div class="st-body" v-else-if="pickTab === \'gif\'" key="gif">' +
                '<div class="st-sec" v-if="store.gifFavs.length">{{ t(\'Favoritos\') }}</div>' +
                '<div class="st-grid" v-if="store.gifFavs.length">' +
                  '<span class="st-g-wrap" v-for="f in store.gifFavs" ' +
                    ':key="f.media_id ? \'m\' + f.media_id : \'n\' + f.name">' +
                    '<button class="st-g" type="button" @click="onGifFav(f)" ' +
                      ':title="t(\'Enviar\')">' +
                      '<img :src="favGifSrc(f)" alt="" loading="lazy"></button>' +
                    '<button class="st-fav on" type="button" ' +
                      ':title="t(\'Quitar de favoritos\')" @click.stop="onFavDel(f)">' +
                      '<svg class="ic ic-sm"><use href="#i-star-fill"></use></svg></button>' +
                  '</span>' +
                '</div>' +
                /* W61: GIFs subidos por el usuario (máx. 10). */
                '<div class="st-sec st-sec-row">' +
                  '<span>{{ t(\'Mis GIFs\') }}' +
                    ' <i class="st-count">{{ store.userAssets.gifs.length }}/10</i></span>' +
                  '<label class="st-up" :class="{ busy: assetBusy }" :title="t(\'Subir GIF\')">' +
                    '<svg class="ic ic-sm"><use href="#i-plus"></use></svg>' +
                    '<input type="file" accept="image/gif,image/webp" style="display:none" ' +
                      '@change="onAssetUpload(\'gif\', $event)">' +
                  '</label>' +
                '</div>' +
                '<div class="st-grid" v-if="store.userAssets.gifs.length">' +
                  '<span class="st-g-wrap" v-for="a in store.userAssets.gifs" :key="\'ga-\' + a.id">' +
                    '<button class="st-g" type="button" @click="sendAsset(\'gif\', a)" ' +
                      ':title="t(\'Enviar\')">' +
                      '<img :src="mediaUrl(a.url)" alt="" loading="lazy"></button>' +
                    '<button class="st-fav on" type="button" :title="t(\'Borrar de mi biblioteca\')" ' +
                      '@click.stop="delAsset(\'gif\', a)">' +
                      '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
                  '</span>' +
                '</div>' +
                '<div class="st-empty" v-else>{{ t(\'Aún no has subido GIFs\') }}</div>' +
                '<div class="st-sec">{{ t(\'Biblioteca\') }}</div>' +
                '<div class="st-grid">' +
                  '<span class="st-g-wrap" v-for="g in gifList" :key="g">' +
                    '<button class="st-g" type="button" ' +
                      '@click="onGif(g)" :title="g">' +
                      '<img :src="\'/static/gifs/\' + g" alt="" loading="lazy">' +
                    '</button>' +
                    '<button class="st-fav" :class="{ on: isLibGifFav(g) }" ' +
                      'type="button" ' +
                      ':title="isLibGifFav(g) ? t(\'Quitar de favoritos\') : t(\'Agregar a favoritos\')" ' +
                      '@click.stop="toggleLibGif(g)">' +
                      '<svg class="ic ic-sm"><use :href="isLibGifFav(g) ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
                    '</button>' +
                  '</span>' +
                '</div>' +
              '</div>' +
              '</transition>' +
            '</div>' +
            /* W17: autocompletado ":fire" → 🔥 (Tab/Enter/clic eligen) */
            '<div class="emo-ac" ref="acEl" v-if="acList.length" @click.stop>' +
              '<button class="emo-ac-row" :class="{ on: i === acIdx }" type="button" ' +
                'v-for="(m, i) in acList" :key="m.code" @click="pickAc(i)">' +
                '<b><img v-if="emoAnySrc(m.ch)" class="emo" :src="emoAnySrc(m.ch)" ' +
                  'alt=""><span v-else-if="emoNative">{{ m.ch }}</span></b><i>:{{ m.code }}:</i>' +
              '</button>' +
            '</div>' +
            /* W28b: @menciones — flota igual que el de :código: */
            '<div class="m-mention" v-if="mList.length">' +
              '<button class="mm-row" type="button" v-for="(mu, i) in mList" ' +
                ':key="mu.id" :class="{ on: i === mIdx }" @click="mPick(mu)">' +
                '<span class="mm-at">@</span>' +
                '<b>{{ mu.username }}</b>' +
                '<span class="mm-disp" v-if="mu.display_name && mu.display_name !== mu.username">{{ mu.display_name }}</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="comp-row rec-bar" v-else :aria-label="t(\'Grabando nota de voz…\')">' +
            '<span class="rec-dot"></span>' +
            '<span class="rec-time">{{ recTime }}</span>' +
            '<span class="rec-wave" :class="{ live: recWave.length }" aria-hidden="true">' +
              '<i v-for="i in 22" :key="i" :style="{ transform: \'scaleY(\' + recBar(i - 1) + \')\' }"></i>' +
            '</span>' +
            '<span class="rec-hint">{{ t(\'Grabando nota de voz…\') }}</span>' +
            '<button class="icon-btn" type="button" :title="t(\'Cancelar\')" @click="stopRec(false)">' +
              '<svg class="ic"><use href="#i-x"></use></svg>' +
            '</button>' +
            '<button class="send-btn rec-send" type="button" :title="t(\'Enviar nota de voz\')" @click="stopRec(true)">' +
              '<svg class="ic"><use href="#i-send"></use></svg>' +
            '</button>' +
          '</div>' +
        '</footer>' +
      '</main>' +

      /* W27: sin chat abierto, el centro muestra Personas (Activos +
         Solicitudes); la lista de chats vive siempre en el sidebar */
      '<main class="chat-pane people-pane" v-else>' +
        /* W54: título de pantalla en móvil (en escritorio Personas vive
           en el centro y no necesita app bar propia). */
        /* W54: la MISMA barra del sidebar (logo + título + ＋ + perfil),
           sólo cambia el título: en móvil Chats/Archivados comparten
           .side-head y Personas repite aquí su estructura. */
        '<header class="mobile-page-head">' +
          '<svg class="side-logo side-logo-mark" aria-hidden="true"><use href="#i-logo-mark"></use></svg>' +
          '<span class="side-title">{{ t(\'Personas\') }}</span>' +
          '<span class="ws-dot" v-if="store.ws !== \'on\'" :title="wsLabel"></span>' +
          '<button class="icon-btn side-new" type="button" :title="t(\'Nuevo chat\')" @click="startNewChat">' +
            '<svg class="ic"><use href="#i-plus"></use></svg>' +
          '</button>' +
          '<button class="icon-btn mobile-me" type="button" :title="t(\'Tu perfil\')" ' +
            '@click="store.meProfileOpen = true">' +
            '<span class="avatar av30" :class="{ \'has-photo\': !!(store.user && store.user.avatar_url) }">' +
              '<img v-if="store.user && store.user.avatar_url" :src="mediaUrl(store.user.avatar_url)" alt="">' +
              '<span v-else>{{ store.user ? (store.user.display_name || store.user.username).charAt(0).toUpperCase() : \'?\' }}</span>' +
            '</span>' +
          '</button>' +
        '</header>' +
        /* W19: sin chat abierto también se puede devolver el sidebar */
        '<button class="icon-btn side-open" type="button" :title="t(\'Mostrar chats\')" ' +
          '@click="unfoldSide">' +
          '<svg class="ic"><use href="#i-unfold"></use></svg>' +
        '</button>' +
        /* W27b: en móvil (pantalla completa) el botón atrás vuelve a la
           lista de chats; en escritorio lo oculta el CSS (.back) */
        '<button class="icon-btn back ppl-back-btn" type="button" :title="t(\'Chats\')" ' +
          '@click="closePeople">' +
          '<svg class="ic"><use href="#i-back"></use></svg>' +
        '</button>' +
        '<people-panel></people-panel>' +
      '</main>' +

      /* W54: barra inferior estilo app. Solo con la lista o Personas a
         la vista: dentro de una conversación manda el chat a pantalla
         completa (se vuelve con la flecha). */
      '<nav class="mobile-tabs" v-if="!store.activeChatId && !store.wallPanelOpen && ' +
        '!store.meProfileOpen && !store.newChatOpen && !store.profile && ' +
        '(!store.settingsOpen || store.settingsAtHome)" ' +
        ':aria-label="t(\'Navegación principal\')">' +
        '<button class="mt-btn" type="button" :class="{ on: !store.peopleMobile && !store.settingsOpen && !store.showArchived && !store.archiveLockPrompt }" ' +
          '@click="mobileChats">' +
          '<svg class="ic"><use href="#i-chat"></use></svg>' +
          '<span class="mt-label">{{ t(\'Chats\') }}</span>' +
        '</button>' +
        '<button class="mt-btn" type="button" :class="{ on: store.peopleMobile && !store.settingsOpen }" ' +
          '@click="goPeople">' +
          '<span class="mt-ic-wrap">' +
            '<svg class="ic"><use href="#i-users"></use></svg>' +
            '<i class="mt-badge" v-if="reqCount > 0">{{ reqCount > 9 ? \'9+\' : reqCount }}</i>' +
          '</span>' +
          '<span class="mt-label">{{ t(\'Personas\') }}</span>' +
        '</button>' +
        '<button class="mt-btn" type="button" :class="{ on: store.showArchived && !store.settingsOpen }" ' +
          '@click="goArchived">' +
          '<span class="mt-ic-wrap">' +
            '<svg class="ic"><use href="#i-archive"></use></svg>' +
          '</span>' +
          '<span class="mt-label">{{ t(\'Archivados\') }}</span>' +
        '</button>' +
        '<button class="mt-btn" type="button" :class="{ on: store.settingsOpen }" ' +
          '@click="openSettings()">' +
          '<svg class="ic"><use href="#i-gear"></use></svg>' +
          '<span class="mt-label">{{ t(\'Ajustes\') }}</span>' +
        '</button>' +
      '</nav>' +

      /* W37c: todos los modales animan apertura Y cierre (fade de la
         velada + scale del cuadro). */
      '<transition name="veil">' +
      '<new-chat-modal v-if="store.newChatOpen"></new-chat-modal>' +
      '</transition>' +
      '<transition name="veil">' +
      '<settings-modal v-if="store.settingsOpen"></settings-modal>' +
      '</transition>' +
      '<transition name="veil">' +
      '<rename-group-modal v-if="store.renameGroupId"></rename-group-modal>' +
      '</transition>' +
      '<transition name="veil">' +
      '<me-profile-modal v-if="store.meProfileOpen"></me-profile-modal>' +
      '</transition>' +
      '<transition name="veil">' +
      '<me-profile-edit-modal v-if="store.meEditOpen"></me-profile-edit-modal>' +
      '</transition>' +
      '<transition name="veil">' +
      '<username-modal v-if="store.unameOpen"></username-modal>' +
      '</transition>' +
      '<transition name="veil">' +
      '<archive-lock-modal v-if="store.archiveLockPrompt"></archive-lock-modal>' +
      '</transition>' +
      '<download-viewer v-if="store.dlViewer"></download-viewer>' +
      '<transition name="veil">' +
      '<confirm-box v-if="store.confirmBox"></confirm-box>' +
      '</transition>' +
      /* W28f: lista de lectores de un mensaje propio en un grupo */
      '<transition name="veil">' +
      '<reads-box v-if="store.readsBox"></reads-box>' +
      '</transition>' +
      /* W28h: panel de llamada (entrante o en curso) */
      '<call-box v-if="store.call"></call-box>' +
      /* W18: aviso anti-spam (pantalla completa; solo el botón la cierra) */
      '<spam-box v-if="store.spamUntil > 0"></spam-box>' +
      /* W13: modal de reenvío (elegir chat destino) */
      '<transition name="veil">' +
      '<div class="modal-veil" v-if="fwdFor" @click.self="fwdFor = null">' +
        '<div class="modal fwd" role="dialog" :aria-label="t(\'Reenviar mensaje\')">' +
          '<header>{{ t(\'Reenviar mensaje\') }}' +
            '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="fwdFor = null">' +
              '<svg class="ic"><use href="#i-x"></use></svg>' +
            '</button>' +
          '</header>' +
          '<div class="m-search">' +
            '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
            '<input v-model="fwdQ" :placeholder="t(\'Buscar en la lista…\')" ' +
              ':aria-label="t(\'Buscar en la lista…\')">' +
            '<button class="clr-x" :class="{ show: !!fwdQ }" type="button" ' +
              ':title="t(\'Borrar\')" @click="fwdQ = \'\'">' +
              '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
          '</div>' +
          '<div class="results fwd-list">' +
            '<button class="res-item" type="button" v-for="c in fwdChats" :key="c.id" ' +
              ':disabled="fwdBusy" @click="doForward(c.id)">' +
              '<span class="avatar av36" :class="{ \'has-photo\': !!avatarOf(c) }">' +
                '<img v-if="avatarOf(c)" :src="avatarOf(c)" alt="" loading="lazy">' +
                '<span v-else>{{ initialsOf(c) }}</span>' +
              '</span>' +
              '<span class="ri-col"><span class="ri-name">{{ titleOf(c) }}</span>' +
              '<span class="ri-user">{{ c.type === \'group\' ? t(\'Grupo\') : t(\'Chat\') }}</span></span>' +
            '</button>' +
            '<div class="list-empty" v-if="!fwdChats.length">{{ t(\'Sin resultados.\') }}</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</transition>' +
      '<chat-info-panel></chat-info-panel>' +
      /* W13: buscar dentro del chat. W37b: ahora es un MODAL (no un
         panel lateral que empujaba el chat). W37c: anima apertura y
         cierre como el resto. */
      '<transition name="veil">' +
      '<div class="modal-veil" v-if="searchOpen && activeChat" @click.self="toggleSearch">' +
        '<div class="modal search-modal" :aria-label="t(\'Buscar en el chat\')">' +
        '<header>' +
          '<b>{{ t(\'Buscar en el chat\') }}</b>' +
          '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="toggleSearch">' +
            '<svg class="ic"><use href="#i-x"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="sp-body">' +
          '<div class="search-pill">' +
            '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
            '<input v-model="sQ" :placeholder="t(\'Buscar mensajes\')" ' +
              ':aria-label="t(\'Buscar mensajes\')" @input="onSearchInput">' +
            '<button class="clr-x" :class="{ show: !!sQ }" type="button" ' +
              ':title="t(\'Borrar\')" @click="sQ = \'\'; onSearchInput()">' +
              '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
          '</div>' +
          '<div class="sp-res" role="button" tabindex="0" v-for="m in sResults" :key="m.id" ' +
            '@click="jumpResult(m)" @keydown.enter="jumpResult(m)">' +
            '<span class="spr-top">' +
              '<b>{{ m.sender ? (m.sender.display_name || m.sender.username) : \'\' }}</b>' +
              '<span class="spr-time">{{ sTime(m.created_at) }}</span>' +
            '</span>' +
            '<span class="spr-text">{{ sSnippet(m) }}</span>' +
          '</div>' +
          '<div class="sp-empty" v-if="sErr">{{ sErr }}</div>' +
          '<div class="sp-empty" v-else-if="sBusy">{{ t(\'Buscando…\') }}</div>' +
          '<div class="sp-empty" v-else-if="!sQ.trim()">' +
            '{{ t(\'Escribe para buscar en los mensajes de este chat.\') }}</div>' +
          '<div class="sp-empty" v-else-if="!sResults.length">{{ t(\'Sin resultados.\') }}</div>' +
        '</div>' +
        '</div>' +
      '</div>' +
      '</transition>' +
      '<profile-panel></profile-panel>' +
      /* W65: confirmación de solicitud enviada (enlace directo o ＋). */
      '<transition name="veil">' +
      '<request-sent-modal v-if="store.requestSent"></request-sent-modal>' +
      '<join-group-modal v-if="store.joinPrompt"></join-group-modal>' +
      '</transition>' +
      /* W11: soltar archivos sobre el chat */
      '<div class="drop-hint" v-if="dropping">' +
        '<span>{{ t(\'Suelta los archivos para enviarlos\') }}</span>' +
      '</div>' +
      /* W8: vista previa de imágenes con zoom (clic = 2.5x, rueda, arrastre) */
      '<div class="lightbox" v-if="lb" :class="{ \'lb-zoomed\': lbScale > 1 }" @click.self="closeLb">' +
        '<button class="lb-btn lb-close" type="button" @click="closeLb">' +
          '<svg class="ic"><use href="#i-x"></use></svg>' +
        '</button>' +
        '<div class="lb-filename" v-if="lb.name">{{ lb.name }}</div>' +
        '<button class="lb-btn lb-download" type="button" @click="lbDl">' +
          '<svg class="ic ic-sm"><use href="#i-download"></use></svg>' +
        '</button>' +
        '<img class="lb-img" :src="lb.url" :style="lbStyle" ' +
          '@click="lbZoom" @wheel.prevent="lbWheel" @mousedown.prevent="lbDown" ' +
          '@touchstart="lbTouchStart" @touchmove.prevent="lbTouchMove" ' +
          '@touchend="lbTouchEnd" @touchcancel="lbTouchEnd">' +
        /* W22: la ayuda lleva su píldora de fondo y desaparece al
           hacer zoom (con la imagen ampliada solo estorba). */
        '<span class="lb-hint" v-if="lbScale <= 1"><span class="lb-pill">' +
          '{{ t(\'Click o rueda para ampliar · arrastra para mover\') }}</span></span>' +
      '</div>' +
      /* W7: menú contextual (fixed; la posición sale del evento.
         W17: con ancla a la burbuja no tapa el mensaje.
         W37b: cada ítem puede traer su icono (it.icon → #symbol).
         W37b: en móvil el MISMO menú es un bottom sheet abajo. */
      '<div class="ctx-backdrop" v-if="store.ctx && store.ctx.sheet" ' +
        '@click.stop="store.ctx = null"></div>' +
      '<div class="ctx-menu" :class="{ \'ctx-sheet\': store.ctx.sheet }" ' +
        'v-if="store.ctx" @click.stop ' +
        ':style="store.ctx.sheet ? {} : ' +
          '{ left: store.ctx.x + \'px\', top: store.ctx.y + \'px\' }">' +
        '<div class="ctx-head" v-if="store.ctx.sheet && store.ctx.head">' +
          '<span class="avatar av36" :class="{ \'has-photo\': !!store.ctx.head.avatar }">' +
            '<img v-if="store.ctx.head.avatar" :src="store.ctx.head.avatar" alt="">' +
            '<span v-else>{{ store.ctx.head.ini }}</span>' +
          '</span>' +
          '<span class="ctx-head-col">' +
            '<b>{{ store.ctx.head.name }}</b>' +
            '<small v-if="store.ctx.head.sub">{{ store.ctx.head.sub }}</small>' +
          '</span>' +
        '</div>' +
        '<button class="ctx-item" :class="{ danger: it.danger }" type="button" ' +
          'v-for="(it, i) in store.ctx.items" :key="i" @click="runCtx(it)">' +
          '<svg class="ic ic-sm ctx-ic" v-if="it.icon"><use :href="\'#\' + it.icon"></use></svg>' +
          '<span class="ctx-label">{{ t(it.label) }}</span>' +
          '<span class="ctx-sep" v-if="it.pill">-</span>' +
          '<span class="ctx-pill" v-if="it.pill">' +
            '<svg class="ic ic-sm" v-if="it.pill.icon"><use :href="\'#\' + it.pill.icon"></use></svg>' +
            '<b>{{ it.pill.text }}</b></span></button>' +
      '</div>' +
      /* W27h: pantalla de arranque — cubre la app hasta que chats,
         gente (perfiles), vistas previas y mensajes iniciales están
         listos y la interfaz se revela completa. W38: ahora muestra
         la pantalla compartida (icono, barra y fase). */
      '<div class="app-boot" v-if="store.booting">' +
        '<boot-screen></boot-screen>' +
      '</div>' +
      /* W58: onboarding de permisos a pantalla completa. */
      '<permission-gate></permission-gate>' +
    '</div>',
};
