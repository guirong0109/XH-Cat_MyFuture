import { describe, it, expect } from 'vitest'
import { SCENARIOS, aeiForJob, aiPart, jobAdsPart, bandOf, movedRoles } from '../../shared/matching/outlook.js'

const aeiMap = (o) => new Map(Object.entries(o))
const tasksMap = (o) => new Map(Object.entries(o))
const sig = (digit, direction, evidenceSufficiency = 'sufficient') => ({
  signalId: `dosm:masco2020:${digit}`,
  direction,
  evidenceSufficiency,
  evidenceLinks: [{ label: 'DOSM', url: 'https://example.test/' + digit }],
})
const aiOn = { available: true, changesMuch: false }
const aiMuch = { available: true, changesMuch: true }
const aiNone = { available: false, changesMuch: null }
const ads = (direction, sufficient = true) => ({ available: true, direction, sufficient })

function keysOf(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keysOf(x, out) }
  return out
}

describe('SCENARIOS', () => {
  it('is moderate and rapid', () => expect(SCENARIOS).toEqual(['moderate', 'rapid']))
})

describe('aeiForJob', () => {
  it('weights by usage and counts observed share', () => {
    const aei = aeiMap({
      t1: { usage: 3, automation: 80, augmentation: 20 },
      t2: { usage: 1, automation: 40, augmentation: 60 },
    })
    const tasks = tasksMap({ '11-1011.00': ['t1', 't2', 't3', 't4'] })
    const r = aeiForJob('11-1011.00', tasks, aei)
    expect(r.tasks).toBe(4)
    expect(r.observed).toBe(2)
    expect(r.observedShare).toBe(50)
    expect(r.automationPct).toBe(70)
    expect(r.augmentationPct).toBe(30)
  })
  it('a task with empty automation counts as observed but is left out of the averages', () => {
    const aei = aeiMap({
      t1: { usage: 1, automation: null, augmentation: null },
      t2: { usage: 1, automation: 60, augmentation: 40 },
    })
    const r = aeiForJob('x', tasksMap({ x: ['t1', 't2'] }), aei)
    expect(r.observed).toBe(2)
    expect(r.automationPct).toBe(60)
  })
  it('null averages when no observed task has them', () => {
    const aei = aeiMap({ t1: { usage: 1, automation: null, augmentation: null } })
    const r = aeiForJob('x', tasksMap({ x: ['t1'] }), aei)
    expect(r.automationPct).toBeNull()
    expect(r.augmentationPct).toBeNull()
  })
  it('null when no task is observed or the job is unknown', () => {
    expect(aeiForJob('x', tasksMap({ x: ['zz'] }), aeiMap({}))).toBeNull()
    expect(aeiForJob('nope', tasksMap({}), aeiMap({}))).toBeNull()
  })
})

describe('aiPart', () => {
  it('rapid: G3 and G4 change much, other gradients do not, no row is unavailable', () => {
    for (const g of ['G4', 'G3']) expect(aiPart('rapid', { ilo: { gradient: g, mean: 0.5, sd: 0.1 } })).toMatchObject({ available: true, changesMuch: true, source: 'ilo' })
    for (const g of ['G2', 'G1', 'minimal', 'not_exposed']) expect(aiPart('rapid', { ilo: { gradient: g } })).toMatchObject({ available: true, changesMuch: false })
    expect(aiPart('rapid', { ilo: null })).toMatchObject({ available: false, changesMuch: null, source: 'ilo' })
  })
  it('moderate: automation above 50 changes much; null aei or null automation is unavailable', () => {
    expect(aiPart('moderate', { aei: { automationPct: 51 } })).toMatchObject({ available: true, changesMuch: true, source: 'aei' })
    expect(aiPart('moderate', { aei: { automationPct: 50 } })).toMatchObject({ available: true, changesMuch: false })
    expect(aiPart('moderate', { aei: null })).toMatchObject({ available: false, changesMuch: null })
    expect(aiPart('moderate', { aei: { automationPct: null } })).toMatchObject({ available: false, changesMuch: null })
  })
})

describe('jobAdsPart', () => {
  it('reads the group signal for the first digit and carries the path', () => {
    const r = jobAdsPart([sig(2, 'rising'), sig(3, 'declining')], '2521-03')
    expect(r).toMatchObject({ available: true, groupCode: '2', direction: 'rising', sufficient: true, signalId: 'dosm:masco2020:2' })
    expect(r.evidenceLinks).toEqual([{ label: 'DOSM', url: 'https://example.test/2' }])
    expect(r.path).toEqual([{ system: 'eMASCO', code: '2521-03' }, { system: 'MASCO 2020 major group', code: '2' }])
  })
  it('insufficient evidence is not sufficient', () => {
    const r = jobAdsPart([sig(2, null, 'insufficient_evidence')], '2521-03')
    expect(r.sufficient).toBe(false)
    expect(r.direction).toBeNull()
  })
  it('absent signal is unavailable but keeps the path', () => {
    const r = jobAdsPart([], '2521-03')
    expect(r.available).toBe(false)
    expect(r.sufficient).toBe(false)
    expect(r.path).toHaveLength(2)
  })
})

describe('bandOf', () => {
  it('3: sufficient and declining, whatever the AI says', () => {
    expect(bandOf(ads('declining'), aiOn)).toBe(3)
    expect(bandOf(ads('declining'), aiMuch)).toBe(3)
    expect(bandOf(ads('declining'), aiNone)).toBe(3)
  })
  it('2: AI changes much', () => {
    expect(bandOf(ads('rising'), aiMuch)).toBe(2)
    expect(bandOf(ads('stable', false), aiMuch)).toBe(2)
  })
  it('1: sufficient rising or stable with AI data', () => {
    expect(bandOf(ads('rising'), aiOn)).toBe(1)
    expect(bandOf(ads('stable'), aiOn)).toBe(1)
  })
  it('4: emerging, mixed, no AI data, or insufficient', () => {
    expect(bandOf(ads('emerging'), aiOn)).toBe(4)
    expect(bandOf(ads('mixed'), aiOn)).toBe(4)
    expect(bandOf(ads('rising'), aiNone)).toBe(4)
    expect(bandOf({ available: false, direction: null, sufficient: false }, aiOn)).toBe(4)
  })
  it('insufficient DOSM never gives band 1 or 3', () => {
    for (const d of ['rising', 'stable', 'declining', null])
      for (const ai of [aiOn, aiMuch, aiNone]) expect([1, 3]).not.toContain(bandOf(ads(d, false), ai))
  })
  it('works end to end in both scenarios', () => {
    const j = jobAdsPart([sig(2, 'stable')], '2521-03')
    expect(bandOf(j, aiPart('moderate', { aei: { automationPct: 70 } }))).toBe(2)
    expect(bandOf(j, aiPart('rapid', { ilo: { gradient: 'G1' } }))).toBe(1)
    expect(bandOf(j, aiPart('rapid', { ilo: null }))).toBe(4)
  })
})

describe('movedRoles', () => {
  it('lists only changes', () => {
    const before = [{ code: 'a', band: 1 }, { code: 'b', band: 2 }, { code: 'c', band: 4 }]
    const after = [{ code: 'a', band: 1 }, { code: 'b', band: 3 }, { code: 'c', band: 1 }]
    expect(movedRoles(before, after)).toEqual([{ code: 'b', from: 2, to: 3 }, { code: 'c', from: 4, to: 1 }])
  })
})

describe('no forbidden keys', () => {
  it('no key matches score, weight, rank or opportunit', () => {
    const aei = aeiForJob('x', tasksMap({ x: ['t1'] }), aeiMap({ t1: { usage: 1, automation: 60, augmentation: 40 } }))
    const objs = [
      aei,
      aiPart('moderate', { aei }),
      aiPart('rapid', { ilo: { gradient: 'G3', mean: 1, sd: 1 } }),
      jobAdsPart([sig(2, 'rising')], '2521-03'),
      jobAdsPart([], '2521-03'),
      movedRoles([{ code: 'a', band: 1 }], [{ code: 'a', band: 2 }]),
    ]
    for (const k of keysOf(objs)) expect(k).not.toMatch(/score|weight|rank|opportunit/i)
  })
})
