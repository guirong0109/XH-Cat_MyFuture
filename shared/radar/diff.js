// Compare two snapshots. A changed value for an existing period is a revision; a period absent from the
// new snapshot is removed. An empty cell (value null) is still a present period, never a removed one.
import { canonicalContent, observationKey } from './snapshot.js'

export function diffSnapshots(previous, next) {
  if (previous && canonicalContent(previous) === canonicalContent(next)) {
    return { sameContent: true, newObservations: [], revisions: [], removed: [] }
  }
  const before = new Map((previous?.observations ?? []).map((o) => [observationKey(o), o]))
  const after = new Map(next.observations.map((o) => [observationKey(o), o]))
  const newObservations = []
  const revisions = []
  const removed = []
  for (const [key, o] of after) {
    const old = before.get(key)
    if (!old) newObservations.push(o)
    else if ((old.value ?? null) !== (o.value ?? null)) {
      revisions.push({ entityId: o.entityId, period: o.period, old: old.value ?? null, new: o.value ?? null })
    }
  }
  for (const [key, o] of before) {
    if (!after.has(key)) removed.push({ entityId: o.entityId, period: o.period })
  }
  return { sameContent: false, newObservations, revisions, removed }
}
