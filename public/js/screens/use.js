import { esc } from '../ui.js'

// The first question after Get started on the landing page: for myself (the individual journey) or for my
// organisation (HR / L&D, TVET and university career centres; an account is needed).
const USES = [['personal', 'usePersonal', 'usePersonalText'], ['org', 'useOrg', 'useOrgText']]

export default ({ t }) => `
<div class="grid g2" style="align-items:center">
 <div>
  <h1>${esc(t('useTitle'))}</h1><p class="lead">${esc(t('heroSub'))}</p>
  <div class="grid">${USES.map(([k, n, d]) => `<button class="choice" data-act="use" data-arg="${k}"><b>${esc(t(n))}</b><span class="small muted">${esc(t(d))}</span></button>`).join('')}</div>
 </div>
 <div class="slot"><div class="receipt">
  <div class="tiny muted" style="margin-bottom:6px">${esc(t('atmNote'))}</div>
  <h3>${esc(t('atmTitle'))}</h3>
  <p class="small muted" style="margin:6px 0 12px">${esc(t('atmBody'))}</p>
 </div></div>
</div>`
