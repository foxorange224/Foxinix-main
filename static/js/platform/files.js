/* platform/files.js — capa de archivos/blobs de Foxinix.
   Implementación web: Blob, URL.createObjectURL/revokeObjectURL,
   FileReader y <a download>. En NativeScript se reemplaza por
   FileSystem/knownFolders sin tocar el resto de la app. */

import { StorageAdapter } from './storage.js';
import { DomAdapter } from './dom.js';

export const FileAdapter = {
  /* Crea un Blob a partir de trozos (Uint8Array/ArrayBuffer/strings). */
  createBlob(chunks, type) {
    try { return new Blob(chunks || [], type ? { type: type } : undefined); }
    catch (e) { return null; }
  },
  createObjectURL(blob) {
    try { return URL.createObjectURL(blob); } catch (e) { return ''; }
  },
  revokeObjectURL(url) {
    if (!url || url.indexOf('blob:') !== 0) return;
    try { URL.revokeObjectURL(url); } catch (e) {}
  },
  /* Guarda un blob en el dispositivo (Descargas del navegador en PC). */
  saveBlobToDisk(blob, name) {
    if (!blob) return false;
    const obj = URL.createObjectURL(blob);
    const a = DomAdapter.createElement('a');
    if (!a) return false;
    a.href = obj;
    a.download = name || 'archivo';
    a.style.display = 'none';
    a.target = '_self';
    DomAdapter.bodyAppendChild(a);
    a.click();
    DomAdapter.bodyRemoveChild(a);
    setTimeout(function () { URL.revokeObjectURL(obj); }, 1200);
    return true;
  },
  /* Lee un blob como data-URL (base64). */
  readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  },
};

/* W19: comprime una imagen de fondo a un máximo de 1280×1280 y la
   devuelve como data-URL JPEG. Usa canvas (navegador). En NativeScript
   se reemplaza por compresión nativa de imagen.
   Extraído de views/chat.js (Fase 3.1). */
export function shrinkWall(file, cb) {
  const img = new Image();
  const url = FileAdapter.createObjectURL(file);
  img.onload = function () {
    const max = 1280;
    let w = img.width, h = img.height;
    if (w > max || h > max) {
      const k = Math.min(max / w, max / h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const c = DomAdapter.createElement('canvas');
    if (!c) { cb('', 'La foto es muy pesada: prueba con una más chica'); return; }
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    FileAdapter.revokeObjectURL(url);
    try {
      let out = c.toDataURL('image/jpeg', 0.75);
      if (out.length > 3000000) out = c.toDataURL('image/jpeg', 0.5);
      /* prueba de espacio: si no entra, avisar sin romper nada */
      StorageAdapter.setItem('fm.wallimg.probe', out);
      StorageAdapter.removeItem('fm.wallimg.probe');
      cb(out, '');
    } catch (e) {
      cb('', 'La foto es muy pesada: prueba con una más chica');
    }
  };
  img.onerror = function () {
    FileAdapter.revokeObjectURL(url);
    cb('', 'No se pudo leer la imagen');
  };
  img.src = url;
}

