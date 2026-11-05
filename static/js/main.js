/* Punto de entrada: crea la app Vue, conecta el router (W22: rutas
   reales con History API) y los toasts. */
import { store, syncPath, go as goRef, goReplace as goReplaceRef,
  setTheme, toggleTheme } from './store.js';
import { bootstrap, loadSession, API_BASE } from './api.js';
import { t } from './i18n.js';
import {
  BootView, LoginView, RegisterView, ProfileView,
  VerifyView, ForgotView, ResetView,
} from './views/auth.js';
import { ChatShell } from './views/chat.js';
import { BootScreen } from './views/bootscreen.js';
import { dlDirective, startDownload } from './mediadl.js';
import { startWS, stopWS, reconnectNow } from './realtime.js';
import { markChatRead } from './actions.js';
import {
  dlCategory, saveDownload, saveDownloadToDevice, listDownloads,
  deleteDownload, hasDownload, clearDownloads, autoDlPrefs, setAutoDl,
  DL_TYPES,
} from './downloads.js';
import { prefetchEmojis } from './emoji.js';

const views = {
  boot: BootView,
  login: LoginView,
  register: RegisterView,
  profile: ProfileView,
  verify: VerifyView,
  forgot: ForgotView,
  reset: ResetView,
  app: ChatShell,
};

const Root = {
  name: 'Root',
  setup() {
    const comp = Vue.computed(() => views[store.route] || LoginView);
    const isOnline = () => typeof navigator !== 'undefined' && navigator.onLine !== false;
    /* El overlay offline solo aparece si la conexión estuvo caída
       5+ segundos seguidos, así una reconexión rápida no lo muestra. */
    const offlineVisible = Vue.ref(false);
    const offlineReason = Vue.ref('server'); // 'server' | 'internet'
    let offlineTimer = null;
    /* Distinguir "sin internet" de "servidor caído": sin red lo dice
       navigator.onLine. W70: antes hacía fetch a Google, pero la CSP
       (connect-src 'self'…) lo bloqueaba SIEMPRE: salía un aviso en
       consola en cada overlay y el motivo quedaba en 'internet'. */
    const checkInternet = function () {
      return Promise.resolve(typeof navigator === 'undefined' ||
                              navigator.onLine !== false);
    };
    Vue.watch(() => store.ws, (val) => {
      if (val === 'on' || val === 'connecting') {
        offlineVisible.value = false;
        if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
      } else if (!offlineTimer) {
        offlineTimer = setTimeout(() => {
          checkInternet().then(function (hasNet) {
            offlineReason.value = hasNet ? 'server' : 'internet';
            offlineVisible.value = true;
          });
          offlineTimer = null;
        }, 5000);
      }
    });
    /* Sonda de desarrollo: reproducir el overlay sin cortar la red.
       En la consola:
         Foxinix.probe.offline('internet')  → "Sin conexión a internet"
         Foxinix.probe.offline('server')    → "Servidor caído"
         Foxinix.probe.offline('hide')       → cerrarlo
       Cancela el timer real para que no se cruce con una caída de verdad. */
    window.Foxinix = window.Foxinix || {};
    window.Foxinix.probe = window.Foxinix.probe || {};
    window.Foxinix.probe.offline = function (reason) {
      if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
      if (reason === 'hide') { offlineVisible.value = false; return; }
      offlineReason.value = reason === 'internet' ? 'internet' : 'server';
      offlineVisible.value = true;
    };
    Vue.onMounted(() => {
      // Orden: sesión → URL inicial (deep links) → arranque.
      loadSession();
      syncPath();
      bootstrap();
      // W62: check for new version (web + APK)
      setTimeout(() => {
        fetch(API_BASE + '/version').then(r => r.json()).then(v => {
          const isAndroid = !!(window.FoxinixAndroid);
          const srvWeb = v.web_version || '';
          const srvApk = v.apk_version || '';
          const localWeb = localStorage.getItem('fm.appVersion') || '0.0.0';
          // Web update is automatic on reload
          if (srvWeb && srvWeb !== localWeb) {
            localStorage.setItem('fm.appVersion', srvWeb);
            // For web, just reload
            window.location.reload(true);
          }
          if (isAndroid && srvApk) {
            /* Instalación fresca: el APK no expone su versión a la web y
               fm.apkVersion arranca vacío. Quien corre esta web dentro del
               APK con el campo vacío acaba de instalar la última APK
               publicada (las anteriores apuntaban al dominio viejo y ni
               cargan), así que se siembra con la versión del servidor y no
               se ofrece una "actualización" contra sí misma. Con valor
               previo (descarga hecha o versión real) se compara normal. */
            const storedApk = localStorage.getItem('fm.apkVersion');
            if (!storedApk) {
              localStorage.setItem('fm.apkVersion', srvApk);
            } else if (storedApk !== srvApk) {
              store.versionInfo = v;
              store.versionUpdate = true;
            }
          }
        }).catch(()=>{});
      }, 5000);
    });
        const startApkDownload = async () => {
      const v = store.versionInfo;
      if (!v || !v.apk_url) return;
      store.versionDownloading = true;
      store.versionProgress = 0;
      store.versionError = false;
      window.__foxinixApkProgress = (p) => { store.versionProgress = p; if (p >= 100) { store.versionDownloading = false; store.versionUpdate = false; localStorage.setItem('fm.apkVersion', v.apk_version); } };
      window.__foxinixApkDone = (ok) => { store.versionDownloading = false; if (!ok) { store.versionError = true; } else { store.versionUpdate = false; localStorage.setItem('fm.apkVersion', v.apk_version); } };
      if (window.FoxinixAndroid && window.FoxinixAndroid.downloadApk) {
        window.FoxinixAndroid.downloadApk(v.apk_url);
        return;
      }
      try {
        const res = await fetch(v.apk_url);
        const total = +res.headers.get('Content-Length') || 0;
        const reader = res.body.getReader();
        let received = 0;
        const chunks = [];
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (total) store.versionProgress = Math.round((received/total)*100);
        }
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Foxinix.apk';
        a.click();
        URL.revokeObjectURL(url);
        store.versionUpdate = false;
        localStorage.setItem('fm.apkVersion', v.apk_version);
      } catch(e) {
        store.versionDownloading = false;
        store.toasts.push({id: Date.now(), kind: 'err', msg: 'Error al descargar actualización' });
      }
    };
    return { comp, store, startApkDownload, isOnline, t, offlineVisible, offlineReason };
  },
  template: `
    <transition name="fade" mode="out-in">
      <component :is="comp" :key="store.route"></component>
    </transition>
    <!-- W62: overlay sin conexión / servidor caído -->
    <div v-if="offlineVisible" class="offline-overlay">
      <div class="offline-box offline-warning">
        <!-- "!" en círculo (i-alert de Material) para ambos casos:
             el motivo lo dice el título, no el glifo. -->
        <svg class="ic ic-lg"><use href="#i-alert"></use></svg>
        <h3>{{ offlineReason === 'internet' ? t('Sin conexión a internet') : t('Servidor caído') }}</h3>
        <p>{{ offlineReason === 'internet' ? t('Comprueba tu conexión a Internet.') : t('Conéctate más tarde, puede que estemos resolviendo un problema.') }}</p>
        <button class="btn" type="button" @click="store.ws = 'connecting'">{{ t('Reintentar') }}</button>
      </div>
    </div>
    <div v-if="store.versionUpdate" class="version-overlay">
      <div class="version-box">
        <svg class="ic ic-lg"><use href="#i-update"></use></svg>
        <h3>{{t('Actualización disponible')}}</h3>
        <p v-if="!store.versionDownloading && !store.versionError">{{t('Hay una nueva versión de Foxinix.')}}</p>
        <p v-if="store.versionError" class="err">{{t('La instalación fue cancelada o falló.')}}</p>
        <div v-if="store.versionDownloading">
          <p>{{t('Descargando...')}} {{store.versionProgress}}%</p>
          <div class="progress-bar"><div class="progress-fill" :style="{width: store.versionProgress + '%'}"></div></div>
        </div>
        <div class="version-actions">
          <button v-if="!store.versionDownloading" class="btn btn-primary" type="button" @click="startApkDownload()">{{t('Actualizar ahora')}}</button>
          <button v-if="store.versionError" class="btn btn-primary" type="button" @click="store.versionError=false; startApkDownload()">{{t('Reintentar')}}</button>
          <button class="btn btn-ghost" type="button" @click="store.versionUpdate = null; store.versionError = false">{{t('Recordar más tarde')}}</button>
        </div>
      </div>
    </div>
    <transition-group name="pop" tag="div" class="toasts">
      <div v-for="tw in store.toasts" :key="tw.id" class="toast"
           :class="'toast-' + tw.kind" role="status">
        <svg class="ic ic-sm"><use :href="tw.kind === 'err' ? '#i-alert' : (tw.kind === 'ok' ? '#i-check' : '#i-info')"></use></svg>
        <span>{{ t(tw.msg) }}</span>
        <button v-if="tw.kind === 'err' && tw.onRetry" class="btn btn-sm btn-ghost" type="button"
          :title="t('Intentar de nuevo')" @click="tw.onRetry()">
          {{ t('Intentar de nuevo') }}
        </button>
      </div>
    </transition-group>`,
};

/* Superficie los errores de render/hooks a consola: los captura shot.py
   (log.entryAdded) y los tests los ven como JS: [...] en stderr.
   W23: el stack de Firefox no trae el mensaje, así que va aparte. */
const app = Vue.createApp(Root);
app.config.errorHandler = function (err, _inst, info) {
  const msg = err && err.message ? err.message + ' | ' : '';
  console.error('[fox] ' + info + ' → ' + (msg + ((err && err.stack) || err)));
};
/* W10: t() disponible en TODOS los templates (lee store.lang reactivo, así
   que cambiar el idioma repinta la interfaz sin recargar). */
app.config.globalProperties.t = t;
/* W15: v-dl="url" → descarga con anillo de progreso, ✕ de cancelar y
   reintento (mediadl.js); en imágenes empieza difuminada con la miniatura. */
app.directive('dl', dlDirective);
/* W38: la pantalla de arranque (icono + barra + fase) se
   usa en BootView (auth.js) y en el overlay .app-boot del chat. */
app.component('boot-screen', BootScreen);
app.mount('#app');

/* W29a/W37a: el título del documento refleja los no leídos — "(3)
   Foxinix", con tope "999+" — pero SOLO con la pestaña OCULTA (otra
   pestaña o ventana minimizada): con la app a la vista el título
   queda limpio. Se recalcula al cambiar los no leídos Y al cambiar
   la visibilidad de la pestaña. */
function refreshTitle() {
  let n = 0;
  const chats = store.chats || [];
  for (let i = 0; i < chats.length; i++) n += chats[i].unread || 0;
  document.title = n > 0
    ? '(' + (n > 999 ? '999+' : n) + ') Foxinix'
    : 'Foxinix';
}
Vue.watchEffect(refreshTitle);
document.addEventListener('visibilitychange', refreshTitle);

/* W34d: el (N) del título sólo se quita al VISITAR el chat — al volver
   a la pestaña con un chat activo no leído cuenta como visita; con la
   pestaña oculta los mensajes ya no se confirman solos
   (finishIncoming no manda seen si document.hidden). */
document.addEventListener('visibilitychange', function () {
  if (document.hidden) return;
  if (store.activeChatId) markChatRead(store.activeChatId);
});

/* W70: al volver la red no hay por qué esperar al backoff de la WS (hasta
   30 s): si el arranque quedó colgado sin usuario cacheado se relanza, y
   la conexión se reintenta de inmediato. */
window.addEventListener('online', function () {
  if (store.hasSession && !store.user && store.route !== 'verify') bootstrap();
  reconnectNow();
});

/* W30b: tras iniciar sesión se precacenan los SVG del selector de
   emojis en idle (una sola vez por pestaña). */
Vue.watch(function () { return store.user && store.user.id; },
  function (uid) {
    if (!uid) return;
    prefetchEmojis();
  });

/* PWA (W4): el SW da shell offline + caché con actualización en segundo
   plano. En http no seguro (o sin soporte) el registro falla y listo.
   W40: el cliente le AVISA el estilo de emojis activo — el SW solo
   precarga el lote completo de Twemoji si el usuario lo usa (con
   'system' no se descarga NADA de emoji; 'noto' lo baja el cliente
   en idle con prefetchEmojis). */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function () {});
  const tellStyle = function () {
    const msg = { type: 'emo-style', style: store.prefs.emo };
    const c = navigator.serviceWorker.controller;
    if (c) { c.postMessage(msg); return; }
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage(msg);
    }).catch(function () {});
  };
  tellStyle();
  /* W40: al cambiar el estilo en Ajustes se avisa al SW y se lanza
     el prefetch del lote nuevo (si lo hay). */
  Vue.watch(function () { return store.prefs.emo; }, function () {
    tellStyle();
    prefetchEmojis();
  });
}

/* W78: toggle global de animaciones. Cuando store.prefs.noAnim se activa
   se añade la clase .no-anim a <html> y el CSS anula transitions,
   animations y backdrop-filter con !important. Se respeta al arranque y
   ante cada cambio del usuario en Ajustes. */
function applyNoAnim() {
  if (store.prefs.noAnim) {
    document.documentElement.classList.add('no-anim');
  } else {
    document.documentElement.classList.remove('no-anim');
  }
}
applyNoAnim();
Vue.watch(function () { return store.prefs.noAnim; }, applyNoAnim);

/* Ayuda de prueba/desarrollo: permite conducir la UI desde fuera
   (herramientas de screenshot, tests). No usar en lógica de producto. */
window.__fm = { store, go: goRef, goReplace: goReplaceRef, bootstrap,
                theme: setTheme, toggleTheme,
                rt: { start: startWS, stop: stopWS },
                dl: { dlCategory, saveDownload, saveDownloadToDevice,
                      listDownloads, deleteDownload, hasDownload,
                      clearDownloads, autoDlPrefs, setAutoDl,
                      types: DL_TYPES },
                mediadl: { startDownload } };

