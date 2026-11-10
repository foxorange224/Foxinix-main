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
import { FileAdapter } from './files.js';

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

/* Cuerpo de la petición: texto tal cual, binario tal cual (el
   multipart de las subidas va como ArrayBuffer) y el resto como JSON. */
function encodeBody(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body)) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
  }
  return JSON.stringify(body);
}

function makeResponse(statusCode, content, headers) {
  /* En NS 9 el contenido de la respuesta es un MANEJADOR
     (toArrayBuffer/toString/toJSON…), no el dato pelado. */
  const isHandler = !!content && typeof content.toArrayBuffer === 'function';
  let text = '';
  if (isHandler) {
    try { text = content.toString(); } catch (e) { text = ''; }
  } else if (content !== null && content !== undefined) {
    text = (content instanceof ArrayBuffer) ? '' : String(content);
  }
  /* Los bytes crudos (descargas binarias: los GIFs de la biblioteca).
     Se calculan sólo si se piden, para no copiar cada respuesta en
     memoria. */
  let bytes = null;
  const getBytes = function () {
    if (bytes !== null) return bytes;
    try {
      if (isHandler) bytes = content.toArrayBuffer();
      else if (content instanceof ArrayBuffer) bytes = content;
      else if (content && content.buffer instanceof ArrayBuffer) bytes = content.buffer;
      else bytes = new ArrayBuffer(0);
    } catch (e) { bytes = new ArrayBuffer(0); }
    return bytes;
  };
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
      return getBytes();
    },
    async arrayBuffer() {
      return getBytes();
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
    const raw = opts.body;
    /* NS 9: `http.request` NO tiene la opción "contentType": el tipo va
       como cabecera normal. Antes la cabecera se borraba y se perdía
       (las peticiones de NS salían sin Content-Type). */
    let contentType = headers['Content-Type'] || headers['content-type'] || '';
    if (contentType) {
      delete headers['Content-Type'];
      delete headers['content-type'];
      headers['Content-Type'] = contentType;
    } else if (method !== 'GET' && raw !== undefined && raw !== null &&
      typeof raw !== 'string' && !(raw instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(raw)) {
      /* Lo que no es texto ni binario va como JSON. */
      headers['Content-Type'] = 'application/json';
    }

    const body = encodeBody(raw);

    const response = await request({
      url: String(url),
      method: method,
      headers: headers,
      /* OJO: en NS el cuerpo va en `content` (NO en `body`): con `body`
         la petición salía sin cuerpo (login y mensajes no llegaban). */
      content: body,
      timeout: opts.timeout || 30000,
    });

    return makeResponse(response.statusCode, response.content, response.headers);
  },

  async fetchJSON(url, opts = {}) {
    const res = await this.fetch(url, opts);
    if (res.status === 204) return null;
    return res.json();
  },

  async upload(file, url, onProgress, ctl, extraHeaders) {
    /* En NS no hay XHR con onprogress: se usa http.request con el
       archivo como cuerpo. El progreso fino requiere un módulo nativo
       adicional; en la v1 se informa 0 → 100 al terminar. */
    let aborted = false;
    if (ctl) {
      ctl.abort = function () {
        aborted = true;
        const err = new Error('Subida cancelada');
        err.canceled = true;
        throw err;
      };
    }
    const prep = await FileAdapter.buildUploadBody(file);
    if (!prep || !prep.body) throw new Error('No se pudo leer el archivo');
    const headers = Object.assign({}, extraHeaders || {});
    if (prep.contentType) headers['Content-Type'] = prep.contentType;
    const response = await request({
      url: String(url),
      method: 'POST',
      headers: headers,
      content: prep.body,
      timeout: 300000,
    });
    if (aborted) throw new Error('Subida cancelada');
    const text = response.content ? response.content.toString() : '';
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (onProgress) onProgress(1);
      try { return JSON.parse(text); }
      catch (e) { throw new Error('Respuesta inválida del servidor'); }
    }
    let detail = 'Error ' + response.statusCode;
    try {
      const d = JSON.parse(text).detail;
      if (typeof d === 'string') detail = d;
      else if (d && d.message) detail = d.message;
    } catch (e) {}
    throw new Error(detail);
  },

  downloadBlob(url, timeout = 120000) {
    return new Promise((resolve, reject) => {
      getFile(String(url), null).then(file => {
        resolve(file);
      }).catch(err => reject(new Error('red')));
    });
  },
};
