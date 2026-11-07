/* ProfilePanel — extraído de views/chat.js (Fase 3.1). */
import {
  acceptFriendRequest, createDm, loadPeople, mediaUrl, sendFriendRequest,
} from '../../actions.js';
import { t } from '../../i18n.js';
import {
  store, toast,
} from '../../store.js';
import {
  bannerStyle, dotClass, joinedLine, mdToHtml, openMediaViewer, profileQuote, statusOf, toastErr,
} from '../../views/helpers.js';
import {
  copyText, personMenu,
} from '../../views/ui-actions.js';
import Vue from '../../vue.js';
import { BioText } from './BioText.js';

export const ProfilePanel = {
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