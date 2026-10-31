import { describe, expect, it } from 'vitest'
import { AI_USE_KEYS, aiKnowHow, overallMatch, readAiUse, sortValue } from '../../shared/matching/overall.js'

describe('readAiUse', () => {
  it('reads an old profile as all null', () => expect(readAiUse({})).toEqual({ mindset: null, ethics: null, apply: null, design: null }))
  it('keeps yes/no and drops anything else', () =>
    expect(readAiUse({ aiUse: { mindset: 'yes', ethics: 'maybe', apply: 'no', design: 7 } })).toEqual({ mindset: 'yes', ethics: null, apply: 'no', design: null }))
  it('treats a non-object aiUse as unanswered', () => expect(readAiUse({ aiUse: 'yes' })).toEqual({ mindset: null, ethics: null, apply: null, design: null }))
  it('has the four UNESCO dimensions in order', () => expect(AI_USE_KEYS).toEqual(['mindset', 'ethics', 'apply', 'design']))
})

describe('aiKnowHow', () => {
  it('is missing when nothing is answered', () => expect(aiKnowHow(readAiUse({}))).toBeNull())
  it('3 Yes of 4 is 75%', () => expect(aiKnowHow({ mindset: 'yes', ethics: 'yes', apply: 'yes', design: 'no' })).toEqual({ percent: 75, yes: 3, answered: 4 }))
  it('counts only answered questions: 1 Yes of 2 is 50%', () => expect(aiKnowHow({ mindset: 'yes', ethics: null, apply: 'no', design: null })).toEqual({ percent: 50, yes: 1, answered: 2 }))
})

describe('overallMatch', () => {
  const k75 = { percent: 75, yes: 3, answered: 4 }
  it('mockup example: S 64, K 75, T 71% -> 72', () => expect(overallMatch({ percent: 64, provisional: false }, k75, 71).percent).toBe(72))
  it('no AI data -> Overall = Skill Match, flagged', () => expect(overallMatch({ percent: 41, provisional: false }, k75, null)).toMatchObject({ percent: 41, noAiData: true, touch: null }))
  it('a non-number touch counts as no AI data', () => {
    expect(overallMatch({ percent: 41, provisional: false }, k75, undefined).noAiData).toBe(true)
    expect(overallMatch({ percent: 41, provisional: false }, k75, NaN).noAiData).toBe(true)
  })
  it('T = 0 -> S, T = 100 -> K', () => {
    expect(overallMatch({ percent: 30, provisional: false }, k75, 0).percent).toBe(30)
    expect(overallMatch({ percent: 30, provisional: false }, k75, 100).percent).toBe(75)
  })
  it('keeps touch as touchPct / 100 with skill and knowHow percents', () =>
    expect(overallMatch({ percent: 64, provisional: false }, k75, 71)).toMatchObject({ skill: 64, knowHow: 75, touch: 0.71, noAiData: false, provisional: false }))
  it('clamps to 0-100', () => {
    expect(overallMatch({ percent: 100, provisional: false }, k75, 150).percent).toBeLessThanOrEqual(100)
    expect(overallMatch({ percent: 0, provisional: false }, { percent: 0, yes: 0, answered: 4 }, -20).percent).toBeGreaterThanOrEqual(0)
  })
  it('no Skill Match or no know-how -> none', () => {
    expect(overallMatch(null, k75, 50)).toBeNull()
    expect(overallMatch({ percent: 50, provisional: false }, null, 50)).toBeNull()
  })
  it('carries provisional', () => expect(overallMatch({ percent: 50, provisional: true }, k75, 50).provisional).toBe(true))
  it('has no forbidden keys', () => expect(JSON.stringify(overallMatch({ percent: 50, provisional: false }, k75, 50))).not.toMatch(/"[^"]*(score|weight|rank|opportunit)[^"]*":/i))
})

describe('sortValue', () => {
  it('prefers Overall, then Skill Match, then -1', () => {
    expect(sortValue({ overallMatch: { rapid: { percent: 60 } }, skillMatch: { percent: 20 } }, 'rapid')).toBe(60)
    expect(sortValue({ overallMatch: { rapid: null }, skillMatch: { percent: 20 } }, 'rapid')).toBe(20)
    expect(sortValue({}, 'rapid')).toBe(-1)
  })
})
