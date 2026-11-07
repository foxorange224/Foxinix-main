/* SpamBox — aviso anti-spam de mensajes (pantalla completa, solo se cierra con el botón).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';

export const SpamBox = {
  setup: function () {
    const now = Vue.ref(Date.now());
    let timer = 0;
    Vue.onMounted(function () {
      timer = setInterval(function () { now.value = Date.now(); }, 500);
    });
    Vue.onUnmounted(function () { clearInterval(timer); });
    const left = Vue.computed(function () {
      return Math.max(0, Math.ceil((store.spamUntil - now.value) / 1000));
    });
    const close = function () { store.spamUntil = 0; };
    return { left, close, t };
  },
  template:
    '<div class="spam-veil" role="alertdialog" ' +
      ':aria-label="t(\'¡OYE! Estás haciendo SPAM!\')">' +
      '<div class="spam-box">' +
        '<svg class="ic spam-ic"><use href="#i-alert"></use></svg>' +
        '<h2 class="spam-title">{{ t(\'¡OYE! Estás haciendo SPAM!\') }}</h2>' +
        '<p class="spam-text">' +
          '{{ t(\'Si sigues así pueden bloquearte la cuenta por 5 minutos; ' +
          'si sigues otra vez, el tiempo aumentará, pero disminuirá poco a poco ' +
          'si dejas de hacer spam por un tiempo.\') }}</p>' +
        '<button class="btn spam-ok" type="button" :disabled="left > 0" @click="close">' +
          '{{ left > 0 ? t(\'Ok, perdón ({n}s)\', { n: left }) : t(\'Ok, perdón\') }}' +
        '</button>' +
      '</div>' +
    '</div>',
};
