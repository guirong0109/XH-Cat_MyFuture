// Reject malformed Radar snapshots. Legitimate revisions and vanished periods are not errors here:
// they are reported by diffSnapshots. An empty cell (value null) in a published period is valid.

const SOURCES = ['openalex', 'dosm', 'onet-skills', 'onet-hottech']
const ENTITY_TYPES = ['ai_topic', 'reference', 'occupation_group', 'total', 'unclassified', 'skill_flag', 'release', 'skill_postings']
const UNITS = ['papers', 'offerings', 'flag', 'release', 'postings']
const YEAR = /^\d{4}$/
const QUARTER = /^(\d{4}) Q([1-4])$/
const RELEASE = /^\d{2}\.\d$/
const isOnet = (sourceId) => sourceId === 'onet-skills' || sourceId === 'onet-hottech'

// Position of a period on a running scale, or null when it does not fit the source.
function ordinal(sourceId, period) {
  if (typeof period !== 'string') return null
  if (sourceId === 'openalex') return YEAR.test(period) ? Number(period) : null
  const m = QUARTER.exec(period)
  return m ? Number(m[1]) * 4 + Number(m[2]) - 1 : null
}

export function validateSnapshot(snapshot, { expectedEntities = [], lastYear } = {}) {
  const errors = []
  const add = (code, path) => errors.push({ code, path })

  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.observations) || !SOURCES.includes(snapshot.sourceId)) {
    add('bad_structure', '')
    return { ok: false, errors }
  }
  const { sourceId } = snapshot
  const seen = new Set()
  const lastOrdinal = new Map() // entity -> last ordinal seen, in file order
  const byPeriod = new Map() // dosm: period -> {total, groups[]}
  const entities = new Set()

  snapshot.observations.forEach((o, i) => {
    const at = `observations[${i}]`
    if (
      !o || typeof o !== 'object' || !ENTITY_TYPES.includes(o.entityType) || typeof o.entityId !== 'string' ||
      !o.entityId || typeof o.period !== 'string' || typeof o.metric !== 'string' || typeof o.unit !== 'string'
    ) {
      add('bad_structure', at)
      return
    }
    entities.add(o.entityId)
    if (!UNITS.includes(o.unit)) add('unknown_unit', `${at}.unit`)
    if (isOnet(sourceId)) {
      // O*NET sources: a release (or, for Hot Technologies, a counting year) is the period; no contiguity check; integer counts or flags.
      if (!(RELEASE.test(o.period) || (sourceId === 'onet-hottech' && YEAR.test(o.period)))) add('bad_period', `${at}.period`)
      if (typeof o.value !== 'number' || !Number.isInteger(o.value) || o.value < 0) add('bad_value', `${at}.value`)
      const onetKey = `${o.entityType}|${o.entityId}|${o.period}|${o.metric}`
      if (seen.has(onetKey)) add('duplicate_period', at)
      seen.add(onetKey)
      return
    }
    if (o.value !== null && (typeof o.value !== 'number' || !Number.isFinite(o.value) || o.value < 0)) {
      add('bad_value', `${at}.value`)
    }
    const ord = ordinal(sourceId, o.period)
    if (ord === null) {
      add('bad_period', `${at}.period`)
      return
    }
    const key = `${o.entityType}|${o.entityId}|${o.period}`
    if (seen.has(key)) add('duplicate_period', at)
    else {
      seen.add(key)
      const entity = `${o.entityType}|${o.entityId}`
      const prev = lastOrdinal.get(entity)
      // Strictly ascending, one step at a time: a gap means a period is missing. Gaps are rejected on purpose:
      // fetchers must emit explicit zeros for years the source omits (OpenAlex group_by), and DOSM quarters are contiguous.
      if (prev !== undefined && ord !== prev + 1) add('period_order', at)
      lastOrdinal.set(entity, ord)
    }
    if (sourceId === 'openalex' && lastYear !== undefined && Number(o.period) > lastYear) add('future_year', `${at}.period`)
    if (sourceId === 'dosm' && typeof o.value === 'number') {
      const slot = byPeriod.get(o.period) ?? { total: null, groups: 0 }
      if (o.entityType === 'total') slot.total = o.value
      else if (o.entityType === 'occupation_group') slot.groups += o.value
      byPeriod.set(o.period, slot)
    }
  })

  for (const wanted of expectedEntities) {
    const id = typeof wanted === 'string' ? wanted : wanted?.entityId
    if (!entities.has(id)) add('missing_entity', String(id))
  }
  for (const [period, { total, groups }] of byPeriod) {
    if (total !== null && total < groups) add('total_below_groups', period)
  }
  return { ok: errors.length === 0, errors }
}
