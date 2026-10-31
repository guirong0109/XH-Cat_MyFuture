// Study Pathway team picks (Task 9): the real data files load, items are covered or reported, dates are real.
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coverage } from '../../shared/pathway/picks.js'
import { loadPathwayData } from '../../server/pathway/data.js'

const REPORT = new URL('../../docs/pathway/fill-report.md', import.meta.url)

// First table column of every data row in the fill report.
function reportedKeys() {
  if (!existsSync(REPORT)) return new Set()
  const keys = new Set()
  for (const line of readFileSync(REPORT, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue
    const first = line.split('|')[1]?.trim()
    if (first && /^(el|kn|field):/.test(first)) keys.add(first)
  }
  return keys
}

describe('Study Pathway team picks data', async () => {
  const data = await loadPathwayData('data')

  it('loads the real data files without error', () => {
    expect(data.picks.length).toBeGreaterThan(0)
    expect(data.itemKeys.size).toBe(68)
  })

  it('every skill and knowledge item has a course pick or is in the fill report', () => {
    const { missing } = coverage(data.picks, data.itemKeys, data.fieldCodes, reportedKeys())
    expect(missing.filter((k) => k.startsWith('el:') || k.startsWith('kn:'))).toEqual([])
  })

  it('every pick was checked on a real date, not after today', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const p of data.picks) {
      expect(Number.isNaN(Date.parse(p.checkedAt)), p.id).toBe(false)
      expect(p.checkedAt <= today, p.id).toBe(true)
    }
  })

  it('118 fields of study reach O*NET', () => {
    expect(data.fieldCodes.size).toBe(118)
  })
})
