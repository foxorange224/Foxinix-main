/* ConfirmBox — modal de confirmación con campos opcionales (usuario/contraseña).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';

export const ConfirmBox = {
  setup: function () {
    const uname = Vue.ref('');
    const pw = Vue.ref('');

    const okDisabled = Vue.computed(function () {
      const b = store.confirmBox;
      if (!b || b.busy) return true;
      if (b.requireUser) {
        const me = store.user ? store.user.username : '';
        if (uname.value.trim().toLowerCase() !== me) return true;
      }
      if (b.requirePassword && !pw.value) return true;
      return false;
    });

    const cancel = function () {
      if (store.confirmBox && !store.confirmBox.busy) store.confirmBox = null;
    };

    const confirm = async function () {
      const b = store.confirmBox;
      if (!b || okDisabled.value) return;
      b.busy = true;
      b.error = '';
      try {
        await b.onOk({ username: uname.value.trim(), password: pw.value });
      } catch (e) {
        if (store.confirmBox === b) {
          b.busy = false;
          b.error = (e && t(e.detail)) || t('No se pudo completar la acción');
        }
        return;
      }
      if (store.confirmBox === b) store.confirmBox = null;
    };

    return { store, uname, pw, okDisabled, cancel, confirm };
  },
  template: `
    <div class="modal-veil" @click.self="cancel">
      <div class="modal confirm" role="alertdialog" :aria-label="t(store.confirmBox.title)">
        <header>{{ t(store.confirmBox.title) }}</header>
        <div class="cf-body">
          <p class="cf-text">{{ t(store.confirmBox.text) }}</p>
          <div class="field" v-if="store.confirmBox.requireUser">
            <label>{{ t('Escribe tu usuario para confirmar') }}</label>
            <input class="input" v-model.trim="uname"
              :placeholder="'@' + (store.user ? store.user.username : '')" autocomplete="off">
          </div>
          <div class="field" v-if="store.confirmBox.requirePassword">
            <label>{{ t('Contraseña') }}</label>
            <input class="input" type="password" v-model="pw" autocomplete="current-password">
          </div>
          <div class="form-err st-err" v-if="store.confirmBox.error" role="alert">
            <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(store.confirmBox.error) }}</span>
          </div>
        </div>
        <div class="m-foot st-btns">
          <button class="btn btn-ghost" type="button" :disabled="store.confirmBox.busy" @click="cancel">
            {{ t('Cancelar') }}</button>
          <button class="btn" :class="{ 'btn-danger': store.confirmBox.danger }" type="button"
            :disabled="okDisabled" @click="confirm">
            {{ store.confirmBox.busy ? t('Un momento…') : t(store.confirmBox.okLabel || 'Confirmar') }}</button>
        </div>
      </div>
    </div>`,
};
