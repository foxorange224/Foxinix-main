/* W98: estado "Ausente" automático por inactividad.
   Si el usuario está "En línea" y no toca la app durante 3 minutos, la
   app cambia su estado a "Ausente" en el servidor (PUT /auth/profile —
   lo ven los demás); al volver a interactuar restaura "En línea".
   Reglas (decididas con el usuario):
     - Se SINCRONIZA: el cambio se guarda en el servidor, no es local.
     - Respeta los estados manuales: No molestar / Invisible / Ausente
       elegidos a mano nunca se tocan (solo se actúa sobre "En línea").
     - Una llamada activa suspende el mecanismo (quien está en llamada
       no está ausente).
   El backend hace merge parcial: enviar solo status_preset no pisa el
   status_text personalizado. */
import { store } from './store.js';
import { api, session, saveSession } from './api.js';
import { DomAdapter } from './platform/dom.js';

const IDLE_MS = 3 * 60 * 1000;
/* click (no mousedown) a propósito: si el usuario pulsa un preset en el
   selector, su handler corre primero (target) y mi listener en window
   después — así no restauro "En línea" justo antes de que él elija. */
const ACT_EVENTS = ['mousemove', 'click', 'keydown', 'wheel', 'touchstart', 'scroll'];

let timer = null;
let autoAway = false;

function currentPreset() {
  return (store.user && store.user.status_preset) || 'online';
}

function applyLocal(preset) {
  store.user = Object.assign({}, store.user, { status_preset: preset });
  session.user = store.user;
  saveSession();
}

/* Guarda el preset en el servidor y refleja la respuesta. */
function pushPreset(preset) {
  return api('PUT', '/auth/profile', { status_preset: preset }, { retry401: true })
    .then(function (r) {
      if (r && r.user) {
        store.user = Object.assign({}, store.user, r.user);
        session.user = store.user;
        saveSession();
      } else {
        applyLocal(preset);
      }
    });
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(goAway, IDLE_MS);
}

/* Lee el estado REAL del servidor y lo refleja en el store: otro
   dispositivo o pestaña pudo cambiarlo y este store quedaría
   desactualizado. Devuelve el preset del server o null si no hubo
   respuesta (p. ej. cuenta sin verificar →403 en /users/me). */
function fetchServerPreset() {
  return api('GET', '/users/me', undefined, { retry401: true })
    .then(function (r) {
      if (r && r.user) {
        store.user = Object.assign({}, store.user, r.user);
        session.user = store.user;
        saveSession();
        return r.user.status_preset || 'online';
      }
      return null;
    })
    .catch(function () { return null; });
}

function goAway() {
  if (!store.user) { schedule(); return; }                 // sin sesión: seguimos pendientes
  if (autoAway) return;
  if (currentPreset() !== 'online') { schedule(); return; } // estado manual: no se toca
  if (store.call && store.call.state === 'active') { schedule(); return; } // en llamada
  fetchServerPreset().then(function (server) {
    /* Confirmado con el servidor antes de actuar: si allí ya hay otro
       estado (No molestar puesto desde otro dispositivo, dnd a mano…),
       respetarlo. Sin respuesta se procede como antes — el PUT tiene
       su propio catch. */
    if (server !== null && server !== 'online') { schedule(); return; }
    if (autoAway || currentPreset() !== 'online') { schedule(); return; }
    autoAway = true;
    pushPreset('busy').catch(function () {
      autoAway = false;   // no se pudo guardar: seguimos viéndose "En línea"
      schedule();
    });
  });
}

function onActivity() {
  schedule();
  if (!autoAway) return;
  autoAway = false;
  fetchServerPreset().then(function (server) {
    /* Si en el servidor ya no es 'busy' (cambio a mano o desde otro
       dispositivo), no tocarlo. Sin respuesta se usa el último
       conocimiento local: 'busy' = lo puso este módulo. */
    if (server !== null && server !== 'busy') return;
    if (server === null && currentPreset() !== 'busy') return;
    pushPreset('online').catch(function () {
      autoAway = true;    // reintento en la próxima actividad
    });
  });
}

/** Arranca la detección (idempotente). Llamar una vez con la app montada. */
export function startPresence() {
  if (startPresence.done) return;
  startPresence.done = true;
  ACT_EVENTS.forEach(function (ev) {
    DomAdapter.addWindowEventListener(ev, onActivity, { passive: true });
  });
  /* Volver a la pestaña/ventana cuenta como actividad: quien vuelve a
     mirar la app no está ausente. Irse (hidden) no resetea el timer. */
  DomAdapter.addEventListener('visibilitychange', function () {
    if (!DomAdapter.getHidden()) onActivity();
  });
  schedule();
}
