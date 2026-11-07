/* RenameGroupModal — renombrar un grupo (W57).
   Extraído de views/chat.js (Fase 3.1). */
import { loadChats } from '../../actions.js';
import { api } from '../../api.js';
import { t } from '../../i18n.js';
import { store, toast } from '../../store.js';
import Vue from '../../vue.js';

export const RenameGroupModal = {
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
