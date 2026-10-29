import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'
import { createNormalizer, mergeSkills } from '../server/skills/normalize.js'
import { makeSkill } from '../shared/profileSchema.js'
import { writeCatalogue } from './helpers/onetFixture.js'

let dir
let catalogue

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'skills-'))
  await writeCatalogue(dir)
  catalogue = await loadSkillCatalogue(dir)
})
afterAll(() => rm(dir, { recursive: true, force: true }))

describe('skill catalogue', () => {
  it('has one entry per software example and per skill element', () => {
    expect(catalogue.version).toBe('31.0')
    expect(catalogue.entries.map((e) => e.id).sort()).toEqual([
      'onet:el:2.A.1.a', 'onet:tech:javascript', 'onet:tech:microsoft excel', 'onet:tech:microsoft sql server', 'onet:tech:oracle java',
      'onet:tech:python', 'onet:tech:structured query language sql',
    ])
    expect(catalogue.entries.find((e) => e.id === 'onet:tech:python').category).toBe('Development environment software')
  })
})

describe('normalizeSkill', () => {
  const normalizeSkill = (text) => createNormalizer({ catalogue }).normalizeSkill(text)

  it('exact name match with version removed', async () => {
    expect(await normalizeSkill('Python 3')).toMatchObject({ name: 'Python', canonicalId: 'onet:tech:python', originalText: 'Python 3', match: 'exact' })
    expect(await normalizeSkill('reading comprehension')).toMatchObject({ canonicalId: 'onet:el:2.A.1.a', match: 'exact' })
  })

  it('whole word inside a short phrase', async () => {
    expect(await normalizeSkill('advanced Microsoft Excel')).toMatchObject({ canonicalId: 'onet:tech:microsoft excel', match: 'word' })
  })

  it('one catalogue name containing the input is offered to pick, never linked silently', async () => {
    // e.g. "Teamwork" must not become "Digital Crew Teamwork Project Manager" without the user choosing it
    expect(await normalizeSkill('Java')).toMatchObject({ name: 'Java', canonicalId: null, candidates: [expect.objectContaining({ id: 'onet:tech:oracle java', name: 'Oracle Java' })] })
  })

  it('an input found in several names returns candidates to pick from, no id', async () => {
    const out = await normalizeSkill('SQL')
    expect(out.canonicalId).toBe(null)
    expect(out.candidates.map((c) => c.id).sort()).toEqual(['onet:tech:microsoft sql server', 'onet:tech:structured query language sql'])
  })

  it('candidates used by more occupations come first', async () => {
    const out = await normalizeSkill('SQL')
    expect(out.candidates[0]).toMatchObject({ id: 'onet:tech:microsoft sql server', occupations: 2 })
  })

  it('no match inside a longer word', async () => {
    expect(await normalizeSkill('Pythonista')).toMatchObject({ canonicalId: null, candidates: [] })
  })

  it('unknown skill keeps its name and has no id', async () => {
    expect(await normalizeSkill('Underwater basket weaving')).toMatchObject({ name: 'Underwater basket weaving', canonicalId: null, match: null })
  })

  it('semantic is used only at or above the cutoff', async () => {
    const semantic = { match: async () => [{ text: 'JS', id: 'onet:tech:oracle java', name: 'Oracle Java', similarity: 0.81 }] }
    const high = createNormalizer({ catalogue, semantic, cutoff: 0.8 })
    expect(await high.normalizeSkill('JS')).toMatchObject({ canonicalId: 'onet:tech:oracle java', match: 'semantic', similarity: 0.81 })
    const low = createNormalizer({ catalogue, semantic, cutoff: 0.82 })
    expect((await low.normalizeSkill('JS')).canonicalId).toBe(null)
  })
})

describe('mergeSkills', () => {
  it('merges case and version variants into one skill', async () => {
    const { normalizeSkill } = createNormalizer({ catalogue })
    const skills = []
    for (const text of ['python', 'Python 3', 'PYTHON']) skills.push(makeSkill({ ...(await normalizeSkill(text)), source: 'user_input' }))
    const merged = mergeSkills(skills)
    expect(merged).toHaveLength(1)
    expect(merged[0].originalText).toBe('python | Python 3 | PYTHON')
  })

  it('keeps unknown skills, deduped by name', () => {
    expect(mergeSkills([makeSkill({ name: 'Weaving', source: 'user_input' }), makeSkill({ name: 'weaving', source: 'user_input' })])).toHaveLength(1)
  })
})
