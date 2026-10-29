import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { loadInterestAreas } from '../server/interests/interestAreas.js'
import { EMASCO, writeCatalogue } from './helpers/onetFixture.js'

let dir
let server
let base

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'interests-'))
  for (const sub of ['onet', 'emasco', 'damaged']) await mkdir(path.join(dir, sub))
  await writeCatalogue(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'damaged'), { damage: 'interest_areas.tsv' })
  await writeFile(path.join(dir, 'emasco', 'occupations.json'), JSON.stringify(EMASCO))
  server = createApp({ dataDir: dir, onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

describe('career interests and fields (O*NET interest areas)', () => {
  it('lists each interest area once, by name, with a stable O*NET id', async () => {
    const areas = await loadInterestAreas(path.join(dir, 'onet'))
    expect(areas.list).toEqual([
      { id: 'onet:ia:1.B.3.aa', name: 'Health Care Service' },
      { id: 'onet:ia:1.B.3.q', name: 'Information Technology' },
    ])
    expect(areas.version).toBe('31.0')
  })

  it('refuses a file that does not match the manifest', async () => {
    await expect(loadInterestAreas(path.join(dir, 'damaged'))).rejects.toThrow()
  })

  it('GET /api/interests answers with the list and its source', async () => {
    const response = await fetch(`${base}/api/interests`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      source: 'onet', version: '31.0',
      areas: [{ id: 'onet:ia:1.B.3.aa', name: 'Health Care Service' }, { id: 'onet:ia:1.B.3.q', name: 'Information Technology' }],
    })
  })
})
