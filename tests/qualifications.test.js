import { describe, expect, it } from 'vitest'
import form, { QUALIFICATIONS, SECTION_FIELDS, highestLevel } from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile } from '../shared/profileSchema.js'
import { t as translate } from '../shared/i18n.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
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

describe('one list of qualifications instead of "Highest qualification" + "Add a qualification"', () => {
  it('no separate Highest qualification question; a first qualification row is ready, starting with the level', () => {
    const html = study(emptyProfile())
    expect(html).not.toContain('id="f-education-highestQualification"')
    expect(html).toContain('data-rec="education.records|0|level"')
    expect(QUALIFICATIONS.map(([value]) => value)).toEqual(['spm', 'stpm', 'certificate', 'diploma', 'bachelor', 'master', 'phd'])
    for (const [value] of QUALIFICATIONS) expect(html).toContain(`<option value="${value}">`)
  })

  it('the field of study appears only after a level is chosen', () => {
    expect(study(emptyProfile())).not.toContain('data-field-pick=')
    expect(study(withRecords([{ level: 'bachelor', qualification: '', fieldOfStudy: '', institution: '', year: '' }]))).toContain('data-field-pick="0"')
  })

  it('the field of study is a dropdown of the standard fields, grouped by broad area, with its source', () => {
    const html = study(withRecords([{ level: 'bachelor', qualification: '', fieldOfStudy: '', institution: '', year: '' }]))
    expect(html).toContain('<optgroup label="Business, administration and law"><option value="0411">Accounting and taxation</option></optgroup>')
    expect(html).toContain('<optgroup label="Health and welfare"><option value="0912">Medicine</option><option value="0913">Nursing and midwifery</option></optgroup>')
    expect(html).toContain('fieldListSource:{&quot;version&quot;:&quot;ISCED-F 2013&quot;,&quot;n&quot;:3}')
    expect(html).not.toContain('data-search="field|')
  })

  it('a linked field is selected; while the list loads or fails, it says so', () => {
    const record = { level: 'bachelor', qualification: '', fieldOfStudy: 'Nursing and midwifery', institution: '', year: '', field: { source: 'isced', code: '0913', title: 'Nursing and midwifery', version: 'ISCED-F 2013' } }
    expect(study(withRecords([record]))).toContain('<option value="0913" selected>Nursing and midwifery</option>')
    expect(study(withRecords([record]), { loading: true })).toContain('occSearching')
    expect(study(withRecords([record]), { failed: true })).toContain('pickFailed')
  })

  it('words from a CV stay visible until the user picks the level and the field', () => {
    const html = study(withRecords([{ qualification: 'Bachelor of Accounting', fieldOfStudy: 'Accounting', institution: 'UM', year: '2022', extraction: { evidence: 'Bachelor of Accounting, UM' } }]))
    expect(html).toContain('asWritten:{&quot;text&quot;:&quot;Bachelor of Accounting&quot;}')
    expect(html).not.toMatch(/<option value="bachelor" selected>/)
    const leveled = study(withRecords([{ level: 'bachelor', qualification: 'Bachelor of Accounting', fieldOfStudy: 'Accounting', institution: 'UM', year: '2022' }]))
    expect(leveled).toContain('asWritten:{&quot;text&quot;:&quot;Accounting&quot;}')
  })

  it('the highest qualification is worked out from the list and shown under it', () => {
    expect(highestLevel([{ level: 'diploma' }, { level: 'bachelor' }, { level: '' }, {}])).toBe('bachelor')
    expect(highestLevel([{ qualification: 'Degree' }])).toBe(null)
    const html = study(withRecords([{ level: 'diploma' }, { level: 'master' }]))
    expect(html).toContain('highestAuto:{&quot;level&quot;:&quot;optMaster&quot;}')
    expect(SECTION_FIELDS[0]).toContain('education.highestQualification')
  })

  it('the receipt names the level and the field', () => {
    const html = profileTable(t, withRecords([{ level: 'bachelor', qualification: '', fieldOfStudy: 'Accounting and taxation', institution: 'UM', year: '2022', field: { code: '0411' } }]))
    expect(html).toContain('optDegree · Accounting and taxation (ISCED-F 0411) · UM · 2022')
  })

  it('the new words exist in every language', () => {
    for (const lang of ['en', 'ms', 'zh']) for (const key of ['qualChoose', 'fieldChoose', 'asWritten', 'highestAuto', 'fieldListSource']) expect(translate(lang, key)).not.toBe(key)
  })
})
