/* ReadsBox — "Visto por": lista de miembros que ya leyeron un mensaje mío en un grupo.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { mediaUrl } from '../../actions.js';
import { t } from '../../i18n.js';

export const ReadsBox = {
  setup: function () {
    const close = function () { store.readsBox = null; };
    return { store, close, mediaUrl, t };
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
