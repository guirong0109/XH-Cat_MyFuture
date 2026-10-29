import { esc } from '../ui.js'

export default ({ t }) => `
<h1>${esc(t('accessTitle'))}</h1><p class="lead">${esc(t('accessLead'))}</p>
<div class="grid g3">
 <button class="choice" data-act="guest"><b>${esc(t('guest'))}</b><span class="small muted">${esc(t('guestNote'))}</span></button>
 <button class="choice lock" data-act="accountSoon"><b>${esc(t('create'))}</b><span class="small muted">${esc(t('accountSoon'))}</span></button>
 <button class="choice lock" data-act="accountSoon"><b>${esc(t('signin'))}</b><span class="small muted">${esc(t('accountSoon'))}</span></button>
</div>`
