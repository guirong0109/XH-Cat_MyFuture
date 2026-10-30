// Future Skills Radar: DOSM shares and share-based trend rules (dosm-share-v1). Pure functions, no I/O.
// Takes a DosmTable (see server/radar/dosmTable.js). Result shape: TrendCore from trend.js, with volatility unit 'pp'.

import { RADAR_CONFIG } from './config.js'
import { volatilityLabel, sampleSd } from './trend.js'

const present = (v) => typeof v === 'number' && Number.isFinite(v)
const YEAR = 4

// Share of the DOSM total in percent, per group code; null where the group or the total is missing.
export function shares(table) {
  const out = {}
  for (const [code, g] of Object.entries(table.groups)) {
    out[code] = g.values.map((v, i) => (present(v) && present(table.total[i]) && table.total[i] > 0 ? (v / table.total[i]) * 100 : null))
  }
  return out
}

// Change in share against the same quarter one year earlier, in percentage points.
export function yoyPp(table, code, i, precomputed) {
  if (i < YEAR) return null
  const s = (precomputed ?? shares(table))[code]
  if (!s || !present(s[i]) || !present(s[i - YEAR])) return null
  return s[i] - s[i - YEAR]
}

// A comparison is clean for shares when no unreviewed or confirmed possible break lies in (earlier, later].
// Only a share dismissal clears a flag for shares.
function comparisonClean(table, breaks, earlier, later) {
  return !(breaks || []).some((b) => {
    const at = table.periods.indexOf(b.period)
    return at > earlier && at <= later && b.status !== 'dismissed_shares'
  })
}

function result(fields) {
  return { net: null, steps: [], volatility: null, evidenceQuality: null, reasons: [], ...fields }
}

export function classifyDosmGroup(table, code, breaks = [], cfg = RADAR_CONFIG.dosm) {
  const group = table.groups[code]
  const L = table.periods.length - 1
  const all = shares(table)
  const s = all[code] ?? []
  const count = (i) => (group && i >= 0 && present(group.values[i]) ? group.values[i] : null)
  const baselineShare = s[L - YEAR] ?? null
  const recentShare = s[L] ?? null
  const pp = yoyPp(table, code, L, all)
  const relativePercent = pp !== null && baselineShare > 0 ? (pp / baselineShare) * 100 : null
  const base = {
    share: { baseline: baselineShare, recent: recentShare, periods: { baseline: table.periods[L - YEAR] ?? null, recent: table.periods[L] ?? null } },
    pp,
    relativePercent,
    counts: { baseline: count(L - YEAR), recent: count(L) },
  }
  const fail = (sufficiency, reasons, key, vars = {}) =>
    result({ ...base, direction: null, evidenceSufficiency: sufficiency, reasons, rule: { key, vars } })

  // Reported quarters are those with a positive count: Elementary occupations has four zeros in 2024 before its
  // first real values in 2025 Q3 (threshold-analysis.md: "first values 2025 Q3"), so zeros are not counted.
  const reported = group ? group.values.filter((v) => present(v) && v > 0).length : 0
  if (reported < cfg.newCategoryQuarters) {
    return fail('insufficient_evidence', ['new_reporting_category'], 'rdRuleDosmNewCategory', { quarters: reported, minQuarters: cfg.newCategoryQuarters })
  }
  if (pp === null) return fail('insufficient_evidence', ['missing_value'], 'rdRuleDosmMissing')
  if (!comparisonClean(table, breaks, L - YEAR, L)) {
    const crossed = (breaks || []).filter((b) => {
      const at = table.periods.indexOf(b.period)
      return at > L - YEAR && at <= L && b.status !== 'dismissed_shares'
    })
    return fail('insufficient_comparable_evidence', ['possible_break'], 'rdRuleDosmBreak', { breakPeriods: crossed.map((b) => b.period) })
  }

  // Steps: the YoY pp changes of the last three quarters (Q vs Q-4, Q-1 vs Q-5, Q-2 vs Q-6); null where not clean.
  const yoyAt = (i) => (i >= YEAR && comparisonClean(table, breaks, i - YEAR, i) ? yoyPp(table, code, i, all) : null)
  const steps = [0, 1, 2].map((k) => yoyAt(L - k))
  const cleanSteps = steps.filter((v) => v !== null)

  // Volatility: SD (n - 1) of the clean YoY pp changes among the last four quarters; needs minSteps.
  const recentYoy = Array.from({ length: cfg.volatility.steps }, (_, k) => yoyAt(L - k)).filter((v) => v !== null)
  const sd = recentYoy.length >= cfg.volatility.minSteps ? sampleSd(recentYoy) : null
  const volatility = sd === null ? null : { value: sd, unit: 'pp', label: volatilityLabel(sd, cfg.volatility) }

  const material = Math.abs(pp) >= cfg.materialPp && (relativePercent === null ? recentShare > 0 : Math.abs(relativePercent) >= cfg.materialRelativePercent)
  const reasons = []
  let direction
  let rule
  let limitedByNoSteps = false

  if (material) {
    const agree = cleanSteps.filter((v) => Math.sign(v) === Math.sign(pp)).length
    const enough = cleanSteps.length >= 3 ? agree >= 2 : agree === cleanSteps.length
    if (enough) {
      direction = pp > 0 ? 'rising' : 'declining'
      rule = { key: pp > 0 ? 'rdRuleDosmRising' : 'rdRuleDosmDeclining', vars: { pp, relativePercent, agree, clean: cleanSteps.length, materialPp: cfg.materialPp, materialRelativePercent: cfg.materialRelativePercent } }
      limitedByNoSteps = cleanSteps.length < 3
    } else {
      direction = 'mixed'
      reasons.push('steps_disagree')
      rule = { key: 'rdRuleDosmMixedSteps', vars: { pp, relativePercent, agree, clean: cleanSteps.length } }
    }
  } else if (volatility && volatility.label === 'high') {
    direction = 'mixed'
    reasons.push('high_volatility')
    rule = { key: 'rdRuleDosmMixedVolatility', vars: { pp, volatility: volatility.value, high: cfg.volatility.high } }
  } else {
    direction = 'stable'
    rule = { key: 'rdRuleDosmStable', vars: { pp, relativePercent, materialPp: cfg.materialPp, materialRelativePercent: cfg.materialRelativePercent } }
  }

  const smallest = Math.min(base.counts.baseline ?? 0, base.counts.recent ?? 0)
  let evidenceQuality
  if (cleanSteps.length >= 3 && smallest >= cfg.evidence.strong) evidenceQuality = 'strong'
  else if (cleanSteps.length >= 2 && smallest >= cfg.evidence.moderate) evidenceQuality = 'moderate'
  else evidenceQuality = 'limited'
  if (limitedByNoSteps) evidenceQuality = 'limited'
  if (smallest < cfg.evidence.moderate) reasons.push('small_counts')
  if (cleanSteps.length < 3) reasons.push('few_clean_steps')

  return result({
    ...base,
    direction,
    net: { pp, relativePercent },
    steps,
    volatility,
    evidenceSufficiency: 'sufficient',
    evidenceQuality,
    reasons,
    rule,
  })
}

// DOSM's own quarter-on-quarter change in the total. Context only, never used to classify anything.
export function dosmContext(table) {
  const L = table.periods.length - 1
  const now = table.total[L]
  const prev = table.total[L - 1]
  return {
    period: table.periods[L],
    previousPeriod: table.periods[L - 1] ?? null,
    totalChangePercent: present(now) && present(prev) && prev > 0 ? (now / prev - 1) * 100 : null,
  }
}
