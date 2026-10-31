// Future Skills Radar answer states (spec §12). Pure, no I/O: used by the server for every answer and by the screens.
//
// sourceStates({manifest, snapshots, servedFrom, lastChecks, now, config, storeCode}) →
//   {[sourceId]: {availability, freshness, refreshHealth, refreshCode, servedFrom, lastSuccessAt, lastCheckedAt,
//                 observationPeriod, publishedAt, expectedNextRelease}}
//
// - availability: 'data' | 'no_records' (snapshot without any value) | 'unavailable' (no snapshot in the manifest)
// - freshness: 'current' | 'stale' | null. OpenAlex: stale when the last successful check (a refresh that published or found
//   no new data, or the fetch of the served snapshot) is older than config.freshness.openalexDays. DOSM: stale when
//   config.freshness.dosmDaysAfterExpected days have passed since the expected next release, taken as the served
//   release's publishedAt + 92 days (quarterly). O*NET skill flags and Hot Technologies: null (no release calendar and
//   no age limit in the spec; the screens show the release or window and its fetched date instead).
// - refreshHealth: 'ok' | 'failed' (+ refreshCode) | 'never_run' | 'not_configured' (no writable store)
// - servedFrom: 'active_manifest' | 'bundled_read_only' | 'cached_fallback' (last good data after a failed refresh or
//   while the store does not answer)
// Per-signal comparability stays in each signal (evidenceSufficiency, evidenceQuality).
import { RADAR_CONFIG } from './config.js'

export const STATE_SOURCES = Object.freeze(['openalex', 'dosm', 'onet-skills', 'onet-hottech'])
export const DOSM_RELEASE_INTERVAL_DAYS = 92
const DAY = 86400000
const OK = new Set(['published', 'no_change'])

const time = (value) => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}
const latest = (...values) => {
  const times = values.map(time).filter((t) => t !== null)
  return times.length ? new Date(Math.max(...times)).toISOString() : null
}

function availabilityOf(snapshotId, snapshot) {
  if (!snapshotId || !snapshot) return 'unavailable'
  const hasValue = (snapshot.observations ?? []).some((o) => typeof o?.value === 'number' && Number.isFinite(o.value))
  return hasValue ? 'data' : 'no_records'
}

export function observationPeriodOf(sourceId, snapshot) {
  if (!snapshot) return null
  if (sourceId === 'openalex') return snapshot.lastYear != null ? String(snapshot.lastYear) : null
  if (sourceId === 'onet-skills') return snapshot.classification?.version ?? null
  if (sourceId === 'onet-hottech') return snapshot.meta?.window?.label ?? null
  return snapshot.lastQuarter ?? snapshot.meta?.quarter ?? null
}

export function sourceStates({ manifest, snapshots = {}, servedFrom, lastChecks = {}, now = new Date(), config = RADAR_CONFIG, storeCode = null } = {}) {
  const nowMs = time(now) ?? Date.now()
  const out = {}
  for (const sourceId of STATE_SOURCES) {
    const snapshotId = manifest?.snapshots?.[sourceId] ?? null
    const snapshot = snapshotId ? snapshots?.[sourceId] ?? null : null
    const check = lastChecks?.[sourceId] ?? null
    const availability = availabilityOf(snapshotId, snapshot)

    // Refresh health: no writable store → not configured; a store that does not answer → failed with its code.
    let refreshHealth
    let refreshCode = null
    if (storeCode) {
      refreshHealth = 'failed'
      refreshCode = storeCode
    } else if (servedFrom === 'bundled_read_only') {
      refreshHealth = 'not_configured'
    } else if (!check) {
      refreshHealth = 'never_run'
    } else if (OK.has(check.outcome)) {
      refreshHealth = 'ok'
    } else {
      refreshHealth = 'failed'
      refreshCode = check.code ?? null
    }

    // Served from: the last good data is a cached fallback when this source's last refresh failed.
    let served = servedFrom
    if (servedFrom === 'active_manifest' && refreshHealth === 'failed') served = 'cached_fallback'

    const lastSuccessAt = latest(check?.lastOkAt, snapshot?.fetchedAt)
    const publishedAt = sourceId === 'dosm' ? snapshot?.meta?.publishedAt ?? snapshot?.publishedAt ?? null : null
    let freshness = 'stale'
    let expectedNextRelease = null
    if (sourceId === 'onet-skills' || sourceId === 'onet-hottech') {
      // O*NET publishes no release calendar and the spec sets no age limit: freshness is not judged (null).
      freshness = null
    } else if (sourceId === 'openalex') {
      const okMs = time(lastSuccessAt)
      if (okMs !== null && nowMs - okMs <= config.freshness.openalexDays * DAY) freshness = 'current'
    } else {
      const publishedMs = time(publishedAt)
      if (publishedMs !== null) {
        const expectedMs = publishedMs + DOSM_RELEASE_INTERVAL_DAYS * DAY
        expectedNextRelease = new Date(expectedMs).toISOString().slice(0, 10)
        if (nowMs - expectedMs <= config.freshness.dosmDaysAfterExpected * DAY) freshness = 'current'
      }
    }

    out[sourceId] = {
      availability,
      freshness,
      refreshHealth,
      refreshCode,
      servedFrom: served,
      lastSuccessAt,
      lastCheckedAt: check?.checkedAt ?? null,
      observationPeriod: observationPeriodOf(sourceId, snapshot),
      publishedAt,
      expectedNextRelease,
    }
  }
  return out
}
