import { describe, it, expect } from 'vitest'
import { LEVEL_POINTS, MIN_IMPORTANCE, requirementItems, profileLevels, levelsMet, fitFor, bestFit } from '../../shared/matching/fit.js'

const row = (o) => ({ kind: 'el', element_id: '2.A.1.a', element: 'Reading', code: '11-1011.00', importance: '4', level: '4', suppress: 'N', not_relevant: 'N', ...o })
const item = (id, needed, importance = 4, kind = 'el') => ({ key: `${kind}:${id}`, elementId: id, kind, name: `N${id}`, importance, needed })
const skill = (canonicalId, proficiency) => ({ name: 'x', canonicalId, proficiency, proficiencyStatus: proficiency ? 'self_reported' : 'not_assessed' })

describe('constants', () => {
  it('has the agreed values', () => {
    expect(LEVEL_POINTS).toEqual({ basic: 2, good: 4, expert: 6 })
    expect(MIN_IMPORTANCE).toBe(3)
  })
})

describe('requirementItems', () => {
  it('importance below 3 and suppressed rows are left out', () => {
    const items = requirementItems([
      row({ element_id: 'a', importance: '2.9' }),
      row({ element_id: 'b', suppress: 'Y' }),
      row({ element_id: 'c', not_relevant: 'Y' }),
      row({ element_id: 'd', importance: '' }),
      row({ element_id: 'e', level: '' }),
      row({ element_id: 'f', kind: 'kn', importance: '3', level: '2.5', suppress: '' , not_relevant: ''}),
    ])
    expect(items).toEqual([{ key: 'kn:f', elementId: 'f', kind: 'kn', name: 'Reading', importance: 3, needed: 2.5 }])
  })
})

describe('profileLevels', () => {
  it('maps ids, ignores others, highest wins, null is not assessed', () => {
    const m = profileLevels({ skills: [
      skill('onet:el:a', 'basic'), skill('onet:el:a', 'expert'), skill('onet:el:a', 'good'),
      skill('onet:kn:b', null), skill('onet:kn:c', null), skill('onet:kn:c', 'good'),
      skill('onet:tech:z', 'expert'),
    ] })
    expect(m.get('el:a')).toEqual({ points: 6, notAssessed: false })
    expect(m.get('kn:b')).toEqual({ points: null, notAssessed: true })
    expect(m.get('kn:c')).toEqual({ points: 4, notAssessed: false })
    expect(m.size).toBe(3)
  })

  it('a proficiency that is an Object property name is not a level (not assessed)', () => {
    const m = profileLevels({ skills: [skill('onet:el:a', 'constructor'), skill('onet:el:b', '__proto__'), skill('onet:el:c', 'toString'), skill('onet:el:c', 'hasOwnProperty')] })
    expect(m.get('el:a')).toEqual({ points: null, notAssessed: true })
    expect(m.get('el:b')).toEqual({ points: null, notAssessed: true })
    expect(m.get('el:c')).toEqual({ points: null, notAssessed: true })
  })
})

describe('levelsMet', () => {
  it('owner chart example', () => {
    const r = levelsMet([{ needed: 2, you: 1.5 }, { needed: 2, you: 2 }, { needed: 2, you: 1.5 },
      { needed: 1.2, you: 1.5 }, { needed: 2.85, you: 1.5 }, { needed: 2, you: 1.5 }])
    expect(Math.abs(r.met - 9.2)).toBeLessThan(1e-9)
    expect(Math.abs(r.needed - 12.05)).toBeLessThan(1e-9)
    expect(r.percent).toBe(76)
  })
  it('percent is null when nothing is needed', () => {
    expect(levelsMet([]).percent).toBeNull()
  })
})

describe('fitFor', () => {
  it('missing counts 0', () => {
    const f = fitFor([item('a', 4)], new Map())
    expect(f.rows[0]).toMatchObject({ you: 0, status: 'missing', gap: 4 })
    expect(f.met).toBe(0)
    expect(f.percent).toBe(0)
  })
  it('above level capped', () => {
    const f = fitFor([item('a', 2)], new Map([['el:a', { points: 6, notAssessed: false }]]))
    expect(f.met).toBe(2)
    expect(f.rows[0]).toMatchObject({ status: 'met', gap: 0 })
    expect(f.percent).toBe(100)
  })
  it('not assessed meets the level and sets provisional', () => {
    const f = fitFor([item('a', 4)], new Map([['el:a', { points: null, notAssessed: true }]]))
    expect(f.rows[0]).toMatchObject({ status: 'not_assessed', gap: 0, you: 4 })
    expect(f.met).toBe(4)
    expect(f.provisional).toBe(true)
    expect(fitFor([item('a', 4)], new Map()).provisional).toBe(false)
  })
  it('duplicate ids keep the highest level', () => {
    const lv = profileLevels({ skills: [skill('onet:el:a', 'basic'), skill('onet:el:a', 'good')] })
    expect(fitFor([item('a', 4)], lv).rows[0].status).toBe('met')
  })
  it('raise list order and points', () => {
    const items = [item('a', 4), item('b', 6), item('c', 4), item('d', 2), item('e', 4)]
    const lv = new Map([
      ['el:b', { points: 2, notAssessed: false }], // gap 4 of total 20 = 20
      ['el:c', { points: 2, notAssessed: false }], // gap 2 of total 20 = 10
      ['el:d', { points: 2, notAssessed: false }], // met
      ['el:e', { points: 2, notAssessed: false }], // 10
    ])
    const f = fitFor(items, lv)
    expect(f.raise.map((r) => [r.key, r.action, r.from, r.to, r.points, r.stillShort])).toEqual([
      ['el:a', 'learn', null, 'good', 20, false],
      ['el:b', 'raise', 'basic', 'expert', 20, false],
      ['el:c', 'raise', 'basic', 'good', 10, false],
    ])
    expect(f.raise.length).toBe(3)
  })
  it('raise points are a share of all needed levels (owner chart example)', () => {
    const needs = [2, 2, 2, 1.2, 2.85, 2]
    const items = needs.map((n, i) => item(`i${i}`, n))
    const lv = new Map(items.map((it, i) => [it.key, { points: i === 1 ? 2 : 1.5, notAssessed: false }]))
    const f = fitFor(items, lv)
    expect(f.percent).toBe(76)
    // gap 0.5 / 12.05 = 4.15 -> 4; gap 1.35 / 12.05 = 11.2 -> 11 (largest)
    expect(f.raise.map((r) => [r.key, r.points])).toEqual([['el:i4', 11], ['el:i0', 4], ['el:i2', 4]])
  })
  it('needed above 6 gives expert and stillShort', () => {
    const f = fitFor([item('a', 6.5)], new Map([['el:a', { points: 6, notAssessed: false }]]))
    expect(f.raise[0]).toMatchObject({ action: 'raise', from: 'expert', to: 'expert', stillShort: true })
  })
  it('has no forbidden key names', () => {
    const f = fitFor([item('a', 4)], new Map())
    expect(JSON.stringify(f)).not.toMatch(/"[^"]*(score|weight|rank|opportunit)[^"]*":/i)
  })
})

describe('bestFit', () => {
  const lv = new Map([['el:a', { points: 4, notAssessed: false }]])
  it('highest percent wins, tie by code', () => {
    const jobs = [
      { code: '2', title: 'B', items: [item('a', 4)] },
      { code: '1', title: 'A', items: [item('a', 4)] },
      { code: '3', title: 'C', items: [item('a', 8)] },
    ]
    const r = bestFit(jobs, lv)
    expect(r.best.code).toBe('1')
    expect(r.best.fit.percent).toBe(100)
    expect(r.others.map((o) => o.code)).toEqual(['2', '3'])
  })
  it('no jobs gives null best', () => {
    expect(bestFit([], lv)).toEqual({ best: null, others: [] })
  })
})
