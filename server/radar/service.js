// Future Skills Radar service (spec §6.5, §7, §12): which manifest answers a request, from which store, in which state.
//
// createRadarService({store, bundleStore, references, ingestor, now, config, devStore, log}) →
//   {answer(manifestId?) → {manifestId, activeManifestId, devStore, states, view}, references(), info(), store, ingestor}
//   view = {manifest, snapshots: {openalex, dosm}, signals}  (signals = the stored signals document)
//
// - No writable store: the bundled manifest (data/radar/bundle) is served read-only ('bundled_read_only').
// - Writable store (R2, or memory via RADAR_STORE=memory locally) without prod/active.json: on first use every object
//   the bundled active manifest needs (its manifest chain, snapshots, originals, signals) is copied only-if-absent,
//   read back and checked (bytes; contentHash for snapshots), then prod/active.json is written with If-None-Match *.
//   A concurrent seed just loses that race harmlessly.
// - A store that stops answering: the last good manifest read in this process is served ('cached_fallback'), else
//   the bundle; either way refreshHealth says 'failed' / 'store_unavailable'.
// - ?manifest=<id>: an id that is not stored (or not a safe id) → RadarError manifest_gone (409); an older stored one
//   is served as asked, with activeManifestId telling the screen a newer one exists.
// Nothing personal ever reaches this service; logs carry codes and ids only.
import path from 'node:path'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { sourceStates } from '../../shared/radar/states.js'
import { createR2FromEnv } from '../store/r2.js'
import { KEYS, RADAR_SOURCES, contentHash, getJson, isSafeId, loadManifest, readActive, sha256, toBytes } from './manifest.js'
import { createFileStore } from './store/file.js'
import { createMemoryStore } from './store/memory.js'
import { createR2RadarStore } from './store/r2.js'
import { createIngestor } from './ingest.js'
import { createOpenAlexSource } from './sources/openalex.js'
import { createDosmSource } from './sources/dosm.js'
import { loadRadarReferences } from './references.js'

const JSON_TYPE = 'application/json'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const KEEP_VIEWS = 8

export class RadarError extends Error {
  constructor(code) {
    super(code)
    this.name = 'RadarError'
    this.code = code
  }
}

const defaultLog = (message) => console.error(message)
const codeOf = (error) => (error instanceof RadarError ? error.code : error?.code === 'precondition_failed' ? 'publish_conflict' : 'store_unavailable')

export function createRadarService({
  store = null,
  bundleStore,
  references = null,
  ingestor = null,
  now = () => new Date(),
  config = RADAR_CONFIG,
  devStore = false,
  log = defaultLog,
} = {}) {
  const views = new Map()
  let lastGood = null
  let seeded = false
  let seeding = null

  // References: an object, or a loader called once (a failed load is retried next time).
  let referencesPromise = null
  const loadReferences = () => {
    if (typeof references !== 'function') return Promise.resolve(references)
    referencesPromise ??= Promise.resolve()
      .then(() => references())
      .catch((error) => {
        referencesPromise = null
        throw error
      })
    return referencesPromise
  }

  function remember(view) {
    const id = view.manifest.manifestId
    views.delete(id)
    views.set(id, view)
    while (views.size > KEEP_VIEWS) views.delete(views.keys().next().value)
    return view
  }

  // One manifest with everything it references, or null when any part is missing or unreadable.
  // Manifests and the objects they reference are immutable, so a complete view is kept by id.
  async function loadView(from, id, { verify = false } = {}) {
    if (!isSafeId(id)) return null
    const cached = views.get(id)
    if (cached) {
      // "Still stored": a requested older manifest is checked against the store, not only the memory copy.
      if (verify && from !== bundleStore && !(await from.get(KEYS.manifest(id)))) {
        views.delete(id)
        return null
      }
      return cached
    }
    try {
      const manifest = await loadManifest(from, id)
      if (!manifest || manifest.manifestId !== id) return null
      const snapshots = { openalex: null, dosm: null }
      for (const sourceId of RADAR_SOURCES) {
        const snapshotId = manifest.snapshots?.[sourceId]
        if (!snapshotId) continue
        if (!isSafeId(snapshotId)) return null
        const got = await getJson(from, KEYS.snapshot(sourceId, snapshotId))
        if (!got) return null
        snapshots[sourceId] = got.value
      }
      const signals = isSafeId(manifest.signalsId) ? await getJson(from, KEYS.signals(manifest.signalsId)) : null
      if (!signals || !Array.isArray(signals.value?.signals)) return null
      return remember({ manifest, snapshots, signals: signals.value })
    } catch (error) {
      if (error instanceof SyntaxError) return null
      throw error
    }
  }

  async function bundleActiveView() {
    let active = null
    try {
      active = bundleStore ? await readActive(bundleStore) : null
    } catch {
      active = null
    }
    const view = active?.manifest ? await loadView(bundleStore, active.manifest.manifestId) : null
    if (!view) throw new RadarError('not_configured')
    return view
  }

  // Write once; an object already there with the same bytes is fine (a concurrent seed), different bytes are not.
  async function putOnce(key, bytes, contentType) {
    try {
      await store.put(key, bytes, { contentType, ifNoneMatch: '*' })
    } catch (error) {
      if (error?.code !== 'precondition_failed') throw error
      const existing = await store.get(key)
      if (!existing || sha256(existing.bytes) !== sha256(bytes)) throw new RadarError('publish_conflict')
    }
  }

  // Seed prod/ from the bundled active manifest (controller ruling R22).
  async function seed() {
    if (await store.get(KEYS.active)) return
    const bundled = await readActive(bundleStore)
    if (!bundled?.manifest) throw new RadarError('not_configured')
    const activeId = bundled.manifest.manifestId
    const objects = new Map()
    const add = (key, bytes, content = null, contentType = JSON_TYPE) => objects.set(key, { key, bytes, content, contentType })
    const seen = new Set()
    for (let id = activeId; id && isSafeId(id) && !seen.has(id); ) {
      seen.add(id)
      const manifest = await getJson(bundleStore, KEYS.manifest(id))
      if (!manifest) {
        if (id === activeId) throw new RadarError('not_configured')
        break // an older manifest the bundle does not carry: the chain simply ends here
      }
      add(KEYS.manifest(id), manifest.bytes)
      for (const sourceId of RADAR_SOURCES) {
        const snapshotId = manifest.value.snapshots?.[sourceId]
        if (!snapshotId) continue
        const snapshot = await getJson(bundleStore, KEYS.snapshot(sourceId, snapshotId))
        if (!snapshot || contentHash(snapshot.value) !== snapshot.value.contentHash) throw new RadarError('not_configured')
        add(KEYS.snapshot(sourceId, snapshotId), snapshot.bytes, snapshot.value.contentHash)
        for (const original of snapshot.value.originals ?? []) {
          const got = await bundleStore.get(KEYS.original(sourceId, original.sha256))
          if (!got || sha256(got.bytes) !== original.sha256) throw new RadarError('not_configured')
          add(KEYS.original(sourceId, original.sha256), Buffer.from(got.bytes), null, XLSX_TYPE)
        }
      }
      const signals = await getJson(bundleStore, KEYS.signals(manifest.value.signalsId))
      if (!signals) throw new RadarError('not_configured')
      add(KEYS.signals(manifest.value.signalsId), signals.bytes)
      id = manifest.value.previousManifestId
    }
    for (const object of objects.values()) await putOnce(object.key, object.bytes, object.contentType)
    // Read every copy back before anything points at it.
    for (const object of objects.values()) {
      const got = await store.get(object.key)
      if (!got || sha256(got.bytes) !== sha256(object.bytes)) throw new RadarError('store_unavailable')
      if (object.content) {
        const stored = JSON.parse(Buffer.from(got.bytes).toString('utf8'))
        if (contentHash(stored) !== object.content || stored.contentHash !== object.content) throw new RadarError('store_unavailable')
      }
    }
    try {
      await store.put(KEYS.active, toBytes({ manifestId: activeId, activatedAt: now().toISOString() }), { contentType: JSON_TYPE, ifNoneMatch: '*' })
      log(`[radar] seeded prod from the bundle: ${activeId}`)
    } catch (error) {
      if (error?.code !== 'precondition_failed') throw error
      // Another server activated first: harmless, its active.json stands.
    }
  }

  async function ensureSeeded() {
    if (seeded) return
    seeding ??= seed()
      .then(() => {
        seeded = true
      })
      .finally(() => {
        seeding = null
      })
    await seeding
  }

  // The manifest that answers when no id is asked for, and how it is served.
  async function current() {
    if (!store) {
      const view = await bundleActiveView()
      return { view, activeId: view.manifest.manifestId, servedFrom: 'bundled_read_only', storeCode: null }
    }
    try {
      await ensureSeeded()
      const pointer = await getJson(store, KEYS.active)
      const id = pointer?.value?.manifestId
      const view = id ? await loadView(store, id) : null
      if (!view) throw new RadarError('store_unavailable')
      lastGood = view
      return { view, activeId: id, servedFrom: 'active_manifest', storeCode: null }
    } catch (error) {
      const code = codeOf(error)
      log(`[radar] store read failed: ${code}`)
      const storeCode = code === 'not_configured' ? 'not_configured' : 'store_unavailable'
      if (lastGood) return { view: lastGood, activeId: lastGood.manifest.manifestId, servedFrom: 'cached_fallback', storeCode }
      const view = await bundleActiveView().catch(() => null)
      if (view) return { view, activeId: view.manifest.manifestId, servedFrom: 'bundled_read_only', storeCode }
      throw new RadarError(storeCode)
    }
  }

  async function answer(requestedId) {
    const now_ = now()
    const cur = await current()
    let view = cur.view
    if (requestedId !== undefined && requestedId !== view.manifest.manifestId) {
      if (!isSafeId(requestedId)) throw new RadarError('manifest_gone')
      if (cur.servedFrom === 'bundled_read_only') {
        view = await loadView(bundleStore, requestedId)
      } else if (cur.servedFrom === 'cached_fallback') {
        view = views.get(requestedId)
        if (!view) throw new RadarError('store_unavailable')
      } else {
        try {
          view = await loadView(store, requestedId, { verify: true })
        } catch (error) {
          log(`[radar] store read failed: ${codeOf(error)}`)
          throw new RadarError('store_unavailable')
        }
      }
      if (!view) throw new RadarError('manifest_gone')
    }
    let lastChecks = {}
    try {
      lastChecks = ingestor?.status?.()?.lastChecks ?? {}
    } catch {
      lastChecks = {}
    }
    const states = sourceStates({ manifest: view.manifest, snapshots: view.snapshots, servedFrom: cur.servedFrom, lastChecks, now: now_, config, storeCode: cur.storeCode })
    return { manifestId: view.manifest.manifestId, activeManifestId: cur.activeId, devStore, states, view }
  }

  return {
    answer,
    references: loadReferences,
    info: () => ({ writable: Boolean(store), devStore }),
    store,
    ingestor,
  }
}

// Which store the Radar writes to. RADAR_STORE=memory (local development only) wins over R2 and is refused when
// NODE_ENV=production; R2 settings give the R2 store; nothing set → no writable store (bundled data, read-only).
export function radarStoreFromEnv(env = process.env, { logError = defaultLog } = {}) {
  const mode = String(env.RADAR_STORE ?? '').trim().toLowerCase()
  if (mode === 'memory') {
    if (env.NODE_ENV === 'production') {
      logError('[radar] RADAR_STORE=memory is refused when NODE_ENV=production: serving the bundled Radar data read-only.')
      return { store: null, devStore: false, refused: 'memory_store_in_production' }
    }
    return { store: createMemoryStore(), devStore: true, refused: null }
  }
  const r2 = createR2FromEnv(env)
  return { store: r2 ? createR2RadarStore(r2) : null, devStore: false, refused: null }
}

// The ingestor is built on first use, once the reference data has loaded; until then it has no checks to report.
function lazyIngestor({ store, sources, loadReferences, now, log }) {
  let inner = null
  const get = async () => {
    inner ??= createIngestor({ store, sources, references: await loadReferences(), now, log })
    return inner
  }
  return {
    refresh: async (sourceId) => (await get()).refresh(sourceId),
    importDosmRelease: async (release) => (await get()).importDosmRelease(release),
    status: () => (inner ? inner.status() : { lastChecks: {}, orphans: [], log: [] }),
  }
}

export function createRadarServiceFromEnv({ dataDir, fetchImpl = fetch, now = () => new Date(), env = process.env, logError = defaultLog } = {}) {
  const { store, devStore } = radarStoreFromEnv(env, { logError })
  let referencesPromise = null
  const loadReferences = () => {
    referencesPromise ??= loadRadarReferences(dataDir).catch((error) => {
      referencesPromise = null
      throw error
    })
    return referencesPromise
  }
  const ingestor = store
    ? lazyIngestor({
        store,
        sources: {
          openalex: createOpenAlexSource({ fetchImpl, apiKey: env.OPENALEX_API_KEY || undefined, now, requireKey: env.NODE_ENV === 'production' }),
          dosm: createDosmSource({ fetchImpl, now }),
        },
        loadReferences,
        now,
        // Ingestion log entries hold time, source, operation, outcome, code and ids only.
        log: (entry) => console.info(`[radar] ${entry.source} ${entry.operation} ${entry.outcome}${entry.code ? ` ${entry.code}` : ''}`),
      })
    : null
  return createRadarService({
    store,
    bundleStore: createFileStore(path.join(dataDir, 'radar', 'bundle')),
    references: loadReferences,
    ingestor,
    now,
    devStore,
    log: logError,
  })
}
