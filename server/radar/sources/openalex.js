// OpenAlex source adapter (spec 6.1). Yearly counts of works by primary topic, plus the Computer Science field as a
// reference series. The api_key goes only on the outgoing request; stored URLs never contain it.
import { SourceError } from '../sourceError.js'

const BASE = 'https://api.openalex.org'
const FIRST_YEAR = 2015
const TIMEOUT_MS = 15000
const METRIC = 'works_primary_topic'
const UNIT = 'papers'
const REFERENCE = { entityId: 'openalex:field:17', fieldId: '17', label: 'Computer Science (all primary topics)' }

export function createOpenAlexSource({ fetchImpl = fetch, apiKey, now = () => new Date(), requireKey = false } = {}) {
  // UTC year of the injected clock, minus one.
  const lastCompleteYear = () => now().getUTCFullYear() - 1

  async function getJson(url) {
    const outgoing = apiKey ? `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}` : url
    let response
    try {
      response = await fetchImpl(outgoing, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }
    if (response.status === 429) {
      const detail = {}
      const retryAfter = response.headers?.get?.('Retry-After')
      const reset = response.headers?.get?.('X-RateLimit-Reset')
      if (retryAfter) detail.retryAfter = retryAfter
      if (reset) detail.reset = reset
      throw new SourceError('openalex_rate_limited', { retryable: true, detail })
    }
    if (response.status === 401 || response.status === 403) throw new SourceError('openalex_auth_failed')
    if (!response.ok) throw new SourceError('source_unavailable', { retryable: true, detail: { status: response.status } })
    try {
      return await response.json()
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }
  }

  // Counts per year 2015..lastYear, with an explicit 0 for every year group_by leaves out.
  async function yearlySeries(filter, lastYear, sourceUrls, label) {
    const url = `${BASE}/works?filter=${filter},publication_year:${FIRST_YEAR}-${lastYear}&group_by=publication_year`
    sourceUrls.push({ label: `OpenAlex works query: ${label}`, url })
    const body = await getJson(url)
    if (!Array.isArray(body?.group_by)) throw new SourceError('source_unavailable', { retryable: true })
    const counts = new Map(body.group_by.map((g) => [String(g?.key), g?.count]))
    const out = []
    for (let y = FIRST_YEAR; y <= lastYear; y++) {
      if (!counts.has(String(y))) {
        out.push([String(y), 0]) // absent from group_by means no works that year
        continue
      }
      const n = counts.get(String(y))
      if (!Number.isInteger(n) || n < 0) throw new SourceError('source_unavailable', { retryable: true })
      out.push([String(y), n])
    }
    return out
  }

  async function fetchSnapshot(topics) {
    if (requireKey && !apiKey) throw new SourceError('openalex_key_missing')
    const axes = Array.isArray(topics) ? topics : topics?.topics ?? []
    const fetched = now()
    const fetchedAt = fetched.toISOString()
    const lastYear = lastCompleteYear()
    const sourceUrls = []
    const observations = []
    const push = (entityType, entityId, series, label) => {
      for (const [period, value] of series) {
        observations.push({ entityType, entityId, period, metric: METRIC, unit: UNIT, value, ...(label ? { label } : {}) })
      }
    }
    let version = null
    const topicUpdated = {}
    for (const axis of axes) {
      const id = axis.openalexId
      const metaUrl = `${BASE}/topics/${id}`
      sourceUrls.push({ label: `OpenAlex topic: ${id}`, url: metaUrl })
      const meta = await getJson(metaUrl)
      const updated = typeof meta?.updated_date === 'string' ? meta.updated_date : null
      if (updated) topicUpdated[id] = updated
      if (updated && (!version || updated > version)) version = updated
      push('ai_topic', id, await yearlySeries(`primary_topic.id:${id}`, lastYear, sourceUrls, axis.officialTitle ?? id), axis.officialTitle)
    }
    push('reference', REFERENCE.entityId, await yearlySeries(`primary_topic.field.id:${REFERENCE.fieldId}`, lastYear, sourceUrls, REFERENCE.label), REFERENCE.label)
    return {
      sourceId: 'openalex',
      snapshotId: `openalex-${fetchedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
      fetchedAt,
      lastYear,
      classification: { system: 'openalex_topics', version, readAt: fetchedAt, countingRule: 'primary_topic', topicUpdated },
      sourceUrls,
      observations
    }
  }

  return { lastCompleteYear, fetchSnapshot }
}
