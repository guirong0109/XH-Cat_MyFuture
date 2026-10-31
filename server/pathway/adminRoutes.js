// Owner decisions on the Study Pathway picks (data/pathway/picks.json), stored in the Radar review store exactly like
// the SDG link decisions (server/matching/adminRoutes.js): kind 'pathway_pick', target = pick id, appliesTo
// {sourceId: 'pathway-picks', period: null, observationHash: pickHash(pick)}. A decision applies only to the pick text
// it was made on.
//
// GET  /api/admin/pathway/picks   {writable, picks: [...each with forLabel, status, reviewedAt, reviewedBy, reviewId, hash]}
// POST /api/admin/pathway/picks   {id, decision: approved|rejected|revise, note} → 201 {review, pick}
//
// Admin session on every route under /api/admin/pathway; CSRF and same-host Origin on POST (server/radar/access.js).
// No request value is used as a store key: the review id is made here and the pick is looked up. Notes are never logged.
import { randomBytes } from 'node:crypto'
import express from 'express'
import { jsonBody } from '../errors.js'
import { MAPPING_DECISIONS, cleanNote, loadReviews, nextVersion, recordReview } from '../radar/reviews.js'
import { PICKS_SOURCE, PICK_KIND, pickStatuses } from '../../shared/pathway/picks.js'
import { loadPathwayData } from './data.js'

const ERRORS = {
  bad_request: [400, 'The request is not valid.', false],
  not_found: [404, 'No such pathway pick in the current data.', false],
  not_configured: [503, 'This is not available on this server.', false],
  data_unavailable: [503, 'Study pathway data could not be read.', false],
  store_unavailable: [503, 'Saved decisions are not reachable right now.', true],
  publish_conflict: [409, 'Another change was saved at the same time. Reload and try again.', true],
}

const fail = (response, code) => {
  const known = ERRORS[code] ? code : 'store_unavailable'
  const [status, message, retryable] = ERRORS[known]
  return response.status(status).json({ error: { code: known, message, retryable } })
}

const newReviewId = (now) => `review-${now().toISOString().replace(/[-:]/g, '')}-${randomBytes(4).toString('hex')}`
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// What a pick is for, in words: the O*NET item name or the field-of-study title (null when not known).
function forLabel(data, pick) {
  const key = String(pick.for ?? '')
  if (key.startsWith('field:')) return data.fieldTitles?.get?.(key.slice(6)) ?? null
  return data.itemNames?.get?.(key) ?? null
}

// loadData: async () => loadPathwayData result; given for tests, else read from dataDir.
// onDecision: called after each recorded decision (the pathway service drops its cached pick decisions).
export function pathwayAdminRoutes({ radar, access, now = () => new Date(), dataDir = null, loadData = null, onDecision = () => {}, log = (message) => console.info(message) }) {
  const router = express.Router()
  const store = radar?.store ?? null
  const writable = () => Boolean(store) && Boolean(radar.info?.().writable)
  const readData = loadData ?? (() => loadPathwayData(dataDir))

  // Decision writes on this server never run at the same time: two decisions on one pick never get the same version.
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
      const code = error?.code === 'precondition_failed' ? 'publish_conflict' : error?.code === 'data_unavailable' ? 'data_unavailable' : 'store_unavailable'
      log(`[pathway] admin request failed: ${code}`)
      return fail(response, code)
    }
  }

  // Missing or bad pathway data is a data problem, not a store problem; no path or message in the answer or log.
  const loadedPicks = async () => {
    let data
    try {
      data = await readData()
    } catch {
      data = null
    }
    if (!data || !Array.isArray(data.picks) || !data.picks.every(plainObject)) throw Object.assign(new Error('pathway data could not be read'), { code: 'data_unavailable' })
    const siteNames = new Map((data.sites ?? []).map((s) => [s.id, s.name]))
    return data.picks.map((p) => ({ ...p, forLabel: forLabel(data, p), ...(p.site ? { siteName: siteNames.get(p.site) ?? null } : {}) }))
  }

  router.use('/api/admin/pathway', access.require('admin'))

  router.get('/api/admin/pathway/picks', guard(async (request, response) => {
    const picks = await loadedPicks()
    const reviews = writable() ? await loadReviews(store, PICK_KIND) : []
    return response.json({ writable: writable(), picks: pickStatuses(picks, reviews) })
  }))

  router.post('/api/admin/pathway/picks', jsonBody('16kb'), guard(async (request, response) => {
    if (!writable()) return fail(response, 'not_configured')
    const body = plainObject(request.body) ? request.body : {}
    const note = cleanNote(body.note)
    if (typeof body.id !== 'string' || !MAPPING_DECISIONS.includes(body.decision) || note === null) return fail(response, 'bad_request')
    const pick = (await loadedPicks()).find((p) => p.id === body.id)
    if (!pick) return fail(response, 'not_found')
    const { reviews, review } = await exclusive(async () => {
      const reviews = await loadReviews(store, PICK_KIND)
      const review = await recordReview(store, {
        reviewId: newReviewId(now),
        kind: PICK_KIND,
        target: pick.id,
        decision: body.decision,
        note,
        evidence: [],
        reviewer: request.radarSession.label ?? 'owner',
        reviewedAt: now().toISOString(),
        version: nextVersion(reviews, PICK_KIND, pick.id),
        appliesTo: { sourceId: PICKS_SOURCE, period: null, observationHash: pick.hash },
      })
      return { reviews, review }
    })
    log(`[pathway] review recorded: ${PICK_KIND} ${review.reviewId}`)
    try {
      onDecision()
    } catch {
      // the decision is stored; a failed hook only delays it reaching the screen by the cache time
    }
    const [decided] = pickStatuses([pick], [...reviews, review])
    return response.status(201).json({ review, pick: decided })
  }))

  return router
}
