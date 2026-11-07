/* platform/nativescript/dom.js — capa de abstracción del "DOM" para NativeScript.
   NativeScript no tiene DOM: las vistas son XML nativo, no HTML. Este módulo
   expone las operaciones que el código web usa del DOM, mapeadas a APIs de NS
   donde sea posible, o marcando como "no disponible" lo que no aplica.
   Interfaz idéntica a platform/dom.js.

   Las medidas (getRect) y el foco se resuelven en NativeScript con el
   "layout" del elemento: un View native no tiene getBoundingClientRect,
   así que se devuelve un rectángulo cero salvo que el elemento lo
   exponga (los wrappers de NS sí pueden hacerlo). */

import { ApplicationSettings } from '@nativescript/core/application-settings';
import { device } from '@nativescript/core/platform';
import { Screen } from '@nativescript/core';

export const DomAdapter = {
  /* storage (delegado a StorageAdapter para consistencia) */
  getItem(key) { return ApplicationSettings.getString(key, null); },
  setItem(key, value) { try { ApplicationSettings.setString(key, String(value)); return true; } catch (e) { return false; } },
  removeItem(key) { try { ApplicationSettings.remove(key); return true; } catch (e) { return false; } },

  /* document — NS no tiene document. Estas operaciones son no-ops o devuelven null. */
  getDocumentElement() { return null; },
  createElement() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
  bodyAppendChild() {},
  bodyRemoveChild() {},
  getActiveElement() { return null; },
  isFocused() { return false; },
  focus(el) { try { if (el && el.focus) el.focus(); } catch (e) {} },
  selectAll(el) { try { if (el && el.select) el.select(); } catch (e) {} },
  scrollIntoView(el) {
    /* En NS el scroll se hace con el ScrollView que lo contiene. */
    try {
      if (el && el.scrollTo) el.scrollTo();
      else if (el && el.parent && el.parent.scrollTo) el.parent.scrollTo();
    } catch (e) {}
  },
  getRect(el) {
    try {
      if (el && el.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        return {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
        };
      }
    } catch (e) {}
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  },
  getViewportSize() {
    try {
      return {
        width: Screen.mainScreen.widthDIPs || device.screenWidth || 0,
        height: Screen.mainScreen.heightDIPs || device.screenHeight || 0,
      };
    } catch (e) {
      return { width: device.screenWidth || 0, height: device.screenHeight || 0 };
    }
  },
  isNarrow(maxWidth) {
    const v = this.getViewportSize();
    return v.width > 0 && v.width <= (maxWidth || 760);
  },
  isCoarsePointer() { return true; },   /* NS siempre es táctil */
  copyToClipboard(text) {
    try {
      const clipboard = require('@nativescript/core/clipboard');
      clipboard.setString(String(text == null ? '' : text));
      return true;
    } catch (e) { return false; }
  },

  /* window */
  getWindow() { return null; },
  addWindowEventListener() {},
  removeWindowEventListener() {},
  getInnerWidth() {
    try { return Screen.mainScreen.widthDIPs || device.screenWidth || 0; } catch (e) { return 0; }
  },
  getInnerHeight() {
    try { return Screen.mainScreen.heightDIPs || device.screenHeight || 0; } catch (e) { return 0; }
  },
  getHidden() { return false; }, /* NS no tiene pestañas ocultas del navegador */
  getVisibilityState() { return 'visible'; },
  getNavigator() { return null; },
  getUserAgent() { return 'NativeScript'; },
  getUserAgentData() { return null; },
  reload() {},
  getOnline() {
    try {
      const connectivity = require('@nativescript/core/connectivity');
      return connectivity.getConnectionType() !== connectivity.connectionType.none;
    } catch (e) { return true; }
  },
  isMobileUserAgent() { return true; },
  isSaveDataEnabled() { return false; },
  getConnection() { return null; },
  requestIdle(cb) { return setTimeout(cb, 400); },
  /* permisos del navegador: NS los pide con su propio diálogo */
  queryPermission() { return null; },
  isStandalone() { return true; },
  getKeyboardViewportHeight() { return this.getInnerHeight(); },
  onViewportResize() { return function () {}; },
  observeResize() { return function () {}; },
  observeResizeAll() { return function () {}; },
  /* Puente nativo: en NS el equivalente es el plugin/plugin de la app. */
  getNativeBridge() { return null; },
  setGlobal() {},
  getGlobal() { return undefined; },
  isSecureContext() { return true; },

  /* ----- confirm / alert -----
     NS no trae diálogo de confirmación en el núcleo: se usa el plugin
     `nativescript-ui-dialogs` si está instalado. Sin él se devuelve false
     (no se ejecuta ninguna acción destructiva a ciegas). */
  confirm(message) {
    try {
      const dialogs = require('@nativescript/core/ui/dialogs');
      if (dialogs && dialogs.confirm) {
        return dialogs.confirm({ title: '', message: String(message || ''), okButtonText: 'Sí', cancelButtonText: 'No' });
      }
    } catch (e) {}
    return false;
  },
  alert(message) {
    try {
      const dialogs = require('@nativescript/core/ui/dialogs');
      if (dialogs && dialogs.alert) {
        dialogs.alert({ title: '', message: String(message || ''), okButtonText: 'OK' });
        return;
      }
    } catch (e) {}
  },

  /* ----- pantalla completa — NS no tiene el fullscreen del DOM.
     El video en NS se reproduce en una vista nativa con su propio
     botón de pantalla completa (o en landscape). */
  getFullscreenElement() { return null; },
  requestFullscreen() { return Promise.resolve(false); },
  exitFullscreen() {},

  /* theme / acento — NS usa recursos de tema nativos, no CSS vars en :root.
     Estas operaciones guardan los valores en ApplicationSettings para que
     las vistas NS los lean y apliquen. */
  getRootStyle() {
    return {
      setProperty: function (prop, value) {
        try { ApplicationSettings.setString('fox_css_' + prop, String(value)); } catch (e) {}
      },
      removeProperty: function (prop) {
        try { ApplicationSettings.remove('fox_css_' + prop); } catch (e) {}
      },
      getPropertyValue: function (prop) {
        try { return ApplicationSettings.getString('fox_css_' + prop, ''); } catch (e) { return ''; }
      },
    };
  },
  getRootComputedValue() { return ''; },
  setMetaThemeColor() {},
  digestSha256() { return Promise.resolve(null); },
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
  getLocationOrigin() { return ''; },
  focusWindow() {},
  requestPersistentStorage() { return Promise.resolve(true); },
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
  waitForServiceWorker() {
    return Promise.resolve(null);
  },
  getServiceWorkerController() { return null; },
  postToServiceWorker() { return false; },

  /* ----- identificadores únicos ----- */
  randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
};
