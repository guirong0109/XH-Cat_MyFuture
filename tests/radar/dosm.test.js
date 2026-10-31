import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parseDosmJmi } from '../../server/radar/dosmTable.js'
import { shares, yoyPp, classifyDosmGroup, dosmContext } from '../../shared/radar/dosm.js'
import { detectBreaks, applyBreakReviews } from '../../shared/radar/breaks.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { truncateTable } from '../helpers/radarInputs.js'

const t = parseDosmJmi(await readFile('data/radar/source/dosm-jmi-2026q2.xlsx'))
const none = () => applyBreakReviews(detectBreaks(t), [])

describe('DOSM shares and breaks (real workbook)', () => {
  it('flags exactly 2020 Q2, 2020 Q3, 2021 Q3, 2025 Q3', () => {
    expect(detectBreaks(t).map((b) => b.period)).toEqual(['2020 Q2', '2020 Q3', '2021 Q3', '2025 Q3'])
  })

  it('shares and yoyPp: Professionals 2026 Q2 is 51.47 percent, +5.67 pp', () => {
    const i = t.periods.indexOf('2026 Q2')
    expect(shares(t)['2'][i]).toBeCloseTo(51.47, 2)
    expect(yoyPp(t, '2', i)).toBeCloseTo(5.67, 2)
    expect(yoyPp(t, '2', 2)).toBeNull()
  })

  it('Professionals 2026 Q2: +5.67 pp but insufficient comparable evidence', () => {
    const r = classifyDosmGroup(t, '2', none())
    expect(r.pp).toBeCloseTo(5.67, 2)
    expect(r).toMatchObject({ direction: null, evidenceSufficiency: 'insufficient_comparable_evidence' })
    expect(r.reasons).toContain('possible_break')
    expect(r.counts.recent).toBeGreaterThan(0)
  })

  it('as of 2025 Q2: Technicians mixed, Clerical declining, Professionals volatility 0.85', () => {
    const upTo = truncateTable(t, '2025 Q2')
    const b = applyBreakReviews(detectBreaks(upTo), [])
    expect(classifyDosmGroup(upTo, '3', b).direction).toBe('mixed')
    expect(classifyDosmGroup(upTo, '4', b)).toMatchObject({ direction: 'declining' })
    const prof = classifyDosmGroup(upTo, '2', b)
    expect(prof.volatility.value).toBeCloseTo(0.85, 2)
    expect(prof.volatility).toMatchObject({ unit: 'pp', label: 'moderate' })
    expect(prof.steps).toHaveLength(3)
  })

  it('Elementary occupations is a new reporting category', () => {
    const r = classifyDosmGroup(t, '9', none())
    expect(r.reasons).toContain('new_reporting_category')
    expect(r).toMatchObject({ direction: null, evidenceSufficiency: 'insufficient_evidence' })
  })

  it('a dismissal for shares applies only to the same observations', () => {
    const b = detectBreaks(t).find((x) => x.period === '2025 Q3')
    const ok = applyBreakReviews([b], [{ reviewId: 'r1', decision: 'dismissed_shares', appliesTo: { period: '2025 Q3', observationHash: b.observationHash } }])
    const stale = applyBreakReviews([b], [{ reviewId: 'r2', decision: 'dismissed_shares', appliesTo: { period: '2025 Q3', observationHash: 'other' } }])
    expect(ok[0].status).toBe('dismissed_shares')
    expect(ok[0].reviewId).toBe('r1')
    expect(stale[0].status).toBe('unreviewed')
    expect(typeof b.observationHash).toBe('string')
  })

  it('dismissing the 2025 Q3 flag for shares makes the latest Professionals comparison usable', () => {
    const b = detectBreaks(t).find((x) => x.period === '2025 Q3')
    const reviewed = applyBreakReviews(detectBreaks(t), [{ reviewId: 'r1', decision: 'dismissed_shares', appliesTo: { period: b.period, observationHash: b.observationHash } }])
    const r = classifyDosmGroup(t, '2', reviewed)
    expect(r.evidenceSufficiency).toBe('sufficient')
    expect(r.direction).not.toBeNull()
  })

  it('a counts-only dismissal or a confirmed flag keeps the shares restriction', () => {
    const b = detectBreaks(t).find((x) => x.period === '2025 Q3')
    for (const decision of ['dismissed_counts', 'confirmed']) {
      const reviewed = applyBreakReviews(detectBreaks(t), [{ reviewId: 'r', decision, appliesTo: { period: b.period, observationHash: b.observationHash } }])
      expect(classifyDosmGroup(t, '2', reviewed).evidenceSufficiency).toBe('insufficient_comparable_evidence')
    }
  })

  it('context indicator is DOSM total q/q: -11.4%', () => {
    expect(dosmContext(t)).toMatchObject({ period: '2026 Q2', previousPeriod: '2026 Q1' })
    expect(dosmContext(t).totalChangePercent).toBeCloseTo(-11.4, 1)
  })

  it('reads its limits from RADAR_CONFIG', () => {
    expect(RADAR_CONFIG.breaks.totalPercent).toBe(50)
    // Looser break limits flag more quarters.
    const loose = detectBreaks(t, { ...RADAR_CONFIG.breaks, totalPercent: 30 })
    expect(loose.length).toBeGreaterThan(4)
  })
})

describe('classifyDosmGroup on synthetic tables', () => {
  const periods = Array.from({ length: 12 }, (_, i) => `${2023 + Math.floor(i / 4)} Q${(i % 4) + 1}`)
  const table = (groupValues, total = periods.map(() => 1000)) => ({
    periods,
    total,
    unclassified: periods.map(() => null),
    groups: Object.fromEntries(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => [c, { name: `g${c}`, values: c === '2' ? groupValues : total.map((x) => x * 0.1) }])
    ),
  })

  const big = periods.map(() => 10000)

  it('steady rise of 2 pp a year is Rising with strong evidence', () => {
    const tb = table(periods.map((_, i) => 1500 + Math.floor(i / 4) * 200), big)
    const r = classifyDosmGroup(tb, '2', applyBreakReviews(detectBreaks(tb), []))
    expect(r).toMatchObject({ direction: 'rising', evidenceSufficiency: 'sufficient', evidenceQuality: 'strong' })
    expect(r.pp).toBeCloseTo(2, 6)
    expect(r.rule.key).toBe('rdRuleDosmRising')
  })

  it('flat shares are Stable', () => {
    const tb = table(periods.map(() => 3000), big)
    const r = classifyDosmGroup(tb, '2', applyBreakReviews(detectBreaks(tb), []))
    expect(r.direction).toBe('stable')
  })

  it('small counts give limited quality', () => {
    const tb = table(periods.map((_, i) => 150 + Math.floor(i / 4) * 20), periods.map(() => 1000))
    const r = classifyDosmGroup(tb, '2', applyBreakReviews(detectBreaks(tb), []))
    expect(r.direction).toBe('rising')
    expect(r.evidenceQuality).toBe('limited')
  })
})
