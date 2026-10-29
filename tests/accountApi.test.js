import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteMyData, loadLatestProfile, loadProfile, login, logout, me, saveProfile, signup } from '../public/js/accountApi.js'

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

  it('saveProfile: guest store first; 401 keeps the profile on this device', async () => {
    const order = []
    vi.stubGlobal('fetch', async () => { order.push('server'); return Response.json({ error: { code: 'not_signed_in', message: 'x', retryable: false } }, { status: 401 }) })
    const out = await saveProfile({ profileStatus: 'confirmed' }, { guestStore: { save: () => order.push('guest') } })
    expect(order).toEqual(['guest', 'server'])
    expect(out).toEqual({ ok: false, code: 'not_signed_in', retryable: false, where: 'device' })
  })

  it('saveProfile: POST when new (with the extraction id), PATCH with the version after', async () => {
    const calls = []
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push([init.method, url, JSON.parse(init.body)])
      return Response.json(init.method === 'POST' ? { id: 'p1', version: 1 } : { id: 'p1', version: 2 }, { status: init.method === 'POST' ? 201 : 200 })
    })
    const profile = { profileId: null, profileVersion: 0, profileStatus: 'confirmed', skills: [], preferences: {} }
    const first = await saveProfile(profile, { guestStore: { save() {} }, extractionId: 'e1' })
    expect(first).toEqual({ ok: true, data: { id: 'p1', version: 1 }, where: 'account' })
    const second = await saveProfile({ ...profile, profileId: 'p1', profileVersion: 1 }, { guestStore: { save() {} } })
    expect(second.data.version).toBe(2)
    expect(calls[0]).toEqual(['POST', '/api/profiles', { profile, extractionId: 'e1' }])
    expect(calls[1][0]).toBe('PATCH')
    expect(calls[1][1]).toBe('/api/profiles/p1')
    expect(calls[1][2].version).toBe(1)
    expect(Object.keys(calls[1][2].changes).sort()).toEqual(['preferences', 'skills'])
  })

  it('loadLatestProfile: newest saved profile, or null when there is none', async () => {
    vi.stubGlobal('fetch', async (url) => Response.json(url === '/api/profiles' ? { profiles: [{ id: 'p2' }, { id: 'p1' }] } : { id: 'p2', version: 3, profile: { profileId: 'p2' } }))
    expect(await loadLatestProfile()).toEqual({ ok: true, data: { id: 'p2', version: 3, profile: { profileId: 'p2' } } })
    vi.stubGlobal('fetch', async () => Response.json({ profiles: [] }))
    expect(await loadLatestProfile()).toEqual({ ok: true, data: null })
  })

  it('loadProfile fetches one saved profile by id', async () => {
    const urls = []
    vi.stubGlobal('fetch', async (url) => { urls.push(url); return Response.json({ id: 'p 1', version: 4, profile: {} }) })
    expect(await loadProfile('p 1')).toEqual({ ok: true, data: { id: 'p 1', version: 4, profile: {} } })
    expect(urls).toEqual(['/api/profiles/p%201'])
  })

  it('errors come back as { ok:false, code, retryable }', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'accounts_unavailable', message: 'x', retryable: false } }, { status: 503 }))
    expect(await me()).toEqual({ ok: false, code: 'accounts_unavailable', retryable: false })
  })
})
