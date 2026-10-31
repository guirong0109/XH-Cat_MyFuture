import { describe, it, expect } from 'vitest'
import { mergeDrafts } from '../server/cv/mergeDrafts.js'
import { levelOf } from '../server/cv/patterns.js'
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
    expect(e.level).toBe(levelOf('Bachelor of Science'))
    expect(e.level).toBe('bachelor')
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
    const rs = makeSkill({ name: 'Excel', canonicalId: 'onet:xl', source: 'cv_rules', extraction: rulesEx('Excel') })
    const rules = result(build((p) => { p.employment.records = [rulesJob]; p.skills = [rs] }))
    const ai = build((p) => { p.employment.records = [aiJob('IT Support Exec')]; p.skills = [a] })
    const rulesCopy = structuredClone(rules)
    const aiCopy = structuredClone(ai)
    const merged = mergeDrafts(rules, ai)
    expect(rules).toEqual(rulesCopy)
    expect(ai).toEqual(aiCopy)
    expect(validateProfile(merged.profile).ok).toBe(true)
    expect(merged.profile.skills[0].usedIn).toEqual([{ kind: 'job', title: 'IT Support Executive' }])
  })

  it('a short quote inside a longer word does not match (Intern vs International)', () => {
    const r = job('International Sales Manager', 'Foo', rulesEx('International Sales Manager at Foo'))
    const a = job('Intern', '', aiEx('Intern'))
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [r] })), build((p) => { p.employment.records = [a] }))
    expect(merged.profile.employment.records.map((j) => j.jobTitle)).toEqual(['International Sales Manager', 'Intern'])
    expect(merged.uncertain).toEqual([])
  })

  it('a short but equal main field still matches', () => {
    const r = job('Intern', '', rulesEx('Intern, 2022'))
    const a = job('Intern', 'Acme', aiEx('Intern'))
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [r] })), build((p) => { p.employment.records = [a] }))
    expect(merged.profile.employment.records).toHaveLength(1)
    expect(merged.profile.employment.records[0].employer).toBe('Acme')
  })

  it('evidence under 8 characters on word boundaries does not match by evidence', () => {
    const r = job('Clerk', '', rulesEx('Admin Clerk at Foo'))
    const a = job('Admin', '', aiEx('Admin'))
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [r] })), build((p) => { p.employment.records = [a] }))
    expect(merged.profile.employment.records).toHaveLength(2)
  })

  it('evidence on word boundaries works for Chinese and Malay text', () => {
    const r = job('', '', rulesEx('Pembantu Tadbir di Syarikat ABC 2020'))
    const a = job('Pembantu Tadbir', 'Syarikat ABC', aiEx('Pembantu Tadbir di Syarikat ABC'))
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [r] })), build((p) => { p.employment.records = [a] }))
    expect(merged.profile.employment.records).toHaveLength(1)
    expect(merged.profile.employment.records[0].jobTitle).toBe('Pembantu Tadbir')
  })

  it('first match wins and a rules record is matched at most once', () => {
    const a1 = job('IT Support Executive', 'Acme Sdn Bhd', aiEx('IT Support Executive at Acme Sdn Bhd'))
    const a2 = job('IT Support Exec', 'Other', aiEx('IT Support Executive at Acme'))
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [rulesJob] })), build((p) => { p.employment.records = [a1, a2] }))
    const jobs = merged.profile.employment.records
    expect(jobs).toHaveLength(2)
    expect(jobs[0].employer).toBe('Acme Sdn Bhd')
    expect(jobs[1].jobTitle).toBe('IT Support Exec')
    expect(jobs[1].extraction.method).toBe('ai')
    expect(merged.uncertain).toEqual([])
  })

  it('empty evidence never matches by evidence', () => {
    const r = job('Barista', '', rulesEx(''))
    const a = job('Cashier', '', aiEx(''))
    const merged = mergeDrafts(result(build((p) => { p.employment.records = [r] })), build((p) => { p.employment.records = [a] }))
    expect(merged.profile.employment.records).toHaveLength(2)
  })

  it('the uncertain path uses the index of the record in the list', () => {
    const r0 = job('Barista', 'Cafe', rulesEx('Barista at Cafe 2019'))
    const merged = mergeDrafts(
      result(build((p) => { p.employment.records = [r0, rulesJob] })),
      build((p) => { p.employment.records = [aiJob('IT Support Exec')] }),
    )
    expect(merged.uncertain).toContainEqual({ path: 'employment.records.1.jobTitle', reason: 'ai_differs', aiValue: 'IT Support Exec' })
  })

  it('skills with different ids and equal names stay separate', () => {
    const r = makeSkill({ name: 'Design', canonicalId: 'onet:a', source: 'cv_rules', extraction: rulesEx('Design') })
    const a = makeSkill({ name: 'Design', canonicalId: 'onet:b', source: 'cv_ai', extraction: aiEx('Design') })
    const merged = mergeDrafts(result(build((p) => { p.skills = [r] })), build((p) => { p.skills = [a] }))
    expect(merged.profile.skills.map((s) => s.canonicalId)).toEqual(['onet:a', 'onet:b'])
  })

  describe('records with the same main field', () => {
    const maybank = job('Intern', 'Maybank', rulesEx('Intern at Maybank Berhad 2020'))
    const petronas = job('Intern', 'Petronas', rulesEx('Intern at Petronas Dagangan 2021'))

    it('two jobs with the same title in swapped order each keep their own employer', () => {
      const merged = mergeDrafts(
        result(build((p) => { p.employment.records = [maybank, petronas] })),
        build((p) => { p.employment.records = [job('Intern', 'Petronas', aiEx('Intern at Petronas Dagangan')), job('Intern', 'Maybank', aiEx('Intern at Maybank Berhad'))] }),
      )
      const jobs = merged.profile.employment.records
      expect(jobs.map((j) => j.employer)).toEqual(['Maybank', 'Petronas'])
      expect(jobs.every((j) => !j.extraction.aiDiffers)).toBe(true)
      expect(merged.uncertain).toEqual([])
    })

    it('rules employer empty, two AI jobs with that title: the one whose quote matches fills it', () => {
      const r = job('Intern', '', rulesEx('Intern at Petronas Dagangan 2021'))
      const merged = mergeDrafts(
        result(build((p) => { p.employment.records = [r] })),
        build((p) => { p.employment.records = [job('Intern', 'Maybank', aiEx('Intern at Maybank Berhad')), job('Intern', 'Petronas', aiEx('Intern at Petronas Dagangan'))] }),
      )
      const jobs = merged.profile.employment.records
      expect(jobs).toHaveLength(2)
      expect(jobs[0].employer).toBe('Petronas')
      expect(jobs[0].extraction.aiFilled).toEqual(['employer'])
      expect(jobs[1]).toMatchObject({ jobTitle: 'Intern', employer: 'Maybank' })
      expect(jobs[1].extraction.method).toBe('ai')
    })

    it('same title, different employers and no matching quote: separate records', () => {
      const merged = mergeDrafts(
        result(build((p) => { p.employment.records = [maybank] })),
        build((p) => { p.employment.records = [job('Intern', 'Petronas', aiEx('Intern, Petronas'))] }),
      )
      expect(merged.profile.employment.records.map((j) => j.employer)).toEqual(['Maybank', 'Petronas'])
      expect(merged.uncertain).toEqual([])
    })

    it('same qualification, different institutions and no matching quote: separate records', () => {
      const r = edu('Diploma', 'UTM', rulesEx('Diploma, UTM 2018'))
      const a = edu('Diploma', 'UiTM', aiEx('Diploma from UiTM'))
      const merged = mergeDrafts(result(build((p) => { p.education.records = [r] })), build((p) => { p.education.records = [a] }))
      expect(merged.profile.education.records.map((e) => e.institution)).toEqual(['UTM', 'UiTM'])
    })

    it('an AI record never matches an AI-only record added before it', () => {
      const merged = mergeDrafts(
        result(build(() => {})),
        build((p) => { p.employment.records = [job('Barista', 'Cafe', aiEx('Barista at Cafe')), job('Barista', '', aiEx('Barista in 2019'))] }),
      )
      expect(merged.profile.employment.records).toHaveLength(2)
    })
  })
})
