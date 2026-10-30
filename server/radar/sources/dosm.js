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

export const releasePageUrl = (quarter) => {
  const m = QUARTER.exec(quarter)
  return `${SITE}/portal-main/release-content/${SLUG}-q${m[2]}${m[1]}`
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
    const text = await getText(`${SITE}/portal-main/release-archive/${SLUG}-q${active[2]}${active[1]}`)

    // <a href="…">DD.MM.YYYY - … Job Market Insights…, <First|…> Quarter of YYYY</a>
    const line = /(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*)?(\d{2})\.(\d{2})\.(\d{4}) - ([^<]*?Job Market Insights[^<]*?,\s*(First|Second|Third|Fourth) Quarter of (\d{4}))\s*(?=<|$)/gi
    let best = null
    for (const m of text.matchAll(line)) {
      const quarter = `${m[7]} Q${ORDINALS[m[6].toLowerCase()]}`
      const ordinal = quarterNumber(quarter)
      if (ordinal <= activeOrdinal || (best && ordinal >= best.ordinal)) continue
      let pageUrl = releasePageUrl(quarter)
      if (m[1]) {
        try {
          const u = new URL(m[1], SITE)
          if (u.origin === SITE) pageUrl = u.href
        } catch {
          // keep the constructed URL
        }
      }
      best = { ordinal, release: { quarter, title: m[5].trim(), publishedAt: `${m[4]}-${m[3]}-${m[2]}`, pageUrl } }
    }
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
      const end = rest.search(/\sid="|<h5\b(?![^>]*>\s*Data\s*<)/i)
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
    const fetchedAt = now().toISOString()
    const snapshot = {
      sourceId: 'dosm',
      snapshotId: `dosm-${release.quarter.replace(' ', '').toLowerCase()}-${fetchedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
      fetchedAt,
      lastQuarter: lastPeriod,
      classification: { system: 'masco2020', version: '2020', readAt: fetchedAt },
      sourceUrls: [pageUrl, dataUrl],
      originals: [{ name, sha256 }],
      meta: {
        quarter: release.quarter,
        publishedAt: release.publishedAt ?? null,
        pageUrl,
        dataUrl,
        listingTitle: release.listingTitle ?? release.title ?? null
      },
      observations: dosmSnapshotObservations(table)
    }
    return { snapshot, original: { name, bytes, sha256 } }
  }

  return { discover, fetchSnapshot }
}
