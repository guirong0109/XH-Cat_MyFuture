// SDG link decisions in the Radar review store (Task 12): GET/POST /api/admin/matching/sdg-links, admin session and
// CSRF like /api/admin/radar/mappings. Real servers on port 0, memory store, cookies by hand.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { radarSessionRoutes } from '../../server/radar/adminRoutes.js'
import { loadReviews } from '../../server/radar/reviews.js'
import { linkHash, matchingAdminRoutes } from '../../server/matching/adminRoutes.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const ROUTE = '/api/admin/matching/sdg-links'
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
const bundleStore = createFileStore('data/radar/bundle')
const LINKS = JSON.parse(readFileSync(new URL('../../data/sdg/links.json', import.meta.url), 'utf8')).links

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
beforeAll(async () => {
  references = await loadRadarReferences('data')
})

const now = () => new Date('2026-10-31T00:00:00.000Z')
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

async function start({ store = createMemoryStore(), writable = true } = {}) {
  const radar = createRadarService({ store: writable ? store : null, bundleStore, references: async () => references, ingestor: null, now, log: () => {} })
  await listen(createApp({ radar, radarAccess: createRadarAccess({ env: ENV, now }), d1: null, tempStore: null, llmProviders: [], onetLive: null, now }))
  return { store }
}

// The route module alone, with injected links (as the app mounts it, plus the sign-in route).
async function startModule({ links, store = createMemoryStore(), dataDir = null, logs = null }) {
  const access = createRadarAccess({ env: ENV, now })
  const radar = { store, info: () => ({ writable: true }) }
  const app = express()
  app.use(radarSessionRoutes({ access, log: () => {} }))
  app.use(matchingAdminRoutes({ radar, access, now, dataDir, loadLinks: links ? async () => links() : null, log: (m) => logs?.push(m) }))
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

describe('linkHash', () => {
  it('covers id, kind, code, target and reason only', () => {
    const link = LINKS[0]
    expect(linkHash(link)).toMatch(/^[0-9a-f]{64}$/)
    expect(linkHash({ ...link, name: 'other', extra: 1 })).toBe(linkHash(link))
    expect(linkHash({ ...link, reason: { ...link.reason, en: 'changed' } })).not.toBe(linkHash(link))
    expect(linkHash({ ...link, target: '1.1' })).not.toBe(linkHash(link))
  })
})

describe('/api/admin/matching/sdg-links', () => {
  it('approve -> GET shows approved; the review is stored as sdg_link', async () => {
    const { store } = await start()
    const session = await login()
    const before = await call('GET', ROUTE, { session })
    expect(before.status).toBe(200)
    expect(before.body.writable).toBe(true)
    expect(before.body.links).toHaveLength(LINKS.length)
    expect(before.body.links.every((l) => l.status === 'pending' && l.reviewedAt === null)).toBe(true)

    const id = LINKS[0].id
    const posted = await call('POST', ROUTE, { session, body: { id, decision: 'approved', note: 'checked' } })
    expect(posted.status).toBe(201)
    expect(posted.body.review).toMatchObject({
      kind: 'sdg_link',
      target: id,
      decision: 'approved',
      note: 'checked',
      reviewer: 'Owner',
      version: 1,
      appliesTo: { sourceId: 'sdg-links', period: null, observationHash: linkHash(LINKS[0]) },
    })
    expect(posted.body.link).toMatchObject({ id, status: 'approved', reviewedAt: '2026-10-31T00:00:00.000Z' })

    const after = await call('GET', ROUTE, { session })
    expect(after.body.links.find((l) => l.id === id)).toMatchObject({ status: 'approved', reviewedAt: '2026-10-31T00:00:00.000Z' })
    expect(after.body.links.filter((l) => l.status === 'approved')).toHaveLength(1)
    expect(keysDeep(after.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
    expect(keysDeep(posted.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])

    const stored = await loadReviews(store, 'sdg_link')
    expect(stored.map((r) => r.target)).toEqual([id])

    const second = await call('POST', ROUTE, { session, body: { id, decision: 'revise' } })
    expect(second.status).toBe(201)
    expect(second.body.review.version).toBe(2)
    expect(second.body.link.status).toBe('pending')
  })

  it('GET adds three sourced role titles to each group link and the official goal titles', async () => {
    await start()
    const session = await login()
    const got = await call('GET', ROUTE, { session })
    const roles = JSON.parse(readFileSync(new URL('../../data/emasco/role_details.json', import.meta.url), 'utf8')).roles
    const goals = JSON.parse(readFileSync(new URL('../../data/sdg/targets.json', import.meta.url), 'utf8')).goals
    const group = got.body.links.find((l) => l.kind === 'masco_submajor')
    expect(group.examples).toHaveLength(3)
    const titles = new Set(roles.filter((r) => r.code.startsWith(group.code)).map((r) => r.title))
    for (const title of group.examples) expect(titles.has(title)).toBe(true)
    expect(got.body.links.find((l) => l.kind === 'onet_element').examples).toBeUndefined()
    expect(got.body.goalTitles['16']).toBe(goals.find((g) => g.code === '16').title)
  })

  it('field-topic mappings still list only field-topic reviews', async () => {
    await start()
    const session = await login()
    await call('POST', ROUTE, { session, body: { id: LINKS[0].id, decision: 'approved' } })
    const mappings = await call('GET', '/api/admin/radar/mappings', { session })
    expect(mappings.status).toBe(200)
    expect(mappings.body.reviews).toEqual([])
  })

  it('no session -> 401; wrong role (demo) -> 403', async () => {
    await start()
    expect((await call('GET', ROUTE)).status).toBe(401)
    expect((await call('POST', ROUTE, { body: { id: LINKS[0].id, decision: 'approved' } })).status).toBe(401)
    const demo = await login('demo')
    expect((await call('GET', ROUTE, { session: demo })).status).toBe(403)
    expect((await call('POST', ROUTE, { session: demo, body: { id: LINKS[0].id, decision: 'approved' } })).status).toBe(403)
  })

  it('POST without the CSRF token -> 403', async () => {
    await start()
    const session = await login()
    const r = await call('POST', ROUTE, { session: { ...session, csrf: 'wrong' }, body: { id: LINKS[0].id, decision: 'approved' } })
    expect(r.status).toBe(403)
  })

  it('unknown id -> 404; bad decision or note -> 400', async () => {
    await start()
    const session = await login()
    const unknown = await call('POST', ROUTE, { session, body: { id: 'g99-1.1', decision: 'approved' } })
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.code).toBe('not_found')
    for (const body of [{ id: LINKS[0].id, decision: 'confirmed' }, { id: 5, decision: 'approved' }, { id: LINKS[0].id, decision: 'approved', note: 'x'.repeat(2001) }, null]) {
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
    expect(got.body.links.every((l) => l.status === 'pending')).toBe(true)
    const r = await call('POST', ROUTE, { session, body: { id: LINKS[0].id, decision: 'approved' } })
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('not_configured')
  })

  it('missing or malformed data/sdg/links.json -> 503 data_unavailable (not store_unavailable), no file path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdg-links-'))
    try {
      for (const content of [null, '{ not json', JSON.stringify({ links: { a: 1 } }), JSON.stringify({ links: ['x'] })]) {
        if (content !== null) {
          mkdirSync(join(dir, 'sdg'), { recursive: true })
          writeFileSync(join(dir, 'sdg', 'links.json'), content)
        }
        const logs = []
        await startModule({ dataDir: dir, logs })
        const session = await login()
        for (const r of [await call('GET', ROUTE, { session }), await call('POST', ROUTE, { session, body: { id: LINKS[0].id, decision: 'approved' } })]) {
          expect(r.status, String(content)).toBe(503)
          expect(r.body.error).toEqual({ code: 'data_unavailable', message: 'SDG link data could not be read.', retryable: false })
          expect(JSON.stringify(r.body)).not.toContain(dir)
          expect(JSON.stringify(r.body)).not.toMatch(/links\.json|sdg[\\/]/)
        }
        expect(logs.join(' ')).not.toContain(dir)
        await new Promise((resolve) => server.close(resolve))
        server = null
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a changed reason puts an approved link back to pending (injected links)', async () => {
    let links = [{ id: 'g25-9.c', kind: 'masco_submajor', code: '25', name: null, target: '9.c', reason: { en: 'a', ms: 'a', zh: 'a' } }]
    await startModule({ links: () => links })
    const session = await login()
    expect((await call('POST', ROUTE, { session, body: { id: 'g25-9.c', decision: 'approved' } })).status).toBe(201)
    expect((await call('GET', ROUTE, { session })).body.links[0].status).toBe('approved')
    links = [{ ...links[0], reason: { en: 'b', ms: 'b', zh: 'b' } }]
    const got = await call('GET', ROUTE, { session })
    expect(got.body.links[0]).toMatchObject({ status: 'pending', reviewedAt: null })
  })
})
