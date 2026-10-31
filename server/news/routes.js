// AI news route (spec §7). No input and no user data: every visitor gets the same 10 lists; the browser picks the
// For-you fields from its own profile. A late request wakes the 3-hour refresh in the background (the host slept).
//
// GET /api/news -> NewsReply; a reply that cannot be built -> 503 news_unavailable.
import express from 'express'
import { sendError } from '../errors.js'

export function newsRoutes({ news }) {
  const router = express.Router()
  router.get('/api/news', async (request, response) => {
    news.wakeIfDue().catch((error) => console.error('[news] wake-up failed:', error?.code ?? error?.name ?? 'Error'))
    try {
      response.json(await news.snapshot())
    } catch (error) {
      console.error('[news] reply failed:', error?.name ?? 'Error')
      sendError(response, 503, 'news_unavailable', 'News is not available right now.', true)
    }
  })
  return router
}
