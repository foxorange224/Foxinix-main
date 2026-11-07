/* CtxMenu — menú contextual (⋮ / clic derecho) de los mensajes y las
   listas. Flotante en escritorio (fixed) y bottom sheet en táctil.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';

export const CtxMenu = {
  setup: function () {
    const runCtx = function (it) {
      store.ctx = null;
      if (it && it.fn) it.fn();
    };
    return { store, runCtx, t };
  },
  template:
    /* W7: menú contextual (fixed; la posición sale del evento.
       W17: con ancla a la burbuja no tapa el mensaje.
       W37b: cada ítem puede traer su icono (it.icon → #symbol).
       W37b: en móvil el MISMO menú es un bottom sheet abajo. */
    '<div class="ctx-backdrop" v-if="store.ctx && store.ctx.sheet" ' +
      '@click.stop="store.ctx = null"></div>' +
    '<div class="ctx-menu" :class="{ \'ctx-sheet\': store.ctx.sheet }" ' +
      'v-if="store.ctx" @click.stop ' +
      ':style="store.ctx.sheet ? {} : ' +
        '{ left: store.ctx.x + \'px\', top: store.ctx.y + \'px\' }">' +
      '<div class="ctx-head" v-if="store.ctx.sheet && store.ctx.head">' +
        '<span class="avatar av36" :class="{ \'has-photo\': !!store.ctx.head.avatar }">' +
          '<img v-if="store.ctx.head.avatar" :src="store.ctx.head.avatar" alt="">' +
          '<span v-else>{{ store.ctx.head.ini }}</span>' +
        '</span>' +
        '<span class="ctx-head-col">' +
          '<b>{{ store.ctx.head.name }}</b>' +
          '<small v-if="store.ctx.head.sub">{{ store.ctx.head.sub }}</small>' +
        '</span>' +
      '</div>' +
      '<button class="ctx-item" :class="{ danger: it.danger }" type="button" ' +
        'v-for="(it, i) in store.ctx.items" :key="i" @click="runCtx(it)">' +
        '<svg class="ic ic-sm ctx-ic" v-if="it.icon"><use :href="\'#\' + it.icon"></use></svg>' +
        '<span class="ctx-label">{{ t(it.label) }}</span>' +
        '<span class="ctx-sep" v-if="it.pill">-</span>' +
        '<span class="ctx-pill" v-if="it.pill">' +
          '<svg class="ic ic-sm" v-if="it.pill.icon"><use :href="\'#\' + it.pill.icon"></use></svg>' +
          '<b>{{ it.pill.text }}</b></span></button>' +
    '</div>',
};
