// In-memory RadarStore (tests, demo). Etags change on every put.
import { StoreError } from '../../store/d1.js'

export function createMemoryStore() {
  const items = new Map()
  let counter = 0
  return {
    async get(key) {
      const item = items.get(key)
      return item ? { bytes: Buffer.from(item.bytes), etag: item.etag } : null
    },
    async put(key, bytes, { contentType, ifMatch, ifNoneMatch } = {}) {
      const current = items.get(key)
      if (ifNoneMatch === '*' && current) throw new StoreError('precondition_failed')
      if (ifMatch && (!current || current.etag !== ifMatch)) throw new StoreError('precondition_failed')
      counter += 1
      const etag = `"m${counter}"`
      items.set(key, { bytes: Buffer.from(bytes), etag, contentType })
      return { etag }
    },
    async list(prefix) {
      return [...items.keys()].filter((key) => key.startsWith(prefix)).sort()
    },
    async delete(key) {
      items.delete(key)
    },
  }
}
