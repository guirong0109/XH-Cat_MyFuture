import { levelFromUse, makeSkill } from '../../shared/profileSchema.js'

// The AI may suggest one O*NET skill or knowledge item for a CV skill. It is not a skill until the user keeps it.
const without = (skill) => {
  const { aiSuggestion, ...rest } = skill
  return rest
}

export function dropSuggestion(profile, i) {
  return { ...profile, skills: profile.skills.map((skill, j) => (j === Number(i) ? without(skill) : skill)) }
}

export function keepSuggestion(profile, i) {
  const original = profile.skills[Number(i)]
  const suggestion = original?.aiSuggestion
  if (!suggestion) return profile
  const dropped = dropSuggestion(profile, i)
  // A malformed saved suggestion is only dropped.
  if (typeof suggestion !== 'object' || typeof suggestion.id !== 'string' || typeof suggestion.name !== 'string') return dropped
  if (profile.skills.some((skill) => skill.canonicalId === suggestion.id)) return dropped
  const added = levelFromUse({
    ...makeSkill({
      name: suggestion.name,
      canonicalId: suggestion.id,
      category: suggestion.id.startsWith('onet:kn:') ? 'O*NET knowledge' : 'O*NET skill',
      source: 'cv_ai',
      usedIn: original.usedIn ?? [],
    }),
    userConfirmed: true,
  })
  return { ...dropped, skills: [...dropped.skills, added] }
}
