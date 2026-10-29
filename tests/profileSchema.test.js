import { describe, expect, it } from 'vitest'
import { DECLINED, EMPTY, emptyProfile, hasUsableSkill, makeSkill, val, validateProfile } from '../shared/profileSchema.js'

const base = () => emptyProfile({ inputMethod: 'manual', interfaceLanguage: 'en' })

describe('profile schema', () => {
  it('emptyProfile passes validation', () => {
    const p = base()
    expect(p.profileStatus).toBe('draft')
    expect(p.assessment).toEqual({ status: 'incomplete', completedAt: null })
    expect(p.employment.yearsOfExperience).toEqual(EMPTY)
    expect(validateProfile(p)).toEqual({ ok: true, errors: [] })
  })

  it('empty, declined and value are distinct and all valid', () => {
    expect(EMPTY).not.toEqual(DECLINED)
    for (const state of [EMPTY, DECLINED, val('employed')]) {
      const p = base()
      p.employment.status = state
      expect(validateProfile(p).ok).toBe(true)
    }
    const bad = base()
    bad.employment.status = { state: 'maybe' }
    expect(validateProfile(bad).errors).toContainEqual({ path: 'employment.status', code: 'bad_state' })
  })

  it('rejects a numeric string for yearsOfExperience', () => {
    const p = base()
    p.employment.yearsOfExperience = val('3')
    expect(validateProfile(p).errors).toContainEqual({ path: 'employment.yearsOfExperience', code: 'bad_type' })
  })

  it('rejects an unknown user category', () => {
    const p = base()
    p.userCategory = val('manager')
    expect(validateProfile(p).errors).toContainEqual({ path: 'userCategory', code: 'bad_enum' })
    p.userCategory = val('graduate_switcher')
    expect(validateProfile(p).ok).toBe(true)
  })

  it('rejects a level on an unconfirmed CV skill', () => {
    const p = base()
    p.skills = [{ ...makeSkill({ name: 'Python', source: 'cv_rules' }), proficiency: 'expert' }]
    expect(validateProfile(p).errors).toContainEqual({ path: 'skills.0.proficiency', code: 'cv_set_proficiency' })
  })

  it('rejects an unknown level, source or proficiency status', () => {
    const p = base()
    p.skills = [{ ...makeSkill({ name: 'SQL', source: 'user_input' }), proficiency: 'strong', source: 'guess', proficiencyStatus: 'sure' }]
    const { errors } = validateProfile(p)
    expect(errors).toContainEqual({ path: 'skills.0.proficiency', code: 'bad_enum' })
    expect(errors).toContainEqual({ path: 'skills.0.source', code: 'bad_enum' })
    expect(errors).toContainEqual({ path: 'skills.0.proficiencyStatus', code: 'bad_enum' })
  })

  it('rejects any forbidden field at any depth', () => {
    const p = base()
    p.gender = 'female'
    p.education.records = [{ qualification: 'Diploma', age: 21 }]
    const { errors } = validateProfile(p)
    expect(errors).toContainEqual({ path: 'gender', code: 'forbidden_field' })
    expect(errors).toContainEqual({ path: 'education.records.0.age', code: 'forbidden_field' })
  })

  it('rejects a list that is not an array', () => {
    const p = base()
    p.skills = 'Python, SQL'
    expect(validateProfile(p).errors).toContainEqual({ path: 'skills', code: 'bad_type' })
  })

  it('makeSkill from user_input is confirmed, from the CV is not', () => {
    expect(makeSkill({ name: 'SQL', source: 'user_input' })).toMatchObject({
      name: 'SQL', originalText: 'SQL', canonicalId: null, userConfirmed: true, proficiency: null, proficiencyStatus: 'not_assessed', extraction: null,
    })
    expect(makeSkill({ name: 'SQL', source: 'cv_rules' }).userConfirmed).toBe(false)
  })

  it('hasUsableSkill needs one skill with an id', () => {
    const p = base()
    p.skills = [makeSkill({ name: 'Basket weaving', source: 'user_input' })]
    expect(hasUsableSkill(p)).toBe(false)
    p.skills.push(makeSkill({ name: 'Python', canonicalId: 'onet:tech:python', source: 'user_input' }))
    expect(hasUsableSkill(p)).toBe(true)
  })
})
