// GET /api/interests → { source, version, areas } (O*NET interest areas for "Career interests and fields").
import express from 'express'
import { sendError } from '../errors.js'

export function interestRoutes({ loadAreas }) {
  const router = express.Router()
  router.get('/api/interests', async (request, response) => {
    try {
      const areas = await loadAreas()
      return response.json({ source: 'onet', version: areas.version, areas: areas.list })
    } catch {
      return sendError(response, 503, 'interests_unavailable', 'The list of interest areas is not available right now.', true)
    }
  })
  return router
}
