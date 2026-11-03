/* Foxinix — W27: editor de foto de perfil. Antes de aplicar la foto se
   puede ENCUADRAR (arrastrando), AMPLIAR y GIRAR. En el teléfono el
   zoom y el giro se hacen con dos dedos; en escritorio siguen el
   control deslizante y el botón Girar. La vista previa y la salida
   final se pintan con la MISMA función de canvas. */

const SQ = 300;      // lado lógico de la vista previa
const OUT = 512;     // lado de la imagen que se sube

function normDeg(v) {
  v = v % 360;
  if (v > 180) v -= 360;
  if (v <= -180) v += 360;
  return v;
}

/* Encuadre mínimo para que la foto rotada siga cubriendo el cuadrado.
   Con ángulos libres no alcanza con el rectángulo envolvente: hay que
   cubrir también las esquinas del cuadrado. */
function coverScale(img, side, rot, zoom) {
  const a = rot * Math.PI / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const base = Math.max(side / img.naturalWidth, side / img.naturalHeight);
  return base * (c + s) * zoom;
}

/* Pinta la foto en un cuadro de `side` px con el estado dado.
   st: {rot: grados, zoom: 1..3, tx, ty} — tx/ty en fracciones del lado. */
function drawInto(ctx, side, img, st) {
  const base = coverScale(img, side, st.rot, st.zoom);
  ctx.save();
  ctx.clearRect(0, 0, side, side);
  ctx.translate(side / 2 + st.tx * side, side / 2 + st.ty * side);
  ctx.rotate(st.rot * Math.PI / 180);
  ctx.scale(base, base);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2,
    img.naturalWidth, img.naturalHeight);
  ctx.restore();
}

/* El encuadre nunca puede dejar huecos: limita tx/ty a que la foto (ya
   rotada) siga cubriendo el cuadro. */
function clampPan(st, img, side) {
  const base = coverScale(img, side, st.rot, st.zoom);
  const a = st.rot * Math.PI / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const dw = (img.naturalWidth * c + img.naturalHeight * s) * base;
  const dh = (img.naturalWidth * s + img.naturalHeight * c) * base;
  const mx = Math.max(0, (dw - side) / (2 * side));
  const my = Math.max(0, (dh - side) / (2 * side));
  if (st.tx < -mx) st.tx = -mx;
  if (st.tx > mx) st.tx = mx;
  if (st.ty < -my) st.ty = -my;
  if (st.ty > my) st.ty = my;
}

export const AvatarEditor = {
  name: 'AvatarEditor',
  props: {
    src: { type: String, required: true },
    /* W27b: encuadre previamente aplicado (rot/zoom/tx/ty). El padre lo
       pasa al REEDITAR para restaurar la posición guardada en sesión. */
    initial: { type: Object, default: null },
  },
  setup: function (props, ctx) {
    const cv = Vue.ref(null);
    const rot = Vue.ref(0);
    const zoom = Vue.ref(1);
    const tx = Vue.ref(0);
    const ty = Vue.ref(0);
    const ready = Vue.ref(false);
    let img = null;

    const state = function () {
      return { rot: rot.value, zoom: zoom.value, tx: tx.value, ty: ty.value };
    };

    const draw = function () {
      const el = cv.value;
      if (!el || !img) return;
      const st = state();
      clampPan(st, img, SQ);
      if (st.tx !== tx.value) tx.value = st.tx;
      if (st.ty !== ty.value) ty.value = st.ty;
      drawInto(el.getContext('2d'), SQ, img, state());
    };

    const load = function (src) {
      ready.value = false;
      rot.value = 0;
      zoom.value = 1;
      tx.value = 0;
      ty.value = 0;
      const im = new Image();
      im.onload = function () {
        img = im;
        /* restaura el encuadre guardado (la foto puede haber cambiado:
           clampPan evita huecos) */
        const ini = props.initial;
        if (ini) {
          const r = Number(ini.rot) || 0;
          rot.value = normDeg(r);
          const z = Number(ini.zoom);
          zoom.value = z >= 1 && z <= 3 ? z : 1;
          tx.value = Number(ini.tx) || 0;
          ty.value = Number(ini.ty) || 0;
        }
        ready.value = true;
        draw();
      };
      im.onerror = function () {
        img = null;
        ready.value = false;
      };
      im.src = src;
    };
    load(props.src);
    Vue.watch(function () { return props.src; }, function (v) {
      if (v) load(v);
    });

    /* ---- encuadre táctil: un dedo mueve; dos dedos amplían y giran ---- */
    const pointers = {};
    // El mapa se recorre en orden de inserción; los dos primeros dedos
    // son los que controlan la pinza.
    const pointList = function () {
      const out = [];
      for (const id in pointers) {
        if (Object.prototype.hasOwnProperty.call(pointers, id)) out.push(pointers[id]);
      }
      return out;
    };
    let dragging = false;
    let lx = 0;
    let ly = 0;
    let gesture = null;

    const startGesture = function (pts) {
      const a = pts[0];
      const b = pts[1];
      gesture = {
        dist: Math.max(1, Math.sqrt(
          (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y))),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        zoom: zoom.value,
        rot: rot.value,
        tx: tx.value,
        ty: ty.value,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
    };
    const down = function (e) {
      if (!img) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      }
      const pts = pointList();
      if (pts.length >= 2) {
        dragging = false;
        startGesture(pts);
      } else {
        dragging = true;
        lx = e.clientX;
        ly = e.clientY;
        gesture = null;
      }
      if (e.cancelable) e.preventDefault();
    };
    const move = function (e) {
      const p = pointers[e.pointerId];
      if (!p || !img) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const el = cv.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const k = SQ / (r.width || SQ);   // si CSS encoge el canvas, escalar
      const pts = pointList();
      if (gesture && pts.length >= 2) {
        const a = pts[0];
        const b = pts[1];
        const dist = Math.max(1, Math.sqrt(
          (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)));
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        let da = angle - gesture.angle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        zoom.value = Math.max(1, Math.min(3, gesture.zoom * dist / gesture.dist));
        rot.value = normDeg(gesture.rot + da * 180 / Math.PI);
        tx.value = gesture.tx + (mx - gesture.mx) * k / SQ;
        ty.value = gesture.ty + (my - gesture.my) * k / SQ;
      } else if (dragging && pts.length === 1) {
        tx.value += (e.clientX - lx) * k / SQ;
        ty.value += (e.clientY - ly) * k / SQ;
        lx = e.clientX;
        ly = e.clientY;
      } else {
        return;
      }
      draw();
      e.preventDefault();
    };
    const up = function (e) {
      if (e && e.pointerId != null) delete pointers[e.pointerId];
      const pts = pointList();
      if (!pts.length) {
        dragging = false;
        gesture = null;
      } else if (pts.length === 1) {
        dragging = true;
        lx = pts[0].x;
        ly = pts[0].y;
        gesture = null;
      } else {
        dragging = false;
        startGesture(pts);
      }
    };

    const rotate = function () {
      rot.value = normDeg(rot.value + 90);
      draw();
    };
    const reset = function () {
      rot.value = 0;
      zoom.value = 1;
      tx.value = 0;
      ty.value = 0;
      draw();
    };

    /* Compón la salida en 512 px y devuélvela como Blob (PNG: FF78 no
       codifica WebP; el server la recodifica a WebP igual que el resto).
       El estado viaja junto al blob: el padre lo guarda para restaurarlo
       si se vuelve a editar (W27b). */
    const apply = function () {
      if (!img) return;
      const off = document.createElement('canvas');
      off.width = OUT;
      off.height = OUT;
      const st = state();
      clampPan(st, img, OUT);
      drawInto(off.getContext('2d'), OUT, img, st);
      off.toBlob(function (b) {
        if (b) ctx.emit('confirm', b, state());
      }, 'image/png');
    };
    const cancel = function () {
      ctx.emit('cancel');
    };

    return { cv, zoom, ready, draw, down, move, up, rotate, reset, apply, cancel };
  },
  template: `
    <div class="av-ed" role="group" :aria-label="t('Ajustar foto')">
      <p class="av-ed-hint">
        <span class="av-ed-hint-desk">{{ t('Arrastra para encuadrar') }}</span>
        <span class="av-ed-hint-touch">{{ t('Arrastra para mover · pellizca para ampliar y girar') }}</span>
      </p>
      <canvas class="av-ed-cv" ref="cv" width="300" height="300"
        :aria-label="t('Arrastra para mover · pellizca para ampliar y girar')"
        @pointerdown="down" @pointermove="move" @pointerup="up"
        @pointercancel="up"></canvas>
      <div class="av-ed-zoom">
        <input type="range" class="wp-range" min="1" max="3" step="0.05"
          v-model.number="zoom" :aria-label="t('Zoom')" @input="draw">
      </div>
      <div class="av-ed-row">
        <button class="btn btn-ghost av-ed-rotate" type="button" @click="rotate">
          <svg class="ic ic-sm"><use href="#i-refresh"></use></svg>{{ t('Girar') }}
        </button>
        <button class="btn btn-ghost" type="button" @click="reset">{{ t('Restablecer') }}</button>
      </div>
      <div class="av-ed-row">
        <button class="btn btn-ghost" type="button" @click="cancel">{{ t('Cancelar') }}</button>
        <button class="btn" type="button" :disabled="!ready" @click="apply">{{ t('Aplicar') }}</button>
      </div>
    </div>`,
};
