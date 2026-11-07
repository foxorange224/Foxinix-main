/* platform/storage.js — capa de almacenamiento de clave-valor de Foxinix.
   Implementación web: localStorage. En NativeScript se reemplaza por
   Preferences/SQLite sin tocar el resto de la app. */

export const StorageAdapter = {
  getItem(key) {
    try { return localStorage.getItem(key) || null; } catch (e) { return null; }
  },
  setItem(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  removeItem(key) {
    try { localStorage.removeItem(key); return true; } catch (e) { return false; }
  },
  clear() {
    try { localStorage.clear(); return true; } catch (e) { return false; }
  },
  hasItem(key) {
    return this.getItem(key) !== null;
  },
};
