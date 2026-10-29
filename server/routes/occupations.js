// GET /api/occupations/search?q= → { state, source, version, fetchedAt, cacheStatus, warning, candidates }.
import express from 'express'
import { sendError } from '../errors.js'

export function occupationRoutes({ lookup, limiter = null }) {
  const router = express.Router()
  router.get('/api/occupations/search', async (request, response) => {
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (q.length < 2 || q.length > 100) return sendError(response, 400, 'bad_query', 'Search with 2 to 100 characters.')
    if (limiter && !limiter.hit(request.ip)) return sendError(response, 429, 'rate_limited', 'Too many searches. Please wait a minute.', true)
    return response.json(await lookup.search(q))
  })
  return router
}
