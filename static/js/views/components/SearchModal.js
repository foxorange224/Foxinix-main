/* SearchModal — buscar mensajes dentro del chat (W13).
   El estado de apertura vive en store.searchOpen (lo alterna la cabecera
   del chat); el componente gestiona la consulta y los resultados.
   Al elegir un resultado emite 'jump' con el mensaje: el scroll lo hace
   el shell (necesita su lista de mensajes y su ventana de render).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';
import { api } from '../../api.js';
import { fmtTime } from '../helpers.js';

export const SearchModal = {
  emits: ['jump'],
  setup: function (props, ctx) {
    const q = Vue.ref('');
    const results = Vue.ref([]);
    const busy = Vue.ref(false);
    const err = Vue.ref('');
    let timer = null;

    const close = function () { store.searchOpen = false; };

    /* W37b: al abrir el modal, el cursor queda listo para escribir. */
    Vue.onMounted(function () {
      Vue.nextTick(function () {
        const el = document.querySelector('.search-modal input');
        if (el) el.focus();
      });
    });

    const runSearch = async function () {
      const needle = q.value.trim();
      const cid = store.activeChatId;
      if (!needle) { results.value = []; err.value = ''; return; }
      busy.value = true;
      err.value = '';
      try {
        const r = await api('GET',
          '/chats/' + cid + '/search?q=' + encodeURIComponent(needle));
        /* respuesta tardía de un chat o búsqueda que ya no aplica */
        if (cid === store.activeChatId && needle === q.value.trim()) {
          results.value = r.messages || [];
        }
      } catch (e) {
        err.value = (e && t(e.detail)) || t('No se pudo buscar');
      } finally {
        busy.value = false;
      }
    };

    const onInput = function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runSearch, 300);
    };

    const snippet = function (m) {
      /* W45: defensa extra para servidores viejos que aún devolvían el
         cuerpo del spoiler en la búsqueda. */
      if (m.spoiler) return t('Spoiler');
      const b = (m.body || '').replace(/\s+/g, ' ').trim();
      return b.length > 90 ? b.slice(0, 90) + '…' : b;
    };

    const time = function (ts) {
      return fmtTime(new Date(ts * 1000));
    };

    const jump = function (m) {
      ctx.emit('jump', m);
    };

    Vue.onUnmounted(function () {
      if (timer) clearTimeout(timer);
    });

    return { store, t, q, results, busy, err, close, onInput, snippet, time, jump };
  },
  template:
    /* W37b: es un MODAL (no un panel lateral que empujaba el chat).
       W37c: anima apertura y cierre como el resto. */
    '<div class="modal-veil" @click.self="close">' +
      '<div class="modal search-modal" :aria-label="t(\'Buscar en el chat\')">' +
        '<header>' +
          '<b>{{ t(\'Buscar en el chat\') }}</b>' +
          '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="close">' +
            '<svg class="ic"><use href="#i-x"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="sp-body">' +
          '<div class="search-pill">' +
            '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
            '<input v-model="q" :placeholder="t(\'Buscar mensajes\')" ' +
              ':aria-label="t(\'Buscar mensajes\')" @input="onInput">' +
            '<button class="clr-x" :class="{ show: !!q }" type="button" ' +
              ':title="t(\'Borrar\')" @click="q = \'\'; onInput()">' +
              '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
          '</div>' +
          '<div class="sp-res" role="button" tabindex="0" v-for="m in results" :key="m.id" ' +
            '@click="jump(m)" @keydown.enter="jump(m)">' +
            '<span class="spr-top">' +
              '<b>{{ m.sender ? (m.sender.display_name || m.sender.username) : \'\' }}</b>' +
              '<span class="spr-time">{{ time(m.created_at) }}</span>' +
            '</span>' +
            '<span class="spr-text">{{ snippet(m) }}</span>' +
          '</div>' +
          '<div class="sp-empty" v-if="err">{{ err }}</div>' +
          '<div class="sp-empty" v-else-if="busy">{{ t(\'Buscando…\') }}</div>' +
          '<div class="sp-empty" v-else-if="!q.trim()">' +
            '{{ t(\'Escribe para buscar en los mensajes de este chat.\') }}</div>' +
          '<div class="sp-empty" v-else-if="!results.length">{{ t(\'Sin resultados.\') }}</div>' +
        '</div>' +
      '</div>' +
    '</div>',
};
