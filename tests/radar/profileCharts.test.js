import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeBridge } from '../../shared/radar/bridge.js'
import { makeChain } from '../../shared/radar/chain.js'
import { profileJobs, skillCorners, filterItems } from '../../shared/radar/profileCharts.js'
import { startRadar } from '../helpers/radarData.js'

const file = JSON.parse(readFileSync('data/radar/occupation-bridge.json', 'utf8'))
const bridge = makeBridge(file)
const chain = makeChain(file, { hasRequirements: () => true })
const onetTitle = (c) => `Title ${c}`
const run = (rel) => profileJobs(rel, { chain, onetTitle })
const onet = (code) => ({ source: 'onet', code, title: `Title ${code}`, role: 'current' })
const emasco = (code) => ({ source: 'emasco', code, title: `eMASCO ${code}`, role: 'target' })

describe('iscoOf', () => {
  it('walks the built steps to ISCO-08', () => {
    expect(bridge.iscoOf('15-1252.00')).toContain('2512')
  })
  it('is empty for an unknown code', () => {
    expect(bridge.iscoOf('99-9999.99')).toEqual([])
  })
})

describe('profileJobs', () => {
  it('returns nothing for no profile', () => {
    expect(run(null)).toEqual({ jobs: [], broken: [] })
  })
  it('puts an O*NET role first with a role via', () => {
    const { jobs } = run({ fields: [], occupations: [onet('15-1252.00')] })
    expect(jobs[0].code).toBe('15-1252.00')
    expect(jobs[0].title).toBe('Title 15-1252.00')
    expect(jobs[0].via[0].kind).toBe('role')
    expect(jobs[0].via[0].from.source).toBe('onet')
  })
  it('walks an eMASCO code through the chain with its ISCO code', () => {
    const { jobs, broken } = run({ fields: [], occupations: [emasco('2512-02')] })
    expect(jobs.map((j) => j.code)).toEqual(['15-1252.00', '15-1253.00'])
    for (const j of jobs) {
      expect(j.via[0].kind).toBe('chain')
      expect(j.via[0].path.length).toBeGreaterThan(0)
      expect(j.via[0].isco).toBe('2512')
    }
    expect(broken).toEqual([])
  })
  it('reports a broken chain with the missing step', () => {
    const { jobs, broken } = run({ fields: [], occupations: [emasco('1121-01')] })
    expect(jobs).toEqual([])
    expect(broken[0].source).toBe('emasco')
    expect(broken[0].code).toBe('1121-01')
    expect(broken[0].missingStep.id).toBe('masco2020_unit_to_isco08')
    expect(broken[0].missingStep.kind).toBe('no_row')
  })
  it('lists a job reached by role and chain once, with two vias', () => {
    const { jobs } = run({ fields: [], occupations: [onet('15-1252.00'), emasco('2512-02')] })
    const codes = jobs.map((j) => j.code)
    expect(codes.filter((c) => c === '15-1252.00')).toHaveLength(1)
    expect(jobs.find((j) => j.code === '15-1252.00').via.map((v) => v.kind)).toEqual(['role', 'chain'])
  })
  it('adds a field via to a job already chosen', () => {
    const rel = {
      fields: [{ code: '0613', title: 'Software', jobs: [{ code: '15-1252.00', title: 'Field title' }, { code: '15-1299.00', title: 'Other' }] }],
      occupations: [onet('15-1252.00')],
    }
    const { jobs } = run(rel)
    expect(jobs.map((j) => j.code)).toEqual(['15-1252.00', '15-1299.00'])
    expect(jobs[0].via.map((v) => v.kind)).toEqual(['role', 'field'])
    expect(jobs[1].title).toBe('Other')
    expect(jobs[1].via[0].from).toEqual({ source: 'field', code: '0613', title: 'Software' })
  })
  it('orders roles, then fields, then eMASCO roles', () => {
    const rel = {
      fields: [{ code: '0613', title: 'S', jobs: [{ code: '11-1011.00', title: 'CEO' }] }],
      occupations: [emasco('2512-02'), onet('15-1299.00')],
    }
    expect(run(rel).jobs.map((j) => j.code)).toEqual(['15-1299.00', '11-1011.00', '15-1252.00', '15-1253.00'])
  })
})

describe('skillCorners (real bundled skills answer)', () => {
  let radar
  let skills
  beforeAll(async () => {
    radar = await startRadar()
    skills = radar.data.skills
  })
  afterAll(() => radar.close())
  const job = (code, title) => ({ code, title, via: [{ kind: 'role', from: { source: 'onet', code, title: null } }] })
  const accountants = () => job('13-2011.00', 'Accountants and Auditors')
  const developers = () => job('15-1252.00', 'Software Developers')
  const keysOf = (v, out = []) => {
    if (Array.isArray(v)) v.forEach((x) => keysOf(x, out))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) out.push(k), keysOf(x, out)
    return out
  }

  it('Accountants: 6 items, Excel and QuickBooks counts, Office first', () => {
    const { items } = skillCorners([accountants()], skills)
    expect(items).toHaveLength(6)
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ example: 'Microsoft Excel', postings: 3211598 }),
      expect.objectContaining({ example: 'Intuit QuickBooks', postings: 174071 }),
    ]))
    expect(items[0]).toMatchObject({ example: 'Microsoft Office software', postings: 3421542 })
  })
  it('Software Developers: 30 items, 29 with counts, a different set; sorted with nulls last', () => {
    const dev = skillCorners([developers()], skills).items
    const acc = skillCorners([accountants()], skills).items
    expect(dev).toHaveLength(30)
    expect(dev.filter((i) => i.postings !== null)).toHaveLength(29)
    expect(dev.map((i) => i.skillId).sort()).not.toEqual(acc.map((i) => i.skillId).sort())
    const counts = dev.map((i) => i.postings)
    const real = counts.filter((c) => c !== null)
    expect(real).toEqual([...real].sort((a, b) => b - a))
    expect(counts.slice(real.length).every((c) => c === null)).toBe(true)
  })
  it('Registered Nurses: no items, listed under noSkills', () => {
    const out = skillCorners([job('29-1141.00', 'Registered Nurses')], skills)
    expect(out.items).toEqual([])
    expect(out.noSkills[0].code).toBe('29-1141.00')
  })
  it('two jobs share Office, Excel and PowerPoint; the rest have one job', () => {
    const { items } = skillCorners([job('27-1024.00', 'Graphic Designers'), job('11-2021.00', 'Marketing Managers')], skills)
    expect(items).toHaveLength(16)
    const shared = ['Microsoft Office software', 'Microsoft Excel', 'Microsoft PowerPoint']
    for (const name of shared) {
      const hits = items.filter((i) => i.example === name)
      expect(hits).toHaveLength(1)
      expect(hits[0].jobs.map((j) => j.code)).toEqual(['27-1024.00', '11-2021.00'])
      expect(hits[0].jobs[0].via).toEqual(items[0].jobs[0].via)
    }
    for (const i of items.filter((x) => !shared.includes(x.example))) expect(i.jobs).toHaveLength(1)
  })
  it('filterItems is a case-insensitive substring on the name', () => {
    const { items } = skillCorners([accountants()], skills)
    expect(filterItems(items, 'excel').map((i) => i.example)).toEqual(['Microsoft Excel'])
    expect(filterItems(items, 'EXC').map((i) => i.example)).toEqual(['Microsoft Excel'])
    expect(filterItems(items, '')).toEqual(items)
  })
  it('previousPostings is null without a previous snapshot, and read by skillId when one is served', () => {
    expect(skills.postings.previous).toBeNull()
    expect(skillCorners([accountants()], skills).items.every((i) => i.previousPostings === null)).toBe(true)
    const excel = skills.postings.rows.find((r) => r.technology === 'Microsoft Excel')
    const withPrev = { ...skills, postings: { ...skills.postings, previous: { window: { year: '2024' }, rows: [{ technology: 'Microsoft Excel', skillId: excel.skillId, postings: 3000000 }] } } }
    const items = skillCorners([accountants()], withPrev).items
    expect(items.find((i) => i.example === 'Microsoft Excel').previousPostings).toBe(3000000)
    expect(items.find((i) => i.example !== 'Microsoft Excel').previousPostings).toBeNull()
  })
  it('flags match posting rows by skillId, not by the spelling of the name', () => {
    const synthetic = {
      changes: { 'X-1': { kept: [{ example: 'Microsoft Excel', skillId: 'onet:tech:microsoft excel' }], added: [], dropped: [] } },
      postings: { window: { year: '2025' }, rows: [{ technology: 'Microsoft  EXCEL ', skillId: 'onet:tech:microsoft excel', postings: 5 }], previous: null, firstSnapshot: true },
    }
    expect(skillCorners([job('X-1', 'X')], synthetic).items[0]).toMatchObject({ example: 'Microsoft Excel', postings: 5 })
  })
  it('isNew only when no job keeps the skill; dropped skills still wanted by another job are not listed', () => {
    const e = (example) => ({ example, skillId: `onet:tech:${example.toLowerCase()}` })
    const synthetic = {
      changes: {
        A: { kept: [e('Go')], added: [e('Rust')], dropped: [e('Perl'), e('Zig')] },
        B: { kept: [], added: [e('Go'), e('Rust')], dropped: [] },
        C: { kept: [], added: [], dropped: [e('Zig')] },
      },
      postings: null,
    }
    const out = skillCorners([job('A', 'A'), job('B', 'B'), job('C', 'C')], synthetic)
    expect(out.items.find((i) => i.example === 'Go').isNew).toBe(false)
    expect(out.items.find((i) => i.example === 'Rust').isNew).toBe(true)
    expect(out.dropped.map((d) => d.example).sort()).toEqual(['Perl', 'Zig'])
    expect(out.dropped.find((d) => d.example === 'Zig').jobs.map((j) => j.code)).toEqual(['A', 'C'])
    expect(out.noSkills.map((j) => j.code)).toEqual(['C'])
    expect(out.items.map((i) => i.example)).toEqual(['Go', 'Rust'])
  })
  it('output has no score, weight, rank, match or opportunit key', () => {
    const out = skillCorners([accountants(), developers()], skills)
    expect(keysOf(out).filter((k) => /score|weight|rank|match|opportunit/i.test(k))).toEqual([])
  })
})
