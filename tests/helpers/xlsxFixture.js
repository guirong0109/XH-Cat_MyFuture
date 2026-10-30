// Builds small synthetic .xlsx buffers (zip with stored entries) for the workbook reader tests.
const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStored(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name)
    const data = Buffer.from(text)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// rows: { [rowNumber]: { [column letters]: string | number | { ss: sharedStringIndex } } }
// string -> inline string, number -> numeric cell, null/undefined -> no cell.
export function sheetXmlFromRows(rows) {
  const body = Object.entries(rows)
    .map(([r, cols]) => {
      const cells = Object.entries(cols)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([c, v]) => {
          if (typeof v === 'number') return `<c r="${c}${r}"><v>${v}</v></c>`
          if (typeof v === 'object') return `<c r="${c}${r}" t="s"><v>${v.ss}</v></c>`
          return `<c r="${c}${r}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${r}">${cells}</row>`
    })
    .join('')
  return `<sheetData>${body}</sheetData>`
}

// sheetXml: the inner <sheetData>...</sheetData> (see sheetXmlFromRows); sharedStrings: raw <si> inner XML strings;
// mergeCells: ['C3:F3', ...].
export function makeXlsx({ sheetXml, sharedStrings = [], mergeCells = [], sheetName = 'Summary' }) {
  const merges = mergeCells.length
    ? `<mergeCells count="${mergeCells.length}">${mergeCells.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`
    : ''
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  return zipStored({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="${ns}">${sharedStrings.map((s) => `<si>${s}</si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="${ns}">${sheetXml}${merges}</worksheet>`
  })
}
