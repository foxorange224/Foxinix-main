/* chat-shell.js — la pantalla principal de Foxinix: lista de chats,
   conversación, compositor, modales y paneles.
   Extraído de views/chat.js (Fase 3.1). */


import {
  store, toast, toggleTheme, setTheme, setAccent, setWall, setPref, setFont,
  setPrefStr,   /* W40: estilo de emojis (valor libre) */
  setWallImg, setWallDim, setWallBlur, setSideCollapsed, setMicDev,
  setArchiveLock, checkArchiveLock, clearArchiveLock, hasArchiveLock,
  syncUrl,      /* W68: modal join vuelve a la URL real al cancelar */
} from '../store.js';
import { logout, api, session, saveSession, uploadMedia,
  uploadChatAvatar, ensurePreview } from '../api.js';
import { t, setLang, LANGS, sysText } from '../i18n.js';
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
  createDm, createGroup, addMember,
  archiveChat,
  /* W28c */
  togglePin, toggleReaction,
  loadMembers,
  /* W28g */
  sendGif,
  /* W8 */
  editMessage, askDeleteMessage,
  searchUsers, notifyTyping, chatTitle, mediaUrl, fmtSize,
  preloadImage,   /* W57: precarga sin repetir recursos */
  /* W11 */
  cancelUpload, retryUpload,
  /* W13 */
  setPinned, setMuted, mergeMessages,
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
import { startWS, stopWS } from '../realtime.js';
import { AvatarEditor } from './avatar-editor.js';
import { FileAdapter } from '../platform/files.js';
import { StorageAdapter } from '../platform/storage.js';
import { DomAdapter } from '../platform/dom.js';
import { MediaAdapter } from '../platform/media.js';
import { ConfirmBox } from './components/ConfirmBox.js';
import { ReadsBox } from './components/ReadsBox.js';
import { SpamBox } from './components/SpamBox.js';
import { ArchiveLockModal } from './components/ArchiveLockModal.js';
import { RequestSentModal } from './components/RequestSentModal.js';
import { JoinGroupModal } from './components/JoinGroupModal.js';
import { PermissionGate } from './components/PermissionGate.js';
import { DownloadViewer } from './components/DownloadViewer.js';
import { BioText } from './components/BioText.js';
import { UsernameModal } from './components/UsernameModal.js';
import { EmojiPicker } from './components/EmojiPicker.js';
import { NewChatModal } from './components/NewChatModal.js';
import { WallPanel } from './components/WallPanel.js';
import { WallPreview } from './components/WallPreview.js';
import { MessageRow } from './components/MessageRow.js';
import { SettingsModal } from './components/SettingsModal.js';
import { CallBox } from './components/CallBox.js';
import { MeProfileEditModal } from './components/MeProfileEditModal.js';
import { ChatInfoPanel } from './components/ChatInfoPanel.js';
import { PeoplePanel } from './components/PeoplePanel.js';
import { GroupProfileModal } from './components/GroupProfileModal.js';
import { ProfilePanel } from './components/ProfilePanel.js';
import { MeProfileModal } from './components/MeProfileModal.js';
import { RenameGroupModal } from './components/RenameGroupModal.js';
import { Lightbox, openLb, closeLb } from './components/Lightbox.js';
import { CtxMenu } from './components/CtxMenu.js';
import { ForwardModal } from './components/ForwardModal.js';
import { SearchModal } from './components/SearchModal.js';
import {
  pad, dayKey, dayLabel, fmtTime, fmtListTime, fmtLastSeen,
  STATUS_PRESETS, presetLabel, dotClass, statusOf, profileQuote,
  connLine, connPill, bannerPositionOf, bannerStyle, openMediaViewer,
  joinedLine, mdToHtml, toastErr, avatarOf, initialsOf,
  openProfile, openGroupProfile,
  askLeave, askDeleteDm, askSetRole, askTransferOwner, askRemoveMember,
} from './helpers.js';
import {
  askLogout, askDeleteAccount, callBlurBanner,
  OFFLINE_LINES, pickOffLine,
} from './helpers.js';
import {
  clampPos, isTouchUI, openCtx, cropStateFor, saveCropState,
  pickGroupPhoto, ctxChatHead, chatMenu, personMenu, menuKey,
  copyText, clampPanel,
  STICKERS, GIF_LIST, isStkFav, toggleStkFav, ensureGifFavs,
  ASSET_MAX, assetList, ensureUserAssets, assetWithMedia,
  uploadUserAsset, removeUserAsset, toggleStickerAsset,
  gifFavFor, isGifMedia, isGifFav, isLibGifFav, toggleFavGif, toggleLibGif,
  voicePlayers, queueNextVoice, getCurrentAudioEl, setCurrentAudioEl,
  chatInfoMenu,
} from './ui-actions.js';


/* W27b: el formulario (foto + nombre + estado + bio) vive en un modal
   PROPIO; "Tu perfil" solo muestra la ficha y el lápiz entra aquí. */


/* ------------------------------------------------------- ChatShell */

export const ChatShell = {
  components: { MessageRow, NewChatModal, SettingsModal, MeProfileModal, MeProfileEditModal, UsernameModal, ArchiveLockModal, DownloadViewer, ConfirmBox, RequestSentModal, JoinGroupModal, PermissionGate, ReadsBox, CallBox, ProfilePanel, ChatInfoPanel, GroupProfileModal, EmojiPicker, SpamBox, WallPanel, WallPreview, PeoplePanel, RenameGroupModal, Lightbox, CtxMenu, ForwardModal, SearchModal },
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

    const previewText = function (c) {
      const lm = c.last_message;
      if (!lm) return c.type === 'dm' ? t('Escribe para empezar') : t('Grupo nuevo');
      const mine = !!(lm.sender && store.user && lm.sender.id === store.user.id);
      let who = '';
      if (mine) who = t('Tú: ');
      else if (c.type === 'group' && lm.sender) who = (lm.sender.display_name || lm.sender.username) + ': ';
      if (lm.kind === 'system') return sysText(lm.body || '');
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
        if (DomAdapter.isFocused(input.value)) scrollBottom();
      }, 280);
    };
    const onKeyboardViewport = function () {
      if (!DomAdapter.isFocused(input.value)) return;
      setTimeout(function () {
        if (DomAdapter.isFocused(input.value)) scrollBottom();
      }, 80);
    };
    /* Para poder soltar el listener del viewport visual al desmontar. */
    let unbindKeyboardViewport = null;

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
      if (!el) return;
      if (rowRO) { rowRO(); rowRO = null; }
      rowRO = DomAdapter.observeResizeAll(el.children, function () {
        if (stick.value) scrollBottom();
      });
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
      store.searchOpen = false;
      store.fwdFor = null;
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
      if (!MediaAdapter.canRecordAudio()) {
        /* W19: sobre HTTP con IP ajena a localhost el navegador BLOQUEA
           el micrófono (contexto inseguro): decirlo claro, no culpar al
           navegador. */
        toast(MediaAdapter.isSecure() === false
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
        recStream = await MediaAdapter.getMicrophone({
          audio: store.micDev
            ? Object.assign({ deviceId: { exact: store.micDev } }, recAudio)
            : recAudio,
        });
      } catch (e) {
        let lastErr = e;
        if (store.micDev) {
          try {
            recStream = await MediaAdapter.getMicrophone({ audio: true });
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
        const actx = MediaAdapter.createAudioContext();
        if (actx) {
          recCtx = actx;
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
        const cands = ['audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
        const mime = MediaAdapter.pickAudioMimeType(cands);
        rec1 = MediaAdapter.createRecorder(recStream, mime);
        if (!rec1) throw new Error('no recorder');
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
        if (p.thumb) { try { FileAdapter.revokeObjectURL(p.thumb); } catch (e) {} }
      }
      pendingAtts.value = [];
      spoilNext.value = false;   /* W29g: el interruptor vive con el adjunto */
      if (a && a.thumb) { try { FileAdapter.revokeObjectURL(a.thumb); } catch (e) {} }
    };

    /* Quitar UN archivo de la cola (la lista de adjuntos permite quitar
       cada ítem por separado sin vaciar todo). */
    const removeAtt = function (i) {
      const p = pendingAtts.value[i];
      if (!p) return;
      if (p.thumb) { try { FileAdapter.revokeObjectURL(p.thumb); } catch (e) {} }
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
      if (a.thumb) { try { FileAdapter.revokeObjectURL(a.thumb); } catch (e) {} }
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
          thumb: (/^image\//.test(f.type || '') && typeof FileAdapter.createObjectURL === 'function')
            ? FileAdapter.createObjectURL(f) : '',
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
      const an = DomAdapter.getNativeBridge();
      if (!an || typeof an.pendingTarget !== 'function') return;
      let raw = '';
      try { raw = an.pendingTarget(); } catch (e) { return; }
      if (!raw) return;
      try {
        const o = JSON.parse(raw);
        openNotificationTarget(o.chat_id, o.message_id);
      } catch (e) {}
    };
    DomAdapter.setGlobal('__foxinixNativeTarget', consumeNativeTarget);

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
    DomAdapter.setGlobal('__foxinixDownloadDone', function (raw) {
      let o = raw;
      try { if (typeof raw === 'string') o = JSON.parse(raw); } catch (e) { return; }
      if (!o) return;
      toast(dlDoneText(o.type), 'ok');
    });
    DomAdapter.setGlobal('__foxinixDownloadError', function (raw) {
      let o = raw;
      try { if (typeof raw === 'string') o = JSON.parse(raw); } catch (e) { return; }
      if (!o) return;
      toast(dlFailText(o.type), 'err');
    });
    const onNativeVisible = function () {
      if (!DomAdapter.getHidden()) consumeNativeTarget();
    };
    DomAdapter.addEventListener('visibilitychange', onNativeVisible);
    DomAdapter.addWindowEventListener('focus', onNativeVisible);

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
      DomAdapter.addEventListener('click', onDocClick);
      DomAdapter.addWindowEventListener('keydown', onEsc);
      /* W54d: teclado de Android (resize del WebView o viewport visual) */
      DomAdapter.addWindowEventListener('resize', onKeyboardViewport);
      unbindKeyboardViewport = DomAdapter.onViewportResize(onKeyboardViewport);
      /* W11: pegar (Ctrl+V) + arrastrar y soltar archivos */
      DomAdapter.addEventListener('paste', onPasteEv);
      DomAdapter.addEventListener('error', onEmojiImgError, true);
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
      DomAdapter.removeWindowEventListener('resize', onPickResize);   // W29g
      DomAdapter.removeWindowEventListener('resize', onKeyboardViewport);
      DomAdapter.removeWindowEventListener('focus', onNativeVisible);   // W57
      DomAdapter.removeEventListener('visibilitychange', onNativeVisible);
      if (DomAdapter.getGlobal('__foxinixNativeTarget') === consumeNativeTarget) {
        DomAdapter.setGlobal('__foxinixNativeTarget', null);
      }
      DomAdapter.setGlobal('__foxinixDownloadDone', null);
      DomAdapter.setGlobal('__foxinixDownloadError', null);
      if (unbindKeyboardViewport) { unbindKeyboardViewport(); unbindKeyboardViewport = null; }
      DomAdapter.removeEventListener('click', onDocClick);
      DomAdapter.removeWindowEventListener('keydown', onEsc);
      DomAdapter.removeEventListener('paste', onPasteEv);
      DomAdapter.removeEventListener('error', onEmojiImgError, true);
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
      store.settingsAtHome = !tab && DomAdapter.getInnerWidth() <= 760;
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
    DomAdapter.addWindowEventListener('resize', onPickResize);
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
      store.infoOpen = DomAdapter.getInnerWidth() > 1100;
    };

    /* W19: sidebar colapsable (solo escritorio; en móvil manda el
       layout de pantalla completa y el botón queda oculto). */
    const toggleSide = function () { setSideCollapsed(!store.sideCollapsed); };
    const unfoldSide = function () { setSideCollapsed(false); };

    /* W27c: la opción "Personas" vive en el PANEL DE CHATS (sidebar),
       arriba de la lista. En escritorio lleva al centro (y cierra el
       chat si hay uno abierto); en móvil va a pantalla completa. Siempre
       vuelve a la pantalla principal (pestaña Activos). */
    const isNarrow = Vue.ref(DomAdapter.getInnerWidth() <= 760);
    const onResizeW = function () {
      isNarrow.value = DomAdapter.getInnerWidth() <= 760;
    };
    DomAdapter.addWindowEventListener('resize', onResizeW);
    Vue.onUnmounted(function () {
      DomAdapter.removeWindowEventListener('resize', onResizeW);
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

    /* ---------- W13: buscar dentro del chat ----------
       El modal (SearchModal) tiene su propia consulta y resultados; aquí
       solo se abre/cierra (store.searchOpen) y se recibe el salto. */
    const toggleSearch = function () {
      store.searchOpen = !store.searchOpen;
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

    /* ---------- W13: reenviar mensajes ----------
       El modal (ForwardModal) gestiona la lista de destinos y el envío;
       aquí solo se marca qué mensaje se reenvía. */
    const openForward = function (m) {
      store.fwdFor = { msg: m, src: store.activeChatId };
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
      return DomAdapter.getLocationOrigin() + path + '?m=' + m.id;
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
      const touchKb = DomAdapter.isMobileUserAgent();
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
      if (store.lb) { closeLb(); return; }                         // W8
      if (store.ctx) { store.ctx = null; return; }              // W7
      if (acList.value.length) { clearAc(); return; }           // W17
      if (store.emoOpen) { store.emoOpen = false; return; }     // W7/W29g
      if (store.fwdFor) { store.fwdFor = null; return; }         // W13
      if (store.searchOpen) { store.searchOpen = false; return; }  // W13
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
      toggleSearch, jumpResult,
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
      chatMenu, msgMenu, dotClass,
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
      openLb, closeLb,   /* el visor (zoom) vive en el componente Lightbox */
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
          '<button class="icon-btn" :class="{ on: store.searchOpen }" type="button" ' +
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
      '<forward-modal v-if="store.fwdFor"></forward-modal>' +
      '</transition>' +
      '<chat-info-panel></chat-info-panel>' +
      /* W13: buscar dentro del chat. W37b: ahora es un MODAL (no un
         panel lateral que empujaba el chat). W37c: anima apertura y
         cierre como el resto. */
      '<transition name="veil">' +
      '<search-modal v-if="store.searchOpen && activeChat" @jump="jumpResult"></search-modal>' +
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
      /* W8: visor de imágenes con zoom (componente propio). */
      '<lightbox></lightbox>' +
      '<ctx-menu></ctx-menu>' +
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
