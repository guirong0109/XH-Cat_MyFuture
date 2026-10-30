import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { readWorkbook } from '../../server/radar/xlsx.js'
import { parseDosmJmi } from '../../server/radar/dosmTable.js'
import { makeXlsx, sheetXmlFromRows } from '../helpers/xlsxFixture.js'

const real = await readFile('data/radar/source/dosm-jmi-2026q2.xlsx')

const GROUPS = [
  'Managers',
  'Professionals',
  'Technicians and associate professionals',
  'Clerical support workers',
  'Service and sales workers',
  'Skilled agricultural, forestry, livestock and fishery workers',
  'Craft and related trades workers',
  'Plant and machine operators and assemblers',
  'Elementary Occupations'
]
const COLS = ['C', 'D', 'E', 'F', 'G', 'H', 'I'] // 2020 Q1..Q4, 2021 Q1, Q2, Q3 (Q3 not yet published)

function rowOf(values) {
  return Object.fromEntries(COLS.map((c, i) => [c, values[i]]))
}

// A small table in the DOSM layout: title, blank row, years (merged), quarters, total, 9 groups, unclassified.
function layout({ groupValues = {}, drop = [], extraRows = {}, title = 'Table 2: Number of Job Offerings Advertised Online by Major Group Occupation', quarters, ss } = {}) {
  const rows = {
    1: { B: title },
    3: { C: '2020', G: '2021' },
    4: { B: 'Occupation', ...rowOf(quarters ?? ['Q1', 'Q2', 'Q3', 'Q4', 'Q1', 'Q2', 'Q3']) },
    5: { B: 'Jumlah', ...rowOf([10, 20, 30, 40, 50, 60, null]) }
  }
  GROUPS.forEach((name, i) => {
    if (drop.includes(i)) return
    const label = ss && ss[i] ? ss[i] : name
    rows[6 + i] = { B: label, ...rowOf(groupValues[i] ?? [1, 2, 3, 4, 5, 6, null]) }
  })
  rows[15] = { B: 'Unclassified', ...rowOf(['-', '-', 0, 0, 0, 0, null]) }
  rows[16] = { B: 'Source: Big Data Analytics: Job Market Insights, DOSM' }
  Object.assign(rows, extraRows)
  return rows
}
const build = (rows, opts = {}) =>
  makeXlsx({ sheetXml: sheetXmlFromRows(rows), mergeCells: ['C3:F3', 'G3:I3'], ...opts })

describe('parseDosmJmi on the real DOSM Q2 2026 workbook', () => {
  it('reads the real DOSM table by cell address', () => {
    const t = parseDosmJmi(real)
    expect(t.periods[0]).toBe('2019 Q3')
    expect(t.periods.at(-1)).toBe('2026 Q2')
    expect(t.periods).toHaveLength(28)
    expect(t.total.at(-1)).toBe(555509)
    expect(t.groups['2'].values.at(-1)).toBe(285907)
    expect(t.groups['3'].values.at(-1)).toBe(86512) // a positional reader got this wrong
    expect(t.groups['1'].values.at(-1)).toBe(87950)
    expect(t.total[t.periods.indexOf('2025 Q3')]).toBe(588148)
    expect(t.groups['3'].name).toBe('Technicians and associate professionals')
    expect(Object.keys(t.groups)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(t.monthly).toBeUndefined()
    for (const g of Object.values(t.groups)) expect(g.values).toHaveLength(t.periods.length)
  })
})

describe('parseDosmJmi on synthetic layouts', () => {
  it('"-" and empty cells become null without shifting later cells', () => {
    const rows = layout({ groupValues: { 1: [undefined, '-', 7, 8, 9, 10, null] } })
    const t = parseDosmJmi(build(rows))
    expect(t.groups['2'].values).toEqual([null, null, 7, 8, 9, 10])
    expect(t.unclassified).toEqual([null, null, 0, 0, 0, 0])
  })

  it('merged year headers fill the quarter columns, and unpublished quarters are dropped', () => {
    const t = parseDosmJmi(build(layout()))
    expect(t.periods).toEqual(['2020 Q1', '2020 Q2', '2020 Q3', '2020 Q4', '2021 Q1', '2021 Q2'])
    expect(t.total).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('rich-text and entity-escaped shared strings are joined', () => {
    const rows = layout()
    rows[7].B = { ss: 0 }
    const xlsx = build(rows, { sharedStrings: ['<r><t>Profes</t></r><r><t>sionals</t></r>'] })
    expect(parseDosmJmi(xlsx).groups['2'].name).toBe('Professionals')
    const wb = readWorkbook(build(rows, { sharedStrings: ['<r><t>A &amp; B</t></r><phoneticPr/>'] }))
    expect(wb.sheets[0].cell('B7')).toBe('A & B')
  })

  it('matches group names by case-insensitive prefix', () => {
    const rows = layout()
    rows[6].B = 'MANAGERS (all)'
    expect(parseDosmJmi(build(rows)).groups['1'].name).toBe('MANAGERS (all)')
  })

  it('exposes cells by address, merged values and row numbers', () => {
    const wb = readWorkbook(build(layout()))
    const sheet = wb.sheets[0]
    expect(sheet.name).toBe('Summary')
    expect(sheet.cell('B4')).toBe('Occupation')
    expect(sheet.cell('E3')).toBe('2020') // inside C3:F3
    expect(sheet.cell('A1')).toBeNull()
    expect(sheet.merges).toEqual(['C3:F3', 'G3:I3'])
    expect(sheet.rows).toContain(5)
  })

  it('rejects unexpected layouts', () => {
    const noTable2 = build(layout({ title: 'Table 1: Something else' }))
    const noQuarterRow = build(layout({ quarters: ['2020', '2021', 'x', 'y', 'z', 'w', 'v'] }))
    const missingGroup = build(layout({ drop: [3] }))
    const unknownGroupRow = build(layout({ extraRows: { 15: { B: 'Astronauts', C: 1 }, 16: { B: 'Unclassified', C: 1 } } }))
    const textValue = build(layout({ groupValues: { 0: [1, 'n/a', 3, 4, 5, 6, null] } }))
    const noSheet = makeXlsx({ sheetXml: '<sheetData/>' })
    for (const bad of [noTable2, noQuarterRow, missingGroup, unknownGroupRow, textValue, noSheet]) {
      expect(() => parseDosmJmi(bad)).toThrow(expect.objectContaining({ code: 'dosm_layout_unexpected' }))
    }
    expect(() => readWorkbook(Buffer.from('not a zip'))).toThrow(expect.objectContaining({ code: 'not_xlsx' }))
    expect(() => parseDosmJmi(Buffer.from('not a zip'))).toThrow(expect.objectContaining({ code: 'not_xlsx' }))
  })
})
