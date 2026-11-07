/* platform/images.js — capa de imágenes de Foxinix.
   Web: canvas (redimensiona + difumina una portada).
   NativeScript: usa @nativescript/core/image-source; si no puede, devuelve
   '' y la vista usa la imagen original sin difuminar.

   Interfaz idéntica en web y NS. */

import { DomAdapter } from './dom.js';

export const ImageAdapter = {
  /* Devuelve una data-URL con la imagen reducida a 48×27 (el CSS la
     escala y le aplica el blur). Si algo falla, devuelve ''. */
  makeSmallDataUrl(url, position) {
    if (!url || typeof Image === 'undefined') return Promise.resolve('');
    const pos = Math.max(0, Math.min(100, Number(position) || 50));
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (v) {
        if (done) return;
        done = true;
        resolve(v);
      };
      const img = new Image();
      img.onload = function () {
        try {
          const c = DomAdapter.createElement('canvas');
          if (!c || !c.getContext) { finish(''); return; }
          c.width = 48;
          c.height = 27;
          const ctx = c.getContext('2d');
          const sw = img.naturalWidth || img.width || 1;
          const sh = img.naturalHeight || img.height || 1;
          const scale = Math.max(48 / sw, 27 / sh);
          const dw = sw * scale;
          const dh = sh * scale;
          ctx.drawImage(img, (48 - dw) / 2, (27 - dh) * (pos / 100), dw, dh);
          finish(c.toDataURL('image/jpeg', 0.55));
        } catch (e) {
          finish('');
        }
      };
      img.onerror = function () { finish(''); };
      img.src = url;
    });
  },
};
