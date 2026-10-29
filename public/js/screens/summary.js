// "Your profile": the confirmed structured profile, its occupation and skill links, and the JSON for the next module.
// No percentages here: matching is the next module.
import { esc } from '../ui.js'
import { profileTable } from './review.js'

export default ({ t, state }) => {
  const profile = state.profile
  if (!profile || profile.profileStatus !== 'confirmed') {
    return `<h1>${esc(t('summary'))}</h1><div class="next">${esc(t('noProfile'))}</div>`
  }
  const banner = state.usable
    ? `<div class="banner b-ok"><div>${esc(t('usable'))}</div></div>`
    : `<div class="banner b-warn"><div>${esc(t('notUsable'))}</div><button class="btn sm" data-act="editSkills">${esc(t('edit'))}</button></div>`
  return `<h1>${esc(t('summary'))}</h1><p class="lead">${esc(t('summaryLead'))}</p>${banner}
  <div class="card" style="overflow-x:auto">${profileTable(t, profile)}</div>
  <div class="row" style="margin-top:14px"><button class="btn" data-go="form">${esc(t('edit'))}</button></div>
  <details class="card" style="margin-top:14px"><summary>${esc(t('viewJson'))}</summary>
    <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;margin-top:10px">${esc(JSON.stringify(profile, null, 2))}</pre>
  </details>`
}
