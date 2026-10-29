// GET /api/fields/search?q= → { source, version, downloadedAt, candidates } (ISCED-F 2013 fields of study).
// GET /api/fields/:code/skills → { field, jobs, isced, onet, suggestions } (skills typical of the field's O*NET jobs).
import express from 'express'
import { sendError } from '../errors.js'
import { IscedUnavailable } from '../fields/isced.js'

const unavailable = (response) => sendError(response, 503, 'fields_unavailable', 'The field of study list is not available right now.', true)

export function fieldRoutes({ loadIsced, loadFieldSkills }) {
  const router = express.Router()
  router.get('/api/fields/search', async (request, response) => {
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (q.length < 2 || q.length > 100) return sendError(response, 400, 'bad_query', 'Search with 2 to 100 characters.')
    try {
      const isced = await loadIsced()
      return response.json({ source: 'isced', version: isced.manifest.version, downloadedAt: isced.manifest.downloadedAt, candidates: isced.search(q) })
    } catch (error) {
      if (!(error instanceof IscedUnavailable)) throw error
      return unavailable(response)
    }
  })
  router.get('/api/fields/:code/skills', async (request, response) => {
    const { code } = request.params
    if (!/^\d{4}$/.test(code)) return sendError(response, 400, 'bad_field', 'A field code has 4 digits.')
    try {
      const fieldSkills = await loadFieldSkills()
      if (!fieldSkills.has(code)) return sendError(response, 404, 'unknown_field', 'No such field of study.')
      return response.json({ ...fieldSkills.suggest(code), ...fieldSkills.versions })
    } catch (error) {
      if (!(error instanceof IscedUnavailable)) throw error
      return unavailable(response)
    }
  })
  return router
}
