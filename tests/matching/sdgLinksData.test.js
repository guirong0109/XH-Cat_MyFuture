// SDG team-draft links (Task 8): every MASCO sub-major group and every O*NET skill/knowledge item used for career
// matching has at least one link to an official SDG target, each with a short reason in English, BM and Chinese.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readJson = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'))
const data = readJson('data/sdg/links.json')
const roles = readJson('data/emasco/role_details.json').roles
const targets = readJson('data/sdg/targets.json').targets

// Controller ruling for the matching module: no key may suggest a score, weight, rank or opportunity.
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i

const groupCodes = [...new Set(roles.map((r) => r.code.slice(0, 2)))].sort()
const tsv = readFileSync(new URL('../../data/onet/requirements.tsv', import.meta.url), 'utf8').trim().split(/\r?\n/)
const header = tsv[0].split('\t')
const kindAt = header.indexOf('kind')
const idAt = header.indexOf('element_id')
const nameAt = header.indexOf('element')
const elements = new Map()
for (const line of tsv.slice(1)) {
  const cols = line.split('\t')
  elements.set(`${cols[kindAt]}:${cols[idAt]}`, cols[nameAt])
}

function keysDeep(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      keysDeep(v, out)
    }
  }
  return out
}

describe('data/sdg/links.json', () => {
  it('has the schema version and team-draft status', () => {
    expect(data.schemaVersion).toBe('sdg-links/v1')
    expect(data.status).toBe('team draft')
    expect(Array.isArray(data.links)).toBe(true)
  })

  it('expects 48 groups and 68 elements in the inputs', () => {
    expect(groupCodes).toHaveLength(48)
    expect(elements.size).toBe(68)
  })

  it('links every 2-digit MASCO group at least once, with name null (no invented names)', () => {
    const linked = new Set(data.links.filter((l) => l.kind === 'masco_submajor').map((l) => l.code))
    expect(groupCodes.filter((c) => !linked.has(c))).toEqual([])
    for (const l of data.links.filter((x) => x.kind === 'masco_submajor')) {
      expect(groupCodes).toContain(l.code)
      expect(l.name).toBeNull()
      expect(l.id).toBe(`g${l.code}-${l.target}`)
    }
  })

  it('links every O*NET element at least once, with the O*NET name', () => {
    const linked = new Set(data.links.filter((l) => l.kind === 'onet_element').map((l) => l.code))
    expect([...elements.keys()].filter((c) => !linked.has(c))).toEqual([])
    for (const l of data.links.filter((x) => x.kind === 'onet_element')) {
      expect(elements.has(l.code)).toBe(true)
      expect(l.name).toBe(elements.get(l.code))
      expect(l.id).toBe(`${l.code}-${l.target}`)
    }
  })

  it('uses only the two kinds', () => {
    for (const l of data.links) expect(['masco_submajor', 'onet_element']).toContain(l.kind)
  })

  it('links only to targets in targets.json', () => {
    const codes = new Set(targets.map((t) => t.code))
    expect(data.links.filter((l) => !codes.has(l.target)).map((l) => l.id)).toEqual([])
  })

  it('gives every link a non-empty reason in en, ms and zh, each at most 160 characters', () => {
    for (const l of data.links) {
      for (const lang of ['en', 'ms', 'zh']) {
        const text = l.reason?.[lang]
        expect(typeof text, `${l.id} ${lang}`).toBe('string')
        expect(text.trim().length, `${l.id} ${lang}`).toBeGreaterThan(0)
        expect([...text].length, `${l.id} ${lang}`).toBeLessThanOrEqual(160)
      }
    }
  })

  it('has unique ids', () => {
    const ids = data.links.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no forbidden key anywhere', () => {
    expect(keysDeep(data).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })
})
