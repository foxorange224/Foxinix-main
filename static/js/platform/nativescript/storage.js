/* platform/nativescript/storage.js — capa de almacenamiento para NativeScript.
   Usa ApplicationSettings de @nativescript/core (key-value persistente).
   Interfaz idéntica a platform/storage.js. */

import { ApplicationSettings } from '@nativescript/core/application-settings';

export const StorageAdapter = {
  getItem(key) {
    try { return ApplicationSettings.getString(key, null); } catch (e) { return null; }
  },
  setItem(key, value) {
    try { ApplicationSettings.setString(key, String(value)); return true; } catch (e) { return false; }
  },
  removeItem(key) {
    try { ApplicationSettings.remove(key); return true; } catch (e) { return false; }
  },
  clear() {
    try { ApplicationSettings.clear(); return true; } catch (e) { return false; }
  },
  hasItem(key) {
    return this.getItem(key) !== null;
  },
};
