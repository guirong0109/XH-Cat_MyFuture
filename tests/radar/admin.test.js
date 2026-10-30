// Radar admin API (spec §8.2, §8.4, §13, §6.5): ingestion status, refresh per source, field-topic decisions, break
// reviews tied to the exact event, export, orphan cleanup. Real servers on port 0, memory store, cookies by hand.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createIngestor } from '../../server/radar/ingest.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { KEYS, getJson, toBytes } from '../../server/radar/manifest.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { findOrphans, removeOrphans } from '../../server/radar/adminRoutes.js'
import { loadReviews, recordReview } from '../../server/radar/reviews.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const MIN = 60000
const bundleStore = createFileStore('data/radar/bundle')
const BUNDLE_ACTIVE = 'manifest-20261030T060700.206Z-b09a0a5b'

let references
beforeAll(async () => {
  references = await loadRadarReferences('data')
})

function clock(iso = '2026-10-31T00:00:00.000Z') {
  let t = new Date(iso).getTime()
  const now = () => new Date(t)
  now.advance = (ms) => {
    t += ms
  }
  return now
}

let server
let base
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

// A fake source that fails like an unreachable API; counts calls.
function failingSource(code = 'source_unavailable') {
  const source = {
    calls: 0,
    lastCompleteYear: () => 2025,
    fetchSnapshot: async () => {
      source.calls += 1
      throw new SourceError(code)
    },
    discover: async () => {
      source.calls += 1
      throw new SourceError(code)
    },
  }
  return source
}

async function start({ store = createMemoryStore(), now = clock(), writable = true } = {}) {
  const sources = { openalex: failingSource(), dosm: failingSource() }
  const ingestor = writable ? createIngestor({ store, sources, references, now, log: () => {} }) : null
  const radar = createRadarService({ store: writable ? store : null, bundleStore, references: async () => references, ingestor, now, log: () => {} })
  const radarAccess = createRadarAccess({ env: ENV, now })
  server = createApp({ radar, radarAccess, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  return { store, now, sources, radar }
}

async function call(method, route, { session, body } = {}) {
  const headers = { origin: base }
  if (session) {
    headers.cookie = `fr_radar=${session.cookie}`
    headers['x-radar-csrf'] = session.csrf
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function login(extra = {}) {
  const response = await fetch(`${base}/api/radar/session`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'admin', key: ENV.RADAR_ADMIN_KEY, ...extra }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return { cookie: response.headers.get('set-cookie').split(';')[0].slice('fr_radar='.length), csrf: body.csrf }
}

describe('admin routes without a writable store', () => {
  it('status answers read-only; refresh, decisions, reviews and cleanup answer not_configured', async () => {
    await start({ writable: false })
    const session = await login()
    const status = await call('GET', '/api/admin/radar/status', { session })
    expect(status.status).toBe(200)
    expect(status.body).toMatchObject({ writable: false, orphans: [] })
    for (const [route, body] of [
      ['/api/admin/radar/refresh/openalex', undefined],
      ['/api/admin/radar/mappings', { mappingId: '06-language', decision: 'approved', note: '' }],
      ['/api/admin/radar/breaks', { period: '2020 Q2', observationHash: 'x', decision: 'confirmed', note: '' }],
      ['/api/admin/radar/cleanup', undefined],
    ]) {
      const r = await call('POST', route, { session, body })
      expect(r.status, route).toBe(503)
      expect(r.body.error.code, route).toBe('not_configured')
    }
  })
})

describe('POST /api/admin/radar/refresh/:source', () => {
  it('only exactly openalex or dosm; once per 5 minutes per source', async () => {
    const { now, sources } = await start()
    const session = await login()
    for (const bad of ['OpenAlex', 'unknown', 'openalex%20', 'dosm.json']) {
      const r = await call('POST', `/api/admin/radar/refresh/${bad}`, { session })
      expect(r.status, bad).toBe(400)
      expect(r.body.error.code).toBe('bad_request')
    }
    const first = await call('POST', '/api/admin/radar/refresh/openalex', { session })
    expect(first.status).toBe(503)
    expect(first.body.error).toMatchObject({ code: 'source_unavailable', retryable: true })
    const again = await call('POST', '/api/admin/radar/refresh/openalex', { session })
    expect(again.status).toBe(429)
    expect(again.body.error.code).toBe('too_many_attempts')
    expect(sources.openalex.calls).toBe(1)
    // The other source has its own window.
    expect((await call('POST', '/api/admin/radar/refresh/dosm', { session })).status).not.toBe(429)
    now.advance(5 * MIN)
    expect((await call('POST', '/api/admin/radar/refresh/openalex', { session })).status).toBe(503)
    expect(sources.openalex.calls).toBe(2)
  })
})

describe('GET /api/admin/radar/status', () => {
  it('reads last checks from the stored ingest log and orphans by scanning prod/ (survives a restart)', async () => {
    const store = createMemoryStore()
    // A first server seeds prod/ from the bundle; then an interrupted run elsewhere left an object behind.
    const first = await start({ store })
    await call('GET', '/api/radar/manifest')
    await store.put(KEYS.snapshot('dosm', 'dosm-left-behind'), toBytes({ snapshotId: 'dosm-left-behind' }))
    await store.put(KEYS.ingestLog('20261030T070000.000Z-aaaa0000'), toBytes({ time: '2026-10-30T07:00:00.000Z', source: 'openalex', operation: 'activate', outcome: 'published', ids: { manifestId: BUNDLE_ACTIVE } }))
    expect(first.radar).toBeTruthy()
    await new Promise((resolve) => server.close(resolve))
    server = null
    await start({ store })
    const session = await login()
    const r = await call('GET', '/api/admin/radar/status', { session })
    expect(r.status).toBe(200)
    expect(r.body.writable).toBe(true)
    expect(r.body.activeManifestId).toBe(BUNDLE_ACTIVE)
    expect(r.body.orphans).toEqual([KEYS.snapshot('dosm', 'dosm-left-behind')])
    expect(r.body.lastChecks.openalex).toMatchObject({ checkedAt: '2026-10-30T07:00:00.000Z', outcome: 'published' })
    expect(r.body.log[0]).toMatchObject({ source: 'openalex', outcome: 'published' })
    expect(Array.isArray(r.body.conflicts)).toBe(true)
  })
})

describe('field-topic decisions', () => {
  it('stores reviewer, time, version and note under prod/reviews/; newest wins; history kept; public references follow', async () => {
    const { store, now } = await start()
    const session = await login({ label: 'Owner desk' })
    const list = await call('GET', '/api/admin/radar/mappings', { session })
    expect(list.status).toBe(200)
    const proposal = list.body.mappings.find((m) => m.mappingId === '06-language')
    expect(proposal.reviewStatus).toBe('pending')

    const approve = await call('POST', '/api/admin/radar/mappings', { session, body: { mappingId: '06-language', decision: 'approved', note: 'Checked the reason.', evidence: ['https://openalex.org/T10028'] } })
    expect(approve.status).toBe(201)
    const review = approve.body.review
    expect(review).toMatchObject({
      kind: 'field_topic',
      target: '06-language',
      decision: 'approved',
      note: 'Checked the reason.',
      evidence: ['https://openalex.org/T10028'],
      reviewer: 'Owner desk',
      reviewedAt: '2026-10-31T00:00:00.000Z',
      version: 1,
    })
    expect(review.appliesTo).toMatchObject({ sourceId: 'field-topic-mappings', period: null })
    expect(review.appliesTo.observationHash).toMatch(/^[0-9a-f]{64}$/)
    const stored = await getJson(store, `prod/reviews/${review.reviewId}.json`)
    expect(stored.value).toEqual(review)

    let refs = await call('GET', '/api/radar/references')
    expect(refs.body.fieldTopics.find((m) => m.mappingId === '06-language')).toMatchObject({ reviewStatus: 'approved', reviewedBy: 'Owner desk', reviewedAt: '2026-10-31T00:00:00.000Z' })
    expect(JSON.stringify(refs.body.fieldTopics)).not.toContain('Checked the reason.')
    expect(refs.body.fieldTopics.every((m) => m.reviewStatus !== 'pending')).toBe(true)

    now.advance(MIN)
    const reject = await call('POST', '/api/admin/radar/mappings', { session, body: { mappingId: '06-language', decision: 'rejected', note: 'Too broad.' } })
    expect(reject.status).toBe(201)
    expect(reject.body.review.version).toBe(2)
    refs = await call('GET', '/api/radar/references')
    expect(refs.body.fieldTopics.find((m) => m.mappingId === '06-language').reviewStatus).toBe('rejected')
    const exportPublic = await call('GET', '/api/radar/export')
    expect(exportPublic.body.references.fieldTopics.find((m) => m.mappingId === '06-language').reviewStatus).toBe('rejected')

    const after = await call('GET', '/api/admin/radar/mappings', { session })
    expect(after.body.mappings.find((m) => m.mappingId === '06-language').reviewStatus).toBe('rejected')
    expect(after.body.reviews.filter((r) => r.target === '06-language').map((r) => r.decision)).toEqual(['approved', 'rejected'])
    expect((await store.list(KEYS.reviewsPrefix)).length).toBe(2)
  })

  it('without a label the reviewer is "owner"; revise sends a record back to pending', async () => {
    await start()
    const session = await login()
    await call('POST', '/api/admin/radar/mappings', { session, body: { mappingId: '06-language', decision: 'approved', note: '' } })
    const revise = await call('POST', '/api/admin/radar/mappings', { session, body: { mappingId: '06-language', decision: 'revise', note: 'Reword the reason.' } })
    expect(revise.status).toBe(201)
    expect(revise.body.review.reviewer).toBe('owner')
    const refs = await call('GET', '/api/radar/references')
    expect(refs.body.fieldTopics.find((m) => m.mappingId === '06-language')).toBe(undefined)
  })

  it('refuses unknown mappings, unknown decisions, non-http evidence and long notes; nothing is stored', async () => {
    const { store } = await start()
    const session = await login()
    const cases = [
      [{ mappingId: 'no-such-mapping', decision: 'approved', note: '' }, 404, 'not_found'],
      [{ mappingId: '06-language', decision: 'approve-all', note: '' }, 400, 'bad_request'],
      [{ mappingId: '06-language', decision: 'approved', note: 'x'.repeat(2001) }, 400, 'bad_request'],
      [{ mappingId: '06-language', decision: 'approved', note: '', evidence: ['javascript:alert(1)'] }, 400, 'bad_request'],
      [{ mappingId: ['06-language'], decision: 'approved', note: '' }, 400, 'bad_request'],
    ]
    for (const [body, status, code] of cases) {
      const r = await call('POST', '/api/admin/radar/mappings', { session, body })
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(status)
      expect(r.body.error.code).toBe(code)
    }
    expect(await store.list(KEYS.reviewsPrefix)).toEqual([])
  })

  it('recordReview is immutable (only if absent)', async () => {
    const store = createMemoryStore()
    const review = {
      reviewId: 'review-test-1',
      kind: 'field_topic',
      target: '06-language',
      decision: 'approved',
      note: '',
      evidence: [],
      reviewer: 'owner',
      reviewedAt: '2026-10-31T00:00:00.000Z',
      version: 1,
      appliesTo: { sourceId: 'field-topic-mappings', period: null, observationHash: 'a'.repeat(64) },
    }
    expect(await recordReview(store, review)).toEqual(review)
    await expect(recordReview(store, { ...review, decision: 'rejected' })).rejects.toThrow()
    expect((await loadReviews(store))[0].decision).toBe('approved')
  })
})

describe('break reviews', () => {
  it('a review is tied to the exact event and is applied by a recalculation into a new manifest', async () => {
    const { store } = await start()
    const session = await login()
    const list = await call('GET', '/api/admin/radar/breaks', { session })
    expect(list.status).toBe(200)
    const flagged = list.body.breaks.find((b) => b.period === '2020 Q2')
    expect(flagged).toMatchObject({ status: 'unreviewed' })
    expect(typeof flagged.observationHash).toBe('string')

    const wrong = await call('POST', '/api/admin/radar/breaks', { session, body: { period: '2020 Q2', observationHash: `${flagged.observationHash}x`, decision: 'confirmed', note: '' } })
    expect(wrong.status).toBe(404)
    expect(await store.list(KEYS.reviewsPrefix)).toEqual([])
    const badDecision = await call('POST', '/api/admin/radar/breaks', { session, body: { period: '2020 Q2', observationHash: flagged.observationHash, decision: 'approved', note: '' } })
    expect(badDecision.status).toBe(400)

    const evidence = ['https://www.dosm.gov.my/portal-main/release-archive']
    const r = await call('POST', '/api/admin/radar/breaks', { session, body: { period: '2020 Q2', observationHash: flagged.observationHash, decision: 'confirmed', note: 'Movement control order.', evidence } })
    expect(r.status).toBe(201)
    expect(r.body.review).toMatchObject({
      kind: 'break',
      target: 'dosm:2020 Q2',
      decision: 'confirmed',
      note: 'Movement control order.',
      evidence,
      reviewer: 'owner',
      version: 1,
      appliesTo: { sourceId: 'dosm', period: '2020 Q2', observationHash: flagged.observationHash },
    })
    expect(r.body.recalculation).toMatchObject({ outcome: 'published' })
    const newId = r.body.recalculation.manifestId
    expect(newId).not.toBe(BUNDLE_ACTIVE)

    const manifest = await call('GET', '/api/radar/manifest')
    expect(manifest.body.manifestId).toBe(newId)
    expect(manifest.body.previousManifestId).toBe(BUNDLE_ACTIVE)
    expect(manifest.body.breakReviewsVersion).toMatch(/^reviews-/)
    const old = (await getJson(store, KEYS.manifest(BUNDLE_ACTIVE))).value
    expect(manifest.body.snapshots).toEqual(old.snapshots)

    const occupations = await call('GET', '/api/radar/occupations')
    const reviewed = occupations.body.breaks.find((b) => b.period === '2020 Q2')
    expect(reviewed).toMatchObject({ status: 'confirmed', reviewId: r.body.review.reviewId })
    expect(occupations.body.breaks.find((b) => b.period === '2020 Q3').status).toBe('unreviewed')

    // An annotation records history; the effective status stays with the newest status decision.
    const note = await call('POST', '/api/admin/radar/breaks', { session, body: { period: '2020 Q2', observationHash: flagged.observationHash, decision: 'annotate', note: 'See listing title.' } })
    expect(note.status).toBe(201)
    expect(note.body.review.version).toBe(2)
    const again = await call('GET', '/api/admin/radar/breaks', { session })
    expect(again.body.breaks.find((b) => b.period === '2020 Q2').status).toBe('confirmed')
    expect(again.body.reviews.map((x) => x.decision)).toEqual(['confirmed', 'annotate'])
  })
})

describe('recalculation after a break review', () => {
  it('no stored break reviews → no_change; a recalculation never counts as a check of a data source', async () => {
    const { radar } = await start()
    await call('GET', '/api/radar/manifest')
    expect((await radar.ingestor.recalculate()).outcome).toBe('no_change')
    expect(await radar.checks()).toEqual({})
  })

  it('a recalculation that cannot publish keeps the review and says it applies at the next refresh', async () => {
    const store = createMemoryStore()
    const { radar } = await start({ store })
    const session = await login()
    const list = await call('GET', '/api/admin/radar/breaks', { session })
    const flagged = list.body.breaks.find((b) => b.period === '2020 Q3')
    // Signals cannot be written from now on: the recalculation fails, the active manifest stays.
    const put = store.put
    store.put = async (key, ...rest) => {
      if (key.startsWith('prod/signals/')) throw Object.assign(new Error('down'), { name: 'StoreError', code: 'store_unavailable' })
      return put(key, ...rest)
    }
    const r = await call('POST', '/api/admin/radar/breaks', { session, body: { period: '2020 Q3', observationHash: flagged.observationHash, decision: 'dismissed_counts', note: '' } })
    expect(r.status).toBe(201)
    expect(r.body.recalculation).toMatchObject({ outcome: 'failed', code: 'store_unavailable', appliesAt: 'next_refresh' })
    expect((await loadReviews(store, 'break')).map((x) => x.decision)).toEqual(['dismissed_counts'])
    expect((await call('GET', '/api/radar/manifest')).body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(radar).toBeTruthy()
  })
})

describe('GET /api/admin/radar/export', () => {
  it('returns approved mappings and the review records only', async () => {
    await start()
    const session = await login()
    await call('POST', '/api/admin/radar/mappings', { session, body: { mappingId: '06-language', decision: 'approved', note: '' } })
    await call('POST', '/api/admin/radar/mappings', { session, body: { mappingId: '06-genmedia', decision: 'rejected', note: '' } })
    const r = await call('GET', '/api/admin/radar/export', { session })
    expect(r.status).toBe(200)
    expect(r.body.schemaVersion).toBe('radar-field-topics/v1')
    expect(r.body.mappings.map((m) => m.mappingId)).toEqual(['06-language'])
    expect(r.body.mappings.every((m) => m.reviewStatus === 'approved')).toBe(true)
    expect(r.body.reviews.map((x) => x.target).sort()).toEqual(['06-genmedia', '06-language'])
  })
})

describe('orphans and cleanup', () => {
  it('cleanup deletes the orphans status lists and keeps everything a stored manifest references', async () => {
    const { store } = await start()
    const session = await login()
    await call('GET', '/api/radar/manifest') // seeds prod/ from the bundle
    const live = await store.list('prod/')
    // Left behind by interrupted runs: a snapshot, signals, and a manifest that was never activated.
    const active = (await getJson(store, KEYS.manifest(BUNDLE_ACTIVE))).value
    await store.put(KEYS.snapshot('openalex', 'openalex-left'), toBytes({ snapshotId: 'openalex-left' }))
    await store.put(KEYS.signals('signals-left'), toBytes({ signals: [] }))
    await store.put(KEYS.manifest('manifest-left'), toBytes({ ...active, manifestId: 'manifest-left', signalsId: 'signals-left', previousManifestId: BUNDLE_ACTIVE }))
    const status = await call('GET', '/api/admin/radar/status', { session })
    expect(status.body.orphans).toEqual([KEYS.manifest('manifest-left'), KEYS.signals('signals-left'), KEYS.snapshot('openalex', 'openalex-left')].sort())

    const r = await call('POST', '/api/admin/radar/cleanup', { session })
    expect(r.status).toBe(200)
    expect(r.body.deleted.sort()).toEqual(status.body.orphans)
    expect(r.body.refused).toEqual([])
    expect((await store.list('prod/')).sort()).toEqual(live.sort())
    expect((await call('GET', '/api/radar/manifest')).body.manifestId).toBe(BUNDLE_ACTIVE)
    expect((await call('GET', '/api/admin/radar/status', { session })).body.orphans).toEqual([])
  })

  it('removeOrphans refuses any key a stored manifest references and anything outside the scanned prefixes', async () => {
    const store = createMemoryStore()
    await start({ store })
    await call('GET', '/api/radar/manifest')
    const active = (await getJson(store, KEYS.manifest(BUNDLE_ACTIVE))).value
    // A stored (not active) manifest still references this snapshot: it must stay.
    await store.put(KEYS.snapshot('dosm', 'dosm-kept'), toBytes({ snapshotId: 'dosm-kept' }))
    await store.put(KEYS.manifest('manifest-other'), toBytes({ ...active, manifestId: 'manifest-other', snapshots: { ...active.snapshots, dosm: 'dosm-kept' } }))
    const referenced = [
      KEYS.active,
      KEYS.manifest(BUNDLE_ACTIVE),
      KEYS.snapshot('dosm', active.snapshots.dosm),
      KEYS.signals(active.signalsId),
      'prod/reviews/review-x.json',
      'prod/ingest-log/x.json',
      'demo/abc/x.json',
    ]
    const out = await removeOrphans(store, [...referenced, KEYS.snapshot('dosm', 'dosm-kept')])
    expect(out.deleted).toEqual([])
    expect(out.refused.sort()).toEqual([...referenced, KEYS.snapshot('dosm', 'dosm-kept')].sort())
    expect(await store.get(KEYS.snapshot('dosm', 'dosm-kept'))).not.toBe(null)
    expect((await findOrphans(store)).orphans).toContain(KEYS.manifest('manifest-other'))
  })
})
