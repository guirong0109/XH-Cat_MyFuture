import { describe, it, expect } from 'vitest'
import { createOpenAlexSource } from '../../server/radar/sources/openalex.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { validateSnapshot } from '../../shared/radar/validate.js'

const NOW = () => new Date('2026-10-30T10:00:00Z') // last complete year 2025
const AXES = [
  { axisId: 'language', openalexId: 'T10028' },
  { axisId: 'genmedia', openalexId: 'T10775' }
]

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// Counts for every year 2015..2025 except those in `omit`.
function groupBy(omit = []) {
  const years = []
  for (let y = 2015; y <= 2025; y++) if (!omit.includes(y)) years.push({ key: String(y), key_display_name: String(y), count: 100 + y - 2015 })
  return { group_by: years }
}

function fakeFetch({ omit = [], onRequest } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push(String(url))
    onRequest?.(String(url), init)
    if (String(url).includes('/topics/')) return json({ id: 'https://openalex.org/T10028', updated_date: '2026-09-15T01:02:03.000000' })
    return json(groupBy(omit))
  }
  impl.calls = calls
  return impl
}

describe('OpenAlex source', () => {
  it('missing key with requireKey gives openalex_key_missing and makes no request', async () => {
    const fetchImpl = fakeFetch()
    const src = createOpenAlexSource({ fetchImpl, now: NOW, requireKey: true })
    const err = await src.fetchSnapshot(AXES).catch((e) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect(err.code).toBe('openalex_key_missing')
    expect(fetchImpl.calls).toHaveLength(0)
  })

  it('429 gives openalex_rate_limited (retryable, keeps the reset hint)', async () => {
    const fetchImpl = async () => json({}, 429, { 'Retry-After': '120', 'X-RateLimit-Reset': '2026-10-31T00:00:00Z' })
    const err = await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(AXES).catch((e) => e)
    expect(err.code).toBe('openalex_rate_limited')
    expect(err.retryable).toBe(true)
    expect(err.detail.retryAfter).toBe('120')
    expect(err.detail.reset).toBe('2026-10-31T00:00:00Z')
  })

  it('401 and 403 give openalex_auth_failed', async () => {
    for (const status of [401, 403]) {
      const err = await createOpenAlexSource({ fetchImpl: async () => json({}, status), now: NOW }).fetchSnapshot(AXES).catch((e) => e)
      expect(err.code).toBe('openalex_auth_failed')
      expect(err.retryable).toBe(false)
    }
  })

  it('timeout, network error, 5xx and malformed JSON give source_unavailable', async () => {
    const cases = [
      async () => { throw new DOMException('timed out', 'TimeoutError') },
      async () => { throw new TypeError('fetch failed') },
      async () => json({}, 503),
      async () => new Response('<html>', { status: 200 })
    ]
    for (const fetchImpl of cases) {
      const err = await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(AXES).catch((e) => e)
      expect(err).toBeInstanceOf(SourceError)
      expect(err.code).toBe('source_unavailable')
      expect(err.retryable).toBe(true)
    }
  })

  it('every request carries an abort signal (15 s timeout)', async () => {
    const signals = []
    const fetchImpl = fakeFetch({ onRequest: (_u, init) => signals.push(init?.signal) })
    await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(AXES)
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true)
  })

  it('years missing from group_by become 0 and the snapshot validates (Review Focus 1)', async () => {
    const snap = await createOpenAlexSource({ fetchImpl: fakeFetch({ omit: [2019] }), now: NOW }).fetchSnapshot(AXES)
    const o = snap.observations.find((x) => x.entityId === 'T10028' && x.period === '2019')
    expect(o).toMatchObject({ entityType: 'ai_topic', metric: 'works_primary_topic', unit: 'papers', value: 0 })
    const periods = snap.observations.filter((x) => x.entityId === 'T10028').map((x) => x.period)
    expect(periods[0]).toBe('2015')
    expect(periods.at(-1)).toBe('2025')
    expect(periods).toHaveLength(11)
    expect(validateSnapshot(snap, { expectedEntities: ['T10028', 'T10775', 'openalex:field:17'], lastYear: 2025 }).ok).toBe(true)
  })

  it('includes the CS reference series', async () => {
    const snap = await createOpenAlexSource({ fetchImpl: fakeFetch(), now: NOW }).fetchSnapshot(AXES)
    const ref = snap.observations.filter((x) => x.entityId === 'openalex:field:17')
    expect(ref).toHaveLength(11)
    expect(ref[0].entityType).toBe('reference')
  })

  it('last complete year uses UTC (Review Focus 2)', () => {
    expect(createOpenAlexSource({ now: () => new Date('2026-12-31T16:30:00Z') }).lastCompleteYear()).toBe(2025)
    expect(createOpenAlexSource({ now: () => new Date('2027-01-01T00:30:00+08:00') }).lastCompleteYear()).toBe(2025)
    expect(createOpenAlexSource({ now: () => new Date('2027-01-01T00:00:00Z') }).lastCompleteYear()).toBe(2026)
  })

  it('uses the spec queries and never stores the key', async () => {
    const fetchImpl = fakeFetch()
    const snap = await createOpenAlexSource({ fetchImpl, apiKey: 'SECRET123', now: NOW }).fetchSnapshot(AXES)
    expect(fetchImpl.calls.every((u) => u.includes('api_key=SECRET123'))).toBe(true)
    expect(fetchImpl.calls).toContain(
      'https://api.openalex.org/works?filter=primary_topic.id:T10028,publication_year:2015-2025&group_by=publication_year&api_key=SECRET123'
    )
    expect(fetchImpl.calls.some((u) => u.includes('primary_topic.field.id:17,publication_year:2015-2025'))).toBe(true)
    expect(fetchImpl.calls.some((u) => u.startsWith('https://api.openalex.org/topics/T10775'))).toBe(true)
    expect(JSON.stringify(snap)).not.toContain('SECRET123')
    expect(snap.sourceUrls.length).toBe(fetchImpl.calls.length)
    expect(snap.sourceUrls.every((u) => !u.url.includes('api_key') && /^OpenAlex (works query|topic): /.test(u.label))).toBe(true)
  })

  it('records topic updated_date, counting rule and snapshot id', async () => {
    const snap = await createOpenAlexSource({ fetchImpl: fakeFetch(), now: NOW }).fetchSnapshot(AXES)
    expect(snap.sourceId).toBe('openalex')
    expect(snap.fetchedAt).toBe('2026-10-30T10:00:00.000Z')
    expect(snap.snapshotId).toBe('openalex-20261030T100000Z')
    expect(snap.classification).toEqual({
      system: 'openalex_topics',
      version: '2026-09-15T01:02:03.000000',
      readAt: '2026-10-30T10:00:00.000Z',
      countingRule: 'primary_topic',
      topicUpdated: { T10028: '2026-09-15T01:02:03.000000', T10775: '2026-09-15T01:02:03.000000' }
    })
  })

  it('stores each topic updated_date and the max as version', async () => {
    const dates = { T10028: '2026-09-15T00:00:00.000000', T10775: '2026-10-01T00:00:00.000000' }
    const fetchImpl = async (url) => {
      const m = /\/topics\/(T\d+)/.exec(String(url))
      return m ? json({ updated_date: dates[m[1]] }) : json(groupBy())
    }
    const snap = await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(AXES)
    expect(snap.classification.topicUpdated).toEqual(dates)
    expect(snap.classification.version).toBe('2026-10-01T00:00:00.000000')
  })

  it('a present but malformed count is an error; an absent year is 0', async () => {
    for (const count of [null, -1, 1.5, 'abc', undefined]) {
      const fetchImpl = async (url) => {
        if (String(url).includes('/topics/')) return json({ updated_date: 'x' })
        const body = groupBy()
        body.group_by[3].count = count
        return json(body)
      }
      const err = await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(AXES).catch((e) => e)
      expect(err).toBeInstanceOf(SourceError)
      expect(err.code).toBe('source_unavailable')
    }
  })

  it('a failure on the last request returns no snapshot', async () => {
    let n = 0
    const fetchImpl = async (url) => {
      n++
      if (String(url).includes('primary_topic.field.id:17')) return json({}, 503)
      return String(url).includes('/topics/') ? json({ updated_date: 'x' }) : json(groupBy())
    }
    const err = await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(AXES).catch((e) => e)
    expect(err.code).toBe('source_unavailable')
    expect(n).toBe(2 * 2 + 1)
  })

  it('six axes make exactly 13 requests', async () => {
    const six = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((openalexId, i) => ({ axisId: `a${i}`, openalexId }))
    const fetchImpl = fakeFetch()
    await createOpenAlexSource({ fetchImpl, now: NOW }).fetchSnapshot(six)
    expect(fetchImpl.calls).toHaveLength(13)
  })
})
