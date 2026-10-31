// Tests for the team sums of the organisation view: counts and sums of matching's numbers.
import { describe, it, expect } from 'vitest'
import { sliceOf, heatmap, planSteps, bandCounts, moved, teamSdg } from '../../shared/org/team.js'

const row = (key, needed, you, status) => ({ key, name: key.toUpperCase(), needed, you, status, gap: Math.max(0, needed - you) })
const slice = (rows, extra = {}) => ({
  code: '1', available: true, reason: null, missingStep: null, percent: 50, provisional: false,
  rows, bands: { moderate: 1, rapid: 1 }, sdgLinks: [], ...extra,
})
const person = (id, groupId, cur, tgt = null) => ({ id, groupId, current: cur, target: tgt })
const link = (target, kind, code) => ({ target, reason: 'r', approvedAt: null, via: { kind, code, name: null } })

describe('heatmap', () => {
  const p1 = person('p1', 'A', slice([row('kn:x', 4, 2, 'below')]))
  const p2 = person('p2', 'A', slice([row('kn:x', 4, 4, 'not_assessed')]))
  const groups = [{ id: 'A' }, { id: 'B' }]

  it('counts a cell', () => {
    const h = heatmap(groups, [p1, p2], 'current')
    expect(h.cells.A['kn:x']).toEqual({
      needing: 2, met: 0, below: 1, missing: 0, notAssessed: 1, levelsShort: 2, averageGap: 1, provisional: true,
      neededMax: 4,
      people: [
        { personId: 'p1', status: 'below', you: 2, needed: 4, gap: 2 },
        { personId: 'p2', status: 'not_assessed', you: 4, needed: 4, gap: 0 },
      ],
    })
  })
  it('a cell holding two roles keeps each person with their own needed level, neededMax the highest (final fix 5)', () => {
    const a = person('a', 'A', slice([row('kn:x', 3.5, 2, 'below')], { code: 'R1' }))
    const b = person('b', 'A', slice([row('kn:x', 6.5, 6, 'below')], { code: 'R2' }))
    const cell = heatmap(groups, [a, b], 'current').cells.A['kn:x']
    expect(cell.neededMax).toBe(6.5)
    expect(cell.people.map((x) => [x.personId, x.needed])).toEqual([['a', 3.5], ['b', 6.5]])
    expect(cell.needing).toBe(2)
  })
  it('no cell where nobody needs the key', () => {
    const h = heatmap(groups, [p1, p2], 'current')
    expect(h.cells.B['kn:x']).toBeUndefined()
  })
  it('orders columns by peopleShort, levelsShort, key', () => {
    const ps = [
      person('a', 'A', slice([row('kn:b', 4, 2, 'below'), row('kn:a', 4, 2, 'below'), row('kn:c', 6, 0, 'missing'), row('kn:d', 2, 2, 'met')])),
      person('b', 'A', slice([row('kn:c', 6, 6, 'met'), row('kn:e', 4, 0, 'missing')])),
    ]
    const h = heatmap(groups, ps, 'current')
    expect(h.columns.map((c) => c.key)).toEqual(['kn:c', 'kn:e', 'kn:a', 'kn:b', 'kn:d'])
    expect(h.columns[0]).toEqual({ key: 'kn:c', name: 'KN:C', peopleShort: 1, levelsShort: 6 })
  })
  it('leaves out broken chain and no known skill, counted with the reason', () => {
    const broken = person('b1', 'A', slice(null, { available: false, reason: 'chain_broken', missingStep: 'masco2020_unit_to_isco08' }))
    const none = person('b2', 'A', slice(null, { available: false, reason: 'no_known_skill' }))
    const h = heatmap(groups, [broken, none, p1], 'current')
    expect(h.leftOut).toEqual([
      { personId: 'b1', groupId: 'A', reason: 'chain_broken', missingStep: 'masco2020_unit_to_isco08' },
      { personId: 'b2', groupId: 'A', reason: 'no_known_skill', missingStep: null },
    ])
    expect(h.cells.A['kn:x'].needing).toBe(1)
  })
  it('a person with no slice for the view is in neither cells nor leftOut', () => {
    const h = heatmap(groups, [person('n', 'A', slice([row('kn:x', 4, 0, 'missing')]), null)], 'target')
    expect(h.leftOut).toEqual([])
    expect(h.columns).toEqual([])
    expect(h.cells.A).toEqual({})
  })
  it('does not mutate input', () => {
    const ps = [p1, p2]
    const before = JSON.stringify(ps)
    heatmap(groups, ps, 'current')
    expect(JSON.stringify(ps)).toBe(before)
  })
})

describe('planSteps', () => {
  const steps = (needed) => planSteps('A', [person('p', 'A', slice([row('kn:x', needed, 0, 'missing')]))], 'current')
  it('picks the level that reaches the need', () => {
    expect(steps(3.4)[0]).toMatchObject({ to: 'good', stillShort: false })
    expect(steps(5.8)[0]).toMatchObject({ to: 'expert', stillShort: false })
    expect(steps(6.5)[0]).toMatchObject({ to: 'expert', stillShort: true })
    expect(steps(1.5)[0].to).toBe('basic')
  })
  it('gives counts, neededMax and only steps with someone short', () => {
    const ps = [
      person('p', 'A', slice([row('kn:x', 4, 2, 'below'), row('kn:y', 4, 4, 'met')])),
      person('q', 'A', slice([row('kn:x', 5, 0, 'missing')])),
      person('r', 'B', slice([row('kn:z', 6, 0, 'missing')])),
    ]
    expect(planSteps('A', ps, 'current')).toEqual([
      { key: 'kn:x', name: 'KN:X', neededMax: 5, peopleShort: 2, missing: 1, below: 1, levelsShort: 7, to: 'expert', stillShort: false },
    ])
  })
})

describe('bands', () => {
  const p = person('p', 'A', slice([], { bands: { moderate: 4, rapid: 2 } }), slice([], { bands: { moderate: 1, rapid: 3 } }))
  const unavailable = person('u', 'A', slice(null, { available: false, reason: 'chain_broken' }))
  it('counts bands per group', () => {
    expect(bandCounts([{ id: 'A' }, { id: 'B' }], [p, unavailable], 'current', 'moderate')).toEqual({ A: [0, 0, 0, 1], B: [0, 0, 0, 0] })
    expect(bandCounts([{ id: 'A' }], [p], 'current', 'rapid')).toEqual({ A: [0, 1, 0, 0] })
  })
  it('lists who moves between scenarios', () => {
    expect(moved([p, unavailable], 'current')).toEqual([{ personId: 'p', from: 4, to: 2 }])
    expect(moved([p], 'target')).toEqual([{ personId: 'p', from: 1, to: 3 }])
  })
})

describe('teamSdg', () => {
  const a = person('a', 'A', slice([], { sdgLinks: [link('8.5', 'role', '25'), link('4.4', 'item', 'kn:x'), link('9.1', 'item', 'kn:other')] }))
  const b = person('b', 'A', slice([], { sdgLinks: [link('8.5', 'role', '25'), link('4.4', 'item', 'kn:x')] }))
  it('de-duplicates, filters items to the plan and groups by goal ascending', () => {
    const r = teamSdg('A', [a, b], 'current', ['kn:x'])
    expect(r.total).toBe(2)
    expect(r.goals.map((g) => [g.goal, g.count])).toEqual([[4, 1], [8, 1]])
    expect(r.goals[0].links[0].via.code).toBe('kn:x')
  })
  it('leaves out other groups and unavailable people', () => {
    const o = person('o', 'B', slice([], { sdgLinks: [link('1.1', 'role', '99')] }))
    expect(teamSdg('A', [a, o], 'current', []).goals.map((g) => g.goal)).toEqual([8])
  })
})

describe('sliceOf', () => {
  const answer = (over = {}) => ({
    code: '2512',
    fit: { rows: [row('kn:x', 4, 2, 'below')], percent: 76, met: 9.2, needed: 12.05, provisional: false, raise: [] },
    chain: { path: [], missingStep: null },
    outlook: { jobAds: { sufficient: true, direction: 'declining' }, ai: { moderate: { available: true, changesMuch: false }, rapid: { available: true, changesMuch: true } } },
    sdg: { pathPreview: { goals: [{ goal: 8, count: 1, links: [link('8.5', 'role', '25')] }], total: 1 } },
    ...over,
  })
  it('keeps matching percent and bands', () => {
    const s = sliceOf(answer())
    expect(s).toMatchObject({ code: '2512', available: true, reason: null, missingStep: null, percent: 76, provisional: false, bands: { moderate: 3, rapid: 3 } })
    expect(s.sdgLinks).toHaveLength(1)
    expect(s.rows).toHaveLength(1)
  })
  it('broken chain and no fit', () => {
    expect(sliceOf(answer({ fit: null, chain: { missingStep: 'masco2020_unit_to_isco08' } }))).toMatchObject({ available: false, reason: 'chain_broken', missingStep: 'masco2020_unit_to_isco08', percent: null, rows: null })
    expect(sliceOf(answer({ fit: null }))).toMatchObject({ available: false, reason: 'no_known_skill', missingStep: null })
  })
})

describe('no forbidden keys', () => {
  it('outputs avoid score/weight/rank/opportunit', () => {
    const p = person('p', 'A', slice([row('kn:x', 4, 0, 'missing')], { sdgLinks: [link('8.5', 'role', '25')] }), slice([row('kn:x', 4, 0, 'missing')]))
    const g = [{ id: 'A' }]
    const outs = [heatmap(g, [p], 'current'), planSteps('A', [p], 'current'), bandCounts(g, [p], 'current', 'rapid'), moved([p], 'current'), teamSdg('A', [p], 'current', []), p.current]
    for (const o of outs) expect(JSON.stringify(o)).not.toMatch(/score|weight|rank|opportunit/i)
  })
})
