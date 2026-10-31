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

describe('no certificates or training in the profile; projects came back (owner, 31 Oct)', () => {
  it('the profile has five sections: education, employment, skills, using AI (career matching), interests', () => {
    expect(SECTIONS).toEqual(['secStudy', 'secWork', 'secSkills', 'secAi', 'secPrefs'])
    expect(SECTION_FIELDS).toHaveLength(SECTIONS.length)
    for (let section = 0; section < SECTIONS.length; section += 1) {
      const html = page(section)
      for (const key of ['addCert', 'addTraining', 'secCerts']) expect(html).not.toContain(key)
    }
    expect(page(SECTIONS.indexOf('secPrefs'))).toContain('fInterests')
  })

  it('certificates and training a CV or the AI re-read finds are left out; projects and everything else stay', () => {
    expect(NOT_ASKED).toEqual(['certifications', 'training'])
    const draft = { ...withLists(), skills: [makeSkill({ name: 'Python', source: 'cv_rules' })] }
    const out = dropNotAsked(draft)
    expect(out.certifications).toEqual([])
    expect(out.training).toEqual([])
    expect(out.projects).toEqual(draft.projects)
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

describe('section names', () => {
  it('the first section is called Education', async () => {
    const { t: translate } = await import('../shared/i18n.js')
    expect(translate('en', 'secStudy')).toBe('Education')
    expect(translate('ms', 'secStudy')).toBe('Pendidikan')
    expect(translate('zh', 'secStudy')).toBe('教育')
  })

  it('the last section is called Interests', async () => {
    const { t: translate } = await import('../shared/i18n.js')
    expect(translate('en', 'secPrefs')).toBe('Interests')
    expect(translate('ms', 'secPrefs')).toBe('Minat')
    expect(translate('zh', 'secPrefs')).toBe('兴趣')
  })
})

describe('Interests asks only "Career interests and fields"', () => {
  it('no occupations of interest, career goal, work location or learning hours', () => {
    const html = page(SECTIONS.indexOf('secPrefs'))
    expect(html).toContain('fInterests')
    for (const gone of ['occInterests', 'data-search="interest|interest"', 'fGoal', 'fLocation', 'fHours', 'preferences.careerGoal', 'preferences.preferredWorkLocation', 'preferences.preferredLearningHoursPerWeek']) expect(html).not.toContain(gone)
    expect(SECTION_FIELDS[SECTIONS.indexOf('secPrefs')]).toEqual([])
  })

  it('the receipt shows work location and learning hours only when a profile saved earlier has them', async () => {
    const { setField } = await import('../shared/profileState.js')
    const { val } = await import('../shared/profileSchema.js')
    const empty = profileTable(t, emptyProfile())
    expect(empty).not.toContain('fLocation')
    expect(empty).not.toContain('fHours')
    const old = setField(setField(emptyProfile(), 'preferences.preferredWorkLocation', val('Penang')), 'preferences.preferredLearningHoursPerWeek', val(5))
    expect(profileTable(t, old)).toContain('fLocation')
    expect(profileTable(t, old)).toContain('fHours')
  })
})

describe('Review and confirm', () => {
  it('shows only on the last section, Interests; the others move on with Next', () => {
    const last = SECTIONS.length - 1
    for (let section = 0; section < last; section += 1) {
      expect(page(section)).not.toContain('data-go="review"')
      expect(page(section)).toContain(`data-act="section" data-arg="${section + 1}"`)
    }
    expect(SECTIONS[last]).toBe('secPrefs')
    expect(page(last)).toContain('data-go="review"')
  })
})

describe('no "Current employment status" question', () => {
  it('Employment background does not ask it, and opening the section does not answer it for the user', () => {
    const html = page(1)
    expect(html).not.toContain('fEmpStatus')
    expect(html).not.toContain('employment.status')
    expect(html).toContain('fYears')
    expect(SECTION_FIELDS.flat()).not.toContain('employment.status')
  })

  it('the receipt leaves it out, unless a profile saved earlier has an answer', async () => {
    const { setField } = await import('../shared/profileState.js')
    const { val } = await import('../shared/profileSchema.js')
    expect(profileTable(t, emptyProfile())).not.toContain('fEmpStatus')
    const old = setField(emptyProfile(), 'employment.status', val('employed'))
    expect(profileTable(t, old)).toContain('fEmpStatus')
    expect(profileTable(t, old)).toContain('optEmployed')
  })
})
