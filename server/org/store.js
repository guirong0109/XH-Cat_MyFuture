// Organisation store on D1: org, groups, people, skills and plan steps. Every query uses ? parameters.
// Any id that is not in the given org gives OrgError('not_found', 404). Invites and shares are added later.
import { randomUUID } from 'node:crypto'

export class OrgError extends Error {
  constructor(code, status) {
    super(code)
    this.name = 'OrgError'
    this.code = code
    this.status = status
  }
}

const toOrg = (r) => ({ id: r.id, name: r.name, type: r.type, createdAt: r.created_at })

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

  async function importPeople(orgId, preview) {
    const byName = new Map((await groups(orgId)).map((g) => [g.name, g.id]))
    let groupsAdded = 0
    for (const name of preview.newGroups ?? []) {
      if (byName.has(name)) continue
      byName.set(name, (await addGroup(orgId, { name, targetCode: null })).id)
      groupsAdded += 1
    }
    let added = 0
    for (const person of preview.people) {
      const groupId = byName.get(person.group)
      if (!groupId) throw new OrgError('not_found', 404)
      const id = newId()
      await d1.query(
        'INSERT INTO org_people (id, org_id, group_id, display_name, current_code, source, user_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, orgId, groupId, person.name, person.currentCode ?? null, 'roster', null, stamp()],
      )
      for (const skill of person.skills) {
        await d1.query('INSERT OR REPLACE INTO org_skills (person_id, item_key, level) VALUES (?, ?, ?)', [id, skill.key, skill.level])
      }
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

  return {
    createOrg, orgOf, renameOrg, deleteOrg,
    groups, addGroup, updateGroup, deleteGroup,
    people, importPeople, updatePerson, deletePerson,
    planSteps, setPlanStep,
  }
}
