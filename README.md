# Foxinix

Portal de descargas con software, sistemas operativos, juegos, APKs y contenido adicional.

## Características

- Catálogo organizado por categorías (Programas, Sistemas, Juegos, APKs, Extras)
- Búsqueda global con resultados agrupados por relevancia
- Interfaz responsive con modo oscuro
- Descripciones detalladas con Markdown y Mermaid
- Enlaces de descarga encriptados
- Compresión Brotli/Gzip
- Paginación y skeleton loading
- URL amigable con estado de búsqueda e ítem

## Tecnologías

- **Frontend:** HTML, CSS, JavaScript vanilla
- **Servidor:** Node.js (HTTP nativo)
- **Iconos:** Font Awesome
- **Markdown:** marked.js
- **Diagramas:** Mermaid.js
- **Base de datos:** JSON remoto

## Estructura

```
├── index.html          # Página principal
├── 404.html            # Página de error 404
├── server.js           # Servidor Node.js
├── sitemap.xml         # Sitemap para SEO
├── robots.txt          # Reglas para bots
├── assets/             # CSS, imágenes, iconos
│   └── css/
│       └── 404.css
└── components/         # Fragmentos HTML reutilizables
```

## Uso

```bash
node server.js
```

El servidor corre en el puerto `8080` por defecto (configurable con `PORT`).

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto del servidor |
| `NODE_ENV` | `production` | Modo del servidor |

## SEO

- Meta tags Open Graph y Twitter Cards
- Datos estructurados JSON-LD (Schema.org WebSite con SearchAction)
- Sitemap XML y robots.txt
- Canonical URL
- Bloque descriptivo oculto para bots
