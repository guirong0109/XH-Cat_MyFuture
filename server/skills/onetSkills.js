// The skill catalogue, built from the O*NET 31.0 snapshot (data/onet): one entry per Software Skills example
// (id onet:tech:<lower-case example>) and one per Essential/Transferable skill element (id onet:el:<element id>).
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const SKILL_ELEMENT_CATEGORY = 'O*NET skill'

export const nameKey = (text) =>
  String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s+v?\d+(\.\d+)*$/, '')

export const wordsOf = (text) => nameKey(text).split(/[^\p{L}\p{N}+#.]+/u).filter(Boolean)

function parseTsv(text) {
  const [header, ...rows] = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean)
  const names = header.split('\t')
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

export async function loadSkillCatalogue(onetDir) {
  const [skills, software, manifest] = await Promise.all([
    readFile(path.join(onetDir, 'skills.tsv'), 'utf8'),
    readFile(path.join(onetDir, 'software.tsv'), 'utf8'),
    readFile(path.join(onetDir, 'manifest.json'), 'utf8'),
  ])
  const byId = new Map()
  for (const row of parseTsv(skills)) {
    const id = `onet:el:${row.element_id}`
    if (!byId.has(id)) byId.set(id, { id, name: row.element, category: SKILL_ELEMENT_CATEGORY })
  }
  // occupations = how many O*NET occupations list the example; used to order "pick standard term" choices.
  for (const row of parseTsv(software)) {
    if (!row.example) continue
    const id = `onet:tech:${nameKey(row.example)}`
    if (!byId.has(id)) byId.set(id, { id, name: row.example, category: row.element || null, codes: new Set() })
    byId.get(id).codes.add(row.code)
  }
  for (const entry of byId.values()) {
    entry.occupations = entry.codes ? entry.codes.size : 0
    delete entry.codes
  }
  const entries = [...byId.values()]
  const byName = new Map(entries.map((entry) => [nameKey(entry.name), entry]))
  // word -> entries whose name has that word, to find names that contain a short input
  const byWord = new Map()
  for (const entry of entries) {
    for (const word of new Set(wordsOf(entry.name))) {
      if (!byWord.has(word)) byWord.set(word, [])
      byWord.get(word).push(entry)
    }
  }
  return { version: JSON.parse(manifest).version, entries, byName, byWord }
}
