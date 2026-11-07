/* PermissionGate — modal de permisos de arranque (W58).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { grantCurrent, skipCurrent, openCurrentSettings } from '../../permissions.js';
import { t } from '../../i18n.js';

export const PermissionGate = {
  setup: function () {
    return { store, grantCurrent, skipCurrent, openCurrentSettings, t };
  },
  template: `
    <div class="perm-gate" v-if="store.permGate" role="dialog" aria-modal="true"
      :aria-label="store.permGate.title">
      <div class="perm-card">
        <div class="perm-step" v-if="store.permGate.total > 1">
          {{ t('Permiso {n} de {total}', { n: store.permGate.index, total: store.permGate.total }) }}
        </div>
        <div class="perm-icon">
          <svg class="ic"><use :href="'#' + store.permGate.icon"></use></svg>
        </div>
        <h2>{{ store.permGate.title }}</h2>
        <p>{{ store.permGate.text }}</p>
        <div class="perm-error" v-if="store.permGate.error" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg>
          <span>{{ store.permGate.error }}</span>
        </div>
        <div class="perm-actions">
          <button class="btn btn-ghost" type="button" :disabled="store.permGate.busy"
            @click="skipCurrent">{{ t('Saltar por ahora') }}</button>
          <button class="btn" type="button" :disabled="store.permGate.busy"
            @click="grantCurrent">{{ store.permGate.busy ? t('Solicitando…') : t('Conceder') }}</button>
        </div>
        <button class="perm-settings" type="button"
          v-if="store.permGate.native && store.permGate.state === 'denied'"
          @click="openCurrentSettings">{{ t('Abrir ajustes del sistema') }}</button>
      </div>
    </div>`,
};
