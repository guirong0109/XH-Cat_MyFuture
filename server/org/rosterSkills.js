// Skill lookup for rosters (spec: O*NET skills AND knowledge). An exact name match against the O*NET skill and
// knowledge items comes first; anything else goes to the CV normaliser. Work styles and work activities are not roster items.
import { nameKey } from '../skills/onetSkills.js'

const ITEM_ID = /^onet:(?:el|kn):/

export function makeRosterNormalizer({ catalogue, normalizeSkill }) {
  const byKey = new Map()
  for (const entry of [...catalogue.entries, ...(catalogue.more ?? [])]) {
    if (!ITEM_ID.test(entry.id)) continue
    const key = nameKey(entry.name)
    if (!byKey.has(key)) byKey.set(key, entry) // skills come first, so a name in both lists stays the skill
  }
  return async (text) => {
    const entry = byKey.get(nameKey(String(text ?? '')))
    if (entry) return { canonicalId: entry.id, name: entry.name }
    return normalizeSkill(text)
  }
}
