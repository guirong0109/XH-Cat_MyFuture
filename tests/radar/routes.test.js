// Public Radar API (spec §6.5, §7, §12, §13): manifest consistency, answer states, bundled read-only fallback, seeding.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { StoreError } from '../../server/store/d1.js'
import { KEYS, contentHash, getJson, sha256, toBytes } from '../../server/radar/manifest.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { createRadarService, createRadarServiceFromEnv, radarStoreFromEnv } from '../../server/radar/service.js'
import { sourceStates } from '../../shared/radar/states.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { FORBIDDEN_KEY_PATTERN, validateSignal } from '../../shared/radar/contract.js'
import { effectiveFieldTopics } from '../../shared/radar/relevance.js'

const BUNDLE_ACTIVE = 'manifest-20261030T113958.380Z-ebe71e1d'
const BUNDLE_OLDER = 'manifest-20261030T073351.495Z-2c6bf0d6'
const OPENALEX_SNAPSHOT = 'openalex-20261030T073351Z'
const DOSM_SNAPSHOT = 'dosm-2026q2-20261030T073351Z'
const DOSM_ORIGINAL = '965f2f20bcb33425eb43eac7f9edfcff186e7fa92048b8b26f8ee8bbe5d25764'
const DAY = 86400000
const at = (iso) => () => new Date(iso)

let references
const bundleStore = createFileStore('data/radar/bundle')
beforeAll(async () => {
  references = await loadRadarReferences('data')
})

let server
let base
async function start(radar, extra = {}) {
  server = createApp({ radar, d1: null, tempStore: null, llmProviders: [], onetLive: null, ...extra }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
}
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})
const get = async (route) => {
  const response = await fetch(`${base}${route}`)
  return { status: response.status, body: await response.json() }
}
const service = (options = {}) =>
  createRadarService({ store: null, bundleStore, references: async () => references, ingestor: null, now: at('2026-10-31T00:00:00Z'), ...options })

// An ingestor stand-in: only status() is read by the public API.
const ingestorWith = (lastChecks) => ({ status: () => ({ lastChecks, orphans: [], log: [] }) })

function keysOf(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) out.push(k), keysOf(v, out)
  return out
}

describe('Radar answer states (shared/radar/states.js)', () => {
  const manifest = { manifestId: 'm1', snapshots: { openalex: 'o1', dosm: 'd1' } }
  const snapshots = {
    openalex: { snapshotId: 'o1', fetchedAt: '2026-10-01T00:00:00Z', lastYear: 2025, observations: [{ value: 5 }] },
    dosm: { snapshotId: 'd1', fetchedAt: '2026-10-01T00:00:00Z', lastQuarter: '2026 Q2', meta: { publishedAt: '2026-08-18' }, observations: [{ value: 5 }] },
  }

  it('OpenAlex is stale after 14 days without a successful check; DOSM 14 days after publishedAt + 92 days', () => {
    const fresh = sourceStates({ manifest, snapshots, servedFrom: 'active_manifest', lastChecks: {}, now: new Date('2026-10-15T00:00:00Z'), config: RADAR_CONFIG })
    expect(fresh.openalex.freshness).toBe('current')
    expect(fresh.dosm.freshness).toBe('current')
    expect(fresh.dosm.expectedNextRelease).toBe('2026-11-18')
    const later = sourceStates({ manifest, snapshots, servedFrom: 'active_manifest', lastChecks: {}, now: new Date('2026-10-15T00:00:01Z'), config: RADAR_CONFIG })
    expect(later.openalex.freshness).toBe('stale')
    // A successful check (even "no new data") renews OpenAlex.
    const checked = sourceStates({ manifest, snapshots, servedFrom: 'active_manifest', lastChecks: { openalex: { checkedAt: '2026-10-14T00:00:00Z', outcome: 'no_change', code: null, lastOkAt: '2026-10-14T00:00:00Z' } }, now: new Date('2026-10-20T00:00:00Z'), config: RADAR_CONFIG })
    expect(checked.openalex).toMatchObject({ freshness: 'current', refreshHealth: 'ok', servedFrom: 'active_manifest', lastSuccessAt: '2026-10-14T00:00:00.000Z' })
    expect(sourceStates({ manifest, snapshots, servedFrom: 'active_manifest', lastChecks: {}, now: new Date('2026-12-02T00:00:00Z'), config: RADAR_CONFIG }).dosm.freshness).toBe('current')
    expect(sourceStates({ manifest, snapshots, servedFrom: 'active_manifest', lastChecks: {}, now: new Date('2026-12-02T00:00:01Z'), config: RADAR_CONFIG }).dosm.freshness).toBe('stale')
  })

  it('availability: data, no_records (no values), unavailable (no snapshot)', () => {
    const states = sourceStates({
      manifest: { manifestId: 'm', snapshots: { openalex: 'o1', dosm: null } },
      snapshots: { openalex: { ...snapshots.openalex, observations: [{ value: null }] }, dosm: null },
      servedFrom: 'bundled_read_only',
      lastChecks: {},
      now: new Date('2026-10-02T00:00:00Z'),
      config: RADAR_CONFIG,
    })
    expect(states.openalex.availability).toBe('no_records')
    expect(states.dosm.availability).toBe('unavailable')
    expect(states.dosm.refreshHealth).toBe('not_configured')
  })
})

describe('public Radar API', () => {
  it('without R2 serves the bundled manifest read-only (Test 19)', async () => {
    await start(service())
    const { status, body } = await get('/api/radar/manifest')
    expect(status).toBe(200)
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.activeManifestId).toBe(BUNDLE_ACTIVE)
    expect(body.devStore).toBe(false)
    for (const source of ['openalex', 'dosm']) {
      expect(body.states[source]).toMatchObject({ availability: 'data', freshness: 'current', refreshHealth: 'not_configured', servedFrom: 'bundled_read_only' })
    }
    expect(body.snapshots).toEqual({ openalex: OPENALEX_SNAPSHOT, dosm: DOSM_SNAPSHOT, 'onet-skills': 'onet-skills-31.0', 'onet-hottech': 'onet-hottech-2025-f6300b66' })
  })

  it('with R2 configured but unreachable and nothing cached, falls back to the bundle and says the store failed (Test 19)', async () => {
    const broken = { get: async () => { throw new StoreError('store_unavailable') }, put: async () => { throw new StoreError('store_unavailable') }, list: async () => [], delete: async () => {} }
    await start(service({ store: broken }))
    const { status, body } = await get('/api/radar/manifest')
    expect(status).toBe(200)
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.openalex).toMatchObject({ servedFrom: 'bundled_read_only', refreshHealth: 'failed', refreshCode: 'store_unavailable', availability: 'data' })
  })

  it('a writable store without prod/active.json is seeded from the bundle once, checked, then served as the active manifest (R22)', async () => {
    const store = createMemoryStore()
    await start(service({ store, ingestor: ingestorWith({}) }))
    const { body } = await get('/api/radar/manifest')
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.openalex).toMatchObject({ servedFrom: 'active_manifest', refreshHealth: 'never_run', availability: 'data' })
    expect((await getJson(store, KEYS.active)).value.manifestId).toBe(BUNDLE_ACTIVE)
    for (const key of [
      KEYS.manifest(BUNDLE_ACTIVE),
      KEYS.manifest(BUNDLE_OLDER),
      KEYS.snapshot('openalex', OPENALEX_SNAPSHOT),
      KEYS.snapshot('dosm', DOSM_SNAPSHOT),
      KEYS.original('dosm', DOSM_ORIGINAL),
      KEYS.signals('signals-20261030T073351.583Z-74046a19'),
      KEYS.signals('signals-20261030T073351.495Z-2c6bf0d6'),
      KEYS.signals('signals-20261030T113958.380Z-ebe71e1d'),
      KEYS.snapshot('onet-skills', 'onet-skills-31.0'),
      KEYS.snapshot('onet-skills', 'onet-skills-30.2'),
      KEYS.snapshot('onet-hottech', 'onet-hottech-2025-f6300b66'),
      KEYS.original('onet-hottech', 'f6300b66b9e725c5999d30d803be87c2c2de18262500145709a161f322ec9e9f'),
    ]) {
      const copied = await store.get(key)
      expect(copied, key).toBeTruthy()
      expect(sha256(copied.bytes)).toBe(sha256((await bundleStore.get(key)).bytes))
    }
    const snap = (await getJson(store, KEYS.snapshot('dosm', DOSM_SNAPSHOT))).value
    expect(contentHash(snap)).toBe(snap.contentHash)
    const etag = (await store.get(KEYS.active)).etag
    await get('/api/radar/manifest')
    expect((await store.get(KEYS.active)).etag).toBe(etag)
  })

  it('two servers seeding the same empty store at once: one activates, the other loses harmlessly', async () => {
    const store = createMemoryStore()
    const a = service({ store, ingestor: ingestorWith({}) })
    const b = service({ store, ingestor: ingestorWith({}) })
    const [ra, rb] = await Promise.all([a.answer(), b.answer()])
    expect(ra.manifestId).toBe(BUNDLE_ACTIVE)
    expect(rb.manifestId).toBe(BUNDLE_ACTIVE)
    expect((await getJson(store, KEYS.active)).value.manifestId).toBe(BUNDLE_ACTIVE)
  })

  it('a seed whose copied snapshot reads back wrong does not activate', async () => {
    const inner = createMemoryStore()
    const corrupting = {
      ...inner,
      get: async (key) => {
        const got = await inner.get(key)
        if (got && key === KEYS.snapshot('dosm', DOSM_SNAPSHOT)) return { ...got, bytes: Buffer.from(JSON.stringify({ ...JSON.parse(got.bytes), observations: [] })) }
        return got
      },
    }
    await start(service({ store: corrupting, ingestor: ingestorWith({}) }))
    const { body } = await get('/api/radar/manifest')
    expect(await inner.get(KEYS.active)).toBeNull()
    expect(body.states.dosm.servedFrom).toBe('bundled_read_only')
    expect(body.states.dosm.refreshHealth).toBe('failed')
  })

  it('stale + cached_fallback + failed together (Test 26)', async () => {
    const store = createMemoryStore()
    const lastChecks = { openalex: { checkedAt: '2026-11-19T00:00:00Z', outcome: 'failed', code: 'openalex_rate_limited', manifestId: BUNDLE_ACTIVE, lastOkAt: null } }
    await start(service({ store, ingestor: ingestorWith(lastChecks), now: at('2026-11-19T00:00:00Z') }))
    const { body } = await get('/api/radar/ai/topics')
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.openalex).toMatchObject({ availability: 'data', freshness: 'stale', refreshHealth: 'failed', refreshCode: 'openalex_rate_limited', servedFrom: 'cached_fallback' })
    expect(body.states.dosm).toMatchObject({ availability: 'data', freshness: 'current', refreshHealth: 'never_run', servedFrom: 'active_manifest' })
    expect(body.axes).toHaveLength(6)
  })

  it('when the store stops answering after a good read, the last good manifest is served as cached_fallback', async () => {
    const inner = createMemoryStore()
    let down = false
    const flaky = {
      get: async (key) => { if (down) throw new StoreError('store_unavailable'); return inner.get(key) },
      put: async (...args) => { if (down) throw new StoreError('store_unavailable'); return inner.put(...args) },
      list: async (prefix) => inner.list(prefix),
      delete: async (key) => inner.delete(key),
    }
    await start(service({ store: flaky, ingestor: ingestorWith({}) }))
    expect((await get('/api/radar/manifest')).body.states.dosm.servedFrom).toBe('active_manifest')
    down = true
    const { status, body } = await get('/api/radar/occupations')
    expect(status).toBe(200)
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.dosm).toMatchObject({ servedFrom: 'cached_fallback', refreshHealth: 'failed', refreshCode: 'store_unavailable', availability: 'data' })
  })

  it('an unknown manifest id → 409 manifest_gone; an older stored one is served as asked (Review Focus 4)', async () => {
    const store = createMemoryStore()
    await start(service({ store, ingestor: ingestorWith({}) }))
    for (const id of ['manifest-nope', '..%2Fprod%2Factive', 'x'.repeat(200)]) {
      const gone = await get(`/api/radar/occupations?manifest=${id}`)
      expect(gone.status, id).toBe(409)
      expect(gone.body).toEqual({ error: { code: 'manifest_gone', message: expect.any(String), retryable: false } })
    }
    const older = await get(`/api/radar/ai/topics?manifest=${BUNDLE_OLDER}`)
    expect(older.status).toBe(200)
    expect(older.body.manifestId).toBe(BUNDLE_OLDER)
    expect(older.body.activeManifestId).toBe(BUNDLE_ACTIVE)
    expect(older.body.states.openalex.availability).toBe('unavailable')
    expect(older.body.states.dosm.availability).toBe('data')

    // The active manifest changes between two requests of one screen: the old id still answers as it did.
    const newer = { ...(await getJson(store, KEYS.manifest(BUNDLE_ACTIVE))).value, manifestId: 'manifest-newer', previousManifestId: BUNDLE_ACTIVE }
    await store.put(KEYS.manifest('manifest-newer'), toBytes(newer), { ifNoneMatch: '*' })
    const { etag } = await store.get(KEYS.active)
    await store.put(KEYS.active, toBytes({ manifestId: 'manifest-newer', activatedAt: '2026-10-31T00:00:00Z' }), { ifMatch: etag })
    const same = await get(`/api/radar/occupations?manifest=${BUNDLE_ACTIVE}`)
    expect(same.status).toBe(200)
    expect(same.body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(same.body.activeManifestId).toBe('manifest-newer')
    expect((await get('/api/radar/manifest')).body.manifestId).toBe('manifest-newer')

    // A manifest no longer stored is gone, even though this server read it a moment ago.
    await store.delete(KEYS.manifest(BUNDLE_OLDER))
    const broken = await get(`/api/radar/occupations?manifest=${BUNDLE_OLDER}`)
    expect(broken.status).toBe(409)
    // A stored manifest whose signals are missing is not complete, so it is gone too.
    await store.put(KEYS.manifest('manifest-partial'), toBytes({ ...newer, manifestId: 'manifest-partial', signalsId: 'signals-missing' }), { ifNoneMatch: '*' })
    expect((await get('/api/radar/occupations?manifest=manifest-partial')).status).toBe(409)
  })

  it('without a store, ?manifest= reads the bundle: the older bundled manifest is served, an unknown id is gone', async () => {
    await start(service())
    expect((await get(`/api/radar/manifest?manifest=${BUNDLE_OLDER}`)).body.manifestId).toBe(BUNDLE_OLDER)
    expect((await get('/api/radar/manifest?manifest=manifest-nope')).status).toBe(409)
  })

  it('/api/radar/occupations has shares, counts, signals and the context indicator labelled context_only', async () => {
    await start(service())
    const { status, body } = await get('/api/radar/occupations')
    expect(status).toBe(200)
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.dosm.availability).toBe('data')
    expect(body.latestPeriod).toBe('2026 Q2')
    expect(body.publishedAt).toBe('2026-08-18')
    expect(body.groups).toHaveLength(9)
    const technicians = body.groups.find((g) => g.code === '3')
    const q2 = body.periods.indexOf('2026 Q2')
    expect(technicians.counts[q2]).toBe(86512)
    expect(technicians.shares[q2]).toBeCloseTo((86512 / body.total[q2]) * 100, 10)
    expect(technicians.signal.signalId).toBe('dosm:masco2020:3')
    expect(technicians.signal.evidenceLinks.length).toBeGreaterThan(0)
    expect(body.context).toMatchObject({ label: 'context_only', period: '2026 Q2', previousPeriod: '2026 Q1' })
    expect(body.context.totalChangePercent).toBeCloseTo(-11.3824, 3)
    expect(body.breaks.map((b) => b.period)).toEqual(['2020 Q2', '2020 Q3', '2021 Q3', '2025 Q3'])
    expect(body.sourceLinks.length).toBeGreaterThan(0)
  })

  it('/api/radar/ai/topics has six axes with series, momentum and signals, plus the reference series', async () => {
    await start(service())
    const { body } = await get('/api/radar/ai/topics')
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.lastYear).toBe(2025)
    const language = body.axes.find((a) => a.axisId === 'language')
    expect(language.openalexId).toBe('T10028')
    expect(language.officialTitle).toBe('Topic Modeling')
    expect(language.series[0]).toEqual({ year: 2015, value: 1875 })
    expect(language.series.at(-1).year).toBe(2025)
    expect(language.momentum.counts.current.value).toEqual(expect.any(Number))
    expect(language.signal.signalId).toBe('openalex:T10028')
    expect(body.reference.series).toHaveLength(11)
  })

  it('/api/radar/signals/:id gives one signal; an unknown id is 404', async () => {
    await start(service())
    const { status, body } = await get('/api/radar/signals/dosm:masco2020:4')
    expect(status).toBe(200)
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.dosm).toBeTruthy()
    expect(body.signal.signalId).toBe('dosm:masco2020:4')
    const missing = await get('/api/radar/signals/dosm:masco2020:99')
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('not_found')
  })

  it('/api/radar/sources lists both sources with links, policy, periods and states', async () => {
    await start(service())
    const { body } = await get('/api/radar/sources')
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.sources.map((s) => s.sourceId)).toEqual(['openalex', 'dosm'])
    const dosm = body.sources.find((s) => s.sourceId === 'dosm')
    expect(dosm).toMatchObject({ snapshotId: DOSM_SNAPSHOT, observationPeriod: '2026 Q2', publishedAt: '2026-08-18' })
    for (const s of body.sources) {
      expect(s.links.length).toBeGreaterThan(0)
      expect(s.policy).toEqual(expect.any(String))
      expect(body.states[s.sourceId]).toBeTruthy()
    }
  })

  it('/api/radar/references gives what the browser needs for personal relevance, nothing personal', async () => {
    await start(service())
    const { body } = await get('/api/radar/references')
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.openalex).toBeTruthy()
    expect(body.topics).toHaveLength(6)
    expect(body.fieldTopics).toEqual([]) // all proposals are pending today; only approved links are public
    expect(body.bridge.schemaVersion).toBe('radar-occupation-bridge/v1')
    expect(body.bridge.steps.length).toBeGreaterThan(0)
    const field = body.fields.find((f) => f.code === '0613')
    expect(field.title).toEqual(expect.any(String))
    expect(field.jobs.length).toBeGreaterThan(0)
    expect(body.emascoRoles.length).toBeGreaterThan(0)
  })

  it('/api/radar/references serves decided field-topic records only, never pending (R26)', async () => {
    await start(service())
    expect(references.fieldTopics.length).toBeGreaterThan(0)
    expect((await get('/api/radar/references')).body.fieldTopics).toEqual([]) // all pending today
    await new Promise((resolve) => server.close(resolve))
    const record = (mappingId, iscedCode, axisId, reviewStatus) => ({ mappingId, iscedCode, axisId, relationship: 'field_related_to_ai_topic', method: 'curated', reviewStatus, mappingVersion: 'radar-field-topics/v1' })
    const approved = record('m-06-language', '06', 'language', 'approved')
    const rejected = record('m-0613-language', '0613', 'language', 'rejected')
    const pending = record('m-07-robotics', '07', 'robotics', 'pending')
    await start(service({ references: async () => ({ ...references, fieldTopics: [approved, rejected, pending] }) }))
    const { body } = await get('/api/radar/references')
    expect(body.fieldTopics).toEqual([approved, rejected])
    expect(effectiveFieldTopics(body.fieldTopics, '0613')).toEqual([])
    expect(effectiveFieldTopics(body.fieldTopics, '0612')).toEqual([{ axisId: 'language', mappingId: 'm-06-language', level: 'broad' }])
  })

  it('refresh state comes from the stored ingest log: a new service reports a failed refresh; a recent no_change check keeps OpenAlex current (R23)', async () => {
    const store = createMemoryStore()
    await service({ store }).answer() // seeds prod/
    const entry = (time, source, outcome, code) => ({ time, source, operation: 'refresh', outcome, ...(code ? { code } : {}), ids: {} })
    const put = (stamp, e) => store.put(KEYS.ingestLog(stamp), toBytes(e), { ifNoneMatch: '*' })
    await put('20261110T000000.000Z-aaaa0001', entry('2026-11-10T00:00:00.000Z', 'dosm', 'published'))
    await put('20261118T000000.000Z-aaaa0002', entry('2026-11-18T00:00:00.000Z', 'openalex', 'no_change'))
    await put('20261119T000000.000Z-aaaa0003', entry('2026-11-19T00:00:00.000Z', 'dosm', 'failed', 'dosm_layout_unexpected'))
    // A fresh process (no in-memory checks), 20 days after the OpenAlex snapshot was fetched.
    await start(service({ store, ingestor: ingestorWith({}), now: at('2026-11-20T00:00:00Z') }))
    const { body } = await get('/api/radar/manifest')
    expect(body.states.dosm).toMatchObject({ refreshHealth: 'failed', refreshCode: 'dosm_layout_unexpected', servedFrom: 'cached_fallback', lastCheckedAt: '2026-11-19T00:00:00.000Z' })
    expect(body.states.dosm.lastSuccessAt).toBe('2026-11-10T00:00:00.000Z')
    expect(body.states.openalex).toMatchObject({ refreshHealth: 'ok', freshness: 'current', servedFrom: 'active_manifest', lastSuccessAt: '2026-11-18T00:00:00.000Z' })
  })

  it('stored checks are cached briefly and re-read after a refresh through the service', async () => {
    const store = createMemoryStore()
    let lists = 0
    const counting = { ...store, list: async (prefix) => { lists += 1; return store.list(prefix) } }
    let clock = new Date('2026-10-31T00:00:00Z')
    const refreshes = []
    const ingestor = { status: () => ({ lastChecks: {}, orphans: [], log: [] }), refresh: async (source) => { refreshes.push(source); await store.put(KEYS.ingestLog('20261031T000001.000Z-bbbb0001'), toBytes({ time: '2026-10-31T00:00:01.000Z', source, operation: 'refresh', outcome: 'failed', code: 'source_unavailable', ids: {} })); return { outcome: 'failed', code: 'source_unavailable' } } }
    const radar = service({ store: counting, ingestor, now: () => clock })
    await radar.answer()
    await radar.answer()
    const afterTwo = lists
    expect((await radar.answer()).states.openalex.refreshHealth).toBe('never_run')
    expect(lists).toBe(afterTwo) // no new listing within the cache time
    await radar.ingestor.refresh('openalex')
    expect((await radar.answer()).states.openalex).toMatchObject({ refreshHealth: 'failed', refreshCode: 'source_unavailable' })
    expect(refreshes).toEqual(['openalex'])
    const before = lists
    clock = new Date(clock.getTime() + 61000)
    await radar.answer()
    expect(lists).toBe(before + 1)
  })

  it('a seed that meets different bytes under a bundled key reports publish_conflict, not store_unavailable', async () => {
    const store = createMemoryStore()
    await store.put(KEYS.manifest(BUNDLE_ACTIVE), toBytes({ manifestId: BUNDLE_ACTIVE, different: true }))
    const answer = await service({ store }).answer()
    expect(answer.states.dosm).toMatchObject({ servedFrom: 'bundled_read_only', refreshHealth: 'failed', refreshCode: 'publish_conflict' })
    expect(await store.get(KEYS.active)).toBeNull()
  })

  it('/api/radar/export carries decided field-topic records (approved + rejected), never pending (R26)', async () => {
    const record = (mappingId, iscedCode, axisId, reviewStatus) => ({ mappingId, iscedCode, axisId, relationship: 'field_related_to_ai_topic', method: 'curated', reviewStatus, mappingVersion: 'radar-field-topics/v1' })
    const approved = record('m-06-language', '06', 'language', 'approved')
    const rejected = record('m-0613-language', '0613', 'language', 'rejected')
    const pending = record('m-07-robotics', '07', 'robotics', 'pending')
    await start(service({ references: async () => ({ ...references, fieldTopics: [approved, rejected, pending] }) }))
    const { body } = await get('/api/radar/export')
    expect(body.references.fieldTopics).toEqual([approved, rejected])
    expect(effectiveFieldTopics(body.references.fieldTopics, '0613')).toEqual([])
    expect(effectiveFieldTopics(body.references.fieldTopics, '0612')).toEqual([{ axisId: 'language', mappingId: 'm-06-language', level: 'broad' }])
  })

  it('/api/radar/export returns radar-signal/v1 only, no score fields', async () => {
    await start(service())
    const { status, body } = await get('/api/radar/export')
    expect(status).toBe(200)
    expect(body.contract).toBe('radar-signal/v1')
    expect(body.manifestId).toBe(BUNDLE_ACTIVE)
    expect(body.states.dosm).toBeTruthy()
    // 15 Round 1 signals (OpenAlex, DOSM); O*NET 30.2 → 30.3: 151 + 219 In Demand changes and 5 new Hot; 176 Hot Technologies counts.
    expect(body.signals.filter((s) => /^(openalex|dosm):/.test(s.signalId))).toHaveLength(15)
    expect(body.signals.filter((s) => /^onet:(indemand|hot):/.test(s.signalId))).toHaveLength(375)
    expect(body.signals.filter((s) => s.signalId.startsWith('onet:postings:'))).toHaveLength(176)
    expect(body.signals).toHaveLength(566)
    for (const s of body.signals) {
      expect(s.contract).toBe('radar-signal/v1')
      expect(validateSignal(s).ok, s.signalId).toBe(true)
      expect(s.manifestId).toBe(BUNDLE_ACTIVE)
    }
    expect(keysOf(body).filter((k) => FORBIDDEN_KEY_PATTERN.test(k))).toEqual([])
    expect(body.references.topics).toHaveLength(6)
  })

  it('the Radar routes are read-only: a POST is not a route', async () => {
    await start(service())
    const response = await fetch(`${base}/api/radar/references`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"profile":{}}' })
    expect(response.status).toBe(404)
  })

  it('a server without Radar data answers 503 not_configured, never crashes', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'radar-'))
    try {
      await start(service({ bundleStore: createFileStore(empty) }))
      const { status, body } = await get('/api/radar/manifest')
      expect(status).toBe(503)
      expect(body).toEqual({ error: { code: 'not_configured', message: expect.any(String), retryable: false } })
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })

  it('createApp builds the Radar from the environment by default (bundled, read-only)', async () => {
    await start(undefined)
    const { status, body } = await get('/api/radar/manifest')
    expect(status).toBe(200)
    expect(body.states.openalex.servedFrom).toBe('bundled_read_only')
  })
})

describe('Radar store from the environment', () => {
  it('RADAR_STORE=memory is refused in production', () => {
    const errors = []
    const picked = radarStoreFromEnv({ RADAR_STORE: 'memory', NODE_ENV: 'production' }, { logError: (m) => errors.push(m) })
    expect(picked.store).toBeNull()
    expect(picked.devStore).toBe(false)
    expect(picked.refused).toBe('memory_store_in_production')
    expect(errors.join(' ')).toMatch(/RADAR_STORE=memory/)
    const radar = createRadarServiceFromEnv({ dataDir: 'data', env: { RADAR_STORE: 'memory', NODE_ENV: 'production' }, logError: () => {} })
    expect(radar.info()).toMatchObject({ writable: false, devStore: false })
  })

  it('RADAR_STORE=memory outside production is a writable development store, flagged devStore', async () => {
    const picked = radarStoreFromEnv({ RADAR_STORE: 'memory', NODE_ENV: 'development' })
    expect(picked.store).toBeTruthy()
    expect(picked.devStore).toBe(true)
    const radar = createRadarServiceFromEnv({ dataDir: 'data', env: { RADAR_STORE: 'memory' }, now: at('2026-10-31T00:00:00Z') })
    const answer = await radar.answer()
    expect(answer.devStore).toBe(true)
    expect(answer.states.openalex.servedFrom).toBe('active_manifest')
  })

  it('no settings → no store (bundled read-only); R2 settings → an R2 store', () => {
    expect(radarStoreFromEnv({}).store).toBeNull()
    const r2 = radarStoreFromEnv({ R2_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'c', R2_SECRET_ACCESS_KEY: 'd' })
    expect(r2.store).toBeTruthy()
    expect(r2.devStore).toBe(false)
  })
})
