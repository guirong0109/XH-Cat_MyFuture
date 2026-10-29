import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { emptyProfile, makeSkill, val } from '../shared/profileSchema.js'
import { confirmProfile } from '../shared/profileState.js'
import { writeCatalogue } from './helpers/onetFixture.js'
import { createFakeD1, createFakeTempStore } from './helpers/fakeStores.js'

let dir
let server
let base
let tempStore
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'saved-'))
  await mkdir(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'onet'))
  const d1 = createFakeD1()
  await d1.migrate()
  tempStore = createFakeTempStore()
  server = createApp({ dataDir: dir, onetLive: null, d1, tempStore }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

const call = async (method, url, body, cookie) => {
  const response = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
let n = 0
const newUser = async () => (await call('POST', '/api/auth/signup', { email: `user${++n}@example.com`, password: 'password 123' })).cookie

const MAPPING = { term: 'IT Support Executive', kind: 'job', chosen: { source: 'onet', code: '15-1232.00', title: 'Computer User Support Specialists', via: 'title', version: '31.0', fetchedAt: '2026-10-29', lookupState: 'cached' }, candidatesShown: 3 }
function confirmed() {
  const profile = emptyProfile({ inputMethod: 'cv', interfaceLanguage: 'ms' })
  profile.userCategory = val('working_adult')
  profile.skills = [makeSkill({ name: 'Python', canonicalId: 'onet:tech:python', category: 'Development environment software', source: 'user_input' })]
  profile.occupationMappings = [MAPPING]
  return confirmProfile(profile)
}

describe('saved profiles', () => {
  it('save + list + get; the temporary CV is deleted', async () => {
    const cookie = await newUser()
    await tempStore.put('cv-temp/0b1e9a3c-1111-4222-8333-944455556666', Buffer.from('pdf'), 'application/pdf')
    const saved = await call('POST', '/api/profiles', { profile: confirmed(), extractionId: '0b1e9a3c-1111-4222-8333-944455556666' }, cookie)
    expect(saved.status).toBe(201)
    expect(saved.body).toEqual({ id: expect.any(String), version: 1 })
    expect(await tempStore.get('cv-temp/0b1e9a3c-1111-4222-8333-944455556666')).toBe(null)
    const list = await call('GET', '/api/profiles', null, cookie)
    expect(list.body.profiles).toEqual([{ id: saved.body.id, version: 1, status: 'confirmed', updatedAt: expect.any(String) }])
    const one = await call('GET', `/api/profiles/${saved.body.id}`, null, cookie)
    expect(one.body).toMatchObject({ id: saved.body.id, version: 1, profile: { profileId: saved.body.id, profileVersion: 1, profileStatus: 'confirmed', skills: [{ canonicalId: 'onet:tech:python' }] } })
  })

  it('needs sign-in', async () => {
    const out = await call('POST', '/api/profiles', { profile: confirmed() })
    expect(out.status).toBe(401)
    expect(out.body.error.code).toBe('not_signed_in')
  })

  it('a draft → 422 not_confirmed; an invalid profile → 422 invalid_profile with fields', async () => {
    const cookie = await newUser()
    expect((await call('POST', '/api/profiles', { profile: emptyProfile() }, cookie)).body.error.code).toBe('not_confirmed')
    const bad = { ...confirmed(), age: 30 }
    const out = await call('POST', '/api/profiles', { profile: bad }, cookie)
    expect(out.status).toBe(422)
    expect(out.body.error.code).toBe('invalid_profile')
    expect(out.body.fields).toContainEqual(expect.objectContaining({ path: 'age' }))
  })

  it('user B gets 404 for user A’s profile (get, patch, mappings)', async () => {
    const a = await newUser()
    const b = await newUser()
    const { body } = await call('POST', '/api/profiles', { profile: confirmed() }, a)
    for (const [method, url, payload] of [['GET', `/api/profiles/${body.id}`], ['PATCH', `/api/profiles/${body.id}`, { version: 1, changes: { skills: [] } }], ['GET', `/api/profiles/${body.id}/mappings`]]) {
      const out = await call(method, url, payload, b)
      expect(out.status).toBe(404)
      expect(out.body.error.code).toBe('not_found')
    }
  })

  it('PATCH with an old version returns 409; PATCH touches only named fields', async () => {
    const cookie = await newUser()
    const { body } = await call('POST', '/api/profiles', { profile: confirmed() }, cookie)
    const patched = await call('PATCH', `/api/profiles/${body.id}`, { version: 1, changes: { 'preferences.careerGoal': val('Data analyst') } }, cookie)
    expect(patched.body).toEqual({ id: body.id, version: 2 })
    const { profile } = (await call('GET', `/api/profiles/${body.id}`, null, cookie)).body
    expect(profile.preferences.careerGoal).toEqual(val('Data analyst'))
    expect(profile.profileVersion).toBe(2)
    expect(profile.skills).toEqual(confirmed().skills)
    expect(profile.userCategory).toEqual(val('working_adult'))
    const stale = await call('PATCH', `/api/profiles/${body.id}`, { version: 1, changes: { 'preferences.careerGoal': val('x') } }, cookie)
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('stale_version')
  })

  it('refuses status, id, version and forbidden fields', async () => {
    const cookie = await newUser()
    const { body } = await call('POST', '/api/profiles', { profile: confirmed() }, cookie)
    for (const changes of [{ profileStatus: 'draft' }, { profileId: 'x' }, { profileVersion: 9 }, { age: 30 }, { 'employment.gender': 'f' }, {}]) {
      const out = await call('PATCH', `/api/profiles/${body.id}`, { version: 1, changes }, cookie)
      expect(out.status, JSON.stringify(changes)).toBe(422)
      expect(out.body.error.code).toBe('bad_change')
    }
  })

  it('mappings: occupation links and skills with ids', async () => {
    const cookie = await newUser()
    const { body } = await call('POST', '/api/profiles', { profile: confirmed() }, cookie)
    const out = await call('GET', `/api/profiles/${body.id}/mappings`, null, cookie)
    expect(out.body).toEqual({ occupationMappings: [MAPPING], skills: [{ name: 'Python', canonicalId: 'onet:tech:python', category: 'Development environment software' }] })
  })
})
