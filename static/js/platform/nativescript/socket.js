/* platform/nativescript/socket.js — WebSocket para NativeScript.
   NS 9 no trae WebSocket en el core: se usa el plugin
   @master.technology/websockets (Java en Android, Objective-C en iOS).

   El plugin NO implementa la API del navegador al pie de la letra:
     - el constructor es (url, opciones), no (url, protocolos);
     - sólo envía el PRIMER subprotocolo;
     - los eventos se piden con on('message', cb) y el cb recibe un array.

   Este adaptador lo envuelve y devuelve SIEMPRE un socket con la interfaz
   del navegador (send/close/readyState y onopen/onmessage/onclose/onerror),
   para que realtime.js sea el mismo código en web y en NS. */

import NativeWebSockets from '@master.technology/websockets';

export const SocketAdapter = {
  isSupported() {
    return true;
  },
  create(url, protocols, headers) {
    /* El token viaja en X-Foxinix-Token (el servidor lo acepta como
       alternativa al subprotocolo): el plugin sólo manda el 1º. */
    const opts = {
      protocols: protocols && protocols.length ? [protocols[0]] : [],
      headers: Object.assign({}, headers || {}),
      browser: true,
    };
    const raw = new NativeWebSockets(url, opts);

    const sock = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      get readyState() { return raw.readyState; },
      get url() { return raw.url; },
      send(data) {
        try { raw.send(data); } catch (e) {}
      },
      close(code, reason) {
        try { raw.close(code, reason); } catch (e) {}
      },
    };

    raw.on('open', function () {
      if (typeof sock.onopen === 'function') sock.onopen({});
    });
    raw.on('message', function (args) {
      const data = args && args.length > 1 ? args[1] : '';
      if (typeof sock.onmessage === 'function') sock.onmessage({ data: data });
    });
    raw.on('close', function (args) {
      const code = args && args.length > 1 ? args[1] : 1000;
      const reason = args && args.length > 2 ? args[2] : '';
      if (typeof sock.onclose === 'function') sock.onclose({ code: code, reason: reason });
    });
    raw.on('error', function (e) {
      if (typeof sock.onerror === 'function') sock.onerror(e);
    });

    return sock;
  },
};
