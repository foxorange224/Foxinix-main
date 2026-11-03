/* Tema/acento guardados ANTES del primer pintado (sin parpadeo).
   W10: IIFE — nada de esto puede escaparse a window (un `var t` global
   acá adentro tapaba el import de t() de i18n con "dark").
   W14: vive en un archivo propio (y no como <script> inline) para poder
   servir una CSP estricta: script-src 'self' sin 'unsafe-inline'.
   Clásico (sin type=module) a propósito: los módulos se difieren y el
   tema tendría que aplicarse antes del primer pintado. */
(function () {
  try {
    var t = localStorage.getItem('fm.theme');
    if (t === 'light' || t === 'dark' || t === 'black') {
      document.documentElement.setAttribute('data-theme', t);
    } else {
      /* Sin preferencia guardada: detectar el tema del sistema/navegador
         para no mostrar pantalla clara al iniciar en modo oscuro del teléfono. */
      try {
        var sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
        if (sys.matches) {
          document.documentElement.setAttribute('data-theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
    var a = localStorage.getItem('fm.accent');
    if (a && /^#[0-9a-fA-F]{6}$/.test(a)) {
      var n = parseInt(a.slice(1), 16);
      var R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
      var r = Math.round(R * 0.72),
          g = Math.round(G * 0.72),
          b = Math.round(B * 0.72);
      var root = document.documentElement.style;
      root.setProperty('--accent', a);
      root.setProperty('--accent-d', '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
      root.setProperty('--accent-wash', 'rgba(' + R + ', ' + G + ', ' + B + ', .18)');
    }
    var w = localStorage.getItem('fm.wall');
    if (w && /^#[0-9a-fA-F]{6}$/.test(w)) {
      document.documentElement.style.setProperty('--wall', w);
    }
    /* W19: foto de fondo de la conversación (data-URL guardada por el
       usuario) + sidebar contraído: mismo truco sin parpadeo. */
    var wi = localStorage.getItem('fm.wallimg');
    if (wi && wi.slice(0, 5) === 'data:') {
      document.documentElement.style.setProperty('--wallimg', 'url("' + wi + '")');
      document.documentElement.classList.add('wallimg');
    }
    /* W20: opacidad del velo y difuminado del fondo (antes eran fijos) */
    var wd = localStorage.getItem('fm.wdim');
    document.documentElement.style
      .setProperty('--wall-dim', ((wd === null ? 50 : parseInt(wd, 10) || 0) / 100).toFixed(2));
    var wb = localStorage.getItem('fm.wblur');
    document.documentElement.style
      .setProperty('--wall-blur', (parseInt(wb, 10) || 0) + 'px');
    if (localStorage.getItem('fm.side') === '1') {
      document.documentElement.classList.add('side-collapsed');
    }
    var f = localStorage.getItem('fm.font');
    if (f === 'small' || f === 'large') document.documentElement.setAttribute('data-font', f);
    /* W10: idioma de la interfaz antes del primer pintado (sin parpadeo) */
    var lg = localStorage.getItem('fm.lang');
    if (lg === 'en' || lg === 'es') document.documentElement.setAttribute('lang', lg);
  } catch (e) {}
})();

/* W27f: el anillo de foco naranja solo al navegar con TECLADO (TAB):
   al hacer clic, un botón no debe quedar con contorno (se ve como si
   se presionara una tecla). :focus-visible no existe en FF78, así que
   la modalidad se sigue con eventos: TAB → modo teclado; cualquier
   puntero (ratón/tactil) lo apaga. La clase vive en <html> para que
   el CSS la alcance desde el primer pintado. */
(function () {
  var kbOn = function (e) {
    if (e.key === 'Tab') document.documentElement.classList.add('kb-focus');
  };
  var kbOff = function () {
    document.documentElement.classList.remove('kb-focus');
  };
  document.addEventListener('keydown', kbOn, true);
  document.addEventListener('mousedown', kbOff, true);
  document.addEventListener('touchstart', kbOff, true);
})();

/* W54d: en Android el teclado puede superponerse al WebView. Si el
   viewport visual se achica (y no es un zoom), ajustamos el alto de la
   app para que el composer quede justo encima del teclado. Los
   navegadores viejos (Mypal 78) no tienen visualViewport: ahí manda
   windowSoftInputMode=adjustResize de Android. */
(function () {
  if (!window.matchMedia) return;
  var root = document.documentElement;
  var mq = window.matchMedia('(max-width: 760px)');
  var timer = 0;
  var update = function () {
    /* Chrome avisa "El diseño se forzó antes de que la página se cargara
       completamente" si medimos el viewport en mitad de la carga (el
       destello de contenido sin estilo); hasta 'complete' no medimos. */
    if (document.readyState !== 'complete') return;
    var vv = window.visualViewport;
    if (!mq.matches || !vv || vv.scale > 1.05) {
      root.classList.remove('kb-open');
      root.style.removeProperty('--app-h');
      return;
    }
    var diff = window.innerHeight - vv.height;
    if (diff > 90 && vv.height > 0) {
      root.style.setProperty('--app-h', Math.round(vv.height) + 'px');
      root.classList.add('kb-open');
    } else {
      root.classList.remove('kb-open');
      root.style.removeProperty('--app-h');
    }
  };
  var schedule = function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = 0; update(); }, 60);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }
  if (mq.addEventListener) mq.addEventListener('change', schedule);
  else if (mq.addListener) mq.addListener(schedule);
  if (document.readyState === 'complete') update();
  else window.addEventListener('load', update);
})();

/* W56: el WebView de Android no rellena env(safe-area-inset-bottom), así
   que la barra de gestos se comía la barra inferior y el compositor. El
   APK expone FoxinixAndroid.insets() (y avisa por foxinixSetNativeInsets);
   volcamos ese valor en --sab, que el CSS usa para dejar el hueco. En la
   web normal no hay puente y queda el env() del sistema. */
(function () {
  var root = document.documentElement;
  var last = -1;
  function apply(top, bottom, left, right) {
    var b = Number(bottom);
    if (!isFinite(b) || b < 0) return;
    b = Math.round(b);
    if (b === last) return;
    last = b;
    root.style.setProperty('--sab', b + 'px');
  }
  window.foxinixSetNativeInsets = function (top, bottom, left, right) {
    apply(top, bottom, left, right);
  };
  function read() {
    var a = window.FoxinixAndroid;
    if (!a || typeof a.insets !== 'function') return;
    try {
      var v = a.insets();
      if (typeof v === 'string' && v) v = JSON.parse(v);
      if (v && typeof v === 'object') apply(v.top, v.bottom, v.left, v.right);
    } catch (e) {}
  }
  try { read(); } catch (e) {}
  window.addEventListener('load', read);
  window.addEventListener('pageshow', read);
  window.addEventListener('resize', read);
  window.addEventListener('orientationchange', read);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) read();
  });
  setTimeout(read, 0);
})();

/* W57: el APK oculta el WebView en segundo plano. Avisamos al documento
   para congelar animaciones/transiciones (el WebSocket y los avisos
   siguen vivos) y las reanudamos al volver a primer plano. */
(function () {
  var root = document.documentElement;
  window.foxinixNativePause = function () {
    root.classList.add('native-bg');
  };
  window.foxinixNativeResume = function () {
    root.classList.remove('native-bg');
  };
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) root.classList.remove('native-bg');
  });
})();
