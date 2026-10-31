// Where the AI news lists are kept (spec §6): the R2 object news/latest.json when R2 is set, else a local file that git
// ignores (data/cache/news/latest.json). Written whole after each run. A missing, corrupt or unreachable store reads as
// null, so the screens show empty lists and the next run writes a good copy.
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
      try {
        return parse(await readFile(filePath, 'utf8'))
      } catch {
        return null
      }
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
      try {
        const object = await r2.get(key)
        return object ? parse(object.buffer.toString('utf8')) : null
      } catch {
        return null
      }
    },
    async write(state) {
      await r2.put(key, Buffer.from(JSON.stringify(state)), 'application/json')
    },
  }
}
