// Future Skills Radar screen (spec §11): Skills & Careers (first tab, opens by default, D21) and AI Impact.
// Uses the app's own design (D22): styles.css tokens and classes, plus a few rd-* classes built on them.
// By default only the user's own fields, jobs and roles and what they reach (D2); "View all" is the last element of
// each tab. Every number has its source link next to it (D3). Relevance is worked out here, in the browser, from the
// confirmed profile and the public reference data; nothing personal is sent to the server (spec §11.2).
import { esc, tag } from '../ui.js'
import { radarChart } from '../components/charts/radarChart.js'
import { lineChart } from '../components/charts/lineChart.js'
import { divergingBars } from '../components/charts/divergingBars.js'
import { DASH, finite, fmt, fmtSigned } from '../components/charts/format.js'
import { evidencePanel, fmtDate, fmtInt, fmtPct, fmtSignedPct, numLink, safeUrl, signalLink, srcLink, statusTag } from '../components/evidencePanel.js'
import { relevantItems } from '../../../shared/radar/relevance.js'
import { makeBridge } from '../../../shared/radar/bridge.js'

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
const tabOf = (state) => (ui(state).tab === 'ai' ? 'ai' : 'sk')
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
  return `<div class="rd-viewall"><button class="btn" data-act="viewAll" data-arg="${tab}" aria-pressed="${on}">${esc(t(on ? 'rdViewMine' : 'rdViewAll'))}</button>
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

// statusCards(states, t, {sources, manifestId, ai, occ}): one card per source with its link, observation period,
// publication date (DOSM), last successful fetch, manifest id and the five answer-state dimensions (spec §11.1, §12).
export function statusCards(states, t, { sources = [], manifestId = null, ai = null, occ = null } = {}) {
  const signals = { openalex: (ai?.axes ?? []).map((a) => a.signal).filter(Boolean), dosm: (occ?.groups ?? []).map((g) => g.signal).filter(Boolean) }
  return `<div class="grid g2 rd-status">${['openalex', 'dosm'].map((id) => {
    const st = states?.[id] ?? {}
    const src = sources.find((s) => s.sourceId === id)
    const name = src?.name ?? (id === 'dosm' ? 'DOSM' : 'OpenAlex')
    const link = (src?.links ?? []).find((l) => safeUrl(l?.url))
    const health = st.refreshHealth === 'failed' && st.refreshCode ? `${dim(t, 'Health', st.refreshHealth)} (${dim(t, 'Err', st.refreshCode)})` : dim(t, 'Health', st.refreshHealth)
    const fresh = id === 'dosm' && st.expectedNextRelease ? `${dim(t, 'Fresh', st.freshness)} · ${t('rdNextRelease', { date: fmtDate(st.expectedNextRelease) })}` : dim(t, 'Fresh', st.freshness)
    const rows = [
      ['rdDim_availability', dim(t, 'Avail', st.availability)],
      ['rdDim_freshness', fresh],
      ['rdDim_refreshHealth', health],
      ['rdDim_servedFrom', dim(t, 'Served', st.servedFrom)],
      ['rdDim_comparability', comparability(t, signals[id])],
    ]
    return `<div class="card rd-src-card">
      <h3>${esc(name)} ${link ? srcLink(link) : ''}</h3>
      <p class="tiny muted">${esc(t('rdObsPeriod'))}: ${esc(st.observationPeriod ?? DASH)}${id === 'dosm' ? ` · ${esc(t('rdPublished'))}: ${esc(fmtDate(st.publishedAt))}` : ''} · ${esc(t('rdLastFetch'))}: ${esc(fmtDate(st.lastSuccessAt))}</p>
      <p class="tiny muted">${esc(t('rdManifestId'))}: <code>${esc(manifestId ?? DASH)}</code></p>
      <dl class="rd-kv tiny">${rows.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>`
  }).join('')}</div>`
}

// Two compact cards for the O*NET sources (US job ads): name, release or counting window, fetched date, link and the
// source's state (availability, last refresh and its code), shown the same way as the OpenAlex and DOSM cards.
// sources = the /api/radar/sources entries; states = data.states; anything else is left out. Every text goes through esc().
export function onetSourceCards(sources, t, states = {}) {
  const cards = (sources ?? []).filter((s) => s?.sourceId === 'onet-skills' || s?.sourceId === 'onet-hottech').map((s) => {
    const skills = s.sourceId === 'onet-skills'
    const link = (s.links ?? []).find((l) => safeUrl(l?.url))
    const period = skills ? s.version ?? s.observationPeriod : s.window?.label ?? s.observationPeriod
    const st = states?.[s.sourceId] ?? {}
    const health = st.refreshHealth === 'failed' && st.refreshCode ? `${dim(t, 'Health', st.refreshHealth)} (${dim(t, 'Err', st.refreshCode)})` : dim(t, 'Health', st.refreshHealth)
    const rows = [
      ['rdDim_availability', dim(t, 'Avail', st.availability)],
      ['rdDim_refreshHealth', health],
    ]
    return `<div class="card rd-src-card rd-onet-card">
      <h3>${esc(t(skills ? 'rdSrcOnetSkills' : 'rdSrcOnetHot'))} ${link ? srcLink(link) : ''}</h3>
      <p class="tiny muted">${esc(t(skills ? 'rdAdminOnetActiveRelease' : 'rdAdminOnetActiveWindow'))}: ${esc(period ?? DASH)} · ${esc(t('rdEvFetched'))}: ${esc(fmtDate(s.fetchedAt))}</p>
      <dl class="rd-kv tiny">${rows.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="tiny muted">${esc(t('rdSkLabelUs'))} · ${esc(t('rdSkLabelSoftware'))}</p>
    </div>`
  })
  return cards.length ? `<div class="grid g2 rd-status rd-onet">${cards.join('')}</div>` : ''
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

function profileCard(t, rel, data) {
  if (!rel) return `<div class="card rd-profile"><h2>${esc(t('rdYourProfile'))}</h2>${hint(t)}</div>`
  const fields = rel.fields.map((f) => `<li>${esc(`${f.code} · ${f.title ?? f.code}`)}</li>`).join('')
  const roles = rel.occupations.map((o) => `<li>${esc(o.title ?? o.code)} <span class="tiny muted">${esc(`${o.source === 'emasco' ? 'eMASCO' : 'O*NET'} ${o.code} · ${t(`rdRole_${o.role}`)}`)}</span> ${srcLink(jobLink(data, o))}</li>`).join('')
  const interests = rel.interests.map((i) => `<li>${esc(i.name)}</li>`).join('')
  const col = (title, list, note = '') => `<div class="rd-mini"><b>${esc(t(title))}</b>${list ? `<ul class="rd-list small">${list}</ul>` : `<p class="small muted">${DASH}</p>`}${note}</div>`
  return `<div class="card rd-profile"><h2>${esc(t('rdYourProfile'))}</h2>
    <div class="grid g3">${col('rdFieldsLabel', fields)}${col('rdRolesLabel', roles)}${col('rdInterestsLabel', interests, `<p class="tiny muted">${esc(t('rdInterestsNote'))}</p>`)}</div>
    <p class="tiny muted" style="margin-top:8px">${esc(t('rdProfileNote'))} <button class="btn sm ghost" data-go="form">${esc(t('rdEditProfile'))}</button></p>
    ${rel.groups.length + rel.axes.length ? '' : hint(t)}
  </div>`
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
  const lang = state?.lang ?? 'en'
  const rel = relevance(state, data)
  const sc = scope(state, data, rel, 'ai')
  const mode = ui(state).mode === 'share' ? 'share' : 'count'
  const hidden = new Set(ui(state).hidden ?? [])
  const allAxes = data.ai?.axes ?? []
  const ai = data.ai ?? {}

  // A2: all six axes (global evidence); the user's linked axes highlighted (approved links only).
  const chartAxes = allAxes.map((a) => {
    const cur = momentumOf(a, mode)?.current
    return { axisId: a.axisId, label: axisLabel(a, t, lang), value: finite(cur?.value), state: cur?.state ?? 'invalid', capped: Boolean(cur?.capped), ratio: finite(cur?.ratio), smallCounts: Boolean(cur?.smallCounts), highlighted: sc.ownAxes.has(a.axisId) }
  })
  const comparison = allAxes.map((a) => finite(momentumOf(a, mode)?.comparison?.value))
  const validCount = chartAxes.filter((a) => a.value !== null).length
  const win = allAxes.map((a) => momentumOf(a, mode)?.current).find((c) => c?.baselineYear)
  const cmpWin = allAxes.map((a) => momentumOf(a, mode)?.comparison).find((c) => c?.baselineYear)
  const winText = (w) => (w ? `${w.baselineYear} → ${w.recentYear}` : DASH)

  const rows = allAxes.map((a) => {
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
    <p class="tiny muted">${esc(t('rdTooltip'))}</p>
    <div class="row rd-controls"><span class="seg" role="group" aria-label="${esc(t('rdMomentum'))}">
      <button class="${mode === 'count' ? 'on' : ''}" data-act="radarMode" data-arg="count" aria-pressed="${mode === 'count'}">${esc(t('rdMetricCount'))}</button><button class="${mode === 'share' ? 'on' : ''}" data-act="radarMode" data-arg="share" aria-pressed="${mode === 'share'}">${esc(t('rdMetricShare'))}</button>
    </span>
    <span class="tiny muted">${esc(t('rdWindowSelected'))}: ${esc(winText(win))} · ${esc(t('rdWindowCompare'))}: ${esc(winText(cmpWin))}</span></div>
    ${validCount < 3 ? `<p class="small muted">${esc(t('rdFewAxes'))}</p>` : ''}
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

  return `${sc.mine ? '' : !rel || !rel.axes.length ? `<p class="small muted rd-scope">${esc(t('rdGlobalView'))}</p>` : ''}${a2}${a1}${a5}${viewAll(t, state, 'ai')}`
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

  return `${sc.mine ? '' : `<p class="small muted rd-scope">${esc(t('rdGlobalView'))}</p>`}${b1}${b2}${b5}${b6}${viewAll(t, state, 'sk')}`
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
  const rel = relevance(state, data)
  const tab = tabOf(state)
  const tabs = [['sk', 'rdTabSK', 'rdTabSKq'], ['ai', 'rdTabAI', 'rdTabAIq']]
  const tabBar = `<div class="tabs rd-tabs" role="tablist">${tabs.map(([id, label, q]) => `<button role="tab" id="rdtab-${id}" aria-controls="radarPanel" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="radarTab" data-arg="${id}"><span>${esc(t(label))}</span><span class="rd-q">${esc(t(q))}</span></button>`).join('')}</div>`
  const body = tab === 'ai' ? aiTab({ t, state, data }) : skillsTab({ t, state, data })
  return `<div class="rd">${head}${banners(t, state, data)}
    ${statusCards(data.states, t, { sources: data.sources, manifestId: data.manifestId, ai: data.ai, occ: data.occ })}
    ${onetSourceCards(data.sources, t, data.states)}
    ${sourcesList(t, data.sources ?? [])}
    ${profileCard(t, rel, data)}
    ${tabBar}
    <section class="rd-tab" role="tabpanel" id="radarPanel" aria-labelledby="rdtab-${tab}">${body}</section>
    ${drawer(t, state, data)}</div>`
}

export default ({ t, state }) => radarView({ t, state, data: state?.radar?.data ?? null })
