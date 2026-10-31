// Small CSV reader for the organisation roster: quotes, doubled quotes, CRLF.
export class RosterError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'RosterError'
    this.code = code
  }
}

// Like parseCsv, but each row also carries the file line where it starts (first line = 1).
export function parseCsvLines(text) {
  const rows = []
  let line = 1
  let startLine = 1
  let row = []
  let field = ''
  let inQuotes = false
  let touched = false // anything seen on the current line

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push({ cells: row, line: startLine })
    row = []
    touched = false
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (!touched && c !== '\n' && c !== '\r') startLine = line
    if (c === '\n') line++
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') { inQuotes = true; touched = true }
    else if (c === ',') { endField(); touched = true }
    else if (c === '\r') { /* dropped; \n ends the row */ }
    else if (c === '\n') { if (touched) endRow() }
    else { field += c; touched = true }
  }
  if (inQuotes) throw new RosterError('not_csv', 'unclosed quote')
  if (touched) endRow()
  return rows
}

export function parseCsv(text) {
  return parseCsvLines(text).map((r) => r.cells)
}
