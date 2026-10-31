import { describe, expect, it } from 'vitest'
import { stateField } from '../public/js/components/fields.js'
import { pickerList, searchPicker } from '../public/js/components/searchPicker.js'
import form, { SECTION_FIELDS } from '../public/js/screens/form.js'
import { DECLINED, emptyProfile, makeSkill, val } from '../shared/profileSchema.js'
import { declineUnanswered, isUntouched, setField } from '../shared/profileState.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)

describe('"Prefer not to say" is the default answer, not a checkbox', () => {
  it('a choice field starts on "Prefer not to say" and has no checkbox', () => {
    const html = stateField({ t, profile: emptyProfile(), path: 'employment.status', label: 'Status', options: [['employed', 'optEmployed']] })
    expect(html).not.toContain('type="checkbox"')
    expect(html).toMatch(/<option value="" selected>preferNot<\/option>/)
  })

  it('a chosen value is selected instead', () => {
    const profile = setField(emptyProfile(), 'employment.status', val('employed'))
    const html = stateField({ t, profile, path: 'employment.status', label: 'Status', options: [['employed', 'optEmployed']] })
    expect(html).toMatch(/<option value="employed" selected>/)
    expect(html).not.toMatch(/<option value="" selected>/)
  })

  it('a typed field asks first, and shows the box only when the user answers', () => {
    const declined = stateField({ t, profile: setField(emptyProfile(), 'preferences.preferredWorkLocation', DECLINED), path: 'preferences.preferredWorkLocation', label: 'Where' })
    expect(declined).toContain('data-choice="preferences.preferredWorkLocation"')
    expect(declined).not.toContain('data-field=')
    const answering = stateField({ t, profile: emptyProfile(), path: 'preferences.preferredWorkLocation', label: 'Where', answering: true })
    expect(answering).toContain('data-field="preferences.preferredWorkLocation"')
    const answered = stateField({ t, profile: setField(emptyProfile(), 'preferences.preferredWorkLocation', val('Penang')), path: 'preferences.preferredWorkLocation', label: 'Where' })
    expect(answered).toContain('value="Penang"')
  })

  it('opening a section saves its unanswered fields as "prefer not to say"; answers stay', () => {
    const profile = setField(emptyProfile(), 'employment.status', val('employed'))
    const out = declineUnanswered(profile, ['employment.status', 'employment.yearsOfExperience'])
    expect(out.employment.status).toEqual(val('employed'))
    expect(out.employment.yearsOfExperience).toEqual(DECLINED)
    expect(out.userCategory).toEqual({ state: 'empty' })
    expect(profile.employment.yearsOfExperience).toEqual({ state: 'empty' })
  })

  it('a profile with only default answers still counts as untouched', () => {
    expect(isUntouched(declineUnanswered(emptyProfile(), SECTION_FIELDS.flat()))).toBe(true)
  })
})

describe('search pickers', () => {
  it('renders a search box and the choices found', () => {
    const html = searchPicker({ t, kind: 'skill', key: 'skill', label: 'Skills', placeholder: 'Search', value: 'pyth', list: '<button>x</button>' })
    expect(html).toContain('data-search="skill|skill"')
    expect(html).toContain('id="pick-skill"')
    expect(html).toContain('value="pyth"')
  })

  it('lists skills with a way to keep the wording as typed', () => {
    const html = pickerList({ t, kind: 'skill', key: 'skill', term: 'Pythn', result: { source: 'onet', version: '31.0', candidates: [{ id: 'onet:tech:python', name: 'Python', category: 'Dev' }] } })
    expect(html).toContain('data-act="pick" data-arg="skill|0"')
    expect(html).toContain('Python')
    expect(html).toContain('data-act="pickTyped" data-arg="skill"')
  })

  it('lists fields of study with the programme that matched', () => {
    const result = { source: 'isced', version: 'ISCED-F 2013', candidates: [{ code: '0613', title: 'Software and applications development and analysis', broadTitle: 'ICTs', via: 'programme', programme: 'Computer science' }] }
    const html = pickerList({ t, kind: 'field', key: 'field|0', term: 'computer science', result })
    expect(html).toContain('0613')
    expect(html).toContain('fieldViaProgramme:{&quot;name&quot;:&quot;Computer science&quot;}')
  })

  it('says when nothing was found, and when the search failed', () => {
    expect(pickerList({ t, kind: 'field', key: 'field|0', term: 'zzz', result: { candidates: [] } })).toContain('pickNone')
    expect(pickerList({ t, kind: 'field', key: 'field|0', term: 'zzz', result: { failed: true, candidates: [] } })).toContain('pickFailed')
  })
})

describe('form sections', () => {
  const state = (section, profile) => ({ section, profile, occ: {}, pick: {} })

  it('the skill level starts on "Not assessed yet"', () => {
    const profile = { ...emptyProfile(), skills: [makeSkill({ name: 'Python', canonicalId: 'onet:tech:python', source: 'user_input' })] }
    expect(form({ t, state: state(2, profile) })).toMatch(/<option value="" selected>levelNone<\/option>/)
  })

  it('skills use a search picker; field of study is a dropdown', () => {
    const profile = { ...emptyProfile(), education: { ...emptyProfile().education, records: [{ level: 'bachelor', qualification: 'Degree', fieldOfStudy: 'Nursing', institution: '', year: '' }] } }
    const fields = { version: 'ISCED-F 2013', fields: [{ code: '0913', title: 'Nursing and midwifery', broadCode: '09', broadTitle: 'Health and welfare' }] }
    expect(form({ t, state: { ...state(0, profile), fields } })).toContain('data-field-pick="0"')
    expect(form({ t, state: { ...state(0, profile), fields } })).not.toContain('data-search="field|')
    expect(form({ t, state: state(2, profile) })).toContain('data-search="skill|skill"')
  })

  it('a field of study typed or read from a CV shows the words until a standard field is chosen', () => {
    const profile = { ...emptyProfile(), education: { ...emptyProfile().education, records: [{ level: 'bachelor', qualification: 'Degree', fieldOfStudy: 'Nursing', institution: '', year: '' }] } }
    const fields = { version: 'ISCED-F 2013', fields: [{ code: '0913', title: 'Nursing and midwifery', broadCode: '09', broadTitle: 'Health and welfare' }] }
    expect(form({ t, state: { ...state(0, profile), fields } })).toContain('asWritten:{&quot;text&quot;:&quot;Nursing&quot;}')
    const linked = structuredClone(profile)
    linked.education.records[0].field = { source: 'isced', code: '0913', title: 'Nursing and midwifery', version: 'ISCED-F 2013' }
    linked.education.records[0].fieldOfStudy = 'Nursing and midwifery'
    const html = form({ t, state: { ...state(0, linked), fields } })
    expect(html).toContain('<option value="0913" selected>')
    expect(html).not.toContain('asWritten')
  })
})
