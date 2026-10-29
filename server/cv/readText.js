// Reads the text lines of a validated CV. The text is untrusted: nothing here decides what it means.
// Returns { ok:true, lines, headings } or { ok:false, code: 'no_text' | 'scanned_no_ocr' | 'corrupted' | 'encrypted' }.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZipEntries } from './zip.js'

// pdfjs in Node needs its standard font files (Helvetica and co.) to read text.
// pdfjs wants forward slashes and a trailing slash.
const FONTS = `${path.join(path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))), 'standard_fonts').split(path.sep).join('/')}/`

export const MAX_LINES = 300
export const MAX_CHARS = 20000
const MIN_LETTERS = 20

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)

// Strip bullets and numbering; drop lines with fewer than 3 letters.
function cleanLine(raw) {
  const line = String(raw).replace(/^[\s\-–—•*·●▪◦▶>]+/u, '').replace(/^\d+[.)]\s+/, '').replace(/\s+/g, ' ').trim()
  return (line.match(/\p{L}/gu) ?? []).length >= 3 ? line : null
}

function docxParagraphs(buffer) {
  const xml = readZipEntries(buffer).get('word/document.xml')().toString('utf8')
  const out = []
  for (const [, paragraph] of xml.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
    const style = /<w:pStyle w:val="([^"]+)"/.exec(paragraph)?.[1] ?? ''
    const text = (paragraph.replace(/<w:(tab|br)\b[^>]*\/>/g, '<w:t> </w:t>').match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) ?? [])
      .map((part) => decode(part.replace(/<[^>]+>/g, ''))).join('')
    out.push({ text, heading: /^(Heading|Title)/i.test(style) })
  }
  return out
}

async function pdfParagraphs(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: FONTS, verbosity: 0 })
  const doc = await task.promise
  const out = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const { items } = await (await doc.getPage(n)).getTextContent()
      let line = ''
      let lastY = null
      for (const item of items) {
        if (typeof item.str !== 'string') continue
        const y = item.transform?.[5]
        if (lastY !== null && y !== undefined && y !== lastY && line) {
          out.push({ text: line, heading: false })
          line = ''
        }
        line += item.str
        if (y !== undefined) lastY = y
        if (item.hasEOL) {
          out.push({ text: line, heading: false })
          line = ''
          lastY = null
        }
      }
      if (line) out.push({ text: line, heading: false })
    }
  } finally {
    await task.destroy()
  }
  return out
}

export async function readText(buffer, type) {
  let paragraphs
  try {
    paragraphs = type === 'pdf' ? await pdfParagraphs(buffer) : docxParagraphs(buffer)
  } catch (error) {
    return { ok: false, code: error?.name === 'PasswordException' ? 'encrypted' : 'corrupted' }
  }
  const lines = []
  const headings = []
  let chars = 0
  for (const paragraph of paragraphs) {
    const line = cleanLine(paragraph.text)
    if (!line) continue
    if (lines.length >= MAX_LINES || chars + line.length > MAX_CHARS) break
    if (paragraph.heading) headings.push(lines.length)
    lines.push(line)
    chars += line.length
  }
  const letters = lines.join('').match(/\p{L}/gu)?.length ?? 0
  if (letters < MIN_LETTERS) return { ok: false, code: type === 'pdf' ? 'scanned_no_ocr' : 'no_text' }
  return type === 'pdf' ? { ok: true, lines } : { ok: true, lines, headings }
}
