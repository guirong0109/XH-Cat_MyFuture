// POST /api/cv/extract (raw PDF or DOCX body, X-Interface-Language) → draft profile for the review (spec §6).
// The CV text is untrusted and never logged: only error names and codes reach the console.
import { randomUUID } from 'node:crypto'
import express from 'express'
import { LANGS } from '../../shared/i18n.js'
import { sendError } from '../errors.js'
import { detectLanguage } from '../cv/detectLanguage.js'
import { EXTRACTOR_VERSION, extractProfile } from '../cv/extract.js'
import { mergeDrafts } from '../cv/mergeDrafts.js'
import { readText } from '../cv/readText.js'
import { createSemanticStep } from '../cv/semantic.js'
import { validateFile } from '../cv/validateFile.js'

const MB = 1024 * 1024
// Left on the upload clock for building the answer after the AI wait ends.
const ANSWER_MARGIN_MS = 500
const MESSAGES = {
  unsupported_type: [415, 'Please upload a PDF or DOCX file.'],
  too_large: [413, 'The file is too large.'],
  encrypted: [422, 'The file is password-protected.'],
  corrupted: [422, 'The file could not be opened.'],
  no_text: [422, 'No text was found in the file.'],
  scanned_no_ocr: [422, 'The file looks like a scan; its text cannot be read.'],
}
// One AI answer or the reason it is missing: { status: 'ok', ... } or { status: 'skipped', reason }.
async function readWithAi({ aiReader, cvText, ip, interfaceLanguage, aiTimeoutMs }) {
  if (!aiReader || aiTimeoutMs <= 0) return { status: 'skipped', reason: 'ai_unavailable' }
  let timer
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ status: 'skipped', reason: 'ai_unavailable' }), aiTimeoutMs) })
  try {
    return await Promise.race([aiReader.read({ cvText, ip, interfaceLanguage }), late])
  } catch (error) {
    console.error('[cv] AI read failed:', error?.name ?? 'Error')
    return { status: 'skipped', reason: 'ai_unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
const fail = (response, code) => sendError(response, MESSAGES[code][0], code, MESSAGES[code][1])

export function cvRoutes({ loadCatalogue, loadNormalizer, semantic = null, cutoff = null, aiReader = null, now = () => new Date(), maxBytes = (Number(process.env.CV_MAX_MB) || 10) * MB, timeoutMs = 20000, aiTimeoutMs = 15000 }) {
  const router = express.Router()
  const rawBody = (request, response, next) =>
    express.raw({ type: () => true, limit: maxBytes })(request, response, (error) => {
      if (!error) return next()
      return error.type === 'entity.too.large' ? fail(response, 'too_large') : sendError(response, 400, 'bad_body', 'The upload could not be read.', true)
    })

  router.post('/api/cv/extract', rawBody, async (request, response) => {
    const buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)
    const checked = validateFile(buffer, { maxBytes })
    if (!checked.ok) return fail(response, checked.code)
    const interfaceLanguage = LANGS.includes(request.get('X-Interface-Language')) ? request.get('X-Interface-Language') : 'en'

    const startedAt = Date.now()
    let timer
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs) })
    const work = (async () => {
      const read = await readText(buffer, checked.type)
      if (!read.ok) return read
      const { language } = detectLanguage(read.lines)
      // The AI reads the same lines while the rules run; it never waits longer than aiTimeoutMs and never rejects.
      const ai = readWithAi({ aiReader, cvText: read.lines.join(String.fromCharCode(10)), ip: request.ip, interfaceLanguage, aiTimeoutMs: Math.min(aiTimeoutMs, timeoutMs - (Date.now() - startedAt) - ANSWER_MARGIN_MS) })
      const [catalogue, normalizer] = await Promise.all([loadCatalogue(), loadNormalizer()])
      const semanticStep = createSemanticStep({ semantic, catalogue, cutoff })
      const result = await extractProfile({ lines: read.lines, language, interfaceLanguage, catalogue, normalizer, semanticStep, now: now() })
      const answer = await ai
      if (answer.status !== 'ok') return { ok: true, language, ...result, warnings: [...result.warnings, answer.reason] }
      const merged = mergeDrafts({ profile: result.profile, uncertain: result.uncertain }, answer.profile)
      return { ok: true, language, ...result, ...merged, layers: [...result.layers, 'ai'], model: answer.model }
    })()
    let outcome
    try {
      outcome = await Promise.race([work, timeout])
    } catch (error) {
      console.error('[cv] extraction failed:', error?.name ?? 'Error')
      return sendError(response, 500, 'extraction_failed', 'The CV could not be processed.', true)
    } finally {
      clearTimeout(timer)
    }
    if (outcome.timeout) {
      work.catch(() => {})
      return sendError(response, 504, 'timeout', 'Reading the CV took too long.', true)
    }
    if (!outcome.ok) return fail(response, outcome.code)

    const extractionId = randomUUID()
    const { language, profile, uncertain, layers, warnings, model } = outcome
    return response.json({ status: 'ok', extractionId, language, profile, uncertain, extractor: { version: EXTRACTOR_VERSION, layers, ...(model ? { model } : {}) }, warnings })
  })

  return router
}
