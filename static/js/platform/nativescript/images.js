/* platform/nativescript/images.js — capa de imágenes para NativeScript.
   Sin canvas: NS no puede reducir una imagen en el hilo principal sin un
   plugin. Se devuelve la URL original (la vista la muestra tal cual) y
   el difuminado queda para cuando haya plugin de imagen.

   Para el TAMAÑO de una imagen se usa ImageSource.fromUrl (NS 8.7+):
   descarga la imagen y devuelve sus dimensiones reales.

   Interfaz idéntica a platform/images.js. */

import { ImageSource } from '@nativescript/core/image-source';

export const ImageAdapter = {
  /* Precarga: en NS basta con resolver la ImageSource. */
  preload(url) {
    if (!url) return Promise.resolve(null);
    try {
      return ImageSource.fromUrl(String(url)).then(
        (src) => src || null,
        () => null
      );
    } catch (e) {
      return Promise.resolve(null);
    }
  },

  /* Tamaño natural: {width, height}. 0×0 si no se pudo cargar. */
  probeSize(url) {
    if (!url) return Promise.resolve({ width: 0, height: 0 });
    try {
      return ImageSource.fromUrl(String(url)).then(
        (src) => ({
          width: (src && src.width) || 0,
          height: (src && src.height) || 0,
        }),
        () => ({ width: 0, height: 0 })
      );
    } catch (e) {
      return Promise.resolve({ width: 0, height: 0 });
    }
  },

  makeSmallDataUrl(url, position) {
    /* Sin procesamiento de imagen en NS: se devuelve la URL tal cual.
       El CSS/NS la escala al tamaño del banner. */
    return Promise.resolve(url || '');
  },
};
