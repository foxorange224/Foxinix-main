/* MeProfileModal — extraído de views/chat.js (Fase 3.1). */
import { mediaUrl } from '../../actions.js';
import {
  api, saveSession, session,
} from '../../api.js';
import { t } from '../../i18n.js';
import {
  store, toast,
} from '../../store.js';
import {
  STATUS_PRESETS, bannerStyle, dotClass, joinedLine, mdToHtml, openMediaViewer, statusOf,
} from '../../views/helpers.js';
import { copyText } from '../../views/ui-actions.js';
import Vue from '../../vue.js';
import { BioText } from './BioText.js';

export const MeProfileModal = {
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