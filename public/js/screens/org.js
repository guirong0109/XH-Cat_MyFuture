import { btn, esc } from '../ui.js'

export default ({ t }) => `<div class="banner b-warn"><div><b>${esc(t('orgBanner'))}</b> ${esc(t('orgBannerText'))}</div></div>
<h1>${esc(t('orgTitle'))}</h1><p class="lead">${esc(t('orgLead'))}</p>
<div class="row">${btn(t('orgTryIndividual'), { act: 'use', arg: 'personal' })}</div>`
