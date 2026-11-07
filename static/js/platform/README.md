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
| `DomAdapter` | `document`, `window`, `navigator` | stubs / medidas de pantalla |
| `ImageAdapter` | `canvas` (reducir + difuminar) | devuelve la URL original |
| `MediaAdapter` | `getUserMedia`, `MediaRecorder`, `AudioContext`, WebRTC | plugin de audio (o «no disponible») |
| `NotificationAdapter` | `Notification` | plugin de notificaciones locales |

`platform/index.js` es el **conmutador**: exporta la versión web. Para compilar
la app nativa se comentan las líneas web y se descomentan las de `nativescript/`
— el resto de la app no se toca.

## La regla (Fase 3.2)

> **Fuera de `platform/`, ningún módulo toca `document`, `window` o `navigator`
> directamente. Todo pasa por un adaptador.**

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
  n=$(grep -c "document\.\|window\.\|navigator\." "$f")
  [ "$n" -gt 0 ] && echo "$n  $f"
done | sort -rn
```

## Adaptadores y qué resuelven

### `DomAdapter`
Todo lo que es "la página": crear elementos, buscar selectores, foco, scroll,
medidas (`getRect`, `getViewportSize`), portapapeles, `confirm`, fullscreen,
tema (variables CSS de `:root`), `history`, service worker, UUID.

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

### `NotificationAdapter`
`isSupported`, `getPermission`, `requestPermission`, `notify`.

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
9. **`Notification`** — plugin de notificaciones locales.
