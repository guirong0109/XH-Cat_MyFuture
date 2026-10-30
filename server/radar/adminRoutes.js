// Future Skills Radar sign-in and admin API (spec §8, §13). Every admin route checks the admin role on the server;
// requests that change something also need the session's CSRF token and a same-host Origin (server/radar/access.js).
//
// POST /api/radar/session               {role: 'admin'|'demo', key, label?} → fr_radar cookie + {csrf, expiresAt}
// POST /api/radar/logout                end this session
// GET  /api/admin/radar/status          last checks (stored ingest log), recent log, conflicts, orphans (scan of prod/)
// POST /api/admin/radar/refresh/:source source = exactly 'openalex' or 'dosm'; once per 5 minutes per source
// GET  /api/admin/radar/mappings        field-topic proposals with the newest stored decision, and the review history
// POST /api/admin/radar/mappings        {mappingId, decision: approved|rejected|revise, note, evidence[]}
// GET  /api/admin/radar/breaks          possible breaks of the active manifest, and the review history
// POST /api/admin/radar/breaks          {period, observationHash, decision: confirmed|dismissed_counts|dismissed_shares|
//                                       annotate, note, evidence[]} → review + recalculation into a new manifest
// GET  /api/admin/radar/export          approved mappings and all review records, as JSON for committing
// POST /api/admin/radar/cleanup         deletes only the orphans status lists; never a key a stored manifest references,
//                                       nor anything newer than the active manifest
//
// No request value is ever used as a store key: review ids are made here, mapping ids and breaks are looked up.
// Logs carry codes and ids only; never keys, cookies, notes or request bodies.
import { randomBytes } from 'node:crypto'
import express from 'express'
import { jsonBody, sendError } from '../errors.js'
import { createWindowLimiter } from '../rateLimit.js'
import { originOk, sendAccessError } from './access.js'
import { KEYS, RADAR_SOURCES, getJson, isSafeId } from './manifest.js'
import { RadarError } from './service.js'
import {
  BREAK_DECISIONS,
  MAPPING_DECISIONS,
  MAPPING_SOURCE,
  cleanEvidence,
  cleanNote,
  loadReviews,
  mergeFieldTopicDecisions,
  nextVersion,
  proposalHash,
  recordReview,
} from './reviews.js'

const REFRESH_WINDOW_MS = 5 * 60 * 1000
const LOG_ENTRIES = 50
const SCANNED = Object.freeze(['prod/manifests/', 'prod/snapshots/', 'prod/signals/', 'prod/originals/'])
const MAX_PERIOD = 20
const MAX_HASH = 4000
const OK_OUTCOMES = new Set(['published', 'no_change'])
// Cleanup safety margin for clock skew between instances: ids and createdAt come from each instance's own clock, so a
// publish still in progress on an instance whose clock runs behind can look older than the active manifest. Anything
// stamped within SKEW_MS before the active manifest's createdAt (or later) is treated as possibly in progress and kept.
export const SKEW_MS = 10 * 60 * 1000

const ERRORS = {
  bad_request: [400, 'The request is not valid.', false],
  not_found: [404, 'No such item in the current Radar data.', false],
  not_configured: [503, 'This is not available on this server.', false],
  not_allowed: [403, 'This is not allowed.', false],
  too_many_attempts: [429, 'This was run a moment ago. Please wait a few minutes and try again.', true],
  store_unavailable: [503, 'Saved Radar data is not reachable right now.', true],
  publish_conflict: [409, 'Another change was saved at the same time. Reload and try again.', true],
  manifest_gone: [409, 'The active Radar data could not be read completely.', false],
  openalex_key_missing: [503, 'The OpenAlex API key is not set on this server.', false],
  openalex_rate_limited: [429, 'OpenAlex asked us to slow down. Try again later.', true],
  openalex_auth_failed: [502, 'OpenAlex did not accept the API key.', false],
  source_unavailable: [503, 'The data source could not be reached.', true],
  dosm_dataset_missing: [502, 'The DOSM release has no valid dataset.', false],
  dosm_layout_unexpected: [502, 'The DOSM workbook layout is not the expected one.', false],
  validation_failed: [422, 'The new data did not pass validation; nothing was published.', false],
  periods_removed: [409, 'The new data removes periods; it is held for review and was not published.', false],
}

const fail = (response, code, extra = null) => {
  const [status, message, retryable] = ERRORS[code] ?? ERRORS.store_unavailable
  const body = { error: { code: ERRORS[code] ? code : 'store_unavailable', message, retryable } }
  return response.status(status).json(extra ? { ...body, ...extra } : body)
}

const errorCode = (error) => {
  if (error instanceof RadarError) return error.code
  if (error?.code === 'precondition_failed') return 'publish_conflict'
  if (error?.code === 'not_allowed') return 'not_allowed'
  return 'store_unavailable'
}

const newReviewId = (now) => `review-${now().toISOString().replace(/[-:]/g, '')}-${randomBytes(4).toString('hex')}`
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// ---- orphans (spec §6.5 step 6, ruling R23) ---------------------------------------------------------------------

// Keys referenced by the given manifest keys: the manifests, their snapshots and signals, and the originals the
// snapshots list. complete = false when something needed to decide could not be read (then nothing may be deleted).
async function referencedBy(store, manifestKeys) {
  const keys = new Set()
  let complete = true
  for (const manifestKey of manifestKeys) {
    let manifest
    try {
      manifest = (await getJson(store, manifestKey))?.value
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      complete = false
      continue
    }
    if (!manifest) continue
    keys.add(manifestKey)
    if (!plainObject(manifest)) {
      complete = false
      continue
    }
    for (const sourceId of RADAR_SOURCES) {
      const snapshotId = manifest.snapshots?.[sourceId]
      if (!snapshotId) continue
      if (!isSafeId(snapshotId)) {
        complete = false
        continue
      }
      const snapshotKey = KEYS.snapshot(sourceId, snapshotId)
      keys.add(snapshotKey)
      let snapshot
      try {
        snapshot = (await getJson(store, snapshotKey))?.value
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        complete = false
        continue
      }
      for (const original of snapshot?.originals ?? []) {
        if (/^[0-9a-f]{64}$/.test(original?.sha256 ?? '')) keys.add(KEYS.original(sourceId, original.sha256))
      }
    }
    if (isSafeId(manifest.signalsId)) keys.add(KEYS.signals(manifest.signalsId))
    else complete = false
  }
  return { keys, complete }
}

// The active manifest and its history (previousManifestId chain), as manifest keys, and the active manifest's
// createdAt (ms). null when active is unreadable.
async function liveManifestKeys(store) {
  let pointer
  try {
    pointer = (await getJson(store, KEYS.active))?.value
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
  const activeId = pointer?.manifestId
  if (!isSafeId(activeId) || !(await store.get(KEYS.manifest(activeId)))) return null
  const keys = []
  const seen = new Set()
  let activeAt = null
  for (let id = activeId; isSafeId(id) && !seen.has(id); ) {
    seen.add(id)
    let manifest
    try {
      manifest = (await getJson(store, KEYS.manifest(id)))?.value
    } catch (error) {
      if (error instanceof SyntaxError) return null
      throw error
    }
    if (!manifest) break // the history simply ends here
    if (id === activeId) activeAt = Date.parse(manifest.createdAt)
    keys.push(KEYS.manifest(id))
    id = manifest.previousManifestId
  }
  if (!Number.isFinite(activeAt)) return null
  return { keys, activeAt }
}

// The time stamp in an object's id (e.g. manifest-20261030T060700.206Z-ab12cd34, dosm-2026q2-20261030T060700Z), in ms;
// null when the key carries none (e.g. originals, named by their SHA-256).
export function keyStamp(key) {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d{1,3})?Z/.exec(String(key).split('/').pop() ?? '')
  if (!m) return null
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`)
  return Number.isFinite(t) ? t : null
}

// Stored manifests created at or after (active createdAt - SKEW_MS): a publish that may still be in progress on another
// instance. Returns a Set of manifest keys.
async function recentManifestKeys(store, activeAt, exclude) {
  const out = new Set()
  for (const key of await store.list('prod/manifests/')) {
    if (exclude.has(key)) continue
    let manifest
    try {
      manifest = (await getJson(store, key))?.value
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      out.add(key) // unreadable: treated as recent, so nothing it might reference is removed
      continue
    }
    const created = Date.parse(manifest?.createdAt)
    if (!Number.isFinite(created) || created >= activeAt - SKEW_MS) out.add(key)
  }
  return out
}

// Objects under prod/manifests|snapshots|signals|originals that are orphans: not referenced by the active manifest or
// its history, not referenced by any stored manifest created at or after (active createdAt - SKEW_MS) (a publish that
// may be in progress on another instance), and with an id stamp older than (active createdAt - SKEW_MS). Newer or undated
// unreferenced objects are kept until a later cleanup. Fails closed: when the active state cannot be read completely,
// nothing is listed (blocked).
export async function findOrphans(store) {
  const live = await liveManifestKeys(store)
  if (!live) return { orphans: [], blocked: 'manifest_gone' }
  const recent = await recentManifestKeys(store, live.activeAt, new Set(live.keys))
  const { keys: referenced, complete } = await referencedBy(store, [...live.keys, ...recent])
  if (!complete) return { orphans: [], blocked: 'manifest_gone' }
  const all = []
  for (const prefix of SCANNED) all.push(...(await store.list(prefix)))
  const old = (key) => {
    const t = keyStamp(key)
    return t !== null && t < live.activeAt - SKEW_MS
  }
  return { orphans: [...new Set(all)].filter((key) => !referenced.has(key) && !recent.has(key) && old(key)).sort(), blocked: null }
}

// Deletes the candidates that are orphans now. Orphan manifests go first; every other candidate is refused when any
// manifest still stored references it (or when that cannot be decided). Returns {deleted, refused}.
export async function removeOrphans(store, candidates) {
  const wanted = [...new Set(candidates)]
  const { orphans, blocked } = await findOrphans(store)
  if (blocked) return { deleted: [], refused: wanted, blocked }
  const orphanSet = new Set(orphans)
  const deleted = []
  const refused = []
  const manifests = wanted.filter((key) => orphanSet.has(key) && key.startsWith('prod/manifests/'))
  for (const key of manifests) {
    await store.delete(key)
    deleted.push(key)
  }
  const { keys: referenced, complete } = await referencedBy(store, await store.list('prod/manifests/'))
  for (const key of wanted) {
    if (manifests.includes(key)) continue
    if (!complete || !orphanSet.has(key) || referenced.has(key)) {
      refused.push(key)
      continue
    }
    await store.delete(key)
    deleted.push(key)
  }
  return { deleted, refused, blocked: null }
}

// The newest stored ingest log entries, with only the fields a log entry may hold.
async function recentLog(store) {
  const keys = (await store.list(KEYS.ingestLogPrefix)).sort().reverse().slice(0, LOG_ENTRIES)
  const out = []
  for (const key of keys) {
    const entry = (await getJson(store, key).catch(() => null))?.value
    if (!plainObject(entry) || typeof entry.time !== 'string') continue
    const ids = plainObject(entry.ids) ? Object.fromEntries(Object.entries(entry.ids).filter(([, v]) => typeof v === 'string')) : {}
    out.push({ time: entry.time, source: String(entry.source ?? ''), operation: String(entry.operation ?? ''), outcome: String(entry.outcome ?? ''), code: entry.code ?? null, ids })
  }
  return out
}

// ---- routes -----------------------------------------------------------------------------------------------------

export function radarSessionRoutes({ access, log = (message) => console.info(message) }) {
  const router = express.Router()
  router.post('/api/radar/session', jsonBody('4kb'), (request, response) => {
    if (!originOk(request)) return sendAccessError(response, 'csrf_failed')
    const body = plainObject(request.body) ? request.body : {}
    const out = access.login(body.role, body.key, request.ip, { label: body.label })
    response.setHeader('Cache-Control', 'no-store')
    if (!out.ok) {
      log(`[radar] sign-in refused: ${out.code}`)
      return sendAccessError(response, out.code)
    }
    response.setHeader('Set-Cookie', out.cookie)
    return response.json({ ok: true, role: out.session.role, csrf: out.csrf, expiresAt: out.session.expiresAt })
  })
  router.post('/api/radar/logout', (request, response) => access.logout(request, response))
  return router
}

export function radarAdminRoutes({ radar, access, now = () => new Date(), log = (message) => console.info(message) }) {
  const router = express.Router()
  const store = radar.store ?? null
  const writable = () => Boolean(store) && Boolean(radar.info?.().writable)
  const refreshes = createWindowLimiter({ limit: 1, windowMs: REFRESH_WINDOW_MS, now: () => now().getTime() })

  // Refresh, recalculation, cleanup and decision writes never run at the same time on this server.
  let chain = Promise.resolve()
  const exclusive = (fn) => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => {})
    return run
  }

  const guard = (handler) => async (request, response) => {
    try {
      return await handler(request, response)
    } catch (error) {
      const code = errorCode(error)
      log(`[radar] admin request failed: ${code}`)
      return fail(response, code)
    }
  }

  // Every route under /api/admin/radar needs an admin session, unknown ones too.
  router.use('/api/admin/radar', access.require('admin'))

  const decidedReferences = async () => {
    radar.invalidateReviews?.()
    try {
      return await radar.references()
    } catch {
      throw new RadarError('not_configured')
    }
  }

  router.get('/api/admin/radar/status', guard(async (request, response) => {
    if (!writable()) {
      const answer = await radar.answer().catch(() => null)
      return response.json({ writable: false, devStore: false, activeManifestId: answer?.activeManifestId ?? null, lastChecks: {}, log: [], conflicts: [], orphans: [], orphansBlocked: null })
    }
    const answer = await radar.answer()
    const [lastChecks, entries, scan] = [await radar.checks(), await recentLog(store), await findOrphans(store)]
    return response.json({
      writable: true,
      devStore: Boolean(radar.info().devStore),
      activeManifestId: answer.activeManifestId,
      lastChecks,
      log: entries,
      conflicts: entries.filter((e) => e.code === 'publish_conflict'),
      orphans: scan.orphans,
      orphansBlocked: scan.blocked,
    })
  }))

  router.post('/api/admin/radar/refresh/:source', guard(async (request, response) => {
    const source = request.params.source
    if (source !== 'openalex' && source !== 'dosm') return fail(response, 'bad_request')
    if (!writable() || typeof radar.ingestor?.refresh !== 'function') return fail(response, 'not_configured')
    if (!refreshes.hit(source)) return fail(response, 'too_many_attempts')
    const result = await exclusive(() => radar.ingestor.refresh(source))
    if (OK_OUTCOMES.has(result?.outcome)) return response.json({ result })
    const code = result?.code ?? 'store_unavailable'
    return fail(response, code, result?.outcome === 'held' ? { result } : null)
  }))

  router.get('/api/admin/radar/mappings', guard(async (request, response) => {
    const refs = await decidedReferences()
    const reviews = writable() ? await loadReviews(store, 'field_topic') : []
    return response.json({ mappingVersion: refs.versions?.fieldTopics ?? null, writable: writable(), mappings: refs.fieldTopics ?? [], reviews })
  }))

  router.post('/api/admin/radar/mappings', jsonBody('16kb'), guard(async (request, response) => {
    if (!writable()) return fail(response, 'not_configured')
    const body = plainObject(request.body) ? request.body : {}
    const note = cleanNote(body.note)
    const evidence = cleanEvidence(body.evidence)
    if (typeof body.mappingId !== 'string' || !MAPPING_DECISIONS.includes(body.decision) || note === null || evidence === null) return fail(response, 'bad_request')
    const refs = await decidedReferences()
    const proposal = (refs.fieldTopics ?? []).find((m) => m.mappingId === body.mappingId)
    if (!proposal) return fail(response, 'not_found')
    // Under the lock: two decisions on one target never get the same version.
    const { reviews, review } = await exclusive(async () => {
      const reviews = await loadReviews(store)
      const review = await recordReview(store, {
        reviewId: newReviewId(now),
        kind: 'field_topic',
        target: proposal.mappingId,
        decision: body.decision,
        note,
        evidence,
        reviewer: request.radarSession.label ?? 'owner',
        reviewedAt: now().toISOString(),
        version: nextVersion(reviews, 'field_topic', proposal.mappingId),
        appliesTo: { sourceId: MAPPING_SOURCE, period: null, observationHash: proposalHash(proposal) },
      })
      return { reviews, review }
    })
    radar.invalidateReviews?.()
    log(`[radar] review recorded: field_topic ${review.reviewId}`)
    const [mapping] = mergeFieldTopicDecisions([proposal], [...reviews, review])
    return response.status(201).json({ review, mapping })
  }))

  router.get('/api/admin/radar/breaks', guard(async (request, response) => {
    const answer = await radar.answer()
    const view = answer.view
    const reviews = writable() ? await loadReviews(store, 'break') : []
    return response.json({
      manifestId: answer.manifestId,
      writable: writable(),
      sourceId: 'dosm',
      snapshotId: view.manifest.snapshots?.dosm ?? null,
      breakReviewsVersion: view.manifest.breakReviewsVersion ?? null,
      breaks: view.signals.breaks ?? [],
      reviews,
    })
  }))

  router.post('/api/admin/radar/breaks', jsonBody('16kb'), guard(async (request, response) => {
    if (!writable()) return fail(response, 'not_configured')
    const body = plainObject(request.body) ? request.body : {}
    const note = cleanNote(body.note)
    const evidence = cleanEvidence(body.evidence)
    const { period, observationHash } = body
    if (typeof period !== 'string' || period.length > MAX_PERIOD || typeof observationHash !== 'string' || observationHash.length > MAX_HASH) return fail(response, 'bad_request')
    if (!BREAK_DECISIONS.includes(body.decision) || note === null || evidence === null) return fail(response, 'bad_request')
    // The exact event of the active data: its quarter and the observations that triggered it.
    const answer = await radar.answer()
    if (answer.manifestId !== answer.activeManifestId || answer.states?.dosm?.servedFrom !== 'active_manifest') return fail(response, 'store_unavailable')
    const flagged = (answer.view.signals.breaks ?? []).find((b) => b.period === period && b.observationHash === observationHash)
    if (!flagged) return fail(response, 'not_found')
    const target = `dosm:${flagged.period}`
    // Under the lock (as the recalculation below, in a separate turn): versions per target stay distinct.
    const review = await exclusive(async () => {
      const reviews = await loadReviews(store)
      return recordReview(store, {
        reviewId: newReviewId(now),
        kind: 'break',
        target,
        decision: body.decision,
        note,
        evidence,
        reviewer: request.radarSession.label ?? 'owner',
        reviewedAt: now().toISOString(),
        version: nextVersion(reviews, 'break', target),
        appliesTo: { sourceId: 'dosm', period: flagged.period, observationHash: flagged.observationHash },
      })
    })
    log(`[radar] review recorded: break ${review.reviewId}`)
    // Applied at once by recalculating the active snapshots into a new manifest; if that cannot run now, the review is
    // stored and the next refresh applies it (the ingestion reads every stored break review).
    let recalculation = { outcome: 'failed', code: 'not_configured' }
    if (typeof radar.ingestor?.recalculate === 'function') {
      try {
        recalculation = await exclusive(() => radar.ingestor.recalculate())
      } catch (error) {
        recalculation = { outcome: 'failed', code: errorCode(error) }
      }
    }
    const applied = OK_OUTCOMES.has(recalculation?.outcome)
    return response.status(201).json({
      review,
      recalculation: {
        outcome: recalculation?.outcome ?? 'failed',
        code: recalculation?.code ?? null,
        manifestId: recalculation?.manifestId ?? null,
        appliesAt: applied ? 'now' : 'next_refresh',
      },
    })
  }))

  router.get('/api/admin/radar/export', guard(async (request, response) => {
    const refs = await decidedReferences()
    const reviews = writable() ? await loadReviews(store) : []
    return response.json({
      schemaVersion: 'radar-field-topics/v1',
      mappingVersion: refs.versions?.fieldTopics ?? null,
      exportedAt: now().toISOString(),
      mappings: (refs.fieldTopics ?? []).filter((m) => m.reviewStatus === 'approved'),
      reviews,
    })
  }))

  router.post('/api/admin/radar/cleanup', guard(async (request, response) => {
    if (!writable()) return fail(response, 'not_configured')
    const result = await exclusive(async () => {
      const { orphans, blocked } = await findOrphans(store)
      if (blocked) return { deleted: [], refused: [], blocked }
      return removeOrphans(store, orphans)
    })
    if (result.blocked) return fail(response, result.blocked)
    log(`[radar] cleanup removed ${result.deleted.length} orphan objects`)
    return response.json({ deleted: result.deleted, refused: result.refused })
  }))

  return router
}
