// Where the journey goes after Confirm. No percentages are ever produced here: the summary only says whether the
// profile has a skill the next module can use.
import { hasUsableSkill } from './profileSchema.js'

export function afterConfirm(profile) {
  if (profile?.profileStatus !== 'confirmed') return { screen: 'review', usable: false }
  return { screen: 'summary', usable: hasUsableSkill(profile) }
}
