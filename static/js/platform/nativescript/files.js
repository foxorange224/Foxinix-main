/* platform/nativescript/files.js — capa de archivos para NativeScript.
   Usa FileSystem/knownFolders de @nativescript/core.
   Interfaz idéntica a platform/files.js.

   OJO (NS 9): `File.writeFromArrayBufferSync` ya no existe (ahora es
   `writeSync`/`write`), y `readAsDataURL` no existe: en NS los archivos
   se leen como texto/base64 a mano. */

import { knownFolders, File, Folder, getFileAccess } from '@nativescript/core/file-system';
import { Application } from '@nativescript/core/application';

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
  /* W106: arma el "archivo" que el núcleo sube (multipart). En NS no hay
     File: se escribe el contenido en un archivo temporal y se devuelve el
     mismo formato que devuelve el selector nativo ({name,size,type,path}). */
  async toUploadFile(blob, name, type) {
    try {
      let bytes = null;
      if (blob instanceof ArrayBuffer) bytes = blob;
      else if (blob && blob.buffer instanceof ArrayBuffer) {
        const v = blob;
        bytes = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
      } else if (blob && typeof blob.arrayBuffer === 'function') {
        bytes = await blob.arrayBuffer();
      }
      if (!bytes || !bytes.byteLength) return null;
      const safe = String(name || 'archivo').replace(/[\/\\]/g, '_');
      const temp = knownFolders.temp();
      const file = temp.getFile('foxinix_up_' + Date.now() + '_' + safe);
      file.writeSync(bytes);
      return {
        name: safe,
        size: bytes.byteLength,
        type: type || mimeFromName(safe),
        path: file.path,
      };
    } catch (e) { return null; }
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
  /* Bytes crudos de un archivo. El archivo puede venir de tres formas:
     - {data: ArrayBuffer}: los bytes ya están en memoria.
     - {path}: una ruta (o un content:// de Android) en el dispositivo.
     - un File/Blob normal (arrayBuffer()).

     OJO: `File.readSync()` en Android devuelve un byte[] de Java, no un
     ArrayBuffer, así que los bytes se leen a mano (ver readPathBytes). */
  async readFileBytes(file) {
    if (!file) return null;
    try {
      if (file.data instanceof ArrayBuffer) return file.data;
      if (file.data && file.data.buffer instanceof ArrayBuffer) {
        const v = file.data;
        return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
      }
      if (file.path) return this.readPathBytes(String(file.path));
      if (typeof file.arrayBuffer === 'function') return await file.arrayBuffer();
    } catch (e) { return null; }
    return null;
  },
  /* Bytes de una ruta del dispositivo.
     - Android: el selector del sistema devuelve un content:// (no una
       ruta), así que primero se copia a un archivo temporal con el
       ContentResolver y después se lee ese archivo.
     - iOS (y el resto): la API de NS devuelve un ArrayBuffer. */
  readPathBytes(path) {
    if (typeof java !== 'undefined' && typeof android !== 'undefined') {
      const real = path.indexOf('content:') === 0 ? this.copyUriToTemp(path) : path;
      if (!real) return null;
      try {
        const javaFile = new java.io.File(real);
        const len = javaFile.length();
        if (!len) return null;
        const bytes = Array.create('byte', len);
        const stream = new java.io.DataInputStream(new java.io.FileInputStream(javaFile));
        stream.readFully(bytes);
        stream.close();
        if (real !== path) { try { new java.io.File(real).delete(); } catch (e) {} }
        /* ArrayBuffer.from() convierte el byte[] de Java. */
        return ArrayBuffer.from(bytes);
      } catch (e) { return null; }
    }
    try { return getFileAccess().readBufferSync(path); } catch (e) { return null; }
  },
  /* Copia un content:// a un archivo temporal y devuelve su ruta. */
  copyUriToTemp(path) {
    try {
      const ctx = androidContext();
      if (!ctx) return '';
      const resolver = ctx.getContentResolver();
      const stream = resolver.openInputStream(android.net.Uri.parse(path));
      if (!stream) return '';
      const name = 'foxinix_up_' + Date.now() + '_' +
        Math.floor(Math.random() * 1000000) + '.tmp';
      const temp = knownFolders.temp().getFile(name);
      const out = new java.io.FileOutputStream(temp.path);
      try {
        const chunk = Array.create('byte', 32768);
        let n = stream.read(chunk);
        while (n > 0) {
          out.write(chunk, 0, n);
          n = stream.read(chunk);
        }
      } finally {
        try { out.close(); } catch (e) {}
        try { stream.close(); } catch (e) {}
      }
      return temp.path;
    } catch (e) { return ''; }
  },
  /* Datos de un archivo del dispositivo (ruta o content:// de Android):
     {name, size, type}. Lo usa el selector nativo de la app. */
  describeSource(src) {
    const out = { name: '', size: 0, type: '' };
    const s = String(src || '');
    if (!s) return out;
    let name = s.split('/').pop() || '';
    name = name.split('?')[0];
    try { name = decodeURIComponent(name); } catch (e) {}
    out.name = name || 'archivo';
    try {
      const size = getFileAccess().getFileSize(s);
      if (size) out.size = Number(size);
    } catch (e) {}
    /* El tipoMime lo sabe el ContentResolver (content://) o la extensión. */
    try {
      if (typeof android !== 'undefined' && s.indexOf('content:') === 0) {
        const ctx = androidContext();
        const resolver = ctx.getContentResolver();
        const mime = resolver.getType(android.net.Uri.parse(s));
        if (mime) out.type = String(mime);
      }
    } catch (e) {}
    if (!out.type) out.type = mimeFromName(out.name);
    return out;
  },
  /* Cuerpo para subir un archivo (multipart/form-data, campo "file").

     OJO: el FormData de NS NO genera multipart (su toString() devuelve
     "file=%5Bobject..."), así que el cuerpo se arma a mano:
     boundary + cabecera de la parte + bytes del archivo + cierre. */
  async buildUploadBody(file) {
    const bytes = await this.readFileBytes(file);
    if (!bytes || !bytes.byteLength) return null;
    const boundary = '----Foxinix' + Date.now().toString(16) +
      Math.floor(Math.random() * 0xffffff).toString(16);
    const name = safeFileName(file && file.name);
    const type = (file && file.type) || 'application/octet-stream';
    const head = '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + name + '"\r\n' +
      'Content-Type: ' + type + '\r\n\r\n';
    const tail = '\r\n--' + boundary + '--\r\n';
    const headBytes = utf8Bytes(head);
    const tailBytes = utf8Bytes(tail);
    const body = new Uint8Array(headBytes.length + bytes.byteLength + tailBytes.length);
    body.set(headBytes, 0);
    body.set(new Uint8Array(bytes), headBytes.length);
    body.set(tailBytes, headBytes.length + bytes.byteLength);
    return {
      body: body.buffer,
      contentType: 'multipart/form-data; boundary=' + boundary,
    };
  },
};

/* Nombre de archivo seguro para una cabecera HTTP: sin comillas ni
   saltos de línea (romperían el multipart) y sin rutas. Los acentos se
   mantienen: van en UTF-8 y el server los decodifica bien. */
function safeFileName(name) {
  let s = String(name || '');
  s = s.replace(/[\r\n"\\]/g, '_').replace(/\//g, '_').trim();
  if (!s) s = 'archivo';
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

/* Contexto de Android (para el ContentResolver). */
function androidContext() {
  if (typeof android === 'undefined') return null;
  const app = typeof Application !== 'undefined' ? Application : null;
  if (!app || !app.android) return null;
  return app.android.startActivity || app.android.foregroundActivity ||
    app.android.context;
}

/* Tipo MIME por extensión (lo que no lo dice el ContentResolver). */
const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  heic: 'image/heic', mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime',
  webm: 'video/webm', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  zip: 'application/zip', rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function mimeFromName(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  if (i < 0 || i === n.length - 1) return 'application/octet-stream';
  const ext = n.slice(i + 1);
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/* UTF-8 sin depender del TextEncoder global (NS lo trae, pero el
   núcleo puede correr en un entorno sin él). */
function utf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  const out = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const c2 = text.charCodeAt(i + 1);
      c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      i++;
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

export { File, Folder, knownFolders };
