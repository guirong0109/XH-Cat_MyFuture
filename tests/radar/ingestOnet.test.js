// O*NET sources through the Radar publish path (skill-trends spec §3, §8; plan Task 4): onet-skills releases and the
// Hot Technologies page go through the same validate → compare → calculate → save → read back → activate steps.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { KEYS, RADAR_SOURCES, getJson, readActive, sha256 } from '../../server/radar/manifest.js'
import { createIngestor } from '../../server/radar/ingest.js'
import { createOnetHotTechSource } from '../../server/radar/sources/onetHotTech.js'
import { flagSet, nextOnetSkillsSnapshot } from '../../shared/radar/onetSkills.js'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'

const NOW = new Date('2026-10-30T08:00:00.000Z')
const fixture = (name) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8')
const HOT_PAGE = fixture('onet-hottech-2025.html')

function loadRows(name) {
  const text = fixture(name)
  const sha = /SHA-256 ([0-9a-f]{64})/.exec(text.split('\n')[0])[1]
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
  const rows = lines.slice(1).map((l) => {
    const [code, example, elementId, elementName, hot, inDemand] = l.split('\t')
    return { code, example, elementId, elementName, hot: hot === 'Y', inDemand: inDemand === 'Y' }
  })
  return { rows, sha }
}

const zipUrl = (r) => `https://www.onetcenter.org/dl_files/database/db_${r.replace('.', '_')}_text.zip`
let references
let SETS
beforeAll(async () => {
  references = await loadRadarReferences('data')
  const r302 = loadRows('onet-flags-30_2.tsv')
  const r303 = loadRows('onet-flags-30_3.tsv')
  const set = (release, month, rows, fileSha256) => flagSet({ release, month, zipUrl: zipUrl(release), zipSha256: `zip-${release}`, fileSha256, rows })
  // 31.1: the 30.3 flags with Go no longer in demand for Software Developers (a third, different flag set).
  const r311 = r303.rows.map((r) => (r.code === '15-1252.00' && r.example === 'Go' ? { ...r, inDemand: false } : r))
  SETS = {
    '30.2': set('30.2', '2026-02', r302.rows, r302.sha),
    '30.3': set('30.3', '2026-05', r303.rows, r303.sha),
    '31.0': set('31.0', '2026-08', r303.rows, r303.sha),
    '31.1': set('31.1', null, r311, 'f'.repeat(64)),
  }
})

// Fake release source: the real snapshot builder over the fixture flag sets; no download.
function fakeOnetSkills() {
  const source = {
    calls: [],
    async fetchRelease(release, active) {
      source.calls.push(release)
      if (!SETS[release]) throw new SourceError('onet_release_not_found')
      return nextOnetSkillsSnapshot(active ?? null, SETS[release], NOW.toISOString())
    },
  }
  return source
}

// The real Hot Technologies adapter over a page held in memory.
function hotTech(page = { html: HOT_PAGE }) {
  return createOnetHotTechSource({
    fetchImpl: async () => {
      const bytes = Buffer.from(page.html, 'utf8')
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    },
    now: () => NOW,
  })
}

// A memory store holding a copy of the committed bundle; records the content type of every put.
async function bundleCopy() {
  const store = createMemoryStore()
  const types = new Map()
  const put = store.put
  store.put = async (key, bytes, opts = {}) => {
    const out = await put(key, bytes, opts)
    types.set(key, opts.contentType)
    return out
  }
  const bundle = createFileStore('data/radar/bundle')
  for (const key of await bundle.list('')) {
    if (/^prod\/(snapshots|originals)\/onet-/.test(key)) continue
    await put(key, (await bundle.get(key)).bytes)
  }
  // Start from the newest bundled manifest without O*NET data (OpenAlex and DOSM only), as before the O*NET sources.
  let id = (await readActive(store)).manifest.manifestId
  for (;;) {
    const manifest = (await getJson(store, KEYS.manifest(id))).value
    if (!manifest.snapshots['onet-skills'] && !manifest.snapshots['onet-hottech']) break
    id = manifest.previousManifestId
  }
  await put(KEYS.active, Buffer.from(JSON.stringify({ manifestId: id, activatedAt: NOW.toISOString() })))
  return { store, types }
}

async function ingestorOn(store, sources) {
  return createIngestor({ store, sources, references, now: () => NOW, log: () => {} })
}

async function activeSignals(store) {
  const active = await readActive(store)
  return { active, signals: (await getJson(store, KEYS.signals(active.manifest.signalsId))).value }
}
const onetIds = (signals) => signals.signals.map((s) => s.signalId).filter((id) => id.startsWith('onet:indemand:') || id.startsWith('onet:hot:'))

describe('manifest sources', () => {
  it('lists the four Radar sources', () => {
    expect(RADAR_SOURCES).toEqual(['openalex', 'dosm', 'onet-skills', 'onet-hottech'])
  })
})

describe('refreshOnetRelease', () => {
  it('publishes onet-skills manifests over the bundle; 30.3 adds Go for Software Developers; OpenAlex and DOSM stay', async () => {
    const { store } = await bundleCopy()
    const before = await readActive(store)
    const ing = await ingestorOn(store, { 'onet-skills': fakeOnetSkills() })
    const first = await ing.refreshOnetRelease('30.2')
    expect(first.outcome).toBe('published')
    let { active, signals } = await activeSignals(store)
    expect(active.manifest.snapshots).toEqual({
      openalex: before.manifest.snapshots.openalex,
      dosm: before.manifest.snapshots.dosm,
      'onet-skills': 'onet-skills-30.2',
      'onet-hottech': null,
    })
    expect(onetIds(signals)).toEqual([])
    expect(signals.onetSkills.current).toBe('30.2')

    const second = await ing.refreshOnetRelease('30.3')
    expect(second.outcome).toBe('published')
    ;({ active, signals } = await activeSignals(store))
    expect(active.manifest.snapshots['onet-skills']).toBe('onet-skills-30.3')
    const ids = signals.signals.map((s) => s.signalId)
    expect(ids).toContain('onet:indemand:15-1252.00:Go')
    expect(ids.some((id) => id.startsWith('openalex:'))).toBe(true)
    expect(ids.some((id) => id.startsWith('dosm:'))).toBe(true)
    expect(active.manifest.previousManifestId).toBe(first.manifestId)
  })

  it('31.0 with the same flags as 30.3 publishes the same signal set with classification version 31.0', async () => {
    const { store } = await bundleCopy()
    const ing = await ingestorOn(store, { 'onet-skills': fakeOnetSkills() })
    await ing.refreshOnetRelease('30.2')
    await ing.refreshOnetRelease('30.3')
    const after303 = onetIds((await activeSignals(store)).signals)
    const out = await ing.refreshOnetRelease('31.0')
    expect(out.outcome).toBe('published')
    const { active, signals } = await activeSignals(store)
    expect(onetIds(signals)).toEqual(after303)
    const snapshot = (await getJson(store, KEYS.snapshot('onet-skills', active.manifest.snapshots['onet-skills']))).value
    expect(snapshot.classification.version).toBe('31.0')
    expect(signals.onetSkills).toMatchObject({ previous: '30.2', current: '30.3' })
  })

  it('a release that is not newer than the active one is rejected and nothing changes', async () => {
    const { store } = await bundleCopy()
    const source = fakeOnetSkills()
    const ing = await ingestorOn(store, { 'onet-skills': source })
    await ing.refreshOnetRelease('30.2')
    await ing.refreshOnetRelease('31.0')
    const before = await store.get(KEYS.active)
    const calls = source.calls.length
    for (const release of ['30.1', '31.0', '30.3', '9.9'.padStart(4, '0')]) {
      const out = await ing.refreshOnetRelease(release)
      expect(out, release).toMatchObject({ outcome: 'rejected', code: 'onet_release_not_newer' })
    }
    expect(source.calls.length).toBe(calls)
    expect((await store.get(KEYS.active)).etag).toBe(before.etag)
    // Numeric, not text: 31.1 is newer than 31.0; 30.10 is not a valid release.
    expect((await ing.refreshOnetRelease('31.1')).outcome).toBe('published')
  })

  it('a release that is not a release number is rejected before anything is fetched; refresh without one is not configured', async () => {
    const { store } = await bundleCopy()
    const source = fakeOnetSkills()
    const ing = await ingestorOn(store, { 'onet-skills': source })
    for (const bad of ['../x', '31', '31.0.1', 'db_31_0', '', undefined, 31]) {
      expect(await ing.refreshOnetRelease(bad), String(bad)).toMatchObject({ outcome: 'rejected', code: 'bad_request' })
    }
    expect(await ing.refresh('onet-skills')).toMatchObject({ outcome: 'failed', code: 'not_configured' })
    expect(source.calls).toEqual([])
  })

  it('a rolled-off flag set does not hold the run (D25); its source errors leave the active manifest', async () => {
    const { store } = await bundleCopy()
    const ing = await ingestorOn(store, { 'onet-skills': fakeOnetSkills() })
    await ing.refreshOnetRelease('30.2')
    await ing.refreshOnetRelease('30.3')
    // 31.1 differs from 30.3: the 30.2 set rolls off, its observations are removed by design.
    const out = await ing.refreshOnetRelease('31.1')
    expect(out.outcome).toBe('published')
    const { signals } = await activeSignals(store)
    expect(signals.onetSkills).toMatchObject({ previous: '30.3', current: '31.1' })
    expect(signals.signals.find((s) => s.signalId === 'onet:indemand:15-1252.00:Go')).toMatchObject({ direction: 'declining' })

    const before = await store.get(KEYS.active)
    expect(await ing.refreshOnetRelease('99.9')).toMatchObject({ outcome: 'failed', code: 'onet_release_not_found' })
    expect((await store.get(KEYS.active)).etag).toBe(before.etag)
  })
})

describe("refresh('onet-hottech')", () => {
  it('publishes the page snapshot with its original stored as text/html; the same page again is no_change', async () => {
    const { store, types } = await bundleCopy()
    const ing = await ingestorOn(store, { 'onet-hottech': hotTech() })
    const first = await ing.refresh('onet-hottech')
    expect(first.outcome).toBe('published')
    const { active, signals } = await activeSignals(store)
    const snapshot = (await getJson(store, KEYS.snapshot('onet-hottech', active.manifest.snapshots['onet-hottech']))).value
    const original = snapshot.originals[0]
    const key = KEYS.original('onet-hottech', original.sha256)
    const stored = await store.get(key)
    expect(sha256(stored.bytes)).toBe(original.sha256)
    expect(stored.bytes.toString('utf8')).toBe(HOT_PAGE)
    expect(types.get(key)).toBe('text/html')
    const python = signals.signals.find((s) => s.signalId === 'onet:postings:Python')
    expect(python).toMatchObject({ direction: null, reasons: ['first_snapshot', 'us_postings'] })

    const second = await ing.refresh('onet-hottech')
    expect(second.outcome).toBe('no_change')
    expect((await readActive(store)).manifest.manifestId).toBe(first.manifestId)
  })

  it('a changed layout fails with hottech_layout and the active manifest stays', async () => {
    const { store } = await bundleCopy()
    const page = { html: HOT_PAGE }
    const ing = await ingestorOn(store, { 'onet-hottech': hotTech(page) })
    await ing.refresh('onet-hottech')
    const before = await store.get(KEYS.active)
    page.html = HOT_PAGE.replace(/Job Postings/g, 'Postings')
    expect(await ing.refresh('onet-hottech')).toMatchObject({ outcome: 'failed', code: 'hottech_layout' })
    expect((await store.get(KEYS.active)).etag).toBe(before.etag)
  })

  it('a later counting window keeps the earlier one, so the year before is not removed', async () => {
    const { store } = await bundleCopy()
    const page = { html: HOT_PAGE }
    const ing = await ingestorOn(store, { 'onet-hottech': hotTech(page) })
    await ing.refresh('onet-hottech')
    page.html = HOT_PAGE.replace(/(\d{1,2}\/)25(\s*[–—-]\s*\d{1,2}\/)25/, '$126$226')
    expect(page.html).not.toBe(HOT_PAGE)
    const out = await ing.refresh('onet-hottech')
    expect(out.outcome).toBe('published')
    const { active, signals } = await activeSignals(store)
    const snapshot = (await getJson(store, KEYS.snapshot('onet-hottech', active.manifest.snapshots['onet-hottech']))).value
    expect([...new Set(snapshot.observations.map((o) => o.period))].sort()).toEqual(['2025', '2026'])
    expect(snapshot.originals).toHaveLength(2)
    const python = signals.signals.find((s) => s.signalId === 'onet:postings:Python')
    expect(python.baseline.period).toBe('2025')
    expect(python.recent.period).toBe('2026')
    expect(python.reasons).not.toContain('first_snapshot')
  })
})

// ---- admin route ------------------------------------------------------------------------------------------------

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
let server
let base
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

async function start() {
  const { store } = await bundleCopy()
  const sources = { 'onet-skills': fakeOnetSkills(), 'onet-hottech': hotTech() }
  const now = () => NOW
  let radar = null
  const ingestor = createIngestor({ store, sources, loadReferences: () => radar.references(), now, log: () => {} })
  radar = createRadarService({ store, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor, now, log: () => {} })
  server = createApp({ radar, radarAccess: createRadarAccess({ env: ENV, now }), d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  return { store, sources }
}

async function call(route, { session, csrf = true, body } = {}) {
  const headers = { origin: base, 'content-type': 'application/json' }
  if (session) {
    headers.cookie = `fr_radar=${session.cookie}`
    if (csrf) headers['x-radar-csrf'] = session.csrf
  }
  const response = await fetch(`${base}${route}`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function login() {
  const response = await fetch(`${base}/api/radar/session`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'admin', key: ENV.RADAR_ADMIN_KEY }),
  })
  const body = await response.json()
  return { cookie: response.headers.get('set-cookie').split(';')[0].slice('fr_radar='.length), csrf: body.csrf }
}

describe('POST /api/admin/radar/refresh/onet-skills and onet-hottech', () => {
  it('needs the admin session and the CSRF token', async () => {
    const { sources } = await start()
    expect((await call('/api/admin/radar/refresh/onet-skills', { body: { release: '30.2' } })).status).toBe(401)
    expect((await call('/api/admin/radar/refresh/onet-hottech')).status).toBe(401)
    const session = await login()
    const noCsrf = await call('/api/admin/radar/refresh/onet-skills', { session, csrf: false, body: { release: '30.2' } })
    expect(noCsrf.status).toBe(403)
    expect(noCsrf.body.error.code).toBe('csrf_failed')
    expect((await call('/api/admin/radar/refresh/onet-hottech', { session, csrf: false })).body.error.code).toBe('csrf_failed')
    expect(sources['onet-skills'].calls).toEqual([])
  })

  it('validates {release} on the server, ignores other fields, and answers not-newer with 409', async () => {
    const { sources } = await start()
    const session = await login()
    for (const body of [{ release: '../x' }, { release: '31' }, {}, { release: 31.0 }, ['30.2'], undefined]) {
      const r = await call('/api/admin/radar/refresh/onet-skills', { session, body })
      expect(r.status, JSON.stringify(body)).toBe(400)
      expect(r.body.error.code).toBe('bad_request')
    }
    expect(sources['onet-skills'].calls).toEqual([])
    const ok = await call('/api/admin/radar/refresh/onet-skills', { session, body: { release: '30.2', url: 'https://example.com/x.zip', sourceId: 'dosm' } })
    expect(ok.status).toBe(200)
    expect(ok.body.result.outcome).toBe('published')
    expect(sources['onet-skills'].calls).toEqual(['30.2'])
  })

  it('answers not-newer with 409 onet_release_not_newer; Hot Technologies refreshes on its own route', async () => {
    const { store } = await start()
    const session = await login()
    const ing = createIngestor({ store, sources: { 'onet-skills': fakeOnetSkills() }, references, now: () => NOW, log: () => {} })
    await ing.refreshOnetRelease('31.0')
    const r = await call('/api/admin/radar/refresh/onet-skills', { session, body: { release: '30.3' } })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('onet_release_not_newer')
    const hot = await call('/api/admin/radar/refresh/onet-hottech', { session })
    expect(hot.status).toBe(200)
    expect(hot.body.result.outcome).toBe('published')
  })
})
