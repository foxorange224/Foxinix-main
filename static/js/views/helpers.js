/* views/helpers.js — helpers compartidos por las vistas de Foxinix.
   Extraídos de views/chat.js (Fase 3.1) para que los componentes de
   views/components/ no dependan del monolito.

   Todo lo que vive aquí es "puro" (no toca el DOM directamente salvo
   openMediaViewer, que solo cambia el estado del store). */

import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { humanError, api, logout } from '../api.js';
import { applyProfileFields } from '../realtime.js';
import { ImageAdapter } from '../platform/images.js';
import {
  mediaUrl, chatTitle, leaveGroup, deleteDmChat,
  setMemberRole, transferOwner, removeMember,
} from '../actions.js';

/* ------------------------------------------------------- fechas/horas */

export const pad = function (n) { return n < 10 ? '0' + n : '' + n; };

export function dayKey(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

export function dayLabel(d) {
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
export function fmtTime(d) {
  const h = d.getHours();
  if (store.prefs.h12) {
    const h12 = h % 12 || 12;
    return h12 + ':' + pad(d.getMinutes()) + (h < 12 ? ' am' : ' pm');
  }
  return pad(h) + ':' + pad(d.getMinutes());
}

export function fmtListTime(ts) {
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

export function fmtLastSeen(ts) {
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

export const STATUS_PRESETS = [
  { val: 'online', label: 'En línea', dot: 'sd-online' },
  { val: 'busy', label: 'Ausente', dot: 'sd-busy' },
  { val: 'dnd', label: 'No molestar', dot: 'sd-dnd' },
  { val: 'invisible', label: 'Invisible', dot: 'sd-off' },
];

export function presetLabel(val) {
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
export function dotClass(u, selfOn) {
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

export function statusOf(u) {
  if (u && u.status_text) return u.status_text;
  if (u && u.status_preset) return presetLabel(u.status_preset);
  return '';
}

/* W58: la burbuja citada del perfil muestra el mensaje personalizado o
   un preset relevante; el "En línea" por defecto no se repite (la
   presencia ya la dice el aro del avatar). */
export function profileQuote(u) {
  if (!u) return '';
  if (u.status_text) return u.status_text;
  if (u.status_preset && u.status_preset !== 'online') {
    return presetLabel(u.status_preset);
  }
  return '';
}

export function connLine(u) {
  const on = u && (store.presence[u.id] != null ? store.presence[u.id] : u.online);
  return on ? t('En línea') : fmtLastSeen(u ? u.last_seen : 0);
}

/* W27: píldora de estado (perfil y info del directo) — si está
   DESCONECTADO se dice "Desconectado": el preset "en línea" guardado en
   el perfil no es un estado del usuario. Si está activo, manda SU estado
   (texto o preset) por encima de lo genérico. */
export function connPill(u) {
  if (!u) return '';
  const on = store.presence[u.id] != null ? store.presence[u.id] : u.online;
  return on ? statusOf(u) : t('Desconectado');
}

/* ------------------------------------------------------- perfiles (W61) */

/* W61: posición vertical de la portada (0 = arriba, 100 = abajo). */
export function bannerPositionOf(u) {
  const n = Number(u && u.banner_position);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

export function bannerStyle(u) {
  return { objectPosition: '50% ' + bannerPositionOf(u) + '%' };
}

/* W61: abre una portada/avatar en el visor existente, con el original
   (sin la miniatura ?thumb=1) para poder ampliarlo y descargarlo. */
export function openMediaViewer(url, name) {
  if (!url) return;
  store.lb = {
    url: mediaUrl(url, false, true),
    orig: mediaUrl(url, true, true),
    name: name || '',
  };
}

/* Avatar e iniciales de un chat (DM o grupo) — genéricos: los usan la
   lista de chats, la cabecera y el modal de reenviar. */
export function avatarOf(c) {
  if (!c) return '';
  const url = c.type === 'dm' ? (c.title && c.title.avatar_url) : c.avatar_url;
  return url ? mediaUrl(url) : '';
}
export function initialsOf(c) {
  const name = chatTitle(c);
  return name ? name.charAt(0).toUpperCase() : '?';
}

export function joinedLine(u) {
  if (!u || !u.created_at) return '—';
  const d = new Date(u.created_at * 1000);
  return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
}

/* W8: markdown mínimo y SEGURO para las bios. Primero se escapa todo el
   texto del usuario y recién después se agregan etiquetas propias:
   **negrita**, *cursiva*, ~~tachado~~, `código`, [links](https://…) y
   saltos de línea. No se acepta HTML ajeno (sin riesgo de inyección). */
export function mdToHtml(text) {
  /* Las entidades se arman en runtime (chr 38) para que ningun
     pipeline de build/interpolacion las decodifique antes de tiempo. */
  const A = String.fromCharCode(38);
  let out = String(text)
    .replace(/&/g, A + 'amp;')
    .replace(/</g, A + 'lt;')
    .replace(/>/g, A + 'gt;')
    .replace(/"/g, A + 'quot;')
    /* W37f: la comilla simple tambien se escapa (defensa en profundidad
       si algun atributo futuro usa comillas simples). */
    .replace(/'/g, A + '#39;');
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

/* W77: toast de error que traduce detalles técnicos de la API a lenguaje
   natural mediante humanError(). fallback es el mensaje genérico si no hay
   error de API. */
export const toastErr = function (err, fallback) {
  toast(humanError(err || { detail: fallback || '' }), 'err');
};

/* ------------------------------------------------- perfiles / confirma */

/* Confirmación antes de cerrar sesión: al confirmar, clearSession() deja
   la pantalla principal sin rastro de la cuenta. */
export function askLogout() {
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
export function askDeleteAccount() {
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

/* W60: banner difuminado PREPROCESADO. Se reduce la portada a 48x27 en
   un canvas y se cachea como data URL; el CSS solo escala esa imagen
   diminuta y le aplica un blur barato (nada de backdrop-filter). */
const callBlurCache = {};
export function callBlurBanner(url, position) {
  if (!url) return Promise.resolve('');
  const pos = Math.max(0, Math.min(100, Number(position) || 50));
  const cacheKey = url + '|' + pos;
  if (callBlurCache[cacheKey] !== undefined) {
    return Promise.resolve(callBlurCache[cacheKey]);
  }
  return ImageAdapter.makeSmallDataUrl(mediaUrl(url), pos)
    .then(function (v) {
      callBlurCache[cacheKey] = v;
      return v;
    });
}

/* W66e: frases del estado vacío de "Activos" cuando no hay nadie en
   línea — las tres primeras van directas y el resto con un toque de
   humor; se elige una al azar (nunca la misma dos veces seguidas). */
export const OFFLINE_LINES = [
  'No hay nadie en línea por ahora.',
  'Parece que no hay contactos activos en este momento.',
  'Sin conexiones activas.',
  'Todo muy silencioso por aquí... No hay nadie en línea.',
  'Silencio total. Tus contactos están desconectados.',
  '¡Cero actividad! Todos andan desconectados o buscando café.',
  'Parece que el servidor está solo en este momento.',
];
export function pickOffLine(prev) {
  let i = Math.floor(Math.random() * OFFLINE_LINES.length);
  if (OFFLINE_LINES[i] === prev && OFFLINE_LINES.length > 1) {
    i = (i + 1) % OFFLINE_LINES.length;
  }
  return OFFLINE_LINES[i];
}

/* Perfil de otro usuario en ventana flotante (clic repetido = cerrar). */
export async function openProfile(username) {
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
      loading: false, user: null,
      error: (e && t(e.detail)) || t('No se pudo cargar el perfil'),
      username: username,
    };
  }
}

/* W78: abre el modal de perfil de grupo con descripción, miembros y
   archivos compartidos. Carga los datos del endpoint /chats/:id. */
export async function openGroupProfile(chatId) {
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
export function askLeave(c) {
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
export function askDeleteDm(c) {
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
export function askSetRole(c, m, role) {
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

export function askTransferOwner(c, m) {
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

export function askRemoveMember(c, m) {
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
