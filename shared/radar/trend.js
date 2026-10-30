// Future Skills Radar: trend rules (openalex-count-v1). Pure functions, no I/O.
// Shared TrendCore shape: Task 5 reuses it and volatilityLabel for DOSM.
//
// TrendCore = {
//   direction: 'rising'|'declining'|'stable'|'emerging'|'mixed'|null,
//   net: {ratio, log2}|null,
//   steps: (number|null)[],            // log2 of the three annual changes; null where a step cannot be divided
//   volatility: {value, unit: 'log_points'|'pp', label}|null,
//   evidenceSufficiency: 'sufficient'|'insufficient_evidence'|'insufficient_comparable_evidence',
//   evidenceQuality: 'strong'|'moderate'|'limited'|null,
//   reasons: string[],
//   rule: {key, vars},
// }

import { RADAR_CONFIG } from './config.js'

const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0

// 'low' below the low bound, 'high' above the high bound, 'moderate' from low to high inclusive.
export function volatilityLabel(value, { low, high } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < low) return 'low'
  if (value > high) return 'high'
  return 'moderate'
}

// Sample standard deviation (n - 1). Null for fewer than two finite values.
export function sampleSd(values) {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1))
}

function at(counts, year) {
  const v = counts?.[year]
  return isCount(v) ? v : null
}

// SD (n - 1) of ln(c[y+1] / c[y]) for the six years Y-5..Y, times 100. Null unless all six are > 0.
export function openalexVolatility(counts, lastYear, cfg = RADAR_CONFIG.openalex) {
  const n = cfg.volatility.years
  const values = []
  for (let y = lastYear - n + 1; y <= lastYear; y++) {
    const v = at(counts, y)
    if (v === null || v <= 0) return null
    values.push(v)
  }
  const changes = []
  for (let i = 1; i < values.length; i++) changes.push(Math.log(values[i] / values[i - 1]))
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length
  const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / (changes.length - 1)
  return Math.sqrt(variance) * 100
}

function revisionOverLimit(revisions, lastYear, cfg) {
  return (revisions || []).some((r) => {
    const year = Number(r?.period)
    if (!Number.isFinite(year) || year < lastYear - 3 || year > lastYear) return false
    if (!isCount(r.old) || !isCount(r.new) || r.old === 0) return false
    return (Math.abs(r.new - r.old) / r.old) * 100 > cfg.evidence.revisionPercent
  })
}

function insufficient(reasons, key, vars = {}) {
  return {
    direction: null,
    net: null,
    steps: [],
    volatility: null,
    evidenceSufficiency: 'insufficient_evidence',
    evidenceQuality: null,
    reasons,
    rule: { key, vars },
  }
}

export function classifyOpenAlex(counts, lastYear, { revisions = [] } = {}, cfg = RADAR_CONFIG.openalex) {
  const Y = lastYear
  const yearsOfHistory = Object.keys(counts || {}).filter((k) => Number(k) <= Y && isCount(counts[k])).length
  if (yearsOfHistory < cfg.minYears) {
    return insufficient(['fewer_years'], 'rdRuleInsufficientYears', { years: yearsOfHistory, minYears: cfg.minYears })
  }

  const B = at(counts, Y - 3)
  const R = at(counts, Y)
  if (B === null || R === null) return insufficient(['missing_value'], 'rdRuleInsufficientMissing')
  if (R === 0 && B > 0) return insufficient(['dropped_to_zero'], 'rdRuleInsufficientZero')

  const window = [B, at(counts, Y - 2), at(counts, Y - 1), R]
  const steps = []
  for (let i = 1; i < window.length; i++) {
    const a = window[i - 1]
    const b = window[i]
    steps.push(a !== null && b !== null && a > 0 && b > 0 ? Math.log2(b / a) : null)
  }

  const vol = openalexVolatility(counts, Y, cfg)
  const volatility =
    vol === null ? null : { value: vol, unit: 'log_points', label: volatilityLabel(vol, cfg.volatility) }

  const [, m2, m1] = window
  const lastTwoUp = m2 !== null && m1 !== null && m1 > m2 && R > m1
  const em = cfg.emerging
  const isEmerging =
    B < em.baselineBelow && R >= em.recentAtLeast && (B === 0 || R / B >= em.ratioAtLeast) && lastTwoUp && yearsOfHistory >= em.minYears

  const reasons = []
  let direction
  let net = null
  let rule

  if (isEmerging) {
    direction = 'emerging'
    if (B === 0) reasons.push('zero_baseline')
    else net = { ratio: R / B, log2: Math.log2(R / B) }
    rule = { key: 'rdRuleEmerging', vars: { baseline: B, recent: R, baselineBelow: em.baselineBelow, recentAtLeast: em.recentAtLeast, ratioAtLeast: em.ratioAtLeast } }
  } else if (B === 0) {
    return insufficient(['zero_baseline'], 'rdRuleInsufficientBaseline', { baseline: B, recent: R })
  } else {
    const ratio = R / B
    net = { ratio, log2: Math.log2(ratio) }
    if (ratio >= cfg.rising || ratio <= cfg.declining) {
      const up = ratio >= cfg.rising
      const agree = steps.filter((s) => s !== null && (up ? s > 0 : s < 0)).length
      if (agree >= 2) {
        direction = up ? 'rising' : 'declining'
        rule = { key: up ? 'rdRuleRising' : 'rdRuleDeclining', vars: { ratio, limit: up ? cfg.rising : cfg.declining, agree } }
      } else {
        direction = 'mixed'
        reasons.push('steps_disagree')
        rule = { key: 'rdRuleMixedSteps', vars: { ratio, agree } }
      }
    } else if (volatility && volatility.label === 'high') {
      direction = 'mixed'
      reasons.push('high_volatility')
      rule = { key: 'rdRuleMixedVolatility', vars: { ratio, volatility: vol, high: cfg.volatility.high } }
    } else {
      direction = 'stable'
      rule = { key: 'rdRuleStable', vars: { ratio, rising: cfg.rising, declining: cfg.declining } }
    }
  }

  const smallest = Math.min(B, R)
  const revised = revisionOverLimit(revisions, Y, cfg)
  const sixYears = vol !== null
  let evidenceQuality
  if (revised) evidenceQuality = 'limited'
  else if (smallest >= cfg.evidence.strong && sixYears) evidenceQuality = 'strong'
  else if (smallest >= cfg.evidence.moderate) evidenceQuality = 'moderate'
  else evidenceQuality = 'limited'
  if (revised) reasons.push('revision_over_5')
  if (smallest < cfg.evidence.moderate) reasons.push('small_counts')

  return {
    direction,
    net,
    steps,
    volatility,
    evidenceSufficiency: 'sufficient',
    evidenceQuality,
    reasons,
    rule,
  }
}
