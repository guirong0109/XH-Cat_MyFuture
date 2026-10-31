// Study pathway screen parts (#pathway, mockup docs/mockup-pathway.html): Part 1 "Study route" and Part 2 "Skills to
// build". Pure string renderers on one answer of POST /api/pathway (public/js/pathwayApi.js); the page is
// public/js/screens/pathway.js. Every text goes through esc(), every link through safeUrl() and opens in a new tab.
// A team pick not yet reviewed carries no review label here (owner P15); an approved one shows the owner's date.
import { esc } from '../ui.js'
import { safeUrl } from '../components/evidencePanel.js'
import { day, fmt1, stepText } from './match.js'

const LEVEL = { basic: 'mtLevel_basic', good: 'mtLevel_good', expert: 'mtLevel_expert' }
const KIND = { kn: 'pwKind_kn', el: 'pwKind_el' }
const WORD_OF = { 2: 'basic', 4: 'good', 6: 'expert' }
const arr = (v) => (Array.isArray(v) ? v : [])
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const level = (t, word) => (LEVEL[word] ? t(LEVEL[word]) : String(word ?? ''))

// An external link (new tab, noopener), or the plain text when the link is not http(s).
export function ext(url, text, cls = '') {
  const u = safeUrl(url)
  return u ? `<a${cls ? ` class="${cls}"` : ''} href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text)
}
const tag = (kind, text) => `<span class="tag ${kind}">${esc(text)}</span>`
const sub = (text) => `<div class="pw-sub">${esc(text)}</div>`

// "Sources: <name>, <date>, <licence> · …" from the answer's sources, by id. The picks source is named in our words.
export function sourceLine(t, sources, ids, extra = [], attr = '') {
  const byId = new Map(arr(sources).map((s) => [s.id, s]))
  const pieces = ids.flatMap((id) => (id.endsWith('*') ? arr(sources).filter((s) => s.id.startsWith(id.slice(0, -1))) : byId.has(id) ? [byId.get(id)] : []))
    .map((s) => {
      const name = s.name ?? s.id
      const bits = [s.date ? day(s.date) : '', s.licence ?? ''].filter(Boolean).map(esc).join(', ')
      return `${ext(s.url, name)}${bits ? `, ${bits}` : ''}`
    })
  return `<div class="pw-src"${attr}>${esc(t('pwSrcLabel'))} ${[...pieces, ...extra.map(esc)].join(' · ')}</div>`
}

// Site id -> name, from the sources and every search link of the answer (a course pick names its site by id).
export function siteNames(answer) {
  const names = new Map()
  for (const s of arr(answer?.sources)) if (String(s.id).startsWith('site:')) names.set(s.id.slice(5), s.name)
  const fields = arr(answer?.route?.fields)
  const steps = answer?.steps ? [...arr(answer.steps.gaps), ...arr(answer.steps.notAssessed), ...arr(answer.steps.met)] : []
  for (const x of [...fields, ...steps]) for (const l of arr(x.search)) if (!names.has(l.site) && l.name) names.set(l.site, l.name)
  return names
}

const review = (t, approvedAt) => (typeof approvedAt === 'string' && approvedAt ? ` ${tag('t-ok', t('pwApprovedOn', { date: day(approvedAt) }))}` : '')
const checked = (t, p, before = '') => ` <span class="tiny muted">${before ? `${esc(before)} · ` : ''}${esc(t('pwChecked', { date: day(p.checkedAt) }))}</span>`

// One pick: who offers it, its linked name, the owner's approval date (if any), the date it was checked.
function pickItem(t, who, p, before = '') {
  return `<li><span class="pw-site">${esc(who)}</span> ${ext(p.link, `${p.name ?? ''} ↗`)}${review(t, p.approvedAt)}${checked(t, p, before)}</li>`
}
function courseList(t, names, list) {
  const shown = arr(list)
  if (!shown.length) return `<p class="small muted">${esc(t('pwNoPick'))}</p>`
  return `<ul class="pw-picks">${shown.map((p) => pickItem(t, p.siteName ?? names.get(p.site) ?? p.site ?? '', p)).join('')}</ul>`
}
function moreOn(t, links) {
  const list = arr(links).filter((l) => safeUrl(l?.url))
  if (!list.length) return ''
  return `<div class="pw-more"><span class="muted">${esc(t('pwMoreOn'))}</span>${list.map((l) => ext(l.url, `${l.name ?? l.site} ↗`, 'pw-chip')).join('')}</div>`
}

// ---------- Part 1: study route ----------

function usLine(t, education) {
  if (!education) return `<p class="small muted"><b>${esc(t('pwInUs'))}</b> ${esc(t('pwUsNone'))}</p>`
  const top = arr(education.top)
  const label = top.map((r) => r.label).join(' / ')
  const percent = top.length ? top[0].percent : '—'
  const rows = arr(education.all).filter((r) => isNum(r.percent) && r.percent > 0)
  const bars = rows.map((r) => `<div class="pw-ebar"><span>${esc(r.label)}</span><span class="bar"><i style="width:${Math.max(0, Math.min(100, r.percent))}%"></i></span><span>${esc(r.percent)}%</span></div>`).join('')
  const supp = education.suppressedLeftOut > 0 ? ` ${esc(t('pwEduSuppressed', { count: education.suppressedLeftOut }))}` : ''
  return `<div class="pw-row"><b>${esc(t('pwInUs'))}</b> ${esc(t('pwInUsText', { label, percent }))} ${tag('t-src', t('pwUsTag'))}</div>
    <details class="pw-fold"><summary>${esc(t('pwEduAll'))}</summary>${bars}<p class="tiny muted">${esc(t('pwEduZero'))}${supp}</p></details>`
}

// The usual education level: eMASCO's qualification first (P14), then the US levels (none when the chain is broken).
export function educationCard(t, a, broken) {
  const q = a.qualification ?? {}
  const qual = typeof q.text === 'string' && q.text
    ? `<div class="pw-edu"><span class="pw-big">${esc(q.text)}</span>${tag('t-src', t('pwEmascoTag'))}</div>`
    : `<div class="pw-edu"><span class="pw-none">${esc(t('pwEmascoNone'))}</span>${tag('t-src', t('pwEmascoTag'))}</div>`
  const page = safeUrl(q.url) ? ` (${ext(q.url, t('mtEmascoPage'))})` : ''
  const what = `<p class="tiny muted pw-what">${esc(t('pwEmascoWhat', { code: a.code ?? '' }))}${page}</p>`
  const missing = a.chain?.missingStep
  const us = broken
    ? `<div class="mt-note warn"><b>${esc(t('mtNotAvailable'))}:</b> ${esc(stepText(t, missing))}</div>`
    : usLine(t, a.route?.education)
  const ids = broken ? ['emasco-qualification', 'bridge'] : ['emasco-qualification', 'onet']
  return `<div class="card pw-card"><h3>${esc(t('pwEduTitle'))}</h3>${qual}${what}${us}${sourceLine(t, a.sources, ids)}</div>`
}

function fieldBlock(t, names, f) {
  const cips = arr(f.cips)
  const cipText = cips.map((c) => `${c.code} ${c.title}${c.partial ? ` (${t('pwCipPartial')})` : ''}`).join(' · ')
  const acc = arr(f.programmes)
  const prof = arr(f.professional)
  const accList = acc.length
    ? `<ul class="pw-picks">${acc.map((p) => pickItem(t, p.institution ?? '', p, p.mqrRef ? t('pwMqaRef', { ref: p.mqrRef }) : t('pwMqaRefNone'))).join('')}</ul>`
    : `<p class="small muted">${esc(t('pwNoProgPick'))}</p>`
  const mqr = f.mqr ?? {}
  // No NEC code where MQR numbers the field differently (the field is named instead); a code checked by name in MQR
  // has its own label; otherwise the code is the field's own (code match, not an official table).
  const nec = mqr.nec
    ? `<span class="muted">${esc(t('pwMqrNec', { code: mqr.nec }))}</span>${tag('mt-none', t(mqr.necChecked ? 'pwNecChecked' : 'pwCodeMatch'))}`
    : `<span class="muted">${esc(t('pwMqrNecField', { title: f.title ?? f.code }))}</span>`
  const register = `<div class="pw-more">${ext(mqr.url, `${t(acc.length ? 'pwMqrMore' : 'pwMqrFind')} ↗`)}${nec}</div>`
  const profList = prof.length ? `${sub(t('pwProfessional'))}<ul class="pw-picks">${prof.map((p) => pickItem(t, p.body ?? p.institution ?? '', p)).join('')}</ul>` : ''
  const courses = arr(f.courses).length ? `${sub(t('pwFieldCourses'))}${courseList(t, names, f.courses)}` : ''
  return `<div class="pw-field${f.yours ? ' pw-yours' : ''}">
    <div class="pw-fhead"><span class="pw-code">ISCED-F ${esc(f.code)}</span><b>${esc(f.title)}</b>${f.yours ? tag('t-ok', t('pwYourField')) : ''}${f.partial ? tag('mt-none', t('pwPartial')) : ''}</div>
    <details class="pw-fold"><summary>${esc(t('pwCips', { count: cips.length }))}</summary><p class="tiny muted">${esc(cipText)}</p></details>
    ${sub(t('pwAccredited'))}${accList}${register}${profList}${courses}${moreOn(t, f.search)}
  </div>`
}

export function fieldsCard(t, a) {
  const names = siteNames(a)
  const fields = arr(a.route?.fields)
  const body = fields.length ? fields.map((f) => fieldBlock(t, names, f)).join('') : `<p class="small muted">${esc(t('pwFieldsNone'))}</p>`
  return `<div class="card pw-card"><h3>${esc(t('pwFieldsTitle'))} ${tag('t-src', t('pwSourced'))}</h3>
    <p class="small muted">${esc(t('pwFieldsLead'))}</p>${body}
    ${sourceLine(t, a.sources, ['isced-cip', 'cip-onet', 'pathway-picks'], [t('pwSrcMqr')], ' data-src="fields"')}</div>`
}

// ---------- Part 2: skills to build ----------

// Started / Done for one O*NET item key, shared by every target. Pressing the one that is on clears it.
export function progressButtons(t, key, progress) {
  const now = progress?.[key]?.state
  const btn = (state, act, label) => {
    const on = now === state
    return `<button class="btn sm${on ? ' on' : ''}" type="button" data-act="${on ? 'pwClear' : act}" data-arg="${esc(key)}" aria-pressed="${on}">${esc(t(label))}</button>`
  }
  return `<div class="pw-prog">${btn('started', 'pwStarted', 'pwStarted')}${btn('done', 'pwDone', 'pwDone')}${tag('t-self', t('pwSelf'))}${now === 'done' ? `<span class="tiny muted">${esc(t('pwDoneNote'))}</span>` : ''}</div>`
}

function gapStep(t, names, s, i, progress) {
  const you = s.status === 'missing' ? `<b>${esc(t('pwNotInProfile'))}</b>` : `${esc(t('pwYourLevel'))} <b>${esc(level(t, s.from ?? WORD_OF[s.you]))}</b>`
  const short = s.stillShort ? ` ${tag('mt-none', t('mtStillShort'))}` : ''
  return `<div class="card pw-step">
    <div class="pw-no">${i + 1}</div>
    <div class="pw-body"><h3>${esc(s.name)} ${tag('mt-none', KIND[s.kind] ? t(KIND[s.kind]) : s.kind ?? '')}</h3>
      <div class="pw-lvl">${you} → ${esc(t('pwNeededWord'))} <b>${esc(level(t, s.to))}</b> <span class="tiny muted">${esc(t('pwOnetLevel', { level: fmt1(s.needed) }))}</span>${short}</div>
      ${courseList(t, names, s.courses)}${moreOn(t, s.search)}
    </div>
    <div class="pw-pts"><b>+${esc(s.points ?? 0)}</b><div class="tiny muted">${esc(t('pwPoints'))}</div></div>
    ${progressButtons(t, s.key, progress)}
  </div>`
}

function naStep(t, names, s, progress) {
  return `<div class="card pw-step">
    <div class="pw-no">?</div>
    <div class="pw-body"><h3>${esc(s.name)}</h3>
      <div class="pw-lvl">${esc(t('pwNeeded'))} <b>${esc(level(t, s.to))}</b> · <button class="btn ghost sm pw-link" type="button" data-act="editSkills">${esc(t('pwSetLevel'))}</button></div>
      ${courseList(t, names, s.courses)}${moreOn(t, s.search)}
    </div>
    <div></div>
    ${progressButtons(t, s.key, progress)}
  </div>`
}

const partHead = (t, n, title) => `<h2 class="pw-h2"><span class="pw-pn">${esc(t('pwPart', { n }))}</span> ${esc(t(title))}</h2>`

export function partTwo(t, a, progress) {
  const head = partHead(t, 2, 'pwPart2Title')
  if (!a.steps) {
    return `${head}<div class="card mt-thin"><p class="small">${esc(t('pwThin'))}</p>
      <div class="mt-actions"><button class="btn pri" type="button" data-act="editSkills">${esc(t('pwAddSkills'))}</button></div></div>`
  }
  const names = siteNames(a)
  const gaps = arr(a.steps.gaps)
  const na = arr(a.steps.notAssessed)
  const met = arr(a.steps.met)
  const total = [...gaps, ...na, ...met].reduce((sum, s) => sum + (isNum(s.needed) ? s.needed : 0), 0)
  const gapCards = gaps.length ? gaps.map((s, i) => gapStep(t, names, s, i, progress)).join('') : `<p class="small muted">${esc(t('pwNoGaps'))}</p>`
  const naGroup = na.length
    ? `<div class="pw-grouph">${esc(t('pwNaTitle'))} <span class="pw-why">${esc(t('pwNaWhy'))}</span></div>${na.map((s) => naStep(t, names, s, progress)).join('')}`
    : ''
  const metLine = (s) => `<li>${esc(s.name)} <span class="tiny muted">${esc(t('pwMetLine', { you: level(t, s.from ?? WORD_OF[s.you]) || fmt1(s.you), needed: level(t, s.to) }))}</span></li>`
  const metGroup = `<details class="card pw-met"><summary>${esc(t('pwMetTitle', { count: met.length }))}</summary><ul class="pw-picks">${met.map(metLine).join('')}</ul></details>`
  return `${head}<p class="small muted">${esc(t('pwPart2Lead', { total: total.toFixed(2) }))}</p>
    <div class="pw-grouph">${esc(t('pwToBuild'))} <span class="pw-why">${esc(t('pwSkillsCount', { count: gaps.length }))}</span></div>
    ${gapCards}${naGroup}${metGroup}
    ${sourceLine(t, a.sources, ['onet', 'bridge', 'pathway-picks', 'site:*'])}`
}

export function partOne(t, a, broken) {
  return `${partHead(t, 1, 'pwPart1Title')}<p class="small muted">${esc(t('pwPart1Lead'))}</p>
    ${educationCard(t, a, broken)}${broken ? '' : fieldsCard(t, a)}`
}
