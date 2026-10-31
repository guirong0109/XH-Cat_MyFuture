import { esc } from '../ui.js'
import { accountBox } from '../components/accountBox.js'

export default ({ t, state }) => `
${state?.accessNote ? `<div class="banner b-info" role="status"><div>${esc(t(state.accessNote))}</div></div>` : ''}
<h1>${esc(t('accessTitle'))}</h1><p class="lead">${esc(t('accessLead'))}</p>
<div class="grid g2">
 <button class="choice" data-act="guest"><b>${esc(t('guest'))}</b><span class="small muted">${esc(t('guestNote'))}</span></button>
 <div><h3>${esc(t('acTitle'))}</h3>${accountBox({ t, state })}</div>
</div>`
