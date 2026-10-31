// Checks an uploaded roster CSV (spec section 5) and returns a preview; nothing is stored here.
import { parseCsvLines, RosterError } from './csv.js'

export { RosterError }

const MAX_BYTES = 1_048_576
const HEADER = ['name', 'group', 'current_role_code', 'skill', 'level']
const LEVEL_RANK = { not_assessed: 0, basic: 1, good: 2, expert: 3 }
const ITEM = /^onet:((?:el|kn):.+)$/

export async function checkRoster({ bytes, type, groups, roleCodes, normalizeSkill }) {
  if (bytes.length > MAX_BYTES) throw new RosterError('too_large')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new RosterError('not_utf8')
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows = parseCsvLines(text)
  const head = (rows[0] ? rows[0].cells : []).map((h) => h.trim().toLowerCase())
  if (head.length !== HEADER.length || HEADER.some((h, i) => head[i] !== h)) {
    throw new RosterError('bad_header')
  }

  const people = new Map()
  const rejected = []
  const unrecognised = []
  const notes = []
  const known = new Set(groups)
  const newGroups = []
  let accepted = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].line
    const [name, group, code, skillText, levelText] = [0, 1, 2, 3, 4].map((k) => (rows[i].cells[k] || '').trim())
    const reject = (reason) => rejected.push({ row, reason })

    if (!name) { reject('name is empty'); continue }
    if (type === 'hr' && !roleCodes.has(code)) { reject(`role code ${code} is not in eMASCO`); continue }
    if (type === 'centre' && code) { reject('career centres have no current role'); continue }

    const level = levelText.toLowerCase().replace(/\s+/g, ' ') === 'not assessed'
      ? 'not_assessed'
      : levelText.toLowerCase()
    const noSkill = !skillText && !levelText
    if (!noSkill && !Object.hasOwn(LEVEL_RANK, level)) {
      reject(`level '${levelText}' is not basic / good / expert / not assessed`)
      continue
    }
    if (!noSkill && !skillText) { reject('skill is empty'); continue }

    const currentCode = type === 'hr' ? code : null
    let person = people.get(name)
    if (person && (person.group !== group || person.currentCode !== currentCode)) {
      reject('same person with a different group or role')
      continue
    }
    if (!person) {
      person = { name, group, currentCode, skills: [] }
      people.set(name, person)
    }
    accepted++
    if (!known.has(group) && !newGroups.includes(group)) newGroups.push(group)
    if (noSkill) continue

    const norm = await normalizeSkill(skillText)
    const m = ITEM.exec((norm && norm.canonicalId) || '')
    if (!m) { unrecognised.push({ row, skill: skillText }); continue }
    const existing = person.skills.find((s) => s.key === m[1])
    if (existing) {
      if (LEVEL_RANK[level] > LEVEL_RANK[existing.level]) existing.level = level
      notes.push({ row, note: 'skill listed twice; the higher level is kept' })
    } else {
      person.skills.push({ key: m[1], name: norm.name || skillText, level })
    }
  }

  return { people: [...people.values()], accepted, rejected, unrecognised, newGroups, notes }
}
