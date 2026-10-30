// Future Skills Radar ingestion (spec §6): Fetch → Validate → Compare → Calculate → Save snapshot → Write manifest →
// Read back → Activate. Production data is never half-published: snapshots, signals, manifests and originals are
// immutable ("only if absent"); prod/active.json is the only object that changes, and only with If-Match on the etag
// read at the start of the run (If-None-Match * when there was none). A run that stops part-way leaves only
// unreferenced objects, which are listed as orphans.
//
// createIngestor({store, sources: {openalex, dosm}, references, loadReferences?, config, now, log})
//   refresh(sourceId) → {outcome: 'published'|'no_change'|'rejected'|'held'|'failed', code?, manifestId?,
//                        activeManifestId?, diff?: {observations: {new, revisions, removed}, dependencies?}}
//   recalculate() → same shape as refresh: the active snapshots with the stored break reviews, as a new manifest
//   status() → {lastChecks: {[sourceId]: {checkedAt, outcome, code, manifestId, lastOkAt}}, orphans: [key], log: [entry]}
// Log entries hold only time, source, operation, outcome, code and ids: never keys, values or responses.
import { randomBytes } from 'node:crypto'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { diffSnapshots } from '../../shared/radar/diff.js'
import { runPipeline } from '../../shared/radar/pipeline.js'
import { CONTRACT, validateSignal } from '../../shared/radar/contract.js'
import { dependencyReport } from '../../shared/radar/dependencies.js'
import { SourceError } from './sourceError.js'
import { KEYS, RADAR_SOURCES, contentHash, getJson, isSafeId, makeManifest, readActive, sha256, toBytes } from './manifest.js'

const JSON_TYPE = 'application/json'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOSM_EXPECTED = ['masco2020:total', ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => `masco2020:${c}`)]
const KEEP_LOG = 50
const OK_OUTCOMES = new Set(['published', 'no_change'])

class IngestStop extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// Store errors as refresh codes (spec §13): a lost conditional write is a publish conflict.
function storeCode(e) {
  if (e instanceof IngestStop) return e.code
  if (e?.code === 'precondition_failed') return 'publish_conflict'
  if (e?.code === 'read_only') return 'not_configured'
  if (e?.code === 'not_allowed') return 'not_allowed'
  return 'store_unavailable'
}

// The quarter the active DOSM snapshot ends with.
function lastQuarter(snapshot) {
  if (!snapshot) return null
  if (typeof snapshot.lastQuarter === 'string') return snapshot.lastQuarter
  if (typeof snapshot.meta?.quarter === 'string') return snapshot.meta.quarter
  const periods = (snapshot.observations ?? []).filter((o) => o.entityType === 'total').map((o) => o.period)
  return periods.length ? periods.at(-1) : null
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Break review records under prod/reviews/ (spec §8.4), oldest first so the newest wins in applyBreakReviews.
async function loadBreakReviews(store) {
  const keys = await store.list(KEYS.reviewsPrefix)
  const reviews = []
  for (const key of keys) {
    const got = await getJson(store, key)
    if (got?.value?.kind === 'break') reviews.push(got.value)
  }
  reviews.sort((a, b) => cmp(String(a.reviewedAt ?? ''), String(b.reviewedAt ?? '')) || (Number(a.version) || 0) - (Number(b.version) || 0) || cmp(String(a.reviewId ?? ''), String(b.reviewId ?? '')))
  const version = reviews.length ? `reviews-${sha256(JSON.stringify(reviews.map((r) => r.reviewId ?? null))).slice(0, 16)}` : null
  return { reviews, version }
}

export function createIngestor({ store, sources = {}, references = {}, loadReferences = null, config = RADAR_CONFIG, now = () => new Date(), log = () => {} } = {}) {
  const lastChecks = {}
  const orphans = []
  const recent = []

  async function finish(run, outcome, operation, { code, manifestId, activeManifestId, diff, written = [] } = {}) {
    if (written.length) for (const key of written) if (!orphans.includes(key)) orphans.push(key)
    const ids = Object.fromEntries(Object.entries(run.ids).filter(([, v]) => typeof v === 'string'))
    const entry = { time: run.time, source: run.source, operation, outcome, ...(code ? { code } : {}), ids }
    recent.push(entry)
    if (recent.length > KEEP_LOG) recent.shift()
    try {
      log(entry)
    } catch {
      // a broken logger never changes the outcome
    }
    try {
      await store.put(KEYS.ingestLog(`${run.stamp}-${run.nonce}`), toBytes(entry), { contentType: JSON_TYPE, ifNoneMatch: '*' })
    } catch {
      // the stored log is best effort; the outcome stands
    }
    if (RADAR_SOURCES.includes(run.source)) {
      const previous = lastChecks[run.source]
      lastChecks[run.source] = {
        checkedAt: run.time,
        outcome,
        code: code ?? null,
        manifestId: manifestId ?? activeManifestId ?? previous?.manifestId ?? null,
        lastOkAt: OK_OUTCOMES.has(outcome) ? run.time : previous?.lastOkAt ?? null,
      }
    }
    const result = { outcome }
    if (code) result.code = code
    if (manifestId) result.manifestId = manifestId
    if (activeManifestId) result.activeManifestId = activeManifestId
    if (diff) result.diff = diff
    return result
  }

  // Write once. An object already there with the same bytes is accepted (not ours, so never an orphan of this run);
  // different bytes under the same key are a conflict and nothing is overwritten.
  async function putOnce(key, bytes, contentType, written) {
    try {
      await store.put(key, bytes, { contentType, ifNoneMatch: '*' })
      written.push(key)
    } catch (e) {
      if (e?.code !== 'precondition_failed') throw e
      const existing = await store.get(key)
      if (!existing || sha256(existing.bytes) !== sha256(bytes)) throw new IngestStop('publish_conflict')
    }
  }

  function newRun(source) {
    const time = now().toISOString()
    return { time, stamp: time.replace(/[-:]/g, ''), nonce: randomBytes(4).toString('hex'), source, ids: {} }
  }

  // The reference data for this run: a loader (stored owner decisions merged in) or the fixed object.
  async function referencesNow() {
    return typeof loadReferences === 'function' ? await loadReferences() : references
  }

  // 1. The active state, read once: its etag guards the activation at the end. {stop: result} when the run ends here.
  async function readState(run) {
    let active
    const current = { openalex: null, dosm: null }
    let before = null
    let reviews
    try {
      active = await readActive(store)
      if (active && !active.manifest) return { stop: await finish(run, 'failed', 'read_active', { code: 'manifest_gone' }) }
      if (active) {
        run.ids.previousManifestId = active.manifest.manifestId
        for (const src of RADAR_SOURCES) {
          const id = active.manifest.snapshots?.[src]
          if (!id) continue
          const got = isSafeId(id) ? await getJson(store, KEYS.snapshot(src, id)) : null
          if (!got) return { stop: await finish(run, 'failed', 'read_active', { code: 'manifest_gone' }) }
          current[src] = { id, snapshot: got.value, hash: contentHash(got.value) }
        }
        // A manifest whose signals cannot be read is as broken as one with a missing snapshot.
        const signalsId = active.manifest.signalsId
        const signals = isSafeId(signalsId) ? await getJson(store, KEYS.signals(signalsId)) : null
        if (!signals) return { stop: await finish(run, 'failed', 'read_active', { code: 'manifest_gone' }) }
        before = signals.value
      }
      reviews = await loadBreakReviews(store)
    } catch (e) {
      return { stop: await finish(run, 'failed', 'read_active', { code: storeCode(e) }) }
    }
    return { active, current, before, reviews }
  }

  async function run(sourceId, release) {
    const run = newRun(RADAR_SOURCES.includes(sourceId) ? sourceId : 'unknown')
    if (!RADAR_SOURCES.includes(sourceId) || !sources[sourceId]) return finish(run, 'failed', 'refresh', { code: 'not_configured' })
    let references
    try {
      references = await referencesNow()
    } catch {
      return finish(run, 'failed', 'refresh', { code: 'not_configured' })
    }

    const state = await readState(run)
    if (state.stop) return state.stop
    const { active, current, before, reviews } = state

    // 2. Fetch. Any source failure ends the run with the source's code; nothing has been written.
    let fetched
    let original = null
    if (sourceId === 'dosm') {
      // A given release (first bundle only, from code) skips discovery; everything after it is the normal path.
      const quarter = release ? null : lastQuarter(current.dosm?.snapshot)
      if (!release && !quarter) return finish(run, 'failed', 'discover', { code: 'not_configured' })
      try {
        let target = release
        if (!target) {
          const found = await sources.dosm.discover(quarter)
          if (found?.status !== 'new') return finish(run, 'no_change', 'discover')
          target = found.release
        }
        const got = await sources.dosm.fetchSnapshot(target)
        fetched = got?.snapshot
        original = got?.original ?? null
      } catch (e) {
        return finish(run, 'failed', 'fetch', { code: e instanceof SourceError ? e.code : 'source_unavailable' })
      }
    } else {
      try {
        fetched = await sources.openalex.fetchSnapshot(references.topics ?? [])
      } catch (e) {
        return finish(run, 'failed', 'fetch', { code: e instanceof SourceError ? e.code : 'source_unavailable' })
      }
    }

    // 3. Validate: malformed data is rejected (spec §6.3).
    let snapshot
    try {
      snapshot = structuredClone(fetched)
    } catch {
      snapshot = null
    }
    if (isSafeId(snapshot?.snapshotId)) run.ids.snapshotId = snapshot.snapshotId
    if (!snapshot || snapshot.sourceId !== sourceId || !run.ids.snapshotId) {
      return finish(run, 'rejected', 'validate', { code: 'validation_failed' })
    }
    const expectedEntities = sourceId === 'openalex' ? (references.topics ?? []).map((t) => t.openalexId) : DOSM_EXPECTED
    // Y is the last complete UTC year from the clock, never what the snapshot claims (spec 6.1).
    const lastYear = sourceId === 'openalex' ? sources.openalex.lastCompleteYear?.() ?? now().getUTCFullYear() - 1 : undefined
    if (sourceId === 'openalex' && snapshot.lastYear !== undefined && snapshot.lastYear !== lastYear) {
      return finish(run, 'rejected', 'validate', { code: 'validation_failed' })
    }
    if (!validateSnapshot(snapshot, { expectedEntities, lastYear }).ok) return finish(run, 'rejected', 'validate', { code: 'validation_failed' })
    if (original) {
      const bytes = original.bytes
      const listed = (snapshot.originals ?? []).some((o) => o?.sha256 === original.sha256)
      if (!Buffer.isBuffer(bytes) || sha256(bytes) !== original.sha256 || !listed) {
        return finish(run, 'rejected', 'validate', { code: 'validation_failed' })
      }
    }

    // 4. Compare with the active snapshot of this source (spec §6.4).
    const changes = diffSnapshots(current[sourceId]?.snapshot ?? null, snapshot)
    const observations = { new: changes.newObservations, revisions: changes.revisions, removed: changes.removed }
    if (changes.sameContent) return finish(run, 'no_change', 'compare')
    if (changes.removed.length) return finish(run, 'held', 'compare', { code: 'periods_removed', diff: { observations } })
    // R19: revisions travel with the snapshot so the pipeline lists them and lowers evidence quality.
    snapshot.meta = { ...(snapshot.meta ?? {}), revisions: changes.revisions }

    return calculateAndPublish(run, { active, current, before, reviews, references, sourceId, snapshot, original, observations })
  }

  // Steps 5-8, shared by a refresh (a new snapshot of one source) and a recalculation (no new snapshot: the active
  // snapshots again, with the stored break reviews). Same pipeline, contract check, immutable writes, read-back and
  // conditional activation.
  async function calculateAndPublish(run, { active, current, before, reviews, references, sourceId = null, snapshot = null, original = null, observations }) {
    // 5. Calculate. Every signal must pass the radar-signal/v1 contract before anything is written.
    const manifestId = `manifest-${run.stamp}-${run.nonce}`
    const signalsId = `signals-${run.stamp}-${run.nonce}`
    run.ids.manifestId = manifestId
    run.ids.signalsId = signalsId
    const snapshots = { openalex: current.openalex?.snapshot, dosm: current.dosm?.snapshot }
    if (snapshot) snapshots[sourceId] = snapshot
    let out
    try {
      out = runPipeline({ snapshots, references, reviews: reviews.reviews, config, manifestId })
    } catch {
      return finish(run, 'rejected', 'calculate', { code: 'validation_failed' })
    }
    if (!out.signals.every((s) => validateSignal(s).ok)) return finish(run, 'rejected', 'calculate', { code: 'validation_failed' })

    const manifestSnapshots = { openalex: current.openalex?.id ?? null, dosm: current.dosm?.id ?? null }
    if (snapshot) manifestSnapshots[sourceId] = snapshot.snapshotId
    const time = run.time
    const manifest = makeManifest({
      manifestId,
      createdAt: time,
      snapshots: manifestSnapshots,
      mappingVersion: references.versions?.fieldTopics ?? null,
      configVersion: config.version,
      signalsId,
      breakReviewsVersion: reviews.version,
      previousManifestId: active?.manifest.manifestId ?? null,
    })
    const signalsDoc = { signalsId, manifestId, createdAt: time, contract: CONTRACT, ...out }
    let snapshotKey = null
    let snapshotBytes = null
    if (snapshot) {
      // Spec 4.4: the snapshot carries the SHA-256 of its canonical content (which excludes this field).
      snapshot.contentHash = contentHash(snapshot)
      snapshotKey = KEYS.snapshot(sourceId, snapshot.snapshotId)
      snapshotBytes = toBytes(snapshot)
    }
    const signalsBytes = toBytes(signalsDoc)
    const manifestBytes = toBytes(manifest)

    // 6. Save: original, snapshot, signals, manifest, each only if absent (spec 6.5 steps 1-3).
    const written = []
    let operation = 'save_signals'
    try {
      if (original) {
        operation = 'save_original'
        await putOnce(KEYS.original(sourceId, original.sha256), original.bytes, XLSX_TYPE, written)
      }
      if (snapshot) {
        operation = 'save_snapshot'
        await putOnce(snapshotKey, snapshotBytes, JSON_TYPE, written)
      }
      operation = 'save_signals'
      await putOnce(KEYS.signals(signalsId), signalsBytes, JSON_TYPE, written)
      operation = 'save_manifest'
      await putOnce(KEYS.manifest(manifestId), manifestBytes, JSON_TYPE, written)
    } catch (e) {
      return finish(run, 'failed', operation, { code: storeCode(e), written })
    }

    // 7. Read back every object the manifest references and check its hash (spec 6.5 step 4).
    const checks = []
    if (snapshot) checks.push({ key: snapshotKey, bytesHash: sha256(snapshotBytes), content: contentHash(snapshot), stored: true })
    checks.push({ key: KEYS.signals(signalsId), bytesHash: sha256(signalsBytes) })
    checks.push({ key: KEYS.manifest(manifestId), bytesHash: sha256(manifestBytes) })
    for (const src of RADAR_SOURCES) {
      if (src !== sourceId && current[src]) checks.push({ key: KEYS.snapshot(src, current[src].id), content: current[src].hash })
    }
    if (original) checks.push({ key: KEYS.original(sourceId, original.sha256), bytesHash: original.sha256 })
    try {
      for (const check of checks) {
        const got = await store.get(check.key)
        if (!got) throw new IngestStop('store_unavailable')
        if (check.bytesHash && sha256(got.bytes) !== check.bytesHash) throw new IngestStop('store_unavailable')
        if (check.content) {
          const stored = JSON.parse(Buffer.from(got.bytes).toString('utf8'))
          if (contentHash(stored) !== check.content) throw new IngestStop('store_unavailable')
          if (check.stored && stored.contentHash !== check.content) throw new IngestStop('store_unavailable')
        }
      }
    } catch (e) {
      return finish(run, 'failed', 'read_back', { code: storeCode(e), written })
    }

    // 8. Activate: conditional on the active.json read at the start. Never a blind overwrite.
    const condition = active ? { ifMatch: active.etag } : { ifNoneMatch: '*' }
    try {
      await store.put(KEYS.active, toBytes({ manifestId, activatedAt: time }), { contentType: JSON_TYPE, ...condition })
    } catch (e) {
      let latest = null
      try {
        latest = await readActive(store)
      } catch {
        // reported below as the store failure it is
      }
      const nowId = latest?.manifest?.manifestId ?? latest?.manifestId ?? null
      // The write may have landed even though its answer was lost: then this run did publish.
      if (nowId === manifestId) return publish()
      return finish(run, 'failed', 'activate', { code: storeCode(e), activeManifestId: nowId ?? undefined, written })
    }
    return publish()

    function publish() {
      const dependencies = dependencyReport(before, signalsDoc, references)
      return finish(run, 'published', 'activate', { manifestId, diff: { observations, dependencies } })
    }
  }

  // Public refresh takes the source id only: nothing from a caller can choose what is fetched.
  const refresh = (sourceId) => run(sourceId, undefined)

  // First bundle / seeding: publish a given DOSM release without discovery (an empty store has no active quarter).
  // Trusted server code only - never call with request data. Same validation, pipeline and manifest as refresh.
  const importDosmRelease = (release) => run('dosm', release)

  // Break reviews take effect here: the active snapshots are run through the same pipeline with the stored reviews and
  // published as a new manifest (same writes, read-back and conditional activation as a refresh). Nothing is fetched.
  // Logged under source 'reviews', so it never counts as a check of a data source.
  async function recalculate() {
    const run = newRun('reviews')
    let references
    try {
      references = await referencesNow()
    } catch {
      return finish(run, 'failed', 'recalculate', { code: 'not_configured' })
    }
    const state = await readState(run)
    if (state.stop) return state.stop
    const { active, current, before, reviews } = state
    if (!active) return finish(run, 'failed', 'recalculate', { code: 'not_configured' })
    if ((reviews.version ?? null) === (active.manifest.breakReviewsVersion ?? null)) return finish(run, 'no_change', 'recalculate')
    return calculateAndPublish(run, { active, current, before, reviews, references, observations: { new: [], revisions: [], removed: [] } })
  }

  function status() {
    return {
      lastChecks: structuredClone(lastChecks),
      orphans: [...orphans],
      log: recent.map((e) => structuredClone(e)),
    }
  }

  return { refresh, importDosmRelease, recalculate, status }
}
