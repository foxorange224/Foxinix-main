/* platform/notifications.js — capa de notificaciones de Foxinix.
   Web: Notification API del navegador.
   NativeScript: no hay Notification; los avisos llegan con el plugin
   de notificaciones o con el puente nativo. Si no hay soporte, la app
   avisa al usuario en vez de romperse.

   Interfaz idéntica en web y NS. */

export const NotificationAdapter = {
  /* ¿Hay soporte de notificaciones en esta plataforma? */
  isSupported() {
    return typeof Notification !== 'undefined';
  },
  /* Estado del permiso: granted / denied / prompt / unsupported */
  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    try {
      const p = Notification.permission;
      return p === 'default' ? 'prompt' : p;
    } catch (e) { return 'unsupported'; }
  },
  /* Pide el permiso al usuario. */
  requestPermission() {
    if (!this.isSupported()) return Promise.resolve('unsupported');
    return new Promise(function (resolve) {
      try {
        if (Notification.requestPermission.length > 0) {
          Notification.requestPermission(function (r) {
            resolve(r === 'default' ? 'prompt' : (r || 'denied'));
          });
        } else {
          Notification.requestPermission().then(function (r) {
            resolve(r === 'default' ? 'prompt' : (r || 'denied'));
          }).catch(function () { resolve('denied'); });
        }
      } catch (e) { resolve('denied'); }
    });
  },
  /* Muestra una notificación. Devuelve true si se mostró. */
  notify(title, options) {
    if (!this.isSupported()) return false;
    if (this.getPermission() !== 'granted') return false;
    try {
      const opts = options || {};
      const n = new Notification(title, opts);
      if (n.onclick && opts.onClick) {
        n.onclick = function () { opts.onClick(); };
      }
      return true;
    } catch (e) { return false; }
  },
};
