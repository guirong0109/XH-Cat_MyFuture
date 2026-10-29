// What an uploaded CV is, decided from its bytes and never from its name. Never throws.
// Codes: unsupported_type, too_large, encrypted, corrupted. (no_text and scanned_no_ocr are decided when reading.)
import { readZipEntries } from './zip.js'

const PDF_MAGIC = Buffer.from('%PDF-')
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

export function validateFile(buffer, { maxBytes }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, code: 'unsupported_type' }
  if (buffer.length > maxBytes) return { ok: false, code: 'too_large' }

  if (buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    // A complete PDF ends with %%EOF (a little trailing data is allowed).
    if (!buffer.subarray(Math.max(0, buffer.length - 1024)).includes('%%EOF')) return { ok: false, code: 'corrupted' }
    if (buffer.includes('/Encrypt')) return { ok: false, code: 'encrypted' }
    return { ok: true, type: 'pdf' }
  }

  if (buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    let entries
    try {
      entries = readZipEntries(buffer)
    } catch {
      return { ok: false, code: 'corrupted' }
    }
    if (!entries.has('word/document.xml')) return { ok: false, code: 'unsupported_type' }
    return { ok: true, type: 'docx' }
  }

  // Legacy .doc and password-protected Office files are OLE containers: not supported.
  return { ok: false, code: 'unsupported_type' }
}
