// POST /api/profiles/validate { profile } → { ok, errors, profile }: checks and normalises, saves nothing.
// (Saving for accounts is added in Task 15.)
import express from 'express'
import { jsonBody, sendError } from '../errors.js'
import { validateProfile } from '../../shared/profileSchema.js'

export function profileRoutes({ loadNormalizer }) {
  const router = express.Router()
  router.post('/api/profiles/validate', jsonBody('300kb'), async (request, response) => {
    const profile = request.body?.profile
    if (!profile || typeof profile !== 'object') return sendError(response, 400, 'no_profile', 'Send the profile to check.')
    const { normalizeSkill } = await loadNormalizer()
    // Only skills without an id are looked up; a skill the user already linked keeps its link.
    const skills = Array.isArray(profile.skills)
      ? await Promise.all(profile.skills.map(async (skill) => {
          if (!skill || typeof skill.name !== 'string' || skill.canonicalId) return skill
          const found = await normalizeSkill(skill.originalText || skill.name)
          return found.canonicalId ? { ...skill, name: found.name, canonicalId: found.canonicalId, category: found.category } : skill
        }))
      : profile.skills
    const normalized = { ...profile, skills }
    return response.json({ ...validateProfile(normalized), profile: normalized })
  })
  return router
}
