import { describe, it, expect } from 'vitest'
import { mergeDrafts } from '../server/cv/mergeDrafts.js'
import { emptyProfile, makeSkill, validateProfile } from '../shared/profileSchema.js'

const rulesEx = (evidence) => ({ method: 'rules', evidence, confidence: 0.8, extractorVersion: 'rules-1', kind: 'explicit' })
const aiEx = (evidence) => ({ method: 'ai', evidence, confidence: null, extractorVersion: 'ai:deepseek-flash', provider: 'deepseek', at: '2026-10-31T00:00:00.000Z', kind: 'explicit' })
const job = (jobTitle, employer, extraction) => ({ jobTitle, employer, period: '', userConfirmed: false, extraction })
const edu = (qualification, institution, extraction) => ({ qualification, level: 'diploma', fieldOfStudy: '', institution, year: '', userConfirmed: false, extraction })
const project = (title, description, extraction) => ({ title, description, userConfirmed: false, extraction })
const cert = (name, extraction) => ({ name, issuer: '', year: '', userConfirmed: false, extraction })

const rulesJob = job('IT Support Executive', '', rulesEx('IT Support Executive at Acme Sdn Bhd 2021-2023'))
const aiJob = (title = 'IT Support Executive') => job(title, 'Acme Sdn Bhd', aiEx('IT Support Executive at Acme Sdn Bhd'))

function build(fill) {
  const p = emptyProfile({ inputMethod: 'cv' })
  fill(p)
  return p
}
const result = (profile, uncertain = []) => ({ profile, uncertain })

describe('mergeDrafts', () => {
  it('null AI returns the input unchanged', () => {
    const input = result(build((p) => { p.employment.records = [rulesJob] }), [{ path: 'skills.0', reason: 'unknown_skill' }])
    const copy = structuredClone(input)
    expect(mergeDrafts(input, null)).toEqual(copy)
  })

  it('same job by evidence: AI fills the empty employer, rules extraction kept', () => {
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [rulesJob] })), build((p) => { p.employment.records = [aiJob()] }))
    const jobs = merged.profile.employment.records
    expect(jobs).toHaveLength(1)
    expect(jobs[0].employer).toBe('Acme Sdn Bhd')
    expect(jobs[0].extraction.aiFilled).toEqual(['employer'])
    expect(jobs[0].extraction.method).toBe('rules')
  })

  it('different wording is flagged, rules value kept', () => {
    const merged = mergeDrafts(
      result(build((p) => { p.employment.records = [rulesJob] })),
      build((p) => { p.employment.records = [aiJob('IT Support Exec')] }),
    )
    const j = merged.profile.employment.records[0]
    expect(j.jobTitle).toBe('IT Support Executive')
    expect(j.extraction.aiDiffers.jobTitle).toBe('IT Support Exec')
    expect(merged.uncertain).toContainEqual({ path: 'employment.records.0.jobTitle', reason: 'ai_differs', aiValue: 'IT Support Exec' })
  })

  it('AI-only job is appended and rules-only job is kept', () => {
    const other = job('Barista', 'Cafe', aiEx('Barista at Cafe'))
    const merged = mergeDrafts(
      result(build((p) => { p.employment.records = [rulesJob] })),
      build((p) => { p.employment.records = [other] }),
    )
    const jobs = merged.profile.employment.records
    expect(jobs).toHaveLength(2)
    expect(jobs[0].extraction.method).toBe('rules')
    expect(jobs[1].jobTitle).toBe('Barista')
    expect(jobs[1].extraction.method).toBe('ai')
  })

  it('education: AI fills the empty institution, level unchanged', () => {
    const r = edu('Diploma in Information Technology', '', rulesEx('Diploma in Information Technology 2019'))
    const a = { ...edu('Diploma in Information Technology', 'Politeknik Ungku Omar', aiEx('Diploma in Information Technology')), level: 'degree' }
    const merged = mergeDrafts(result(build((p) => { p.education.records = [r] })), build((p) => { p.education.records = [a] }))
    const e = merged.profile.education.records
    expect(e).toHaveLength(1)
    expect(e[0].institution).toBe('Politeknik Ungku Omar')
    expect(e[0].level).toBe('diploma')
    expect(e[0].extraction.aiFilled).toEqual(['institution'])
  })

  it('education: level recomputed only when the qualification is filled', () => {
    const r = edu('', 'UTM', rulesEx('UTM Bachelor of Science'))
    const a = edu('Bachelor of Science', 'UTM', aiEx('UTM Bachelor of Science'))
    const merged = mergeDrafts(result(build((p) => { p.education.records = [r] })), build((p) => { p.education.records = [a] }))
    const e = merged.profile.education.records[0]
    expect(e.qualification).toBe('Bachelor of Science')
    expect(e.level).not.toBe('diploma')
  })

  it('projects: description filled, certifications matched or appended', () => {
    const merged = mergeDrafts(
      result(build((p) => {
        p.projects = [project('Inventory App', '', rulesEx('Inventory App'))]
        p.certifications = [cert('CCNA', rulesEx('CCNA certified'))]
      })),
      build((p) => {
        p.projects = [project('Inventory App', 'Tracks stock', aiEx('Inventory App'))]
        p.certifications = [cert('CCNA', aiEx('CCNA')), cert('CompTIA A+', aiEx('CompTIA A+'))]
      }),
    )
    expect(merged.profile.projects[0].description).toBe('Tracks stock')
    expect(merged.profile.projects[0].extraction.aiFilled).toEqual(['description'])
    expect(merged.profile.certifications.map((c) => c.name)).toEqual(['CCNA', 'CompTIA A+'])
    expect(merged.profile.certifications[0].extraction.method).toBe('rules')
  })

  it('skill same by id keeps the rules source', () => {
    const r = makeSkill({ name: 'Python', canonicalId: 'onet:py', source: 'cv_rules', extraction: rulesEx('Python') })
    const a = makeSkill({ name: 'Python programming', canonicalId: 'onet:py', source: 'cv_ai', extraction: aiEx('Python') })
    const merged = mergeDrafts(result(build((p) => { p.skills = [r] })), build((p) => { p.skills = [a] }))
    expect(merged.profile.skills).toHaveLength(1)
    expect(merged.profile.skills[0].source).toBe('cv_rules')
  })

  it('skill same by name when id is null', () => {
    const r = makeSkill({ name: 'Teamwork', source: 'cv_rules', extraction: rulesEx('Teamwork') })
    const a = makeSkill({ name: ' teamwork ', source: 'cv_ai', extraction: aiEx('Teamwork') })
    const merged = mergeDrafts(result(build((p) => { p.skills = [r] })), build((p) => { p.skills = [a] }))
    expect(merged.profile.skills).toHaveLength(1)
    expect(merged.profile.skills[0].source).toBe('cv_rules')
  })

  it('AI-only skill is appended as cv_ai', () => {
    const r = makeSkill({ name: 'Python', canonicalId: 'onet:py', source: 'cv_rules', extraction: rulesEx('Python') })
    const a = makeSkill({ name: 'Excel', canonicalId: 'onet:xl', source: 'cv_ai', extraction: aiEx('Excel') })
    const merged = mergeDrafts(result(build((p) => { p.skills = [r] })), build((p) => { p.skills = [a] }))
    expect(merged.profile.skills.map((s) => [s.name, s.source])).toEqual([['Python', 'cv_rules'], ['Excel', 'cv_ai']])
  })

  it('usedIn follows the kept title and the level starts at good', () => {
    const r = makeSkill({ name: 'Troubleshooting', canonicalId: 'onet:ts', source: 'cv_rules', extraction: rulesEx('Troubleshooting') })
    const a = makeSkill({ name: 'Troubleshooting', canonicalId: 'onet:ts', source: 'cv_ai', extraction: aiEx('Troubleshooting'), usedIn: [{ kind: 'job', title: 'IT Support Exec' }] })
    const merged = mergeDrafts(
      result(build((p) => { p.employment.records = [rulesJob]; p.skills = [r] })),
      build((p) => { p.employment.records = [aiJob('IT Support Exec')]; p.skills = [a] }),
    )
    const s = merged.profile.skills[0]
    expect(s.usedIn).toEqual([{ kind: 'job', title: 'IT Support Executive' }])
    expect(s.proficiency).toBe('good')
    expect(s.proficiencyStatus).toBe('from_projects')
  })

  it('does not mutate its inputs and the result validates', () => {
    const a = makeSkill({ name: 'Excel', canonicalId: 'onet:xl', source: 'cv_ai', extraction: aiEx('Excel'), usedIn: [{ kind: 'job', title: 'IT Support Exec' }] })
    const rules = result(build((p) => { p.employment.records = [rulesJob] }))
    const ai = build((p) => { p.employment.records = [aiJob('IT Support Exec')]; p.skills = [a] })
    const rulesCopy = structuredClone(rules)
    const aiCopy = structuredClone(ai)
    const merged = mergeDrafts(rules, ai)
    expect(rules).toEqual(rulesCopy)
    expect(ai).toEqual(aiCopy)
    expect(validateProfile(merged.profile).ok).toBe(true)
  })
})
