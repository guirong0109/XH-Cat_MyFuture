// Future Skills Radar: Research Momentum Index (log2-v1). Pure functions, no I/O.
// value = clamp(50 + k * log2(recent / baseline), 0, 100). Equal counts give 50, doubling gives 70.
// Zero or missing counts never give a number: the state says why.

import { RADAR_CONFIG } from './config.js'

function isCount(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

export function momentumIndex({ baseline, recent } = {}, cfg = RADAR_CONFIG.momentum) {
  const empty = { value: null, ratio: null, changePercent: null, capped: false, state: 'invalid', smallCounts: false }
  if (!isCount(baseline) || !isCount(recent)) return empty

  const smallCounts = Math.min(baseline, recent) < cfg.smallCount
  if (baseline === 0 && recent === 0) return { ...empty, state: 'no_activity', smallCounts }
  if (baseline === 0) return { ...empty, state: 'no_baseline', smallCounts }
  if (recent === 0) return { ...empty, state: 'dropped_to_zero', smallCounts }

  const ratio = recent / baseline
  const raw = 50 + cfg.k * Math.log2(ratio)
  const value = Math.min(100, Math.max(0, raw))
  return {
    value,
    ratio,
    changePercent: (ratio - 1) * 100,
    capped: value !== raw,
    state: 'ok',
    smallCounts,
  }
}

export function topicMomentum(counts, lastYear, cfg = RADAR_CONFIG.momentum) {
  const count = (year) => counts?.[String(year)]
  const window = cfg.windowYears
  const currentBase = lastYear - window
  const comparisonRecent = lastYear - 1
  const comparisonBase = comparisonRecent - window

  return {
    current: {
      ...momentumIndex({ baseline: count(currentBase), recent: count(lastYear) }, cfg),
      baselineYear: currentBase,
      recentYear: lastYear,
    },
    comparison: {
      ...momentumIndex({ baseline: count(comparisonBase), recent: count(comparisonRecent) }, cfg),
      baselineYear: comparisonBase,
      recentYear: comparisonRecent,
    },
  }
}

export function shareSeries(topic, reference) {
  const out = {}
  for (const year of Object.keys(topic ?? {})) {
    const part = topic[year]
    const whole = reference?.[year]
    if (isCount(part) && isCount(whole) && whole > 0) out[year] = part / whole
  }
  return out
}
