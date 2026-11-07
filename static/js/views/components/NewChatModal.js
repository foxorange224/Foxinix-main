/* NewChatModal — crear chat DM, grupo o agregar miembro al grupo activo.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../store.js';
import { toastErr } from '../helpers.js';
import {
  loadPeople, searchUsers, addMember, acceptFriendRequest,
  sendFriendRequest, createDm, createGroup, mediaUrl,
} from '../../actions.js';

export const NewChatModal = {
  setup: function () {
    const q = Vue.ref('');
    const results = Vue.ref([]);
    const inputEl = Vue.ref(null);
    const gtitle = Vue.ref('');
    const picked = Vue.ref([]);   // modo group: [{id, username, display_name, avatar_url}]
    let timer = null;

    Vue.onMounted(function () {
      // inputEl es un ref: el foco se le pide al .value (antes fallaba
      // con TypeError y el autofocus nunca funcionaba).
      if (inputEl.value) inputEl.value.focus();
      // Para decidir «Mensaje» vs «Enviar solicitud» hacen falta las
      // amistades; si el panel Personas aún no cargó, se piden ahora.
      if (!store.people) loadPeople().catch(function () {});
    });

    const title = Vue.computed(function () {
      if (store.newChatMode === 'group') return t('Nuevo grupo');
      if (store.newChatMode === 'add') return t('Agregar al grupo');
      return t('Nuevo chat');
    });

    const onQuery = function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 300);
    };

    const run = async function () {
      if (q.value.trim().length < 2) { results.value = []; return; }
      try {
        results.value = await searchUsers(q.value);
      } catch (e) { results.value = []; }
    };

    const isFriend = function (u) {
      const fs = (store.people && store.people.friends) || [];
      for (let i = 0; i < fs.length; i++) if (fs[i].id === u.id) return true;
      return false;
    };
    const sentTo = function (u) {
      const rs = (store.people && store.people.sent) || [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user && rs[i].user.id === u.id) return true;
      }
      return false;
    };
    const receivedFrom = function (u) {
      const rs = (store.people && store.people.received) || [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user && rs[i].user.id === u.id) return rs[i];
      }
      return null;
    };

    /* dm: crear chat (solo amigos); group: sumar a la selección;
       add: agregar al grupo. */
    const pick = async function (u) {
      const mode = store.newChatMode;
      if (mode === 'group') {
        let found = -1;
        for (let i = 0; i < picked.value.length; i++) {
          if (picked.value[i].id === u.id) found = i;
        }
        if (found >= 0) picked.value.splice(found, 1);
        else picked.value.push(u);
        q.value = '';
        results.value = [];
        if (inputEl.value) inputEl.value.focus();
        return;
      }
      if (mode === 'add') {
        try {
          await addMember(store.activeChatId, u.username);
          close();
        } catch (e) {
          toastErr(e, 'No se pudo agregar');
        }
        return;
      }
      /* Regla del producto: sin solicitud aceptada no se abre un MD.
         Si aún no son amigos, este click envía la solicitud. */
      if (!isFriend(u)) {
        if (sentTo(u)) {
          toast(t('Ya enviaste una solicitud a @{n}', { n: u.username }), 'info');
          return;
        }
        const incoming = receivedFrom(u);
        if (incoming) {
          try {
            await acceptFriendRequest(incoming.id);
            toast('Solicitud aceptada', 'ok');
            q.value = '';
            results.value = [];
          } catch (e) {
              toastErr(e, 'No se pudo aceptar la solicitud');
          }
          return;
        }
        try {
          await sendFriendRequest(u.username);
          q.value = '';
          results.value = [];
          /* W65: el flujo ＋ usa el mismo modal que un enlace directo. */
          close();
          store.requestSent = {
            username: u.username,
            display_name: u.display_name || u.username,
          };
        } catch (e) {
          toastErr(e, 'No se pudo enviar la solicitud');
        }
        return;
      }
      try {
        await createDm(u.username);
      } catch (e) {
        toastErr(e, 'No se pudo crear el chat');
      }
    };

    const unpick = function (u) {
      for (let i = 0; i < picked.value.length; i++) {
        if (picked.value[i].id === u.id) { picked.value.splice(i, 1); return; }
      }
    };

    const isSelected = function (u) {
      for (let i = 0; i < picked.value.length; i++) {
        if (picked.value[i].id === u.id) return true;
      }
      return false;
    };

    const createTheGroup = async function () {
      const gname = gtitle.value.trim();
      if (!gname) { toast('Escribe un nombre para el grupo', 'err'); return; }
      try {
        const names = picked.value.map(function (u) { return u.username; });
        await createGroup(gname, names);
      } catch (e) {
        toastErr(e, 'No se pudo crear el grupo');
      }
    };

    const pickFirst = function () {
      if (results.value.length) pick(results.value[0]);
    };

    const close = function () { store.newChatOpen = false; };

    return {
      store, title, q, results, inputEl, gtitle, picked,
      onQuery, pick, pickFirst, unpick, isSelected, isFriend, sentTo,
      receivedFrom,
      createTheGroup, close, mediaUrl,
    };
  },
  template:
    '<div class="modal-veil" @click.self="close">' +
      '<div class="modal" role="dialog" :aria-label="title">' +
        '<header>{{ title }}' +
          '<button class="icon-btn" type="button" :title="t(\'Cerrar\')" @click="close">' +
            '<svg class="ic"><use href="#i-x"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="m-tabs" v-if="store.newChatMode !== \'add\'">' +
          '<button class="m-tab" type="button" :class="{ on: store.newChatMode === \'dm\' }" ' +
            '@click="store.newChatMode = \'dm\'">{{ t(\'Chat\') }}</button>' +
          '<button class="m-tab" type="button" :class="{ on: store.newChatMode === \'group\' }" ' +
            '@click="store.newChatMode = \'group\'">{{ t(\'Grupo\') }}</button>' +
        '</div>' +
        '<div class="m-title" v-if="store.newChatMode === \'group\'">' +
          '<input v-model="gtitle" :placeholder="t(\'Nombre del grupo (máx. 60)\')" maxlength="60">' +
        '</div>' +
        '<div class="g-chips" v-if="store.newChatMode === \'group\' && picked.length">' +
          '<span class="g-chip" v-for="u in picked" :key="u.id">' +
            '{{ u.display_name || u.username }}' +
            '<button type="button" :title="t(\'Quitar\')" @click="unpick(u)">' +
              '<svg class="ic ic-xs"><use href="#i-x"></use></svg>' +
            '</button>' +
          '</span>' +
        '</div>' +
        '<div class="m-search">' +
          '<svg class="ic ic-sm"><use href="#i-search"></use></svg>' +
          '<input ref="inputEl" v-model="q" :placeholder="t(\'Buscar por nombre o usuario…\')" ' +
            '@input="onQuery" @keydown.enter.prevent="pickFirst">' +
          '<button class="clr-x" :class="{ show: !!q }" type="button" ' +
            ':title="t(\'Borrar\')" @click="q = \'\'; onQuery()">' +
            '<svg class="ic ic-xs"><use href="#i-x"></use></svg></button>' +
        '</div>' +
        '<div class="results">' +
          '<button class="res-item" type="button" v-for="u in results" :key="u.id" @click="pick(u)">' +
            '<span class="avatar av36" :class="{ \'has-photo\': !!u.avatar_url }">' +
              '<img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">' +
              '<span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>' +
            '</span>' +
            '<span class="ri-col"><span class="ri-name">{{ u.display_name }}</span>' +
            '<span class="ri-user">@{{ u.username }}' +
              '<span v-if="store.newChatMode === \'dm\' && !isFriend(u)"> · ' +
                '{{ sentTo(u) ? t(\'Solicitud pendiente\') : receivedFrom(u) ? t(\'Aceptar solicitud\') : t(\'Enviar solicitud\') }}</span>' +
            '</span></span>' +
            '<svg class="ic ic-sm ri-check" v-if="store.newChatMode === \'group\' && isSelected(u)">' +
              '<use href="#i-check"></use></svg>' +
            '<svg class="ic ic-sm ri-check" v-else-if="store.newChatMode === \'dm\' && !isFriend(u)">' +
              '<use href="#i-userplus"></use></svg>' +
          '</button>' +
          '<div class="res-empty" v-if="q.trim().length >= 2 && !results.length">{{ t(\'Sin resultados\') }}</div>' +
          '<div class="res-empty dim" v-else-if="q.trim().length < 2">{{ t(\'Escribe al menos 2 letras\') }}</div>' +
        '</div>' +
        '<div class="m-foot" v-if="store.newChatMode === \'group\'">' +
          '<button class="btn" type="button" :disabled="!gtitle.trim()" @click="createTheGroup">' +
            '{{ t(\'Crear grupo\') }}</button>' +
        '</div>' +
      '</div>' +
    '</div>',
};
