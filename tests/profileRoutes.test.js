import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { emptyProfile, makeSkill, val } from '../shared/profileSchema.js'
import { EMASCO, writeCatalogue } from './helpers/onetFixture.js'
import { writeFile } from 'node:fs/promises'

let dir
let server
let base

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'routes-'))
  await mkdir(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'onet'))
  await mkdir(path.join(dir, 'emasco'))
  await writeFile(path.join(dir, 'emasco', 'occupations.json'), JSON.stringify(EMASCO))
  server = createApp({ dataDir: dir, onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('skill and profile routes', () => {
  it('normalize maps known skills, offers candidates and keeps unknown ones', async () => {
    const response = await post('/api/skills/normalize', { texts: ['Python 3', 'SQL', 'Weaving'] })
    expect(response.status).toBe(200)
    const { skills } = await response.json()
    expect(skills[0].canonicalId).toBe('onet:tech:python')
    expect(skills[1]).toMatchObject({ canonicalId: null, candidates: expect.arrayContaining([expect.objectContaining({ id: 'onet:tech:microsoft sql server' })]) })
    expect(skills[2].canonicalId).toBe(null)
  })

  it('normalize rejects more than 200 texts with 413 too_many', async () => {
    const response = await post('/api/skills/normalize', { texts: Array(201).fill('python') })
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('too_many')
  })

  it('validate returns field errors, fills skill ids and saves nothing', async () => {
    const profile = emptyProfile()
    profile.employment.yearsOfExperience = val('two')
    profile.skills = [makeSkill({ name: 'python', source: 'user_input' })]
    const response = await post('/api/profiles/validate', { profile })
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.errors).toContainEqual({ path: 'employment.yearsOfExperience', code: 'bad_type' })
    expect(body.profile.skills[0]).toMatchObject({ name: 'Python', canonicalId: 'onet:tech:python', originalText: 'python' })
  })

  it('occupation search rejects a 1-character query with 400 bad_query', async () => {
    const response = await fetch(`${base}/api/occupations/search?q=a`)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('bad_query')
  })

  it('occupation search without an O*NET key answers cached from the snapshot', async () => {
    const response = await fetch(`${base}/api/occupations/search?q=data%20analyst`)
    expect(await response.json()).toMatchObject({ state: 'cached', warning: 'no_api_key', version: '31.0' })
  })

  it('validate without a profile is 400 with the error shape', async () => {
    const response = await post('/api/profiles/validate', {})
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'no_profile', message: expect.any(String), retryable: false } })
  })
})
