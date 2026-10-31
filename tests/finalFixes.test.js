// Fixes from the final whole-branch review of the CV O*NET linking work (31 Oct 2026).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import form from '../public/js/screens/form.js'
import { keepSuggestion } from '../public/js/cvSuggest.js'
import { createAiReader, keepQuoted, shapeProblem } from '../server/cv/aiRead.js'
import { splitProject, extractProfile } from '../server/cv/extract.js'
import { mergeDrafts } from '../server/cv/mergeDrafts.js'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'
import { createNormalizer } from '../server/skills/normalize.js'
import { emptyProfile, makeSkill, validateProfile } from '../shared/profileSchema.js'
import { t as translate } from '../shared/i18n.js'
import { writeCatalogue } from './helpers/onetFixture.js'

let dir
let catalogue
let normalizer
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'finalfix-'))
  await writeCatalogue(dir)
  catalogue = await loadSkillCatalogue(dir)
  normalizer = createNormalizer({ catalogue })
})
afterAll(() => rm(dir, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

const real = (key, vars) => translate('en', key, vars)
const page = (profile, extra = {}) => form({ t: real, state: { section: 2, profile, occ: {}, pick: {}, ...extra } })
const count = (text, part) => text.split(part).length - 1
const NOW = new Date('2026-10-31T00:00:00Z')

describe('1. the short-form marker survives into the profile skill', () => {
  it('rules reader: SQL and MS Excel keep match short_form and the chip shows the arrow', async () => {
    const { profile } = await extractProfile({ lines: ['SKILLS', 'SQL, MS Excel, Python'], language: 'en', interfaceLanguage: 'en', catalogue, normalizer, now: NOW })
    const by = Object.fromEntries(profile.skills.map((s) => [s.originalText, s]))
    expect(by.SQL).toMatchObject({ canonicalId: 'onet:tech:structured query language sql', match: 'short_form' })
    expect(by['MS Excel']).toMatchObject({ canonicalId: 'onet:tech:microsoft excel', match: 'short_form' })
    expect(by.Python.match).not.toBe('short_form')
    expect(validateProfile(profile).ok).toBe(true)
    const html = page(profile, { otherOpen: true })
    expect(html).toContain('SQL → Structured query language SQL (O*NET)')
    expect(html).toContain('MS Excel → Microsoft Excel (O*NET)')
  })
  it('AI reader: a short-form skill name carries the marker', async () => {
    const cv = 'I write SQL every day'
    const body = { education: [], jobs: [], certifications: [], projects: [], skills: [{ name: 'SQL', evidence: 'write SQL every day' }] }
    const reader = createAiReader({ provider: { url: 'https://x', key: 'k', model: 'm' }, normalizer, catalogue, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }) }) })
    const out = await reader.read({ cvText: cv, ip: '9.9.9.9' })
    expect(out.profile.skills[0]).toMatchObject({ canonicalId: 'onet:tech:structured query language sql', match: 'short_form' })
    expect(validateProfile(out.profile).ok).toBe(true)
  })
  it('makeSkill without a match adds no field; old saved profiles still render and validate', () => {
    expect(makeSkill({ name: 'A', source: 'user_input' })).not.toHaveProperty('match')
    const p = { ...emptyProfile({ inputMethod: 'cv' }), skills: [makeSkill({ name: 'Structured query language SQL', originalText: 'SQL', canonicalId: 'onet:tech:sql', source: 'cv_rules' })] }
    expect(validateProfile(p).ok).toBe(true)
    expect(page(p, { otherOpen: true })).toContain('Structured query language SQL')
  })
})

describe('2. a knowledge area links by exact name only', () => {
  const norm = (text) => normalizer.normalizeSkill(text)
  it('exact name still links', async () => {
    expect(await norm('Customer and Personal Service')).toMatchObject({ canonicalId: 'onet:kn:2.C.1.e', match: 'exact' })
  })
  it('the whole name inside a short phrase does not link a knowledge area', async () => {
    const out = await norm('Customer and Personal Service training')
    expect(out.canonicalId).toBe(null)
  })
  it('a skill name inside a phrase still links the skill', async () => {
    expect(await norm('Mathematics tutoring')).toMatchObject({ canonicalId: 'onet:el:2.A.1.e', match: 'word' })
  })
  it('a knowledge area is not offered as a candidate for a part of its name', async () => {
    const out = await norm('Media')
    expect(out.candidates.map((c) => c.id)).not.toContain('onet:kn:2.C.9.b')
  })
})

describe('3. the AI name Mathematics resolves to the skill', () => {
  const cv = 'Taught Mathematical modelling to students'
  const aiProfile = async () => {
    const body = { education: [], jobs: [], certifications: [], projects: [], skills: [{ name: 'Mathematical modelling', evidence: 'Taught Mathematical modelling', onet: 'Mathematics' }] }
    const reader = createAiReader({ provider: { url: 'https://x', key: 'k', model: 'm' }, normalizer, catalogue, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }) }) })
    return (await reader.read({ cvText: cv, ip: '9.9.9.8' })).profile
  }
  it('the suggestion id is the skill, not the knowledge area', async () => {
    const profile = await aiProfile()
    expect(profile.skills[0].aiSuggestion).toMatchObject({ id: 'onet:el:2.A.1.e', name: 'Mathematics' })
  })
  it('a rules-linked Mathematics skill blocks the suggestion in the merge', async () => {
    const rules = { ...emptyProfile({ inputMethod: 'cv' }), skills: [makeSkill({ name: 'Mathematics', canonicalId: 'onet:el:2.A.1.e', source: 'cv_rules' })] }
    const merged = mergeDrafts({ profile: rules, uncertain: [] }, await aiProfile())
    expect(merged.profile.skills.some((s) => s.aiSuggestion)).toBe(false)
  })
  it('the prompt does not state a name count', async () => {
    const { systemPrompt } = await import('../server/cv/aiReadPrompt.js')
    expect(systemPrompt(['A', 'B'])).not.toMatch(/\b6[78]\b/)
  })
})

describe('4. suggestions are visible without Show, and once per card', () => {
  const suggestion = { id: 'onet:el:2.A.2.b', name: 'Programming', evidence: 'built models' }
  const other = () => ({ ...emptyProfile({ inputMethod: 'cv' }), skills: [{ ...makeSkill({ name: 'Komunikasi', source: 'cv_ai' }), aiSuggestion: suggestion }] })
  it('Other skills shows Keep / Remove while folded', () => {
    const html = page(other())
    expect(html).toContain('data-act="keepAi" data-arg="0"')
    expect(html).toContain('data-act="dropAi" data-arg="0"')
    expect(html).toContain('aria-expanded="false"')
  })
  it('Other skills in edit mode shows it once', () => {
    expect(count(page(other(), { groupEdit: 'other' }), 'data-act="keepAi"')).toBe(1)
  })
  it('a job card in edit mode shows it once', () => {
    const p = other()
    p.employment.records = [{ jobTitle: 'Tutor', employer: '', period: '', userConfirmed: false, extraction: { evidence: 'Tutor' } }]
    p.skills[0].usedIn = [{ kind: 'job', title: 'Tutor' }]
    expect(count(page(p, { groupEdit: 'job|0' }), 'data-act="keepAi"')).toBe(1)
    expect(count(page(p), 'data-act="keepAi"')).toBe(1)
  })
})

describe('5a. null in an optional AI field is the same as missing', () => {
  const entry = { name: 'x', evidence: 'x y z' }
  it('shapeProblem accepts null onet and description, and still refuses numbers', () => {
    const reply = (skill, project = { title: 't', evidence: 'e' }) => ({ education: [], jobs: [], certifications: [], skills: [skill], projects: [project] })
    expect(shapeProblem(reply({ ...entry, onet: null }))).toBe(null)
    expect(shapeProblem(reply(entry, { title: 't', evidence: 'e', description: null }))).toBe(null)
    expect(shapeProblem(reply({ ...entry, onet: 5 }))).not.toBe(null)
    expect(shapeProblem(reply({ ...entry, name: null }))).not.toBe(null)
  })
  it('keepQuoted stores null as an empty value', () => {
    const cv = 'x y z'
    const { fields } = keepQuoted({ education: [], jobs: [], certifications: [], projects: [], skills: [{ ...entry, onet: null }] }, cv)
    expect(fields.skills[0].onet ?? '').toBe('')
  })
})

describe('5b. splitProject does not cut inside a date', () => {
  it('dates and year ranges stay', () => {
    expect(splitProject('App (2023 - 2024)')).toEqual({ title: 'App (2023 - 2024)', description: '' })
    expect(splitProject('Shop app, Jan 2023 - Mar 2023')).toEqual({ title: 'Shop app, Jan 2023 - Mar 2023', description: '' })
    expect(splitProject('Shop app - 2023 - 2024')).toEqual({ title: 'Shop app - 2023 - 2024', description: '' })
  })
  it('a normal separator still splits (hyphen, en dash, colon)', () => {
    expect(splitProject('Dashboard - built for HR')).toEqual({ title: 'Dashboard', description: 'built for HR' })
    expect(splitProject('Dashboard – built for HR')).toEqual({ title: 'Dashboard', description: 'built for HR' })
    expect(splitProject('Dashboard: built for HR')).toEqual({ title: 'Dashboard', description: 'built for HR' })
  })
  it('a later real separator splits after a date-only first one', () => {
    expect(splitProject('Dashboard (2023 - 2024) - built for HR')).toEqual({ title: 'Dashboard (2023 - 2024)', description: 'built for HR' })
  })
  it('the split words, upper case and the Chinese word', () => {
    expect(splitProject('Attendance dashboard Built With React')).toEqual({ title: 'Attendance dashboard', description: 'Built With React' })
    expect(splitProject('Sales dashboard dengan React')).toEqual({ title: 'Sales dashboard', description: 'dengan React' })
    expect(splitProject('考勤系统使用React')).toEqual({ title: '考勤系统', description: '使用React' })
    expect(splitProject('Sales dashboard with React')).toEqual({ title: 'Sales dashboard', description: 'with React' })
  })
})

describe('5c. keepSuggestion survives a malformed saved suggestion', () => {
  const bad = (aiSuggestion) => ({ ...emptyProfile(), skills: [{ ...makeSkill({ name: 'A', source: 'cv_ai' }), aiSuggestion }] })
  it('drops it and adds nothing', () => {
    for (const s of [{ id: 5, name: 'N', evidence: 'e' }, { id: 'onet:el:1', name: 7, evidence: 'e' }, { id: null, name: null }, 'text', 12]) {
      const out = keepSuggestion(bad(s), 0)
      expect(out.skills).toHaveLength(1)
      expect(out.skills[0].aiSuggestion).toBeUndefined()
    }
  })
})

describe('5d. normaliser gaps', () => {
  const norm = (text) => normalizer.normalizeSkill(text)
  it('MS with no Microsoft match falls through unchanged', async () => {
    expect(await norm('MS Foo')).toMatchObject({ name: 'MS Foo', canonicalId: null, match: null, candidates: [] })
  })
  it('an all-capital word that fits no name stays unknown', async () => {
    expect(await norm('XYZ')).toMatchObject({ canonicalId: null, match: null, candidates: [] })
  })
  it('candidates are ordered by occupations, most first', async () => {
    const out = await norm('query')
    expect(out.candidates.map((c) => c.id)).toEqual(['onet:tech:structured query language sql', 'onet:tech:structure query language sql'])
  })
})
