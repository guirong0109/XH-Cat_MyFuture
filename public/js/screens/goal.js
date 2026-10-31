// After guest or account (personal users): what the user wants from the journey. The answer is saved as the
// profile's career goal, and the form's Preferences section can change it later.
import { esc } from '../ui.js'

export const GOALS = [
  ['where_i_stand', 'goalStand', 'goalStandText'],
  ['find_direction', 'goalDirection', 'goalDirectionText'],
  ['switch_career', 'goalSwitch', 'goalSwitchText'],
  ['grow_field', 'goalGrow', 'goalGrowText'],
]

export default ({ t, state }) => {
  const chosen = state.profile?.preferences?.careerGoal
  const current = chosen?.state === 'value' ? chosen.value : null
  return `<h1>${esc(t('goalTitle'))}</h1><p class="lead">${esc(t('goalLead'))}</p>
<div class="grid g2">${GOALS.map(([value, label, text]) => `<button class="choice${current === value ? ' sel' : ''}" data-act="goal" data-arg="${value}"><b>${esc(t(label))}</b><span class="small muted">${esc(t(text))}</span></button>`).join('')}</div>`
}
