# Foxinix

Sitio de presentación de **Foxinix**, el servicio de mensajería de
Foxinix. La portada presenta las funciones del chat y enlaza a:

- Chat: <https://foxinix.qzz.io/>
- Registro: <https://foxinix.qzz.io/register>
- Comunidad: Discord y YouTube

## Estructura

```
index.html        Portada principal
styles.css        Estilos de la portada y páginas legales
app.js            Menú móvil y año del pie de página
privacidad.html   Política de privacidad
terminos.html     Términos de uso
assets/chat/      Logotipo, iconos e imagen para redes sociales
robots.txt        Reglas para buscadores
sitemap.xml       Mapa del sitio
CNAME             Dominio de GitHub Pages
```

## Publicación

El sitio se publica con **GitHub Pages** y se sirve en
<https://foxinix.qzz.io>. Para actualizarlo, reemplaza los archivos de la
raíz del repositorio y sube los cambios a la rama `main`.

La portada no necesita compilación ni dependencias externas. Los archivos
se pueden probar localmente con cualquier servidor estático:

```bash
python3 -m http.server 8000
```

## Compatibilidad

El HTML, CSS y JavaScript están pensados para funcionar en navegadores
modernos y en Firefox 78 (Mypal), sin depender de frameworks ni de recursos
de terceros. Las animaciones usan únicamente `transform` y `opacity`.
