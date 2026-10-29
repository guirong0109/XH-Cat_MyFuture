// Field of study list: UNESCO ISCED-F 2013 (data/isced), checked against its manifest hashes. The user searches field
// names and the CIP programme names linked to them (Statistics Canada concordance), so "computer science" finds
// 0613. Every query word must start a word of the name; field-name matches come before programme matches.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { startsWords, wordsOf } from '../skills/onetSkills.js'

export class IscedUnavailable extends Error {}

const DEFAULT_LIMIT = 10

function parseTsv(text) {
  const [header, ...rows] = text.split('\n').filter(Boolean)
  const names = header.split('\t')
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

export async function loadIsced(dir) {
  let manifest
  const tables = {}
  try {
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
    for (const name of ['fields.tsv', 'isced_cip.tsv']) {
      const text = (await readFile(path.join(dir, name), 'utf8')).replace(/\r\n/g, '\n')
      if (createHash('sha256').update(text).digest('hex') !== manifest.files?.[name]) throw new Error(`${name} does not match the manifest`)
      tables[name] = parseTsv(text)
    }
  } catch (error) {
    throw new IscedUnavailable(error.message)
  }
  const fields = tables['fields.tsv'].map((f) => ({ code: f.code, title: f.title, broadTitle: f.broad_title, words: wordsOf(f.title) }))
  const byCode = new Map(fields.map((f) => [f.code, f]))
  const programmes = tables['isced_cip.tsv'].map((l) => ({ code: l.isced_code, title: l.cip_title, words: wordsOf(l.cip_title) }))

  function search(query, limit = DEFAULT_LIMIT) {
    const q = String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    const words = wordsOf(q)
    if (!words.length) return []
    const out = []
    const add = (field, via, programme = null) => {
      if (field && !out.some((item) => item.code === field.code)) out.push({ code: field.code, title: field.title, broadTitle: field.broadTitle, via, programme })
    }
    const named = fields.filter((f) => startsWords(f.words, words))
    named.sort((a, b) => Number(b.title.toLowerCase() === q) - Number(a.title.toLowerCase() === q) || a.words.length - b.words.length)
    for (const field of named) add(field, 'field')
    const linked = programmes.filter((p) => startsWords(p.words, words)).sort((a, b) => a.words.length - b.words.length)
    for (const programme of linked) add(byCode.get(programme.code), 'programme', programme.title)
    return out.slice(0, limit)
  }

  return { manifest, search }
}
