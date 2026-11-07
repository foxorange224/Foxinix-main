/* DownloadViewer — visor de descarga individual (W60).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { fmtSize } from '../../actions.js';
import { saveDownloadToDevice } from '../../downloads.js';
import { FileAdapter } from '../../platform/files.js';
import { DomAdapter } from '../../platform/dom.js';
import { t } from '../../i18n.js';

export const DownloadViewer = {
  setup: function () {
    const saved = Vue.ref(false);
    const saving = Vue.ref(false);
    const close = function () {
      const v = store.dlViewer;
      if (v && v.url && v.url.indexOf('blob:') === 0) {
        try { FileAdapter.revokeObjectURL(v.url); } catch (e) {}
      }
      store.dlViewer = null;
    };
    const onKey = function (e) {
      if (e.key === 'Escape') close();
    };
    Vue.onMounted(function () { DomAdapter.addEventListener('keydown', onKey); });
    Vue.onUnmounted(function () { DomAdapter.removeEventListener('keydown', onKey); });
    const save = async function () {
      const v = store.dlViewer;
      if (!v || !v.key) return;
      saving.value = true;
      saved.value = false;
      try {
        const r = await saveDownloadToDevice(v.key, v.name, v.mime);
        saved.value = !!(r && r.ok);
      } finally {
        saving.value = false;
      }
    };
    return { store, close, save, saved, saving, fmtSize, t };
  },
  template: `
    <div class="dl-viewer-veil" @click.self="close" role="dialog" :aria-label="store.dlViewer.name">
      <div class="dl-viewer" v-if="store.dlViewer">
        <header>
          <span class="dlv-title" :title="store.dlViewer.name">{{ store.dlViewer.name }}</span>
          <span class="dlv-size">{{ fmtSize(store.dlViewer.size) }}</span>
          <button class="btn btn-ghost btn-sm dlv-save" type="button"
            :disabled="saving" @click="save">
            <svg class="ic ic-sm"><use :href="saved ? '#i-check' : '#i-download'"></use></svg>
            <span>{{ saved ? t('Guardado') : (saving ? t('Guardando…') : t('Guardar')) }}</span>
          </button>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="dlv-body">
          <img v-if="store.dlViewer.kind === 'image'" :src="store.dlViewer.url"
            :alt="store.dlViewer.name">
          <video v-else-if="store.dlViewer.kind === 'video'" :src="store.dlViewer.url"
            controls autoplay ref="dlVideo"></video>
          <audio v-else-if="store.dlViewer.kind === 'audio'" :src="store.dlViewer.url"
            controls autoplay></audio>
          <iframe v-else-if="store.dlViewer.mime === 'application/pdf'"
            :src="store.dlViewer.url" :title="store.dlViewer.name"></iframe>
          <div v-else class="dlv-other">
            <svg class="ic"><use href="#i-file"></use></svg>
            <b>{{ store.dlViewer.name }}</b>
            <span>{{ t('Este tipo de archivo no se puede previsualizar aquí.') }}</span>
            <button class="btn" type="button" :disabled="saving" @click="save">
              {{ saving ? t('Guardando…') : t('Guardar en el dispositivo') }}
            </button>
          </div>
        </div>
      </div>
    </div>`,
};
