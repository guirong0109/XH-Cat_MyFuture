import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteMyData, login, logout, me, signup } from '../public/js/accountApi.js'

afterEach(() => vi.unstubAllGlobals())

describe('accountApi (browser)', () => {
  it('each call hits its route and returns { ok, data }', async () => {
    const calls = []
    vi.stubGlobal('fetch', async (url, init) => { calls.push([init.method, url, init.body ? JSON.parse(init.body) : null]); return Response.json({ user: { email: 'a@b.co' } }) })
    expect(await signup('a@b.co', 'password 1', 'ms')).toEqual({ ok: true, data: { user: { email: 'a@b.co' } } })
    await login('a@b.co', 'password 1')
    await me()
    await logout()
    await deleteMyData()
    expect(calls).toEqual([
      ['POST', '/api/auth/signup', { email: 'a@b.co', password: 'password 1', language: 'ms' }],
      ['POST', '/api/auth/login', { email: 'a@b.co', password: 'password 1' }],
      ['GET', '/api/auth/me', null],
      ['POST', '/api/auth/logout', null],
      ['DELETE', '/api/auth/me', null],
    ])
  })

  it('errors come back as { ok:false, code, retryable }', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'accounts_unavailable', message: 'x', retryable: false } }, { status: 503 }))
    expect(await me()).toEqual({ ok: false, code: 'accounts_unavailable', retryable: false })
  })
})
