/* platform/nativescript/cookies.js — cookies para NativeScript.
   NS no tiene cookie jar: httpModule no guarda ni manda cookies.
   Interfaz idéntica a platform/cookies.js. */

export const CookieAdapter = {
  supportsCookies() {
    return false;
  },
};
