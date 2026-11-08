/* platform/nativescript/files.js — capa de archivos para NativeScript.
   Usa FileSystem/knownFolders de @nativescript/core.
   Interfaz idéntica a platform/files.js.

   OJO (NS 9): `File.writeFromArrayBufferSync` ya no existe (ahora es
   `writeSync`/`write`), y `readAsDataURL` no existe: en NS los archivos
   se leen como texto/base64 a mano. */

import { knownFolders, File, Folder } from '@nativescript/core/file-system';

export const FileAdapter = {
  /* En NS el Blob es un polyfill: se construye con los mismos trozos. */
  createBlob(chunks, type) {
    try {
      if (typeof Blob === 'undefined') return null;
      return new Blob(chunks || [], type ? { type: type } : undefined);
    } catch (e) { return null; }
  },
  createObjectURL(blob) {
    /* NativeScript no tiene URL.createObjectURL. Si el blob ya es un
       ArrayBuffer se guarda como archivo temporal y se devuelve su ruta
       absoluta; si no, se devuelve '' (la app lo maneja como "sin
       archivo local"). */
    try {
      if (!blob) return '';
      const data = (blob instanceof ArrayBuffer) ? blob : null;
      if (!data) return '';
      const temp = knownFolders.temp();
      const name = 'foxinix_' + Date.now() + '.tmp';
      const file = temp.getFile(name);
      file.writeSync(data);
      return file.path;
    } catch (e) { return ''; }
  },
  revokeObjectURL(url) {
    if (!url || typeof url !== 'string') return;
    try {
      const file = File.fromPath(url);
      file.remove();
    } catch (e) {}
  },
  /* Guarda un blob en el dispositivo (en NS: en la carpeta de la app). */
  saveBlobToDisk(blob, name) {
    const path = this.createObjectURL(blob);
    return !!path;
  },
  /* Lee un blob como data-URL (base64). */
  readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      try {
        if (!blob) { reject(new Error('sin datos')); return; }
        if (typeof FileReader !== 'undefined') {
          const fr = new FileReader();
          fr.onload = function () { resolve(String(fr.result || '')); };
          fr.onerror = function () { reject(fr.error); };
          fr.readAsDataURL(blob);
          return;
        }
        /* Sin FileReader: si es texto plano, se codifica a mano. */
        const text = typeof blob === 'string' ? blob : '';
        resolve('data:text/plain;base64,' + btoa(text));
      } catch (e) { reject(e); }
    });
  },
};

export { File, Folder, knownFolders };
