// Future Skills Radar screen (spec §11): Skills & Careers (first tab, opens by default, D21) and AI Impact.
// Uses the app's own design (D22): styles.css tokens and classes, plus a few rd-* classes built on them.
// By default only the user's own fields, jobs and roles and what they reach (D2); "View all" is the last element of
// each tab. Every number has its source link next to it (D3). Relevance is worked out here, in the browser, from the
// confirmed profile and the public reference data; nothing personal is sent to the server (spec §11.2).
import { newsSection } from '../components/newsPanel.js'
import { esc, tag } from '../ui.js'
import { radarChart } from '../components/charts/radarChart.js'
import { lineChart } from '../components/charts/lineChart.js'
import { divergingBars } from '../components/charts/divergingBars.js'
import { DASH, finite, fmt, fmtSigned } from '../components/charts/format.js'
import { evidencePanel, fmtDate, fmtInt, fmtPct, fmtSignedPct, numLink, safeUrl, signalLink, srcLink, statusTag } from '../components/evidencePanel.js'
import { relevantItems } from '../../../shared/radar/relevance.js'
import { makeBridge } from '../../../shared/radar/bridge.js'
import { makeChain } from '../../../shared/radar/chain.js'
import { filterItems, profileJobs, skillCorners, taskCorners, usageText } from '../../../shared/radar/profileCharts.js'
import { profileRadar } from '../components/charts/profileRadar.js'
import { taskScatter } from '../components/charts/taskScatter.js'
import { AI_TASK_IDS, askOf, canContinue, needsAsking } from '../../../shared/aiTasks.js'

// ---------- reference data and relevance ----------

// The browser side of the reference data (the same lookups the server uses), built once per answer.
const refsCache = new WeakMap()
function refsFor(r) {
  if (refsCache.has(r)) return refsCache.get(r)
  const fields = new Map((r.fields ?? []).map((f) => [f.code, f]))
  const onetTitles = new Map((r.fields ?? []).flatMap((f) => (f.jobs ?? []).map((j) => [j.code, j.title])))
  const refs = {
    topics: r.topics ?? [],
    fieldTopics: r.fieldTopics ?? [],
    bridge: makeBridge(r.bridge),
    chain: makeChain(r.bridge),
    fieldName: (code) => fields.get(code)?.title ?? null,
    fieldJobs: (code) => fields.get(code)?.jobs ?? [],
    onetTitle: (code) => onetTitles.get(code) ?? null,
  }
  refsCache.set(r, refs)
  return refs
}

// Only a confirmed profile is used (spec §11.2); without one the screen shows the global view.
function relevance(state, data) {
  const profile = state?.profile
  if (!data?.refs || !profile || profile.profileStatus !== 'confirmed') return null
  const rel = relevantItems(profile, refsFor(data.refs))
  return rel.empty ? null : rel
}

// The official skill ids on a confirmed profile, also when it has no field or job yet (only ids, never typed names).
function profileSkillIds(state, data) {
  const profile = state?.profile
  if (!data?.refs || !profile || profile.profileStatus !== 'confirmed') return new Set()
  return relevantItems(profile, refsFor(data.refs)).skillIds
}

// ---------- small helpers ----------

const ui = (state) => state?.radar ?? {}
// Which tab is shown (D46): the one the user picked, else Explore all trends for a career switch and For You for
// everyone else. Read in the browser; an old tab id (sk, ai) from before the two tabs falls back to the rule.
export function radarTabOf(state) {
  const picked = ui(state).tab
  if (picked === 'fy' || picked === 'ex') return picked
  const goal = state?.profile?.preferences?.careerGoal
  return goal?.state === 'value' && goal.value === 'switch_career' ? 'ex' : 'fy'
}
const viewAllOn = (state, tab) => Boolean(ui(state).all?.[tab])

function axisLabel(axis, t, lang) {
  const key = `rdAxis_${axis.axisId}`
  const label = t(key)
  return label !== key ? label : axis.friendlyLabel?.[lang] ?? axis.friendlyLabel?.en ?? axis.officialTitle ?? axis.axisId
}

// The link next to an OpenAlex number: the topic's works query (else the topic page).
function axisLink(axis) {
  const fromSignal = (axis.signal?.evidenceLinks ?? []).find((l) => /\/works\?/.test(l?.url ?? '') && safeUrl(l.url))
  const url = fromSignal?.url ?? safeUrl(axis.sourceUrl)
  return url ? { label: 'OpenAlex', url } : null
}
const dosmLink = (occ) => {
  const url = (occ?.sourceLinks ?? []).map((l) => safeUrl(l?.url)).find(Boolean)
  return url ? { label: 'DOSM', url } : null
}
const csLink = (ai) => {
  const url = (ai?.sourceLinks ?? []).map((l) => l?.url).find((u) => safeUrl(u) && /primary_topic\.field\.id:17/.test(u))
  return url ? { label: 'OpenAlex', url } : null
}
// The official page of a job: eMASCO role page or O*NET summary.
function jobLink(data, o) {
  if (o.source === 'emasco') {
    const url = safeUrl((data.refs?.emascoRoles ?? []).find((r) => r.code === o.code)?.url) ?? `https://emasco.mohr.gov.my/masco/${encodeURIComponent(o.code)}`
    return { label: 'eMASCO', url }
  }
  return { label: 'O*NET', url: `https://www.onetonline.org/link/summary/${encodeURIComponent(o.code)}` }
}
const latestIndex = (occ) => (occ?.periods?.length ?? 0) - 1
const latestOf = (list, occ) => {
  const i = latestIndex(occ)
  return i >= 0 ? list?.[i] ?? null : null
}

// "2025 Q3" → "2026 Q3": the first quarter whose year-on-year comparison no longer straddles the break.
function yearLater(period) {
  const m = /^(\d{4}) (Q[1-4])$/.exec(String(period ?? ''))
  return m ? `${Number(m[1]) + 1} ${m[2]}` : DASH
}

const momentumOf = (axis, mode) => axis?.momentum?.[mode === 'share' ? 'share' : 'counts'] ?? null
const seriesValue = (axis, year) => axis?.series?.find((p) => p.year === year)?.value ?? null
const isIce = (signal) => signal?.evidenceSufficiency === 'insufficient_comparable_evidence'
const LEVEL_KEYS = { broad: 'rdLevel_broad', narrow: 'rdLevel_narrow', detailed: 'rdLevel_detailed' }

function viewAll(t, state, tab) {
  const on = viewAllOn(state, tab)
  return `<div class="rd-viewall"><button class="btn" data-act="viewAll" data-arg="${tab}" aria-pressed="${on}">${esc(t(on ? 'rdViewMine' : tab === 'ai' ? 'rdTopicsViewAll' : 'rdViewAll'))}</button>
  <div class="tiny muted">${esc(t(tab === 'ai' ? 'rdViewAllAi' : 'rdViewAllSk'))}</div></div>`
}

// Which axes and groups a tab shows: the user's own (default) or every one (View all, or no linked items).
function scope(state, data, rel, tab) {
  const axes = data.ai?.axes ?? []
  const groups = data.occ?.groups ?? []
  const ownAxes = new Set((rel?.axes ?? []).map((a) => a.axisId))
  const ownGroups = new Set((rel?.groups ?? []).map((g) => g.groupCode))
  const linked = tab === 'ai' ? ownAxes.size > 0 : ownAxes.size + ownGroups.size > 0
  const mine = linked && !viewAllOn(state, tab)
  return {
    mine,
    ownAxes,
    ownGroups,
    axes: mine ? axes.filter((a) => ownAxes.has(a.axisId)) : axes,
    groups: mine ? groups.filter((g) => ownGroups.has(g.code)) : groups,
  }
}

const hint = (t) => `<div class="hint">${esc(t('rdAddProfile'))} <button class="btn sm ghost" data-go="form">${esc(t('rdEditProfile'))}</button></div>`

// Fields without an approved link on any axis: "Insufficient verified connections for this field".
function fieldLinks(t, rel) {
  if (!rel?.fields?.length) return ''
  return `<ul class="rd-list small">${rel.fields.map((f) => {
    const name = `${f.code} · ${f.title ?? f.code}`
    if (!f.topics.length) return `<li><b>${esc(name)}</b>: ${esc(t('rdNoFieldLinks'))}</li>`
    return `<li><b>${esc(name)}</b>: ${f.topics.map((l) => esc(`${t(`rdAxis_${l.axisId}`)} (${t('rdApprovedAt', { level: t(LEVEL_KEYS[l.level] ?? 'rdLevel_detailed') })})`)).join(', ')}</li>`
  }).join('')}</ul>`
}

// ---------- header ----------

// kind 'Avail' → key rdAvail_<value>; an unknown value is shown as given, a missing one as a dash.
const dim = (t, kind, value) => {
  if (!value) return DASH
  const key = `rd${kind}_${value}`
  const text = t(key)
  return text === key ? String(value) : text
}

function comparability(t, signals) {
  const counts = {}
  for (const s of signals) if (s?.evidenceSufficiency) counts[s.evidenceSufficiency] = (counts[s.evidenceSufficiency] ?? 0) + 1
  const parts = Object.entries(counts).map(([k, n]) => `${t(`rdSuff_${k}`)}: ${n}`)
  return parts.length ? parts.join(' · ') : DASH
}

// One source card (owner, 31 Oct): name and source link at the top, availability as a tag, the facts as label-value
// pairs, and a note line at the bottom. facts = [[label key, text]]; every text goes through esc().
function srcCard(t, { name, link, availability, facts, foot, cls = '' }) {
  const avail = dim(t, 'Avail', availability)
  const tag = `<span class="pill${availability === 'data' ? ' ok' : ''}" aria-label="${esc(`${t('rdDim_availability')}: ${avail}`)}">${esc(avail)}</span>`
  return `<article class="rd-srccard${cls}">
      <header class="rd-srccard-head"><h3>${esc(name)}</h3> ${link ? srcLink(link) : ''}</header>
      ${tag}
      <dl class="rd-srccard-facts">${facts.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="rd-srccard-foot tiny muted">${foot}</p>
    </article>`
}

const healthText = (t, st) => st.refreshHealth === 'failed' && st.refreshCode ? `${dim(t, 'Health', st.refreshHealth)} (${dim(t, 'Err', st.refreshCode)})` : dim(t, 'Health', st.refreshHealth)

// statusCards(states, t, {sources, manifestId, ai, occ}): one card per source with its link, observation period,
// publication date (DOSM), last successful fetch, manifest id and the five answer-state dimensions (spec §11.1, §12).
// ids: which sources get a card; the Radar page lists only OpenAlex (D48), the admin screen both.
export function statusCards(states, t, { sources = [], manifestId = null, ai = null, occ = null, ids = ['openalex', 'dosm'] } = {}) {
  const signals = { openalex: (ai?.axes ?? []).map((a) => a.signal).filter(Boolean), dosm: (occ?.groups ?? []).map((g) => g.signal).filter(Boolean) }
  return `<div class="rd-srcgrid">${ids.map((id) => {
    const st = states?.[id] ?? {}
    const src = sources.find((s) => s.sourceId === id)
    const fresh = id === 'dosm' && st.expectedNextRelease ? `${dim(t, 'Fresh', st.freshness)} · ${t('rdNextRelease', { date: fmtDate(st.expectedNextRelease) })}` : dim(t, 'Fresh', st.freshness)
    const facts = [
      ['rdObsPeriod', st.observationPeriod ?? DASH],
      ...(id === 'dosm' ? [['rdPublished', fmtDate(st.publishedAt)]] : []),
      ['rdLastFetch', fmtDate(st.lastSuccessAt)],
      ['rdDim_freshness', fresh],
      ['rdDim_refreshHealth', healthText(t, st)],
      ['rdDim_servedFrom', dim(t, 'Served', st.servedFrom)],
      ['rdDim_comparability', comparability(t, signals[id])],
    ]
    return srcCard(t, {
      name: src?.name ?? (id === 'dosm' ? 'DOSM' : 'OpenAlex'),
      link: (src?.links ?? []).find((l) => safeUrl(l?.url)),
      availability: st.availability,
      facts,
      foot: `${esc(t('rdManifestId'))}: <code>${esc(manifestId ?? DASH)}</code>`,
    })
  }).join('')}</div>`
}

// Two compact cards for the O*NET sources (US job ads): name, release or counting window, fetched date, link and the
// source's state (availability, last refresh and its code), shown the same way as the OpenAlex and DOSM cards.
// sources = the /api/radar/sources entries; states = data.states; anything else is left out. Every text goes through esc().
export function onetSourceCards(sources, t, states = {}) {
  const cards = (sources ?? []).filter((s) => s?.sourceId === 'onet-skills' || s?.sourceId === 'onet-hottech').map((s) => {
    const skills = s.sourceId === 'onet-skills'
    const st = states?.[s.sourceId] ?? {}
    return srcCard(t, {
      name: t(skills ? 'rdSrcOnetSkills' : 'rdSrcOnetHot'),
      link: (s.links ?? []).find((l) => safeUrl(l?.url)),
      availability: st.availability,
      facts: [
        [skills ? 'rdAdminOnetActiveRelease' : 'rdAdminOnetActiveWindow', (skills ? s.version ?? s.observationPeriod : s.window?.label ?? s.observationPeriod) ?? DASH],
        ['rdEvFetched', fmtDate(s.fetchedAt)],
        ['rdDim_refreshHealth', healthText(t, st)],
      ],
      foot: `${esc(t('rdSkLabelUs'))} · ${esc(t('rdSkLabelSoftware'))}`,
      cls: ' rd-onet-card',
    })
  })
  return cards.length ? `<div class="rd-srcgrid">${cards.join('')}</div>` : ''
}

function sourcesList(t, sources) {
  const rows = sources.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="tiny">${(s.links ?? []).map(srcLink).join(' · ')}</div></td>
    <td class="small">${esc(s.measures ?? DASH)}</td><td class="small">${esc(s.policy ?? DASH)}</td>
    <td class="small">${esc(s.observationPeriod ?? DASH)}<div class="tiny muted">${esc(t('rdEvFetched'))}: ${esc(fmtDate(s.fetchedAt))}</div></td></tr>`).join('')
  return `<details class="rd-sources"><summary>${esc(t('rdViewSources'))}</summary>
    <p class="tiny muted">${esc(t('rdSourcesNote'))}</p>
    <div class="rd-scroll"><table><tr><th>${esc(t('rdEvSource'))}</th><th>${esc(t('rdEvMetric'))}</th><th>${esc(t('rdSourcePolicy'))}</th><th>${esc(t('rdObsPeriod'))}</th></tr>${rows}</table></div>
  </details>`
}

function banners(t, state, data) {
  const u = ui(state)
  const out = []
  const reload = `<button class="btn sm" data-act="reloadManifest">${esc(t('rdReload'))}</button>`
  if (u.gone) out.push(`<div class="banner b-bad" role="alert"><div>${esc(t('rdErr_manifest_gone'))}</div>${reload}</div>`)
  const newer = u.newerManifestId || (data && data.activeManifestId && data.activeManifestId !== data.manifestId ? data.activeManifestId : null)
  if (!u.gone && newer) out.push(`<div class="banner b-info" role="status"><div>${esc(t('rdNewData'))}</div>${reload}</div>`)
  // Kept from the last answer (u.devStore) so it stays up while loading, after an error or manifest_gone (spec §7).
  if (data?.devStore || u.devStore) out.push(`<div class="banner b-warn"><div>${esc(t('rdDevStore'))}</div></div>`)
  return out.join('')
}

// ---------- AI Impact tab ----------

export function aiTab({ t, state, data }) {
  const { a2, a1, a5, globalNote } = researchCards({ t, state, data })
  return `${aiTasksCard({ t, state, data })}${globalNote}${a2}${a1}${a5}${viewAll(t, state, 'ai')}`
}

// The research cards: A2 (momentum by topic), A1 (papers per year) and A5 (signals for the user's field). all: every
// topic (Explore all trends, D45); otherwise the user's linked topics with View all, as on the old AI Impact tab.
function researchCards({ t, state, data, all = false }) {
  const lang = state?.lang ?? 'en'
  const rel = relevance(state, data)
  const sc = all ? { ...scope(state, data, rel, 'ai'), mine: false, axes: data.ai?.axes ?? [] } : scope(state, data, rel, 'ai')
  const mode = ui(state).mode === 'share' ? 'share' : 'count'
  const hidden = new Set(ui(state).hidden ?? [])
  const allAxes = data.ai?.axes ?? []
  const ai = data.ai ?? {}

  // A2: the user's linked topics (approved links only); all six with View all or without a link (global evidence).
  const chartAxes = sc.axes.map((a) => {
    const cur = momentumOf(a, mode)?.current
    return { axisId: a.axisId, label: axisLabel(a, t, lang), value: finite(cur?.value), state: cur?.state ?? 'invalid', capped: Boolean(cur?.capped), ratio: finite(cur?.ratio), smallCounts: Boolean(cur?.smallCounts), highlighted: sc.ownAxes.has(a.axisId) }
  })
  const comparison = sc.axes.map((a) => finite(momentumOf(a, mode)?.comparison?.value))
  const validCount = chartAxes.filter((a) => a.value !== null).length
  const win = sc.axes.map((a) => momentumOf(a, mode)?.current).find((c) => c?.baselineYear)
  const cmpWin = sc.axes.map((a) => momentumOf(a, mode)?.comparison).find((c) => c?.baselineYear)
  const winText = (w) => (w ? `${w.baselineYear} → ${w.recentYear}` : DASH)

  const rows = sc.axes.map((a) => {
    const cur = momentumOf(a, mode)?.current
    const link = axisLink(a)
    const index = finite(cur?.value) !== null
      ? `<td class="num">${numLink(`${fmt(cur.value, 0)}${cur.capped ? ` (≥ 5.7×, ${fmt(cur.ratio, 2)}×)` : ''}`, link)}</td>`
      : `<td class="small muted">${esc(t(`rdMom_${cur?.state || 'invalid'}`))}</td>`
    const B = cur?.baselineYear ? seriesValue(a, cur.baselineYear) : null
    const R = cur?.recentYear ? seriesValue(a, cur.recentYear) : null
    const papers = finite(B) !== null && finite(R) !== null ? `<td class="num">${numLink(`${fmtInt(B)} → ${fmtInt(R)}`, link)}</td>` : `<td class="muted">${DASH}</td>`
    const mine = sc.ownAxes.has(a.axisId) ? ` ${tag('calc', t('rdFromProfile'))}` : ''
    return `<tr><td><button class="btn sm ghost rd-pick" data-act="axis" data-arg="${esc(a.axisId)}" aria-label="${esc(`${t('rdEvOpen')}: ${axisLabel(a, t, lang)}`)}">${esc(axisLabel(a, t, lang))}</button>${mine}${cur?.smallCounts ? `<div class="tiny muted">${esc(t('rdMomSmall'))}</div>` : ''}</td>${index}${papers}<td>${statusTag(a.signal, t)}</td></tr>`
  }).join('')

  const a2 = `<div class="card rd-sec" data-sec="A2">
    <h2>${esc(t('rdA2Title'))} ${tag('est', t('rdTagResearch'))}</h2>
    ${sc.mine ? `<p class="small"><b>${esc(t('rdTopicsOwn'))}</b></p>` : ''}
    <p class="tiny muted">${esc(t('rdTooltip'))}</p>
    <div class="row rd-controls"><span class="seg" role="group" aria-label="${esc(t('rdMomentum'))}">
      <button class="${mode === 'count' ? 'on' : ''}" data-act="radarMode" data-arg="count" aria-pressed="${mode === 'count'}">${esc(t('rdMetricCount'))}</button><button class="${mode === 'share' ? 'on' : ''}" data-act="radarMode" data-arg="share" aria-pressed="${mode === 'share'}">${esc(t('rdMetricShare'))}</button>
    </span>
    <span class="tiny muted">${esc(t('rdWindowSelected'))}: ${esc(winText(win))} · ${esc(t('rdWindowCompare'))}: ${esc(winText(cmpWin))}</span></div>
    ${validCount < 3 ? `<p class="small muted">${esc(t(sc.mine && sc.axes.length < 3 ? 'rdFewOwnAxes' : 'rdFewAxes'))}</p>` : ''}
    <div class="rd-chart">${radarChart({ axes: chartAxes, comparison, t })}</div>
    <p class="tiny muted">${esc(t('rdPointHollow'))}</p>
    ${rel ? fieldLinks(t, rel) : ''}
    <div class="rd-scroll"><table><tr><th>${esc(t('rdColTopic'))}</th><th class="num">${esc(t('rdMomentum'))}</th><th class="num">${esc(t('rdPapersCol'))}</th><th>${esc(t('rdEvidence'))}</th></tr>${rows}</table></div>
    <details class="rd-why"><summary>${esc(t('rdWhyTitle'))}</summary><p class="small">${esc(t('rdWhyIndex'))}</p></details>
    <p class="tiny muted rd-srcline">${esc(t('rdEvSource'))}: OpenAlex ${srcLink({ label: 'openalex.org', url: 'https://openalex.org' })} ${csLink(ai) ? srcLink({ label: t('rdCsLink'), url: csLink(ai).url }) : ''} · ${esc(t('rdSnapshot'))} <code>${esc(ai.snapshotId ?? DASH)}</code> · ${esc(t('rdEvFetched'))} ${esc(fmtDate(ai.fetchedAt))}</p>
  </div>`

  // A1: yearly paper counts for the shown axes, with legend toggles.
  const series = sc.axes.map((a) => ({ id: a.axisId, label: axisLabel(a, t, lang), points: (a.series ?? []).map((p) => ({ year: p.year, value: p.value })) }))
  const legend = sc.axes.map((a) => {
    const last = (a.series ?? []).filter((p) => finite(p.value) !== null).at(-1)
    const off = hidden.has(a.axisId)
    return `<span class="rd-leg"><button class="chip${off ? '' : ' on'}" data-act="radarLine" data-arg="${esc(a.axisId)}" aria-pressed="${!off}" title="${esc(t('rdShowOnChart'))}">${esc(axisLabel(a, t, lang))}</button>${last ? ` ${numLink(`${fmtInt(last.value)} (${last.year})`, axisLink(a))}` : ''}</span>`
  }).join('')
  const a1 = `<div class="card rd-sec" data-sec="A1">
    <h2>${esc(t('rdA1Title'))} ${tag('est', t('rdTagResearch'))}</h2>
    <p class="tiny muted">${esc(t('rdA1Metric'))}</p>
    <div class="rd-chart">${lineChart({ series, hidden, t })}</div>
    <div class="rd-legend">${legend}</div>
  </div>`

  // A5: the research signals for the user's linked axes, each with its link. No job predictions.
  let a5body
  if (!rel) a5body = hint(t)
  else if (!rel.axes.length) a5body = fieldLinks(t, rel)
  else {
    a5body = `<ul class="rd-list">${rel.axes.map((link) => {
      const a = allAxes.find((x) => x.axisId === link.axisId)
      if (!a) return ''
      const s = a.signal
      const B = s?.baseline
      const R = s?.recent
      const papers = finite(B?.value) !== null && finite(R?.value) !== null ? numLink(`${fmtInt(B.value)} (${B.period}) → ${fmtInt(R.value)} (${R.period})`, axisLink(a)) : esc(DASH)
      const vias = link.vias.map((v) => t('rdViaField', { field: v.fieldCode, level: t(LEVEL_KEYS[v.level] ?? 'rdLevel_detailed') })).join('; ')
      return `<li><b>${esc(axisLabel(a, t, lang))}</b> ${statusTag(s, t)}<div class="small">${esc(t('rdPapersCol'))}: ${papers}</div><div class="tiny muted">${esc(vias)}</div></li>`
    }).join('')}</ul>`
  }
  const a5 = `<div class="card rd-sec" data-sec="A5"><h2>${esc(t('rdA5Title'))}</h2>${a5body}<p class="tiny muted">${esc(t('rdA5Note'))}</p></div>`

  const globalNote = sc.mine ? '' : !rel || !rel.axes.length ? `<p class="small muted rd-scope">${esc(t('rdGlobalView'))}</p>` : ''
  return { a2, a1, a5, globalNote }
}

// For You (D44): the AI usage question until it is answered or skipped (or reopened); then the Change button, the AI
// tasks scatter and the research signals for the user's field. Nothing else.
export function forYouTab({ t, state, data }) {
  // The AI news for the user's own study fields closes the tab (owner, 1 Nov 2026), also while the question is asked.
  const news = newsSection({ t, state, tab: 'you' })
  if (needsAsking(state?.profile) || (ui(state).aiAsk?.open && state?.profile)) return `${aiTasksQuestion({ t, state })}${news}`
  const change = state?.profile?.aiTasks ? `<p class="rd-aiask-line"><button class="btn sm ghost" data-act="aiAskOpen">${esc(t('rdAiAskChange'))}</button></p>` : ''
  const { a5 } = researchCards({ t, state, data })
  return `${change}${aiTasksCard({ t, state, data })}${a5}${news}`
}

// Explore all trends (D45): research momentum and papers per year for all six topics; no View all.
export function exploreTab({ t, state, data }) {
  const { a2, a1 } = researchCards({ t, state, data, all: true })
  return `${a2}${a1}${newsSection({ t, state, tab: 'all' })}`
}

// ---------- Skills & Careers tab ----------

// "2026-02" → "Feb 2026" (en, ms) or "2026年2月" (zh); anything else is shown as given.
const MONTH_LOCALES = { en: 'en-US', ms: 'ms-MY', zh: 'zh-CN' }
function fmtMonth(lang, ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ''))
  if (!m) return ym ? String(ym) : DASH
  try {
    return new Intl.DateTimeFormat(MONTH_LOCALES[lang] ?? 'en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
  } catch {
    return String(ym)
  }
}

const ONET_HOT_URL = 'https://www.onetonline.org/search/hot_tech/'
const onetJobUrl = (code) => `https://www.onetonline.org/link/summary/${encodeURIComponent(code)}`

// B2 first column (skill-trends spec §6, D23–D27): O*NET's flags on skills that US employers ask for in job ads.
// Own O*NET jobs by default; every job with changes in View all or without own jobs. Matching the user's jobs and
// skills happens here, in the browser; a skill is "on your profile" only by its official id (Review Focus 5).
function onetColumn({ t, state, data, rel, lang }) {
  const sk = data.skills ?? null
  const ok = sk?.state === 'data' && sk.release?.current
  const skillIds = rel?.skillIds ?? profileSkillIds(state, data)
  const mine = (item) => (item?.skillId && skillIds.has(item.skillId) ? ` ${tag('calc', t('rdOnProfile'))}` : '')
  // Both labels sit inside every block of skills (job card, View all job card, Hot list, postings table).
  const labels = `<p class="tiny muted">${esc(t('rdSkLabelUs'))} · ${esc(t('rdSkLabelSoftware'))}</p>`
  const block = (kind, html, el = 'div') => `<${el} class="rd-skblock" data-block="${kind}">${html}</${el}><!--block-->`
  const hotLink = { label: 'O*NET Hot Technologies', url: ONET_HOT_URL }
  const none = `<p class="small muted">${esc(t('rdEvNone'))}</p>`

  let heading = ''
  if (ok) {
    const cur = sk.release.current
    const prev = sk.release.previous
    const vars = { current: cur.id, currentMonth: fmtMonth(lang, cur.month), previous: prev?.id ?? DASH, previousMonth: fmtMonth(lang, prev?.month) }
    const same = (cur.releases ?? []).filter((r) => r !== cur.id)
    heading = !prev ? t('rdSkFirstRelease', vars) : same.length ? t('rdSkHeading', { ...vars, same: same.join(', ') }) : t('rdSkHeadingNew', vars)
  }
  // The release (with its month) where a change was seen, or where a kept flag stands: next to each item's link.
  const itemDate = ok ? `O*NET ${sk.release.current.id} · ${fmtMonth(lang, sk.release.current.month)}` : ''

  // One changed or kept skill: its name, the O*NET technology class, the tag when it is on the profile.
  const skillItem = (item, link) => `<li>${esc(item.example)}${mine(item)}<div class="tiny muted">${item.elementName ? `${esc(item.elementName)} · ` : ''}${esc(itemDate)} ${srcLink(link)}</div></li>`
  const list = (items, link) => (items.length ? `<ul class="rd-list small">${items.map((i) => skillItem(i, link)).join('')}</ul>` : none)
  const sub = (key, vars) => `<div class="tiny muted rd-subhead"><b>${esc(t(key, vars))}</b></div>`

  // A job of the user's own: title, system and code, role, official page; then its skills or why there are none.
  const jobHead = (o) => `<p class="small rd-subhead"><b>${esc(o.title ?? o.code)}</b> <span class="tiny muted">${esc(`${o.source === 'emasco' ? 'eMASCO' : 'O*NET'} ${o.code} · ${t(`rdRole_${o.role}`)}`)}</span> ${srcLink(jobLink(data, o))}</p>`
  const ownJob = (o) => {
    if (o.source !== 'onet') return `<div>${jobHead(o)}<p class="small muted">${esc(t('rdSkNoOnetLink'))}</p></div>`
    const c = sk.changes?.[o.code]
    const link = { label: 'O*NET', url: onetJobUrl(o.code) }
    if (!c || !(c.added.length + c.dropped.length + c.kept.length)) return `<div>${jobHead(o)}<p class="small muted">${esc(t('rdSkNoFlags'))}</p></div>`
    const kept = c.kept.length ? `<details><summary>${esc(t('rdSkKept', { count: c.kept.length }))}</summary>${list(c.kept, link)}</details>` : ''
    return block('job', `${jobHead(o)}${labels}${sub('rdSkAdded')}${list(c.added, link)}${sub('rdSkDropped')}${list(c.dropped, link)}${kept}`)
  }

  // Every job with changes (View all, or nothing of the user's own): changes only, the kept lists stay per own job.
  const allJobs = () => {
    const refs = data.refs ? refsFor(data.refs) : null
    const codes = Object.keys(sk.changes ?? {}).filter((code) => sk.changes[code].added.length + sk.changes[code].dropped.length).sort()
    const names = (items) => items.map((i) => `${esc(i.example)}${mine(i)}`).join(', ')
    const rows = codes.map((code) => {
      const c = sk.changes[code]
      const title = c.title ?? refs?.onetTitle(code) ?? code
      const link = { label: 'O*NET', url: onetJobUrl(code) }
      return block('alljob', `<b>${esc(title)}</b> <span class="tiny muted">${esc(`O*NET ${code}`)}</span>${labels}
        ${c.added.length ? `<div class="tiny">${esc(t('rdSkAdded'))}: ${names(c.added)}</div>` : ''}${c.dropped.length ? `<div class="tiny">${esc(t('rdSkDropped'))}: ${names(c.dropped)}</div>` : ''}<div class="tiny muted">${esc(itemDate)} ${srcLink(link)}</div>`, 'li')
    }).join('')
    return `<details${viewAllOn(state, 'sk') ? ' open' : ''}><summary>${esc(t('rdSkAllJobs', { count: codes.length }))}</summary>${codes.length ? `<ul class="rd-list small">${rows}</ul>` : none}</details>`
  }

  const own = rel?.occupations ?? []
  const showOwn = own.length > 0 && !viewAllOn(state, 'sk')
  let jobs = ''
  if (ok) jobs = showOwn ? own.map(ownJob).join('') : allJobs()
  else jobs = `<p class="small muted">${esc(t('rdSkUnavailable'))}</p>`

  const hot = ok
    ? block('hot', `${sub('rdSkHot')}${labels}<p class="tiny muted">${esc(t('rdSkHotNote'))}</p>${list(sk.hot?.added ?? [], hotLink)}${sk.hot?.dropped?.length ? `${sub('rdSkHotDropped')}${list(sk.hot.dropped, hotLink)}` : ''}`)
    : ''

  // B: posting counts of one yearly window; the first-snapshot note while the posting signals hold one window (D24).
  const p = sk?.postings
  let postings = ''
  if (p?.rows?.length) {
    const winLink = { label: p.window?.label ? `O*NET · ${p.window.label}` : 'O*NET Hot Technologies', url: ONET_HOT_URL }
    const row = (r) => `<tr><td>${esc(r.technology)}</td><td class="num">${numLink(fmtInt(r.postings), winLink)}</td></tr>`
    const head = `<tr><th>${esc(t('rdSkTechCol'))}</th><th class="num">${esc(t('rdSkAdsCol'))}</th></tr>`
    const total = finite(p.total) !== null ? `<tr><td><b>${esc(t('rdSkTotal'))}</b></td><td class="num">${numLink(fmtInt(p.total), winLink)}</td></tr>` : ''
    const top = p.rows.slice(0, 10)
    const rest = p.rows.slice(10)
    postings = block('postings', `${sub('rdSkPostings', { year: p.window?.year ?? DASH })}${labels}
      ${p.firstSnapshot ? `<p class="tiny"><b>${esc(t('rdSkFirstSnapshot'))}</b></p>` : ''}
      <div class="rd-scroll"><table>${head}${top.map(row).join('')}${total}</table></div>
      ${rest.length ? `<details><summary>${esc(t('rdSkMoreRows', { count: p.rows.length }))}</summary><div class="rd-scroll"><table>${head}${rest.map(row).join('')}</table></div></details>` : ''}`)
  }

  const srcline = sk && (sk.sourceLinks?.length || sk.fetchedAt)
    ? `<p class="tiny muted rd-srcline">${esc(t('rdEvSource'))}: ${(sk.sourceLinks ?? []).map(srcLink).join(' ')} · ${esc(t('rdEvFetched'))} ${esc(fmtDate(sk.fetchedAt))}</p>`
    : ''

  return `<div class="rd-col"><b>${esc(t('rdColOnet'))}</b> ${tag('src', t('rdTagObserved'))}
    <p class="small muted">${esc(t('rdColOnetNote'))}</p>
    ${heading ? `<p class="small"><b>${esc(heading)}</b></p>` : ''}
    ${own.length ? '' : hint(t)}
    ${jobs}${hot}${postings}${srcline}</div><!--col-->`
}

// ---------- Skills card: the skills the user's jobs ask for (profile charts spec D28-D30) ----------
// Worked out here in the browser from the confirmed profile and the public skills answer; nothing is sent.
// The list number is shown, never stored; the numbers are US job-ad counts (O*NET Hot Technologies), not a score.

const CORNER_CHOICES = [8, 16, 30, 'all']
const SK_SCALE = { kind: 'log', min: 10000, max: 5000000 }
const SK_RINGS = [{ value: 10000, label: '10k' }, { value: 100000, label: '100k' }, { value: 1000000, label: '1M' }]
const HOT_URL = 'https://www.onetonline.org/search/hot_tech/'
const summaryLink = (j) => srcLink({ label: j.title ? `${j.title} (${j.code})` : j.code, url: `https://www.onetonline.org/link/summary/${encodeURIComponent(j.code)}` })

// ---------- pages for the long numbered lists: 10 rows a page ----------
const PAGE_SIZE = 10
const ONET_DB_URL = 'https://www.onetcenter.org/database.html'

// The page to show: 1 when not set or not a number, the last page when past it.
export function pageOf(page, count, size = PAGE_SIZE) {
  const last = Math.max(1, Math.ceil(count / size))
  const p = Number.parseInt(page, 10)
  return Number.isFinite(p) ? Math.min(Math.max(p, 1), last) : 1
}
// The page that holds list row n (1-based).
export const pageForRow = (n, size = PAGE_SIZE) => Math.max(1, Math.ceil(Number(n) / size) || 1)
// "<list>:<page>" from a page button; null when it is not one.
export function parsePageArg(arg) {
  const m = /^(sk|ai|skDrop):(\d{1,6})$/.exec(String(arg ?? ''))
  return m ? { list: m[1], page: Math.max(1, Number(m[2])) } : null
}
// The list name of a Go to page form; null when it is not one.
export const parsePageList = (list) => (/^(sk|ai|skDrop)$/.test(String(list ?? '')) ? String(list) : null)
// The pages object with one list moved to a page (the others kept).
export const withPage = (pages, list, page) => ({ ...(pages ?? {}), [list]: page })
// The page numbers to show: first, last, current +-1, with '…' where pages are skipped.
export function pageItems(current, last) {
  const nums = [...new Set([1, current - 1, current, current + 1, last])].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)
  const out = []
  for (const n of nums) {
    if (out.length && n - out[out.length - 1] > 1) out.push('…')
    out.push(n)
  }
  return out
}
// ‹ 1 … 4 5 6 … N ›, the rows shown, then a small "Go to page" box. list = sk | ai | skDrop.
function pager(t, list, current, count) {
  const last = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const btn = (page, label, aria, extra = '') => `<button type="button" class="btn sm rd-pg" data-act="rdPage" data-arg="${esc(`${list}:${page}`)}" aria-label="${esc(aria)}"${extra}>${esc(label)}</button>`
  const off = (label, aria) => `<button type="button" class="btn sm rd-pg" aria-label="${esc(aria)}" disabled>${esc(label)}</button>`
  const prev = current > 1 ? btn(current - 1, '‹', t('rdPrevPage')) : off('‹', t('rdPrevPage'))
  const next = current < last ? btn(current + 1, '›', t('rdNextPage')) : off('›', t('rdNextPage'))
  const nums = pageItems(current, last).map((n) => (n === '…' ? '<span class="rd-gap-dots" aria-hidden="true">…</span>' : btn(n, String(n), t('rdPageN', { page: n }), n === current ? ' aria-current="page"' : ''))).join('')
  const id = `rdGo-${list}`
  const from = (current - 1) * PAGE_SIZE + 1
  const to = Math.min(current * PAGE_SIZE, count)
  return `<div class="rd-pagerow"><nav class="rd-pager" aria-label="${esc(t('rdPages'))}">${prev}${nums}${next}</nav>
    <span class="tiny muted">${esc(t('rdShowingRows', { from, to, n: count }))}</span>
    <form class="rd-goto" data-form="rdPageGo" data-arg="${esc(list)}" novalidate><label class="tiny muted" for="${esc(id)}">${esc(t('rdGoToPage'))}</label>
      <input id="${esc(id)}" class="rd-goin" type="number" inputmode="numeric" min="1" max="${last}" step="1" value="${current}"><button type="submit" class="btn sm">${esc(t('rdGo'))}</button></form></div>`
}
// One page of rows plus its page bar (none when the list fits one page).
function paged(t, list, rows, page) {
  const current = pageOf(page, rows.length)
  const slice = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  return { slice, bar: rows.length > PAGE_SIZE ? pager(t, list, current, rows.length) : '' }
}

// How a job reached the profile, when it is not the user's own O*NET role: "eMASCO 2512-02", "ISCED-F 0613".
function viaText(job) {
  const parts = (job.via ?? []).map((v) => (v.kind === 'chain' ? `eMASCO ${v.from.code}` : v.kind === 'field' ? `ISCED-F ${v.from.code}` : null))
  return [...new Set(parts.filter(Boolean))].join(', ')
}
const fromLine = (t, jobs) => `${esc(t('rdSkFrom'))}: ${jobs.map((j) => `${summaryLink(j)}${viaText(j) ? ` <span class="tiny">(${esc(viaText(j))})</span>` : ''}`).join(' · ')}`

// The code chain of each eMASCO role that reached O*NET jobs, every step with its official source.
function chainPaths(t, jobs) {
  const roles = new Map()
  for (const j of jobs) for (const v of j.via) if (v.kind === 'chain' && !roles.has(v.from.code)) roles.set(v.from.code, v)
  if (!roles.size) return ''
  const step = (st) => `${esc(st.from.system)} <code>${esc(st.from.codes.join(', '))}</code> → ${esc(st.to.system)} <code>${esc(st.to.codes.join(', '))}</code>${st.label ? ` <span>(${esc(st.label)})</span>` : ''}${st.source ? ` ${srcLink({ label: st.source.name.split(/[,:]/)[0], url: st.source.url })}` : ''}`
  // One fold per role: a one-line summary (code, step count), the steps with their sources inside, and the last official source beside it.
  const lines = [...roles.values()].map((v) => {
    const last = [...v.path].reverse().find((st) => st.source)
    const beside = last ? ` ${srcLink({ label: last.source.name.split(/[,:]/)[0], url: last.source.url })}` : ''
    return `<div class="rd-path tiny muted"><details class="rd-fold"><summary>${esc(t('rdChainFold', { code: v.from.code, n: v.path.length }))}</summary><b>${esc(t('rdChainPath'))}</b> · eMASCO ${esc(v.from.code)}: ${v.path.map(step).join(' · ')}</details>${beside}</div>`
  })
  return `${lines.join('')}<p class="tiny muted">${esc(t('rdChainSameUnit'))}</p>`
}

// "Not available for eMASCO {code}" notes: the step where the chain stops, worded from its kind in the user's
// language (the English reason stays as a tooltip), with that step's official source link.
function chainNotes(t, data, broken) {
  const stepWords = (m) => {
    const key = `rdChainStop_${m.kind}`
    const text = t(key, { system: m.from?.system ?? '', codes: (m.from?.codes ?? []).join(', ') })
    return text === key ? m.reason : text
  }
  const stopLink = (m) => {
    const url = (data.refs?.bridge?.steps ?? []).find((x) => x.id === m.id)?.source?.url
    return url ? ` ${srcLink({ label: t('rdEvSource'), url })}` : ''
  }
  return broken.map((b) => `<div class="rd-note small" title="${esc(b.missingStep.reason ?? '')}">${esc(t('rdChainBroken', { code: b.code, step: stepWords(b.missingStep) }))}${stopLink(b.missingStep)}</div>`).join('')
}

export function skillsChartCard({ t, state, data }) {
  const head = `<h2>${esc(t('rdSkChartTitle'))} ${tag('src', t('rdSkChartTag'))}</h2>`
  const wrapCard = (body) => `<div class="card rd-sec" data-sec="SK">${head}${body}</div>`
  const rel = relevance(state, data)
  if (!rel) return wrapCard(state?.profile?.profileStatus === 'confirmed' ? hint(t) : `<div class="hint">${esc(t('rdConfirmFirst'))} <button class="btn sm ghost" data-go="form">${esc(t('rdEditProfile'))}</button></div>`)
  const sk = data.skills
  if (!sk || sk.state !== 'data') return wrapCard(`<p class="small muted">${esc(t('rdSkUnavailable'))} ${srcLink({ label: 'O*NET', url: 'https://www.onetcenter.org/database.html' })}</p>`)

  const refs = refsFor(data.refs)
  const onetTitle = (code) => refs.onetTitle(code) ?? sk.changes?.[code]?.title ?? null
  const { jobs, broken } = profileJobs(rel, { chain: refs.chain, onetTitle })
  const sc = skillCorners(jobs, sk)
  const u = ui(state)
  const year = sc.window?.year ?? DASH
  const releaseId = sc.release?.current?.id ?? DASH
  const hotLink = (sk.sourceLinks ?? []).find((l) => /hot_tech/.test(l?.url ?? '')) ?? { label: 'O*NET Hot Technologies', url: HOT_URL }

  const notes = chainNotes(t, data, broken)
  const noJobs = !jobs.length && !broken.length ? hint(t) : ''

  // Numbered by US job ads; no-count skills come last. The list number is the corner number.
  const numbered = sc.items.map((it, i) => ({ ...it, n: i + 1 }))
  // Jobs without in-demand software: one plain note for one job, one fold line for more. "No chart is drawn" only when nothing is.
  const nNone = sc.noSkills.length
  const noCorners = !numbered.length
  let none = ''
  if (nNone === 1) {
    const [j] = sc.noSkills
    const text = noCorners ? t('rdSkNone', { job: '\u0001', release: releaseId }) : `${t('rdSkNoneOne', { job: '\u0001', release: releaseId })} ${t('rdSkNoneSome1')}`
    none = `<div class="rd-note small">${esc(text).replace('\u0001', summaryLink(j))}</div>`
  } else if (nNone > 1) {
    none = `<div class="rd-note small"><details class="rd-fold"><summary>${esc(t('rdSkNoneFold', { n: nNone, release: releaseId }))}</summary><ul class="rd-list small">${sc.noSkills.map((j) => `<li>${summaryLink(j)}</li>`).join('')}</ul></details>
      ${srcLink({ label: 'O*NET', url: ONET_DB_URL })} ${esc(noCorners ? t('rdSkNoChart') : t('rdSkNoneSome'))}</div>`
  }
  const withCount = numbered.filter((it) => it.postings !== null)
  let chart = ''
  if (withCount.length) {
    const choice = CORNER_CHOICES.includes(u.corners?.sk) ? u.corners.sk : 8
    const k = choice === 'all' ? withCount.length : Math.min(choice, withCount.length)
    const items = withCount.slice(0, k).map((it) => {
      const count = fmtInt(it.postings)
      return {
        id: String(it.n),
        label: it.example,
        value: it.postings,
        previous: it.previousPostings,
        hollow: it.isNew,
        valueText: `${count} ${t('rdSkAds')}`,
        aria: `${t('rdSkAria', { n: it.n, name: it.example, count, year })}${it.isNew ? `, ${t('rdSkNew', { release: releaseId })}` : ''}`,
      }
    })
    const seg = CORNER_CHOICES.map((c) => `<button class="${choice === c ? 'on' : ''}" data-act="skCorners" data-arg="${c}" aria-pressed="${choice === c}">${esc(c === 'all' ? t('rdCornersAll', { n: withCount.length }) : String(c))}</button>`).join('')
    chart = `<div class="rd-tools"><span class="small muted">${esc(t('rdCorners'))}</span><span class="seg" role="group" aria-label="${esc(t('rdCorners'))}">${seg}</span></div>
      <div class="rd-chart">${profileRadar({ items, scale: SK_SCALE, rings: SK_RINGS, act: 'skCorner', label: `${t('rdSkChartTitle')} · ${year}`, colour: 'accent', t })}</div>
      <p class="tiny muted rd-legend-line">${esc(t('rdSkLegend', { year }))}</p>
      ${sc.firstSnapshot ? `<p class="tiny muted rd-legend-line">${esc(t('rdSkOneYear'))}</p>` : ''}`
  }

  let list = ''
  if (numbered.length) {
    const q = String(u.q ?? '')
    const shown = filterItems(numbered, q)
    const row = (it) => {
      const count = it.postings === null ? `<span class="tiny muted">${esc(t('rdSkNoCount'))}</span>` : `${numLink(fmtInt(it.postings), hotLink)} <span class="tiny muted">${esc(t('rdSkAds'))} · ${esc(year)}</span>`
      return `<li id="rd-sk-${it.n}" class="rd-row${u.hl === it.n ? ' hl' : ''}"><span class="rd-rn">${it.n}</span>
        <span><b>${esc(it.example)}</b>${it.isNew ? ` <span class="rd-newmark">${esc(t('rdSkNew', { release: releaseId }))}</span>` : ''}<div class="tiny muted">${fromLine(t, it.jobs)}</div></span>
        <span class="rd-rc small">${count}</span></li>`
    }
    const pg = paged(t, 'sk', shown, u.pages?.sk)
    list = `<div class="rd-tools"><input id="rd-sk-q" type="search" data-radar-search="sk" value="${esc(q)}" placeholder="${esc(t('rdSkSearch', { n: numbered.length }))}" aria-label="${esc(t('rdSkSearch', { n: numbered.length }))}"><span class="tiny muted">${esc(t('rdSkShown', { shown: shown.length, n: numbered.length, year }))}</span></div>
      <ul class="rd-rank-list">${pg.slice.map(row).join('') || `<li class="rd-row"><span></span><span class="small muted">${esc(t('rdSkNoMatch'))}</span><span></span></li>`}</ul>${pg.bar}`
  }

  // The fold is open right after one of its pages was chosen (openDrop); any other action lets it be closed.
  const dpg = paged(t, 'skDrop', sc.dropped, u.pages?.skDrop)
  const dropped = sc.dropped.length
    ? `<details class="rd-fold"${u.openDrop ? ' open' : ''}><summary class="small">${esc(t('rdSkDroppedFold', { n: sc.dropped.length, previous: sc.release?.previous?.id ?? DASH, current: releaseId }))}</summary>
      <ul class="rd-rank-list">${dpg.slice.map((d) => `<li class="rd-row"><span class="rd-rn">–</span><span>${esc(d.example)}<div class="tiny muted">${fromLine(t, d.jobs)}</div></span><span></span></li>`).join('')}</ul>${dpg.bar}</details>`
    : ''

  const src = `<p class="tiny muted rd-srcline">${esc(t('rdEvSource'))}: ${(sk.sourceLinks ?? []).map(srcLink).join(' ')} · O*NET ${esc(releaseId)}${sc.release?.current?.month ? ` (${esc(sc.release.current.month)})` : ''} · ${esc(sc.window?.label ?? DASH)} · ${esc(t('rdEvFetched'))} ${esc(fmtDate(sk.fetchedAt))} · ${esc(t('rdSkLicence'))} · ${esc(t('rdSkSource'))}</p>`

  return wrapCard(`${notes}${chainPaths(t, jobs)}${none}${noJobs}${chart}${list}${dropped}${src}`)
}

// ---------- AI tasks card: how AI is used in the tasks of the user's jobs (profile charts spec D31-D32) ----------
// Worked out here in the browser from the confirmed profile and the public AI task answer; nothing is sent.
// The numbers are shares of observed AI conversations (Anthropic Economic Index), not a forecast and not a score.

const AI_CORNER_CHOICES = [8, 16, 'all']
const AEI_URL = 'https://huggingface.co/datasets/Anthropic/EconomicIndex'
const ILO_URL = 'https://doi.org/10.54394/HETP0387'
const JOB_SWITCH_MAX = 4 // more jobs than this (a field brings many) go in a drop-down, not a row of buttons

export function aiTasksCard({ t, state, data }) {
  const wrapCard = (body) => `<div class="card rd-sec" data-sec="AI"><h2>${esc(t('rdAiChartTitle'))} ${tag('est', t('rdAiChartTag'))}</h2>${body}</div>`
  const rel = relevance(state, data)
  if (!rel) return wrapCard(state?.profile?.profileStatus === 'confirmed' ? hint(t) : `<div class="hint">${esc(t('rdAiConfirmFirst'))} <button class="btn sm ghost" data-go="form">${esc(t('rdEditProfile'))}</button></div>`)
  const u = ui(state)
  const got = u.aiTasks
  if (!got || got.loading) return wrapCard(`<p class="small muted"><span class="spin"></span> ${esc(t('rdAiLoading'))}</p>`)
  const ai = got.ok ? got.data : null
  if (!ai || ai.state !== 'data') return wrapCard(`<p class="small muted">${esc(t('rdAiUnavailable'))} ${srcLink({ label: 'Anthropic Economic Index', url: AEI_URL })} ${srcLink({ label: 'ILO WP140', url: ILO_URL })}</p>`)

  const refs = refsFor(data.refs)
  const { jobs, broken } = profileJobs(rel, { chain: refs.chain, onetTitle: refs.onetTitle })
  const notes = chainNotes(t, data, broken)
  if (!jobs.length) return wrapCard(`${notes}${broken.length ? '' : hint(t)}`)

  const idx = Number.isInteger(u.aiJob) && u.aiJob >= 0 && u.aiJob < jobs.length ? u.aiJob : 0
  const job = jobs[idx]
  const jobName = job.title ?? job.code
  const switchBar = jobs.length > JOB_SWITCH_MAX
    ? `<div class="rd-tools"><label class="small muted" for="rd-ai-job">${esc(t('rdJob'))}</label><select id="rd-ai-job" data-radar-aijob>${jobs.map((j, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(`${j.title ?? j.code} (${j.code})`)}</option>`).join('')}</select></div>`
    : jobs.length > 1
      ? `<div class="rd-tools"><span class="small muted">${esc(t('rdJob'))}</span><span class="seg" role="group" aria-label="${esc(t('rdJob'))}">${jobs.map((j, i) => `<button class="${i === idx ? 'on' : ''}" data-act="aiJob" data-arg="${i}" aria-pressed="${i === idx}">${esc(j.title ?? j.code)}</button>`).join('')}</span></div>`
      : ''
  const jobLine = `<p class="small">${summaryLink(job)}${viaText(job) ? ` <span class="tiny">(${esc(viaText(job))})</span>` : ''}</p>`

  const { items, total, ilo, iscos } = taskCorners(job, ai, { iscoOf: refs.bridge.iscoOf })
  const link = (pattern) => (ai.sourceLinks ?? []).find((l) => pattern.test(l?.url ?? ''))
  const iloLink = link(/doi\.org/) ?? { label: 'ILO WP140', url: 'https://doi.org/10.54394/HETP0387' }
  const aeiLink = link(/huggingface\.co\/datasets\/Anthropic\/EconomicIndex$/) ?? { label: 'Anthropic Economic Index', url: AEI_URL }
  const gradient = (g) => { const key = `rdAiGrad_${g}`; const text = t(key); return text === key ? g : text }
  const exposure = ilo.length
    ? ilo.map((r) => `<p class="small">${esc(t('rdAiExposure', { job: jobName, gradient: gradient(r.gradient), isco: r.isco, title: r.title, mean: r.mean.toFixed(2) }))} ${srcLink(iloLink)}</p>`).join('')
    : iscos.length
      ? `<p class="small">${esc(`${jobName}: ${t('rdAiNoIloRow', { isco: iscos.join(', ') })}`)} ${srcLink(iloLink)}</p>`
      : `<p class="small">${esc(`${jobName}: ${t('rdAiNoIsco')}`)} ${srcLink(iloLink)}</p>`

  const release = `${ai.release ?? DASH} · ${ai.dataPeriod ?? DASH}`
  let chart = ''
  let list = ''
  if (!items.length) {
    chart = `<div class="rd-note small">${esc(t('rdAiNone', { total }))}</div>`
  } else {
    const numbered = items.map((it, i) => ({ ...it, n: i + 1 }))
    const choice = AI_CORNER_CHOICES.includes(u.corners?.ai) ? u.corners.ai : 8
    const k = choice === 'all' ? numbered.length : Math.min(choice, numbered.length)
    const rowText = (it) => t('rdAiRow', { auto: it.automation, aug: it.augmentation, usage: usageText(it.usage) ?? t('rdAiUnder') })
    const points = numbered.slice(0, k).map((it) => ({
      id: String(it.n),
      n: it.n,
      text: it.text,
      automation: it.automation,
      usage: it.usage,
      aria: `T${it.n}. ${it.text}: ${rowText(it)}`,
    }))
    const seg = AI_CORNER_CHOICES.map((c) => `<button class="${choice === c ? 'on' : ''}" data-act="aiCorners" data-arg="${c}" aria-pressed="${choice === c}">${esc(c === 'all' ? t('rdCornersAll', { n: numbered.length }) : String(c))}</button>`).join('')
    chart = `<div class="rd-tools"><span class="small muted">${esc(t('rdAiDots'))}</span><span class="seg" role="group" aria-label="${esc(t('rdAiDots'))}">${seg}</span>
      <span class="tiny muted">${esc(t('rdAiShown', { n: numbered.length, total }))}</span></div>
      <div class="rd-chart">${taskScatter({ items: points, act: 'aiCorner', label: `${t('rdAiChartTitle')} · ${jobName}`, t })}</div>
      <p class="tiny muted rd-legend-line">${esc(t('rdAiLegend'))}</p>`
    const pg = paged(t, 'ai', numbered, u.pages?.ai)
    list = `<ul class="rd-rank-list">${pg.slice.map((it) => `<li id="rd-ai-${it.n}" class="rd-row${u.aiHl === it.n ? ' hl' : ''}"><span class="rd-rn">T${it.n}</span>
      <span>${esc(it.text)}<div class="tiny muted">${esc(rowText(it))}</div></span>
      <span class="rd-rc tiny muted">${esc(release)} ${srcLink(aeiLink)}</span></li>`).join('')}</ul>${pg.bar}`
  }

  const src = `<p class="tiny muted rd-srcline">${esc(t('rdEvSource'))}: ${(ai.sourceLinks ?? []).map(srcLink).join(' ')} · ${esc(release)} · ${esc(t('rdEvFetched'))} ${esc(fmtDate(ai.fetchedAt))} · ${esc(t('rdAiLicence'))} · ${esc(t('rdAiSource'))}</p>`
  return wrapCard(`${notes}${chainPaths(t, jobs)}${switchBar}${jobLine}${exposure}${chart}${list}${src}`)
}

// After a render the search box is a new element: put the focus and the caret back where the user was typing.
export function keepCaret(pos, doc = document) {
  const box = doc.querySelector('[data-radar-search]')
  if (!box) return
  box.focus()
  box.setSelectionRange(pos, pos)
}

export function skillsTab({ t, state, data }) {
  const lang = state?.lang ?? 'en'
  const rel = relevance(state, data)
  const sc = scope(state, data, rel, 'sk')
  const occ = data.occ ?? {}
  const link = dosmLink(occ)
  const latest = occ.latestPeriod ?? DASH
  const groupLabel = (g) => `${g.code} · ${g.name}`
  const groupByCode = new Map((occ.groups ?? []).map((g) => [g.code, g]))

  // B1: change in share (pp) with text labels; while comparisons are insufficient, latest shares and counts (D18).
  const ice = sc.groups.filter((g) => isIce(g.signal))
  const breakPeriods = [...new Set(ice.flatMap((g) => g.signal?.rule?.vars?.breakPeriods ?? []))].sort()
  const lastBreak = breakPeriods.at(-1)
  const iceBanner = ice.length
    ? `<div class="banner b-warn rd-ice"><div>${tag('bad', t('rdIce'))} ${esc(t('rdIceReason', { period: breakPeriods.join(', ') || DASH, next: yearLater(lastBreak) }))} ${esc(t('rdIceShown'))} ${srcLink(link)}</div></div>`
    : ''
  // While no group has a comparable change (D18), the bars would repeat the status column, so only the table shows.
  const barRows = sc.groups.map((g) => {
    const s = g.signal
    const ok = s?.evidenceSufficiency === 'sufficient' && s?.change?.unit === 'pp'
    return { label: groupLabel(g), pp: ok ? finite(s.change.value) : null, direction: ok ? s.direction : null, text: isIce(s) ? t('rdIce') : t('rdSuff_insufficient_evidence') }
  })
  const bars = barRows.some((r) => r.pp !== null) ? `<div class="rd-chart">${divergingBars({ rows: barRows, t })}</div>` : ''
  const tableRows = sc.groups.map((g) => {
    const s = g.signal
    const share = latestOf(g.shares, occ)
    const count = latestOf(g.counts, occ)
    const ok = s?.evidenceSufficiency === 'sufficient' && finite(s?.change?.value) !== null
    const mine = sc.ownGroups.has(g.code) ? ` ${tag('calc', t('rdFromProfile'))}` : ''
    return `<tr><td><button class="btn sm ghost rd-pick" data-act="group" data-arg="${esc(g.code)}" aria-label="${esc(`${t('rdEvOpen')}: ${groupLabel(g)}`)}">${esc(groupLabel(g))}</button>${mine}</td>
      <td class="num">${numLink(fmtPct(share), link)}</td><td class="num">${numLink(fmtInt(count), link)}</td>
      ${ok ? `<td class="num">${numLink(`${fmtSigned(s.change.value, 2)} pp`, link)}</td>` : `<td class="muted">${DASH}</td>`}<td>${statusTag(s, t)}</td></tr>`
  }).join('')
  const total = latestOf(occ.total, occ)
  const ctx = occ.context
  const context = ctx
    ? `<p class="small rd-context"><b>${esc(t('rdContextLabel'))}</b>: ${numLink(fmtSignedPct(ctx.totalChangePercent, 1), link)}<br><span class="tiny muted">${esc(t('rdContextNote', { period: ctx.period ?? DASH, previous: ctx.previousPeriod ?? DASH }))}</span></p>`
    : ''
  const b1 = `<div class="card rd-sec" data-sec="B1">
    <h2>${esc(t('rdB1Title'))} ${tag('src', t('rdTagObserved'))}</h2>
    ${iceBanner}
    ${sc.groups.length ? `${bars}
    <div class="rd-scroll"><table><tr><th>${esc(t('rdGroupCol'))}</th><th class="num">${esc(t('rdLatestShare'))} (${esc(latest)})</th><th class="num">${esc(t('rdLatestCount'))} (${esc(latest)})</th><th class="num">${esc(t('rdEvChange'))}</th><th>${esc(t('rdEvidence'))}</th></tr>${tableRows}
    <tr><td><b>${esc(t('rdTotalAds'))}</b></td><td class="num">${numLink(fmtPct(100), link)}</td><td class="num">${numLink(fmtInt(total), link)}</td><td></td><td></td></tr></table></div>` : `<p class="small muted">${esc(t('rdNoGroupsMine'))}</p>`}
    ${context}
    <p class="tiny muted rd-srcline">${esc(t('rdEvSource'))}: ${esc(data.sources?.find((s) => s.sourceId === 'dosm')?.name ?? 'DOSM')} ${(occ.sourceLinks ?? []).map(srcLink).join(' ')} · ${esc(t('rdObsPeriod'))} ${esc(latest)} · ${esc(t('rdPublished'))} ${esc(fmtDate(occ.publishedAt))} · ${esc(t('rdEvFetched'))} ${esc(fmtDate(occ.fetchedAt))} · ${esc(t('rdSnapshot'))} <code>${esc(occ.snapshotId ?? DASH)}</code></p>
  </div>`

  // B2: three columns kept apart: O*NET skills in US job ads (D23), the derived proxy (not produced, D13), AI research.
  const aiRows = sc.axes.map((a) => {
    const s = a.signal
    const papers = finite(s?.baseline?.value) !== null && finite(s?.recent?.value) !== null ? numLink(`${fmtInt(s.baseline.value)} → ${fmtInt(s.recent.value)}`, axisLink(a)) : esc(DASH)
    return `<tr><td>${esc(axisLabel(a, t, lang))}<div class="tiny muted">${esc(a.openalexId ?? '')} ${srcLink({ label: 'OpenAlex', url: a.sourceUrl })}</div></td><td>${statusTag(s, t)}<div class="tiny">${papers}</div></td></tr>`
  }).join('')
  const b2 = `<div class="card rd-sec" data-sec="B2">
    <h2>${esc(t('rdB2Title'))}</h2>
    <div class="rd-three">
      ${onetColumn({ t, state, data, rel, lang })}
      <div class="rd-col"><b>${esc(t('rdColProxy'))}</b> ${tag('unv', t('rdNotProduced'))}<p class="small muted">${esc(t('rdColProxyNote'))}</p></div><!--col-->
      <div class="rd-col"><b>${esc(t('rdColAi'))}</b> ${tag('est', t('rdTagResearch'))}<p class="small muted">${esc(t('rdColAiNote'))}</p>${sc.axes.length ? `<div class="rd-scroll"><table>${aiRows}</table></div>` : rel ? fieldLinks(t, rel) : ''}</div><!--col-->
    </div>
  </div>`

  // B5: the user's fields: linked jobs (official crosswalk), their DOSM groups (group level), linked AI axes (approved).
  const bridge = data.refs ? refsFor(data.refs).bridge : null
  const groupStatus = (source, code) => {
    const g = bridge?.groupOf(source, code) ?? { status: 'unmapped' }
    if (g.status === 'mapped' && g.groupCode) return `${t('rdGroupLevel')}: ${g.groupCode} · ${groupByCode.get(g.groupCode)?.name ?? ''}`
    return t(g.status === 'pending' ? 'rdGroupPending' : 'rdGroupUnmapped')
  }
  const b5body = rel?.fields?.length
    ? `<div class="grid g2">${rel.fields.map((f) => {
      const jobs = f.jobs.length
        ? `<ul class="rd-list small">${f.jobs.map((j) => `<li>${esc(j.title)} · O*NET ${esc(j.code)} ${srcLink({ label: 'O*NET', url: `https://www.onetonline.org/link/summary/${encodeURIComponent(j.code)}` })}<div class="tiny muted">${esc(groupStatus('onet', j.code))}</div></li>`).join('')}</ul>`
        : `<p class="small muted">${esc(t('rdEvNone'))}</p>`
      const axes = f.topics.length
        ? `<ul class="rd-list small">${f.topics.map((l) => {
          const a = (data.ai?.axes ?? []).find((x) => x.axisId === l.axisId)
          return `<li>${esc(t(`rdAxis_${l.axisId}`))} ${a ? statusTag(a.signal, t) : ''}<div class="tiny muted">${esc(t('rdApprovedAt', { level: t(LEVEL_KEYS[l.level] ?? 'rdLevel_detailed') }))} · ${esc(l.mappingId ?? '')} ${a ? srcLink({ label: a.openalexId ?? 'OpenAlex', url: a.sourceUrl }) : ''}</div></li>`
        }).join('')}</ul>`
        : `<p class="small"><b>${esc(t('rdNoFieldLinks'))}</b></p>`
      return `<div class="rd-mini"><b>${esc(`${f.code} · ${f.title ?? f.code}`)}</b>
        <div class="tiny muted rd-subhead">${esc(t('rdLinkedJobs'))} · ${esc(t('rdLinkedGroups'))}</div>${jobs}
        <div class="tiny muted rd-subhead">${esc(t('rdLinkedAxes'))}</div>${axes}</div>`
    }).join('')}</div>`
    : `<p class="small muted">${esc(t('rdB5None'))}</p>`
  const b5 = `<div class="card rd-sec" data-sec="B5"><h2>${esc(t('rdB5Title'))}</h2>${b5body}</div>`

  // B6: what changed for the user's jobs, roles and fields, with links; then on to the next module.
  const items = []
  for (const o of rel?.occupations ?? []) {
    const g = o.group?.groupCode ? groupByCode.get(o.group.groupCode) : null
    const who = `${o.title ?? o.code} (${o.source === 'emasco' ? 'eMASCO' : 'O*NET'} ${o.code}) · ${t(`rdRole_${o.role}`)}`
    if (g) {
      items.push(`<li><b>${esc(who)}</b> ${srcLink(jobLink(data, o))}<div class="small">${esc(t('rdGroupLevel'))}: ${esc(groupLabel(g))} · ${esc(t('rdLatestShare'))} ${numLink(fmtPct(latestOf(g.shares, occ)), link)} ${statusTag(g.signal, t)}</div><div class="tiny muted">${esc(t('rdPath'))}: ${esc(t('rdPathPrefix'))}</div></li>`)
    } else {
      items.push(`<li><b>${esc(who)}</b> ${srcLink(jobLink(data, o))}<div class="small muted">${esc(t(o.group?.status === 'pending' ? 'rdGroupPending' : 'rdGroupUnmapped'))}</div></li>`)
    }
  }
  for (const f of rel?.fields ?? []) {
    items.push(`<li><b>${esc(`${f.code} · ${f.title ?? f.code}`)}</b><div class="small">${f.topics.length ? esc(f.topics.map((l) => t(`rdAxis_${l.axisId}`)).join(', ')) : esc(t('rdNoFieldLinks'))}</div></li>`)
  }
  items.push(`<li><b>${esc(t('rdB6Insufficient'))}</b> ${tag('unv', t('rdTagNone'))}</li>`)
  const b6 = `<div class="card rd-sec" data-sec="B6"><h2>${esc(t('rdB6Title'))}</h2>
    ${rel ? '' : hint(t)}
    <ul class="rd-list">${items.join('')}</ul>
    <p class="tiny muted">${esc(t('rdB6Basis', { manifest: data.manifestId ?? DASH }))} ${esc(t('rdNoRankings'))}</p>
    <div class="row" style="margin-top:10px"><button class="btn pri" data-go="match">${esc(t('rdB6Next'))}</button></div>
  </div>`

  return `${sc.mine ? '' : `<p class="small muted rd-scope">${esc(t('rdGlobalView'))}</p>`}${skillsChartCard({ t, state, data })}${b1}${b2}${b5}${b6}${viewAll(t, state, 'sk')}`
}

// ---------- evidence drawer ----------

function drawer(t, state, data) {
  const open = ui(state).open
  if (!open || !data) return ''
  const lang = state?.lang ?? 'en'
  const fetched = ui(state).signal
  let html = ''
  if (open.kind === 'axis') {
    const a = (data.ai?.axes ?? []).find((x) => x.axisId === open.id)
    if (!a) return ''
    const signal = fetched?.signalId && fetched.signalId === a.signal?.signalId ? fetched : a.signal
    const cs = data.ai?.reference?.series ?? []
    const B = signal?.baseline?.period
    const R = signal?.recent?.period
    const csB = cs.find((p) => String(p.year) === String(B))?.value
    const csR = cs.find((p) => String(p.year) === String(R))?.value
    const rows = []
    if (finite(csB) !== null && finite(csR) !== null && csB > 0) rows.push([t('rdCsContext'), numLink(`${fmtInt(csB)} → ${fmtInt(csR)} (${fmtSignedPct((csR / csB - 1) * 100, 0)})`, csLink(data.ai))])
    const share = a.momentum?.share?.current
    if (finite(share?.value) !== null) rows.push([t('rdMetricShare'), numLink(`${fmt(share.value, 1)} (${fmt(share.ratio, 2)}×)`, csLink(data.ai) ?? signalLink(signal))])
    html = evidencePanel(signal, t, { title: axisLabel(a, t, lang), officialTitle: a.officialTitle, description: a.description, subfield: a.hierarchy?.subfield?.name, rows })
  } else {
    const occ = data.occ ?? {}
    const g = (occ.groups ?? []).find((x) => x.code === open.id)
    if (!g) return ''
    const signal = fetched?.signalId && fetched.signalId === g.signal?.signalId ? fetched : g.signal
    const rel = relevance(state, data)
    const jobs = (rel?.occupations ?? []).filter((o) => o.group?.groupCode === g.code).map((o) => o.title ?? o.code)
    html = evidencePanel(signal, t, {
      title: `${g.code} · ${g.name}`,
      publishedAt: occ.publishedAt,
      counts: { group: latestOf(g.counts, occ), total: latestOf(occ.total, occ), share: latestOf(g.shares, occ) },
      rows: [[t('rdJobsInGroup'), esc(jobs.length ? jobs.join(', ') : t('rdEvNone'))]],
    })
  }
  return `<aside class="rd-drawer card" role="dialog" aria-modal="false" aria-label="${esc(t('rdEvTitle'))}" tabindex="-1" id="radarDrawer">
    <div class="row rd-drawer-top"><b>${esc(t('rdEvTitle'))}</b><span class="sp"></span><button class="btn sm" data-act="evClose">${esc(t('rdEvClose'))}</button></div>
    ${html}</aside>`
}

// ---------- the screen ----------

// The Radar UI state with its loaded data dropped, so the next visit to #radar loads afresh. Used after an admin
// decision, refresh or clean-up: a field-topic decision changes the references without a manifest of its own, so the
// data shown would stay out of date. The view choices (tab, mode, hidden lines, View all) and the banner flag stay.
export const staleRadar = (radar) => ({ ...(radar ?? {}), data: null, open: null, signal: null, newerManifestId: null, gone: false, error: null, loading: false })

// "Which of these do you use AI for?" (D34-D39): the owner's 10 categories as checkboxes, "none of these", the source
// and privacy lines, Continue (off until something is ticked) and Skip. Ticks not yet saved are in state.radar.aiAsk;
// otherwise the saved answer is shown. Only known ids are ever drawn, so a saved unknown id is never echoed.
// Where the keyboard focus goes after a card action, as a selector (a render replaces the page): the same box after a
// tick or "none", the first box when the card opens, the Change button after Continue or Skip. Only known ids are used.
export function aiAskFocus(act, arg) {
  if (act === 'pick') return AI_TASK_IDS.includes(arg) ? `[data-act="aiAskPick"][data-arg="${arg}"]` : null
  if (act === 'none') return '[data-act="aiAskNone"]'
  if (act === 'open') return '[data-act="aiAskPick"]'
  if (act === 'continue' || act === 'skip') return '[data-act="aiAskOpen"]'
  return null
}

export function aiTasksQuestion({ t, state }) {
  const { picked, none } = askOf(state?.profile, ui(state).aiAsk)
  const box = (act, arg, on) => `<input type="checkbox" data-act="${act}"${arg ? ` data-arg="${arg}"` : ''}${on ? ' checked' : ''}>`
  const opts = AI_TASK_IDS.map((id) => `<label class="rd-aiask-opt">${box('aiAskPick', id, picked.includes(id))} <span>${esc(t(`rdAiTask_${id}`))}<span class="tiny muted">${esc(t(`rdAiTaskEx_${id}`))}</span></span></label>`).join('')
  return `<article class="rd-srccard rd-aiask"><fieldset><legend>${esc(t('rdAiAskTitle'))}</legend>
      <p class="small muted">${esc(t('rdAiAskSub'))}</p>
      <div class="rd-aiask-opts">${opts}
      <label class="rd-aiask-opt rd-aiask-none">${box('aiAskNone', null, none)} <span>${esc(t('rdAiAskNone'))}</span></label></div>
      <p class="tiny muted">${esc(t('rdAiAskSource'))}</p>
      <p class="tiny muted">${esc(t('rdAiAskPrivacy'))}</p>
      <div class="rd-aiask-btns"><button class="btn" data-act="aiAskContinue"${canContinue({ picked, none }) ? '' : ' disabled'}>${esc(t('rdAiAskContinue'))}</button> <button class="btn ghost" data-act="aiAskSkip">${esc(t('rdAiAskSkip'))}</button></div>
    </fieldset></article>`
}

export function radarView({ t, state, data }) {
  const u = ui(state)
  const head = `<h1>${esc(t('rdTitle'))}</h1><p class="lead">${esc(t('rdLead'))}</p><p class="small muted">${esc(t('rdSub'))}</p>`
  if (!data) {
    const body = u.gone
      ? ''
      : u.error
        ? `<div class="banner b-bad"><div>${esc(t('rdUnavailable'))}</div><button class="btn sm" data-act="reloadManifest">${esc(t('rdReload'))}</button></div>`
        : `<p class="muted"><span class="spin"></span> ${esc(t('rdLoading'))}</p>`
    return `<div class="rd">${head}${banners(t, state, null)}${body}</div>`
  }
  const tab = radarTabOf(state)
  const tabs = [['fy', 'rdTabFY', 'rdTabFYq'], ['ex', 'rdTabEX', 'rdTabEXq']]
  const tabBar = `<div class="tabs rd-tabs" role="tablist">${tabs.map(([id, label, q]) => `<button role="tab" id="rdtab-${id}" aria-controls="radarPanel" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="radarTab" data-arg="${id}"><span>${esc(t(label))}</span><span class="rd-q">${esc(t(q))}</span></button>`).join('')}</div>`
  const body = tab === 'ex' ? exploreTab({ t, state, data }) : forYouTab({ t, state, data })
  // The source the page uses sits at the bottom, below the tabs (owner, 31 Oct).
  return `<div class="rd">${head}${banners(t, state, data)}
    ${tabBar}
    <section class="rd-tab" role="tabpanel" id="radarPanel" aria-labelledby="rdtab-${tab}">${body}</section>
    <div class="rd-srcgrid">${statusCards(data.states, t, { sources: data.sources, manifestId: data.manifestId, ai: data.ai, occ: data.occ, ids: ['openalex'] })}</div>
    ${sourcesList(t, (data.sources ?? []).filter((s) => s.sourceId === 'openalex'))}
    ${drawer(t, state, data)}</div>`
}

export default ({ t, state }) => radarView({ t, state, data: state?.radar?.data ?? null })
