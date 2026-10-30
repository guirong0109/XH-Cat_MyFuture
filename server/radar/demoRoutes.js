// Judge Trend Change Test routes (spec §8.3, §9, §13). Demo role only (an admin cookie gets 403); requests that change
// something need the session's CSRF token and a same-host Origin; at most 30 changes per minute per session.
//
// POST /api/demo/radar/apply   {scenario: 'A'|'B'|'C', edits?: [{entityId, period, value}], factor?} → before/after report
// GET  /api/demo/radar/diff    before/after report of the session's last change
// POST /api/demo/radar/reset   restore the synthetic base → report
//
// Without a durable writable store (R2, or RADAR_STORE=memory in development) every demo route answers not_configured.
// The session id comes from the signed cookie only; no request value is used as a key. Logs carry codes only.
import express from 'express'
import { jsonBody } from '../errors.js'
import { createWindowLimiter } from '../rateLimit.js'
import { DemoError } from './demo.js'

const MUTATIONS_PER_MINUTE = 30
const MINUTE = 60000

export const DEMO_ERRORS = {
  bad_request: [400, 'The request is not valid.', false],
  validation_failed: [422, 'The change did not pass validation; the last state is kept.', false],
  demo_expired: [410, 'This test session has ended. Sign in again with the judge key to start a new one.', false],
  demo_full: [503, 'All test sessions are in use. Please try again later.', true],
  not_configured: [503, 'The Trend Change Test is not available on this server.', false],
  too_many_attempts: [429, 'Too many changes in a minute. Please wait a moment and try again.', true],
  store_unavailable: [503, 'Saved test data is not reachable right now.', true],
}

export function sendDemoError(response, code, extra = null) {
  const known = Object.hasOwn(DEMO_ERRORS, code)
  const [status, message, retryable] = DEMO_ERRORS[known ? code : 'store_unavailable']
  const body = { error: { code: known ? code : 'store_unavailable', message, retryable } }
  return response.status(status).json(extra ? { ...body, ...extra } : body)
}

export const demoErrorCode = (error) => (error instanceof DemoError ? error.code : 'store_unavailable')

export function radarDemoRoutes({ demo, access, now = () => new Date(), log = (message) => console.info(message) }) {
  const router = express.Router()
  const mutations = createWindowLimiter({ limit: MUTATIONS_PER_MINUTE, windowMs: MINUTE, now: () => now().getTime() })

  router.use('/api/demo/radar', access.require('demo'))
  router.use('/api/demo/radar', (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    if (!demo) return sendDemoError(response, 'not_configured')
    return next()
  })

  const handle = (fn, { mutation = false } = {}) => async (request, response) => {
    const sessionId = request.radarSession.sessionId
    if (mutation && !mutations.hit(sessionId)) return sendDemoError(response, 'too_many_attempts')
    try {
      return response.json(await fn(sessionId, request))
    } catch (error) {
      const code = demoErrorCode(error)
      log(`[radar] demo request failed: ${code}`)
      return sendDemoError(response, code, code === 'validation_failed' ? { errors: error.errors ?? [] } : null)
    }
  }

  router.post('/api/demo/radar/apply', jsonBody('16kb'), handle((sessionId, request) => demo.apply(sessionId, request.body ?? {}), { mutation: true }))
  router.get('/api/demo/radar/diff', handle((sessionId) => demo.diff(sessionId)))
  router.post('/api/demo/radar/reset', handle((sessionId) => demo.reset(sessionId), { mutation: true }))
  return router
}
