import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { StoreError } from '../../server/store/d1.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { parseDosmJmi } from '../../server/radar/dosmTable.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { readActive, loadManifest, contentHash, KEYS } from '../../server/radar/manifest.js'
import { createIngestor } from '../../server/radar/ingest.js'
import { runPipeline } from '../../shared/radar/pipeline.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { truncateTable, dosmSnapshotFromTable, openalexSnapshotFromAnalysis } from '../helpers/radarInputs.js'

const NOW = new Date('2026-10-30T08:00:00.000Z')
const clone = (x) => JSON.parse(JSON.stringify(x))
const json = (x) => Buffer.from(JSON.stringify(x))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

let references
let table
let openalexBase
let dosmQ1
let dosmQ2
let workbook
beforeAll(async () => {
  references = await loadRadarReferences('data')
  workbook = await readFile('data/radar/source/dosm-jmi-2026q2.xlsx')
  table = parseDosmJmi(workbook)
  const analysis = JSON.parse(await readFile('docs/radar/index-analysis-openalex-2026-10-30.json', 'utf8'))
  openalexBase = openalexSnapshotFromAnalysis(analysis)
  dosmQ1 = dosmSnapshotFromTable(truncateTable(table, '2026 Q1'), { snapshotId: 'dosm-jmi-2026q1', lastQuarter: '2026 Q1' })
  dosmQ2 = dosmSnapshotFromTable(table, { snapshotId: 'dosm-jmi-2026q2-fetch', lastQuarter: '2026 Q2', originals: [{ name: 'dosm-jmi-2026q2.xlsx', sha256: sha(workbook) }] })
})

// An active manifest made by hand: OpenAlex as analysed, DOSM up to 2026 Q1.
async function seed(store) {
  const out = runPipeline({ snapshots: { openalex: openalexBase, dosm: dosmQ1 }, references, reviews: [], config: RADAR_CONFIG, manifestId: 'manifest-seed' })
  await store.put(KEYS.snapshot('openalex', openalexBase.snapshotId), json(openalexBase))
  await store.put(KEYS.snapshot('dosm', dosmQ1.snapshotId), json(dosmQ1))
  await store.put(KEYS.signals('signals-seed'), json({ signalsId: 'signals-seed', manifestId: 'manifest-seed', ...out }))
  const manifest = {
    manifestId: 'manifest-seed',
    createdAt: '2026-10-29T00:00:00.000Z',
    snapshots: { openalex: openalexBase.snapshotId, dosm: dosmQ1.snapshotId },
    mappingVersion: references.versions.fieldTopics,
    configVersion: RADAR_CONFIG.version,
    signalsId: 'signals-seed',
    breakReviewsVersion: null,
    previousManifestId: null,
  }
  await store.put(KEYS.manifest('manifest-seed'), json(manifest))
  await store.put(KEYS.active, json({ manifestId: 'manifest-seed', activatedAt: manifest.createdAt }))
  return manifest
}

// A fetch of OpenAlex: same content as the analysis unless `edit` changes it; new id and fetch time every time.
function openalexFetch(edit = (s) => s, snapshotId = 'openalex-20261030T080000Z') {
  return edit({ ...clone(openalexBase), snapshotId, fetchedAt: NOW.toISOString(), lastYear: 2025 })
}

function fakeOpenAlex(make) {
  return { lastCompleteYear: () => 2025, fetchSnapshot: async (topics) => make(topics) }
}

function fakeDosm({ discover, fetch } = {}) {
  return {
    calls: [],
    async discover(activeQuarter) {
      this.calls.push(['discover', activeQuarter])
      if (discover) return discover(activeQuarter)
      return { status: 'new', release: { quarter: '2026 Q2', title: 'Job Market Insights, Second Quarter of 2026', publishedAt: '2026-08-18' } }
    },
    async fetchSnapshot(release) {
      this.calls.push(['fetchSnapshot', release.quarter])
      if (fetch) return fetch(release)
      return { snapshot: clone(dosmQ2), original: { name: 'dosm-jmi-2026q2.xlsx', bytes: workbook, sha256: sha(workbook) } }
    },
  }
}

function setup({ openalex, dosm, store = createMemoryStore(), refs } = {}) {
  const logged = []
  const ingestor = createIngestor({
    store,
    sources: { openalex: openalex ?? fakeOpenAlex(() => openalexFetch()), dosm: dosm ?? fakeDosm() },
    references: refs ?? references,
    config: RADAR_CONFIG,
    now: () => NOW,
    log: (entry) => logged.push(entry),
  })
  return { ingestor, store, logged }
}

async function activeBytes(store) {
  const got = await store.get(KEYS.active)
  return got && { text: got.bytes.toString('utf8'), etag: got.etag }
}

const DATA_PREFIXES = ['prod/snapshots/', 'prod/signals/', 'prod/manifests/', 'prod/originals/']
async function dataKeys(store) {
  return (await Promise.all(DATA_PREFIXES.map((p) => store.list(p)))).flat()
}

// Bump one OpenAlex topic count for 2019 by 10%.
const revise = (factor = 1.1, topic = 'T10028', period = '2019') => (s) => {
  const o = s.observations.find((x) => x.entityId === topic && x.period === period)
  o.value = Math.round(o.value * factor)
  return s
}

// Wraps a store so tests can fail or alter chosen operations and see the order of calls.
function instrumented(base, { failPut, alterGet } = {}) {
  const calls = []
  return {
    calls,
    get: async (key) => {
      calls.push(['get', key])
      const got = await base.get(key)
      return alterGet ? alterGet(key, got) : got
    },
    put: async (key, bytes, opts) => {
      calls.push(['put', key])
      if (failPut?.(key)) throw new StoreError('store_unavailable')
      return base.put(key, bytes, opts)
    },
    list: (prefix) => base.list(prefix),
    delete: (key) => base.delete(key),
  }
}

const ALLOWED_LOG_KEYS = ['time', 'source', 'operation', 'outcome', 'code', 'ids']
function expectCleanLog(entries) {
  for (const e of entries) {
    for (const k of Object.keys(e)) expect(ALLOWED_LOG_KEYS).toContain(k)
    for (const v of Object.values(e.ids ?? {})) expect(v === null || typeof v === 'string').toBe(true)
  }
  const text = JSON.stringify(entries)
  expect(text).not.toMatch(/observations|"value"|api_key|signals"/)
}

describe('manifest helpers', () => {
  it('readActive and loadManifest read the pointer, its etag and the manifest; absent → null', async () => {
    const store = createMemoryStore()
    expect(await readActive(store)).toBe(null)
    expect(await loadManifest(store, 'manifest-seed')).toBe(null)
    const manifest = await seed(store)
    const active = await readActive(store)
    expect(active.manifest).toEqual(manifest)
    expect(active.etag).toBe((await store.get(KEYS.active)).etag)
    expect(await loadManifest(store, 'manifest-seed')).toEqual(manifest)
    expect(await loadManifest(store, '../active')).toBe(null)
  })

  it('contentHash is the SHA-256 of the canonical content: ids and fetch times do not change it', () => {
    const a = openalexFetch()
    const b = { ...openalexFetch(), snapshotId: 'other', fetchedAt: '2020-01-01T00:00:00Z' }
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(contentHash(a)).toBe(contentHash(b))
    expect(contentHash(revise()(openalexFetch()))).not.toBe(contentHash(a))
  })
})

describe('createIngestor().refresh', () => {
  it('identical content after a repeated fetch → no_change, active unchanged (Test 16)', async () => {
    const { ingestor, store, logged } = setup()
    await seed(store)
    const before = await activeBytes(store)
    const keys = await dataKeys(store)
    const result = await ingestor.refresh('openalex')
    expect(result).toMatchObject({ outcome: 'no_change' })
    expect(await activeBytes(store)).toEqual(before)
    expect(await dataKeys(store)).toEqual(keys)
    expect(ingestor.status().lastChecks.openalex).toMatchObject({ outcome: 'no_change', checkedAt: NOW.toISOString(), lastOkAt: NOW.toISOString() })
    expect(logged.at(-1)).toMatchObject({ source: 'openalex', outcome: 'no_change' })
    expectCleanLog(logged)
  })

  it('a valid historical revision publishes and lists the revision (Test 15)', async () => {
    const { ingestor, store } = setup({ openalex: fakeOpenAlex(() => openalexFetch(revise())) })
    await seed(store)
    const old = openalexBase.observations.find((o) => o.entityId === 'T10028' && o.period === '2019').value
    const result = await ingestor.refresh('openalex')
    expect(result.outcome).toBe('published')
    expect(result.diff.observations.revisions).toEqual([{ entityId: 'T10028', period: '2019', old, new: Math.round(old * 1.1) }])
    expect(result.diff.observations.new).toEqual([])
    expect(result.diff.observations.removed).toEqual([])
    expect(result.diff.dependencies.changedSignals.map((c) => c.signalId)).toContain('openalex:T10028')

    const active = await readActive(store)
    expect(active.manifest.manifestId).toBe(result.manifestId)
    expect(active.manifest).toMatchObject({
      snapshots: { openalex: 'openalex-20261030T080000Z', dosm: 'dosm-jmi-2026q1' },
      mappingVersion: references.versions.fieldTopics,
      configVersion: 'radar-config/v1',
      previousManifestId: 'manifest-seed',
      createdAt: NOW.toISOString(),
    })
    expect(Object.keys(active.manifest).sort()).toEqual(
      ['manifestId', 'createdAt', 'snapshots', 'mappingVersion', 'configVersion', 'signalsId', 'breakReviewsVersion', 'previousManifestId'].sort()
    )
    // R19: the revision is written into the saved snapshot so the pipeline can lower evidence quality.
    const saved = JSON.parse((await store.get(KEYS.snapshot('openalex', 'openalex-20261030T080000Z'))).bytes)
    expect(saved.meta.revisions).toEqual(result.diff.observations.revisions)
    const signals = JSON.parse((await store.get(KEYS.signals(active.manifest.signalsId))).bytes)
    expect(signals.manifestId).toBe(result.manifestId)
    const topic = signals.signals.find((s) => s.signalId === 'openalex:T10028')
    expect(topic.revisions.count).toBe(1)
    expect(topic.manifestId).toBe(result.manifestId)
    expect(ingestor.status().lastChecks.openalex).toMatchObject({ outcome: 'published', manifestId: result.manifestId })
  })

  it('a new DOSM quarter publishes, keeps the original workbook and reuses the OpenAlex snapshot', async () => {
    const dosm = fakeDosm()
    const { ingestor, store } = setup({ dosm })
    await seed(store)
    const result = await ingestor.refresh('dosm')
    expect(dosm.calls).toEqual([['discover', '2026 Q1'], ['fetchSnapshot', '2026 Q2']])
    expect(result.outcome).toBe('published')
    expect(result.diff.observations.new.length).toBe(11) // total, unclassified and nine groups for 2026 Q2
    const { manifest } = await readActive(store)
    expect(manifest.snapshots).toEqual({ openalex: openalexBase.snapshotId, dosm: 'dosm-jmi-2026q2-fetch', 'onet-skills': null, 'onet-hottech': null })
    const original = await store.get(`prod/originals/dosm/${sha(workbook)}`)
    expect(Buffer.compare(original.bytes, workbook)).toBe(0)
  })

  it('DOSM with no release after the active quarter → no_change, nothing written', async () => {
    const dosm = fakeDosm({ discover: () => ({ status: 'none' }) })
    const { ingestor, store } = setup({ dosm })
    await seed(store)
    const before = await activeBytes(store)
    const keys = await dataKeys(store)
    expect(await ingestor.refresh('dosm')).toMatchObject({ outcome: 'no_change' })
    expect(dosm.calls).toEqual([['discover', '2026 Q1']])
    expect(await activeBytes(store)).toEqual(before)
    expect(await dataKeys(store)).toEqual(keys)
  })

  it('validation failure → rejected, active unchanged, log has only code and ids', async () => {
    const bad = (s) => {
      s.observations[3].value = -5
      return s
    }
    const { ingestor, store, logged } = setup({ openalex: fakeOpenAlex(() => openalexFetch(bad)) })
    await seed(store)
    const before = await activeBytes(store)
    const keys = await dataKeys(store)
    expect(await ingestor.refresh('openalex')).toMatchObject({ outcome: 'rejected', code: 'validation_failed' })
    expect(await activeBytes(store)).toEqual(before)
    expect(await dataKeys(store)).toEqual(keys)
    expect(logged.at(-1)).toMatchObject({ source: 'openalex', outcome: 'rejected', code: 'validation_failed' })
    expect(logged.at(-1).ids).toMatchObject({ snapshotId: 'openalex-20261030T080000Z' })
    expectCleanLog(logged)
    const stored = await store.list('prod/ingest-log/')
    expect(stored.length).toBeGreaterThan(0)
    const entries = await Promise.all(stored.map(async (k) => JSON.parse((await store.get(k)).bytes)))
    expectCleanLog(entries)
    expect(entries.at(-1)).toMatchObject({ outcome: 'rejected', code: 'validation_failed' })
  })

  it('a signal that fails the radar-signal/v1 contract → rejected, nothing written', async () => {
    const refs = { ...references, versions: { ...references.versions, fieldTopics: null } } // OpenAlex signals lose mappingVersion
    const { ingestor, store } = setup({ openalex: fakeOpenAlex(() => openalexFetch(revise())), refs })
    await seed(store)
    const before = await activeBytes(store)
    const keys = await dataKeys(store)
    expect(await ingestor.refresh('openalex')).toMatchObject({ outcome: 'rejected', code: 'validation_failed' })
    expect(await activeBytes(store)).toEqual(before)
    expect(await dataKeys(store)).toEqual(keys)
  })

  it('removed periods → held for review', async () => {
    const drop2015 = (s) => ({ ...s, observations: s.observations.filter((o) => o.period !== '2015') })
    const { ingestor, store } = setup({ openalex: fakeOpenAlex(() => openalexFetch(drop2015)) })
    await seed(store)
    const before = await activeBytes(store)
    const keys = await dataKeys(store)
    const result = await ingestor.refresh('openalex')
    expect(result).toMatchObject({ outcome: 'held', code: 'periods_removed' })
    expect(result.diff.observations.removed).toContainEqual({ entityId: 'T10028', period: '2015' })
    expect(await activeBytes(store)).toEqual(before)
    expect(await dataKeys(store)).toEqual(keys)
    expect(ingestor.status().lastChecks.openalex).toMatchObject({ outcome: 'held', code: 'periods_removed' })
  })

  it('failure after the snapshot, after signals, or before activation leaves active unchanged and reports orphans (Test 17)', async () => {
    const cases = [
      { failOn: 'prod/signals/', orphans: ['prod/snapshots/'] },
      { failOn: 'prod/manifests/', orphans: ['prod/snapshots/', 'prod/signals/'] },
      { failOn: 'prod/active.json', orphans: ['prod/snapshots/', 'prod/signals/', 'prod/manifests/'] },
    ]
    for (const c of cases) {
      const base = createMemoryStore()
      await seed(base)
      const store = instrumented(base, { failPut: (key) => key.startsWith(c.failOn) })
      const { ingestor } = setup({ store, openalex: fakeOpenAlex(() => openalexFetch(revise())) })
      const before = await activeBytes(base)
      const result = await ingestor.refresh('openalex')
      expect(result).toMatchObject({ outcome: 'failed', code: 'store_unavailable' })
      expect(await activeBytes(base)).toEqual(before)
      const { orphans } = ingestor.status()
      expect(orphans.map((k) => k.split('/').slice(0, 2).join('/') + '/')).toEqual(c.orphans)
      for (const key of orphans) expect(await base.get(key)).not.toBe(null)
      const active = await readActive(base)
      expect(active.manifest.manifestId).toBe('manifest-seed')
      expect(orphans).not.toContain(KEYS.snapshot('openalex', openalexBase.snapshotId))
    }
  })

  it('two refreshes racing: one publishes, the other gets publish_conflict (Test 18)', async () => {
    const store = createMemoryStore()
    await seed(store)
    // Both runs read the active manifest, then wait for each other inside the fetch, so both hold the same etag.
    let arrived = 0
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const racer = (snapshotId, factor) =>
      fakeOpenAlex(async () => {
        arrived += 1
        if (arrived === 2) release()
        await gate
        return openalexFetch(revise(factor), snapshotId)
      })
    const a = setup({ store, openalex: racer('openalex-a', 1.1) }).ingestor
    const b = setup({ store, openalex: racer('openalex-b', 1.2) }).ingestor
    const results = await Promise.all([a.refresh('openalex'), b.refresh('openalex')])
    const outcomes = results.map((r) => r.outcome).sort()
    expect(outcomes).toEqual(['failed', 'published'])
    const winner = results.find((r) => r.outcome === 'published')
    const loser = results.find((r) => r.outcome === 'failed')
    expect(loser.code).toBe('publish_conflict')
    expect(loser.activeManifestId).toBe(winner.manifestId)
    const active = await readActive(store)
    expect(active.manifest.manifestId).toBe(winner.manifestId)
    expect(active.manifest.previousManifestId).toBe('manifest-seed')
    const loserIngestor = results[0] === loser ? a : b
    expect(loserIngestor.status().orphans.length).toBe(3)
    expect(loserIngestor.status().lastChecks.openalex).toMatchObject({ outcome: 'failed', code: 'publish_conflict' })
  })

  it('the last complete year comes from the clock: a snapshot claiming lastYear 2026 is rejected', async () => {
    const add2026 = (s) => {
      const extra = s.observations.filter((o) => o.period === '2025').map((o) => ({ ...o, period: '2026', value: 10 }))
      return { ...s, lastYear: 2026, observations: [...s.observations, ...extra] }
    }
    const claimOnly = (s) => ({ ...s, lastYear: 2026 })
    for (const edit of [add2026, claimOnly]) {
      // No lastCompleteYear on the source: the clock (2026-10-30 UTC) gives 2025.
      const openalex = { fetchSnapshot: async () => edit(openalexFetch(revise())) }
      for (const source of [openalex, fakeOpenAlex(() => edit(openalexFetch(revise())))]) {
        const { ingestor, store } = setup({ openalex: source })
        await seed(store)
        const before = await activeBytes(store)
        const keys = await dataKeys(store)
        expect(await ingestor.refresh('openalex')).toMatchObject({ outcome: 'rejected', code: 'validation_failed' })
        expect(await activeBytes(store)).toEqual(before)
        expect(await dataKeys(store)).toEqual(keys)
      }
    }
  })

  it('a missing signals object of the active manifest → failed manifest_gone, nothing written', async () => {
    const { ingestor, store } = setup({ openalex: fakeOpenAlex(() => openalexFetch(revise())) })
    await seed(store)
    await store.delete(KEYS.signals('signals-seed'))
    const before = await activeBytes(store)
    const keys = await dataKeys(store)
    expect(await ingestor.refresh('openalex')).toMatchObject({ outcome: 'failed', code: 'manifest_gone' })
    expect(await activeBytes(store)).toEqual(before)
    expect(await dataKeys(store)).toEqual(keys)
  })

  it('a failed read-back of the DOSM original stops the activation and reports four orphans', async () => {
    const base = createMemoryStore()
    await seed(base)
    const store = instrumented(base, {
      alterGet: (key, got) => (key.startsWith('prod/originals/') && got ? { ...got, bytes: Buffer.from('not the workbook') } : got),
    })
    const { ingestor } = setup({ store })
    const before = await activeBytes(base)
    expect(await ingestor.refresh('dosm')).toMatchObject({ outcome: 'failed', code: 'store_unavailable' })
    expect(await activeBytes(base)).toEqual(before)
    expect(store.calls.some(([op, key]) => op === 'put' && key === KEYS.active)).toBe(false)
    const orphans = ingestor.status().orphans
    expect(orphans.length).toBe(4)
    expect(orphans).toContain(`prod/originals/dosm/${sha(workbook)}`)
  })

  it('two first publications racing with no active pointer: one publishes, the other gets publish_conflict', async () => {
    const store = createMemoryStore()
    let arrived = 0
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const racer = (snapshotId) =>
      fakeOpenAlex(async () => {
        arrived += 1
        if (arrived === 2) release()
        await gate
        return openalexFetch(undefined, snapshotId)
      })
    const a = setup({ store, openalex: racer('openalex-a') }).ingestor
    const b = setup({ store, openalex: racer('openalex-b') }).ingestor
    const results = await Promise.all([a.refresh('openalex'), b.refresh('openalex')])
    expect(results.map((r) => r.outcome).sort()).toEqual(['failed', 'published'])
    const winner = results.find((r) => r.outcome === 'published')
    const loser = results.find((r) => r.outcome === 'failed')
    expect(loser).toMatchObject({ code: 'publish_conflict', activeManifestId: winner.manifestId })
    const active = await readActive(store)
    expect(active.manifest).toMatchObject({ manifestId: winner.manifestId, previousManifestId: null })
  })

  it('an immutable object is never overwritten: a snapshot id already stored with other content → publish_conflict', async () => {
    const { ingestor, store } = setup({ openalex: fakeOpenAlex(() => openalexFetch(revise(), 'openalex-taken')) })
    await seed(store)
    const key = KEYS.snapshot('openalex', 'openalex-taken')
    await store.put(key, json({ other: true }))
    const stored = await store.get(key)
    const before = await activeBytes(store)
    expect(await ingestor.refresh('openalex')).toMatchObject({ outcome: 'failed', code: 'publish_conflict' })
    expect(await store.get(key)).toEqual(stored)
    expect(await activeBytes(store)).toEqual(before)
    expect(ingestor.status().orphans).toEqual([])
  })

  it('first publication with no active manifest uses only-if-absent, and a second run does not overwrite it', async () => {
    const store = createMemoryStore()
    const { ingestor } = setup({ store })
    const first = await ingestor.refresh('openalex')
    expect(first.outcome).toBe('published')
    const active = await readActive(store)
    expect(active.manifest).toMatchObject({ manifestId: first.manifestId, snapshots: { openalex: 'openalex-20261030T080000Z', dosm: null }, previousManifestId: null })
    expect(await ingestor.refresh('openalex')).toMatchObject({ outcome: 'no_change' })
  })

  it('DOSM refresh with no active DOSM snapshot → failed not_configured, nothing written', async () => {
    const dosm = fakeDosm()
    const { ingestor, store } = setup({ dosm })
    expect(await ingestor.refresh('dosm')).toMatchObject({ outcome: 'failed', code: 'not_configured' })
    expect(dosm.calls).toEqual([])
    expect(await dataKeys(store)).toEqual([])
  })

  it('source failure → failed with the source code; active unchanged', async () => {
    for (const [sourceId, sources, code] of [
      ['openalex', { openalex: fakeOpenAlex(() => { throw new SourceError('openalex_rate_limited', { retryable: true }) }) }, 'openalex_rate_limited'],
      ['openalex', { openalex: fakeOpenAlex(() => { throw new SourceError('openalex_key_missing') }) }, 'openalex_key_missing'],
      ['openalex', { openalex: fakeOpenAlex(() => { throw new TypeError('boom') }) }, 'source_unavailable'],
      ['dosm', { dosm: fakeDosm({ fetch: () => { throw new SourceError('dosm_layout_unexpected') } }) }, 'dosm_layout_unexpected'],
      ['dosm', { dosm: fakeDosm({ discover: () => { throw new SourceError('source_unavailable', { retryable: true }) } }) }, 'source_unavailable'],
    ]) {
      const { ingestor, store, logged } = setup(sources)
      await seed(store)
      const before = await activeBytes(store)
      const keys = await dataKeys(store)
      expect(await ingestor.refresh(sourceId)).toMatchObject({ outcome: 'failed', code })
      expect(await activeBytes(store)).toEqual(before)
      expect(await dataKeys(store)).toEqual(keys)
      expect(ingestor.status().lastChecks[sourceId]).toMatchObject({ outcome: 'failed', code })
      expect(logged.at(-1)).toMatchObject({ source: sourceId, operation: 'fetch', code })
      expectCleanLog(logged)
    }
  })

  it('an unknown source id → failed not_configured', async () => {
    const { ingestor } = setup()
    expect(await ingestor.refresh('../prod')).toMatchObject({ outcome: 'failed', code: 'not_configured' })
  })

  it('manifest references are read back and hash-checked before activation', async () => {
    // A good run: every written object is read back after it is written and before active.json is written.
    const base = createMemoryStore()
    await seed(base)
    const store = instrumented(base)
    const { ingestor } = setup({ store, openalex: fakeOpenAlex(() => openalexFetch(revise())) })
    const result = await ingestor.refresh('openalex')
    expect(result.outcome).toBe('published')
    const { manifest } = await readActive(base)
    const activePut = store.calls.findIndex(([op, key]) => op === 'put' && key === KEYS.active)
    for (const key of [
      KEYS.snapshot('openalex', manifest.snapshots.openalex),
      KEYS.snapshot('dosm', manifest.snapshots.dosm),
      KEYS.signals(manifest.signalsId),
      KEYS.manifest(manifest.manifestId),
    ]) {
      const put = store.calls.findIndex(([op, k]) => op === 'put' && k === key)
      const readBack = store.calls.findLastIndex(([op, k]) => op === 'get' && k === key)
      expect(readBack).toBeGreaterThan(put)
      expect(readBack).toBeLessThan(activePut)
    }

    // A changed or missing object on read-back stops the activation.
    for (const makeAlter of [
      // the new signals object comes back different
      () => (key, got) => (key.startsWith('prod/signals/') && !key.endsWith('signals-seed.json') && got ? { ...got, bytes: Buffer.from(got.bytes.toString('utf8').replace('openalex:T10028', 'openalex:T99999')) } : got),
      // the new manifest is missing
      () => (key, got) => (key.startsWith('prod/manifests/') && !key.endsWith('manifest-seed.json') ? null : got),
      // the reused DOSM snapshot changed after it was read at the start
      () => {
        let reads = 0
        return (key, got) => (key === KEYS.snapshot('dosm', 'dosm-jmi-2026q1') && reads++ > 0 ? { ...got, bytes: json({ ...dosmQ1, observations: [] }) } : got)
      },
    ]) {
      const base2 = createMemoryStore()
      await seed(base2)
      const store2 = instrumented(base2, { alterGet: makeAlter() })
      const { ingestor: ing } = setup({ store: store2, openalex: fakeOpenAlex(() => openalexFetch(revise())) })
      const before = await activeBytes(base2)
      expect(await ing.refresh('openalex')).toMatchObject({ outcome: 'failed', code: 'store_unavailable' })
      expect(await activeBytes(base2)).toEqual(before)
      expect(store2.calls.some(([op, key]) => op === 'put' && key === KEYS.active)).toBe(false)
      expect(ing.status().orphans.length).toBe(3)
    }
  })
})

describe('stored contentHash and the trusted import path', () => {
  it('a published snapshot stores contentHash = SHA-256 of its canonical content', async () => {
    const { store } = setup()
    await seed(store)
    const rev = await setup({ openalex: fakeOpenAlex(() => openalexFetch(revise())), store }).ingestor.refresh('openalex')
    expect(rev.outcome).toBe('published')
    const { manifest } = await readActive(store)
    const snap = JSON.parse((await store.get(KEYS.snapshot('openalex', manifest.snapshots.openalex))).bytes.toString('utf8'))
    expect(snap.contentHash).toBe(contentHash(snap))
    expect(snap.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refresh ignores a second argument: no release bypass', async () => {
    const dosm = fakeDosm()
    const { ingestor } = setup({ dosm })
    const r = await ingestor.refresh('dosm', { release: { quarter: '2026 Q2' } })
    expect(r).toMatchObject({ outcome: 'failed', code: 'not_configured' })
    expect(dosm.calls).toEqual([])
  })

  it('importDosmRelease publishes a given release into an empty store', async () => {
    const dosm = fakeDosm()
    const { ingestor, store } = setup({ dosm })
    const r = await ingestor.importDosmRelease({ quarter: '2026 Q2' })
    expect(r.outcome).toBe('published')
    expect(dosm.calls).toEqual([['fetchSnapshot', '2026 Q2']])
    expect((await readActive(store)).manifest.snapshots.dosm).toBeTruthy()
  })
})
