/* ArchiveLockModal — desbloqueo de la sección Archivados con contraseña.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store, checkArchiveLock } from '../../store.js';
import { t } from '../../i18n.js';

export const ArchiveLockModal = {
  setup: function () {
    const pw = Vue.ref('');
    const show = Vue.ref(false);
    const busy = Vue.ref(false);
    const inputEl = Vue.ref(null);
    const err = Vue.computed(function () { return store.archiveLockErr; });
    const close = function () {
      store.archiveLockPrompt = false;
      store.showArchived = false;
      store.archiveLockErr = '';
      pw.value = '';
      show.value = false;
    };
    const unlock = async function () {
      if (busy.value) return;
      if (!pw.value) { store.archiveLockErr = t('Escribe la contraseña'); return; }
      busy.value = true;
      store.archiveLockErr = '';
      try {
        const ok = await checkArchiveLock(pw.value);
        if (!ok) {
          store.archiveLockErr = t('Contraseña incorrecta');
          pw.value = '';
          if (inputEl.value) inputEl.value.focus();
          return;
        }
        store.archiveUnlocked = true;
        store.archiveLockPrompt = false;
        store.showArchived = true;
        store.archiveLockErr = '';
        pw.value = '';
      } catch (e) {
        store.archiveLockErr = t('No se pudo comprobar la contraseña');
      } finally {
        busy.value = false;
      }
    };
    Vue.onMounted(function () {
      setTimeout(function () { if (inputEl.value) inputEl.value.focus(); }, 80);
    });
    return { store, pw, show, busy, inputEl, err, close, unlock, t };
  },
  template: `
    <div class="archive-lock-veil" role="dialog" aria-modal="true" :aria-label="t('Archivados bloqueados')"
      @click.self="close">
      <div class="al-top">
        <svg class="mobile-page-logo" aria-hidden="true"><use href="#i-logo-mark"></use></svg>
        <b>{{ t('Archivados') }}</b>
      </div>
      <div class="archive-lock-card">
        <div class="al-ic"><svg class="ic"><use href="#i-lock"></use></svg></div>
        <h2>{{ t('Archivados bloqueados') }}</h2>
        <p>{{ t('La sección de archivados está bloqueada, por favor ingresa la contraseña.') }}</p>
        <div class="al-field">
          <input ref="inputEl" class="input" :type="show ? 'text' : 'password'"
            v-model="pw" autocomplete="current-password" :placeholder="t('Contraseña')"
            @keydown.enter.prevent="unlock">
          <button class="al-eye" type="button" :title="show ? t('Ocultar') : t('Mostrar')"
            @click="show = !show">
            <svg class="ic ic-sm"><use :href="show ? '#i-eye-off' : '#i-eye'"></use></svg>
          </button>
        </div>
        <div class="form-err st-err" v-if="err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <button class="btn btn-full al-unlock" type="button" :disabled="busy || !pw" @click="unlock">
          {{ busy ? t('Comprobando…') : t('Desbloquear') }}
        </button>
        <button class="al-back" type="button" @click="close">{{ t('Volver a Chats') }}</button>
      </div>
    </div>`,
};
