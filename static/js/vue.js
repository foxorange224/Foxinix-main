/* vue.js — acceso al runtime de Vue desde los módulos ES.
   El bundle se carga como script clásico en el HTML
   (/static/vendor/vue.global.prod.js), así que Vue vive en window.Vue.
   Los módulos ES no pueden usar el especificador bare "vue" (el navegador
   no lo resuelve sin import map), por lo que este módulo hace de puente:
   `import Vue from '../vue.js'`.

   En NativeScript el bundler puede sustituir este archivo por el paquete
   real de Vue sin tocar los componentes. */

const V = (typeof globalThis !== 'undefined' && globalThis.Vue) ? globalThis.Vue : null;

export default V;
export const VueRef = V ? V.ref : null;
