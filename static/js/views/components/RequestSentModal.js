/* RequestSentModal — confirmación de solicitud de amistad enviada.
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { store } from '../../store.js';
import { t } from '../../i18n.js';

export const RequestSentModal = {
  setup: function () {
    const close = function () { store.requestSent = null; };
    const goRequests = function () {
      store.requestSent = null;
      store.requestsJump++;
    };
    return { store, close, goRequests, t };
  },
  template: `
    <div class="modal-veil reqsent-veil" @click.self="close" role="dialog"
      aria-modal="true" :aria-label="t('Solicitud enviada.')">
      <div class="modal req-sent">
        <header>
          <span class="m-head-title"><b>{{ t('Solicitud enviada.') }}</b></span>
        </header>
        <div class="req-sent-body">
          <span class="req-sent-check" aria-hidden="true">
            <svg class="ic"><use href="#i-check"></use></svg>
          </span>
          <p class="req-sent-lead">{{ t('Se ha enviado solicitud a @{n}',
            { n: store.requestSent ? store.requestSent.username : '' }) }}</p>
          <p class="req-sent-wait">{{ t('Espera a que acepte, podés ir a la sección') }}
            <button class="req-link" type="button" @click="goRequests">{{ t('Solicitudes') }}</button></p>
        </div>
        <div class="req-sent-foot">
          <button class="btn req-ok" type="button" @click="close">{{ t('Okey') }}</button>
        </div>
      </div>
    </div>`,
};
