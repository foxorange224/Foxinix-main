/* views/ui-actions.js — acciones de interfaz compartidas por las vistas.
   Extraído de views/chat.js (Fase 3.1) para que los componentes de
   views/components/ no dependan del monolito.

   Contiene: menú contextual (⋮), encuadre de fotos, stickers/GIFs,
   favoritos y la cola de reproducción de notas de voz. */

import Vue from '../vue.js';
import { store, toast } from '../store.js';
import { t } from '../i18n.js';
import { api, uploadMedia } from '../api.js';
import {
  mediaUrl, chatTitle, openChat, loadMembers, setPinned, setMuted,
  archiveChat, unfriend, cancelFriendRequest, acceptFriendRequest,
  rejectFriendRequest, sendFriendRequest, blockUser, unblockUser,
} from '../actions.js';
import { FileAdapter } from '../platform/files.js';
import { DomAdapter } from '../platform/dom.js';
import { StorageAdapter } from '../platform/storage.js';
import { toastErr, openProfile, askLeave, askDeleteDm } from './helpers.js';
/* W106: la lógica de stickers y GIFs (datos, favoritos y biblioteca
   personal) vive en un módulo compartido, que también usa la app nativa. */
import {
  STICKERS, GIF_LIST, isStkFav, toggleStkFav, ensureGifFavs,
  ASSET_MAX, assetList, ensureUserAssets, assetWithMedia,
  uploadUserAsset, removeUserAsset, gifFavFor, isGifMedia, isGifFav,
  isLibGifFav, toggleFavGif, toggleLibGif,
} from '../stickers.js';
export {
  STICKERS, GIF_LIST, isStkFav, toggleStkFav, ensureGifFavs,
  ASSET_MAX, assetList, ensureUserAssets, assetWithMedia,
  uploadUserAsset, removeUserAsset, gifFavFor, isGifMedia, isGifFav,
  isLibGifFav, toggleFavGif, toggleLibGif,
};

/* Menú contextual compartido: lo abren la lista (⋮), el panel de info (⋮)
   y la ventana de perfil (⋮). Antes vivía solo en ChatShell; ahora está
   al nivel del módulo para que cualquier vista lo use (el ancla del menú
   se resuelve por clase porque no hay ref compartida). */
export const clampPos = function (v, max) {
  return Math.max(4, Math.min(v, max - 8));
};
/* W37b: en móvil/táctil no hay hover — la barra flotante no sirve y el
   menú contextual se abre como BOTTOM SHEET abajo de la pantalla. */
export function isTouchUI() {
  return DomAdapter.isCoarsePointer();
}
export const openCtx = function (e, items, anchor, key, head) {
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
  const vp = DomAdapter.getViewportSize();
  const vw = vp.width;
  const vh = vp.height;
  const estW = 200;
  const estH = items.length * 37 + 10;
  let x;
  let y;
  if (anchor) {
    const r = DomAdapter.getRect(anchor);
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
    const el = DomAdapter.querySelector('.ctx-menu');
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
export function cropStateFor(key) { return cropStates[key] || null; }
export function saveCropState(key, st) { if (key && st) cropStates[key] = st; }

/* Foto del grupo (W27b): selector de imagen y, ANTES de subirla, el
   editor de encuadre en el panel de info (mismo componente que el
   perfil). El resultado compuesto se sube ya recortado. Solo owner/admin
   la usan (c.my_role) y el server vuelve a validar el rol. */
export function pickGroupPhoto(c) {
  if (!c) return;
  const inp = DomAdapter.createElement('input');
  if (!inp) return;
  inp.type = 'file';
  inp.accept = 'image/*';
  /* W27b: va al DOM (oculto) para poder manipularlo desde fuera */
  inp.className = 'tmp-file';
  inp.style.display = 'none';
  DomAdapter.bodyAppendChild(inp);
  inp.addEventListener('change', function () {
    if (inp.remove) inp.remove();
    else DomAdapter.bodyRemoveChild(inp);
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Elige una imagen', 'err'); return; }
    if (f.size > 15 * 1024 * 1024) { toast('La imagen supera los 15 MB', 'err'); return; }
    /* el editor vive en el panel de info: abre ese chat con el panel */
    store.infoOpen = true;
    openChat(c.id);
    loadMembers(c.id);
    if (store.grpEdit && store.grpEdit.src) FileAdapter.revokeObjectURL(store.grpEdit.src);
    store.grpEdit = {
      chatId: c.id,
      src: FileAdapter.createObjectURL(f),
      initial: cropStateFor('chat-' + c.id),
    };
  });
  inp.click();
}

/* W54c: cabecera de la hoja móvil para los menús de chat/grupo. */
export function ctxChatHead(c) {
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
export function chatMenu(e, c, key) {
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

/* W27: ⋮ del panel — administrar el grupo (o el directo).
   Compartido por el panel de info del chat y por el modal de info del
   grupo: antes el modal no tenía acceso a esta función (vivía en el
   setup del panel) y su botón ⋮ fallaba al pulsarlo. */
export function chatInfoMenu(e, c, peer) {
  if (!c) return;
  if (c.type === 'group') {
    chatMenu(e, c, 'info');
    return;
  }
  const items = [];
  const meId = store.user ? store.user.id : 0;
  if (peer && peer.username && peer.id !== meId) {
    items.push({
      label: 'Ver perfil', icon: 'i-user',
      fn: function () { openProfile(peer.username); },
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
}

/* ⋮ de la ventana de perfil de OTRO usuario: administrar la amistad
   (enviar / cancelar / aceptar solicitud, eliminar amistad). */
export function personMenu(e, u) {
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
export function menuKey(ev, c) {
  const el = ev.target;
  const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  chatMenu({ clientX: r ? r.left : 8, clientY: r ? r.bottom : 8 }, c);
}

/* Copiar al portapapeles (FF78: execCommand, sin depender de clipboard API). */
export function copyText(txt) {
  if (!DomAdapter.copyToClipboard(txt)) {
    toast('No se pudo copiar el texto', 'err');
  }
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
export const clampPanel = function (el, anim) {
  if (!el) return;
  const par = el.parentElement;
  const enChips = !!(par && par.classList && par.classList.contains('react-picker'));
  const sonChips = !!(el.classList && el.classList.contains('react-picker'));
  const msgsEl = DomAdapter.querySelector('.msgs');
  const bb = msgsEl ? DomAdapter.getRect(msgsEl) : null;
  const vp = DomAdapter.getViewportSize();
  const vw = vp.width, vh = vp.height;
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
  const nat = DomAdapter.getRect(el);
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
  const r2 = DomAdapter.getRect(el);
  el.style.left = Math.round(x + (x - r2.left)) + 'px';
  el.style.top = Math.round(y + (y - r2.top)) + 'px';
  if (anim) el.style.animation = animWas || '';  // la entrada arranca en su sitio
};

export const toggleStickerAsset = function (m) {
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

/* ------------------------------------------------------- notas de voz */

/* W8: sólo un audio suena a la vez en toda la app. Es un estado
   compartido por TODAS las filas de mensajes, por eso vive en el módulo
   (y no dentro del setup de cada fila). */
let currentAudioEl = null;
export function getCurrentAudioEl() { return currentAudioEl; }
export function setCurrentAudioEl(el) { currentAudioEl = el; }

/* W99: reproductores de nota de voz por id de mensaje — la cola de
   reproducción (Ajustes → Accesibilidad) salta a la siguiente nota
   cuando la actual termina. */
export const voicePlayers = {};

/* W99: siguiente paso de la cola. Si el mensaje posterior es otra nota
   de voz con media, se reproduce; si es cualquier otro mensaje (texto,
   imagen, sistema…), la cadena se detiene. Solo con la pref voiceQueue
   activada (default ON). */
export function queueNextVoice(msg) {
  if (!store.prefs.voiceQueue) return;
  const list = store.msgs[store.activeChatId] || [];
  let next = null;
  for (let i = 0; i < list.length - 1; i++) {
    if (list[i].id === msg.id) { next = list[i + 1]; break; }
  }
  if (!next || next.kind !== 'voice' || !next.media) return; // mensaje normal → parar
  const play = voicePlayers[next.id];
  if (play) setTimeout(play, 120);
}
