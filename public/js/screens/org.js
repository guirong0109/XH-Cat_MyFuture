// Organisation screen (#org) for HR and career centres: five tabs, drawn from state.org (see orgActions.js).
// Loading, no-organisation, error and "accounts off" are told in words; nothing here is stored in the browser.
import { esc } from '../ui.js'
import { heatView, outlookView, peopleView, planView, setupView, word } from './orgParts.js'

const TABS = ['setup', 'people', 'heat', 'plan', 'outlook']
const VIEWS = { setup: setupView, people: peopleView, heat: heatView, plan: planView, outlook: outlookView }
const errorText = (t, code) => (t(`ogErr_${code}`) === `ogErr_${code}` ? t('ogErr_other') : t(`ogErr_${code}`))

export default ({ t, state }) => {
  const o = state?.org
  if (!o || o.status === 'loading') return `<div class="og"><p class="muted"><span class="spin"></span> ${esc(t('ogLoading'))}</p></div>`
  if (o.status === 'off') return `<div class="og"><div class="banner b-info"><div>${esc(t('ogOff'))}</div></div></div>`
  if (o.status === 'error') {
    return `<div class="og"><div class="banner b-bad" role="alert"><div>${esc(t('ogLoadError'))} ${esc(errorText(t, o.code))}</div>
      <button class="btn sm" type="button" data-act="orgRetry">${esc(t('ogRetry'))}</button></div></div>`
  }
  const created = o.status === 'ready' && o.data?.org
  const tab = created && TABS.includes(o.tab) ? o.tab : 'setup'
  const view = { ...o, lang: state.lang }
  const label = (id) => (id === 'people' || id === 'plan' ? word(t, view, id) : t(`ogTab_${id}`))
  const tabs = created
    ? `<div class="tabs" role="tablist">${TABS.map((id, i) => `<button type="button" role="tab" aria-selected="${id === tab}" class="${id === tab ? 'on' : ''}" data-act="orgTab" data-arg="${id}"><span class="n">${i + 1}</span><span>${esc(label(id))}</span></button>`).join('')}</div>`
    : ''
  const message = o.message && tab !== 'people' ? `<div class="banner ${o.message.kind === 'ok' ? 'b-ok' : 'b-bad'}" role="status"><div>${esc(o.message.text)}</div></div>` : ''
  return `<div class="og">${tabs}${message}<section id="og-${tab}">${VIEWS[tab](t, view)}</section></div>`
}
