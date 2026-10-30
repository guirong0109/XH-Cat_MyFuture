// Future Skills Radar: the radar-signal/v1 output contract (spec §10). Pure, no I/O.
// buildSignal assembles one signal in a fixed key order; direction, volatility, evidence, rule and steps come only from
// the trend core, never from the momentum index. validateSignal rejects score-like fields at any depth, missing evidence links
// and unknown enum values.

export const CONTRACT = 'radar-signal/v1'
export const FORBIDDEN_KEYS = ['score', 'weight', 'rank', 'match', 'opportunityScore', 'fitScore']
// Any key containing one of these words is rejected too (e.g. matchScore, opportunityIndex, ranking).
export const FORBIDDEN_KEY_PATTERN = /score|weight|rank|match|opportunit/i

export const ENUMS = Object.freeze({
  evidenceKind: ['research_indicator', 'occupation_group', 'occupation_direct'],
  entityType: ['ai_topic', 'occupation_group', 'occupation'],
  granularityLevel: ['topic', 'group', 'occupation'],
  changeUnit: ['percent', 'pp', 'log2'],
  direction: ['rising', 'declining', 'stable', 'emerging', 'mixed', null],
  evidenceSufficiency: ['sufficient', 'insufficient_evidence', 'insufficient_comparable_evidence'],
  evidenceQuality: ['strong', 'moderate', 'limited', null],
  breakStatus: ['unreviewed', 'confirmed', 'dismissed_counts', 'dismissed_shares'],
  momentumMethod: ['log2-v1'],
})

// Optional keys are left out when absent, so the key order of a signal never depends on which ones exist.
export function buildSignal(core, ctx) {
  const signal = {
    contract: CONTRACT,
    signalId: ctx.signalId,
    manifestId: ctx.manifestId,
    evidenceKind: ctx.evidenceKind,
    entity: ctx.entity,
    granularity: ctx.granularity,
    metric: ctx.metric,
    unit: ctx.unit,
    baseline: ctx.baseline,
    recent: ctx.recent,
    change: ctx.change,
  }
  if (ctx.momentum) signal.momentum = ctx.momentum
  if (ctx.shareMomentum) signal.shareMomentum = ctx.shareMomentum
  Object.assign(signal, {
    direction: core.direction ?? null,
    volatility: core.volatility ? { value: core.volatility.value, unit: core.volatility.unit, label: core.volatility.label } : null,
    evidenceSufficiency: core.evidenceSufficiency,
    evidenceQuality: core.evidenceQuality ?? null,
    reasons: [...(core.reasons ?? [])],
  })
  if (core.rule) signal.rule = { key: core.rule.key, vars: core.rule.vars ?? {} }
  if (core.steps) signal.steps = [...core.steps]
  Object.assign(signal, {
    breaks: ctx.breaks ?? [],
    revisions: ctx.revisions ?? { count: 0, items: [] },
    classification: ctx.classification,
  })
  if (ctx.mappingPath) signal.mappingPath = ctx.mappingPath
  Object.assign(signal, {
    sourceSnapshotIds: ctx.sourceSnapshotIds,
    evidenceLinks: ctx.evidenceLinks,
    publishedAt: ctx.publishedAt ?? null,
    fetchedAt: ctx.fetchedAt ?? null,
    methodVersion: ctx.methodVersion,
    configVersion: ctx.configVersion,
    mappingVersion: ctx.mappingVersion,
  })
  return signal
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const isStr = (x) => typeof x === 'string' && x.length > 0
const isNumOrNull = (x) => x === null || (typeof x === 'number' && Number.isFinite(x))

function forbiddenPaths(x, at, out) {
  if (Array.isArray(x)) x.forEach((v, i) => forbiddenPaths(v, `${at}[${i}]`, out))
  else if (isObj(x)) {
    for (const [k, v] of Object.entries(x)) {
      const here = at ? `${at}.${k}` : k
      if (FORBIDDEN_KEYS.includes(k) || FORBIDDEN_KEY_PATTERN.test(k)) out.push(here)
      forbiddenPaths(v, here, out)
    }
  }
  return out
}

export function validateSignal(signal) {
  const errors = []
  const add = (code, path) => errors.push({ code, path })
  if (!isObj(signal)) {
    add('bad_structure', '')
    return { ok: false, errors }
  }
  for (const path of forbiddenPaths(signal, '', [])) add('forbidden_field', path)
  const oneOf = (list, value, path) => {
    if (!list.includes(value)) add('unknown_enum', path)
  }

  if (signal.contract !== CONTRACT) add('unknown_enum', 'contract')
  for (const key of ['signalId', 'manifestId', 'metric', 'unit', 'methodVersion', 'configVersion', 'mappingVersion']) {
    if (!isStr(signal[key])) add('missing_field', key)
  }
  oneOf(ENUMS.evidenceKind, signal.evidenceKind, 'evidenceKind')

  if (!isObj(signal.entity)) add('missing_field', 'entity')
  else {
    oneOf(ENUMS.entityType, signal.entity.type, 'entity.type')
    for (const key of ['system', 'code', 'name']) if (!isStr(signal.entity[key])) add('missing_field', `entity.${key}`)
  }
  if (!isObj(signal.granularity)) add('missing_field', 'granularity')
  else {
    oneOf(ENUMS.granularityLevel, signal.granularity.level, 'granularity.level')
    if (signal.granularity.level === 'group' && (!isStr(signal.granularity.groupSystem) || !isStr(signal.granularity.groupCode))) {
      add('missing_field', 'granularity.groupCode')
    }
  }
  for (const key of ['baseline', 'recent']) {
    const p = signal[key]
    if (!isObj(p) || typeof p.period !== 'string' || !isNumOrNull(p.value)) add('missing_field', key)
  }
  if (!isObj(signal.change) || !isNumOrNull(signal.change.value)) add('missing_field', 'change')
  else oneOf(ENUMS.changeUnit, signal.change.unit, 'change.unit')
  if (signal.momentum !== undefined) {
    if (!isObj(signal.momentum)) add('missing_field', 'momentum')
    else oneOf(ENUMS.momentumMethod, signal.momentum.method, 'momentum.method')
  }

  oneOf(ENUMS.direction, signal.direction, 'direction')
  if (signal.volatility !== null && (!isObj(signal.volatility) || !isNumOrNull(signal.volatility.value))) add('missing_field', 'volatility')
  oneOf(ENUMS.evidenceSufficiency, signal.evidenceSufficiency, 'evidenceSufficiency')
  oneOf(ENUMS.evidenceQuality, signal.evidenceQuality, 'evidenceQuality')
  if (signal.evidenceSufficiency !== 'sufficient' && signal.evidenceQuality !== null) add('unknown_enum', 'evidenceQuality')
  if (!Array.isArray(signal.reasons)) add('missing_field', 'reasons')
  if (signal.rule !== undefined && (!isObj(signal.rule) || !isStr(signal.rule.key))) add('missing_field', 'rule')
  if (signal.steps !== undefined && (!Array.isArray(signal.steps) || !signal.steps.every(isNumOrNull))) add('missing_field', 'steps')

  if (!Array.isArray(signal.breaks)) add('missing_field', 'breaks')
  else signal.breaks.forEach((b, i) => {
    if (!isObj(b) || typeof b.period !== 'string') add('missing_field', `breaks[${i}]`)
    else oneOf(ENUMS.breakStatus, b.status, `breaks[${i}].status`)
  })
  if (!isObj(signal.revisions) || !Array.isArray(signal.revisions.items) || signal.revisions.count !== signal.revisions.items.length) {
    add('missing_field', 'revisions')
  }
  if (!isObj(signal.classification) || !isStr(signal.classification.system)) add('missing_field', 'classification')
  if (signal.mappingPath !== undefined && !Array.isArray(signal.mappingPath)) add('missing_field', 'mappingPath')
  if (!Array.isArray(signal.sourceSnapshotIds) || !signal.sourceSnapshotIds.length || !signal.sourceSnapshotIds.every(isStr)) {
    add('missing_field', 'sourceSnapshotIds')
  }
  if (!Array.isArray(signal.evidenceLinks) || !signal.evidenceLinks.length) add('missing_evidence_links', 'evidenceLinks')
  else signal.evidenceLinks.forEach((l, i) => {
    if (!isObj(l) || !isStr(l.label) || !isStr(l.url) || !/^https?:\/\//.test(l.url)) add('missing_evidence_links', `evidenceLinks[${i}]`)
  })
  for (const key of ['publishedAt', 'fetchedAt']) if (signal[key] !== null && typeof signal[key] !== 'string') add('missing_field', key)

  return { ok: errors.length === 0, errors }
}
