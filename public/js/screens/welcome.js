import { btn, esc } from '../ui.js'

export default ({ t, state }) => `
<div class="grid g2" style="align-items:center">
 <div>
  <h1>${esc(t('hero'))}</h1><p class="lead">${esc(t('heroSub'))}</p>
  <div class="card" style="margin-bottom:16px">
   <h3>${esc(t('chooseLang'))}</h3>
   <div class="row" style="margin-top:8px">
    ${[['en', 'English'], ['ms', 'Bahasa Melayu'], ['zh', '中文']].map(([k, n]) => btn(n, { act: 'lang', arg: k, kind: state.lang === k ? 'pri' : '' })).join('')}
   </div>
   <p class="tiny muted" style="margin-top:8px">${esc(t('langNote'))}</p>
  </div>
  <div class="row">${btn(`${t('start')} →`, { go: 'access', kind: 'pri' })}${btn(t('signin'), { go: 'access' })}</div>
 </div>
 <div class="card">
  <div class="tiny muted" style="margin-bottom:6px">${esc(t('atmNote'))}</div>
  <h3>${esc(t('atmTitle'))}</h3>
  <p class="small muted" style="margin:6px 0 12px">${esc(t('atmBody'))}</p>
 </div>
</div>`
