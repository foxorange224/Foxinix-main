/* CallBox — extraído de views/chat.js (Fase 3.1). */
import {
  mediaUrl, sendText,
} from '../../actions.js';
import { api } from '../../api.js';
import {
  acceptCall, getLocalPreviewStream, getLocalStream, getPeerStream, getRemoteStream, hangupCall, rejectCall, shareScreen, stopScreenShare, toggleCam, toggleMute,
} from '../../call.js';
import { t } from '../../i18n.js';
import { store } from '../../store.js';
import {
  bannerPositionOf, callBlurBanner, fmtTime, openProfile, toastErr,
} from '../../views/helpers.js';
import Vue from '../../vue.js';
import { DomAdapter } from '../../platform/dom.js';
import { MediaAdapter } from '../../platform/media.js';

export const CallBox = {
  setup: function () {
    const elapsed = Vue.ref('00:00');
    const remoteEl = Vue.ref(null);
    const pipEl = Vue.ref(null);
    const minimized = Vue.ref(false);
    const callText = Vue.ref('');
    const chatListEl = Vue.ref(null);
    const peerBg = Vue.ref('');
    const myBg = Vue.ref('');
    const peerSpeak = Vue.ref(false);
    const mySpeak = Vue.ref(false);
    const remoteMuted = Vue.ref(false);
    const menu = Vue.ref(null);
    /* W61: la burbuja minimizada se puede arrastrar a cualquier parte. */
    const fabEl = Vue.ref(null);
    const fabDragging = Vue.ref(false);
    const fabPos = Vue.ref(null);        // {left, top} en píxeles
    let fabDragEnd = 0;
    /* W62: ventana de llamada arrastrable, limitada al viewport, con
       modo pantalla completa y mosaico para grupos. */
    const panelEl = Vue.ref(null);
    const panelPos = Vue.ref(null);      // {left, top, width, height}
    const panelDragging = Vue.ref(false);
    const full = Vue.ref(false);
    const peerBgs = Vue.reactive({});
    const peerBgKeys = {};
    const peerMutedMap = Vue.reactive({});
    let timer = null;
    let speakTimer = null;
    let audioCtx = null;
    let anLocal = null;
    let anRemote = null;
    let lastLocal = null;
    let lastRemote = null;
    let peerBanner = null;
    let myBanner = null;

    const fmt = function (ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    };
    const retick = function () {
      const c = store.call;
      elapsed.value = (c && c.startedAt) ? fmt(Date.now() - c.startedAt) : '00:00';
    };

    const peer = function () { return store.call ? store.call.peer : null; };
    const isGroup = function () { return !!(store.call && store.call.group); };
    const groupPeerList = Vue.computed(function () {
      const c = store.call;
      if (!c || !c.group) return [];
      const list = c.peers || [];
      if (!list.length && c.state === 'incoming' && c.peer) {
        return [Object.assign({}, c.peer, { video: false, placeholder: true })];
      }
      return list;
    });
    const callTitle = function () {
      const c = store.call;
      if (!c) return t('Llamada');
      if (c.group) return c.chatName || t('Llamada de grupo');
      return peerName() || t('Llamada');
    };
    const participantCount = function () {
      const c = store.call;
      if (!c || !c.group) return 0;
      return (groupPeerList.value.length || 0) + (c.state === 'incoming' ? 0 : 1);
    };
    const peerNameOf = function (p) {
      if (!p) return '';
      return p.display_name || p.username || '';
    };
    const peerIniOf = function (p) {
      return (peerNameOf(p) || '?').charAt(0).toUpperCase();
    };
    const peerAvatarOf = function (p) {
      return p && p.avatar_url ? mediaUrl(p.avatar_url) : '';
    };
    const peerHasVideo = function (p) { return !!(p && p.video); };
    const peerBgOf = function (p) {
      return p && peerBgs[p.id] ? peerBgs[p.id] : '';
    };
    const ensurePeerBgs = function () {
      if (!isGroup()) return;
      const list = groupPeerList.value;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p || !p.id) continue;
        const key = (p.banner_url || '') + '|' + bannerPositionOf(p);
        if (peerBgKeys[p.id] === key) continue;
        peerBgKeys[p.id] = key;
        peerBgs[p.id] = '';
        if (!p.banner_url) continue;
        (function (pid) {
          callBlurBanner(p.banner_url, bannerPositionOf(p)).then(function (u) {
            if (peerBgs[pid] !== undefined) peerBgs[pid] = u;
          });
        })(p.id);
      }
    };
    /* W61: respaldo para señales antiguas que solo traían nombre. Si el
       peer no trae avatar/portada, se completa con su perfil público. */
    let peerFetch = '';
    const ensurePeerProfile = function () {
      if (isGroup()) return;
      const p = peer();
      if (!p || !p.username) return;
      if (p.avatar_url && p.banner_url) return;
      const key = (p.id || 0) + '|' + p.username;
      if (peerFetch === key) return;
      peerFetch = key;
      api('GET', '/users/' + encodeURIComponent(p.username))
        .then(function (r) {
          if (r && r.user && store.call && store.call.peer) {
            store.call.peer = Object.assign({}, store.call.peer, r.user);
          }
        })
        .catch(function () {});
    };
    const peerName = function () {
      const p = peer();
      if (!p) return '';
      return p.display_name || p.username || '';
    };
    const peerIni = function () { return (peerName() || '?').charAt(0).toUpperCase(); };
    const peerAvatar = function () {
      const p = peer();
      return p && p.avatar_url ? mediaUrl(p.avatar_url) : '';
    };
    const myAvatar = function () {
      return store.user && store.user.avatar_url ? mediaUrl(store.user.avatar_url) : '';
    };
    const myIni = function () {
      const u = store.user || {};
      return String(u.display_name || u.username || '?').charAt(0).toUpperCase();
    };
    const isIncoming = function () {
      return !!(store.call && store.call.state === 'incoming');
    };
    const inCall = function () {
      const c = store.call;
      return !!c && (c.state === 'connecting' || c.state === 'active');
    };
    const hasVideo = function () {
      return !!(store.call && store.call.remoteVideo);
    };
    const selfCamOn = function () {
      const c = store.call;
      return !!(c && (c.screen || (c.hasCam && !c.camOff)));
    };
    const canScreenShare = function () {
      const c = store.call;
      if (!c || !c.hasCam) return false;
      try {
        return MediaAdapter.canShareScreen();
      } catch (e) { return false; }
    };
    const toggleScreen = function () {
      if (store.call && store.call.screen) stopScreenShare();
      else shareScreen();
    };
    const stateLine = function () {
      const c = store.call;
      if (!c) return '';
      if (c.state === 'incoming') return t('Llamada entrante');
      if (c.state === 'outgoing') return t('Llamando…');
      if (c.state === 'connecting') return t('Conectando…');
      if (c.group && !(c.peers || []).length) {
        return t('Esperando a que se unan');
      }
      return elapsed.value;
    };
    const bgStyle = function (data) {
      return data ? { backgroundImage: 'url(' + data + ')' } : {};
    };

    const makeBgs = function () {
      if (isGroup()) ensurePeerBgs();
      const p = peer();
      const b = p && p.banner_url ? p.banner_url : '';
      const bp = p ? bannerPositionOf(p) : 50;
      if (b + '|' + bp !== peerBanner) {
        peerBanner = b + '|' + bp;
        peerBg.value = '';
        callBlurBanner(b, bp).then(function (u) { peerBg.value = u; });
      }
      const mb = store.user && store.user.banner_url ? store.user.banner_url : '';
      const mp = bannerPositionOf(store.user);
      if (mb + '|' + mp !== myBanner) {
        myBanner = mb + '|' + mp;
        myBg.value = '';
        callBlurBanner(mb, mp).then(function (u) { myBg.value = u; });
      }
    };

    const scrollChat = function (force) {
      const el = chatListEl.value;
      if (!el) return;
      if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 64) {
        el.scrollTop = el.scrollHeight;
      }
    };

    /* W60: aro verde al hablar. Se analiza la forma de onda del micrófono
       local y del flujo remoto SIN conectarlos a la salida (no hay eco). */
    const bindAudio = function (local, remote) {
      if (!audioCtx) {
        audioCtx = MediaAdapter.createAudioContext();
        if (!audioCtx) return;
      }
      if (audioCtx.state === 'suspended') {
        try {
          const pr = audioCtx.resume();
          if (pr && pr.catch) pr.catch(function () {});
        } catch (e) {}
      }
      const wire = function (stream, side) {
        if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return;
        const prev = side === 'local' ? lastLocal : lastRemote;
        if (prev === stream) return;
        try {
          const src = audioCtx.createMediaStreamSource(stream);
          const an = audioCtx.createAnalyser();
          an.fftSize = 256;
          an.smoothingTimeConstant = 0.65;
          src.connect(an);
          if (side === 'local') {
            anLocal = an;
            lastLocal = stream;
          } else {
            anRemote = an;
            lastRemote = stream;
          }
        } catch (e) {}
      };
      wire(local, 'local');
      wire(remote, 'remote');
    };

    const levelOf = function (an) {
      if (!an) return 0;
      try {
        const arr = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(arr);
        let peak = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = Math.abs(arr[i] - 128);
          if (v > peak) peak = v;
        }
        return peak;
      } catch (e) { return 0; }
    };
    const pollSpeaking = function () {
      let remote = getRemoteStream();
      if (store.call && store.call.group) {
        const list = store.call.peers || [];
        remote = null;
        for (let i = 0; i < list.length; i++) {
          if (list[i].connected) { remote = getPeerStream(list[i].id); break; }
        }
        if (!remote && list.length) remote = getPeerStream(list[0].id);
      }
      bindAudio(getLocalStream(), remote);
      const c = store.call;
      mySpeak.value = levelOf(anLocal) > 7 && !(c && c.muted);
      peerSpeak.value = levelOf(anRemote) > 7 && !remoteMuted.value;
    };

    const attach = function () {
      const group = isGroup();
      const st = getRemoteStream();
      const st2 = getLocalPreviewStream();
      if (remoteEl.value) {
        if (st && remoteEl.value.srcObject !== st) {
          remoteEl.value.srcObject = st;
          try {
            const p = remoteEl.value.play();
            if (p && typeof p.catch === 'function') p.catch(function () {});
          } catch (e) {}
        }
        remoteEl.value.muted = remoteMuted.value;
      }
      if (pipEl.value) {
        if (st2 && pipEl.value.srcObject !== st2) {
          pipEl.value.srcObject = st2;
          try {
            const p2 = pipEl.value.play();
            if (p2 && typeof p2.catch === 'function') p2.catch(function () {});
          } catch (e) {}
        }
        pipEl.value.muted = true;
      }
      if (group && panelEl.value) {
        const vids = panelEl.value.querySelectorAll('video[data-peer]');
        for (let i = 0; i < vids.length; i++) {
          const el = vids[i];
          const pid = Number(el.getAttribute('data-peer'));
          const pst = getPeerStream(pid);
          if (pst && el.srcObject !== pst) {
            el.srcObject = pst;
            try {
              const pr = el.play();
              if (pr && typeof pr.catch === 'function') pr.catch(function () {});
            } catch (e) {}
          }
          el.muted = !!peerMutedMap[pid];
        }
      }
      let remoteAudio = st;
      if (group && store.call) {
        const list = store.call.peers || [];
        remoteAudio = null;
        for (let i = 0; i < list.length; i++) {
          if (list[i].connected) {
            remoteAudio = getPeerStream(list[i].id);
            if (remoteAudio) break;
          }
        }
        if (!remoteAudio && list.length) remoteAudio = getPeerStream(list[0].id);
      }
      bindAudio(getLocalStream(), remoteAudio);
      scrollChat(false);
    };

    const callMessages = Vue.computed(function () {
      const c = store.call;
      if (!c) return [];
      const all = store.msgs[c.chatId] || [];
      const out = [];
      const meId = store.user ? store.user.id : 0;
      for (let i = 0; i < all.length; i++) {
        const m = all[i];
        if (m.kind === 'system') continue;
        let txt = '';
        if (m.kind === 'image') txt = t('Imagen');
        else if (m.kind === 'voice') txt = t('Nota de voz');
        else if (m.kind === 'file') {
          txt = m.media && /^video\//.test(m.media.mime || '') ? t('Video') : t('Archivo');
        } else if (m.kind === 'gif') txt = t('GIF');
        else txt = m.body || '' || '';
        if (!txt) continue;
        const mine = !!(m.sender && meId && m.sender.id === meId);
        const nm = m.sender
          ? (m.sender.display_name || m.sender.username || '')
          : (mine && store.user ? (store.user.display_name || store.user.username) : '');
        out.push({
          id: m.id,
          key: 'cm' + m.id,
          txt: txt,
          mine: mine,
          name: nm,
          time: m.created_at ? fmtTime(new Date(m.created_at * 1000)) : '',
        });
      }
      return out.slice(-40);
    });

    const sendChat = function () {
      const c = store.call;
      const text = callText.value.trim();
      if (!c || !text) return;
      callText.value = '';
      sendText(c.chatId, text).catch(function (e) {
        toastErr(e, 'No se pudo enviar el mensaje');
      });
      Vue.nextTick(function () { scrollChat(true); });
    };

    const closeMenu = function () { menu.value = null; };
    const openMenu = function (ev, who) {
      const w = 210;
      const h = 190;
      const x = Math.max(8, Math.min(ev.clientX, (DomAdapter.getInnerWidth() || 360) - w - 8));
      const y = Math.max(8, Math.min(ev.clientY, (DomAdapter.getInnerHeight() || 640) - h - 8));
      menu.value = { x: x, y: y, who: who };
    };
    const menuThen = function (fn) {
      menu.value = null;
      if (typeof fn === 'function') fn();
    };
    const menuPeer = function () {
      if (!menu.value) return null;
      if (menu.value.who === 'peer') return peer();
      const who = String(menu.value.who || '');
      if (who.indexOf('p:') === 0) {
        const id = Number(who.slice(2));
        const list = store.call && store.call.peers ? store.call.peers : [];
        for (let i = 0; i < list.length; i++) {
          if (Number(list[i].id) === id) return list[i];
        }
        if (store.call && store.call.peer && Number(store.call.peer.id) === id) {
          return store.call.peer;
        }
      }
      return null;
    };
    const menuPeerMuted = Vue.computed(function () {
      const p = menuPeer();
      if (!p) return false;
      if (menu.value && menu.value.who === 'peer') return remoteMuted.value;
      return !!peerMutedMap[p.id];
    });
    const viewPeer = function () {
      const p = menuPeer();
      menu.value = null;
      if (p && p.username) openProfile(p.username);
    };
    const toggleRemoteMute = function () {
      const p = menuPeer();
      const isGroupPeer = !!(menu.value && String(menu.value.who).indexOf('p:') === 0);
      menu.value = null;
      if (isGroupPeer && p) {
        peerMutedMap[p.id] = !peerMutedMap[p.id];
        if (panelEl.value) {
          const el = panelEl.value.querySelector('video[data-peer="' + p.id + '"]');
          if (el) el.muted = !!peerMutedMap[p.id];
        }
        return;
      }
      remoteMuted.value = !remoteMuted.value;
      if (remoteEl.value) remoteEl.value.muted = remoteMuted.value;
      if (remoteMuted.value) peerSpeak.value = false;
    };

    const minimize = function () {
      menu.value = null;
      full.value = false;
      minimized.value = true;
    };
    const restore = function () { minimized.value = false; };

    const panelStyle = Vue.computed(function () {
      const p = panelPos.value;
      if (!p || full.value) return {};
      return {
        left: p.left + 'px', top: p.top + 'px',
        width: p.width + 'px', height: p.height + 'px',
        right: 'auto', bottom: 'auto',
      };
    });
    /* El panel de llamada tiene su propio clamp (miniatura arrastrable). */
    const clampCallPanel = function () {
      const p = panelPos.value;
      if (!p || full.value) return;
      const m = 6;
      const vw = DomAdapter.getInnerWidth() || 360;
      const vh = DomAdapter.getInnerHeight() || 640;
      const w = Math.min(p.width, vw - m * 2);
      const h = Math.min(p.height, vh - m * 2);
      panelPos.value = {
        left: Math.max(m, Math.min(p.left, vw - w - m)),
        top: Math.max(m, Math.min(p.top, vh - h - m)),
        width: w, height: h,
      };
    };
    const startPanelDrag = function (e) {
      if (!e || e.button) return;
      if (full.value || minimized.value) return;
      if (DomAdapter.getInnerWidth() <= 760) return;
      if (e.target && e.target.closest && e.target.closest('button, input')) return;
      const el = panelEl.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const w = r.width;
      const h = r.height;
      let moved = false;
      e.preventDefault();
      panelDragging.value = true;
      const move = function (ev) {
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
        moved = true;
        const m = 6;
        const vw = DomAdapter.getInnerWidth() || 360;
        const vh = DomAdapter.getInnerHeight() || 640;
        panelPos.value = {
          left: Math.max(m, Math.min(r.left + (ev.clientX - x0), vw - w - m)),
          top: Math.max(m, Math.min(r.top + (ev.clientY - y0), vh - h - m)),
          width: w, height: h,
        };
      };
      const up = function () {
        panelDragging.value = false;
        DomAdapter.removeWindowEventListener('pointermove', move);
        DomAdapter.removeWindowEventListener('pointerup', up);
        DomAdapter.removeWindowEventListener('pointercancel', up);
      };
      DomAdapter.addWindowEventListener('pointermove', move);
      DomAdapter.addWindowEventListener('pointerup', up);
      DomAdapter.addWindowEventListener('pointercancel', up);
    };
    const toggleFull = function () {
      full.value = !full.value;
      if (!full.value) Vue.nextTick(clampCallPanel);
    };

    const fabStyle = Vue.computed(function () {
      const p = fabPos.value;
      if (!p) return {};
      return { left: p.left + 'px', top: p.top + 'px', right: 'auto', bottom: 'auto' };
    });
    const clampFab = function () {
      const p = fabPos.value;
      if (!p) return;
      const size = 62;
      const m = 6;
      fabPos.value = {
        left: Math.max(m, Math.min(p.left, (DomAdapter.getInnerWidth() || 360) - size - m)),
        top: Math.max(m, Math.min(p.top, (DomAdapter.getInnerHeight() || 640) - size - m)),
      };
    };
    const startFabDrag = function (e) {
      if (e && e.button) return;
      const el = fabEl.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let moved = false;
      fabDragging.value = true;
      const move = function (ev) {
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
        moved = true;
        const size = 62;
        const m = 6;
        fabPos.value = {
          left: Math.max(m, Math.min(r.left + (ev.clientX - x0),
            (DomAdapter.getInnerWidth() || 360) - size - m)),
          top: Math.max(m, Math.min(r.top + (ev.clientY - y0),
            (DomAdapter.getInnerHeight() || 640) - size - m)),
        };
      };
      const up = function () {
        fabDragging.value = false;
        if (moved) fabDragEnd = Date.now();
        DomAdapter.removeWindowEventListener('pointermove', move);
        DomAdapter.removeWindowEventListener('pointerup', up);
        DomAdapter.removeWindowEventListener('pointercancel', up);
      };
      DomAdapter.addWindowEventListener('pointermove', move);
      DomAdapter.addWindowEventListener('pointerup', up);
      DomAdapter.addWindowEventListener('pointercancel', up);
    };
    const fabClick = function () {
      /* Un arrastre no debe restaurar la llamada al soltar. */
      if (Date.now() - fabDragEnd < 400) return;
      restore();
    };

    Vue.onMounted(function () {
      retick();
      timer = setInterval(retick, 1000);
      speakTimer = setInterval(pollSpeaking, 250);
      setTimeout(attach, 0);
      makeBgs();
      ensurePeerProfile();
      DomAdapter.addEventListener('click', closeMenu);
      DomAdapter.addEventListener('keydown', closeMenu);
      DomAdapter.addWindowEventListener('resize', clampFab);
      DomAdapter.addWindowEventListener('resize', clampCallPanel);
    });
    Vue.onUpdated(function () {
      attach();
      makeBgs();
      ensurePeerProfile();
    });
    Vue.onUnmounted(function () {
      if (timer) clearInterval(timer);
      if (speakTimer) clearInterval(speakTimer);
      DomAdapter.removeEventListener('click', closeMenu);
      DomAdapter.removeEventListener('keydown', closeMenu);
      DomAdapter.removeWindowEventListener('resize', clampFab);
      DomAdapter.removeWindowEventListener('resize', clampCallPanel);
      if (audioCtx) {
        try { audioCtx.close(); } catch (e) {}
      }
    });
    Vue.watch(inCall, function (v) {
      if (v) Vue.nextTick(function () { scrollChat(true); });
    });

    return {
      store, t, remoteEl, pipEl, elapsed, minimized, callText, chatListEl,
      peerBg, myBg, peerSpeak, mySpeak, remoteMuted, menu,
      fabEl, fabStyle, fabDragging, startFabDrag, fabClick,
      peerName, peerIni, peerAvatar, myAvatar, myIni,
      isGroup, groupPeerList, callTitle, participantCount,
      peerNameOf, peerIniOf, peerAvatarOf, peerHasVideo, peerBgOf,
      peerMutedMap,
      panelEl, panelStyle, panelDragging, startPanelDrag, full, toggleFull,
      canScreenShare, toggleScreen,
      isIncoming, inCall, hasVideo, selfCamOn, stateLine, bgStyle,
      callMessages, sendChat, scrollChat,
      openMenu, menuThen, viewPeer, toggleRemoteMute, menuPeer, menuPeerMuted,
      minimize, restore,
      accept: acceptCall, reject: rejectCall, hangup: hangupCall,
      mute: toggleMute, cam: toggleCam,
    };
  },
  template:
    '<div class="callbox" :class="{ incoming: isIncoming(), calling: !inCall() && !isIncoming(), active: inCall(), minimized: minimized, full: full, dragging: panelDragging }"' +
      ' :style="panelStyle" role="dialog" :aria-label="t(\'Llamada\')">' +
      '<button class="call-fab" type="button" v-if="minimized" ref="fabEl"' +
        ' :class="{ dragging: fabDragging, moved: !!fabStyle.left }"' +
        ' :style="fabStyle" @pointerdown="startFabDrag" @click.stop="fabClick"' +
        ' :title="t(\'Volver a la llamada\')">' +
        '<span class="call-fab-ic"><svg class="ic"><use href="#i-phone"></use></svg></span>' +
        '<span class="call-fab-t">{{ elapsed }}</span>' +
      '</button>' +
      '<div class="call-panel" ref="panelEl" v-show="!minimized">' +
        '<header class="call-head" @pointerdown="startPanelDrag">' +
          '<span class="call-col">' +
            '<b>{{ callTitle() }}</b>' +
            '<span class="call-state">{{ stateLine() }}' +
              '<template v-if="isGroup() && participantCount()"> · {{ participantCount() }}</template>' +
            '</span>' +
          '</span>' +
          '<button class="icon-btn call-full" type="button"' +
            ' @click.stop="toggleFull" :title="full ? t(\'Salir de pantalla completa\') : t(\'Pantalla completa\')">' +
            '<svg class="ic"><use :href="full ? \'#i-collapse\' : \'#i-expand\'"></use></svg>' +
          '</button>' +
          '<button class="icon-btn call-min" type="button" v-if="!isIncoming()"' +
            ' @click.stop="minimize" :title="t(\'Minimizar\')">' +
            '<svg class="ic"><use href="#i-chevron-down"></use></svg>' +
          '</button>' +
        '</header>' +
        '<div class="call-participants" :class="{ solo: isIncoming(), group: isGroup() }">' +
          '<div class="call-tile peer" v-if="!isGroup()" :class="{ speaking: peerSpeak, video: hasVideo() }"' +
            ' @contextmenu.prevent.stop="openMenu($event, \'peer\')">' +
            '<div class="call-tile-bg" :style="bgStyle(peerBg)"></div>' +
            '<video class="call-remote" ref="remoteEl" autoplay playsinline' +
              ' v-show="hasVideo()"></video>' +
            '<div class="call-avatar" v-if="!hasVideo()">' +
              '<span class="avatar av72" :class="{ \'has-photo\': !!peerAvatar() }">' +
                '<img v-if="peerAvatar()" :src="peerAvatar()" alt="">' +
                '<span v-else>{{ peerIni() }}</span>' +
              '</span>' +
            '</div>' +
            '<span class="call-tile-foot">' +
              '<span class="call-tile-name">{{ peerName() }}</span>' +
            '</span>' +
          '</div>' +
          '<div class="call-tile peer group-tile" v-for="p in groupPeerList" :key="\'gp\' + p.id"' +
            ' :class="{ video: peerHasVideo(p) }" @contextmenu.prevent.stop="openMenu($event, \'p:\' + p.id)">' +
            '<div class="call-tile-bg" :style="bgStyle(peerBgOf(p))"></div>' +
            '<video class="call-peer-video" :data-peer="p.id" autoplay playsinline' +
              ' v-show="peerHasVideo(p)"></video>' +
            '<div class="call-avatar" v-if="!peerHasVideo(p)">' +
              '<span class="avatar av72" :class="{ \'has-photo\': !!peerAvatarOf(p) }">' +
                '<img v-if="peerAvatarOf(p)" :src="peerAvatarOf(p)" alt="">' +
                '<span v-else>{{ peerIniOf(p) }}</span>' +
              '</span>' +
            '</div>' +
            '<span class="call-tile-foot">' +
              '<span class="call-tile-name">{{ peerNameOf(p) }}</span>' +
              '<svg class="ic ic-sm" v-if="peerMutedMap[p.id]" :title="t(\'Silenciado\')">' +
                '<use href="#i-mute"></use></svg>' +
            '</span>' +
          '</div>' +
          '<div class="call-tile self" v-if="!isIncoming()" :class="{ speaking: mySpeak, video: selfCamOn() }"' +
            ' @contextmenu.prevent.stop="openMenu($event, \'self\')">' +
            '<div class="call-tile-bg" :style="bgStyle(myBg)"></div>' +
            '<video class="call-pip" ref="pipEl" autoplay muted playsinline' +
              ' v-show="selfCamOn()"></video>' +
            '<div class="call-avatar" v-if="!selfCamOn()">' +
              '<span class="avatar av72" :class="{ \'has-photo\': !!myAvatar() }">' +
                '<img v-if="myAvatar()" :src="myAvatar()" alt="">' +
                '<span v-else>{{ myIni() }}</span>' +
              '</span>' +
            '</div>' +
            '<span class="call-tile-foot">' +
              '<span class="call-tile-name">{{ t(\'Tú\') }}</span>' +
              '<svg class="ic ic-sm" v-if="store.call.muted" :title="t(\'Silenciado\')">' +
                '<use href="#i-mic-off"></use></svg>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="call-controls">' +
          '<template v-if="isIncoming()">' +
            '<button type="button" class="call-round accept call-accept" @click="accept"' +
              ' :title="t(\'Contestar\')" :aria-label="t(\'Contestar\')">' +
              '<svg class="ic"><use href="#i-phone"></use></svg></button>' +
            '<button type="button" class="call-round reject call-reject" @click="reject"' +
              ' :title="t(\'Rechazar\')" :aria-label="t(\'Rechazar\')">' +
              '<svg class="ic"><use href="#i-phone-down"></use></svg></button>' +
          '</template>' +
          '<template v-else>' +
            '<button type="button" class="call-round" v-if="inCall()"' +
              ' :class="{ off: store.call.muted }" @click="mute"' +
              ' :title="store.call.muted ? t(\'Activar el micrófono\') : t(\'Silenciar\')"' +
              ' :aria-label="store.call.muted ? t(\'Activar el micrófono\') : t(\'Silenciar\')">' +
              '<svg class="ic"><use :href="store.call.muted ? \'#i-mic-off\' : \'#i-mic\'"></use></svg></button>' +
            '<button type="button" class="call-round" v-if="inCall() && store.call.hasCam"' +
              ' :class="{ off: store.call.camOff }" @click="cam"' +
              ' :title="store.call.camOff ? t(\'Encender la cámara\') : t(\'Apagar la cámara\')"' +
              ' :aria-label="store.call.camOff ? t(\'Encender la cámara\') : t(\'Apagar la cámara\')">' +
              '<svg class="ic"><use :href="store.call.camOff ? \'#i-video-off\' : \'#i-video\'"></use></svg></button>' +
            '<button type="button" class="call-round call-screen" v-if="inCall() && canScreenShare()"' +
              ' :class="{ on: store.call.screen }" @click="toggleScreen"' +
              ' :title="store.call.screen ? t(\'Dejar de compartir\') : t(\'Compartir pantalla\')"' +
              ' :aria-label="store.call.screen ? t(\'Dejar de compartir\') : t(\'Compartir pantalla\')">' +
              '<svg class="ic"><use href="#i-screen"></use></svg></button>' +
            '<button type="button" class="call-round hang call-hang" @click="hangup"' +
              ' :title="t(\'Colgar\')" :aria-label="t(\'Colgar\')">' +
              '<svg class="ic"><use href="#i-phone-down"></use></svg></button>' +
          '</template>' +
        '</div>' +
        '<div class="call-chat" v-if="inCall()">' +
          '<div class="call-chat-hd">{{ t(\'Chat de la llamada\') }}</div>' +
          '<div class="call-chat-list" ref="chatListEl">' +
            '<div class="call-msg" :class="{ mine: m.mine }" v-for="m in callMessages" :key="m.key">' +
              '<span class="call-msg-name" v-if="!m.mine">{{ m.name }}</span>' +
              '<span class="call-msg-txt">{{ m.txt }}</span>' +
              '<span class="call-msg-time">{{ m.time }}</span>' +
            '</div>' +
            '<div class="call-chat-empty" v-if="!callMessages.length">' +
              '{{ t(\'No hay mensajes todavía.\') }}</div>' +
          '</div>' +
          '<form class="call-chat-form" @submit.prevent="sendChat">' +
            '<input class="call-chat-in" v-model="callText" maxlength="3000"' +
              ' :placeholder="t(\'Escribe un mensaje…\')" :aria-label="t(\'Mensaje\')">' +
            '<button class="icon-btn call-send" type="submit" :disabled="!callText.trim()"' +
              ' :title="t(\'Enviar\')" :aria-label="t(\'Enviar\')">' +
              '<svg class="ic"><use href="#i-send"></use></svg></button>' +
          '</form>' +
        '</div>' +
      '</div>' +
      '<div class="call-menu" v-if="menu" :style="{ left: menu.x + \'px\', top: menu.y + \'px\' }"' +
        ' @click.stop>' +
        '<button type="button" v-if="menuPeer()" @click="viewPeer">' +
          '<svg class="ic ic-sm"><use href="#i-user"></use></svg>' +
          '<span>{{ t(\'Ver perfil\') }}</span></button>' +
        '<button type="button" v-if="menuPeer()" @click="toggleRemoteMute">' +
          '<svg class="ic ic-sm"><use :href="menuPeerMuted ? \'#i-vol\' : \'#i-mute\'"></use></svg>' +
          '<span>{{ menuPeerMuted ? t(\'Escuchar de nuevo\') : t(\'Silenciar para mí\') }}</span></button>' +
        '<button type="button" v-if="menu.who === \'self\'" @click="menuThen(mute)">' +
          '<svg class="ic ic-sm"><use :href="store.call.muted ? \'#i-mic-off\' : \'#i-mic\'"></use></svg>' +
          '<span>{{ store.call.muted ? t(\'Activar el micrófono\') : t(\'Silenciar\') }}</span></button>' +
        '<button type="button" v-if="menu.who === \'self\' && store.call.hasCam"' +
          ' @click="menuThen(cam)">' +
          '<svg class="ic ic-sm"><use :href="store.call.camOff ? \'#i-video-off\' : \'#i-video\'"></use></svg>' +
          '<span>{{ store.call.camOff ? t(\'Encender la cámara\') : t(\'Apagar la cámara\') }}</span></button>' +
        '<button type="button" class="danger" @click="menuThen(hangup)">' +
          '<svg class="ic ic-sm"><use href="#i-phone-down"></use></svg>' +
          '<span>{{ t(\'Colgar\') }}</span></button>' +
      '</div>' +
    '</div>',
};