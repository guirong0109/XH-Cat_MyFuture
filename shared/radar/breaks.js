// Future Skills Radar: possible structural breaks in the DOSM total (break-v1). Pure functions, no I/O.
// A flag only says that the data changed shape; it never assumes a cause.

import { RADAR_CONFIG } from './config.js'

const present = (v) => typeof v === 'number' && Number.isFinite(v)

// A stable text of the total and the nine group values of the two quarters. The caller hashes it.
function observationText(table, i) {
  const codes = Object.keys(table.groups).sort()
  const quarter = (j) => [table.periods[j], table.total[j], ...codes.map((c) => table.groups[c].values[j])].map((v) => (v === null || v === undefined ? '-' : String(v))).join(',')
  return `${quarter(i - 1)}|${quarter(i)}`
}

// Flag quarter t when |total(t) / total(t-1) - 1| >= totalPercent and at least groupShare of the eligible groups
// (both quarters > 0) move the same way as the total by at least groupPercent.
export function detectBreaks(table, cfg = RADAR_CONFIG.breaks) {
  const found = []
  for (let i = 1; i < table.periods.length; i++) {
    const prev = table.total[i - 1]
    const now = table.total[i]
    if (!present(prev) || !present(now) || prev <= 0) continue
    const totalChangePercent = (now / prev - 1) * 100
    if (Math.abs(totalChangePercent) < cfg.totalPercent) continue
    const eligible = Object.values(table.groups).filter((g) => present(g.values[i - 1]) && present(g.values[i]) && g.values[i - 1] > 0 && g.values[i] > 0)
    if (eligible.length === 0) continue
    const sameWay = eligible.filter((g) => {
      const change = (g.values[i] / g.values[i - 1] - 1) * 100
      return Math.sign(change) === Math.sign(totalChangePercent) && Math.abs(change) >= cfg.groupPercent
    }).length
    if (sameWay / eligible.length < cfg.groupShare) continue
    found.push({
      period: table.periods[i],
      totalChangePercent,
      groupsSameWay: sameWay,
      eligibleGroups: eligible.length,
      observationHash: observationText(table, i),
    })
  }
  return found
}

const STATUS_DECISIONS = new Set(['confirmed', 'dismissed_counts', 'dismissed_shares'])

// A review applies only when its period and observation hash match the break. 'annotate' changes nothing.
// With several matching reviews the last one in the list decides.
export function applyBreakReviews(breaks, reviews = []) {
  return breaks.map((b) => {
    const match = [...(reviews || [])]
      .reverse()
      .find((r) => STATUS_DECISIONS.has(r?.decision) && r.appliesTo?.period === b.period && r.appliesTo?.observationHash === b.observationHash)
    return match ? { ...b, status: match.decision, reviewId: match.reviewId } : { ...b, status: 'unreviewed' }
  })
}
