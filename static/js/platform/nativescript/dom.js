/* platform/nativescript/dom.js — capa de abstracción del "DOM" para NativeScript.
   NativeScript no tiene DOM: las vistas son XML nativo, no HTML. Este módulo
   expone las operaciones que el código web usa del DOM, mapeadas a APIs de NS
   donde sea posible, o marcando como "no disponible" lo que no aplica.
   Interfaz idéntica a platform/dom.js. */

import { ApplicationSettings } from '@nativescript/core/application-settings';
import { device } from '@nativescript/core/platform';

export const DomAdapter = {
  /* storage (delegado a StorageAdapter para consistencia) */
  getItem(key) { return ApplicationSettings.getString(key, null); },
  setItem(key, value) { try { ApplicationSettings.setString(key, String(value)); return true; } catch (e) { return false; } },
  removeItem(key) { try { ApplicationSettings.remove(key); return true; } catch (e) { return false; } },

  /* document — NS no tiene document. Estas operaciones son no-ops o devuelven null. */
  getDocumentElement() { return null; },
  createElement() { return null; },
  querySelector() { return null; },
  addEventListener() {},
  removeEventListener() {},
  bodyAppendChild() {},
  bodyRemoveChild() {},

  /* window */
  getWindow() { return null; },
  addWindowEventListener() {},
  removeWindowEventListener() {},
  getInnerWidth() {
    try { return device.screenWidth || 0; } catch (e) { return 0; }
  },
  getHidden() { return false; }, /* NS no tiene pestañas ocultas del navegador */
  getVisibilityState() { return 'visible'; },
  getNavigator() { return null; },
  getUserAgent() { return ''; },
  getOnline() {
    try {
      const connectivity = require('@nativescript/core/connectivity');
      return connectivity.getConnectionType() !== connectivity.connectionType.none;
    } catch (e) { return true; }
  },

  /* theme / acento — NS usa recursos de tema nativos, no CSS vars en :root.
     Estas operaciones guardan los valores en ApplicationSettings para que
     las vistas NS los lean y apliquen. */
  setRootStyle(prop, value) {
    try { ApplicationSettings.setString('fox_css_' + prop, String(value)); } catch (e) {}
  },
  removeRootStyle(prop) {
    try { ApplicationSettings.remove('fox_css_' + prop); } catch (e) {}
  },
  setRootAttribute(name, value) {
    try { ApplicationSettings.setString('fox_attr_' + name, String(value)); } catch (e) {}
  },
  removeRootAttribute(name) {
    try { ApplicationSettings.remove('fox_attr_' + name); } catch (e) {}
  },
  getRootAttribute(name) {
    try { return ApplicationSettings.getString('fox_attr_' + name, null); } catch (e) { return null; }
  },
  addRootClass(cls) {
    try {
      const classes = ApplicationSettings.getString('fox_root_classes', '');
      const arr = classes ? classes.split(',') : [];
      if (!arr.includes(cls)) { arr.push(cls); ApplicationSettings.setString('fox_root_classes', arr.join(',')); }
    } catch (e) {}
  },
  removeRootClass(cls) {
    try {
      const classes = ApplicationSettings.getString('fox_root_classes', '');
      const arr = classes ? classes.split(',') : [];
      const idx = arr.indexOf(cls);
      if (idx >= 0) { arr.splice(idx, 1); ApplicationSettings.setString('fox_root_classes', arr.join(',')); }
    } catch (e) {}
  },
  getComputedStyleProp() { return ''; },

  /* location / history — NS usa Frame/navigate, no history.pushState. */
  getLocationPathname() { return ''; },
  getLocationSearch() { return ''; },
  pushState() {},
  replaceState() {},

  /* título del documento — NS usa el título de la página/actividad nativa. */
  setDocumentTitle(title) {
    try {
      const frame = require('@nativescript/core/ui/frame').topmost();
      if (frame && frame.currentPage) frame.currentPage.title = title;
    } catch (e) {}
  },

  /* service worker — no existe en NS. */
  registerServiceWorker() {
    return Promise.reject(new Error('no SW in NativeScript'));
  },
};
