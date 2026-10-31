// The 10 news fields (spec §4, plan Task 1): ISCED-F 2013 broad titles, search words, manifest hash.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NewsDataError, loadNewsFields } from '../../server/news/fields.js'
import { QUERY_MAX, buildQuery } from '../../shared/news/rules.js'

const broadTitles = () => {
  const rows = readFileSync('data/isced/fields.tsv', 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).slice(1)
  return new Map(rows.map((row) => row.split('\t')).map((cells) => [cells[2], cells[3]]))
}

// A data dir holding only news/fields.json (and a matching manifest) with the given fields.
function dirWith(fields) {
  const dir = mkdtempSync(path.join(tmpdir(), 'news-fields-'))
  const text = JSON.stringify({ source: 'test', fields })
  const news = path.join(dir, 'news')
  mkdirSync(news)
  writeFileSync(path.join(news, 'fields.json'), text)
  writeFileSync(path.join(news, 'manifest.json'), JSON.stringify({ files: { 'fields.json': createHash('sha256').update(text).digest('hex') } }))
  return dir
}

describe('news fields', () => {
  it('loads the 10 broad fields with their ISCED-F titles, each query within the limit', async () => {
    const fields = await loadNewsFields('data')
    expect(fields.map((f) => f.code)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
    const titles = broadTitles()
    for (const f of fields) {
      expect(f.title).toBe(titles.get(f.code))
      expect(f.words.trim()).not.toBe('')
      expect(buildQuery(f.words, new Date()).length).toBeLessThanOrEqual(QUERY_MAX)
    }
  })

  it('the file matches its manifest hash', () => {
    const text = readFileSync('data/news/fields.json', 'utf8').replace(/\r\n/g, '\n')
    const manifest = JSON.parse(readFileSync('data/news/manifest.json', 'utf8'))
    expect(createHash('sha256').update(text).digest('hex')).toBe(manifest.files['fields.json'])
  })

  const good = () => JSON.parse(readFileSync('data/news/fields.json', 'utf8')).fields
  it.each([
    ['9 fields', (f) => f.slice(1)],
    ['a repeated code', (f) => [...f.slice(0, 9), { ...f[9], code: '01' }]],
    ['empty words', (f) => [{ ...f[0], words: ' ' }, ...f.slice(1)]],
    ['words too long for a query', (f) => [{ ...f[0], words: 'x'.repeat(120) }, ...f.slice(1)]],
  ])('rejects a list with %s', async (_, change) => {
    await expect(loadNewsFields(dirWith(change(good())))).rejects.toBeInstanceOf(NewsDataError)
  })

  it('rejects a file that does not match the manifest', async () => {
    const dir = dirWith(good())
    writeFileSync(path.join(dir, 'news', 'fields.json'), JSON.stringify({ fields: good() }) + ' ')
    await expect(loadNewsFields(dir)).rejects.toBeInstanceOf(NewsDataError)
  })
})
