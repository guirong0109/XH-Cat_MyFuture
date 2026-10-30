// Judge Trend Change Test (spec §7, §8.3, §9). A judge session works on its own synthetic snapshots, built from
// data/radar/demo/base.json, and runs the same runPipeline, diffSnapshots and dependencyReport as production. It never
// reads or writes prod/: every key goes through scopedStore(store, 'demo/<sessionId>/') (sweeps list through
// scopedStore(store, 'demo/')). No production manifest, reference decision or other session is ever read.
//
// createDemoService({store, base, references, now, config, devStore}) →
//   {start(sessionId), apply(sessionId, {scenario: 'A'|'B', edits?: [{entityId, period, value}], factor?}),
//    diff(sessionId) → report, reset(sessionId) → report}
//   base, references: an object or a loader (called once; a failed load is retried next time).
//
// Stored per session: demo/<id>/session.json {sessionId, createdAt, expiresAt} (written once at start) and
// demo/<id>/state.json {seq, previous, current}; previous/current = {manifestId, createdAt, scenario, change, snapshots}.
// Every call reads session.json first: missing or past expiresAt → DemoError demo_expired, and the session's data is
// deleted on that call. This works after a restart or sleep because the stored expiresAt decides, not memory.
// start sweeps every expired session, then refuses with demo_full when config.demo.maxSessions are active.
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { runPipeline } from '../../shared/radar/pipeline.js'
import { dependencyReport } from '../../shared/radar/dependencies.js'
import { diffSnapshots } from '../../shared/radar/diff.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { dosmSnapshotObservations, dosmTableFromSnapshot, openalexCounts } from '../../shared/radar/snapshot.js'
import { OPENALEX_METRIC, OPENALEX_REFERENCE_ID, OPENALEX_UNIT } from '../../shared/radar/pipeline.js'
import { t } from '../../shared/i18n.js'
import { scopedStore } from './store/scoped.js'

const SESSION_ID = /^[0-9a-f]{32}$/
const SOURCES = ['dosm', 'openalex']
const BASE_MANIFEST = 'demo-manifest-0'
const JSON_TYPE = 'application/json'
const BREAK_LABEL = 'Possible structural break'

export class DemoError extends Error {
  constructor(code, errors = null) {
    super(code)
    this.name = 'DemoError'
    this.code = code
    if (errors) this.errors = errors
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value))
const bytes = (value) => Buffer.from(JSON.stringify(value))
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// A loader called once; a failed load is retried on the next call.
function once(value) {
  if (typeof value !== 'function') return () => Promise.resolve(value)
  let promise = null
  return () => {
    promise ??= Promise.resolve()
      .then(() => value())
      .catch((error) => {
        promise = null
        throw error
      })
    return promise
  }
}

// ---- synthetic snapshots ----------------------------------------------------------------------------------------

function baseSnapshots(base) {
  if (!base || base.synthetic !== true || !base.dosm || !base.openalex?.topic) throw new DemoError('not_configured')
  const d = base.dosm
  const dosm = {
    sourceId: 'dosm',
    snapshotId: 'demo-dosm-0',
    synthetic: true,
    fetchedAt: null,
    lastQuarter: d.periods.at(-1),
    classification: { system: d.classification?.system ?? 'masco2020', version: d.classification?.version ?? null, readAt: null },
    sourceUrls: d.sourceUrls ?? [],
    meta: { revisions: [] },
    observations: dosmSnapshotObservations({ periods: d.periods, total: d.total, unclassified: d.unclassified, groups: d.groups }),
  }
  const o = base.openalex
  const years = Object.keys(o.series).sort()
  const label = o.topic.officialTitle
  const openalex = {
    sourceId: 'openalex',
    snapshotId: 'demo-openalex-0',
    synthetic: true,
    fetchedAt: null,
    lastYear: o.lastYear,
    classification: { system: 'openalex_topics', version: 'synthetic', readAt: null, countingRule: 'primary_topic' },
    sourceUrls: o.sourceUrls ?? [],
    meta: { revisions: [] },
    observations: [
      ...years.map((year) => ({ entityType: 'ai_topic', entityId: o.topic.openalexId, period: year, metric: OPENALEX_METRIC, unit: OPENALEX_UNIT, value: o.series[year], label })),
      ...Object.keys(o.reference).sort().map((year) => ({ entityType: 'reference', entityId: OPENALEX_REFERENCE_ID, period: year, metric: OPENALEX_METRIC, unit: OPENALEX_UNIT, value: o.reference[year] })),
    ],
  }
  return { dosm, openalex }
}

// The bundled (version-controlled) reference data with the one synthetic topic in place of the real six.
const demoReferences = (references, base) => ({ ...references, topics: [{ ...base.openalex.topic }] })

// ---- scenarios --------------------------------------------------------------------------------------------------

// Each edit must name an observation of the current snapshots; the value must be a count (finite, ≥ 0).
function applyEdits(snapshots, edits) {
  const next = clone(snapshots)
  const errors = []
  edits.forEach((edit, i) => {
    const at = `edits[${i}]`
    if (!plainObject(edit) || typeof edit.entityId !== 'string' || typeof edit.period !== 'string') return errors.push({ code: 'bad_structure', path: at })
    const entity = SOURCES.flatMap((sourceId) => next[sourceId].observations.filter((o) => o.entityId === edit.entityId))
    if (!entity.length) return errors.push({ code: 'unknown_entity', path: `${at}.entityId` })
    const target = entity.find((o) => o.period === edit.period)
    if (!target) return errors.push({ code: 'unknown_period', path: `${at}.period` })
    if (typeof edit.value !== 'number' || !Number.isFinite(edit.value) || edit.value < 0) return errors.push({ code: 'bad_value', path: `${at}.value` })
    target.value = edit.value
    return null
  })
  return { next, errors }
}

// Scenario B: the total and the scenario's groups in its quarter, multiplied by the factor (rounded to whole offerings).
function applyJump(snapshots, scenario, factor) {
  const next = clone(snapshots)
  const ids = new Set(['masco2020:total', ...scenario.groups.map((code) => `masco2020:${code}`)])
  for (const o of next.dosm.observations) {
    if (o.period === scenario.period && ids.has(o.entityId) && typeof o.value === 'number') o.value = Math.round(o.value * factor)
  }
  const bad = next.dosm.observations.some((o) => o.value !== null && !Number.isFinite(o.value))
  return { next, errors: bad ? [{ code: 'bad_value', path: 'factor' }] : [] }
}

// ---- report -----------------------------------------------------------------------------------------------------

function run(state, references, config) {
  return runPipeline({ snapshots: state.snapshots, references, reviews: [], config, manifestId: state.manifestId })
}

const breakKey = (b) => `${b.period}|${b.observationHash}`
const ruleText = (rule) => (rule ? t('en', rule.key, Object.fromEntries(Object.entries(rule.vars ?? {}).map(([k, v]) => [k, typeof v === 'number' ? round(v) : Array.isArray(v) ? v.join(', ') : v]))) : null)
const round = (v) => Number(v.toFixed(2))

function details(signal) {
  if (!signal) return null
  return {
    direction: signal.direction,
    evidenceSufficiency: signal.evidenceSufficiency,
    evidenceQuality: signal.evidenceQuality,
    baseline: signal.baseline,
    recent: signal.recent,
    change: signal.change,
    steps: signal.steps ?? null,
    volatility: signal.volatility,
    reasons: signal.reasons,
    rule: signal.rule ?? null,
    ruleText: ruleText(signal.rule),
    breaks: signal.breaks,
    revisions: signal.revisions,
    momentum: signal.momentum ?? null,
    methodVersion: signal.methodVersion,
    configVersion: signal.configVersion,
  }
}

function observationChanges(before, after) {
  const out = []
  for (const sourceId of SOURCES) {
    const d = diffSnapshots(before.snapshots[sourceId], after.snapshots[sourceId])
    for (const r of d.revisions) out.push({ sourceId, entityId: r.entityId, period: r.period, old: r.old, new: r.new })
  }
  return out
}

function current(state, base) {
  const table = dosmTableFromSnapshot(state.snapshots.dosm)
  const topic = base.openalex.topic
  const reference = {}
  for (const o of state.snapshots.openalex.observations) if (o.entityType === 'reference' && typeof o.value === 'number') reference[o.period] = o.value
  return {
    dosm: table,
    openalex: { topic: { ...topic }, lastYear: state.snapshots.openalex.lastYear, series: openalexCounts(state.snapshots.openalex, topic.openalexId), reference },
  }
}

function buildReport({ session, stored, base, references, config, devStore }) {
  const after = stored.current
  const before = stored.previous ?? stored.current
  const outBefore = run(before, references, config)
  const outAfter = run(after, references, config)
  const dep = dependencyReport(outBefore, outAfter, references)
  const sigBefore = new Map(outBefore.signals.map((s) => [s.signalId, s]))
  const sigAfter = new Map(outAfter.signals.map((s) => [s.signalId, s]))

  const changedSignals = dep.changedSignals.map((c) => ({ ...c, details: { before: details(sigBefore.get(c.signalId)), after: details(sigAfter.get(c.signalId)) } }))
  const known = new Set(outBefore.breaks.map(breakKey))
  const label = (b) => ({ ...b, label: BREAK_LABEL })
  const insufficientComparisons = outAfter.signals
    .filter((s) => s.evidenceSufficiency === 'insufficient_comparable_evidence' && sigBefore.get(s.signalId)?.evidenceSufficiency !== 'insufficient_comparable_evidence')
    .map((s) => ({
      signalId: s.signalId,
      entity: { system: s.entity.system, code: s.entity.code, name: s.entity.name },
      before: details(sigBefore.get(s.signalId)),
      after: details(s),
      breakPeriods: s.rule?.vars?.breakPeriods ?? s.breaks.map((b) => b.period),
    }))
    .sort((x, y) => cmp(x.signalId, y.signalId))

  // Momentum indices of the axes whose OpenAlex series changed.
  const momentum = {}
  for (const c of dep.changedSignals) {
    const signal = sigAfter.get(c.signalId) ?? sigBefore.get(c.signalId)
    if (signal?.evidenceKind !== 'research_indicator') continue
    const topic = (references.topics ?? []).find((tp) => tp.openalexId === signal.entity.code)
    if (topic) momentum[topic.axisId] = { before: outBefore.momentum[topic.axisId] ?? null, after: outAfter.momentum[topic.axisId] ?? null }
  }

  return {
    synthetic: true,
    label: base.label,
    devStore: Boolean(devStore),
    expiresAt: session.expiresAt,
    scenario: stored.previous ? after.scenario : null,
    change: stored.previous ? after.change : null,
    manifests: { before: before.manifestId, after: after.manifestId },
    snapshots: {
      before: Object.fromEntries(SOURCES.map((s) => [s, before.snapshots[s].snapshotId])),
      after: Object.fromEntries(SOURCES.map((s) => [s, after.snapshots[s].snapshotId])),
    },
    observations: stored.previous ? observationChanges(before, after) : [],
    changedSignals,
    breaks: {
      before: outBefore.breaks.map(label),
      after: outAfter.breaks.map(label),
      added: outAfter.breaks.filter((b) => !known.has(breakKey(b))).map(label),
    },
    insufficientComparisons,
    momentum,
    affected: dep.affected,
    signals: outAfter.signals.map((s) => ({ signalId: s.signalId, entity: s.entity, ...details(s) })),
    context: outAfter.context,
    careerRankings: { key: 'rdNoRankings', text: t('en', 'rdNoRankings') },
    scenarios: clone(base.scenarios ?? {}),
    current: current(after, base),
  }
}

// ---- service ----------------------------------------------------------------------------------------------------

export function createDemoService({ store, base, references, now = () => new Date(), config = RADAR_CONFIG, devStore = false } = {}) {
  if (!store) throw new TypeError('demo needs a writable store')
  const loadBase = once(base)
  const loadReferences = once(references)
  const all = scopedStore(store, 'demo/')

  const scope = (sessionId) => {
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw new DemoError('demo_expired')
    const prefix = `demo/${sessionId}/`
    const s = scopedStore(store, prefix)
    return { s, prefix, sessionKey: `${prefix}session.json`, stateKey: `${prefix}state.json` }
  }

  async function readJson(s, key) {
    const got = await s.get(key)
    if (!got) return null
    try {
      return JSON.parse(Buffer.from(got.bytes).toString('utf8'))
    } catch {
      return null
    }
  }

  async function wipe(sessionId) {
    const { s, prefix } = scope(sessionId)
    for (const key of await s.list(prefix)) await s.delete(key)
  }

  const expired = (session) => !session || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now().getTime()

  // The stored session, or demo_expired (and its data deleted) when it is gone or past its stored expiresAt.
  async function live(sessionId) {
    const { s, sessionKey, stateKey } = scope(sessionId)
    const session = await readJson(s, sessionKey)
    if (expired(session)) {
      await wipe(sessionId)
      throw new DemoError('demo_expired')
    }
    const stored = await readJson(s, stateKey)
    if (!stored?.current) {
      await wipe(sessionId)
      throw new DemoError('demo_expired')
    }
    return { session, stored }
  }

  async function inputs() {
    const [b, refs] = await Promise.all([loadBase(), loadReferences()])
    if (!b || b.synthetic !== true) throw new DemoError('not_configured')
    return { base: b, references: demoReferences(refs ?? {}, b) }
  }

  const initial = (b) => ({ seq: 0, previous: null, current: { manifestId: BASE_MANIFEST, createdAt: null, scenario: null, change: null, snapshots: baseSnapshots(b) } })

  async function save(sessionId, stored) {
    const { s, stateKey } = scope(sessionId)
    await s.put(stateKey, bytes(stored), { contentType: JSON_TYPE })
  }

  // Every session folder under demo/: expired (or without a readable session record) ones are deleted.
  async function sweep() {
    const ids = [...new Set((await all.list('demo/')).map((key) => key.split('/')[1]))]
    const active = []
    for (const id of ids) {
      if (!SESSION_ID.test(id)) continue
      const session = await readJson(scope(id).s, scope(id).sessionKey)
      if (expired(session)) await wipe(id)
      else active.push(id)
    }
    return active
  }

  async function start(sessionId) {
    const { s, sessionKey } = scope(sessionId)
    const { base: b } = await inputs()
    const active = await sweep()
    if (active.includes(sessionId)) return { sessionId, expiresAt: (await readJson(s, sessionKey)).expiresAt }
    if (active.length >= config.demo.maxSessions) throw new DemoError('demo_full')
    const created = now()
    const session = { sessionId, synthetic: true, createdAt: created.toISOString(), expiresAt: new Date(created.getTime() + config.demo.ttlMs).toISOString() }
    await s.put(sessionKey, bytes(session), { contentType: JSON_TYPE, ifNoneMatch: '*' })
    await save(sessionId, initial(b))
    return { sessionId, expiresAt: session.expiresAt }
  }

  async function apply(sessionId, request = {}) {
    const { session, stored } = await live(sessionId)
    const { base: b, references: refs } = await inputs()
    const body = plainObject(request) ? request : {}
    const scenario = body.scenario
    if (scenario !== 'A' && scenario !== 'B') throw new DemoError('bad_request')
    const defs = b.scenarios ?? {}
    let result
    let change
    if (scenario === 'A') {
      const edits = body.edits === undefined ? defs.A?.defaultEdits ?? [] : body.edits
      if (!Array.isArray(edits) || edits.length === 0) throw new DemoError('bad_request')
      result = applyEdits(stored.current.snapshots, edits)
      change = { edits: clone(edits) }
    } else {
      const factor = body.factor === undefined ? defs.B?.defaultFactor : body.factor
      if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) throw new DemoError('bad_request')
      result = applyJump(stored.current.snapshots, defs.B, factor)
      change = { factor, period: defs.B.period, groups: [...defs.B.groups] }
    }
    // Validation first, as in production: a refused change keeps the last state.
    const errors = [...result.errors]
    if (!errors.length) {
      for (const sourceId of SOURCES) {
        const check = validateSnapshot(result.next[sourceId])
        errors.push(...check.errors.map((e) => ({ ...e, sourceId })))
      }
    }
    if (errors.length) throw new DemoError('validation_failed', errors)

    const seq = stored.seq + 1
    const snapshots = {}
    for (const sourceId of SOURCES) {
      const previous = stored.current.snapshots[sourceId]
      const next = result.next[sourceId]
      const d = diffSnapshots(previous, next)
      next.snapshotId = d.sameContent ? previous.snapshotId : `demo-${sourceId}-${seq}`
      next.meta = { ...(next.meta ?? {}), revisions: d.sameContent ? previous.meta?.revisions ?? [] : d.revisions }
      snapshots[sourceId] = next
    }
    const next = { seq, previous: stored.current, current: { manifestId: `demo-manifest-${seq}`, createdAt: now().toISOString(), scenario, change, snapshots } }
    await save(sessionId, next)
    return buildReport({ session, stored: next, base: b, references: refs, config, devStore })
  }

  async function diff(sessionId) {
    const { session, stored } = await live(sessionId)
    const { base: b, references: refs } = await inputs()
    return buildReport({ session, stored, base: b, references: refs, config, devStore })
  }

  async function reset(sessionId) {
    const { session } = await live(sessionId)
    const { base: b, references: refs } = await inputs()
    const stored = initial(b)
    await save(sessionId, stored)
    return buildReport({ session, stored, base: b, references: refs, config, devStore })
  }

  return { start, apply, diff, reset }
}
