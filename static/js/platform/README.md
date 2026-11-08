# platform/ — la capa que separa Foxinix del navegador

## Qué es esto

`platform/` es la **frontera** entre el código de la app (lo que hace Foxinix)
y el navegador (document, window, navigator, localStorage, canvas, audio…).

Cada adaptador tiene **dos implementaciones**:

| Adaptador | Web (`platform/X.js`) | NativeScript (`platform/nativescript/X.js`) |
|---|---|---|
| `HttpClient` | `fetch` | `@nativescript/core/http` |
| `StorageAdapter` | `localStorage` | `ApplicationSettings` |
| `FileAdapter` | `Blob`, `URL.createObjectURL`, `<a download>` | `FileSystem`/`knownFolders` |
| `DomAdapter` | `document`, `window`, `navigator`, `location`, `history` | stubs / medidas de pantalla |
| `ImageAdapter` | `Image`, `canvas` (reducir + difuminar) | `ImageSource.fromUrl` (tamaño) |
| `MediaAdapter` | `getUserMedia`, `MediaRecorder`, `AudioContext`, WebRTC | plugin de audio (o «no disponible») |
| `NotificationAdapter` | `Notification` | plugin de notificaciones locales (enganche) |
| `CookieAdapter` | `document.cookie` | no hay cookie jar (modo «legado») |
| `SocketAdapter` | `WebSocket` | `@master.technology/websockets` |

`platform/index.js` es el **conmutador**: exporta la versión web. Para compilar
la app nativa, `native/tools/sync-core.mjs` sustituye cada archivo por su
versión de `platform/nativescript/` — el resto de la app no se toca.

## La regla (Fase 3.2 / 3.3)

> **Fuera de `platform/`, ningún módulo toca `document`, `window`, `navigator`,
> `location` ni `history` directamente. Todo pasa por un adaptador.**

Además, los módulos que comparten el núcleo con la app nativa (los que
`native/tools/sync-core.mjs` copia a `native/app/core/`) tampoco usan
`Image`, `URL`, `fetch`, `Blob`, `File` ni `IntersectionObserver` sin pasar
por el adaptador correspondiente.

### Única excepción: los scripts pre-pintado

`boot.js` y `theme-detect.js` son **scripts clásicos** (no módulos) que corren en
`<head>` antes del primer pintado, para que el tema no parpadee. Los módulos se
difieren, así que no pueden usar los adaptadores. Tocan el DOM a propósito.

En NativeScript **no existen**: la app nativa aplica el tema leyendo
`ApplicationSettings`.

### Cómo se verifica

```bash
# debe devolver SOLO platform/, boot.js y theme-detect.js
for f in $(find landing/static/js -name '*.js'); do
  n=$(grep -c "document\.\|window\.\|navigator\.\|location\.\|history\." "$f")
  [ "$n" -gt 0 ] && echo "$n  $f"
done | sort -rn
```

```bash
# el núcleo nativo debe estar al día
cd native && npm run sync:check
```

## Adaptadores y qué resuelven

### `DomAdapter`
Todo lo que es "la página": crear elementos, buscar selectores, foco, scroll,
medidas (`getRect`, `getViewportSize`), portapapeles, `confirm`, fullscreen,
tema (variables CSS de `:root`), `location`/`history`, `absoluteUrl`,
service worker, UUID, `IntersectionObserver`.

En NS devuelve `null`/no-ops para lo que no existe y medidas reales de
pantalla para lo que sí (`Screen.mainScreen`).

### `MediaAdapter`
Micrófono y cámara (`getUserMedia`), grabación (`MediaRecorder`), análisis de
audio (`AudioContext`), compartir pantalla (`getDisplayMedia`), lista de
dispositivos y WebRTC (`RTCPeerConnection`).

En NS, sin plugin, todo devuelve «no disponible» y la app **avisa al usuario**
en vez de romperse.

### `ImageAdapter`
`makeSmallDataUrl(url, pos)` — reduce una imagen a 48×27 para el banner
difuminado de las llamadas. En NS devuelve la URL original (el difuminado
queda para cuando haya plugin de imagen).

`preload(url)` y `probeSize(url)` — precarga y medida natural de una imagen.
En NS usan `ImageSource.fromUrl` (mismo tamaño, sin canvas).

### `NotificationAdapter`
`isSupported`, `getPermission`, `requestPermission`, `notify`.
En NS el notificador es un **enganche** (`setNotifier`): el plugin no se
importa en caliente para que el bundle compile aunque no esté instalado.

### `CookieAdapter`
`supportsCookies`, `get`, `set`. En NS **no hay cookie jar**, así que
`api.js` entra en modo «legado»: guarda el refresh en el dispositivo y lo
manda en el cuerpo del `POST /auth/refresh`.

### `SocketAdapter`
`create(url, protocols, headers)` devuelve siempre un socket con la interfaz
del navegador (`send`, `close`, `readyState`, `onopen`, `onmessage`, `onclose`,
`onerror`).

- **Web**: el `WebSocket` del navegador; el token viaja como subprotocolo.
- **NS**: `@master.technology/websockets`. El plugin sólo envía el **primer**
  subprotocolo, así que el token viaja en la cabecera `X-Foxinix-Token`
  (el servidor la acepta además del subprotocolo y del `?token=`).

## Qué falta para la app nativa

Estas barreras siguen abiertas (no se pueden resolver solo con adaptadores):

1. **`v-html`** (`BioText`) — en NS hay que construir texto enriquecido nativo.
2. **Teleport** — los modales flotantes hay que rehacerlos con `Frame`/`ModalView`.
3. **`position: fixed` + `clampPanel`** — hay que usar layouts nativos.
4. **`document.querySelector` sobre clases CSS** — en NS no hay clases: hay que
   llevar un mapa "elemento → vista" (refs de Vue) o un registro de vistas.
5. **`<input type="file">`** — hay que usar el selector de archivos nativo.
6. **`AudioContext` / `MediaRecorder`** — plugin de audio.
7. **`RTCPeerConnection`** — WebRTC está fuera de la v1 móvil (o plugin).
8. **Sprite SVG** (`<use href="#i-x">`) — hay que convertirlo en iconos
   nativos o en fuentes de iconos.
9. **Notification push** — plugin de notificaciones push (las locales ya
   tienen enganche).
