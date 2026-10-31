// Pathway API (Task 6, spec §8-§10): POST /api/pathway. Real app on port 0, fixture data dir (matching fixture plus the
// pathway files, tests/helpers/pathwayFixture.js), memory review store. The profile is used and dropped: never logged.
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { recordReview } from '../../server/radar/reviews.js'
import { createMatchingServiceFromEnv } from '../../server/matching/service.js'
import { createPathwayServiceFromEnv } from '../../server/pathway/service.js'
import { PathwayDataError, loadPathwayData, pickHash } from '../../server/pathway/data.js'
import { FIXTURE, fixtureReferences } from '../helpers/matchingFixture.js'
import { PATHWAY, PICKS, makePathwayFixture } from '../helpers/pathwayFixture.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
const bundleStore = createFileStore('data/radar/bundle')
const now = () => new Date('2026-10-31T00:00:00.000Z')
const ROLE_DETAILS = (dir) => JSON.parse(readFileSync(`${dir}/emasco/role_details.json`, 'utf8')).roles

function keysDeep(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      keysDeep(v, out)
    }
  }
  return out
}

const skill = (name, canonicalId, proficiency = null) => ({
  name, originalText: name, canonicalId, category: null, source: 'user_input', userConfirmed: true,
  proficiency, proficiencyStatus: proficiency ? 'self_reported' : 'not_assessed', extraction: null,
})
const profileWith = (skills, extra = {}) => ({ profileStatus: 'confirmed', education: { records: [] }, employment: { records: [] }, occupationMappings: [], skills, ...extra })
// Has kn:2.C.3.a at basic (a gap for 15-1243.00) and Reading Comprehension at good (met).
const FULL = profileWith([
  skill('Reading Comprehension', 'onet:el:2.A.1.a', 'good'),
  skill('Computers and Electronics', 'onet:kn:2.C.3.a', 'basic'),
  skill('MySQL', 'onet:tech:mysql'),
])
const THIN = profileWith([skill('MySQL', 'onet:tech:mysql'), skill('Teamwork', null)])

let references
let fixture
beforeAll(async () => {
  references = await loadRadarReferences('data')
  fixture = await makePathwayFixture()
})
afterAll(async () => {
  await fixture?.cleanup()
})

let server
let base
afterEach(async () => {
  vi.restoreAllMocks()
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

// The app as in production, with the fixture data dir for matching and pathway. pathwayStore replaces the review store
// the pathway reads (e.g. one that does not answer); log collects the pathway service's log lines.
async function start({ store = createMemoryStore(), pathwayStore, log = () => {}, dataDir = fixture.dir } = {}) {
  const radar = createRadarService({ store, bundleStore, references: async () => references, ingestor: null, now, log: () => {} })
  const radarAccess = createRadarAccess({ env: ENV, now })
  const matching = createMatchingServiceFromEnv({ dataDir, radar, demo: null, access: radarAccess, references: fixtureReferences, now, log: () => {} })
  const pathway = createPathwayServiceFromEnv({ dataDir, matching, store: pathwayStore !== undefined ? pathwayStore : store, now, log })
  server = createApp({ radar, radarAccess, radarDemo: null, matching, pathway, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  return { store, pathway }
}

async function post(route, body, { raw } = {}) {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers }
}

const decide = (store, pick, decision, i) => recordReview(store, {
  reviewId: `review-20261031T000000000Z-0000000${i}`, kind: 'pathway_pick', target: pick.id, decision, note: '', evidence: [],
  reviewer: 'Owner', reviewedAt: '2026-10-31T00:00:00.000Z', version: 1, appliesTo: { sourceId: 'pathway-picks', period: null, observationHash: pickHash(pick) },
})

describe('POST /api/pathway', () => {
  it('full role: steps from matching rows with the same points, courses and search links, study route and P14 qualification', async () => {
    await start()
    const r = await post('/api/pathway', { profile: FULL, code: FIXTURE.fullRole, lang: 'en' })
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const a = r.body
    expect(a).toMatchObject({ code: FIXTURE.fullRole, title: 'Fixture Database Designer', reason: null, onet: { code: FIXTURE.bestJob, title: 'Database Architects' } })
    expect(a.chain.missingStep).toBeNull()
    // the same numbers as matching by construction
    const role = (await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })).body
    expect(a.skillMatch).toBe(role.fit.percent)
    expect(a.steps.gaps[0].key).toBe('kn:2.C.3.a')
    expect(a.steps.gaps[0].points).toBe(role.fit.raise.find((x) => x.key === 'kn:2.C.3.a').points)
    expect(a.steps.met.map((s) => s.key)).toEqual(['el:2.A.1.a'])
    expect(a.steps.notAssessed).toEqual([])
    expect(a.provisional).toBe(false)
    // one course pick and a search link per searchable site (search word = the item name)
    expect(a.steps.gaps[0].courses.map((c) => [c.id, c.site, c.approvedAt])).toEqual([[PATHWAY.course, 'elatih', null]])
    expect(a.steps.gaps[0].search.map((s) => [s.site, s.url])).toEqual([
      ['elatih', 'https://elatih.hrdcorp.gov.my/courses?course=Computers%20and%20Electronics'],
      ['coursera', 'https://www.coursera.org/search?query=Computers%20and%20Electronics'],
    ])
    expect(a.steps.met[0].courses).toEqual([])
    // P14: eMASCO's qualification and page
    const fixtureRole = ROLE_DETAILS(fixture.dir).find((x) => x.code === FIXTURE.fullRole)
    expect(a.qualification).toEqual({ text: fixtureRole.qualification, url: fixtureRole.url })
    expect(a.qualification.text).toBe('Degree')
    // study route
    expect(a.route.education.top[0]).toMatchObject({ category: 6, percent: 55 })
    expect(a.route.education.all.map((e) => e.category)).toEqual([6, 7])
    expect(a.route.fields.map((f) => f.code)).toEqual(['0611', '0613'])
    const [f0611, f0613] = a.route.fields
    expect(f0611.partial).toBe(true)
    expect(f0611.programmes).toEqual([])
    expect(f0611.yours).toBe(false)
    expect(f0613.partial).toBe(false)
    expect(f0613.programmes.map((p) => [p.id, p.institution, p.mqrRef])).toEqual([[PATHWAY.accredited, 'Universiti Malaya', 'MQA/FA1234']])
    expect(f0613.professional.map((p) => [p.id, p.body])).toEqual([[PATHWAY.professional, 'MBOT']])
    expect(f0613.courses).toEqual([])
    expect(f0613.mqr).toEqual({ url: PATHWAY.mqrUrl, nec: '0613' })
    expect(f0613.search[1].url).toBe('https://www.coursera.org/search?query=Software%20and%20applications%20development%20and%20analysis')
    // sources: every source used, each with id, name, url, date and licence
    const ids = a.sources.map((s) => s.id)
    expect(ids).toEqual(['onet', 'bridge', 'emasco-qualification', 'isced-cip', 'cip-onet', 'pathway-picks', 'site:elatih', 'site:coursera'])
    for (const s of a.sources) expect(Object.keys(s).sort()).toEqual(['date', 'id', 'licence', 'name', 'url'])
    expect(a.sources[0]).toMatchObject({ name: 'O*NET Database 31.0', licence: 'CC BY 4.0', date: '2026-10-30' })
    expect(a.sources[3]).toMatchObject({ licence: 'Statistics Canada Open Licence', date: '2026-10-30' })
    expect(a.sources[6]).toMatchObject({ name: 'e-LATiH (HRD Corp)', date: '2026-10-31' })
  })

  it("the user's own field of study is marked yours", async () => {
    await start()
    const profile = { ...FULL, education: { records: [{ field: { code: '0613', title: 'Software' } }] } }
    const { body } = await post('/api/pathway', { profile, code: FIXTURE.fullRole })
    expect(body.route.fields.map((f) => [f.code, f.yours])).toEqual([['0611', false], ['0613', true]])
  })

  it('thin profile (no O*NET ids): the study route shows, steps null, reason no_known_skill', async () => {
    await start()
    const { status, body } = await post('/api/pathway', { profile: THIN, code: FIXTURE.fullRole })
    expect(status).toBe(200)
    // the O*NET job is the one matching shows first for the role (no Skill Match, so not chosen by fit)
    const role = (await post('/api/matching/role', { profile: THIN, code: FIXTURE.fullRole })).body
    expect(role.fit).toBeNull()
    expect(body.onet).toEqual({ code: role.jobs[0].code, title: role.jobs[0].title })
    expect(body.route.fields.map((f) => f.code)).toEqual(['0611', '0613'])
    expect(body.onet.code).toBe(FIXTURE.otherJob)
    // the fixture has no education rows for 15-1242.00: "O*NET has no education data for this job"
    expect(body.route.education).toBeNull()
    expect(body.steps).toBeNull()
    expect(body.skillMatch).toBeNull()
    expect(body.reason).toBe('no_known_skill')
  })

  it('broken chain: missing step, no route, no steps, but the eMASCO qualification (P14)', async () => {
    await start()
    const { status, body } = await post('/api/pathway', { profile: FULL, code: FIXTURE.brokenRole })
    expect(status).toBe(200)
    expect(body.chain.missingStep).toMatchObject({ id: 'soc2010_to_isco08' })
    expect(body.reason).toBe('chain_broken')
    expect(body.route).toBeNull()
    expect(body.steps).toBeNull()
    expect(body.onet).toBeNull()
    expect(body.qualification).toEqual({ text: null, url: 'https://emasco.mohr.gov.my/masco/2512-01' })
  })

  it('unknown code -> 404 not_found; a non-string or too long code -> 400 bad_request, in the app error shape', async () => {
    await start()
    const unknown = await post('/api/pathway', { profile: FULL, code: '0000-00' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ error: { code: 'not_found', message: 'No such role in the current data.', retryable: false } })
    for (const code of [25, null, 'x'.repeat(33)]) {
      const r = await post('/api/pathway', { profile: FULL, code })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: { code: 'bad_request', message: 'The request is not valid.', retryable: false } })
    }
    expect((await post('/api/pathway', { profile: { skills: 'x' }, code: FIXTURE.fullRole })).status).toBe(400)
    expect((await post('/api/pathway', null, { raw: '{' })).status).toBe(400)
    expect((await post('/api/pathway', null, { raw: JSON.stringify({ profile: { skills: [], pad: 'x'.repeat(70000) }, code: FIXTURE.fullRole }) })).status).toBe(400)
  })

  it('the profile is never logged (console and the log option), also when a log line is written', async () => {
    const lines = []
    const failing = { list: async () => { throw Object.assign(new Error('down'), { code: 'store_down' }) }, get: async () => null }
    await start({ pathwayStore: failing, log: (m) => lines.push(m) })
    const marker = 'MARKER-5b1e-never-log-me'
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m))
    const profile = profileWith([...FULL.skills, skill(marker, `onet:el:${marker}`, 'good'), skill(`${marker}-2`, null)], {
      education: { records: [{ field: { code: marker, title: marker } }] },
    })
    expect((await post('/api/pathway', { profile, code: FIXTURE.fullRole })).status).toBe(200)
    expect((await post('/api/pathway', { profile, code: '0000-00' })).status).toBe(404)
    expect((await post('/api/pathway', { profile: { ...profile, skills: marker }, code: FIXTURE.fullRole })).status).toBe(400)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).not.toContain(marker)
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call.map(String))).not.toContain(marker)
  })

  it('no forbidden keys in the answer', async () => {
    await start()
    for (const code of [FIXTURE.fullRole, FIXTURE.brokenRole]) {
      const { body } = await post('/api/pathway', { profile: FULL, code })
      expect(keysDeep(body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
    }
  })

  it('review store throws: picks still shown, all approvedAt null; the log line has the error code only', async () => {
    const lines = []
    const failing = { list: async () => { throw Object.assign(new Error('secret detail'), { code: 'store_down' }) }, get: async () => null }
    await start({ pathwayStore: failing, log: (m) => lines.push(m) })
    const { status, body } = await post('/api/pathway', { profile: FULL, code: FIXTURE.fullRole })
    expect(status).toBe(200)
    const f0613 = body.route.fields.find((f) => f.code === '0613')
    const shown = [...body.steps.gaps[0].courses, ...f0613.programmes, ...f0613.professional]
    expect(shown.map((p) => p.id).sort()).toEqual([PATHWAY.course, PATHWAY.professional, PATHWAY.accredited].sort())
    expect(shown.every((p) => p.approvedAt === null)).toBe(true)
    expect(lines).toEqual(['[pathway] reviews unavailable: store_down'])
  })

  it('a rejected pick is hidden; an approved one carries the date', async () => {
    const store = createMemoryStore()
    const data = await loadPathwayData(fixture.dir)
    const pick = (id) => data.picks.find((p) => p.id === id)
    await decide(store, pick(PATHWAY.course), 'rejected', 1)
    await decide(store, pick(PATHWAY.accredited), 'approved', 2)
    await start({ store })
    const { body } = await post('/api/pathway', { profile: FULL, code: FIXTURE.fullRole })
    expect(body.steps.gaps[0].courses).toEqual([])
    const f0613 = body.route.fields.find((f) => f.code === '0613')
    expect(f0613.programmes.map((p) => [p.id, p.approvedAt])).toEqual([[PATHWAY.accredited, '2026-10-31T00:00:00.000Z']])
    expect(f0613.professional.map((p) => [p.id, p.approvedAt])).toEqual([[PATHWAY.professional, null]])
  })

  it('a pick decision made on other text does not count (pickHash covers the pick content)', async () => {
    const store = createMemoryStore()
    const data = await loadPathwayData(fixture.dir)
    const course = data.picks.find((p) => p.id === PATHWAY.course)
    await decide(store, { ...course, name: 'Another name' }, 'rejected', 1)
    await start({ store })
    const { body } = await post('/api/pathway', { profile: FULL, code: FIXTURE.fullRole })
    expect(body.steps.gaps[0].courses.map((c) => c.id)).toEqual([PATHWAY.course])
  })
})

describe('loadPathwayData', () => {
  it('loads the fixture: qualifications, education rows, route index, sites, flat picks with hashes, item keys and fields', async () => {
    const data = await loadPathwayData(fixture.dir)
    expect(data.qualifications.get(FIXTURE.fullRole)).toBe('Degree')
    expect(data.qualifications.get(FIXTURE.brokenRole)).toBeNull()
    expect(data.education).toHaveLength(2)
    expect(data.sites.map((s) => s.id)).toEqual(['elatih', 'coursera'])
    expect(data.picks.map((p) => [p.id, p.type, p.for])).toEqual([
      [PATHWAY.course, 'course', 'kn:2.C.3.a'],
      [PATHWAY.accredited, 'programme', 'field:0613'],
      [PATHWAY.professional, 'programme', 'field:0613'],
    ])
    expect(data.picks.every((p) => p.hash === pickHash(p))).toBe(true)
    expect(data.itemKeys.has('kn:2.C.3.a')).toBe(true)
    expect(data.itemKeys.has('el:2.A.2.a')).toBe(true)
    expect([...data.fieldCodes]).toEqual(['0611', '0613'])
  })

  it('pickHash: SHA-256 of the pick content, missing fields as null', () => {
    const a = pickHash({ id: 'x', type: 'course', for: 'kn:1', site: 's', name: 'N', link: 'https://a', checkedAt: '2026-10-31' })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(pickHash({ id: 'x', type: 'course', for: 'kn:1', site: 's', name: 'N', link: 'https://a', checkedAt: '2026-01-01' })).toBe(a)
    expect(pickHash({ id: 'x', type: 'course', for: 'kn:1', site: 's', name: 'N2', link: 'https://a' })).not.toBe(a)
    expect(pickHash({ id: 'p', type: 'programme', for: 'field:1', kind: 'accredited', mqrRef: 'A' })).not.toBe(pickHash({ id: 'p', type: 'programme', for: 'field:1', kind: 'accredited', mqrRef: 'B' }))
  })

  it('a picks file with an unknown for -> PathwayDataError naming the pick id', async () => {
    const bad = await makePathwayFixture({ picks: { ...PICKS, courses: [{ ...PICKS.courses[0], id: 'c-bad-for', for: 'kn:9.9.9' }] } })
    try {
      const error = await loadPathwayData(bad.dir).catch((e) => e)
      expect(error).toBeInstanceOf(PathwayDataError)
      expect(error.file).toBe('pathway/picks.json')
      expect(error.message).toContain('c-bad-for')
    } finally {
      await bad.cleanup()
    }
  })

  it('a changed file -> PathwayDataError naming it; the API answers 503 data_unavailable with no path', async () => {
    const bad = await makePathwayFixture()
    try {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(`${bad.dir}/onet/education.tsv`, 'code\tcategory\tlabel\tpercent\tsuppress\n')
      const error = await loadPathwayData(bad.dir).catch((e) => e)
      expect(error).toBeInstanceOf(PathwayDataError)
      expect(error.file).toBe('onet/education.tsv')
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      await start({ dataDir: bad.dir })
      const r = await post('/api/pathway', { profile: FULL, code: FIXTURE.fullRole })
      expect(r.status).toBe(503)
      expect(r.body.error).toMatchObject({ code: 'data_unavailable', retryable: true })
      expect(JSON.stringify(r.body)).not.toContain(bad.dir)
      expect(errors.mock.calls.map((c) => c.join(' '))).toEqual(['[pathway] data unavailable: onet/education.tsv'])
    } finally {
      await bad.cleanup()
    }
  })
})
