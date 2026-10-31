import { describe, expect, it } from 'vitest'
import form, { QUALIFICATIONS, SECTION_FIELDS } from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile, val } from '../shared/profileSchema.js'
import { setField } from '../shared/profileState.js'
import { t as translate } from '../shared/i18n.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const q = (text) => text.replace(/"/g, '&quot;')
const FIELDS = {
  source: 'isced', version: 'ISCED-F 2013',
  fields: [
    { code: '0411', title: 'Accounting and taxation', broadCode: '04', broadTitle: 'Business, administration and law' },
    { code: '0912', title: 'Medicine', broadCode: '09', broadTitle: 'Health and welfare' },
    { code: '0913', title: 'Nursing and midwifery', broadCode: '09', broadTitle: 'Health and welfare' },
  ],
}
const withRecords = (records) => ({ ...emptyProfile(), education: { ...emptyProfile().education, records } })
const study = (profile, fields = FIELDS) => form({ t, state: { section: 0, profile, occ: {}, pick: {}, fields } })
const blank = { level: '', qualification: '', fieldOfStudy: '', institution: '', year: '' }

describe('qualifications: "+ Add a qualification", then the qualification and the field of study (major)', () => {
  it('no Highest qualification question or line; nothing shows until the user adds a qualification', () => {
    const html = study(emptyProfile())
    expect(html).not.toContain('id="f-education-highestQualification"')
    expect(html).not.toContain('highestAuto')
    expect(html).not.toContain('data-rec="education.records|0|level"')
    expect(html).toContain('data-act="addRec" data-arg="education.records"')
    expect(SECTION_FIELDS[0]).not.toContain('education.highestQualification')
  })

  it('an added qualification shows the level and the field of study (major), nothing else', () => {
    const html = study(withRecords([blank]))
    expect(html).toContain('data-rec="education.records|0|level"')
    expect(html).toContain('data-field-pick="0"')
    expect(html).not.toContain('data-rec="education.records|0|institution"')
    expect(html).not.toContain('data-rec="education.records|0|year"')
    expect(QUALIFICATIONS.map(([value]) => value)).toEqual(['spm', 'stpm', 'certificate', 'diploma', 'bachelor', 'master', 'phd'])
    for (const [value] of QUALIFICATIONS) expect(html).toContain(`<option value="${value}">`)
    expect(translate('en', 'fieldOfStudy')).toBe('Field of study (major)')
  })

  it('the field of study is a dropdown of the standard fields, grouped by broad area, with its source', () => {
    const html = study(withRecords([blank]))
    expect(html).toContain('<optgroup label="Business, administration and law"><option value="0411">Accounting and taxation</option></optgroup>')
    expect(html).toContain('<optgroup label="Health and welfare"><option value="0912">Medicine</option><option value="0913">Nursing and midwifery</option></optgroup>')
    expect(html).toContain(q('fieldListSource:{"version":"ISCED-F 2013","n":3}'))
    expect(html).not.toContain('data-search="field|')
  })

  it('a linked field is selected; while the list loads or fails, it says so', () => {
    const record = { ...blank, level: 'bachelor', fieldOfStudy: 'Nursing and midwifery', field: { source: 'isced', code: '0913', title: 'Nursing and midwifery', version: 'ISCED-F 2013' } }
    expect(study(withRecords([record]))).toContain('<option value="0913" selected>Nursing and midwifery</option>')
    expect(study(withRecords([record]), { loading: true })).toContain('occSearching')
    expect(study(withRecords([record]), { failed: true })).toContain('pickFailed')
  })

  it('words from a CV stay visible until the user picks the level and the field', () => {
    const html = study(withRecords([{ qualification: 'Bachelor of Accounting', fieldOfStudy: 'Accounting', institution: 'UM', year: '2022', extraction: { evidence: 'Bachelor of Accounting, UM' } }]))
    expect(html).toContain(q('asWritten:{"text":"Bachelor of Accounting"}'))
    expect(html).toContain(q('asWritten:{"text":"Accounting"}'))
    expect(html).not.toMatch(/<option value="bachelor" selected>/)
  })

  it('the receipt names the level and the field; Highest qualification only for a profile saved earlier with one', () => {
    const profile = withRecords([{ ...blank, level: 'bachelor', fieldOfStudy: 'Accounting and taxation', field: { code: '0411' } }])
    expect(profileTable(t, profile)).toContain('optDegree · Accounting and taxation (ISCED-F 0411)')
    expect(profileTable(t, profile)).not.toContain('fHighest')
    expect(profileTable(t, setField(profile, 'education.highestQualification', val('diploma')))).toContain('fHighest')
  })

  it('the new words exist in every language', () => {
    for (const lang of ['en', 'ms', 'zh']) for (const key of ['qualChoose', 'fieldChoose', 'asWritten', 'fieldListSource']) expect(translate(lang, key)).not.toBe(key)
  })
})
