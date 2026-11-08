/* platform/cookies.js — capa de cookies de Foxinix.
   Web: el navegador guarda la cookie HttpOnly `fm_rt` (el refresh token).
   NativeScript: httpModule NO tiene cookie jar, así que la app nativa
   guarda el refresh en ApplicationSettings y lo manda en el body.

   Interfaz idéntica en web y NS. */

export const CookieAdapter = {
  /* ¿La plataforma tiene cookie jar (refresh por cookie HttpOnly)? */
  supportsCookies() {
    return true;
  },
};
