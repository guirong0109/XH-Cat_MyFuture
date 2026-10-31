import { describe, expect, it } from 'vitest'
import { DECLINED, emptyProfile, makeSkill, val } from '../shared/profileSchema.js'
import {
  addRecord, confirmProfile, isUntouched, markForReview, mergeDraft, minimizeForGuest,
  removeRecord, setField,
} from '../shared/profileState.js'

const cvSkill = (name, canonicalId = `onet:tech:${name.toLowerCase()}`, extra = {}) => ({ ...makeSkill({ name, canonicalId, source: 'cv_rules' }), ...extra })

describe('form helpers', () => {
  it('setField and records are immutable', () => {
    const a = emptyProfile()
    const b = setField(a, 'employment.status', DECLINED)
    expect(a.employment.status.state).toBe('empty')
    expect(b.employment.status).toEqual(DECLINED)
    const c = addRecord(addRecord(b, 'education.records', { qualification: 'Diploma' }), 'education.records', { qualification: 'Degree' })
    expect(c.education.records).toHaveLength(2)
    expect(removeRecord(c, 'education.records', 0).education.records).toEqual([{ qualification: 'Degree' }])
    expect(b.education.records).toEqual([])
  })

  it('isUntouched is true for a profile without answers', () => {
    expect(isUntouched(emptyProfile())).toBe(true)
    // "Prefer not to say" is the form's default, so it is not an answer.
    expect(isUntouched(setField(emptyProfile(), 'employment.status', DECLINED))).toBe(true)
    expect(isUntouched(setField(emptyProfile(), 'employment.status', val('employed')))).toBe(false)
    expect(isUntouched({ ...emptyProfile(), skills: [cvSkill('SQL')] })).toBe(false)
  })

  it('isUntouched is false once any AI question is answered', () => {
    const p = emptyProfile()
    expect(isUntouched({ ...p, aiUse: { ...p.aiUse, mindset: 'yes' } })).toBe(false)
    expect(isUntouched({ ...p, aiUse: { ...p.aiUse, design: 'no' } })).toBe(false)
    expect(isUntouched({ ...p, aiUse: { mindset: null, ethics: null, apply: null, design: null } })).toBe(true)
  })

  it('markForReview flags and unflags one record', () => {
    const p = addRecord(emptyProfile(), 'certifications', { name: 'AWS' })
    const flagged = markForReview(p, 'certifications.0', true)
    expect(flagged.certifications[0].needsReview).toBe(true)
    expect(markForReview(flagged, 'certifications.0', false).certifications[0].needsReview).toBe(false)
    expect(p.certifications[0].needsReview).toBeUndefined()
  })

  it('confirm marks every record and skill confirmed', () => {
    const p = { ...emptyProfile({ inputMethod: 'cv' }), skills: [cvSkill('SQL')] }
    p.education = { ...p.education, records: [{ qualification: 'Diploma', userConfirmed: false }] }
    const out = confirmProfile(p)
    expect(out.profileStatus).toBe('confirmed')
    expect(out.skills[0].userConfirmed).toBe(true)
    expect(out.education.records[0].userConfirmed).toBe(true)
    expect(out.dataProvenance.profileReviewedByUser).toBe(true)
  })
})

describe('CV draft', () => {
  const original = () => {
    const p = emptyProfile({ inputMethod: 'cv' })
    p.employment.status = val('employed')
    p.employment.yearsOfExperience = val(2)
    p.skills = [cvSkill('SQL'), cvSkill('Python', 'onet:tech:python', { category: 'app' })]
    return p
  }
  it('mergeDraft: an empty form takes the draft; typed values win', () => {
    const draft = original()
    expect(mergeDraft(emptyProfile(), draft)).toEqual(draft)
    const typed = setField(emptyProfile(), 'employment.yearsOfExperience', val(5))
    const out = mergeDraft(typed, draft)
    expect(out.employment.yearsOfExperience).toEqual(val(5))
    expect(out.employment.status).toEqual(val('employed'))
    expect(out.skills).toHaveLength(2)
    expect(out.inputMethod).toBe('cv')
  })

  it('mergeDraft: repeated draft items the user does not have are all added; own items untouched', () => {
    const current = setField(emptyProfile(), 'employment.status', val('employed'))
    current.education.records = [{ qualification: 'Degree', fieldOfStudy: 'IT', userConfirmed: true }]
    const draft = emptyProfile({ inputMethod: 'cv' })
    draft.education.records = [
      { qualification: '', fieldOfStudy: '', institution: 'A', userConfirmed: false },
      { qualification: '', fieldOfStudy: '', institution: 'B', userConfirmed: false },
    ]
    const out = mergeDraft(current, draft)
    expect(out.education.records).toHaveLength(3)
    expect(out.education.records[0]).toEqual({ qualification: 'Degree', fieldOfStudy: 'IT', userConfirmed: true })
    expect(out.education.records.slice(1).map((r) => r.institution)).toEqual(['A', 'B'])
    expect(out.education.records.slice(1).every((r) => r.userConfirmed === false)).toBe(true)
  })

  it('minimizeForGuest removes CV quotes and raw text', () => {
    const p = { ...emptyProfile(), skills: [cvSkill('SQL', 'onet:tech:sql', { extraction: { method: 'dictionary', evidence: 'Built SQL reports at Acme', confidence: 1 } })], rawText: 'whole cv' }
    const out = minimizeForGuest(p)
    expect(out.skills[0].extraction).toEqual({ method: 'dictionary', confidence: 1 })
    expect(out.rawText).toBeUndefined()
    expect(p.skills[0].extraction.evidence).toBe('Built SQL reports at Acme')
  })
})
