// "Which of these do you use AI for?" (spec 2026-10-31-radar-ai-usage-questions, D34, D35, D38): the owner's 10
// categories, the tick rules and the stored shape.
import { describe, expect, it } from 'vitest'
import { AI_TASK_IDS, afterSkip, answered, canContinue, needsAsking, skipped, togglePick } from '../shared/aiTasks.js'

const D = '2026-10-31'

describe('AI task categories (D34)', () => {
  it('has the ten owner categories in order', () => {
    expect(AI_TASK_IDS).toEqual(['writing', 'learning', 'programming', 'data', 'creative', 'communication', 'planning', 'admin', 'customer', 'automation'])
    expect(Object.isFrozen(AI_TASK_IDS)).toBe(true)
  })
})

describe('tick rules (D35)', () => {
  it('togglePick adds in list order, removes a ticked one and ignores an unknown id', () => {
    expect(togglePick(['data'], 'writing')).toEqual(['writing', 'data'])
    expect(togglePick(['writing', 'data'], 'writing')).toEqual(['data'])
    expect(togglePick([], 'nope')).toEqual([])
    const before = ['data']
    togglePick(before, 'writing')
    expect(before).toEqual(['data'])
  })

  it('Continue needs at least one tick or "none of these"', () => {
    expect(canContinue({ picked: [], none: false })).toBe(false)
    expect(canContinue({ picked: [], none: true })).toBe(true)
    expect(canContinue({ picked: ['data'], none: false })).toBe(true)
    expect(canContinue(undefined)).toBe(false)
  })
})

describe('stored shape (D36, D38)', () => {
  it('answered keeps list order and drops duplicates', () => {
    expect(answered(['data', 'writing', 'data'], D)).toEqual({ status: 'answered', picked: ['writing', 'data'], date: D })
    expect(answered([], D)).toEqual({ status: 'answered', picked: [], date: D })
  })

  it('skipped', () => expect(skipped(D)).toEqual({ status: 'skipped', date: D }))

  it('Skip on a reopened card keeps an earlier answer (Review Focus 2)', () => {
    const earlier = answered(['data'], '2026-10-30')
    expect(afterSkip(earlier, D)).toBe(earlier)
    expect(afterSkip(undefined, D)).toEqual(skipped(D))
    expect(afterSkip(skipped('2026-10-30'), D)).toEqual(skipped(D))
  })

  it('needsAsking: only a profile with no answer yet (Review Focus 4)', () => {
    expect(needsAsking({})).toBe(true)
    expect(needsAsking({ aiTasks: null })).toBe(true)
    expect(needsAsking({ aiTasks: skipped(D) })).toBe(false)
    expect(needsAsking({ aiTasks: answered(['data'], D) })).toBe(false)
    expect(needsAsking(null)).toBe(false)
    expect(needsAsking(undefined)).toBe(false)
  })
})
