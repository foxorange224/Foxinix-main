/* platform/nativescript/media.js — capa de medios para NativeScript.
   NS no tiene MediaRecorder ni getUserMedia en el núcleo. La grabación
   necesita un plugin (@nativescript-community/audiorecorder o similar);
   mientras no esté, la app avisa al usuario en vez de romperse.
   Interfaz idéntica a platform/media.js. */

import { ApplicationSettings } from '@nativescript/core/application-settings';

export const MediaAdapter = {
  canRecordAudio() {
    /* Si hay un plugin de grabación registrado, se puede. */
    try {
      return !!ApplicationSettings.getString('fox_recorder_available', 'false') === true
        || ApplicationSettings.getString('fox_recorder_available', 'false') === 'true';
    } catch (e) { return false; }
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
