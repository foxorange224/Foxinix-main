/* platform/nativescript/files.js — capa de archivos para NativeScript.
   Usa FileSystem/knownFolders de @nativescript/core.
   Interfaz idéntica a platform/files.js. */

import { knownFolders, File, Folder } from '@nativescript/core/file-system';
import * as fs from '@nativescript/core/file-system';

export const FileAdapter = {
  createObjectURL(blob) {
    /* NativeScript no tiene URL.createObjectURL. Guardamos el blob como
       archivo temporal y devolvemos su ruta absoluta. */
    try {
      const temp = knownFolders.temp();
      const name = 'foxinix_' + Date.now() + '.tmp';
      const file = temp.getFile(name);
      const data = blob instanceof ArrayBuffer ? blob : (blob.arrayBuffer ? blob.arrayBuffer() : null);
      if (data) {
        file.writeFromArrayBufferSync(data);
        return file.path;
      }
      return '';
    } catch (e) { return ''; }
  },
  revokeObjectURL(url) {
    if (!url || typeof url !== 'string') return;
    try {
      const file = File.fromPath(url);
      if (file.exists()) file.removeSync();
    } catch (e) {}
  },
  saveBlobToDisk(blob, name) {
    try {
      const docs = knownFolders.documents();
      const downloads = docs.getFolder('Foxinix') || docs.createFolder('Foxinix');
      const file = downloads.getFile(name || 'archivo');
      const data = blob instanceof ArrayBuffer ? blob : (blob.arrayBuffer ? blob.arrayBuffer() : null);
      if (data) {
        file.writeFromArrayBufferSync(data);
        return true;
      }
      return false;
    } catch (e) { return false; }
  },
  readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      try {
        const file = FileAdapter.createObjectURL(blob);
        if (!file) return reject(new Error('no file'));
        const content = File.fromPath(file).readSync();
        const base64 = content.toString('base64');
        resolve('data:' + (blob.type || 'application/octet-stream') + ';base64,' + base64);
      } catch (e) { reject(e); }
    });
  },
};
