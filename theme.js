/* Tema de la portada: sigue la configuración de la app (fm.theme en
   localStorage, mismo origen que el SPA) o, si aún no hay preferencia, el
   modo del navegador (prefers-color-scheme). 'black' (OLED) se muestra
   como oscuro: la portada no tiene variante OLED.
   Clásico y bloqueante en <head>, ANTES del CSS, para poner data-theme
   antes del primer pintado (sin parpadeo). Sin dependencias; FF78-safe. */
(function () {
  var mq = null;

  function apply() {
    try {
      var t = null;
      try { t = localStorage.getItem('fm.theme'); } catch (e) {}
      var light;
      if (t === 'light' || t === 'dark' || t === 'black') {
        light = t === 'light';
      } else {
        light = !!(mq && mq.matches);
      }
      document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', light ? '#f4f3f1' : '#0d0d10');
    } catch (e) {}
  }

  try {
    if (window.matchMedia) mq = window.matchMedia('(prefers-color-scheme: light)');
    apply();
    /* Otra pestaña cambia fm.theme (el evento storage no llega a la que
       lo escribió): la portada se repinta al instante. */
    window.addEventListener('storage', function (e) {
      if (e.key === 'fm.theme') apply();
    });
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else if (mq.addListener) mq.addListener(apply);   // Safari/FF viejo
    }
  } catch (e) {}
})();
