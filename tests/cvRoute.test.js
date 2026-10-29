import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { cvRoutes } from '../server/routes/cv.js'
import { validateProfile } from '../shared/profileSchema.js'
import { writeCatalogue } from './helpers/onetFixture.js'
import { DOC_BYTES, PNG_BYTES, SAMPLE_LINES, makeDocx, makePdf } from './helpers/cvFixtures.js'

let dir
let server
let base
const stored = []
const tempStore = { put: async (key, buffer, contentType) => stored.push({ key, size: buffer.length, contentType }) }

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cvroute-'))
  await mkdir(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'onet'))
  server = createApp({ dataDir: dir, onetLive: null, tempStore, llmProviders: [] }).listen(0)
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
    expect(body).toMatchObject({ status: 'ok', language: expect.any(String), extractor: { version: 'cv-1.0', layers: ['L1', 'L2', 'L4'] }, warnings: ['semantic_unavailable'] })
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

  it('stores the file as cv-temp/<extractionId> when temporary storage is configured', async () => {
    const { extractionId } = await (await upload(makePdf(SAMPLE_LINES))).json()
    expect(stored).toContainEqual({ key: `cv-temp/${extractionId}`, size: expect.any(Number), contentType: PDF })
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

  it('re-extraction: no consent → 400 consent_required; no provider → 503 ai_unavailable not_configured', async () => {
    const post = (body) => fetch(`${base}/api/cv/reextract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const noConsent = await post({ extractionId: '0b1e9a3c-1111-4222-8333-944455556666', consent: false })
    expect(noConsent.status).toBe(400)
    expect((await noConsent.json()).error.code).toBe('consent_required')
    const off = await post({ extractionId: '0b1e9a3c-1111-4222-8333-944455556666', consent: true })
    expect(off.status).toBe(503)
    expect(await off.json()).toEqual({ error: { code: 'ai_unavailable', message: expect.any(String), retryable: false }, reason: 'not_configured' })
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
})
