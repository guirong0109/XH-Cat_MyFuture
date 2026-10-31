// Study Pathway team picks (Task 9): the real data files load, items are covered or reported, dates are real, and
// every fill report row names its sources and date.
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coverage } from '../../shared/pathway/picks.js'
import { educationFor } from '../../shared/pathway/route.js'
import { loadPathwayData } from '../../server/pathway/data.js'

const REPORT = new URL('../../docs/pathway/fill-report.md', import.meta.url)

const BODIES_HEADING = '## Professional bodies not linked'

// Data rows of the fill report's tables as cell arrays, split into the coverage table(s) and the
// professional-bodies table (which coverage ignores).
function reportRows() {
  const rows = { coverage: [], bodies: [] }
  if (!existsSync(REPORT)) return rows
  let section = 'coverage'
  for (const line of readFileSync(REPORT, 'utf8').split(/\r?\n/)) {
    if (line.startsWith(BODIES_HEADING)) section = 'bodies'
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (/^(el|kn|field):/.test(cells[0] ?? '')) rows[section].push(cells)
  }
  return rows
}

// First column of every coverage row in the fill report.
function reportedKeys() {
  return new Set(reportRows().coverage.map((cells) => cells[0]))
}

// Today in the machine's local time zone, as YYYY-MM-DD.
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('Study Pathway team picks data', async () => {
  const data = await loadPathwayData('data')

  it('loads the real data files without error', () => {
    expect(data.picks.length).toBeGreaterThan(0)
    expect(data.itemKeys.size).toBe(68)
  })

  it('the four jobs whose kept education rows are all 0% show no "In the US" line', () => {
    for (const code of ['25-1125.00', '29-1229.06', '47-5013.00', '51-4051.00']) expect(educationFor(data.education, code)).toBeNull()
  })

  it('every skill and knowledge item has a course pick or is in the fill report', () => {
    const { missing } = coverage(data.picks, data.itemKeys, data.fieldCodes, reportedKeys())
    expect(missing.filter((k) => k.startsWith('el:') || k.startsWith('kn:'))).toEqual([])
  })

  it('every field of study has an accredited programme or is in the fill report', () => {
    const { missing } = coverage(data.picks, data.itemKeys, data.fieldCodes, reportedKeys())
    expect(missing).toEqual([])
  })

  it('every pick was checked on a real date, not after today', () => {
    const today = localToday()
    for (const p of data.picks) {
      expect(Number.isNaN(Date.parse(p.checkedAt)), p.id).toBe(false)
      expect(p.checkedAt <= today, p.id).toBe(true)
    }
  })

  it('every fill report row names the sites searched and a real date, not after today', () => {
    const { coverage: rows, bodies } = reportRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const cells of [...rows, ...bodies]) {
      expect(cells.length, cells[0]).toBe(5)
      const [key, , sites, date] = cells
      expect(sites, `${key} sites searched`).not.toBe('')
      expect(date, `${key} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(date <= localToday(), `${key} date`).toBe(true)
    }
  })

  it('no field in the fill report also has an accredited programme pick', () => {
    const accredited = new Set(data.picks.filter((p) => p.type === 'programme' && p.kind === 'accredited').map((p) => p.for))
    expect([...reportedKeys()].filter((k) => accredited.has(k))).toEqual([])
  })

  it('118 fields of study reach O*NET', () => {
    expect(data.fieldCodes.size).toBe(118)
  })
})
