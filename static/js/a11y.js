/* Foxinix — accesibilidad (W78): utilidades para lectores de pantalla.
   Funciones puras, sin dependencia de Vue ni del DOM. */

/* Mapa de nombres de emoji (inglés, desde gemoji). Se genera en
   emoji-data.js y se reutiliza aquí para poner nombre a los emojis
   en el aria-label. Cuando no hay nombre, se usa el propio emoji. */
import { DESC } from './emoji-data.js';

/* Regex que coincide con un solo código punto que tiene la propiedad
   Unicode Emoji. Suficiente para agrupar repeticiones consecutivas en
   el aria-label (no pretende parsear secuencias ZWJ complejas). */
const EMOJI_RE = /\p{Emoji}/u;

/* Formatea el texto de un mensaje para lectores de pantalla.
   Agrupa emojis idénticos consecutivos (😊😊😊 → "3 😊") para no
   saturar la lectura. El texto no-emoji se mantiene intacto.
   Devuelve un string plano listo para aria-label. */
export function formatEmojisForA11y(text) {
  if (!text) return '';
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (EMOJI_RE.test(ch)) {
      let count = 1;
      while (i + count < n && text[i + count] === ch && EMOJI_RE.test(text[i + count])) {
        count++;
      }
      const name = DESC[ch] || ch;
      if (count > 1) {
        out.push(count + ' ' + name);
      } else {
        out.push(name);
      }
      i += count;
    } else {
      let j = i + 1;
      while (j < n && !EMOJI_RE.test(text[j])) j++;
      out.push(text.slice(i, j));
      i = j;
    }
  }
  return out.join(' ');
}
