// Pathway pick decisions in the Radar review store (Task 7): GET/POST /api/admin/pathway/picks, admin session and CSRF
// like /api/admin/matching/sdg-links. Real servers on port 0, memory store, fixture data dir, cookies by hand.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { radarSessionRoutes } from '../../server/radar/adminRoutes.js'
import { loadReviews } from '../../server/radar/reviews.js'
import { loadPathwayData, pickHash } from '../../server/pathway/data.js'
import { pathwayAdminRoutes } from '../../server/pathway/adminRoutes.js'
import { adminView } from '../../public/js/screens/radarAdmin.js'
import { t as translate } from '../../shared/i18n.js'
import { PATHWAY, PICKS, makePathwayFixture } from '../helpers/pathwayFixture.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const ROUTE = '/api/admin/pathway/picks'
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
const bundleStore = createFileStore('data/radar/bundle')
const now = () => new Date('2026-10-31T00:00:00.000Z')
const IDS = [PATHWAY.course, PATHWAY.accredited, PATHWAY.professional]

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

let references
let fixture
beforeAll(async () => {
  references = await loadRadarReferences('data')
  fixture = await makePathwayFixture()
})
afterAll(async () => {
  await fixture?.cleanup?.()
})

let server
let base
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

async function listen(app) {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
}

// dir: the data dir ('data' = the real one, needed by demo sign-in; its picks file is empty).
async function start({ store = createMemoryStore(), writable = true, onDecision, dir = fixture.dir, appOptions = {}, withService = true } = {}) {
  const radar = createRadarService({ store: writable ? store : null, bundleStore, references: async () => references, ingestor: null, now, log: () => {} })
  const calls = { decided: 0 }
  const pathway = { pathway: async () => null, picksDecided: () => { calls.decided += 1; onDecision?.() } }
  await listen(createApp({ radar, radarAccess: createRadarAccess({ env: ENV, now }), dataDir: dir, ...(withService ? { pathway } : {}), ...appOptions, d1: null, aiProvider: null, onetLive: null, now }))
  return { store, calls }
}

// The route module alone (as the app mounts it, plus the sign-in route).
async function startModule({ dataDir = null, loadData = null, store = createMemoryStore(), logs = null }) {
  const access = createRadarAccess({ env: ENV, now })
  const radar = { store, info: () => ({ writable: true }) }
  const app = express()
  app.use(radarSessionRoutes({ access, log: () => {} }))
  app.use(pathwayAdminRoutes({ radar, access, now, dataDir, loadData, log: (m) => logs?.push(m) }))
  await listen(app)
  return { store }
}

async function call(method, route, { session, body } = {}) {
  const headers = { origin: base }
  if (session) {
    headers.cookie = `fr_radar=${session.cookie}`
    headers['x-radar-csrf'] = session.csrf
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function login(role = 'admin') {
  const response = await fetch(`${base}/api/radar/session`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ role, key: role === 'admin' ? ENV.RADAR_ADMIN_KEY : ENV.RADAR_DEMO_KEY, label: 'Owner' }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return { cookie: response.headers.get('set-cookie').split(';')[0].slice('fr_radar='.length), csrf: body.csrf }
}

describe('/api/admin/pathway/picks', () => {
  it('approve -> GET shows approved; the review is stored as pathway_pick; onDecision runs', async () => {
    const { store, calls } = await start()
    const session = await login()
    const before = await call('GET', ROUTE, { session })
    expect(before.status).toBe(200)
    expect(before.body.writable).toBe(true)
    expect(before.body.picks.map((p) => p.id).sort()).toEqual([...IDS].sort())
    expect(before.body.picks.every((p) => p.status === 'pending' && p.reviewedAt === null && /^[0-9a-f]{64}$/.test(p.hash))).toBe(true)

    const id = PATHWAY.course
    const posted = await call('POST', ROUTE, { session, body: { id, decision: 'approved', note: 'checked' } })
    expect(posted.status).toBe(201)
    expect(posted.body.review).toMatchObject({
      kind: 'pathway_pick',
      target: id,
      decision: 'approved',
      note: 'checked',
      reviewer: 'Owner',
      version: 1,
      appliesTo: { sourceId: 'pathway-picks', period: null, observationHash: pickHash({ ...PICKS.courses[0], type: 'course', for: 'kn:2.C.3.a' }) },
    })
    expect(posted.body.pick).toMatchObject({ id, status: 'approved', reviewedAt: '2026-10-31T00:00:00.000Z' })
    expect(calls.decided).toBe(1)

    const after = await call('GET', ROUTE, { session })
    expect(after.body.picks.find((p) => p.id === id)).toMatchObject({ status: 'approved', reviewedAt: '2026-10-31T00:00:00.000Z', reviewedBy: 'Owner' })
    expect(after.body.picks.filter((p) => p.status === 'approved')).toHaveLength(1)
    expect(keysDeep(after.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
    expect(keysDeep(posted.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])

    const stored = await loadReviews(store, 'pathway_pick')
    expect(stored.map((r) => r.target)).toEqual([id])

    const second = await call('POST', ROUTE, { session, body: { id, decision: 'revise' } })
    expect(second.status).toBe(201)
    expect(second.body.review.version).toBe(2)
    expect(second.body.pick.status).toBe('pending')
  })

  it('reject and revise are recorded; reject shows as rejected', async () => {
    await start()
    const session = await login()
    const rejected = await call('POST', ROUTE, { session, body: { id: PATHWAY.accredited, decision: 'rejected', note: 'wrong programme' } })
    expect(rejected.status).toBe(201)
    expect(rejected.body.pick.status).toBe('rejected')
    const revised = await call('POST', ROUTE, { session, body: { id: PATHWAY.professional, decision: 'revise', note: 'check the link' } })
    expect(revised.status).toBe(201)
    expect(revised.body.pick.status).toBe('pending')
    const got = await call('GET', ROUTE, { session })
    expect(got.body.picks.find((p) => p.id === PATHWAY.accredited).status).toBe('rejected')
    expect(got.body.picks.find((p) => p.id === PATHWAY.professional)).toMatchObject({ status: 'pending', reviewedAt: '2026-10-31T00:00:00.000Z' })
  })

  it('GET names what each pick is for: the O*NET item name or the field title', async () => {
    await start()
    const session = await login()
    const got = await call('GET', ROUTE, { session })
    const course = got.body.picks.find((p) => p.id === PATHWAY.course)
    expect(course).toMatchObject({ type: 'course', for: 'kn:2.C.3.a', forLabel: 'Computers and Electronics', site: 'elatih', link: 'https://elatih.hrdcorp.gov.my/courses-details/1234', checkedAt: '2026-10-31' })
    const programme = got.body.picks.find((p) => p.id === PATHWAY.accredited)
    expect(programme).toMatchObject({ type: 'programme', for: 'field:0613', forLabel: 'Software and applications development and analysis', institution: 'Universiti Malaya' })
    expect(got.body.picks.find((p) => p.id === PATHWAY.professional)).toMatchObject({ body: 'MBOT' })
  })

  it('no session -> 401; wrong role (demo) -> 403', async () => {
    await start({ dir: 'data' })
    expect((await call('GET', ROUTE)).status).toBe(401)
    expect((await call('POST', ROUTE, { body: { id: PATHWAY.course, decision: 'approved' } })).status).toBe(401)
    const demo = await login('demo')
    expect((await call('GET', ROUTE, { session: demo })).status).toBe(403)
    expect((await call('POST', ROUTE, { session: demo, body: { id: PATHWAY.course, decision: 'approved' } })).status).toBe(403)
  })

  it('POST without the CSRF token -> 403; with a foreign Origin -> 403', async () => {
    await start()
    const session = await login()
    const r = await call('POST', ROUTE, { session: { ...session, csrf: 'wrong' }, body: { id: PATHWAY.course, decision: 'approved' } })
    expect(r.status).toBe(403)
    const foreign = await fetch(`${base}${ROUTE}`, {
      method: 'POST',
      headers: { origin: 'http://evil.example', 'content-type': 'application/json', cookie: `fr_radar=${session.cookie}`, 'x-radar-csrf': session.csrf },
      body: JSON.stringify({ id: PATHWAY.course, decision: 'approved' }),
    })
    expect(foreign.status).toBe(403)
  })

  it('unknown id -> 404; bad decision or note -> 400', async () => {
    await start()
    const session = await login()
    const unknown = await call('POST', ROUTE, { session, body: { id: 'c-nope', decision: 'approved' } })
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.code).toBe('not_found')
    for (const body of [{ id: PATHWAY.course, decision: 'confirmed' }, { id: 5, decision: 'approved' }, { id: PATHWAY.course, decision: 'approved', note: 'x'.repeat(2001) }, null]) {
      const r = await call('POST', ROUTE, { session, body })
      expect(r.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('no writable store -> GET read-only all pending; POST not_configured', async () => {
    await start({ writable: false })
    const session = await login()
    const got = await call('GET', ROUTE, { session })
    expect(got.status).toBe(200)
    expect(got.body.writable).toBe(false)
    expect(got.body.picks.every((p) => p.status === 'pending')).toBe(true)
    const r = await call('POST', ROUTE, { session, body: { id: PATHWAY.course, decision: 'approved' } })
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('not_configured')
  })

  it('missing or malformed pathway data -> 503 data_unavailable (not store_unavailable), no file path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pathway-picks-'))
    try {
      for (const content of [null, '{ not json']) {
        if (content !== null) {
          mkdirSync(join(dir, 'pathway'), { recursive: true })
          writeFileSync(join(dir, 'pathway', 'picks.json'), content)
        }
        const logs = []
        await startModule({ dataDir: dir, logs })
        const session = await login()
        for (const r of [await call('GET', ROUTE, { session }), await call('POST', ROUTE, { session, body: { id: PATHWAY.course, decision: 'approved' } })]) {
          expect(r.status, String(content)).toBe(503)
          expect(r.body.error).toEqual({ code: 'data_unavailable', message: 'Study pathway data could not be read.', retryable: false })
          expect(JSON.stringify(r.body)).not.toContain(dir)
          expect(JSON.stringify(r.body)).not.toMatch(/picks\.json|pathway[\\/]/)
        }
        expect(logs.join(' ')).not.toContain(dir)
        await new Promise((resolve) => server.close(resolve))
        server = null
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a decision on an old hash no longer applies (injected picks); notes are not logged', async () => {
    const make = (name) => {
      const pick = { id: 'c-1', type: 'course', for: 'kn:1', site: 'elatih', name, link: 'https://elatih.hrdcorp.gov.my/courses-details/1', checkedAt: '2026-10-31' }
      return { ...pick, hash: pickHash(pick) }
    }
    let picks = [make('Old name')]
    const logs = []
    await startModule({ loadData: async () => ({ picks }), logs })
    const session = await login()
    expect((await call('POST', ROUTE, { session, body: { id: 'c-1', decision: 'approved', note: 'secret reviewer words' } })).status).toBe(201)
    expect((await call('GET', ROUTE, { session })).body.picks[0].status).toBe('approved')
    picks = [make('New name')]
    const got = await call('GET', ROUTE, { session })
    expect(got.body.picks[0]).toMatchObject({ status: 'pending', reviewedAt: null })
    expect(logs.join(' ')).not.toContain('secret reviewer words')
  })
})

describe('one pathway data loader for the service and the admin routes', () => {
  const counting = (fn = (dir) => loadPathwayData(dir)) => {
    const state = { reads: 0 }
    return { state, read: async (dir) => { state.reads += 1; return fn(dir, state.reads) } }
  }

  it('two GETs and one POST read the pathway data once (no injected service)', async () => {
    const { state, read } = counting()
    await start({ withService: false, appOptions: { pathwayRead: read } })
    const session = await login()
    expect((await call('GET', ROUTE, { session })).status).toBe(200)
    expect((await call('GET', ROUTE, { session })).status).toBe(200)
    expect((await call('POST', ROUTE, { session, body: { id: PATHWAY.course, decision: 'approved' } })).status).toBe(201)
    expect(state.reads).toBe(1)
  })

  it('a failed read is not kept: 503 data_unavailable, then the next request reads again', async () => {
    const { state, read } = counting(async (dir, n) => {
      if (n === 1) throw new Error('disk gone')
      return loadPathwayData(dir)
    })
    await start({ withService: false, appOptions: { pathwayRead: read } })
    const session = await login()
    const bad = await call('GET', ROUTE, { session })
    expect(bad.status).toBe(503)
    expect(bad.body.error.code).toBe('data_unavailable')
    expect((await call('GET', ROUTE, { session })).status).toBe(200)
    expect(state.reads).toBe(2)
  })

  it('with the start-up pathwayData, admin lists exactly those picks and nothing is read from disk', async () => {
    const data = await loadPathwayData(fixture.dir)
    const only = { ...data, picks: data.picks.filter((p) => p.id === PATHWAY.professional) }
    const { state, read } = counting()
    // dir: 'data' has no picks of its own, so any disk read would show other picks.
    await start({ withService: false, dir: 'data', appOptions: { pathwayData: only, pathwayRead: read } })
    const session = await login()
    const got = await call('GET', ROUTE, { session })
    expect(got.body.picks.map((p) => p.id)).toEqual([PATHWAY.professional])
    expect(state.reads).toBe(0)
  })
})

describe('admin screen: Pathway picks card', () => {
  const t = (key, vars) => translate('en', key, vars)
  const state = { lang: 'en', radarAdmin: { session: { role: 'admin' } } }
  const card = (data) => {
    const html = adminView({ t, state, data: { public: null, status: { writable: true }, mappings: { mappings: [] }, breaks: { breaks: [] }, ...data } })
    const from = html.indexOf('id="admPickCard"')
    return from < 0 ? '' : html.slice(from, html.indexOf('id="admBrkCard"', from) < 0 ? undefined : html.indexOf('id="admBrkCard"', from))
  }
  const picks = [
    { id: 'c-1', type: 'course', for: 'kn:2.C.3.a', forLabel: 'Computers and Electronics', site: 'elatih', siteName: 'e-LATiH (HRD Corp)', name: 'Computer Fundamentals', link: 'https://elatih.hrdcorp.gov.my/courses-details/1', checkedAt: '2026-10-31', status: 'pending', reviewedAt: null, hash: 'h' },
    { id: 'p-1', type: 'programme', kind: 'accredited', for: 'field:0613', forLabel: 'Software development', institution: 'Universiti Malaya', name: 'BCS', link: 'javascript:alert(1)', checkedAt: '2026-10-30', status: 'approved', reviewedAt: '2026-10-31T00:00:00.000Z', reviewedBy: 'Owner', hash: 'h2' },
  ]

  it('lists type, for, site, name, new-tab link, date checked, status and the three controls with a required note', () => {
    const html = card({ pathwayPicks: { writable: true, picks } })
    expect(html).toContain('Computers and Electronics')
    expect(html).toContain('e-LATiH (HRD Corp)')
    expect(html).toContain('Universiti Malaya')
    expect(html).toContain('href="https://elatih.hrdcorp.gov.my/courses-details/1" target="_blank" rel="noopener"')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('not yet reviewed')
    expect(html).toContain('Approved')
    expect(html).toContain('2026-10-31')
    for (const decision of ['approved', 'rejected', 'revise']) expect(html).toContain(`data-act="admPick" data-arg="c-1|${decision}"`)
    expect(html.match(/<textarea[^>]*id="admPickNote"[^>]*>/)[0]).toContain('required')
    expect(html).toContain('<label for="admPickNote"')
  })

  it('read-only store turns the buttons off; a failed list fails only this card', () => {
    const off = card({ pathwayPicks: { writable: false, picks } })
    expect(off.match(/<button[^>]*data-act="admPick"[^>]*>/g).every((b) => b.includes('disabled'))).toBe(true)
    const failed = card({ pathwayPicks: null, pathwayPicksError: 'data_unavailable' })
    expect(failed).toContain('role="alert"')
    expect(failed).not.toContain('data-act="admPick"')
  })
})
