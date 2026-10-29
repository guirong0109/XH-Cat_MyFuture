// Maps the user's or the CV's wording to an O*NET skill id. Order (spec §7):
//   exact catalogue name → whole-word catalogue name inside a short phrase → catalogue names that contain the input
//   are offered as candidates for the user to pick ("pick standard term"), no id → L3 semantic match at or above the cutoff.
// The original wording is always kept. Unknown → canonicalId null: an id is never invented.
import { nameKey, wordsOf } from './onetSkills.js'

const MAX_PHRASE_WORDS = 5
const MAX_CANDIDATES = 5

const containsWords = (haystack, needle) => {
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true
  }
  return false
}

export function createNormalizer({ catalogue, semantic = null, cutoff = null }) {
  const result = (originalText, entry, match, extra = {}) => ({
    name: entry ? entry.name : originalText,
    canonicalId: entry ? entry.id : null,
    category: entry ? entry.category : null,
    originalText,
    match,
    similarity: null,
    candidates: [],
    ...extra,
  })

  async function normalizeSkill(text) {
    const originalText = String(text ?? '').replace(/\s+/g, ' ').trim()
    const key = nameKey(originalText)
    if (!key) return result(originalText, null, null)

    const exact = catalogue.byName.get(key)
    if (exact) return result(originalText, exact, 'exact')

    const words = wordsOf(originalText)
    if (words.length <= MAX_PHRASE_WORDS) {
      // longest catalogue name found as whole words inside the input
      for (let size = words.length - 1; size >= 1; size--) {
        for (let start = 0; start + size <= words.length; start++) {
          const hit = catalogue.byName.get(words.slice(start, start + size).join(' '))
          if (hit) return result(originalText, hit, 'word')
        }
      }
      // catalogue names that contain the whole input as whole words
      const pool = catalogue.byWord.get(words[0]) ?? []
      const holders = pool.filter((entry) => containsWords(wordsOf(entry.name), words))
      // One or several longer names: the user picks ("pick standard term"); a longer name is never linked silently.
      if (holders.length) {
        const candidates = holders.sort((a, b) => b.occupations - a.occupations || a.name.length - b.name.length).slice(0, MAX_CANDIDATES)
          .map(({ id, name, category, occupations }) => ({ id, name, category, occupations }))
        return result(originalText, null, null, { candidates })
      }
    }

    if (semantic && cutoff !== null) {
      try {
        const [best] = await semantic.match([originalText], catalogue.entries)
        if (best && best.similarity >= cutoff) {
          const entry = catalogue.entries.find((e) => e.id === best.id)
          if (entry) return result(originalText, entry, 'semantic', { similarity: best.similarity })
        }
      } catch {
        // L3 unavailable: the skill stays unknown rather than guessed
      }
    }
    return result(originalText, null, null)
  }

  return { normalizeSkill }
}

// One entry per known skill (unknown ones by lower-case name); keeps the strongest extraction and every wording.
export function mergeSkills(skills) {
  const out = new Map()
  for (const skill of skills) {
    const key = skill.canonicalId ?? `name:${skill.name.toLowerCase()}`
    const seen = out.get(key)
    if (!seen) {
      out.set(key, { ...skill })
      continue
    }
    const texts = new Set(String(seen.originalText ?? '').split(' | ').filter(Boolean))
    if (skill.originalText) texts.add(skill.originalText)
    const stronger = (skill.extraction?.confidence ?? -1) > (seen.extraction?.confidence ?? -1)
    out.set(key, { ...(stronger ? skill : seen), originalText: [...texts].join(' | '), userConfirmed: seen.userConfirmed || skill.userConfirmed })
  }
  return [...out.values()]
}
