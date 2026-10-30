import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createDosmSource } from '../../server/radar/sources/dosm.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { ARCHIVE_URL, DATA_URL, RELEASE_BASE, ARCHIVE_NO_NEW, ARCHIVE_NEW_Q3, RELEASE_PAGE, RELEASE_PAGE_NO_DATA } from '../helpers/dosmPages.js'

const NOW = () => new Date('2026-10-30T10:00:00Z')
const XLSX = await readFile('data/radar/source/dosm-jmi-2026q2.xlsx')
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } })

function fakeFetch(routes) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url: String(url), init })
    const r = routes[String(url)]
    if (r instanceof Error) throw r
    if (!r) return html('nope', 404)
    return typeof r === 'function' ? r() : r
  }
  impl.calls = calls
  return impl
}

const PAGE_Q2 = `${RELEASE_BASE}22026`
const RELEASE = { quarter: '2026 Q2', title: 'Big Data Analytics: Job Market Insights, Second Quarter of 2026', publishedAt: '2026-08-18', pageUrl: PAGE_Q2 }
const code = async (p) => p.then(() => null, (e) => e)

describe('discover', () => {
  it('reports a later quarter as new, with the listing date', async () => {
    const f = fakeFetch({ [ARCHIVE_URL]: html(ARCHIVE_NEW_Q3) })
    const d = await createDosmSource({ fetchImpl: f, now: NOW }).discover('2026 Q2')
    expect(d.status).toBe('new')
    expect(d.release).toEqual({
      quarter: '2026 Q3',
      title: 'Big Data Analytics: Job Market Insights, Third Quarter of 2026',
      publishedAt: '2026-11-19',
      pageUrl: `${RELEASE_BASE}32026`
    })
    expect(f.calls[0].url).toBe(ARCHIVE_URL)
    expect(f.calls[0].init.signal).toBeTruthy()
  })

  it('reports none when the listing has no later quarter', async () => {
    const f = fakeFetch({ [ARCHIVE_URL]: html(ARCHIVE_NO_NEW) })
    expect(await createDosmSource({ fetchImpl: f, now: NOW }).discover('2026 Q2')).toEqual({ status: 'none' })
  })

  it('maps network, timeout and 5xx failures to source_unavailable', async () => {
    for (const r of [new Error('boom'), html('x', 503)]) {
      const e = await code(createDosmSource({ fetchImpl: fakeFetch({ [ARCHIVE_URL]: r }), now: NOW }).discover('2026 Q2'))
      expect(e).toBeInstanceOf(SourceError)
      expect(e.code).toBe('source_unavailable')
      expect(e.retryable).toBe(true)
    }
  })

  it('rejects an active quarter that is not YYYY Qn', async () => {
    const e = await code(createDosmSource({ fetchImpl: fakeFetch({}), now: NOW }).discover('Q2 2026'))
    expect(e).toBeInstanceOf(SourceError)
  })
})

describe('fetchSnapshot', () => {
  const routes = (over = {}) => ({
    [PAGE_Q2]: html(RELEASE_PAGE),
    [DATA_URL]: new Response(XLSX, { status: 200, headers: { 'Content-Type': XLSX_TYPE } }),
    ...over
  })

  it('builds a validated snapshot from the real workbook and keeps the original', async () => {
    const f = fakeFetch(routes())
    const { snapshot, original } = await createDosmSource({ fetchImpl: f, now: NOW }).fetchSnapshot({
      ...RELEASE,
      listingTitle: 'Big Data Analytics: Job Market Insights, Second Quarter of 2026'
    })
    const sha = createHash('sha256').update(XLSX).digest('hex')
    expect(original.sha256).toBe(sha)
    expect(original.bytes.length).toBe(XLSX.length)
    expect(original.name).toMatch(/\.xlsx$/)
    expect(snapshot.sourceId).toBe('dosm')
    expect(snapshot.fetchedAt).toBe('2026-10-30T10:00:00.000Z')
    expect(snapshot.originals[0].sha256).toBe(sha)
    expect(snapshot.sourceUrls).toEqual([PAGE_Q2, DATA_URL])
    expect([...new Set(snapshot.observations.filter((o) => o.entityType === 'total').map((o) => o.period))]).toHaveLength(28)
    expect(snapshot.observations.at(-1).period).toBe('2026 Q2')
    expect(snapshot.meta).toMatchObject({
      quarter: '2026 Q2',
      publishedAt: '2026-08-18',
      pageUrl: PAGE_Q2,
      dataUrl: DATA_URL,
      listingTitle: 'Big Data Analytics: Job Market Insights, Second Quarter of 2026'
    })
    expect(validateSnapshot(snapshot).ok).toBe(true)
  })

  it('records the listing title as evidence (title without "and My Job Profile")', async () => {
    const { snapshot } = await createDosmSource({ fetchImpl: fakeFetch(routes()), now: NOW }).fetchSnapshot(RELEASE)
    expect(snapshot.meta.listingTitle).toBe(RELEASE.title)
  })

  it('release page without a data link -> dosm_dataset_missing', async () => {
    const e = await code(createDosmSource({ fetchImpl: fakeFetch(routes({ [PAGE_Q2]: html(RELEASE_PAGE_NO_DATA) })), now: NOW }).fetchSnapshot(RELEASE))
    expect(e.code).toBe('dosm_dataset_missing')
  })

  it('data link answering HTML -> dosm_dataset_missing', async () => {
    const e = await code(createDosmSource({ fetchImpl: fakeFetch(routes({ [DATA_URL]: html('<html>login</html>') })), now: NOW }).fetchSnapshot(RELEASE))
    expect(e.code).toBe('dosm_dataset_missing')
  })

  it('a file that is not a real xlsx -> dosm_dataset_missing', async () => {
    const bad = new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'Content-Type': XLSX_TYPE } })
    const e = await code(createDosmSource({ fetchImpl: fakeFetch(routes({ [DATA_URL]: bad })), now: NOW }).fetchSnapshot(RELEASE))
    expect(e.code).toBe('dosm_dataset_missing')
  })

  it('last quarter in the workbook differs from the listing -> dosm_layout_unexpected', async () => {
    const e = await code(createDosmSource({ fetchImpl: fakeFetch(routes()), now: NOW }).fetchSnapshot({ ...RELEASE, quarter: '2026 Q3' }))
    expect(e).toBeInstanceOf(SourceError)
    expect(e.code).toBe('dosm_layout_unexpected')
  })

  it('page or download failures -> source_unavailable', async () => {
    const e = await code(createDosmSource({ fetchImpl: fakeFetch(routes({ [DATA_URL]: html('x', 500) })), now: NOW }).fetchSnapshot(RELEASE))
    expect(e.code).toBe('source_unavailable')
    expect(e.retryable).toBe(true)
  })
})
