import { btn, esc } from '../ui.js'
import { accountBox } from '../components/accountBox.js'

// The first question after "Get started" (owner, 31 Oct): for myself (the individual journey) or for my organisation
// (HR, TVET and university career centres). Asked until it is answered.
const USES = [['personal', 'usePersonal', 'usePersonalText'], ['org', 'useOrg', 'useOrgText']]
const useQuestion = (t) => `<h1>${esc(t('useTitle'))}</h1>
<div class="grid g2">${USES.map(([k, n, d]) => `<button class="choice" data-act="use" data-arg="${k}"><b>${esc(t(n))}</b><span class="small muted">${esc(t(d))}</span></button>`).join('')}</div>`

// Organisation: an account is needed, so there is no guest option. Without accounts on this server it says so and
// offers the personal journey (the account box would say "continue as a guest").
function organisation({ t, state }) {
  const body = state.account?.status === 'off'
    ? `<div class="banner b-warn"><div>${esc(t('acOrgOff'))}</div></div><div class="row">${btn(t('useMyself'), { act: 'use', arg: 'personal' })}</div>`
    : accountBox({ t, state })
  return `<h1>${esc(t('accessOrgTitle'))}</h1><p class="lead">${esc(t('accessOrgLead'))}</p><div style="max-width:560px">${body}</div>`
}

// Personal: continue as a guest, or sign up / sign in.
const personal = ({ t, state }) => `
<h1>${esc(t('accessTitle'))}</h1><p class="lead">${esc(t('accessLead'))}</p>
<div class="grid g2" style="align-items:start">
 <button class="choice" data-act="guest"><b>${esc(t('guest'))}</b><span class="small muted">${esc(t('guestNote'))}</span></button>
 <div><h3>${esc(t('acTitle'))}</h3>${accountBox({ t, state })}</div>
</div>`

export default ({ t, state }) => {
  // A note from the organisation view (e.g. "sign in to use the organisation tools") shows above whichever step is next.
  const note = state?.accessNote ? `<div class="banner b-info" role="status"><div>${esc(t(state.accessNote))}</div></div>` : ''
  // Sent here to sign in: a staff member opening a join link is on the personal side, HR opening the organisation tools
  // on the organisation side, so neither is asked "Who is it for?" first.
  const use = state?.use ?? { shNeedAccount: 'personal', ogNeedAccount: 'org' }[state?.accessNote]
  if (!use) return `${note}${useQuestion(t)}`
  return `${note}${use === 'org' ? organisation({ t, state }) : personal({ t, state })}`
}
