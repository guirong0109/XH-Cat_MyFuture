// Minimal .xlsx reader: sheets, shared/inline strings, merged ranges. node only, regex XML like server/cv/.
import { readZipEntries } from '../cv/zip.js'

export class WorkbookError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'WorkbookError'
    this.code = code
  }
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return XML_ENTITIES[name.toLowerCase()] ?? whole
  })
}

// All visible text of a <si> or <is> element: plain <t> and rich-text <r><t> runs, without phonetic hints.
function joinText(xml) {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of clean.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += decode(m[1] ?? '')
  return out
}

function attr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)
  return m ? decode(m[1]) : null
}

export function columnIndex(letters) {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function columnLetters(index) {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function splitRef(ref) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref)
  return m ? { col: columnIndex(m[1]), row: Number(m[2]) } : null
}

function entryText(entries, name) {
  const get = entries.get(name)
  if (!get) return null
  try {
    return get().toString('utf8')
  } catch {
    throw new WorkbookError('not_xlsx', 'a workbook part could not be read')
  }
}

function readSharedStrings(entries) {
  const xml = entryText(entries, 'xl/sharedStrings.xml')
  if (!xml) return []
  const strings = []
  for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) strings.push(joinText(m[1] ?? ''))
  return strings
}

function readSheet(name, xml, strings) {
  const cells = new Map()
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], 'r')
    const body = m[2]
    if (!ref || !body) continue
    const type = attr(m[1], 't')
    let value = null
    if (type === 'inlineStr') {
      value = joinText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
    } else {
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)
      if (v) value = type === 's' ? (strings[Number(v[1])] ?? null) : decode(v[1])
    }
    if (value !== null && value !== '') cells.set(ref.toUpperCase(), value)
  }

  const merges = []
  for (const m of xml.matchAll(/<mergeCell\s[^>]*?ref="([^"]+)"/g)) merges.push(m[1].toUpperCase())
  // A merged range shows its top-left value in every cell it covers.
  for (const range of merges) {
    const [from, to = from] = range.split(':')
    const a = splitRef(from)
    const b = splitRef(to)
    if (!a || !b) continue
    const value = cells.get(from)
    if (value === undefined) continue
    for (let row = a.row; row <= b.row; row++) {
      for (let col = a.col; col <= b.col; col++) {
        const ref = columnLetters(col) + row
        if (!cells.has(ref)) cells.set(ref, value)
      }
    }
  }

  const rows = [...new Set([...cells.keys()].map((ref) => splitRef(ref).row))].sort((x, y) => x - y)
  return { name, cell: (ref) => cells.get(String(ref).toUpperCase()) ?? null, rows, merges }
}

export function readWorkbook(buffer) {
  let entries
  try {
    entries = readZipEntries(buffer)
  } catch {
    throw new WorkbookError('not_xlsx', 'not a zip file')
  }
  const workbookXml = entryText(entries, 'xl/workbook.xml')
  if (!workbookXml) throw new WorkbookError('not_xlsx', 'no xl/workbook.xml')

  const targets = new Map()
  const relsXml = entryText(entries, 'xl/_rels/workbook.xml.rels') ?? ''
  for (const m of relsXml.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const id = attr(m[1], 'Id')
    const target = attr(m[1], 'Target')
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }

  const strings = readSharedStrings(entries)
  const sheets = []
  for (const m of workbookXml.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const name = attr(m[1], 'name')
    const path = targets.get(attr(m[1], 'r:id'))
    const xml = path ? entryText(entries, path) : null
    if (name === null || xml === null) continue
    sheets.push(readSheet(name, xml, strings))
  }
  return { sheets }
}
