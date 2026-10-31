// "Who are you?" for organisations: C (HR / L&D) and D (TVET or university career centre), a preview that needs an
// account. Personal users answer "Which describes you best?" at the top of the profile form instead.
import { esc, tag } from '../ui.js'

const ORGS = [['C', 'catC', 'catCText'], ['D', 'catD', 'catDText']]

export default ({ t, state }) => `<h1>${esc(t('category'))}</h1><p class="lead">${esc(t('categoryLead'))}</p>
<div class="grid g2">${ORGS.map(([key, label, text]) => `<button class="choice ${state.category === key ? 'sel' : ''} lock" data-act="category" data-arg="${key}"><b>${key} · ${esc(t(label))} ${tag('unv', t('preview'))}</b><span class="small muted">${esc(t(text))}</span></button>`).join('')}</div>`
