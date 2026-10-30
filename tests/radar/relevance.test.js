import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { effectiveFieldTopics, relevantItems } from '../../shared/radar/relevance.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { EMASCO, writeCatalogue } from '../helpers/onetFixture.js'
import { writeIsced } from '../helpers/iscedFixture.js'

const GROUPS = { 1: 'g1' }
let dir
let refs

const topic = (axisId) => ({ axisId, openalexId: 'T1', officialTitle: axisId, friendlyLabel: { en: axisId }, reviewStatus: 'approved' })
const mapping = (mappingId, iscedCode, axisId, reviewStatus) => ({ mappingId, iscedCode, axisId, reviewStatus })

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'radar-refs-'))
  for (const sub of ['onet', 'emasco', 'isced', 'radar']) await mkdir(path.join(dir, sub))
  await writeCatalogue(path.join(dir, 'onet'))
  await writeFile(path.join(dir, 'emasco', 'occupations.json'), JSON.stringify(EMASCO))
  await writeIsced(path.join(dir, 'isced'))
  await writeFile(path.join(dir, 'radar', 'topics.json'), JSON.stringify({ topics: [topic('language'), topic('vision')] }))
  await writeFile(path.join(dir, 'radar', 'field-topic-mappings.json'), JSON.stringify({ mappings: [
    mapping('a', '06', 'language', 'approved'), mapping('b', '0613', 'vision', 'pending'),
  ] }))
  await writeFile(path.join(dir, 'radar', 'occupation-bridge.json'), JSON.stringify({ steps: [
    { id: 'onet_to_soc2018', status: 'built', source: { file: 'x.csv', sha256: 'aa' }, links: { '15-1252.00': ['15-1252'] } },
    { id: 'soc2018_to_soc2010', status: 'pending', source: null, pendingReason: 'file missing', links: {} },
    { id: 'soc2010_to_isco08', status: 'pending', source: null, pendingReason: 'file missing', links: {} },
    { id: 'isco08_to_masco2020_major', status: 'pending', source: null, pendingReason: 'no source', links: {} },
  ] }))
  refs = await loadRadarReferences(dir)
})
afterAll(() => rm(dir, { recursive: true, force: true }))

const profile = (extra = {}) => ({
  education: { records: [] }, employment: { records: [] }, preferences: { careerInterests: [] }, occupationMappings: [], ...extra,
})
const withFields = (...codes) => profile({ education: { records: codes.map((code) => ({ field: code ? { code, title: 'x' } : null })) } })

describe('effectiveFieldTopics', () => {
  it('a broad approval applies to detailed fields; a detailed rejection wins', () => {
    const m = [mapping('a', '06', 'language', 'approved'), mapping('b', '0613', 'language', 'rejected'), mapping('c', '06', 'vision', 'pending')]
    expect(effectiveFieldTopics(m, '0612')).toEqual([{ axisId: 'language', mappingId: 'a', level: 'broad' }])
    expect(effectiveFieldTopics(m, '0613')).toEqual([])
  })
  it('names the level a link was approved at', () => {
    const m = [mapping('n', '061', 'vision', 'approved'), mapping('d', '0613', 'robotics', 'approved')]
    expect(effectiveFieldTopics(m, '0613')).toEqual([
      { axisId: 'vision', mappingId: 'n', level: 'narrow' }, { axisId: 'robotics', mappingId: 'd', level: 'detailed' },
    ])
  })
  it('pending proposals never highlight', () => {
    expect(effectiveFieldTopics([mapping('p', '06', 'language', 'pending')], '0613')).toEqual([])
  })
})

describe('loadRadarReferences', () => {
  it('loads topics, mappings, bridge, field names and versions', () => {
    expect(refs.topics.map((t) => t.axisId)).toEqual(['language', 'vision'])
    expect(refs.fieldTopics).toHaveLength(2)
    expect(refs.fieldName('0613')).toBe('Software and applications development and analysis')
    expect(refs.fieldName('9999')).toBeNull()
    expect(refs.versions.isced).toBe('ISCED-F 2013')
  })
  it('lists the O*NET jobs of a field through the CIP bridge', () => {
    expect(refs.fieldJobs('0613')).toEqual([{ code: '15-1252.00', title: 'Software Developers' }, { code: '15-2051.00', title: 'Data Scientists' }])
    expect(refs.fieldJobs('1013')).toEqual([])
  })
  it('eMASCO maps by first digit; O*NET stays pending while the MASCO step is unsourced', () => {
    const e = refs.bridge.groupOf('emasco', EMASCO.roles[0].code)
    expect(e.status).toBe('mapped')
    expect(e.groupCode).toBe(EMASCO.roles[0].code[0])
    expect(e.path[0]).toMatchObject({ method: 'code_prefix' })
    const o = refs.bridge.groupOf('onet', '15-1252.00')
    expect(o).toMatchObject({ groupCode: null, status: 'pending' })
    expect(o.path.map((s) => s.stepId)).toEqual(['onet_to_soc2018'])
    expect(refs.bridge.groupOf('onet', '99-9999.00')).toMatchObject({ groupCode: null, status: 'unmapped', path: [] })
    expect(refs.bridge.groupOf('emasco', 'nope')).toMatchObject({ status: 'unmapped' })
  })
})

describe('relevantItems', () => {
  it('lists each field once, even when repeated, and several fields', () => {
    const r = relevantItems(withFields('0613', '0613', '0411'), refs)
    expect(r.fields.map((f) => f.code)).toEqual(['0613', '0411'])
    expect(r.empty).toBe(false)
  })
  it('a field reaches an axis only through an approved link; pending never highlights', () => {
    const r = relevantItems(withFields('0613'), refs)
    expect(r.axes.map((a) => [a.axisId, a.via.fieldCode, a.via.level])).toEqual([['language', '0613', 'broad']])
    expect(r.fields[0].jobs.map((j) => j.code)).toContain('15-1252.00')
  })
  it('eMASCO job reaches a group; O*NET job stays pending', () => {
    const p = profile({
      employment: { records: [{ occupation: { source: 'emasco', code: EMASCO.roles[0].code, title: 'A' } }, { occupation: { source: 'onet', code: '15-1252.00', title: 'B' } }] },
      occupationMappings: [{ kind: 'interest', chosen: { source: 'onet', code: '99-9999.00', title: 'C' } }, { kind: 'job', chosen: null }],
    })
    const r = relevantItems(p, refs)
    expect(r.occupations.map((o) => [o.code, o.role])).toEqual([[EMASCO.roles[0].code, 'held'], ['15-1252.00', 'held'], ['99-9999.00', 'interest']])
    expect(r.groups.map((g) => g.groupCode)).toEqual([EMASCO.roles[0].code[0]])
    expect(r.occupations.find((o) => o.code === '15-1252.00').group.status).toBe('pending')
    expect(r.occupations.find((o) => o.code === '99-9999.00').group.status).toBe('unmapped')
  })
  it('interest areas are listed but reach no group', () => {
    const p = profile({ preferences: { careerInterests: [{ source: 'onet', id: 'onet:ia:1.B.1.a', name: 'Realistic' }, 'baking'] } })
    const r = relevantItems(p, refs)
    expect(r.interests).toEqual([{ id: 'onet:ia:1.B.1.a', name: 'Realistic', source: 'onet' }, { id: null, name: 'baking', source: 'text' }])
    expect(r.groups).toEqual([])
    expect(r.axes).toEqual([])
    expect(r.empty).toBe(false)
  })
  it('skillIds holds only the official ids of profile skills, never a typed name (Review Focus 5)', () => {
    const p = profile({ skills: [{ name: 'Go', canonicalId: 'onet:tech:go' }, { name: 'Go', canonicalId: null }, { name: 'Rust' }, { name: 'x', canonicalId: '' }] })
    const r = relevantItems(p, refs)
    expect(r.skillIds).toBeInstanceOf(Set)
    expect([...r.skillIds]).toEqual(['onet:tech:go'])
    expect([...relevantItems(null, refs).skillIds]).toEqual([])
  })
  it('no profile or nothing linked gives empty: true', () => {
    expect(relevantItems(null, refs).empty).toBe(true)
    expect(relevantItems(profile(), refs).empty).toBe(true)
    expect(relevantItems(withFields(null), refs).empty).toBe(true)
  })
})
