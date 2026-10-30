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
    expect(e).toBeInstanceOf(TypeError)
    expect(e).not.toBeInstanceOf(SourceError)
  })

  it('with several newer quarters returns the earliest one after the active quarter', async () => {
    const q4 = '<h6><a href="/portal-main/release-content/big-data-analytics-job-market-insights-q42026">20.02.2027 - Big Data Analytics: Job Market Insights, Fourth Quarter of 2026</a></h6>'
    const f = fakeFetch({ [ARCHIVE_URL]: html(q4 + ARCHIVE_NEW_Q3) })
    const d = await createDosmSource({ fetchImpl: f, now: NOW }).discover('2026 Q2')
    expect(d.release.quarter).toBe('2026 Q3')
    expect(d.release.publishedAt).toBe('2026-11-19')
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

  const pageWith = (data) => `<div id="data"><h5>Data</h5>${data}</div><div id="press_statement"><h5>Press Statement</h5><a href="${DATA_URL.replace('20742', '20743')}">Press</a></div>`
  const fetchWith = (page) => createDosmSource({ fetchImpl: fakeFetch(routes({ [PAGE_Q2]: html(page) })), now: NOW }).fetchSnapshot(RELEASE)

  it('an empty Data section followed by a Press Statement link -> dosm_dataset_missing', async () => {
    expect((await code(fetchWith(pageWith('<ol></ol>')))).code).toBe('dosm_dataset_missing')
    expect((await code(fetchWith(`<div id="data"><h5>Data</h5></div><h5>Press</h5><a href="${DATA_URL}">x</a>`))).code).toBe('dosm_dataset_missing')
  })

  it('accepts a relative data link and &amp; in the URL', async () => {
    const rel = '<a href="/portal-main/release-document-log?release_document_id=20742">d</a>'
    expect((await fetchWith(pageWith(rel))).snapshot.meta.dataUrl).toBe(DATA_URL)
    const amp = '<a href="/portal-main/release-document-log?release_document_id=20742&amp;cat=x">d</a>'
    const f = fakeFetch(routes({ [PAGE_Q2]: html(pageWith(amp)), [DATA_URL + '&cat=x']: new Response(XLSX, { headers: { 'Content-Type': XLSX_TYPE } }) }))
    const r = await createDosmSource({ fetchImpl: f, now: NOW }).fetchSnapshot(RELEASE)
    expect(r.snapshot.meta.dataUrl).toBe(DATA_URL + '&cat=x')
  })

  it('rejects a data link on another host', async () => {
    const e = await code(fetchWith(pageWith('<a href="https://evil.example/portal-main/release-document-log?release_document_id=1">d</a>')))
    expect(e.code).toBe('dosm_dataset_missing')
  })
})
