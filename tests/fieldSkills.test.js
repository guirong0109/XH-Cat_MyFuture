import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { loadFieldSkills } from '../server/fields/fieldSkills.js'
import { EMASCO, writeCatalogue } from './helpers/onetFixture.js'
import { writeIsced } from './helpers/iscedFixture.js'

let dir
let server
let base

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'field-skills-'))
  for (const sub of ['onet', 'emasco', 'isced']) await mkdir(path.join(dir, sub))
  await writeCatalogue(path.join(dir, 'onet'))
  await writeFile(path.join(dir, 'emasco', 'occupations.json'), JSON.stringify(EMASCO))
  await writeIsced(path.join(dir, 'isced'))
  server = createApp({ dataDir: dir, onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

const load = () => loadFieldSkills({ iscedDir: path.join(dir, 'isced'), onetDir: path.join(dir, 'onet') })

describe('skills suggested from a field of study (ISCED-F → CIP → O*NET jobs)', () => {
  it('suggests what this field\'s jobs list more often than jobs overall, with the numbers that explain it', async () => {
    const out = (await load()).suggest('0613')
    expect(out.field).toEqual({ code: '0613', title: 'Software and applications development and analysis' })
    expect(out.jobs).toBe(2)
    expect(out.suggestions).toEqual([
      { id: 'onet:el:2.A.1.a', name: 'Reading Comprehension', category: 'O*NET skill', kind: 'skill', fieldImportance: 4, allImportance: 3.5 },
      { id: 'onet:tech:python', name: 'Python', category: 'Development environment software', kind: 'software', inField: 2, fieldJobs: 2, allCount: 2, allJobs: 4 },
    ])
  })

  it('a tool must be listed by at least 2 of the field\'s jobs, unless the field leads to one job', async () => {
    const fields = await load()
    // Oracle Java is listed by only one of the two 0613 jobs.
    expect(fields.suggest('0613').suggestions.map((s) => s.name)).not.toContain('Oracle Java')
    expect(fields.suggest('0913').suggestions.map((s) => s.name)).toEqual(['Microsoft Excel'])
  })

  it('never suggests a skill that is not more typical of the field than of jobs overall', async () => {
    // Reading Comprehension: 3.0 in the nursing job, 3.5 across all jobs.
    expect((await load()).suggest('0913').suggestions.map((s) => s.name)).not.toContain('Reading Comprehension')
  })

  it('a field with no O*NET link says so and suggests nothing', async () => {
    expect((await load()).suggest('1013')).toEqual({ field: { code: '1013', title: 'Hotel, restaurants and catering' }, jobs: 0, suggestions: [] })
  })

  it('GET /api/fields/:code/skills answers with the sources and versions', async () => {
    const response = await fetch(`${base}/api/fields/0913/skills`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ isced: 'ISCED-F 2013', onet: '31.0', jobs: 1, field: { code: '0913' } })
    expect(body.suggestions[0].name).toBe('Microsoft Excel')
  })

  it('GET /api/fields/:code/skills refuses an unknown or malformed code', async () => {
    expect((await fetch(`${base}/api/fields/9998/skills`)).status).toBe(404)
    expect((await fetch(`${base}/api/fields/abc/skills`)).status).toBe(400)
  })
})
