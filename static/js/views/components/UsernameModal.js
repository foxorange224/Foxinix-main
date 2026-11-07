/* UsernameModal — cambio de @usuario con contraseña y espera de 12 h (W60).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store, toast } from '../../store.js';
import { api, session, saveSession } from '../../api.js';
import { t } from '../../i18n.js';

export const UsernameModal = {
  setup: function () {
    const UNAME_WAIT = 12 * 60 * 60;
    const name = Vue.ref((store.user && store.user.username) || '');
    const pw = Vue.ref('');
    const err = Vue.ref('');
    const busy = Vue.ref(false);
    const nameEl = Vue.ref(null);
    const clock = Vue.ref(Date.now());
    let timer = null;

    const changedAt = Vue.computed(function () {
      return Number(store.user && store.user.username_changed_at) || 0;
    });
    const locked = Vue.computed(function () {
      return clock.value < changedAt.value * 1000 + UNAME_WAIT * 1000;
    });
    const lockText = Vue.computed(function () {
      const secs = Math.max(0,
        changedAt.value + UNAME_WAIT - Math.floor(clock.value / 1000));
      let h = Math.floor(secs / 3600);
      let m = Math.ceil((secs % 3600) / 60);
      if (m >= 60) { h += 1; m = 0; }
      return t('Podrás cambiarlo en {h} h {m} min.', { h: h, m: m });
    });
    const canSave = Vue.computed(function () {
      return !locked.value && !!name.value.trim() && !!pw.value;
    });

    const close = function () {
      if (busy.value) return;
      store.unameOpen = false;
      pw.value = '';
      err.value = '';
    };

    const submit = async function () {
      if (locked.value) return;
      err.value = '';
      const val = String(name.value || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.]{2,19}$/.test(val)) {
        err.value = t('Usuario: 3-20 caracteres, letras/números/punto/guion bajo, empieza alfanumérico');
        return;
      }
      if (store.user && val === store.user.username) {
        err.value = t('Ese ya es tu usuario actual');
        return;
      }
      if (!pw.value) {
        err.value = t('Escribe tu contraseña actual');
        return;
      }
      busy.value = true;
      try {
        const r = await api('PUT', '/auth/username',
          { username: val, password: pw.value }, { retry401: true });
        if (r.user) {
          store.user = Object.assign({}, store.user, r.user);
          session.user = store.user;
          saveSession();
        }
        store.unameOpen = false;
        pw.value = '';
        toast(t('Usuario actualizado') + ': @' + val, 'ok');
      } catch (e) {
        err.value = (e && t(e.detail)) || t('No se pudo cambiar el usuario');
      } finally {
        busy.value = false;
      }
    };

    Vue.onMounted(function () {
      timer = setInterval(function () { clock.value = Date.now(); }, 30000);
      Vue.nextTick(function () {
        if (!locked.value && nameEl.value) nameEl.value.focus();
      });
    });
    Vue.onUnmounted(function () {
      if (timer) clearInterval(timer);
    });

    return {
      store, t, name, pw, err, busy, nameEl, locked, lockText, canSave,
      close, submit,
    };
  },
  template: `
    <div class="modal-veil" @click.self="close">
      <div class="modal confirm uname-modal" role="dialog" aria-modal="true"
        :aria-label="t('Cambiar nombre de usuario')">
        <header>
          <span>{{ t('Cambiar nombre de usuario') }}</span>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="cf-body">
          <p class="cf-text">{{ t('Tu @usuario sirve para iniciar sesión y para que te mencionen. Se puede cambiar una vez cada 12 horas.') }}</p>

          <div class="uname-current uname-current-lg">
            <span class="uname-at">@</span>
            <b>{{ store.user && store.user.username }}</b>
          </div>

          <div class="uname-wait" v-if="locked">
            <svg class="ic ic-sm"><use href="#i-clock"></use></svg>
            <span>{{ lockText }}</span>
          </div>

          <template v-if="!locked">
            <div class="uname-warn">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg>
              <span>{{ t('Solo puedes cambiarlo una vez cada 12 horas. Las menciones con @ a tu usuario anterior dejarán de funcionar.') }}</span>
            </div>
            <div class="field">
              <label>{{ t('Nuevo usuario') }}</label>
              <input class="input" ref="nameEl" v-model.trim="name" maxlength="20"
                autocomplete="username" spellcheck="false"
                :placeholder="t('3-20 caracteres, empieza con letra o número')">
              <p class="st-hint">{{ t('Minúsculas, números, punto y guion bajo; empieza con letra o número.') }}</p>
            </div>
            <div class="field">
              <label>{{ t('Contraseña actual') }}</label>
              <input class="input" type="password" v-model="pw"
                autocomplete="current-password" :placeholder="t('Para confirmar el cambio')"
                @keydown.enter.prevent="submit">
            </div>
            <div class="form-err st-err" v-if="err" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg>
              <span>{{ err }}</span>
            </div>
          </template>
        </div>
        <div class="m-foot st-btns">
          <button class="btn btn-ghost" type="button" :disabled="busy" @click="close">
            {{ t('Cancelar') }}</button>
          <button class="btn" type="button" v-if="!locked" :disabled="busy || !canSave"
            @click="submit">
            {{ busy ? t('Cambiando…') : t('Cambiar usuario') }}</button>
        </div>
      </div>
    </div>`,
};
