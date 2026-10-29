import { describe, expect, it } from 'vitest'
import { DECLINED, emptyProfile, makeSkill, val } from '../shared/profileSchema.js'
import {
  addRecord, applyAccepted, confirmProfile, diffProfiles, isUntouched, markForReview, mergeDraft, minimizeForGuest,
  removeRecord, setField, userEditedPaths,
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

  it('isUntouched is true for a blank profile only', () => {
    expect(isUntouched(emptyProfile())).toBe(true)
    expect(isUntouched(setField(emptyProfile(), 'employment.status', DECLINED))).toBe(false)
    expect(isUntouched({ ...emptyProfile(), skills: [cvSkill('SQL')] })).toBe(false)
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

describe('CV draft and AI compare', () => {
  const original = () => {
    const p = emptyProfile({ inputMethod: 'cv' })
    p.employment.status = val('employed')
    p.employment.yearsOfExperience = val(2)
    p.skills = [cvSkill('SQL'), cvSkill('Python', 'onet:tech:python', { category: 'app' })]
    return p
  }
  const suggested = () => {
    const p = original()
    p.employment.yearsOfExperience = val(3)
    p.preferences.careerGoal = val('first_job')
    p.skills = [cvSkill('SQL'), cvSkill('Python', 'onet:tech:python', { category: 'dev' }), cvSkill('Excel')]
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

  it('diff marks new, changed, conflict and same', () => {
    const rows = diffProfiles(original(), suggested(), new Set())
    const kind = (path) => rows.find((row) => row.path === path)?.kind
    expect(kind('employment.status')).toBe('same')
    expect(kind('employment.yearsOfExperience')).toBe('conflict')
    expect(kind('preferences.careerGoal')).toBe('new')
    expect(kind('skills#onet:tech:excel')).toBe('new')
    expect(kind('skills#onet:tech:python')).toBe('changed')
    expect(kind('skills#onet:tech:sql')).toBe('same')
  })

  it('locked rows are never applied', () => {
    const rows = diffProfiles(original(), suggested(), new Set(['employment.yearsOfExperience']))
    const out = applyAccepted(original(), rows, new Set(rows.map((row) => row.path)))
    expect(out.employment.yearsOfExperience).toEqual(val(2))
    expect(out.preferences.careerGoal).toEqual(val('first_job'))
    expect(out.skills.map((s) => s.name)).toEqual(['SQL', 'Python', 'Excel'])
  })

  it('userEditedPaths lists what changed after the draft', () => {
    const draft = original()
    const now = JSON.parse(JSON.stringify(draft))
    now.employment.yearsOfExperience = val(4)
    now.skills[1] = { ...now.skills[1], proficiency: 'good', proficiencyStatus: 'self_reported' }
    now.skills.push({ ...cvSkill('Excel'), source: 'user_input' })
    expect([...userEditedPaths(draft, now)].sort()).toEqual(['employment.yearsOfExperience', 'skills#onet:tech:excel', 'skills#onet:tech:python'])
    expect([...userEditedPaths(null, setField(emptyProfile(), 'employment.status', val('employed')))]).toEqual(['employment.status'])
  })

  it('minimizeForGuest removes CV quotes and raw text', () => {
    const p = { ...emptyProfile(), skills: [cvSkill('SQL', 'onet:tech:sql', { extraction: { method: 'dictionary', evidence: 'Built SQL reports at Acme', confidence: 1 } })], rawText: 'whole cv' }
    const out = minimizeForGuest(p)
    expect(out.skills[0].extraction).toEqual({ method: 'dictionary', confidence: 1 })
    expect(out.rawText).toBeUndefined()
    expect(p.skills[0].extraction.evidence).toBe('Built SQL reports at Acme')
  })
})
