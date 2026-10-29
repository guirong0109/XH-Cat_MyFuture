// The dated O*NET 31.0 snapshot (data/onet), checked against its manifest hashes. Search order: exact title →
// job titles (every occupation sharing the title) → all query words → most query words (at most 5, "similar words").
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { wordsOf } from '../skills/onetSkills.js'

export class OnetUnavailable extends Error {}

const LOOSE_LIMIT = 5
const DEFAULT_LIMIT = 10

function parseTsv(text) {
  const [header, ...rows] = text.split('\n').filter(Boolean)
  const names = header.split('\t')
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

export async function loadOnetSnapshot(dir) {
  let manifest
  const tables = {}
  try {
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
    for (const name of ['occupations.tsv', 'job_titles.tsv']) {
      const text = (await readFile(path.join(dir, name), 'utf8')).replace(/\r\n/g, '\n')
      if (createHash('sha256').update(text).digest('hex') !== manifest.files?.[name]) throw new Error(`${name} does not match the manifest`)
      tables[name] = parseTsv(text)
    }
  } catch (error) {
    throw new OnetUnavailable(error.message)
  }
  const occupations = tables['occupations.tsv']
  const titleOf = new Map(occupations.map((o) => [o.code, o.title]))
  const byTitle = new Map(occupations.map((o) => [o.title.toLowerCase(), o.code]))
  const byJobTitle = new Map()
  for (const { code, title } of tables['job_titles.tsv']) {
    const key = title.toLowerCase()
    if (!byJobTitle.has(key)) byJobTitle.set(key, [])
    byJobTitle.get(key).push(code)
  }
  const texts = [...occupations.map((o) => ({ code: o.code, words: wordsOf(o.title) })), ...tables['job_titles.tsv'].map((j) => ({ code: j.code, words: wordsOf(j.title) }))]

  function search(query, limit = DEFAULT_LIMIT) {
    const q = String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!q) return []
    const out = []
    const add = (code, via) => {
      if (code && titleOf.has(code) && !out.some((item) => item.code === code)) out.push({ code, title: titleOf.get(code), via })
    }
    add(byTitle.get(q), 'title')
    for (const code of byJobTitle.get(q) ?? []) add(code, 'job_title')
    const words = wordsOf(q)
    const scored = texts.map((text) => ({ code: text.code, hits: words.filter((w) => text.words.includes(w)).length, length: text.words.length }))
    const strict = scored.filter((s) => s.hits === words.length).sort((a, b) => a.length - b.length)
    for (const s of strict) add(s.code, 'words')
    if (!strict.length) {
      const loose = scored.filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits || a.length - b.length)
      for (const s of loose) {
        if (out.length >= LOOSE_LIMIT) break
        add(s.code, 'similar_words')
      }
    }
    return out.slice(0, limit)
  }

  return { manifest, search }
}
