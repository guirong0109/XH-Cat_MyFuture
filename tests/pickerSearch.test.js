import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { IscedUnavailable, loadIsced } from '../server/fields/isced.js'
import { loadSkillCatalogue, searchSkills } from '../server/skills/onetSkills.js'
import { EMASCO, writeCatalogue } from './helpers/onetFixture.js'
import { writeIsced } from './helpers/iscedFixture.js'

let dir
let server
let base

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pickers-'))
  for (const sub of ['onet', 'emasco', 'isced', 'damaged']) await mkdir(path.join(dir, sub))
  await writeCatalogue(path.join(dir, 'onet'))
  await writeFile(path.join(dir, 'emasco', 'occupations.json'), JSON.stringify(EMASCO))
  await writeIsced(path.join(dir, 'isced'))
  await writeIsced(path.join(dir, 'damaged'), { damage: 'fields.tsv' })
  server = createApp({ dataDir: dir, onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

describe('field of study search (ISCED-F 2013)', () => {
  it('finds a field while the user is still typing (word starts)', async () => {
    const isced = await loadIsced(path.join(dir, 'isced'))
    expect(isced.search('nurs')[0]).toEqual({ code: '0913', title: 'Nursing and midwifery', broadTitle: 'Health and welfare', via: 'field', programme: null })
  })

  it('finds a field through a programme name and says which programme matched', async () => {
    const isced = await loadIsced(path.join(dir, 'isced'))
    expect(isced.search('computer science')[0]).toEqual({
      code: '0613', title: 'Software and applications development and analysis', broadTitle: 'Information and Communication Technologies (ICTs)', via: 'programme', programme: 'Computer science',
    })
  })

  it('lists each field once, field-name matches before programme matches', async () => {
    const isced = await loadIsced(path.join(dir, 'isced'))
    // "medicine" is a field name; the nursing programme also links to it partially, but only by programme.
    expect(isced.search('medicine').map((f) => [f.code, f.via])).toEqual([['0912', 'field']])
    expect(isced.search('registered nursing').map((f) => f.code)).toEqual(['0913', '0912'])
  })

  it('puts the closest programme name first', async () => {
    const isced = await loadIsced(path.join(dir, 'isced'))
    expect(isced.search('computer sci').map((f) => f.programme)).toEqual(['Computer science', 'Mathematics and computer science'])
  })

  it('refuses a snapshot that does not match its manifest', async () => {
    await expect(loadIsced(path.join(dir, 'damaged'))).rejects.toBeInstanceOf(IscedUnavailable)
  })

  it('GET /api/fields/search answers with the source, version and date', async () => {
    const response = await fetch(`${base}/api/fields/search?q=catering`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      source: 'isced', version: 'ISCED-F 2013', downloadedAt: '2026-10-30',
      candidates: [{ code: '1013', title: 'Hotel, restaurants and catering', broadTitle: 'Services', via: 'field', programme: null }],
    })
  })

  it('GET /api/fields/search needs 2 to 100 characters', async () => {
    const response = await fetch(`${base}/api/fields/search?q=n`)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('bad_query')
  })
})

describe('skill search (O*NET catalogue)', () => {
  it('finds catalogue skills by the start of a word, most used first', async () => {
    const catalogue = await loadSkillCatalogue(path.join(dir, 'onet'))
    expect(searchSkills(catalogue, 'pyth').map((s) => s.name)).toEqual(['Python'])
    expect(searchSkills(catalogue, 'sql').map((s) => s.name)).toEqual(['Microsoft SQL Server', 'Structured query language SQL'])
    expect(searchSkills(catalogue, 'reading')[0]).toEqual({ id: 'onet:el:2.A.1.a', name: 'Reading Comprehension', category: 'O*NET skill' })
  })

  it('puts an exact name first', async () => {
    const catalogue = await loadSkillCatalogue(path.join(dir, 'onet'))
    expect(searchSkills(catalogue, 'javascript')[0].name).toBe('JavaScript')
  })

  it('GET /api/skills/search answers with the O*NET version', async () => {
    const response = await fetch(`${base}/api/skills/search?q=excel`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ source: 'onet', version: '31.0', candidates: [{ id: 'onet:tech:microsoft excel', name: 'Microsoft Excel', category: 'Spreadsheet software' }] })
  })

  it('GET /api/skills/search needs 2 to 100 characters', async () => {
    expect((await fetch(`${base}/api/skills/search?q=`)).status).toBe(400)
  })
})
