/* platform/nativescript/storage.js — capa de almacenamiento para NativeScript.
   Usa ApplicationSettings de @nativescript/core (key-value persistente).
   Interfaz idéntica a platform/storage.js.

   OJO: en NativeScript 9 `ApplicationSettings` ya no es un objeto con
   métodos: son funciones sueltas (getString, setString, remove…). */

import {
  getString, setString, remove, clear, hasKey,
} from '@nativescript/core/application-settings';

export const StorageAdapter = {
  getItem(key) {
    try { return getString(key, null); } catch (e) { return null; }
  },
  setItem(key, value) {
    try { setString(key, String(value)); return true; } catch (e) { return false; }
  },
  removeItem(key) {
    try { remove(key); return true; } catch (e) { return false; }
  },
  clear() {
    try { clear(); return true; } catch (e) { return false; }
  },
  hasItem(key) {
    try { return hasKey(key); } catch (e) { return this.getItem(key) !== null; }
  },
};
