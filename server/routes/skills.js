// POST /api/skills/normalize { texts } → { skills } (O*NET ids, candidates to pick from, or unknown).
import express from 'express'
import { jsonBody, sendError } from '../errors.js'

const MAX_TEXTS = 200
const MAX_LENGTH = 200

export function skillRoutes({ loadNormalizer }) {
  const router = express.Router()
  router.post('/api/skills/normalize', jsonBody('100kb'), async (request, response) => {
    const texts = request.body?.texts
    if (!Array.isArray(texts)) return sendError(response, 400, 'no_texts', 'Send texts as a list.')
    if (texts.length > MAX_TEXTS) return sendError(response, 413, 'too_many', `At most ${MAX_TEXTS} skills at once.`)
    if (texts.some((text) => typeof text !== 'string' || text.length > MAX_LENGTH)) return sendError(response, 400, 'bad_text', 'Each skill must be a short text.')
    const { normalizeSkill } = await loadNormalizer()
    return response.json({ skills: await Promise.all(texts.map(normalizeSkill)) })
  })
  return router
}
