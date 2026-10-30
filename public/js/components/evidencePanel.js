// The Radar evidence panel (spec §11.5): everything behind one signal, with a source link next to every number (D3).
// Also the small helpers the Radar screen shares: linked numbers, number and date text, rule text (ruling R16/R18).
import { esc, tag } from '../ui.js'
import { DASH, finite, fmt, fmtSigned } from './charts/format.js'
import { RADAR_CONFIG } from '../../../shared/radar/config.js'

// Only web links are shown as links; anything else is dropped (never a javascript: or relative URL).
export const safeUrl = (url) => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null)

export const srcLink = (link) => {
  const url = safeUrl(link?.url)
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="rd-src">${esc(link.label || url)}</a>` : ''
}

// A number (already formatted) with its source link right after it. Without a usable link it is plain text.
export function numLink(text, link) {
  const a = srcLink(link)
  return a ? `<span class="rd-n"><span class="rd-num">${esc(text)}</span> ${a}</span>` : `<span class="rd-n">${esc(text)}</span>`
}

// Whole numbers with thousands separators; percentages and other values with fixed decimals.
export const fmtInt = (v) => {
  const s = fmt(v, 0)
  return s === DASH ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
export const fmtPct = (v, dp = 2) => (finite(v) === null ? DASH : `${fmt(v, dp)}%`)
export const fmtSignedPct = (v, dp = 1) => (finite(v) === null ? DASH : `${fmtSigned(v, dp)}%`)

// ISO time → "2026-10-30 06:07 UTC"; a plain date stays as it is; anything else → "—".
export function fmtDate(value) {
  if (typeof value !== 'string' || !value) return DASH
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC` : DASH
}

// Ruling R16: every rule variable is formatted before t(): pp 2 dp, percent 1 dp, ratio 2 dp, counts whole,
// null → "—", arrays joined with ", ". Volatility is in pp for DOSM (2 dp) and in log points for OpenAlex (1 dp).
const PP = new Set(['pp', 'materialPp'])
const PERCENT = new Set(['relativePercent', 'materialRelativePercent'])
const RATIO = new Set(['ratio', 'limit', 'rising', 'declining', 'ratioAtLeast'])
const WHOLE = new Set(['agree', 'clean', 'years', 'minYears', 'quarters', 'minQuarters', 'baseline', 'recent', 'baselineBelow', 'recentAtLeast'])

function ruleValue(name, value, dosm) {
  if (Array.isArray(value)) return value.length ? value.map((v) => ruleValue(name, v, dosm)).join(', ') : DASH
  if (value === null || value === undefined) return DASH
  if (typeof value !== 'number') return String(value)
  if (!Number.isFinite(value)) return DASH
  if (PP.has(name)) return fmt(value, 2)
  if (PERCENT.has(name)) return fmt(value, 1)
  if (RATIO.has(name)) return fmt(value, 2)
  if (WHOLE.has(name)) return fmtInt(value)
  if (name === 'volatility' || name === 'high') return fmt(value, dosm ? 2 : 1)
  return fmt(value, 2)
}

export function ruleVars(rule) {
  const dosm = /^rdRuleDosm/.test(String(rule?.key ?? ''))
  return Object.fromEntries(Object.entries(rule?.vars ?? {}).map(([k, v]) => [k, ruleValue(k, v, dosm)]))
}

export const ruleText = (rule, t) => (rule?.key ? t(rule.key, ruleVars(rule)) : '')

const isDosm = (signal) => signal?.evidenceKind === 'occupation_group'
const ice = (signal) => signal?.evidenceSufficiency === 'insufficient_comparable_evidence'
const links = (signal) => (signal?.evidenceLinks ?? []).filter((l) => safeUrl(l?.url))
// The link put next to a number: the signal's first source link, labelled with the source's short name.
export const signalLink = (signal) => {
  const first = links(signal)[0]
  return first ? { label: isDosm(signal) ? 'DOSM' : 'OpenAlex', url: first.url } : null
}

// Status tag of a signal: Insufficient Comparable Evidence (D18), insufficient evidence, or the direction.
export function statusTag(signal, t) {
  if (!signal) return tag('unv', t('rdTagNone'))
  if (signal.evidenceSufficiency === 'insufficient_comparable_evidence') return tag('bad', t('rdIce'))
  if (signal.evidenceSufficiency !== 'sufficient' || !signal.direction) return tag('unv', t('rdSuff_insufficient_evidence'))
  const kind = signal.direction === 'rising' || signal.direction === 'emerging' ? 'ok' : signal.direction === 'declining' ? 'bad' : 'unv'
  return tag(kind, t(`rdDir_${signal.direction}`))
}

// A value in the signal's own unit.
function valueText(value, unit) {
  if (unit === 'percent') return fmtPct(value)
  if (unit === 'papers' || unit === 'offerings') return fmtInt(value)
  return fmt(value, 2)
}

function changeText(change) {
  if (!change) return DASH
  const main = change.unit === 'pp' ? `${fmtSigned(change.value, 2)} pp` : change.unit === 'percent' ? fmtSignedPct(change.value) : `${fmtSigned(change.value, 2)} log2`
  return finite(change.relativePercent) === null ? main : `${main} (${fmtSignedPct(change.relativePercent)})`
}

function formula(signal, t, extra) {
  const link = signalLink(signal)
  if (isDosm(signal)) {
    const b = signal.baseline?.value
    const r = signal.recent?.value
    const parts = [esc(t('rdFormulaShare'))]
    // Insufficient comparable evidence (D18): the year-on-year difference is not shown, only the latest share.
    if (!ice(signal) && finite(b) !== null && finite(r) !== null) parts.push(numLink(`${fmtPct(r)} − ${fmtPct(b)} = ${fmtSigned(r - b, 2)} pp`, link))
    if (extra?.counts) parts.push(numLink(`${fmtInt(extra.counts.group)} ÷ ${fmtInt(extra.counts.total)} × 100 = ${fmtPct(extra.counts.share)}`, link))
    return parts.join('<br>')
  }
  const m = signal.momentum
  const B = signal.baseline?.value
  const R = signal.recent?.value
  if (!m || m.state !== 'ok' || finite(m.value) === null) return esc(t(`rdMom_${m?.state || 'invalid'}`))
  let text = `clamp(50 + ${fmt(m.k, 0)} × log2(${fmtInt(R)} ÷ ${fmtInt(B)}), 0, 100) = ${fmt(m.value, 1)}`
  if (m.capped) text += ` (≥ 5.7×, ${fmt(m.ratio, 2)}×)`
  return `${numLink(text, link)}${m.capped ? `<div class="tiny muted">${esc(t('rdMomCapped', { ratio: fmt(m.ratio, 2) }))}</div>` : ''}`
}

function thresholds(signal, t) {
  if (isDosm(signal)) {
    const c = RADAR_CONFIG.dosm
    return t('rdThreshDosm', { materialPp: fmt(c.materialPp, 2), materialRelativePercent: fmt(c.materialRelativePercent, 1), low: fmt(c.volatility.low, 2), high: fmt(c.volatility.high, 2), strong: fmtInt(c.evidence.strong), moderate: fmtInt(c.evidence.moderate), quarters: fmtInt(c.newCategoryQuarters) })
  }
  const c = RADAR_CONFIG.openalex
  return t('rdThreshOpenAlex', { rising: fmt(c.rising, 2), declining: fmt(c.declining, 2), low: fmt(c.volatility.low, 1), high: fmt(c.volatility.high, 1), strong: fmtInt(c.evidence.strong), moderate: fmtInt(c.evidence.moderate), k: fmt(RADAR_CONFIG.momentum.k, 0), years: fmt(RADAR_CONFIG.momentum.windowYears, 0) })
}

const row = (label, html) => (html ? `<dt>${esc(label)}</dt><dd>${html}</dd>` : '')

// evidencePanel(signal, t, extra?) → HTML. extra: { title, officialTitle, description, subfield, counts: {group,total,share},
// rows: [[label, html]] } — values the screen has next to the signal (axis text, DOSM counts).
export function evidencePanel(signal, t, extra = {}) {
  if (!signal) return `<p class="muted">${esc(t('rdNoData'))}</p>`
  const link = signalLink(signal)
  const dosm = isDosm(signal)
  const e = signal.entity ?? {}
  const title = extra.title || e.name || signal.signalId || ''
  const entity = [e.system, e.code].filter(Boolean).join(' · ')
  const entityLink = safeUrl(e.sourceUrl) ? srcLink({ label: dosm ? 'DOSM' : 'OpenAlex', url: e.sourceUrl }) : ''
  const official = extra.officialTitle || (dosm ? '' : e.name)
  const kindTag = dosm ? tag('src', t('rdTagObserved')) : tag('est', t('rdTagResearch'))
  const quality = signal.evidenceSufficiency === 'sufficient' && signal.evidenceQuality ? ` ${tag('calc', t(`rdQual_${signal.evidenceQuality}`))}` : ''

  // While a possible break makes the comparison unreliable (D18), only the latest value is shown, never the change.
  const values = [signal.baseline, signal.recent]
    .filter((p) => p && p.period)
    .map((p) => (ice(signal) && p === signal.baseline ? `${esc(p.period)}: ${esc(t('rdNotCompared'))}` : `${esc(p.period)}: ${numLink(valueText(p.value, signal.unit), link)}`))
  if (signal.change && !ice(signal)) values.push(`${esc(t(dosm ? 'rdEvChange' : 'rdEvChangeWindow'))}: ${numLink(changeText(signal.change), link)}`)
  if (extra.counts) values.push(`${esc(t('rdLatestCount'))}: ${numLink(`${fmtInt(extra.counts.group)} / ${fmtInt(extra.counts.total)}`, link)}`)

  const steps = (signal.steps ?? []).length
    ? numLink(signal.steps.map((s) => fmtSigned(s, 2)).join(', ') + (dosm ? ' pp' : ' log2'), link)
    : ''
  const vol = signal.volatility
    ? numLink(`${fmt(signal.volatility.value, dosm ? 2 : 1)} ${dosm ? 'pp' : t('rdLogPoints')} · ${t(`rdVol_${signal.volatility.label}`)}`, link)
    : ''
  const reasons = (signal.reasons ?? []).map((r) => `<li>${esc(t(`rdReason_${r}`))}</li>`).join('')
  const breaks = (signal.breaks ?? []).length
    ? `<ul class="rd-list">${signal.breaks.map((b) => `<li>${esc(b.period)} · ${esc(t(`rdBreak_${b.status}`))} ${srcLink(link)}</li>`).join('')}</ul>`
    : esc(t('rdEvNone'))
  const revisions = signal.revisions?.count
    ? `<ul class="rd-list">${(signal.revisions.items ?? []).map((r) => `<li>${esc(r.period)}: ${numLink(`${valueText(r.old, signal.unit)} → ${valueText(r.new, signal.unit)}`, link)}</li>`).join('')}</ul>`
    : esc(t('rdEvNone'))
  const mapping = (signal.mappingPath ?? []).length
    ? `<ol class="rd-list">${signal.mappingPath.map((s) => `<li>${esc([s.system, s.code, s.version].filter(Boolean).join(' '))} · ${esc(s.status ?? '')} ${srcLink({ label: s.source || s.system, url: s.sourceUrl })}</li>`).join('')}</ol>`
    : ''
  const methods = [signal.methodVersion, signal.configVersion, signal.mappingVersion].filter(Boolean).join(' · ')
  const limits = [t(dosm ? 'rdLimitDosm' : 'rdLimitOpenAlex')]
  if (!dosm && e.code === 'T12549') limits.push(t('rdNarrowTopic'))
  const extraRows = (extra.rows ?? []).map(([label, html]) => row(label, html)).join('')

  return `<h2>${esc(title)}</h2>
  <p class="small">${kindTag} ${statusTag(signal, t)}${quality}</p>
  <dl class="rd-kv">
    ${row(t('rdEvSource'), `${esc(entity)} ${entityLink}`)}
    ${official ? row(t('rdOfficialTitle'), esc(official)) : ''}
    ${extra.subfield ? row(t('rdSubfield'), esc(extra.subfield)) : ''}
    ${extra.description ? row(t('rdDescription'), esc(extra.description)) : ''}
    ${row(t('rdObsPeriod'), esc([signal.baseline?.period, signal.recent?.period].filter(Boolean).join(' → ') || DASH))}
    ${signal.publishedAt || extra.publishedAt ? row(t('rdPublished'), esc(fmtDate(signal.publishedAt || extra.publishedAt))) : ''}
    ${row(t('rdEvFetched'), esc(fmtDate(signal.fetchedAt)))}
    ${row(t('rdManifestId'), `<code>${esc(signal.manifestId ?? DASH)}</code>`)}
    ${row(t('rdSnapshot'), `<code>${esc((signal.sourceSnapshotIds ?? []).join(', ') || DASH)}</code>`)}
    ${row(t('rdEvMetric'), `<code>${esc(signal.metric ?? DASH)}</code> · ${esc(signal.unit ?? DASH)}`)}
    ${row(t('rdEvValues'), values.join('<br>') || esc(DASH))}
    ${row(t('rdEvFormula'), formula(signal, t, extra))}
    ${row(t('rdEvRule'), `${esc(ruleText(signal.rule, t) || DASH)} ${srcLink(link)}${reasons ? `<ul class="rd-list">${reasons}</ul>` : ''}`)}
    ${steps ? row(t('rdEvSteps'), steps) : ''}
    ${vol ? row(t('rdVolatility'), vol) : ''}
    ${row(t('rdEvThresholds'), esc(thresholds(signal, t)))}
    ${row(t('rdEvBreaks'), breaks)}
    ${row(t('rdEvRevisions'), revisions)}
    ${mapping ? row(t('rdEvMapping'), mapping) : ''}
    ${row(t('rdEvMethod'), esc(methods || DASH))}
    ${extraRows}
    ${row(t('rdEvLimits'), limits.map((l) => esc(l)).join('<br>'))}
  </dl>
  <h3>${esc(t('rdEvLinks'))}</h3>
  <ul class="rd-list">${links(signal).map((l) => `<li>${srcLink(l)}</li>`).join('')}</ul>`
}
