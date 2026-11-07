/* WallPreview — vista previa a tamaño real del fondo (W21c). Ocupa el
   centro mientras el panel de fondo está abierto. Copia el layout de
   .chat-pane para que las mismas variables CSS se apliquen.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { t } from '../../i18n.js';

export const WallPreview = {
  setup: function () {
    /* Muestra del pedido: Carlos (derecha) y Javier (izquierda), con
       nombre en la primera de la ronda y hora en la última (W12). */
    const SAMPLE = [
      { mine: true, name: 'Carlos', time: '6:10 p.m.',
        texts: ['¡Hola!', '¿Qué tal tu día?'] },
      { mine: false, name: 'Javier', time: '6:11 p.m.',
        texts: ['¡Hola! Todo bien por aquí', 'Acomodando unas cosas', '¿Y tú qué tal?'] },
      { mine: true, name: 'Carlos', time: '6:11 p.m.',
        texts: ['Bien también, descansando un rato', 'Hablamos más tarde'] },
      { mine: false, name: 'Javier', time: '6:12 p.m.',
        texts: ['¡Dale, perfecto!', 'Un abrazo 👍'] },
    ];
    const rows = [];
    SAMPLE.forEach(function (g) {
      g.texts.forEach(function (tx, i) {
        rows.push({
          mine: g.mine,
          name: g.name,
          showName: i === 0,
          time: i === g.texts.length - 1 ? g.time : '',
          text: tx,
        });
      });
    });
    const bodyEl = Vue.ref(null);
    Vue.onMounted(function () {
      /* como un chat real: abierta al último mensaje */
      if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight;
    });
    return { rows, bodyEl };
  },
  template:
    '<main class="wall-preview">' +
      '<header class="chat-head wp-head">' +
        '<div class="ch-col">' +
          '<div class="ch-name">{{ t(\'Vista previa del fondo\') }}</div>' +
          '<div class="ch-status">{{ t(\'Así se verá tu conversación con el fondo.\') }}</div>' +
        '</div>' +
      '</header>' +
      '<div class="msgs wp-prev" ref="bodyEl">' +
        '<div class="msg" :class="{ mine: r.mine }" v-for="(r, i) in rows" :key="i">' +
          '<div class="bubble">' +
            '<div class="b-sender wp-name" v-if="r.showName">{{ r.name }}</div>' +
            '<div class="b-text">{{ t(r.text) }}</div>' +
            '<div class="b-meta" v-if="r.time"><span class="b-time">{{ t(r.time) }}</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</main>',
};
