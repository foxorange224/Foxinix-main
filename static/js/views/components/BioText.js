/* BioText — biografía con "Ver más"/"Ver menos" (W61).
   Extraído de views/chat.js (Fase 3.1). */
import Vue from '../../vue.js';
import { charCount } from '../../actions.js';
import { mdToHtml } from '../helpers.js';
import { t } from '../../i18n.js';

export const BioText = {
  props: {
    text: { type: String, default: '' },
    limit: { type: Number, default: 100 },
  },
  setup: function (props) {
    const open = Vue.ref(false);
    const more = Vue.computed(function () {
      return charCount(props.text) > props.limit;
    });
    const shown = Vue.computed(function () {
      const txt = props.text || '';
      if (!more.value || open.value) return txt;
      const chars = Array.from(txt);
      let cut = chars.slice(0, props.limit).join('');
      const sp = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
      if (sp > Math.floor(props.limit * 0.6)) cut = cut.slice(0, sp);
      return cut.replace(/[\s,;:.!?]+$/, '') + '…';
    });
    return { open, more, shown, md: mdToHtml, t };
  },
  template:
    '<div class="pf-bio-wrap">' +
      '<div class="pp-bio md-body" v-html="md(shown)"></div>' +
      '<button v-if="more" class="pf-bio-more" type="button" @click="open = !open">' +
        '{{ open ? t(\'Ver menos\') : t(\'Ver más\') }}' +
      '</button>' +
    '</div>',
};
