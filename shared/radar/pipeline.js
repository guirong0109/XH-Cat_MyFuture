// Future Skills Radar: one deterministic run from snapshots to radar-signal/v1 signals (spec §5, §6.5). Pure, no I/O,
// no clock, no hashing. Production refreshes and judge edits call the same function.
//
// runPipeline({snapshots: {openalex, dosm}, references, reviews, config, manifestId})
//   snapshots.<source>.meta.revisions (optional): [{entityId, period, old, new}] from diffSnapshots against the
//   previous active snapshot; they are listed on the signal and lower OpenAlex evidence quality (§5.5).
//   reviews: break review records {reviewId, sourceId?, decision, appliesTo: {period, observationHash}}. The hash is
//   compared as the plain text detectBreaks gives; a review for other observations does not apply.
// → {signals (sorted by signalId), breaks, context: {dosm}, momentum: {[axisId]: {counts, share}}}

import { RADAR_CONFIG } from './config.js'
import { buildSignal } from './contract.js'
import { classifyOpenAlex } from './trend.js'
import { topicMomentum, shareSeries } from './momentum.js'
import { classifyDosmGroup, dosmContext } from './dosm.js'
import { detectBreaks, applyBreakReviews } from './breaks.js'
import { dosmTableFromSnapshot, openalexCounts } from './snapshot.js'

export const OPENALEX_METRIC = 'works_primary_topic'
export const OPENALEX_UNIT = 'papers'
export const OPENALEX_REFERENCE_ID = 'field:17'
export const OPENALEX_REFERENCE_POPULATION = 'OpenAlex works with primary_topic.field.id 17 (Computer Science)'
export const DOSM_SHARE_METRIC = 'share_of_online_job_offerings'
export const GROUP_SYSTEM = 'MASCO 2020 major group'

const QUARTERS_IN_STEPS = 6 // the oldest comparison a DOSM signal uses is Q-2 vs Q-6; volatility goes to Q-3 vs Q-7

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0

function revisionsFor(snapshot, entityId) {
  const items = (snapshot?.meta?.revisions ?? [])
    .filter((r) => r?.entityId === entityId)
    .map((r) => ({ period: r.period, old: r.old ?? null, new: r.new ?? null }))
    .sort((a, b) => cmp(a.period, b.period))
  return { count: items.length, items }
}

function classificationOf(snapshot, fallbackSystem) {
  const c = snapshot?.classification ?? {}
  const out = { system: c.system ?? fallbackSystem, version: c.version ?? null, readAt: c.readAt ?? null }
  if (c.countingRule) out.countingRule = c.countingRule
  return out
}

function uniqueLinks(links) {
  const seen = new Set()
  return links.filter((l) => l && l.url && !seen.has(l.url) && seen.add(l.url))
}

function lastYearOf(snapshot) {
  const years = (snapshot?.observations ?? []).filter((o) => o.entityType === 'ai_topic').map((o) => Number(o.period)).filter(Number.isFinite)
  return years.length ? Math.max(...years) : null
}

function referenceCounts(snapshot) {
  const out = {}
  for (const o of snapshot?.observations ?? []) {
    if (o.entityType === 'reference' && o.entityId === OPENALEX_REFERENCE_ID && typeof o.value === 'number') out[o.period] = o.value
  }
  return out
}

function openalexSignals(snapshot, references, config, manifestId, momentumOut) {
  const Y = lastYearOf(snapshot)
  if (Y === null) return []
  const cs = referenceCounts(snapshot)
  const mappingVersion = references?.versions?.fieldTopics ?? null
  return (references?.topics ?? []).map((topic) => {
    const id = topic.openalexId
    const counts = openalexCounts(snapshot, id)
    const revisions = revisionsFor(snapshot, id)
    const core = classifyOpenAlex(counts, Y, { revisions: revisions.items }, config.openalex)
    const countsMomentum = topicMomentum(counts, Y, config.momentum)
    const shareMomentum = topicMomentum(shareSeries(counts, cs), Y, config.momentum)
    momentumOut[topic.axisId] = { counts: countsMomentum, share: shareMomentum }

    const baselineYear = Y - config.momentum.windowYears
    const B = counts[String(baselineYear)]
    const R = counts[String(Y)]
    const divisible = isCount(B) && isCount(R) && B > 0 && R > 0
    const m = countsMomentum.current
    return buildSignal(core, {
      signalId: `openalex:${id}`,
      manifestId,
      evidenceKind: 'research_indicator',
      entity: { type: 'ai_topic', system: 'OpenAlex topics', code: id, name: topic.officialTitle, sourceUrl: topic.sourceUrl },
      granularity: { level: 'topic' },
      metric: OPENALEX_METRIC,
      unit: OPENALEX_UNIT,
      baseline: { period: String(baselineYear), value: isCount(B) ? B : null },
      recent: { period: String(Y), value: isCount(R) ? R : null },
      change: { value: divisible ? Math.log2(R / B) : null, unit: 'log2', relativePercent: divisible ? (R / B - 1) * 100 : null },
      momentum: { method: config.momentum.method, k: config.momentum.k, windowYears: config.momentum.windowYears, value: m.value, ratio: m.ratio, capped: m.capped, state: m.state },
      shareMomentum: { referencePopulation: OPENALEX_REFERENCE_POPULATION, value: shareMomentum.current.value, ratio: shareMomentum.current.ratio },
      breaks: [],
      revisions,
      classification: classificationOf(snapshot, 'OpenAlex topics'),
      sourceSnapshotIds: [snapshot.snapshotId],
      evidenceLinks: uniqueLinks([
        { label: `OpenAlex topic page: ${topic.officialTitle}`, url: topic.sourceUrl },
        ...(snapshot.sourceUrls ?? []).filter((l) => typeof l?.url === 'string' && l.url.includes(id)),
      ]),
      publishedAt: snapshot.publishedAt ?? null,
      fetchedAt: snapshot.fetchedAt ?? null,
      methodVersion: config.openalex.method,
      configVersion: config.version,
      mappingVersion,
    })
  })
}

function dosmSignals(snapshot, table, breaks, references, config, manifestId) {
  const L = table.periods.length - 1
  const mappingVersion = references?.versions?.bridge ?? null
  const nearby = (b) => table.periods.indexOf(b.period) >= L - QUARTERS_IN_STEPS
  const signalBreaks = breaks.filter(nearby).map((b) => (b.reviewId ? { period: b.period, status: b.status, reviewId: b.reviewId } : { period: b.period, status: b.status }))
  const links = uniqueLinks(snapshot.sourceUrls ?? [])
  return Object.keys(table.groups).sort().map((code) => {
    const core = classifyDosmGroup(table, code, breaks, config.dosm)
    const entityId = `masco2020:${code}`
    return buildSignal(core, {
      signalId: `dosm:${entityId}`,
      manifestId,
      evidenceKind: 'occupation_group',
      entity: { type: 'occupation_group', system: GROUP_SYSTEM, code, name: table.groups[code].name, sourceUrl: links[0]?.url ?? null },
      granularity: { level: 'group', groupSystem: GROUP_SYSTEM, groupCode: code },
      metric: DOSM_SHARE_METRIC,
      unit: 'percent',
      baseline: { period: core.share.periods.baseline ?? '', value: core.share.baseline },
      recent: { period: core.share.periods.recent ?? '', value: core.share.recent },
      change: { value: core.pp, unit: 'pp', relativePercent: core.relativePercent },
      breaks: signalBreaks,
      revisions: revisionsFor(snapshot, entityId),
      classification: classificationOf(snapshot, GROUP_SYSTEM),
      sourceSnapshotIds: [snapshot.snapshotId],
      evidenceLinks: links,
      publishedAt: snapshot.publishedAt ?? null,
      fetchedAt: snapshot.fetchedAt ?? null,
      methodVersion: config.dosm.method,
      configVersion: config.version,
      mappingVersion,
    })
  })
}

export function runPipeline({ snapshots = {}, references = {}, reviews = [], config = RADAR_CONFIG, manifestId } = {}) {
  const momentum = {}
  const signals = []
  let breaks = []
  let context = { dosm: null }

  if (snapshots.openalex) signals.push(...openalexSignals(snapshots.openalex, references, config, manifestId, momentum))
  if (snapshots.dosm) {
    const table = dosmTableFromSnapshot(snapshots.dosm)
    const dosmReviews = (reviews ?? []).filter((r) => (r?.sourceId ?? r?.appliesTo?.sourceId ?? 'dosm') === 'dosm')
    breaks = applyBreakReviews(detectBreaks(table, config.breaks), dosmReviews)
    context = { dosm: dosmContext(table) }
    signals.push(...dosmSignals(snapshots.dosm, table, breaks, references, config, manifestId))
  }

  signals.sort((a, b) => cmp(a.signalId, b.signalId))
  const orderedMomentum = Object.fromEntries(Object.keys(momentum).sort().map((k) => [k, momentum[k]]))
  return { signals, breaks, context, momentum: orderedMomentum }
}
