/* Lightbox — visor de imágenes con zoom (W8).
   El estado del visor vive en store.lb para que también se pueda abrir
   desde el modal "Archivos y medios" de la info del chat.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { DomAdapter } from '../../platform/dom.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';
import { startDownload } from '../../mediadl.js';

/* W59: el visor puede recibir solo la URL (modal de medios) o un objeto
   con la URL original para descargar a los datos de la app aunque la
   vista esté usando un blob en memoria. */
export function openLb(v) {
  if (v && typeof v === 'object') store.lb = v;
  else store.lb = { url: v, orig: v };
}

export function closeLb() {
  store.lb = null;
}

export const Lightbox = {
  setup: function () {
    /* W29l: el estado vive en el store para que el visor también se
       abra desde el modal "Archivos y medios" de la info. */
    const lb = Vue.computed(function () { return store.lb; });
    const lbScale = Vue.ref(1);
    const lbTx = Vue.ref(0);
    const lbTy = Vue.ref(0);
    const lbDragging = Vue.ref(false);
    let lbMoveOff = null;            // apaga el arrastre al cerrar

    const lbReset = function () {
      lbScale.value = 1;
      lbTx.value = 0;
      lbTy.value = 0;
    };
    const lbDl = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      const v = lb.value;
      if (!v) return;
      const orig = v.orig || v.url;
      startDownload(orig, v.name || 'imagen', null, v.mime || '', v.kind || 'image');
    };
    /* W29l: si el visor lo abre el modal de la info, el zoom parte en 1x.
       Al cerrarse (store.lb = null) se apaga el arrastre en curso. */
    Vue.watch(lb, function (v) {
      if (v) { lbReset(); return; }
      if (lbMoveOff) { lbMoveOff(); lbMoveOff = null; }
    });
    const lbStyle = Vue.computed(function () {
      return {
        transform: 'translate(' + lbTx.value + 'px,' + lbTy.value + 'px)' +
          ' scale(' + lbScale.value + ')',
        cursor: lbDragging.value ? 'grabbing' : (lbScale.value > 1 ? 'grab' : 'zoom-in'),
      };
    });
    let lbMoved = false;            // W22: hubo arrastre → el clic NO zoom
    /* W54c: al ampliar, la imagen puede recorrer la pantalla pero nunca
       se pierde fuera de ella. El visor queda entre los controles. */
    const lbClamp = function () {
      if (lbScale.value <= 1) { lbTx.value = 0; lbTy.value = 0; return; }
      const img = DomAdapter.querySelector('.lightbox .lb-img');
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const baseW = rect.width / lbScale.value;
      const baseH = rect.height / lbScale.value;
      const maxX = Math.max(0, (baseW * lbScale.value - DomAdapter.getInnerWidth()) / 2 + 10);
      const maxY = Math.max(0, (baseH * lbScale.value - DomAdapter.getInnerHeight()) / 2 + 10);
      lbTx.value = Math.max(-maxX, Math.min(maxX, lbTx.value));
      lbTy.value = Math.max(-maxY, Math.min(maxY, lbTy.value));
    };
    const lbZoom = function () {
      /* clic sobre la imagen: alterna ajustado ↔ ampliado (2.5x).
         W22: si el clic cierra un arrastre no alterna (antes soltar el
         drag hacía zoom-out sin querer). */
      if (lbMoved) { lbMoved = false; return; }
      if (lbScale.value > 1) lbReset();
      else { lbScale.value = 2.5; lbClamp(); }
    };
    const lbWheel = function (e) {
      /* rueda/trackpad: zoom continuo entre 1x y 5x */
      const d = e.deltaY < 0 ? 0.25 : -0.25;
      lbScale.value = Math.max(1, Math.min(5, lbScale.value + d));
      if (lbScale.value === 1) lbReset();
      else lbClamp();
    };
    const lbDown = function (e) {
      /* arrastrar para recorrer la imagen ampliada */
      if (lbScale.value <= 1) return;
      e.preventDefault();
      const px = e.clientX, py = e.clientY;   // W22: umbral de arrastre
      lbMoved = false;
      const sx = e.clientX - lbTx.value;
      const sy = e.clientY - lbTy.value;
      lbDragging.value = true;
      const move = function (ev) {
        if (Math.abs(ev.clientX - px) > 4 || Math.abs(ev.clientY - py) > 4) {
          lbMoved = true;
        }
        lbTx.value = ev.clientX - sx;
        lbTy.value = ev.clientY - sy;
        lbClamp();
      };
      const up = function () {
        lbDragging.value = false;
        DomAdapter.removeEventListener('mousemove', move);
        DomAdapter.removeEventListener('mouseup', up);
        lbMoveOff = null;
      };
      DomAdapter.addEventListener('mousemove', move);
      DomAdapter.addEventListener('mouseup', up);
      lbMoveOff = up;
    };

    /* W54c: en el teléfono se amplía con dos dedos y se arrastra con
       uno; así el visor funciona como una galería táctil. */
    let lbTouches = null;
    const lbTouchStart = function (e) {
      const t = e.touches;
      if (t.length === 2) {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        lbTouches = {
          mode: 'pinch',
          dist: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
          scale: lbScale.value,
          tx: lbTx.value, ty: lbTy.value,
          mx: (t[0].clientX + t[1].clientX) / 2,
          my: (t[0].clientY + t[1].clientY) / 2,
        };
      } else if (t.length === 1 && lbScale.value > 1) {
        lbTouches = {
          mode: 'pan',
          x: t[0].clientX, y: t[0].clientY,
          tx: lbTx.value, ty: lbTy.value,
        };
      } else {
        lbTouches = null;
      }
    };
    const lbTouchMove = function (e) {
      if (!lbTouches) return;
      const t = e.touches;
      if (lbTouches.mode === 'pinch' && t.length >= 2) {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const mx = (t[0].clientX + t[1].clientX) / 2;
        const my = (t[0].clientY + t[1].clientY) / 2;
        lbScale.value = Math.max(1, Math.min(5, lbTouches.scale * dist / lbTouches.dist));
        lbTx.value = lbTouches.tx + mx - lbTouches.mx;
        lbTy.value = lbTouches.ty + my - lbTouches.my;
        if (lbScale.value === 1) { lbTx.value = 0; lbTy.value = 0; }
        else lbClamp();
        lbMoved = true;
        if (e.cancelable) e.preventDefault();
      } else if (lbTouches.mode === 'pan' && t.length === 1) {
        lbTx.value = lbTouches.tx + t[0].clientX - lbTouches.x;
        lbTy.value = lbTouches.ty + t[0].clientY - lbTouches.y;
        lbClamp();
        lbMoved = true;
        if (e.cancelable) e.preventDefault();
      }
    };
    const lbTouchEnd = function (e) {
      const t = e.touches;
      if (!t.length) { lbTouches = null; return; }
      if (t.length === 1 && lbScale.value > 1) {
        lbTouches = {
          mode: 'pan',
          x: t[0].clientX, y: t[0].clientY,
          tx: lbTx.value, ty: lbTy.value,
        };
      } else {
        lbTouches = null;
      }
    };

    Vue.onUnmounted(function () {
      if (lbMoveOff) { lbMoveOff(); lbMoveOff = null; }
    });

    return {
      t, lb, lbScale, lbStyle, lbDl, closeLb, lbZoom, lbWheel, lbDown,
      lbTouchStart, lbTouchMove, lbTouchEnd, openLb,
    };
  },
  template:
    '<div class="lightbox" v-if="lb" :class="{ \'lb-zoomed\': lbScale > 1 }" @click.self="closeLb">' +
      '<button class="lb-btn lb-close" type="button" @click="closeLb">' +
        '<svg class="ic"><use href="#i-x"></use></svg>' +
      '</button>' +
      '<div class="lb-filename" v-if="lb.name">{{ lb.name }}</div>' +
      '<button class="lb-btn lb-download" type="button" @click="lbDl">' +
        '<svg class="ic ic-sm"><use href="#i-download"></use></svg>' +
      '</button>' +
      '<img class="lb-img" :src="lb.url" :style="lbStyle" ' +
        '@click="lbZoom" @wheel.prevent="lbWheel" @mousedown.prevent="lbDown" ' +
        '@touchstart="lbTouchStart" @touchmove.prevent="lbTouchMove" ' +
        '@touchend="lbTouchEnd" @touchcancel="lbTouchEnd">' +
      /* W22: la ayuda lleva su píldora de fondo y desaparece al
         hacer zoom (con la imagen ampliada solo estorba). */
      '<span class="lb-hint" v-if="lbScale <= 1"><span class="lb-pill">' +
        '{{ t(\'Click o rueda para ampliar · arrastra para mover\') }}</span></span>' +
    '</div>',
};
