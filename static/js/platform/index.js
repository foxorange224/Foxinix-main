/* platform/index.js — punto de entrada único para las capas de plataforma.
   Por defecto exporta las implementaciones WEB. Para NativeScript, reemplaza
   estos archivos por los de platform/nativescript/ o cambia los imports en
   cada módulo para que apunten a platform/nativescript/*.

   Los módulos de la app importan desde aquí (o desde los archivos
   individuales de platform/ que ya están hechos). Esta indirección permite
   cambiar toda la app de web a NS tocando solo este archivo. */

export { HttpClient } from './net.js';
export { StorageAdapter } from './storage.js';
export { FileAdapter } from './files.js';
export { DomAdapter } from './dom.js';

/* Ejemplo de cómo se vería para NativeScript (descomentar y comentar las
   líneas de arriba):
   export { HttpClient } from './nativescript/net.js';
   export { StorageAdapter } from './nativescript/storage.js';
   export { FileAdapter } from './nativescript/files.js';
   export { DomAdapter } from './nativescript/dom.js';
*/
