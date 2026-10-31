// Accounts stored on the owner's computer (owner, 1 Nov 2026: "host on my computer, don't use R2 / D1"): a SQLite file
// with the same query / migrate interface as Cloudflare D1, switched on by ACCOUNTS_DB=local.
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { StoreError } from '../server/store/d1.js'
import { accountsDbFromEnv, createLocalD1 } from '../server/store/localDb.js'
import { writeCatalogue } from './helpers/onetFixture.js'

let dir
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'localdb-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('local accounts database', () => {
  it('creates the file and the tables on first use, keeps data after closing and reopening', async () => {
    const file = path.join(dir, 'sub', 'accounts.db')
    const first = createLocalD1(file)
    await first.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', ['u1', 'a@example.com', 'hash', 'salt', '2026-11-01T00:00:00Z'])
    first.close()
    expect(existsSync(file)).toBe(true)
    const second = createLocalD1(file)
    const { rows } = await second.query('SELECT id, email FROM users WHERE id = ?', ['u1'])
    expect(rows).toEqual([{ id: 'u1', email: 'a@example.com' }])
    second.close()
  })

  it('opening again never touches existing data (tables are created only if missing)', async () => {
    const file = path.join(dir, 'accounts.db')
    const db = createLocalD1(file)
    await db.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', ['u1', 'a@example.com', 'hash', 'salt', 'x'])
    await db.migrate()
    expect((await db.query('SELECT COUNT(*) AS n FROM users')).rows[0].n).toBe(1)
    db.close()
  })

  it('answers like D1: rows for SELECT, changes for writes, StoreError for bad SQL or text-built SQL', async () => {
    const db = createLocalD1(path.join(dir, 'accounts.db'))
    expect(await db.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', ['u1', 'a@example.com', 'h', 's', 'x'])).toEqual({ rows: [], changes: 1 })
    await expect(db.query('SELECT * FROM no_such_table')).rejects.toBeInstanceOf(StoreError)
    await expect(db.query('SELECT ${x}')).rejects.toBeInstanceOf(StoreError)
    db.close()
  })

  it('accountsDbFromEnv: local only with ACCOUNTS_DB=local; D1 settings win; nothing set gives null', () => {
    expect(accountsDbFromEnv({}, { dataDir: dir })).toBeNull()
    const local = accountsDbFromEnv({ ACCOUNTS_DB: 'local' }, { dataDir: dir })
    expect(typeof local.query).toBe('function')
    local.close()
    const d1 = accountsDbFromEnv({ ACCOUNTS_DB: 'local', D1_ACCOUNT_ID: 'a', D1_DATABASE_ID: 'b', D1_TOKEN: 'c' }, { dataDir: dir })
    expect(d1.close).toBeUndefined()
  })

  it('the default file is data/cache/accounts/accounts.db; ACCOUNTS_DB_FILE can move it', async () => {
    const local = accountsDbFromEnv({ ACCOUNTS_DB: 'local' }, { dataDir: dir })
    await local.query('SELECT 1')
    local.close()
    expect(existsSync(path.join(dir, 'cache', 'accounts', 'accounts.db'))).toBe(true)
    const other = path.join(dir, 'elsewhere.db')
    const moved = accountsDbFromEnv({ ACCOUNTS_DB: 'local', ACCOUNTS_DB_FILE: other }, { dataDir: dir })
    await moved.query('SELECT 1')
    moved.close()
    expect(existsSync(other)).toBe(true)
  })
})

describe('the server picks the local database from its settings', () => {
  it('createApp with ACCOUNTS_DB=local (no D1) has accounts on', async () => {
    const saved = { ACCOUNTS_DB: process.env.ACCOUNTS_DB, ACCOUNTS_DB_FILE: process.env.ACCOUNTS_DB_FILE }
    process.env.ACCOUNTS_DB = 'local'
    process.env.ACCOUNTS_DB_FILE = path.join(dir, 'from-env.db')
    try {
      await mkdir(path.join(dir, 'onet'), { recursive: true })
      await writeCatalogue(path.join(dir, 'onet'))
      const app = createApp({ dataDir: dir, onetLive: null })
      const server = app.listen(0)
      await new Promise((resolve) => server.once('listening', resolve))
      const health = await (await fetch(`http://127.0.0.1:${server.address().port}/api/health`)).json()
      await new Promise((resolve) => server.close(resolve))
      app.locals.config.d1?.close?.()
      expect(health.features.accounts).toBe(true)
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})

describe('sign-up with the local database survives a server restart', () => {
  async function start(file) {
    await mkdir(path.join(dir, 'onet'), { recursive: true })
    await writeCatalogue(path.join(dir, 'onet'))
    const d1 = createLocalD1(file)
    const server = createApp({ dataDir: dir, onetLive: null, d1 }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (method, url, body, cookie) => {
      const response = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const stop = async () => {
      await new Promise((resolve) => server.close(resolve))
      d1.close()
    }
    return { call, stop }
  }

  it('health says accounts on; sign up, restart, sign in again with the same password', async () => {
    const file = path.join(dir, 'accounts.db')
    const a = await start(file)
    expect((await a.call('GET', '/api/health')).body.features.accounts).toBe(true)
    const signup = await a.call('POST', '/api/auth/signup', { email: 'test.owner@example.com', password: 'password 123' })
    expect(signup.status).toBeLessThan(300)
    await a.stop()

    const b = await start(file)
    const login = await b.call('POST', '/api/auth/login', { email: 'test.owner@example.com', password: 'password 123' })
    expect(login.status).toBeLessThan(300)
    expect((await b.call('GET', '/api/auth/me', null, login.cookie)).body.user.email).toBe('test.owner@example.com')
    const wrong = await b.call('POST', '/api/auth/login', { email: 'test.owner@example.com', password: 'wrong password' })
    expect(wrong.status).toBeGreaterThanOrEqual(400)
    await b.stop()
  })

  it('passwords are never stored as plain text', async () => {
    const file = path.join(dir, 'accounts.db')
    const a = await start(file)
    await a.call('POST', '/api/auth/signup', { email: 'plain.check@example.com', password: 'password 123' })
    await a.stop()
    const db = createLocalD1(file)
    const { rows } = await db.query('SELECT pass_hash, pass_salt FROM users')
    db.close()
    expect(rows[0].pass_hash).not.toContain('password 123')
    expect(rows[0].pass_salt).not.toContain('password 123')
  })
})
