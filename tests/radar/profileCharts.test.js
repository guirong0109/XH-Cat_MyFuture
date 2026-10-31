import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeBridge } from '../../shared/radar/bridge.js'
import { makeChain } from '../../shared/radar/chain.js'
import { profileJobs } from '../../shared/radar/profileCharts.js'

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
