/* SettingsModal — extraído de views/chat.js (Fase 3.1). */
import {
  fmtSize, hydrateDownloads,
} from '../../actions.js';
import {
  api, saveSession, session,
} from '../../api.js';
import {
  DL_TYPES, autoDlPrefs, clearDownloads, deleteDownload, listDownloads, openAppDownload, saveDownloadToDevice, setAutoDl,
} from '../../downloads.js';
import {
  LANGS, setLang, t,
} from '../../i18n.js';
import {
  PERMISSIONS, ensurePermission, permissionLabel, permissionState, permissionStateLabel, refreshPermissionStates, reviewPermissions,
} from '../../permissions.js';
import {
  FileAdapter, StorageAdapter,
} from '../../platform/index.js';
import { DomAdapter } from '../../platform/dom.js';
import { MediaAdapter } from '../../platform/media.js';
import {
  checkArchiveLock, clearArchiveLock, setAccent, setArchiveLock, setFont, setMicDev, setPref, setPrefStr, setTheme, setWall, store, toast,
} from '../../store.js';
import {
  CALL_TONES, MESSAGE_TONES, customTone, toneSrc,
} from '../../tones.js';
import {
  askDeleteAccount, askLogout,
} from '../../views/helpers.js';
import Vue from '../../vue.js';

export const SettingsModal = {
  setup: function () {
    /* Acentos/fondos: viven en el dispositivo, no en la cuenta (W4). */
    const accents = ['#ff751f', '#1f9dfa', '#7c6cf0', '#e64980', '#f59f00', '#e8590c', '#2f9e44'];
    const walls = [
      { val: '', name: 'Auto' },
      { val: '#0d1614', name: 'Petróleo' },
      { val: '#15121c', name: 'Uva' },
      { val: '#171310', name: 'Madera' },
      { val: '#e9e3d8', name: 'Papel' },
      { val: '#dfe9e7', name: 'Menta' },
    ];
    /* W65: las tres apariencias se eligen por muestra de color; sin
       botones con el nombre. `dark` mantiene su valor histórico (ahora
       se llama "Intermedio") para no romper preferencias guardadas. */
    const themes = [
      { val: 'light', name: 'Claro', bg: '#e3e5e8', panel: '#f2f3f5', snap: '#ffffff' },
      { val: 'dark', name: 'Intermedio', bg: '#1e1f22', panel: '#2b2d31', snap: '#383a40' },
      { val: 'black', name: 'Oscuro puro', bg: '#000000', panel: '#0b0b0b', snap: '#202020' },
    ];
    /* W8: "Cuenta" queda como ÚLTIMA pestaña: ahí se administra la cuenta
       (correo, contraseña, sesión y baja) y así el cierre de sesión no queda
       a la vista. W9: `group` abre un rótulo de sección en la nav lateral.
       W10: "Ajustes de la aplicación" pasa a llamarse "Preferencias".
       W60: en móvil la primera pantalla es una LISTA de categorías; cada
       una abre su subpantalla con botón atrás. En escritorio se mantiene
       la nav lateral de siempre. */
    const tabs = [
      { val: 'apariencia', name: 'Apariencia', group: 'Preferencias', icon: 'i-palette',
        desc: 'Tema, color, fondo y tamaño de letra' },
      { val: 'notificaciones', name: 'Notificaciones', group: 'Preferencias', icon: 'i-bell',
        desc: 'Avisos, sonidos y tonos' },
      { val: 'chat', name: 'Chat', group: 'Preferencias', icon: 'i-chat',
        desc: 'Mensajes, micrófono y permisos' },
      { val: 'privacidad', name: 'Privacidad', group: 'Preferencias', icon: 'i-shield',
        desc: 'Bloqueo con contraseña de Archivados' },
      { val: 'descargas', name: 'Descargas', group: 'Preferencias', icon: 'i-download',
        desc: 'Descargas automáticas y archivos guardados' },
      { val: 'atajos', name: 'Atajos', group: 'Preferencias', icon: 'i-key',
        desc: 'Atajos de teclado' },
      { val: 'accessibility', name: 'Accesibilidad', group: 'Preferencias',
        icon: 'i-a11y', desc: 'Animaciones y estímulos visuales' },
      { val: 'cuenta', name: 'Cuenta', group: 'Cuenta', icon: 'i-user',
        desc: 'Correo, contraseña y sesión' },
    ];

    const settingsMobile = Vue.ref(DomAdapter.getInnerWidth() <= 760);
    /* W65: la portada móvil y la categoría activa viven en el store
       porque ahora también forman parte de la URL (?settings=main,
       ?settings=appearance…). Así el botón atrás y los enlaces directos
       quedan sincronizados sin un ref local duplicado. */
    const settingsHome = Vue.computed(function () {
      return settingsMobile.value && !!store.settingsAtHome;
    });
    const currentTabName = Vue.computed(function () {
      const tab = store.settingsTab;
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].val === tab) return t(tabs[i].name);
      }
      return t('Ajustes');
    });
    const setSettingsHome = function (v) {
      store.settingsAtHome = !!(v && settingsMobile.value);
    };
    const onSettingsResize = function () {
      settingsMobile.value = DomAdapter.getInnerWidth() <= 760;
      if (!settingsMobile.value) store.settingsAtHome = false;
    };
    DomAdapter.addWindowEventListener('resize', onSettingsResize);
    Vue.onUnmounted(function () {
      DomAdapter.removeWindowEventListener('resize', onSettingsResize);
      store.settingsAtHome = false;
    });

    const close = function () {
      stopPreview();
      store.settingsOpen = false;
      /* W66f: abrir Ajustes desde Archivados dejó la lista detrás (para
         no parpadear); al cerrar se vuelve a Chats como siempre. */
      store.showArchived = false;
    };
    const setTab = function (tv) { stopPreview(); store.settingsTab = tv; };
    const openCat = function (tv) {
      stopPreview();
      /* Sin categoría → portada de ajustes (?settings=main en móvil) */
      if (!tv) { setSettingsHome(true); return; }
      setTab(tv);
      setSettingsHome(false);
    };
    const goSettingsHome = function () { setSettingsHome(true); };
    const pickTheme = function (m) { setTheme(m); };
    const pickAccent = function (c) { setAccent(c); };
    const pickWall = function (v) { setWall(v); };
    /* W20: la foto de fondo y sus ajustes (opacidad, difuminado) viven
       en el panel dedicado, que se abre donde está la lista de chats. */
    const openWallPanel = function () {
      store.settingsOpen = false;
      store.showArchived = false;   /* W66f: el panel se abre sobre Chats */
      store.wallPanelOpen = true;
    };
    /* W20: micrófono — dispositivo preferido + prueba de nivel */
    const micDev = Vue.ref(store.micDev);
    const micDevices = Vue.ref([]);
    const micTesting = Vue.ref(false);
    const micLevel = Vue.ref(0);
    let testStream = null;
    let testTimer = 0;
    let testCtx = null;
    const loadMics = async function () {
      try {
        const list = await MediaAdapter.listAudioInputs();
        micDevices.value = list;
      } catch (e) {}
    };
    Vue.onMounted(loadMics);
    /* Con el permiso concedido aparecen las etiquetas reales: recargar. */
    const pickMic = function () { setMicDev(micDev.value); loadMics(); };
    const stopMicTest = function () {
      if (testTimer) { clearInterval(testTimer); testTimer = 0; }
      if (testStream) {
        testStream.getTracks().forEach(function (tr) { tr.stop(); });
        testStream = null;
      }
      if (testCtx) { try { testCtx.close(); } catch (e) {} testCtx = null; }
      micTesting.value = false;
      micLevel.value = 0;
    };
    const testMic = async function () {
      if (micTesting.value) { stopMicTest(); return; }
      if (!(await ensurePermission('mic'))) {
        toast(t('Permiso de micrófono necesario para probar el micrófono'), 'err');
        return;
      }
      try {
        testStream = await MediaAdapter.getMicrophone({
          audio: store.micDev ? { deviceId: { exact: store.micDev } } : true,
        });
      } catch (e) {
        /* W20: si el dispositivo guardado ya no existe, con el del sistema */
        if (store.micDev) {
          try { testStream = await MediaAdapter.getMicrophone({ audio: true }); }
          catch (e2) { testStream = null; }
        }
      }
      if (!testStream) {
        toast(MediaAdapter.isSecure() === false
          ? 'El micrófono necesita HTTPS (o abrir Foxinix en localhost)'
          : 'No se pudo acceder al micrófono', 'err');
        return;
      }
      loadMics();                     /* con permiso aparecen las etiquetas */
      micTesting.value = true;
      try {
        testCtx = MediaAdapter.createAudioContext();
        if (!testCtx) { stopMicTest(); return; }
        const aSrc = testCtx.createMediaStreamSource(testStream);
        const an = testCtx.createAnalyser();
        an.fftSize = 512;
        aSrc.connect(an);
        const buf = new Uint8Array(an.fftSize);
        testTimer = setInterval(function () {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          micLevel.value = Math.min(100, Math.round(peak * 160));
        }, 120);
      } catch (e) { micLevel.value = 0; }
    };
    Vue.onUnmounted(stopMicTest);
    const pickFont = function (v) { setFont(v); };
    /* W10: idioma de la interfaz (es | en), por dispositivo. */
    const pickLang = function (v) { setLang(v); };
    const langs = LANGS;
    const toggle = function (key) { setPref(key, !store.prefs[key]); };
    /* W29e: "Formato de hora" como menú desplegable 12/24 h (antes
       era un interruptor); store.prefs.h12 sigue marcando 12 h. */
    const setH12 = function (e) { setPref('h12', e.target.value === '12'); };
    /* W40: estilo de emojis — system (fuente del SO), noto (imágenes
       de Google) o twemoji (imágenes Twemoji del sitio). */
    const setEmo = function (e) { setPrefStr('emo', e.target.value); };

    /* ---------- W63: tonos de mensaje y llamada ---------- */
    /* Los tonos personalizados se reflejan en refs para que el <select>
       se actualice en el acto al subir uno (localStorage no es reactivo). */
    const customMsgTone = Vue.ref(customTone('message'));
    const customCallTone = Vue.ref(customTone('call'));
    const saveCustomTone = function (kind, dataUrl, fileName) {
      const obj = {
        id: 'custom-' + kind,
        name: fileName || (kind === 'call' ? t('Tono de llamada') : t('Tono de mensaje')),
        file: dataUrl,
      };
      try { StorageAdapter.setItem('fm.p.customTone.' + kind, JSON.stringify(obj)); } catch (e) {}
      if (kind === 'call') customCallTone.value = obj;
      else customMsgTone.value = obj;
    };
    const messageTones = Vue.computed(function () {
      const list = MESSAGE_TONES.slice();
      if (customMsgTone.value) list.push(customMsgTone.value);
      return list;
    });
    const callTones = Vue.computed(function () {
      const list = CALL_TONES.slice();
      if (customCallTone.value) list.push(customCallTone.value);
      return list;
    });
    const messageTone = Vue.computed({
      get: function () { return store.prefs.messageTone; },
      set: function (v) { setPrefStr('messageTone', v); },
    });
    const callTone = Vue.computed({
      get: function () { return store.prefs.callTone; },
      set: function (v) { setPrefStr('callTone', v); },
    });
    let previewAudio = null;
    let previewTimer = null;
    const previewingId = Vue.ref(null);   // id del tono reproduciéndose
    const previewingKind = Vue.ref(null); // 'message' | 'call' — evita que ambos botones cambien con el mismo id
    const msgToneInput = Vue.ref(null);
    const callToneInput = Vue.ref(null);
    const stopPreview = function () {
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
      if (previewAudio) { try { previewAudio.pause(); previewAudio.src = ''; } catch (e) {} previewAudio = null; }
      previewingId.value = null;
      previewingKind.value = null;
    };
    /* Tono "predeterminado": pitido generado con Web Audio (no depende de archivos). */
    const playBeep = function () {
      const ctx = MediaAdapter.createAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
      ctx.close().catch(function () {});
    };
    const previewTone = function (id, kind) {
      /* Si ya se reproduce este tono, detener */
      if (previewingId.value === id && previewingKind.value === kind) { stopPreview(); return; }
      stopPreview();
      const tone = (kind === 'call' ? callTones.value : messageTones.value).find(function (t) { return t.id === id; });
      if (!tone) return;
      previewingId.value = id;
      previewingKind.value = kind;
      if (!tone.file) { playBeep(); previewingId.value = null; previewingKind.value = null; return; }
      previewAudio = new Audio(toneSrc(tone.file));
      previewAudio.play().catch(function () {});
      previewAudio.onended = function () { previewingId.value = null; previewingKind.value = null; };
      /* Sin límite de tiempo: el tono suena hasta terminar */
    };
    const pickMessageTone = function (e) {
      const id = e && e.target ? e.target.value : messageTone.value;
      messageTone.value = id;
      /* No auto-previsualizar: el usuario usa el botón */
    };
    const pickCallTone = function (e) {
      const id = e && e.target ? e.target.value : callTone.value;
      callTone.value = id;
      /* No auto-previsualizar: el usuario usa el botón */
    };
    /* En el APK, target="_blank" no abre el navegador: usamos el puente
       nativo. En web/escritorio se deja el comportamiento normal (nueva
       pestaña). */
    const openToneNote = function (e) {
      const bridge = DomAdapter.getNativeBridge();
      if (bridge && typeof bridge.openUrl === 'function') {
        if (e) e.preventDefault();
        try { bridge.openUrl('https://tonosdellamada.es'); } catch (err) {}
      }
    };
    const readFileDataUrl = function (file) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    };
    /* Valida duración y tamaño del archivo de audio */
    const validateAudio = function (file, maxSec, maxKB) {
      return new Promise(function (resolve, reject) {
        if (file.size > maxKB * 1024) {
          reject(new Error(t('El archivo supera {n} KB', { n: maxKB })));
          return;
        }
        const url = FileAdapter.createObjectURL(file);
        const audio = new Audio();
        audio.onloadedmetadata = function () {
          FileAdapter.revokeObjectURL(url);
          if (audio.duration > maxSec) {
            reject(new Error(t('La duración máxima es {n} segundos', { n: maxSec })));
          } else {
            resolve();
          }
        };
        audio.onerror = function () {
          FileAdapter.revokeObjectURL(url);
          reject(new Error('Archivo de audio no valido'));
        };
        audio.src = url;
      });
    };
    const uploadMessageTone = async function (e) {
      const file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await validateAudio(file, 5, 200);
        const data = await readFileDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, '');
        saveCustomTone('message', data, name);
        messageTone.value = 'custom-message';
        toast(t('Tono de mensaje guardado'));
      } catch (err) {
        toast(err.message || t('No se pudo subir el tono'), 'err');
      }
      e.target.value = '';
    };
    const uploadCallTone = async function (e) {
      const file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await validateAudio(file, 120, 1024);
        const data = await readFileDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, '');
        saveCustomTone('call', data, name);
        callTone.value = 'custom-call';
        toast(t('Tono de llamada guardado'));
      } catch (err) {
        toast(err.message || t('No se pudo subir el tono'), 'err');
      }
      e.target.value = '';
    };

    /* ---- cambiar contraseña ---- */
    const pwCur = Vue.ref('');
    const pwNew = Vue.ref('');
    const pwRep = Vue.ref('');
    const pwErr = Vue.ref('');
    const pwBusy = Vue.ref(false);
    const pwReady = Vue.computed(function () {
      return !!pwCur.value && pwNew.value.length >= 8 && pwNew.value === pwRep.value;
    });

    const changePw = async function () {
      pwErr.value = '';
      if (pwNew.value.length < 8) {
        pwErr.value = 'La contraseña nueva necesita 8 caracteres o más';
        return;
      }
      if (pwNew.value !== pwRep.value) {
        pwErr.value = 'Las contraseñas nuevas no coinciden';
        return;
      }
      pwBusy.value = true;
      try {
        const r = await api('POST', '/auth/password', {
          current_password: pwCur.value,
          new_password: pwNew.value,
        }, { retry401: true });
        // token_version subió: el servidor manda tokens frescos para esta sesión
        if (r.tokens) {
          session.access = r.tokens.access;
          session.refresh = r.tokens.refresh;
        }
        if (r.user) {
          session.user = r.user;
          store.user = r.user;
        }
        saveSession();
        pwCur.value = '';
        pwNew.value = '';
        pwRep.value = '';
        store.pwOpen = false;              // W8: cerrar la ventana al terminar
      } catch (e) {
        pwErr.value = (e && t(e.detail)) || t('No se pudo cambiar la contraseña');
      } finally {
        pwBusy.value = false;
      }
    };

    /* ---- cambiar correo (código al correo nuevo) ---- */
    const emNew = Vue.ref('');
    const emCode = Vue.ref('');
    const emMask = Vue.ref('');
    const emStep = Vue.ref(0);   // 0: escribir correo | 1: ingresar código
    const emErr = Vue.ref('');
    const emBusy = Vue.ref(false);

    const sendEmCode = async function () {
      emErr.value = '';
      if (!emNew.value.trim()) return;
      emBusy.value = true;
      try {
        const r = await api('POST', '/auth/email/change',
          { email: emNew.value.trim() }, { retry401: true });
        emMask.value = r.email_masked || emNew.value.trim();
        emStep.value = 1;
        emCode.value = '';
      } catch (e) {
        emErr.value = (e && t(e.detail)) || t('No se pudo enviar el código');
      } finally {
        emBusy.value = false;
      }
    };

    const confirmEmCode = async function () {
      emErr.value = '';
      if (emCode.value.length !== 6) {
        emErr.value = 'El código tiene 6 dígitos';
        return;
      }
      emBusy.value = true;
      try {
        const r = await api('POST', '/auth/email/change/verify',
          { code: emCode.value }, { retry401: true });
        if (r.user) {
          session.user = r.user;
          store.user = r.user;
          saveSession();
        }
        emStep.value = 0;
        emNew.value = '';
        emCode.value = '';
        store.emOpen = false;              // W8: cerrar la ventana al terminar
      } catch (e) {
        emErr.value = (e && t(e.detail)) || t('Código incorrecto');
      } finally {
        emBusy.value = false;
      }
    };

    const cancelEmCode = function () {
      emStep.value = 0;
      emCode.value = '';
      emErr.value = '';
    };

    /* ---- notificaciones (navegador o APK Android) ---- */
    const nativeNotif = (function () {
      try {
        const a = DomAdapter.getNativeBridge();
        return a && typeof a.notify === 'function' ? a : null;
      } catch (e) { return null; }
    })();
    const nativeNotifAvail = !!nativeNotif;
    const nativeNotifPerm = function () {
      if (!nativeNotif) return 'unsupported';
      try { return nativeNotif.permission() || 'prompt'; } catch (e) { return 'prompt'; }
    };
    const notifOn = nativeNotifAvail || typeof Notification !== 'undefined';
    const notifPerm = Vue.ref(nativeNotifAvail
      ? nativeNotifPerm()
      : (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
    const notifTitle = Vue.computed(function () {
      return nativeNotifAvail
        ? t('Notificaciones de Android')
        : t('Notificaciones del navegador');
    });
    const notifLabel = Vue.computed(function () {
      if (!notifOn) return t('Este navegador no las soporta');
      if (notifPerm.value === 'granted') {
        return nativeNotifAvail
          ? t('Activas: avisan con la app en segundo plano')
          : t('Activas: avisan con la pestaña oculta');
      }
      if (notifPerm.value === 'denied') {
        return nativeNotifAvail
          ? t('Bloqueadas: actívalas en Ajustes de Android')
          : t('Bloqueadas: actívalas en el navegador');
      }
      return nativeNotifAvail
        ? t('Android te va a pedir permiso')
        : t('El navegador te va a pedir permiso');
    });
    const refreshNotif = function () {
      permissionState('notif').then(function (st) {
        notifPerm.value = st === 'unavailable' ? 'unsupported' : st;
      }).catch(function () {
        if (nativeNotif) notifPerm.value = nativeNotifPerm();
      });
    };
    const openNotifSettings = function () {
      if (!nativeNotif) return;
      try { nativeNotif.openSettings(); } catch (e) {}
    };
    const askNotif = async function () {
      if (!notifOn) return;
      await ensurePermission('notif');
      refreshNotif();
      refreshPermissionStates();
    };
    Vue.onMounted(function () {
      DomAdapter.addWindowEventListener('focus', refreshNotif);
      DomAdapter.addEventListener('visibilitychange', refreshNotif);
    });
    Vue.onUnmounted(function () {
      DomAdapter.removeWindowEventListener('focus', refreshNotif);
      DomAdapter.removeEventListener('visibilitychange', refreshNotif);
    });

    /* ---- W50/W58: descargas persistentes (Cache Storage + IndexedDB) ---- */
    const dlList = Vue.ref([]);
    const dlTotal = Vue.ref(0);
    const dlBusy = Vue.ref(false);
    const dlMsg = Vue.ref('');
    const dlSaving = Vue.ref('');
    const dlOpen = Vue.reactive({});
    const dlLoad = function () {
      dlBusy.value = true;
      dlMsg.value = '';
      listDownloads().then(function (list) {
        dlList.value = list;
        let total = 0;
        let first = '';
        for (let i = 0; i < list.length; i++) {
          total += list[i].size || 0;
          if (!first) first = list[i].kind || 'file';
        }
        dlTotal.value = total;
        if (first && !Object.keys(dlOpen).length) dlOpen[first] = true;
      }).catch(function () {
        dlMsg.value = t('No se pudieron cargar las descargas');
      }).then(function () { dlBusy.value = false; });
    };
    /* W58: agrupadas por categoría, con cantidad y tamaño total. */
    const dlGroups = Vue.computed(function () {
      const out = [];
      for (let t = 0; t < DL_TYPES.length; t++) {
        const tp = DL_TYPES[t];
        const items = dlList.value.filter(function (d) {
          return (d.kind || 'file') === tp.id;
        });
        if (!items.length) continue;
        let size = 0;
        for (let i = 0; i < items.length; i++) size += items[i].size || 0;
        out.push({
          id: tp.id, label: tp.label, count: items.length, size: size, items: items,
          icon: tp.id === 'image' ? 'i-image' : (tp.id === 'audio' ? 'i-vol' :
            (tp.id === 'video' ? 'i-video' : 'i-file')),
        });
      }
      return out;
    });
    const dlToggle = function (id) { dlOpen[id] = !dlOpen[id]; };
    /* W60: las categorías ya no se expanden dentro de Ajustes (se veía
       desordenado): cada una abre su propio modal con la lista. */
    const dlCat = Vue.ref('');
    const dlCatGroup = Vue.computed(function () {
      if (!dlCat.value) return null;
      for (let i = 0; i < dlGroups.value.length; i++) {
        if (dlGroups.value[i].id === dlCat.value) return dlGroups.value[i];
      }
      return null;
    });
    const dlOpenCat = function (id) { dlCat.value = id; };
    const dlCloseCat = function () { dlCat.value = ''; };
    const dlSave = async function (item) {
      dlMsg.value = '';
      dlSaving.value = item.key;
      try {
        const r = await saveDownloadToDevice(item.key, item.name, item.mime);
        if (r && r.ok) {
          toast(r.native ? t('Guardado en Descargas/Foxinix') :
            t('Guardado en el dispositivo'), 'ok');
        } else if (r && r.permission) {
          dlMsg.value = t('Permiso de almacenamiento necesario para guardar en el dispositivo');
        } else {
          dlMsg.value = t('El archivo ya no está disponible');
          dlLoad();
        }
      } catch (e) {
        dlMsg.value = t('El archivo ya no está disponible');
      } finally {
        dlSaving.value = '';
      }
    };
    /* W58: abrir una descarga guardada desde los datos de la app. El
       blob local no pasa por la red; si el navegador bloquea la pestaña
       nueva se avisa sin abrir nada raro. */
    const dlOpenFile = async function (item) {
      const ok = await openAppDownload(item.key);
      if (!ok) {
        dlMsg.value = t('El archivo ya no está disponible');
        dlLoad();
      }
    };
    const dlDelete = function (item) {
      if (!DomAdapter.confirm(t('¿Eliminar esta descarga guardada?'))) return;
      deleteDownload(item.key).then(dlLoad);
    };
    const dlClear = function () {
      if (!DomAdapter.confirm(t('¿Eliminar todas las descargas guardadas?'))) return;
      clearDownloads().then(dlLoad);
    };
    const dlDate = function (item) {
      if (!item || !item.saved_at) return '';
      try {
        return new Date(item.saved_at).toLocaleDateString(store.lang === 'en' ? 'en' : 'es');
      } catch (e) { return ''; }
    };
    /* W58: la descarga automática ya no es exclusiva del APK: se guarda
       en los datos de la app también en web/PWA/escritorio. */
    const dlAuto = Vue.ref(autoDlPrefs());
    const dlAutoSet = function (type, network, ev) {
      setAutoDl(type, network, !!(ev && ev.target && ev.target.checked));
      dlAuto.value = autoDlPrefs();
      store.dlAutoRev++;
    };
    /* W60: bloqueo de Archivados — activar, cambiar y quitar. La
       contraseña actual solo se pide para cambiar o quitar; nunca se
       guarda en claro. */
    const archivePw = Vue.ref('');
    const archiveNew = Vue.ref('');
    const archiveNew2 = Vue.ref('');
    const archiveChange = Vue.ref(false);
    const archiveBusy = Vue.ref(false);
    const archiveErr = Vue.ref('');
    const archiveOk = Vue.ref('');
    const archiveReset = function () {
      archivePw.value = '';
      archiveNew.value = '';
      archiveNew2.value = '';
      archiveChange.value = false;
    };
    const archiveActivate = async function () {
      archiveErr.value = '';
      archiveOk.value = '';
      if (archiveNew.value.length < 4) {
        archiveErr.value = t('La contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (archiveNew.value !== archiveNew2.value) {
        archiveErr.value = t('Las contraseñas no coinciden');
        return;
      }
      archiveBusy.value = true;
      try {
        await setArchiveLock(archiveNew.value);
        store.archiveUnlocked = true;
        archiveOk.value = t('Archivados protegidos con contraseña');
        archiveReset();
      } catch (e) {
        archiveErr.value = (e && e.message === 'short')
          ? t('La contraseña debe tener al menos 4 caracteres')
          : t('No se pudo activar la protección');
      } finally {
        archiveBusy.value = false;
      }
    };
    const archiveDisable = async function () {
      archiveErr.value = '';
      archiveOk.value = '';
      if (!archivePw.value) {
        archiveErr.value = t('Escribe la contraseña actual');
        return;
      }
      archiveBusy.value = true;
      try {
        if (!(await checkArchiveLock(archivePw.value))) {
          archiveErr.value = t('Contraseña incorrecta');
          return;
        }
        clearArchiveLock();
        store.showArchived = false;
        archiveOk.value = t('Protección desactivada');
        archiveReset();
      } catch (e) {
        archiveErr.value = t('No se pudo quitar la protección');
      } finally {
        archiveBusy.value = false;
      }
    };
    const archiveChangePw = async function () {
      archiveErr.value = '';
      archiveOk.value = '';
      if (archiveNew.value.length < 4) {
        archiveErr.value = t('La contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (archiveNew.value !== archiveNew2.value) {
        archiveErr.value = t('Las contraseñas no coinciden');
        return;
      }
      archiveBusy.value = true;
      try {
        if (!(await checkArchiveLock(archivePw.value))) {
          archiveErr.value = t('Contraseña incorrecta');
          return;
        }
        await setArchiveLock(archiveNew.value);
        store.archiveUnlocked = true;
        archiveOk.value = t('Contraseña actualizada');
        archiveReset();
      } catch (e) {
        archiveErr.value = t('No se pudo cambiar la contraseña');
      } finally {
        archiveBusy.value = false;
      }
    };

    /* W58: resumen de permisos para volver a pedirlos desde Ajustes. */
    const permRows = Vue.computed(function () {
      return PERMISSIONS.map(function (p) {
        return {
          id: p.id, icon: p.icon, label: permissionLabel(p.id),
          state: store.permStates[p.id] || '',
          stateLabel: permissionStateLabel(p.id),
        };
      });
    });
    const permReview = async function () {
      await reviewPermissions();
    };
    const permRefresh = function () { refreshPermissionStates(); };
    Vue.onMounted(function () {
      dlLoad();
      hydrateDownloads();
      refreshPermissionStates();
    });

    return {
      store, tabs, close, setTab, openCat, goSettingsHome,
      settingsMobile, settingsHome, currentTabName,
      accents, walls, themes,
      pickTheme, pickAccent, pickWall, pickFont, pickLang, langs, toggle, setH12,
      setEmo,   /* W40 */
      /* W20: panel de fondo + micrófono */
      openWallPanel, micDev, micDevices, micTesting, micLevel, pickMic, testMic,
      pwCur, pwNew, pwRep, pwErr, pwBusy, pwReady, changePw,
      emNew, emCode, emMask, emStep, emErr, emBusy,
      sendEmCode, confirmEmCode, cancelEmCode,
      notifOn, notifPerm, notifLabel, notifTitle, askNotif,
      nativeNotifAvail, openNotifSettings,
      /* W50/W58: descargas persistentes + automáticas */
      dlList, dlTotal, dlBusy, dlMsg, dlSaving, dlSave, dlOpenFile, dlDelete,
      dlClear, dlDate, dlGroups, dlOpen, dlToggle, fmtSize,
      dlCat, dlCatGroup, dlOpenCat, dlCloseCat,
      dlAuto, dlAutoSet, dlTypes: DL_TYPES,
      /* W60: contraseña de Archivados */
      archivePw, archiveNew, archiveNew2, archiveChange,
      archiveBusy, archiveErr, archiveOk,
      archiveActivate, archiveDisable, archiveChangePw,
      /* W58: permisos del dispositivo */
      permRows, permReview, permRefresh,
      /* W63: tonos de mensaje y llamada */
      messageTones, callTones, messageTone, callTone, previewTone, previewingId, previewingKind,
      pickMessageTone, pickCallTone, openToneNote, uploadMessageTone, uploadCallTone,
      msgToneInput, callToneInput,
      doLogout: askLogout, doDelete: askDeleteAccount,
    };
  },
  template: `
    <div class="modal-veil settings-veil" @click.self="close">
      <div class="modal settings" :class="{ 'is-home': settingsMobile && settingsHome }"
        role="dialog" :aria-label="t('Ajustes')">
        <header>
          <span class="m-head-title">
            <template v-if="settingsMobile && !settingsHome">
              <button class="st-back" type="button" @click="openCat(null)">
                <svg class="ic"><use href="#i-back"></use></svg>
              </button>
              <b>{{ currentTabName }}</b>
            </template>
            <template v-else>
              <b>{{ t('Ajustes') }}</b>
            </template>
          </span>
          <button class="icon-btn" type="button" :title="t('Cerrar')" @click="close">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>

        <!-- W60: en móvil, la página principal de Ajustes es una lista de
             categorías. Cada una abre su subpantalla con botón atrás. -->
        <div class="st-mobile-home" v-if="settingsMobile && settingsHome">
          <button class="st-cat" type="button" v-for="tb in tabs" :key="tb.val"
            @click="openCat(tb.val)">
            <span class="st-cat-ic"><svg class="ic"><use :href="'#' + tb.icon"></use></svg></span>
            <span class="st-cat-col"><b>{{ t(tb.name) }}</b><span>{{ t(tb.desc) }}</span></span>
            <svg class="ic ic-sm st-cat-chev"><use href="#i-back"></use></svg>
          </button>
        </div>

        <!-- W9: navegación lateral agrupada (estilo Discord); .m-tab y el
             orden se conservan: Cuenta siempre la ÚLTIMA pestaña. -->
        <div class="st-cols" v-if="!settingsMobile || !settingsHome">
        <div class="m-tabs" role="tablist">
          <template v-for="(tb, i) in tabs">
            <div class="st-group" v-if="tb.group && (i === 0 || tabs[i - 1].group !== tb.group)"
              :key="'g-' + tb.group">{{ t(tb.group) }}</div>
            <button class="m-tab" type="button" :key="tb.val"
              :class="{ on: store.settingsTab === tb.val }" @click="setTab(tb.val)">
              <!-- W80: icono en la columna lateral de Ajustes (PC) -->
              <svg class="ic ic-sm m-tab-ic"><use :href="'#' + tb.icon"></use></svg>
              <span class="m-tab-t">{{ t(tb.name) }}</span>
            </button>
          </template>
        </div>

        <div class="st-body">
          <!-- ============ cuenta ============ -->
          <template v-if="store.settingsTab === 'cuenta'">
            <div class="st-title">{{ t('Cuenta') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Tu cuenta') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Usuario') }}</b><span>@{{ store.user ? store.user.username : '' }}</span></div>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Correo') }}</b><span>{{ (store.user && store.user.email) || '—' }}</span></div>
              </div>
            </div>

            <!-- W8: cambiar correo/contraseña cada uno en su propia ventana -->
            <div class="st-sec">
              <div class="st-h">{{ t('Seguridad') }}</div>
              <div class="st-btns st-btns-left">
                <button class="btn btn-ghost" type="button" @click="store.emOpen = true">{{ t('Cambiar correo') }}</button>
                <button class="btn btn-ghost" type="button" @click="store.pwOpen = true">{{ t('Cambiar contraseña') }}</button>
              </div>
            </div>

            <div class="st-sec">
              <div class="st-h">{{ t('Sesión') }}</div>
              <button class="btn btn-ghost btn-full" type="button" :title="t('Cerrar sesión')" @click="doLogout">{{ t('Cerrar sesión') }}</button>
            </div>

            <div class="st-sec">
              <div class="st-h">{{ t('Zona de peligro') }}</div>
              <div class="danger-zone">
                <p><b>{{ t('Eliminar cuenta') }}</b>: {{ t('borra para siempre tu perfil, tus mensajes y tus archivos. Tus MD se eliminan por completo; en los grupos queda un aviso. No se puede deshacer.') }}</p>
                <button class="btn btn-danger btn-full" type="button" @click="doDelete">{{ t('Eliminar mi cuenta') }}</button>
              </div>
            </div>
          </template>

          <!-- ============ apariencia ============ -->
          <template v-else-if="store.settingsTab === 'apariencia'">
            <div class="st-title">{{ t('Apariencia') }}</div>
            <div class="ap-sec">{{ t('Tema') }}</div>
            <div class="ap-themes" role="group" :aria-label="t('Tema')">
              <button class="ap-theme" type="button" v-for="th in themes" :key="th.val"
                :class="{ on: store.theme === th.val }"
                :title="t(th.name)" :aria-label="t(th.name)" :aria-pressed="store.theme === th.val"
                @click="pickTheme(th.val)">
                <span class="ap-theme-art" :style="{ background: th.bg }">
                  <i class="ap-theme-side" :style="{ background: th.panel }"></i>
                  <i class="ap-theme-bubble" :style="{ background: th.snap }"></i>
                  <i class="ap-theme-accent" :style="{ background: store.accent }"></i>
                </span>
                <span class="ap-theme-check" v-if="store.theme === th.val">
                  <svg class="ic ic-sm"><use href="#i-check"></use></svg>
                </span>
              </button>
            </div>
            <div class="ap-sec">{{ t('Color de acento') }}</div>
            <div class="ap-swatches">
              <button class="ap-sw" type="button" v-for="c in accents" :key="c"
                :style="{ background: c }"
                :class="{ on: store.accent.toLowerCase() === c }"
                :title="c" @click="pickAccent(c)"></button>
            </div>
            <div class="ap-sec">{{ t('Fondo de la conversación') }}</div>
            <div class="ap-walls">
              <button class="ap-wl" type="button" v-for="w in walls" :key="w.val"
                :class="{ on: store.wall === w.val }" @click="pickWall(w.val)">
                <span class="wl-chip" :style="{ background: w.val || 'var(--bg)' }"></span>{{ t(w.name) }}</button>
            </div>
            <!-- W20: foto de fondo + opacidad/difuminado: panel dedicado
                 que ocupa la columna del lista de chats (hoja inferior
                 en celular) y trae una preview de ejemplo -->
            <div class="ap-row ap-wallrow">
              <button class="btn btn-ghost btn-sm" type="button" @click="openWallPanel">
                {{ t('Personalizar fondo…') }}</button>
            </div>
            <div class="ap-sec">{{ t('Tamaño de letra') }}</div>
            <div class="ap-row">
              <button class="ap-opt" type="button" :class="{ on: store.font === 'small' }"
                @click="pickFont('small')">{{ t('Pequeño') }}</button>
              <button class="ap-opt" type="button" :class="{ on: store.font === 'normal' }"
                @click="pickFont('normal')">{{ t('Normal') }}</button>
              <button class="ap-opt" type="button" :class="{ on: store.font === 'large' }"
                @click="pickFont('large')">{{ t('Grande') }}</button>
            </div>
            <!-- W10: idioma de la interfaz (es | en), guardado por dispositivo.
                 W37b: ahora es un cuadro desplegable (select). -->
            <div class="ap-sec">{{ t('Idioma de la interfaz') }}</div>
            <div class="ap-row">
              <select class="input lang-select" :value="store.lang"
                @change="pickLang($event.target.value)">
                <option v-for="lg in langs" :key="lg.val" :value="lg.val">{{ lg.name }}</option>
              </select>
            </div>
          </template>

          <!-- ============ chat ============ -->
          <template v-else-if="store.settingsTab === 'chat'">
            <div class="st-title">{{ t('Chat') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Mensajes') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Avisar cuando escribo') }}</b><span>{{ t('Tus contactos ven “escribiendo…”') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.typing"
                  @change="toggle('typing')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Recibos de lectura') }}</b><span>{{ t('Mostrar ✓✓ y avisar cuando lees') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.receipts"
                  @change="toggle('receipts')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Enter para enviar') }}</b><span>{{ t('Shift + Enter hace un salto de línea') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.enter"
                  @change="toggle('enter')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Formato de hora') }}</b><span>{{ t('En vez de 20:30, mostrar 8:30 pm') }}</span></div>
                <!-- W29e: desplegable 12/24 h (antes era un interruptor) -->
                <select class="input h12-select" :value="store.prefs.h12 ? '12' : '24'"
                  @change="setH12" :aria-label="t('Formato de hora')">
                  <option value="24">24 h</option>
                  <option value="12">12 h</option>
                </select>
              </div>
              <!-- W40: estilo de los emojis — nativo (fuente del SO,
                   cero descargas), Google (Noto) o Twemoji -->
              <div class="st-row">
                <div class="st-col"><b>{{ t('Estilo de emojis') }}</b>
                  <span>{{ t('Nativo usa la fuente de tu sistema') }}</span></div>
                <select class="input emo-select" :value="store.prefs.emo"
                  @change="setEmo" :aria-label="t('Estilo de emojis')">
                  <option value="system">{{ t('Nativo del sistema') }}</option>
                  <option value="noto">{{ t('Emojis de Google') }}</option>
                  <option value="twemoji">Twemoji</option>
                </select>
              </div>
            </div>
            <!-- W20: micrófono — dispositivo preferido y prueba de nivel -->
            <div class="st-sec">
              <div class="st-h">{{ t('Micrófono') }}</div>
              <div class="st-row">
                <select class="input mic-select" v-model="micDev" @change="pickMic">
                  <option value="">{{ t('Micrófono del sistema') }}</option>
                  <option v-for="(d, i) in micDevices" :key="d.deviceId" :value="d.deviceId">
                    {{ d.label || t('Micrófono {n}', { n: i + 1 }) }}</option>
                </select>
              </div>
              <div class="st-row mic-test-row">
                <button class="btn btn-ghost btn-sm" type="button" @click="testMic">
                  {{ micTesting ? t('Escuchando…') : t('Probar micrófono') }}</button>
                <span class="mic-bar"><i :style="{ width: micLevel + '%' }"></i></span>
              </div>
            </div>
            <!-- W58: permisos del dispositivo (micrófono, cámara, avisos,
                 almacenamiento legacy). Se pueden revisar sin reiniciar. -->
            <div class="st-sec">
              <div class="st-h">{{ t('Permisos del dispositivo') }}</div>
              <p class="st-hint">{{ t('Si saltaste un permiso al entrar, puedes concederlo aquí. La app sigue funcionando sin él.') }}</p>
              <div class="st-row perm-row" v-for="p in permRows" :key="p.id">
                <svg class="ic ic-sm perm-row-ic"><use :href="'#' + p.icon"></use></svg>
                <div class="st-col"><b>{{ p.label }}</b><span>{{ p.stateLabel }}</span></div>
                <span class="perm-state" :class="'is-' + p.state">{{ p.stateLabel }}</span>
              </div>
              <div class="st-btns st-btns-left">
                <button class="btn btn-ghost btn-sm" type="button" @click="permRefresh">{{ t('Actualizar') }}</button>
                <button class="btn btn-sm" type="button" @click="permReview">{{ t('Revisar permisos') }}</button>
              </div>
            </div>

          </template>

          <!-- ============ notificaciones ============ -->
          <template v-else-if="store.settingsTab === 'notificaciones'">
            <div class="st-title">{{ t('Notificaciones') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Avisos') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Habilitar notificaciones') }}</b><span>{{ t('Hace sonar los mensajes') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.sound"
                  @change="toggle('sound')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
              <div class="st-row" v-if="notifOn && nativeNotifAvail && notifPerm === 'denied'">
                <div class="st-col"><b>{{ t('Permiso de notificaciones') }}</b><span>{{ t('Bloqueado por el sistema') }}</span></div>
                <button class="btn btn-ghost btn-sm" type="button"
                  @click="openNotifSettings">{{ t('Abrir ajustes') }}</button>
              </div>
            </div>

            <!-- W63: tonos de mensaje y llamada (W65: categoría propia) -->
            <div class="st-sec tone-sec">
              <div class="st-h">{{ t('Sonidos') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Tono de mensaje') }}</b><span>{{ t('Suena cuando llega un mensaje nuevo') }}</span></div>
                <div class="tone-pick">
                  <select class="input tone-select" :value="messageTone" @change="pickMessageTone">
                    <option v-for="tm in messageTones" :key="tm.id" :value="tm.id">{{ t(tm.name) }}</option>
                  </select>
                  <button class="btn btn-ghost btn-sm tone-play" type="button"
                    :title="(previewingId === messageTone && previewingKind === 'message') ? t('Detener') : t('Previsualizar')"
                    @click="previewTone(messageTone, 'message')">
                    <svg class="ic ic-sm"><use :href="(previewingId === messageTone && previewingKind === 'message') ? '#i-pause' : '#i-play'"></use></svg>
                  </button>
                </div>
              </div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Tono de llamada') }}</b><span>{{ t('Suena cuando te llaman') }}</span></div>
                <div class="tone-pick">
                  <select class="input tone-select" :value="callTone" @change="pickCallTone">
                    <option v-for="tc in callTones" :key="tc.id" :value="tc.id">{{ t(tc.name) }}</option>
                  </select>
                  <button class="btn btn-ghost btn-sm tone-play" type="button"
                    :title="(previewingId === callTone && previewingKind === 'call') ? t('Detener') : t('Previsualizar')"
                    @click="previewTone(callTone, 'call')">
                    <svg class="ic ic-sm"><use :href="(previewingId === callTone && previewingKind === 'call') ? '#i-pause' : '#i-play'"></use></svg>
                  </button>
                </div>
              </div>
              <div class="st-row tone-upload">
                <input type="file" ref="msgToneInput" accept="audio/mpeg, audio/wav, audio/ogg" @change="uploadMessageTone" style="display: none">
                <input type="file" ref="callToneInput" accept="audio/mpeg, audio/wav, audio/ogg" @change="uploadCallTone" style="display: none">
                <button class="btn btn-ghost btn-sm" type="button" @click="msgToneInput && msgToneInput.click()">
                  <svg class="ic ic-sm"><use href="#i-plus"></use></svg>
                  {{ t('Subir tono de mensaje') }} (max 5s, 200KB)
                </button>
                <button class="btn btn-ghost btn-sm" type="button" @click="callToneInput && callToneInput.click()">
                  <svg class="ic ic-sm"><use href="#i-plus"></use></svg>
                  {{ t('Subir tono de llamada') }} (max 120s, 1MB)
                </button>
              </div>
            </div>
          </template>

          <!-- ============ privacidad ============ -->
          <template v-else-if="store.settingsTab === 'privacidad'">
            <div class="st-title">{{ t('Privacidad') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Archivados') }}</div>
              <p class="st-hint">{{ t('Protege la sección de chats archivados con una contraseña. Se pedirá al entrar y se guarda solo en este dispositivo; no se envía al servidor.') }}</p>

              <template v-if="store.archiveHasLock">
                <div class="st-privacy-state">
                  <svg class="ic ic-sm"><use href="#i-lock"></use></svg>
                  <span>{{ t('Archivados protegidos con contraseña') }}</span>
                </div>
                <div class="field">
                  <label>{{ t('Contraseña actual') }}</label>
                  <input class="input" type="password" v-model="archivePw"
                    autocomplete="current-password" :placeholder="t('Para cambiar o quitar la protección')">
                </div>
                <div class="st-btns st-btns-left">
                  <button class="btn btn-ghost btn-sm" type="button"
                    @click="archiveChange = !archiveChange">{{ archiveChange ? t('Cancelar cambio') : t('Cambiar contraseña') }}</button>
                  <button class="btn btn-ghost btn-sm" type="button"
                    :disabled="archiveBusy || !archivePw" @click="archiveDisable">{{ t('Quitar protección') }}</button>
                </div>
                <div class="archive-new" v-if="archiveChange">
                  <div class="field">
                    <label>{{ t('Nueva contraseña') }}</label>
                    <input class="input" type="password" v-model="archiveNew" autocomplete="new-password">
                  </div>
                  <div class="field">
                    <label>{{ t('Repite la nueva contraseña') }}</label>
                    <input class="input" type="password" v-model="archiveNew2" autocomplete="new-password">
                  </div>
                  <button class="btn btn-sm" type="button" :disabled="archiveBusy" @click="archiveChangePw">
                    {{ archiveBusy ? t('Guardando…') : t('Guardar nueva contraseña') }}</button>
                </div>
              </template>

              <template v-else>
                <div class="field">
                  <label>{{ t('Contraseña') }}</label>
                  <input class="input" type="password" v-model="archiveNew"
                    autocomplete="new-password" :placeholder="t('Mínimo 4 caracteres')">
                </div>
                <div class="field">
                  <label>{{ t('Repite la contraseña') }}</label>
                  <input class="input" type="password" v-model="archiveNew2"
                    autocomplete="new-password">
                </div>
                <button class="btn btn-sm" type="button" :disabled="archiveBusy" @click="archiveActivate">
                  {{ archiveBusy ? t('Guardando…') : t('Activar protección') }}</button>
              </template>

              <div class="form-err st-err" v-if="archiveErr" role="alert">
                <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ archiveErr }}</span>
              </div>
              <div class="st-ok st-ok-line" v-if="archiveOk">
                <svg class="ic ic-sm"><use href="#i-check"></use></svg><span>{{ archiveOk }}</span>
              </div>
            </div>
          </template>

          <!-- ============ descargas (W50/W58) ============ -->
          <template v-else-if="store.settingsTab === 'descargas'">
            <div class="st-title">{{ t('Descargas') }}</div>
            <div class="st-sec dl-auto-sec">
              <div class="st-h">{{ t('Descargas automáticas') }}</div>
              <p class="st-hint">{{ t('Wi-Fi: activado por defecto; los archivos se descargan solos a los datos de la app. Datos móviles: desactivado por defecto para no gastar tu plan. Nada se copia a Descargas hasta que pulses “Guardar en el dispositivo”.') }}</p>
              <div class="dl-auto-row" v-for="tp in dlTypes" :key="tp.id">
                <b class="dl-auto-name">{{ t(tp.label) }}</b>
                <label class="dl-auto-opt">
                  <span class="tgl"><input type="checkbox" :checked="dlAuto[tp.id].wifi"
                    @change="dlAutoSet(tp.id, 'wifi', $event)"><span class="tgl-track"><span class="tgl-knob"></span></span></span>
                  <span>Wi-Fi</span>
                </label>
                <label class="dl-auto-opt">
                  <span class="tgl"><input type="checkbox" :checked="dlAuto[tp.id].mobile"
                    @change="dlAutoSet(tp.id, 'mobile', $event)"><span class="tgl-track"><span class="tgl-knob"></span></span></span>
                  <span>{{ t('Datos móviles') }}</span>
                </label>
              </div>
            </div>
            <div class="st-sec">
              <div class="st-h">{{ t('Archivos guardados') }}</div>
              <p class="st-hint">{{ t('Se guardan en este dispositivo para abrirlos sin volver a descargarlos. Puedes exportar una copia a Descargas cuando quieras.') }}</p>
              <div class="dl-empty" v-if="dlBusy">{{ t('Cargando…') }}</div>
              <div class="dl-empty" v-else-if="!dlList.length">{{ t('No hay descargas guardadas.') }}</div>
              <div class="dl-groups" v-else>
                <button class="dl-group" type="button" v-for="g in dlGroups" :key="g.id"
                  @click="dlOpenCat(g.id)">
                  <span class="dl-group-head">
                    <svg class="ic ic-sm"><use :href="'#' + g.icon"></use></svg>
                    <b>{{ t(g.label) }}</b>
                    <span class="dl-gcount">({{ g.count }})</span>
                    <span class="dl-gsize">{{ fmtSize(g.size) }}</span>
                    <svg class="ic ic-sm dl-gchev"><use href="#i-back"></use></svg>
                  </span>
                </button>
              </div>
              <div class="form-err st-err" v-if="dlMsg" role="alert">
                <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ dlMsg }}</span>
              </div>
            </div>
            <div class="st-sec" v-if="dlList.length">
              <div class="st-row">
                <div class="st-col"><b>{{ t('Espacio usado') }}</b><span>{{ fmtSize(dlTotal) }}</span></div>
                <button class="btn btn-ghost btn-sm" type="button" @click="dlClear">{{ t('Borrar todas') }}</button>
              </div>
            </div>
          </template>

          <!-- ============ atajos ============ -->
          <template v-else-if="store.settingsTab === 'atajos'">
            <div class="st-title">{{ t('Atajos') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Atajos de teclado') }}</div>
              <p style="margin-bottom:10px;color:var(--txt-2);font-size:.85em;">{{ t('NOTA: Estos atajos solamente funcionan en teclado físico.') }}</p>
              <div class="kbd-row"><span class="kbd">Enter</span><span>{{ t('Enviar mensaje') }}</span></div>
              <div class="kbd-row"><span class="kbd">Shift + Enter</span><span>{{ t('Salto de línea') }}</span></div>
              <div class="kbd-row"><span class="kbd">Ctrl + Enter</span><span>{{ t('Enviar con “Enter para enviar” apagado') }}</span></div>
              <div class="kbd-row"><span class="kbd">Esc</span><span>{{ t('Cerrar ventanas y paneles') }}</span></div>
            </div>
          </template>

          <!-- ============ accesibilidad ============ -->
          <template v-else-if="store.settingsTab === 'accessibility'">
            <div class="st-title">{{ t('Accesibilidad') }}</div>
            <div class="st-sec">
              <div class="st-h">{{ t('Animaciones y efectos') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Quitar animaciones') }}</b><span>{{ t('Desactiva los movimientos visuales, transiciones y efectos de la interfaz para mejorar el rendimiento del equipo o reducir la fatiga visual.') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.noAnim" @change="toggle('noAnim')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
            </div>
            <div class="st-sec">
              <div class="st-h">{{ t('Estímulos visuales') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Reducir estímulos visuales') }}</b><span>{{ t('Desactiva la reproducción automática de GIFs, stickers animados y efectos de pantalla completa para evitar distracciones o crisis de fotosensibilidad (TDAH, autismo, epilepsia).') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.reduceStimuli" @change="toggle('reduceStimuli')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
            </div>

            <div class="st-sec">
              <div class="st-h">{{ t('Notas de voz') }}</div>
              <div class="st-row">
                <div class="st-col"><b>{{ t('Reproducir la siguiente nota de voz automáticamente') }}</b><span>{{ t('Al terminar una nota de voz, si el siguiente mensaje es otra nota de voz se reproduce sola hasta acabar la racha; si hay cualquier otro mensaje, la reproducción se detiene.') }}</span></div>
                <label class="tgl"><input type="checkbox" :checked="store.prefs.voiceQueue" @change="toggle('voiceQueue')"><span class="tgl-track"><span class="tgl-knob"></span></span></label>
              </div>
            </div>
          </template>
        </div><!-- /.st-body -->
        </div><!-- /.st-cols -->
      </div>

      <!-- W8: ventana propia para cambiar la contraseña -->
      <div class="modal-veil" v-if="store.pwOpen" @click.self="store.pwOpen = false">
        <div class="modal small" role="dialog" :aria-label="t('Cambiar contraseña')">
          <header>{{ t('Cambiar contraseña') }}
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="store.pwOpen = false">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="m-body">
            <div class="field">
              <label>{{ t('Contraseña actual') }}</label>
              <input class="input" type="password" v-model="pwCur" autocomplete="current-password">
            </div>
            <div class="field">
              <label>{{ t('Contraseña nueva') }}</label>
              <input class="input" type="password" v-model="pwNew" autocomplete="new-password">
            </div>
            <div class="field">
              <label>{{ t('Repite la contraseña nueva') }}</label>
              <input class="input" type="password" v-model="pwRep" autocomplete="new-password">
            </div>
            <div class="form-err st-err" v-if="pwErr" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(pwErr) }}</span>
            </div>
          </div>
          <div class="m-foot st-btns">
            <button class="btn btn-ghost" type="button" :disabled="pwBusy" @click="store.pwOpen = false">{{ t('Cancelar') }}</button>
            <button class="btn" type="button" :disabled="!pwReady || pwBusy" @click="changePw">
              {{ pwBusy ? t('Guardando…') : t('Guardar') }}</button>
          </div>
        </div>
      </div>

      <!-- W8: ventana propia para cambiar el correo -->
      <div class="modal-veil" v-if="store.emOpen" @click.self="store.emOpen = false">
        <div class="modal small" role="dialog" :aria-label="t('Cambiar correo')">
          <header>{{ t('Cambiar correo') }}
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="store.emOpen = false">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="m-body">
            <template v-if="emStep === 0">
              <div class="field">
                <label>{{ t('Nuevo correo') }}</label>
                <input class="input" type="email" v-model.trim="emNew"
                  :placeholder="t('tucorreo@ejemplo.com')" autocomplete="email">
              </div>
              <p class="st-hint">{{ t('Te enviamos un código de 6 dígitos. Tu correo actual sigue activo hasta que confirmes.') }}</p>
            </template>
            <template v-else>
              <p class="st-hint">{{ t('Enviamos un código de 6 dígitos a {n}. Tu correo actual sigue activo hasta que confirmes.', { n: emMask }) }}</p>
              <div class="field">
                <label>{{ t('Código') }}</label>
                <input class="input" inputmode="numeric" maxlength="6" v-model.trim="emCode" placeholder="123456">
              </div>
            </template>
            <div class="form-err st-err" v-if="emErr" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(emErr) }}</span>
            </div>
          </div>
          <div class="m-foot st-btns" v-if="emStep === 0">
            <button class="btn btn-ghost" type="button" :disabled="emBusy" @click="store.emOpen = false">{{ t('Cancelar') }}</button>
            <button class="btn" type="button" :disabled="!emNew || emBusy" @click="sendEmCode">
              {{ emBusy ? t('Enviando…') : t('Enviar código') }}</button>
          </div>
          <div class="m-foot st-btns" v-else>
            <button class="btn btn-ghost" type="button" :disabled="emBusy" @click="cancelEmCode">{{ t('Cancelar') }}</button>
            <button class="btn btn-ghost" type="button" :disabled="emBusy" @click="sendEmCode">{{ t('Reenviar') }}</button>
            <button class="btn" type="button" :disabled="emCode.length !== 6 || emBusy" @click="confirmEmCode">
              {{ emBusy ? t('Confirmando…') : t('Confirmar') }}</button>
          </div>
        </div>
      </div>

      <!-- W60: cada categoría de descargas se abre en su propio modal;
           nada de listas expandibles dentro de Ajustes. -->
      <div class="modal-veil" v-if="dlCat && dlCatGroup" @click.self="dlCloseCat">
        <div class="modal dl-cat-modal" role="dialog" :aria-label="t(dlCatGroup.label)">
          <header>
            <span class="m-head-title">
              <svg class="ic"><use :href="'#' + dlCatGroup.icon"></use></svg>
              <b>{{ t(dlCatGroup.label) }}</b>
            </span>
            <span class="dl-gsize">{{ fmtSize(dlCatGroup.size) }}</span>
            <button class="icon-btn" type="button" :title="t('Cerrar')" @click="dlCloseCat">
              <svg class="ic"><use href="#i-x"></use></svg>
            </button>
          </header>
          <div class="m-body dl-cat-body dl-group-body">
            <div class="dl-item" v-for="d in dlCatGroup.items" :key="d.key">
              <div class="dl-info">
                <b>{{ d.name }}</b>
                <span>{{ fmtSize(d.size) }}<template v-if="d.auto"> · {{ t('Automática') }}</template><template v-if="dlDate(d)"> · {{ dlDate(d) }}</template></span>
              </div>
              <button class="btn btn-ghost btn-sm" type="button"
                @click="dlOpenFile(d)">{{ t('Abrir') }}</button>
              <button class="btn btn-ghost btn-sm" type="button"
                :disabled="dlSaving === d.key" @click="dlSave(d)">
                {{ dlSaving === d.key ? t('Guardando…') : t('Guardar en el dispositivo') }}</button>
              <button class="icon-btn" type="button" :title="t('Eliminar')" @click="dlDelete(d)">
                <svg class="ic"><use href="#i-trash"></use></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`,
};