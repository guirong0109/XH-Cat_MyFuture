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
import { createReextractor, providersFromEnv } from './cv/reextract.js'
import { createAuth } from './auth.js'
import { authRoutes } from './routes/auth.js'
import { createD1FromEnv } from './store/d1.js'
import { createR2FromEnv } from './store/r2.js'
import { createOnetLiveFromEnv } from './occupations/onetLive.js'
import { createCache } from './occupations/cache.js'
import { loadOnetSnapshot } from './occupations/onetSnapshot.js'
import { createOccupationLookup } from './occupations/lookup.js'
import { readFile } from 'node:fs/promises'
import { createRadarServiceFromEnv } from './radar/service.js'
import { loadAiTasks } from './radar/aiTasks.js'
import { radarRoutes } from './radar/routes.js'
import { createRadarAccess } from './radar/access.js'
import { radarAdminRoutes, radarSessionRoutes } from './radar/adminRoutes.js'
import { createDemoService } from './radar/demo.js'
import { radarDemoRoutes } from './radar/demoRoutes.js'
import { loadRadarReferences } from './radar/references.js'
import { matchingAdminRoutes } from './matching/adminRoutes.js'
import { createMatchingServiceFromEnv } from './matching/service.js'
import { matchingRoutes } from './matching/routes.js'
import { pathwayAdminRoutes } from './pathway/adminRoutes.js'
import { loadPathwayData } from './pathway/data.js'
import { once } from './matching/service.js'
import { createPathwayServiceFromEnv } from './pathway/service.js'
import { pathwayRoutes } from './pathway/routes.js'
import { createOrgStore } from './org/store.js'
import { createOrgService } from './org/service.js'
import { orgRoutes } from './org/routes.js'
import { shareRoutes } from './org/shareRoutes.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(ROOT, 'data')

// Later tasks add their routes here. extraRoutes is a test hook only.
export function createApp({
  dataDir = DATA_DIR,
  fetchImpl = fetch,
  now = () => new Date(),
  d1 = createD1FromEnv(),
  tempStore = createR2FromEnv(),
  semantic = createSemanticFromEnv(),
  llmProviders = providersFromEnv(),
  onetLive = createOnetLiveFromEnv(),
  // Behind a reverse proxy set TRUST_PROXY (e.g. 1 = one proxy hop) so the sign-in and AI limits count each visitor.
  trustProxy = process.env.TRUST_PROXY ? (Number.isFinite(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : false,
  // Future Skills Radar: bundled data read-only without a writable store (R2, or RADAR_STORE=memory locally).
  radar = createRadarServiceFromEnv({ dataDir, fetchImpl, now }),
  // Radar admin and judge sign-in (RADAR_ADMIN_KEY, RADAR_DEMO_KEY, RADAR_SESSION_SECRET); fails closed without them.
  radarAccess = createRadarAccess({ env: process.env, now }),
  // Judge Trend Change Test: needs the Radar's writable store (R2, or RADAR_STORE=memory locally); null otherwise.
  radarDemo = undefined,
  // Career matching: data from dataDir (loaded once on first use), Radar signals (or a judge's demo session).
  matching = undefined,
  // Study pathway: data from dataDir (loaded once on first use), matching's role answer, pick decisions in the Radar store.
  pathway = undefined,
  // Pathway data already loaded by the start-up check (server/index.js), so it is not read twice; null = load on first use.
  pathwayData = null,
  // The read behind the one pathway loader (a test counts its calls); default loadPathwayData.
  pathwayRead = loadPathwayData,
  extraRoutes = null,
} = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', trustProxy)
  app.locals.config = { dataDir, fetchImpl, now, d1, tempStore, semantic, llmProviders, onetLive, radar }

  // Which optional services this server has, so the screens can say what is kept where.
  app.get('/api/health', (request, response) => response.json({ ok: true, features: { accounts: Boolean(d1), tempCopy: Boolean(tempStore), ai: llmProviders.length > 0 } }))

  // Accounts only with D1; guests work fully without it.
  const auth = d1 ? createAuth({ d1, tempStore, now }) : null
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
  app.use(profileRoutes({ loadNormalizer, auth, d1, tempStore, now }))
  // AI re-extraction: needs a provider (RunPod or Claude) and the temporary CV copy (R2).
  let reextractor = null
  const reextract = {
    run: async (args) => {
      reextractor ??= createReextractor({ tempStore, providers: llmProviders, fetchImpl, normalizer: await loadNormalizer(), now })
      return reextractor.run(args)
    },
  }
  app.use(cvRoutes({ loadCatalogue, loadNormalizer, semantic, cutoff, tempStore, reextractor: reextract, now }))

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
  // The demo reads only the synthetic base and the bundled reference data; storage only under demo/<sessionId>/.
  const demo = radarDemo !== undefined ? radarDemo : radar?.store ? createDemoService({
    store: radar.store,
    base: async () => JSON.parse(await readFile(path.join(dataDir, 'radar', 'demo', 'base.json'), 'utf8')),
    references: () => loadRadarReferences(dataDir),
    now,
    devStore: Boolean(radar.info?.().devStore),
  }) : null
  // The profile sent here is used for the answer and dropped: never stored, never logged.
  const matchingService = matching !== undefined ? matching : createMatchingServiceFromEnv({ dataDir, radar, demo, access: radarAccess, now })
  app.use(matchingRoutes({ matching: matchingService }))
  // The pathway reuses matching's role answer, so its numbers are matching's; the profile is never stored or logged.
  // One loader for the service and the admin routes: the start-up data, else one read (a failed read is tried again).
  const pathwayLoad = pathwayData ? async () => pathwayData : once(() => pathwayRead(dataDir))
  const pathwayService = pathway !== undefined ? pathway : createPathwayServiceFromEnv({ dataDir, loadData: pathwayLoad, matching: matchingService, store: radar?.store ?? null, now })
  app.use(pathwayRoutes({ pathway: pathwayService }))
  // Organisation view (HR and career centres): owner routes. Without D1 they answer 503 accounts_unavailable.
  // Team answers are never stored.
  {
    const orgStore = d1 ? createOrgStore({ d1, now }) : null
    const orgService = orgStore ? createOrgService({ store: orgStore, matching: matchingService, pathway: pathwayService, log: console.error }) : null
    let roleCodes = null
    const loadRoleCodes = () => {
      roleCodes ??= readFile(path.join(dataDir, 'emasco', 'role_details.json'), 'utf8')
        .then((raw) => new Set(JSON.parse(raw).roles.filter((r) => r.title).map((r) => r.code)))
        .catch((error) => { roleCodes = null; throw error })
      return roleCodes
    }
    let roleTitles = null
    const loadRoleTitles = () => {
      roleTitles ??= readFile(path.join(dataDir, 'emasco', 'role_details.json'), 'utf8')
        .then((raw) => new Map(JSON.parse(raw).roles.filter((r) => r.title).map((r) => [r.code, r.title])))
        .catch((error) => { roleTitles = null; throw error })
      return roleTitles
    }
    app.use(orgRoutes({ auth, store: orgStore, service: orgService, loadNormalizer, loadCatalogue, loadRoleCodes, dataDir, log: console.error, now }))
    // Own saved profile only (another user's id reads as missing). Returns the skills list or null.
    const loadProfileSkills = async (userId, profileId) => {
      const { rows } = await d1.query('SELECT json FROM profiles WHERE id = ? AND user_id = ?', [profileId, userId])
      if (!rows[0]) return null
      try {
        const skills = JSON.parse(rows[0].json)?.skills
        return Array.isArray(skills) ? skills : []
      } catch {
        return []
      }
    }
    // O*NET names of the shared items, for the employee's view of what HR holds
    const loadSkillNames = async () => {
      const catalogue = await loadCatalogue()
      return new Map([...catalogue.entries, ...(catalogue.more ?? [])].map((e) => [e.id, e.name]))
    }
    app.use(shareRoutes({ auth, store: orgStore, loadProfileSkills, loadRoleCodes, loadRoleTitles, loadSkillNames, log: console.error, now }))
  }
  if (radar) {
    let aiTasksPromise = null
    const aiTasks = () => (aiTasksPromise ??= loadAiTasks(dataDir))
    app.use(radarRoutes({ radar, aiTasks }))
    app.use(radarSessionRoutes({ access: radarAccess, demo }))
    app.use(radarAdminRoutes({ radar, access: radarAccess, now }))
    // Owner decisions on the SDG links (career matching), in the Radar review store.
    // A decision drops the matching service's cached SDG decisions, so the next matching answer shows it.
    app.use(matchingAdminRoutes({ radar, access: radarAccess, now, dataDir, onDecision: () => matchingService?.sdgDecided?.() }))
    // Owner decisions on the Study Pathway picks, in the same store; a decision drops the pathway service cached ones.
    app.use(pathwayAdminRoutes({ radar, access: radarAccess, now, dataDir, loadData: pathwayLoad, onDecision: () => pathwayService?.picksDecided?.() }))
    app.use(radarDemoRoutes({ demo, access: radarAccess, now }))
  }
  if (extraRoutes) extraRoutes(app)

  app.use('/api', (request, response) => sendError(response, 404, 'not_found', 'No such API route.'))
  app.use('/shared', express.static(path.join(ROOT, 'shared')))
  // three.js for the landing page's ATM intro, served from the installed package (no CDN; works offline).
  app.use('/vendor/three/build', express.static(path.join(ROOT, 'node_modules', 'three', 'build')))
  app.use('/vendor/three/addons', express.static(path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm')))
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
