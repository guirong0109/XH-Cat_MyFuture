// Future Skills Radar: production keys, content hashes and manifests (spec §6.5, §7). Keys are built only here, from
// fixed prefixes and ids checked against a safe pattern; no request value is ever used as a key.
//
// Manifest = {manifestId, createdAt, snapshots: {openalex, dosm}, mappingVersion, configVersion, signalsId,
//             breakReviewsVersion, previousManifestId}  (immutable, prod/manifests/<id>.json)
// prod/active.json = {manifestId, activatedAt}: the only mutable object, always written conditionally.
import { createHash } from 'node:crypto'
import { canonicalContent } from '../../shared/radar/snapshot.js'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
export const isSafeId = (id) => typeof id === 'string' && SAFE_ID.test(id) && !id.includes('..')
export const RADAR_SOURCES = Object.freeze(['openalex', 'dosm'])

function safe(id) {
  if (!isSafeId(id)) throw new TypeError('unsafe radar id')
  return id
}
function safeSource(sourceId) {
  if (!RADAR_SOURCES.includes(sourceId)) throw new TypeError('unknown radar source')
  return sourceId
}

export const KEYS = Object.freeze({
  active: 'prod/active.json',
  snapshot: (sourceId, id) => `prod/snapshots/${safeSource(sourceId)}/${safe(id)}.json`,
  original: (sourceId, sha256) => {
    if (!/^[0-9a-f]{64}$/.test(sha256 ?? '')) throw new TypeError('bad sha256')
    return `prod/originals/${safeSource(sourceId)}/${sha256}`
  },
  signals: (id) => `prod/signals/${safe(id)}.json`,
  manifest: (id) => `prod/manifests/${safe(id)}.json`,
  ingestLog: (id) => `prod/ingest-log/${safe(id)}.json`,
  ingestLogPrefix: 'prod/ingest-log/',
  reviewsPrefix: 'prod/reviews/',
  review: (id) => `prod/reviews/${safe(id)}.json`,
})

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// SHA-256 of the canonical (normalised, value-only) content: ids, fetch times and labels do not change it.
export const contentHash = (snapshot) => sha256(canonicalContent(snapshot))

export const toBytes = (value) => Buffer.from(JSON.stringify(value))

export async function getJson(store, key) {
  const got = await store.get(key)
  if (!got) return null
  return { value: JSON.parse(Buffer.from(got.bytes).toString('utf8')), etag: got.etag, bytes: Buffer.from(got.bytes) }
}

export async function loadManifest(store, id) {
  if (!isSafeId(id)) return null
  const got = await getJson(store, KEYS.manifest(id))
  return got ? got.value : null
}

// The active manifest and the etag of prod/active.json (needed for the conditional activation).
// A pointer to a manifest that cannot be read gives {manifest: null, etag, manifestId}.
export async function readActive(store) {
  const got = await getJson(store, KEYS.active)
  if (!got) return null
  const manifestId = got.value?.manifestId
  const manifest = await loadManifest(store, manifestId)
  return manifest ? { manifest, etag: got.etag } : { manifest: null, etag: got.etag, manifestId: manifestId ?? null }
}

export function makeManifest({ manifestId, createdAt, snapshots, mappingVersion, configVersion, signalsId, breakReviewsVersion, previousManifestId }) {
  return {
    manifestId,
    createdAt,
    snapshots: { openalex: snapshots.openalex ?? null, dosm: snapshots.dosm ?? null },
    mappingVersion: mappingVersion ?? null,
    configVersion,
    signalsId,
    breakReviewsVersion: breakReviewsVersion ?? null,
    previousManifestId: previousManifestId ?? null,
  }
}
