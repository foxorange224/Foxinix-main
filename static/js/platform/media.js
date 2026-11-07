/* platform/media.js — capa de medios de Foxinix.
   Web: AudioContext, MediaRecorder y getUserMedia.
   NativeScript: delega en plugins nativos (@nativescript/core tiene
   audio; la grabación necesita un plugin). Si no hay soporte, las
   funciones lo dicen con claridad y la app avisa al usuario.

   Interfaz idéntica en web y NS. */

export const MediaAdapter = {
  /* ¿Se puede grabar audio en este dispositivo? */
  canRecordAudio() {
    if (typeof navigator === 'undefined') return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    if (typeof window === 'undefined' || !window.MediaRecorder) return false;
    return true;
  },
  /* ¿Se puede usar la cámara/micrófono (getUserMedia)? */
  canUseMedia() {
    if (typeof navigator === 'undefined') return false;
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },
  /* ¿El contexto es seguro? (getUserMedia lo exige). */
  isSecure() {
    if (typeof window === 'undefined') return true;
    return window.isSecureContext !== false;
  },
  /* Pide permiso y devuelve el stream de micrófono.
     `constraints` permite elegir el dispositivo (deviceId exacto). */
  getMicrophone(constraints) {
    return this.getUserMedia(constraints || { audio: true });
  },
  /* Pide permiso y devuelve un stream (audio, video o ambos). */
  getUserMedia(constraints) {
    if (!this.canRecordAudio()) {
      return Promise.reject(new Error('unsupported'));
    }
    const opts = constraints || { audio: true };
    return navigator.mediaDevices.getUserMedia(opts);
  },
  /* El objeto mediaDevices del navegador (para casos raros). */
  getMediaDevices() {
    if (typeof navigator === 'undefined') return null;
    return navigator.mediaDevices || null;
  },
  /* Constructor de RTCPeerConnection (WebRTC). */
  getPeerConnectionCtor() {
    if (typeof window === 'undefined') return null;
    return window.RTCPeerConnection || window.webkitRTCPeerConnection || null;
  },
  /* Constructor de MediaStream (WebRTC). */
  getMediaStreamCtor() {
    if (typeof window === 'undefined') return null;
    return window.MediaStream || window.webkitMediaStream || null;
  },
  /* ¿Se pueden hacer llamadas de voz/video aquí? */
  canCall() {
    if (typeof navigator === 'undefined') return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    return !!this.getPeerConnectionCtor();
  },
  /* Primer formato de audio que soporte el grabador. */
  pickAudioMimeType(candidates) {
    if (typeof window === 'undefined' || !window.MediaRecorder) return '';
    const list = candidates || [];
    try {
      if (window.MediaRecorder.isTypeSupported) {
        for (let i = 0; i < list.length; i++) {
          if (window.MediaRecorder.isTypeSupported(list[i])) return list[i];
        }
      }
    } catch (e) {}
    return '';
  },
  /* Crea el grabador con el formato elegido (o el del navegador). */
  createRecorder(stream, mimeType) {
    if (typeof window === 'undefined' || !window.MediaRecorder) return null;
    try {
      if (mimeType) return new window.MediaRecorder(stream, { mimeType: mimeType });
      return new window.MediaRecorder(stream);
    } catch (e) { return null; }
  },
  /* Crea un AudioContext (para medir la duración de una nota de voz). */
  createAudioContext() {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { return new AC(); } catch (e) { return null; }
  },
  /* ¿Se puede compartir la pantalla? */
  canShareScreen() {
    if (typeof navigator === 'undefined') return false;
    try {
      return !!(navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === 'function');
    } catch (e) { return false; }
  },
  /* Comparte la pantalla (necesita permiso del navegador). */
  getDisplayMedia() {
    if (!this.canShareScreen()) {
      return Promise.reject(new Error('unsupported'));
    }
    return navigator.mediaDevices.getDisplayMedia({ video: true });
  },
  /* Lista de dispositivos (micrófonos, cámaras, altavoces). */
  listDevices(kind) {
    if (typeof navigator === 'undefined') return Promise.resolve([]);
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return Promise.resolve([]);
    }
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      if (!kind) return list;
      return list.filter(function (d) { return d.kind === kind; });
    }).catch(function () { return []; });
  },
  /* Micrófonos disponibles. */
  listAudioInputs() {
    return this.listDevices('audioinput');
  },
};
