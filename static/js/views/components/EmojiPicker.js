/* EmojiPicker — selector de emojis con 3 secciones (recientes/categorías/búsqueda).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';
import { clampPanel } from '../../views/ui-actions.js';
import {
  emojiCats, emojiRecent, emojiCat, emojiSearch, emojiPush,
  emoStyle, emoFile, emoSrc, emojiCode,
} from '../../emoji.js';

export const EmojiPicker = {
  /* W29g: embed = embebido en el panel unificado del compositor (3
     pestañas); ahí el tamaño y el clamp los lleva el padre. */
  props: { embed: Boolean, anchored: Boolean },
  emits: ['pick'],
  setup: function (props, ctxEmit) {
    const q = Vue.ref('');
    const tab = Vue.ref('recientes');
    const cats = emojiCats();
    /* W65: si el estilo elegido es Noto/Twemoji, la grilla sólo muestra
       emojis con imagen de ESE set. Antes los que faltaban caían a la
       fuente del sistema y el panel quedaba mezclado (o "entrecortado").
       Es preferible un hueco/una lista más corta a mezclar estilos. */
    const usable = function (items) {
      if (emoStyle() === 'system') return items;
      return items.filter(function (ch) { return !!emoFile(ch); });
    };
    /* W29b: UNA sola lista con subtítulos por categoría ("Recientes:",
       "Caras y emociones:", …); la búsqueda plana reemplaza la lista. */
    const sections = Vue.computed(function () {
      if (q.value.trim()) return [];
      const rec = usable(emojiRecent());
      const out = [];
      if (rec.length) out.push({ id: 'recientes', label: 'Recientes', items: rec });
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].id === 'recientes') continue;
        const items = usable(emojiCat(cats[i].id));
        if (items.length) {
          out.push({ id: cats[i].id, label: cats[i].name, items: items });
        }
      }
      return out;
    });
    const flat = Vue.computed(function () {
      return q.value.trim() ? usable(emojiSearch(q.value)) : [];
    });
    const empty = Vue.computed(function () {
      return q.value.trim() ? t('Sin coincidencias.') : t('Aún no usas emojis.');
    });
    const pick = function (ch) {
      emojiPush(ch);          // recientes compartidos entre ambos usos
      ctxEmit.emit('pick', ch);
    };
    /* W29b: clic en el ícono de categoría → salta la lista a ella. */
    const scrollEl = Vue.ref(null);
    const jump = function (id) {
      q.value = '';
      tab.value = id;
      Vue.nextTick(function () {
        const sc = scrollEl.value;
        const el = sc && sc.querySelector('#ep-' + id);
        if (sc && el) sc.scrollTop = el.offsetTop;
      });
    };
    /* W29b: al pasar de sección (o al saltar) el ícono activo se ilumina. */
    const onScroll = function () {
      if (q.value.trim()) return;
      const sc = scrollEl.value;
      if (!sc) return;
      const subs = sc.querySelectorAll('.ep-sub');
      const list = sections.value;
      if (!list.length) return;
      let cur = list[0].id;
      for (let i = 0; i < subs.length; i++) {
        if (subs[i].offsetTop <= sc.scrollTop + 4) {
          cur = subs[i].id.slice(3);
        }
      }
      tab.value = cur;
    };
    const fileOf = function (ch) { return emoFile(ch); };
    const srcOf = function (ch) { return emoSrc(ch); };
    const titleOf = function (ch) { return emojiCode(ch); };
    /* En modo nativo no hay archivo: se pinta el glyph. En Noto/Twemoji
       nunca se cae al glyph del sistema (eso era la mezcla). */
    const emoSystem = Vue.computed(function () { return emoStyle() === 'system'; });
    /* W16: el panel queda fijo y clampeado al área de mensajes; se recalcula
       al abrir (sin la animación de entrada) y al redimensionar la ventana. */
    const rootEl = Vue.ref(null);
    const doClamp = function (first) {
      clampPanel(rootEl.value, !!first);
    };
    /* W29g: embebido, el padre (.st-panel) hace el clamp; aquí la
       posición no se toca. W57: anchored = el picker de reacciones ya
       viaja teletransportado y lo coloca su contenedor. */
    const noClamp = function () { return props.embed || props.anchored; };
    if (!noClamp()) Vue.onMounted(function () { doClamp(true); });
    const onPanelResize = function () { if (!noClamp()) doClamp(false); };
    window.addEventListener('resize', onPanelResize);
    /* W16: el panel puede crecer después de montar (fuentes, lista, etc.):
       el ResizeObserver vuelve a ajustarlo, dejando pasar la animación
       de entrada (140 ms) para no medir a mitad del transform. */
    let roTimer = 0;
    const roPanel = new ResizeObserver(function () {
      clearTimeout(roTimer);
      roTimer = setTimeout(function () { if (!noClamp()) doClamp(false); }, 180);
    });
    if (!noClamp()) Vue.onMounted(function () { roPanel.observe(rootEl.value); });
    Vue.onUnmounted(function () {
      window.removeEventListener('resize', onPanelResize);
      clearTimeout(roTimer);
      roPanel.disconnect();
    });
    return { q, tab, cats, sections, flat, empty, pick, t, rootEl,
             scrollEl, jump, onScroll, fileOf, srcOf, titleOf, emoSystem };
  },
  template:
    '<div class="emo-picker" ref="rootEl" @click.stop>' +
      '<div class="ep-search">' +
        '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
        '<input v-model="q" :placeholder="t(\'Buscar emoji\')" ' +
          ':aria-label="t(\'Buscar emoji\')" @keydown.esc.stop="q = \'\'">' +
        '<button class="clr-x" :class="{ show: !!q }" type="button" ' +
          ':title="t(\'Borrar\')" @click="q = \'\'">' +
          '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
      '</div>' +
      '<div class="ep-body">' +
        '<div class="ep-cats">' +
          '<button class="ep-cat" v-for="c in cats" :key="c.id" ' +
            ':class="{ on: !q.trim() && tab === c.id }" type="button" ' +
            ':title="t(c.name)" @click="jump(c.id)">' +
            '<img v-if="fileOf(c.icon)" class="emo" :src="srcOf(c.icon)" ' +
              'alt="" loading="lazy">' +
            '<span v-else-if="emoSystem">{{ c.icon }}</span>' +
          '</button>' +
        '</div>' +
        '<div class="ep-scroll" ref="scrollEl" @scroll.passive="onScroll">' +
          '<template v-if="!q.trim()">' +
            '<div class="ep-sec" v-for="s in sections" :key="s.id">' +
              '<div class="ep-sub" :id="\'ep-\' + s.id">{{ t(s.label) }}:</div>' +
              '<div class="ep-grid">' +
                '<button class="ep-e" type="button" v-for="e in s.items" ' +
                  ':key="e" @click="pick(e)" :title="titleOf(e)">' +
                  '<img v-if="fileOf(e)" class="emo" :src="srcOf(e)" ' +
                    'alt="" loading="lazy">' +
                  '<span v-else-if="emoSystem">{{ e }}</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</template>' +
          '<div class="ep-grid" v-else>' +
            '<button class="ep-e" type="button" v-for="e in flat" :key="e" ' +
              '@click="pick(e)" :title="titleOf(e)">' +
              '<img v-if="fileOf(e)" class="emo" :src="srcOf(e)" ' +
                'alt="" loading="lazy">' +
              '<span v-else-if="emoSystem">{{ e }}</span>' +
            '</button>' +
          '</div>' +
          '<div class="ep-empty" v-if="!q.trim() ? !sections.length : !flat.length">' +
            '{{ empty }}</div>' +
        '</div>' +
      '</div>' +
    '</div>',
};
