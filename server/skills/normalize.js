// Maps the user's or the CV's wording to an O*NET skill id. Order (spec §7):
//   exact catalogue name → whole-word catalogue name inside a short phrase → catalogue names that contain the input
//   are offered as candidates for the user to pick ("pick standard term"), no id → L3 semantic match at or above the cutoff.
// The original wording is always kept. Unknown → canonicalId null: an id is never invented.
import { nameKey, wordsOf } from './onetSkills.js'

const MAX_PHRASE_WORDS = 5
const MAX_CANDIDATES = 5

const SHORT_FORM = /^[A-Z]{2,6}$/

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

    // Short forms: "MS Excel" -> "Microsoft Excel"; one all-capital word (SQL) -> software whose last word is it and
    // whose earlier words start with its letters. The most used wins; a tie is offered, never linked.
    if (/^MS /.test(originalText)) {
      const hit = catalogue.byName.get(nameKey('Microsoft ' + originalText.slice(3)))
      if (hit) return result(originalText, hit, 'short_form')
    }
    if (SHORT_FORM.test(originalText)) {
      const lower = originalText.toLowerCase()
      const fits = catalogue.entries.filter((entry) => {
        if (!entry.id.startsWith('onet:tech:')) return false
        const parts = wordsOf(entry.name)
        return parts.length > 1 && parts[parts.length - 1] === lower && parts.slice(0, -1).map((w) => w[0]).join('') === lower
      })
      if (fits.length) {
        fits.sort((a, b) => b.occupations - a.occupations)
        if (fits.length === 1 || fits[0].occupations > fits[1].occupations) return result(originalText, fits[0], 'short_form')
        const top = fits.filter((entry) => entry.occupations === fits[0].occupations)
        return result(originalText, null, null, { candidates: top.slice(0, MAX_CANDIDATES).map(({ id, name, category, occupations }) => ({ id, name, category, occupations })) })
      }
    }

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
    const usedIn = [...(seen.usedIn ?? [])]
    for (const place of skill.usedIn ?? []) if (!usedIn.some((p) => p.kind === place.kind && p.title === place.title)) usedIn.push(place)
    const aiSuggestion = seen.aiSuggestion ?? skill.aiSuggestion
    out.set(key, { ...(stronger ? skill : seen), ...(aiSuggestion ? { aiSuggestion } : {}), originalText: [...texts].join(' | '), userConfirmed: seen.userConfirmed || skill.userConfirmed, usedIn })
  }
  return [...out.values()]
}
