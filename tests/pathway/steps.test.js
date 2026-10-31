import { describe, it, expect } from 'vitest'
import { fitFor } from '../../shared/matching/fit.js'
import { pathwaySteps } from '../../shared/pathway/steps.js'

const item = (id, needed, importance = 4, kind = 'el') => ({ key: `${kind}:${id}`, elementId: id, kind, name: `N${id}`, importance, needed })
const row = (o) => ({ key: 'el:a', elementId: 'a', kind: 'el', name: 'Na', importance: 4, needed: 4, you: 0, status: 'missing', gap: 4, ...o })

describe('pathwaySteps', () => {
  it('owner chart example', () => {
    const needs = [2, 2, 2, 1.2, 2.85, 2]
    const items = needs.map((n, i) => item(`i${i}`, n))
    const lv = new Map(items.map((it, i) => [it.key, { points: i === 1 ? 2 : 1.5, notAssessed: false }]))
    const f = fitFor(items, lv)
    const r = pathwaySteps(f.rows)
    expect(r.gaps.map((g) => [g.key, g.points])).toEqual([['el:i4', 11], ['el:i0', 4], ['el:i2', 4], ['el:i5', 4]])
    expect(r.gaps.slice(0, 3).map((g) => [g.key, g.points])).toEqual(f.raise.map((x) => [x.key, x.points]))
    expect(r.met.map((m) => m.key)).toEqual(['el:i1', 'el:i3'])
    expect(r.met.every((m) => m.points === null)).toBe(true)
    expect(r.provisional).toBe(false)
  })

  it('missing gives from null and learn', () => {
    const r = pathwaySteps([row({ needed: 4, you: 0, gap: 4, status: 'missing' })])
    expect(r.gaps[0]).toMatchObject({ from: null, to: 'good', points: 100, stillShort: false })
  })

  it('below gives the word it is at', () => {
    const r = pathwaySteps([row({ needed: 6, you: 2, gap: 4, status: 'below' })])
    expect(r.gaps[0]).toMatchObject({ from: 'basic', to: 'expert' })
  })

  it('not assessed go to their own group', () => {
    const r = pathwaySteps([
      row({ key: 'el:x', importance: 3.2, status: 'not_assessed', you: 4, gap: 0 }),
      row({ key: 'el:y', importance: 4.5, status: 'not_assessed', you: 4, gap: 0 }),
    ])
    expect(r.notAssessed.map((s) => s.key)).toEqual(['el:y', 'el:x'])
    expect(r.provisional).toBe(true)
    expect(r.gaps).toEqual([])
  })

  it('needed above 6', () => {
    const r = pathwaySteps([row({ needed: 6.5, you: 6, gap: 0.5, status: 'below' })])
    expect(r.gaps[0]).toMatchObject({ to: 'expert', stillShort: true, from: 'expert' })
  })

  it('no rows', () => {
    expect(pathwaySteps([])).toEqual({ gaps: [], notAssessed: [], met: [], provisional: false })
  })

  it('no forbidden keys', () => {
    const r = pathwaySteps([row({}), row({ key: 'el:b', status: 'met', you: 4, gap: 0 })])
    expect(JSON.stringify(r)).not.toMatch(/"[^"]*(score|weight|rank|opportunit)[^"]*":/i)
  })
})
