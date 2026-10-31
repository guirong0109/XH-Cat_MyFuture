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
import { occupationRoutes } from './routes/occupations.js'
import { fieldRoutes } from './routes/fields.js'
import { loadIsced } from './fields/isced.js'
import { loadFieldSkills } from './fields/fieldSkills.js'
import { loadInterestAreas } from './interests/interestAreas.js'
import { interestRoutes } from './routes/interests.js'
import { cvRoutes } from './routes/cv.js'
import { createSemanticFromEnv } from './cv/semantic.js'
import { createAiReader, providerFromEnv } from './cv/aiRead.js'
import { createAuth } from './auth.js'
import { authRoutes } from './routes/auth.js'
import { createD1FromEnv } from './store/d1.js'
import { createOnetLiveFromEnv } from './occupations/onetLive.js'
import { createCache } from './occupations/cache.js'
import { loadOnetSnapshot } from './occupations/onetSnapshot.js'
import { createOccupationLookup } from './occupations/lookup.js'
import { readFile } from 'node:fs/promises'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Later tasks add their routes here. extraRoutes is a test hook only.
export function createApp({
  dataDir = path.join(ROOT, 'data'),
  fetchImpl = fetch,
  now = () => new Date(),
  d1 = createD1FromEnv(),
  semantic = createSemanticFromEnv(),
  aiProvider = providerFromEnv(process.env),
  onetLive = createOnetLiveFromEnv(),
  // Behind a reverse proxy set TRUST_PROXY (e.g. 1 = one proxy hop) so the sign-in and AI limits count each visitor.
  trustProxy = process.env.TRUST_PROXY ? (Number.isFinite(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : false,
  extraRoutes = null,
} = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', trustProxy)
  app.locals.config = { dataDir, fetchImpl, now, d1, semantic, aiProvider, onetLive }

  // Which optional services this server has, so the screens can say what is kept where.
  app.get('/api/health', (request, response) => response.json({ ok: true, features: { accounts: Boolean(d1), ai: Boolean(aiProvider) } }))

  // Accounts only with D1; guests work fully without it.
  const auth = d1 ? createAuth({ d1, now }) : null
  app.locals.auth = auth
  app.use(authRoutes({ auth }))

  // Skill catalogue from the O*NET snapshot, loaded once on first use (a failed load is retried next time).
  let cataloguePromise = null
  const loadCatalogue = () => {
    cataloguePromise ??= loadSkillCatalogue(path.join(dataDir, 'onet')).catch((error) => {
      cataloguePromise = null
      throw error
    })
    return cataloguePromise
  }
  // L3 runs only with a RunPod endpoint and the cutoff measured by Model Eval (docs/model-eval.md).
  const cutoff = Number(process.env.SEMANTIC_CUTOFF) || null
  let normalizer = null
  const loadNormalizer = async () => {
    normalizer ??= createNormalizer({ catalogue: await loadCatalogue(), semantic, cutoff })
    return normalizer
  }
  // With L3 on, embed the catalogue now: on the first upload it would not fit in the 20 s limit.
  if (semantic && cutoff) {
    loadCatalogue().then((catalogue) => semantic.match(['warm-up'], catalogue.entries)).catch((error) => console.error('[semantic] warm-up failed:', error?.kind ?? error?.name ?? 'Error'))
  }
  app.use(skillRoutes({ loadNormalizer, loadCatalogue }))
  app.use(profileRoutes({ loadNormalizer, auth, d1, now }))
  // DeepSeek reads every upload next to the rules reader; it needs CV_LLM_KEY. Built on first use, with the normalizer.
  let aiReader = null
  const lazyAiReader = aiProvider
    ? { read: async (args) => {
      aiReader ??= createAiReader({ provider: aiProvider, fetchImpl, normalizer: await loadNormalizer(), now })
      return aiReader.read(args)
    } }
    : null
  app.use(cvRoutes({ loadCatalogue, loadNormalizer, semantic, cutoff, aiReader: lazyAiReader, now }))

  const lookup = createOccupationLookup({
    live: onetLive,
    cache: createCache(path.join(dataDir, 'cache', 'onet')),
    snapshotLoader: () => loadOnetSnapshot(path.join(dataDir, 'onet')),
    emascoLoader: async () => JSON.parse(await readFile(path.join(dataDir, 'emasco', 'occupations.json'), 'utf8')),
    now,
  })
  app.use(occupationRoutes({ lookup }))
  // Field of study list (ISCED-F 2013), loaded once on first use (a failed load is retried next time).
  let iscedPromise = null
  const loadFields = () => {
    iscedPromise ??= loadIsced(path.join(dataDir, 'isced')).catch((error) => {
      iscedPromise = null
      throw error
    })
    return iscedPromise
  }
  let fieldSkillsPromise = null
  const loadSkillsOfFields = () => {
    fieldSkillsPromise ??= loadFieldSkills({ iscedDir: path.join(dataDir, 'isced'), onetDir: path.join(dataDir, 'onet') }).catch((error) => {
      fieldSkillsPromise = null
      throw error
    })
    return fieldSkillsPromise
  }
  app.use(fieldRoutes({ loadIsced: loadFields, loadFieldSkills: loadSkillsOfFields }))
  let areasPromise = null
  const loadAreas = () => {
    areasPromise ??= loadInterestAreas(path.join(dataDir, 'onet')).catch((error) => {
      areasPromise = null
      throw error
    })
    return areasPromise
  }
  app.use(interestRoutes({ loadAreas }))
  if (extraRoutes) extraRoutes(app)

  app.use('/api', (request, response) => sendError(response, 404, 'not_found', 'No such API route.'))
  app.use('/shared', express.static(path.join(ROOT, 'shared')))
  app.use(express.static(path.join(ROOT, 'public')))

  // Last resort: no stack trace and no file path in the answer.
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error)
    // A request the server cannot read (e.g. a broken %-escape in the URL) is the caller's error, not ours.
    if (error?.status >= 400 && error.status < 500) return sendError(response, error.status, 'bad_request', 'The request could not be read.')
    if (error?.name === 'StoreError') return sendError(response, 503, 'store_unavailable', 'Saved data is not reachable right now.', true)
    console.error('[server] request failed:', error?.name ?? 'Error')
    return sendError(response, 500, 'request_failed', 'Something went wrong on our side.', true)
  })
  return app
}
