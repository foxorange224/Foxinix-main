/* Foxinix — emojis (W13/W29b/W40): selector estilo Discord.
   Los datos (CATS/CODES/DESC/EMO_FILE) se GENERAN en emoji-data.js
   (scripts/gen-emoji.py: shortcodes gemoji + imágenes Twemoji);
   EMO_FILE_NOTO (imágenes de Google) en emoji-noto-data.js;
   los nombres de búsqueda en español viven en NAMES (emoji →
   palabras clave). FF78/ES2020. */
import { CATS, CODES, DESC, EMO_FILE } from './emoji-data.js';
import { EMO_FILE_NOTO } from './emoji-noto-data.js';
import { store } from './store.js';

/* Nombres de búsqueda (español). No hace falta nombrar todo: los emojis
   sin nombre se encuentran pegando el emoji mismo en el buscador. */
const NAMES = {
  '😀': 'feliz sonrisa cara', '😁': 'dientes sonrisa', '😂': 'llorar risa',
  '🤣': 'risa llorar rofl', '😊': 'sonrisa tierna', '😍': 'enamorado amor',
  '😘': 'beso', '😎': 'lentes genial', '🤔': 'pensar duda',
  '😅': 'sudor sonrisa', '🙃': 'upside down', '😉': 'guiño',
  '🥳': 'fiesta cumpleaños', '😇': 'angel inocente', '🤗': 'abrazo',
  '😴': 'dormir sueño', '🤷': 'encoger hombros', '😛': 'lengua',
  '🤪': 'loco ojos', '😭': 'llorar triste', '😡': 'enojado furioso',
  '🤬': 'tareas caras', '🤯': 'cabeza explota', '😳': 'verguenza',
  '🥵': 'calor', '🥶': 'frio', '😱': 'gritar susto', '😨': 'asustado',
  '😰': 'ansiedad', '😥': 'triste sudor', '😓': 'sudor triste',
  '🤗2': 'abrazo', '🤔2': 'pensar', '🤭': 'risa mano', '🤫': 'silencio shh',
  '😐': 'neutral', '😑': 'sin expression', '😬': 'verguenza dientes',
  '🙄': 'ojos en blanco', '😴2': 'sueno', '🤤': 'baba antojo',
  '😪': 'sueno triste', '😵': 'mareado', '🤢': 'nasea malo',
  '🤮': 'vomitar', '🤧': 'estornudo', '😷': 'barbijo enfermo',
  '🤒': 'fiebre', '🤕': 'vendaje herido', '👍': 'like positivo bien ok',
  '👎': 'dislike mal no', '👌': 'perfecto ok', '✌️': 'victoria paz',
  '🤞': 'dedos cruzados suerte', '🤟': 'te amo rock', '🤘': 'rock cuernos',
  '🤙': 'llamada chill', '👈': 'izquierda', '👉': 'derecha',
  '👆': 'arriba', '👇': 'abajo', '☝️': 'arriba uno', '✋': 'alto mano',
  '🤚': 'mano levantada', '🖐️': 'mano abierta', '👋': 'saludo hola chau',
  '🤝': 'apretón trato', '🙏': 'gracias reza por favor', '💪': 'fuerza musculo',
  '🦾': 'brazo robot', '✍️': 'escribir firma', '💅': 'unas esmalte',
  '👏': 'aplausos bravo', '🙌': 'manos arriba celebrar', '👐': 'manos abiertas',
  '🤲': 'palmas juntas', '🧍': 'persona parada', '🧑': 'persona',
  '👨': 'hombre', '👩': 'mujer', '👴': 'abuelo', '👵': 'abuela',
  '👦': 'chico', '👧': 'chica', '🧒': 'nino', '🧔': 'barba hombre',
  '🧕': 'mujer velo', '👰': 'novia', '🤵': 'novio traje', '💃': 'bailarina',
  '🕺': 'bailarin', '👼': 'angel bebe', '🦸': 'heroe', '🦹': 'villano',
  '👺': 'duende', '🤡': 'payaso fantasma', '👻': 'fantasma',
  '💀': 'calavera muerte', '👽': 'alien ovni', '🤖': 'robot',
  '🫵': 'tu dedo', '🫱': 'mano derecha', '🫲': 'mano izquierda',
  '🫰': 'dedos dinero', '🫶': 'corazon manos', '🦊': 'zorro animal',
  '🐶': 'perro puppy', '🐱': 'gato kitty', '🐭': 'raton', '🐹': 'hhamster',
  '🐰': 'conejo', '🐻': 'oso', '🐼': 'panda', '🐨': 'koala',
  '🐯': 'tigre', '🦁': 'leon', '🐮': 'vaca', '🐷': 'cerdo',
  '🐸': 'rana', '🐵': 'mono', '🐔': 'pollo', '🐧': 'pinguino',
  '🐦': 'pajaro', '🦅': 'aguila', '🦉': 'buho', '🦋': 'mariposa',
  '🐝': 'abeja', '🐞': 'mariquita', '🐢': 'tortuga', '🐍': 'serpiente',
  '🐙': 'pulpo', '🦑': 'calamar', '🦀': 'cangrejo', '🐬': 'delfin',
  '🐳': 'ballena', '🦒': 'jirafa', '🐘': 'elefante', '🦔': 'erizo',
  '🦜': 'loro', '🌵': 'cactus', '🌲': 'arbol', '🌳': 'arbol verde',
  '🌴': 'palmera', '🌸': 'flor cerezo', '🌹': 'rosa', '🌻': 'girasol',
  '🌼': 'margarita', '🌷': 'tulipan', '🌞': 'sol cara', '🌝': 'luna cara',
  '🌛': 'luna media', '🌜': 'luna', '🌑': 'luna nueva', '🌕': 'luna llena',
  '🌙': 'luna creciente', '⭐': 'estrella', '🌟': 'estrella brillante',
  '✨': 'brillos sparkle', '⚡': 'rayo trueno electrico', '🔥': 'fuego fuego caluro',
  '🌈': 'arcoiris', '☁️': 'nube', '❄️': 'nieve frio', '🌊': 'ola mar',
  '💧': 'agua gota', '🍀': 'trebol suerte', '🍁': 'arce otoño',
  '🍂': 'hojas otoño', '🌿': 'hierba planta', '🍏': 'manzana verde',
  '🍎': 'manzana', '🍐': 'pera', '🍊': 'naranja', '🍋': 'limon',
  '🍌': 'banana', '🍉': 'sandia', '🍇': 'uvas', '🍓': 'frutilla fresa',
  '🫐': 'arandanos', '🥝': 'kiwi', '🍅': 'tomate', '🥑': 'palta aguacate',
  '🥦': 'brocoli', '🥕': 'zanahoria', '🌽': 'maiz elote', '🌶️': 'chile picante',
  '🥔': 'papa', '🍞': 'pan', '🥐': 'croissant', '🧀': 'queso',
  '🥚': 'huevo', '🍳': 'huevo frito desayuno', '🥞': 'pancakes',
  '🍕': 'pizza', '🍔': 'hamburguesa', '🌮': 'taco', '🌯': 'burrito',
  '🥙': 'wrap', '🍜': 'ramen fideos', '🍣': 'sushi', '🍥': 'naruto',
  '🍙': 'onigiri', '🍚': 'arroz', '🥮': 'mooncake', '🍩': 'donut',
  '🍪': 'galleta', '🎂': 'pastel cumpleaños', '🍰': 'torta', '🧁': 'cupcake',
  '🍫': 'chocolate', '🍬': 'caramelo', '🍭': 'pirulito', '🍯': 'miel',
  '☕': 'cafe taza', '🍵': 'te mate', '🧃': 'jugo caja', '🥤': 'vaso soda',
  '🍺': 'cerveza birra', '🍷': 'vino', '🥂': 'brindis', '🍸': 'cocktail',
  '🍹': 'trago tropical', '🧊': 'hielo', '🍦': 'helado', '🍧': 'shaved ice',
  '⚽': 'futbol pelota', '🏀': 'basquet', '🏈': 'futbol americano',
  '⚾': 'baseball', '🎾': 'tenis', '🏐': 'voleibol', '🏉': 'rugby',
  '🎱': 'billar 8', '🪀': 'yo yo', '🏓': 'ping pong', '🏸': 'badminton',
  '⛳': 'golf', '🎣': 'pesca', '🎽': 'running camiseta', '🎿': 'esqui',
  '🛹': 'skate', '🏆': 'trofeo ganar', '🥇': 'medalla oro', '🥈': 'medalla plata',
  '🥉': 'medalla bronce', '🎖️': 'medalla', '🏅': 'deporte medalla',
  '🎫': 'ticket entrada', '🎪': 'circo carpa', '🎭': 'teatro mascaras',
  '🎨': 'arte pintura paleta', '🎬': 'cine claqueta', '🎤': 'microfono karaoke',
  '🎧': 'auriculares musica', '🎼': 'partitura', '🎹': 'piano',
  '🥁': 'tambor bateria', '📱': 'celular telefono', '💻': 'laptop computadora',
  '⌨️': 'teclado', '🖥️': 'monitor', '🖨️': 'impresora', '🖱️': 'mouse',
  '💽': 'minidisc', '💾': 'disco guardar', '📀': 'dvd', '📷': 'camara foto',
  '📸': 'camara flash', '📹': 'video camara', '📺': 'tv television',
  '📻': 'radio', '🎙️': 'micro podcast', '⏱️': 'cronometro', '⏰': 'alarma reloj',
  '🔋': 'bateria', '🔌': 'enchufe', '💡': 'idea lampara', '🔦': 'linterna',
  '📕': 'libro rojo', '📗': 'libro verde', '📘': 'libro azul',
  '📙': 'libro naranja', '📚': 'libros estudios', '✏️': 'lapiz',
  '📝': 'nota apuntar', '📌': 'alfiler fijar', '📎': 'clip anexo',
  '🔗': 'link enlace', '🔍': 'lupa buscar', '🔑': 'llave clave',
  '🔨': 'martillo', '🪛': 'destornillador', '🧰': 'caja herramientas',
  '🧲': 'imán', '🚗': 'auto coche', '✈️': 'avion viaje', '🚀': 'cohete espacio',
  '🛸': 'ovni', '🚁': 'helicoptero', '⛵': 'barco vela', '🗺️': 'mapa',
  '🗿': 'moai', '🏠': 'casa', '🏢': 'edificio', '🏥': 'hospital',
  '🏫': 'escuela', '🗽': 'estatua libertad', '❤️': 'corazon amor like',
  '🧡': 'corazon naranja', '💛': 'corazon amarillo', '💚': 'corazon verde',
  '💙': 'corazon azul', '💜': 'corazon morado', '🖤': 'corazon negro',
  '🤍': 'corazon blanco', '🤎': 'corazon cafe', '💔': 'corazon roto',
  '❣️': 'corazon exclamacion', '💕': 'dos corazones', '💞': 'corazones girar',
  '💓': 'corazon latir', '💗': 'corazon creciente', '💖': 'corazon brillo',
  '💘': 'corazon flecha', '💝': 'corazon regalo', '💟': 'corazon decorado',
  '✅': 'check ok bien correcto', '❌': 'x cruz mal error',
  '⭕': 'circulo', '❗': 'exclamacion importante', '❓': 'pregunta duda',
  '⚠️': 'advertencion cuidado', '🚫': 'prohibido no pasar', '💯': 'cien perfecto',
  '💢': 'rabia enojo', '♨️': 'vapor caliente', '🚩': 'bandera roja',
  '🏁': 'bandera cuadros', '🔰': 'principiante', '✳️': 'asterisco',
  '✴️': 'estrella ocho', '❇️': 'destello', '➕': 'mas', '➖': 'menos',
  '➗': 'dividir', '✖️': 'multiplicar', '🟰': 'igual', '➰': 'bucle',
  '➿': 'doble bucle', '🔄': 'recargar girar', '🔁': 'repetir',
  '🔀': 'aleatorio', '🔂': 'repetir uno', '▶️': 'play reproducir',
  '⏸️': 'pausa', '⏹️': 'stop parar', '⏭️': 'siguiente', '⏮️': 'anterior',
  '🔝': 'arriba top', '🔚': 'final', '🔜': 'pronto', '🔙': 'volver',
  '🆗': 'ok boton', '🆕': 'nuevo', '🆒': 'cool', '🆓': 'gratis',
  'ℹ️': 'info informacion', '🅿️': 'estacionamiento parking',
};

/* emoji → código (para títulos y búsqueda) */
const CODE_OF = {};
for (const k in CODES) if (!(CODES[k] in CODE_OF)) CODE_OF[CODES[k]] = k;

/** ':fire:' para mostrar junto a cada emoji (o el emoji si no tiene). */
export function emojiCode(ch) {
  return CODE_OF[ch] ? ':' + CODE_OF[ch] + ':' : ch;
}

/* ---- W40: estilo de emojis (Ajustes → "Estilo de emojis") ----
   'system'  = glyphs de la fuente del sistema (cero descargas: en
               Linux con Noto instalado son los emojis de Google);
   'noto'    = imágenes de Google servidas desde el sitio (PNG);
   'twemoji' = imágenes Twemoji (SVG, como hasta W39). */

/** Estilo activo ('system' | 'noto' | 'twemoji'). */
export function emoStyle() {
  return store.prefs.emo || 'system';
}

/** Id de archivo del emoji para el estilo activo ('' → texto). */
export function emoFile(ch) {
  const st = emoStyle();
  if (st === 'system') return '';
  if (st === 'noto') return EMO_FILE_NOTO[ch] || '';
  return EMO_FILE[ch] || '';
}

/** URL de la imagen del emoji para el estilo activo ('' → texto). */
export function emoSrc(ch) {
  const st = emoStyle();
  if (st === 'system') return '';
  if (st === 'noto') {
    const f = EMO_FILE_NOTO[ch];
    return f ? '/static/emoji-noto/' + f + '.png' : '';
  }
  const f = EMO_FILE[ch];
  return f ? '/static/emoji/' + f + '.svg' : '';
}

/** W65: imagen para MENSAJES cuando el estilo elegido no tiene ese
    emoji. Twemoji cubre 1746 y Noto 3786: en vez de caer a la fuente
    del sistema (mezcla visible), se usa el otro set personalizado.
    Devuelve '' sólo en modo nativo o si no hay ninguna imagen. */
export function emoAnyFile(ch) {
  if (emoStyle() === 'system') return '';
  return emoFile(ch) || EMO_FILE_NOTO[ch] || EMO_FILE[ch] || '';
}

export function emoAnySrc(ch) {
  if (emoStyle() === 'system') return '';
  const f = emoFile(ch);
  if (f) return emoSrc(ch);
  /* El set alternativo conserva el glow "personalizado" del mensaje. */
  if (EMO_FILE_NOTO[ch]) return '/static/emoji-noto/' + EMO_FILE_NOTO[ch] + '.png';
  if (EMO_FILE[ch]) return '/static/emoji/' + EMO_FILE[ch] + '.svg';
  return '';
}

/** W41: ¿el texto es UN SOLO emoji del set? (el mensaje se pinta
    grande, estilo sticker — igual que al enviar un sticker). W42: se
    ignoran espacios alrededor (el autocompletado ":fire:" a veces
    deja un espacio suelto). */
export function isOneEmoji(txt) {
  return !!(txt && EMO_FILE[txt.trim()]);
}

/* W61: 1–3 emojis (con o sin espacios entre ellos) → burbuja grande.
   Se buscan las secuencias MÁS LARGAS del set (ZWJ, tonos de piel,
   banderas…) para que un emoji compuesto cuente como UNO. */
const EMO_KEYS = Object.keys(EMO_FILE)
  .concat(Object.keys(EMO_FILE_NOTO))
  .filter(function (ch, i, arr) { return arr.indexOf(ch) === i; })
  .sort(function (a, b) { return b.length - a.length; });
export function isEmojiBurst(txt) {
  const s = String(txt == null ? '' : txt).trim();
  if (!s) return false;
  let i = 0;
  let count = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (/\s/.test(ch)) { i++; continue; }
    let hit = '';
    for (let k = 0; k < EMO_KEYS.length; k++) {
      const key = EMO_KEYS[k];
      if (key && s.startsWith(key, i)) { hit = key; break; }
    }
    if (!hit) return false;
    count++;
    if (count > 3) return false;
    i += hit.length;
  }
  return count > 0;
}

/* W30b: ¿ya se precargó el lote de SVG en esta sesión de pestaña? */
let _prefetched = false;

/* Precarga los SVG del selector en idle, en lotes escalonados. El SW
   (v57) los sirve cache-first; esto solo evita el vacío azul de la
   PRIMERA apertura en conexiones lentas. Guardas: solo con sesión
   iniciada, sin ahorro de datos y una vez por pestaña; si la
   conexión se cae se continúa al volver. */
export function prefetchEmojis() {
  if (_prefetched) return;
  /* W40: en estilo 'system' no hay nada que precargar — los glyphs
     son del sistema; NO se marca como hecho para que un cambio
     posterior de estilo sí lance su lote. */
  const st = emoStyle();
  if (st === 'system') return;
  const conn = navigator.connection;
  if (conn && conn.saveData) return;
  _prefetched = true;
  const files = [];
  const seen = {};
  const push = function (f) {
    if (f && !seen[f]) { seen[f] = 1; files.push(f); }
  };
  if (st === 'noto') {
    for (const ch in EMO_FILE_NOTO) {
      push('/static/emoji-noto/' + EMO_FILE_NOTO[ch] + '.png');
    }
  } else {
    for (const ch in EMO_FILE) {
      push('/static/emoji/' + EMO_FILE[ch] + '.svg');
    }
  }
  let i = 0;
  const BATCH = 24;          // SVG por franja de idle
  const GAP = 220;           // ms entre franjas (no saturar la red)
  const idle = window.requestIdleCallback || function (cb) {
    return setTimeout(cb, 400);
  };
  function slice() {
    if (!navigator.onLine) { setTimeout(slice, 3000); return; }
    const end = Math.min(i + BATCH, files.length);
    for (; i < end; i++) {
      /* El SW los cachea; el resultado no interesa (best-effort). */
      fetch(files[i], { cache: 'force-cache' }).catch(function () {});
    }
    if (i < files.length) setTimeout(function () { idle(slice); }, GAP);
  }
  idle(slice);
}

/* Índice por primer codepoint → candidatos del más largo al más corto
   (secuencias ZWJ como 👨‍👩‍👧 y banderas se reconocen enteras). */
const EMO_FIRST = {};
function addEmojiKey(ch) {
  const cp = ch.codePointAt(0);
  if (!EMO_FIRST[cp]) EMO_FIRST[cp] = [];
  if (EMO_FIRST[cp].indexOf(ch) < 0) EMO_FIRST[cp].push(ch);
}
/* W65: Noto incluye ~2040 emojis que Twemoji no tiene. El troceador
   debe reconocerlos todos; el render elige la imagen disponible. */
for (const ch in EMO_FILE) addEmojiKey(ch);
for (const ch in EMO_FILE_NOTO) addEmojiKey(ch);
for (const k in EMO_FIRST) {
  EMO_FIRST[k].sort(function (a, b) { return b.length - a.length; });
}

/** Trocea `text` en segmentos: {t} de texto o {t, e} de emoji (e = id
    de archivo Twemoji). El texto plano se manda tal cual (sin riesgo
    de XSS: nada va por v-html). */
export function splitEmojis(text) {
  const out = [];
  if (!text) return out;
  let buf = '';
  const flush = function () {
    if (buf) { out.push({ t: buf }); buf = ''; }
  };
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const cands = EMO_FIRST[cp];
    let hit = '';
    if (cands) {
      for (let c = 0; c < cands.length; c++) {
        if (text.substr(i, cands[c].length) === cands[c]) { hit = cands[c]; break; }
      }
    }
    if (hit) {
      flush();
      /* W40: el segmento lleva el CARÁCTER (no el archivo): el
         render decide por el estilo activo si es imagen o texto. */
      out.push({ t: hit, e: hit });
      i += hit.length;
    } else {
      buf += text.charAt(i);
      i += 1;
    }
  }
  flush();
  return out;
}

/** Convierte ":código:" suelto del texto en el emoji (al enviar/editar). */
export function shortcodesToEmoji(text) {
  if (!text || text.indexOf(':') < 0) return text;
  return text.replace(/:([A-Za-z0-9_+-]{1,64}):/g, function (all, code) {
    const ch = CODES[code.toLowerCase()];
    return ch || all;
  });
}

/** Autocompletado del composer: códigos que empiezan con `prefix`. */
export function emojiCodesPrefix(prefix, max) {
  const out = [];
  if (!prefix) return out;
  const lim = max || 8;
  for (const k in CODES) {
    if (k.indexOf(prefix) === 0) {
      out.push({ code: k, ch: CODES[k] });
      if (out.length >= lim) break;
    }
  }
  return out;
}

const RECents_KEY = 'fm.emo.recent';

export function emojiCats() {
  return CATS;
}

export function emojiCat(id) {
  for (let i = 0; i < CATS.length; i++) {
    if (CATS[i].id === id) return (CATS[i].data || '').split(/\s+/);
  }
  return [];
}

export function emojiRecent() {
  try {
    const raw = localStorage.getItem(RECents_KEY) || '';
    return raw ? raw.split(',') : [];
  } catch (e) {
    return [];
  }
}

export function emojiPush(ch) {
  try {
    const arr = emojiRecent().filter(function (x) { return x !== ch; });
    arr.unshift(ch);
    localStorage.setItem(RECents_KEY, arr.slice(0, 32).join(','));
  } catch (e) {}
}

/* Búsqueda por nombre (español), por :código: o por el propio carácter. */
export function emojiSearch(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  const word = q.replace(/^:+|:+$/g, '');   // ':fire' o 'fire:' → 'fire'
  const out = [];
  const seen = {};
  for (let c = 1; c < CATS.length; c++) {   // 0 = recientes: no se busca
    const list = (CATS[c].data || '').split(/\s+/);
    for (let i = 0; i < list.length; i++) {
      const ch = list[i];
      if (!ch || seen[ch]) continue;
      const name = NAMES[ch] || '';
      const code = CODE_OF[ch] || '';
      const dsc = DESC[ch] || '';       // W29b: descripción gemoji (EN)
      if (ch === q ||
          (word && ((name && name.indexOf(word) >= 0) ||
                    (dsc && dsc.indexOf(word) >= 0) ||
                    (code && code.indexOf(word) === 0)))) {
        seen[ch] = true;
        out.push(ch);
      }
    }
  }
  return out;
}

/* ---- reacciones más usadas (W17): el orden de los 12 chips rápidos se
   aprende del uso. Cada reacción suma un punto (fm.react.counts) y al
   usarla sube de puesto. Los no usados conservan el orden base. ---- */

const RACT_KEY = 'fm.react.counts';
const RACT_BASE = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🥰', '😅', '😉', '🤝'];

let ractCounts = {};
try {
  ractCounts = JSON.parse(localStorage.getItem(RACT_KEY) || '{}') || {};
} catch (e) { ractCounts = {}; }

/* Vue existe como global (vendor). El objeto reaccional hace que al
   sumar un punto se reordene la barra sin recargar. */
const ractVer = Vue.reactive({ n: 0 });

/** Registra el uso de una reacción y la sube de puesto. */
export function reactBump(ch) {
  if (!ch) return;
  ractCounts[ch] = (ractCounts[ch] || 0) + 1;
  try {
    localStorage.setItem(RACT_KEY, JSON.stringify(ractCounts));
  } catch (e) {}
  ractVer.n++;
}

/** Los n emojis de reacción ordenados por uso (desc; empate = orden base). */
export function reactRank(n) {
  void ractVer.n;                        // dependencia reactiva
  const pool = RACT_BASE.slice();
  for (const k in ractCounts) {
    if (pool.indexOf(k) < 0) pool.push(k);
  }
  const out = pool.slice();
  out.sort(function (a, b) {
    const ca = ractCounts[a] || 0;
    const cb = ractCounts[b] || 0;
    if (ca !== cb) return cb - ca;
    const ia = RACT_BASE.indexOf(a);
    const ib = RACT_BASE.indexOf(b);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return pool.indexOf(a) - pool.indexOf(b);
  });
  return out.slice(0, n || RACT_BASE.length);
}
