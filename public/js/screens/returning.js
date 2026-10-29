import { btn, esc } from '../ui.js'

export default ({ t }) => `
<h1>${esc(t('backTitle'))}</h1>
<p class="lead">${esc(t('backLead'))}</p>
<div class="card" style="max-width:560px">
 <div class="row">
  ${btn(t('backContinue'), { act: 'resume', kind: 'pri' })}
  ${btn(t('backNew'), { act: 'startNew' })}
  ${btn(t('backDelete'), { act: 'reset', kind: 'ghost' })}
 </div>
</div>
<p class="tiny muted" style="margin-top:12px">${esc(t('backNote'))}</p>`
