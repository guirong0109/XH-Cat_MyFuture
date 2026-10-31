// Owner routes for the organisation view (HR and career centres). All need a signed-in user; the organisation is
// the one the user owns, so another owner's ids answer 404. Previews are kept in memory only (15 minutes) and are
// never logged. Logs carry codes only, never names, skills or the CSV.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import { jsonBody, sendError } from '../errors.js'
import { makeRequireUser } from '../routes/auth.js'
import { OrgError } from './store.js'
import { checkRoster, RosterError } from './roster.js'

const PREVIEW_MS = 15 * 60 * 1000
const TYPES = ['hr', 'centre']
const VIEWS = ['current', 'target']
const SCENARIOS = ['moderate', 'rapid']
const STATUSES = ['planned', 'in_progress', 'done']
const ITEM_KEY = /^(el|kn):\S{1,40}$/
const MAX_NAME = 80

const text = (value) => (typeof value === 'string' && value.trim() && value.trim().length <= MAX_NAME ? value.trim() : null)

export function orgRoutes({ auth, store, service, loadNormalizer, loadRoleCodes, dataDir, log = () => {}, now = () => new Date() }) {
  const router = express.Router()
  const requireUser = makeRequireUser(auth)
  const previews = new Map() // previewId -> { ownerId, preview, expires }

  const bad = (response, message = 'Check the values sent.') => sendError(response, 400, 'bad_request', message)
  const sweep = () => {
    const t = now().getTime()
    for (const [id, p] of previews) if (p.expires <= t) previews.delete(id)
  }

  const guard = (handler) => async (request, response) => {
    try {
      await handler(request, response)
    } catch (error) {
      if (error instanceof OrgError) return sendError(response, error.status, error.code, 'The request was refused.')
      if (error instanceof RosterError) return sendError(response, 422, error.code, 'The roster file could not be used.')
      if (error?.name === 'StoreError') return sendError(response, 503, 'store_unavailable', 'The data store is not reachable right now.', true)
      log(`[org] failed: ${error?.code ?? error?.name ?? 'error'}`)
      return sendError(response, 500, 'server_error', 'Something went wrong.', true)
    }
  }

  async function orgFor(request, response) {
    const org = await store.orgOf(request.user.id)
    if (!org) sendError(response, 404, 'no_organisation', 'Create your organisation first.')
    return org
  }

  // true when the code is in eMASCO; otherwise answers 422 unknown_role and returns false
  async function knownRole(code, response) {
    if (typeof code !== 'string' || !(await loadRoleCodes()).has(code)) {
      sendError(response, 422, 'unknown_role', 'That role code is not in eMASCO.')
      return false
    }
    return true
  }

  router.post('/api/org', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const name = text(request.body?.name)
    const type = request.body?.type
    if (!name || !TYPES.includes(type)) return bad(response)
    return response.status(201).json(await store.createOrg(request.user.id, { name, type }))
  }))

  router.get('/api/org', requireUser, guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const [groups, people] = await Promise.all([store.groups(org.id), store.people(org.id)])
    return response.json({ org, groups, people })
  }))

  router.patch('/api/org', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const name = text(request.body?.name)
    if (!name) return bad(response)
    await store.renameOrg(request.user.id, name)
    return response.json({ ...org, name })
  }))

  router.delete('/api/org', requireUser, guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    await store.deleteOrg(request.user.id)
    for (const [id, p] of previews) if (p.ownerId === request.user.id) previews.delete(id)
    return response.json({ deleted: true })
  }))

  // ---- groups
  router.post('/api/org/groups', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const name = text(request.body?.name)
    const targetCode = request.body?.targetCode ?? null
    if (!name) return bad(response)
    if (targetCode !== null && !(await knownRole(targetCode, response))) return
    if ((await store.groups(org.id)).some((g) => g.name === name)) return sendError(response, 409, 'group_exists', 'A group with this name already exists.')
    return response.status(201).json(await store.addGroup(org.id, { name, targetCode }))
  }))

  router.patch('/api/org/groups/:id', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const body = request.body ?? {}
    const patch = {}
    if ('name' in body) {
      patch.name = text(body.name)
      if (!patch.name) return bad(response)
    }
    if ('targetCode' in body) {
      patch.targetCode = body.targetCode ?? null
      if (patch.targetCode !== null && !(await knownRole(patch.targetCode, response))) return
    }
    const groups = await store.groups(org.id)
    const current = groups.find((g) => g.id === request.params.id)
    if (!current) throw new OrgError('not_found', 404)
    if (patch.name && groups.some((g) => g.name === patch.name && g.id !== current.id)) {
      return sendError(response, 409, 'group_exists', 'A group with this name already exists.')
    }
    await store.updateGroup(org.id, current.id, patch)
    return response.json({ ...current, ...patch })
  }))

  router.delete('/api/org/groups/:id', requireUser, guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    await store.deleteGroup(org.id, request.params.id)
    return response.json({ deleted: true })
  }))

  // ---- roster: preview saves nothing; import saves what the owner just saw
  const rawCsv = (request, response, next) =>
    express.raw({ type: 'text/csv', limit: '1mb' })(request, response, (error) => {
      if (!error) return next()
      if (error.type === 'entity.too.large') return sendError(response, 413, 'too_large', 'The roster file is over 1 MB.')
      return bad(response, 'The roster file could not be read.')
    })

  router.post('/api/org/roster/preview', requireUser, rawCsv, guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    if (!Buffer.isBuffer(request.body)) return sendError(response, 415, 'bad_type', 'Send the roster as text/csv.')
    const { normalizeSkill } = await loadNormalizer()
    const groups = (await store.groups(org.id)).map((g) => g.name)
    const preview = await checkRoster({ bytes: request.body, type: org.type, groups, roleCodes: await loadRoleCodes(), normalizeSkill })
    sweep()
    const previewId = randomUUID()
    previews.set(previewId, { ownerId: request.user.id, preview, expires: now().getTime() + PREVIEW_MS })
    return response.json({ ...preview, previewId })
  }))

  router.post('/api/org/roster/import', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    sweep()
    const id = request.body?.previewId
    const held = typeof id === 'string' ? previews.get(id) : null
    if (!held || held.ownerId !== request.user.id) return sendError(response, 410, 'preview_expired', 'This preview has expired. Check the file again.')
    previews.delete(id)
    return response.json(await store.importPeople(org.id, held.preview))
  }))

  // ---- sample roster: made-up people, read from data/org (hash in manifest.json); only the HR sample exists so far
  const SAMPLES = { hr: 'sample-roster-hr.csv' }
  router.get('/api/org/roster/sample', requireUser, guard(async (request, response) => {
    const file = Object.hasOwn(SAMPLES, request.query.type) ? SAMPLES[request.query.type] : null
    if (!file) return sendError(response, 404, 'not_found', 'There is no sample roster for this type.')
    const csv = await readFile(path.join(dataDir, 'org', file), 'utf8')
    return response.type('text/csv').send(csv)
  }))

  // ---- people: only group and current role can change; skills are never edited here
  router.patch('/api/org/people/:id', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const body = request.body ?? {}
    if (Object.keys(body).some((k) => k !== 'groupId' && k !== 'currentCode')) return bad(response, 'Only the group and the current role can change.')
    const patch = {}
    if ('groupId' in body) {
      if (typeof body.groupId !== 'string') return bad(response)
      patch.groupId = body.groupId
    }
    if ('currentCode' in body) {
      if (org.type === 'centre') return bad(response, 'Career centres have no current role.')
      if (body.currentCode !== null && !(await knownRole(body.currentCode, response))) return
      patch.currentCode = body.currentCode
    }
    await store.updatePerson(org.id, request.params.id, patch)
    return response.json({ updated: true })
  }))

  router.delete('/api/org/people/:id', requireUser, guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    await store.deletePerson(org.id, request.params.id)
    return response.json({ deleted: true })
  }))

  // ---- team answer and plan steps
  router.get('/api/org/team', requireUser, guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const view = request.query.view ?? 'current'
    const scenario = request.query.scenario ?? 'moderate'
    if (!VIEWS.includes(view) || !SCENARIOS.includes(scenario)) return bad(response, 'view is current or target; scenario is moderate or rapid.')
    return response.json(await service.team(request.user.id, { view, scenario }, request))
  }))

  router.put('/api/org/plan-steps', requireUser, jsonBody('4kb'), guard(async (request, response) => {
    const org = await orgFor(request, response)
    if (!org) return
    const { groupId, roleCode, itemKey, status } = request.body ?? {}
    if (typeof groupId !== 'string' || typeof itemKey !== 'string' || !ITEM_KEY.test(itemKey) || !STATUSES.includes(status)) return bad(response)
    if (!(await knownRole(roleCode, response))) return
    await store.setPlanStep(org.id, { groupId, roleCode, itemKey, status })
    return response.json({ groupId, roleCode, itemKey, status })
  }))

  return router
}
