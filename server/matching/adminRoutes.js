// Owner decisions on the SDG team-draft links (data/sdg/links.json), stored in the Radar review store exactly like
// field-topic decisions (server/radar/reviews.js): kind 'sdg_link', target = link id, appliesTo {sourceId:
// 'sdg-links', period: null, observationHash: linkHash(link)}. A decision applies only to the link text it was made on.
//
// GET  /api/admin/matching/sdg-links   {writable, links: [...each with status, reviewedAt, reviewedBy, reviewId, hash]}
// POST /api/admin/matching/sdg-links   {id, decision: approved|rejected|revise, note} → 201 {review, link}
//
// Admin session on every route under /api/admin/matching; CSRF and same-host Origin on POST (server/radar/access.js).
// No request value is used as a store key: the review id is made here and the link is looked up.
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import { jsonBody } from '../errors.js'
import { MAPPING_DECISIONS, cleanNote, loadReviews, nextVersion, recordReview } from '../radar/reviews.js'
import { SDG_SOURCE, linkStatuses } from '../../shared/matching/sdg.js'

const KIND = 'sdg_link'

const ERRORS = {
  bad_request: [400, 'The request is not valid.', false],
  not_found: [404, 'No such SDG link in the current data.', false],
  not_configured: [503, 'This is not available on this server.', false],
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

// SHA-256 of what an SDG decision is about: the link's id, kind, code, target and reason (not its name).
export function linkHash(link) {
  const content = { id: link.id, kind: link.kind, code: link.code, target: link.target, reason: link.reason ?? null }
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

export const loadSdgLinks = async (dataDir) => JSON.parse(await readFile(path.join(dataDir, 'sdg', 'links.json'), 'utf8')).links ?? []

// loadLinks: async () => links (data/sdg/links.json .links); given for tests, else read from dataDir.
export function matchingAdminRoutes({ radar, access, now = () => new Date(), dataDir = null, loadLinks = null, log = (message) => console.info(message) }) {
  const router = express.Router()
  const store = radar?.store ?? null
  const writable = () => Boolean(store) && Boolean(radar.info?.().writable)
  const readLinks = loadLinks ?? (() => loadSdgLinks(dataDir))

  // Decision writes on this server never run at the same time: two decisions on one link never get the same version.
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
      const code = error?.code === 'precondition_failed' ? 'publish_conflict' : 'store_unavailable'
      log(`[matching] admin request failed: ${code}`)
      return fail(response, code)
    }
  }

  const hashedLinks = async () => (await readLinks()).map((link) => ({ ...link, hash: linkHash(link) }))

  // Every route under /api/admin/matching needs an admin session, unknown ones too.
  router.use('/api/admin/matching', access.require('admin'))

  router.get('/api/admin/matching/sdg-links', guard(async (request, response) => {
    const links = await hashedLinks()
    const reviews = writable() ? await loadReviews(store, KIND) : []
    return response.json({ writable: writable(), links: linkStatuses(links, reviews) })
  }))

  router.post('/api/admin/matching/sdg-links', jsonBody('16kb'), guard(async (request, response) => {
    if (!writable()) return fail(response, 'not_configured')
    const body = plainObject(request.body) ? request.body : {}
    const note = cleanNote(body.note)
    if (typeof body.id !== 'string' || !MAPPING_DECISIONS.includes(body.decision) || note === null) return fail(response, 'bad_request')
    const link = (await hashedLinks()).find((l) => l.id === body.id)
    if (!link) return fail(response, 'not_found')
    const { reviews, review } = await exclusive(async () => {
      const reviews = await loadReviews(store, KIND)
      const review = await recordReview(store, {
        reviewId: newReviewId(now),
        kind: KIND,
        target: link.id,
        decision: body.decision,
        note,
        evidence: [],
        reviewer: request.radarSession.label ?? 'owner',
        reviewedAt: now().toISOString(),
        version: nextVersion(reviews, KIND, link.id),
        appliesTo: { sourceId: SDG_SOURCE, period: null, observationHash: link.hash },
      })
      return { reviews, review }
    })
    log(`[matching] review recorded: ${KIND} ${review.reviewId}`)
    const [decided] = linkStatuses([link], [...reviews, review])
    return response.status(201).json({ review, link: decided })
  }))

  return router
}
