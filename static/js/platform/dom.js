/* platform/dom.js — abstracción del navegador (DOM) de Foxinix.
   Implementación web: document, window, navigator, localStorage, etc.
   En NativeScript se reemplaza por APIs nativas sin tocar el resto.

   REGLA: fuera de platform/, NINGÚN módulo debe tocar document/window/
   navigator directamente. Todo pasa por aquí. Eso es lo que permite que
   la misma vista funcione en el navegador y en NativeScript. */

export const DomAdapter = {
  /* ----- document ----- */
  getDocumentElement() {
    return typeof document !== 'undefined' ? document.documentElement : null;
  },
  createElement(tag) {
    return typeof document !== 'undefined' ? document.createElement(tag) : null;
  },
  querySelector(selector) {
    if (typeof document === 'undefined') return null;
    try { return document.querySelector(selector); } catch (e) { return null; }
  },
  querySelectorAll(selector) {
    if (typeof document === 'undefined') return [];
    try { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
    catch (e) { return []; }
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
  /* El elemento que tiene el foco ahora (para no pisar lo que escribe). */
  getActiveElement() {
    if (typeof document === 'undefined') return null;
    return document.activeElement || null;
  },
  /* ¿Este elemento es el que tiene el foco? */
  isFocused(el) {
    if (!el) return false;
    return this.getActiveElement() === el;
  },
  /* Pide el foco a un elemento (si existe). */
  focus(el) {
    try { if (el && el.focus) el.focus(); } catch (e) {}
  },
  /* Mete el cursor en un campo y selecciona su texto. */
  selectAll(el) {
    try { if (el && el.select) el.select(); } catch (e) {}
  },
  /* Desplaza un elemento hasta que se vea (center = lo deja en el medio). */
  scrollIntoView(el, block) {
    if (!el || !el.scrollIntoView) return;
    try {
      if (block) el.scrollIntoView({ block: block });
      else el.scrollIntoView();
    } catch (e) {
      try { el.scrollIntoView(); } catch (e2) {}
    }
  },
  /* Medidas de un elemento (en píxeles CSS). */
  getRect(el) {
    if (!el || !el.getBoundingClientRect) {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
    const r = el.getBoundingClientRect();
    return {
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height,
    };
  },
  /* Tamaño del área visible (sin barras del navegador en móvil). */
  getViewportSize() {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    return {
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
    };
  },
  /* ¿La pantalla es estrecha (móvil/tablet vertical)? */
  isNarrow(maxWidth) {
    const v = this.getViewportSize();
    return v.width > 0 && v.width <= (maxWidth || 760);
  },
  /* ¿El puntero es "grueso" (móvil/tableta táctil)? */
  isCoarsePointer() {
    if (typeof window === 'undefined') return false;
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) {}
    return this.isNarrow(640);
  },
  /* Copia texto al portapapeles (FF78: execCommand, sin depender de la
     API de portapapeles, que pide permisos y no existe en NS). */
  copyToClipboard(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) {
      return false;
    }
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
  getInnerHeight() {
    return typeof window !== 'undefined' ? window.innerHeight : 0;
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
  /* User-Agent Client Hints (bitness del dispositivo). */
  getUserAgentData() {
    const nav = this.getNavigator();
    if (!nav) return null;
    return nav.userAgentData || null;
  },
  /* Recarga la página (NS: reinicia la vista). */
  reload() {
    if (typeof window === 'undefined' || !window.location) return;
    try { window.location.reload(); } catch (e) {}
  },
  getOnline() {
    const nav = this.getNavigator();
    return nav ? (nav.onLine !== false) : true;
  },
  /* Tipo de red actual: 'wifi' | 'mobile' | '' (desconocido). */
  getNetworkType() {
    const conn = this.getConnection();
    if (!conn) return '';
    try {
      const type = String(conn.type || '').toLowerCase();
      if (type === 'wifi' || type === 'ethernet' || type === 'bluetooth') return 'wifi';
      if (type === 'cellular' || type === '4g' || type === '3g' || type === '2g') return 'mobile';
      if (conn.effectiveType) {
        if (/^(slow-2g|2g|3g)$/.test(conn.effectiveType)) return 'mobile';
        if (/^(4g)$/.test(conn.effectiveType)) return 'mobile';
      }
    } catch (e) {}
    return '';
  },
  /* Datos de la conexión (tipo, ahorro de datos). */
  getConnection() {
    const nav = this.getNavigator();
    if (!nav) return null;
    return nav.connection || nav.mozConnection || nav.webkitConnection || null;
  },
  /* ¿El navegador pide ahorro de datos? (no precargar emoji) */
  isSaveDataEnabled() {
    const conn = this.getConnection();
    if (!conn) return false;
    try { return !!conn.saveData; } catch (e) { return false; }
  },
  /* Ejecuta la tarea cuando el navegador esté libre (o tras 400 ms). */
  requestIdle(cb) {
    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      return window.requestIdleCallback(cb);
    }
    return setTimeout(cb, 400);
  },
  /* ----- permisos del navegador ----- */
  queryPermission(name) {
    const nav = this.getNavigator();
    if (!nav || !nav.permissions || !nav.permissions.query) return null;
    try { return nav.permissions.query({ name: name }); } catch (e) { return null; }
  },
  /* ¿La app está instalada (PWA / standalone)? */
  isStandalone() {
    if (typeof window === 'undefined') return false;
    try {
      if (window.matchMedia &&
          window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return false;
  },
  /* ¿Es un móvil/tablet? (para atajos de teclado y ajustes) */
  isMobileUserAgent() {
    return /android|iphone|ipad|ipod|mobile/i.test(this.getUserAgent());
  },
  /* Teclado virtual: el alto visible de la ventana (viewport con teclado). */
  getKeyboardViewportHeight() {
    if (typeof window === 'undefined') return 0;
    const vv = window.visualViewport;
    if (vv) return vv.height || 0;
    return window.innerHeight || 0;
  },
  /* Avisa cuando cambia el alto del viewport (teclado abierto/cerrado). */
  onViewportResize(cb) {
    if (typeof window === 'undefined') return function () {};
    const vv = window.visualViewport;
    if (vv && vv.addEventListener) {
      vv.addEventListener('resize', cb);
      return function () {
        try { vv.removeEventListener('resize', cb); } catch (e) {}
      };
    }
    window.addEventListener('resize', cb);
    return function () { window.removeEventListener('resize', cb); };
  },
  /* ¿El navegador tiene IntersectionObserver? (descarga perezosa) */
  hasIntersectionObserver() {
    if (typeof window === 'undefined') return false;
    return typeof window.IntersectionObserver === 'function';
  },
  /* Crea un IntersectionObserver. Devuelve null si no hay soporte. */
  createIntersectionObserver(cb, options) {
    if (!this.hasIntersectionObserver()) return null;
    try {
      return new window.IntersectionObserver(cb, options);
    } catch (e) { return null; }
  },

  /* Observa cambios de tamaño de un elemento (si el navegador lo da). */
  observeResize(el, cb) {
    if (!el || typeof window === 'undefined' || !window.ResizeObserver) {
      return function () {};
    }
    let ro = null;
    try { ro = new window.ResizeObserver(cb); ro.observe(el); } catch (e) {}
    return function () {
      try { if (ro) ro.disconnect(); } catch (e) {}
    };
  },
  /* Observa varios elementos a la vez (p.ej. las filas de mensajes). */
  observeResizeAll(els, cb) {
    if (!els || typeof window === 'undefined' || !window.ResizeObserver) {
      return function () {};
    }
    let ro = null;
    try {
      ro = new window.ResizeObserver(cb);
      const list = els.length !== undefined ? Array.prototype.slice.call(els) : [els];
      for (let i = 0; i < list.length; i++) {
        if (list[i]) ro.observe(list[i]);
      }
    } catch (e) {}
    return function () {
      try { if (ro) ro.disconnect(); } catch (e) {}
    };
  },
  /* Puente nativo (APK). En iOS/NativeScript no existe → null. */
  getNativeBridge() {
    if (typeof window === 'undefined') return null;
    return window.FoxinixAndroid || null;
  },
  /* Variables globales que el puente nativo puede leer/llamar. */
  setGlobal(key, value) {
    if (typeof window === 'undefined') return;
    try { window[key] = value; } catch (e) {}
  },
  getGlobal(key) {
    if (typeof window === 'undefined') return undefined;
    return window[key];
  },
  /* ¿El contexto es seguro? (getUserMedia y Notifications lo exigen) */
  isSecureContext() {
    if (typeof window === 'undefined') return true;
    return window.isSecureContext !== false;
  },

  /* ----- confirm / alert (el navegador los bloquea; NS usa diálogos) ----- */
  confirm(message) {
    if (typeof window === 'undefined') return false;
    try { return !!window.confirm(message); } catch (e) { return false; }
  },
  alert(message) {
    if (typeof window === 'undefined') return;
    try { window.alert(message); } catch (e) {}
  },

  /* ----- pantalla completa (video) ----- */
  getFullscreenElement() {
    if (typeof document === 'undefined') return null;
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  },
  requestFullscreen(el) {
    if (!el) return Promise.resolve(false);
    try {
      if (el.requestFullscreen) {
        const p = el.requestFullscreen();
        return p && p.then ? p.then(function () { return true; }).catch(function () { return false; })
          : Promise.resolve(true);
      }
      if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        return Promise.resolve(true);
      }
    } catch (e) {}
    return Promise.resolve(false);
  },
  exitFullscreen() {
    if (typeof document === 'undefined') return;
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
  },

  /* ----- theme / acento (CSS vars en :root) ----- */
  /* El objeto "style" de :root (o un shim si no hay DOM). */
  getRootStyle() {
    const el = this.getDocumentElement();
    if (el && el.style) return el.style;
    /* Shim: no rompe si el DOM no está (p.ej. pruebas en Node). */
    return {
      setProperty: function () {},
      removeProperty: function () {},
      getPropertyValue: function () { return ''; },
    };
  },
  /* Valor COMPUTADO de una variable CSS de :root (p.ej. '--header'). */
  getRootComputedValue(prop) {
    if (typeof window === 'undefined') return '';
    const el = this.getDocumentElement();
    if (!el) return '';
    try { return window.getComputedStyle(el).getPropertyValue(prop); }
    catch (e) { return ''; }
  },
  /* Actualiza los <meta name="theme-color"> (PWA / barra del navegador). */
  setMetaThemeColor(color) {
    const metas = this.querySelectorAll('meta[name="theme-color"]');
    for (let i = 0; i < metas.length; i++) metas[i].setAttribute('content', color);
  },
  /* SHA-256 de un texto. Devuelve null si la plataforma no lo soporta
     (el llamador usa su hash local). */
  digestSha256(text) {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle ||
        typeof TextEncoder === 'undefined') {
      return Promise.resolve(null);
    }
    try {
      const data = new TextEncoder().encode(text);
      return window.crypto.subtle.digest('SHA-256', data)
        .then(function (buf) { return buf; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  },
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
  getLocationHref() {
    if (typeof location !== 'undefined' && location.href) return location.href;
    if (typeof window !== 'undefined' && window.location) return window.location.href || '';
    return '';
  },
  getLocationHash() {
    return typeof location !== 'undefined' ? (location.hash || '') : '';
  },
  getLocationOrigin() {
    if (typeof location !== 'undefined' && location.origin) return location.origin;
    if (typeof window !== 'undefined' && window.location) return window.location.origin || '';
    return '';
  },
  getHistoryState() {
    if (typeof history === 'undefined') return null;
    try { return history.state; } catch (e) { return null; }
  },
  /* Resuelve una URL relativa contra una base. Devuelve '' si no se
     puede resolver. (NS no tiene el global URL: lo resuelve a mano.) */
  absoluteUrl(url, base) {
    if (!url) return '';
    try {
      return new URL(url, base || this.getLocationHref()).href;
    } catch (e) { return ''; }
  },
  /* Atrás en el historial (el popstate recorta la pila interna). */
  historyBack() {
    if (typeof history === 'undefined') return;
    try { history.back(); } catch (e) {}
  },
  /* ¿La URL es del mismo origen que la página? */
  isSameOrigin(url) {
    if (!url) return false;
    try {
      return new URL(url, this.getLocationHref()).origin === this.getLocationOrigin();
    } catch (e) { return false; }
  },
  /* Navega a una URL (descarga de un APK, enlace externo). */
  navigate(url) {
    if (!url) return;
    try { location.href = url; } catch (e) {}
  },
  /* Trae la ventana al frente (p.ej. al recibir un mensaje). */
  focusWindow() {
    if (typeof window === 'undefined') return;
    try { if (window.focus) window.focus(); } catch (e) {}
  },
  /* ¿El navegador permite pedir almacenamiento persistente? */
  requestPersistentStorage() {
    const nav = this.getNavigator();
    if (!nav || !nav.storage || !nav.storage.persist) {
      return Promise.resolve(false);
    }
    return nav.storage.persist().catch(function () { return false; });
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
  /* ¿El navegador soporta service workers? (PWA) */
  hasServiceWorker() {
    if (typeof navigator === 'undefined') return false;
    return !!navigator.serviceWorker;
  },
  registerServiceWorker(path) {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      return navigator.serviceWorker.register(path).catch(function () {});
    }
    return Promise.reject(new Error('no SW'));
  },
  /* El service worker que controla esta página (o null). */
  getServiceWorkerController() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
    return navigator.serviceWorker.controller || null;
  },
  /* Manda un mensaje al service worker (controlador o activo). */
  postToServiceWorker(msg) {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
    try {
      const c = navigator.serviceWorker.controller;
      if (c) { c.postMessage(msg); return true; }
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg.active) reg.active.postMessage(msg);
      }).catch(function () {});
      return true;
    } catch (e) { return false; }
  },
  /* Espera a que el service worker esté activo (con tope de espera). */
  waitForServiceWorker(timeoutMs) {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return Promise.resolve(null);
    }
    return Promise.race([
      navigator.serviceWorker.ready.catch(function () { return null; }),
      new Promise(function (r) { setTimeout(r, timeoutMs || 2500); }),
    ]);
  },

  /* ----- identificadores únicos ----- */
  randomUUID() {
    if (typeof window !== 'undefined' && window.crypto &&
        typeof window.crypto.randomUUID === 'function') {
      try { return window.crypto.randomUUID(); } catch (e) {}
    }
    /* Fallback para navegadores viejos (y para NativeScript). */
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
};
