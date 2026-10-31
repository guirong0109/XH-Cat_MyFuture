import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadSkillCatalogue, ONET_LINKABLE, searchSkills } from '../server/skills/onetSkills.js'
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
  it('has one entry per software example, skill element and knowledge area', () => {
    expect(catalogue.version).toBe('31.0')
    expect(catalogue.entries.map((e) => e.id).sort()).toEqual([
      'onet:el:2.A.1.a', 'onet:el:2.A.1.e', 'onet:kn:2.C.1.e', 'onet:kn:2.C.4.a', 'onet:kn:2.C.9.b',
      'onet:tech:alpha beta ab', 'onet:tech:apple banana ab', 'onet:tech:flutter', 'onet:tech:google', 'onet:tech:javascript', 'onet:tech:microsoft excel', 'onet:tech:microsoft sql server', 'onet:tech:node.js', 'onet:tech:oracle java',
      'onet:tech:petra geology', 'onet:tech:php', 'onet:tech:python', 'onet:tech:react', 'onet:tech:structure query language sql', 'onet:tech:structured query language sql', 'onet:tech:treasury communications system',
    ])
    expect(catalogue.entries.find((e) => e.id === 'onet:tech:python').category).toBe('Development environment software')
    expect(catalogue.entries.find((e) => e.id === 'onet:kn:2.C.1.e')).toMatchObject({ category: 'O*NET knowledge', occupations: 1 })
  })

  it('keeps work styles and work activities apart; knowledge is linkable', () => {
    expect(catalogue.more.map((e) => e.id).sort()).toEqual(['onet:dwa:4.A.1.b.2.i.1', 'onet:dwa:4.A.4.a.2.i.1', 'onet:ws:1.D.1.a'])
    expect(catalogue.byName.has('leadership orientation')).toBe(false)
    expect(ONET_LINKABLE(catalogue).every((e) => /^onet:(el|kn):/.test(e.id))).toBe(true)
    expect(ONET_LINKABLE(catalogue).map((e) => e.id)).toContain('onet:kn:2.C.1.e')
    expect(ONET_LINKABLE(catalogue).map((e) => e.id)).not.toContain('onet:tech:python')
  })

  it('searchSkills lists a knowledge area once', () => {
    expect(searchSkills(catalogue, 'Customer and Personal').filter((s) => s.id === 'onet:kn:2.C.1.e')).toHaveLength(1)
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

  it('a knowledge area links by exact name; a skill of the same name wins', async () => {
    expect(await normalizeSkill('Customer and Personal Service')).toMatchObject({ canonicalId: 'onet:kn:2.C.1.e', match: 'exact' })
    expect(await normalizeSkill('Mathematics')).toMatchObject({ canonicalId: 'onet:el:2.A.1.e', match: 'exact' })
  })

  it('a short form links to the most used software whose words spell it', async () => {
    expect(await normalizeSkill('SQL')).toMatchObject({ canonicalId: 'onet:tech:structured query language sql', match: 'short_form', originalText: 'SQL' })
  })

  it('a tied short form links nothing and offers both', async () => {
    const out = await normalizeSkill('AB')
    expect(out.canonicalId).toBe(null)
    expect(out.candidates.map((c) => c.id).sort()).toEqual(['onet:tech:alpha beta ab', 'onet:tech:apple banana ab'])
  })

  it('MS becomes Microsoft', async () => {
    expect(await normalizeSkill('MS Excel')).toMatchObject({ canonicalId: 'onet:tech:microsoft excel', match: 'short_form', originalText: 'MS Excel' })
  })

  it('lower-case sql is not a short form', async () => {
    expect((await normalizeSkill('sql')).match).not.toBe('short_form')
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
