// The CV/profile module server: static mockup screens (public/), shared modules (shared/) and the API.
// Spec: docs/superpowers/specs/2026-10-29-cv-profile-module-design.md
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { sendError } from './errors.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Later tasks add their routes here. extraRoutes is a test hook only.
export function createApp({
  dataDir = path.join(ROOT, 'data'),
  fetchImpl = fetch,
  now = () => new Date(),
  d1 = null,
  tempStore = null,
  semantic = null,
  llmProviders = [],
  onetLive = null,
  extraRoutes = null,
} = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.locals.config = { dataDir, fetchImpl, now, d1, tempStore, semantic, llmProviders, onetLive }

  app.get('/api/health', (request, response) => response.json({ ok: true }))
  if (extraRoutes) extraRoutes(app)

  app.use('/api', (request, response) => sendError(response, 404, 'not_found', 'No such API route.'))
  app.use('/shared', express.static(path.join(ROOT, 'shared')))
  app.use(express.static(path.join(ROOT, 'public')))

  // Last resort: no stack trace and no file path in the answer.
  app.use((error, request, response, next) => {
    console.error('[server] request failed:', error?.name ?? 'Error')
    if (response.headersSent) return next(error)
    return sendError(response, 500, 'request_failed', 'Something went wrong on our side.', true)
  })
  return app
}
