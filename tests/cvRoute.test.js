import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { cvRoutes } from '../server/routes/cv.js'
import { readText } from '../server/cv/readText.js'
import { emptyProfile, validateProfile } from '../shared/profileSchema.js'
import { writeCatalogue } from './helpers/onetFixture.js'
import { createFakeTempStore } from './helpers/fakeStores.js'
import { DOC_BYTES, PNG_BYTES, SAMPLE_LINES, makeDocx, makePdf } from './helpers/cvFixtures.js'

let dir
let server
let base
const tempStore = createFakeTempStore()

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cvroute-'))
  await mkdir(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'onet'))
  server = createApp({ dataDir: dir, onetLive: null, tempStore, aiProvider: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const upload = (body, type = PDF, lang = 'ms', at = base) =>
  fetch(`${at}/api/cv/extract`, { method: 'POST', headers: { 'Content-Type': type, 'X-Interface-Language': lang }, body })

describe('POST /api/cv/extract', () => {
  it('a PDF CV gives a draft profile for review', async () => {
    const response = await upload(makePdf(SAMPLE_LINES))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: 'ok', language: expect.any(String), extractor: { version: 'cv-1.0', layers: ['L1', 'L2', 'L4'] }, warnings: ['semantic_unavailable', 'ai_unavailable'] })
    expect(body.extractionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.profile).toMatchObject({ profileStatus: 'draft', inputMethod: 'cv' })
    expect(body.profile.skills.map((s) => s.canonicalId)).toContain('onet:tech:python')
    expect(validateProfile(body.profile).ok).toBe(true)
  })

  it('a DOCX CV gives a draft too', async () => {
    const response = await upload(makeDocx([{ text: 'Skills', heading: true }, 'Python, Microsoft Excel', { text: 'Education', heading: true }, 'Diploma in Accounting, Politeknik Kuching, 2020', 'This line is here so the reader has enough letters to read']), DOCX)
    expect(response.status).toBe(200)
    const { profile } = await response.json()
    expect(profile.education.records[0]).toMatchObject({ qualification: 'Diploma', fieldOfStudy: 'Accounting', year: '2020' })
  })

  it('keeps the interface language the user chose, whatever the CV language', async () => {
    const { profile, language } = await (await upload(makePdf(SAMPLE_LINES), PDF, 'zh')).json()
    expect(profile.interfaceLanguage).toBe('zh')
    expect(profile.cvLanguage).toBe(language)
  })

  it('keeps no copy of the file: the store stays empty after an upload', async () => {
    await upload(makePdf(SAMPLE_LINES))
    expect(tempStore.files.size).toBe(0)
  })

  it.each([
    ['encrypted PDF', makePdf(SAMPLE_LINES, { encrypt: true }), PDF, 422, 'encrypted'],
    ['scanned PDF', makePdf([]), PDF, 422, 'scanned_no_ocr'],
    ['image', PNG_BYTES, 'image/png', 415, 'unsupported_type'],
    ['legacy .doc', DOC_BYTES, 'application/msword', 415, 'unsupported_type'],
    ['empty body', Buffer.alloc(0), PDF, 415, 'unsupported_type'],
  ])('%s → %i %s', async (_, body, type, status, code) => {
    const response = await upload(body, type)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { code, message: expect.any(String), retryable: false } })
  })

  it('a file over 10 MB → 413 too_large', async () => {
    const response = await upload(Buffer.alloc(10 * 1024 * 1024 + 1, 0x20))
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('too_large')
  })

  it('cv text never appears in console output', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((name) => vi.spyOn(console, name))
    try {
      await upload(makePdf(['Secret Person Zulkifli', 'SKILLS', 'Python, Underwater welding, Leadership of the secret team']))
      await upload(makePdf(['Secret Person Zulkifli'], { encrypt: true }))
      const printed = spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join('\n')
      expect(printed).not.toContain('Zulkifli')
      expect(printed).not.toContain('Underwater')
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  it('POST /api/cv/reextract no longer exists → 404', async () => {
    const response = await fetch(`${base}/api/cv/reextract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(404)
  })

  it('an extraction slower than the time limit → 504 timeout, retryable', async () => {
    const app = express()
    app.use(cvRoutes({ loadNormalizer: () => new Promise(() => {}), loadCatalogue: () => new Promise(() => {}), timeoutMs: 50 }))
    const slow = app.listen(0)
    await new Promise((resolve) => slow.once('listening', resolve))
    try {
      const response = await upload(makePdf(SAMPLE_LINES), PDF, 'en', `http://127.0.0.1:${slow.address().port}`)
      expect(response.status).toBe(504)
      expect(await response.json()).toEqual({ error: { code: 'timeout', message: expect.any(String), retryable: true } })
    } finally {
      await new Promise((resolve) => slow.close(resolve))
    }
  })

  describe('with the AI reader', () => {
    const AI_JOB = { jobTitle: 'Barista', employer: 'Kopi Corner', evidence: 'Barista at Kopi Corner' }
    const aiProfile = () => {
      const profile = emptyProfile({ inputMethod: 'cv', interfaceLanguage: 'en' })
      profile.employment.records = [{ ...AI_JOB, employer: 'Kopi Corner', extraction: { method: 'ai', evidence: AI_JOB.evidence } }]
      return profile
    }
    const serve = async (aiReader, extra = {}) => {
      const { loadSkillCatalogue } = await import('../server/skills/onetSkills.js')
      const { createNormalizer } = await import('../server/skills/normalize.js')
      const catalogue = await loadSkillCatalogue(path.join(dir, 'onet'))
      const normalizer = createNormalizer({ catalogue })
      const app = express()
      app.use(cvRoutes({ loadCatalogue: async () => catalogue, loadNormalizer: async () => normalizer, aiReader, ...extra }))
      const srv = app.listen(0)
      await new Promise((resolve) => srv.once('listening', resolve))
      const run = (body, type, lang) => upload(body, type, lang, `http://127.0.0.1:${srv.address().port}`)
      return { run, close: () => new Promise((resolve) => srv.close(resolve)) }
    }

    it('merged draft: the AI-only job is in the answer, layers has ai, model is set, no ai warning', async () => {
      const aiReader = { read: async () => ({ status: 'ok', model: 'deepseek-flash', dropped: 0, usage: {}, profile: aiProfile() }) }
      const s = await serve(aiReader)
      try {
        const body = await (await s.run(makePdf(SAMPLE_LINES), PDF, 'en')).json()
        expect(body.extractor.layers).toContain('ai')
        expect(body.extractor.model).toBe('deepseek-flash')
        expect(body.warnings.filter((w) => w.startsWith('ai_'))).toEqual([])
        expect(body.profile.employment.records.map((r) => r.jobTitle)).toContain('Barista')
      } finally { await s.close() }
    })

    it('no aiReader → rules only with ai_unavailable', async () => {
      const s = await serve(null)
      try {
        const response = await s.run(makePdf(SAMPLE_LINES), PDF, 'en')
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.warnings).toContain('ai_unavailable')
        expect(body.extractor.layers).not.toContain('ai')
        expect(body.extractor.model).toBeUndefined()
      } finally { await s.close() }
    })

    it('skipped ai_limit → warning ai_limit', async () => {
      const s = await serve({ read: async () => ({ status: 'skipped', reason: 'ai_limit' }) })
      try {
        const body = await (await s.run(makePdf(SAMPLE_LINES), PDF, 'en')).json()
        expect(body.warnings).toContain('ai_limit')
        expect(body.extractor.layers).not.toContain('ai')
      } finally { await s.close() }
    })

    it('slow AI → the rules draft comes back before the upload limit, with ai_unavailable', async () => {
      const s = await serve({ read: () => new Promise(() => {}) }, { timeoutMs: 3000, aiTimeoutMs: 100 })
      try {
        const response = await s.run(makePdf(SAMPLE_LINES), PDF, 'en')
        expect(response.status).toBe(200)
        expect((await response.json()).warnings).toContain('ai_unavailable')
      } finally { await s.close() }
    })

    it('AI limit larger than the upload limit → still 200 with the rules draft, not 504', async () => {
      const s = await serve({ read: () => new Promise(() => {}) }, { timeoutMs: 2000, aiTimeoutMs: 10000 })
      try {
        const response = await s.run(makePdf(SAMPLE_LINES), PDF, 'en')
        expect(response.status).toBe(200)
        expect((await response.json()).warnings).toContain('ai_unavailable')
      } finally { await s.close() }
    })

    it('the AI reader throws → 200 with the rules draft and ai_unavailable; no CV text is logged', async () => {
      const spies = ['log', 'info', 'warn', 'error', 'debug'].map((name) => vi.spyOn(console, name))
      const s = await serve({ read: async () => { throw new Error('boom') } })
      try {
        const response = await s.run(makePdf(['Secret Person Zulkifli', ...SAMPLE_LINES]), PDF, 'en')
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.status).toBe('ok')
        expect(body.warnings).toContain('ai_unavailable')
        expect(body.extractor.layers).not.toContain('ai')
        expect(validateProfile(body.profile).ok).toBe(true)
        const printed = spies.flatMap((spy) => spy.mock.calls.flat()).map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join('\n')
        expect(printed).not.toContain('Zulkifli')
      } finally {
        spies.forEach((spy) => spy.mockRestore())
        await s.close()
      }
    })

    it('the AI gets the same lines and the network address', async () => {
      const seen = []
      const s = await serve({ read: async (args) => { seen.push(args); return { status: 'skipped', reason: 'ai_unavailable' } } })
      try {
        await s.run(makePdf(SAMPLE_LINES), PDF, 'ms')
        expect(seen).toHaveLength(1)
        expect(seen[0].cvText).toBe((await readText(makePdf(SAMPLE_LINES), 'pdf')).lines.join(String.fromCharCode(10)))
        expect(seen[0].ip).toEqual(expect.any(String))
        expect(seen[0].interfaceLanguage).toBe('ms')
      } finally { await s.close() }
    })
  })
})
