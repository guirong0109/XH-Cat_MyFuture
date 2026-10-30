// Helpers for Future Skills Radar tests.
import { readFile } from 'node:fs/promises'
import { parseDosmJmi } from '../../server/radar/dosmTable.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { dosmSnapshotObservations } from '../../shared/radar/snapshot.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { OPENALEX_METRIC, OPENALEX_REFERENCE_ID, OPENALEX_UNIT } from '../../shared/radar/pipeline.js'

// Keep the periods up to and including `period`, slicing every series of a DosmTable.
export function truncateTable(table, period) {
  const index = table.periods.indexOf(period)
  if (index < 0) throw new Error(`period not in table: ${period}`)
  const cut = (values) => values.slice(0, index + 1)
  return {
    periods: cut(table.periods),
    total: cut(table.total),
    unclassified: cut(table.unclassified),
    groups: Object.fromEntries(Object.entries(table.groups).map(([code, g]) => [code, { name: g.name, values: cut(g.values) }])),
  }
}

export const DOSM_RELEASE_URL = 'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q22026'
export const DOSM_DATA_URL = 'https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742'

// The real bundled DOSM workbook as a dosm snapshot.
export function dosmSnapshotFromTable(table, extra = {}) {
  return {
    snapshotId: 'dosm-jmi-2026q2',
    sourceId: 'dosm',
    fetchedAt: '2026-10-30T00:00:00Z',
    publishedAt: '2026-08-18',
    observationStart: table.periods[0],
    observationEnd: table.periods.at(-1),
    sourceUrls: [
      { label: 'DOSM release page: Big Data Analytics, Job Market Insights Q2 2026', url: DOSM_RELEASE_URL },
      { label: 'DOSM data workbook (Table 2, major occupation group)', url: DOSM_DATA_URL },
    ],
    classification: { system: 'MASCO 2020 major group', version: '2020', readAt: '2026-10-30', countingRule: 'online job offerings per quarter' },
    observations: dosmSnapshotObservations(table),
    originals: [],
    meta: {},
    ...extra,
  }
}

// The six topics' saved counts and the Computer Science reference as an openalex snapshot.
export function openalexSnapshotFromAnalysis(analysis) {
  const observations = []
  const sourceUrls = []
  for (const id of Object.keys(analysis.topics).sort()) {
    const t = analysis.topics[id]
    sourceUrls.push({ label: `OpenAlex works query, ${id}`, url: t.query })
    for (const year of Object.keys(t.counts).sort()) {
      observations.push({ entityType: 'ai_topic', entityId: id, period: year, metric: OPENALEX_METRIC, unit: OPENALEX_UNIT, value: t.counts[year], label: t.title })
    }
  }
  sourceUrls.push({ label: 'OpenAlex works query, Computer Science (field 17)', url: analysis.reference.cs_query })
  for (const year of Object.keys(analysis.reference.cs).sort()) {
    observations.push({ entityType: 'reference', entityId: OPENALEX_REFERENCE_ID, period: year, metric: OPENALEX_METRIC, unit: OPENALEX_UNIT, value: analysis.reference.cs[year], label: 'Computer Science' })
  }
  const years = observations.map((o) => o.period).sort()
  return {
    snapshotId: 'openalex-2026-10-30',
    sourceId: 'openalex',
    fetchedAt: analysis.fetchedAt,
    publishedAt: null,
    observationStart: years[0],
    observationEnd: years.at(-1),
    sourceUrls,
    classification: { system: 'OpenAlex topics', version: 'topics as read 2026-10-30', readAt: '2026-10-30', countingRule: 'primary_topic' },
    observations,
    originals: [],
    meta: {},
  }
}

let cached = null
// Real pipeline inputs: the bundled DOSM workbook, the saved OpenAlex counts and the bundled reference data.
export function realInputs() {
  cached ??= (async () => {
    const table = parseDosmJmi(await readFile('data/radar/source/dosm-jmi-2026q2.xlsx'))
    const analysis = JSON.parse(await readFile('docs/radar/index-analysis-openalex-2026-10-30.json', 'utf8'))
    const references = await loadRadarReferences('data')
    return {
      snapshots: { openalex: openalexSnapshotFromAnalysis(analysis), dosm: dosmSnapshotFromTable(table) },
      references,
      reviews: [],
      config: RADAR_CONFIG,
      manifestId: 'manifest-test-1',
    }
  })()
  return cached
}
