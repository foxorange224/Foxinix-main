/* Pantallas de autenticación (W1). Vue global build, setup() + template. */
import { store, go, goReplace, toast } from '../store.js';
import { api, applyAuth, bootstrap, logout, uploadMedia, session, saveSession } from '../api.js';
/* W66c: GIF/WebP animados como foto de perfil (se suben tal cual) */
import { isAnimWebp } from '../actions.js';
import { AvatarEditor } from './avatar-editor.js';

const { ref, computed, onMounted, onUnmounted } = Vue;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USER_RE = /^[a-z0-9][a-z0-9_.]{2,19}$/;

/** Lo que el usuario tipeó en "¿olvidaste tu contraseña?" → prefill en reset.
    (El endpoint no revela el correo por diseño, solo lo sabe quien lo tipea.) */
let lastIdentifier = '';

/* ---------- carga ---------- */
/* W38: la pantalla de arranque es la compartida (icono de la app,
   barra de progreso y fase real del arranque).
   W39: el envoltorio .boot CENTRA desde el primer pintado — sin él
   la pantalla salía arriba y "se acomodaba" al llegar el overlay
   fijo del chat (parpadeo). */
export const BootView = {
  template: '<div class="boot"><boot-screen></boot-screen></div>',
};

/* ---------- login ---------- */
export const LoginView = {
  name: 'Login',
  setup() {
    const identifier = ref('');
    const password = ref('');
    const show = ref(false);
    const busy = ref(false);
    const err = ref('');

    async function submit() {
      err.value = '';
      if (!identifier.value || !password.value) {
        err.value = 'Completa el usuario y la contraseña';
        return;
      }
      busy.value = true;
      try {
        const r = await api('POST', '/api/auth/login', {
          identifier: identifier.value,
          password: password.value,
        });
        applyAuth(r);
        if (r.verification && r.verification.required) {
          go('verify');
        } else {
          /* W22: replace — entrar al chat reemplaza el login, así el
             botón atrás nunca devuelve a la pantalla de inicio de sesión. */
          goReplace('app');
        }
      } catch (e) {
        err.value = e.detail;
      } finally {
        busy.value = false;
      }
    }

    return { identifier, password, show, busy, err, submit,
             goForgot: () => go('forgot'), goRegister: () => go('register') };
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><svg class="auth-logo-img" viewBox="0 0 500 200" role="img" aria-label="Foxinix"><use href="#i-logo-word"></use></svg></div>
      <!-- W71: el login era la ÚNICA vista auth sin h1 (solo la línea gris
           de sub): con la marca mandando arriba, el título real de la
           pantalla sube a auth-title y hereda la jerarquía del resto. -->
      <h1 class="auth-title">{{ t('Inicia sesión en tu cuenta') }}</h1>

      <form @submit.prevent="submit" novalidate>
        <div v-if="err" class="form-err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <div class="field">
          <label for="l-id">{{ t('Usuario') }}</label>
          <div class="input-wrap">
            <input id="l-id" class="input" v-model.trim="identifier"
                   autocomplete="username" autocapitalize="none" spellcheck="false"
                   :placeholder="t('tu_usuario')">
          </div>
        </div>
        <div class="field">
          <label for="l-pw">{{ t('Contraseña') }}</label>
          <div class="input-wrap">
            <input id="l-pw" class="input has-eye" :type="show ? 'text' : 'password'"
                   v-model="password" autocomplete="current-password">
            <button type="button" class="eye-btn" @click="show = !show"
                    :aria-label="show ? t('Ocultar contraseña') : t('Mostrar contraseña')">
              <svg class="ic ic-sm"><use :href="show ? '#i-eye-off' : '#i-eye'"></use></svg>
            </button>
          </div>
        </div>
        <button class="btn btn-full" type="submit" :disabled="busy">
          <span v-if="busy" class="spin"></span><span v-else>{{ t('Ingresar') }}</span>
        </button>
      </form>

      <div class="auth-alt">
        <button type="button" class="btn-link" @click="goForgot" :disabled="busy">{{ t('¿Olvidaste tu contraseña?') }}</button>
        <span class="auth-sep">·</span>
        <button type="button" class="btn-link" @click="goRegister" :disabled="busy">{{ t('Crear cuenta') }}</button>
      </div>
    </div>
  </div>`,
};

/* ---------- registro ---------- */
export const RegisterView = {
  name: 'Register',
  setup() {
    const email = ref('');
    const username = ref('');
    const password = ref('');
    const confirm = ref('');
    const busy = ref(false);
    const err = ref('');

    const userVal = computed({
      get: () => username.value,
      set: (v) => { username.value = (v || '').toLowerCase(); },
    });

    function validate() {
      if (!EMAIL_RE.test(email.value)) return 'Introduce un correo válido';
      if (!USER_RE.test(username.value))
        return 'Usuario: 3-20 caracteres (letras, números, punto o guion bajo), empezando con letra o número';
      if (password.value.length < 8) return 'La contraseña necesita al menos 8 caracteres';
      if (password.value !== confirm.value) return 'Las contraseñas no coinciden';
      return '';
    }

    async function submit() {
      err.value = validate();
      if (err.value) return;
      busy.value = true;
      try {
        const r = await api('POST', '/api/auth/register', {
          email: email.value.trim(),
          username: username.value,
          password: password.value,
        });
        applyAuth(r);
        go('profile');
      } catch (e) {
        err.value = e.detail;
      } finally {
        busy.value = false;
      }
    }

    return { email, username: userVal, password, confirm, busy, err, submit,
             goLogin: () => go('login') };
  },
  data: () => ({ show: false }),
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><svg class="auth-logo-img" viewBox="0 0 500 200" role="img" aria-label="Foxinix"><use href="#i-logo-word"></use></svg></div>
      <h1 class="auth-title">{{ t('Crear cuenta') }}</h1>
      <p class="auth-sub">{{ t('Tres pasos y estás adentro') }}</p>

      <form @submit.prevent="submit" novalidate>
        <div v-if="err" class="form-err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <div class="field">
          <label for="r-mail">{{ t('Correo electrónico') }}</label>
          <input id="r-mail" class="input" type="email" v-model.trim="email"
                 autocomplete="email" autocapitalize="none" spellcheck="false"
                 placeholder="tu_correo@mail.com">
        </div>
        <div class="field">
          <label for="r-user">{{ t('Nombre de usuario') }}</label>
          <input id="r-user" class="input" v-model="username"
                 autocomplete="username" autocapitalize="none" spellcheck="false"
                 placeholder="tu_usuario">
          <span class="hint">{{ t('Se usa para buscarte. Solo minúsculas.') }}</span>
        </div>
        <div class="field">
          <label for="r-pw">{{ t('Contraseña') }}</label>
          <div class="input-wrap">
            <input id="r-pw" class="input has-eye" :type="show ? 'text' : 'password'"
                   v-model="password" autocomplete="new-password" :placeholder="t('mínimo 8 caracteres')">
            <button type="button" class="eye-btn" @click="show = !show"
                    :aria-label="show ? t('Ocultar contraseña') : t('Mostrar contraseña')">
              <svg class="ic ic-sm"><use :href="show ? '#i-eye-off' : '#i-eye'"></use></svg>
            </button>
          </div>
        </div>
        <div class="field">
          <label for="r-pw2">{{ t('Repetir contraseña') }}</label>
          <input id="r-pw2" class="input" type="password" v-model="confirm"
                 autocomplete="new-password">
        </div>
        <button class="btn btn-full" type="submit" :disabled="busy">
          <span v-if="busy" class="spin"></span><span v-else>{{ t('Continuar') }}</span>
        </button>
      </form>

      <div class="auth-alt">
        <button type="button" class="btn-link" @click="goLogin" :disabled="busy">{{ t('Ya tengo cuenta') }}</button>
      </div>
    </div>
  </div>`,
};

/* ---------- perfil (paso 2) ---------- */
export const ProfileView = {
  name: 'Profile',
  components: { AvatarEditor },
  setup() {
    const displayName = ref('');
    const bio = ref('');
    const status = ref('');
    const file = ref(null);
    const preview = ref('');
    const busy = ref(false);
    const err = ref('');
    /* W27: al elegir foto se abre el editor (encuadre + rotación) y el
       preview viejo no cambia hasta APLICAR. W27b: el encuadre aplicado
       se recuerda al reeditar la MISMA foto (sesión). */
    const edSrc = ref('');
    const edInitial = ref(null);
    const rawFile = ref(null);
    let crop = null;

    async function pick(e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.value = 'Elige una imagen'; return; }
      /* W66c: la foto de perfil pesa hasta 3 MB (el server también). */
      if (f.size > 3 * 1024 * 1024) { err.value = 'La imagen supera los 3 MB'; return; }
      err.value = '';
      /* W66c: GIF o WebP animado → se sube tal cual; el editor (canvas)
         los dejaría quietos en el primer fotograma. */
      if (f.type === 'image/gif' || await isAnimWebp(f)) {
        if (preview.value) URL.revokeObjectURL(preview.value);
        if (edSrc.value) URL.revokeObjectURL(edSrc.value);
        file.value = f;
        rawFile.value = f;
        edSrc.value = '';
        preview.value = URL.createObjectURL(f);
        return;
      }
      rawFile.value = f;
      if (edSrc.value) URL.revokeObjectURL(edSrc.value);
      edInitial.value = null;          // foto nueva: encuadre fresco
      edSrc.value = URL.createObjectURL(f);
    }
    function startEdit() {
      if (edSrc.value) URL.revokeObjectURL(edSrc.value);
      edInitial.value = crop;
      if (rawFile.value) edSrc.value = URL.createObjectURL(rawFile.value);
    }
    function onEdCancel() {
      if (edSrc.value) { URL.revokeObjectURL(edSrc.value); edSrc.value = ''; }
    }
    function onEdConfirm(blob, st) {
      onEdCancel();
      if (preview.value) URL.revokeObjectURL(preview.value);
      if (st) crop = st;
      file.value = new File([blob], 'avatar.png', { type: 'image/png' });
      preview.value = URL.createObjectURL(file.value);
    }
    function clearAvatar() {
      if (preview.value) URL.revokeObjectURL(preview.value);
      file.value = null;
      rawFile.value = null;
      preview.value = '';
    }
    onUnmounted(() => {
      if (preview.value) URL.revokeObjectURL(preview.value);
      if (edSrc.value) URL.revokeObjectURL(edSrc.value);
    });

    async function next() {
      err.value = '';
      if (displayName.value.length > 50) { err.value = 'El nombre supera los 50 caracteres'; return; }
      if (bio.value.length > 150) { err.value = 'La bio supera los 150 caracteres'; return; }
      busy.value = true;
      try {
        const body = {};
        if (displayName.value) body.display_name = displayName.value;
        if (bio.value) body.bio = bio.value;
        if (status.value) body.status_text = status.value;
        if (file.value) {
          const up = await uploadMedia(file.value);
          body.avatar_media_id = up.id;
        }
        const r = await api('PUT', '/api/auth/profile', body, { retry401: true });
        if (r.user) { session.user = r.user; store.user = r.user; saveSession(); }
        go('verify');
      } catch (e) {
        err.value = e.detail;
      } finally {
        busy.value = false;
      }
    }

    return { displayName, bio, status, preview, busy, err, pick, clearAvatar, next,
             edSrc, edInitial, startEdit, onEdConfirm, onEdCancel,
             skip: () => go('verify') };
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="avatar-pick" v-if="!edSrc">
        <div class="av-img" :class="{ 'has-photo': !!preview }">
          <img v-if="preview" :src="preview" alt="">
          <svg v-else class="fox" aria-hidden="true"><use href="#i-logo-mark"></use></svg>
        </div>
        <label class="av-btn" :title="t('Elegir foto')">
          <svg class="ic ic-sm"><use href="#i-image"></use></svg>
          <input type="file" accept="image/*" style="display:none" @change="pick">
        </label>
        <button v-if="preview" type="button" class="av-edit" :title="t('Ajustar foto')" @click="startEdit">
          <svg class="ic ic-sm"><use href="#i-pencil"></use></svg>
        </button>
        <button v-if="preview" type="button" class="av-clear" @click="clearAvatar" :aria-label="t('Quitar foto')">
          <svg class="ic ic-sm"><use href="#i-x"></use></svg>
        </button>
      </div>
      <avatar-editor v-else :src="edSrc" :initial="edInitial"
        @confirm="onEdConfirm" @cancel="onEdCancel"></avatar-editor>

      <h1 class="auth-title">{{ t('Tu perfil') }}</h1>
      <p class="auth-sub">{{ t('Cómo te van a ver tus contactos') }}</p>

      <form @submit.prevent="next" novalidate>
        <div v-if="err" class="form-err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <div class="field">
          <label for="p-name">{{ t('Nombre (opcional)') }}</label>
          <input id="p-name" class="input" v-model.trim="displayName" maxlength="50"
                 placeholder="Ana Pérez" autocomplete="name">
        </div>
        <div class="field">
          <label for="p-status">{{ t('Estado') }}</label>
          <input id="p-status" class="input" v-model.trim="status" maxlength="80"
                 :placeholder="t('En línea')">
        </div>
        <div class="field">
          <label for="p-bio">{{ t('Bio ({n} restantes)', { n: 150 - bio.length }) }}</label>
          <textarea id="p-bio" class="input" v-model="bio" maxlength="150"
                    :placeholder="t('Cuéntanos algo sobre ti…')"></textarea>
        </div>
        <button class="btn btn-full" type="submit" :disabled="busy">
          <span v-if="busy" class="spin"></span><span v-else>{{ t('Continuar') }}</span>
        </button>
      </form>

      <div class="auth-alt">
        <button type="button" class="btn-link" @click="skip" :disabled="busy">{{ t('Omitir por ahora') }}</button>
      </div>
    </div>
  </div>`,
};

/* ---------- verificación de correo ---------- */
export const VerifyView = {
  name: 'Verify',
  setup() {
    const code = ref('');
    const busy = ref(false);
    const err = ref('');
    const cd = ref(Number((store.pendingInfo && store.pendingInfo.resend_after) || 0));
    const attempts = ref((store.pendingInfo && store.pendingInfo.attempts_left) || null);
    let timer = null;

    function startTimer() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (cd.value > 0) cd.value--;
        else { clearInterval(timer); timer = null; }
      }, 1000);
    }
    onMounted(() => { if (cd.value > 0) startTimer(); });
    onUnmounted(() => { if (timer) clearInterval(timer); });

    async function submit() {
      if (code.value.length !== 6 || busy.value) return;
      err.value = '';
      busy.value = true;
      try {
        const r = await api('POST', '/api/auth/verify', { code: code.value });
        if (r.tokens) applyAuth({ tokens: r.tokens, user: r.user });
        await bootstrap();
      } catch (e) {
        err.value = e.detail;
        code.value = '';
        const info = store.pendingInfo;
        attempts.value = info && info.attempts_left != null ? info.attempts_left : null;
      } finally {
        busy.value = false;
      }
    }

    function onCode(e) {
      const v = (e.target.value || '').replace(/\D/g, '').slice(0, 6);
      code.value = v;
      if (v.length === 6) submit();
    }

    async function resend() {
      if (cd.value > 0 || busy.value) return;
      err.value = '';
      busy.value = true;
      try {
        const r = await api('POST', '/api/auth/resend', { purpose: 'verify' });
        cd.value = Number(r.resend_after || 60);
        attempts.value = r.attempts_left != null ? r.attempts_left : attempts.value;
        startTimer();
      } catch (e) {
        err.value = e.detail;
        if (e.retryAfter) {
          cd.value = e.retryAfter;
          startTimer();
        }
      } finally {
        busy.value = false;
      }
    }

    return { code, busy, err, cd, attempts, submit, onCode, resend,
             goForgot: () => go('forgot') };
  },
  computed: {
    pendingEmail() { return store.pendingEmail; },
    resendLabel() {
      const { t } = this;
      return this.cd > 0 ? t('Reenviar en {n}s', { n: this.cd }) : t('Reenviar código');
    },
    attemptsLabel() {
      const n = this.attempts;
      if (n === null || n >= 5) return '';
      return this.t('Te queda{s} {n} intento{p}.',
        { s: n === 1 ? '' : 'n', n: n, p: n === 1 ? '' : 's' });
    },
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><svg class="auth-logo-img" viewBox="0 0 500 200" role="img" aria-label="Foxinix"><use href="#i-logo-word"></use></svg></div>
      <h1 class="auth-title">{{ t('Verifica tu correo') }}</h1>
      <p class="verify-mail">
        {{ t('Enviamos un código de 6 dígitos a') }}<br><strong>{{ pendingEmail || t('tu correo') }}</strong>
      </p>

      <form @submit.prevent="submit" novalidate>
        <div v-if="err" class="form-err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <div class="field">
          <input class="input code-input" :value="code" @input="onCode"
                 inputmode="numeric" pattern="[0-9]*" maxlength="6"
                 autocomplete="one-time-code" placeholder="000000"
                 :aria-label="t('Código de verificación')">
        </div>
        <button class="btn btn-full" type="submit" :disabled="busy || code.length !== 6">
          <span v-if="busy" class="spin"></span><span v-else>{{ t('Verificar') }}</span>
        </button>
      </form>

      <div class="resend-row">
        <button type="button" class="btn-link" @click="resend" :disabled="cd > 0 || busy">
          {{ resendLabel }}
        </button>
      </div>
      <div class="auth-alt">
        <button type="button" class="btn-link" @click="goForgot">{{ t('Cambiar la contraseña') }}</button>
      </div>
      <p v-if="attemptsLabel" class="verify-attempts">
        {{ attemptsLabel }}
      </p>
    </div>
  </div>`,
};

/* ---------- ¿olvidaste tu contraseña? ---------- */
export const ForgotView = {
  name: 'Forgot',
  setup() {
    const identifier = ref('');
    const busy = ref(false);
    const err = ref('');

    async function submit() {
      err.value = '';
      if (!identifier.value) { err.value = 'Introduce tu correo electrónico'; return; }
      busy.value = true;
      try {
        lastIdentifier = identifier.value;
        await api('POST', '/api/auth/forgot', { identifier: identifier.value });
        // El endpoint responde igual si la cuenta no existe. Si hay cooldown
        // (retry_after > 0) el código anterior sigue vigente: se puede usar.
        go('reset');
      } catch (e) {
        err.value = e.detail;
      } finally {
        busy.value = false;
      }
    }

    return { identifier, busy, err, submit, goLogin: () => go('login') };
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><svg class="auth-logo-img" viewBox="0 0 500 200" role="img" aria-label="Foxinix"><use href="#i-logo-word"></use></svg></div>
      <h1 class="auth-title">{{ t('Recuperar contraseña') }}</h1>
      <p class="auth-sub">{{ t('Te enviamos un código de verificación a tu correo') }}</p>

      <form @submit.prevent="submit" novalidate>
        <div v-if="err" class="form-err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <div class="field">
          <label for="f-id">{{ t('Correo electrónico') }}</label>
          <input id="f-id" class="input" type="email" v-model.trim="identifier"
                 autocomplete="email" autocapitalize="none" spellcheck="false"
                 :placeholder="t('tu_correo@mail.com')">
        </div>
        <button class="btn btn-full" type="submit" :disabled="busy">
          <span v-if="busy" class="spin"></span><span v-else>{{ t('Enviar código') }}</span>
        </button>
      </form>

      <div class="auth-alt">
        <button type="button" class="btn-link" @click="goLogin" :disabled="busy">{{ t('Volver a ingresar') }}</button>
      </div>
    </div>
  </div>`,
};

/* ---------- restablecer contraseña ---------- */
export const ResetView = {
  name: 'Reset',
  setup() {
    const identifier = ref(lastIdentifier || '');
    const code = ref('');
    const password = ref('');
    const confirm = ref('');
    const busy = ref(false);
    const err = ref('');

    async function submit() {
      err.value = '';
      if (!identifier.value) { err.value = 'Introduce tu correo electrónico'; return; }
      if (code.value.replace(/\D/g, '').length !== 6) { err.value = 'Introduce el código de 6 dígitos'; return; }
      if (password.value.length < 8) { err.value = 'La contraseña necesita al menos 8 caracteres'; return; }
      if (password.value !== confirm.value) { err.value = 'Las contraseñas no coinciden'; return; }
      busy.value = true;
      try {
        const r = await api('POST', '/api/auth/reset', {
          identifier: identifier.value,
          code: code.value.replace(/\D/g, ''),
          password: password.value,
        });
        applyAuth(r);
        await bootstrap();
      } catch (e) {
        err.value = e.detail;
      } finally {
        busy.value = false;
      }
    }

    return { identifier, code, password, confirm, busy, err, submit,
             goLogin: () => go('login') };
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><svg class="auth-logo-img" viewBox="0 0 500 200" role="img" aria-label="Foxinix"><use href="#i-logo-word"></use></svg></div>
      <h1 class="auth-title">{{ t('Nueva contraseña') }}</h1>
      <p class="auth-sub">{{ t('Introduce el código que te enviamos y la contraseña nueva') }}</p>

      <form @submit.prevent="submit" novalidate>
        <div v-if="err" class="form-err" role="alert">
          <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
        </div>
        <div class="field">
          <label for="rs-id">{{ t('Correo electrónico') }}</label>
          <input id="rs-id" class="input" type="email" v-model.trim="identifier"
                 autocomplete="email" autocapitalize="none" spellcheck="false"
                 :placeholder="t('tu_correo@mail.com')">
        </div>
        <div class="field">
          <label for="rs-code">{{ t('Código de 6 dígitos') }}</label>
          <input id="rs-code" class="input code-input" v-model="code"
                 inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
        </div>
        <div class="field">
          <label for="rs-pw">{{ t('Contraseña nueva') }}</label>
          <input id="rs-pw" class="input" type="password" v-model="password"
                 autocomplete="new-password" :placeholder="t('mínimo 8 caracteres')">
        </div>
        <div class="field">
          <label for="rs-pw2">{{ t('Repetir contraseña') }}</label>
          <input id="rs-pw2" class="input" type="password" v-model="confirm"
                 autocomplete="new-password">
        </div>
        <button class="btn btn-full" type="submit" :disabled="busy">
          <span v-if="busy" class="spin"></span><span v-else>{{ t('Guardar contraseña') }}</span>
        </button>
      </form>

      <div class="auth-alt">
        <button type="button" class="btn-link" @click="goLogin" :disabled="busy">{{ t('Volver a ingresar') }}</button>
      </div>
    </div>
  </div>`,
};
