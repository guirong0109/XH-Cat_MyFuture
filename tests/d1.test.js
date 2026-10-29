import { describe, expect, it } from 'vitest'
import { StoreError, createD1, createD1FromEnv } from '../server/store/d1.js'
import { createFakeD1 } from './helpers/fakeStores.js'

const ok = (results, changes = 0) => Response.json({ success: true, errors: [], result: [{ success: true, results, meta: { changes } }] })
const d1 = (fetchImpl) => createD1({ accountId: 'acc', databaseId: 'db', token: 'tok', fetchImpl })

describe('D1 client (Cloudflare REST)', () => {
  it('posts sql and params to the query URL with the token, and returns rows', async () => {
    const calls = []
    const client = d1(async (url, init) => { calls.push({ url, init }); return ok([{ id: 1 }], 1) })
    expect(await client.query('SELECT * FROM users WHERE id = ?', [1])).toEqual({ rows: [{ id: 1 }], changes: 1 })
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db/query')
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(calls[0].init.body)).toEqual({ sql: 'SELECT * FROM users WHERE id = ?', params: [1] })
  })

  it('5xx and network failures → store_unavailable; a D1 error → store_error', async () => {
    await expect(d1(async () => new Response('down', { status: 503 })).query('SELECT 1')).rejects.toMatchObject({ name: 'StoreError', code: 'store_unavailable' })
    await expect(d1(async () => { throw new TypeError('fetch failed') }).query('SELECT 1')).rejects.toBeInstanceOf(StoreError)
    const bad = d1(async () => Response.json({ success: false, errors: [{ message: 'no such table: x' }], result: [] }, { status: 400 }))
    await expect(bad.query('SELECT * FROM x')).rejects.toMatchObject({ code: 'store_error' })
  })

  it('refuses SQL built with a template string', async () => {
    await expect(d1(async () => ok([])).query('SELECT * FROM users WHERE email = ${email}')).rejects.toMatchObject({ code: 'store_error' })
  })

  it('no settings → no client', () => {
    expect(createD1FromEnv({})).toBe(null)
  })
})

describe('fake D1 (node:sqlite with the real migrations)', () => {
  it('migrate creates users, sessions and profiles; deleting a user deletes its rows', async () => {
    const db = createFakeD1()
    await db.migrate()
    const { rows } = await db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    expect(rows.map((r) => r.name)).toEqual(['profiles', 'sessions', 'users'])
    await db.query('INSERT INTO users (id, email, pass_hash, pass_salt, language, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['u1', 'a@b.c', 'h', 's', 'en', 't'])
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', ['k', 'u1', 't'])
    await db.query('INSERT INTO profiles (id, user_id, version, status, json, updated_at) VALUES (?, ?, ?, ?, ?, ?)', ['p1', 'u1', 1, 'confirmed', '{}', 't'])
    expect((await db.query('DELETE FROM users WHERE id = ?', ['u1'])).changes).toBe(1)
    expect((await db.query('SELECT COUNT(*) AS n FROM sessions')).rows[0].n).toBe(0)
    expect((await db.query('SELECT COUNT(*) AS n FROM profiles')).rows[0].n).toBe(0)
  })
})
