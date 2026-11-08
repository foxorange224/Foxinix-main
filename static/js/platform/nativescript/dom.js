/* platform/nativescript/dom.js — capa de abstracción del "DOM" para NativeScript.
   NativeScript no tiene DOM: las vistas son XML nativo, no HTML. Este módulo
   expone las operaciones que el código web usa del DOM, mapeadas a APIs de NS
   donde sea posible, o marcando como "no disponible" lo que no aplica.
   Interfaz idéntica a platform/dom.js.

   Las medidas (getRect) y el foco se resuelven en NativeScript con el
   "layout" del elemento: un View native no tiene getBoundingClientRect,
   así que se devuelve un rectángulo cero salvo que el elemento lo
   exponga (los wrappers de NS sí pueden hacerlo). */

import {
  getString, setString, remove, clear, hasKey,
} from '@nativescript/core/application-settings';
import { Screen } from '@nativescript/core';
import { Application } from '@nativescript/core/application';

/* ¿La app está en segundo plano? En NS no hay "pestaña oculta", pero sí
   hay "app suspendida": los avisos de mensajes nuevos sólo deben salir
   cuando el usuario no está mirando la pantalla. */
let appHidden = false;
try {
  Application.on(Application.suspendEvent, () => { appHidden = true; });
  Application.on(Application.resumeEvent, () => { appHidden = false; });
} catch (e) { /* si no hay runtime de app, se asume visible */ }

export const DomAdapter = {
  /* storage (delegado a StorageAdapter para consistencia) */
  getItem(key) { return getString(key, null); },
  setItem(key, value) { try { setString(key, String(value)); return true; } catch (e) { return false; } },
  removeItem(key) { try { remove(key); return true; } catch (e) { return false; } },

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
        width: Screen.mainScreen.widthDIPs || Screen.mainScreen.widthDIPs || 0,
        height: Screen.mainScreen.heightDIPs || Screen.mainScreen.heightDIPs || 0,
      };
    } catch (e) {
      return { width: Screen.mainScreen.widthDIPs || 0, height: Screen.mainScreen.heightDIPs || 0 };
    }
  },
  isNarrow(maxWidth) {
    const v = this.getViewportSize();
    return v.width > 0 && v.width <= (maxWidth || 760);
  },
  isCoarsePointer() { return true; },   /* NS siempre es táctil */
  copyToClipboard(text) {
    /* NS 9 no trae clipboard en el core. La app puede enganchar un
       copiador (plugin nativo) con setClipboard(); sin él, la vista
       muestra un campo de texto seleccionable y devuelve false. */
    try {
      if (this._clipboard && typeof this._clipboard.setString === 'function') {
        this._clipboard.setString(String(text == null ? '' : text));
        return true;
      }
    } catch (e) {}
    return false;
  },
  /* Engancha un copiador (p.ej. un plugin de portapapeles). */
  setClipboard(clipboard) {
    this._clipboard = clipboard || null;
  },

  /* window */
  getWindow() { return null; },
  addWindowEventListener() {},
  removeWindowEventListener() {},
  getInnerWidth() {
    try { return Screen.mainScreen.widthDIPs || Screen.mainScreen.widthDIPs || 0; } catch (e) { return 0; }
  },
  getInnerHeight() {
    try { return Screen.mainScreen.heightDIPs || Screen.mainScreen.heightDIPs || 0; } catch (e) { return 0; }
  },
  getHidden() { return appHidden; },
  getVisibilityState() { return appHidden ? 'hidden' : 'visible'; },
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
  /* Tipo de red actual: 'wifi' | 'mobile' | '' (desconocido). */
  getNetworkType() {
    try {
      const connectivity = require('@nativescript/core/connectivity');
      const ct = connectivity.getConnectionType();
      if (ct === connectivity.connectionType.wifi) return 'wifi';
      if (ct === connectivity.connectionType.mobile) return 'mobile';
      if (ct === connectivity.connectionType.ethernet) return 'wifi';
      return '';
    } catch (e) { return ''; }
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
  hasIntersectionObserver() { return false; },
  createIntersectionObserver() { return null; },
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
        return dialogs.confirm({
          title: 'Foxinix',
          message: String(message || ''),
          okButtonText: 'Sí',
          cancelButtonText: 'No',
        });
      }
    } catch (e) {}
    return false;
  },
  alert(message) {
    try {
      const dialogs = require('@nativescript/core/ui/dialogs');
      if (dialogs && dialogs.alert) {
        dialogs.alert({ title: 'Foxinix', message: String(message || ''), okButtonText: 'OK' });
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
        try { setString('fox_css_' + prop, String(value)); } catch (e) {}
      },
      removeProperty: function (prop) {
        try { remove('fox_css_' + prop); } catch (e) {}
      },
      getPropertyValue: function (prop) {
        try { return getString('fox_css_' + prop, ''); } catch (e) { return ''; }
      },
    };
  },
  getRootComputedValue() { return ''; },
  setMetaThemeColor() {},
  digestSha256() { return Promise.resolve(null); },
  setRootStyle(prop, value) {
    try { setString('fox_css_' + prop, String(value)); } catch (e) {}
  },
  removeRootStyle(prop) {
    try { remove('fox_css_' + prop); } catch (e) {}
  },
  setRootAttribute(name, value) {
    try { setString('fox_attr_' + name, String(value)); } catch (e) {}
  },
  removeRootAttribute(name) {
    try { remove('fox_attr_' + name); } catch (e) {}
  },
  getRootAttribute(name) {
    try { return getString('fox_attr_' + name, null); } catch (e) { return null; }
  },
  addRootClass(cls) {
    try {
      const classes = getString('fox_root_classes', '');
      const arr = classes ? classes.split(',') : [];
      if (!arr.includes(cls)) { arr.push(cls); setString('fox_root_classes', arr.join(',')); }
    } catch (e) {}
  },
  removeRootClass(cls) {
    try {
      const classes = getString('fox_root_classes', '');
      const arr = classes ? classes.split(',') : [];
      const idx = arr.indexOf(cls);
      if (idx >= 0) { arr.splice(idx, 1); setString('fox_root_classes', arr.join(',')); }
    } catch (e) {}
  },
  getComputedStyleProp() { return ''; },

  /* location / history — NS usa Frame/navigate, no history.pushState. */
  getLocationPathname() { return ''; },
  getLocationSearch() { return ''; },
  getLocationHref() { return ''; },
  getLocationHash() { return ''; },
  getLocationOrigin() { return ''; },
  getHistoryState() { return null; },
  /* Resuelve una URL relativa contra una base.
     NS (Android) no tiene el global URL, así que se resuelve a mano:
     sólo hacen falta los casos de la app (absoluta, con barra inicial o
     relativa dentro del mismo origen). */
  absoluteUrl(url, base) {
    if (!url) return '';
    const u = String(url);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
    const b = String(base || '');
    if (!b) return u;
    const m = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)/i.exec(b);
    if (!m) return u;
    const origin = m[1] + '//' + m[2];
    if (u.charAt(0) === '/') return origin + u;
    const dir = m[3].replace(/[^/]*$/, '');
    return origin + dir + u;
  },
  historyBack() {},
  focusWindow() {},
  isSameOrigin() { return false; },
  navigate() {},
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
  hasServiceWorker() { return false; },
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
