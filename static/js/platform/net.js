/* platform/net.js — capa de red de Foxinix.
   Implementación web: fetch + XMLHttpRequest. En NativeScript se reemplaza
   por httpModule sin tocar el resto de la app.
   Los métodos devuelven promesas compatibles con el código actual. */

export const HttpClient = {
  /* fetch con credenciales (cookie HttpOnly) y cabeceras JSON. */
  async fetch(url, opts = {}) {
    const http = Object.assign({
      credentials: 'include',
      headers: {},
    }, opts);
    /* El timeout se puede ampliar (p.ej. descargar un APK grande). */
    const ms = Number(http.timeout) > 0 ? Number(http.timeout) : 20000;
    delete http.timeout;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctl) {
      http.signal = ctl.signal;
      http._t = setTimeout(() => ctl.abort(), ms);
    }
    try {
      const res = await fetch(url, http);
      if (ctl) clearTimeout(http._t);
      return res;
    } catch (e) {
      if (ctl) clearTimeout(http._t);
      throw e;
    }
  },

  /* fetch que devuelve JSON, lanzando si no es 2xx. */
  async fetchJSON(url, opts = {}) {
    const res = await this.fetch(url, opts);
    if (res.status === 204) return null;
    return res.json();
  },

  /* Subida de archivo con progreso y cancelación (XHR). Devuelve {ok, detail?}. */
  upload(file, url, onProgress, ctl) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      if (ctl) {
        ctl.abort = function () {
          settled = true;
          try { xhr.abort(); } catch (e) {}
          const err = new Error('Subida cancelada');
          err.canceled = true;
          reject(err);
        };
      }
      const attempt = (retried) => {
        const x = new XMLHttpRequest();
        x.open('POST', url);
        x.timeout = 300000;
        x.upload.onprogress = (ev) => {
          if (ev && ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
        };
        x.onload = () => {
          if (settled) return;
          if (x.status >= 200 && x.status < 300) {
            try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error('Respuesta inválida del servidor')); }
          } else {
            let detail = 'Error ' + x.status;
            try {
              const d = JSON.parse(x.responseText).detail;
              if (typeof d === 'string') detail = d;
              else if (d && d.message) detail = d.message;
              else if (x.status === 413) detail = 'El archivo supera los 15 MB';
              else if (x.status === 507) detail = 'Se llenó la cuota de almacenamiento';
            } catch (e) {}
            reject(new Error(detail));
          }
        };
        x.onerror = () => { if (!settled) reject(new Error('Sin conexión con el servidor')); };
        x.ontimeout = () => { if (!settled) reject(new Error('La subida tardó demasiado')); };
        const fd = new FormData();
        fd.append('file', file);
        x.send(fd);
      };
      attempt(false);
    });
  },

  /* Descarga silenciosa de blob (XHR). */
  downloadBlob(url, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'blob';
      x.timeout = timeout;
      x.onload = function () {
        if (x.status >= 200 && x.status < 300 && x.response) resolve(x.response);
        else reject(new Error('HTTP ' + x.status));
      };
      x.onerror = function () { reject(new Error('red')); };
      x.ontimeout = function () { reject(new Error('tiempo')); };
      x.send();
    });
  },
};
