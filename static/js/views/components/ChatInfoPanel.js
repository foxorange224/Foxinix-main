/* ChatInfoPanel — extraído de views/chat.js (Fase 3.1). */
import {
  chatTitle, fmtSize, mediaUrl,
} from '../../actions.js';
import {
  api, uploadChatAvatar,
} from '../../api.js';
import { t } from '../../i18n.js';
import { FileAdapter } from '../../platform/index.js';
import {
  store, toast,
} from '../../store.js';
import { AvatarEditor } from '../../views/avatar-editor.js';
import {
  askRemoveMember, askSetRole, askTransferOwner, bannerStyle, dotClass, fmtLastSeen, joinedLine, mdToHtml, openGroupProfile, openMediaViewer, openProfile, presetLabel, profileQuote, statusOf, toastErr,
} from '../../views/helpers.js';
import {
  chatInfoMenu, copyText, openCtx, pickGroupPhoto, saveCropState,
} from '../../views/ui-actions.js';
import Vue from '../../vue.js';
import { BioText } from './BioText.js';

export const ChatInfoPanel = {
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
      chatInfoMenu(e, chat.value, peer.value);
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
      if (ge && ge.src) FileAdapter.revokeObjectURL(ge.src);
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