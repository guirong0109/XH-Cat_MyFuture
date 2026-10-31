import { describe, expect, it } from 'vitest'
import category from '../public/js/screens/category.js'
import form, { SECTION_FIELDS, WHO } from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { DECLINED, emptyProfile, val, validateProfile } from '../shared/profileSchema.js'
import { setField } from '../shared/profileState.js'
import { t as translate } from '../shared/i18n.js'

const t = (key) => key
const choices = (html) => [...html.matchAll(/data-act="category" data-arg="(\w+)"/g)].map(([, k]) => k)
const asUser = (value) => setField(emptyProfile(), 'userCategory', value === null ? DECLINED : val(value))
const study = (profile, lang) => form({ t: lang ? (key) => translate(lang, key) : t, state: { section: 0, profile, occ: {}, pick: {} } })
const picked = (html) => [...html.matchAll(/data-act="choose" data-arg="userCategory\|(\w+)"/g)].map(([, v]) => v)

describe('the start no longer asks personal users who they are', () => {
  it('"Who are you?" is only for organisations now: C and D', () => {
    for (const use of ['org', 'personal', undefined]) expect(choices(category({ t, state: { use } }))).toEqual(['C', 'D'])
  })
})

describe('the profile opens with "Which describes you best?" as four buttons', () => {
  it('Student, Fresh graduate, Underemployed, Unemployed, in this order, as buttons, not a dropdown', () => {
    expect(WHO.map(([value]) => value)).toEqual(['student', 'fresh_graduate', 'underemployed', 'unemployed'])
    expect(WHO.map(([, label]) => translate('en', label))).toEqual(['Student', 'Fresh graduate', 'Underemployed', 'Unemployed'])
    const html = study(asUser(null))
    expect(picked(html)).toEqual(['student', 'fresh_graduate', 'underemployed', 'unemployed'])
    expect(html).not.toContain('id="f-userCategory"')
    expect(html.indexOf('fCategory')).toBeLessThan(html.indexOf('addEducation'))
    expect(html).toContain('<div class="options" role="radiogroup"')
    expect(html).not.toContain('class="grid g2" role="radiogroup"')
    for (const lang of ['en', 'ms', 'zh']) {
      const page = study(asUser(null), lang)
      for (const [, label, text] of WHO) {
        expect(page).toContain(translate(lang, label))
        expect(page).toContain(translate(lang, text))
      }
    }
  })

  it('"Prefer not to say" stays the default and can be chosen again', () => {
    const html = study(asUser(null))
    expect(html).toMatch(/<button class="chip on"[^>]*data-act="choose" data-arg="userCategory\|">preferNot<\/button>/)
    expect(html).not.toMatch(/class="option sel"/)
  })

  it('the chosen answer is marked, and "Prefer not to say" is off', () => {
    const html = study(asUser('underemployed'))
    expect(html).toMatch(/class="option sel" role="radio" aria-checked="true" title="catUnderText" data-act="choose" data-arg="userCategory\|underemployed"/)
    expect(html).toMatch(/<button class="chip"[^>]*data-arg="userCategory\|">/)
  })

  it('a profile saved with an old answer still shows it as a fifth button', () => {
    const html = study(asUser('working_adult'))
    expect(picked(html)).toEqual(['student', 'fresh_graduate', 'underemployed', 'unemployed', 'working_adult'])
    expect(html).toContain('optWorking')
  })
})

describe('the answer is saved in the profile', () => {
  it('the profile accepts the four values and still the two old ones', () => {
    for (const value of ['student', 'fresh_graduate', 'underemployed', 'unemployed', 'working_adult', 'graduate_switcher']) {
      expect(validateProfile(asUser(value)).errors.filter((e) => e.path === 'userCategory')).toEqual([])
    }
    expect(validateProfile(asUser('manager')).errors).toContainEqual({ path: 'userCategory', code: 'bad_enum' })
  })

  it('the receipt names the answer', () => {
    expect(profileTable(t, asUser('student'))).toContain('catStudent')
    expect(profileTable(t, asUser('graduate_switcher'))).toContain('optGraduate')
  })
})

describe('the buttons are small and sit in one row', () => {
  it('small buttons with a radio dot, side by side (wrapping only when the screen is too narrow)', async () => {
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/^\.options\{display:flex;flex-wrap:wrap/m)
    expect(css).toMatch(/^\.option\{[^}]*flex:1 1 0;min-width:max-content;padding:10px 16px/m)
    expect(css).toMatch(/^\.option::before\{[^}]*border-radius:50%/m)
  })
})

describe('no "Current education status" question', () => {
  it('the form does not ask it, and opening the section does not answer it for the user', () => {
    const html = study(asUser(null))
    expect(html).not.toContain('fEduStatus')
    expect(html).not.toContain('education.educationStatus')
    expect(SECTION_FIELDS.flat()).not.toContain('education.educationStatus')
  })

  it('the receipt leaves it out, unless a profile saved earlier has an answer', () => {
    expect(profileTable(t, emptyProfile())).not.toContain('fEduStatus')
    const old = setField(emptyProfile(), 'education.educationStatus', val('graduated'))
    expect(profileTable(t, old)).toContain('fEduStatus')
    expect(profileTable(t, old)).toContain('optGraduated')
  })
})
