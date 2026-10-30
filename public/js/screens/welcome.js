// The landing page (welcome screen). Every figure names its source on screen: the guide's three figures are
// quoted with their original source; the data counts come from data/ (tests/landing.test.js checks them).
import { esc } from '../ui.js'
import { odometer } from '../components/odometer.js'

// Quoted in the Aiversecity Domain 1 Finalist Guide, section 1. Shown side by side in the second section.
export const GUIDE_FACTS = [
  { value: '56%', heading: 'ldTally1', label: 'ldFact1', source: 'ldSrcHays' },
  { value: '26%', heading: 'ldTally2', label: 'ldFact2', source: 'ldSrcHays' },
  { value: '600,000+', heading: 'ldTally3', label: 'ldFact3', source: 'ldSrcMosti' },
]
const GAP_POINTS = 56 - 26

// The six stages of the guide's Final Demo Journey (section 4). Only the profile module is built.
export const STAGES = [
  { id: 'profile', name: 'form', title: 'ldS1T', text: 'ldS1D', live: true },
  { id: 'radar', name: 'radar', title: 'ldS2T', text: 'ldS2D' },
  { id: 'match', name: 'match', title: 'ldS3T', text: 'ldS3D' },
  { id: 'roadmap', name: 'roadmap', title: 'ldS4T', text: 'ldS4D' },
  { id: 'sdg', name: 'sdg', title: 'ldS5T', text: 'ldS5D' },
  { id: 'futures', name: 'futures', title: 'ldS6T', text: 'ldS6D' },
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

// The first section. app.js mounts the three.js ATM into .lp-atm-canvas: it waits for a click, prints the question
// section on a receipt that stays pinned, and the headline with its buttons rises in beside it. The HTML receipt
// carries the same story: read out to screen readers, and on screen when the 3D intro does not play (body.no-intro).
function atm(t) {
  const [before, after] = t('heroLine').split('{em}')
  return `
<section class="lp-atm" aria-label="${esc(t('introStage'))}">
 <div class="lp-atm-canvas"></div>
 <div class="lp-atm-copy">
  <h1 class="lp-display">${esc(before)}<em>${esc(t('heroEm'))}</em>${esc(after ?? '')}</h1>
  <p class="lp-sub">${esc(t('heroSub'))}</p>
  <div class="lp-cta">
   <button class="lp-btn lp-btn-ink" data-go="access">${esc(t('start'))} <span aria-hidden="true">→</span></button>
   <button class="lp-btn lp-btn-line" data-act="scrollTo" data-arg="how">${esc(t('ldHowLink'))}</button>
  </div>
  <p class="lp-note">${esc(t('ldGuestNote'))}</p>
 </div>
 <article class="lp-receipt">
  <p class="lp-receipt-brand">FUTUREREADY MY</p>
  <p class="lp-receipt-title">${esc(t('introTitle'))}</p>
  <p class="lp-receipt-label">— ${esc(t('ldQKicker'))}</p>
  <blockquote class="lp-receipt-quote">${esc(t('atmTitle'))}</blockquote>
  <p class="lp-receipt-body">${esc(t('atmBody'))}</p>
  <p class="lp-receipt-note">${esc(t('atmNote'))}</p>
  <div class="lp-receipt-code" aria-hidden="true"></div>
 </article>
</section>`
}

// The second section: the guide's figures side by side, each a heading, its roller counter and a caption. A bracket
// under the first two joins them with the calculated gap; the sources sit in one footnote.
function gap(t) {
  const [use, trained, workers] = GUIDE_FACTS
  const col = (fact, i) => `
  <div class="lp-tally-col">
   <p class="lp-tally-head">${esc(t(fact.heading))}</p>
   <div class="lp-tally-n">${odometer(fact.value, `fact-${i}`)}</div>
   <p class="lp-tally-cap">${esc(t(fact.label))}</p>
  </div>`
  return `
<section class="lp-section lp-gapsec" id="gap">
 <header class="lp-head">
  <p class="lp-label">${esc(t('ldFactsTitle'))}</p>
  <h2 class="lp-h2">${esc(t('ldGapTitle'))}</h2>
 </header>
 <div class="lp-tally">
  ${GUIDE_FACTS.map(col).join('')}
  <p class="lp-gapnote"><span class="lp-tag">${esc(t('ldCalc'))}</span> ${esc(t('ldGap', { n: GAP_POINTS }))}</p>
 </div>
 <div class="lp-tally-src">
  ${sourced(t, `${use.value} · ${trained.value} — ${t(use.source)}, ${t('ldFactVia')}`)}
  ${sourced(t, `${workers.value} — ${t(workers.source)}, ${t('ldFactVia')}`)}
 </div>
</section>`
}

// The working stage's gauge: a cell per stage, filled when that stage is built.
function quest(t) {
  const built = t('ldBuilt', { n: STAGES.filter((stage) => stage.live).length, total: STAGES.length })
  return `
   <div class="lp-quest" role="img" aria-label="${esc(built)}">${STAGES.map((stage) => `<span class="lp-quest-step${stage.live ? ' on' : ''}"></span>`).join('')}</div>
   <p class="lp-quest-note">${esc(built)}</p>`
}

const stageNumber = (stage) => String(STAGES.indexOf(stage) + 1).padStart(2, '0')

// The working stage: a white card with its gauge, its steps and the button.
function liveCard(t, stage) {
  const n = stageNumber(stage)
  return `
  <article class="lp-stage lp-stage-live">
   <div class="lp-live-a">
    <div class="lp-stage-top"><span class="lp-num">${n}</span><span class="lp-pill lp-pill-live"><i class="lp-dot"></i>${esc(t('ldLive'))}</span></div>
    ${quest(t)}
    <h3 class="lp-stage-title">${esc(t(stage.title))}</h3>
   </div>
   <div class="lp-live-b">
    <p>${esc(t(stage.text))}</p>
    <ul class="lp-ticks">${['ldS1a', 'ldS1b', 'ldS1c'].map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>
    <button class="lp-btn lp-btn-ink" data-go="access">${esc(t('ldBuild'))} <span aria-hidden="true">→</span></button>
   </div>
  </article>`
}

// The stages still to come, as one line of text under the white card: number and short name only.
const nextBanner = (t) => `
  <div class="lp-next">
   <p class="lp-next-label">${esc(t('ldNext'))}</p>
   <ol>${STAGES.filter((stage) => !stage.live).map((stage) => `<li><b>${stageNumber(stage)}</b>${esc(t(stage.name))}</li>`).join('')}</ol>
  </div>`

const how = (t) => `
<section class="lp-section lp-howsec" id="how">
 <header class="lp-head">
  <p class="lp-label">${esc(t('ldHowKicker'))}</p>
  <h2 class="lp-h2">${esc(t('ldHowTitle'))}</h2>
  <p class="lp-lead">${esc(t('ldHowLead'))}</p>
 </header>
 <div class="lp-bento">${STAGES.filter((stage) => stage.live).map((stage) => liveCard(t, stage)).join('')}${nextBanner(t)}</div>
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
   <div class="lp-datum-n">${odometer(num(fact.count), `data-${fact.id}`)}</div>
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

// The footer's mascot: the ATM from the first section, smiling and waving, a receipt curling out of its slot.
const MASCOT = `<svg class="lp-mascot" viewBox="0 0 132 150" aria-hidden="true">
 <g class="lp-mascot-arm"><path d="M100 70c14-4 20-14 20-28"/><circle cx="120" cy="36" r="6"/></g>
 <path d="M32 70c-10 6-14 16-12 28"/>
 <path d="M44 128v14h-8M76 128v14h8"/>
 <rect x="22" y="22" width="88" height="108" rx="12"/>
 <rect class="lp-mascot-ink" x="16" y="10" width="100" height="22" rx="7"/>
 <rect class="lp-mascot-ink" x="34" y="42" width="64" height="38" rx="7"/>
 <circle class="lp-mascot-eye" cx="54" cy="58" r="3.5"/><circle class="lp-mascot-eye" cx="78" cy="58" r="3.5"/>
 <path class="lp-mascot-smile" d="M54 67q12 9 24 0"/>
 <path d="M40 90h10M56 90h10M72 90h10M40 98h10M56 98h10M72 98h10"/>
 <rect class="lp-mascot-ink" x="42" y="108" width="48" height="5" rx="2.5"/>
 <path d="M48 111h36l-2 26q-8-5-16 1t-16-1z"/>
 <path d="M54 119h24M54 125h18"/>
</svg>`

// The footer: a panel under a dark band with a wavy edge, the about line, a large wordmark with the mascot, the
// language switch, and the small print (the O*NET licence asks for its line).
const footer = (t, state) => `
<footer class="lp-footer">
 <div class="lp-footer-band" aria-hidden="true"></div>
 <div class="lp-footer-body">
  <p class="lp-footer-about">${esc(t('ldFootAbout'))}</p>
  <div class="lp-footer-base">
   <div class="lp-wordmark">FutureReady${MASCOT}</div>
   <div class="lp-row"><span class="lp-muted">${esc(t('ldFootLang'))}</span>${langSwitch(state)}</div>
  </div>
  <div class="lp-footer-fine">
   <p>${esc(t('ldFootOnet'))}</p>
   <p>${esc(t('langNote'))}</p>
  </div>
 </div>
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
 ${atm(t)}
 ${gap(t)}
 ${how(t)}
 ${data(t)}
 ${principles(t)}
 ${audiences(t)}
 ${closing(t)}
 ${footer(t, state)}
</div>`
