import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { makeZip } from '../helpers/cvFixtures.js'
import { SourceError } from '../../server/radar/sourceError.js'
import { RELEASE_PATTERN, releaseZipUrl, parseSkillsTable, createOnetSkillsSource } from '../../server/radar/sources/onetSkills.js'

const OLD = ['O*NET-SOC Code', 'Example', 'Commodity Code', 'Commodity Title', 'Hot Technology', 'In Demand'].join('\t') + '\r\n' +
  ['11-1011.00', 'Adobe Acrobat', '43232202', 'Document management software', 'Y', 'N'].join('\t') + '\r\n' +
  ['11-1011.00', 'AdSense Tracker', '43232306', 'Data base software', 'N', 'N'].join('\t') + '\r\n' +
  ['15-1252.00', 'Python', '43232107', 'Object or component oriented development software', 'Y', 'Y'].join('\t') + '\r\n'
const NEW = ['O*NET-SOC Code', 'Title', 'Workplace Example', 'Element ID', 'Element Name', 'Hot Technology', 'In Demand'].join('\t') + '\n' +
  ['11-1011.00', 'Chief Executives', 'Adobe Acrobat', '43232202', 'Document management software', 'Y', 'N'].join('\t') + '\n' +
  ['11-1011.00', 'Chief Executives', 'AdSense Tracker', '43232306', 'Data base software', 'N', 'N'].join('\t') + '\n' +
  ['15-1252.00', 'Software Developers', 'Python', '43232107', 'Object or component oriented development software', 'Y', 'Y'].join('\t') + '\n'
const ROWS = [
  { code: '11-1011.00', example: 'Adobe Acrobat', elementId: '43232202', elementName: 'Document management software', hot: true, inDemand: false },
  { code: '11-1011.00', example: 'AdSense Tracker', elementId: '43232306', elementName: 'Data base software', hot: false, inDemand: false },
  { code: '15-1252.00', example: 'Python', elementId: '43232107', elementName: 'Object or component oriented development software', hot: true, inDemand: true },
]

const okFetch = (zip) => async () => ({ ok: true, status: 200, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) })
const sha = (b) => createHash('sha256').update(b).digest('hex')

describe('releaseZipUrl', () => {
  it('builds the exact URL', () => {
    expect(releaseZipUrl('31.0')).toBe('https://www.onetcenter.org/dl_files/database/db_31_0_text.zip')
    expect(RELEASE_PATTERN.test('30.2')).toBe(true)
  })
  it('throws TypeError on a bad release', () => {
    expect(() => releaseZipUrl('31')).toThrow(TypeError)
    expect(() => releaseZipUrl('../x')).toThrow(TypeError)
  })
})

describe('parseSkillsTable', () => {
  it('parses both header styles to the same rows', () => {
    expect(parseSkillsTable(OLD)).toEqual(ROWS)
    expect(parseSkillsTable(NEW)).toEqual(ROWS)
  })
  it('missing In Demand column is onet_columns', () => {
    const bad = OLD.replace('\tIn Demand', '')
    expect(() => parseSkillsTable(bad)).toThrow(expect.objectContaining({ code: 'onet_columns' }))
  })
})

describe('createOnetSkillsSource', () => {
  const now = () => new Date('2026-10-30T00:00:00.000Z')
  it('turns a zip into a snapshot with hashes and month', async () => {
    const file = Buffer.from(NEW)
    const zip = makeZip({ 'db_31_0_text/Software Skills.txt': file, 'db_31_0_text/Other.txt': 'x' })
    const src = createOnetSkillsSource({ fetchImpl: okFetch(zip), now })
    const snap = await src.fetchRelease('31.0', null)
    expect(snap.sourceId).toBe('onet-skills')
    expect(snap.snapshotId).toBe('onet-skills-31.0')
    const set = snap.meta.flagSets[0]
    expect(set.month).toBe('2026-08')
    expect(set.zipUrl).toBe(releaseZipUrl('31.0'))
    expect(set.zipSha256).toBe(sha(zip))
    expect(set.fileSha256).toBe(sha(file))
    expect(set.rows.map((r) => r.example)).toEqual(['Adobe Acrobat', 'Python'])
  })
  it('finds Technology Skills.txt and uses null month for unknown releases', async () => {
    const zip = makeZip({ 'db_99_9_text/Technology Skills.txt': Buffer.from(OLD) })
    const snap = await createOnetSkillsSource({ fetchImpl: okFetch(zip), now }).fetchRelease('99.9', null)
    expect(snap.meta.flagSets[0].month).toBe(null)
    expect(snap.meta.flagSets[0].rows).toHaveLength(2)
  })
  it('404 is onet_release_not_found', async () => {
    const src = createOnetSkillsSource({ fetchImpl: async () => ({ ok: false, status: 404 }), now })
    await expect(src.fetchRelease('99.9', null)).rejects.toMatchObject({ code: 'onet_release_not_found' })
  })
  it('other failures are retryable source_unavailable', async () => {
    const down = createOnetSkillsSource({ fetchImpl: async () => { throw new Error('x') }, now })
    await expect(down.fetchRelease('31.0', null)).rejects.toMatchObject({ code: 'source_unavailable', retryable: true })
    const e500 = createOnetSkillsSource({ fetchImpl: async () => ({ ok: false, status: 500 }), now })
    await expect(e500.fetchRelease('31.0', null)).rejects.toBeInstanceOf(SourceError)
    const notZip = createOnetSkillsSource({ fetchImpl: okFetch(Buffer.from('nope nope nope nope nope')), now })
    await expect(notZip.fetchRelease('31.0', null)).rejects.toMatchObject({ code: 'source_unavailable' })
  })
  it('a zip without a skills file is onet_columns', async () => {
    const zip = makeZip({ 'db/Other.txt': 'x' })
    await expect(createOnetSkillsSource({ fetchImpl: okFetch(zip), now }).fetchRelease('31.0', null)).rejects.toMatchObject({ code: 'onet_columns' })
  })
})

const DIR = 'C:/Users/guiro/AppData/Local/Temp/claude/C--Users-guiro-XH-Cat-Final/b23b8968-85ad-4272-b3ff-34af38cc763e/scratchpad/onet/'
describe('real O*NET releases', () => {
  for (const [rel, f] of [['30.2', 'db_30_2.zip'], ['31.0', 'db_31_0.zip']]) {
    it.skipIf(!fs.existsSync(DIR + f))(`parses the real ${rel} zip`, async () => {
      const zip = fs.readFileSync(DIR + f)
      const snap = await createOnetSkillsSource({ fetchImpl: okFetch(zip) }).fetchRelease(rel, null)
      const rows = snap.meta.flagSets[0].rows
      expect(rows.length).toBeGreaterThan(2000)
      expect(rows.every((r) => r.hot || r.inDemand)).toBe(true)
    })
  }
})
