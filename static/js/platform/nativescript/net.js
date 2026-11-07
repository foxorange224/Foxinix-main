/* platform/nativescript/net.js — capa de red para NativeScript.
   Usa httpModule de @nativescript/core (o fetch nativo de NS si está disponible).
   Interfaz idéntica a platform/net.js para que el resto de la app no cambie. */

import http from '@nativescript/core/http';
import { knownFolders } from '@nativescript/core/file-system';

export const HttpClient = {
  async fetch(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = Object.assign({}, opts.headers);
    const contentType = headers['Content-Type'] || 'application/json';
    const useSession = opts.credentials === 'include';

    /* En NativeScript no hay cookies HttpOnly automáticas; el token de
       acceso viaja en el header Authorization. El refresh token se guarda
       en ApplicationSettings y se envía en el body cuando el endpoint lo
       requiere (comportamiento legacy). */
    const session = await import('../storage.js').then(m => m.StorageAdapter);
    const accessKey = 'fm.session.access'; /* clave simplificada para NS */
    const raw = session.getItem(accessKey);
    if (raw && !headers.Authorization) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.access) headers.Authorization = 'Bearer ' + parsed.access;
      } catch (e) {}
    }

    const body = opts.body !== undefined ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : null;

    const response = await http.request({
      url,
      method,
      headers,
      contentType,
      body,
    });

    /* Simular objeto Response de fetch para el resto de la app */
    return {
      status: response.statusCode,
      ok: response.statusCode >= 200 && response.statusCode < 300,
      async json() {
        const content = response.content.toString();
        return content ? JSON.parse(content) : null;
      },
      async text() {
        return response.content.toString();
      },
      headers: response.headers || {},
    };
  },

  async fetchJSON(url, opts = {}) {
    const res = await this.fetch(url, opts);
    if (res.status === 204) return null;
    return res.json();
  },

  upload(file, url, onProgress, ctl) {
    return new Promise((resolve, reject) => {
      /* NativeScript no tiene XHR con onprogress nativo simple; se usa
         http.request con el archivo como cuerpo. El progreso fino requiere
         un módulo nativo adicional o se deja sin progreso en la v1. */
      const formData = new FormData();
      formData.append('file', file);

      http.request({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      }).then(response => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve(JSON.parse(response.content.toString())); }
          catch (e) { reject(new Error('Respuesta inválida del servidor')); }
        } else {
          let detail = 'Error ' + response.statusCode;
          try { detail = JSON.parse(response.content.toString()).detail || detail; } catch (e) {}
          reject(new Error(detail));
        }
      }).catch(err => reject(new Error('Sin conexión con el servidor')));
    });
  },

  downloadBlob(url, timeout = 120000) {
    return new Promise((resolve, reject) => {
      http.getFile(url, `${knownFolders.temp().path}/foxinix_dl`).then(file => {
        /* Leer el archivo como Blob/ArrayBuffer */
        resolve(file);
      }).catch(err => reject(new Error('red')));
    });
  },
};
