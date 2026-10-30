// Future Skills Radar review records (spec §8.4, rulings R24, R26).
//
// Record: {reviewId, kind: 'break'|'field_topic', target, decision, note, evidence[], reviewer, reviewedAt, version,
//          appliesTo {sourceId, period, observationHash}}  →  prod/reviews/<reviewId>.json, written only if absent.
// Newest wins (reviewedAt, then reviewId); older records stay as history.
// - break:       target 'dosm:<quarter>', decision confirmed | dismissed_counts | dismissed_shares | annotate,
//                appliesTo {sourceId: 'dosm', period, observationHash} exactly as the flagged break (shared/radar/breaks.js).
// - field_topic: target = mappingId, decision approved | rejected | revise (back to pending),
//                appliesTo {sourceId: 'field-topic-mappings', period: null, observationHash: SHA-256 of the proposal's
//                content}: a decision applies only to the proposal text it was made on.
// Decided field-topic records are merged over the bundled proposals (createDecidedReferences), so the public
// references and export serve stored owner decisions (R26).
import { createHash } from 'node:crypto'
import { KEYS, getJson, isSafeId, toBytes } from './manifest.js'

export const REVIEW_KINDS = Object.freeze(['break', 'field_topic'])
export const BREAK_DECISIONS = Object.freeze(['confirmed', 'dismissed_counts', 'dismissed_shares', 'annotate'])
export const MAPPING_DECISIONS = Object.freeze(['approved', 'rejected', 'revise'])
export const MAPPING_SOURCE = 'field-topic-mappings'
const STATUS_OF = { approved: 'approved', rejected: 'rejected', revise: 'pending' }
export const MAX_NOTE = 2000
export const MAX_EVIDENCE = 20
const MAX_URL = 500
const DECIDED_TTL_MS = 60000
const JSON_TYPE = 'application/json'

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// Oldest first: by time, then version (same target, same millisecond), then id.
export const byTime = (a, b) => cmp(String(a.reviewedAt ?? ''), String(b.reviewedAt ?? '')) || (Number(a.version) || 0) - (Number(b.version) || 0) || cmp(String(a.reviewId ?? ''), String(b.reviewId ?? ''))

export const reviewKey = (reviewId) => KEYS.review(reviewId)

// Evidence links: http(s) URLs only, at most MAX_EVIDENCE. null when the input is not acceptable.
export function cleanEvidence(evidence) {
  if (evidence === undefined || evidence === null) return []
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE) return null
  const out = []
  for (const item of evidence) {
    if (typeof item !== 'string' || item.length > MAX_URL) return null
    let url
    try {
      url = new URL(item)
    } catch {
      return null
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    out.push(item)
  }
  return out
}

export function cleanNote(note) {
  if (note === undefined || note === null) return ''
  if (typeof note !== 'string' || note.length > MAX_NOTE) return null
  return note
}

function validReview(review) {
  if (!review || typeof review !== 'object') return false
  if (!isSafeId(review.reviewId) || !REVIEW_KINDS.includes(review.kind)) return false
  if (typeof review.target !== 'string' || typeof review.reviewer !== 'string' || typeof review.reviewedAt !== 'string') return false
  const decisions = review.kind === 'break' ? BREAK_DECISIONS : MAPPING_DECISIONS
  if (!decisions.includes(review.decision)) return false
  if (cleanNote(review.note) === null || cleanEvidence(review.evidence) === null) return false
  if (!Number.isInteger(review.version) || review.version < 1) return false
  const a = review.appliesTo
  return Boolean(a && typeof a === 'object' && typeof a.sourceId === 'string' && typeof a.observationHash === 'string')
}

// Writes one review record, only if absent. Returns the record as stored; throws on an invalid record or a clash.
export async function recordReview(store, review) {
  if (!validReview(review)) throw new TypeError('invalid review record')
  const record = {
    reviewId: review.reviewId,
    kind: review.kind,
    target: review.target,
    decision: review.decision,
    note: review.note ?? '',
    evidence: review.evidence ?? [],
    reviewer: review.reviewer,
    reviewedAt: review.reviewedAt,
    version: review.version,
    appliesTo: { sourceId: review.appliesTo.sourceId, period: review.appliesTo.period ?? null, observationHash: review.appliesTo.observationHash },
  }
  await store.put(reviewKey(record.reviewId), toBytes(record), { contentType: JSON_TYPE, ifNoneMatch: '*' })
  return record
}

// Every stored review record, oldest first. Unreadable or malformed records are skipped.
export async function loadReviews(store, kind = null) {
  const keys = await store.list(KEYS.reviewsPrefix)
  const out = []
  for (const key of keys) {
    let got = null
    try {
      got = await getJson(store, key)
    } catch (error) {
      if (error instanceof SyntaxError) continue
      throw error
    }
    const review = got?.value
    if (!validReview(review) || key !== reviewKey(review.reviewId)) continue
    if (kind && review.kind !== kind) continue
    out.push(review)
  }
  return out.sort(byTime)
}

// The next version number for one target: one more than the reviews already stored for it.
export const nextVersion = (reviews, kind, target) => reviews.filter((r) => r.kind === kind && r.target === target).reduce((max, r) => Math.max(max, r.version), 0) + 1

// SHA-256 of what a field-topic decision is about: the proposal's link and reason (not its review fields).
export function proposalHash(p) {
  const content = { mappingId: p.mappingId, iscedCode: p.iscedCode, axisId: p.axisId, relationship: p.relationship, method: p.method, reason: p.reason ?? null }
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

// The proposals with the newest matching stored decision applied. Notes and evidence stay in the review records.
export function mergeFieldTopicDecisions(proposals = [], reviews = []) {
  const newest = new Map()
  for (const r of [...reviews].sort(byTime)) if (r.kind === 'field_topic') newest.set(`${r.target}\u0000${r.appliesTo?.observationHash}`, r)
  return proposals.map((p) => {
    const r = newest.get(`${p.mappingId}\u0000${proposalHash(p)}`)
    if (!r) return p
    return { ...p, reviewStatus: STATUS_OF[r.decision], reviewedBy: r.reviewer, reviewedAt: r.reviewedAt, reviewId: r.reviewId }
  })
}

const decisionsVersion = (reviews) =>
  reviews.length ? `decisions-${createHash('sha256').update(JSON.stringify(reviews.map((r) => r.reviewId))).digest('hex').slice(0, 16)}` : null

// The reference data with stored field-topic decisions merged in. Re-read at most once a minute (and at once after
// invalidate()); the same object is returned while the decisions do not change. A store that cannot be read keeps
// the last merged data, else the bundled proposals (no approvals: fail closed).
export function createDecidedReferences({ store, loadBase, now = () => new Date(), log = () => {} }) {
  let cached = null // {at, version, base, refs}
  async function get() {
    const base = await loadBase()
    const t = now().getTime()
    if (cached && cached.base === base && t - cached.at < DECIDED_TTL_MS) return cached.refs
    let reviews
    try {
      reviews = await loadReviews(store, 'field_topic')
    } catch (error) {
      log(`[radar] review read failed: ${error?.code ?? error?.name ?? 'Error'}`)
      return cached?.base === base ? cached.refs : base
    }
    const version = decisionsVersion(reviews)
    if (cached && cached.base === base && cached.version === version) {
      cached.at = t
      return cached.refs
    }
    const refs = version ? { ...base, fieldTopics: mergeFieldTopicDecisions(base.fieldTopics ?? [], reviews), versions: { ...(base.versions ?? {}), fieldTopicDecisions: version } } : base
    cached = { at: t, version, base, refs }
    return refs
  }
  return {
    get,
    invalidate: () => {
      if (cached) cached.at = -Infinity
    },
  }
}
