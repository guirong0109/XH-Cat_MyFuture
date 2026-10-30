// DOSM source adapter (spec 6.2). Reads the official release archive, finds a Job Market Insights release for a
// quarter later than the active one, downloads its "Data" workbook and turns Table 2 into a snapshot.
// Fetches are plain and honest: no browser user agent, no cookies.
import { createHash } from 'node:crypto'
import { SourceError } from '../sourceError.js'
import { parseDosmJmi } from '../dosmTable.js'
import { dosmSnapshotObservations } from '../../../shared/radar/snapshot.js'

const SITE = 'https://www.dosm.gov.my'
const SLUG = 'big-data-analytics-job-market-insights'
const TIMEOUT_MS = 15000
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4 }
const QUARTER = /^(\d{4}) Q([1-4])$/

const quarterNumber = (q) => {
  const m = QUARTER.exec(q)
  return m ? Number(m[1]) * 4 + Number(m[2]) : null
}

// The DOSM URLs of one quarter ("2025 Q3"); null for anything else. The only place these patterns live: the admin
// break review gets its links from the server (server/radar/adminRoutes.js), never from a pattern in the browser.
const quarterUrl = (kind) => (quarter) => {
  const m = QUARTER.exec(String(quarter ?? ''))
  return m ? `${SITE}/portal-main/${kind}/${SLUG}-q${m[2]}${m[1]}` : null
}
export const releasePageUrl = quarterUrl('release-content')
export const releaseArchiveUrl = quarterUrl('release-archive')

// One archive line: <a href="...">DD.MM.YYYY - ... Job Market Insights...[,] <First|...> Quarter of YYYY</a>
const LISTING_LINE = /(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*)?(\d{2})\.(\d{2})\.(\d{4}) - ([^<]*?Job Market Insights[^<]*?,?\s*(First|Second|Third|Fourth) Quarter of (\d{4}))\s*(?=<|$)/gi

// A link on a DOSM page as an absolute URL: relative links resolved against the site, &amp; decoded; only
// https://www.dosm.gov.my/... is kept (D3: every evidence link must work and point at the source), else null.
export function dosmLink(href) {
  if (typeof href !== 'string' || !href.trim()) return null
  try {
    const u = new URL(href.trim().replace(/&amp;/g, '&'), SITE)
    return u.origin === SITE ? u.href : null
  } catch {
    return null
  }
}

function scanListing(text) {
  return [...String(text ?? '').matchAll(LISTING_LINE)].map((m) => ({
    quarter: `${m[7]} Q${ORDINALS[m[6].toLowerCase()]}`,
    title: m[5].trim(),
    publishedAt: `${m[4]}-${m[3]}-${m[2]}`,
    pageUrl: dosmLink(m[1])
  }))
}

// Listing entries as stored: {quarter, title, publishedAt, pageUrl} only (pageUrl: the entry's real link from the
// archive page, https://www.dosm.gov.my/... only, else null), valid quarters only, sorted by quarter (then date).
export function cleanListing(listing) {
  if (!Array.isArray(listing)) return []
  return listing
    .filter((e) => e && QUARTER.test(e.quarter ?? '') && typeof e.title === 'string')
    .map((e) => ({
      quarter: e.quarter,
      title: e.title,
      publishedAt: typeof e.publishedAt === 'string' ? e.publishedAt : null,
      pageUrl: typeof e.pageUrl === 'string' && dosmLink(e.pageUrl) === e.pageUrl ? e.pageUrl : null
    }))
    .sort((a, b) => quarterNumber(a.quarter) - quarterNumber(b.quarter) || String(a.publishedAt ?? '').localeCompare(String(b.publishedAt ?? '')))
}

// Every Job Market Insights entry of a release archive page (spec 6.2: listing evidence for the break review, such
// as the title change at 2025 Q3, kept as evidence and never as a cause).
export const parseDosmListing = (text) => cleanListing(scanListing(text))

// File name from the URL path when it has one (a release-document-log link has none).
const dataFileName = (url) => {
  const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '')
  return /\.[a-z0-9]{2,5}$/i.test(last) ? last : 'Data JMI'
}

// Snapshot + original from workbook bytes and the release metadata (shared by fetchSnapshot and the bootstrap).
// listing: the archive entries read with this release (optional; defaults to release.listing), stored as meta.listing;
// listingUrl: the archive page they were read from (defaults to release.listingUrl), stored as meta.listingUrl.
export function dosmSnapshotFromWorkbook(bytes, release, { pageUrl, dataUrl, fetchedAt, listing = release.listing, listingUrl = release.listingUrl }) {
  let table
  try {
    table = parseDosmJmi(bytes)
  } catch (e) {
    if (e?.code === 'not_xlsx') throw new SourceError('dosm_dataset_missing', { detail: { reason: 'not_xlsx' } })
    if (e?.code === 'dosm_layout_unexpected') throw new SourceError('dosm_layout_unexpected', { detail: { reason: e.detail } })
    throw e
  }
  const lastPeriod = table.periods.at(-1)
  if (lastPeriod !== release.quarter) {
    throw new SourceError('dosm_layout_unexpected', { detail: { reason: `last quarter ${lastPeriod} differs from listing ${release.quarter}` } })
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const name = `dosm-jmi-${release.quarter.replace(' ', '').toLowerCase()}.xlsx`
  const snapshot = {
    sourceId: 'dosm',
    snapshotId: `dosm-${release.quarter.replace(' ', '').toLowerCase()}-${fetchedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    fetchedAt,
    lastQuarter: lastPeriod,
    classification: { system: 'masco2020', version: '2020', readAt: fetchedAt },
    sourceUrls: [
      { label: `DOSM release page: ${release.listingTitle ?? release.title ?? release.quarter}`, url: pageUrl },
      { label: `DOSM data file: ${dataFileName(dataUrl)}`, url: dataUrl }
    ],
    originals: [{ name, sha256 }],
    meta: {
      quarter: release.quarter,
      publishedAt: release.publishedAt ?? null,
      pageUrl,
      dataUrl,
      listingTitle: release.listingTitle ?? release.title ?? null,
      listing: cleanListing(listing),
      listingUrl: dosmLink(listingUrl)
    },
    observations: dosmSnapshotObservations(table)
  }
  return { snapshot, original: { name, bytes, sha256 } }
}

export function createDosmSource({ fetchImpl = fetch, now = () => new Date() } = {}) {
  async function get(url, { missingOn404 = false } = {}) {
    let response
    try {
      response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }
    if (missingOn404 && response.status === 404) throw new SourceError('dosm_dataset_missing', { detail: { status: 404 } })
    if (!response.ok) throw new SourceError('source_unavailable', { retryable: true, detail: { status: response.status } })
    return response
  }

  async function getText(url, opts) {
    const response = await get(url, opts)
    try {
      return await response.text()
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }
  }

  async function discover(activeQuarter) {
    const active = QUARTER.exec(activeQuarter ?? '')
    if (!active) throw new TypeError('activeQuarter must look like "2026 Q2"')
    const activeOrdinal = quarterNumber(activeQuarter)
    const listingUrl = releaseArchiveUrl(activeQuarter)
    const text = await getText(listingUrl)
    const lines = scanListing(text)
    let best = null
    for (const entry of lines) {
      const ordinal = quarterNumber(entry.quarter)
      if (ordinal <= activeOrdinal || (best && ordinal >= best.ordinal)) continue
      best = { ordinal, release: { quarter: entry.quarter, title: entry.title, publishedAt: entry.publishedAt, pageUrl: entry.pageUrl ?? releasePageUrl(entry.quarter) } }
    }
    // The whole listing (with each entry's real link) and the archive page read travel with the release and are stored
    // on the snapshot (meta.listing, meta.listingUrl) as break evidence.
    if (best) Object.assign(best.release, { listing: cleanListing(lines), listingUrl })
    return best ? { status: 'new', release: best.release } : { status: 'none' }
  }

  async function fetchSnapshot(release) {
    const pageUrl = release.pageUrl ?? releasePageUrl(release.quarter)
    const page = await getText(pageUrl, { missingOn404: true })
    const start = page.indexOf('id="data"')
    let section = ''
    if (start >= 0) {
      const rest = page.slice(start + 9)
      // The Data section ends at the next id="..." attribute or the next heading other than "Data".
      const end = rest.search(/\sid="|<h[1-6]\b(?![^>]*>\s*Data\s*<)/i)
      section = end >= 0 ? rest.slice(0, end) : rest
    }
    const link = /href="([^"]*release-document-log\?release_document_id=\d+[^"]*)"/.exec(section)
    if (!link) throw new SourceError('dosm_dataset_missing', { detail: { reason: 'no data link' } })
    const dataUrl = new URL(link[1].replace(/&amp;/g, '&'), SITE).href
    if (new URL(dataUrl).host !== 'www.dosm.gov.my') throw new SourceError('dosm_dataset_missing', { detail: { reason: 'foreign host' } })

    const response = await get(dataUrl, { missingOn404: true })
    const type = (response.headers.get('content-type') ?? '').toLowerCase()
    if (/text\/html/.test(type)) throw new SourceError('dosm_dataset_missing', { detail: { reason: 'html' } })
    let bytes
    try {
      bytes = Buffer.from(await response.arrayBuffer())
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }

    return dosmSnapshotFromWorkbook(bytes, release, { pageUrl, dataUrl, fetchedAt: now().toISOString() })
  }

  return { discover, fetchSnapshot }
}
