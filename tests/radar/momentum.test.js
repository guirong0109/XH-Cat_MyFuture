import { describe, expect, it } from 'vitest'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { momentumIndex, topicMomentum, shareSeries } from '../../shared/radar/momentum.js'

describe('Research Momentum Index (log2, k = 20)', () => {
  it('doubling = 70, halving = 30, same = 50', () => {
    expect(momentumIndex({ baseline: 100, recent: 200 }).value).toBeCloseTo(70)
    expect(momentumIndex({ baseline: 200, recent: 100 }).value).toBeCloseTo(30)
    expect(momentumIndex({ baseline: 500, recent: 500 }).value).toBe(50)
  })
  it('caps at 100 from 5.66x and keeps the real ratio', () => {
    const r = momentumIndex({ baseline: 1000, recent: 6000 })
    expect(r).toMatchObject({ value: 100, capped: true, state: 'ok' })
    expect(r.ratio).toBeCloseTo(6)
  })
  it('real T10028 2022->2025 gives 83.3', () => {
    expect(momentumIndex({ baseline: 7939, recent: 25167 }).value).toBeCloseTo(83.3, 1)
  })
  it('zero and missing never produce a number', () => {
    expect(momentumIndex({ baseline: 0, recent: 140 })).toMatchObject({ value: null, state: 'no_baseline' })
    expect(momentumIndex({ baseline: 80, recent: 0 })).toMatchObject({ value: null, state: 'dropped_to_zero' })
    expect(momentumIndex({ baseline: 0, recent: 0 })).toMatchObject({ value: null, state: 'no_activity' })
    expect(momentumIndex({ baseline: null, recent: 5 })).toMatchObject({ value: null, state: 'invalid' })
  })
  it('small counts are flagged', () => {
    expect(momentumIndex({ baseline: 91, recent: 456 }).smallCounts).toBe(true)
  })
  it('topicMomentum uses Y vs Y-3 and Y-1 vs Y-4', () => {
    const counts = { 2021: 7830, 2022: 7939, 2023: 10983, 2024: 17379, 2025: 25167 }
    const m = topicMomentum({ ...counts, 2020: 6758 }, 2025)
    expect(m.current).toMatchObject({ baselineYear: 2022, recentYear: 2025 })
    expect(m.comparison).toMatchObject({ baselineYear: 2021, recentYear: 2024 })
  })
  it('shareSeries divides by the reference', () => {
    expect(shareSeries({ 2025: 25167 }, { 2025: 906207 })[2025]).toBeCloseTo(0.02777, 4)
  })
  it('config is frozen and versioned', () => {
    expect(RADAR_CONFIG.version).toBe('radar-config/v1')
    expect(Object.isFrozen(RADAR_CONFIG)).toBe(true)
  })
})
