// Minimal zip reader for DOCX files (stored and deflate entries), node:zlib only.
import zlib from 'node:zlib'

export class ZipError extends Error {}

const MAX_ENTRY_BYTES = 20 * 1024 * 1024 // a bigger DOCX part is treated as broken (zip bomb guard)

export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new ZipError('not a zip')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new ZipError('no end record')
  const count = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  const entries = new Map()
  for (let n = 0; n < count; n++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) throw new ZipError('bad central directory')
    const method = buffer.readUInt16LE(at + 10)
    const packedSize = buffer.readUInt32LE(at + 20)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const localAt = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    at += 46 + nameLength + extraLength + commentLength
    entries.set(name, () => {
      if (localAt + 30 > buffer.length || buffer.readUInt32LE(localAt) !== 0x04034b50) throw new ZipError('bad local header')
      const start = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28)
      const packed = buffer.subarray(start, start + packedSize)
      if (packed.length !== packedSize) throw new ZipError('entry cut short')
      if (method === 0) return packed
      if (method === 8) return zlib.inflateRawSync(packed, { maxOutputLength: MAX_ENTRY_BYTES })
      throw new ZipError('unsupported compression')
    })
  }
  return entries
}
