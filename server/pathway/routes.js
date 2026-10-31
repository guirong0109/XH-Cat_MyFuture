// Study Pathway route (spec §8, §9). The profile in the body is used for this answer and dropped: never stored, never
// logged (logs carry codes only). Answers are not cached by the browser or a proxy.
//
// POST /api/pathway  {profile, code, lang?}  -> Answer (server/pathway/service.js); unknown or unlisted code -> 404
//
// Same body size, validation and error shape as server/matching/routes.js: a malformed body (not JSON, over 64 kB,
// profile not an object, a list field not a list, code not a string of at most 32 characters) -> 400 bad_request.
// Pathway or matching data that cannot be read -> 503 data_unavailable.
import express from 'express'
import { sendError } from '../errors.js'
import { MatchingDataError } from '../matching/data.js'
import { badRequest, body, validProfile } from '../matching/routes.js'
import { PathwayDataError } from './data.js'

const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export function pathwayRoutes({ pathway, log = (message) => console.error(message) }) {
  const router = express.Router()

  router.post('/api/pathway', body, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    if (!plainObject(request.body) || !validProfile(request.body.profile)) return badRequest(response)
    const { code } = request.body
    if (typeof code !== 'string' || code.length > 32) return badRequest(response)
    if (!pathway) return sendError(response, 503, 'not_configured', 'Study pathway is not available on this server.')
    try {
      const answer = await pathway.pathway(request.body.profile, code, request)
      if (!answer) return sendError(response, 404, 'not_found', 'No such role in the current data.')
      return response.json(answer)
    } catch (error) {
      if (error instanceof PathwayDataError || error instanceof MatchingDataError) {
        log(`[pathway] data unavailable: ${error.file}`)
        return sendError(response, 503, 'data_unavailable', 'Study pathway data is not available right now.', true)
      }
      log(`[pathway] request failed: ${error?.name ?? 'Error'}`)
      return sendError(response, 500, 'request_failed', 'Something went wrong on our side.', true)
    }
  })

  return router
}
