// Occupation lookup, "live-first with verified fallback" exactly as the architecture diagram:
//   1 O*NET live (ok → update cache)  2 cached (cache entry, else the O*NET 31.0 snapshot)
//   3 eMASCO reference ("alternative source")  4 unavailable (structured, nothing invented)
// States: live · cached · alternative · no_match (valid zero results) · failed (no fallback).
// An outage is never reported as no_match. eMASCO title matches are listed beside O*NET for Malaysian context.
import { startsWords, wordsOf } from '../skills/onetSkills.js'

const EMASCO_LIMIT = 5
const onetUrl = (code) => `https://www.onetonline.org/link/summary/${code}`

function emascoSearch(roles, query) {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
  const words = wordsOf(q)
  const exact = roles.filter((r) => r.title.toLowerCase() === q)
  const all = roles.filter((r) => !exact.includes(r) && words.length && startsWords(wordsOf(r.title), words))
  return [...exact, ...all].slice(0, EMASCO_LIMIT)
}

export function createOccupationLookup({ live = null, cache, snapshotLoader, emascoLoader, now = () => new Date() }) {
  let snapshotPromise = null
  const loadSnapshot = () => {
    snapshotPromise ??= snapshotLoader()
    snapshotPromise.catch(() => { snapshotPromise = null })
    return snapshotPromise
  }
  const onetCandidate = (item) => ({ source: 'onet', code: item.code, title: item.title, via: item.via, url: onetUrl(item.code) })
  const emascoCandidate = (role) => ({ source: 'emasco', code: role.code, title: role.title, via: 'title', url: role.url })

  async function emasco(query) {
    try {
      const data = await emascoLoader()
      return { data, found: emascoSearch(data.roles, query) }
    } catch {
      return null
    }
  }

  async function search(query) {
    const q = String(query ?? '').trim()
    const alongside = await emasco(q)
    const withEmasco = (candidates) => [...candidates, ...(alongside?.found ?? []).map(emascoCandidate)]
    // Zero results are a real 'no_match' only when nothing failed: during a live outage the answer keeps the source it
    // came from (spec: an outage is never reported as no_match).
    const answer = (state, fields, candidates) => ({ state: candidates.length || fields.warning?.startsWith('live_failed') ? state : 'no_match', ...fields, candidates })

    // 1. live
    let warning = live ? null : 'no_api_key'
    if (live) {
      try {
        const found = await live.search(q)
        const fetchedAt = now().toISOString()
        const record = { source: 'O*NET Web Services', url: 'https://api-v2.onetcenter.org', version: 'API v2', fetchedAt, cacheStatus: 'fresh', validated: true, candidates: found.map(onetCandidate) }
        await cache.put(q, record)
        return answer('live', { source: record.source, version: record.version, fetchedAt, cacheStatus: 'fresh', warning: null }, withEmasco(record.candidates))
      } catch (error) {
        warning = `live_failed:${error.kind ?? 'error'}`
      }
    }

    // 2. cached: a validated live answer for this query, else the dated snapshot
    const cached = await cache.get(q)
    if (cached?.validated) {
      return answer('cached', { source: cached.source, version: cached.version, fetchedAt: cached.fetchedAt, cacheStatus: 'cached', warning }, withEmasco(cached.candidates))
    }
    try {
      const snapshot = await loadSnapshot()
      const found = snapshot.search(q).map(onetCandidate)
      return answer('cached', { source: 'O*NET snapshot', version: snapshot.manifest.version, fetchedAt: snapshot.manifest.downloadedAt, cacheStatus: 'snapshot', warning }, withEmasco(found))
    } catch {
      warning = warning ? `${warning};snapshot_unavailable` : 'snapshot_unavailable'
    }

    // 3. eMASCO reference
    if (alongside) {
      return answer('alternative', { source: 'eMASCO', version: 'MASCO 2020', fetchedAt: alongside.data.fetchedAt ?? null, cacheStatus: null, warning }, alongside.found.map(emascoCandidate))
    }

    // 4. nothing usable
    return { state: 'failed', source: null, version: null, fetchedAt: null, cacheStatus: null, warning, candidates: [] }
  }

  return { search }
}
