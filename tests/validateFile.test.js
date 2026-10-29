import { describe, expect, it } from 'vitest'
import { validateFile } from '../server/cv/validateFile.js'
import { readZipEntries } from '../server/cv/zip.js'
import { DOC_BYTES, PNG_BYTES, SAMPLE_LINES, makeDocx, makePdf, makeZip } from './helpers/cvFixtures.js'

const MB = 1024 * 1024
const check = (buffer) => validateFile(buffer, { maxBytes: 10 * MB })

describe('validateFile', () => {
  it('valid pdf', () => expect(check(makePdf(SAMPLE_LINES))).toEqual({ ok: true, type: 'pdf' }))
  it('valid docx', () => expect(check(makeDocx(SAMPLE_LINES))).toEqual({ ok: true, type: 'docx' }))
  it('png bytes are unsupported_type', () => expect(check(PNG_BYTES)).toEqual({ ok: false, code: 'unsupported_type' }))
  it('legacy .doc (OLE header) is unsupported_type', () => expect(check(DOC_BYTES)).toEqual({ ok: false, code: 'unsupported_type' }))
  it('encrypted pdf', () => expect(check(makePdf(SAMPLE_LINES, { encrypt: true }))).toEqual({ ok: false, code: 'encrypted' }))

  it('truncated pdf is corrupted', () => {
    const pdf = makePdf(SAMPLE_LINES)
    expect(check(pdf.subarray(0, pdf.length - 40))).toEqual({ ok: false, code: 'corrupted' })
  })

  it('zip without word/document.xml is unsupported_type', () => {
    expect(check(makeZip({ 'readme.txt': 'hello' }))).toEqual({ ok: false, code: 'unsupported_type' })
  })

  it('broken zip is corrupted', () => {
    const docx = makeDocx(SAMPLE_LINES)
    expect(check(docx.subarray(0, docx.length - 30))).toEqual({ ok: false, code: 'corrupted' })
  })

  it('11 MB is too_large at a 10 MB maximum', () => {
    expect(check(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * MB)]))).toEqual({ ok: false, code: 'too_large' })
  })

  it('empty or missing buffer is unsupported_type and never throws', () => {
    expect(check(Buffer.alloc(0))).toEqual({ ok: false, code: 'unsupported_type' })
    expect(check(undefined)).toEqual({ ok: false, code: 'unsupported_type' })
  })
})

describe('readZipEntries', () => {
  it('reads deflated entries back', () => {
    const entries = readZipEntries(makeZip({ 'a.txt': 'hello zip' }))
    expect(entries.get('a.txt')().toString()).toBe('hello zip')
  })
})
