import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword, verifyPassword } from '../server/auth.js'
import { writeCatalogue } from './helpers/onetFixture.js'
import { createFakeD1, createFakeTempStore } from './helpers/fakeStores.js'

let dir
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'auth-'))
  await mkdir(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'onet'))
})
afterAll(() => rm(dir, { recursive: true, force: true }))

// A fresh server per test: its own database, temp store, clock and sign-in counter.
async function start({ withD1 = true, at = '2026-10-29T10:00:00Z', trustProxy = false } = {}) {
  const d1 = withD1 ? createFakeD1() : null
  if (d1) await d1.migrate()
  const tempStore = createFakeTempStore()
  const clock = { now: new Date(at) }
  const server = createApp({ dataDir: dir, onetLive: null, d1, tempStore, now: () => clock.now, trustProxy }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, url, body, cookie, from = null) => fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(from ? { 'X-Forwarded-For': from } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { d1, tempStore, clock, call, close: () => new Promise((resolve) => server.close(resolve)) }
}
const cookieOf = (response) => response.headers.get('set-cookie')?.split(';')[0]
const USER = { email: 'aina@example.com', password: 'correct horse 42', language: 'ms' }

describe('passwords', () => {
  it('scrypt round trip', async () => {
    const { hash, salt } = await hashPassword('secret pass 1')
    expect(hash).toMatch(/^[0-9a-f]{128}$/)
    expect(await verifyPassword('secret pass 1', hash, salt)).toBe(true)
    expect(await verifyPassword('secret pass 2', hash, salt)).toBe(false)
  })
})

describe('account routes', () => {
  it('signup + me + cookie attributes', async () => {
    const app = await start()
    try {
      const response = await app.call('POST', '/api/auth/signup', USER)
      expect(response.status).toBe(201)
      expect(await response.json()).toEqual({ user: { id: expect.any(String), email: 'aina@example.com', language: 'ms', createdAt: '2026-10-29T10:00:00.000Z' } })
      const cookie = response.headers.get('set-cookie')
      expect(cookie).toMatch(/^fr_session=[\w-]{43}; /)
      for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) expect(cookie).toContain(part)
      const me = await app.call('GET', '/api/auth/me', null, cookieOf(response))
      expect((await me.json()).user.email).toBe('aina@example.com')
      const stored = await app.d1.query('SELECT token_hash FROM sessions')
      expect(stored.rows[0].token_hash).not.toBe(cookieOf(response).split('=')[1])
    } finally {
      await app.close()
    }
  })

  it('duplicate email → 409; bad email or short password → 400', async () => {
    const app = await start()
    try {
      await app.call('POST', '/api/auth/signup', USER)
      expect((await app.call('POST', '/api/auth/signup', { ...USER, email: 'AINA@example.com' })).status).toBe(409)
      const bad = await app.call('POST', '/api/auth/signup', { ...USER, email: 'not-an-email' })
      expect(bad.status).toBe(400)
      expect((await bad.json()).error.code).toBe('bad_email')
      expect((await (await app.call('POST', '/api/auth/signup', { ...USER, email: 'b@example.com', password: 'short' })).json()).error.code).toBe('weak_password')
    } finally {
      await app.close()
    }
  })

  it('unknown email and wrong password get the same 401 body', async () => {
    const app = await start()
    try {
      await app.call('POST', '/api/auth/signup', USER)
      const unknown = await app.call('POST', '/api/auth/login', { email: 'nobody@example.com', password: USER.password })
      const wrong = await app.call('POST', '/api/auth/login', { email: USER.email, password: 'wrong password' })
      expect(unknown.status).toBe(401)
      expect(wrong.status).toBe(401)
      expect(await unknown.json()).toEqual(await wrong.json())
      const right = await app.call('POST', '/api/auth/login', { email: 'Aina@Example.com', password: USER.password })
      expect(right.status).toBe(200)
      expect(cookieOf(right)).toMatch(/^fr_session=/)
    } finally {
      await app.close()
    }
  })

  it('the 11th sign-in within 15 minutes → 429; it works again after 15 minutes', async () => {
    const app = await start()
    try {
      for (let i = 0; i < 10; i++) expect((await app.call('POST', '/api/auth/login', { email: 'x@example.com', password: 'whatever 1' })).status).toBe(401)
      const blocked = await app.call('POST', '/api/auth/login', { email: 'x@example.com', password: 'whatever 1' })
      expect(blocked.status).toBe(429)
      expect((await blocked.json()).error).toMatchObject({ code: 'too_many_attempts', retryable: true })
      app.clock.now = new Date('2026-10-29T10:15:01Z')
      expect((await app.call('POST', '/api/auth/login', { email: 'x@example.com', password: 'whatever 1' })).status).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('the 11th sign-up within 15 minutes from one address → 429', async () => {
    const app = await start()
    try {
      for (let i = 0; i < 10; i++) expect((await app.call('POST', '/api/auth/signup', { email: `s${i}@example.com`, password: 'password 123' })).status).toBe(201)
      const blocked = await app.call('POST', '/api/auth/signup', { email: 's10@example.com', password: 'password 123' })
      expect(blocked.status).toBe(429)
      expect((await blocked.json()).error.code).toBe('too_many_attempts')
    } finally {
      await app.close()
    }
  })

  it('behind a trusted proxy each visitor has their own sign-in limit', async () => {
    const app = await start({ trustProxy: 1 })
    try {
      for (let i = 0; i < 10; i++) await app.call('POST', '/api/auth/login', { email: 'x@example.com', password: 'whatever 1' }, null, '203.0.113.7')
      expect((await app.call('POST', '/api/auth/login', { email: 'x@example.com', password: 'whatever 1' }, null, '203.0.113.7')).status).toBe(429)
      expect((await app.call('POST', '/api/auth/login', { email: 'x@example.com', password: 'whatever 1' }, null, '198.51.100.9')).status).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('logout ends the session; an expired session → 401', async () => {
    const app = await start()
    try {
      const cookie = cookieOf(await app.call('POST', '/api/auth/signup', USER))
      const out = await app.call('POST', '/api/auth/logout', null, cookie)
      expect(out.status).toBe(200)
      expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
      expect((await app.call('GET', '/api/auth/me', null, cookie)).status).toBe(401)

      const again = cookieOf(await app.call('POST', '/api/auth/login', USER))
      app.clock.now = new Date('2026-11-05T10:00:01Z')
      const expired = await app.call('GET', '/api/auth/me', null, again)
      expect(expired.status).toBe(401)
      expect((await expired.json()).error.code).toBe('not_signed_in')
    } finally {
      await app.close()
    }
  })

  it('delete me removes the user, sessions, profiles and the temporary CV named in a saved profile', async () => {
    const app = await start()
    try {
      const response = await app.call('POST', '/api/auth/signup', USER)
      const cookie = cookieOf(response)
      const { user } = await response.json()
      await app.tempStore.put('cv-temp/ext-1', Buffer.from('pdf'), 'application/pdf')
      await app.d1.query('INSERT INTO profiles (id, user_id, version, status, json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['p1', user.id, 1, 'confirmed', JSON.stringify({ dataProvenance: { extractionId: 'ext-1' } }), 't'])
      const deleted = await app.call('DELETE', '/api/auth/me', null, cookie)
      expect(deleted.status).toBe(200)
      expect(await deleted.json()).toEqual({ deleted: true })
      for (const table of ['users', 'sessions', 'profiles']) expect((await app.d1.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n).toBe(0)
      expect(await app.tempStore.get('cv-temp/ext-1')).toBe(null)
      expect((await app.call('GET', '/api/auth/me', null, cookie)).status).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('without D1 every account route → 503 accounts_unavailable', async () => {
    const app = await start({ withD1: false })
    try {
      for (const [method, url, body] of [['POST', '/api/auth/signup', USER], ['POST', '/api/auth/login', USER], ['GET', '/api/auth/me'], ['DELETE', '/api/auth/me']]) {
        const response = await app.call(method, url, body)
        expect(response.status).toBe(503)
        expect((await response.json()).error.code).toBe('accounts_unavailable')
      }
    } finally {
      await app.close()
    }
  })
})
