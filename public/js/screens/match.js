// Career matching screen (#match), as in the owner-approved mockup docs/mockup-matching.html (spec §8).
// Pure string renderers on the matching API answers (public/js/matchApi.js). The Skill Match never moves with the AI
// scenario or the SDG filter: the scenario only decides which of the four bands a role sits in, and the filter only
// hides roles. Every list and number names its source.
import { esc } from '../ui.js'
import { safeUrl } from '../components/evidencePanel.js'
import { fitChart } from '../components/fitChart.js'
import { movedRoles } from '../../../shared/matching/outlook.js'
import { sortValue } from '../../../shared/matching/overall.js'

const BANDS = [1, 2, 3, 4]
const BAND_TITLE = { 1: 'mtBand1', 2: 'mtBand2', 3: 'mtBand3', 4: 'mtBand4' }
const BAND_WHY = { 1: 'mtBand1Why', 2: 'mtBand2Why', 3: 'mtBand3Why', 4: 'mtBand4Why' }
const WORD_OF = { 2: 'basic', 4: 'good', 6: 'expert' }
const LEVEL = { basic: 'mtLevel_basic', good: 'mtLevel_good', expert: 'mtLevel_expert' }
const KIND = { el: 'mtKind_el', kn: 'mtKind_kn' }
const SRC_LABEL = {
  emasco: 'mtSrcRoles', onet: 'mtSrcOnet', bridge: 'mtSrcChain', aei: 'mtSrcModerate', ilo: 'mtSrcRapid',
  'sdg-targets': 'mtSrcSdgTargets', 'sdg-links': 'mtSrcSdgLinks',
}
const FIRST_BARS = 8
// Paging, not a limit: every role of a band stays reachable through the page buttons (owner UI round, 31 Oct).
export const PAGE_SIZE = 10
const ILO_WORD = { minimal: 'mtIlo_minimal', not_exposed: 'mtIlo_not_exposed' }

const ui = (state) => state?.match ?? {}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
export const fmt1 = (v) => (isNum(v) ? (Math.round(v * 10) / 10).toFixed(1) : '—')
export const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—')
export const scenarioOf = (m) => (m?.scenario === 'rapid' ? 'rapid' : 'moderate')
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const level = (t, word) => (LEVEL[word] ? t(LEVEL[word]) : String(word ?? ''))
export const reasonIn = (reason, lang) => (reason && typeof reason === 'object' ? reason[lang] ?? reason.en ?? '' : String(reason ?? ''))
// A detail answer (it has the role code) or null while it loads or after a failure.
export const loadedDetail = (d) => (d && typeof d === 'object' && typeof d.code === 'string' ? d : null)
const link = (url, text) => {
  const u = safeUrl(url)
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text)
}
const tagNone = (text) => `<span class="tag mt-none">${esc(text)}</span>`
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// The official UN page of a goal (1-17), or null. Every SDG tag links there (owner decision M16).
export const unGoalUrl = (goal) => {
  const n = Number(goal)
  return Number.isInteger(n) && n >= 1 && n <= 17 ? `https://sdgs.un.org/goals/goal${n}` : null
}
const goalOf = (target) => Number(String(target ?? '').split('.')[0])
export function sdgTag(goal, label, title = '') {
  const url = safeUrl(unGoalUrl(goal))
  const tip = title ? ` title="${esc(title)}"` : ''
  return url
    ? `<a class="tag mt-sdg" href="${esc(url)}" target="_blank" rel="noopener noreferrer"${tip}>${esc(label)}</a>`
    : `<span class="tag mt-sdg"${tip}>${esc(label)}</span>`
}
// "team draft, approved by owner on <date>" or "team draft, not yet reviewed" (M16).
export const reviewText = (t, approvedAt) => (typeof approvedAt === 'string' && approvedAt ? t('mtApprovedOn', { date: day(approvedAt) }) : t('mtNotReviewed'))

// Only the scenario and the chosen role are kept with the guest profile; the answers are fetched again.
export const matchToSave = (m) => ({ scenario: scenarioOf(m), chosen: typeof m?.chosen === 'string' ? m.chosen : null })

// The missing step of the code chain in the user's language, from its id and kind (shared/matching/chain.js). The
// data's own reason (bridge pendingReason, English) is only an extra detail, never the main text.
const STEP_KINDS = ['pending', 'no_row', 'invalid', 'no_onet_data']
const BLS_STEPS = ['masco2020_unit_to_isco08', 'soc2010_to_isco08', 'soc2018_to_soc2010']
export function stepReason(t, step) {
  if (!step) return ''
  const codes = (step.from?.codes ?? []).join(', ')
  const nameKey = `mtStepName_${step.id}`
  const name = t(nameKey)
  const kind = STEP_KINDS.includes(step.kind) ? step.kind : step.id === 'no_onet_data' ? 'no_onet_data' : 'pending'
  // These three steps are built from the BLS crosswalk files (pipeline/fetch_radar_bridge.py); say what they wait for.
  const key = kind === 'pending' && BLS_STEPS.includes(step.id) ? 'mtStep_waitsBls' : `mtStep_${kind}`
  return t(key, { step: name === nameKey ? String(step.id ?? '') : name, codes })
}
// "MASCO 2020 2512: the official step MASCO 2020 → ISCO-08 is not built yet"
export function stepText(t, step) {
  if (!step) return ''
  const from = [step.from?.system, (step.from?.codes ?? []).join(', ')].filter(Boolean).join(' ')
  const reason = stepReason(t, step)
  return from ? t('mtStepAt', { from, reason }) : reason
}

// ---------- the parts of a card ----------

function sidePanel(t, role, scenario = 'moderate', knowHow = null) {
  return `${skillBlock(t, role)}${aiTouchBlock(t, role, scenario)}${overallBlock(t, role, scenario, knowHow)}`
}

function skillBlock(t, role) {
  const sm = role.skillMatch
  const missing = role.unavailable?.missingStep
  if (!sm && missing) {
    return `<div class="tiny muted">${esc(t('mtSkillMatch'))}</div><div class="mt-big">${esc(t('mtNotAvailable'))}</div>
      <div class="tiny muted">${esc(t('mtNoLink'))} ${esc(t('mtMissing'))} ${esc(stepText(t, missing))}</div>`
  }
  if (!sm) {
    return `<div class="tiny muted">${esc(t('mtSkillMatch'))}</div><div class="mt-big">${esc(t('mtNoPct'))}</div><div class="tiny muted">${esc(t('mtNoPctText'))}</div>`
  }
  const pct = isNum(sm.percent) ? Math.max(0, Math.min(100, sm.percent)) : 0
  return `<div class="tiny muted">${esc(t('mtSkillMatch'))} ${sm.provisional ? `<span class="tag t-self">${esc(t('mtProvTag'))}</span>` : ''}</div>
    <div class="mt-pct">${esc(sm.percent)}%</div><div class="bar mt-bar"><i style="width:${pct}%"></i></div>
    <div class="small">${esc(t('mtSentence', { met: fmt1(sm.met), needed: fmt1(sm.needed), job: sm.onetTitle ?? sm.onetCode ?? '', percent: sm.percent }))}</div>
    <div class="tiny muted mt-gap"><span class="tag t-src">${esc(t('mtCalculated'))}</span> ${esc(t('mtFromOnet'))}</div>`
}

// Right column, under the Skill Match: how much AI touches the job in the scenario shown (an estimate, with its source and
// the purple bar). No data -> said in words, no bar.
function aiTouchBlock(t, role, scenario) {
  const touch = role.ai?.[scenario]?.touchPct
  const big = isNum(touch) ? `<div class="mt-aitouchpct">${esc(Math.round(touch))}%</div>` : ''
  return `<div class="mt-aitouch"><div class="tiny muted">${esc(t('mtAiTouch'))}</div>${big}${aiCard(t, role, scenario, isNum(touch) ? touch : null)}</div>`
}

// Under the AI block: Overall match for the scenario (calculated, with the sum written out), or the button that asks the four
// AI questions when there is none yet. A role with no Skill Match has no Overall.
function overallBlock(t, role, scenario, knowHow) {
  if (!role.skillMatch) return ''
  const om = role.overallMatch?.[scenario]
  if (om && isNum(om.percent)) {
    const pct = Math.max(0, Math.min(100, om.percent))
    const prov = om.provisional ? ` <span class="tag t-self">${esc(t('mtProvTag'))}</span>` : ''
    const kh = isNum(knowHow?.percent) ? knowHow.percent : isNum(om.knowHow?.percent) ? om.knowHow.percent : om.knowHow
    const how = om.noAiData || !isNum(om.touch)
      ? esc(t('mtOverallNoAi'))
      : esc(t('mtOverallSum', { skill: om.skill, rest: (1 - om.touch).toFixed(2), know: kh, touch: om.touch.toFixed(2), percent: om.percent }))
    return `<div class="mt-overall"><div class="tiny muted">${esc(t('mtOverall'))} <span class="tag t-src">${esc(t('mtCalculated'))}</span>${prov}</div>
      <div class="mt-overallpct">${esc(om.percent)}%</div><div class="bar mt-bar mt-overallbar"><i style="width:${pct}%"></i></div>
      <div class="tiny muted">${how}</div></div>`
  }
  if (!om && !knowHow) {
    return `<div class="mt-overall mt-overallask"><div class="tiny muted">${esc(t('mtOverall'))}</div>
      <p class="small">${esc(t('mtOverallAsk'))}</p><button class="btn sm pri" type="button" data-act="mAskAi">${esc(t('mtOverallBtn'))}</button></div>`
  }
  return ''
}

function comparedLine(t, role, d) {
  const sm = role.skillMatch
  const jobs = d?.jobs ?? []
  const best = sm ? { title: sm.onetTitle, code: sm.onetCode } : jobs[0] ?? null
  if (!best) return esc(t('mtNoJob'))
  const others = jobs.filter((j) => j.code !== best.code).map((j) => (isNum(j.percent) ? `${j.title ?? j.code} ${j.percent}%` : j.title ?? j.code))
  return `${esc(t('mtComparedWith'))} <b>${esc(best.title ?? best.code)}</b> (${esc(best.code)})${others.length ? ` · ${esc(t('mtAlso'))} ${esc(others.join(', '))}` : ''}`
}

function jobAdsText(t, ja, radar) {
  if (!ja?.available) return `${tagNone(t('mtNotAvailableTag'))} ${esc(t('mtAdsNoSignal'))}`
  const group = esc(t('mtGroup', { code: ja.groupCode ?? '' }))
  const period = radar?.observationPeriod ? ` ${radar.observationPeriod}` : ''
  const evidence = (ja.evidenceLinks ?? []).map((l) => safeUrl(l?.url) ? link(l.url, t('mtDosmLink')) : '').find(Boolean) ?? ''
  const where = `<span class="tiny muted">(${esc(t('mtGroupLevel'))} · DOSM${esc(period)}${evidence ? ` · ${evidence}` : ''})</span>`
  const path = (ja.path ?? []).map((p) => `${p.system} ${p.code}`).join(' → ')
  const pathLine = path ? `<div class="tiny muted">${esc(path)}</div>` : ''
  if (ja.sufficient && ja.direction) {
    const kind = ja.direction === 'declining' ? 't-bad' : 't-ok'
    return `<span class="tag ${kind}">${esc(t(`rdDir_${ja.direction}`))}</span> ${group} · ${esc(t('mtAdsWhat'))} ${where}${pathLine}`
  }
  const suffKey = ja.evidenceSufficiency ? `rdSuff_${ja.evidenceSufficiency}` : null
  const why = suffKey && t(suffKey) !== suffKey ? ` · ${esc(t(suffKey))}` : ''
  return `${tagNone(t('mtAdsInsufficient'))} ${group}${why} ${where}${pathLine}`
}

function aiText(t, ai, scenario) {
  const est = `<span class="tag t-est">${esc(t('mtEstimate'))}</span>`
  const much = (a) => (a?.changesMuch === true ? ` <span class="tag t-bad">${esc(t('mtChangesMuch'))}</span>` : '')
  if (scenario === 'rapid') {
    const a = ai?.rapid
    if (a?.available) {
      return `${est} ${esc(t('mtAiRapid', { gradient: a.values?.gradient ?? '—' }))}${much(a)} <span class="tiny muted">(${esc(t('mtAiRapidSrc', { isco: a.isco ?? '—' }))})</span>`
    }
    if (a?.missingStep) return `${tagNone(t('mtNotAvailableTag'))} ${esc(t('mtAiNoIsco'))} ${esc(t('mtMissing'))} ${esc(stepText(t, a.missingStep))}`
    return `${tagNone(t('mtNotAvailableTag'))} ${esc(t('mtAiNoIlo', { isco: a?.isco ?? '—' }))}`
  }
  const a = ai?.moderate
  if (a?.available) {
    const v = a.values ?? {}
    return `${est} ${esc(t('mtAiModerate', { share: fmt1(v.observedShare), auto: fmt1(v.automationPct), aug: fmt1(v.augmentationPct) }))}${much(a)} <span class="tiny muted">(${esc(t('mtAiModerateSrc', { job: a.onetCode ?? '—' }))})</span>`
  }
  if (!a?.onetCode) return `${tagNone(t('mtNotAvailableTag'))} ${esc(t('mtAiNoJob'))}`
  return `${tagNone(t('mtNoObserved'))} ${esc(t('mtAiNoCover'))}`
}

// Software asked: a one-line count, the 8 most useful chips (yours first, then "in demand"), the rest in a fold.
const SW_SHOWN = 8
export function softwareChips(t, list) {
  if (!list?.length) return `<span class="muted small">${esc(t('mtSwNone'))}</span>`
  const order = (s) => (s.have ? 0 : s.inDemand ? 1 : 2)
  const sorted = list.map((s, i) => ({ s, i })).sort((a, b) => order(a.s) - order(b.s) || a.i - b.i).map((x) => x.s)
  const chip = (s) => `<span class="mt-chip${s.have ? ' have' : ''}">${s.have ? '✓ ' : ''}${esc(s.name)}${s.inDemand ? ` · ${esc(t('mtInDemand'))}` : ''}</span>`
  const summary = t('mtSwSummary', { have: list.filter((s) => s.have).length, total: list.length, demand: list.filter((s) => s.inDemand).length })
  const rest = sorted.slice(SW_SHOWN)
  const more = rest.length
    ? `<details class="mt-swmore"><summary><span class="mt-swopen">${esc(t('mtSwMore', { count: rest.length }))}</span><span class="mt-swclose">${esc(t('mtSwFewer'))}</span></summary><div class="mt-chips">${rest.map(chip).join('')}</div></details>`
    : ''
  return `<div class="tiny mt-swsum">${esc(summary)}</div><div class="mt-chips">${sorted.slice(0, SW_SHOWN).map(chip).join('')}</div>${more}<div class="tiny muted">${esc(t('mtSwShown'))}</div>`
}

// Open panel: one tag per target, linked to the goal's UN page, with its reason (hover) and review state.
function sdgTags(t, lang, tags) {
  if (!tags?.length) return tagNone(t('mtSdgNone'))
  return tags.map((g) => `${sdgTag(g.goal ?? goalOf(g.target), `SDG ${g.target}`, reasonIn(g.reason, lang))} <span class="tiny muted">${esc(reviewText(t, g.approvedAt))}</span>`).join('<br>')
}
// Closed card: one tag per goal, then whether the owner reviewed the role's links to it (sdgReviewed: goal -> date).
function sdgGoalTags(t, role) {
  const goals = role.sdgGoals ?? []
  if (!goals.length) return tagNone(t('mtSdgNone'))
  const reviewed = plainObject(role.sdgReviewed) ? role.sdgReviewed : {}
  const status = (g) => reviewText(t, Object.hasOwn(reviewed, String(g)) ? reviewed[String(g)] : null)
  const tags = goals.map((g) => sdgTag(g, `SDG ${g}`, status(g))).join(' ')
  const all = [...new Set(goals.map(status))]
  const line = all.length === 1 ? all[0] : goals.map((g) => t('mtSdgGoalStatus', { goal: g, status: status(g) })).join(' · ')
  return `${tags} <span class="tiny muted">${esc(line)}</span>`
}

// The closed card's AI line for the scenario shown, from the list answer (role.ai): Moderate = AEI automation %, Rapid =
// ILO GenAI exposure % and gradient. An estimate, with its source; no data -> said in words, with no bar.
function aiCard(t, role, scenario, barPct = null) {
  const est = `<span class="tag t-est">${esc(t('mtEstimate'))}</span>`
  const src = (key) => ` <span class="tiny muted">(${esc(t(key))})</span>`
  const bar = (pct) => `<div class="bar o mt-aibar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`
  const wrap = (body) => `<div class="mt-aicard">${body}</div>`
  if (scenario === 'rapid') {
    const a = role.ai?.rapid
    if (!a?.available) return wrap(`${tagNone(t('mtNotAvailableTag'))}${src('mtAiCardSrcRapid')}`)
    const pct = isNum(a.exposurePct) ? a.exposurePct : null
    const group = /^G([1-4])$/.exec(String(a.gradient ?? ''))
    const word = ILO_WORD[a.gradient] ? t(ILO_WORD[a.gradient]) : String(a.gradient ?? '—')
    const line = group ? t('mtAiCardRapid', { pct: pct ?? '—', group: group[1] }) : t('mtAiCardRapidWord', { pct: pct ?? '—', word })
    const shownBar = barPct ?? pct
    return wrap(`${est} ${esc(line)}${src('mtAiCardSrcRapid')}${shownBar === null ? '' : bar(shownBar)}`)
  }
  const a = role.ai?.moderate
  if (a?.available && isNum(barPct)) {
    return wrap(`${est} ${esc(t('mtAiTouchModerate', { pct: fmt1(barPct) }))}${src('mtAiCardSrcModerate')}${bar(barPct)}`)
  }
  // The chain stops before O*NET: no job to look up. It reaches O*NET but the index has no data: no observed data.
  const none = role.unavailable?.missingStep ? t('mtNotAvailableTag') : t('mtNoObserved')
  return wrap(`${tagNone(none)}${src('mtAiCardSrcModerate')}`)
}

// eMASCO code -> unit group, then each step of the chain (with its label and source), then the missing step.
function pathList(t, code, chain) {
  const unit = String(code ?? '').slice(0, 4)
  const items = [`<li>${esc(t('mtPathUnit', { code: code ?? '', unit }))}</li>`]
  for (const s of chain?.path ?? []) {
    const label = s.label ? ` <span class="tag t-self">${esc(s.label)}</span>` : ''
    const src = s.source?.name ? ` <span class="tiny muted">(${link(s.source.url, s.source.name)})</span>` : ''
    items.push(`<li>${esc(s.from?.system ?? '')} ${esc((s.from?.codes ?? []).join(', '))} → ${esc(s.to?.system ?? '')} <b>${esc((s.to?.codes ?? []).join(', '))}</b>${label}${src}</li>`)
  }
  if (chain?.missingStep) {
    const reason = typeof chain.missingStep.reason === 'string' ? chain.missingStep.reason : ''
    const detail = reason ? `<div class="tiny muted">${esc(t('mtStepDetail'))} <span lang="en">${esc(reason)}</span></div>` : ''
    items.push(`<li class="miss"><b>${esc(t('mtMissing'))}</b> ${esc(stepText(t, chain.missingStep))}${detail}</li>`)
  }
  return `<ol class="mt-path">${items.join('')}</ol>`
}

function chainBlock(t, role, d) {
  const chain = d?.chain ?? { path: [], missingStep: role.unavailable?.missingStep ?? null }
  return `<details class="mt-why"><summary>${esc(t('mtWhyNone'))}</summary>
    <p class="small mt-gap">${esc(t('mtWhyNoneText'))}</p>${pathList(t, role.code, chain)}</details>`
}

function raiseList(t, d) {
  const itemLinks = (d.sdg?.pathPreview?.goals ?? []).flatMap((g) => g.links ?? []).filter((l) => l?.via?.kind === 'item')
  const rows = (d.fit.raise ?? []).map((r) => {
    const text = r.action === 'learn'
      ? t('mtLearn', { name: r.name, to: level(t, r.to) })
      : t('mtRaise', { name: r.name, from: level(t, r.from), to: level(t, r.to) })
    const sdg = itemLinks.filter((l) => l.via.code === r.key).map((l) => ` ${sdgTag(goalOf(l.target), `SDG ${l.target}`, reviewText(t, l.approvedAt))}`).join('')
    const short = r.stillShort ? ` <span class="tiny muted">${esc(t('mtStillShort'))}</span>` : ''
    return `<li><b>${esc(text)}</b> <span class="tag t-ok">${esc(t('mtPts', { points: r.points }))}</span>${sdg}${short}</li>`
  })
  return rows.length ? `<ol class="mt-raise">${rows.join('')}</ol>` : `<p class="small">${esc(t('mtRaiseNone'))}</p>`
}

function youCell(t, r) {
  if (r.status === 'not_assessed') return t('mtYouNa', { needed: fmt1(r.needed) })
  if (r.status === 'missing') return t('mtYouMissing')
  const word = WORD_OF[r.you]
  return word ? `${level(t, word)} = ${r.you}` : fmt1(r.you)
}

function whyBlock(t, role, d, allBars, onet) {
  const f = d.fit
  const rows = f.rows ?? []
  const table = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(KIND[r.kind] ? t(KIND[r.kind]) : r.kind)}</td><td>${esc(isNum(r.importance) ? r.importance.toFixed(2) : '—')}</td><td>${esc(fmt1(r.needed))}</td><td>${esc(youCell(t, r))}</td><td>${esc(fmt1(Math.min(r.you, r.needed)))}</td></tr>`).join('')
  const leftOut = (f.leftOut ?? []).length
    ? `<h3 class="mt-h3">${esc(t('mtLeftOutTitle'))}</h3><ul class="mt-left">${f.leftOut.map((l) => `<li>${esc(l.name)}: ${esc(t('mtLeftOut'))}</li>`).join('')}</ul>`
    : ''
  const more = rows.length > FIRST_BARS && !allBars
    ? `<button class="btn sm mt-gap" type="button" data-act="mAllBars" data-arg="${esc(role.code)}">${esc(t('mtShowAllItems', { count: rows.length }))}</button>`
    : ''
  return `<details class="mt-why"${allBars ? ' open' : ''}><summary>${esc(t('mtWhy'))}</summary>
    <div class="mt-whygrid">
      <div class="mt-chartcard"><h3>${esc(t('mtHowTitle'))}</h3>
        <p class="small">${esc(t('mtSentence', { met: fmt1(f.met), needed: fmt1(f.needed), job: f.onetTitle ?? f.onetCode ?? '', percent: f.percent }))}</p>
        ${fitChart({ rows, t, all: Boolean(allBars) })}${more}
      </div>
      <div>
        <h3>${esc(t('mtRaiseTitle'))}</h3>${raiseList(t, d)}
        <p class="tiny muted">${esc(t('mtPtsNote'))}</p>
        ${leftOut}
        <h3 class="mt-h3">${esc(t('mtPathTitle'))}</h3>${pathList(t, role.code, d.chain)}
      </div>
    </div>
    <div class="mt-tw"><table><thead><tr><th>${esc(t('mtColItem'))}</th><th>${esc(t('mtColKind'))}</th><th>${esc(t('mtColImportance'))}</th><th>${esc(t('mtColNeeded'))}</th><th>${esc(t('mtYou'))}</th><th>${esc(t('mtColMet'))}</th></tr></thead><tbody>${table}</tbody></table></div>
    <div class="mt-src">${esc(t('mtItemsSrc', { onet: onet?.name ?? 'O*NET', date: day(onet?.date) }))}</div>
  </details>`
}

// The open panel: Job ads, AI in this job and Software asked as three boxes (side by side from 760 px), the SDG targets,
// then "Why this match" as its own fold. While the detail loads: a spinner; after a failure: try again.
function openPanel(t, lang, role, detail, d, scenario, allBars, onet) {
  if (!d) {
    const body = detail?.error
      ? `<span class="tag t-bad">${esc(t('mtDetailError'))}</span> <button class="btn sm" type="button" data-act="mDetail" data-arg="${esc(role.code)}">${esc(t('mtRetry'))}</button>`
      : `<span class="spin"></span> ${esc(t('mtLoading'))}`
    return `<div class="mt-open small">${body}</div>`
  }
  const box = (title, body) => `<section class="mt-box"><h4>${esc(title)}</h4><div>${body}</div></section>`
  const why = d.fit ? whyBlock(t, role, d, allBars, onet) : ''
  return `<div class="mt-open">
    <div class="mt-outgrid">${box(t('mtJobAds'), jobAdsText(t, d.outlook?.jobAds, d.radar))}${box(t('mtAiPart'), aiText(t, d.outlook?.ai, scenario))}${box(t('mtSoftware'), softwareChips(t, d.software))}</div>
    <dl class="mt-parts"><dt>SDG</dt><dd>${sdgTags(t, lang, d.sdg?.tags)}</dd></dl>
    ${why}
  </div>`
}

// One role card. `detail` is the role answer, { loading: true } or { error } (null before it is asked for); `open` says
// whether "Show outlook and details" is open for this role.
export function roleCard({ t, lang = 'en', role, detail = null, scenario = 'moderate', chosen = null, allBars = false, sources = [], open = false, knowHow = null }) {
  const d = loadedDetail(detail)
  const isOpen = open === true
  const isChosen = chosen === role.code
  const onet = (sources ?? []).find((s) => s.id === 'onet') ?? null
  const panel = isOpen ? openPanel(t, lang, role, detail, d, scenario, allBars, onet) : ''
  const chain = !(isOpen && d?.fit) && role.unavailable?.missingStep && !role.skillMatch ? chainBlock(t, role, d) : ''
  const url = safeUrl(role.url)
  return `<article class="card mt-role${isChosen ? ' mt-chosen' : ''}" data-code="${esc(role.code)}">
    <div class="mt-main">
      <div><span class="mt-ttl">${esc(role.title)}</span> <span class="mt-code">MASCO ${esc(role.code)}${url ? ` · ${link(url, t('mtEmascoPage'))}` : ''}</span></div>
      <div class="small muted mt-cmp">${comparedLine(t, role, d)}</div>
      <dl class="mt-parts"><dt>SDG</dt><dd>${sdgGoalTags(t, role)}</dd></dl>
      <div class="mt-actions">
        <button class="btn sm" type="button" data-act="mOpen" data-arg="${esc(role.code)}" aria-expanded="${isOpen}">${esc(t(isOpen ? 'mtHideDetail' : 'mtShowDetail'))}</button>
        <button class="btn sm${isChosen ? '' : ' pri'}" type="button" data-act="mChoose" data-arg="${esc(role.code)}" aria-pressed="${isChosen}">${esc(t(isChosen ? 'mtChosen' : 'mtChoose'))}</button>
        <button class="btn sm" type="button" data-act="pwPlan" data-arg="${esc(role.code)}">${esc(t('mtStudyPlan'))}</button>
      </div>
    </div>
    <div class="mt-side">${sidePanel(t, role, scenario, knowHow)}</div>
    ${panel}
    ${chain}
  </article>`
}

// ---------- the page ----------

const pctOf = (r) => (isNum(r.skillMatch?.percent) ? r.skillMatch.percent : -1)
const bandOf = (r, scenario) => (BANDS.includes(r.bands?.[scenario]) ? r.bands[scenario] : 4)

// The page shown of one list ("field" or "other") and band: 1 when not set or not a number, the last page when past it.
export function pageOf(pages, key, count) {
  const last = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const p = Number.parseInt(plainObject(pages) ? pages[key] : '', 10)
  return Number.isFinite(p) ? Math.min(Math.max(p, 1), last) : 1
}
// The page numbers to show: first, last, current ± 1, with '…' where pages are skipped.
export function pageItems(current, last) {
  const nums = [...new Set([1, current - 1, current, current + 1, last])].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)
  const out = []
  for (const n of nums) {
    if (out.length && n - out[out.length - 1] > 1) out.push('…')
    out.push(n)
  }
  return out
}
// ‹ 1 … 4 5 6 … N ›, then a small "Go to page" box. key = "<list>:<band>".
function pager(t, key, current, last) {
  const btn = (page, label, aria, extra = '') => `<button type="button" class="btn sm mt-pg" data-act="mPage" data-arg="${esc(`${key}:${page}`)}" aria-label="${esc(aria)}"${extra}>${esc(label)}</button>`
  const prev = current > 1 ? btn(current - 1, '‹', t('mtPrevPage')) : `<button type="button" class="btn sm mt-pg" aria-label="${esc(t('mtPrevPage'))}" disabled>‹</button>`
  const next = current < last ? btn(current + 1, '›', t('mtNextPage')) : `<button type="button" class="btn sm mt-pg" aria-label="${esc(t('mtNextPage'))}" disabled>›</button>`
  const nums = pageItems(current, last).map((n) => (n === '…' ? '<span class="mt-gap-dots" aria-hidden="true">…</span>' : btn(n, String(n), t('mtPageN', { page: n }), n === current ? ' aria-current="page"' : ''))).join('')
  const id = `mtGo-${key.replace(':', '-')}`
  return `<div class="mt-pagerow"><nav class="mt-pager" aria-label="${esc(t('mtPages'))}">${prev}${nums}${next}</nav>
    <form class="mt-goto" data-form="mPageGo" data-arg="${esc(key)}" novalidate><label class="tiny muted" for="${esc(id)}">${esc(t('mtGoToPage'))}</label>
      <input id="${esc(id)}" class="mt-goin" type="number" inputmode="numeric" min="1" max="${last}" step="1" value="${current}"><button type="submit" class="btn sm">${esc(t('mtGo'))}</button></form></div>`
}

function bandList(t, lang, roles, m, sources, list, knowHow = null) {
  const scenario = scenarioOf(m)
  return BANDS.map((b) => {
    const inBand = roles.filter((r) => bandOf(r, scenario) === b).sort((x, y) => sortValue(y, scenario) - sortValue(x, scenario) || cmp(String(x.title), String(y.title)))
    const key = `${list}:${b}`
    const last = Math.max(1, Math.ceil(inBand.length / PAGE_SIZE))
    const page = pageOf(m.pages, key, inBand.length)
    const shown = inBand.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const cards = shown.map((role) => roleCard({ t, lang, role, detail: m.details?.[role.code] ?? null, scenario, chosen: m.chosen, allBars: m.allBars?.[role.code], sources, open: m.open?.[role.code] === true, knowHow })).join('')
    return `<section class="mt-band"><div class="mt-bandh"><span class="mt-num">${b}</span>${esc(t(BAND_TITLE[b]))} <span class="mt-bandwhy">· ${esc(t(BAND_WHY[b]))}</span></div>
      ${cards || `<div class="mt-empty">${esc(t('mtBandEmpty'))}</div>`}${last > 1 ? pager(t, key, page, last) : ''}</section>`
  }).join('')
}

const onetItems = (profile) => (profile?.skills ?? []).filter((s) => /^onet:(el|kn):/.test(s?.canonicalId ?? ''))
const plain = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.value === 'string' ? v.value : '')

function profileLine(t, profile) {
  const rec = (profile?.education?.records ?? [])[0] ?? {}
  const field = (profile?.education?.records ?? []).map((r) => r?.field).find((f) => f?.code)
  const items = onetItems(profile)
  const na = items.filter((s) => !s.proficiency).length
  const bits = [plain(rec.qualification), field ? t('mtFieldCode', { title: field.title ?? '', code: field.code }) : '', t('mtProfileSkills', { count: items.length, na })].filter(Boolean)
  return `<div class="mt-src">${esc(t('mtProfileUsed'))} <b>${esc(bits.join(' · '))}</b> · <button class="btn ghost sm mt-link" type="button" data-act="editSkills">${esc(t('mtEditProfile'))}</button> ${esc(t('mtNeverStored'))}</div>`
}

// The official UN title of a goal (data/sdg/targets.json via the API), or '' when it is not known.
export const goalTitle = (titles, goal) => (titles && typeof titles[String(goal)] === 'string' ? titles[String(goal)] : '')

function controls(t, m, roles, profile, titles) {
  const scenario = scenarioOf(m)
  const goals = [...new Set(roles.flatMap((r) => r.sdgGoals ?? []))].sort((a, b) => a - b)
  const seg = [['moderate', 'mtScnModerate', 'mtScnModerateSub'], ['rapid', 'mtScnRapid', 'mtScnRapidSub']]
    .map(([id, label, sub]) => `<button type="button" class="${scenario === id ? 'on' : ''}" data-act="mScn" data-arg="${id}" aria-pressed="${scenario === id}">${esc(t(label))}<small>${esc(t(sub))}</small></button>`).join('')
  const options = [`<option value=""${m.sdgFilter ? '' : ' selected'}>${esc(t('mtSdgAll'))}</option>`]
    .concat(goals.map((g) => `<option value="${esc(g)}"${String(m.sdgFilter) === String(g) ? ' selected' : ''}>${esc(['SDG', g, goalTitle(titles, g)].filter(Boolean).join(' '))}</option>`)).join('')
  return `<div class="card mt-controls">
    <div class="row mt-ctrlrow">
      <div><div class="tiny muted mt-lbl">${esc(t('mtScenario'))} <span class="tag t-est">${esc(t('mtEstimate'))}</span></div>
        <div class="mt-seg" role="group" aria-label="${esc(t('mtScenario'))}">${seg}</div></div>
      <div class="mt-filter"><label class="tiny muted mt-lbl" for="mtSdgFilter">${esc(t('mtSdgFilter'))}</label>
        <select id="mtSdgFilter" class="mt-sel">${options}</select>
        <div class="tiny muted">${esc(t('mtSdgFilterSrc'))}</div></div>
    </div>
    <p class="small muted mt-gap">${esc(t(scenario === 'rapid' ? 'mtScnRapidText' : 'mtScnModerateText'))}</p>
    ${profileLine(t, profile)}
  </div>`
}

function banner(t, m, roles) {
  const scenario = scenarioOf(m)
  const prev = m.prevScenario === 'rapid' || m.prevScenario === 'moderate' ? m.prevScenario : null
  if (!prev || prev === scenario) return ''
  const moved = movedRoles(roles.map((r) => ({ code: r.code, band: bandOf(r, prev) })), roles.map((r) => ({ code: r.code, band: bandOf(r, scenario) })))
  return movedBanner(t, BANNER_KEYS.scenario, scenario, moved, '')
}

// One short banner for "what moved" (owner UI round, 31 Oct): no role names, one clause per (from, to) pair of groups,
// with the group names in words and numbers; no role moved -> a plain sentence.
const BANNER_KEYS = {
  scenario: { none: 'mtBannerNoMove', moved: 'mtBannerMoved' },
  trend: { none: 'mtTrendNoMove', moved: 'mtTrendMoved' },
}
export function movedText(t, keys, scenario, moved) {
  const label = t(scenario === 'rapid' ? 'mtScnRapid' : 'mtScnModerate')
  const pairs = new Map()
  for (const x of moved ?? []) {
    const id = `${x.from}|${x.to}`
    pairs.set(id, { from: x.from, to: x.to, count: (pairs.get(id)?.count ?? 0) + 1 })
  }
  if (!pairs.size) return t(keys.none, { scenario: label })
  const band = (b) => (BAND_TITLE[b] ? t(BAND_TITLE[b]) : String(b))
  const moves = [...pairs.values()]
    .sort((a, b) => b.count - a.count || Number(a.from) - Number(b.from) || Number(a.to) - Number(b.to))
    .map((p) => t(p.count === 1 ? 'mtMoveOne' : 'mtMoveMany', { count: p.count, from: band(p.from), fromNum: p.from, to: band(p.to), toNum: p.to }))
    .join(t('mtMoveJoin'))
  return t(keys.moved, { scenario: label, moves })
}
function movedBanner(t, keys, scenario, moved, attrs) {
  return `<div class="banner mt-banner" role="status"${attrs}><div><b>${esc(movedText(t, keys, scenario, moved))}</b> ${esc(t('mtBannerSame'))}</div>
    <button class="btn sm" type="button" data-act="mBannerClose">${esc(t('mtClose'))}</button></div>`
}

// {code, band} of every listed role in one scenario: what the trend-data banner compares before and after.
export const bandsAt = (data, scenario) => (data?.roles ?? []).map((r) => ({ code: r.code, band: bandOf(r, scenario) }))
// After the trend data changed (same profile): the roles that moved band in the scenario shown then.
// before = {scenario, bands: bandsAt(oldData, scenario)} -> {scenario, moved: [{code, from, to}]}, or null.
export function trendMoves(before, data) {
  if (!before || !Array.isArray(before.bands) || !data) return null
  const scenario = before.scenario === 'rapid' ? 'rapid' : 'moderate'
  return { scenario, moved: movedRoles(before.bands, bandsAt(data, scenario)) }
}

// The trend data (a Radar refresh or decision, or a judge's Trend Change Test) changed since the list was last shown.
function trendBanner(t, m) {
  const trend = m.trend
  if (!trend || !Array.isArray(trend.moved) || trend.scenario !== scenarioOf(m)) return ''
  return movedBanner(t, BANNER_KEYS.trend, trend.scenario, trend.moved, ' data-banner="trend"')
}

function notes(t, data, profile) {
  const out = []
  if (data.radar?.judgeSession) out.push(`<div class="mt-note">${esc(t('mtJudge'))}</div>`)
  if (data.radar?.state === 'unavailable') out.push(`<div class="mt-note warn">${esc(t('mtRadarDown'))}</div>`)
  if (profile?.profileStatus !== 'confirmed') out.push(`<div class="mt-note warn">${esc(t('mtDraft'))}</div>`)
  // Only when a shown Skill Match is provisional (not while no role has one, as today without the code chain).
  if (data.profile?.usable && (data.roles ?? []).some((r) => r.skillMatch?.provisional)) {
    const na = onetItems(profile).filter((s) => !s.proficiency).length
    out.push(`<div class="mt-note warn"><b>${esc(t('mtProvTitle'))}</b> ${esc(t('mtProvText', { count: na }))} <button class="btn ghost sm mt-link" type="button" data-act="editSkills">${esc(t('mtSetLevels'))}</button></div>`)
  }
  if (data.profile && !data.profile.usable) {
    const unused = data.profile.unusedIds ?? []
    const sw = unused.filter((u) => u.reason === 'not_in_percent').map((u) => u.name).filter(Boolean)
    const other = unused.filter((u) => u.reason !== 'not_in_percent').map((u) => u.name).filter(Boolean)
    out.push(`<div class="card mt-thin"><h3>${esc(t('mtThinTitle'))}</h3><p class="small muted">${esc(t('mtThinText'))}</p>
      ${sw.length ? `<p class="small muted">${esc(t('mtThinSoftware', { names: sw.join(', ') }))}</p>` : ''}
      ${other.length ? `<p class="small muted">${esc(t('mtNotUsed', { names: other.join(', ') }))}</p>` : ''}
      <div class="mt-actions"><button class="btn pri" type="button" data-act="editSkills">${esc(t('mtAddSkills'))}</button></div></div>`)
  }
  const roles = data.roles ?? []
  if (roles.length && roles.every((r) => !r.skillMatch && r.unavailable?.missingStep)) {
    const steps = new Map()
    for (const r of roles) {
      const s = r.unavailable.missingStep
      const id = `${s.id}|${s.kind ?? ''}`
      if (!steps.has(id)) steps.set(id, { step: s, codes: new Set(), count: 0 })
      const g = steps.get(id)
      g.count += 1
      for (const c of s.from?.codes ?? []) g.codes.add(c)
    }
    // One line per missing step for all roles; at most 5 codes named (a pending step names none).
    const codesOf = (g) => {
      const all = [...g.codes].sort()
      return g.step.kind === 'pending' ? [] : all.length > 5 ? [...all.slice(0, 5), '…'] : all
    }
    const list = [...steps.values()].map((g) => `<li>${esc(t('mtChainStep', { reason: stepReason(t, { ...g.step, from: { ...g.step.from, codes: codesOf(g) } }), count: g.count }))}</li>`).join('')
    out.push(`<div class="mt-note warn"><b>${esc(t('mtChainTitle'))}</b> ${esc(t('mtChainText'))}<ul class="mt-steps">${list}</ul>${esc(t('mtChainStill'))}</div>`)
  }
  return out.join('')
}

function sourcesCard(t, data) {
  const rows = (data.sources ?? []).map((s) => {
    const label = SRC_LABEL[s.id] ? t(SRC_LABEL[s.id]) : s.id
    const bits = [s.version && !String(s.name ?? '').includes(s.version) ? s.version : '', s.period ?? '', s.licence ?? '', s.note ?? '', s.status ?? '', s.date ? t('mtSrcDate', { date: day(s.date) }) : '']
      .filter(Boolean).map((b) => esc(b)).join(' · ')
    return `<tr><td>${esc(label)}</td><td>${link(s.url, s.name ?? s.id)}${bits ? ` · ${bits}` : ''}</td></tr>`
  })
  const r = data.radar ?? {}
  rows.push(`<tr><td>${esc(t('mtSrcAds'))}</td><td>${esc(t('mtSrcAdsText', { period: r.observationPeriod ?? '—', date: day(r.publishedAt) }))}</td></tr>`)
  rows.push(`<tr><td>${esc(t('mtSrcInDemand'))}</td><td>${esc(t('mtSrcInDemandText'))}</td></tr>`)
  return `<div class="card mt-sources"><h3>${esc(t('mtSourcesTitle'))}</h3><div class="mt-tw"><table class="small"><tbody>${rows.join('')}</tbody></table></div></div>`
}

export function matchView({ t, state }) {
  const m = ui(state)
  const lang = state?.lang ?? 'en'
  const head = `<h1>${esc(t('match'))}</h1><p class="lead">${esc(t('mtLead'))}</p>`
  if (!state?.profile) {
    return `<div class="mt">${head}<div class="card"><h3>${esc(t('mtNoProfile'))}</h3><p class="small muted">${esc(t('mtNoProfileText'))}</p>
      <div class="mt-actions"><button class="btn pri" type="button" data-go="source">${esc(t('mtBuildProfile'))}</button></div></div></div>`
  }
  const data = m.data
  if (!data) {
    const body = m.error
      ? `<div class="banner b-bad"><div>${esc(t('mtUnavailable'))}</div><button class="btn sm" type="button" data-act="mReload">${esc(t('mtRetry'))}</button></div>`
      : `<p class="muted"><span class="spin"></span> ${esc(t('mtLoading'))}</p>`
    return `<div class="mt">${head}${body}</div>`
  }
  const all = data.roles ?? []
  const shown = m.sdgFilter ? all.filter((r) => (r.sdgGoals ?? []).map(String).includes(String(m.sdgFilter))) : all
  const field = shown.filter((r) => r.inField)
  const other = shown.filter((r) => !r.inField)
  const fieldNames = (state.profile?.education?.records ?? []).map((r) => r?.field).filter((f) => f?.code).map((f) => t('mtFieldCode', { title: f.title ?? '', code: f.code }))
  return `<div class="mt">${head}
    ${controls(t, m, all, state.profile, data.goalTitles)}
    ${trendBanner(t, m)}
    ${banner(t, m, all)}
    ${notes(t, data, state.profile)}
    <h2 class="mt-h2">${esc(t('mtInField'))} <span class="tiny muted">${esc([...fieldNames, t('mtRoleCount', { count: field.length })].join(' · '))}</span></h2>
    <div class="tiny muted">${esc(t('mtInFieldHow'))}</div>
    ${bandList(t, lang, field, m, data.sources, 'field', data.aiKnowHow)}
    <h2 class="mt-h2">${esc(t('mtExplore'))} <span class="tiny muted">${esc(t('mtRoleCount', { count: other.length }))}</span></h2>
    <button class="btn" type="button" data-act="mExplore" aria-expanded="${Boolean(m.explore)}">${esc(t(m.explore ? 'mtHideRoles' : 'mtShowRoles'))}</button>
    ${m.explore ? bandList(t, lang, other, m, data.sources, 'other', data.aiKnowHow) : ''}
    ${sourcesCard(t, data)}
  </div>`
}

export default ({ t, state }) => matchView({ t, state })
