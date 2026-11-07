/* PeoplePanel — extraído de views/chat.js (Fase 3.1). */
import {
  acceptFriendRequest, cancelFriendRequest, createDm, mediaUrl, openChat, rejectFriendRequest, searchUsers, sendFriendRequest,
} from '../../actions.js';
import { api } from '../../api.js';
import { t } from '../../i18n.js';
import {
  store, toast,
} from '../../store.js';
import {
  dotClass, presetLabel, toastErr, pickOffLine,
} from '../../views/helpers.js';
import Vue from '../../vue.js';

export const PeoplePanel = {
  name: 'PeoplePanel',
  setup: function () {
    /* W27c: la pestaña vive en el store: la opción "Personas" del
       sidebar (o abrir un chat) la devuelve a la pantalla principal. */
    const tab = Vue.computed({
      get: function () { return store.peopleTab; },
      set: function (v) { store.peopleTab = v; },
    });
    const q = Vue.ref('');
    const results = Vue.ref([]);

    const people = Vue.computed(function () {
      return store.people || { friends: [], sent: [], received: [] };
    });
    const nReq = Vue.computed(function () {
      return people.value.received.length;
    });
    const loaded = Vue.computed(function () { return !!store.people; });

    const friendOn = function (u) {
      return !!(u && (store.presence[u.id] != null ? store.presence[u.id] : u.online));
    };
    const lineOf = function (u) {
      if (!friendOn(u)) return t('Desconectado');
      if (u.status_text) return u.status_text;
      if (u.status_preset) return presetLabel(u.status_preset);
      return t('En línea');
    };

    /* W27e: Activos muestra SOLO amigos conectados. "Ausente" (busy)
       y "No molestar" (dnd) son estados de quien está en línea, así
       que sus filas siguen aquí; los desconectados no aparecen (los
       invisibles ya llegan marcados como desconectados por el server). */
    const activeOnline = Vue.computed(function () {
      const fs = people.value.friends;
      const out = [];
      for (let i = 0; i < fs.length; i++) if (friendOn(fs[i])) out.push(fs[i]);
      return out;
    });

    /* W66e: "nadie en línea" (con amigos pero todos desconectados) →
       frase aleatoria con icono grande. Se renueva cada vez que la lista
       queda vacía; la inicial ya viene al azar en cada carga. */
    const nobodyOnline = Vue.computed(function () {
      return loaded.value && people.value.friends.length > 0
        && !activeOnline.value.length;
    });
    const emptyLine = Vue.ref(pickOffLine());
    Vue.watch(nobodyOnline, function (on) {
      if (on) emptyLine.value = pickOffLine(emptyLine.value);
    });

    /* Búsqueda de personas para enviar solicitud (mismo debounce que la
       lupa de chats: 300 ms y mínimo 2 caracteres).
       W68: una query de EXACTAMENTE 16 dígitos busca por ID público. */
    let timer = 0;
    Vue.watch(q, function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        const s = q.value.trim();
        if (s.length < 2) { results.value = []; return; }
        if (/^\d{16}$/.test(s)) {
          api('GET', '/users/pub/' + s).then(function (r) {
            results.value = r && r.user ? [r.user] : [];
          }).catch(function () {
            results.value = [];
          });
          return;
        }
        searchUsers(s).then(function (rs) {
          results.value = rs;
        }).catch(function () {
          results.value = [];
        });
      }, 300);
    });

    const isFriend = function (u) {
      const fs = people.value.friends;
      for (let i = 0; i < fs.length; i++) if (fs[i].id === u.id) return true;
      return false;
    };
    const sentTo = function (u) {
      const rs = people.value.sent;
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user && rs[i].user.id === u.id) return rs[i].id;
      }
      return 0;
    };

    const run = function (fn, okMsg) {
      Promise.resolve(fn()).then(function () {
        if (okMsg) toast(okMsg, 'ok');
      }).catch(function (err) {
        toastErr(err, 'No se pudo completar la acción');
      });
    };

    /* Clic en un amigo: abre el DM (o lo crea si aún no existe). */
    const openFriend = function (u) {
      for (let i = 0; i < store.chats.length; i++) {
        const c = store.chats[i];
        if (c.type === 'dm' && c.title && c.title.id === u.id) {
          openChat(c.id);
          return;
        }
      }
      run(function () { return createDm(u.username); });
    };

    const send = function (u) {
      run(function () { return sendFriendRequest(u.username); }, 'Solicitud enviada');
    };
    const cancel = function (r) {
      run(function () { return cancelFriendRequest(r.id); });
    };
    const reject = function (r) {
      run(function () { return rejectFriendRequest(r.id); });
    };
    /* Aceptar crea (o abre) el DM y salta a la pestaña Chats con el chat
       listo (acceptFriendRequest lo hace en actions). */
    const accept = function (r) {
      run(function () { return acceptFriendRequest(r.id); });
    };

    /* W27b: en Solicitudes la búsqueda filtra las listas. */
    const qReq = Vue.ref('');
    const matchR = function (r) {
      const s = qReq.value.trim().toLowerCase();
      if (!s) return true;
      const u = r.user || {};
      return (u.display_name || '').toLowerCase().indexOf(s) >= 0 ||
        (u.username || '').toLowerCase().indexOf(s) >= 0;
    };
    const sentF = Vue.computed(function () {
      return people.value.sent.filter(matchR);
    });
    const recF = Vue.computed(function () {
      return people.value.received.filter(matchR);
    });
    /* "Buscar personas": mismo efecto que el ＋ del sidebar (abre el
       modal de chat nuevo con la búsqueda de personas). */
    const buscarPersonas = function () {
      store.newChatMode = 'dm';
      store.newChatOpen = true;
    };

    return {
      store, tab, q, results, people, nReq, loaded, activeOnline,
      nobodyOnline, emptyLine,   /* W66e: frase aleatoria "sin nadie" */
      lineOf, isFriend, sentTo, openFriend, send, cancel, reject, accept,
      qReq, sentF, recF, buscarPersonas,
      dotClass, mediaUrl,
    };
  },
  template: `
    <div class="ppl">
      <!-- W66f: iconito delante del texto en cada pestaña -->
      <div class="ppl-tabs">
        <button class="ppl-tab" type="button" :class="{ on: tab === 'active' }"
          @click="tab = 'active'">
          <svg class="ic tab-ic" aria-hidden="true"><use href="#i-users"></use></svg>
          {{ t('Activos') }}</button>
        <button class="ppl-tab" type="button" :class="{ on: tab === 'req' }"
          @click="tab = 'req'">
          <svg class="ic tab-ic" aria-hidden="true"><use href="#i-userplus"></use></svg>
          {{ t('Solicitudes') }}
          <i class="ppl-badge" v-if="nReq">{{ nReq }}</i></button>
      </div>

      <template v-if="tab === 'active'">
        <div class="search-pill ppl-find">
          <svg class="ic ic-sm"><use href="#i-search"></use></svg>
          <input v-model="q" :placeholder="t('Buscar personas por usuario')"
            :aria-label="t('Buscar personas por usuario')">
          <button class="clr-x" :class="{ show: !!q }" type="button"
            :title="t('Borrar')" @click="q = ''">
            <svg class="ic ic-xs"><use href="#i-x"></use></svg></button>
        </div>

        <div class="ppl-list" v-if="q.trim().length >= 2">
          <div class="ppl-row" v-for="u in results" :key="u.id">
            <span class="av-wrap" :class="dotClass(u)">
              <span class="avatar av36" :class="{ 'has-photo': !!u.avatar_url }">
                <img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">
                <span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>
              </span>
            </span>
            <span class="ppl-col">
              <b>{{ u.display_name || u.username }}</b>
              <i>@{{ u.username }}</i>
            </span>
            <span class="ppl-acts">
              <button class="btn btn-xs" v-if="isFriend(u)" type="button"
                @click="openFriend(u)">{{ t('Mensaje') }}</button>
              <button class="btn btn-xs btn-ghost" v-else-if="sentTo(u)" type="button"
                disabled>{{ t('Solicitud enviada') }}</button>
              <button class="btn btn-xs" v-else type="button"
                @click="send(u)">{{ t('Enviar solicitud') }}</button>
            </span>
          </div>
          <div class="list-empty" v-if="!results.length">{{ t('Sin resultados') }}</div>
        </div>

        <div class="ppl-list" v-else>
          <button class="ppl-row" type="button" v-for="u in activeOnline" :key="u.id"
            @click="openFriend(u)">
            <span class="av-wrap" :class="dotClass(u)">
              <span class="avatar av36" :class="{ 'has-photo': !!u.avatar_url }">
                <img v-if="u.avatar_url" :src="mediaUrl(u.avatar_url)" alt="" loading="lazy">
                <span v-else>{{ (u.display_name || u.username).charAt(0).toUpperCase() }}</span>
              </span>
            </span>
            <span class="ppl-col">
              <b>{{ u.display_name || u.username }}</b>
              <i>{{ lineOf(u) }}</i>
            </span>
          </button>
          <div class="list-empty" v-if="loaded && !people.friends.length">
            {{ t('Aún no tienes amigos. ¡Busca personas arriba para empezar!') }}
          </div>
          <!-- W66e: icono grande + frase aleatoria (directa o con humor) -->
          <div class="list-empty empty-mood" v-else-if="nobodyOnline">
            <svg class="ic mood-ic" aria-hidden="true"><use href="#i-users"></use></svg>
            <p class="mood-line">{{ t(emptyLine) }}</p>
            <p class="mood-sub">{{ t('Cuando tus contactos se conecten, aparecerán en esta lista.') }}</p>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="search-pill ppl-find">
          <svg class="ic ic-sm"><use href="#i-search"></use></svg>
          <input v-model="qReq" :placeholder="t('Buscar solicitudes')"
            :aria-label="t('Buscar solicitudes')">
          <button class="clr-x" :class="{ show: !!qReq }" type="button"
            :title="t('Borrar')" @click="qReq = ''">
            <svg class="ic ic-xs"><use href="#i-x"></use></svg></button>
        </div>
        <div class="ppl-cta">
          <button class="btn btn-ghost btn-full" type="button" @click="buscarPersonas">
            <svg class="ic ic-sm"><use href="#i-plus"></use></svg>{{ t('Buscar personas') }}
          </button>
        </div>
        <div class="ppl-list">
          <template v-if="sentF.length">
            <div class="mi-sec mi-sec-always"><span>{{ t('Enviados') }}</span></div>
            <div class="ppl-row" v-for="r in sentF" :key="'s' + r.id">
              <span class="av-wrap" :class="dotClass(r.user)">
                <span class="avatar av36" :class="{ 'has-photo': !!r.user.avatar_url }">
                  <img v-if="r.user.avatar_url" :src="mediaUrl(r.user.avatar_url)" alt="" loading="lazy">
                  <span v-else>{{ (r.user.display_name || r.user.username).charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <span class="ppl-col">
                <b>{{ r.user.display_name || r.user.username }}</b>
                <i>@{{ r.user.username }}</i>
              </span>
              <span class="ppl-acts">
                <button class="btn btn-xs btn-ghost" type="button"
                  @click="cancel(r)">{{ t('Cancelar') }}</button>
              </span>
            </div>
          </template>
          <template v-if="recF.length">
            <div class="mi-sec mi-sec-always"><span>{{ t('Recibidas') }}</span></div>
            <div class="ppl-row" v-for="r in recF" :key="'r' + r.id">
              <span class="av-wrap" :class="dotClass(r.user)">
                <span class="avatar av36" :class="{ 'has-photo': !!r.user.avatar_url }">
                  <img v-if="r.user.avatar_url" :src="mediaUrl(r.user.avatar_url)" alt="" loading="lazy">
                  <span v-else>{{ (r.user.display_name || r.user.username).charAt(0).toUpperCase() }}</span>
                </span>
              </span>
              <span class="ppl-col">
                <b>{{ r.user.display_name || r.user.username }}</b>
                <i>@{{ r.user.username }}</i>
              </span>
              <span class="ppl-acts">
                <button class="btn btn-xs" type="button"
                  @click="accept(r)">{{ t('Aceptar') }}</button>
                <button class="btn btn-xs btn-ghost" type="button"
                  @click="reject(r)">{{ t('Rechazar') }}</button>
              </span>
            </div>
          </template>
          <div class="list-empty" v-if="!sentF.length && !recF.length && qReq.trim()">
            {{ t('Sin resultados') }}
          </div>
          <!-- W66f: sin solicitudes → icono + frase amable (la búsqueda
               vacía se queda con "Sin resultados" de siempre). -->
          <div class="list-empty empty-mood" v-else-if="!sentF.length && !recF.length">
            <svg class="ic mood-ic" aria-hidden="true"><use href="#i-userplus"></use></svg>
            <p class="mood-line">{{ t('Parece que aún no hay solicitudes. ¡Pronto serás famoso!') }}</p>
          </div>
        </div>
      </template>
    </div>`,
};