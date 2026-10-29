// GET /api/occupations/search?q= → { state, source, version, fetchedAt, cacheStatus, warning, candidates }.
import express from 'express'
import { sendError } from '../errors.js'

export function occupationRoutes({ lookup }) {
  const router = express.Router()
  router.get('/api/occupations/search', async (request, response) => {
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (q.length < 2 || q.length > 100) return sendError(response, 400, 'bad_query', 'Search with 2 to 100 characters.')
    return response.json(await lookup.search(q))
  })
  return router
}
