import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createOpenAlexSource } from '../../server/radar/sources/openalex.js'
import { createDosmSource } from '../../server/radar/sources/dosm.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { runPipeline } from '../../shared/radar/pipeline.js'
import { validateSignal } from '../../shared/radar/contract.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { RELEASE_BASE, DATA_URL, RELEASE_PAGE } from '../helpers/dosmPages.js'

const NOW = () => new Date('2026-10-30T10:00:00Z')
const XLSX = await readFile('data/radar/source/dosm-jmi-2026q2.xlsx')
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PAGE_Q2 = `${RELEASE_BASE}22026`
const RELEASE = { quarter: '2026 Q2', title: 'Big Data Analytics: Job Market Insights, Second Quarter of 2026', publishedAt: '2026-08-18', pageUrl: PAGE_Q2 }

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

// Topic series grow faster than the Computer Science reference, so every share momentum can be computed.
function openalexFetch() {
  return async (url) => {
    const u = String(url)
    if (u.includes('/topics/')) return json({ updated_date: '2026-09-15T01:02:03.000000' })
    const reference = u.includes('primary_topic.field.id')
    const group_by = []
    for (let y = 2015; y <= 2025; y++) group_by.push({ key: String(y), count: reference ? 100000 + (y - 2015) * 1000 : 100 * 1.4 ** (y - 2015) | 0 })
    return json({ group_by })
  }
}

describe('source snapshots into the pipeline', () => {
  it('real adapter output runs through runPipeline into valid signals with links and share momentum', async () => {
    const references = await loadRadarReferences('data')
    const openalex = await createOpenAlexSource({ fetchImpl: openalexFetch(), now: NOW }).fetchSnapshot(references.topics)

    const html = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
    const routes = { [PAGE_Q2]: html(RELEASE_PAGE), [DATA_URL]: new Response(XLSX, { status: 200, headers: { 'Content-Type': XLSX_TYPE } }) }
    const fetchImpl = async (url) => routes[String(url)] ?? html('nope')
    const { snapshot: dosm } = await createDosmSource({ fetchImpl, now: NOW }).fetchSnapshot({ ...RELEASE, listingTitle: RELEASE.title })

    for (const l of [...openalex.sourceUrls, ...dosm.sourceUrls]) {
      expect(typeof l.label).toBe('string')
      expect(typeof l.url).toBe('string')
    }

    const { signals } = runPipeline({ snapshots: { openalex, dosm }, references, reviews: [], config: RADAR_CONFIG, manifestId: 'manifest-test-1' })
    expect(signals.length).toBeGreaterThan(0)
    for (const s of signals) expect(validateSignal(s), s.signalId).toMatchObject({ ok: true })

    const dosmSignals = signals.filter((s) => s.signalId.startsWith('dosm:'))
    expect(dosmSignals.length).toBeGreaterThan(0)
    for (const s of dosmSignals) {
      const urls = s.evidenceLinks.map((l) => l.url)
      expect(urls).toContain(PAGE_Q2)
      expect(urls).toContain(DATA_URL)
    }

    const topicSignals = signals.filter((s) => s.granularity.level === 'topic')
    expect(topicSignals.length).toBe(references.topics.length)
    for (const s of topicSignals) expect(s.shareMomentum.value, s.signalId).not.toBeNull()
  })
})
