// POST /api/profiles/validate { profile } → { ok, errors, profile }: checks and normalises, saves nothing.
// Saved profiles (signed-in users, spec §10): POST /api/profiles (confirmed only), GET list and one,
// PATCH {version, changes} (named fields only; old version → 409), GET /:id/mappings. Another user's profile → 404.
import { randomUUID } from 'node:crypto'
import express from 'express'
import { jsonBody, sendError } from '../errors.js'
import { FORBIDDEN_FIELDS, validateProfile } from '../../shared/profileSchema.js'
import { setField } from '../../shared/profileState.js'
import { makeRequireUser } from './auth.js'

const LOCKED = ['profileStatus', 'profileId', 'profileVersion']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function profileRoutes({ loadNormalizer, auth = null, d1 = null, now = () => new Date() }) {
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

  const requireUser = makeRequireUser(auth)
  const invalid = (response, errors) => response.status(422).json({ error: { code: 'invalid_profile', message: 'Some fields are not valid.', retryable: false }, fields: errors })
  async function owned(request, response) {
    const { rows } = await d1.query('SELECT * FROM profiles WHERE id = ? AND user_id = ?', [request.params.id, request.user.id])
    if (!rows[0]) sendError(response, 404, 'not_found', 'No such profile.')
    return rows[0] ?? null
  }

  router.post('/api/profiles', requireUser, jsonBody('300kb'), async (request, response) => {
    const { profile } = request.body ?? {}
    if (!profile || typeof profile !== 'object') return sendError(response, 400, 'no_profile', 'Send the profile to save.')
    if (profile.profileStatus !== 'confirmed') return sendError(response, 422, 'not_confirmed', 'Only a confirmed profile can be saved.')
    const check = validateProfile(profile)
    if (!check.ok) return invalid(response, check.errors)
    const id = randomUUID()
    const at = now().toISOString()
    const stored = { ...profile, profileId: id, profileVersion: 1 }
    await d1.query('INSERT INTO profiles (id, user_id, version, status, json, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, request.user.id, 1, 'confirmed', JSON.stringify(stored), at])
    return response.status(201).json({ id, version: 1 })
  })

  router.get('/api/profiles', requireUser, async (request, response) => {
    const { rows } = await d1.query('SELECT id, version, status, updated_at FROM profiles WHERE user_id = ? ORDER BY updated_at DESC', [request.user.id])
    return response.json({ profiles: rows.map((row) => ({ id: row.id, version: row.version, status: row.status, updatedAt: row.updated_at })) })
  })

  router.get('/api/profiles/:id', requireUser, async (request, response) => {
    const row = await owned(request, response)
    if (!row) return undefined
    return response.json({ id: row.id, version: row.version, status: row.status, updatedAt: row.updated_at, profile: JSON.parse(row.json) })
  })

  router.patch('/api/profiles/:id', requireUser, jsonBody('300kb'), async (request, response) => {
    const { version, changes } = request.body ?? {}
    const paths = changes && typeof changes === 'object' && !Array.isArray(changes) ? Object.keys(changes) : []
    const refused = !paths.length || paths.some((p) => {
      const parts = p.split('.')
      return LOCKED.includes(parts[0]) || parts.some((part) => FORBIDDEN_FIELDS.includes(part) || part === '__proto__' || part === 'constructor' || part === 'prototype')
    })
    if (refused) return sendError(response, 422, 'bad_change', 'These fields cannot be changed this way.')
    const row = await owned(request, response)
    if (!row) return undefined
    if (version !== row.version) return sendError(response, 409, 'stale_version', 'This profile changed elsewhere. Reload it first.', true)
    let profile = JSON.parse(row.json)
    // Only existing parts of the profile can be changed: the parent of every path must already be an object or list.
    const parentOf = (p) => p.split('.').slice(0, -1).reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), profile)
    if (paths.some((p) => { const parent = parentOf(p); return !parent || typeof parent !== 'object' })) {
      return sendError(response, 422, 'bad_change', 'These fields cannot be changed this way.')
    }
    for (const p of paths) profile = setField(profile, p, changes[p])
    profile = { ...profile, profileVersion: row.version + 1 }
    const check = validateProfile(profile)
    if (!check.ok) return invalid(response, check.errors)
    const { changes: updated } = await d1.query('UPDATE profiles SET version = ?, json = ?, updated_at = ? WHERE id = ? AND user_id = ? AND version = ?',
      [row.version + 1, JSON.stringify(profile), now().toISOString(), row.id, request.user.id, row.version])
    if (!updated) return sendError(response, 409, 'stale_version', 'This profile changed elsewhere. Reload it first.', true)
    return response.json({ id: row.id, version: row.version + 1 })
  })

  router.get('/api/profiles/:id/mappings', requireUser, async (request, response) => {
    const row = await owned(request, response)
    if (!row) return undefined
    const profile = JSON.parse(row.json)
    return response.json({
      occupationMappings: profile.occupationMappings ?? [],
      skills: (profile.skills ?? []).map(({ name, canonicalId, category }) => ({ name, canonicalId, category })),
    })
  })
  return router
}
