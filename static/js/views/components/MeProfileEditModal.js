/* MeProfileEditModal — extraído de views/chat.js (Fase 3.1). */
import {
  MAX_TEXT_CHARS, charCount, isAnimWebp, mediaUrl,
} from '../../actions.js';
import {
  api, saveSession, session, uploadMedia,
} from '../../api.js';
import { t } from '../../i18n.js';
import { FileAdapter } from '../../platform/index.js';
import { DomAdapter } from '../../platform/dom.js';
import { store } from '../../store.js';
import { AvatarEditor } from '../../views/avatar-editor.js';
import {
  STATUS_PRESETS, bannerPositionOf,
} from '../../views/helpers.js';
import {
  cropStateFor, saveCropState,
} from '../../views/ui-actions.js';
import Vue from '../../vue.js';

export const MeProfileEditModal = {
  setup: function () {
    const u = store.user || {};
    const name = Vue.ref(u.display_name || '');
    const bio = Vue.ref(u.bio || '');
    const statusText = Vue.ref(u.status_text || '');
    /* W10: todo el mundo tiene estado (como en Discord). El valor vacío
       heredado se abre como En línea y se guarda como tal al guardar. */
    const preset = Vue.ref(u.status_preset || 'online');
    const file = Vue.ref(null);
    const preview = Vue.ref('');
    const hadAvatar = !!u.avatar_url;
    const avatarGone = Vue.ref(false);
    /* W58: portada del perfil (imagen propia, recorte tipo cover). */
    const bannerFile = Vue.ref(null);
    const bannerPreview = Vue.ref('');
    const hadBanner = !!u.banner_url;
    const bannerGone = Vue.ref(false);
    /* W61: foco vertical de la portada. Se puede arrastrar o mover con
       la barra; se guarda en el perfil para todas las vistas. */
    const bannerPos = Vue.ref(bannerPositionOf(u));
    const bannerEl = Vue.ref(null);
    const bannerDragging = Vue.ref(false);
    const bannerPosStyle = Vue.computed(function () {
      return { objectPosition: '50% ' + Math.round(bannerPos.value) + '%' };
    });
    const hasBanner = Vue.computed(function () {
      return !!bannerPreview.value ||
        (!bannerGone.value && !!(store.user && store.user.banner_url));
    });
    const busy = Vue.ref(false);
    const err = Vue.ref('');
    /* W60: el cambio de @usuario vive en un modal APARTE. Aquí solo
       queda el acceso; no se mezcla con nombre, foto, estado y bio. */
    const openUname = function () { store.unameOpen = true; };
    /* W27: al elegir foto se abre el editor (encuadre + rotación); el
       archivo y el preview viejos NO cambian hasta APLICAR. */
    const edSrc = Vue.ref('');
    const edInitial = Vue.ref(null);
    const rawFile = Vue.ref(null);

    const hasPhoto = Vue.computed(function () {
      return !!preview.value ||
        (!avatarGone.value && !!(store.user && store.user.avatar_url));
    });

    const pick = async function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.value = 'Elige una imagen'; return; }
      /* W66c: la foto de perfil pesa hasta 3 MB (el server también). */
      if (f.size > 3 * 1024 * 1024) { err.value = 'La imagen supera los 3 MB'; return; }
      err.value = '';
      /* W66c: GIF o WebP animado → se sube tal cual. El editor (canvas)
         los dejaría quietos en el primer fotograma. rawFile queda para
         que "Ajustar foto" abra este archivo (y aplicar lo aplane, si
         el usuario lo pide). */
      if (f.type === 'image/gif' || await isAnimWebp(f)) {
        if (preview.value) FileAdapter.revokeObjectURL(preview.value);
        if (edSrc.value) FileAdapter.revokeObjectURL(edSrc.value);
        file.value = f;
        rawFile.value = f;
        edSrc.value = '';
        preview.value = FileAdapter.createObjectURL(f);
        avatarGone.value = false;
        return;
      }
      rawFile.value = f;
      if (edSrc.value) FileAdapter.revokeObjectURL(edSrc.value);
      edInitial.value = null;          // foto nueva: encuadre fresco
      edSrc.value = FileAdapter.createObjectURL(f);
    };

    /* W27: reencuadrar la foto actual (o la última elegida ya cargada);
       el encuadre aplicado antes se restaura (guardado en sesión). */
    const startEdit = function () {
      if (edSrc.value) FileAdapter.revokeObjectURL(edSrc.value);
      edInitial.value = cropStateFor('me');
      if (rawFile.value) {
        edSrc.value = FileAdapter.createObjectURL(rawFile.value);
      } else if (store.user && store.user.avatar_url) {
        edSrc.value = mediaUrl(store.user.avatar_url);
      }
    };
    const onEdCancel = function () {
      if (edSrc.value) { FileAdapter.revokeObjectURL(edSrc.value); edSrc.value = ''; }
    };
    const onEdConfirm = function (blob, st) {
      onEdCancel();
      if (preview.value) FileAdapter.revokeObjectURL(preview.value);
      if (st) saveCropState('me', st);
      file.value = new File([blob], 'avatar.png', { type: 'image/png' });
      preview.value = FileAdapter.createObjectURL(file.value);
      avatarGone.value = false;
    };

    const pickBanner = function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { err.value = 'Elige una imagen'; return; }
      /* W66c: la portada también pesa hasta 3 MB (GIF/WebP animados
         se suben tal cual y se ven animados). */
      if (f.size > 3 * 1024 * 1024) { err.value = 'La imagen supera los 3 MB'; return; }
      err.value = '';
      if (bannerPreview.value) FileAdapter.revokeObjectURL(bannerPreview.value);
      bannerFile.value = f;
      bannerPreview.value = FileAdapter.createObjectURL(f);
      bannerGone.value = false;
      bannerPos.value = 50;          // una portada nueva empieza centrada
    };

    const removeBanner = function () {
      if (!hasBanner.value) return;
      if (bannerPreview.value) FileAdapter.revokeObjectURL(bannerPreview.value);
      bannerFile.value = null;
      bannerPreview.value = '';
      bannerGone.value = hadBanner;
      bannerPos.value = 50;
    };

    /* W61: arrastrar la portada (ratón o dedo) para elegir qué franja se
       ve. Arriba muestra la parte superior (0 %), abajo la inferior. */
    const startBannerDrag = function (e) {
      if (!hasBanner.value) return;
      if (e && e.button) return;
      const el = bannerEl.value;
      if (!el) return;
      if (e && e.preventDefault) e.preventDefault();
      const h = Math.max(1, el.getBoundingClientRect().height || 96);
      const y0 = e.clientY;
      const p0 = bannerPos.value;
      bannerDragging.value = true;
      const move = function (ev) {
        const dy = ev.clientY - y0;
        bannerPos.value = Math.max(0, Math.min(100, p0 - (dy / h) * 100));
      };
      const up = function () {
        bannerDragging.value = false;
        DomAdapter.removeWindowEventListener('pointermove', move);
        DomAdapter.removeWindowEventListener('pointerup', up);
        DomAdapter.removeWindowEventListener('pointercancel', up);
      };
      DomAdapter.addWindowEventListener('pointermove', move);
      DomAdapter.addWindowEventListener('pointerup', up);
      DomAdapter.addWindowEventListener('pointercancel', up);
    };

    const removeAvatar = function () {
      if (!preview.value && !hadAvatar) return;
      /* W17: quitar la foto pide confirmación (es un cambio que se
         aprecia en todo el chat; no debe pasar por accidente). */
      store.confirmBox = {
        title: 'Quitar foto de perfil',
        text: '¿Seguro que quieres quitar tu foto de perfil? Se quitará cuando guardes los cambios.',
        okLabel: 'Quitar foto',
        danger: true,
        onOk: function () {
          if (preview.value) FileAdapter.revokeObjectURL(preview.value);
          file.value = null;
          rawFile.value = null;
          preview.value = '';
          if (hadAvatar) avatarGone.value = true;
        },
      };
    };

    Vue.onUnmounted(function () {
      if (preview.value) FileAdapter.revokeObjectURL(preview.value);
      if (edSrc.value) FileAdapter.revokeObjectURL(edSrc.value);
      if (bannerPreview.value) FileAdapter.revokeObjectURL(bannerPreview.value);
    });

    /* Cancelar (o guardar) vuelve a la ficha "Tu perfil". */
    const close = function () {
      store.meEditOpen = false;
      store.meProfileOpen = true;
    };

    const save = async function () {
      err.value = '';
      if (name.value.length > 50) { err.value = 'El nombre supera los 50 caracteres'; return; }
      if (charCount(bio.value) > 300) { err.value = 'La bio supera los 300 caracteres'; return; }
      if (statusText.value.length > 80) { err.value = 'El estado supera los 80 caracteres'; return; }
      busy.value = true;
      try {
        const body = {
          display_name: name.value.trim(),
          bio: bio.value.trim(),
          status_text: statusText.value.trim(),
          status_preset: preset.value,
          banner_position: Math.round(bannerPos.value),
        };
        if (file.value) {
          const up = await uploadMedia(file.value);
          body.avatar_media_id = up.id;
        } else if (avatarGone.value) {
          body.avatar_media_id = null;
        }
        if (bannerFile.value) {
          const upBanner = await uploadMedia(bannerFile.value);
          body.banner_media_id = upBanner.id;
        } else if (bannerGone.value) {
          body.banner_media_id = null;
        }
        const r = await api('PUT', '/auth/profile', body, { retry401: true });
        if (r.user) {
          store.user = Object.assign({}, store.user, r.user);
          session.user = store.user;
          saveSession();
        }
        close();
      } catch (e) {
        err.value = (e && t(e.detail)) || t('No se pudo guardar el perfil');
      } finally {
        busy.value = false;
      }
    };

    return {
      store, name, bio, statusText, preset, preview, hasPhoto, avatarGone,
      bannerPreview, hasBanner, bannerGone, pickBanner, removeBanner,
      bannerPos, bannerPosStyle, bannerDragging, bannerEl, startBannerDrag,
      bioCount: Vue.computed(function () { return charCount(bio.value); }),
      bioMax: 300, maxText: MAX_TEXT_CHARS,
      busy, err, pick, removeAvatar, close, save,
      openUname,   /* W60: modal aparte para el @usuario */
      /* W27: editor de foto (encuadre + rotación); W27b: recuerda el
         encuadre de la sesión */
      edSrc, edInitial, startEdit, onEdConfirm, onEdCancel,
      presets: STATUS_PRESETS, mediaUrl,
      /* W8: la config de la cuenta vive SOLO en el engranaje (Ajustes). */
    };
  },
  components: { AvatarEditor },
  template: `
    <div class="modal-veil" :class="{ 'veil-cropping': !!edSrc }" @click.self="close">
      <div class="modal meprof mp-edit" :class="{ 'is-cropping': !!edSrc }"
        role="dialog" :aria-label="t('Editar perfil')">
        <header>{{ edSrc ? t('Ajustar foto') : t('Editar perfil') }}
          <button class="icon-btn" type="button" :title="t('Cerrar')"
            @click="edSrc ? onEdCancel() : close()">
            <svg class="ic"><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="mp-body">
          <!-- W58: portada del perfil. Se sube tal cual y se muestra
               como cover; no hay recorte para no añadir otro editor. -->
          <div class="pf-edit-banner" v-if="!edSrc">
            <div class="pf-edit-banner-img" ref="bannerEl"
              :class="{ 'is-empty': !hasBanner, 'can-drag': hasBanner, 'is-dragging': bannerDragging }"
              @pointerdown="startBannerDrag">
              <img v-if="bannerPreview" :src="bannerPreview" :style="bannerPosStyle"
                alt="" draggable="false">
              <img v-else-if="hasBanner && store.user && store.user.banner_url"
                :src="mediaUrl(store.user.banner_url)" :style="bannerPosStyle"
                alt="" draggable="false">
              <span v-else class="pf-banner-art" aria-hidden="true">
                <svg class="fox"><use href="#i-logo-mark"></use></svg>
              </span>
              <span class="pf-pos-hint" v-if="hasBanner">{{ t('Arrastra para encuadrar') }}</span>
            </div>
            <!-- W59: la foto va MONTADA sobre la portada, no debajo.
                 Mientras se recorta se oculta y manda el editor. -->
            <div class="avatar-pick" v-if="!edSrc">
              <div class="av-img" :class="{ 'has-photo': !!preview || !!(hasPhoto && store.user && store.user.avatar_url) }">
                <img v-if="preview" :src="preview" alt="">
                <img v-else-if="hasPhoto && store.user && store.user.avatar_url"
                  :src="mediaUrl(store.user.avatar_url)" alt="">
                <span v-else class="avatar-initial">{{ (store.user.display_name || store.user.username || '?').charAt(0).toUpperCase() }}</span>
              </div>
              <label class="av-btn" :title="t('Elegir foto')">
                <svg class="ic ic-sm"><use href="#i-image"></use></svg>
                <input type="file" accept="image/*" style="display:none" @change="pick">
              </label>
              <button v-if="hasPhoto" type="button" class="av-edit" :title="t('Ajustar foto')" @click="startEdit">
                <svg class="ic ic-sm"><use href="#i-pencil"></use></svg>
              </button>
              <button v-if="hasPhoto" type="button" class="av-clear" @click="removeAvatar" :aria-label="t('Quitar foto')">
                <svg class="ic ic-sm"><use href="#i-x"></use></svg>
              </button>
            </div>
            <div class="pf-edit-banner-actions">
              <label class="btn btn-ghost btn-sm">
                <svg class="ic ic-sm"><use href="#i-image"></use></svg>
                {{ t('Cambiar portada') }}
                <input class="pf-banner-input" type="file" accept="image/*" style="display:none" @change="pickBanner">
              </label>
              <button class="btn btn-ghost btn-sm" type="button" v-if="hasBanner"
                @click="removeBanner">{{ t('Quitar portada') }}</button>
            </div>
            <div class="pf-pos-row" v-if="hasBanner">
              <label for="pf-banner-pos">{{ t('Posición de la portada') }}</label>
              <input id="pf-banner-pos" class="pf-pos-range" type="range"
                min="0" max="100" step="1" v-model.number="bannerPos">
              <span class="pf-pos-val">{{ Math.round(bannerPos) }}%</span>
            </div>
          </div>
          <!-- W27: con el editor abierto ocupa el centro; al aplicar
               vuelve la ficha con el recorte ya aplicado -->
          <avatar-editor v-if="edSrc" :src="edSrc" :initial="edInitial"
            @confirm="onEdConfirm" @cancel="onEdCancel"></avatar-editor>
          <template v-if="!edSrc">
            <div class="form-err st-err" v-if="err" role="alert">
              <svg class="ic ic-sm"><use href="#i-alert"></use></svg><span>{{ t(err) }}</span>
            </div>
            <div class="field">
              <label>{{ t('Nombre') }}</label>
              <input class="input" v-model.trim="name" maxlength="50" :placeholder="t('Tu nombre')">
            </div>
            <!-- W60: el @usuario se cambia en un modal APARTE, con
                 advertencia y contraseña. El botón Guardar NO lo toca. -->
            <div class="field uname-field">
              <label>{{ t('Usuario') }}</label>
              <div class="uname-current">
                <span class="uname-at">@</span>
                <b>{{ store.user && store.user.username }}</b>
                <button class="btn btn-ghost btn-sm" type="button" @click="openUname">
                  {{ t('Cambiar usuario') }}</button>
              </div>
              <p class="st-hint">{{ t('Sirve para iniciar sesión y para que te mencionen con @.') }}</p>
            </div>
            <div class="field">
              <label>{{ t('Estado') }}</label>
              <input class="input" v-model.trim="statusText" maxlength="80" :placeholder="t('jugando a algo…')">
            </div>
            <div class="mp-presets">
              <button class="ap-chip" type="button" v-for="p in presets" :key="p.val"
                :class="{ on: preset === p.val }" @click="preset = p.val"><span
                class="sdot" :class="p.dot"></span>{{ t(p.label) }}</button>
            </div>
            <p class="st-hint mp-preset-hint">{{ t('No molestar silencia los avisos; solo las menciones directas (@usuario) te avisan. Invisible te deja conectado sin aparecer en línea.') }}</p>
            <div class="field">
              <label>Bio</label>
              <textarea class="input" v-model.trim="bio" maxlength="300" rows="3"
                :placeholder="t('Cuéntanos algo sobre ti…')"></textarea>
              <div class="pf-bio-count">{{ bioCount }}/300</div>
              <p class="st-hint">{{ t('Se muestra con') }} <b>markdown</b>: {{ t('**negrita**, *cursiva*, \`código\`, ~~tachado~~ y [links](https://…)') }}</p>
            </div>
          </template>
        </div>
        <div class="m-foot st-btns" v-if="!edSrc">
          <button class="btn btn-ghost" type="button" @click="close" :disabled="busy">{{ t('Cancelar') }}</button>
          <button class="btn" type="button" @click="save" :disabled="busy">
            {{ busy ? t('Guardando…') : t('Guardar') }}</button>
        </div>
      </div>
    </div>`,
};