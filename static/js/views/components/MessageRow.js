/* MessageRow — extraído de views/chat.js (Fase 3.1). */
import { formatEmojisForA11y } from '../../a11y.js';
import {
  fmtSize, mediaUrl,
} from '../../actions.js';
import { ensurePreview } from '../../api.js';
import {
  emoAnySrc, emoStyle, emojiCode, isEmojiBurst, reactBump, reactRank, shortcodesToEmoji, splitEmojis,
} from '../../emoji.js';
import {
  sysText, t,
} from '../../i18n.js';
import {
  audioFallbackFmt, cacheMedia, compatUrl, forgetCached, getBlob, markDlDone, markMediaCompat, markOggBroken,
} from '../../mediadl.js';
import { store } from '../../store.js';
import {
  assetWithMedia, isGifFav, isGifMedia, isStkFav, queueNextVoice,
  toggleFavGif, toggleStickerAsset, toggleStkFav, voicePlayers,
  getCurrentAudioEl, setCurrentAudioEl,
} from '../../views/ui-actions.js';
import Vue from '../../vue.js';
import { DomAdapter } from '../../platform/dom.js';
import { MediaAdapter } from '../../platform/media.js';
import { EmojiPicker } from './EmojiPicker.js';

export const MessageRow = {
  components: { EmojiPicker },
  props: { row: { type: Object, required: true } },
  emits: ['imgload', 'reply', 'react', 'openprofile', 'zoom', 'saveedit', 'upcancel', 'upretry', 'menu', 'scrolltoreply'],
  setup: function (props, ctx) {
    const emit = ctx.emit;
    /* W17: el picker vive en store.reactFor (antes era un ref local por
       fila). Así solo hay UN panel de reacciones abierto a la vez, el
       clic exterior lo cierra (onDocClick) y el composer/menú contextual
       lo cierran al abrirse. */

    const replyName = function (row) {
      const rp = row.ref.reply_to;
      if (!rp || !rp.sender) return '';
      // El servidor manda sender como string (display_name o username).
      if (typeof rp.sender === 'string') return rp.sender;
      return rp.sender.display_name || rp.sender.username || '';
    };
    const replyText = function (row) {
      const rp = row.ref.reply_to;
      if (!rp) return '';
      /* W45: citar un spoiler no lo destapa (ni con el texto local). */
      if (rp.spoiler) return t('Spoiler');
      const txt = rp.body;
      if (txt) return txt;
      if (rp.kind === 'voice') return t('Nota de voz');
      if (rp.kind === 'image') return t('Imagen');
      if (rp.kind === 'system') return '';
      return t('Archivo adjunto');
    };
    const groupReactions = function (m) {
      const out = [];
      const rs = m.reactions || [];
      for (let i = 0; i < rs.length; i++) {
        let g = null;
        for (let j = 0; j < out.length; j++) if (out[j].emoji === rs[i].emoji) g = out[j];
        if (g) g.count++;
        else out.push({ emoji: rs[i].emoji, count: 1 });
      }
      return out;
    };

    /* Mi reacción actual en este mensaje (server: 1 por usuario). */
    const myReaction = function (m) {
      if (!store.user) return '';
      const rs = m.reactions || [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].user_id === store.user.id) return rs[i].emoji;
      }
      return '';
    };

    const doReply = function (row) {
      store.reactFor = 0;
      emit('reply', row.ref);
    };
    const doReact = function (row, emoji) {
      store.reactFor = 0;
      fullReact.value = false;
      /* W17: quitar la propia reacción no cuenta como "uso"; agregar
         sí la sube de puesto en la barra rápida. */
      if (myReaction(row.ref) !== emoji) reactBump(emoji);
      emit('react', row.ref, emoji);
    };

    /* Picker de reacciones: hover (botón emoji) o menú contextual
       (store.reactFor). Clic en el chip propio = quitar. */
    const pickerOpen = function (row) {
      return store.reactFor !== 0 && store.reactFor === row.ref.id;
    };
    const togglePicker = function () {
      const open = pickerOpen(props.row);
      store.emoOpen = false;     // W17: un solo panel flotante a la vez
      store.ctx = null;
      store.reactFor = open ? 0 : props.row.ref.id;
      fullReact.value = false;
    };
    /* W13: desde el picker chico se abre el selector completo. */
    const fullReact = Vue.ref(false);
    const toggleFull = function () {
      fullReact.value = !fullReact.value;
    };
    /* W17: ⋯ de la barra hover → el menú contextual del mensaje. */
    const openMenu = function (row, ev) {
      emit('menu', { row: row, ev: ev });
    };

    /* W17: los 12 chips rápidos ordenados por uso (reactRank es reactivo:
       al reaccionar se reordena al instante). */
    const emojis = Vue.computed(function () { return reactRank(12); });

    /* W57: el picker se teletransporta a <body> y se coloca con
       position:fixed. Antes vivía dentro de la burbuja; cuando un
       ancestro tenía transform/animación, Gecko tomaba ese ancestro como
       bloque contenedor y el clamp terminaba mandando el panel fuera de
       la pantalla. Ahora la referencia es siempre el viewport. */
    const rpEl = Vue.ref(null);
    const rpPos = Vue.ref({ left: '0px', top: '0px' });
    const placeRp = function () {
      Vue.nextTick(function () {
        const el = rpEl.value;
        if (!el) return;
        const msg = DomAdapter.querySelector(
          '.msg[data-msg-id="' + props.row.ref.id + '"]');
        const bub = msg && msg.querySelector('.bubble');
        const msgs = DomAdapter.querySelector('.msgs');
        if (!bub || !msgs) return;
        const br = DomAdapter.getRect(bub);
        const mb = DomAdapter.getRect(msgs);
        /* El ancho se decide por el estado, no por offsetWidth: al abrir
           el panel completo la clase .rp-wide puede aplicarse un instante
           después de esta medición. */
        const w = fullReact.value ? 320 : (el.offsetWidth || 216);
        const h = el.offsetHeight || 81;
        const m = 4;
        const gap = 6;
        /* Alinear a la derecha de la burbuja, sin salir del área de
           mensajes. */
        let x = br.right - w;
        x = Math.max(mb.left + m, Math.min(x, mb.right - m - w));
        /* Preferencia: encima; si no cabe, debajo; y al final se limita
           al área visible incluso en ventanas muy bajas. */
        let y = br.top - gap - h;
        if (y < mb.top + m) y = br.bottom + gap;
        y = Math.min(y, mb.bottom - m - h);
        y = Math.max(mb.top + m, y);
        rpPos.value = {
          left: Math.round(x) + 'px',
          top: Math.round(y) + 'px',
        };
      });
    };
    /* W57: si el usuario desplaza el área de mensajes o cambia el
       tamaño de la ventana, el panel fijo sigue pegado a su burbuja. */
    let rpScrollEl = null;
    const rpMove = function () { placeRp(); };
    const bindRpMove = function (on) {
      if (on && !rpScrollEl) {
        rpScrollEl = DomAdapter.querySelector('.msgs');
        if (rpScrollEl) rpScrollEl.addEventListener('scroll', rpMove, { passive: true });
        DomAdapter.addWindowEventListener('resize', rpMove);
      } else if (!on && rpScrollEl) {
        rpScrollEl.removeEventListener('scroll', rpMove);
        DomAdapter.removeWindowEventListener('resize', rpMove);
        rpScrollEl = null;
      }
    };
    Vue.watch(function () { return store.reactFor; }, function () {
      if (!pickerOpen(props.row)) {
        fullReact.value = false;
        bindRpMove(false);
        return;
      }
      fullReact.value = false;
      bindRpMove(true);
      placeRp();
    });
    Vue.watch(fullReact, function () {
      if (pickerOpen(props.row)) placeRp();
    });
    Vue.onUnmounted(function () { bindRpMove(false); });

    /* ---- W8: reproductor de audio propio (no usa <audio controls>) ---- */
    const aEl = Vue.ref(null);
    const aPlaying = Vue.ref(false);
    const aCur = Vue.ref(0);
    const aDur = Vue.ref(0);

    const fmtTime = function (s) {
      if (!s || s < 0 || !isFinite(s)) return '0:00';
      const m = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      return m + ':' + (ss < 10 ? '0' : '') + ss;
    };
    /* W51: play() puede rechazar (sin fuente, códec ausente, gesto
       bloqueado). Sin .catch, Mypal llenaba la consola de
       "Uncaught (in promise) NotSupportedError". */
    const safePlay = function (el) {
      if (!el) return;
      try {
        const p = el.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    };
    /* W53: qué formato tiene realmente la fuente actual. Con blob no se
       puede leer ?fmt=, así que miramos el MIME del Blob descargado. */
    const audioSrcFmt = function (el) {
      if (!el) return '';
      const src = el.currentSrc || el.src || '';
      const fm = /[?&]fmt=([a-z0-9]+)/i.exec(src);
      if (fm) return fm[1].toLowerCase();
      const raw = getBlob(src);
      const mt = raw && raw.type
        ? String(raw.type).split(';')[0].trim().toLowerCase() : '';
      if (mt === 'audio/ogg' || mt === 'application/ogg') return 'ogg';
      if (mt === 'audio/wav' || mt === 'audio/x-wav') return 'wav';
      if (mt === 'audio/mpeg') return 'mp3';
      if (mt === 'audio/webm') return 'webm';
      return '';
    };
    /* W51/W53: si el navegador no decodifica el original, cambia el src
       al derivado compatible del server (MP4/Ogg/WAV), conserva la
       descarga en segundo plano y deja la URL para la próxima apertura.
       Audio: Ogg Vorbis primero y WAV PCM como último recurso. */
    const compatFallback = function (el, tag, tries) {
      const m = props.row.ref.media;
      if (!m || !m.url) return '';
      const cur = tag === 'AUDIO' ? audioSrcFmt(el) : '';
      let forceFmt = '';
      if (tag === 'AUDIO') {
        if (cur === 'wav') return '';
        if (cur === 'ogg' || tries > 0) forceFmt = 'wav';
        else forceFmt = audioFallbackFmt();
      }
      const alt = compatUrl(m.url, m.mime, tag, true, forceFmt);
      /* W93: la comparación ya no puede ser `alt === m.url` (compatUrl
         prefixea CDN_BASE): un respaldo "sin fmt" significa que no hay
         derivado aplicable (p. ej. vídeo no-WebM) — no swap, para no
         entrar en bucle con el mismo archivo. */
      if (!alt || alt.indexOf('fmt=') < 0) return '';
      if (tag === 'AUDIO' && cur === 'ogg') markOggBroken();
      markMediaCompat(m.mime);
      forgetCached(m.url);
      el.__dlNoSwap = true;
      cacheMedia(alt);
      return alt;
    };
    const aTime = Vue.computed(function () {
      return fmtTime(aCur.value) + ' / ' + fmtTime(aDur.value);
    });
    const aPct = Vue.computed(function () {
      if (!aDur.value) return 0;
      return Math.min(100, (aCur.value / aDur.value) * 100);
    });
    let aWantPlay = false;
    const togglePlay = function () {
      const el = aEl.value;
      if (!el) return;
      if (el.paused) {
        const cur = getCurrentAudioEl();
        if (cur && cur !== el) {
          try { cur.pause(); } catch (e) {}
        }
        setCurrentAudioEl(el);
        aWantPlay = true;
        /* W51: si por cualquier motivo el <audio> aún no tiene fuente,
           empieza a reproducir la URL firmada (sin esperar al blob). */
        if (!el.currentSrc && !el.src) {
          const m = props.row.ref.media;
          if (!m || !m.url) return;
          el.__dlNoSwap = true;
          el.src = compatUrl(m.url, m.mime, 'AUDIO');
          try { el.load(); } catch (e) {}
        }
        /* W13 fix: notas viejas sin dur → resolverla al primer play */
        if (!aDur.value) resolveDur(el);
        safePlay(el);
      } else {
        el.pause();
      }
    };

    /* W13: último recurso para WebM sin duración (notas viejas): decodifica
       el archivo. Solo al pulsar reproducir (no al cargar).
       W15: usa el blob YA descargado (mediadl.js) — sin fetch, sin red y
       sin depender del CSP; si no está en memoria, cae al fetch de antes. */
    const aResolving = Vue.ref(false);
    const decodeDurBuf = function (buf) {
      if (!buf) { aResolving.value = false; return; }
      const ctx = MediaAdapter.createAudioContext();
      if (!ctx) { aResolving.value = false; return; }
      let closed = false;
      const finish = function () {
        aResolving.value = false;
        if (closed) return;
        closed = true;
        try { ctx.close(); } catch (e) {}
      };
      const got = function (ab) {
        /* decodeAudioData entrega un AudioBuffer (no un número): la duración
           está en ab.duration. (Antes se hacía isFinite(sobre el buffer) y
           nunca guardaba; solo se enmascaraba porque el seek resolvía antes.) */
        const dd = ab && ab.duration;
        if (dd && isFinite(dd) && dd > 0) aDur.value = dd;
        finish();
      };
      const failed = function () { finish(); };
      try {
        /* FF78 devuelve una promesa aunque se pasen callbacks. Si el códec
           no está disponible, esa promesa se rechaza y sin catch quedaba
           "Uncaught (in promise) EncodingError" en Mypal. */
        const p = ctx.decodeAudioData(buf, got, failed);
        if (p && typeof p.catch === 'function') p.catch(failed);
      } catch (e) { finish(); }
    };
    const resolveDur = function (el) {
      if (aResolving.value || aDur.value) return;
      const src = el.currentSrc || el.src;
      if (!src) return;
      aResolving.value = true;
      const raw = getBlob(src);
      if (raw && raw.arrayBuffer) {            // en memoria: decodificar ya
        raw.arrayBuffer()
          .then(decodeDurBuf)
          .catch(function () { aResolving.value = false; });
        return;
      }
      if (typeof fetch !== 'function') { aResolving.value = false; return; }
      fetch(src, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(decodeDurBuf)
        .catch(function () { aResolving.value = false; });
    };
    const seek = function (e) {
      const el = aEl.value;
      if (!el || !aDur.value) return;
      const bar = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
      el.currentTime = ratio * aDur.value;
    };
    /* W63: arrastrar el círculo/barra para buscar posición (scrubbing).
       El rectángulo se captura del .wave real: en los listeners de window
       e.currentTarget es window, no la barra. También soporta táctil. */
    let waveDrag = false;
    const waveBarOf = function (target) {
      if (!target) return null;
      if (target.closest) return target.closest('.wave');
      return null;
    };
    const waveSeekTo = function (bar, clientX) {
      const el = aEl.value;
      if (!el || !aDur.value || !bar) return;
      const r = bar.getBoundingClientRect();
      if (!r.width) return;
      const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      el.currentTime = ratio * aDur.value;
    };
    const waveDown = function (e) {
      const el = aEl.value;
      const bar = waveBarOf(e.currentTarget);
      if (!el || !aDur.value || !bar) return;
      waveDrag = true;
      if (e.preventDefault) e.preventDefault();
      waveSeekTo(bar, e.clientX);
      const move = function (ev) { waveSeekTo(bar, ev.clientX); };
      const up = function () {
        waveDrag = false;
        DomAdapter.removeWindowEventListener('mousemove', move);
        DomAdapter.removeWindowEventListener('mouseup', up);
      };
      DomAdapter.addWindowEventListener('mousemove', move);
      DomAdapter.addWindowEventListener('mouseup', up);
    };
    const waveDownTouch = function (e) {
      const el = aEl.value;
      const bar = waveBarOf(e.currentTarget);
      if (!el || !aDur.value || !bar || !e.touches || !e.touches.length) return;
      if (e.preventDefault) e.preventDefault();
      waveDrag = true;
      waveSeekTo(bar, e.touches[0].clientX);
      const move = function (ev) {
        if (!ev.touches || !ev.touches.length) return;
        if (ev.preventDefault) ev.preventDefault();
        waveSeekTo(bar, ev.touches[0].clientX);
      };
      const up = function () {
        waveDrag = false;
        DomAdapter.removeWindowEventListener('touchmove', move);
        DomAdapter.removeWindowEventListener('touchend', up);
        DomAdapter.removeWindowEventListener('touchcancel', up);
      };
      DomAdapter.addWindowEventListener('touchmove', move, { passive: false });
      DomAdapter.addWindowEventListener('touchend', up);
      DomAdapter.addWindowEventListener('touchcancel', up);
    };
    /* W37d: velocidad de la NOTA DE VOZ (1× → 1,5× → 2× → 1×) */
    const aRateV = Vue.ref(1);
    const aRate = function () {
      const el = aEl.value;
      const next = aRateV.value === 1 ? 1.5 : (aRateV.value === 1.5 ? 2 : 1);
      aRateV.value = next;
      if (el) el.playbackRate = next;
    };
    const aMeta = function (e) {
      const d = e.target.duration;
      /* Fix W13: los WebM de MediaRecorder no traen duración en el
         encabezado (el elemento reporta Infinity → se veía "0:00").
         Preferimos la duración que guardó quien grabó; si no la hay
         (audios viejos), forzamos la carga total con un seek lejano. */
      if (isFinite(d) && d > 0) { aDur.value = d; return; }
      const known = props.row.ref.dur;
      if (known && known > 0) { aDur.value = known; return; }
      aDur.value = 0;
      /* W15: si el blob está en memoria lo decodificamos para la duración;
         el truco del seek lejano (W13) rompía la reproducción cuando el
         audio ya venía cargado entero como blob (webm de MediaRecorder
         sin duración en el encabezado). Solo se usa el seek en streaming. */
      const msrc = e.target.currentSrc || e.target.src;
      if (getBlob(msrc)) { resolveDur(e.target); return; }
      try { e.target.currentTime = 1e6; } catch (err) {}
    };
    /* W51/W53: el audio original no se pudo decodificar (Mypal 78 con
       WebM/Opus o MP3/WMF). Se prueba Ogg Vorbis y, si también falla,
       WAV PCM; no se muestra un error porque el reproductor sigue siendo
       el mismo. */
    let aErrTries = 0;
    const aErrEv = function (e) {
      if (aErrTries >= 2) return;
      const el = e.target;
      const alt = compatFallback(el, 'AUDIO', aErrTries);
      if (!alt) return;
      aErrTries++;
      el.src = alt;
      try { el.load(); } catch (err) {}
      /* Si el usuario ya había pulsado play, el cambio de formato no debe
         costarle un segundo clic. */
      if (aWantPlay) safePlay(el);
    };
    /* Tras el seek lejano el navegador calcula la duración real; si no,
       el extremo cargado da una pista (W13 fix del "0:00" eterno). */
    const aDurEv = function (e) {
      const el = e.target;
      if (isFinite(el.duration) && el.duration > 0) { aDur.value = el.duration; return; }
      try {
        if (el.seekable && el.seekable.length && el.seekable.end(0) > 0.5) {
          aDur.value = el.seekable.end(0);
        }
      } catch (err) { /* sin seekable: seguir esperando */ }
    };
    const aTimeUpd = function (e) { aCur.value = e.target.currentTime || 0; };
    /* W16: progreso suave. En Firefox timeupdate llega ~1 vez por segundo
       (y con 34 barras la onda se movía literalmente a "1 fps"): mientras
       suena, requestAnimationFrame mantiene barra y tiempo a ~60 fps.
       timeupdate queda como respaldo (seek con el audio pausado). */
    let aRaf = 0;
    const aRafStop = function () {
      if (aRaf) { cancelAnimationFrame(aRaf); aRaf = 0; }
      const el = aEl.value;
      if (el) aCur.value = el.currentTime || 0;   /* estado final exacto */
    };
    const aTick = function () {
      aRaf = 0;
      const el = aEl.value;
      if (!el || el.paused || el.ended) return;   /* sin nueva tanda */
      aCur.value = el.currentTime || 0;
      aRaf = requestAnimationFrame(aTick);
    };
    const aPlayEv = function () {
      aWantPlay = false;
      aPlaying.value = true;
      if (!aRaf) aRaf = requestAnimationFrame(aTick);
    };
    const aPauseEv = function () {
      aWantPlay = false;
      aPlaying.value = false;
      aRafStop();
    };
    const aEndEv = function () {
      aPlaying.value = false;
      aRafStop();
      /* W13: tras escucharla completa ya sabemos cuánto dura */
      if (!aDur.value && aCur.value) aDur.value = aCur.value;
      aCur.value = 0;
      try { aEl.value.currentTime = 0; } catch (e) {}
      /* W99: si la cola está activa, sigue con la siguiente nota. */
      queueNextVoice(props.row.ref);
    };
    Vue.onUnmounted(aRafStop);

    /* W99: esta fila expone su reproductor a la cola (solo notas de
       voz con media; se da de baja al desmontar la fila). */
    if (props.row.ref.kind === 'voice') {
      voicePlayers[props.row.ref.id] = function () {
        const el = aEl.value;
        if (el && el.paused) togglePlay();
      };
      Vue.onUnmounted(function () { delete voicePlayers[props.row.ref.id]; });
    }

    /* ---- W36c: reproductor PROPIO de video (controles dentro del
       video): play/pausa al centro, barra + hora + silencio + pantalla
       completa abajo; los controles se ocultan a los 1 s de inactividad
       mientras reproduce (con pausa siempre se ven). ---- */
    const vEl = Vue.ref(null);
    const vWrapEl = Vue.ref(null);
    const vPlaying = Vue.ref(false);
    const vCur = Vue.ref(0);
    const vDur = Vue.ref(0);
    const vMuted = Vue.ref(false);
    const vHide = Vue.ref(false);
    let vHideT = 0;
    const vArmHide = function () {
      if (vHideT) { clearTimeout(vHideT); vHideT = 0; }
      if (!vPlaying.value) { vHide.value = false; return; }
      vHideT = setTimeout(function () { vHide.value = true; }, 1000);
    };
    const vPeek = function () {
      vHide.value = false;
      vArmHide();
    };
    const vCurTxt = Vue.computed(function () { return fmtTime(vCur.value); });
    const vDurTxt = Vue.computed(function () { return fmtTime(vDur.value); });
    const vPct = Vue.computed(function () {
      if (!vDur.value) return '0%';
      return Math.min(100, (vCur.value / vDur.value) * 100) + '%';
    });
    let vWantPlay = false;
    const toggleV = function () {
      const el = vEl.value;
      if (!el) return;
      if (el.paused) {
        const cur = getCurrentAudioEl();
        if (cur && cur !== el) {
          try { cur.pause(); } catch (e) {}
        }
        setCurrentAudioEl(el);
        vWantPlay = true;
        /* W51: primer clic mientras v-dl todavía baja el archivo. Antes
           el video no tenía src y el clic se perdía. Ahora arranca el
           streaming firmado al instante; la descarga completa sigue en
           segundo plano y NO reemplaza la fuente que ya suena. */
        if (!el.currentSrc && !el.src) {
          const m = props.row.ref.media;
          if (!m || !m.url) return;
          el.__dlNoSwap = true;
          el.src = compatUrl(m.url, m.mime, 'VIDEO');
          try { el.load(); } catch (e) {}
        }
        safePlay(el);
      } else {
        el.pause();
      }
    };
    const vSeekTo = function (e) {
      const el = vEl.value;
      if (!el || !vDur.value) return;
      const bar = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
      el.currentTime = ratio * vDur.value;
      vPeek();
    };
    const vMute = function () {
      const el = vEl.value;
      if (!el) return;
      el.muted = !el.muted;
      vMuted.value = el.muted;
    };
    /* W43: el botón ALTERNA — si este video ya está en pantalla
       completa, el segundo clic SALE (antes pedir fullscreen estando
       en fullscreen era no-op: no había forma de salir con el botón).
       vFs cambia icono (expand/collapse) y rótulo. */
    const vFs = Vue.ref(false);
    const vFsChange = function () {
      vFs.value = DomAdapter.getFullscreenElement() === vWrapEl.value;
    };
    DomAdapter.addEventListener('fullscreenchange', vFsChange);
    DomAdapter.addEventListener('webkitfullscreenchange', vFsChange);
    Vue.onUnmounted(function () {
      DomAdapter.removeEventListener('fullscreenchange', vFsChange);
      DomAdapter.removeEventListener('webkitfullscreenchange', vFsChange);
    });
    const vFull = function () {
      const el = vWrapEl.value;
      if (!el) return;
      if (DomAdapter.getFullscreenElement() === el) {
        DomAdapter.exitFullscreen();
        return;
      }
      DomAdapter.requestFullscreen(el);
    };
    const vMeta = function (e) {
      const d = e.target.duration;
      vDur.value = (isFinite(d) && d > 0) ? d : 0;
      /* W29a: sin pista de video (sonido solo) → el bloque cae al
         reproductor de audio (misma prueba que antes en vidMeta). */
      if (e.target && !e.target.videoHeight) vidOk.value = false;
      const nw = e.target && +e.target.videoWidth;
      const nh = e.target && +e.target.videoHeight;
      if (nw > 0 && nh > 0) {
        vNatW.value = nw;
        vNatH.value = nh;
      }
    };
    const vTimeUpd = function (e) { vCur.value = e.target.currentTime || 0; };
    const vPlayEv = function () {
      vWantPlay = false;
      vPlaying.value = true;
      vArmHide();
      /* W37d: si reproduce, la descarga ya terminó: limpia el overlay
         residual (anillo/✕) que a veces quedaba visible. */
      vClearDlState();
    };
    const vPauseEv = function () {
      vWantPlay = false;
      vPlaying.value = false;
      if (vHideT) { clearTimeout(vHideT); vHideT = 0; }
      vHide.value = false;
    };
    const vEndEv = function () {
      vPlaying.value = false;
      vHide.value = false;
      vCur.value = 0;
      try { vEl.value.currentTime = 0; } catch (e) {}
    };
    /* W37d: control de VOLUMEN con popup (slider) — al abrirlo la hora
       se desvanece (transition) para no amontonar la barra. */
    const vVol = Vue.ref(1);
    const vVolOpen = Vue.ref(false);
    const vSetVol = function (e) {
      const el = vEl.value;
      const v = Math.max(0, Math.min(1, parseFloat(e.target.value)));
      vVol.value = v;
      if (!el) return;
      el.volume = v;
      if (v > 0 && el.muted) { el.muted = false; vMuted.value = false; }
    };
    const vToggleVol = function () {
      vVolOpen.value = !vVolOpen.value;
      vPeek();
    };
    /* W37d: errores de decodificación/mime — "Este video tiene un error
       y no se puede reproducir" con icono de advertencia. */
    const vErr = Vue.ref(false);
    let vErrTried = false;
    const vErrEv = function (e) {
      if (!vErrTried) {
        vErrTried = true;
        const alt = compatFallback(e.target, 'VIDEO');
        if (alt) {                       /* sigue el player con MP4 */
          e.target.src = alt;
          try { e.target.load(); } catch (err) {}
          /* El primer clic en Mypal no se pierde: si el usuario quiso
             reproducir, el MP4 arranca al estar listo. */
          if (vWantPlay) safePlay(e.target);
          return;
        }
      }
      vErr.value = true;
    };
    /* W37d: si el video ya REPRODUCE, la descarga terminó — cualquier
       estado de overlay (anillo/✕) es residual: se limpia aquí (el bug
       era que la ✕ de cancelar quedaba visible con el video sonando).
       W43: markDlDone actualiza la fuente de verdad de las clases dl-*
       (si no, el re-assert de mediadl restauraría el estado viejo). */
    const vClearDlState = function () {
      markDlDone(vWrapEl.value);
    };
    /* clic en el centro del video = play/pausa (como en los players
       comerciales); el botón central usa .stop para no duplicar */
    const vClickCenter = function () {
      vPeek();
      toggleV();
    };
    Vue.onUnmounted(function () {
      if (vHideT) clearTimeout(vHideT);
    });

    /* ---- W36c: audio adjunto (mp3/ogg/…) con el MISMO player propio
       que las notas de voz: play/pausa, barra, hora y velocidad. El
       <audio> queda oculto (los tests y la descarga lo siguen usando). ---- */
    const afEl = Vue.ref(null);
    const afPlaying = Vue.ref(false);
    const afCur = Vue.ref(0);
    const afDur = Vue.ref(0);
    const afRateV = Vue.ref(1);
    const afCurTxt = Vue.computed(function () { return fmtTime(afCur.value); });
    const afDurTxt = Vue.computed(function () { return fmtTime(afDur.value); });
    const afPct = Vue.computed(function () {
      if (!afDur.value) return '0%';
      return Math.min(100, (afCur.value / afDur.value) * 100) + '%';
    });
    let afWantPlay = false;
    const afToggle = function () {
      const el = afEl.value;
      if (!el) return;
      if (el.paused) {
        const cur = getCurrentAudioEl();
        if (cur && cur !== el) {
          try { cur.pause(); } catch (e) {}
        }
        setCurrentAudioEl(el);
        afWantPlay = true;
        if (!el.currentSrc && !el.src) {
          const m = props.row.ref.media;
          if (!m || !m.url) return;
          el.__dlNoSwap = true;
          el.src = compatUrl(m.url, m.mime, 'AUDIO');
          try { el.load(); } catch (e) {}
        }
        safePlay(el);
      } else {
        el.pause();
      }
    };
    const afSeek = function (e) {
      const el = afEl.value;
      if (!el || !afDur.value) return;
      const bar = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
      el.currentTime = ratio * afDur.value;
    };
    const afRate = function () {
      const el = afEl.value;
      const next = afRateV.value === 1 ? 1.5 : (afRateV.value === 1.5 ? 2 : 1);
      afRateV.value = next;
      if (el) el.playbackRate = next;
    };
    const afMeta = function (e) {
      const d = e.target.duration;
      afDur.value = (isFinite(d) && d > 0) ? d : 0;
    };
    let afErrTries = 0;
    const afErrEv = function (e) {
      if (afErrTries >= 2) return;
      const alt = compatFallback(e.target, 'AUDIO', afErrTries);
      if (!alt) return;
      afErrTries++;
      e.target.src = alt;
      try { e.target.load(); } catch (err) {}
      if (afWantPlay) safePlay(e.target);
    };
    const afTimeUpd = function (e) { afCur.value = e.target.currentTime || 0; };
    const afPlayEv = function () { afWantPlay = false; afPlaying.value = true; };
    const afPauseEv = function () { afWantPlay = false; afPlaying.value = false; };
    const afEndEv = function () {
      afPlaying.value = false;
      afCur.value = 0;
      try { afEl.value.currentTime = 0; } catch (e) {}
    };

    /* W13: onda de voz — 34 barras. Si el server trae los picos de la
       grabación se dibuja la forma real; si no (grabaciones viejas),
       un perfil neutro. La barra clickeada hace seek. */
    const WAVE_N = 34;
    const wave = Vue.computed(function () {
      const p = props.row.ref.peaks;
      const out = [];
      if (p && p.length) {
        const step = p.length / WAVE_N;
        for (let i = 0; i < WAVE_N; i++) {
          const a = Math.floor(i * step);
          const b = Math.max(a + 1, Math.floor((i + 1) * step));
          let s = 0;
          for (let j = a; j < b && j < p.length; j++) if (p[j] > s) s = p[j];
          out.push(Math.max(10, Math.min(100, s)));
        }
      } else {
        for (let i = 0; i < WAVE_N; i++) out.push(30 + ((i * 7) % 5) * 9);
      }
      return out;
    });
    const aBarF = Vue.computed(function () {
      return (aPct.value / 100) * WAVE_N;
    });
    const aBar = Vue.computed(function () {
      return Math.floor(aBarF.value);
    });
    /* W16: la barra "líder" (a medio llenar) se atenúa con opacity para
       que el borde de la onda avance de forma continua en vez de saltar
       de a 34 escalones; en el resto devuelve null (sin estilo inline).
       Sólo opacity → permitido y barato en FF78. */
    const waveOp = function (i) {
      if (i !== aBar.value + 1) return null;
      return (0.35 + 0.6 * (aBarF.value - aBar.value)).toFixed(3);
    };

    /* ---- W8: edición en línea (store.editFor desde el menú contextual) ---- */
    const editing = Vue.computed(function () {
      return store.editFor !== 0 && store.editFor === props.row.ref.id;
    });
    const editEl = Vue.ref(null);
    Vue.watch(editing, function (on) {
      if (!on) return;
      /* W32: el texto DESCIFRADO al editar (nunca el marcador). */
      const ref0e = props.row.ref;
      store.editDraft = ref0e.body || '';
      Vue.nextTick(function () {
        const el = editEl.value;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(el.value.length, el.value.length);
          } catch (e) {}
        }
      });
    });
    const cancelEdit = function () {
      store.editFor = 0;
      store.editDraft = '';
    };
    const saveEdit = function () {
      const txt = store.editDraft;
      if (!txt.trim()) { cancelEdit(); return; }
      /* W17: los ":código:" se convierten igual que al enviar. */
      emit('saveedit', props.row.ref, shortcodesToEmoji(txt));
    };

    /* W11: helpers del círculo de subida (r=21 → circunferencia 132) */
    const isVideo = function (m) {
      return !!(m && /^video\//.test(m.mime || ''));
    };
    /* W29a: archivos de AUDIO (mp3/ogg/m4a/…) → reproductor <audio>
       nativo en vez de la fila de descarga. */
    const isAudio = function (m) {
      if (!m) return false;
      if (/^audio\//.test(m.mime || '')) return true;
      const n = (m.name || '').toLowerCase();
      return /\.(mp3|ogg|oga|m4a|wav|flac|aac|opus|weba)$/.test(n);
    };
    /* W29a: probe del <video> — si al cargar los metadatos no hay
       pista de video (videoHeight = 0, p. ej. un webm de audio) la
       burbuja cambia a <audio> en vez de mostrar un recuadro negro. */
    const vidOk = Vue.ref(true);
    /* W51: resolución real del video para reservar el marco antes de
       descargarlo (el server ya la manda en media.width/height; este
       respaldo cubre filas viejas hasta que se rellenen). */
    const vNatW = Vue.ref(0);
    const vNatH = Vue.ref(0);
    const vBox = Vue.computed(function () {
      const md = props.row.ref.media;
      const w = (md && +md.width) || vNatW.value;
      const h = (md && +md.height) || vNatH.value;
      if (w < 1 || h < 1) return null;
      /* tope 360×340, manteniendo la proporción; en móvil se ajusta al
         ancho visible para que el marco no desborde la burbuja. */
      const vw = DomAdapter.getInnerWidth() || 1000;
      const cap = Math.max(160, Math.min(360, vw - 96));
      const bw = Math.min(cap, Math.round(340 * w / h), w);
      return {
        width: bw + 'px',
        height: Math.max(1, Math.round(bw * h / w)) + 'px',
      };
    });
    /* W36c: la prueba de pista de video ahora vive en vMeta (player propio). */
    /* W29a: la animación de entrada corre una sola vez; al terminar se
       quita la bandera para no repetirla en re-renders. */
    const animEnd = function (e) {
      if (e.target !== e.currentTarget) return;
      if (props.row.ref && props.row.ref._in) props.row.ref._in = false;
    };
    /* W22: si el server conoce la resolución de la imagen, el marco se
       reserva con esa proporción desde el principio y el spinner de
       descarga/subida queda dentro del cuadro. Sin resolución conocida
       (archivos viejos, SVG) → null: solo la miniatura difuminada. */
    const imgBox = Vue.computed(function () {
      const md = props.row.ref.media;
      const w = (md && +md.width) || 0;
      const h = (md && +md.height) || 0;
      if (w < 1 || h < 1) return null;
      /* tope 300×340 (los mismos del .b-img), manteniendo la proporción;
         en pantallas angostas se descuenta el avatar/margen para que la
         imagen no desborde la burbuja (W51, sin aspect-ratio). */
      const vw = DomAdapter.getInnerWidth() || 1000;
      const cap = Math.max(120, Math.min(300, vw - 96));
      const bw = Math.min(cap, Math.round(340 * w / h), w);
      return {
        width: bw + 'px',
        height: Math.max(1, Math.round(bw * h / w)) + 'px',
      };
    });
    const upPct = function (up) {
      return Math.round((up.p || 0) * 100) + '%';
    };
    const upOff = function (up) {
      return 132 - 132 * (up.p || 0);
    };

    /* W29b: dentro de cada trozo de texto, los emojis salen como
       segmentos propios con su archivo Twemoji (e); las menciones se
       conservan enteras. */

    /* W35a: enlaces con cualquier protocolo seguro de la lista (https,
       ftp, mailto, tel, …). javascript:/data: NO están en la lista,
       así que quedan como texto plano. Se trae la puntuación final
       (",." del final de la oración) fuera del enlace. */
    const LINK_OK = /^(?:https?|ftps?|mailto|tel|sms|geo|magnet|xmpp|ircs?|news|matrix|skype|tg|whatsapp|steam|spotify|market|callto)$/i;
    const LINK_RE = /[a-z][a-z0-9+.\-]*:(?:\/\/)?[^\s<>"']*/gi;

    const splitLinks = function (txt) {
      const res = [];
      let last = 0;
      LINK_RE.lastIndex = 0;
      let m = LINK_RE.exec(txt);
      while (m) {
        const raw = m[0];
        const start = m.index;
        const colon = raw.indexOf(':');
        const scheme = raw.slice(0, colon).toLowerCase();
        const url = raw.replace(/[.,;:!?)\]}'"]+$/, '');
        if (LINK_OK.test(scheme) && url.length > colon + 2) {
          if (start > last) res.push({ t: txt.slice(last, start) });
          res.push({ t: url, u: url });
          last = start + url.length;
          LINK_RE.lastIndex = last;
        } else {
          LINK_RE.lastIndex = start + colon + 1;   // sigue buscando dentro
        }
        m = LINK_RE.exec(txt);
      }
      if (last < txt.length) res.push({ t: txt.slice(last) });
      return res;
    };

    const splitSegs = function (arr) {
      const res = [];
      for (let i = 0; i < arr.length; i++) {
        const sg = arr[i];
        if (sg.m) { res.push(sg); continue; }
        const lks = splitLinks(sg.t);          /* W35a */
        for (let k = 0; k < lks.length; k++) {
          if (lks[k].u) { res.push(lks[k]); continue; }
          const parts = splitEmojis(lks[k].t);
          for (let j = 0; j < parts.length; j++) {
            res.push({ t: parts[j].t, e: parts[j].e || '', m: '', me: false });
          }
        }
      }
      return res;
    };

    /* W29b: título de un emoji = su :shortcode: (o el carácter solo). */
    const titleOf = function (ch) { return emojiCode(ch); };
    const emoNative = Vue.computed(function () { return emoStyle() === 'system'; });

    /* W62: si una foto de avatar falla (firma vencida, red), la fila cae
       a la inicial en vez de dejar el hueco roto. Al cambiar la URL se
       reintenta sola. */
    const avErr = Vue.ref(false);
    const avRetried = Vue.ref(false);
    const onAvatarError = () => {
      if (!avRetried.value && props.row.avatar && props.row.avatar.url) {
        avRetried.value = true;
        // Reintenta con parámetro de cache-busting
        try {
          const url = new URL(props.row.avatar.url, location.href);
          url.searchParams.set('retry', Date.now().toString());
          // Actualiza la URL en el objeto avatar para que Vue la relea
          props.row.avatar.url = url.href;
        } catch(e) {}
        return;
      }
      avErr.value = true;
    };
    Vue.watch(function () { return props.row.avatar && props.row.avatar.url; },
      function () { avErr.value = false; avRetried.value = false; });

    /* W41/W61: 1–3 emojis en el cuerpo → el mensaje se pinta como
       sticker (emoji grande, sin caja y con la hora en pastillita).
       No con cita (el bloque .b-reply rompería el look transparente)
       ni en edición (se ve el textarea). */
    const emoBig = function () {
      const ref0 = props.row.ref;
      if (ref0.kind !== 'text' || editing.value || ref0.reply_to) return false;
      const txt = ref0.body || '';
      return isEmojiBurst(txt);
    };
    /* W61: un sticker con imagen se puede guardar en la biblioteca. */
    const stickerAssetOn = function () {
      const m = props.row.ref.media;
      return !!(m && assetWithMedia('sticker', m.id));
    };
    const saveStickerAsset = function () {
      toggleStickerAsset(props.row.ref);
    };

    /* W29c: hover en un chip → quiénes reaccionaron ("😂 juan, maria"). */
    const reactTitle = function (msg, emoji) {
      const rs = msg.reactions || [];
      const names = [];
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].emoji === emoji) {
          names.push(rs[i].name || rs[i].username || ('#' + rs[i].user_id));
        }
      }
      if (!names.length) return emojiCode(emoji);
      if (names.length > 3) {
        return emoji + ' ' + names.slice(0, 3).join(', ') + ' ' +
          t('y {n} más', { n: names.length - 3 });
      }
      return emoji + ' ' + names.join(', ');
    };

    /* W28b: texto de la burbuja partido en trozos, con las @menciones
       de los MIEMBROS del grupo marcadas (sólo en grupos: el server
       sólo cuenta menciones ahí). */
    const bodySegs = Vue.computed(function () {
      const ref0 = props.row.ref;
      const txt = ref0.body || '';
      const c = store.chats.find(function (x) {
        return x.id === store.activeChatId;
      });
      const inf = store.info;
      const mem = (c && c.type === 'group' && inf &&
                   inf.chatId === store.activeChatId && inf.members)
        ? inf.members : null;
      if (!mem || !mem.length) return splitSegs([{ t: txt, m: '', me: false }]);
      const names = {};
      for (let i = 0; i < mem.length; i++) {
        if (mem[i].username) names[mem[i].username.toLowerCase()] = 1;
      }
      const me = ((store.user && store.user.username) || '').toLowerCase();
      const out = [];
      const re = /@([A-Za-z0-9_.]{3,20})/g;
      let last = 0;
      let mm = re.exec(txt);
      while (mm) {
        const w = mm[1].toLowerCase();
        /* W37e: menciones globales — se reconocen escritas en CUALQUIER
           idioma (@everyone/@todos, @online/@activos) y se muestran en
           EL IDIOMA DEL LECTOR (@todos en es, @everyone en en). */
        if (w === 'everyone' || w === 'todos') {
          if (mm.index > last) out.push({ t: txt.slice(last, mm.index), m: '' });
          out.push({ t: t('@todos'), m: 'everyone', me: false });
          last = mm.index + mm[0].length;
        } else if (w === 'online' || w === 'activos') {
          if (mm.index > last) out.push({ t: txt.slice(last, mm.index), m: '' });
          out.push({ t: t('@activos'), m: 'online', me: false });
          last = mm.index + mm[0].length;
        } else if (names[w]) {
          if (mm.index > last) out.push({ t: txt.slice(last, mm.index), m: '' });
          out.push({ t: '@' + mm[1], m: mm[1], me: w === me });
          last = mm.index + mm[0].length;
        }
        mm = re.exec(txt);
      }
      if (last < txt.length || !out.length) out.push({ t: txt.slice(last), m: '' });
      return splitSegs(out);
    });

    /* W35b: imagen inline — una URL con extensión de imagen (.gif se
       ve ANIMADO) se pinta como <img>; el resto de links http(s) pide
       la "portada" al server (W35c) y, si resulta ser una imagen, se
       pinta igual. */
    const IMG_EXT = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:$|\?)/i;
    const isHttp = function (u) { return /^https?:\/\//i.test(u); };
    const imgInline = function (u) {
      if (IMG_EXT.test(u)) return true;
      const p = store.linkPrev[u];
      return !!(p && p.status === 'ok' && p.type === 'image');
    };

    /* W35c: links http(s) sin extensión de imagen → tarjeta "portada"
       con título/descripción/imagen del sitio. */
    const msgLinks = Vue.computed(function () {
      const out = [];
      const segs = bodySegs.value;
      for (let i = 0; i < segs.length; i++) {
        const u = segs[i].u;
        if (u && isHttp(u) && !IMG_EXT.test(u) && out.indexOf(u) < 0) out.push(u);
      }
      return out;
    });
    Vue.watch(function () { return msgLinks.value; }, function (ls) {
      for (let i = 0; i < ls.length; i++) ensurePreview(ls[i]);
    }, { immediate: true });

    const linkCards = Vue.computed(function () {
      const out = [];
      const segs = bodySegs.value;
      const seen = {};
      for (let i = 0; i < segs.length; i++) {
        const u = segs[i].u;
        if (!u || !isHttp(u) || IMG_EXT.test(u) || seen[u]) continue;
        seen[u] = 1;
        const p = store.linkPrev[u];
        if (p && p.status === 'ok' && p.type === 'page') out.push({ url: u, d: p });
      }
      return out;
    });

    /* W29d: spoilers — tapado hasta que el usuario toque la capa. El
       estado vive en store.spoilSeen[chatId] y se vacía al salir. */
    const isSeen = function (m) {
      const s = store.spoilSeen[store.activeChatId];
      return !!(s && s[m.id]);
    };
    const spoiled = Vue.computed(function () {
      return !!props.row.ref.spoiler && !isSeen(props.row.ref);
    });
    /* W62: los spoilers de imagen/GIF/sticker muestran la propia media
       difuminada de fondo. El texto sigue con la capa oscura. */
    const spoilBg = Vue.computed(function () {
      if (!spoiled.value) return null;
      const r = props.row.ref;
      const m = r.media;
      if (!m || !m.url) return null;
      if (r.kind !== 'image' && r.kind !== 'sticker') return null;
      if (String(m.mime || '').indexOf('image/') !== 0) return null;
      return { backgroundImage: 'url("' + mediaUrl(m.url) + '")' };
    });
    const spoilShow = function (m) {
      if (!store.spoilSeen[store.activeChatId]) {
        store.spoilSeen[store.activeChatId] = {};
      }
      store.spoilSeen[store.activeChatId][m.id] = 1;
    };
    const spoilHide = function (m) {
      const s = store.spoilSeen[store.activeChatId];
      if (s && s[m.id]) delete s[m.id];
    };
    return {
      store, emojis, rpEl, rpPos, avErr, spoilBg,
      onAvatarError,   /* W66c: faltaba en el return; el @error del avatar
                          reventaba en consola en vez de mostrar la inicial */
      bodySegs,
      /* W78: etiqueta accesible para lectores de pantalla (emojis agrupados) */
      formatEmojisForA11y,
      /* W35a–c: enlaces, imagen inline y tarjetas */
      imgInline, linkCards,
      /* W36c: reproductores propios de video y audio adjunto */
      vEl, vWrapEl, vPlaying, vMuted, vHide, vCurTxt, vDurTxt, vPct,
      vPeek, toggleV, vSeekTo, vMute, vFull, vMeta, vTimeUpd, vFs,
      vPlayEv, vPauseEv, vEndEv, vClickCenter,
      /* W37d: volumen con popup, error de mime y descarga del video */
      vVol, vVolOpen, vSetVol, vToggleVol, vErr, vErrEv, vBox,
      afEl, afPlaying, afRateV, afCurTxt, afDurTxt, afPct,
      afToggle, afSeek, afRate, afMeta, afTimeUpd, afPlayEv, afErrEv,
      afPauseEv, afEndEv,
      /* W37d: velocidad de la nota de voz */
      aRate, aRateV,
      /* W36k: ★ favorito del GIF */
      isGifFav, toggleFavGif, isGifMedia,   /* W66c: gif o webp animado */
      isStkFav, toggleStkFav,   /* W60 */
      spoiled, spoilShow, spoilHide,   /* W29d */
      replyName, replyText, groupReactions, myReaction,
      doReply, doReact, mediaUrl, fmtSize,
      pickerOpen, togglePicker, openMenu,
      /* W13 */
      fullReact, toggleFull, wave, aBar, waveOp,
      /* W22 */
      imgBox,
      /* W8 */
      aEl, aPlaying, aTime, aPct, togglePlay, seek, waveDown, waveDownTouch,
      aMeta, aTimeUpd, aPlayEv, aPauseEv, aEndEv, aDurEv, aErrEv,
      editing, editEl, cancelEdit, saveEdit,
      /* W11: círculo de subida + video */
      isVideo, upPct, upOff,
      /* W29a */
      isAudio, vidOk, animEnd,
      /* W29b/W65: mensajes usan el set alternativo si al elegido le
         falta ese emoji (nunca la fuente del sistema). */
      emoAnySrc, emoNative, titleOf, reactTitle,
      emoBig,   /* W41 */
      stickerAssetOn, saveStickerAsset,   /* W61 */
    };
  },
  template:
    '<div class="msg" role="message" :data-msg-id="row.ref.id" :aria-label="formatEmojisForA11y(row.ref.kind === \'system\' ? sysText(row.ref.body || \'\') : (row.ref.body || \'\'))" :class="{ mine: row.mine, tight: row.tight, system: row.ref.kind === \'system\', reacts: !!(row.ref.reactions && row.ref.reactions.length), anim: !!row.ref._in, \'has-av\': row.avCol && (row.mine ? row.showTime : (row.showTime || row.showSender)) }" @animationend="animEnd">' +
      /* W66: avatar del remitente junto a cada mensaje (propios y ajenos,
         grupos y MDs). En los entrantes aparece cuando hay nombre (primero
         de la tanda) u hora —nunca un nombre sin cara—; en los propios,
         cuando hay hora. Para los entrantes va a la izquierda de la
         burbuja; para los propios, a la derecha. */
      '<span class="msg-av" v-if="row.avCol && !row.mine && (row.showTime || row.showSender)" :class="{ \'is-av\': row.avatar, \'has-photo\': !!(row.avatar && row.avatar.url) }" ' +
        ':title="row.avatar ? row.avatar.name : \'\'">' +
        '<img v-if="row.avatar && row.avatar.url && !avErr" :src="mediaUrl(row.avatar.url)" alt="" loading="lazy" decoding="async" crossorigin="anonymous" @error="onAvatarError()">' +
        '<i v-else-if="row.avatar">{{ row.avatar.ini }}</i>' +
      '</span>' +
      '<div v-if="row.ref.kind === \'system\'" class="sys-msg">{{ sysText(row.ref.body) }}</div>' +
      '<div v-else class="bubble" :class="{ picking: pickerOpen(row), sticker: row.ref.kind === \'sticker\', \'emo-big\': emoBig(), \'is-spoiled\': spoiled, gif: !!(row.ref.kind === \'image\' && row.ref.media && isGifMedia(row.ref.media)), vid: !!(row.ref.kind === \'file\' && row.ref.media && isVideo(row.ref.media) && vidOk) }">' +
        /* W29d: capa de spoiler — tapa TODO lo de adentro (texto,
           medios y acciones) hasta que se toque; al tocar se muestra
           y el puntito del pie lo vuelve a ocultar. Mientras está
           tapado, los hijos se ocultan (visibility): con sólo el
           fondo translúcido el texto asomaba sobre burbujas claras. */
        '<div v-if="spoilBg" class="b-spoil-bg" :style="spoilBg" aria-hidden="true"></div>' +
        '<button v-if="spoiled" class="b-spoil-ov" :class="{ \'has-bg\': !!spoilBg }" type="button" ' +
          '@click.stop="spoilShow(row.ref)">' +
          '<span class="b-spoil-pill">' +
            '<svg class="ic"><use href="#i-eye-off"></use></svg>' +
            '<span>{{ t(\'Mostrar Spoiler\') }}</span>' +
          '</span>' +
        '</button>' +
        '<div class="b-actions">' +
          '<button class="b-act" type="button" :title="t(\'Responder\')" @click="doReply(row)">' +
            '<svg class="ic ic-sm"><use href="#i-reply"></use></svg>' +
          '</button>' +
          '<button class="b-act" type="button" :title="t(\'Reaccionar\')" @click.stop="togglePicker">' +
            '<svg class="ic ic-sm"><use href="#i-smile"></use></svg>' +
          '</button>' +
          /* W36k: ★ favorito — sólo para GIFs (biblioteca o subidos;
             W66c: también WebP animados, que viajan como GIF) */
          '<button v-if="row.ref.kind === \'image\' && row.ref.media && ' +
            'isGifMedia(row.ref.media)" class="b-act" type="button" ' +
            ':title="isGifFav(row.ref) ? t(\'Quitar de favoritos\') : t(\'Agregar a favoritos\')" ' +
            '@click.stop="toggleFavGif(row.ref)">' +
            '<svg class="ic ic-sm"><use :href="isGifFav(row.ref) ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
          '</button>' +
          /* W60/W61: guardar un sticker recibido (emoji o imagen) */
          '<button v-if="row.ref.kind === \'sticker\' && !row.ref.media" class="b-act" type="button" ' +
            ':title="isStkFav(row.ref.body) ? t(\'Quitar de favoritos\') : t(\'Guardar en stickers\')" ' +
            '@click.stop="toggleStkFav(row.ref.body)">' +
            '<svg class="ic ic-sm"><use :href="isStkFav(row.ref.body) ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
          '</button>' +
          '<button v-else-if="row.ref.kind === \'sticker\' && row.ref.media" class="b-act" type="button" ' +
            ':title="stickerAssetOn() ? t(\'Quitar de favoritos\') : t(\'Guardar en stickers\')" ' +
            '@click.stop="saveStickerAsset">' +
            '<svg class="ic ic-sm"><use :href="stickerAssetOn() ? \'#i-star-fill\' : \'#i-star\'"></use></svg>' +
          '</button>' +
          /* W17: ⋯ abre el mismo menú del clic derecho, anclado a la
             burbuja (no tapa el mensaje). Accesible también con Enter/
             Espacio desde el teclado o un pulsador (Switch). */
          '<button class="b-act b-more" type="button" :title="t(\'Más opciones\')" ' +
            '@click.stop="openMenu(row, $event)" ' +
            '@keydown.enter.stop="openMenu(row, $event)" ' +
            '@keydown.space.stop="openMenu(row, $event)" ' +
            '>' +
            '<svg class="ic ic-sm"><use href="#i-dots"></use></svg>' +
          '</button>' +
        '</div>' +
        /* W57: picker teletransportado; su posición fixed se calcula
           contra el viewport, sin heredar transforms de la burbuja. */
        '<Teleport to="body">' +
          '<span class="react-picker rp-portal" :class="{ \'rp-wide\': fullReact }" ' +
            'ref="rpEl" v-if="pickerOpen(row)" :style="rpPos" @click.stop>' +
            '<button class="rp" :class="{ mine: myReaction(row.ref) === e }" type="button" ' +
              'v-for="e in emojis" :key="e" :title="titleOf(e)" @click="doReact(row, e)">' +
              '<img v-if="emoAnySrc(e)" class="emo" :src="emoAnySrc(e)" ' +
                'alt="" :title="e" loading="lazy">' +
              '<span v-else-if="emoNative">{{ e }}</span></button>' +
            '<button class="rp rp-more" type="button" :title="t(\'Más emojis\')" ' +
              '@click="toggleFull">{{ fullReact ? \'–\' : \'＋\' }}</button>' +
            '<emoji-picker v-if="fullReact" :anchored="true" ' +
              '@pick="doReact(row, $event)"></emoji-picker>' +
          '</span>' +
        '</Teleport>' +
        /* W29c: el nombre del emisor va ARRIBA de la cita (antes la
           cita se dibujaba primero y "tapaba" al nombre); después la
           etiqueta de reenviado, la cita y el cuerpo del mensaje. */
        '<div v-if="row.showSender" class="b-sender">' +
          '<button type="button" :title="t(\'Ver perfil\')" ' +
            '@click="$emit(\'openprofile\', row.ref.sender.username)">' +
            '{{ row.ref.sender.display_name || row.ref.sender.username }}</button>' +
          '<span class="b-role" v-if="row.ref.sender.role === \'admin\' || row.ref.sender.role === \'owner\'">[Admin]</span>' +
        '</div>' +
        /* W13: etiqueta de mensaje reenviado (estilo WhatsApp) */
        '<div class="b-fwd" v-if="row.ref.forwarded">{{ t(\'Reenviado\') }}</div>' +
        '<div v-if="row.ref.reply_to" class="b-reply" style="cursor:pointer" @click="$emit(\'scrolltoreply\', row.ref.reply_to.id)">' +
          '<span class="br-name">{{ replyName(row) }}</span>' +
          '<span class="br-text">{{ replyText(row) }}</span>' +
        '</div>' +
        /* W11: subida en curso → burbuja con círculo de progreso.
           W22: si la resolución local ya se conoce, el cuadro se reserva
           igual que con la imagen descargada. */
        '<span class="b-media b-upmedia" v-if="row.ref.pending && row.ref.upload && row.ref.kind === \'image\'" ' +
          ':class="{ imgbox: imgBox }" :style="imgBox">' +
          '<img class="b-img" :src="row.ref.localUrl || \'\'" alt="" @load="$emit(\'imgload\')">' +
          /* W23: anillo + ✕/↻ DENTRO del círculo (centrados al 50%) */
          '<span class="up-ov" :class="{ \'is-fail\': row.ref.upload.state === \'fail\' }">' +
            '<svg class="up-c" viewBox="0 0 48 48" aria-hidden="true" v-if="row.ref.upload.state === \'up\'">' +
              '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
              '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="132" ' +
                ':stroke-dashoffset="upOff(row.ref.upload)"></circle>' +
            '</svg>' +
            '<span class="up-pct" v-if="row.ref.upload.state === \'up\'">{{ upPct(row.ref.upload) }}</span>' +
            '<button class="up-btn" v-if="row.ref.upload.state === \'up\'" type="button" ' +
              ':title="t(\'Cancelar subida\')" @click.stop="$emit(\'upcancel\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
            '<button class="up-btn" v-else type="button" ' +
              ':title="t(\'Reintentar subida\')" @click.stop="$emit(\'upretry\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>' +
          '</span>' +
        '</span>' +
        /* W22: nota de voz subiendo → fila con el aspecto del player y
           el anillo de progreso EN EL LUGAR DEL PLAY; el botón real de
           reproducción aparece cuando el server ya la tiene. */
        '<div class="b-player b-upvoice" v-else-if="row.ref.pending && row.ref.upload && row.ref.kind === \'voice\'">' +
          /* W23: anillo + ✕/↻ dentro del slot del play (centrado) */
          '<span class="au-btn">' +
            '<svg class="up-c" viewBox="0 0 48 48" v-if="row.ref.upload.state === \'up\'">' +
              '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
              '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="132" ' +
                ':stroke-dashoffset="upOff(row.ref.upload)"></circle>' +
            '</svg>' +
            '<button class="up-btn-static" v-if="row.ref.upload.state === \'up\'" type="button" ' +
              ':title="t(\'Cancelar subida\')" @click.stop="$emit(\'upcancel\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
            '<button class="up-btn-static" v-else type="button" ' +
              ':title="t(\'Reintentar subida\')" @click.stop="$emit(\'upretry\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>' +
          '</span>' +
          '<span class="wave">' +
            '<i v-for="(h, i) in wave" :key="i" :style="{ height: h + \'%\' }"></i>' +
          '</span>' +
          '<span class="au-time" :class="{ \'is-err\': row.ref.upload.state === \'fail\' }">' +
            '{{ row.ref.upload.state === \'fail\' ? (row.ref.upload.err || t(\'No se pudo enviar la nota de voz\')) : fmtSize(row.ref.fsize) }}' +
          '</span>' +
        '</div>' +
        '<div class="b-file b-upfile" v-else-if="row.ref.pending && row.ref.upload">' +
          '<svg class="ic ic-sm"><use href="#i-file"></use></svg>' +
          '<span class="bf-col">' +
            '<span class="bf-name">{{ row.ref.fname || (row.ref.kind === \'voice\' ? t(\'Nota de voz\') : t(\'Archivo\')) }}</span>' +
            '<span class="bf-size" :class="{ \'is-err\': row.ref.upload.state === \'fail\' }">' +
              '{{ row.ref.upload.state === \'fail\' ? (row.ref.upload.err || t(\'No se pudo enviar el archivo\')) : fmtSize(row.ref.fsize) }}' +
            '</span>' +
          '</span>' +
          /* W23: anillo + ✕/↻ dentro de un slot circulante */
          '<span class="up-slot">' +
            '<svg class="up-c" viewBox="0 0 48 48" aria-hidden="true" v-if="row.ref.upload.state === \'up\'">' +
              '<circle class="up-c-bg" cx="24" cy="24" r="21"></circle>' +
              '<circle class="up-c-fg" cx="24" cy="24" r="21" stroke-dasharray="132" ' +
                ':stroke-dashoffset="upOff(row.ref.upload)"></circle>' +
            '</svg>' +
            '<button class="up-btn-static" v-if="row.ref.upload.state === \'up\'" type="button" ' +
              ':title="t(\'Cancelar subida\')" @click.stop="$emit(\'upcancel\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-x"></use></svg></button>' +
            '<button class="up-btn-static" v-else type="button" ' +
              ':title="t(\'Reintentar subida\')" @click.stop="$emit(\'upretry\', row.ref)">' +
              '<svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>' +
          '</span>' +
        '</div>' +
        /* W61: sticker subido (imagen) — se pinta grande, sin marco. */
        '<span class="b-sticker-img" v-else-if="row.ref.kind === \'sticker\' && row.ref.media" ' +
          'role="button" :title="t(\'Ver con zoom\')" ' +
          '@click="$emit(\'zoom\', { url: mediaUrl(row.ref.media.url, false, true), ' +
            'orig: mediaUrl(row.ref.media.url, true, true), name: row.ref.media.name || \'sticker\', ' +
            'mime: row.ref.media.mime, kind: \'sticker\' })">' +
          '<img class="b-sticker" :src="mediaUrl(row.ref.media.url)" ' +
            ':alt="row.ref.media.name || \'sticker\'" loading="lazy" @load="$emit(\'imgload\')">' +
        '</span>' +
        /* W8: clic en la imagen → vista previa con zoom (lightbox).
           W15: v-dl baja el original con anillo; mientras tanto se ve la
           miniatura del server difuminada (?thumb=1).
           W22: con resolución conocida el marco se reserva (imgbox) y el
           anillo queda dentro del cuadro; sin ella solo la miniatura
           difuminada, sin anillo (data-noring). */
        '<span class="b-media mframe" v-else-if="row.ref.kind === \'image\' && row.ref.media" ' +
          ':class="{ imgbox: imgBox }" :style="imgBox" :data-noring="imgBox ? null : \'1\'" ' +
          'role="button" :title="t(\'Ver con zoom\')" ' +
          '@click="$emit(\'zoom\', { url: mediaUrl(row.ref.media.url), ' +
            'orig: mediaUrl(row.ref.media.url, true), name: row.ref.media.name, ' +
            'mime: row.ref.media.mime, kind: row.ref.kind })">' +
          '<img class="b-img" v-dl="mediaUrl(row.ref.media.url)" :alt="row.ref.media.name || \'\'" @load="$emit(\'imgload\')">' +
        '</span>' +
        /* W11: video adjunto → player inline (W15: baja con anillo y ✕).
           W29a: si el archivo NO tiene pista de video (vidOk=false tras
           el probe de metadatos) cae al reproductor de audio.
           W36c: reproductor PROPIO — controles dentro del video (play
           al centro, hora/barra/fullscreen abajo, ocultos a los 1 s). */
        '<div class="b-video mframe" ref="vWrapEl" v-else-if="row.ref.kind === \'file\' && row.ref.media && isVideo(row.ref.media) && vidOk && !vErr" ' +
          ':class="{ vhide: vHide, vbox: vBox }" :style="vFs ? null : vBox" ' +
          '@mousemove="vPeek" @touchstart="vPeek" @click="vClickCenter">' +
          '<video class="b-vid" ref="vEl" playsinline preload="metadata" ' +
            ':data-mime="row.ref.media.mime" ' +
            'v-dl="mediaUrl(row.ref.media.url)" @loadedmetadata="vMeta" ' +
            '@timeupdate="vTimeUpd" @play="vPlayEv" @pause="vPauseEv" ' +
            '@ended="vEndEv" @error="vErrEv"></video>' +
          '<button class="v-center" type="button" ' +
            ':title="vPlaying ? t(\'Pausar\') : t(\'Reproducir\')" @click.stop="toggleV">' +
            '<svg class="ic"><use :href="vPlaying ? \'#i-pause\' : \'#i-play\'"></use></svg>' +
          '</button>' +
          '<div class="v-bar" @click.stop>' +
            '<button class="v-btn v-fs" type="button" ' +
              ':title="vFs ? t(\'Salir de pantalla completa\') : t(\'Pantalla completa\')" ' +
              '@click.stop="vFull"><svg class="ic ic-sm">' +
              '<use :href="vFs ? \'#i-collapse\' : \'#i-expand\'"></use></svg></button>' +
            /* W37d: al abrir el control de VOLUMEN la hora se desvanece */
            '<transition name="fade">' +
            '<span class="v-time" v-if="!vVolOpen">{{ vCurTxt }} / {{ vDurTxt }}</span>' +
            '</transition>' +
            '<span class="v-seek" @click.stop="vSeekTo"><i :style="{ width: vPct }"></i></span>' +
            /* W43: popup de volumen VERTICAL por ENCIMA del botón (en
               videos angostos el slider horizontal no cabía en la
               barra); mute abajo, slider girado arriba; fade al abrir */
            '<transition name="fade">' +
            '<span class="v-vol" v-if="vVolOpen" @click.stop>' +
              '<span class="v-vol-vt">' +
                '<input class="v-slider" type="range" min="0" max="1" step="0.05" ' +
                  ':value="vVol" aria-label="Volumen" @input="vSetVol">' +
              '</span>' +
              '<button class="v-btn" type="button" ' +
                ':title="vMuted ? t(\'Activar sonido\') : t(\'Silenciar\')" @click.stop="vMute">' +
                '<svg class="ic ic-sm"><use :href="vMuted ? \'#i-mute\' : \'#i-vol\'"></use></svg>' +
              '</button>' +
            '</span>' +
            '</transition>' +
            '<button class="v-btn" type="button" ' +
              ':title="vVolOpen ? t(\'Cerrar volumen\') : t(\'Volumen\')" @click.stop="vToggleVol">' +
              '<svg class="ic ic-sm"><use :href="vMuted ? \'#i-mute\' : \'#i-vol\'"></use></svg>' +
            '</button>' +
          '</div>' +
          /* W36c: hora y palomitas DENTRO del video (abajo a la derecha) */
          '<div class="b-meta v-meta">' +
            '<span class="b-time" v-if="row.showTime && !row.ref.pending">{{ row.time }}</span>' +
            '<svg v-if="row.ref.pending" class="ic tick t-pend"><use href="#i-clock"></use></svg>' +
            '<svg v-else-if="row.mine" class="ic tick" :class="\'t-\' + row.state">' +
              '<use :href="row.state === \'sent\' ? \'#i-check\' : \'#i-check2\'"></use></svg>' +
          '</div>' +
        '</div>' +
        /* W37d: video con error (mime roto o decodificación imposible):
           aviso claro con icono en vez de un rectángulo negro mudo. */
        '<div class="b-video v-err" v-else-if="row.ref.kind === \'file\' && row.ref.media && isVideo(row.ref.media)">' +
          '<svg class="ic"><use href="#i-alert"></use></svg>' +
          '<span>{{ t(\'Este video tiene un error y no se puede reproducir\') }}</span>' +
        '</div>' +
        /* W29a: audio adjunto (mp3/ogg/… o webm sin video). W36c: player
           propio (play/pausa, barra, hora y velocidad); el <audio> queda
           oculto pero en el DOM (tests y descarga lo usan). */
        '<div class="b-afile mframe" v-else-if="row.ref.kind === \'file\' && row.ref.media && (isAudio(row.ref.media) || isVideo(row.ref.media))">' +
          '<audio ref="afEl" class="b-audio" preload="metadata" ' +
            ':data-mime="row.ref.media.mime" ' +
            'v-dl="mediaUrl(row.ref.media.url)" @loadedmetadata="afMeta" ' +
            '@timeupdate="afTimeUpd" @play="afPlayEv" @pause="afPauseEv" ' +
            '@ended="afEndEv" @error="afErrEv"></audio>' +
          '<button class="au-btn" type="button" ' +
            ':title="afPlaying ? t(\'Pausar\') : t(\'Reproducir\')" @click="afToggle">' +
            '<svg class="ic"><use :href="afPlaying ? \'#i-pause\' : \'#i-play\'"></use></svg>' +
          '</button>' +
          '<span class="au-seek" @click="afSeek"><i :style="{ width: afPct }"></i></span>' +
          '<span class="au-time">{{ afCurTxt }} / {{ afDurTxt }}</span>' +
          '<button class="au-rate" type="button" :title="t(\'Velocidad\')" ' +
            '@click="afRate">{{ afRateV }}×</button>' +
        '</div>' +
        /* W15: el archivo ya no es un <a> nativo: la descarga pasa por
           mediadl.js (anillo de progreso, ✕ de cancelar y reintento). */
        '<span v-else-if="row.ref.kind === \'file\' && row.ref.media" class="b-file mframe">' +
          '<svg class="ic ic-sm"><use href="#i-file"></use></svg>' +
          '<span class="bf-col"><span class="bf-name">{{ row.ref.media.name || t(\'archivo\') }}</span>' +
          '<span class="bf-size">{{ fmtSize(row.ref.media.size) }}</span></span>' +
        '</span>' +
        /* W8: reproductor propio (el <audio> queda oculto para los tests).
           W15: el audio se baja con anillo (v-dl) y queda listo para sonar. */
        '<div class="b-player mframe" v-else-if="row.ref.kind === \'voice\' && row.ref.media">' +
          '<audio ref="aEl" class="b-audio" ' +
            ':data-mime="row.ref.media.mime" ' +
            'v-dl="mediaUrl(row.ref.media.url)" ' +
            '@loadedmetadata="aMeta" @durationchange="aDurEv" ' +
            '@timeupdate="aTimeUpd" @play="aPlayEv" ' +
            '@pause="aPauseEv" @ended="aEndEv" @error="aErrEv"></audio>' +
          '<button class="au-btn" type="button" ' +
            ':title="aPlaying ? t(\'Pausar\') : t(\'Reproducir\')" @click="togglePlay">' +
            '<svg class="ic ic-sm"><use :href="aPlaying ? \'#i-pause\' : \'#i-play\'"></use></svg>' +
          '</button>' +
          /* W13: onda con progreso (clic = buscar posición). W63: círculo
             arrastrable para scrubbing. */
          '<span class="wave" @click="seek" @mousedown="waveDown" @touchstart="waveDownTouch">' +
            '<i v-for="(h, i) in wave" :key="i" :class="{ on: i <= aBar }" ' +
              ':style="{ height: h + \'%\', opacity: waveOp(i) }"></i>' +
            '<span class="wave-thumb" :style="{ left: aPct + \'%\' }" @mousedown.stop="waveDown" @touchstart.stop="waveDownTouch"></span>' +
          '</span>' +
          '<span class="au-time">{{ aTime }}</span>' +
          /* W37d: velocidad de la nota de voz (1×/1,5×/2×) */
          '<button class="au-rate" type="button" :title="t(\'Velocidad\')" ' +
            '@click="aRate">{{ aRateV }}×</button>' +
        '</div>' +
        '<div v-else-if="row.ref.kind === \'voice\'" class="b-voice">' +
          '<svg class="ic ic-sm"><use href="#i-mic"></use></svg> {{ t(\'Nota de voz\') }}' +
        '</div>' +
        /* W11: texto bajo imagen/video (caption) y de mensajes de
           texto: UN solo bloque (W29a: eran dos bloques gemelos con
           cadena v-if y el caption salía DUPLICADO en la burbuja). */
        '<div class="b-text" v-if="!editing && row.ref.body">' +
          '<span v-for="(sg, i) in bodySegs" :key="i">' +
            '<b class="mention" :class="{ me: sg.me }" v-if="sg.m">{{ sg.t }}</b>' +
            /* W40: el segmento trae el carácter; el estilo activo
               decide imagen (noto/twemoji) o texto del sistema. */
            '<img v-else-if="emoAnySrc(sg.e)" class="emo" :src="emoAnySrc(sg.e)" ' +
              'alt="" :title="sg.t" loading="lazy">' +
            /* W65: en Noto/Twemoji un emoji sin imagen no cae al glyph
               del sistema (se prefiere el hueco a mezclar estilos). */
            '<span v-else-if="sg.e && !emoNative"></span>' +
            /* W35b: link a imagen → la imagen misma (gif animado) */
            '<a v-else-if="sg.u && imgInline(sg.u)" class="msgimg" ' +
              ':href="sg.u" target="_blank" rel="noopener noreferrer">' +
              '<img class="linkimg" :src="sg.u" alt="" loading="lazy"></a>' +
            /* W35a: cualquier link con protocolo de la lista segura */
            '<a v-else-if="sg.u" class="msglink" :href="sg.u" ' +
              'target="_blank" rel="noopener noreferrer">{{ sg.t }}</a>' +
            '<template v-else>{{ sg.t }}</template>' +
          '</span></div>' +
        /* W35c: tarjetas "portada" bajo el texto del mensaje */
        '<div class="b-cards" v-if="!editing && linkCards.length">' +
          '<a class="linkcard" v-for="lc in linkCards" :key="lc.url" ' +
            ':href="lc.d.url" target="_blank" rel="noopener noreferrer">' +
            '<img v-if="lc.d.image" class="lc-img" :src="lc.d.image" ' +
              'alt="" loading="lazy">' +
            '<div class="lc-meta">' +
              '<img v-if="lc.d.icon" class="lc-fav" :src="lc.d.icon" ' +
                'alt="" loading="lazy">' +
              '<div class="lc-txt">' +
                '<div class="lc-title">{{ lc.d.title || lc.d.site }}</div>' +
                '<div class="lc-desc" v-if="lc.d.desc">{{ lc.d.desc }}</div>' +
                '<div class="lc-site">{{ lc.d.site }}</div>' +
              '</div>' +
            '</div>' +
          '</a>' +
        '</div>' +
        /* W8: edición en línea del mensaje propio */
        '<div class="b-editform" v-if="editing">' +
          '<textarea class="input" ref="editEl" rows="2" maxlength="3000" ' +
            'v-model="store.editDraft" ' +
            '@keydown.esc="cancelEdit" @keydown.ctrl.enter="saveEdit"></textarea>' +
          '<div class="bef-btns">' +
            '<button class="btn btn-ghost btn-sm" type="button" @click="cancelEdit">{{ t(\'Cancelar\') }}</button>' +
            '<button class="btn btn-sm" type="button" :disabled="!store.editDraft.trim()" ' +
              '@click="saveEdit">{{ t(\'Guardar\') }}</button>' +
          '</div>' +
        '</div>' +
        /* W7: la hora va ABAJO del texto (antes flotaba arriba). */
        '<div class="b-meta" v-if="row.showTime || row.ref.pending || row.mine || row.ref.pinned || row.ref.edited_at || (row.ref.spoiler && !spoiled)">' +
          /* W29d/h: revelado → ojo + "Ocultar" para volver a tapar */
          '<button v-if="row.ref.spoiler && !spoiled" class="b-spoil-dot" ' +
            'type="button" :title="t(\'Ocultar\')" ' +
            '@click.stop="spoilHide(row.ref)">' +
            '<svg class="ic ic-sm"><use href="#i-eye"></use></svg>' +
            '<span>{{ t(\'Ocultar\') }}</span>' +
          '</button>' +
          '<svg v-if="row.ref.pinned" class="ic ic-sm b-pin" ' +
            ':title="t(\'Fijado\')"><use href="#i-pin"></use></svg>' +
          '<span class="b-edit" v-if="row.ref.edited_at">{{ t(\'editado\') }}</span>' +
          '<span class="b-time" v-if="row.showTime && !row.ref.pending">{{ row.time }}</span>' +
          '<svg v-if="row.ref.pending" class="ic tick t-pend"><use href="#i-clock"></use></svg>' +
          '<svg v-else-if="row.mine" class="ic tick" :class="\'t-\' + row.state">' +
            '<use :href="row.state === \'sent\' ? \'#i-check\' : \'#i-check2\'"></use></svg>' +
        '</div>' +
        '<div class="b-reacts" v-if="row.ref.reactions && row.ref.reactions.length">' +
          '<button class="react-chip" type="button" ' +
            ':class="{ mine: myReaction(row.ref) === rr.emoji }" ' +
            'v-for="(rr, i) in groupReactions(row.ref)" :key="i" ' +
            '@click="doReact(row, rr.emoji)" :title="reactTitle(row.ref, rr.emoji)">' +
            '<img v-if="emoAnySrc(rr.emoji)" class="emo" :src="emoAnySrc(rr.emoji)" ' +
              'alt="" loading="lazy">' +
            '<span v-else-if="emoNative">{{ rr.emoji }}</span>' +
            '<i>{{ rr.count > 1 ? rr.count : \'\' }}</i>' +
          '</button>' +
        '</div>' +
      '</div>' +
      /* W66: avatar del remitente a la derecha de la burbuja para los
         mensajes propios (la flechita apunta hacia él). Solo cuando hay
         hora (no en mensajes continuos del mismo remitente sin hora). */
      '<span class="msg-av" v-if="row.avCol && row.mine && row.showTime" :class="{ \'is-av\': row.avatar, \'has-photo\': !!(row.avatar && row.avatar.url) }" ' +
        ':title="row.avatar ? row.avatar.name : \'\'">' +
        '<img v-if="row.avatar && row.avatar.url && !avErr" :src="mediaUrl(row.avatar.url)" alt="" loading="lazy" decoding="async" crossorigin="anonymous" @error="onAvatarError()">' +
        '<i v-else-if="row.avatar">{{ row.avatar.ini }}</i>' +
      '</span>' +
    '</div>',
};