// RadarStore over the R2 client (server/store/r2.js): same interface as the memory and file stores.
export function createR2RadarStore(r2) {
  return {
    async get(key) {
      const found = await r2.get(key)
      return found ? { bytes: found.buffer, etag: found.etag } : null
    },
    async put(key, bytes, { contentType = 'application/octet-stream', ifMatch, ifNoneMatch } = {}) {
      return r2.put(key, bytes, contentType, { ifMatch, ifNoneMatch })
    },
    list: (prefix) => r2.list(prefix),
    async delete(key) {
      await r2.delete(key)
    },
  }
}
