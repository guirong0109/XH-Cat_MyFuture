// Where the AI news lists are kept (spec §6): the R2 object news/latest.json when R2 is set, else a local file that git
// ignores (data/cache/news/latest.json). Written whole. A missing or corrupt copy reads as null (empty lists; the next
// run writes a good copy). A store that cannot be reached throws, so the service makes no paid search without a
// readable search count (final review I3).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const parse = (text) => {
  try {
    const state = JSON.parse(text)
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null
  } catch {
    return null
  }
}

export function createFileNewsStore(filePath) {
  return {
    async read() {
      let text
      try {
        text = await readFile(filePath, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      }
      return parse(text)
    },
    async write(state) {
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, JSON.stringify(state))
    },
  }
}

export function createR2NewsStore(r2, key = 'news/latest.json') {
  return {
    async read() {
      const object = await r2.get(key)
      return object ? parse(object.buffer.toString('utf8')) : null
    },
    async write(state) {
      await r2.put(key, Buffer.from(JSON.stringify(state)), 'application/json')
    },
  }
}
