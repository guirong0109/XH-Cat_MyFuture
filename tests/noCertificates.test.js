import { describe, expect, it } from 'vitest'
import form, { NOT_ASKED, SECTIONS, SECTION_FIELDS, dropNotAsked } from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile, makeSkill } from '../shared/profileSchema.js'

const t = (key) => key
const page = (section, profile = emptyProfile()) => form({ t, state: { section, profile, occ: {}, pick: {}, interests: { areas: [], version: '31.0' }, fields: { fields: [], version: 'ISCED-F 2013' } } })
const withLists = () => ({
  ...emptyProfile(),
  certifications: [{ name: 'Google Data Analytics Certificate', issuer: 'Google', year: '2023' }],
  training: [{ name: 'Excel course', year: '2022' }],
  projects: [{ title: 'Budget app', description: 'A small app' }],
})

describe('no certificates, training or projects in the profile', () => {
  it('the profile has four sections: study, employment, skills, career preferences', () => {
    expect(SECTIONS).toEqual(['secStudy', 'secWork', 'secSkills', 'secPrefs'])
    expect(SECTION_FIELDS).toHaveLength(SECTIONS.length)
    for (let section = 0; section < SECTIONS.length; section += 1) {
      const html = page(section)
      for (const key of ['addCert', 'addTraining', 'addProject', 'secCerts']) expect(html).not.toContain(key)
    }
    expect(page(3)).toContain('fInterests')
  })

  it('what a CV or the AI re-read finds for them is left out; everything else stays', () => {
    expect(NOT_ASKED).toEqual(['certifications', 'training', 'projects'])
    const draft = { ...withLists(), skills: [makeSkill({ name: 'Python', source: 'cv_rules' })] }
    const out = dropNotAsked(draft)
    expect(out.certifications).toEqual([])
    expect(out.training).toEqual([])
    expect(out.projects).toEqual([])
    expect(out.skills).toEqual(draft.skills)
    expect(draft.certifications).toHaveLength(1)
  })

  it('the receipt leaves the rows out, unless a profile saved earlier has some', () => {
    const empty = profileTable(t, emptyProfile())
    for (const key of ['certName', 'trainingName', 'projTitle']) expect(empty).not.toContain(key)
    const old = profileTable(t, withLists())
    for (const key of ['certName', 'trainingName', 'projTitle']) expect(old).toContain(key)
  })
})
