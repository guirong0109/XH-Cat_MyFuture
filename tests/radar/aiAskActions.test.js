// The question card's actions (D35, D36, D38, D39): tick, none, Continue, Skip and Change, as one pure step so they
// are tested without the page. Saving never turns a confirmed profile back into a draft (Review Focus 1).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aiAskStep, answered } from '../../shared/aiTasks.js'
import { emptyProfile, validateProfile } from '../../shared/profileSchema.js'
import { aiAskFocus } from '../../public/js/screens/radar.js'

const D = '2026-10-31'
const confirmed = (extra = {}) => ({ ...emptyProfile(), profileStatus: 'confirmed', ...extra })

describe('aiAskStep', () => {
  it('Continue saves the ticks and keeps the profile confirmed', () => {
    const out = aiAskStep({ profile: confirmed(), aiAsk: { picked: ['data'], none: false } }, 'continue', null, D)
    expect(out.profile.aiTasks).toEqual({ status: 'answered', picked: ['data'], date: D })
    expect(out.profile.profileStatus).toBe('confirmed')
    expect(out.aiAsk).toBeNull()
    expect(validateProfile(out.profile).ok).toBe(true)
  })

  it('Continue with "none of these" saves an empty list', () => {
    const out = aiAskStep({ profile: confirmed(), aiAsk: { picked: [], none: true } }, 'continue', null, D)
    expect(out.profile.aiTasks).toEqual({ status: 'answered', picked: [], date: D })
  })

  it('Continue with nothing ticked changes nothing', () => {
    const state = { profile: confirmed(), aiAsk: { picked: [], none: false } }
    expect(aiAskStep(state, 'continue', null, D)).toEqual(state)
    expect(aiAskStep({ profile: confirmed(), aiAsk: null }, 'continue', null, D).profile.aiTasks).toBeUndefined()
  })

  it('Skip saves "skipped" and keeps the profile confirmed', () => {
    const out = aiAskStep({ profile: confirmed(), aiAsk: null }, 'skip', null, D)
    expect(out.profile.aiTasks).toEqual({ status: 'skipped', date: D })
    expect(out.profile.profileStatus).toBe('confirmed')
    expect(out.aiAsk).toBeNull()
  })

  it('Skip on a reopened card keeps the earlier answer, even with unsaved ticks (Review Focus 2)', () => {
    const earlier = answered(['writing'], '2026-10-30')
    const out = aiAskStep({ profile: confirmed({ aiTasks: earlier }), aiAsk: { picked: ['data'], none: false, open: true } }, 'skip', null, D)
    expect(out.profile.aiTasks).toEqual(earlier)
    expect(out.aiAsk).toBeNull()
  })

  it('a tick clears "none"; "none" clears the ticks; the profile is not touched', () => {
    const p = confirmed()
    const a = aiAskStep({ profile: p, aiAsk: { picked: [], none: true } }, 'pick', 'writing', D)
    expect(a.aiAsk).toMatchObject({ picked: ['writing'], none: false })
    expect(a.profile).toBe(p)
    const b = aiAskStep({ profile: p, aiAsk: { picked: ['writing', 'data'], none: false } }, 'none', null, D)
    expect(b.aiAsk).toMatchObject({ picked: [], none: true })
    const c = aiAskStep({ profile: p, aiAsk: { picked: [], none: true } }, 'none', null, D)
    expect(c.aiAsk).toMatchObject({ picked: [], none: false })
  })

  it('the first tick on a reopened card starts from the saved answer', () => {
    const out = aiAskStep({ profile: confirmed({ aiTasks: answered(['writing'], D) }), aiAsk: { open: true } }, 'pick', 'data', D)
    expect(out.aiAsk).toEqual({ picked: ['writing', 'data'], none: false, open: true })
  })

  it('Change opens the card with the saved ticks', () => {
    expect(aiAskStep({ profile: confirmed({ aiTasks: answered(['writing', 'data'], D) }), aiAsk: null }, 'open', null, D).aiAsk)
      .toEqual({ picked: ['writing', 'data'], none: false, open: true })
    expect(aiAskStep({ profile: confirmed({ aiTasks: answered([], D) }), aiAsk: null }, 'open', null, D).aiAsk)
      .toEqual({ picked: [], none: true, open: true })
    expect(aiAskStep({ profile: confirmed({ aiTasks: { status: 'skipped', date: D } }), aiAsk: null }, 'open', null, D).aiAsk)
      .toEqual({ picked: [], none: false, open: true })
  })

  it('no profile: nothing changes', () => {
    const state = { profile: null, aiAsk: null }
    for (const act of ['pick', 'none', 'continue', 'skip', 'open']) expect(aiAskStep(state, act, 'data', D)).toEqual(state)
  })

  it('the app saves the answers without update() (which would make the profile a draft again)', () => {
    const src = readFileSync('public/js/app.js', 'utf8')
    const start = src.indexOf('aiAskPick:')
    const end = src.indexOf('aiAskOpen:')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = src.slice(start, src.indexOf('\n', end))
    for (const act of ['aiAskPick', 'aiAskNone', 'aiAskContinue', 'aiAskSkip', 'aiAskOpen']) expect(block).toContain(`${act}:`)
    const fn = src.slice(src.indexOf('function aiAsk('))
    expect(fn.slice(0, fn.search(/\r?\n\}\r?\n/))).not.toMatch(/\bupdate\(/)
    expect(block).not.toMatch(/\bupdate\(/)
  })
})

describe('keyboard focus after a card action (final review)', () => {
  it('a tick or "none" keeps the focus on the same box; Change goes to the first box; Continue and Skip go to the Change button', () => {
    expect(aiAskFocus('pick', 'data')).toBe('[data-act="aiAskPick"][data-arg="data"]')
    expect(aiAskFocus('none')).toBe('[data-act="aiAskNone"]')
    expect(aiAskFocus('open')).toBe('[data-act="aiAskPick"]')
    expect(aiAskFocus('continue')).toBe('[data-act="aiAskOpen"]')
    expect(aiAskFocus('skip')).toBe('[data-act="aiAskOpen"]')
    // an id that is not a category never becomes part of a selector
    expect(aiAskFocus('pick', '"]x')).toBeNull()
  })

  it('the app puts the focus back after each card action', () => {
    const src = readFileSync('public/js/app.js', 'utf8')
    const fn = src.slice(src.indexOf('function aiAsk('))
    expect(fn.slice(0, fn.search(/\r?\n\}\r?\n/))).toMatch(/aiAskFocus\(act, arg\)[\s\S]*\.focus\(\)/)
  })

  it('a focused scatter dot is visible (outline and a thicker ring)', () => {
    const css = readFileSync('public/styles.css', 'utf8')
    expect(css).toMatch(/\.rd-scatter \[role=button\]:focus-visible circle\{[^}]*stroke:var\(--ink\)/)
    expect(css).toMatch(/\.rd-scatter \[role=button\]\{cursor:pointer/)
  })
})
