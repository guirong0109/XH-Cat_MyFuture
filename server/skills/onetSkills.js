// The skill catalogue, built from the O*NET 31.0 snapshot (data/onet): one entry per Software Skills example
// (id onet:tech:<lower-case example>) and one per Essential/Transferable skill element (id onet:el:<element id>).
// Knowledge areas (onet:kn:, importance >= 3) are entries too, so the CV reader and the normaliser can link them.
// The skill search also offers work styles (onet:ws:) and work activities (onet:dwa:) (owner, 30 Oct). Those are kept
// apart in `more`, so the CV reader and the normaliser do not match them.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const SKILL_ELEMENT_CATEGORY = 'O*NET skill'
const MORE_LISTS = [
  ['work_styles.tsv', 'ws', 'O*NET work style', (row) => Number(row.value) > 0],
  ['work_activities.tsv', 'dwa', 'O*NET work activity', () => true],
]

const KNOWLEDGE_LIST = ['knowledge.tsv', 'kn', 'O*NET knowledge', (row) => Number(row.importance) >= 3]

// The entries Skill Match can count: O*NET skills and knowledge areas.
export const ONET_LINKABLE = (catalogue) => catalogue.entries.filter((entry) => entry.id.startsWith('onet:el:') || entry.id.startsWith('onet:kn:'))

export const nameKey = (text) =>
  String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s+v?\d+(\.\d+)*$/, '')

export const wordsOf = (text) => nameKey(text).split(/[^\p{L}\p{N}+#.]+/u).filter(Boolean)

// Search while typing: every query word starts some word of the name ("pyth" finds "Python").
export const startsWords = (nameWords, queryWords) => queryWords.every((q) => nameWords.some((word) => word.startsWith(q)))

const SEARCH_LIMIT = 10
const bare = (word) => word.replace(/\.+$/, '')

// How close a name is: 0 exact name, 1 every query word is a whole word of the name, 2 every query word starts one.
function closeness(entry, key, words) {
  if (nameKey(entry.name) === key) return 0
  const nameWords = wordsOf(entry.name).map(bare)
  return words.every((q) => nameWords.includes(bare(q))) ? 1 : 2
}

// Skills for the skill picker: the closest names first; among equally close ones general skills (skills, work styles,
// knowledge, work activities) before software products; then the most used in O*NET occupations; then the shortest.
export function searchSkills(catalogue, query, limit = SEARCH_LIMIT) {
  const key = nameKey(query)
  const words = wordsOf(query)
  if (!words.length) return []
  const isSoftware = (entry) => Number(entry.id.startsWith('onet:tech:'))
  return [...catalogue.entries, ...(catalogue.more ?? [])]
    .filter((entry) => startsWords(wordsOf(entry.name).map(bare), words.map(bare)))
    .map((entry) => ({ entry, close: closeness(entry, key, words) }))
    .sort((a, b) => a.close - b.close || isSoftware(a.entry) - isSoftware(b.entry) || b.entry.occupations - a.entry.occupations || a.entry.name.length - b.entry.name.length)
    .slice(0, limit)
    .map(({ entry: { id, name, category } }) => ({ id, name, category }))
}

function parseTsv(text) {
  const [header, ...rows] = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean)
  const names = header.split('\t')
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

// A list that older O*NET releases do not have is simply left out.
const readOptional = (file) => readFile(file, 'utf8').catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))

async function loadLists(onetDir, lists) {
  const more = []
  for (const [file, prefix, category, counts] of lists) {
    const text = await readOptional(path.join(onetDir, file))
    if (!text) continue
    const byId = new Map()
    for (const row of parseTsv(text)) {
      const id = `onet:${prefix}:${row.element_id}`
      if (!byId.has(id)) byId.set(id, { id, name: row.element, category, codes: new Set() })
      if (counts(row)) byId.get(id).codes.add(row.code)
    }
    for (const entry of byId.values()) {
      more.push({ id: entry.id, name: entry.name, category: entry.category, occupations: entry.codes.size })
    }
  }
  return more
}

export async function loadSkillCatalogue(onetDir) {
  const [skills, software, manifest, more, knowledge] = await Promise.all([
    readFile(path.join(onetDir, 'skills.tsv'), 'utf8'),
    readFile(path.join(onetDir, 'software.tsv'), 'utf8'),
    readFile(path.join(onetDir, 'manifest.json'), 'utf8'),
    loadLists(onetDir, MORE_LISTS),
    loadLists(onetDir, [KNOWLEDGE_LIST]),
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
  const entries = [...byId.values(), ...knowledge]
  const byName = new Map(entries.filter((entry) => !entry.id.startsWith('onet:kn:')).map((entry) => [nameKey(entry.name), entry]))
  // a knowledge area never replaces a skill or software name
  for (const entry of knowledge) if (!byName.has(nameKey(entry.name))) byName.set(nameKey(entry.name), entry)
  // word -> entries whose name has that word, to find names that contain a short input
  const byWord = new Map()
  for (const entry of entries) {
    for (const word of new Set(wordsOf(entry.name))) {
      if (!byWord.has(word)) byWord.set(word, [])
      byWord.get(word).push(entry)
    }
  }
  return { version: JSON.parse(manifest).version, entries, byName, byWord, more }
}
