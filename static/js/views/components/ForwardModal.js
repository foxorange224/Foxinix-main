/* ForwardModal — reenviar un mensaje a otro chat (W13).
   El mensaje a reenviar vive en store.fwdFor ({msg, src}); el componente
   gestiona la búsqueda y el envío.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';
import { chatTitle, forwardMessage } from '../../actions.js';
import { avatarOf, initialsOf } from '../helpers.js';

export const ForwardModal = {
  setup: function () {
    const q = Vue.ref('');
    const busy = Vue.ref(false);

    const close = function () {
      store.fwdFor = null;
    };

    /* Chats destino: todos menos el de origen, filtrados por la búsqueda. */
    const chats = Vue.computed(function () {
      const f = store.fwdFor;
      if (!f) return [];
      const needle = q.value.trim().toLowerCase();
      return store.chats.filter(function (c) {
        if (c.id === f.src) return false;   // el chat origen no es destino
        if (!needle) return true;
        return chatTitle(c).toLowerCase().indexOf(needle) >= 0;
      });
    });

    const doForward = async function (targetId) {
      const f = store.fwdFor;
      if (!f || busy.value) return;
      busy.value = true;
      try {
        await forwardMessage(f.src, f.msg.id, targetId);
        store.fwdFor = null;
        q.value = '';
      } catch (e) { /* toast ya mostrado en actions */ }
      finally { busy.value = false; }
    };

    return { store, t, q, busy, chats, close, doForward, avatarOf, initialsOf, titleOf: chatTitle };
  },
  template:
    '<div class="modal-veil" @click.self="close">' +
      '<div class="modal fwd" role="dialog" :aria-label="t(\'Reenviar mensaje\')">' +
        '<header>{{ t(\'Reenviar mensaje\') }}' +
          '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="close">' +
            '<svg class="ic"><use href="#i-x"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="m-search">' +
          '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
          '<input v-model="q" :placeholder="t(\'Buscar en la lista…\')" ' +
            ':aria-label="t(\'Buscar en la lista…\')">' +
          '<button class="clr-x" :class="{ show: !!q }" type="button" ' +
            ':title="t(\'Borrar\')" @click="q = \'\'">' +
            '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
        '</div>' +
        '<div class="results fwd-list">' +
          '<button class="res-item" type="button" v-for="c in chats" :key="c.id" ' +
            ':disabled="busy" @click="doForward(c.id)">' +
            '<span class="avatar av36" :class="{ \'has-photo\': !!avatarOf(c) }">' +
              '<img v-if="avatarOf(c)" :src="avatarOf(c)" alt="" loading="lazy">' +
              '<span v-else>{{ initialsOf(c) }}</span>' +
            '</span>' +
            '<span class="ri-col"><span class="ri-name">{{ titleOf(c) }}</span>' +
            '<span class="ri-user">{{ c.type === \'group\' ? t(\'Grupo\') : t(\'Chat\') }}</span></span>' +
          '</button>' +
          '<div class="list-empty" v-if="!chats.length">{{ t(\'Sin resultados.\') }}</div>' +
        '</div>' +
      '</div>' +
    '</div>',
};
