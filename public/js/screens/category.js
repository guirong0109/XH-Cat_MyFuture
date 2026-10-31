// "Who are you?" Personal users: fresh graduate, student, underemployed or unemployed (the answer is the profile's
// userCategory). Organisations: C (HR / L&D) and D (TVET or university career centre), a preview that needs an account.
import { esc, tag } from '../ui.js'

export const PERSONAL = [
  ['fresh_graduate', 'catGrad', 'catGradText'],
  ['student', 'catStudent', 'catStudentText'],
  ['underemployed', 'catUnder', 'catUnderText'],
  ['unemployed', 'catUnemp', 'catUnempText'],
]
const ORGS = [['C', 'catC', 'catCText'], ['D', 'catD', 'catDText']]

const choice = (t, state, key, title, textKey, org) => `<button class="choice ${state.category === key ? 'sel' : ''} ${org ? 'lock' : ''}" data-act="category" data-arg="${key}"><b>${title} ${org ? tag('unv', t('preview')) : ''}</b><span class="small muted">${esc(t(textKey))}</span></button>`

// Only the choices for the answer on the first screen; all of them without one.
export default ({ t, state }) => {
  const personal = state.use === 'org' ? [] : PERSONAL.map(([key, label, text]) => choice(t, state, key, esc(t(label)), text, false))
  const orgs = state.use === 'personal' ? [] : ORGS.map(([key, label, text]) => choice(t, state, key, `${key} · ${esc(t(label))}`, text, true))
  return `<h1>${esc(t('category'))}</h1><p class="lead">${esc(t('categoryLead'))}</p>
<div class="grid g2">${[...personal, ...orgs].join('')}</div>`
}
