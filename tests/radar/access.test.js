// Radar admin and judge access (spec §8.1, Test 24): signed fr_radar cookie, fail closed without secrets, constant-time
// key compare, expiry, key rotation, role separation, CSRF and Origin checks, login rate limit.
import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Count calls to timingSafeEqual while keeping the real function.
const calls = vi.hoisted(() => ({ timingSafeEqual: 0 }))
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal()
  const timingSafeEqual = (a, b) => {
    calls.timingSafeEqual += 1
    return real.timingSafeEqual(a, b)
  }
  return { ...real, default: { ...real, timingSafeEqual }, timingSafeEqual }
})

const { createRadarAccess } = await import('../../server/radar/access.js')
const { createApp } = await import('../../server/app.js')
const { createRadarService } = await import('../../server/radar/service.js')
const { createFileStore } = await import('../../server/radar/store/file.js')

const SECRET = 's'.repeat(40)
const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: SECRET }
const MIN = 60000

function clock(iso = '2026-10-31T00:00:00.000Z') {
  let t = new Date(iso).getTime()
  const now = () => new Date(t)
  now.advance = (ms) => {
    t += ms
  }
  return now
}

const cookieValue = (setCookie) => setCookie.split(';')[0].slice('fr_radar='.length)

describe('createRadarAccess (unit)', () => {
  it('issues a signed cookie: base64url(JSON) + "." + HMAC-SHA256, with the exact payload and attributes', () => {
    const now = clock()
    const access = createRadarAccess({ env: ENV, now })
    const out = access.login('admin', ENV.RADAR_ADMIN_KEY, '1.2.3.4')
    expect(out.ok).toBe(true)
    expect(out.cookie).toMatch(/^fr_radar=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; /)
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(out.cookie).toContain(`; ${attribute}`)
    expect(out.cookie).toContain('Max-Age=3600')
    const [body, mac] = cookieValue(out.cookie).split('.')
    expect(createHmac('sha256', SECRET).update(body).digest('base64url')).toBe(mac)
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    expect(Object.keys(payload).sort()).toEqual(['expiresAt', 'issuedAt', 'keyVersion', 'role', 'sessionId'])
    expect(payload.role).toBe('admin')
    expect(payload.keyVersion).toBe(createHash('sha256').update(ENV.RADAR_ADMIN_KEY).digest('hex').slice(0, 8))
    expect(new Date(payload.expiresAt).getTime() - new Date(payload.issuedAt).getTime()).toBe(60 * MIN)
    expect(out.csrf).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(out.cookie).not.toContain(ENV.RADAR_ADMIN_KEY)
  })

  it('demo sessions last 120 minutes', () => {
    const access = createRadarAccess({ env: ENV, now: clock() })
    const out = access.login('demo', ENV.RADAR_DEMO_KEY, '1.2.3.4')
    expect(out.ok).toBe(true)
    expect(out.cookie).toContain('Max-Age=7200')
  })

  it('compares keys with timingSafeEqual', () => {
    const access = createRadarAccess({ env: ENV, now: clock() })
    const before = calls.timingSafeEqual
    expect(access.login('admin', 'wrong', '1.2.3.4')).toEqual({ ok: false, code: 'not_allowed' })
    expect(calls.timingSafeEqual).toBeGreaterThan(before)
  })

  it('missing secret, short secret or missing role key → not_configured', () => {
    const now = clock()
    expect(createRadarAccess({ env: { ...ENV, RADAR_SESSION_SECRET: '' }, now }).login('admin', ENV.RADAR_ADMIN_KEY, 'a')).toEqual({ ok: false, code: 'not_configured' })
    expect(createRadarAccess({ env: { ...ENV, RADAR_SESSION_SECRET: 'x'.repeat(31) }, now }).login('admin', ENV.RADAR_ADMIN_KEY, 'a')).toEqual({ ok: false, code: 'not_configured' })
    const noAdmin = createRadarAccess({ env: { ...ENV, RADAR_ADMIN_KEY: undefined }, now })
    expect(noAdmin.login('admin', '', 'a')).toEqual({ ok: false, code: 'not_configured' })
    expect(noAdmin.login('demo', ENV.RADAR_DEMO_KEY, 'a').ok).toBe(true)
    const noDemo = createRadarAccess({ env: { ...ENV, RADAR_DEMO_KEY: '' }, now })
    expect(noDemo.login('demo', '', 'a')).toEqual({ ok: false, code: 'not_configured' })
  })

  it('the same key for admin and demo is refused for both roles (admin cannot act as demo and back)', () => {
    const access = createRadarAccess({ env: { ...ENV, RADAR_DEMO_KEY: ENV.RADAR_ADMIN_KEY }, now: clock() })
    expect(access.login('admin', ENV.RADAR_ADMIN_KEY, 'a')).toEqual({ ok: false, code: 'not_configured' })
    expect(access.login('demo', ENV.RADAR_ADMIN_KEY, 'a')).toEqual({ ok: false, code: 'not_configured' })
  })

  it('an unknown role is not allowed', () => {
    const access = createRadarAccess({ env: ENV, now: clock() })
    expect(access.login('owner', ENV.RADAR_ADMIN_KEY, 'a')).toEqual({ ok: false, code: 'not_allowed' })
  })

  it('the 11th login try in 15 minutes from one address is refused; another address is not', () => {
    const now = clock()
    const access = createRadarAccess({ env: ENV, now })
    for (let i = 0; i < 10; i++) expect(access.login('admin', 'wrong', '9.9.9.9').code).toBe('not_allowed')
    expect(access.login('admin', ENV.RADAR_ADMIN_KEY, '9.9.9.9')).toEqual({ ok: false, code: 'too_many_attempts' })
    expect(access.login('admin', ENV.RADAR_ADMIN_KEY, '8.8.8.8').ok).toBe(true)
    now.advance(15 * MIN)
    expect(access.login('admin', ENV.RADAR_ADMIN_KEY, '9.9.9.9').ok).toBe(true)
  })
})

// ---- over HTTP --------------------------------------------------------------------------------------------------

const bundleStore = createFileStore('data/radar/bundle')
let server
let base
let origin
async function start({ env = ENV, now = clock() } = {}) {
  const radar = createRadarService({ store: null, bundleStore, references: async () => ({}), ingestor: null, now })
  const radarAccess = createRadarAccess({ env, now })
  server = createApp({ radar, radarAccess, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  origin = base
  return { now, radarAccess }
}
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

async function call(method, route, { cookie, csrf, body, headers = {}, withOrigin = true } = {}) {
  const h = { ...headers }
  if (withOrigin) h.origin = origin
  if (cookie) h.cookie = `fr_radar=${cookie}`
  if (csrf) h['x-radar-csrf'] = csrf
  if (body !== undefined) h['content-type'] = 'application/json'
  const response = await fetch(`${base}${route}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, setCookie: response.headers.get('set-cookie') }
}

async function login(role = 'admin', key = ENV.RADAR_ADMIN_KEY) {
  const r = await call('POST', '/api/radar/session', { body: { role, key } })
  expect(r.status).toBe(200)
  return { cookie: cookieValue(r.setCookie), csrf: r.body.csrf, body: r.body, setCookie: r.setCookie }
}

describe('POST /api/radar/session and admin access (Test 24)', () => {
  it('login sets the fr_radar cookie and returns the CSRF token; the key never comes back', async () => {
    await start()
    const r = await login()
    expect(r.setCookie).toMatch(/^fr_radar=.+; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=3600/)
    expect(r.body).toMatchObject({ ok: true, role: 'admin' })
    expect(JSON.stringify(r.body)).not.toContain(ENV.RADAR_ADMIN_KEY)
    const status = await call('GET', '/api/admin/radar/status', { cookie: r.cookie })
    expect(status.status).toBe(200)
  })

  it('wrong key → 401 not_allowed; the 11th try → 429', async () => {
    await start()
    for (let i = 0; i < 10; i++) {
      const r = await call('POST', '/api/radar/session', { body: { role: 'admin', key: `wrong-${i}` } })
      expect(r.status).toBe(401)
      expect(r.body.error.code).toBe('not_allowed')
      expect(r.setCookie).toBe(null)
    }
    const r = await call('POST', '/api/radar/session', { body: { role: 'admin', key: ENV.RADAR_ADMIN_KEY } })
    expect(r.status).toBe(429)
    expect(r.body.error).toMatchObject({ code: 'too_many_attempts', retryable: true })
  })

  it('missing RADAR_SESSION_SECRET → login and protected routes answer not_configured', async () => {
    await start({ env: { ...ENV, RADAR_SESSION_SECRET: undefined } })
    const r = await call('POST', '/api/radar/session', { body: { role: 'admin', key: ENV.RADAR_ADMIN_KEY } })
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('not_configured')
    const status = await call('GET', '/api/admin/radar/status', { cookie: 'anything.anything' })
    expect(status.status).toBe(503)
    expect(status.body.error.code).toBe('not_configured')
  })

  it('missing RADAR_ADMIN_KEY → admin routes answer not_configured even with a cookie signed by the secret', async () => {
    const now = clock()
    const full = createRadarAccess({ env: ENV, now })
    const { cookie } = full.login('admin', ENV.RADAR_ADMIN_KEY, 'a')
    await start({ env: { ...ENV, RADAR_ADMIN_KEY: '' }, now })
    const status = await call('GET', '/api/admin/radar/status', { cookie: cookieValue(cookie) })
    expect(status.status).toBe(503)
    expect(status.body.error.code).toBe('not_configured')
  })

  it('no cookie, a tampered cookie or a cookie signed with another secret → 401 not_allowed', async () => {
    const now = clock()
    await start({ now })
    const { cookie } = await login()
    expect((await call('GET', '/api/admin/radar/status')).status).toBe(401)
    const [body, mac] = cookie.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const forged = Buffer.from(JSON.stringify({ ...payload, expiresAt: '2099-01-01T00:00:00.000Z' })).toString('base64url')
    const tampered = await call('GET', '/api/admin/radar/status', { cookie: `${forged}.${mac}` })
    expect(tampered.status).toBe(401)
    expect(tampered.body.error.code).toBe('not_allowed')
    const other = createRadarAccess({ env: { ...ENV, RADAR_SESSION_SECRET: 'o'.repeat(40) }, now }).login('admin', ENV.RADAR_ADMIN_KEY, 'a')
    expect((await call('GET', '/api/admin/radar/status', { cookie: cookieValue(other.cookie) })).status).toBe(401)
    expect((await call('GET', '/api/admin/radar/status', { cookie: 'garbage' })).status).toBe(401)
  })

  it('an expired cookie → 401', async () => {
    const now = clock()
    await start({ now })
    const { cookie } = await login()
    now.advance(60 * MIN - 1000)
    expect((await call('GET', '/api/admin/radar/status', { cookie })).status).toBe(200)
    now.advance(1000)
    const r = await call('GET', '/api/admin/radar/status', { cookie })
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('not_allowed')
  })

  it('a changed admin key ends sessions issued under the old key', async () => {
    const now = clock()
    await start({ now })
    const { cookie } = await login()
    await new Promise((resolve) => server.close(resolve))
    server = null
    await start({ env: { ...ENV, RADAR_ADMIN_KEY: 'rotated-admin-key-0000000000' }, now })
    const r = await call('GET', '/api/admin/radar/status', { cookie })
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('not_allowed')
  })

  it('a demo cookie on an admin route → 403 not_allowed', async () => {
    await start()
    const { cookie, csrf } = await login('demo', ENV.RADAR_DEMO_KEY)
    const r = await call('GET', '/api/admin/radar/status', { cookie })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('not_allowed')
    const post = await call('POST', '/api/admin/radar/refresh/openalex', { cookie, csrf })
    expect(post.status).toBe(403)
    expect(post.body.error.code).toBe('not_allowed')
  })

  it('a POST without or with a wrong X-Radar-CSRF, or from another Origin → 403 csrf_failed', async () => {
    await start()
    const { cookie, csrf } = await login()
    const route = '/api/admin/radar/cleanup'
    const none = await call('POST', route, { cookie })
    expect(none.status).toBe(403)
    expect(none.body.error.code).toBe('csrf_failed')
    const wrong = await call('POST', route, { cookie, csrf: `${csrf.slice(0, -2)}xx` })
    expect(wrong.body.error.code).toBe('csrf_failed')
    const otherSession = await login()
    expect((await call('POST', route, { cookie, csrf: otherSession.csrf })).body.error.code).toBe('csrf_failed')
    origin = 'https://evil.example'
    const crossSite = await call('POST', route, { cookie, csrf })
    expect(crossSite.status).toBe(403)
    expect(crossSite.body.error.code).toBe('csrf_failed')
    const noOrigin = await call('POST', route, { cookie, csrf, withOrigin: false })
    expect(noOrigin.body.error.code).toBe('csrf_failed')
  })

  it('login from another Origin is refused', async () => {
    await start()
    origin = 'https://evil.example'
    const r = await call('POST', '/api/radar/session', { body: { role: 'admin', key: ENV.RADAR_ADMIN_KEY } })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('csrf_failed')
    expect(r.setCookie).toBe(null)
  })

  it('logout ends the session on this server and clears the cookie', async () => {
    await start()
    const { cookie, csrf } = await login()
    const out = await call('POST', '/api/radar/logout', { cookie, csrf })
    expect(out.status).toBe(200)
    expect(out.setCookie).toMatch(/^fr_radar=; .*Max-Age=0/)
    expect((await call('GET', '/api/admin/radar/status', { cookie })).status).toBe(401)
  })

  it('never logs keys or cookies', async () => {
    const lines = []
    const spies = ['log', 'info', 'warn', 'error'].map((m) => vi.spyOn(console, m).mockImplementation((...args) => lines.push(args.join(' '))))
    try {
      await start()
      await call('POST', '/api/radar/session', { body: { role: 'admin', key: 'wrong-key-value' } })
      const { cookie } = await login()
      await call('GET', '/api/admin/radar/status', { cookie: `${cookie}x` })
    } finally {
      spies.forEach((s) => s.mockRestore())
    }
    const text = lines.join('\n')
    expect(text).not.toContain(ENV.RADAR_ADMIN_KEY)
    expect(text).not.toContain('wrong-key-value')
    expect(text).not.toContain(SECRET)
    expect(text).not.toMatch(/fr_radar=/)
  })
})
