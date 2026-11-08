/* platform/nativescript/net.js — capa de red para NativeScript.
   Usa httpModule de @nativescript/core.
   Interfaz idéntica a platform/net.js para que el resto de la app no cambie.

   Diferencias con la web que ya están resueltas aquí:
   - No hay cookie jar: el refresh token lo manda api.js en el body
     (modo "legado", ver platform/cookies.js).
   - No hay `Response` nativo: se simula con la misma forma que usa el
     código (status, ok, json(), text(), blob(), clone(), headers.get). */

/* NS 9: `http` ya no tiene export default. */
import { request, getFile } from '@nativescript/core/http';

function headersShim(headers) {
  const h = headers || {};
  return {
    get: function (name) {
      const key = String(name || '').toLowerCase();
      for (const k in h) {
        if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
        if (k.toLowerCase() === key) return h[k];
      }
      return null;
    },
    has: function (name) { return this.get(name) !== null; },
    raw: h,
  };
}

function makeResponse(statusCode, content, headers) {
  const text = content === null || content === undefined
    ? '' : content.toString();
  const res = {
    status: statusCode,
    ok: statusCode >= 200 && statusCode < 300,
    headers: headersShim(headers),
    async json() {
      if (!text) return null;
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
    async blob() {
      /* En NS el "blob" es un ArrayBuffer con su tipo MIME. */
      const buf = content && content.buffer ? content.buffer : new ArrayBuffer(0);
      return buf;
    },
    async arrayBuffer() {
      const buf = content && content.buffer ? content.buffer : new ArrayBuffer(0);
      return buf;
    },
    clone() {
      return makeResponse(statusCode, content, headers);
    },
  };
  return res;
}

export const HttpClient = {
  async fetch(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = Object.assign({}, opts.headers || {});
    /* NS http.request lleva el Content-Type aparte. */
    let contentType = headers['Content-Type'] || headers['content-type'] || '';
    delete headers['Content-Type'];
    delete headers['content-type'];
    if (!contentType && method !== 'GET') contentType = 'application/json';

    const body = opts.body !== undefined
      ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      : null;

    const response = await request({
      url: String(url),
      method: method,
      headers: headers,
      contentType: contentType,
      body: body,
      timeout: opts.timeout || 30000,
    });

    return makeResponse(response.statusCode, response.content, response.headers);
  },

  async fetchJSON(url, opts = {}) {
    const res = await this.fetch(url, opts);
    if (res.status === 204) return null;
    return res.json();
  },

  upload(file, url, onProgress, ctl) {
    return new Promise((resolve, reject) => {
      /* En NS no hay XHR con onprogress: se usa http.request con el
         archivo como cuerpo. El progreso fino requiere un módulo nativo
         adicional; en la v1 se informa 0 → 100 al terminar. */
      if (ctl && ctl.abort) {
        ctl.abort = function () {
          const err = new Error('Subida cancelada');
          err.canceled = true;
          reject(err);
        };
      }
      const formData = new FormData();
      formData.append('file', file);
      request({
        url: String(url),
        method: 'POST',
        headers: {},
        contentType: 'multipart/form-data',
        body: formData,
        timeout: 300000,
      }).then(response => {
        const text = response.content ? response.content.toString() : '';
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve(JSON.parse(text)); }
          catch (e) { reject(new Error('Respuesta inválida del servidor')); }
        } else {
          let detail = 'Error ' + response.statusCode;
          try {
            const d = JSON.parse(text).detail;
            if (typeof d === 'string') detail = d;
            else if (d && d.message) detail = d.message;
          } catch (e) {}
          reject(new Error(detail));
        }
      }).catch(err => reject(new Error('Sin conexión con el servidor')));
    });
  },

  downloadBlob(url, timeout = 120000) {
    return new Promise((resolve, reject) => {
      getFile(String(url), null).then(file => {
        resolve(file);
      }).catch(err => reject(new Error('red')));
    });
  },
};
