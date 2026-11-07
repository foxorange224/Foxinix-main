/* platform/nativescript/images.js — capa de imágenes para NativeScript.
   Sin canvas: NS no puede reducir una imagen en el hilo principal sin un
   plugin. Se devuelve la URL original (la vista la muestra tal cual) y
   el difuminado queda para cuando haya plugin de imagen.
   Interfaz idéntica a platform/images.js. */

export const ImageAdapter = {
  makeSmallDataUrl(url, position) {
    /* Sin procesamiento de imagen en NS: se devuelve la URL tal cual.
       El CSS/NS la escala al tamaño del banner. */
    return Promise.resolve(url || '');
  },
};
