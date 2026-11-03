/* Foxinix — W28h/W62/W64: llamadas de voz/video por WebRTC.

   1:1: el server solo relaya la señalización por la WS del chat (oferta,
   respuesta, ICE, colgar); el audio/video viajan P2P. El que llama suena
   en el otro lado y este acepta o rechaza.

   Grupos: malla P2P de hasta 4 personas (sin SFU). La sala es drop-in:
   call_start crea una sala con quien la abre aunque esté solo, call_state
   publica el aforo y cada persona entra voluntariamente con call_join.
   Nadie recibe llamada, tono ni pantalla de aceptar/rechazar.

   El estado reactivo vive en store.call (null | {chatId, peer, state,
   video, muted, camOff, startedAt, remote}); RTCPeerConnection y los
   MediaStream quedan FUERA del store (no son datos observables: Vue los
   envolvería en proxies y los métodos nativos se rompen).

   Estados 1:1: 'incoming' (suena el tono) → 'connecting' → 'active';
   el que llama empieza en 'outgoing'. Firefox 78: RTCPeerConnection y
   getUserMedia con promesas ✓ (el runner de tests inyecta micrófono y
   cámara falsos vía media.navigator.streams.fake). */
import { store, toast } from './store.js';
import { t } from './i18n.js';
import { ensurePermission } from './permissions.js';
/* W63: tono de llamada elegido en Ajustes. */
import { selectedToneSrc } from './tones.js';

let sendFn = null;          // lo inyecta realtime.js (su send() privado)
let pc = null;              // PeerConnection del 1:1
let localStream = null;
let remoteStream = null;
let cameraTrack = null;
let screenStream = null;
let screenTrack = null;
let pendingOffer = null;    // oferta entrante esperando "Contestar"
let ringTimer = null;       // tono de llamada entrante
let ringAudio = null;       // archivo de tono en reproducción
let callTimer = null;       // sin respuesta / conexión colgada
let iceQueue = [];          // candidatos del 1:1 antes de la remota
let actx = null;
let starting = false;       // getUserMedia en curso (evita doble clic)
let callGen = 0;            // invalida getUserMedia que termina tras colgar
const RING_TIMEOUT = 60000; // 60 s para contestar
const CONNECT_TIMEOUT = 45000; // 45 s para establecer la conexión
const GROUP_MAX = 4;

/* W62: malla de grupo. Cada par tiene su propia PeerConnection; los
   MediaStream y los ICE viven fuera de Vue (no son observables). */
const groupPCs = new Map();       // user_id -> {pc, stream, ice, video}
const groupStreams = new Map();   // user_id -> MediaStream remoto
const groupIceWait = new Map();   // user_id -> ICE que llegó antes de la oferta
let groupPeers = [];              // respaldo no reactivo (por si acaso)

export function initCall(send) { sendFn = send; }

/* Los <video> del panel se enganchan a estos streams en cada render. */
export function getLocalStream() { return localStream; }
export function getLocalPreviewStream() { return screenStream || localStream; }
export function getRemoteStream() { return remoteStream; }
export function getPeerStream(peerId) { return groupStreams.get(Number(peerId)) || null; }
export function isGroupCall() { return !!(store.call && store.call.group); }

/* ------------------------------------------------- tono (WebAudio) */

function beep(freq, dur) {
  const g = actx.createGain();
  const o = actx.createOscillator();
  const t0 = actx.currentTime;
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  if (ringAudio) {
    try { ringAudio.pause(); ringAudio.src = ''; } catch (e) {}
    ringAudio = null;
  }
}

function stopCallTimer() {
  if (callTimer) { clearTimeout(callTimer); callTimer = null; }
}

/* Sin esto una llamada ignorada o una conexión que nunca completa deja
   cámara/micrófono activos indefinidamente. */
function armCallTimer(ms, reason) {
  stopCallTimer();
  callTimer = setTimeout(function () {
    callTimer = null;
    if (!store.call || store.call.state === 'active') return;
    if (sendFn) {
      sendFn({
        type: 'call_hangup', chat_id: store.call.chatId,
        call_id: store.call.callId || '', group: !!store.call.group,
        reason: reason,
      });
    }
    cleanup();
    store.call = null;
    toast(reason === 'timeout' ? t('Sin respuesta') : t('La llamada se cortó'));
  }, ms);
}

function startRing() {
  stopRing();
  const src = selectedToneSrc('call');
  if (src) {
    try {
      ringAudio = new Audio(src);
      ringAudio.loop = true;
      ringAudio.volume = 0.8;
      ringAudio.play().catch(function () {});
      return;
    } catch (e) { /* cae al pitido */ }
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    const pair = function () {
      beep(660, 0.35);
      setTimeout(function () { beep(520, 0.35); }, 480);
    };
    pair();
    ringTimer = setInterval(pair, 2400);
  } catch (e) { /* sin audio: solo suena el visual */ }
}

/* ------------------------------------------------------- ciclo base */

function releaseStream(stream) {
  if (!stream) return;
  try {
    const trs = stream.getTracks();
    for (let i = 0; i < trs.length; i++) trs[i].stop();
  } catch (e) {}
}

function cleanup() {
  stopRing();
  stopCallTimer();
  /* Cualquier getUserMedia pendiente queda invalidado: si el usuario
     cuelga/logout mientras el navegador pide permiso, al resolverse no
     puede volver a encender la cámara. */
  callGen++;
  starting = false;
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  groupPCs.forEach(function (ent) {
    try { ent.pc.close(); } catch (e) {}
  });
  groupPCs.clear();
  groupStreams.clear();
  groupIceWait.clear();
  groupPeers = [];
  if (screenTrack) {
    try { screenTrack.stop(); } catch (e) {}
    screenTrack = null;
  }
  if (screenStream) {
    releaseStream(screenStream);
    screenStream = null;
  }
  if (localStream) {
    releaseStream(localStream);
    localStream = null;
  }
  cameraTrack = null;
  remoteStream = null;
  pendingOffer = null;
  iceQueue = [];
}

function endCall(reason) {
  cleanup();
  store.call = null;
  if (reason === 'busy') toast(t('Ocupado'));
  else if (reason === 'rejected') toast(t('Llamada rechazada'));
  else if (reason === 'failed') toast(t('La llamada falló'));
  else if (reason === 'timeout') toast(t('Sin respuesta'));
}

/* --------------------------------------------------------- peer */

function iceServers() {
  /* Permite añadir TURN sin tocar el código: window.FOXINIX_ICE_SERVERS
     = [{urls:'turn:...', username:'...', credential:'...'}, ...].
     En redes móviles/NAT restrictivas STUN solo no basta. */
  const custom = window.FOXINIX_ICE_SERVERS;
  if (Array.isArray(custom) && custom.length) return custom;
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

function newPC(chatId, video) {
  const P = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  pc = new P({ iceServers: iceServers() });
  pc.onicecandidate = function (ev) {
    sendFn({
      type: 'call_ice', chat_id: chatId,
      candidate: ev.candidate ? {
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      } : null,
    });
  };
  pc.ontrack = function (ev) {
    /* W60: un solo MediaStream con TODAS las pistas. Antes se guardaba
       ev.streams[0] y, en algunos navegadores, audio y video llegaban
       en flujos distintos: el panel podía quedarse solo con el video y
       no sonaba la llamada de voz. */
    if (!remoteStream) {
      const MS = window.MediaStream || window.webkitMediaStream;
      remoteStream = MS ? new MS() : null;
    }
    if (remoteStream && ev.track) {
      let dup = false;
      const trs = remoteStream.getTracks();
      for (let i = 0; i < trs.length; i++) if (trs[i].id === ev.track.id) dup = true;
      if (!dup) remoteStream.addTrack(ev.track);
    }
    if (store.call) {
      store.call.remote = true;
      if (ev.track && ev.track.kind === 'video') store.call.remoteVideo = true;
    }
  };
  const onState = function () {
    if (!pc || !store.call || store.call.chatId !== chatId) return;
    const cs = pc.connectionState;
    const ics = pc.iceConnectionState;
    if (store.call.state !== 'active' &&
        (cs === 'connected' || ics === 'connected' || ics === 'completed')) {
      store.call.state = 'active';
      store.call.startedAt = Date.now();
      stopCallTimer();
    } else if (cs === 'failed' || ics === 'failed') {
      endCall('failed');
    }
  };
  pc.onconnectionstatechange = onState;
  pc.oniceconnectionstatechange = onState;
}

function flushIce() {
  if (!pc) return;
  for (let i = 0; i < iceQueue.length; i++) {
    try { pc.addIceCandidate(iceQueue[i]); } catch (e) {}
  }
  iceQueue = [];
}

function gotIce(cand) {
  if (!cand) return;
  if (pc && pc.remoteDescription) {
    try { pc.addIceCandidate(cand); } catch (e) {}
  } else {
    iceQueue.push(cand);   // llega antes de la descripción remota
  }
}

/* -------------------------------------------------------- acciones */

/* W60: la cámara NUNCA es obligatoria. Se intenta audio+video; si la
   cámara falta/está denegada, la llamada sigue solo con micrófono (que
   sí es imprescindible y se puede silenciar). */
/* W62: cámara a 480p y 20 fps como máximo. El audio va con las ayudas
   habituales para que la voz se entienda en móvil. */
function videoConstraints() {
  return {
    width: { ideal: 854, max: 854 },
    height: { ideal: 480, max: 480 },
    frameRate: { ideal: 20, max: 20 },
    facingMode: 'user',
  };
}

function audioConstraints() {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

function acquireMedia(wantVideo) {
  return navigator.mediaDevices.getUserMedia({
    audio: audioConstraints(),
    video: wantVideo ? videoConstraints() : false,
  }).catch(function (err) {
    if (!wantVideo) throw err;
    return navigator.mediaDevices.getUserMedia({
      audio: audioConstraints(), video: false,
    });
  });
}

function rememberCamera(stream) {
  cameraTrack = null;
  if (!stream) return;
  const trs = stream.getVideoTracks();
  if (trs.length) cameraTrack = trs[0];
}


/* ======================================================= W62: grupos */

function makeCallId() {
  return 'c' + Date.now().toString(36) + '-' +
    Math.random().toString(36).slice(2, 12);
}

function groupSend(type, extra) {
  const c = store.call;
  if (!sendFn || !c || !c.callId) return false;
  const msg = {
    type: type, chat_id: c.chatId, call_id: c.callId, group: true,
  };
  if (extra) {
    for (const k in extra) msg[k] = extra[k];
  }
  return !!sendFn(msg);
}

/* W64: presencia de salas drop-in. No es una llamada entrante ni suena:
   solo alimenta el botón verde y el contador. */
function handleGroupCallState(ev) {
  const cid = Number(ev.chat_id || 0);
  if (!cid) return;
  const count = Number(ev.count || 0);
  if (!count) {
    delete store.groupCalls[cid];
    return;
  }
  store.groupCalls[cid] = {
    chatId: cid,
    callId: String(ev.call_id || ''),
    count: count,
    video: !!ev.video,
    host: Number(ev.host || 0),
  };
}

function groupChatName(chatId) {
  const chat = (store.chats || []).filter(function (c) { return c.id === chatId; })[0];
  if (!chat || !chat.title) return t('Llamada de grupo');
  return chat.title.display_name || chat.title.name || t('Llamada de grupo');
}

function ensureGroupPeer(profile) {
  if (!store.call || !store.call.group || !profile || !profile.id) return null;
  if (!store.call.peers) store.call.peers = [];
  let peer = null;
  for (let i = 0; i < store.call.peers.length; i++) {
    if (Number(store.call.peers[i].id) === Number(profile.id)) {
      peer = store.call.peers[i];
      break;
    }
  }
  if (!peer) {
    peer = {
      id: Number(profile.id), username: profile.username || '',
      display_name: profile.display_name || profile.username || '',
      avatar_url: profile.avatar_url || '', banner_url: profile.banner_url || '',
      banner_position: profile.banner_position,
      video: false, connected: false,
    };
    store.call.peers.push(peer);
  } else {
    if (profile.username) peer.username = profile.username;
    if (profile.display_name) peer.display_name = profile.display_name;
    if (profile.avatar_url) peer.avatar_url = profile.avatar_url;
    if (profile.banner_url) peer.banner_url = profile.banner_url;
  }
  groupPeers = store.call.peers;
  return peer;
}

function removeGroupPeer(peerId, keepCall) {
  const id = Number(peerId);
  const ent = groupPCs.get(id);
  if (ent) {
    try { ent.pc.close(); } catch (e) {}
    groupPCs.delete(id);
  }
  groupStreams.delete(id);
  if (store.call && store.call.group && store.call.peers) {
    for (let i = store.call.peers.length - 1; i >= 0; i--) {
      if (Number(store.call.peers[i].id) === id) store.call.peers.splice(i, 1);
    }
    store.call.remote = store.call.peers.length > 0;
  }
  return !!(store.call && !keepCall);
}

function newGroupPC(peerId) {
  const P = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  const pcg = new P({ iceServers: iceServers() });
  const ent = { pc: pcg, stream: null, ice: [], video: false, connected: false };
  const waiting = groupIceWait.get(Number(peerId));
  if (waiting && waiting.length) {
    ent.ice = waiting.slice();
    groupIceWait.delete(Number(peerId));
  }
  groupPCs.set(Number(peerId), ent);
  pcg.onicecandidate = function (ev) {
    groupSend('call_ice', {
      to: Number(peerId),
      candidate: ev.candidate ? {
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      } : null,
    });
  };
  pcg.ontrack = function (ev) {
    if (!ent.stream) {
      const MS = window.MediaStream || window.webkitMediaStream;
      ent.stream = MS ? new MS() : null;
      if (ent.stream) groupStreams.set(Number(peerId), ent.stream);
    }
    if (ent.stream && ev.track) {
      let dup = false;
      const trs = ent.stream.getTracks();
      for (let i = 0; i < trs.length; i++) if (trs[i].id === ev.track.id) dup = true;
      if (!dup) ent.stream.addTrack(ev.track);
    }
    if (ev.track && ev.track.kind === 'video') {
      ent.video = true;
      const peer = ensureGroupPeer({ id: peerId });
      if (peer) peer.video = true;
    }
    if (store.call) {
      store.call.remote = true;
      if (ent.video) store.call.remoteVideo = true;
    }
  };
  const onState = function () {
    if (!store.call || !store.call.group || store.call.callId == null) return;
    const cs = pcg.connectionState;
    const ics = pcg.iceConnectionState;
    if (cs === 'connected' || ics === 'connected' || ics === 'completed') {
      ent.connected = true;
      const peer = ensureGroupPeer({ id: peerId });
      if (peer) peer.connected = true;
      if (store.call.state !== 'active') {
        store.call.state = 'active';
        if (!store.call.startedAt) store.call.startedAt = Date.now();
        stopCallTimer();
      }
    } else if (cs === 'failed' || ics === 'failed') {
      removeGroupPeer(peerId, true);
      if (store.call && !(store.call.peers || []).length) {
        store.call.state = 'connecting';
        armCallTimer(CONNECT_TIMEOUT, 'timeout');
      }
    }
  };
  pcg.onconnectionstatechange = onState;
  pcg.oniceconnectionstatechange = onState;
  return ent;
}

function addLocalTracks(ent) {
  if (!ent || !localStream) return;
  localStream.getTracks().forEach(function (tr) {
    try { ent.pc.addTrack(tr, localStream); } catch (e) {}
  });
}

function flushGroupIce(ent) {
  if (!ent || !ent.pc.remoteDescription) return;
  for (let i = 0; i < ent.ice.length; i++) {
    try { ent.pc.addIceCandidate(ent.ice[i]); } catch (e) {}
  }
  ent.ice = [];
}

function groupOffer(peerId) {
  if (!store.call || !store.call.group || groupPCs.has(Number(peerId))) return;
  const ent = newGroupPC(peerId);
  addLocalTracks(ent);
  ent.pc.createOffer()
    .then(function (offer) { return ent.pc.setLocalDescription(offer); })
    .then(function () {
      if (!store.call || !store.call.group) return;
      groupSend('call_offer', {
        to: Number(peerId), sdp: ent.pc.localDescription.sdp,
        video: !!store.call.video,
      });
    })
    .catch(function () { removeGroupPeer(peerId, true); });
}

function groupAnswer(ev) {
  if (!store.call || !store.call.group || !ev.from || !ev.sdp) return;
  const pid = Number(ev.from.id);
  const peer = ensureGroupPeer(ev.from);
  let ent = groupPCs.get(pid);
  if (!ent) {
    ent = newGroupPC(pid);
    addLocalTracks(ent);
  }
  const isRenegotiation = !!ent.pc.remoteDescription;
  ent.pc.setRemoteDescription({ type: 'offer', sdp: ev.sdp })
    .then(function () { flushGroupIce(ent); return ent.pc.createAnswer(); })
    .then(function (ans) { return ent.pc.setLocalDescription(ans); })
    .then(function () {
      if (!store.call || !store.call.group) return;
      groupSend('call_answer', { to: pid, sdp: ent.pc.localDescription.sdp });
    })
    .catch(function () {
      /* Una oferta de renegociación defectuosa no debe tumbar la llamada
         entera; la conexión anterior sigue viva. */
      if (!isRenegotiation) removeGroupPeer(pid, true);
    });
}

function groupAnswerReceived(ev) {
  if (!store.call || !store.call.group || !ev.from || !ev.sdp) return;
  const pid = Number(ev.from.id);
  const ent = groupPCs.get(pid);
  if (!ent) return;
  ent.pc.setRemoteDescription({ type: 'answer', sdp: ev.sdp })
    .then(function () { flushGroupIce(ent); })
    .catch(function () { removeGroupPeer(pid, true); });
}

function groupIce(ev) {
  if (!store.call || !store.call.group || !ev.from || !ev.candidate) return;
  const pid = Number(ev.from.id);
  const ent = groupPCs.get(pid);
  if (!ent) {
    let q = groupIceWait.get(pid);
    if (!q) { q = []; groupIceWait.set(pid, q); }
    q.push(ev.candidate);
    return;
  }
  if (ent.pc.remoteDescription) {
    try { ent.pc.addIceCandidate(ev.candidate); } catch (e) {}
  } else {
    ent.ice.push(ev.candidate);
  }
}

export async function startGroupCall(chat, video) {
  if (store.call) { toast(t('Ya hay una llamada en curso')); return; }
  if (!(await ensurePermission('mic'))) {
    toast(t('Permiso de micrófono necesario para llamar'), 'err');
    return;
  }
  if (video && !(await ensurePermission('camera'))) {
    toast(t('Sin cámara: la llamada seguirá solo con voz'), 'info');
    video = false;
  }
  if (store.call) { toast(t('Ya hay una llamada en curso')); return; }
  if (starting) { toast(t('Ya hay una llamada en curso')); return; }
  let ok = false;
  try {
    ok = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
            (window.RTCPeerConnection || window.webkitRTCPeerConnection));
  } catch (e) { ok = false; }
  if (!ok) { toast(t('No se pudo iniciar la llamada')); return; }
  starting = true;
  const gen = ++callGen;
  try {
    const stream = await acquireMedia(video);
    if (gen !== callGen || !store.hasSession) {
      starting = false;
      releaseStream(stream);
      return;
    }
    starting = false;
    localStream = stream;
    rememberCamera(stream);
    const hasCam = stream.getVideoTracks().length > 0;
    const callId = makeCallId();
    /* W64: la sala nace activa con una persona. No se arma el timeout de
       "sin respuesta": aquí nadie recibe una llamada; los demás entran
       cuando quieren y la sala espera todo lo necesario. */
    store.call = {
      chatId: chat.id, callId: callId, group: true,
      chatName: groupChatName(chat.id), peer: null, peers: [],
      state: 'active', video: !!video && hasCam, hasCam: hasCam,
      muted: false, camOff: !hasCam, remote: false, remoteVideo: false,
      screen: false, startedAt: Date.now(),
      hostId: store.user ? store.user.id : 0,
    };
    if (!groupSend('call_start', { video: !!store.call.video })) {
      endCall(null);
      toast(t('Sin conexión'));
    }
  } catch (e) {
    starting = false;
    cleanup();
    store.call = null;
    toast(t('No se pudo iniciar la llamada'));
  }
}

/* W64: entrar a una sala que ya existe. Se pide el micrófono (y la
   cámara si la sala se abrió como videollamada) y se manda call_join.
   No hay invitación, tono ni aceptación: es una acción voluntaria. */
export async function joinGroupCall(chat) {
  if (!chat || chat.type !== 'group') return;
  if (store.call) { toast(t('Ya hay una llamada en curso')); return; }
  if (starting) { toast(t('Ya hay una llamada en curso')); return; }
  const presence = store.groupCalls && store.groupCalls[chat.id];
  if (!presence || !presence.callId) {
    toast(t('La llamada ya terminó'), 'info');
    return;
  }
  if (Number(presence.count || 0) >= GROUP_MAX) {
    toast(t('La llamada está llena'), 'err');
    return;
  }
  if (!(await ensurePermission('mic'))) {
    toast(t('Permiso de micrófono necesario para llamar'), 'err');
    return;
  }
  let video = !!presence.video;
  if (video && !(await ensurePermission('camera'))) {
    toast(t('Sin cámara: la llamada seguirá solo con voz'), 'info');
    video = false;
  }
  if (store.call) { toast(t('Ya hay una llamada en curso')); return; }
  if (starting) { toast(t('Ya hay una llamada en curso')); return; }
  let ok = false;
  try {
    ok = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
            (window.RTCPeerConnection || window.webkitRTCPeerConnection));
  } catch (e) { ok = false; }
  if (!ok) { toast(t('No se pudo iniciar la llamada')); return; }
  starting = true;
  const gen = ++callGen;
  try {
    const stream = await acquireMedia(video);
    const now = store.groupCalls && store.groupCalls[chat.id];
    if (gen !== callGen || !store.hasSession ||
        !now || now.callId !== presence.callId) {
      starting = false;
      releaseStream(stream);
      if (gen === callGen && store.hasSession) {
        toast(t('La llamada ya terminó'), 'info');
      }
      return;
    }
    starting = false;
    localStream = stream;
    rememberCamera(stream);
    const hasCam = stream.getVideoTracks().length > 0;
    store.call = {
      chatId: chat.id, callId: presence.callId, group: true,
      chatName: groupChatName(chat.id), peer: null, peers: [],
      state: 'active', video: !!video && hasCam, hasCam: hasCam,
      muted: false, camOff: !hasCam, remote: false, remoteVideo: false,
      screen: false, startedAt: Date.now(), hostId: presence.host || 0,
    };
    if (!groupSend('call_join')) {
      endCall(null);
      toast(t('Sin conexión'));
    }
  } catch (e) {
    starting = false;
    cleanup();
    store.call = null;
    toast(t('No se pudo iniciar la llamada'));
  }
}

function handleGroupCallEvent(ev) {
  /* W64: no existe ningún camino de "llamada entrante" en grupos. Se
     ignoran call_invite de despliegues viejos: aquí solo hay presencia
     (call_state) y entrada voluntaria (call_join). */
  if (ev.type === 'call_invite') return;

  const c = store.call;
  if (!c || !c.group || c.chatId !== ev.chat_id || c.callId !== ev.call_id) return;

  if (ev.type === 'call_join') {
    if (!ev.from || Number(ev.from.id) === Number(store.user && store.user.id)) return;
    ensureGroupPeer(ev.from);
    if (c.state === 'outgoing') c.state = 'connecting';
    groupOffer(ev.from.id);
    return;
  }
  if (ev.type === 'call_offer') {
    groupAnswer(ev);
    return;
  }
  if (ev.type === 'call_answer') {
    groupAnswerReceived(ev);
    return;
  }
  if (ev.type === 'call_ice') {
    groupIce(ev);
    return;
  }
  if (ev.type === 'call_hangup') {
    const fromId = ev.from && ev.from.id ? Number(ev.from.id) : 0;
    if (ev.reason === 'ended' || (!fromId && !ev.reason)) {
      endCall(ev.reason === 'ended' ? null : 'failed');
      return;
    }
    if (ev.targeted) {
      if (ev.reason === 'rejected' && ev.from) {
        toast(t('{n} rechazó la llamada', {
          n: ev.from.display_name || ev.from.username || '',
        }), 'info');
      }
      if (fromId) removeGroupPeer(fromId, true);
      return;
    }
    /* W64: la sala es drop-in. Que se vaya quien la abrió NO cierra la
       llamada de los demás; solo se quita su mosaico. La sala termina
       cuando se va la última persona, y entonces ya no hay nadie a quien
       avisar (el resto de miembros ve call_state count 0). */
    if (fromId) removeGroupPeer(fromId, true);
  }
}

export async function startCall(chat, video) {
  if (chat && chat.type === 'group') {
    /* Si ya hay una sala activa, el botón verde entra a ella; solo se
       crea una nueva cuando el grupo no tiene ninguna llamada. */
    if (store.groupCalls && store.groupCalls[chat.id]) {
      return joinGroupCall(chat);
    }
    return startGroupCall(chat, video);
  }
  if (store.call) { toast(t('Ya hay una llamada en curso')); return; }
  /* W58: si el usuario saltó el permiso al arrancar, se vuelve a pedir
     justo al usar la función; sin permiso no se inicia la llamada. */
  if (!(await ensurePermission('mic'))) {
    toast(t('Permiso de micrófono necesario para llamar'), 'err');
    return;
  }
  /* W62: la videollamada pide también la cámara; si se niega, sigue
     como llamada de voz en vez de mostrar un error sin salida. */
  if (video && !(await ensurePermission('camera'))) {
    toast(t('Sin cámara: la llamada seguirá solo con voz'), 'info');
    video = false;
  }
  if (store.call) { toast(t('Ya hay una llamada en curso')); return; }
  /* en un DM, chat.title ES el brief del peer (chat_brief del server) */
  const peer = chat.title || null;
  let ok = false;
  try {
    ok = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
            (window.RTCPeerConnection || window.webkitRTCPeerConnection));
  } catch (e) { ok = false; }
  if (!ok) { toast(t('No se pudo iniciar la llamada')); return; }
  if (starting) { toast(t('Ya hay una llamada en curso')); return; }
  starting = true;
  const gen = ++callGen;
  acquireMedia(video)
    .then(function (stream) {
      if (gen !== callGen || !store.hasSession) {
        starting = false;
        releaseStream(stream);
        return;
      }
      starting = false;
      localStream = stream;
      rememberCamera(stream);
      const hasCam = stream.getVideoTracks().length > 0;
      store.call = {
        chatId: chat.id, peerId: peer ? peer.id : 0, peer: peer,
        state: 'outgoing',
        /* video = la llamada puede mostrar/recibir video. Si el usuario
           pidió cámara y no la hay, la llamada sigue siendo de voz. */
        video: !!video && hasCam,
        hasCam: hasCam,
        muted: false, camOff: !hasCam,
        remote: false, remoteVideo: false, remoteMuted: false,
        screen: false, startedAt: 0,
      };
      armCallTimer(CONNECT_TIMEOUT + 15000, 'timeout');
      newPC(chat.id, !!video);
      stream.getTracks().forEach(function (tr) { pc.addTrack(tr, stream); });
      return pc.createOffer();
    })
    .then(function (offer) {
      if (gen !== callGen || !store.call || !pc) return;
      return pc.setLocalDescription(offer);
    })
    .then(function () {
      if (gen !== callGen || !store.call || !pc) return;
      const sent = sendFn({
        type: 'call_offer', chat_id: store.call.chatId,
        video: !!store.call.video, sdp: pc.localDescription.sdp,
      });
      if (!sent) { endCall(null); toast(t('Sin conexión')); }
    })
    .catch(function () {
      if (gen !== callGen) return;
      cleanup();
      store.call = null;
      toast(t('No se pudo iniciar la llamada'));
    });
}

export async function acceptCall() {
  const ev = pendingOffer;
  if (!store.call || store.call.state !== 'incoming' || !ev) return;
  if (!(await ensurePermission('mic'))) {
    toast(t('Permiso de micrófono necesario para llamar'), 'err');
    return;
  }
  if (ev.video && !(await ensurePermission('camera'))) {
    toast(t('Sin cámara: la llamada seguirá solo con voz'), 'info');
  }
  if (!store.call || store.call.state !== 'incoming' || !pendingOffer) return;
  if (pendingOffer !== ev || starting) return;
  stopRing();
  stopCallTimer();
  starting = true;
  const gen = ++callGen;
  /* W60: contestar una videollamada sin cámara también es válido: el
     micrófono es obligatorio, la cámara no. */
  acquireMedia(!!ev.video)
    .then(function (stream) {
      if (gen !== callGen || !store.call || store.call.state !== 'incoming'
          || !pendingOffer || pendingOffer !== ev || !store.hasSession) {
        starting = false;
        releaseStream(stream);
        return;
      }
      starting = false;
      localStream = stream;
      rememberCamera(stream);
      const hasCam = stream.getVideoTracks().length > 0;
      store.call.state = 'connecting';
      store.call.hasCam = hasCam;
      store.call.camOff = !hasCam;
      store.call.video = !!(ev.video || hasCam);
      store.call.remote = false;
      store.call.remoteVideo = false;
      store.call.screen = false;
      armCallTimer(CONNECT_TIMEOUT, 'timeout');
      newPC(ev.chat_id, !!ev.video);
      stream.getTracks().forEach(function (tr) { pc.addTrack(tr, stream); });
      return pc.setRemoteDescription({ type: 'offer', sdp: ev.sdp })
        .then(function () { return pc.createAnswer(); })
        .then(function (ans) { return pc.setLocalDescription(ans); })
        .then(function () {
          if (gen !== callGen || !store.call || !pc) return;
          flushIce();
          const sent = sendFn({
            type: 'call_answer', chat_id: ev.chat_id,
            sdp: pc.localDescription.sdp,
          });
          if (!sent) { endCall(null); toast(t('Sin conexión')); }
        });
    })
    .catch(function () {
      if (gen !== callGen) return;
      cleanup();
      store.call = null;
      toast(t('No se pudo iniciar la llamada'));
    });
}

/* Cierre forzado: logout, pérdida de sesión, desmontaje de la pantalla.
   Avisa best-effort al otro lado y SIEMPRE libera cámara/micrófono. */
export function abortCall(reason) {
  if (store.call && sendFn) {
    try {
      const msg = {
        type: 'call_hangup', chat_id: store.call.chatId,
        reason: reason || 'hangup',
      };
      if (store.call.group) {
        msg.call_id = store.call.callId;
        msg.group = true;
      }
      sendFn(msg);
    } catch (e) {}
  }
  cleanup();
  store.call = null;
}

export function rejectCall() {
  if (!store.call || store.call.state !== 'incoming') return;
  if (sendFn) {
    sendFn({
      type: 'call_hangup', chat_id: store.call.chatId, reason: 'rejected',
    });
  }
  cleanup();
  store.call = null;
}

export function hangupCall() {
  abortCall('hangup');
}

export function toggleMute() {
  if (!store.call || !localStream) return;
  const m = !store.call.muted;
  const trs = localStream.getAudioTracks();
  for (let i = 0; i < trs.length; i++) trs[i].enabled = !m;
  store.call.muted = m;
}

export function toggleCam() {
  if (!store.call || !localStream) return;
  if (store.call.screen) {
    toast(t('Deja de compartir pantalla para cambiar la cámara'), 'info');
    return;
  }
  const off = !store.call.camOff;
  const trs = localStream.getVideoTracks();
  for (let i = 0; i < trs.length; i++) trs[i].enabled = !off;
  store.call.camOff = off;
}

/* W62: compartir pantalla reemplaza la pista de video en TODAS las
   conexiones (1:1 o malla), sin renegociar: replaceTrack mantiene la
   misma m-line y sólo cambia el contenido. A 480p/20 fps. */
function callPeerConnections() {
  const list = [];
  if (pc) list.push(pc);
  groupPCs.forEach(function (ent) { if (ent && ent.pc) list.push(ent.pc); });
  return list;
}

function hasOutgoingVideo() {
  const pcs = callPeerConnections();
  for (let i = 0; i < pcs.length; i++) {
    const senders = pcs[i].getSenders ? pcs[i].getSenders() : [];
    for (let j = 0; j < senders.length; j++) {
      if (senders[j].track && senders[j].track.kind === 'video') return true;
    }
  }
  return false;
}

async function replaceOutgoingVideo(track) {
  let changed = 0;
  const pcs = callPeerConnections();
  for (let i = 0; i < pcs.length; i++) {
    const senders = pcs[i].getSenders ? pcs[i].getSenders() : [];
    for (let j = 0; j < senders.length; j++) {
      const sender = senders[j];
      if (!sender.track || sender.track.kind !== 'video') continue;
      try {
        await sender.replaceTrack(track);
        changed++;
      } catch (e) {}
    }
  }
  return changed;
}

export async function shareScreen() {
  const c = store.call;
  if (!c) return;
  if (c.screen) { stopScreenShare(); return; }
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') {
    toast(t('Compartir pantalla no está disponible'), 'err');
    return;
  }
  if (!hasOutgoingVideo()) {
    toast(t('Esta llamada no envía vídeo'), 'info');
    return;
  }
  try {
    const stream = await md.getDisplayMedia({
      video: {
        width: { ideal: 854, max: 854 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: 20, max: 20 },
      },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      releaseStream(stream);
      toast(t('No se pudo compartir la pantalla'), 'err');
      return;
    }
    try {
      await track.applyConstraints({
        width: { max: 854 }, height: { max: 480 },
        frameRate: { max: 20 },
      });
    } catch (e) {}
    const changed = await replaceOutgoingVideo(track);
    if (!changed) {
      releaseStream(stream);
      toast(t('Esta llamada no envía vídeo'), 'err');
      return;
    }
    screenStream = stream;
    screenTrack = track;
    c.screen = true;
    track.onended = function () { stopScreenShare(); };
  } catch (e) {
    if (e && e.name === 'NotAllowedError') {
      toast(t('No se compartió la pantalla'), 'info');
    } else {
      toast(t('No se pudo compartir la pantalla'), 'err');
    }
  }
}

export async function stopScreenShare() {
  const c = store.call;
  if (!screenTrack && !screenStream) {
    if (c) c.screen = false;
    return;
  }
  const oldTrack = screenTrack;
  const oldStream = screenStream;
  screenTrack = null;
  screenStream = null;
  if (oldTrack) { try { oldTrack.onended = null; oldTrack.stop(); } catch (e) {} }
  if (oldStream) releaseStream(oldStream);
  await replaceOutgoingVideo(cameraTrack);
  if (c) c.screen = false;
}

/* ------------------------------------- eventos de la WS (realtime.js) */

export function handleCallEvent(ev) {
  if (ev.type === 'call_state') {
    handleGroupCallState(ev);
    return;
  }

  if (ev.type === 'call_error') {
    const same = store.call && store.call.chatId === ev.chat_id &&
      (!ev.call_id || !store.call.callId || store.call.callId === ev.call_id);
    if (same) {
      cleanup();
      store.call = null;
    }
    toast(ev.detail ? String(ev.detail) : t('El usuario no está disponible'));
    return;
  }

  /* W62/W64: señalización de la malla de grupo. Las invitaciones de
     versiones viejas se ignoran: en grupos no se llama a nadie. */
  if (ev.type === 'call_invite') return;
  if (ev.group || ev.type === 'call_join') {
    handleGroupCallEvent(ev);
    return;
  }

  if (ev.type === 'call_offer') {
    if (store.call) {
      /* ocupado (o llamando a otro): rechazo automático */
      sendFn({ type: 'call_hangup', chat_id: ev.chat_id, reason: 'busy' });
      return;
    }
    if (pendingOffer) return;   // ya hay otra entrante esperando
    pendingOffer = ev;
    store.call = {
      chatId: ev.chat_id,
      peerId: ev.from ? ev.from.id : 0,
      peer: ev.from || null,
      state: 'incoming', video: !!ev.video,
      hasCam: false, muted: false, camOff: true, startedAt: 0,
      remote: false, remoteVideo: false, remoteMuted: false,
    };
    startRing();
    armCallTimer(RING_TIMEOUT, 'missed');
    return;
  }

  if (!store.call || store.call.chatId !== ev.chat_id) return;

  if (ev.type === 'call_answer') {
    if (!pc || !ev.sdp) return;
    pc.setRemoteDescription({ type: 'answer', sdp: ev.sdp })
      .then(function () {
        flushIce();
        if (store.call && store.call.state === 'outgoing') {
          store.call.state = 'connecting';
        }
      })
      .catch(function () { endCall('failed'); });
    return;
  }

  if (ev.type === 'call_ice') {
    gotIce(ev.candidate);
    return;
  }

  if (ev.type === 'call_hangup') {
    const wasIncoming = store.call.state === 'incoming';
    /* el rechazo/ocupado solo interesa al que llamaba; al que rechaza no
       se le molesta con un toast (él ya decidió) */
    endCall(wasIncoming ? null : ev.reason);
  }
}

/* W28h: al recargar o cerrar la pestaña con una llamada abierta, avisar
   al otro lado (best-effort: el WS suele alcanzar a enviarlo antes de
   morir; si no, el peer lo corta con su timeout de conexión). */
window.addEventListener('pagehide', function () {
  if (store.call) abortCall('hangup');
});
