// The 10 AI-news fields (data/news/fields.json): ISCED-F 2013 broad fields 01-10 with the words searched for each,
// checked against the manifest hash. Spec §4.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildQuery } from '../../shared/news/rules.js'

export class NewsDataError extends Error {}

const CODES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']

export async function loadNewsFields(dataDir) {
  let fields
  try {
    const dir = path.join(dataDir, 'news')
    const text = (await readFile(path.join(dir, 'fields.json'), 'utf8')).replace(/\r\n/g, '\n')
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
    if (createHash('sha256').update(text).digest('hex') !== manifest.files?.['fields.json']) throw new Error('fields.json does not match the manifest')
    fields = JSON.parse(text).fields
  } catch (error) {
    throw new NewsDataError(error.message)
  }
  if (!Array.isArray(fields) || fields.map((f) => f?.code).join() !== CODES.join()) throw new NewsDataError('news fields must be the 10 broad fields 01-10, in order')
  for (const f of fields) {
    if (typeof f.title !== 'string' || !f.title.trim() || typeof f.words !== 'string' || !f.words.trim()) throw new NewsDataError(`news field ${f.code} needs a title and words`)
    try {
      buildQuery(f.words, new Date())
    } catch (error) {
      throw new NewsDataError(`news field ${f.code}: ${error.message}`)
    }
  }
  return fields.map(({ code, title, words }) => ({ code, title, words }))
}
