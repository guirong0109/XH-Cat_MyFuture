// Synthetic CV files built with Node only (no real CVs): PDF, DOCX and broken variants.
import zlib from 'node:zlib'

const pdfEscape = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`)

// A one-page PDF with Helvetica text, one line per entry. lines = [] gives a page without text (like a scan).
export function makePdf(lines, { encrypt = false } = {}) {
  const content = lines.length
    ? `BT /F1 11 Tf 14 TL 50 780 Td ${lines.map((line) => `(${pdfEscape(line)}) Tj T*`).join(' ')} ET`
    : '0 0 1 rg 50 50 200 200 re f'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  const encryptRef = encrypt ? ' /Encrypt << /Filter /Standard /V 1 /R 2 /O (x) /U (x) /P -4 >>' : ''
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryptRef} >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

// A minimal deflate zip from { name: string|Buffer }.
export function makeZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const packed = zlib.deflateRawSync(data)
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = zlib.crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, packed)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + packed.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10)
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

const xmlEscape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// paragraphs: strings, or { text, heading: true } for a Heading 1 paragraph.
export function makeDocx(paragraphs) {
  const body = paragraphs.map((p) => {
    const { text, heading } = typeof p === 'string' ? { text: p, heading: false } : p
    const style = heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''
    return `<w:p>${style}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
  }).join('')
  return makeZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  })
}

export const SAMPLE_LINES = [
  'Aina Binti Ahmad (synthetic)',
  'EDUCATION',
  'Diploma in Information Technology, Politeknik Ungku Omar, 2021',
  'SKILLS',
  'Python, Microsoft Excel, Critical Thinking',
  'EXPERIENCE',
  'IT Support Executive, Acme Sdn Bhd, Jan 2022 - Present',
]

export const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
export const DOC_BYTES = Buffer.from('d0cf11e0a1b11ae1000000', 'hex')
