// Judge Trend Change Test (spec §7, §8.3, §9, §13; tests 21, 22, 25). Real servers on port 0, memory store, cookies by
// hand. The demo runs the production pipeline on its own synthetic snapshots under demo/<sessionId>/ only; the
// production manifest must stay byte-identical throughout.
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { createDemoService, DemoError } from '../../server/radar/demo.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const MIN = 60000
const bundleStore = createFileStore('data/radar/bundle')
const BASE = JSON.parse(readFileSync('data/radar/demo/base.json', 'utf8'))
const SID = (n) => n.toString(16).padStart(32, '0')

let references
beforeAll(async () => {
  references = await loadRadarReferences('data')
})

function clock(iso = '2026-10-31T00:00:00.000Z') {
  let t = new Date(iso).getTime()
  const now = () => new Date(t)
  now.advance = (ms) => {
    t += ms
  }
  return now
}

let server
let base
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

async function start({ store = createMemoryStore(), now = clock(), writable = true } = {}) {
  const radar = createRadarService({ store: writable ? store : null, bundleStore, references: async () => references, ingestor: null, now, log: () => {} })
  const radarAccess = createRadarAccess({ env: ENV, now })
  server = createApp({ radar, radarAccess, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  if (writable) await radar.answer() // seeds prod/ from the bundle, as on first public use
  return { store, now, radar }
}

async function call(method, route, { session, body, csrf, origin = base } = {}) {
  const headers = { origin }
  if (session) {
    headers.cookie = `fr_radar=${session.cookie}`
    headers['x-radar-csrf'] = csrf ?? session.csrf
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function login(role = 'demo', key = ENV.RADAR_DEMO_KEY) {
  const response = await fetch(`${base}/api/radar/session`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ role, key }),
  })
  const body = await response.json()
  if (response.status !== 200) return { status: response.status, body }
  return { status: 200, cookie: response.headers.get('set-cookie').split(';')[0].slice('fr_radar='.length), csrf: body.csrf, body }
}

// Every prod/ object, as bytes: must not change because of anything a judge does.
async function prodBytes(store) {
  const out = {}
  for (const key of await store.list('prod/')) out[key] = Buffer.from((await store.get(key)).bytes).toString('base64')
  return out
}

const signal = (report, id) => report.changedSignals.find((s) => s.signalId === id)

describe('Scenario A', () => {
  it('Scenario A: one edit changes the class exactly as computed by hand; report states the rule (Test 25)', async () => {
    const { store } = await start()
    const prod = await prodBytes(store)
    expect(prod['prod/active.json']).toBeTruthy()
    const session = await login()
    expect(session.status).toBe(200)

    // Before: Professionals 9,600 / 96,000 = 10.000 % (2025 Q2) → 10,600 / 100,000 = 10.600 % (2026 Q2):
    // +0.6 pp and +6 % → below 1.0 pp and 10 % → Stable.
    const before = await call('GET', '/api/demo/radar/diff', { session })
    expect(before.status).toBe(200)
    expect(before.body.synthetic).toBe(true)
    expect(before.body.changedSignals).toEqual([])
    const prof0 = before.body.signals.find((s) => s.signalId === 'dosm:masco2020:2')
    expect(prof0.direction).toBe('stable')
    expect(prof0.change.value).toBeCloseTo(0.6, 10)
    expect(prof0.rule.key).toBe('rdRuleDosmStable')

    // Default edit: Professionals 2026 Q2 → 11,400. 11,400 / 100,000 = 11.400 %: +1.4 pp and +14 % → material;
    // steps 2026 Q2 +1.40, 2026 Q1 (10.40 − 9.90) +0.50, 2025 Q4 (10.25 − 9.80) +0.45 → 3 of 3 agree → Rising.
    const applied = await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A' } })
    expect(applied.status).toBe(200)
    const report = applied.body
    expect(report.scenario).toBe('A')
    expect(report.manifests.before).not.toBe(report.manifests.after)
    expect(report.observations).toEqual([{ sourceId: 'dosm', entityId: 'masco2020:2', period: '2026 Q2', old: 10600, new: 11400 }])
    const prof = signal(report, 'dosm:masco2020:2')
    expect(prof.before.direction).toBe('stable')
    expect(prof.after.direction).toBe('rising')
    expect(prof.changes).toContain('direction')
    expect(prof.after.change.value).toBeCloseTo(1.4, 10)
    expect(prof.after.change.relativePercent).toBeCloseTo(14, 10)
    expect(prof.details.after.rule.key).toBe('rdRuleDosmRising')
    expect(prof.details.after.rule.vars).toMatchObject({ agree: 3, clean: 3, materialPp: 1, materialRelativePercent: 10 })
    expect(prof.details.after.steps.map((v) => Number(v.toFixed(2)))).toEqual([1.4, 0.5, 0.45])
    expect(prof.details.after.ruleText).toMatch(/^Rising: the share changed by 1\.4/)
    expect(prof.details.after.evidenceQuality).toBe('strong')
    // Only Professionals changed; jobs reached through group 2 at group level; skills have no evidence in Round 1.
    expect(report.changedSignals.map((s) => s.signalId)).toEqual(['dosm:masco2020:2'])
    expect(report.affected.groups).toEqual([{ system: 'MASCO 2020 major group', code: '2', name: 'Professionals', signalId: 'dosm:masco2020:2' }])
    expect(report.affected.occupations.length).toBeGreaterThan(0)
    expect(report.affected.occupations.every((o) => o.level === 'group' && o.path.at(-1).code === '2')).toBe(true)
    expect(report.affected.skills).toEqual([{ reason: 'skill_demand_insufficient_evidence' }])
    expect(report.breaks.added).toEqual([])
    // GET diff gives the same report.
    const diff = await call('GET', '/api/demo/radar/diff', { session })
    expect(diff.body.changedSignals).toEqual(report.changedSignals)
    expect(await prodBytes(store)).toEqual(prod)
  })

  it('an OpenAlex-type edit reports the momentum index before and after', async () => {
    await start()
    const session = await login()
    const r = await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A', edits: [{ entityId: 'TDEMO1', period: '2025', value: 3000 }] } })
    expect(r.status).toBe(200)
    expect(r.body.observations).toEqual([{ sourceId: 'openalex', entityId: 'TDEMO1', period: '2025', old: 1150, new: 3000 }])
    expect(r.body.changedSignals.map((s) => s.signalId)).toEqual(['openalex:TDEMO1'])
    const m = r.body.momentum.language
    expect(m.before.counts.current.value).not.toBe(m.after.counts.current.value)
  })
})

describe('Scenario B', () => {
  it('Scenario B: a jump raises a possible structural break and makes comparisons insufficient', async () => {
    const { store } = await start()
    const prod = await prodBytes(store)
    const session = await login()
    // Default factor 1.8 on 2026 Q2: total 99,000 → 180,000 (+81.8 % ≥ 50 %); 7 of 9 groups (≥ 75 %) up ~ +82 % (≥ 40 %).
    const r = await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'B' } })
    expect(r.status).toBe(200)
    const report = r.body
    expect(report.scenario).toBe('B')
    expect(report.breaks.added).toHaveLength(1)
    expect(report.breaks.added[0]).toMatchObject({ period: '2026 Q2', status: 'unreviewed', label: 'Possible structural break', groupsSameWay: 7, eligibleGroups: 9 })
    expect(report.breaks.added[0].totalChangePercent).toBeCloseTo((180000 / 99000 - 1) * 100, 8)
    const ids = report.insufficientComparisons.map((c) => c.signalId)
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => `dosm:masco2020:${c}`))
    for (const c of report.insufficientComparisons) {
      expect(c.after.evidenceSufficiency).toBe('insufficient_comparable_evidence')
      expect(c.breakPeriods).toEqual(['2026 Q2'])
    }
    expect(report.observations.find((o) => o.entityId === 'masco2020:total')).toMatchObject({ old: 100000, new: 180000 })
    expect(await prodBytes(store)).toEqual(prod)
  })
})

describe('validation, reset and isolation', () => {
  it('invalid edit (negative, unknown entity) is refused; state unchanged', async () => {
    const { store } = await start()
    const session = await login()
    await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A' } })
    const kept = await call('GET', '/api/demo/radar/diff', { session })
    for (const edits of [
      [{ entityId: 'masco2020:2', period: '2026 Q2', value: -5 }],
      [{ entityId: 'masco2020:99', period: '2026 Q2', value: 5 }],
      [{ entityId: 'masco2020:2', period: '2031 Q1', value: 5 }],
      [{ entityId: 'masco2020:2', period: '2026 Q2', value: 'many' }],
      [{ entityId: 'masco2020:2', period: '2026 Q2', value: 200000 }], // total below the sum of the groups
    ]) {
      const r = await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A', edits } })
      expect(r.status, JSON.stringify(edits)).toBe(422)
      expect(r.body.error.code).toBe('validation_failed')
      expect(r.body.errors.length).toBeGreaterThan(0)
    }
    for (const body of [{ scenario: 'C' }, { scenario: 'B', factor: 0 }, { scenario: 'B', factor: -2 }, { scenario: 'A', edits: 'x' }, { scenario: 'A', edits: [] }]) {
      const r = await call('POST', '/api/demo/radar/apply', { session, body })
      expect(r.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400)
      expect(['bad_request', 'validation_failed']).toContain(r.body.error.code)
    }
    const after = await call('GET', '/api/demo/radar/diff', { session })
    expect(after.body).toEqual(kept.body)
    // Nothing of the demo is stored outside demo/<sessionId>/.
    const keys = await store.list('')
    expect(keys.filter((k) => !k.startsWith('prod/') && !k.startsWith('demo/'))).toEqual([])
  })

  it('reset restores the base; production manifest unchanged throughout', async () => {
    const { store } = await start()
    const prod = await prodBytes(store)
    const session = await login()
    const first = await call('GET', '/api/demo/radar/diff', { session })
    await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A' } })
    expect(await prodBytes(store)).toEqual(prod)
    await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'B', factor: 2 } })
    expect(await prodBytes(store)).toEqual(prod)
    const reset = await call('POST', '/api/demo/radar/reset', { session })
    expect(reset.status).toBe(200)
    expect(reset.body.changedSignals).toEqual([])
    expect(reset.body.current).toEqual(first.body.current)
    expect(reset.body.signals).toEqual(first.body.signals)
    expect(reset.body.manifests.after).toBe(first.body.manifests.after)
    expect(await prodBytes(store)).toEqual(prod)
    // A second judge session never sees the first one's data.
    const other = await createDemoService({ store, base: BASE, references, now: clock() })
    await expect(other.diff(SID(7))).rejects.toMatchObject({ code: 'demo_expired' })
  })

  it('the synthetic base is labelled and fictional', () => {
    expect(BASE.synthetic).toBe(true)
    expect(BASE.label).toMatch(/fictional/i)
    expect(BASE.dosm.periods).toHaveLength(12)
    expect(Object.keys(BASE.dosm.groups)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    // Real DOSM 2026 Q2 total in the bundle differs from the synthetic round numbers.
    expect(BASE.dosm.total.every((v) => v % 1000 === 0)).toBe(true)
  })
})

describe('session expiry and limits', () => {
  it('expired after a simulated restart (new service instance, same store, clock +2h) → demo_expired, data deleted (Test 21)', async () => {
    const store = createMemoryStore()
    const now = clock()
    const first = createDemoService({ store, base: BASE, references, now })
    await first.start(SID(1))
    await first.apply(SID(1), { scenario: 'A' })
    expect((await store.list(`demo/${SID(1)}/`)).length).toBeGreaterThan(0)
    // "Restart": a new instance over the same store; the stored expiresAt decides.
    const later = clock()
    later.advance(RADAR_CONFIG.demo.ttlMs - 1)
    const second = createDemoService({ store, base: BASE, references, now: later })
    await expect(second.diff(SID(1))).resolves.toBeTruthy()
    later.advance(1)
    for (const action of [() => second.diff(SID(1)), () => second.apply(SID(1), { scenario: 'A' }), () => second.reset(SID(1))]) {
      const error = await action().catch((e) => e)
      expect(error).toBeInstanceOf(DemoError)
      expect(error.code).toBe('demo_expired')
    }
    expect(await store.list(`demo/${SID(1)}/`)).toEqual([])
  })

  it('21st active session → demo_full', async () => {
    const store = createMemoryStore()
    const now = clock()
    const demo = createDemoService({ store, base: BASE, references, now })
    for (let i = 1; i <= RADAR_CONFIG.demo.maxSessions; i++) await demo.start(SID(i))
    await expect(demo.start(SID(21))).rejects.toMatchObject({ code: 'demo_full' })
    expect(await store.list(`demo/${SID(21)}/`)).toEqual([])
    // Expired sessions are swept on the next start.
    now.advance(RADAR_CONFIG.demo.ttlMs)
    await demo.start(SID(21))
    const sessions = new Set((await store.list('demo/')).map((k) => k.split('/')[1]))
    expect([...sessions]).toEqual([SID(21)])
  })

  it('judge sign-out ends the demo session: its data is wiped, so repeated sign-in/sign-out never hits demo_full', async () => {
    const { store, now } = await start()
    const prod = await prodBytes(store)
    const cycles = RADAR_CONFIG.demo.maxSessions + 5
    for (let i = 1; i <= cycles; i++) {
      const session = await login()
      expect(session.status, `sign-in ${i}`).toBe(200)
      const sessionId = JSON.parse(Buffer.from(session.cookie.split('.')[0], 'base64url').toString('utf8')).sessionId
      expect(await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A' } })).toMatchObject({ status: 200 })
      expect((await store.list(`demo/${sessionId}/`)).length).toBeGreaterThan(0)
      const out = await call('POST', '/api/radar/logout', { session })
      expect(out.status, `sign-out ${i}`).toBe(200)
      // The slot is free at once: nothing of this session is left under demo/.
      expect(await store.list(`demo/${sessionId}/`)).toEqual([])
      expect((await call('GET', '/api/demo/radar/diff', { session })).status).toBe(401)
      // Two minutes between cycles: under the 10 sign-ins per 15 minutes limit, far inside the 120-minute session life.
      now.advance(2 * MIN)
    }
    expect(await store.list('demo/')).toEqual([])
    expect(await prodBytes(store)).toEqual(prod)
  })

  it('a sign-out without the CSRF token or with an admin session wipes no demo data', async () => {
    const { store } = await start()
    const session = await login()
    const sessionId = JSON.parse(Buffer.from(session.cookie.split('.')[0], 'base64url').toString('utf8')).sessionId
    const before = await store.list(`demo/${sessionId}/`)
    expect(before.length).toBeGreaterThan(0)
    expect((await call('POST', '/api/radar/logout', { session, csrf: 'wrong' })).status).toBe(403)
    expect(await store.list(`demo/${sessionId}/`)).toEqual(before)
    const admin = await login('admin', ENV.RADAR_ADMIN_KEY)
    expect((await call('POST', '/api/radar/logout', { session: admin })).status).toBe(200)
    expect(await store.list(`demo/${sessionId}/`)).toEqual(before)
  })

  it('end(sessionId) deletes only that session folder, through the scoped store', async () => {
    const store = createMemoryStore()
    const seen = []
    const spy = {
      get: (k) => (seen.push(k), store.get(k)),
      put: (k, b, o) => (seen.push(k), store.put(k, b, o)),
      list: (p) => (seen.push(p), store.list(p)),
      delete: (k) => (seen.push(k), store.delete(k)),
    }
    const demo = createDemoService({ store: spy, base: BASE, references, now: clock() })
    await demo.start(SID(4))
    await demo.start(SID(5))
    await demo.end(SID(4))
    expect(await store.list(`demo/${SID(4)}/`)).toEqual([])
    expect((await store.list(`demo/${SID(5)}/`)).length).toBeGreaterThan(0)
    expect(seen.every((k) => k.startsWith('demo/'))).toBe(true)
    await expect(demo.end('../prod')).rejects.toMatchObject({ code: 'demo_expired' })
  })

  it('a demo login when 20 sessions are active answers demo_full and sets no cookie', async () => {
    const { store, now } = await start()
    const demo = createDemoService({ store, base: BASE, references, now })
    for (let i = 1; i <= RADAR_CONFIG.demo.maxSessions; i++) await demo.start(SID(i))
    const response = await fetch(`${base}/api/radar/session`, {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'demo', key: ENV.RADAR_DEMO_KEY }),
    })
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect((await response.json()).error.code).toBe('demo_full')
  })
})

describe('access', () => {
  it('no session / admin cookie / bad CSRF / over 30 per minute → refused (Test 22)', async () => {
    const { store, now } = await start()
    const prod = await prodBytes(store)
    const none = await call('POST', '/api/demo/radar/apply', { body: { scenario: 'A' } })
    expect(none.status).toBe(401)
    expect(none.body.error.code).toBe('not_allowed')
    expect((await call('GET', '/api/demo/radar/diff')).status).toBe(401)

    const admin = await login('admin', ENV.RADAR_ADMIN_KEY)
    for (const [method, route] of [['GET', '/api/demo/radar/diff'], ['POST', '/api/demo/radar/apply'], ['POST', '/api/demo/radar/reset']]) {
      const r = await call(method, route, { session: admin, body: method === 'POST' ? { scenario: 'A' } : undefined })
      expect(r.status, route).toBe(403)
      expect(r.body.error.code).toBe('not_allowed')
    }

    const session = await login()
    const bad = await call('POST', '/api/demo/radar/apply', { session, csrf: 'wrong', body: { scenario: 'A' } })
    expect(bad.status).toBe(403)
    expect(bad.body.error.code).toBe('csrf_failed')
    const otherOrigin = await call('POST', '/api/demo/radar/reset', { session, origin: 'http://evil.example' })
    expect(otherOrigin.body.error.code).toBe('csrf_failed')

    for (let i = 0; i < 30; i++) {
      const r = await call('POST', '/api/demo/radar/reset', { session })
      expect(r.status, `reset ${i + 1}`).toBe(200)
    }
    const over = await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A' } })
    expect(over.status).toBe(429)
    expect(over.body.error.code).toBe('too_many_attempts')
    // Reading stays possible; a minute later mutations work again.
    expect((await call('GET', '/api/demo/radar/diff', { session })).status).toBe(200)
    now.advance(MIN)
    expect((await call('POST', '/api/demo/radar/reset', { session })).status).toBe(200)
    expect(await prodBytes(store)).toEqual(prod)
  })

  it('without a writable store the demo routes answer not_configured', async () => {
    await start({ writable: false })
    const session = await login()
    expect(session.status).toBe(200)
    for (const [method, route] of [['GET', '/api/demo/radar/diff'], ['POST', '/api/demo/radar/apply'], ['POST', '/api/demo/radar/reset']]) {
      const r = await call(method, route, { session, body: method === 'POST' ? { scenario: 'A' } : undefined })
      expect(r.status, route).toBe(503)
      expect(r.body.error.code).toBe('not_configured')
    }
  })

  it('demo code reaches storage only through demo/<sessionId>/', async () => {
    const store = createMemoryStore()
    const seen = []
    const spy = {
      get: (k) => (seen.push(k), store.get(k)),
      put: (k, b, o) => (seen.push(k), store.put(k, b, o)),
      list: (p) => (seen.push(p), store.list(p)),
      delete: (k) => (seen.push(k), store.delete(k)),
    }
    const demo = createDemoService({ store: spy, base: BASE, references, now: clock() })
    await demo.start(SID(3))
    await demo.apply(SID(3), { scenario: 'B' })
    await demo.diff(SID(3))
    await demo.reset(SID(3))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((k) => k.startsWith('demo/'))).toBe(true)
    await expect(demo.diff('../prod')).rejects.toMatchObject({ code: 'demo_expired' })
  })
})

describe('report', () => {
  it('report says career rankings are not part of this module yet', async () => {
    await start()
    const session = await login()
    const r = await call('POST', '/api/demo/radar/apply', { session, body: { scenario: 'A' } })
    expect(r.body.careerRankings).toEqual({ key: 'rdNoRankings', text: 'Career rankings are not part of this module yet.' })
    const d = await call('GET', '/api/demo/radar/diff', { session })
    expect(d.body.careerRankings.text).toBe('Career rankings are not part of this module yet.')
  })
})
