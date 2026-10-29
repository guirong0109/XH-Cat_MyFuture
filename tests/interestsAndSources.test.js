import { describe, expect, it } from 'vitest'
import form from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { pickerList } from '../public/js/components/searchPicker.js'
import { fieldSuggestions } from '../public/js/components/fieldSuggestions.js'
import { emptyProfile, makeSkill, validateProfile } from '../shared/profileSchema.js'
import { mergeCareerFields } from '../shared/profileState.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const AREAS = { source: 'onet', version: '31.0', areas: [{ id: 'onet:ia:1.B.3.aa', name: 'Health Care Service' }, { id: 'onet:ia:1.B.3.q', name: 'Information Technology' }] }
const it_ = { source: 'onet', id: 'onet:ia:1.B.3.q', name: 'Information Technology', version: '31.0' }
const prefs = (profile, extra = {}) => form({ t, state: { section: 4, profile, occ: {}, pick: {}, interests: AREAS, ...extra } })

describe('career interests and fields: one list from O*NET interest areas', () => {
  it('the profile has one list; "preferred career fields" is gone', () => {
    const profile = emptyProfile()
    expect(profile.preferences.careerInterests).toEqual([])
    expect('preferredCareerFields' in profile.preferences).toBe(false)
    expect(validateProfile(profile).ok).toBe(true)
  })

  it('older saved profiles keep what was typed in either box, once', () => {
    const old = emptyProfile()
    old.preferences.careerInterests = ['Data', 'Health']
    old.preferences.preferredCareerFields = ['Health', 'Finance']
    const out = mergeCareerFields(old)
    expect(out.preferences.careerInterests).toEqual(['Data', 'Health', 'Finance'])
    expect('preferredCareerFields' in out.preferences).toBe(false)
    expect(old.preferences.preferredCareerFields).toEqual(['Health', 'Finance'])
    expect(mergeCareerFields(emptyProfile())).toEqual(emptyProfile())
  })

  it('shows a dropdown of the areas not chosen yet, and "Prefer not to say" while none is chosen', () => {
    const html = prefs(emptyProfile())
    expect(html).toContain('data-interest')
    expect(html).toContain('<option value="onet:ia:1.B.3.q">Information Technology</option>')
    expect(html).toContain('<div class="tiny muted">preferNot</div>')
    expect(html).not.toContain('fFields')
  })

  it('chosen areas are chips with × to remove, and leave the dropdown', () => {
    const profile = emptyProfile()
    profile.preferences.careerInterests = [it_, 'Robotics']
    const html = prefs(profile)
    expect(html).toContain('data-act="interestRemove" data-arg="0"')
    expect(html).toContain('Robotics')
    expect(html).not.toContain('<option value="onet:ia:1.B.3.q">')
    expect(html).not.toContain('<div class="tiny muted">preferNot</div>')
  })

  it('names its source', () => {
    expect(prefs(emptyProfile())).toContain('interestSource:{&quot;version&quot;:&quot;31.0&quot;}')
  })

  it('the review lists the chosen areas by name', () => {
    const profile = emptyProfile()
    profile.preferences.careerInterests = [it_, 'Robotics']
    expect(profileTable(t, profile)).toContain('Information Technology, Robotics')
  })
})

describe('every suggestion and list says where it comes from', () => {
  const nursing = { source: 'isced', code: '0913', title: 'Nursing and midwifery', version: 'ISCED-F 2013' }
  const profile = emptyProfile()
  profile.education.records = [{ qualification: '', fieldOfStudy: 'Nursing and midwifery', institution: '', year: '', field: nursing }]
  const answer = { field: { code: '0913', title: 'Nursing and midwifery' }, jobs: 26, isced: 'ISCED-F 2013', onet: '31.0', suggestions: [{ id: 'onet:tech:x', name: 'X', category: 'S', kind: 'software', inField: 3, fieldJobs: 26, allCount: 5, allJobs: 1016 }] }

  it('the field-of-study suggestions name O*NET and the bridge tables', () => {
    expect(fieldSuggestions({ t, profile, state: { suggest: { '0913': answer } } })).toContain('suggestSource:{&quot;onet&quot;:&quot;31.0&quot;,&quot;isced&quot;:&quot;ISCED-F 2013&quot;}')
  })

  it('a suggested skill in the list names its source', () => {
    const skill = { ...makeSkill({ name: 'X', canonicalId: 'onet:tech:x', source: 'user_input' }), suggestedFrom: { source: 'isced', code: '0913', title: 'Nursing and midwifery', version: 'ISCED-F 2013', onetVersion: '31.0' } }
    const html = form({ t, state: { section: 2, profile: { ...profile, skills: [skill] }, occ: {}, pick: {} } })
    expect(html).toContain('suggestFrom:{&quot;field&quot;:&quot;Nursing and midwifery&quot;,&quot;source&quot;:&quot;O*NET 31.0&quot;}')
  })

  it('the skill and field-of-study search lists name their sources', () => {
    expect(pickerList({ t, kind: 'skill', key: 'skill', term: 'py', result: { version: '31.0', candidates: [] } })).toContain('skillSource:{&quot;version&quot;:&quot;31.0&quot;}')
    expect(pickerList({ t, kind: 'field', key: 'field|0', term: 'nu', result: { version: 'ISCED-F 2013', candidates: [] } })).toContain('fieldSource')
  })
})
