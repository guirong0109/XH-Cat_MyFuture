// Cache of validated live O*NET answers, one small JSON file per normalised query (data/cache/onet/).
// A record: { source, url, version, fetchedAt, cacheStatus, validated, candidates }.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const keyOf = (query) => createHash('sha1').update(String(query).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex')

export function createCache(dir) {
  return {
    async get(query) {
      try {
        return JSON.parse(await readFile(path.join(dir, `${keyOf(query)}.json`), 'utf8'))
      } catch {
        return null
      }
    },
    async put(query, record) {
      try {
        await mkdir(dir, { recursive: true })
        const file = path.join(dir, `${keyOf(query)}.json`)
        await writeFile(`${file}.tmp`, JSON.stringify(record))
        await rename(`${file}.tmp`, file)
      } catch {
        // a cache that cannot be written only means the next outage falls back to the snapshot
      }
    },
  }
}
