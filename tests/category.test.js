import { describe, expect, it } from 'vitest'
import category, { PERSONAL } from '../public/js/screens/category.js'
import form from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile, val, validateProfile } from '../shared/profileSchema.js'
import { setField } from '../shared/profileState.js'
import { t as translate } from '../shared/i18n.js'

const t = (key) => key
const choices = (html) => [...html.matchAll(/data-act="category" data-arg="(\w+)"/g)].map(([, k]) => k)
const asUser = (value) => setField(emptyProfile(), 'userCategory', val(value))

describe('Who are you? for personal users: Fresh graduate, Student, Underemployed, Unemployed', () => {
  it('shows the four options, in this order, with the names in every language', () => {
    expect(PERSONAL.map(([value]) => value)).toEqual(['fresh_graduate', 'student', 'underemployed', 'unemployed'])
    expect(choices(category({ t, state: { use: 'personal' } }))).toEqual(['fresh_graduate', 'student', 'underemployed', 'unemployed'])
    expect(PERSONAL.map(([, label]) => translate('en', label))).toEqual(['Fresh graduate', 'Student', 'Underemployed', 'Unemployed'])
    for (const lang of ['en', 'ms', 'zh']) {
      const html = category({ t: (key) => translate(lang, key), state: { use: 'personal' } })
      for (const [, label, text] of PERSONAL) {
        expect(html).toContain(translate(lang, label))
        expect(html).toContain(translate(lang, text))
      }
    }
  })

  it('organisations keep C and D; without an answer to the first question all six show', () => {
    expect(choices(category({ t, state: { use: 'org' } }))).toEqual(['C', 'D'])
    expect(choices(category({ t, state: {} }))).toEqual(['fresh_graduate', 'student', 'underemployed', 'unemployed', 'C', 'D'])
  })

  it('marks the option already chosen', () => {
    expect(category({ t, state: { use: 'personal', category: 'student' } })).toMatch(/class="choice sel\s*" data-act="category" data-arg="student"/)
  })
})

describe('the answer is the profile\'s "Which describes you best?"', () => {
  it('the profile accepts the four new values and still the two old ones', () => {
    for (const value of ['fresh_graduate', 'student', 'underemployed', 'unemployed', 'working_adult', 'graduate_switcher']) {
      expect(validateProfile(asUser(value)).errors.filter((e) => e.path === 'userCategory')).toEqual([])
    }
    expect(validateProfile(asUser('manager')).errors).toContainEqual({ path: 'userCategory', code: 'bad_enum' })
  })

  it('the form offers the four, with the answer selected; an old answer still shows', () => {
    const study = (profile) => form({ t, state: { section: 0, profile, occ: {}, pick: {} } })
    const html = study(asUser('underemployed'))
    for (const [value] of PERSONAL) expect(html).toContain(`value="${value}"`)
    expect(html).toContain('<option value="underemployed" selected>')
    expect(html).not.toContain('value="working_adult"')
    expect(study(asUser('working_adult'))).toContain('<option value="working_adult" selected>optWorking</option>')
  })

  it('the receipt names the answer', () => {
    expect(profileTable(t, asUser('student'))).toContain('catStudent')
    expect(profileTable(t, asUser('graduate_switcher'))).toContain('optGraduate')
  })
})
