// GET /api/fields/search?q= → { source, version, downloadedAt, candidates } (ISCED-F 2013 fields of study).
import express from 'express'
import { sendError } from '../errors.js'
import { IscedUnavailable } from '../fields/isced.js'

export function fieldRoutes({ loadIsced }) {
  const router = express.Router()
  router.get('/api/fields/search', async (request, response) => {
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (q.length < 2 || q.length > 100) return sendError(response, 400, 'bad_query', 'Search with 2 to 100 characters.')
    try {
      const isced = await loadIsced()
      return response.json({ source: 'isced', version: isced.manifest.version, downloadedAt: isced.manifest.downloadedAt, candidates: isced.search(q) })
    } catch (error) {
      if (!(error instanceof IscedUnavailable)) throw error
      return sendError(response, 503, 'fields_unavailable', 'The field of study list is not available right now.', true)
    }
  })
  return router
}
