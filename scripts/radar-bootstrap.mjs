// Build of the bundled Radar data (spec §4.4, §7; skill-trends spec §3). Everything goes through the real ingestor
// against a memory store, then every key is dumped to data/radar/bundle/ (same layout as prod/).
//
// 1. The committed bundle is loaded into the memory store first, so its OpenAlex and DOSM snapshots and originals stay
//    byte-identical (no OpenAlex call). Only when there is no bundle yet: the DOSM snapshot is built from the committed
//    original workbook (release archive listing from the committed saved archive page, break evidence, spec 6.2) and the
//    real OpenAlex adapter runs (live, no key needed).
// 2. O*NET skill flags: releases 30.2, 30.3 and 31.0 (refreshOnetRelease). The official zips are downloaded, or read
//    from ONET_ZIP_DIR (files db_30_2.zip, db_30_3.zip, db_31_0.zip) when set; either way the recorded zip URL is the
//    official one and the SHA-256 is that of the bytes read. The zips are never stored.
// 3. O*NET Hot Technologies: the live page (refresh('onet-hottech')); the page itself is kept as the original.
//
// Run: node scripts/radar-bootstrap.mjs   (optional: ONET_ZIP_DIR=<folder with the three zips>)
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createIngestor } from '../server/radar/ingest.js'
import { createMemoryStore } from '../server/radar/store/memory.js'
import { createFileStore } from '../server/radar/store/file.js'
import { KEYS } from '../server/radar/manifest.js'
import { createOpenAlexSource } from '../server/radar/sources/openalex.js'
import { dosmSnapshotFromWorkbook, parseDosmListing, releaseArchiveUrl } from '../server/radar/sources/dosm.js'
import { createOnetSkillsSource } from '../server/radar/sources/onetSkills.js'
import { createOnetHotTechSource } from '../server/radar/sources/onetHotTech.js'
import { loadRadarReferences } from '../server/radar/references.js'

const OUT = path.resolve('data/radar/bundle')
const WORKBOOK = 'data/radar/source/dosm-jmi-2026q2.xlsx'
// The real release archive page (saved 2026-10-30). The Q2 2026 release is not listed in its own archive.
const ARCHIVE = 'tests/fixtures/dosm-archive-2026q2.html'
const ONET_RELEASES = ['30.2', '30.3', '31.0']

const store = createMemoryStore()
const references = await loadRadarReferences('data')
const now = () => new Date()

// The official O*NET zip, read from ONET_ZIP_DIR when it holds it; otherwise the normal download.
const zipDir = process.env.ONET_ZIP_DIR || null
async function onetFetch(url, options) {
  const m = /\/db_(\d{2})_(\d)_text\.zip$/.exec(String(url))
  const file = m && zipDir ? path.join(zipDir, `db_${m[1]}_${m[2]}.zip`) : null
  if (file && existsSync(file)) {
    const bytes = await readFile(file)
    console.log(`onet-skills: ${path.basename(file)} read from ONET_ZIP_DIR for ${url}`)
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  }
  return fetch(url, options)
}

const sources = {
  'onet-skills': createOnetSkillsSource({ fetchImpl: onetFetch, now }),
  'onet-hottech': createOnetHotTechSource({ now }),
}

// 1. The committed bundle, or (no bundle yet) DOSM and OpenAlex from scratch.
let dosmRelease = null
const bundle = existsSync(path.join(OUT, 'prod', 'active.json')) ? createFileStore(OUT) : null
if (bundle) {
  let loaded = 0
  for (const key of await bundle.list('')) {
    await store.put(key, (await bundle.get(key)).bytes)
    loaded += 1
  }
  console.log(`loaded ${loaded} files from data/radar/bundle`)
} else {
  const workbook = await readFile(WORKBOOK)
  dosmRelease = {
    quarter: '2026 Q2',
    publishedAt: '2026-08-18',
    pageUrl: 'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q22026',
    dataUrl: 'https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742',
    listingTitle: 'Big Data Analytics: Job Market Insights, Second Quarter of 2026',
    listing: parseDosmListing(await readFile(ARCHIVE, 'utf8')),
    // The page the saved archive was read from (its og:url).
    listingUrl: releaseArchiveUrl('2026 Q2')
  }
  if (!dosmRelease.listing.length) throw new Error('no listing entries in the saved archive page')
  sources.dosm = {
    fetchSnapshot: async (r) =>
      dosmSnapshotFromWorkbook(workbook, r, { pageUrl: r.pageUrl, dataUrl: r.dataUrl, fetchedAt: now().toISOString() })
  }
  sources.openalex = createOpenAlexSource({ now })
}

const ingestor = createIngestor({ store, sources, references, now })
const must = (label, out) => {
  console.log(`${label}:`, out.outcome, out.code ?? '')
  if (out.outcome !== 'published') process.exit(1)
}
if (!bundle) {
  must('dosm', await ingestor.importDosmRelease(dosmRelease))
  must('openalex', await ingestor.refresh('openalex'))
}

// 2. and 3.
for (const release of ONET_RELEASES) must(`onet-skills ${release}`, await ingestor.refreshOnetRelease(release))
must('onet-hottech', await ingestor.refresh('onet-hottech'))

await rm(OUT, { recursive: true, force: true })
let count = 0
for (const key of await store.list('')) {
  // The ingest log holds run times and ids only; it is not part of the bundle.
  if (key.startsWith(KEYS.ingestLogPrefix)) continue
  const file = path.join(OUT, ...key.split('/'))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, (await store.get(key)).bytes)
  count += 1
}
console.log(`wrote ${count} files to data/radar/bundle`)
