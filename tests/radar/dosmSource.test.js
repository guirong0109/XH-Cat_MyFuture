import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createDosmSource, dosmSnapshotFromWorkbook, parseDosmListing, releaseArchiveUrl, releasePageUrl } from '../../server/radar/sources/dosm.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { ARCHIVE_URL, DATA_URL, RELEASE_BASE, ARCHIVE_NO_NEW, ARCHIVE_NEW_Q3, RELEASE_PAGE, RELEASE_PAGE_NO_DATA } from '../helpers/dosmPages.js'

const NOW = () => new Date('2026-10-30T10:00:00Z')
const XLSX = await readFile('data/radar/source/dosm-jmi-2026q2.xlsx')
const REAL = await readFile('tests/fixtures/dosm-archive-2026q2.html', 'utf8')
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
    expect(d.release).toMatchObject({
      quarter: '2026 Q3',
      title: 'Big Data Analytics: Job Market Insights, Third Quarter of 2026',
      publishedAt: '2026-11-19',
      pageUrl: `${RELEASE_BASE}32026`
    })
    expect(Object.keys(d.release).sort()).toEqual(['listing', 'listingUrl', 'pageUrl', 'publishedAt', 'quarter', 'title'])
    expect(d.release.listingUrl).toBe(ARCHIVE_URL)
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
    expect(snapshot.sourceUrls).toEqual([
      { label: 'DOSM release page: Big Data Analytics: Job Market Insights, Second Quarter of 2026', url: PAGE_Q2 },
      { label: 'DOSM data file: Data JMI', url: DATA_URL }
    ])
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

  it('an empty Data section followed by any other heading level and a press link -> dosm_dataset_missing', async () => {
    const press = DATA_URL.replace('20742', '20743')
    const withPress = (page) => createDosmSource({ fetchImpl: fakeFetch(routes({ [PAGE_Q2]: html(page), [press]: new Response(XLSX, { headers: { 'Content-Type': XLSX_TYPE } }) })), now: NOW }).fetchSnapshot(RELEASE)
    const page = `<div id="data"><h5>Data</h5><ol></ol></div><h4>Press</h4><a href="${press}">p</a>`
    expect((await code(withPress(page))).code).toBe('dosm_dataset_missing')
    const bare = `<div id="data"><h5>Data</h5><ol></ol><h4>Press</h4><a href="${press}">p</a>`
    expect((await code(withPress(bare))).code).toBe('dosm_dataset_missing')
  })

  it('finds the data link on the real saved release page', async () => {
    const real = await readFile('tests/fixtures/dosm-release-2026q2.html', 'utf8')
    const r = await fetchWith(real)
    expect(r.snapshot.meta.dataUrl).toBe('https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742')
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

describe('release listing kept as break evidence (spec 6.2)', () => {
  it('URL builders: release page and release archive of one quarter', () => {
    expect(releasePageUrl('2025 Q3')).toBe(`${RELEASE_BASE}32025`)
    expect(releaseArchiveUrl('2026 Q2')).toBe(ARCHIVE_URL)
    expect(releasePageUrl('Q3 2025')).toBe(null)
    expect(releaseArchiveUrl(undefined)).toBe(null)
  })

  it('parses every Job Market Insights entry of the real saved archive page, sorted by quarter', () => {
    const listing = parseDosmListing(REAL)
    for (const e of listing) expect(Object.keys(e).sort()).toEqual(['pageUrl', 'publishedAt', 'quarter', 'title'])
    const quarters = listing.map((e) => e.quarter)
    expect(quarters).toEqual([...quarters].sort((a, b) => a.localeCompare(b)))
    const byQ = Object.fromEntries(listing.map((e) => [e.quarter, e]))
    // Each entry keeps the real link from the page (D3: every evidence link must work), not the q<n><yyyy> pattern.
    expect(REAL).toContain('href="/portal-main/release-content/big-data-analytics-job-market-insights-and-my-job-profile-second-quarter-of-"')
    expect(byQ['2025 Q2']).toEqual({ quarter: '2025 Q2', title: 'Big Data Analytics: Job Market Insights and My Job Profile, Second Quarter of 2025', publishedAt: '2026-02-26', pageUrl: 'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-and-my-job-profile-second-quarter-of-' })
    expect(byQ['2025 Q2'].pageUrl).not.toBe(releasePageUrl('2025 Q2'))
    expect(byQ['2023 Q1'].pageUrl).toBe('https://www.dosm.gov.my/portal-main/release-content/5f1a1991-0a85-11ee-96d5-1866daa77ef9')
    expect(byQ['2025 Q3']).toEqual({ quarter: '2025 Q3', title: 'Big Data Analytics: Job Market Insights, Third Quarter of 2025', publishedAt: '2026-04-28', pageUrl: 'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q32025' })
    expect(byQ['2026 Q1'].publishedAt).toBe('2026-06-25')
    // Older releases under another name ("Job Vacancies Landscape") are not Job Market Insights entries.
    expect(listing.some((e) => /Landscape/.test(e.title))).toBe(false)
    expect(quarters).toContain('2023 Q1')
    // The Q2 2026 release is not in its own archive listing; that is fine.
    expect(quarters).not.toContain('2026 Q2')
  })

  it('discover keeps the whole listing on the release; fetchSnapshot stores it as meta.listing', async () => {
    const f = fakeFetch({ [ARCHIVE_URL]: html(ARCHIVE_NEW_Q3) })
    const d = await createDosmSource({ fetchImpl: f, now: NOW }).discover('2026 Q2')
    expect(d.release.listing.map((e) => e.quarter)).toEqual(['2025 Q1', '2025 Q2', '2025 Q3', '2025 Q4', '2026 Q1', '2026 Q3'])
    expect(d.release.listing.some((e) => /Labour Force/.test(e.title))).toBe(false)
    const listing = parseDosmListing(REAL)
    const routes = { [PAGE_Q2]: html(RELEASE_PAGE), [DATA_URL]: new Response(XLSX, { status: 200, headers: { 'Content-Type': XLSX_TYPE } }) }
    const { snapshot } = await createDosmSource({ fetchImpl: fakeFetch(routes), now: NOW }).fetchSnapshot({ ...RELEASE, listing })
    expect(snapshot.meta.listing).toEqual(listing)
    expect(snapshot.meta.listingUrl).toBe(null)
    expect(snapshot.meta.listingTitle).toBe(RELEASE.title)
    expect(validateSnapshot(snapshot).ok).toBe(true)
  })

  it('listing links: relative resolved against the site, &amp; decoded, other hosts and schemes dropped', () => {
    const line = (href, q) => `<h6><a href="${href}">01.02.2026 - Big Data Analytics: Job Market Insights, ${q} Quarter of 2025</a></h6>`
    const got = parseDosmListing(
      line('/portal-main/release-content/x?a=1&amp;b=2', 'First') +
      line('https://evil.example/portal-main/release-content/y', 'Second') +
      line('javascript:alert(1)', 'Third') +
      line('http://www.dosm.gov.my/portal-main/release-content/z', 'Fourth')
    )
    expect(got.map((e) => e.pageUrl)).toEqual(['https://www.dosm.gov.my/portal-main/release-content/x?a=1&b=2', null, null, null])
  })

  it('dosmSnapshotFromWorkbook takes an optional listing (sorted, only quarter/title/publishedAt/pageUrl kept)', () => {
    const opts = { pageUrl: PAGE_Q2, dataUrl: DATA_URL, fetchedAt: NOW().toISOString() }
    expect(dosmSnapshotFromWorkbook(XLSX, RELEASE, opts).snapshot.meta.listing).toEqual([])
    const given = [
      { quarter: '2025 Q3', title: 'B', publishedAt: '2026-04-28', extra: 'dropped' },
      { quarter: '2025 Q2', title: 'A', publishedAt: '2026-02-26' },
      { quarter: 'nonsense', title: 'C', publishedAt: '2026-01-01' }
    ]
    given[0].pageUrl = 'https://www.dosm.gov.my/portal-main/release-content/b'
    given[1].pageUrl = 'https://evil.example/a'
    const meta = dosmSnapshotFromWorkbook(XLSX, RELEASE, { ...opts, listing: given, listingUrl: ARCHIVE_URL }).snapshot.meta
    expect(meta.listing).toEqual([
      { quarter: '2025 Q2', title: 'A', publishedAt: '2026-02-26', pageUrl: null },
      { quarter: '2025 Q3', title: 'B', publishedAt: '2026-04-28', pageUrl: 'https://www.dosm.gov.my/portal-main/release-content/b' }
    ])
    expect(meta.listingUrl).toBe(ARCHIVE_URL)
  })
})
