// Read-only RadarStore over a folder (the built Radar data shipped with the app). Writes are refused.
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { StoreError } from '../../store/d1.js'

async function walk(dir, base, out) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw new StoreError('store_unavailable')
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel, out)
    else out.push(rel)
  }
}

export function createFileStore(dir) {
  const root = path.resolve(dir)
  const resolve = (key) => {
    const full = path.resolve(root, key)
    if (full !== root && !full.startsWith(root + path.sep)) throw new StoreError('not_allowed')
    return full
  }
  return {
    async get(key) {
      let bytes
      try {
        bytes = await readFile(resolve(key))
      } catch (error) {
        if (error instanceof StoreError) throw error
        if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'ENOTDIR') return null
        throw new StoreError('store_unavailable')
      }
      return { bytes, etag: `"${createHash('sha256').update(bytes).digest('hex')}"` }
    },
    async put() {
      throw new StoreError('read_only')
    },
    async list(prefix) {
      const all = []
      await walk(root, '', all)
      return all.filter((key) => key.startsWith(prefix)).sort()
    },
    async delete() {
      throw new StoreError('read_only')
    },
  }
}
