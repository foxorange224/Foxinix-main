/* platform/nativescript/media.js — capa de medios para NativeScript.
   NS no tiene MediaRecorder ni getUserMedia en el núcleo.

   W104: las notas de voz YA NO pasan por este adaptador. En la app
   nativa la grabación vive en app/voice.ts (el plugin
   @nativescript-community/audio: TNSRecorder/TNSPlayer), que es
   código de la app y no del núcleo: el núcleo no conoce plugins ni
   archivos de sonido, sólo manda el archivo ya grabado con sendMedia().
   Este adaptador queda para lo que el núcleo comparte con la web
   (llamadas y pantalla compartida: no soportados en NS).
   Interfaz idéntica a platform/media.js. */

export const MediaAdapter = {
  canRecordAudio() {
    /* La grabación de la app nativa no pasa por aquí (ver voice.ts). */
    return false;
  },
  canUseMedia() { return false; },
  isSecure() { return true; },
  getMicrophone() {
    return Promise.reject(new Error('unsupported'));
  },
  getUserMedia() {
    return Promise.reject(new Error('unsupported'));
  },
  getMediaDevices() { return null; },
  getPeerConnectionCtor() { return null; },
  getMediaStreamCtor() { return null; },
  canCall() { return false; },
  pickAudioMimeType() { return ''; },
  createRecorder() { return null; },
  createAudioContext() { return null; },
  canShareScreen() { return false; },
  getDisplayMedia() { return Promise.reject(new Error('unsupported')); },
  listDevices() { return Promise.resolve([]); },
  listAudioInputs() { return Promise.resolve([]); },
};
