import { esc } from '../ui.js'

// Filled in by a later task of the plan; until then the screen says so.
export default ({ t }) => `<h1>${esc(t('form'))}</h1><div class="next">${esc(t('buildingNote'))}</div>`
