import { describe, it, expect } from 'vitest'
import { indexRoute, fieldsFor, fieldsReachingOnet, educationFor } from '../../shared/pathway/route.js'

const isced = [
  { isced_code: '0613', isced_title: 'Software and applications development', cip_code: '11.0802', cip_title: 'Data Modeling', partial: 'N', note: '' },
  { isced_code: '0611', isced_title: 'Computer use', cip_code: '11.0802', cip_title: 'Data Modeling', partial: 'Y', note: '' },
  { isced_code: '0613', isced_title: 'Software and applications development', cip_code: '11.0701', cip_title: 'Computer Science', partial: 'N', note: '' },
  { isced_code: '0999', isced_title: 'Unreached field', cip_code: '99.9999', cip_title: 'Nothing', partial: 'N', note: '' },
]
const cip = [
  { cip_code: '11.0802', cip_title: 'Data Modeling', code: '15-1242.00', title: 'Database Administrators' },
  { cip_code: '11.0701', cip_title: 'Computer Science', code: '15-1242.00', title: 'Database Administrators' },
]
const fields = [
  { code: '0611', title: 'Computer use', broad_code: '06', broad_title: 'ICT' },
  { code: '0613', title: 'Software and applications development and analysis', broad_code: '06', broad_title: 'ICT' },
  { code: '0999', title: 'Unreached field', broad_code: '09', broad_title: 'X' },
]
const index = indexRoute({ isced, cip, fields })

describe('fieldsFor', () => {
  it('lists the fields of study for a job, sorted by code', () => {
    const f = fieldsFor(index, '15-1242.00', ['0613'])
    expect(f.map((x) => x.code)).toEqual(['0611', '0613'])
    expect(f[0].partial).toBe(true)
    expect(f[1].partial).toBe(false)
    expect(f[1].title).toBe('Software and applications development and analysis')
    expect(f[1].cips.map((c) => c.code).sort()).toEqual(['11.0701', '11.0802'])
    expect(f[1].cips.find((c) => c.code === '11.0802')).toEqual({ code: '11.0802', title: 'Data Modeling', partial: false })
    expect(f.map((x) => x.yours)).toEqual([false, true])
  })
  it('gives an empty list for an unknown job', () => {
    expect(fieldsFor(index, '00-0000.00', [])).toEqual([])
  })
})

describe('fieldsReachingOnet', () => {
  it('lists fields with a CIP that has an O*NET job', () => {
    expect(fieldsReachingOnet(index)).toEqual(['0611', '0613'])
  })
})

describe('educationFor', () => {
  const row = (code, category, percent, suppress = 'N') => ({ code, category, label: `Level ${category}`, percent, suppress })
  it('keeps ties at the top and sorts all by category', () => {
    const r = educationFor([row('J', '6', '40.00'), row('J', '7', '40.00'), row('J', '3', '20.00')], 'J')
    expect(r.top.map((x) => x.category)).toEqual([6, 7])
    expect(r.top[0]).toEqual({ category: 6, label: 'Level 6', percent: 40 })
    expect(r.all.map((x) => x.category)).toEqual([3, 6, 7])
    expect(r.suppressedLeftOut).toBe(0)
  })
  it('leaves out and counts suppressed rows', () => {
    const r = educationFor([row('J', '6', '90.00'), row('J', '2', '99.00', 'Y')], 'J')
    expect(r.all.map((x) => x.category)).toEqual([6])
    expect(r.suppressedLeftOut).toBe(1)
  })
  it('is null with only suppressed rows or an unknown job', () => {
    expect(educationFor([row('J', '6', '90.00', 'Y')], 'J')).toBeNull()
    expect(educationFor([row('J', '6', '90.00')], 'K')).toBeNull()
  })
})
