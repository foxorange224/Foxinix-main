/* WallPanel — panel de fondo del chat (W20): foto de fondo, opacidad y
   difuminado. Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store, setWallImg, setWallDim, setWallBlur } from '../../store.js';
import { toast } from '../../store.js';
import { t } from '../../i18n.js';
import { shrinkWall } from '../../platform/files.js';

export const WallPanel = {
  setup: function () {
    const wallEl = Vue.ref(null);
    const pickWallImg = function () { if (wallEl.value) wallEl.value.click(); };
    const clearWallImg = function () { setWallImg(''); };
    const onWallFile = function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      shrinkWall(f, function (url, err) {
        if (err) { toast(err, 'err'); return; }
        setWallImg(url);
        toast('Foto de fondo aplicada');
      });
    };
    const dim = Vue.computed({
      get: function () { return store.wdim; },
      set: function (v) { setWallDim(+v); },
    });
    const blur = Vue.computed({
      get: function () { return store.wblur; },
      set: function (v) { setWallBlur(+v); },
    });
    const close = function () { store.wallPanelOpen = false; };

    return {
      store, wallEl, pickWallImg, clearWallImg, onWallFile,
      dim, blur, close,
    };
  },
  template:
    '<aside class="wall-panel">' +
      '<header class="side-head">' +
        '<b>{{ t(\'Fondo del chat\') }}</b>' +
        '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="close">' +
          '<svg class="ic"><use href="#i-x"></use></svg>' +
        '</button>' +
      '</header>' +
      '<div class="wp-body">' +
        '<p class="wp-hint">{{ t(\'La vista previa se ve en el centro, con la conversación de ejemplo.\') }}</p>' +
        '<div class="wp-ctl">' +
          '<div class="ap-sec">{{ t(\'Foto de fondo\') }}</div>' +
          '<div class="wp-row">' +
            '<img v-if="store.wallimg" class="ap-wp-prev" :src="store.wallimg" alt="">' +
            '<button class="btn btn-ghost btn-sm" type="button" @click="pickWallImg">' +
              '{{ t(\'Elegir foto\') }}</button>' +
            '<button v-if="store.wallimg" class="btn btn-ghost btn-sm" type="button"' +
              ' @click="clearWallImg">{{ t(\'Quitar foto\') }}</button>' +
            '<input ref="wallEl" type="file" accept="image/*" class="ap-wall-input"' +
              ' @change="onWallFile">' +
          '</div>' +
        '</div>' +
        /* W27d: sin foto de fondo las opciones no están disponibles
           (opacidad y difuminado solo aplican a la imagen) */
        '<div class="wp-ctl" :class="{ off: !store.wallimg }">' +
          '<div class="ap-sec">{{ t(\'Opacidad del velo\') }}:' +
            ' <span class="wp-val">{{ dim }}%</span></div>' +
          '<input class="wp-range" type="range" min="0" max="100" step="5" v-model="dim"' +
            ' :disabled="!store.wallimg" :aria-label="t(\'Opacidad del velo\')">' +
        '</div>' +
        '<div class="wp-ctl" :class="{ off: !store.wallimg }">' +
          '<div class="ap-sec">{{ t(\'Difuminado\') }}:' +
            ' <span class="wp-val">{{ blur }} px</span></div>' +
          '<input class="wp-range" type="range" min="0" max="20" step="1" v-model="blur"' +
            ' :disabled="!store.wallimg" :aria-label="t(\'Difuminado\')">' +
        '</div>' +
      '</div>' +
    '</aside>',
};
