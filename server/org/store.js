// Organisation store on D1: org, groups, people, skills and plan steps. Every query uses ? parameters.
// Any id that is not in the given org gives OrgError('not_found', 404). Join links hold only the SHA-256 of the token.
import { createHash, randomBytes, randomUUID } from 'node:crypto'

export class OrgError extends Error {
  constructor(code, status) {
    super(code)
    this.name = 'OrgError'
    this.code = code
    this.status = status
  }
}

const INVITE_MS = 7 * 24 * 3600 * 1000
const hashOf = (token) => createHash('sha256').update(token).digest('hex')

const toOrg = (r) => ({ id: r.id, name: r.name, type: r.type, createdAt: r.created_at })
const nameKeyOf = (name) => String(name ?? '').trim().toLowerCase()
// D1 binds at most 100 parameters per query: 33 skill rows of 3 values each fit
const SKILL_ROWS = 33

export function createOrgStore({ d1, now = () => new Date(), newId = randomUUID }) {
  const stamp = () => now().toISOString()

  async function orgOf(ownerId) {
    const { rows } = await d1.query('SELECT id, name, type, created_at FROM orgs WHERE owner_id = ?', [ownerId])
    return rows[0] ? toOrg(rows[0]) : null
  }

  async function requireGroup(orgId, groupId) {
    const { rows } = await d1.query('SELECT id FROM org_groups WHERE id = ? AND org_id = ?', [groupId, orgId])
    if (!rows[0]) throw new OrgError('not_found', 404)
  }

  async function requirePerson(orgId, personId) {
    const { rows } = await d1.query('SELECT id FROM org_people WHERE id = ? AND org_id = ?', [personId, orgId])
    if (!rows[0]) throw new OrgError('not_found', 404)
  }

  async function createOrg(ownerId, { name, type }) {
    if (await orgOf(ownerId)) throw new OrgError('exists', 409)
    const org = { id: newId(), name, type, createdAt: stamp() }
    await d1.query('INSERT INTO orgs (id, owner_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)', [org.id, ownerId, name, type, org.createdAt])
    return org
  }

  async function renameOrg(ownerId, name) {
    await d1.query('UPDATE orgs SET name = ? WHERE owner_id = ?', [name, ownerId])
  }

  async function deleteOrg(ownerId) {
    const org = await orgOf(ownerId)
    if (!org) return
    // people point at groups without a cascade, so remove them first
    await d1.query('DELETE FROM org_people WHERE org_id = ?', [org.id])
    await d1.query('DELETE FROM orgs WHERE id = ?', [org.id])
  }

  async function groups(orgId) {
    const { rows } = await d1.query('SELECT id, name, target_code FROM org_groups WHERE org_id = ? ORDER BY name', [orgId])
    return rows.map((r) => ({ id: r.id, name: r.name, targetCode: r.target_code }))
  }

  async function addGroup(orgId, { name, targetCode = null }) {
    const id = newId()
    await d1.query('INSERT INTO org_groups (id, org_id, name, target_code) VALUES (?, ?, ?, ?)', [id, orgId, name, targetCode])
    return { id, name, targetCode }
  }

  async function updateGroup(orgId, groupId, patch) {
    await requireGroup(orgId, groupId)
    if ('name' in patch && patch.name !== undefined) await d1.query('UPDATE org_groups SET name = ? WHERE id = ? AND org_id = ?', [patch.name, groupId, orgId])
    if ('targetCode' in patch && patch.targetCode !== undefined) await d1.query('UPDATE org_groups SET target_code = ? WHERE id = ? AND org_id = ?', [patch.targetCode, groupId, orgId])
  }

  async function deleteGroup(orgId, groupId) {
    await requireGroup(orgId, groupId)
    const { rows } = await d1.query('SELECT COUNT(*) AS c FROM org_people WHERE group_id = ?', [groupId])
    if (rows[0].c > 0) throw new OrgError('group_has_people', 409)
    await d1.query('DELETE FROM org_groups WHERE id = ? AND org_id = ?', [groupId, orgId])
  }

  async function people(orgId) {
    const [p, s] = await Promise.all([
      d1.query('SELECT id, group_id, display_name, current_code, source, added_at FROM org_people WHERE org_id = ? ORDER BY added_at, display_name', [orgId]),
      d1.query('SELECT s.person_id, s.item_key, s.level FROM org_skills s JOIN org_people p ON p.id = s.person_id WHERE p.org_id = ? ORDER BY s.item_key', [orgId]),
    ])
    const byPerson = new Map()
    for (const r of s.rows) {
      if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, [])
      byPerson.get(r.person_id).push({ key: r.item_key, level: r.level })
    }
    return p.rows.map((r) => ({
      id: r.id, groupId: r.group_id, displayName: r.display_name, currentCode: r.current_code,
      source: r.source, addedAt: r.added_at, skills: byPerson.get(r.id) ?? [],
    }))
  }

  // a person's skills in multi-row inserts (at most SKILL_ROWS rows, so at most 99 bound parameters each)
  async function insertSkills(personId, skills) {
    for (let i = 0; i < skills.length; i += SKILL_ROWS) {
      const part = skills.slice(i, i + SKILL_ROWS)
      await d1.query(
        `INSERT OR REPLACE INTO org_skills (person_id, item_key, level) VALUES ${part.map(() => '(?, ?, ?)').join(', ')}`,
        part.flatMap((skill) => [personId, skill.key, skill.level]),
      )
    }
  }

  async function importPeople(orgId, preview) {
    const byName = new Map((await groups(orgId)).map((g) => [g.name, g.id]))
    // check every person's group before writing anything, so a bad row leaves nothing half-imported
    const known = new Set([...byName.keys(), ...(preview.newGroups ?? [])])
    if (preview.people.some((person) => !known.has(person.group))) throw new OrgError('not_found', 404)
    let groupsAdded = 0
    for (const name of preview.newGroups ?? []) {
      if (byName.has(name)) continue
      byName.set(name, (await addGroup(orgId, { name, targetCode: null })).id)
      groupsAdded += 1
    }
    // a name already in the organisation (ignoring case and outer spaces) is never added again
    const { rows: present } = await d1.query('SELECT display_name FROM org_people WHERE org_id = ?', [orgId])
    const names = new Set(present.map((r) => nameKeyOf(r.display_name)))
    let added = 0
    for (const person of preview.people) {
      if (names.has(nameKeyOf(person.name))) continue
      names.add(nameKeyOf(person.name))
      const groupId = byName.get(person.group)
      if (!groupId) throw new OrgError('not_found', 404)
      const id = newId()
      await d1.query(
        'INSERT INTO org_people (id, org_id, group_id, display_name, current_code, source, user_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, orgId, groupId, person.name, person.currentCode ?? null, 'roster', null, stamp()],
      )
      await insertSkills(id, person.skills)
      added += 1
    }
    return { added, groupsAdded }
  }

  async function updatePerson(orgId, personId, patch) {
    await requirePerson(orgId, personId)
    if (patch.groupId !== undefined) {
      await requireGroup(orgId, patch.groupId)
      await d1.query('UPDATE org_people SET group_id = ? WHERE id = ? AND org_id = ?', [patch.groupId, personId, orgId])
    }
    if (patch.currentCode !== undefined) await d1.query('UPDATE org_people SET current_code = ? WHERE id = ? AND org_id = ?', [patch.currentCode, personId, orgId])
  }

  async function deletePerson(orgId, personId) {
    await requirePerson(orgId, personId)
    await d1.query('DELETE FROM org_people WHERE id = ? AND org_id = ?', [personId, orgId])
  }

  async function planSteps(orgId, groupId, roleCode) {
    const { rows } = await d1.query('SELECT item_key, status FROM org_plan_steps WHERE org_id = ? AND group_id = ? AND role_code = ?', [orgId, groupId, roleCode])
    return new Map(rows.map((r) => [r.item_key, r.status]))
  }

  async function setPlanStep(orgId, { groupId, roleCode, itemKey, status }) {
    await requireGroup(orgId, groupId)
    await d1.query(
      'INSERT OR REPLACE INTO org_plan_steps (org_id, group_id, role_code, item_key, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [orgId, groupId, roleCode, itemKey, status, stamp()],
    )
  }

  // ---- join links and shares. The token is returned once; only its SHA-256 is stored.
  async function createInvite(orgId, { groupId, currentCode = null }) {
    await requireGroup(orgId, groupId)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now().getTime() + INVITE_MS).toISOString()
    await d1.query(
      'INSERT INTO org_invites (id, org_id, group_id, current_code, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      [newId(), orgId, groupId, currentCode, hashOf(token), expiresAt],
    )
    return { token, expiresAt }
  }

  async function inviteOf(token) {
    if (typeof token !== 'string' || !token) return null
    const { rows } = await d1.query(
      `SELECT i.id, i.org_id, o.name AS org_name, o.owner_id, i.group_id, g.name AS group_name, i.current_code, i.expires_at, i.used_at
         FROM org_invites i JOIN orgs o ON o.id = i.org_id JOIN org_groups g ON g.id = i.group_id WHERE i.token_hash = ?`,
      [hashOf(token)],
    )
    const r = rows[0]
    if (!r) return null
    return {
      inviteId: r.id, orgId: r.org_id, orgName: r.org_name, ownerId: r.owner_id, groupId: r.group_id, groupName: r.group_name,
      currentCode: r.current_code, expiresAt: r.expires_at, usedAt: r.used_at,
    }
  }

  async function replaceSkills(personId, skills) {
    await d1.query('DELETE FROM org_skills WHERE person_id = ?', [personId])
    await insertSkills(personId, skills)
  }

  async function sharedPerson(userId) {
    const { rows } = await d1.query(
      `SELECT p.id, p.org_id, p.display_name, p.current_code, g.name AS group_name, o.name AS org_name FROM org_people p
         JOIN org_groups g ON g.id = p.group_id JOIN orgs o ON o.id = p.org_id
        WHERE p.user_id = ? AND p.source = 'shared' ORDER BY p.added_at DESC, p.id LIMIT 1`,
      [userId],
    )
    return rows[0] ?? null
  }

  async function share(userId, { token, displayName, skills }) {
    if (token !== undefined && token !== null) {
      const invite = await inviteOf(token)
      if (!invite || invite.usedAt || invite.expiresAt <= stamp()) throw new OrgError('link_expired', 410)
      if (invite.ownerId === userId) throw new OrgError('own_organisation', 409)
      // claim the link first: only one caller can flip used_at from NULL
      const claim = await d1.query('UPDATE org_invites SET used_at = ? WHERE id = ? AND used_at IS NULL', [stamp(), invite.inviteId])
      if (claim.changes !== 1) throw new OrgError('link_expired', 410)
      // one share per user: a share with another organisation (person and skills) is removed first
      await d1.query("DELETE FROM org_people WHERE user_id = ? AND source = 'shared' AND org_id <> ?", [userId, invite.orgId])
      const { rows } = await d1.query('SELECT id FROM org_people WHERE org_id = ? AND user_id = ?', [invite.orgId, userId])
      let personId = rows[0]?.id
      if (personId) {
        await d1.query('UPDATE org_people SET group_id = ?, display_name = ?, current_code = ?, source = ? WHERE id = ?', [invite.groupId, displayName, invite.currentCode, 'shared', personId])
      } else {
        personId = newId()
        await d1.query(
          'INSERT INTO org_people (id, org_id, group_id, display_name, current_code, source, user_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [personId, invite.orgId, invite.groupId, displayName, invite.currentCode, 'shared', userId, stamp()],
        )
      }
      await replaceSkills(personId, skills)
      return { personId }
    }
    const existing = await sharedPerson(userId)
    if (!existing) throw new OrgError('no_share', 404)
    await d1.query('UPDATE org_people SET display_name = ? WHERE id = ?', [displayName, existing.id])
    await replaceSkills(existing.id, skills)
    return { personId: existing.id }
  }

  async function shareOf(userId) {
    const person = await sharedPerson(userId)
    if (!person) return null
    const { rows } = await d1.query('SELECT item_key, level FROM org_skills WHERE person_id = ? ORDER BY item_key', [person.id])
    return {
      orgId: person.org_id, orgName: person.org_name, groupName: person.group_name, displayName: person.display_name, currentCode: person.current_code ?? null,
      skills: rows.map((r) => ({ key: r.item_key, level: r.level })),
    }
  }

  async function stopSharing(userId) {
    await d1.query("DELETE FROM org_people WHERE user_id = ? AND source = 'shared'", [userId])
  }

  return {
    createOrg, orgOf, renameOrg, deleteOrg,
    groups, addGroup, updateGroup, deleteGroup,
    people, importPeople, updatePerson, deletePerson,
    planSteps, setPlanStep,
    createInvite, inviteOf, share, shareOf, stopSharing,
  }
}
