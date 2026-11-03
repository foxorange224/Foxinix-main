/* W38: pantalla de arranque compartida (BootView de auth.js y overlay
   .app-boot del chat): icono de la app, barra de progreso y el texto
   de la fase real del arranque (store.bootPhase → BOOT_PHASES).
   W67: se quitó el sello "Cifrado de extremo a extremo". Vue global
   build. */
import { store, BOOT_PHASES } from '../store.js';

export const BootScreen = {
  name: 'BootScreen',
  setup() {
    const phase = Vue.computed(function () {
      const key = store.bootPhase || 'ready';
      for (let i = 0; i < BOOT_PHASES.length; i++) {
        if (BOOT_PHASES[i].key === key) return BOOT_PHASES[i];
      }
      return BOOT_PHASES[BOOT_PHASES.length - 1];
    });
    /* la barra avanza con scaleX (sólo transform — regla FF78) */
    const prog = Vue.computed(function () { return phase.value.progress; });
    const txt = Vue.computed(function () { return phase.value.txt; });
    return { prog: prog, txt: txt };
  },
  template:
    '<div class="bp-screen">' +
      '<svg class="bp-logo" role="img" aria-label="Foxinix">' +
        '<use href="#i-logo-mark"></use></svg>' +
      '<div class="bp-bar"><i :style="{ transform: \'scaleX(\' + prog + \')\' }"></i></div>' +
      '<div class="bp-status">{{ t(txt) }}</div>' +
    '</div>',
};
