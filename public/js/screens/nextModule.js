import { esc } from '../ui.js'

// The diagram's downstream boxes (assessment, matching, roadmap, SDG, futures) belong to the next module.
export default ({ t, screen }) => `<h1>${esc(t(screen))}</h1><div class="next"><b>${esc(t('nextTitle'))}</b><br>${esc(t('nextText'))}</div>`
