// One-time build of the bundled Radar data (spec §4.4, §7): runs the real OpenAlex adapter (live, no key needed) and
// builds the DOSM snapshot from the committed original workbook (with the release archive listing read from the
// committed saved archive page, kept as break evidence, spec 6.2), feeds both through the real ingestor against a memory
// store, then dumps every key to data/radar/bundle/ (same layout as prod/). Run: node scripts/radar-bootstrap.mjs
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createIngestor } from '../server/radar/ingest.js'
import { createMemoryStore } from '../server/radar/store/memory.js'
import { createOpenAlexSource } from '../server/radar/sources/openalex.js'
import { dosmSnapshotFromWorkbook, parseDosmListing, releaseArchiveUrl } from '../server/radar/sources/dosm.js'
import { loadRadarReferences } from '../server/radar/references.js'

const OUT = path.resolve('data/radar/bundle')
const WORKBOOK = 'data/radar/source/dosm-jmi-2026q2.xlsx'
// The real release archive page (saved 2026-10-30). The Q2 2026 release is not listed in its own archive.
const ARCHIVE = 'tests/fixtures/dosm-archive-2026q2.html'
const RELEASE = {
  quarter: '2026 Q2',
  publishedAt: '2026-08-18',
  pageUrl: 'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q22026',
  dataUrl: 'https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742',
  listingTitle: 'Big Data Analytics: Job Market Insights, Second Quarter of 2026',
  listing: parseDosmListing(await readFile(ARCHIVE, 'utf8')),
  // The page the saved archive was read from (its og:url).
  listingUrl: releaseArchiveUrl('2026 Q2')
}

const store = createMemoryStore()
const references = await loadRadarReferences('data')
const now = () => new Date()
const workbook = await readFile(WORKBOOK)

const dosm = {
  fetchSnapshot: async (release) =>
    dosmSnapshotFromWorkbook(workbook, release, { pageUrl: release.pageUrl, dataUrl: release.dataUrl, fetchedAt: now().toISOString() })
}
const openalex = createOpenAlexSource({ now })
const ingestor = createIngestor({ store, sources: { openalex, dosm }, references, now })

if (!RELEASE.listing.length) throw new Error('no listing entries in the saved archive page')
const first = await ingestor.importDosmRelease(RELEASE)
console.log('dosm:', first.outcome, first.code ?? '')
if (first.outcome !== 'published') process.exit(1)
const second = await ingestor.refresh('openalex')
console.log('openalex:', second.outcome, second.code ?? '')
if (second.outcome !== 'published') process.exit(1)

await rm(OUT, { recursive: true, force: true })
let count = 0
for (const key of await store.list('')) {
  // The ingest log holds run times and ids only; it is not part of the bundle.
  if (key.startsWith('prod/ingest-log/')) continue
  const file = path.join(OUT, ...key.split('/'))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, (await store.get(key)).bytes)
  count += 1
}
console.log(`wrote ${count} files to data/radar/bundle`)
