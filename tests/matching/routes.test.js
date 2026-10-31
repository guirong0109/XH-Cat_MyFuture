// Matching API (Task 13, spec §6-§9): POST /api/matching and /api/matching/role. Real app on port 0, fixture data dir
// with a built bridge (tests/helpers/matchingFixture.js), the bundled Radar manifest, and a memory store + demo service
// for the judge Trend Change Test. The profile is used and dropped: never stored, never logged.
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { createDemoService, DemoError } from '../../server/radar/demo.js'
import { recordReview } from '../../server/radar/reviews.js'
import { linkHash } from '../../server/matching/adminRoutes.js'
import { SDG_TTL_MS, createMatchingServiceFromEnv } from '../../server/matching/service.js'
import { MatchingDataError, loadMatchingData } from '../../server/matching/data.js'
import { FIXTURE, SDG_LINKS, fixtureReferences, makeMatchingFixture } from '../helpers/matchingFixture.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
const bundleStore = createFileStore('data/radar/bundle')
const BASE = JSON.parse(readFileSync('data/radar/demo/base.json', 'utf8'))
const now = () => new Date('2026-10-31T00:00:00.000Z')

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
const profileWith = (skills, extra = {}) => ({
  profileStatus: 'confirmed',
  education: { records: [] },
  employment: { records: [] },
  occupationMappings: [],
  skills,
  ...extra,
})
// Meets 5 of 7 levels for 15-1243.00 (71%) and 6 of 15 for 15-1242.00 (40%).
const FULL = profileWith([
  skill('Reading Comprehension', 'onet:el:2.A.1.a', 'good'),
  skill('Computers and Electronics', 'onet:kn:2.C.3.a', 'basic'),
  skill('MySQL', 'onet:tech:mysql'),
])

let references
let fixture
beforeAll(async () => {
  references = await loadRadarReferences('data')
  fixture = await makeMatchingFixture()
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

// The app as in production, with the fixture data dir for matching only. radarOverride replaces the Radar service
// (e.g. one whose store does not answer); demoOverride replaces the judge demo service.
async function start({ store = createMemoryStore(), radarOverride = null, demoOverride, dataDir = fixture.dir, appDataDir = undefined, log = () => {} } = {}) {
  const radar = radarOverride ?? createRadarService({ store, bundleStore, references: async () => references, ingestor: null, now, log: () => {} })
  const radarAccess = createRadarAccess({ env: ENV, now })
  const demo = demoOverride !== undefined ? demoOverride : createDemoService({ store, base: BASE, references: async () => references, now })
  const matching = createMatchingServiceFromEnv({ dataDir, radar, demo, access: radarAccess, references: fixtureReferences, now, log })
  server = createApp({ ...(appDataDir ? { dataDir: appDataDir } : {}), radar, radarAccess, radarDemo: demo, matching, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  return { store, radar, demo }
}

async function post(route, body, { session, raw } = {}) {
  const headers = { origin: base, 'content-type': 'application/json' }
  if (session) {
    headers.cookie = `fr_radar=${session.cookie}`
    headers['x-radar-csrf'] = session.csrf
  }
  const response = await fetch(`${base}${route}`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function login(role = 'demo') {
  const response = await fetch(`${base}/api/radar/session`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ role, key: role === 'admin' ? ENV.RADAR_ADMIN_KEY : ENV.RADAR_DEMO_KEY }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return { cookie: response.headers.get('set-cookie').split(';')[0].slice('fr_radar='.length), csrf: body.csrf }
}

const roleOf = (answer, code) => answer.roles.find((r) => r.code === code)

describe('loadMatchingData', () => {
  it('loads the fixture: roles with a title, O*NET jobs with items, tasks, AI data, SDG files and sources', async () => {
    const data = await loadMatchingData(fixture.dir)
    expect(data.roles.map((r) => r.code)).toEqual([FIXTURE.brokenRole, FIXTURE.fullRole, FIXTURE.noIscoRole])
    expect(data.jobs.get(FIXTURE.bestJob).items.map((i) => i.key)).toEqual(['el:2.A.1.a', 'kn:2.C.3.a'])
    expect(data.jobs.get(FIXTURE.bestJob).software).toEqual(['MySQL', 'Oracle Database', 'Python'])
    expect(data.tasksByJob.get(FIXTURE.bestJob)).toEqual(['201', '202', '203'])
    expect(data.aeiByTask.get('201')).toEqual({ usage: 2, automation: 30, augmentation: 70 })
    expect(data.ilo.get('2521')).toMatchObject({ gradient: 'G1', mean: 0.45, sd: 0.12 })
    expect(data.chain.resolve(FIXTURE.fullRole).jobs).toEqual([FIXTURE.otherJob, FIXTURE.bestJob])
    expect(data.sdg.links).toHaveLength(SDG_LINKS.length)
    expect(data.sources.map((s) => s.id)).toEqual(expect.arrayContaining(['emasco', 'onet', 'aei', 'ilo', 'bridge', 'sdg-targets', 'sdg-links']))
  })

  it('a file that does not match its manifest -> MatchingDataError naming the file', async () => {
    const bad = await makeMatchingFixture({ keepManifest: true, edit: (files) => { files['onet/requirements.tsv'] += 'el\t1\tx\t15-1243.00\t4\t4\tN\tN\n' } })
    try {
      await expect(loadMatchingData(bad.dir)).rejects.toMatchObject({ name: 'MatchingDataError', file: 'onet/requirements.tsv' })
    } finally {
      await bad.cleanup()
    }
  })

  it('a malformed JSON file -> MatchingDataError naming the file', async () => {
    const bad = await makeMatchingFixture({ edit: (files) => { files['sdg/links.json'] = '{"links": [' } })
    try {
      const error = await loadMatchingData(bad.dir).catch((e) => e)
      expect(error).toBeInstanceOf(MatchingDataError)
      expect(error.file).toBe('sdg/links.json')
    } finally {
      await bad.cleanup()
    }
  })

  it('real data: 1812 roles listed, the 2 unparsed stubs left out; with the BLS files saved most roles reach O*NET', async () => {
    const data = await loadMatchingData('data')
    expect(data.roles).toHaveLength(1812)
    expect(data.roles.every((r) => typeof r.title === 'string')).toBe(true)
    const chains = data.roles.map((r) => data.chain.resolve(r.code))
    expect(chains.filter((c) => c.missingStep === null).length).toBeGreaterThan(1000)
    expect(data.chain.resolve('2512-01')).toMatchObject({ isco: '2512', missingStep: null })
    expect(data.chain.resolve('2512-01').jobs).toContain('15-1252.00')
    // a Malaysian-only unit code (1121; ISCO-08 has 1120) stops at the same-code step, never guessed (M15)
    expect(data.chain.resolve('1121-01').missingStep).toMatchObject({ id: 'masco2020_unit_to_isco08', kind: 'no_row' })
  })
})

describe('POST /api/matching', () => {
  it('thin profile -> usable false and no percent', async () => {
    await start()
    const thin = profileWith([skill('MySQL', 'onet:tech:mysql'), skill('Teamwork', null)])
    const { status, body } = await post('/api/matching', { profile: thin })
    expect(status).toBe(200)
    expect(body.profile.usable).toBe(false)
    expect(body.roles.every((r) => r.skillMatch === null)).toBe(true)
  })

  it('a usable profile: Skill Match from the best O*NET job; a broken chain says which step is missing', async () => {
    await start()
    const { status, body } = await post('/api/matching', { profile: FULL })
    expect(status).toBe(200)
    expect(body.profile).toMatchObject({ usable: true, provisional: false })
    expect(body.roles.map((r) => r.code).sort()).toEqual([FIXTURE.brokenRole, FIXTURE.fullRole, FIXTURE.noIscoRole])
    const full = roleOf(body, FIXTURE.fullRole)
    expect(full.skillMatch).toEqual({ percent: 71, met: 5, needed: 7, provisional: false, onetCode: FIXTURE.bestJob, onetTitle: 'Database Architects' })
    expect(full.unavailable).toBeNull()
    expect(full.url).toBe('https://emasco.mohr.gov.my/masco/2521-03')
    const broken = roleOf(body, FIXTURE.brokenRole)
    expect(broken.skillMatch).toBeNull()
    expect(broken.unavailable.missingStep).toMatchObject({ id: 'soc2010_to_isco08' })
    expect(roleOf(body, FIXTURE.noIscoRole).unavailable.missingStep).toMatchObject({ id: 'masco2020_unit_to_isco08' })
    expect(body.sources.length).toBeGreaterThan(0)
    expect(body.sources.every((s) => s.id && s.name && (s.url || s.urls))).toBe(true)
  })

  it('not assessed yet counts as meeting the level and marks the match provisional', async () => {
    await start()
    const { body } = await post('/api/matching', { profile: profileWith([skill('Reading Comprehension', 'onet:el:2.A.1.a')]) })
    expect(body.profile.provisional).toBe(true)
    expect(roleOf(body, FIXTURE.fullRole).skillMatch).toMatchObject({ provisional: true, percent: 43, onetCode: FIXTURE.bestJob })
  })

  it('in your field: from the field of study, a past job (eMASCO code) and a chosen O*NET job', async () => {
    await start()
    const profile = profileWith(FULL.skills, {
      education: { records: [{ field: { code: '0613', title: 'Software and applications development and analysis' } }] },
      employment: { records: [{ jobTitle: 'Developer', occupation: { source: 'emasco', code: FIXTURE.brokenRole, title: 'x' } }] },
      occupationMappings: [{ term: 'db', kind: 'interest', chosen: { source: 'onet', code: FIXTURE.otherJob, title: 'Database Administrators' } }],
    })
    const { body } = await post('/api/matching', { profile })
    const full = roleOf(body, FIXTURE.fullRole)
    expect(full.inField).toBe(true)
    expect(full.inFieldVia).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'field', code: '0613', onetCode: FIXTURE.bestJob }),
      expect.objectContaining({ kind: 'interest', source: 'onet', code: FIXTURE.otherJob }),
    ]))
    const broken = roleOf(body, FIXTURE.brokenRole)
    expect(broken.inField).toBe(true)
    expect(broken.inFieldVia).toEqual([expect.objectContaining({ kind: 'job', source: 'emasco', code: FIXTURE.brokenRole })])
    expect(roleOf(body, FIXTURE.noIscoRole)).toMatchObject({ inField: false, inFieldVia: [] })
  })

  it('Review Focus 1: a skill with no canonicalId or an id in no job -> unusedIds, never an error, never counted', async () => {
    await start()
    const profile = profileWith([...FULL.skills, skill('Teamwork', null), skill('Made-up', 'onet:el:9.9.9', 'expert')])
    const { status, body } = await post('/api/matching', { profile })
    expect(status).toBe(200)
    expect(body.profile.unusedIds).toEqual(expect.arrayContaining([
      { id: null, name: 'Teamwork', reason: 'no_id' },
      { id: 'onet:el:9.9.9', name: 'Made-up', reason: 'not_in_requirements' },
      { id: 'onet:tech:mysql', name: 'MySQL', reason: 'not_in_percent' },
    ]))
    expect(roleOf(body, FIXTURE.fullRole).skillMatch.percent).toBe(71)
  })

  it('bands per scenario from the DOSM group and the AI part; the job-ads part is group level', async () => {
    await start()
    const { body } = await post('/api/matching', { profile: FULL })
    expect(body.radar).toMatchObject({ state: 'data', judgeSession: false })
    expect(body.radar.manifestId).toMatch(/^manifest-/)
    // Bundled DOSM signals are insufficient: no band 1 or 3; Rapid G3 -> band 2; no AI data -> band 4.
    expect(roleOf(body, FIXTURE.fullRole).bands).toEqual({ moderate: 4, rapid: 4 })
    expect(roleOf(body, FIXTURE.brokenRole).bands).toEqual({ moderate: 4, rapid: 2 })
    expect(roleOf(body, FIXTURE.noIscoRole).bands).toEqual({ moderate: 4, rapid: 4 })
  })

  it('SDG goals (M16): every team-draft link of the role group is shown; approved ones carry the date; rejected ones are hidden', async () => {
    const { store } = await start()
    const decide = (link, decision, i) => recordReview(store, {
      reviewId: `review-20261031T000000000Z-0000000${i}`, kind: 'sdg_link', target: link.id, decision, note: '', evidence: [],
      reviewer: 'Owner', reviewedAt: '2026-10-31T00:00:00.000Z', version: 1, appliesTo: { sourceId: 'sdg-links', period: null, observationHash: linkHash(link) },
    })
    const first = (await post('/api/matching', { profile: FULL })).body
    expect(roleOf(first, FIXTURE.fullRole).sdgGoals).toEqual([8, 9])
    expect(roleOf(first, FIXTURE.fullRole).sdgReviewed).toEqual({})
    expect(roleOf(first, FIXTURE.noIscoRole).sdgGoals).toEqual([])
    const detail = (await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })).body
    expect(detail.sdg.tags.map((t) => [t.target, t.approvedAt]).sort()).toEqual([['8.2', null], ['9.c', null]])
    expect(detail.sdg.pathPreview.total).toBe(3)
    await decide(SDG_LINKS[0], 'approved', 1)
    await decide(SDG_LINKS[1], 'rejected', 2)
    // a new service would read the decisions at once; this one waits for the cache time, so use a fresh server
    await new Promise((resolve) => server.close(resolve))
    server = null
    await start({ store })
    const { body } = await post('/api/matching', { profile: FULL })
    expect(roleOf(body, FIXTURE.fullRole).sdgGoals).toEqual([9])
    expect(roleOf(body, FIXTURE.fullRole).sdgReviewed).toEqual({ 9: '2026-10-31' })
  })

  it('the list carries the closed-card AI numbers per role: Moderate automation %, Rapid exposure % and ILO group', async () => {
    await start()
    const { body } = await post('/api/matching', { profile: FULL })
    expect(roleOf(body, FIXTURE.fullRole).ai).toEqual({ moderate: { available: true, automationPct: 30, touchPct: expect.any(Number) }, rapid: { available: true, exposurePct: 45, gradient: 'G1', touchPct: 45 } })
    expect(roleOf(body, FIXTURE.brokenRole).ai).toEqual({ moderate: { available: false, automationPct: null, touchPct: null }, rapid: { available: true, exposurePct: 62, gradient: 'G3', touchPct: 62 } })
    // no chain ISCO-08 code: Rapid not available (the fixture's ILO row for 9999 is never used)
    expect(roleOf(body, FIXTURE.noIscoRole).ai).toEqual({ moderate: { available: false, automationPct: null, touchPct: null }, rapid: { available: false, exposurePct: null, gradient: null, touchPct: null } })
    // the same number that decides band 2
    const role = (await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })).body
    expect(roleOf(body, FIXTURE.fullRole).ai.moderate.automationPct).toBe(role.outlook.ai.moderate.values.automationPct)
    expect(keysDeep(roleOf(body, FIXTURE.fullRole).ai).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })

  it('M17: a profile saved before M17 gets no know-how and no Overall (Review Focus 1)', async () => {
    await start()
    const { status, body } = await post('/api/matching', { profile: FULL })
    expect(status).toBe(200)
    expect(body.aiKnowHow).toBeNull()
    expect(body.roles.every((r) => r.overallMatch.moderate === null && r.overallMatch.rapid === null)).toBe(true)
  })

  it('a profile carrying the Radar AI task answers (D38) is still accepted (Review Focus 3)', async () => {
    await start()
    const without = await post('/api/matching', { profile: FULL })
    const withAnswers = await post('/api/matching', { profile: { ...FULL, aiTasks: { status: 'answered', picked: ['writing'], date: '2026-10-31' } } })
    expect(withAnswers.status).toBe(without.status)
    expect(withAnswers.status).toBe(200)
  })

  it('M17: answers give know-how and an Overall that follows the formula, Skill Match unchanged', async () => {
    await start()
    const without = (await post('/api/matching', { profile: FULL })).body
    const { body } = await post('/api/matching', { profile: { ...FULL, aiUse: { mindset: 'yes', ethics: 'yes', apply: 'yes', design: 'no' } } })
    expect(body.aiKnowHow).toEqual({ percent: 75, yes: 3, answered: 4 })
    const r = body.roles.find((x) => x.skillMatch && x.ai.rapid.touchPct !== null)
    expect(r).toBeTruthy()
    const t = r.ai.rapid.touchPct / 100
    expect(r.overallMatch.rapid.percent).toBe(Math.round(r.skillMatch.percent * (1 - t) + 75 * t))
    expect(r.skillMatch).toEqual(roleOf(without, r.code).skillMatch)
    const m = body.roles.find((x) => x.skillMatch && x.ai.moderate.touchPct !== null)
    expect(m).toBeTruthy()
    const tm = m.ai.moderate.touchPct / 100
    expect(m.overallMatch.moderate.percent).toBe(Math.round(m.skillMatch.percent * (1 - tm) + 75 * tm))
  })

  it('M17: touchPct is the Moderate observed share and the Rapid mean x 100, one decimal, or null', async () => {
    await start()
    const { body } = await post('/api/matching', { profile: FULL })
    const full = roleOf(body, FIXTURE.fullRole)
    expect(full.ai.rapid.touchPct).toBe(45)
    expect(typeof full.ai.moderate.touchPct).toBe('number')
    const broken = roleOf(body, FIXTURE.brokenRole)
    expect(broken.ai.moderate.touchPct).toBeNull()
    expect(roleOf(body, FIXTURE.noIscoRole).ai.rapid.touchPct).toBeNull()
  })

  it('M17: no AI data for the scenario -> Overall equals Skill Match', async () => {
    // a data set whose ILO file has no row for the full role's ISCO code (2521): Skill Match yes, Rapid touch no
    const noIlo = await makeMatchingFixture({ edit: (files) => { files['ai/ilo_wp140.tsv'] = files['ai/ilo_wp140.tsv'].split('\n').filter((row) => !row.startsWith('2521\t')).join('\n') } })
    try {
      await start({ dataDir: noIlo.dir })
      const { body } = await post('/api/matching', { profile: { ...FULL, aiUse: { mindset: 'yes', ethics: null, apply: null, design: null } } })
      const r = roleOf(body, FIXTURE.fullRole)
      expect(r.skillMatch).toBeTruthy()
      expect(r.ai.rapid.touchPct).toBeNull()
      expect(r.overallMatch.rapid).toMatchObject({ percent: r.skillMatch.percent, noAiData: true })
      expect(r.ai.moderate.touchPct).not.toBeNull()
      expect(r.overallMatch.moderate.noAiData).toBe(false)
      expect(roleOf(body, FIXTURE.brokenRole).overallMatch).toEqual({ moderate: null, rapid: null })
    } finally {
      await noIlo.cleanup()
    }
  })

  it('M17: a tampered aiUse -> non-object is 400, unknown values count as unanswered (Review Focus 2)', async () => {
    await start()
    for (const aiUse of ['yes', ['yes'], 3, null]) expect((await post('/api/matching', { profile: { ...FULL, aiUse } })).status).toBe(400)
    const { status, body } = await post('/api/matching', { profile: { ...FULL, aiUse: { mindset: 'maybe', ethics: 'yes', apply: 7, design: 'no' } } })
    expect(status).toBe(200)
    expect(body.aiKnowHow).toEqual({ percent: 50, yes: 1, answered: 2 })
  })

  it('M17: the AI answers are never logged and the answer has no forbidden keys', async () => {
    await start({ log: (message) => console.error(message) }) // the app's default logger, so the spies see its lines
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m))
    const { body } = await post('/api/matching', { profile: { ...FULL, aiUse: { mindset: 'yes', ethics: 'no', apply: 'yes', design: 'no' } } })
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call.map(String))).not.toMatch(/mindset|aiUse/)
    spies.forEach((spy) => spy.mockRestore())
    expect(keysDeep(body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })

  it('Review Focus 4: Radar store unreadable -> 200, job ads not available, bands from the AI part only', async () => {
    const radar = { store: null, info: () => ({ writable: false }), answer: async () => { throw new Error('store down') }, references: async () => references }
    await start({ radarOverride: radar, demoOverride: null })
    const { status, body } = await post('/api/matching', { profile: FULL })
    expect(status).toBe(200)
    expect(body.radar).toMatchObject({ state: 'unavailable', manifestId: null })
    expect(roleOf(body, FIXTURE.brokenRole).bands).toEqual({ moderate: 4, rapid: 2 })
    expect(roleOf(body, FIXTURE.fullRole).bands).toEqual({ moderate: 4, rapid: 4 })
    const role = await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })
    expect(role.status).toBe(200)
    expect(role.body.outlook.jobAds).toMatchObject({ available: false, direction: null })
    expect(role.body.software.every((s) => s.inDemand === false)).toBe(true)
  })

  it('Review Focus 4: an expired judge session -> 200, job ads not available', async () => {
    const expired = { start: async () => {}, end: async () => {}, diff: async () => { throw new DemoError('demo_expired') } }
    await start({ demoOverride: expired })
    const session = await login('demo')
    const { status, body } = await post('/api/matching', { profile: FULL }, { session })
    expect(status).toBe(200)
    expect(body.radar).toMatchObject({ state: 'unavailable', judgeSession: true })
    expect(roleOf(body, FIXTURE.fullRole).bands).toEqual({ moderate: 4, rapid: 4 })
  })

  it('judge session signals move a band', async () => {
    await start()
    const session = await login('demo')
    const before = await post('/api/matching', { profile: FULL }, { session })
    expect(before.status).toBe(200)
    expect(before.body.radar).toMatchObject({ state: 'data', judgeSession: true, manifestId: 'demo-manifest-0' })
    // Synthetic base: DOSM group 2 stable with sufficient evidence, AI data present and mostly helping -> band 1.
    expect(roleOf(before.body, FIXTURE.fullRole).bands).toEqual({ moderate: 1, rapid: 1 })
    const applied = await post('/api/demo/radar/apply', { scenario: 'B' }, { session })
    expect(applied.status).toBe(200)
    const after = await post('/api/matching', { profile: FULL }, { session })
    expect(after.body.radar.manifestId).toBe('demo-manifest-1')
    // The structural break makes the group insufficient: not enough evidence yet.
    expect(roleOf(after.body, FIXTURE.fullRole).bands).toEqual({ moderate: 4, rapid: 4 })
    const role = await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole }, { session })
    expect(role.body.outlook.jobAds).toMatchObject({ available: true, direction: null, sufficient: false, level: 'group' })
  })

  it('Review Focus 5: a malformed body -> 400 bad_request in the app error shape, nothing logged', async () => {
    await start()
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    for (const body of [{ profile: 'x' }, { profile: [] }, {}, { profile: { skills: 'x' } }, { profile: { skills: [], occupationMappings: 3 } }]) {
      const r = await post('/api/matching', body)
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: { code: 'bad_request', message: expect.any(String), retryable: false } })
    }
    const big = await post('/api/matching', null, { raw: JSON.stringify({ profile: profileWith([skill('x'.repeat(70 * 1024), null)]) }) })
    expect(big.status).toBe(400)
    expect(big.body.error.code).toBe('bad_request')
    const broken = await post('/api/matching', null, { raw: '{"profile": ' })
    expect(broken.status).toBe(400)
    expect(broken.body.error.code).toBe('bad_request')
    const role = await post('/api/matching/role', { profile: FULL, code: 42 })
    expect(role.status).toBe(400)
    expect(spies.every((s) => s.mock.calls.length === 0)).toBe(true)
  })

  it('profile is never logged and never stored', async () => {
    const { store, radar } = await start()
    await radar.answer() // seeds prod/ from the bundle, as on first public use
    const marker = 'MARKER-7f3a9c-never-log-me'
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m))
    const keysBefore = await store.list('')
    const profile = profileWith([...FULL.skills, skill(marker, `onet:el:${marker}`, 'good'), skill(`${marker}-2`, null)], {
      employment: { records: [{ jobTitle: marker, occupation: { source: 'emasco', code: marker } }] },
    })
    expect((await post('/api/matching', { profile })).status).toBe(200)
    expect((await post('/api/matching/role', { profile, code: FIXTURE.fullRole })).status).toBe(200)
    expect((await post('/api/matching/role', { profile, code: '0000-00' })).status).toBe(404)
    expect((await post('/api/matching', { profile: { ...profile, skills: marker } })).status).toBe(400)
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call.map(String))).not.toContain(marker)
    const keysAfter = await store.list('')
    expect(keysAfter).toEqual(keysBefore)
    for (const key of keysAfter) expect(Buffer.from((await store.get(key)).bytes).toString('utf8')).not.toContain(marker)
  })

  it('no forbidden keys in either answer', async () => {
    await start()
    const list = await post('/api/matching', { profile: FULL })
    const role = await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })
    expect(keysDeep(list.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
    expect(keysDeep(role.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })

  it('matching data that cannot be read -> 503 in the app error shape, with no file path', async () => {
    const bad = await makeMatchingFixture({ edit: (files) => { files['sdg/links.json'] = '{' } })
    try {
      await start({ dataDir: bad.dir })
      const r = await post('/api/matching', { profile: FULL })
      expect(r.status).toBe(503)
      expect(r.body.error).toMatchObject({ code: 'data_unavailable', retryable: true })
      expect(JSON.stringify(r.body)).not.toContain(bad.dir)
    } finally {
      await bad.cleanup()
    }
  })
})

describe('SDG decisions in matching answers (cache)', () => {
  const approve = (store, link, i = 1, decision = 'approved') => recordReview(store, {
    reviewId: `review-20261031T000000000Z-0000000${i}`, kind: 'sdg_link', target: link.id, decision, note: '', evidence: [],
    reviewer: 'Owner', reviewedAt: '2026-10-31T00:00:00.000Z', version: 1, appliesTo: { sourceId: 'sdg-links', period: null, observationHash: linkHash(link) },
  })

  it('a second request within the cache time does not read the review store again; after it, or after sdgDecided, it does', async () => {
    const memory = createMemoryStore()
    const calls = { list: 0, get: 0 }
    const store = new Proxy(memory, {
      get(target, name) {
        const value = target[name]
        if (typeof value !== 'function') return value
        return (...args) => {
          if (name in calls) calls[name] += 1
          return value.apply(target, args)
        }
      },
    })
    await approve(memory, SDG_LINKS[0])
    let clock = Date.parse('2026-10-31T00:00:00.000Z')
    const tick = () => new Date(clock)
    const matching = createMatchingServiceFromEnv({ dataDir: fixture.dir, radar: { store, answer: async () => null }, references: fixtureReferences, now: tick, log: () => {} })
    const goals = async () => (await matching.list(FULL, null)).roles.find((r) => r.code === FIXTURE.fullRole).sdgGoals
    expect(await goals()).toEqual([8, 9])
    const after1 = { ...calls }
    expect(after1.list).toBe(1)
    expect(await goals()).toEqual([8, 9])
    await matching.role(FULL, FIXTURE.fullRole, null)
    expect(calls).toEqual(after1)
    // A decision written past the matching service is seen only after the cache time ...
    await approve(memory, SDG_LINKS[1], 2, 'rejected')
    clock += SDG_TTL_MS - 1
    expect(await goals()).toEqual([8, 9])
    expect(calls).toEqual(after1)
    clock += 1
    expect(await goals()).toEqual([9])
    expect(calls.list).toBe(2)
    // ... or at once after sdgDecided().
    await approve(memory, SDG_LINKS[0], 3, 'rejected')
    matching.sdgDecided()
    expect(await goals()).toEqual([])
    expect(calls.list).toBe(3)
  })

  it('a decision through the admin route is visible on the next matching request', async () => {
    await start({ appDataDir: fixture.dir })
    const before = await post('/api/matching', { profile: FULL })
    expect(roleOf(before.body, FIXTURE.fullRole).sdgGoals).toEqual([8, 9])
    const session = await login('admin')
    const decided = await post('/api/admin/matching/sdg-links', { id: SDG_LINKS[0].id, decision: 'rejected', note: '' }, { session })
    expect(decided.status).toBe(201)
    // The clock does not move: only the admin route's hook can have dropped the cache.
    const after = await post('/api/matching', { profile: FULL })
    expect(roleOf(after.body, FIXTURE.fullRole).sdgGoals).toEqual([8])
  })
})

describe('POST /api/matching/role', () => {
  it('role detail has the chain path and the MASCO step label', async () => {
    await start()
    const { status, body } = await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })
    expect(status).toBe(200)
    expect(body).toMatchObject({ code: FIXTURE.fullRole, title: 'Fixture Database Designer', url: 'https://emasco.mohr.gov.my/masco/2521-03', description: 'Designs databases.' })
    expect(body.chain.missingStep).toBeNull()
    expect(body.chain.path.map((s) => s.id)).toEqual(['masco2020_unit_to_isco08', 'soc2010_to_isco08', 'soc2018_to_soc2010', 'onet_to_soc2018'])
    expect(body.chain.path[0].label).toBe('code match, not an official table')
    expect(body.jobs).toEqual([
      { code: FIXTURE.bestJob, title: 'Database Architects', percent: 71 },
      { code: FIXTURE.otherJob, title: 'Database Administrators', percent: 40 },
    ])
  })

  it('fit: rows, what would raise it, and the rows O*NET marks as not precise enough', async () => {
    await start()
    const { body } = await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })
    expect(body.fit).toMatchObject({ met: 5, needed: 7, percent: 71, provisional: false, onetCode: FIXTURE.bestJob })
    expect(body.fit.rows.map((r) => [r.key, r.needed, r.you, r.status])).toEqual([
      ['el:2.A.1.a', 3, 4, 'met'],
      ['kn:2.C.3.a', 4, 2, 'below'],
    ])
    expect(body.fit.raise).toEqual([expect.objectContaining({ key: 'kn:2.C.3.a', action: 'raise', from: 'basic', to: 'good' })])
    expect(body.fit.leftOut).toEqual([{ key: 'el:2.A.2.a', name: 'Critical Thinking', reason: 'suppressed' }])
  })

  it('outlook parts for both scenarios, in-demand software against the profile, SDG tags and path preview', async () => {
    const { store } = await start()
    for (const [i, link] of SDG_LINKS.entries()) {
      await recordReview(store, {
        reviewId: `review-20261031T000000000Z-0000000${i}`, kind: 'sdg_link', target: link.id, decision: 'approved', note: '', evidence: [],
        reviewer: 'Owner', reviewedAt: '2026-10-31T00:00:00.000Z', version: 1, appliesTo: { sourceId: 'sdg-links', period: null, observationHash: linkHash(link) },
      })
    }
    const { body } = await post('/api/matching/role', { profile: FULL, code: FIXTURE.fullRole })
    expect(body.outlook.jobAds).toMatchObject({ signalId: 'dosm:masco2020:2', groupCode: '2', level: 'group', evidenceKind: 'occupation_group', direction: null })
    expect(body.outlook.jobAds.granularity).toMatchObject({ level: 'group', groupCode: '2' })
    expect(body.outlook.ai.moderate).toMatchObject({ available: true, changesMuch: false, source: 'aei', onetCode: FIXTURE.bestJob })
    expect(body.outlook.ai.moderate.values).toMatchObject({ automationPct: 30, observedShare: 66.7 })
    expect(body.outlook.ai.rapid).toMatchObject({ available: true, changesMuch: false, source: 'ilo', isco: '2521' })
    const sw = Object.fromEntries(body.software.map((s) => [s.name, s]))
    expect(sw.MySQL).toMatchObject({ have: true, inDemand: false })
    expect(sw.Python).toMatchObject({ have: false, inDemand: true })
    expect(body.sdg.tags.map((t) => t.target).sort()).toEqual(['8.2', '9.c'])
    expect(body.sdg.tags[0]).toMatchObject({ approvedAt: '2026-10-31T00:00:00.000Z', reason: expect.objectContaining({ en: expect.any(String) }) })
    expect(body.sdg.pathPreview.goals.map((g) => g.goal)).toEqual([4, 8, 9])
    expect(body.sdg.pathPreview.total).toBe(3)
    // every path link, item links too, carries the owner's approval date; goal titles come from targets.json
    const item = body.sdg.pathPreview.goals.flatMap((g) => g.links).find((l) => l.via.kind === 'item')
    expect(item).toMatchObject({ target: '4.4', approvedAt: '2026-10-31T00:00:00.000Z' })
    expect(body.sdg.goalTitles).toMatchObject({ 4: 'Quality education', 9: 'Industry, innovation and infrastructure' })
    const list = await post('/api/matching', { profile: FULL })
    expect(list.body.goalTitles).toMatchObject({ 8: 'Decent work' })
  })

  it('a role whose chain stops: no fit, Rapid from the chain ISCO code; no chain ISCO code -> Rapid unavailable with the missing step', async () => {
    await start()
    const broken = await post('/api/matching/role', { profile: FULL, code: FIXTURE.brokenRole })
    expect(broken.body.fit).toBeNull()
    expect(broken.body.jobs).toEqual([])
    expect(broken.body.chain.missingStep.id).toBe('soc2010_to_isco08')
    expect(broken.body.outlook.ai.moderate.available).toBe(false)
    expect(broken.body.outlook.ai.rapid).toMatchObject({ available: true, changesMuch: true, isco: '2512', missingStep: null })
    // The fixture has an ILO row for 9999: a same-digits stand-in would find it; only the bridge step may give ISCO-08.
    const noIsco = await post('/api/matching/role', { profile: FULL, code: FIXTURE.noIscoRole })
    expect(noIsco.body.outlook.ai.rapid).toMatchObject({ available: false, changesMuch: null, isco: null, values: null, missingStep: { id: 'masco2020_unit_to_isco08' } })
    expect(noIsco.body.outlook.ai.rapid).not.toHaveProperty('iscoFrom')
  })

  it('real bridge: Rapid uses the chain ISCO code; a Malaysian-only code stays unavailable with the missing step', async () => {
    const real = await loadMatchingData('data')
    expect(real.ilo.get('2512')).toBeTruthy()
    const matching = createMatchingServiceFromEnv({ dataDir: 'data', radar: null, references: fixtureReferences, log: () => {} })
    const answer = await matching.role(FULL, '2512-01', { headers: {} })
    expect(answer.outlook.ai.rapid).toMatchObject({ available: true, isco: '2512', missingStep: null })
    const other = await matching.role(FULL, '1121-01', { headers: {} })
    expect(other.outlook.ai.rapid).toMatchObject({ available: false, isco: null, missingStep: { id: 'masco2020_unit_to_isco08' } })
    const list = await matching.list(FULL, { headers: {} })
    expect(list.roles.find((r) => r.code === '1121-01').bands.rapid).toBe(4)
  })

  it('unknown role code -> 404; the unparsed stub -> 404', async () => {
    await start()
    expect((await post('/api/matching/role', { profile: FULL, code: '0000-00' })).status).toBe(404)
    const stub = await post('/api/matching/role', { profile: FULL, code: FIXTURE.stubRole })
    expect(stub.status).toBe(404)
    expect(stub.body.error.code).toBe('not_found')
  })
})
