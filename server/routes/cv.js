// POST /api/cv/extract (raw PDF or DOCX body, X-Interface-Language) → draft profile for the review (spec §6).
// The CV text is untrusted and never logged: only error names and codes reach the console.
import { randomUUID } from 'node:crypto'
import express from 'express'
import { LANGS } from '../../shared/i18n.js'
import { jsonBody, sendError } from '../errors.js'
import { detectLanguage } from '../cv/detectLanguage.js'
import { EXTRACTOR_VERSION, extractProfile } from '../cv/extract.js'
import { readText } from '../cv/readText.js'
import { createSemanticStep } from '../cv/semantic.js'
import { validateFile } from '../cv/validateFile.js'

const MB = 1024 * 1024
const CONTENT_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const MESSAGES = {
  unsupported_type: [415, 'Please upload a PDF or DOCX file.'],
  too_large: [413, 'The file is too large.'],
  encrypted: [422, 'The file is password-protected.'],
  corrupted: [422, 'The file could not be opened.'],
  no_text: [422, 'No text was found in the file.'],
  scanned_no_ocr: [422, 'The file looks like a scan; its text cannot be read.'],
}
const fail = (response, code) => sendError(response, MESSAGES[code][0], code, MESSAGES[code][1])

export function cvRoutes({ loadCatalogue, loadNormalizer, semantic = null, cutoff = null, tempStore = null, reextractor = null, limiter = null, now = () => new Date(), maxBytes = (Number(process.env.CV_MAX_MB) || 10) * MB, timeoutMs = 20000 }) {
  const router = express.Router()
  const rawBody = (request, response, next) =>
    express.raw({ type: () => true, limit: maxBytes })(request, response, (error) => {
      if (!error) return next()
      return error.type === 'entity.too.large' ? fail(response, 'too_large') : sendError(response, 400, 'bad_body', 'The upload could not be read.', true)
    })

  router.post('/api/cv/extract', (request, response, next) =>
    (limiter && !limiter.hit(request.ip) ? sendError(response, 429, 'rate_limited', 'Too many uploads. Please wait a minute.', true) : next()), rawBody, async (request, response) => {
    const buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)
    const checked = validateFile(buffer, { maxBytes })
    if (!checked.ok) return fail(response, checked.code)
    const interfaceLanguage = LANGS.includes(request.get('X-Interface-Language')) ? request.get('X-Interface-Language') : 'en'

    let timer
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs) })
    const work = (async () => {
      const read = await readText(buffer, checked.type)
      if (!read.ok) return read
      const { language } = detectLanguage(read.lines)
      const [catalogue, normalizer] = await Promise.all([loadCatalogue(), loadNormalizer()])
      const semanticStep = createSemanticStep({ semantic, catalogue, cutoff })
      const result = await extractProfile({ lines: read.lines, language, interfaceLanguage, catalogue, normalizer, semanticStep, now: now() })
      return { ok: true, language, ...result }
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
    if (tempStore) {
      try {
        await tempStore.put(`cv-temp/${extractionId}`, buffer, CONTENT_TYPES[checked.type])
      } catch (error) {
        console.error('[cv] temporary store failed:', error?.name ?? 'Error')
      }
    }
    const { language, profile, uncertain, layers, warnings } = outcome
    return response.json({ status: 'ok', extractionId, language, profile, uncertain, extractor: { version: EXTRACTOR_VERSION, layers }, warnings })
  })

  // POST /api/cv/reextract { extractionId, consent, interfaceLanguage } (spec §9). The form is never changed here:
  // the answer is a suggestion for the compare view.
  router.post('/api/cv/reextract', jsonBody('10kb'), async (request, response) => {
    const { extractionId, consent, interfaceLanguage } = request.body ?? {}
    if (consent !== true) return sendError(response, 400, 'consent_required', 'Please agree before the CV is sent to an AI service.')
    const out = reextractor
      ? await reextractor.run({ extractionId, consent, ip: request.ip, interfaceLanguage: LANGS.includes(interfaceLanguage) ? interfaceLanguage : 'en' })
      : { status: 'unavailable', reason: 'not_configured' }
    if (out.status === 'ok') return response.json(out)
    if (out.code === 'rate_limited') return sendError(response, 429, 'rate_limited', 'You have used the AI re-read too often. Please try later.', true)
    if (out.code === 'consent_required') return sendError(response, 400, 'consent_required', 'Please agree before the CV is sent to an AI service.')
    return response.status(503).json({
      error: { code: 'ai_unavailable', message: 'The AI re-read is not available right now. Your form is unchanged.', retryable: out.reason === 'providers_failed' },
      reason: out.reason,
    })
  })
  return router
}
