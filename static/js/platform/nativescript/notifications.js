/* platform/nativescript/notifications.js — notificaciones para NativeScript.
   NS no tiene Notification API: el aviso se hace con el plugin de
   notificaciones (@nativescript/community/local-notifications) o con el
   puente nativo.

   El plugin es OPCIONAL: no se importa en caliente (el bundler fallaría
   si no estuviera instalado), sino que la app lo engancha con
   setNotifier() cuando lo tiene.

   Interfaz idéntica a platform/notifications.js. */

export const NotificationAdapter = {
  _notifier: null,

  /* Engancha un notificador: { permission(), requestPermission(),
     notify(title, options) }. */
  setNotifier(notifier) {
    this._notifier = notifier || null;
  },

  isSupported() {
    return !!this._notifier;
  },
  getPermission() {
    if (!this._notifier) return 'unsupported';
    try {
      const p = this._notifier.permission();
      return p === 'default' ? 'prompt' : (p || 'unsupported');
    } catch (e) { return 'unsupported'; }
  },
  requestPermission() {
    if (!this._notifier) return Promise.resolve('unsupported');
    try {
      const r = this._notifier.requestPermission();
      if (r && typeof r.then === 'function') {
        return r.then((x) => (x === 'default' ? 'prompt' : (x || 'denied')));
      }
      return Promise.resolve(this.getPermission());
    } catch (e) { return Promise.resolve('denied'); }
  },
  notify(title, options) {
    if (!this._notifier) return false;
    try {
      const opts = options || {};
      this._notifier.notify(String(title || ''), opts);
      return true;
    } catch (e) { return false; }
  },
};
