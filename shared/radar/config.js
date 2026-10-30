// Future Skills Radar: the frozen configuration of every method and threshold (radar-config/v1).
// Pure data, no I/O. Changing a value changes the published method, so bump the version.

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value)
  }
  return Object.freeze(obj)
}

export const RADAR_CONFIG = deepFreeze({
  version: 'radar-config/v1',
  momentum: { method: 'log2-v1', k: 20, windowYears: 3, smallCount: 100 },
  openalex: {
    method: 'openalex-count-v1',
    rising: 1.25,
    declining: 0.8,
    minYears: 4,
    volatility: { low: 8, high: 16, years: 6 },
    emerging: { baselineBelow: 100, recentAtLeast: 100, ratioAtLeast: 3, minYears: 4 },
    evidence: { strong: 300, moderate: 100, revisionPercent: 5 },
  },
  dosm: {
    method: 'dosm-share-v1',
    materialPp: 1.0,
    materialRelativePercent: 10,
    newCategoryQuarters: 8,
    volatility: { low: 0.75, high: 1.75, steps: 4, minSteps: 3 },
    evidence: { strong: 1000, moderate: 300 },
  },
  breaks: { method: 'break-v1', totalPercent: 50, groupShare: 0.75, groupPercent: 40 },
  freshness: { openalexDays: 14, dosmDaysAfterExpected: 14 },
  demo: { ttlMs: 7200000, maxSessions: 20 },
})
