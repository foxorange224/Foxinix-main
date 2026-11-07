/* JoinGroupModal — unirse a un grupo por enlace (/app/group/<id de 12 dígitos>).
   Muestra la ficha pública y pide confirmación.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store, syncUrl } from '../../store.js';
import { joinGroupByPub } from '../../actions.js';
import { t } from '../../i18n.js';

export const JoinGroupModal = {
  setup: function () {
    const close = function () {
      if (store.joinPrompt && store.joinPrompt.joining) return;
      store.joinPrompt = null;
      syncUrl();
    };
    const join = function () { joinGroupByPub(); };
    return { store, close, join, t };
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
