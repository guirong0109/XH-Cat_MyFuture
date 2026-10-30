// Public skills API and export reference lists (skill-trends spec §5, §6).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { createRadarService } from '../../server/radar/service.js'
import { FORBIDDEN_KEY_PATTERN } from '../../shared/radar/contract.js'
import { load } from '../../public/js/radarApi.js'

const bundleStore = createFileStore('data/radar/bundle')
let references
beforeAll(async () => {
  references = await loadRadarReferences('data')
})
let server
let base
async function start(radar) {
  server = createApp({ radar, d1: null, tempStore: null, llmProviders: [], onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
}
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})
const get = async (route) => {
  const response = await fetch(`${base}${route}`)
  return { status: response.status, body: await response.json() }
}
const service = () => createRadarService({ store: null, bundleStore, references: async () => references, ingestor: null, now: () => new Date('2026-10-31T00:00:00Z') })
const keysOf = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) out.push(k), keysOf(x, out)
  return out
}

describe('GET /api/radar/skills', () => {
  it('lists changes per job with skill ids, hot changes and the postings table', async () => {
    await start(service())
    const { status, body } = await get('/api/radar/skills')
    expect(status).toBe(200)
    expect(body.state).toBe('data')
    expect(body.release).toMatchObject({ latest: '31.0', current: { id: '30.3', month: '2026-05' }, previous: { id: '30.2', month: '2026-02' } })
    expect(body.release.current.releases).toEqual(['30.3', '31.0'])
    const go = body.changes['15-1252.00'].added.find((i) => i.example === 'Go')
    expect(go).toMatchObject({ skillId: 'onet:tech:go', signalId: 'onet:indemand:15-1252.00:Go' })
    expect(go.elementName).toBeTruthy()
    expect(body.changes['15-1252.00'].kept.length).toBeGreaterThan(0)
    // every job entry carries its O*NET title from the catalogue (data/onet/occupations.tsv)
    expect(body.changes['15-1252.00'].title).toBe('Software Developers')
    expect(body.changes['13-2011.00'].title).toBe('Accountants and Auditors')
    expect(Object.values(body.changes).filter((c) => !c.title)).toEqual([])
    expect(body.changes['15-1252.00'].kept[0].signalId).toBeUndefined()
    expect(body.hot.added.map((i) => i.example)).toContain('Prometheus')
    expect(body.hot.added[0].signalId).toMatch(/^onet:hot:/)
    expect(body.postings.window.year).toBe('2025')
    expect(body.postings.total).toBeGreaterThan(0)
    // one counting window: the posting signals carry first_snapshot and no direction
    expect(body.postings.firstSnapshot).toBe(true)
    expect(body.postings.rows).toHaveLength(176)
    expect(body.postings.rows.some((r) => r.technology === '__total__')).toBe(false)
    const counts = body.postings.rows.map((r) => r.postings)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(body.labels).toEqual({ usPostings: true, softwareOnly: true })
    expect(body.sourceLinks.map((l) => l.url)).toEqual(expect.arrayContaining(['https://www.onetcenter.org/database.html', 'https://www.onetonline.org/search/hot_tech/']))
    expect(body.manifestId).toBeTruthy()
    expect(keysOf(body).filter((k) => FORBIDDEN_KEY_PATTERN.test(k))).toEqual([])
  })

  it('every added/dropped item has a signal that the signals route serves, even with spaces in the id', async () => {
    await start(service())
    const { body } = await get('/api/radar/skills')
    const id = 'onet:indemand:15-1252.00:Microsoft .NET Framework'
    expect(body.changes['15-1252.00'].dropped.some((i) => i.signalId === id)).toBe(true)
    const r = await get(`/api/radar/signals/${encodeURIComponent(id)}`)
    expect(r.status).toBe(200)
  })

  it('serves ids with +, # and / when URL-encoded', async () => {
    await start(service())
    for (const id of ['onet:indemand:15-1254.00:C++', 'onet:indemand:15-1299.07:C#', 'onet:postings:C#', 'onet:postings:Oracle PL/SQL']) {
      const r = await get(`/api/radar/signals/${encodeURIComponent(id)}`)
      expect(r.status, id).toBe(200)
      expect(r.body.signalId ?? r.body.signal?.signalId, id).toBe(id)
    }
  })

  it('the onet-skills source registry names no release; the release comes from the snapshot', async () => {
    await start(service())
    const { body } = await get('/api/radar/sources')
    const src = body.sources.find((x) => x.sourceId === 'onet-skills')
    expect(src.links.map((l) => l.label).join(' ')).not.toMatch(/\d+\.\d/)
    expect(src.links.map((l) => l.url).join(' ')).not.toMatch(/db_\d/)
    expect(src.version).toBeTruthy()
    expect(src.evidenceLinks.length).toBeGreaterThan(0)
  })

  it('answers 409 manifest_gone for an unknown manifest', async () => {
    await start(service())
    const r = await get('/api/radar/skills?manifest=manifest-nope')
    expect(r.status).toBe(409)
    expect(r.body.error?.code ?? r.body.code).toBe('manifest_gone')
  })

  it('without O*NET snapshots: release null, empty lists, still 200', async () => {
    const radar = service()
    const bare = { ...radar, answer: async (id) => {
      const a = await radar.answer(id)
      const { onetSkills, ...rest } = a.view.signals
      return { ...a, view: { ...a.view, snapshots: { ...a.view.snapshots, 'onet-skills': null, 'onet-hottech': null }, signals: rest } }
    } }
    await start(bare)
    const { status, body } = await get('/api/radar/skills')
    expect(status).toBe(200)
    expect(body.state).toBe('unavailable')
    expect(body.release).toBeNull()
    expect(body.changes).toEqual({})
    expect(body.hot).toEqual({ added: [], dropped: [] })
    expect(body.postings).toBeNull()
    expect((await get('/api/radar/export')).body.references.onetSkills).toMatchObject({ release: null, comparedWith: null, inDemand: {}, hot: [] })
  })
})

describe('export references.onetSkills', () => {
  it('carries the release, the earlier release compared, and the still-in-demand lists', async () => {
    await start(service())
    const { body } = await get('/api/radar/export')
    const o = body.references.onetSkills
    expect(o.comparedWith).toBe('30.2')
    expect(o.release).toBe('31.0')
    expect(o.inDemand['15-1252.00']).toContain('Apache Kafka')
    expect(o.inDemand['15-1252.00']).not.toContain('Go')
    expect(o.hot).toContain('Prometheus')
    expect(keysOf(o).filter((k) => FORBIDDEN_KEY_PATTERN.test(k))).toEqual([])
  })
})

describe('radarApi.load', () => {
  it('returns skills with the same manifest id', async () => {
    await start(service())
    const out = await load(undefined, { base })
    expect(out.ok).toBe(true)
    expect(out.data.skills.manifestId).toBe(out.data.manifestId)
    expect(out.data.skills.release.latest).toBe('31.0')
  })
})
