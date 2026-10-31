import { btn, esc } from '../ui.js'
import { accountBox } from '../components/accountBox.js'

// Organisation: an account is needed, so there is no guest option. Without accounts on this server it says so and
// offers the personal journey (the account box would say "continue as a guest").
function organisation({ t, state }) {
  const body = state.account?.status === 'off'
    ? `<div class="banner b-warn"><div>${esc(t('acOrgOff'))}</div></div><div class="row">${btn(t('useMyself'), { act: 'use', arg: 'personal' })}</div>`
    : accountBox({ t, state })
  return `<h1>${esc(t('accessOrgTitle'))}</h1><p class="lead">${esc(t('accessOrgLead'))}</p><div style="max-width:560px">${body}</div>`
}

// Personal (or not answered yet): continue as a guest, or sign up / sign in.
export default ({ t, state }) => (state.use === 'org' ? organisation({ t, state }) : `
<h1>${esc(t('accessTitle'))}</h1><p class="lead">${esc(t('accessLead'))}</p>
<div class="grid g2" style="align-items:start">
 <button class="choice" data-act="guest"><b>${esc(t('guest'))}</b><span class="small muted">${esc(t('guestNote'))}</span></button>
 <div><h3>${esc(t('acTitle'))}</h3>${accountBox({ t, state })}</div>
</div>`)
