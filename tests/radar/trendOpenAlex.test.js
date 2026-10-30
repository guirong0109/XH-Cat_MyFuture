import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { classifyOpenAlex, openalexVolatility, volatilityLabel } from '../../shared/radar/trend.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'

const six = JSON.parse(await readFile('docs/radar/index-analysis-openalex-2026-10-30.json', 'utf8'))
const c = (id) => Object.fromEntries(Object.entries(six.topics[id].counts).map(([y, v]) => [y, v]))
const series = (y0, values) => Object.fromEntries(values.map((v, i) => [y0 + i, v]))

describe('classifyOpenAlex (real counts)', () => {
  it('T10028 2025: Rising, High volatility 18.0, Strong', () => {
    const r = classifyOpenAlex(c('T10028'), 2025)
    expect(r).toMatchObject({ direction: 'rising', evidenceSufficiency: 'sufficient', evidenceQuality: 'strong' })
    expect(r.volatility.value).toBeCloseTo(18.0, 1)
    expect(r.volatility.label).toBe('high')
    expect(r.volatility.unit).toBe('log_points')
    expect(r.net.ratio).toBeCloseTo(25167 / 7939, 6)
    expect(r.steps).toHaveLength(3)
    expect(r.rule.key).toBe('rdRuleRising')
  })

  it('T12549 2025: Stable, volatility 8.2, Strong', () => {
    const r = classifyOpenAlex(c('T12549'), 2025)
    expect(r).toMatchObject({ direction: 'stable', evidenceQuality: 'strong' })
    expect(r.volatility.value).toBeCloseTo(8.2, 1)
    expect(r.volatility.label).toBe('moderate')
  })

  it('a revision over 5% inside the window lowers quality to limited', () => {
    const r = classifyOpenAlex(c('T10028'), 2025, { revisions: [{ period: '2024', old: 17379, new: 16000 }] })
    expect(r.evidenceQuality).toBe('limited')
    expect(r.reasons).toContain('revision_over_5')
  })

  it('a revision of 5% or less, or outside the window, keeps quality', () => {
    expect(classifyOpenAlex(c('T10028'), 2025, { revisions: [{ period: '2024', old: 1000, new: 950 }] }).evidenceQuality).toBe('strong')
    expect(classifyOpenAlex(c('T10028'), 2025, { revisions: [{ period: '2020', old: 1000, new: 500 }] }).evidenceQuality).toBe('strong')
  })
})

describe('classifyOpenAlex (rules)', () => {
  it('limits are inclusive: 1.25 rises, 0.80 declines', () => {
    expect(classifyOpenAlex(series(2022, [1000, 1100, 1180, 1250]), 2025).direction).toBe('rising')
    expect(classifyOpenAlex(series(2022, [1000, 900, 850, 800]), 2025).direction).toBe('declining')
    expect(classifyOpenAlex(series(2022, [1000, 1100, 1180, 1249]), 2025).direction).toBe('stable')
  })

  it('two of three steps against the net gives mixed', () => {
    const r = classifyOpenAlex(series(2022, [1000, 1500, 1400, 1300]), 2025)
    expect(r.direction).toBe('mixed')
    expect(r.reasons).toContain('steps_disagree')
  })

  it('within limits but high volatility gives mixed', () => {
    const r = classifyOpenAlex(series(2020, [1000, 1900, 800, 1700, 700, 900]), 2025)
    expect(r.volatility.label).toBe('high')
    expect(r.direction).toBe('mixed')
    expect(r.reasons).toContain('high_volatility')
  })

  it('Emerging from a zero baseline without dividing', () => {
    const r = classifyOpenAlex(series(2019, [0, 0, 0, 0, 40, 90, 140]), 2025)
    expect(r.direction).toBe('emerging')
    expect(r.net).toBeNull()
    expect(r.reasons).toContain('zero_baseline')
    expect(r.evidenceQuality).toBe('limited')
    expect(r.volatility).toBeNull()
  })

  it('Emerging from a small positive baseline needs ratio of 3 and two steps up', () => {
    expect(classifyOpenAlex(series(2022, [30, 60, 90, 120]), 2025).direction).toBe('emerging')
    expect(classifyOpenAlex(series(2022, [60, 90, 100, 120]), 2025).direction).not.toBe('emerging')
    expect(classifyOpenAlex(series(2022, [30, 60, 130, 120]), 2025).direction).not.toBe('emerging')
  })

  it('fewer than 4 years gives insufficient_evidence', () => {
    const r = classifyOpenAlex(series(2023, [500, 600, 700]), 2025)
    expect(r).toMatchObject({ direction: null, evidenceSufficiency: 'insufficient_evidence', evidenceQuality: null })
    expect(r.reasons).toContain('fewer_years')
  })

  it('a missing baseline or recent value gives insufficient_evidence', () => {
    const r = classifyOpenAlex({ 2020: 500, 2021: 500, 2023: 500, 2024: 500, 2025: 500 }, 2025)
    expect(r.evidenceSufficiency).toBe('insufficient_evidence')
    expect(r.reasons).toContain('missing_value')
  })

  it('R = 0 with B > 0 gives insufficient_evidence, dropped_to_zero', () => {
    const r = classifyOpenAlex(series(2022, [500, 300, 100, 0]), 2025)
    expect(r).toMatchObject({ direction: null, evidenceSufficiency: 'insufficient_evidence' })
    expect(r.reasons).toContain('dropped_to_zero')
  })

  it('zero baseline that is not emerging gives insufficient_evidence', () => {
    const r = classifyOpenAlex(series(2022, [0, 5, 8, 20]), 2025)
    expect(r.evidenceSufficiency).toBe('insufficient_evidence')
    expect(r.reasons).toContain('zero_baseline')
  })

  it('small counts: moderate above 100, limited below, with small_counts reason', () => {
    expect(classifyOpenAlex(series(2022, [150, 160, 170, 180]), 2025).evidenceQuality).toBe('moderate')
    const r = classifyOpenAlex(series(2022, [50, 60, 70, 80]), 2025)
    expect(r.evidenceQuality).toBe('limited')
    expect(r.reasons).toContain('small_counts')
  })

  it('fewer than six years caps quality at moderate and volatility is null', () => {
    const r = classifyOpenAlex(series(2021, [500, 510, 520, 530, 540]), 2025)
    expect(r.volatility).toBeNull()
    expect(r.evidenceQuality).toBe('moderate')
  })

  it('uses the config and ignores years after lastYear', () => {
    const counts = { ...series(2022, [1000, 1100, 1180, 1250]), 2026: 1 }
    expect(classifyOpenAlex(counts, 2025).direction).toBe('rising')
    expect(Object.isFrozen(RADAR_CONFIG.openalex)).toBe(true)
  })
})

describe('openalexVolatility and volatilityLabel', () => {
  it('matches the documented T10028 value', () => {
    expect(openalexVolatility(c('T10028'), 2025)).toBeCloseTo(18.0, 1)
  })
  it('is null when any of the six years is missing or zero', () => {
    expect(openalexVolatility(series(2021, [5, 6, 7, 8, 9]), 2025)).toBeNull()
    expect(openalexVolatility(series(2020, [5, 0, 7, 8, 9, 10]), 2025)).toBeNull()
  })
  it('labels with inclusive bounds 8 and 16', () => {
    const t = { low: 8, high: 16 }
    expect(volatilityLabel(7.99, t)).toBe('low')
    expect(volatilityLabel(8, t)).toBe('moderate')
    expect(volatilityLabel(16, t)).toBe('moderate')
    expect(volatilityLabel(16.01, t)).toBe('high')
    expect(volatilityLabel(null, t)).toBeNull()
  })
})
