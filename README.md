![Foxinix](https://foxinix.qzz.io/assets/logo.svg)

**Foxinix** es un centro de mensajería: **cliente web** (Vue 3 sin build, PWA) + **portada pública**, todo servido por procesos propios (sin Docker). Liviano: corre bien incluso en máquinas muy modestas (objetivo mínimo: Mypal 78 / Firefox 78, 1 GB de RAM).

**Enlaces rápidos**

| | |
|---|---|
| Sitio | <https://foxinix.qzz.io> — portada; el chat está en `/app` y el registro en `/register` |
| Legal | [Privacidad](https://foxinix.qzz.io/privacy) · [Términos](https://foxinix.qzz.io/terms) |
| API | <https://api.foxinix.qzz.io> — REST + WebSocket (`wss://api.foxinix.qzz.io/ws`) |
| Media | <https://cdn.foxinix.qzz.io> — CDN de imágenes, voz y archivos (URLs firmadas) |
| Comunidad | [Discord](https://www.discord.com/invite/r9v67gFRcp) · [YouTube](https://www.youtube.com/channel/UCRv3ZZXkuPXaKSe588W1L9A) |
| Releases | <https://github.com/foxorange224/foxinix-app/releases> — APK y escritorio |

> El cliente Python + Qt6 (PySide6/QML) de las fases 2-6 quedó **reemplazado por la web** y vive congelado en `client/` como referencia. La dirección actual es web + PWA (notificaciones del navegador, Ctrl+V, drag&drop) y un **envoltorio Tauri** en `desktop/` que carga la misma web para tener instalador de escritorio sin mantener dos interfaces.

## Estado

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Scaffold + contrato API | ✅ `docs/API.md` |
| 1 | Servidor core (auth, chats, WS, media, systemd) | ✅ desplegado en firuserver |
| W1 | Frontend web: login/registro/perfil/verificación/recuperación | ✅ E2E local (`tests/web_e2e.py`) |
| W2 | Chat list + conversación + realtime (mensajes, typing, presencia, ✓✓) | ✅ E2E local (`tests/chat_ui_test.py`) |
| W3 | Media (imágenes, archivos, notas de voz, avatares), reacciones, responder, grupos | ✅ E2E local (`tests/w3_ui_test.py`) |
| W4 | Temas (claro/oscuro/acento/fondo) + PWA (manifest + service worker) | ✅ E2E local (`tests/w4_ui_test.py`) |
| W5 | Pase de rendimiento en condiciones XP + QA | ✅ auditoría FF78 (`check-js.mjs`) + 4 suites |
| W6 | Panel de usuario, perfil editable, ajustes (cuenta/apariencia/chat/atajos) y salidas seguras | ✅ E2E local (`tests/w6_ui_test.py`, 5 suites) + desplegado |
| W7 | Reacciones sincronizadas (1/usuario), emojis en el composer, menús contextuales, panel derecho = info del chat (miembros) y ventanas flotantes de perfil | ✅ E2E local (5 suites) + desplegado |
| W8 | Config solo en el engranaje (Cuenta = última pestaña; salir escondido ahí), perfil = foto/nombre/estado/bio, bios con markdown seguro, imágenes siempre WebP + lightbox con zoom, reproductor de audio propio, editar/eliminar mensajes, logo Foxinix nuevo, buscador "Buscar chats y grupos", cambiar correo/contraseña en ventanas propias | ✅ E2E local (5 suites) + desplegado |
| W9 | Restyle estilo Discord: paleta de capas grises con acento naranja Foxinix, burbujas radio 8px con meta 12px, toolbar de acciones flotante, filas de chats sin separadores, Ajustes con nav lateral agrupada (Cuenta última), estados de perfil con puntos Discord (En línea/Ausente/No molestar/Invisible) | ✅ E2E local (5 suites) + desplegado |
| W10 | Sin "Sin estado" (default En línea), iconos regenerados limpios (favicon + avatar), Ajustes con tamaño fijo (scroll interno por pestaña), español neutro en toda la app (sin voseo), **i18n ES/EN** (`js/i18n.js`, sección "Idioma de la interfaz" en Apariencia), grupo de Ajustes renombrado a "Preferencias" | ✅ E2E local (5 suites) + desplegado |
| W11 | **Media y subidas (seguridad + UX)**: rate limit de mensajes ~3/5 s por usuario (ráfaga de 5; `429` + `retry_after`; la idempotencia gana), URLs de media firmadas `/media/profile/{slug}.webp` y `/media/file/{slug}.webm` (`?exp=&sig=` HMAC, slug aleatorio de 32 hex; el token de cuenta ya no viaja en ninguna URL), subida con **círculo de progreso** en la burbuja (cancelar/reintentar, sin toast "Subiendo…"), videos adjuntables con player inline, caption en imagen/video, Ctrl+V pegar y arrastrar-y-soltar, botón de descarga en el lightbox | ✅ E2E local (5 suites) + desplegado |
| W12 | **Pulido estilo WhatsApp**: palomitas de 3 estados (✓ enviado · ✓✓ recibido por WS/fetch · ✓✓ azul leído; `last_delivered_seq` + evento WS `delivered` + semillas `peer_*_seq` en `GET /chats`), hora y palomitas en **blanco o negro automático** según la luminancia del fondo real de la burbuja (`--meta-mine`/`--meta-you`), hora visible **solo en el último mensaje del minuto** de cada emisor, **sin toasts de éxito** por acciones propias (solo quedan errores), bio y estado **borrables** vaciando el campo (`''` ≠ `None` en `ProfileIn`) | ✅ E2E local (5 suites) + desplegado |
| W13 | **WhatsApp plus**: selector de **emoji completo** (`js/emoji.js`: 6 categorías + búsqueda por nombre en español + recientes; en composer y en reacciones — **fix**: al botón de categorías le faltaba el `v-for`, el picker no abría en ningún navegador), **onda de voz** real (picos vía `AnalyserNode` al grabar → `peaks`/`dur` en el server; barra con progreso y clic para buscar posición; **fix del "0:00" eterno**: los WebM de `MediaRecorder` no traen duración y ahora se guarda la real; **notas viejas sin `dur`** resuelven su duración al reproducir vía `decodeAudioData`), **buscar dentro del chat** (panel derecho, doblegte de acentos —"cafe" encuentra "café"—, salto al mensaje con destello), **fijar/silenciar chats** (por miembro, orden fijados-primero, silenciado sin sonido/notificación y badge atenuado), **reenviar mensajes** (modal con lista+buscador, etiqueta "Reenviado", archivo compartido) y **puntos de presencia** (siempre hay puntito con usuario: verde en línea, ámbar/rojo por preset, **gris si está desconectado o invisible**; grupos sin punto) | ✅ E2E local (8 suites: `chat_ui_test`, `w6`, `w4`, `w3`, `web_e2e`, `w11_smoke`, `w13_smoke`, `w13_ui_test`) + desplegado |
| W14 | **Cifrado en reposo (SQLCipher)**: la DB de producción queda cifrada con SQLCipher (clave `FOXMSG_DB_KEY` en `.env`, driver `sqlcipher3-binary`, migración con `sqlcipher_export` + verificación de conteos/cipher_version y borrado del backup plano); dev/local sigue con SQLite en claro y las mismas 8 suites. Fix extra: fijar/silenciar re-resuelve el chat tras el `await` (race con reconexión WS) | ✅ desplegado |
| W50 | **Descargas persistentes + escritorio**: caché de medios separado del shell (sobrevive a las actualizaciones, poda por 512 MB/500 entradas, migra lo ya cacheado), descargas explícitas en `foxinix-downloads-v1` + IndexedDB con lista en Ajustes → Descargas, y app Tauri (`desktop/`) que carga la misma web con instaladores `.deb`/`.rpm`/`.AppImage` | ✅ local + Tauri probado |
| W54 | **Cáscara móvil tipo app** (la misma web que carga el APK): app bar propio con ＋ limpio y avatar a juego, barra inferior Chats/Personas/Ajustes, chat a pantalla completa, llamadas y acciones del chat en un menú ⋮, Ajustes como pestaña con la barra inferior visible, login sin tarjeta flotante y burbujas/composer con radios táctiles. El escritorio y Mypal 78 conservan la interfaz anterior | ✅ E2E local (`tests/mobile_ui_test.py`) |
| W54c | **Pulido móvil**: menús contextuales como hoja con fondo oscurecido y cabecera (foto + nombre) para chats/grupos, visor con controles fuera de la imagen, zoom con dos dedos y arrastre, editor de foto a pantalla completa con pinza/giro (sin barra ni botón Girar), tema claro legible dentro de las burbujas, sin rectángulo azul al tocar, logos del sitio en Chats/Personas/Ajustes, safe-area en barras y modales, e iconos Tauri/Android con padding y fondo propio | ✅ E2E local (`tests/mobile_ui_test.py`, `tests/w27_ui_test.py`) |
| W54d | **Teclado, micrófono y avisos**: el composer queda sobre el teclado de Android (`adjustResize`, inset nativo y `visualViewport`), permiso `MODIFY_AUDIO_SETTINGS` para que el WebView pueda pedir el micrófono, y las notificaciones muestran el texto del mensaje o “Nuevo mensaje” | ✅ Micrófono confirmado en el APK; E2E móvil (`tests/mobile_ui_test.py`) |
| W55 | **Notificaciones nativas de Android**: el WebView no implementa Web Notifications, así que la APK expone un puente `FoxinixAndroid` que crea un canal de mensajes, pide el permiso `POST_NOTIFICATIONS` de Android 13+, respeta el sonido/silenciado, mantiene el WebSocket activo en segundo plano y abre la app al tocar el aviso; Ajustes muestra el estado nativo | ✅ E2E móvil con puente simulado (`tests/mobile_ui_test.py`) + APK v0.1.5 |
| W56 | **Pulido Android y estados**: inset nativo de la barra de gestos para que la barra inferior y el compositor no queden debajo; avisos con foto del remitente + badge de Foxinix (icono blanco y launcher como respaldo); No molestar silencia sonido/avisos salvo menciones directas; estados En línea/Ausente/No molestar/Invisible con luna, barra y aro, y teléfonos de color en el selector móvil; animaciones de carga a velocidad normal con “reducir movimiento” | ✅ E2E móvil (`tests/mobile_ui_test.py`) + APK v0.1.6 |
| W57 | **Enlaces de avisos y descargas Android**: tocar un aviso abre el chat y el mensaje exactos (también en arranque frío); contador rojo de no leídos en el botón atrás; el APK oculta el WebView en segundo plano sin cortar la WebSocket; estados con aro del color del tema y luna/barra; renombrar grupos para owner/admin; caché de imágenes sin descargas repetidas; descargas nativas en `Downloads/Foxinix` con popups animados y permisos de almacenamiento; descarga automática por tipo en Wi-Fi/datos; iconos de descarga en medios y archivos; logos SVG inline | ✅ E2E local (`chat_ui_test.py`, `mobile_ui_test.py`, `w23_ui_test.py`, `w27_ui_test.py`, `w38_test.py`, `w53_test.py`) + APK v0.1.7 |
| W58 | **Descargas en la app, permisos al entrar y perfil con estado en vivo**: descargas automáticas a los datos de la app en Android/PC (web o nativa), con copia pública en `Downloads/Foxinix` solo al pulsar “Guardar en el dispositivo”; Ajustes → Descargas agrupadas por categoría con conteo, tamaño, Abrir y Eliminar, y “Descargar · tamaño”/“Descargado · tamaño” siempre visible (ya no se abre una pestaña al descargar); onboarding de micrófono/cámara/notificaciones/almacenamiento con “Conceder”/“Saltar por ahora” y revisión posterior en Ajustes; perfil con portada, avatar solapado, estado en burbuja citada y menú tipo Discord (presets + mensaje propio, solo en tu perfil); luna amarilla sobre relleno del tema en todos los badges y desconectado del mismo tamaño que en línea; el estado se propaga en vivo a lista, miembros, Personas y perfiles abiertos | ✅ E2E local (`tests/w58_test.py` + `chat_ui_test.py`, `w6_ui_test.py`, `w27_ui_test.py`, `w36_test.py`, `mobile_ui_test.py`) + APK v0.1.8 |
| W59 | **Descargas de verdad, perfil y @usuario**: un solo control por adjunto (“Descargar · tamaño” ↔ “Descargado · tamaño”) que guarda solo en los datos de la app y nunca abre pestañas; “Guardar en el dispositivo” sigue siendo la única exportación a `Downloads/Foxinix`; automáticas por Wi-Fi (activadas por defecto) y datos móviles (apagadas por defecto), con migración de las preferencias W58; avatar montado sobre la portada (también en el editor) y PNG transparentes sin relleno; botón de bajar anclado al compositor, avisos/llamada y barras fuera del área de navegación de Android; iconos de barra de estado/navegación oscuros en tema claro y claros en oscuro; cambio de @usuario con contraseña actual, aviso explícito y espera de 12 h aplicada en el servidor | ✅ E2E local (`tests/w59_test.py`, `tests/w58_test.py`) + APK v0.1.9 |
| W67 | **Retirada completa del cifrado de extremo a extremo**: la app dejó de cifrar y se quitó toda su UI (aviso del panel de info, "cifrado pendiente" del composer, modal del código de verificación y sello del arranque/landing). Desaparecieron `js/e2e.js` y todo su rastro: endpoints `PUT /api/users/me/e2e-key`, `GET /api/users/{u}/e2e-key` y `POST /api/chats/{id}/e2e-demigrate`, bucket `DEMIGRATE`, campo `e2e` en `message_out` / `SendIn` / `EditIn`, columnas `e2e_iv`/`e2e_ct` y tabla `e2e_keys` (la migración de `db.py` las elimina también en bases existentes vía `_drop_column`). El texto viaja siempre en claro | ✅ `scripts/check-js.mjs` + suites `w29`, `w37`, `w61`, `w6` |
| W100 | **Avisos del sistema en la app nativa (NativeScript)**: la app nativa (NativeScript 9 + Vue 3, con el mismo núcleo de lógica que la web) muestra los mensajes nuevos como **notificaciones del sistema** con `@nativescript/local-notifications`: canal "Foxinix", icono de la marca, sonido si el usuario lo tiene activado, permiso `POST_NOTIFICATIONS` de Android 13+ pedido una sola vez al arrancar (revisable en Ajustes, con botón para abrir los ajustes del sistema) y, al tocar el aviso, se abre el chat y el mensaje exactos (también con la app cerrada). El núcleo distingue "app en segundo plano" (`Application.suspendEvent`) para no avisar con la pantalla a la vista | ✅ test nativo contra la API real (76 PASS / 0 FAIL) + APK debug construido |
| W101 | **Servicio en primer plano en la app nativa (sin Firebase)**: el WebSocket de la app nativa vive en el runtime de JS, así que Android lo congelaba con la app en segundo plano y los avisos no llegaban. Ahora hay un servicio en primer plano propio (`FoxinixService.java`, `START_STICKY`) que se arranca al salir de la app y se para al volver; el aviso del servicio va en un canal de importancia baja (silencioso) y, en Android 14+, usa el tipo `specialUse` con su subtipo y los permisos `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_SPECIAL_USE` | ✅ test nativo contra la API real (80 PASS / 0 FAIL) + APK debug construido con el servicio en el manifest *merged* |
| W102 | **La imagen se ve dentro de la burbuja (app nativa)**: en la app nativa las imágenes llegaban como texto ("🖼 Imagen"). Ahora la imagen se muestra **dentro de la burbuja**, con su pie de foto y su horario; la caja conserva la proporción real que manda el server (`media.width`/`media.height`, tope 220×300) y la burbuja pide la **miniatura** del servidor (`?thumb=1`, la firma HMAC cubre sólo el slug, así que sigue valiendo). Al tocarla se abre un **visor a pantalla completa** con el original y el pie de foto. Los cálculos viven en `native/app/img.ts` (testables en Node) y el visor es una vista nativa propia, enrutada en `App.vue` | ✅ test nativo contra la API real (91 PASS / 0 FAIL) + APK debug construido (bundle con la imagen en la burbuja y el visor) |

## Estructura

```
chat/
├── landing/               # sitio público (se sirve tal cual desde el checkout)
│   ├── index.html         #   portada
│   ├── styles.css         #   portada + páginas legales (tema claro/oscuro)
│   ├── theme.js           #   tema antes del 1er pintado (fm.theme o el del navegador)
│   ├── privacy.html       #   se sirve en /privacy (terms.html → /terms; los .html dan 301)
│   ├── app|login|register.html  # shells de la SPA (mismo index, rutas /app /login /register)
│   ├── assets/            #   logo, favicon, og.png de la portada
│   ├── static/            #   SPA: css/, js/ (views/), vendor/, gifs…
│   └── sw.js              #   PWA: shell + cachés separadas de medios/descargas
├── server/                # FastAPI + WebSockets + SQLite
│   ├── app/               #   config, db, security, mailer, realtime, cleanup
│   │   └── routers/       #   auth, users, chats, media, ws
│   ├── web/               #   shell de la SPA que sirve el API en "/" + emoji/ y tonos/ (compartidos con la portada)
│   ├── landing_main.py    #   servidor de la portada (8844 → landing-server.service)
│   ├── deploy/            #   unidades systemd
│   ├── tests/             #   e2e.sh, ws_test.py, cleanup_test.py
│   └── requirements.txt
├── client/                # PySide6 + QML — CONGELADO (superseded por server/web)
├── desktop/               # Tauri 2: instalador de escritorio que carga la misma web
├── native/                # app NATIVA (NativeScript 9 + Vue 3): mismo núcleo que la web
│   ├── app/               #   vistas nativas + pegamento (fox.ts, notifier.ts, service.ts)
│   ├── tools/             #   sync-core.mjs (copia el núcleo), test-core.mjs, stubs de NS
│   └── App_Resources/     #   iconos, splash y recursos nativos (+ el servicio Java)
├── tests/                 # web_e2e.py (E2E de la UI vía Firefox headless + BiDi)
├── docs/                  # API.md (contrato)
└── scripts/               # install-server.sh, remote-setup.sh, shot.py, check-js.mjs
```

## Sitio público (landing/)

- **Sin build ni dependencias**: HTML/CSS/JS planos, pensados también para Firefox 78 (Mypal).
- **Tema responsivo**: `theme.js` corre antes del primer pintado y aplica `data-theme` según la preferencia guardada por la app (`fm.theme` en localStorage: `light`/`dark`/`black`) o, si aún no hay, el modo del navegador (`prefers-color-scheme`); los cambios se propagan en vivo entre pestañas.
- **URLs limpias**: la legal se sirve en `/privacy` y `/terms`; los viejos `.html` responden `301`.
- **PWA**: `sw.js` precachea el shell (`foxinix-shell-*`) y mantiene cachés separadas de medios y descargas.
- Se sirve desde el checkout con `server/landing_main.py` (servicio `landing-server`, puerto 8844): el HTML va siempre `no-cache, must-revalidate` y el CSS/JS/imagenes usa la caché del CDN.

## Cliente web

```bash
cd server && .venv/bin/uvicorn app.main:app --port 8899
# → http://127.0.0.1:8899/  (FastAPI sirve server/web en "/")
```

- **Sin bundler ni node**: Vue 3 global build servido desde `/static/vendor/`, módulos ES nativos.
- **Compat FF78 (W5)**: `node scripts/check-js.mjs` valida el JS como ES2020 **y** tiene lista negra de CSS/APIs posteriores a FF78. Hallazgo clave: `gap` en flexbox recién llegó en FF84 — los 34 contenedores usan **márgenes** (bloque W5 en `app.css`); reintroducir un `gap:` rompe el chequeo.
- **Sintaxis/perf**: sin blur/backdrop-filter, animaciones solo con transform/opacity, listas acotadas, avatares con `loading="lazy"`, payload frío ≈ 284 KB sin comprimir (≈90 KB con gzip en Cloudflare).
- **Descargas persistentes (W50)**: `sw.js` separa `foxinix-shell-*`, `foxinix-media-v1` y `foxinix-downloads-v1`; las actualizaciones ya no borran los medios. Las descargas explícitas se listan en **Ajustes → Descargas** y se pueden volver a guardar sin red. Se pide almacenamiento persistente al navegador.

## Cliente de escritorio (Tauri)

```bash
cd desktop
npm install
npm run dev       # desarrollo
npm run build     # instaladores en src-tauri/target/release/bundle/
```

Carga `https://foxinix.qzz.io/` en una ventana nativa (se puede cambiar con `FOXINIX_URL` para probar un servidor local). No reescribe la UI: la app web sigue siendo la única interfaz. Los instaladores se publican en [**Releases**](https://github.com/foxorange224/foxinix-app/releases/latest); no se versionan los binarios:

- **Debian/Ubuntu:** `.deb` amd64.
- **Fedora:** `.rpm` x86_64.
- **Arch Linux y otras:** `.AppImage` x86_64.
- **Windows 10/11:** instalador NSIS `.exe` x64 (requiere WebView2; en Windows 7/8 no hay soporte oficial, usar la web/PWA).
- **Android 7+:** APKs arm64 y armv7 (32 bits) firmados, probados en emulador Android 15.

El icono SVG fuente y los detalles de compilación están en `desktop/README.md`.

## App nativa (NativeScript + Vue)

```bash
cd native
npm install
npm run sync:check      # ¿app/core/ está al día?
npm run build:android   # sincroniza el núcleo y compila el APK (debug)
```

La app nativa **no** es la web dentro de un WebView: son vistas nativas
(Android/iOS) que comparten el **mismo núcleo de lógica** que la web
(`api`, `store`, `i18n`, tiempo real…). Para que eso no se desincronice:

- `landing/static/js` es la fuente de verdad del núcleo; `tools/sync-core.mjs`
  lo copia a `native/app/core/` (lo generado **no** se edita a mano y
  `npm run sync:check` avisa si quedó viejo).
- Lo que cambia es la **capa de plataforma** (`platform/`): red, archivos,
  DOM, sockets y avisos tienen su implementación para NativeScript. Ningún
  módulo del núcleo toca `document`, `window`, `location` ni `history`.
- El selector de archivos es nativo por plataforma (SAF de Android /
  `UIDocumentPickerViewController` de iOS) y el multipart lo arma la capa
  de plataforma (bytes a mano en NS).
- Los **avisos del sistema** (W100) usan `@nativescript/local-notifications`:
  permiso de Android 13+, canal "Foxinix", icono de la marca y, al tocar el
  aviso, se abre el chat y el mensaje exactos.
- Para que el WebSocket siga vivo con la app en segundo plano (y los avisos
  lleguen) hay un **servicio en primer plano** propio (W101), sin Firebase:
  se arranca al salir de la app y se para al volver.
- Las **imágenes se ven dentro de la burbuja** (W102): la app pide la
  miniatura al servidor (`?thumb=1`), respeta la proporción real de la
  imagen y, al tocarla, abre un visor a pantalla completa con el original.

Detalle completo en `native/README.md`.

## Servidor

```bash
# local
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8899

# desplegar en firuserver (host SSH "1") — sube app/ y web/
bash scripts/install-server.sh
```

Servicios (systemd, todos `enabled` + auto-reinicio ante fallos):

| Servicio | Puerto | Dominio | Unit |
|---|---|---|---|
| Portada + SPA (`landing/`) | 8844 | foxinix.qzz.io | `landing-server.service` |
| API + WebSocket | 8444 | api.foxinix.qzz.io | `chat-server.service` |
| CDN de media | 8448 | cdn.foxinix.qzz.io | `cdn-server.service` |
| Túnel Cloudflare | — | todo lo anterior | `cloudflared.service` |

```bash
sudo systemctl status|restart landing-server   # o chat-server, cdn-server, cloudflared
journalctl -u landing-server -f                # logs del servicio
```

- **Tailscale**: `http://100.125.128.82:8444` · la web queda en la raíz: `http://100.125.128.82:8444/`
- **Datos**: `~/chat-server/data/` (DB SQLite + media + `mail.log`)
- **Correos**: con `RESEND_API_KEY` en `server/.env` usa Resend; sin ella, los códigos se escriben en `data/mail.log` (modo prueba).

## Tests

```bash
# UI web (Firefox headless + WebDriver BiDi): registro → perfil → código → app
server/.venv/bin/python tests/web_e2e.py

# cáscara móvil (390x844): menús, visor, editor de foto y tema claro
server/.venv/bin/python tests/mobile_ui_test.py

# compat del frontend con Mypal 78: sintaxis ES2020 + CSS/APIs en lista negra
node scripts/check-js.mjs

# captura de pantallas: scripts/shot.py <url> <salida.png> [--js '...'] [--eval '...']
server/.venv/bin/python scripts/shot.py http://127.0.0.1:8899/ /tmp/opencode/login.png

cd server
# contra el servidor remoto (requiere DB con usuarios ana/bruno o una corrida previa del e2e)
BASE="http://100.125.128.82:8444" MAILLOG="ssh" bash tests/e2e.sh
BASE="http://100.125.128.82:8444" WSBASE="ws://100.125.128.82:8444" .venv/bin/python tests/ws_test.py
.venv/bin/python tests/cleanup_test.py
```

## Seguridad actual

- Contraseñas con **scrypt**, JWT HS256 con `token_version` (logout global al resetear contraseña).
- Códigos de verificación hasheados, cooldown de reenvío y rate limit por IP/usuario.
- Media protegida con URLs firmadas (HMAC con expiración), MIME whitelist, cuota 1 GB.
- **DB cifrada en reposo con SQLCipher** (activa en producción): la clave vive en `.env` (`FOXMSG_DB_KEY`), se aplica por conexión y sin ella la base es ilegible (robos de archivo o backup → galimbas). Activar/migrar: `PASS=123 bash scripts/encrypt-db.sh` (migra con `sqlcipher_export`, verifica conteos + `cipher_version`, borra el backup plano). Sin clave, dev/local usa SQLite normal con las mismas suites. Limitación: los archivos de `data/media/` (fotos, notas de voz) siguen en claro en disco (en tránsito van por TLS con URLs firmadas).
- Sin Docker, sin dependencias de sistema: solo Python + systemd (el driver `sqlcipher3-binary` se instala solo si `.env` tiene la clave).

## Repositorios

| Repo | Contenido |
|---|---|
| [`foxorange224/foxinix-app`](https://github.com/foxorange224/foxinix-app) | código fuente completo (este repositorio): servidor, landing, app web, escritorio y tests |
| [`foxorange224/Foxinix-main`](https://github.com/foxorange224/Foxinix-main) | espejo publicado del sitio (`landing/` en la raíz) como respaldo; se sincroniza con cada cambio de la portada |

Ambos repos comparten este README.

## Licencia

**Foxinix App** (este repositorio) se distribuye bajo la licencia **Apache-2.0**. Consulta `LICENSE` y `NOTICE`.

**Foxinix Nitro** es un módulo y servicio privado, con licencia propietaria
y todos los derechos reservados. No forma parte de este repositorio ni queda
cubierto por Apache-2.0. Su código, pagos, licencias y configuración de
producción viven en un repositorio privado separado.

Las dependencias y recursos de terceros conservan sus propias licencias.
