// "Missing or incorrect information? Improve extraction with AI" (spec §9): only after a CV upload in this session,
// only with consent, and never changing the form by itself. state.ai = { phase, reason, rows, dropped } (not saved).
import { btn, esc } from '../ui.js'
import { compareView } from './compareView.js'

export function improveWithAi({ t, state }) {
  if (!state.cvSession || !state.extractionId) return ''
  const ai = state.ai ?? { phase: 'idle' }
  let body
  if (ai.phase === 'consent') {
    body = `<p class="small">${esc(t('aiConsentText'))}</p>
      <label class="small"><input type="checkbox" id="aiConsent"> ${esc(t('aiConsentCheck'))}</label>
      <div class="row" style="margin-top:10px">${btn(t('aiSend'), { act: 'aiRun', kind: 'pri' })}${btn(t('aiCancel'), { act: 'aiClose' })}</div>`
  } else if (ai.phase === 'busy') {
    body = `<p><span class="spin"></span> ${esc(t('aiBusy'))}</p>`
  } else if (ai.phase === 'error') {
    const key = `aiReason_${ai.reason}`
    body = `<div class="banner b-warn" role="alert"><div><b>${esc(t('aiUnavailable'))}</b> ${esc(t(key) === key ? '' : t(key))}</div></div>
      ${btn(t('aiCancel'), { act: 'aiClose' })}`
  } else if (ai.phase === 'compare') {
    body = compareView({ t, ai })
  } else {
    body = `<div class="row"><span>${esc(t('aiAsk'))}</span>${btn(t('aiButton'), { act: 'aiOpen' })}</div>`
  }
  return `<div class="card" style="margin-top:14px">${body}</div>`
}
