/* GroupProfileModal — extraído de views/chat.js (Fase 3.1). */
import { mediaUrl } from '../../actions.js';
import { t } from '../../i18n.js';
import { store } from '../../store.js';
import { openMediaViewer } from '../../views/helpers.js';
import { chatInfoMenu } from '../../views/ui-actions.js';
import { BioText } from './BioText.js';

export const GroupProfileModal = {
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
    /* W27: el ⋮ del modal abre el mismo menú de administración que el
       panel de info del chat (antes no tenía acceso a esa función y el
       botón fallaba al pulsarlo). */
    const infoMenu = function (e) {
      const c = store.groupProfile && store.groupProfile.chat;
      chatInfoMenu(e, c, c && c.title);
    };
    return { store, close, isGroup, memberLine, infoMenu,
             mediaUrl, viewMedia: openMediaViewer };
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