import { describe, expect, it } from 'vitest'
import { makeChain } from '../../shared/matching/chain.js'

const src = (name) => ({ name, file: `${name}.csv`, url: `https://example.org/${name}`, sha256: 'abc' })
const SYS = {
  'O*NET-SOC': { system: 'O*NET-SOC', version: '2019' }, 'SOC 2018': { system: 'SOC', version: '2018' },
  'SOC 2010': { system: 'SOC', version: '2010' }, 'ISCO-08': { system: 'ISCO-08', version: '2008' },
  'MASCO 2020': { system: 'MASCO', version: '2020' },
}
const step = (id, from, to, links, extra = {}) => ({
  id, from: SYS[from], to: SYS[to], method: 'crosswalk',
  status: 'built', source: src(id), pendingReason: null, links, ...extra,
})

const bridge = (overrides = {}) => ({
  schema: 'radar-occupation-bridge/v1',
  steps: [
    step('onet_to_soc2018', 'O*NET-SOC', 'SOC 2018', {
      '15-1252.00': ['15-1252'], '15-1242.00': ['15-1242'], '15-1243.00': ['15-1243'], '15-1299.00': ['15-1299'],
    }),
    step('soc2018_to_soc2010', 'SOC 2018', 'SOC 2010', {
      '15-1252': ['15-1132'], '15-1242': ['15-1141'], '15-1243': ['15-1141'], '15-1299': ['15-1199'],
    }),
    step('soc2010_to_isco08', 'SOC 2010', 'ISCO-08', {
      '15-1132': ['2512'], '15-1141': ['2521'], '15-1199': ['2599'],
    }),
    step('isco08_to_masco2020_major', 'ISCO-08', 'MASCO 2020', {}, { status: 'pending' }),
    step('masco2020_unit_to_isco08', 'MASCO 2020', 'ISCO-08', { 2512: ['2512'], 2521: ['2521'], 2519: ['2519'], 2599: ['2599'] },
      { label: 'code match, not an official table' }),
  ].map((s) => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s)),
})

const hasRequirements = (c) => c !== '15-1299.00'
const chain = (b = bridge()) => makeChain(b, { hasRequirements })

describe('makeChain', () => {
  it('walks the full path 2512-01 to 15-1252.00', () => {
    const r = chain().resolve('2512-01')
    expect(r.isco).toBe('2512')
    expect(r.jobs).toEqual(['15-1252.00'])
    expect(r.missingStep).toBeNull()
    expect(r.path.map((s) => s.id)).toEqual(['masco2020_unit_to_isco08', 'soc2010_to_isco08', 'soc2018_to_soc2010', 'onet_to_soc2018'])
    expect(r.path[0].from).toEqual({ system: 'MASCO 2020', codes: ['2512'] })
    expect(r.path[1].from).toEqual({ system: 'ISCO-08', codes: ['2512'] })
    expect(r.path[1].to).toEqual({ system: 'SOC 2010', codes: ['15-1132'] })
    expect(r.path[3].to).toEqual({ system: 'O*NET-SOC 2019', codes: ['15-1252.00'] })
    expect(r.path[1].source).toEqual({ name: 'soc2010_to_isco08', url: 'https://example.org/soc2010_to_isco08', sha256: 'abc' })
  })

  it('maps one ISCO code to several O*NET jobs, sorted', () => {
    const r = chain().resolve('2521-01')
    expect(r.jobs).toEqual(['15-1242.00', '15-1243.00'])
    expect(r.path[2].to.codes).toEqual(['15-1242', '15-1243'])
  })

  it('reports a pending BLS step', () => {
    const b = bridge({ soc2010_to_isco08: { status: 'pending', source: null, pendingReason: 'BLS file not downloaded yet' } })
    const r = chain(b).resolve('2512-01')
    expect(r.jobs).toEqual([])
    expect(r.isco).toBe('2512')
    expect(r.missingStep).toEqual({ id: 'soc2010_to_isco08', kind: 'pending', from: { system: 'ISCO-08', codes: ['2512'] }, reason: 'BLS file not downloaded yet' })
    expect(r.path.map((s) => s.id)).toEqual(['masco2020_unit_to_isco08'])
  })

  it('reports a MASCO code absent from the ISCO step', () => {
    const r = chain().resolve('9999-01')
    expect(r.isco).toBeNull()
    expect(r.missingStep.id).toBe('masco2020_unit_to_isco08')
    expect(r.missingStep.from).toEqual({ system: 'MASCO 2020', codes: ['9999'] })
    expect(r.missingStep.kind).toBe('no_row')
    expect(r.path).toEqual([])
  })

  it('reports a built step with no link for the code', () => {
    const r = chain().resolve('2519-01')
    expect(r.isco).toBe('2519')
    expect(r.missingStep.id).toBe('soc2010_to_isco08')
    expect(r.missingStep.reason).toBe('ISCO-08 2519 has no row in the BLS ISCO-08 to SOC 2010 crosswalk')
    expect(r.missingStep.kind).toBe('no_row')
  })

  it('reports no_onet_data when only All Other jobs are linked', () => {
    const r = chain().resolve('2599-01')
    expect(r.jobs).toEqual([])
    expect(r.missingStep.id).toBe('no_onet_data')
    expect(r.missingStep.reason).toMatch(/no skill data/)
    expect(r.missingStep.kind).toBe('no_onet_data')
    expect(r.missingStep.from).toEqual({ system: 'O*NET-SOC 2019', codes: ['15-1299.00'] })
  })

  it('builds system labels from system plus version', () => {
    const r = chain().resolve('2512-01')
    expect(r.path.map((s) => [s.from.system, s.to.system])).toEqual([
      ['MASCO 2020', 'ISCO-08'], ['ISCO-08', 'SOC 2010'], ['SOC 2010', 'SOC 2018'], ['SOC 2018', 'O*NET-SOC 2019'],
    ])
  })

  it('labels the MASCO step as a code match', () => {
    const r = chain().resolve('2512-01')
    expect(r.path[0].label).toBe('code match, not an official table')
    expect(r.path[1].label).toBeNull()
  })

  it('handles invalid input and a missing bridge', () => {
    expect(chain().resolve('xx').missingStep).toMatchObject({ id: 'masco2020_unit_to_isco08', kind: 'invalid' })
    expect(makeChain(null, { hasRequirements }).resolve('2512-01').missingStep).toMatchObject({ id: 'masco2020_unit_to_isco08', kind: 'pending' })
  })

  it('has no score-like keys', () => {
    expect(JSON.stringify(chain().resolve('2521-01'))).not.toMatch(/score|weight|rank|opportunit/i)
  })
})
