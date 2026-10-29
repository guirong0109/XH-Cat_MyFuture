// The CV/profile module server: static mockup screens (public/), shared modules (shared/) and the API.
// Spec: docs/superpowers/specs/2026-10-29-cv-profile-module-design.md
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { sendError } from './errors.js'
import { loadSkillCatalogue } from './skills/onetSkills.js'
import { createNormalizer } from './skills/normalize.js'
import { skillRoutes } from './routes/skills.js'
import { profileRoutes } from './routes/profiles.js'

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

  // Skill catalogue from the O*NET snapshot, loaded once on first use (a failed load is retried next time).
  let normalizerPromise = null
  const loadNormalizer = () => {
    normalizerPromise ??= loadSkillCatalogue(path.join(dataDir, 'onet'))
      .then((catalogue) => createNormalizer({ catalogue, semantic, cutoff: Number(process.env.SEMANTIC_CUTOFF) || null }))
      .catch((error) => {
        normalizerPromise = null
        throw error
      })
    return normalizerPromise
  }
  app.use(skillRoutes({ loadNormalizer }))
  app.use(profileRoutes({ loadNormalizer }))
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
