// Reads Table 2 (job offerings advertised online by major occupation group, per quarter) from the
// DOSM "Big Data Analytics: Job Market Insights" workbook. Cells are read by address, never by position.
import { readWorkbook, columnLetters } from './xlsx.js'

export class DosmLayoutError extends Error {
  constructor(detail) {
    super(`DOSM table layout unexpected: ${detail}`)
    this.name = 'DosmLayoutError'
    this.code = 'dosm_layout_unexpected'
    this.detail = detail
  }
}

const GROUP_PREFIXES = [
  ['managers', '1'],
  ['professionals', '2'],
  ['technicians', '3'],
  ['clerical', '4'],
  ['service', '5'],
  ['skilled agricultural', '6'],
  ['craft', '7'],
  ['plant', '8'],
  ['elementary', '9']
]
const LABEL_COLUMN = 'B'
const FIRST_SEARCH_COLUMN = 2 // quarters never start left of column C
const MAX_COLUMN = 200
const HEADER_SEARCH_ROWS = 8

function parseValue(raw, where) {
  if (raw === null) return null
  const text = raw.trim()
  if (text === '' || text === '-') return null
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new DosmLayoutError(`non-numeric value at ${where}`)
  return Number(text)
}

function findTable(workbook) {
  for (const sheet of workbook.sheets) {
    for (const row of sheet.rows) {
      const title = sheet.cell(LABEL_COLUMN + row)
      if (title && /^table\s*2\b/i.test(title.trim()) && /major group occupation/i.test(title)) return { sheet, titleRow: row }
    }
  }
  return null
}

export function parseDosmJmi(buffer) {
  const workbook = readWorkbook(buffer)
  if (!workbook.sheets.length) throw new DosmLayoutError('no sheet')
  const found = findTable(workbook)
  if (!found) throw new DosmLayoutError('no Table 2 title for major group occupation')
  const { sheet, titleRow } = found

  // Quarter header row: the first row below the title with quarter labels (Q1..Q4) in a run of columns.
  let quarterRow = null
  let firstCol = -1
  for (let row = titleRow + 1; row <= titleRow + HEADER_SEARCH_ROWS && quarterRow === null; row++) {
    for (let col = FIRST_SEARCH_COLUMN; col < MAX_COLUMN; col++) {
      if (/^Q[1-4]$/i.test((sheet.cell(columnLetters(col) + row) ?? '').trim())) {
        quarterRow = row
        firstCol = col
        break
      }
    }
  }
  if (quarterRow === null) throw new DosmLayoutError('no quarter header row')

  const yearRow = quarterRow - 1
  const columns = []
  for (let col = firstCol; col < MAX_COLUMN; col++) {
    const label = (sheet.cell(columnLetters(col) + quarterRow) ?? '').trim()
    if (!/^Q[1-4]$/i.test(label)) break
    // A year written once over the first quarter of a block carries right (merged ranges already fill).
    // A new year must be written (or merged) over its Q1: never guess the rollover.
    const own = (sheet.cell(columnLetters(col) + yearRow) ?? '').trim()
    if (!own && label.toUpperCase() === 'Q1') throw new DosmLayoutError(`year missing at Q1 (${columnLetters(col)}${yearRow})`)
    const year = own || (columns.at(-1)?.year ?? '')
    if (!/^\d{4}$/.test(year)) throw new DosmLayoutError(`no year above ${columnLetters(col)}${quarterRow}`)
    columns.push({ col, year, period: `${year} ${label.toUpperCase()}` })
  }
  // Each period must be exactly the quarter after the one before it.
  for (let i = 1; i < columns.length; i++) {
    const [py, pq] = columns[i - 1].period.split(' Q').map(Number)
    const next = pq === 4 ? `${py + 1} Q1` : `${py} Q${pq + 1}`
    if (columns[i].period !== next) {
      throw new DosmLayoutError(`quarters out of order or repeated: ${columns[i - 1].period} then ${columns[i].period}`)
    }
  }

  const series = {}
  const groups = {}
  for (let row = quarterRow + 1; row < quarterRow + 40; row++) {
    const label = (sheet.cell(LABEL_COLUMN + row) ?? '').trim()
    if (!label || /^(source|note)/i.test(label)) break
    const lower = label.toLowerCase()
    const values = columns.map(({ col }) => parseValue(sheet.cell(columnLetters(col) + row), columnLetters(col) + row))
    if (lower === 'jumlah' || lower === 'total') series.total = values
    else if (lower === 'unclassified') series.unclassified = values
    else {
      const match = GROUP_PREFIXES.find(([prefix]) => lower.startsWith(prefix))
      if (!match) throw new DosmLayoutError(`unknown group row "${label}"`)
      if (groups[match[1]]) throw new DosmLayoutError(`duplicate group: "${label}" and "${groups[match[1]].name}"`)
      groups[match[1]] = { name: label, values }
    }
  }
  if (!series.total) throw new DosmLayoutError('no total row (Jumlah)')
  for (const [prefix, code] of GROUP_PREFIXES) {
    if (!groups[code]) throw new DosmLayoutError(`group missing: ${prefix}`)
  }

  // Quarters after the last published total are empty placeholders: drop them.
  let last = -1
  series.total.forEach((value, i) => {
    if (value !== null) last = i
  })
  if (last < 0) throw new DosmLayoutError('total row has no values')
  const cut = (values) => values.slice(0, last + 1)
  const orderedGroups = {}
  for (const [, code] of GROUP_PREFIXES) orderedGroups[code] = { name: groups[code].name, values: cut(groups[code].values) }

  return {
    periods: columns.slice(0, last + 1).map((c) => c.period),
    total: cut(series.total),
    unclassified: cut(series.unclassified ?? columns.map(() => null)),
    groups: orderedGroups
  }
}
