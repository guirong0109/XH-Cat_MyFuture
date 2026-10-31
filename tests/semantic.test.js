import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSemantic, createSemanticFromEnv, createSemanticStep } from '../server/cv/semantic.js'
import { extractProfile } from '../server/cv/extract.js'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'
import { createNormalizer } from '../server/skills/normalize.js'
import { writeCatalogue } from './helpers/onetFixture.js'

// A fake OpenAI-compatible /embeddings endpoint: each known text gets a fixed vector, everything else a far one.
const VECTORS = {
  javascript: [1, 0, 0],
  js: [0.95, 0.31, 0],
  'machine learning': [0, 1, 0],
  'pembelajaran mesin': [0.05, 0.86, 0.5],
}
function fakeEndpoint({ fail = false } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    if (fail) return new Response('busy', { status: 503 })
    const data = JSON.parse(init.body).input.map((text, index) => ({ index, embedding: VECTORS[text.toLowerCase()] ?? [0, 0, 1] }))
    return Response.json({ data: data.reverse() })
  }
  return { calls, fetchImpl }
}
const TARGETS = [{ id: 'onet:tech:javascript', name: 'JavaScript' }, { id: 'x:ml', name: 'Machine learning' }]

describe('createSemantic (RunPod OpenAI-compatible embeddings)', () => {
  it('embed posts texts and returns vectors', async () => {
    const { calls, fetchImpl } = fakeEndpoint()
    const semantic = createSemantic({ url: 'https://api.runpod.ai/v2/abc/openai/v1/', key: 'k', model: 'BAAI/bge-m3', fetchImpl })
    expect(await semantic.embed(['JS', 'JavaScript'])).toEqual([[0.95, 0.31, 0], [1, 0, 0]])
    expect(calls[0].url).toBe('https://api.runpod.ai/v2/abc/openai/v1/embeddings')
    expect(calls[0].headers.Authorization).toBe('Bearer k')
    expect(calls[0].body).toEqual({ model: 'BAAI/bge-m3', input: ['JS', 'JavaScript'] })
  })

  it('match returns cosine similarities and embeds the targets once', async () => {
    const { calls, fetchImpl } = fakeEndpoint()
    const semantic = createSemantic({ url: 'http://x/v1', key: 'k', model: 'm', fetchImpl })
    const [js, ml] = await semantic.match(['JS', 'Pembelajaran mesin'], TARGETS)
    expect(js).toMatchObject({ text: 'JS', id: 'onet:tech:javascript', name: 'JavaScript' })
    expect(js.similarity).toBeCloseTo(0.95 / Math.hypot(0.95, 0.31), 3)
    expect(ml).toMatchObject({ id: 'x:ml' })
    await semantic.match(['JS'], TARGETS)
    expect(calls.filter((c) => c.body.input.includes('JavaScript'))).toHaveLength(1)
  })

  it('a failing endpoint throws, and no settings means no client', async () => {
    const semantic = createSemantic({ url: 'http://x/v1', key: 'k', model: 'm', fetchImpl: fakeEndpoint({ fail: true }).fetchImpl })
    await expect(semantic.embed(['JS'])).rejects.toThrow()
    expect(createSemanticFromEnv({})).toBe(null)
  })
})

describe('L3 in extractProfile', () => {
  let dir
  let catalogue
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'semantic-'))
    await writeCatalogue(dir)
    catalogue = await loadSkillCatalogue(dir)
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  const NOW = new Date('2026-10-29T00:00:00Z')
  const LINES = ['SKILLS', 'Python, JS, Underwater welding']
  const fixed = (similarity) => ({ match: async (texts) => texts.map((text) => (text === 'JS' ? { text, id: 'onet:tech:javascript', name: 'JavaScript', similarity } : { text, id: 'onet:tech:python', name: 'Python', similarity: 0.2 })) })
  const run = (semantic, cutoff = 0.8) => extractProfile({
    lines: LINES, language: 'en', interfaceLanguage: 'en', catalogue, normalizer: createNormalizer({ catalogue }), now: NOW,
    semanticStep: createSemanticStep({ semantic, catalogue, cutoff }),
  })

  it('extract keeps a semantic skill only at or above the cutoff, marked inferred', async () => {
    const { profile, layers, warnings } = await run(fixed(0.9))
    const js = profile.skills.find((s) => s.canonicalId === 'onet:tech:javascript')
    expect(js).toMatchObject({ name: 'JavaScript', originalText: 'JS', source: 'cv_semantic', userConfirmed: false, proficiency: null })
    expect(js.extraction).toMatchObject({ method: 'embedding', kind: 'inferred', confidence: 0.9 })
    expect(layers).toEqual(['L1', 'L2', 'L3', 'L4'])
    expect(warnings).toEqual([])
    const below = await run(fixed(0.79))
    expect(below.profile.skills.find((s) => s.originalText === 'JS').canonicalId).toBe(null)
  })

  it('a semantic match just above the cutoff is listed as low_similarity', async () => {
    const { profile, uncertain } = await run(fixed(0.82))
    const i = profile.skills.findIndex((s) => s.canonicalId === 'onet:tech:javascript')
    expect(uncertain).toContainEqual({ path: `skills.${i}`, reason: 'low_similarity' })
  })

  it('endpoint failure skips L3 with a warning and keeps L2 results', async () => {
    const { profile, layers, warnings } = await run({ match: async () => { throw new Error('down') } })
    expect(layers).toEqual(['L1', 'L2', 'L4'])
    expect(warnings).toEqual(['semantic_failed'])
    expect(profile.skills.map((s) => s.canonicalId)).toContain('onet:tech:python')
  })
})

describe('L3 warm-up', () => {
  it('with an endpoint and a cutoff, the catalogue is embedded when the server starts, not on the first upload', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'warm-'))
    await import('node:fs/promises').then((fs) => fs.mkdir(path.join(dir, 'onet')))
    await writeCatalogue(path.join(dir, 'onet'))
    const seen = []
    const semantic = { match: async (texts, targets) => { seen.push(targets.length); return [] } }
    const before = process.env.SEMANTIC_CUTOFF
    process.env.SEMANTIC_CUTOFF = '0.8'
    try {
      const { createApp } = await import('../server/app.js')
      createApp({ dataDir: dir, onetLive: null, semantic, d1: null, aiProvider: null })
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(seen.length).toBe(1)
      expect(seen[0]).toBeGreaterThan(0)
    } finally {
      if (before === undefined) delete process.env.SEMANTIC_CUTOFF
      else process.env.SEMANTIC_CUTOFF = before
      await rm(dir, { recursive: true, force: true })
    }
  })
})
