// Future Skills Radar: snapshot and observation shape, and pure helpers over it. No I/O, no hashing
// (the server hashes canonicalContent).

export const DOSM_METRIC = 'online_job_offerings'
export const DOSM_UNIT = 'offerings'
const DOSM_PREFIX = 'masco2020:'
const GROUP_CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function observationKey(o) {
  return `${o.entityType}\u0000${o.entityId}\u0000${o.period}`
}

// Sorted by entityType, entityId, period (then metric); values only, no ids, dates or labels.
export function canonicalContent(snapshot) {
  const rows = [...(snapshot?.observations ?? [])].sort(
    (a, b) =>
      cmp(a.entityType, b.entityType) || cmp(a.entityId, b.entityId) || cmp(a.period, b.period) || cmp(a.metric, b.metric)
  )
  return JSON.stringify(rows.map((o) => [o.entityType, o.entityId, o.period, o.metric, o.unit, o.value ?? null]))
}

export function dosmSnapshotObservations(table) {
  const make = (entityType, entityId, label, values) =>
    table.periods.map((period, i) => ({
      entityType,
      entityId,
      period,
      metric: DOSM_METRIC,
      unit: DOSM_UNIT,
      value: values[i] ?? null,
      ...(label ? { label } : {})
    }))
  return [
    ...make('total', `${DOSM_PREFIX}total`, null, table.total),
    ...make('unclassified', `${DOSM_PREFIX}unclassified`, null, table.unclassified),
    ...GROUP_CODES.flatMap((code) =>
      make('occupation_group', `${DOSM_PREFIX}${code}`, table.groups[code].name, table.groups[code].values)
    )
  ]
}

// Exact inverse of dosmSnapshotObservations.
export function dosmTableFromSnapshot(snapshot) {
  const obs = snapshot.observations
  const totals = obs.filter((o) => o.entityType === 'total')
  const periods = totals.map((o) => o.period)
  const series = (entityType, entityId) => {
    const byPeriod = new Map(
      obs.filter((o) => o.entityType === entityType && o.entityId === entityId).map((o) => [o.period, o.value])
    )
    return periods.map((p) => byPeriod.get(p) ?? null)
  }
  const groups = {}
  for (const code of GROUP_CODES) {
    const id = `${DOSM_PREFIX}${code}`
    groups[code] = {
      name: obs.find((o) => o.entityType === 'occupation_group' && o.entityId === id)?.label ?? '',
      values: series('occupation_group', id)
    }
  }
  return {
    periods,
    total: series('total', `${DOSM_PREFIX}total`),
    unclassified: series('unclassified', `${DOSM_PREFIX}unclassified`),
    groups
  }
}

export function openalexCounts(snapshot, topicId) {
  const out = {}
  for (const o of snapshot.observations) {
    if (o.entityType === 'ai_topic' && o.entityId === topicId && typeof o.value === 'number') out[o.period] = o.value
  }
  return out
}
