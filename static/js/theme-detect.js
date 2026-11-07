/* Detección temprana del tema del sistema (antes del primer pintado).
   Se ejecuta en <head> para aplicar data-theme y theme-color sin parpadeo
   al iniciar el APK o la PWA en modo oscuro del teléfono.

   EXCEPCIÓN DOCUMENTADA A LA REGLA DE LA FASE 3.2:
   script clásico pre-pintado (no puede ser módulo: se difiere). Toca el
   DOM a propósito. En NativeScript no existe: el tema lo aplica la
   app nativa desde ApplicationSettings. */
(function () {
  try {
    var root = document.documentElement;
    var sys = window.matchMedia('(prefers-color-scheme: light)');
    root.setAttribute('data-theme', sys.matches ? 'light' : 'dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', sys.matches ? '#f5f5f5' : '#0b141a');
  } catch (e) {}
})();
