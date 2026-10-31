import { describe, expect, it } from 'vitest'
import { prechooseFields } from '../public/js/cvPrechoose.js'
import form from '../public/js/screens/form.js'
import { emptyProfile } from '../shared/profileSchema.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const q = (text) => text.replace(/"/g, '&quot;')
const withStudies = (records) => ({ ...emptyProfile({ inputMethod: 'cv' }), education: { ...emptyProfile().education, records } })
const cvRecord = (extra) => ({ qualification: 'Bachelor degree', level: 'bachelor', fieldOfStudy: 'Computer Science', institution: '', year: '', userConfirmed: false, extraction: { evidence: 'Bachelor of Computer Science' }, ...extra })
const RESULT = { source: 'isced', version: 'ISCED-F 2013', candidates: [{ code: '0613', title: 'Software and applications development and analysis', broadTitle: 'Information and Communication Technologies', via: 'programme', programme: 'Computer Science' }] }

describe('the field of study read from a CV is prechosen; the user only checks it (owner, 31 Oct)', () => {
  it('the first field the ISCED search finds for the CV words is chosen, marked as chosen from the CV', async () => {
    const asked = []
    const out = await prechooseFields(withStudies([cvRecord()]), async (words) => { asked.push(words); return RESULT })
    expect(asked).toEqual(['Computer Science'])
    expect(out.education.records[0].field).toEqual({ source: 'isced', code: '0613', title: 'Software and applications development and analysis', version: 'ISCED-F 2013', via: 'cv_match', term: 'Computer Science' })
    expect(out.education.records[0].fieldOfStudy).toBe('Computer Science')
  })

  it('nothing found, a failed search or a field already chosen: the record stays as it is', async () => {
    const profile = withStudies([cvRecord(), cvRecord({ fieldOfStudy: 'Underwater basket weaving' }), cvRecord({ field: { source: 'isced', code: '0412', title: 'Management', via: 'list' } })])
    const out = await prechooseFields(profile, async (words) => (words === 'Computer Science' ? null : { ...RESULT, candidates: [] }))
    expect(out.education.records).toEqual(profile.education.records)
  })

  it('the form shows the chosen level and field, with the CV words to check against instead of "Choose the matching one"', async () => {
    const out = await prechooseFields(withStudies([cvRecord()]), async () => RESULT)
    const fields = { version: 'ISCED-F 2013', fields: [{ code: '0613', title: 'Software and applications development and analysis', broadCode: '06', broadTitle: 'Information and Communication Technologies' }] }
    const html = form({ t, state: { section: 0, profile: out, occ: {}, pick: {}, fields } })
    expect(html).toContain('<option value="bachelor" selected>')
    expect(html).toContain('<option value="0613" selected>')
    expect(html).toContain(q(t('cvPicked', { text: 'Computer Science' })))
    expect(html).not.toContain('asWritten')
  })

  it('the wording exists in every language', async () => {
    const { t: translate } = await import('../shared/i18n.js')
    for (const lang of ['en', 'ms', 'zh']) expect(translate(lang, 'cvPicked', { text: 'X' })).toContain('X')
  })
})
