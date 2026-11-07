/* platform/dom.js — abstracción del navegador (DOM) de Foxinix.
   Implementación web: document, window, navigator, localStorage, etc.
   En NativeScript se reemplaza por APIs nativas sin tocar el resto. */

export const DomAdapter = {
  /* ----- document ----- */
  getDocumentElement() {
    return typeof document !== 'undefined' ? document.documentElement : null;
  },
  createElement(tag) {
    return typeof document !== 'undefined' ? document.createElement(tag) : null;
  },
  querySelector(selector) {
    return typeof document !== 'undefined' ? document.querySelector(selector) : null;
  },
  addEventListener(type, listener, opts) {
    if (typeof document !== 'undefined') document.addEventListener(type, listener, opts);
  },
  removeEventListener(type, listener, opts) {
    if (typeof document !== 'undefined') document.removeEventListener(type, listener, opts);
  },
  bodyAppendChild(el) {
    if (typeof document !== 'undefined' && document.body) document.body.appendChild(el);
  },
  bodyRemoveChild(el) {
    if (typeof document !== 'undefined' && document.body) document.body.removeChild(el);
  },

  /* ----- window ----- */
  getWindow() {
    return typeof window !== 'undefined' ? window : null;
  },
  addWindowEventListener(type, listener, opts) {
    if (typeof window !== 'undefined') window.addEventListener(type, listener, opts);
  },
  removeWindowEventListener(type, listener, opts) {
    if (typeof window !== 'undefined') window.removeEventListener(type, listener, opts);
  },
  getInnerWidth() {
    return typeof window !== 'undefined' ? window.innerWidth : 0;
  },
  getHidden() {
    return typeof document !== 'undefined' ? !!document.hidden : false;
  },
  getVisibilityState() {
    return typeof document !== 'undefined' ? document.visibilityState : 'visible';
  },
  getNavigator() {
    return typeof navigator !== 'undefined' ? navigator : null;
  },
  getUserAgent() {
    const nav = this.getNavigator();
    return nav ? (nav.userAgent || '') : '';
  },
  getOnline() {
    const nav = this.getNavigator();
    return nav ? (nav.onLine !== false) : true;
  },

  /* ----- theme / acento (CSS vars en :root) ----- */
  setRootStyle(prop, value) {
    const el = this.getDocumentElement();
    if (el) el.style.setProperty(prop, value);
  },
  removeRootStyle(prop) {
    const el = this.getDocumentElement();
    if (el) el.style.removeProperty(prop);
  },
  setRootAttribute(name, value) {
    const el = this.getDocumentElement();
    if (el) el.setAttribute(name, value);
  },
  removeRootAttribute(name) {
    const el = this.getDocumentElement();
    if (el) el.removeAttribute(name);
  },
  getRootAttribute(name) {
    const el = this.getDocumentElement();
    return el ? el.getAttribute(name) : null;
  },
  addRootClass(cls) {
    const el = this.getDocumentElement();
    if (el) el.classList.add(cls);
  },
  removeRootClass(cls) {
    const el = this.getDocumentElement();
    if (el) el.classList.remove(cls);
  },
  getComputedStyleProp(el, prop) {
    if (typeof window !== 'undefined' && el) {
      return window.getComputedStyle(el).getPropertyValue(prop);
    }
    return '';
  },

  /* ----- location / history ----- */
  getLocationPathname() {
    return typeof location !== 'undefined' ? location.pathname : '';
  },
  getLocationSearch() {
    return typeof location !== 'undefined' ? location.search : '';
  },
  pushState(state, title, url) {
    if (typeof history !== 'undefined' && history.pushState) history.pushState(state, title, url);
  },
  replaceState(state, title, url) {
    if (typeof history !== 'undefined' && history.replaceState) history.replaceState(state, title, url);
  },

  /* ----- título del documento ----- */
  setDocumentTitle(title) {
    if (typeof document !== 'undefined') document.title = title;
  },

  /* ----- service worker ----- */
  registerServiceWorker(path) {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      return navigator.serviceWorker.register(path).catch(function () {});
    }
    return Promise.reject(new Error('no SW'));
  },
};
