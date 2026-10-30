// The landing page (welcome screen). Every figure names its source on screen: the guide's three figures are
// quoted with their original source; the data counts come from data/ (tests/landing.test.js checks them).
import { esc } from '../ui.js'

// Quoted in the Aiversecity Domain 1 Finalist Guide, section 1. One accent each.
export const GUIDE_FACTS = [
  { value: '56%', label: 'ldFact1', source: 'ldSrcHays', accent: 'pink' },
  { value: '26%', label: 'ldFact2', source: 'ldSrcHays', accent: 'blue' },
  { value: '600,000+', label: 'ldFact3', source: 'ldSrcMosti', accent: 'lime' },
]
const GAP_POINTS = 56 - 26

// The six stages of the guide's Final Demo Journey (section 4). Only the profile module is built.
export const STAGES = [
  { id: 'profile', title: 'ldS1T', text: 'ldS1D', live: true, accent: 'pink' },
  { id: 'radar', title: 'ldS2T', text: 'ldS2D', accent: 'blue' },
  { id: 'match', title: 'ldS3T', text: 'ldS3D', accent: 'lime' },
  { id: 'roadmap', title: 'ldS4T', text: 'ldS4D', accent: 'pink' },
  { id: 'sdg', title: 'ldS5T', text: 'ldS5D', accent: 'blue' },
  { id: 'futures', title: 'ldS6T', text: 'ldS6D', accent: 'lime' },
]

// Row counts of the stored data (see data/SOURCES.md).
export const DATA_FACTS = [
  { id: 'onet', count: 1016, label: 'ldD1', source: 'ldD1Src' },
  { id: 'emasco', count: 1766, label: 'ldD2', source: 'ldD2Src' },
  { id: 'isced', count: 124, linked: 118, label: 'ldD3', source: 'ldD3Src' },
  { id: 'interests', count: 41, label: 'ldD4', source: 'ldD4Src' },
]

const PRINCIPLES = [['ldP1T', 'ldP1D'], ['ldP2T', 'ldP2D'], ['ldP3T', 'ldP3D'], ['ldP4T', 'ldP4D']]
const AUDIENCES = [['catA', 'catAText', true], ['catB', 'catBText', true], ['catC', 'catCText', false], ['catD', 'catDText', false]]
const LANGS = [['en', 'EN'], ['ms', 'BM'], ['zh', '中文']]
const num = (n) => n.toLocaleString('en')

const langSwitch = (state) => `<div class="lp-lang" role="group">${LANGS.map(([k, n]) =>
  `<button class="${state.lang === k ? 'on' : ''}" data-act="lang" data-arg="${k}" aria-pressed="${state.lang === k}">${n}</button>`).join('')}</div>`

const sourced = (t, text) => `<span class="lp-src"><b>${esc(t('ldSourced'))}</b> ${esc(text)}</span>`

function hero(t) {
  const [before, after] = t('heroLine').split('{em}')
  return `
<section class="lp-hero">
 <div class="lp-hero-copy">
  <p class="lp-kicker"><i class="lp-dot"></i>${esc(t('ldKicker'))}</p>
  <h1 class="lp-display">${esc(before)}<em>${esc(t('heroEm'))}</em>${esc(after ?? '')}</h1>
  <p class="lp-sub">${esc(t('heroSub'))}</p>
  <div class="lp-cta">
   <button class="lp-btn lp-btn-ink" data-go="access">${esc(t('start'))} <span aria-hidden="true">→</span></button>
   <button class="lp-btn lp-btn-line" data-act="scrollTo" data-arg="how">${esc(t('ldHowLink'))}</button>
  </div>
  <p class="lp-note">${esc(t('ldGuestNote'))}</p>
 </div>
 <aside class="lp-facts" aria-label="${esc(t('ldFactsTitle'))}">
  <p class="lp-facts-title">${esc(t('ldFactsTitle'))}</p>
  ${GUIDE_FACTS.map((fact, i) => `
  <div class="lp-fact lp-fact-${fact.accent}" style="--i:${i}">
   <div class="lp-fact-value">${esc(fact.value)}</div>
   <p class="lp-fact-label">${esc(t(fact.label))}</p>
   ${sourced(t, `${t(fact.source)}, ${t('ldFactVia')}`)}
  </div>`).join('')}
  <p class="lp-gap"><span class="lp-tag">${esc(t('ldCalc'))}</span> ${esc(t('ldGap', { n: GAP_POINTS }))}</p>
 </aside>
</section>
<div class="lp-strip" aria-hidden="true">${['form', 'radar', 'match', 'roadmap', 'sdg', 'futures'].map((k, i) =>
  `<span><b>${String(i + 1).padStart(2, '0')}</b>${esc(t(k))}</span>`).join('<i>→</i>')}</div>`
}

const question = (t) => `
<section class="lp-section lp-question">
 <p class="lp-label">${esc(t('ldQKicker'))}</p>
 <div>
  <blockquote class="lp-quote">${esc(t('atmTitle'))}</blockquote>
  <p class="lp-body">${esc(t('atmBody'))}</p>
  <div class="lp-row lp-question-foot">
   <button class="lp-btn lp-btn-line lp-btn-sm" data-act="replayIntro">↺ ${esc(t('introReplay'))}</button>
   <p class="lp-draft">${esc(t('atmNote'))}</p>
  </div>
 </div>
</section>`

function stageCard(t, stage, i) {
  const n = String(i + 1).padStart(2, '0')
  if (stage.live) {
    return `
  <article class="lp-stage lp-stage-live">
   <div class="lp-stage-top"><span class="lp-num">${n}</span><span class="lp-pill lp-pill-live"><i class="lp-dot"></i>${esc(t('ldLive'))}</span></div>
   <h3 class="lp-stage-title">${esc(t(stage.title))}</h3>
   <p>${esc(t(stage.text))}</p>
   <ul class="lp-ticks">${['ldS1a', 'ldS1b', 'ldS1c'].map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>
   <button class="lp-btn lp-btn-lime" data-go="access">${esc(t('ldBuild'))} <span aria-hidden="true">→</span></button>
  </article>`
  }
  return `
  <article class="lp-stage" style="--a:var(--lp-${stage.accent})">
   <div class="lp-stage-top"><span class="lp-num">${n}</span></div>
   <h3 class="lp-stage-title">${esc(t(stage.title))}</h3>
   <p>${esc(t(stage.text))}</p>
   <span class="lp-pill lp-pill-next">${esc(t('ldNext'))}</span>
  </article>`
}

const how = (t) => `
<section class="lp-section" id="how">
 <header class="lp-head">
  <p class="lp-label">${esc(t('ldHowKicker'))}</p>
  <h2 class="lp-h2">${esc(t('ldHowTitle'))}</h2>
  <p class="lp-lead">${esc(t('ldHowLead'))}</p>
 </header>
 <div class="lp-bento">${STAGES.map((stage, i) => stageCard(t, stage, i)).join('')}</div>
</section>`

const data = (t) => `
<section class="lp-section" id="data">
 <header class="lp-head">
  <p class="lp-label">${esc(t('ldDataKicker'))}</p>
  <h2 class="lp-h2">${esc(t('ldDataTitle'))}</h2>
  <p class="lp-lead">${esc(t('ldDataLead'))}</p>
 </header>
 <div class="lp-data">
  ${DATA_FACTS.map((fact) => `
  <div class="lp-datum${fact.linked ? ' lp-datum-wide' : ''}">
   <div class="lp-datum-n">${num(fact.count)}</div>
   <p class="lp-datum-label">${esc(t(fact.label))}</p>
   ${fact.linked ? `
   <div class="lp-meter" role="img" aria-label="${esc(t('ldD3Bridge', { linked: fact.linked, count: fact.count }))}"><i style="width:${(100 * fact.linked / fact.count).toFixed(1)}%"></i></div>
   <p class="lp-meter-note">${esc(t('ldD3Bridge', { linked: fact.linked, count: fact.count }))}</p>` : ''}
   <p class="lp-mono">${esc(t(fact.source))}</p>
  </div>`).join('')}
 </div>
 <p class="lp-foot-note">${esc(t('ldDataNote'))}</p>
</section>`

const principles = (t) => `
<section class="lp-section" id="principles">
 <header class="lp-head">
  <p class="lp-label">${esc(t('ldPrKicker'))}</p>
  <h2 class="lp-h2">${esc(t('ldPrTitle'))}</h2>
 </header>
 <div class="lp-principles">${PRINCIPLES.map(([title, text], i) => `
  <div class="lp-principle"><span class="lp-pnum">${i + 1}</span><h3>${esc(t(title))}</h3><p>${esc(t(text))}</p></div>`).join('')}
 </div>
</section>`

const audiences = (t) => `
<section class="lp-section lp-who">
 <header class="lp-head">
  <p class="lp-label">${esc(t('ldWhoKicker'))}</p>
  <h2 class="lp-h2">${esc(t('ldWhoTitle'))}</h2>
 </header>
 <ul class="lp-list">${AUDIENCES.map(([title, text, open]) => `
  <li><div><h3>${esc(t(title))}</h3><p>${esc(t(text))}</p></div>
   <span class="lp-pill ${open ? 'lp-pill-open' : 'lp-pill-next'}">${esc(t(open ? 'ldOpen' : 'preview'))}</span></li>`).join('')}
 </ul>
</section>`

const closing = (t) => `
<section class="lp-close">
 <h2 class="lp-display lp-display-sm">${esc(t('ldCtaTitle'))}</h2>
 <p>${esc(t('ldCtaSub'))}</p>
 <div class="lp-cta">
  <button class="lp-btn lp-btn-lime" data-go="access">${esc(t('start'))} <span aria-hidden="true">→</span></button>
  <button class="lp-btn lp-btn-ghost" data-go="access">${esc(t('signin'))}</button>
 </div>
</section>`

const footer = (t, state) => `
<footer class="lp-footer">
 <div class="lp-footer-top">
  <div class="lp-brand">FutureReady <span>MY</span></div>
  <div class="lp-row"><span class="lp-muted">${esc(t('ldFootLang'))}</span>${langSwitch(state)}</div>
 </div>
 <p>${esc(t('ldFootAbout'))}</p>
 <p>${esc(t('ldFootOnet'))}</p>
 <p class="lp-muted">${esc(t('langNote'))}</p>
</footer>`

const nav = (t, state) => `
<nav class="lp-nav">
 <div class="lp-brand">FutureReady <span>MY</span></div>
 <div class="lp-links">
  <button data-act="scrollTo" data-arg="how">${esc(t('ldNavHow'))}</button>
  <button data-act="scrollTo" data-arg="data">${esc(t('ldNavData'))}</button>
  <button data-act="scrollTo" data-arg="principles">${esc(t('ldNavPrinciples'))}</button>
 </div>
 <div class="lp-row">
  ${langSwitch(state)}
  <button class="lp-btn lp-btn-ink lp-btn-sm" data-go="access">${esc(t('start'))}</button>
 </div>
</nav>`

export default ({ t, state }) => `
<div class="lp">
 ${nav(t, state)}
 ${hero(t)}
 ${question(t)}
 ${how(t)}
 ${data(t)}
 ${principles(t)}
 ${audiences(t)}
 ${closing(t)}
 ${footer(t, state)}
</div>`
