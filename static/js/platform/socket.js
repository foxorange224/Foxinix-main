/* platform/socket.js — capa de WebSocket de Foxinix.
   Web: el WebSocket del navegador.
   NativeScript: el plugin @master.technology/websockets (no hay WS en el
   core de NS).

   La interfaz que ve el resto de la app es SIEMPRE la del navegador:
   new → socket.send() / socket.close() / socket.readyState y los
   manejadores socket.onopen / onmessage / onclose / onerror. */

export const SocketAdapter = {
  /* ¿Hay WebSocket en esta plataforma? */
  isSupported() {
    return typeof WebSocket !== 'undefined';
  },
  /* Abre un socket. `protocols` es la lista de subprotocolos (el token
     va en el 2º). `headers` son cabeceras extra (NS: el token viaja
     aquí porque el plugin sólo manda el primer subprotocolo). */
  create(url, protocols, headers) {
    if (!this.isSupported()) return null;
    /* En el navegador las cabeceras extra no se pueden poner en el
       handshake: el token va como subprotocolo (W14). */
    return new WebSocket(url, protocols);
  },
};
