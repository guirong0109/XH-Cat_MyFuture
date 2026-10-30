import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseHotTechPage, createOnetHotTechSource, HOT_TECH_URL } from '../../server/radar/sources/onetHotTech.js'
import { hotTechSignals } from '../../shared/radar/onetSkills.js'
import { validateSignal } from '../../shared/radar/contract.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { canonicalContent } from '../../shared/radar/snapshot.js'

const html = readFileSync(fileURLToPath(new URL('../fixtures/onet-hottech-2025.html', import.meta.url)), 'utf8')
const now = () => new Date('2026-10-30T00:00:00.000Z')
const okFetch = (body) => async () => ({ ok: true, status: 200, text: async () => body, arrayBuffer: async () => Buffer.from(body) })

describe('parseHotTechPage', () => {
  it('parses the saved page', () => {
    const p = parseHotTechPage(html)
    expect(p.rows).toHaveLength(176)
    expect(p.rows.find((r) => r.technology === 'Python').postings).toBe(814960)
    expect(p.total).toBe(46885153)
    expect(p.window).toEqual({ label: '1/25–12/25', year: '2025' })
  })
  it('table removed -> hottech_layout', () => {
    const bad = html.replace(/<table[\s\S]*?<\/table>/, '')
    expect(() => parseHotTechPage(bad)).toThrow(expect.objectContaining({ code: 'hottech_layout' }))
  })
  it('count with letters -> hottech_layout', () => {
    const bad = html.replace('>3,421,542<', '>3,42x,542<')
    expect(() => parseHotTechPage(bad)).toThrow(expect.objectContaining({ code: 'hottech_layout' }))
  })
  it('missing total line -> hottech_layout', () => {
    const bad = html.replace(/total postings between/, 'postings during')
    expect(() => parseHotTechPage(bad)).toThrow(expect.objectContaining({ code: 'hottech_layout' }))
  })
})

describe('createOnetHotTechSource', () => {
  it('builds a valid snapshot and keeps the original hash', async () => {
    const seen = []
    const src = createOnetHotTechSource({ fetchImpl: async (u, o) => { seen.push([u, o]); return okFetch(html)() }, now })
    const { snapshot, original } = await src.fetchSnapshot()
    expect(seen[0][0]).toBe(HOT_TECH_URL)
    expect(seen[0][1].headers['User-Agent']).toContain('Mozilla/5.0')
    const sha = createHash('sha256').update(Buffer.from(html)).digest('hex')
    expect(original.sha256).toBe(sha)
    expect(snapshot.sourceId).toBe('onet-hottech')
    expect(snapshot.snapshotId).toBe(`onet-hottech-2025-${sha.slice(0, 8)}`)
    expect(snapshot.originals).toEqual([{ sha256: sha, url: HOT_TECH_URL }])
    expect(snapshot.observations).toHaveLength(177)
    expect(snapshot.observations.find((o) => o.entityId === '__total__')).toMatchObject({ entityType: 'skill_postings', period: '2025', metric: 'postings', unit: 'postings', value: 46885153 })
    expect(validateSnapshot(snapshot).ok).toBe(true)
  })
  it('re-parsing gives identical canonical content', async () => {
    const a = await createOnetHotTechSource({ fetchImpl: okFetch(html), now }).fetchSnapshot()
    const b = await createOnetHotTechSource({ fetchImpl: okFetch(html), now: () => new Date('2027-01-01T00:00:00Z') }).fetchSnapshot()
    expect(canonicalContent(a.snapshot)).toBe(canonicalContent(b.snapshot))
  })
  it('http failure -> source_unavailable', async () => {
    const src = createOnetHotTechSource({ fetchImpl: async () => ({ ok: false, status: 503 }), now })
    await expect(src.fetchSnapshot()).rejects.toMatchObject({ code: 'source_unavailable', retryable: true })
  })
})

describe('hotTechSignals', () => {
  it('one valid first_snapshot signal per technology', async () => {
    const { snapshot } = await createOnetHotTechSource({ fetchImpl: okFetch(html), now }).fetchSnapshot()
    const signals = hotTechSignals(snapshot, { manifestId: 'm1', config: { version: 'c1' } })
    expect(signals).toHaveLength(176)
    expect(signals.some((s) => s.signalId.includes('__total__'))).toBe(false)
    const py = signals.find((s) => s.signalId === 'onet:postings:Python')
    expect(validateSignal(py)).toEqual({ ok: true, errors: [] })
    expect(py).toMatchObject({
      evidenceKind: 'skill_posting_flag', metric: 'postings', unit: 'postings', direction: null,
      evidenceSufficiency: 'insufficient_evidence', evidenceQuality: null,
      reasons: ['first_snapshot', 'us_postings'], mappingVersion: 'onet-hottech/2025', methodVersion: 'onet-postings-v1',
      baseline: { period: '2025', value: 814960 }, recent: { period: '2025', value: 814960 },
      change: { value: null, unit: 'postings', relativePercent: null },
      granularity: { level: 'skill' },
    })
    expect(py.entity).toMatchObject({ type: 'skill', system: 'O*NET Hot Technologies', code: 'Python', name: 'Python', sourceUrl: HOT_TECH_URL })
    expect(py.evidenceLinks).toEqual([{ label: 'O*NET Hot Technologies', url: HOT_TECH_URL }])
  })
})
