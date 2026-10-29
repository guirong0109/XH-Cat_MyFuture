// Sign up / sign in / signed-in box. state.account = { status: 'checking'|'none'|'in'|'off', user, message }.
import { btn, esc } from '../ui.js'

export function accountBox({ t, state }) {
  const account = state.account ?? { status: 'checking' }
  if (account.status === 'checking') return `<div class="card"><span class="spin"></span> ${esc(t('acChecking'))}</div>`
  if (account.status === 'off') return `<div class="banner b-info"><div>${esc(t('acOff'))}</div></div>`
  const message = account.message ? `<div class="banner ${account.message.kind === 'ok' ? 'b-ok' : 'b-bad'}" role="alert"><div>${esc(account.message.text)}</div></div>` : ''
  if (account.status === 'in') {
    return `<div class="card">${message}<p>${esc(t('acSignedIn', { email: account.user.email }))}</p>
      <div class="row">${btn(t('acContinue'), { go: 'category', kind: 'pri' })}${btn(t('acSignout'), { act: 'acLogout' })}
      <button class="btn" style="color:var(--bad)" data-act="acDelete">${esc(t('acDelete'))}</button></div></div>`
  }
  return `<div class="card">${message}
    <div class="field"><label for="acEmail">${esc(t('acEmail'))}</label><input id="acEmail" type="email" autocomplete="email"></div>
    <div class="field"><label for="acPass">${esc(t('acPassword'))}</label><input id="acPass" type="password" autocomplete="current-password" minlength="8"></div>
    <p class="tiny muted">${esc(t('acHint'))}</p>
    <div class="row">${btn(t('create'), { act: 'acSignup', kind: 'pri' })}${btn(t('signin'), { act: 'acLogin' })}</div></div>`
}

// Top bar: who is signed in, or a way to sign in.
export function accountLink({ t, state }) {
  const account = state.account ?? { status: 'checking' }
  if (account.status === 'in') return `<span class="tiny muted hide-m">${esc(account.user.email)}</span>${btn(t('acSignout'), { act: 'acLogout', kind: 'sm' })}`
  if (account.status === 'none') return btn(t('signin'), { go: 'access', kind: 'sm' })
  return ''
}
