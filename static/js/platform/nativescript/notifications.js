/* platform/nativescript/notifications.js — notificaciones para NativeScript.
   NS no tiene Notification API: el aviso se hace con el plugin de
   notificaciones (@nativescript-community/local-notifications) o con el
   puente nativo. Si no hay soporte, se informa con claridad.
   Interfaz idéntica a platform/notifications.js. */

export const NotificationAdapter = {
  isSupported() {
    try {
      const ln = require('@nativescript/community/local-notifications');
      return !!(ln && ln.localNotification);
    } catch (e) { return false; }
  },
  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    return 'granted';
  },
  requestPermission() {
    return Promise.resolve(this.getPermission());
  },
  notify(title, options) {
    if (!this.isSupported()) return false;
    try {
      const ln = require('@nativescript/community/local-notifications');
      const opts = options || {};
      ln.localNotification({ title: String(title || ''), message: String(opts.body || '') });
      return true;
    } catch (e) { return false; }
  },
};
