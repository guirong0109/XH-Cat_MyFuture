import { describe, expect, it } from 'vitest'
import goal, { GOALS } from '../public/js/screens/goal.js'
import form from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { accountBox } from '../public/js/components/accountBox.js'
import { emptyProfile, val } from '../shared/profileSchema.js'
import { setField } from '../shared/profileState.js'
import { t as translate } from '../shared/i18n.js'

const t = (key) => key
const withGoal = (value) => setField(emptyProfile(), 'preferences.careerGoal', val(value))

describe('the goal question, after guest or account', () => {
  it('offers four goals: Where I stand, Find a direction, Switch career, Grow in my field', () => {
    expect(GOALS.map(([value]) => value)).toEqual(['where_i_stand', 'find_direction', 'switch_career', 'grow_field'])
    const html = goal({ t, state: {} })
    expect([...html.matchAll(/data-act="goal" data-arg="(\w+)"/g)].map(([, v]) => v)).toEqual(GOALS.map(([value]) => value))
    expect(translate('en', 'goalStand')).toBe('Where I stand')
    expect(translate('en', 'goalDirection')).toBe('Find a direction')
    expect(translate('en', 'goalSwitch')).toBe('Switch career')
    expect(translate('en', 'goalGrow')).toBe('Grow in my field')
    for (const lang of ['en', 'ms', 'zh']) {
      const page = goal({ t: (key) => translate(lang, key), state: {} })
      for (const [, label, text] of GOALS) {
        expect(page).toContain(translate(lang, label))
        expect(page).toContain(translate(lang, text))
      }
    }
  })

  it('marks the goal already chosen', () => {
    expect(goal({ t, state: { profile: withGoal('switch_career') } })).toMatch(/class="choice sel" data-act="goal" data-arg="switch_career"/)
  })

  it('a signed-in personal user continues to the goal; an organisation to "Who are you?"', () => {
    const account = { status: 'in', user: { email: 'test@example.com' } }
    expect(accountBox({ t, state: { use: 'personal', account } })).toContain('data-go="goal"')
    expect(accountBox({ t, state: { use: 'org', account } })).toContain('data-go="category"')
  })
})

describe('the same four goals in the form and on the receipt', () => {
  const prefs = (profile) => form({ t, state: { section: 3, profile, occ: {}, pick: {}, interests: { areas: [], version: '31.0' } } })

  it('the form\'s career goal offers the four goals, with the answer from the start selected', () => {
    const html = prefs(withGoal('grow_field'))
    for (const [value] of GOALS) expect(html).toContain(`value="${value}"`)
    expect(html).toContain('<option value="grow_field" selected>')
    expect(html).not.toContain('value="first_job"')
  })

  it('a profile saved with an old goal still shows it, in the form and on the receipt', () => {
    expect(prefs(withGoal('first_job'))).toContain('<option value="first_job" selected>optFirstJob</option>')
    expect(profileTable(t, withGoal('first_job'))).toContain('optFirstJob')
    expect(profileTable(t, withGoal('switch_career'))).toContain('goalSwitch')
  })
})
