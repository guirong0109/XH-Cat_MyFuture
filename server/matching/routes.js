// Career matching routes (spec §8, §9). The profile in the body is used for this answer and dropped: never stored,
// never logged (logs carry codes only). Answers are not cached by the browser or a proxy.
//
// POST /api/matching       {profile, lang?}        -> ListAnswer (every role: Skill Match or why not, bands, SDG goals)
// POST /api/matching/role  {profile, code, lang?}  -> RoleAnswer (the card detail); unknown or unlisted code -> 404
//
// A malformed body (not JSON, over 64 kB, profile not an object, a list field not a list) -> 400 bad_request.
// Matching data that cannot be read -> 503 data_unavailable.
import express from 'express'
import { sendError } from '../errors.js'
import { MatchingDataError } from './data.js'

const LIMIT = '64kb'
const LIST_FIELDS = [['skills'], ['education', 'records'], ['employment', 'records'], ['occupationMappings']]
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const badRequest = (response) => sendError(response, 400, 'bad_request', 'The request is not valid.')

// JSON body of at most 64 kB; any reading error (bad JSON, too large) is a bad request.
const body = (request, response, next) => express.json({ limit: LIMIT })(request, response, (error) => (error ? badRequest(response) : next()))

function validProfile(profile) {
  if (!plainObject(profile)) return false
  for (const [first, second] of LIST_FIELDS) {
    const parent = profile[first]
    if (second === undefined) {
      if (parent !== undefined && !Array.isArray(parent)) return false
      continue
    }
    if (parent === undefined) continue
    if (!plainObject(parent)) return false
    if (parent[second] !== undefined && !Array.isArray(parent[second])) return false
  }
  return true
}

export function matchingRoutes({ matching, log = (message) => console.error(message) }) {
  const router = express.Router()

  const handle = (fn) => async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    if (!plainObject(request.body) || !validProfile(request.body.profile)) return badRequest(response)
    if (!matching) return sendError(response, 503, 'not_configured', 'Career matching is not available on this server.')
    try {
      return await fn(request, response)
    } catch (error) {
      if (error instanceof MatchingDataError) {
        log(`[matching] data unavailable: ${error.file}`)
        return sendError(response, 503, 'data_unavailable', 'Career matching data is not available right now.', true)
      }
      log(`[matching] request failed: ${error?.name ?? 'Error'}`)
      return sendError(response, 500, 'request_failed', 'Something went wrong on our side.', true)
    }
  }

  router.post('/api/matching', body, handle(async (request, response) => response.json(await matching.list(request.body.profile, request))))

  router.post('/api/matching/role', body, handle(async (request, response) => {
    const { code } = request.body
    if (typeof code !== 'string' || code.length > 32) return badRequest(response)
    const answer = await matching.role(request.body.profile, code, request)
    if (!answer) return sendError(response, 404, 'not_found', 'No such role in the current data.')
    return response.json(answer)
  }))

  return router
}
