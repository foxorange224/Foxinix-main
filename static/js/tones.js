/* Foxinix — W63: catálogo y reproducción de tonos.

   Los archivos viven en /tonos/ (mount propio del servidor). El tono
   "default" no usa archivo: se genera un pitido corto con WebAudio para
   que la app suene incluso si los assets no están desplegados.

   Un tono subido por el usuario se guarda como data-URL en
   localStorage (fm.p.customTone.<kind>) y se añade al final del catálogo. */
import { store } from './store.js';

export const MESSAGE_TONES = [
  { id: 'default', name: 'Predeterminado', file: null },
  { id: 'beep', name: 'Beep', file: '/tonos/Mensaje/Beep.mp3' },
  { id: 'notifdefault', name: 'Notificación predeterminada', file: '/tonos/Mensaje/Notificación predeterminada.mp3' },
  { id: 'notif2', name: 'Notificación 2', file: '/tonos/Mensaje/Notificación 2.mp3' },
  { id: 'discord', name: 'Sonido de Discord', file: '/tonos/Mensaje/Sonido de Discord.mp3' },
  { id: 'maullido', name: 'Maullido Saturado', file: '/tonos/Mensaje/Maullido Saturado.mp3' },
  { id: 'silbido', name: 'Silbido WhatsApp', file: '/tonos/Llamada/Silbido-Whatsapp.mp3' },
];

export const CALL_TONES = [
  { id: 'default', name: 'Predeterminado', file: null },
  { id: 'iphone', name: 'iPhone SE', file: '/tonos/Llamada/iPhone-SE.mp3' },
  { id: 'discord', name: 'Discord', file: '/tonos/Llamada/Discord Calling.mp3' },
  { id: 'skype', name: 'Skype', file: '/tonos/Llamada/Skype.mp3' },
  { id: 'nokia1994', name: 'Nokia 1994', file: '/tonos/Llamada/Nokia 1994.mp3' },
  { id: 'nokiasaul', name: 'Nokia Saul', file: '/tonos/Llamada/Nokia Saul.mp3' },
  { id: 'saul', name: 'Saul', file: '/tonos/Llamada/Saul.mp3' },
  { id: 'pedro', name: 'Pedro Pedro Pe', file: '/tonos/Llamada/Pedro Pedro Pe.mp3' },
  { id: 'sacame', name: 'Sácame del bolsillo', file: '/tonos/Llamada/Sacame del bolsillo.mp3' },
  { id: 'thunderstruck', name: 'Thunderstruck', file: '/tonos/Llamada/Thunderstruck.mp3' },
  { id: 'nya', name: 'Nya Music (Otakus)', file: '/tonos/Llamada/Nya Music (Para otakus).mp3' },
];

export function customTone(kind) {
  try {
    const raw = localStorage.getItem('fm.p.customTone.' + kind);
    const obj = raw ? JSON.parse(raw) : null;
    if (!obj || !obj.file) return null;
    return {
      id: obj.id || ('custom-' + kind),
      name: obj.name || 'Tono personalizado',
      file: obj.file,
    };
  } catch (e) {
    return null;
  }
}

export function toneList(kind) {
  const base = (kind === 'call' ? CALL_TONES : MESSAGE_TONES).slice();
  const custom = customTone(kind);
  if (custom && !base.some(function (t) { return t.id === custom.id; })) {
    base.push(custom);
  }
  return base;
}

export function findTone(kind, id) {
  const list = toneList(kind);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

/* URL absoluta: la app usa rutas reales (/app/user/5), así que una ruta
   relativa "tonos/..." se resolvería contra la ruta actual y fallaría. */
export function toneSrc(file) {
  if (!file) return '';
  if (/^(data:|blob:|https?:)/.test(file)) return file;
  return file.charAt(0) === '/' ? file : '/' + file;
}

export function selectedToneSrc(kind) {
  const pref = kind === 'call' ? store.prefs.callTone : store.prefs.messageTone;
  const tone = findTone(kind, pref || 'default');
  return tone ? toneSrc(tone.file) : '';
}

/* Reproduce un tono una vez (preview o aviso de mensaje). Devuelve el
   elemento <audio> para poder detenerlo, o null si es el pitido default. */
export function playToneFile(file, volume) {
  const src = toneSrc(file);
  if (!src) return null;
  try {
    const audio = new Audio(src);
    audio.volume = typeof volume === 'number' ? volume : 0.7;
    audio.play().catch(function () {});
    return audio;
  } catch (e) {
    return null;
  }
}
