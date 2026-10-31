// Join links and sharing for the organisation view. The owner makes a single-use link (7 days); an employee opens
// it, sees what will be shared, and shares only O*NET skill and knowledge items with their level. Nothing here is
// logged except codes: never a token, a name or a skill. Join and share: 10 attempts per 15 minutes per address.
import express from 'express'
import { jsonBody, sendError } from '../errors.js'
import { makeRequireUser } from '../routes/auth.js'
import { createWindowLimiter } from '../rateLimit.js'
import { OrgError } from './store.js'

const LIMIT = 10
const WINDOW_MS = 15 * 60 * 1000
const MAX_NAME = 80
const MAX_TOKEN = 200
const ONET_ITEM = /^onet:((?:el|kn):\S{1,40})$/
const LEVELS = ['basic', 'good', 'expert']
const NOT_ONET = 'not an O*NET skill or knowledge item'
const EXPIRED = 'This link has expired or was already used. Ask HR for a new one.'
const WILL_SHARE = ['skill names and levels', 'group', 'role', 'display name']

const text = (value) => (typeof value === 'string' && value.trim() && value.trim().length <= MAX_NAME ? value.trim() : null)

export function shareRoutes({ auth, store, loadProfileSkills, loadRoleCodes = null, log = () => {}, now = () => new Date() }) {
  const router = express.Router()
  const requireUser = makeRequireUser(auth)
  const joins = createWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now })
  const shares = createWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now })

  const bad = (response, message = 'Check the values sent.') => sendError(response, 400, 'bad_request', message)
  const tooMany = (response) => sendError(response, 429, 'too_many_attempts', 'Too many attempts. Try again in a few minutes.', true)
  const expired = (response) => sendError(response, 410, 'link_expired', EXPIRED)

  const guard = (handler) => async (request, response) => {
    try {
      await handler(request, response)
    } catch (error) {
      if (error instanceof OrgError) {
        if (error.code === 'link_expired') return expired(response)
        if (error.code === 'own_organisation') return sendError(response, 409, 'own_organisation', 'This is your own organisation, so there is nothing to join.')
        return sendError(response, error.status, error.code, 'The request was refused.')
      }
      if (error?.name === 'StoreError') return sendError(response, 503, 'store_unavailable', 'The data store is not reachable right now.', true)
      log(`[org-share] failed: ${error?.code ?? error?.name ?? 'error'}`)
      return sendError(response, 500, 'server_error', 'Something went wrong.', true)
    }
  }

  // ---- owner: make a single-use link for one group
  router.post('/api/org/invites', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await store.orgOf(request.user.id)
    if (!org) return sendError(response, 404, 'no_organisation', 'Create your organisation first.')
    const { groupId, currentCode = null } = request.body ?? {}
    if (typeof groupId !== 'string' || !groupId) return bad(response)
    let code = null
    if (currentCode !== null && currentCode !== undefined) {
      if (typeof currentCode !== 'string') return bad(response)
      if (org.type === 'centre') return bad(response, 'Career centres have no current role.')
      if (loadRoleCodes && !(await loadRoleCodes()).has(currentCode)) return sendError(response, 422, 'unknown_role', 'That role code is not in eMASCO.')
      code = currentCode
    }
    const { token, expiresAt } = await store.createInvite(org.id, { groupId, currentCode: code })
    return response.status(201).json({ token, url: `/#join=${token}`, expiresAt })
  }))

  // ---- employee: look at a link (changes nothing), then share
  router.post('/api/org/join', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    if (!joins.hit(request.ip)) return tooMany(response)
    const token = request.body?.token
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) return expired(response)
    const invite = await store.inviteOf(token)
    if (!invite || invite.usedAt || invite.expiresAt <= now().toISOString()) return expired(response)
    if (invite.ownerId === request.user.id) return sendError(response, 409, 'own_organisation', 'This is your own organisation, so there is nothing to join.')
    return response.json({ orgName: invite.orgName, groupName: invite.groupName, willShare: WILL_SHARE })
  }))

  router.put('/api/org/share', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    // dryRun: the same answer, nothing saved, the link not used (so it is not counted against the attempts either)
    const dryRun = request.body?.dryRun === true
    if (!dryRun && !shares.hit(request.ip)) return tooMany(response)
    const { token, profileId } = request.body ?? {}
    const displayName = text(request.body?.displayName)
    if ((!dryRun && !displayName) || typeof profileId !== 'string' || !profileId) return bad(response)
    if (token !== undefined && token !== null && (typeof token !== 'string' || !token || token.length > MAX_TOKEN)) return expired(response)
    const profileSkills = await loadProfileSkills(request.user.id, profileId)
    if (!profileSkills) return sendError(response, 404, 'not_found', 'No such profile.')

    const shared = []
    const notShared = []
    const seen = new Set()
    for (const skill of profileSkills) {
      const name = typeof skill?.name === 'string' ? skill.name : ''
      const match = ONET_ITEM.exec(typeof skill?.canonicalId === 'string' ? skill.canonicalId : '')
      if (!match) {
        notShared.push({ name, reason: NOT_ONET })
        continue
      }
      if (seen.has(match[1])) continue
      seen.add(match[1])
      shared.push({ key: match[1], name, level: LEVELS.includes(skill.proficiency) ? skill.proficiency : 'not_assessed' })
    }
    if (dryRun) return response.json({ shared, notShared })
    await store.share(request.user.id, { token: token ?? undefined, displayName, skills: shared.map((s) => ({ key: s.key, level: s.level })) })
    return response.json({ shared, notShared })
  }))

  router.get('/api/org/share', requireUser, guard(async (request, response) => {
    return response.json(await store.shareOf(request.user.id))
  }))

  router.delete('/api/org/share', requireUser, guard(async (request, response) => {
    await store.stopSharing(request.user.id)
    return response.json({ stopped: true })
  }))

  return router
}
