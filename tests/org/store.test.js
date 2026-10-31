import { describe, expect, it } from 'vitest'
import { createFakeD1 } from '../helpers/fakeStores.js'
import { createOrgStore, OrgError } from '../../server/org/store.js'

const TABLES = ['orgs', 'org_groups', 'org_people', 'org_skills', 'org_invites', 'org_plan_steps']

async function setup() {
  const d1 = createFakeD1()
  await d1.migrate()
  for (const id of ['u1', 'u2']) {
    await d1.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', [id, `${id}@example.test`, 'h', 's', '2026-10-31T00:00:00Z'])
  }
  let n = 0
  const store = createOrgStore({ d1, now: () => new Date('2026-10-31T01:00:00Z'), newId: () => `id${++n}` })
  return { d1, store }
}

const PREVIEW = {
  people: [
    { name: 'Aini', group: 'Ops', currentCode: '2411-01', skills: [{ key: '2.A.1.a', name: 'Reading', level: 'good' }, { key: '2.B.1.a', name: 'Social', level: 'basic' }] },
    { name: 'Budi', group: 'Existing', currentCode: null, skills: [] },
  ],
  newGroups: ['Ops'],
}

async function expectOrgError(promise, code, status) {
  const err = await promise.then(() => null, (e) => e)
  expect(err).toBeInstanceOf(OrgError)
  expect(err.code).toBe(code)
  expect(err.status).toBe(status)
}

describe('org store', () => {
  it('creates, reads, renames and deletes an org with cascade', async () => {
    const { d1, store } = await setup()
    expect(await store.orgOf('u1')).toBeNull()
    const org = await store.createOrg('u1', { name: 'Synthetic Co', type: 'hr' })
    expect(org).toEqual({ id: expect.any(String), name: 'Synthetic Co', type: 'hr', createdAt: '2026-10-31T01:00:00.000Z' })
    expect(await store.orgOf('u1')).toEqual(org)
    await store.renameOrg('u1', 'New Name')
    expect((await store.orgOf('u1')).name).toBe('New Name')
    await store.addGroup(org.id, { name: 'Existing', targetCode: null })
    await store.importPeople(org.id, PREVIEW)
    const [g] = await store.groups(org.id)
    await store.setPlanStep(org.id, { groupId: g.id, roleCode: '2411-01', itemKey: 'k', status: 'planned' })
    await store.deleteOrg('u1')
    expect(await store.orgOf('u1')).toBeNull()
    for (const t of TABLES) expect((await d1.query(`SELECT COUNT(*) AS c FROM ${t}`)).rows[0].c).toBe(0)
  })

  it('rejects a second org for the same owner with 409', async () => {
    const { store } = await setup()
    await store.createOrg('u1', { name: 'A', type: 'hr' })
    await expectOrgError(store.createOrg('u1', { name: 'B', type: 'centre' }), 'exists', 409)
    expect((await store.createOrg('u2', { name: 'C', type: 'centre' })).type).toBe('centre')
  })

  it('adds, updates and deletes groups; delete is blocked while people remain', async () => {
    const { store } = await setup()
    const org = await store.createOrg('u1', { name: 'A', type: 'hr' })
    const g = await store.addGroup(org.id, { name: 'Ops', targetCode: '2411-01' })
    expect(await store.groups(org.id)).toEqual([{ id: g.id, name: 'Ops', targetCode: '2411-01' }])
    await store.updateGroup(org.id, g.id, { name: 'Ops 2' })
    await store.updateGroup(org.id, g.id, { targetCode: null })
    expect(await store.groups(org.id)).toEqual([{ id: g.id, name: 'Ops 2', targetCode: null }])
    await store.importPeople(org.id, { people: [{ name: 'X', group: 'Ops 2', currentCode: null, skills: [] }], newGroups: [] })
    await expectOrgError(store.deleteGroup(org.id, g.id), 'group_has_people', 409)
    const [p] = await store.people(org.id)
    await store.deletePerson(org.id, p.id)
    await store.deleteGroup(org.id, g.id)
    expect(await store.groups(org.id)).toEqual([])
  })

  it('imports a preview, creating new groups and returning skills', async () => {
    const { store } = await setup()
    const org = await store.createOrg('u1', { name: 'A', type: 'hr' })
    await store.addGroup(org.id, { name: 'Existing', targetCode: null })
    expect(await store.importPeople(org.id, PREVIEW)).toEqual({ added: 2, groupsAdded: 1 })
    const groups = await store.groups(org.id)
    const ops = groups.find((g) => g.name === 'Ops')
    expect(ops.targetCode).toBeNull()
    const people = await store.people(org.id)
    expect(people).toHaveLength(2)
    const aini = people.find((p) => p.displayName === 'Aini')
    expect(aini).toMatchObject({ groupId: ops.id, currentCode: '2411-01', source: 'roster', addedAt: '2026-10-31T01:00:00.000Z' })
    expect(aini.skills).toEqual(expect.arrayContaining([{ key: '2.A.1.a', level: 'good' }, { key: '2.B.1.a', level: 'basic' }]))
    expect(aini.skills).toHaveLength(2)
    expect(people.find((p) => p.displayName === 'Budi').skills).toEqual([])
  })

  it('updates and deletes people; ids from another org give 404', async () => {
    const { store } = await setup()
    const a = await store.createOrg('u1', { name: 'A', type: 'hr' })
    const b = await store.createOrg('u2', { name: 'B', type: 'hr' })
    const gb = await store.addGroup(b.id, { name: 'G', targetCode: null })
    await store.importPeople(b.id, { people: [{ name: 'P', group: 'G', currentCode: null, skills: [] }], newGroups: [] })
    const [pb] = await store.people(b.id)
    await expectOrgError(store.updatePerson(a.id, pb.id, { currentCode: '1' }), 'not_found', 404)
    await expectOrgError(store.deletePerson(a.id, pb.id), 'not_found', 404)
    await expectOrgError(store.updateGroup(a.id, gb.id, { name: 'Z' }), 'not_found', 404)
    await expectOrgError(store.deleteGroup(a.id, gb.id), 'not_found', 404)
    await expectOrgError(store.setPlanStep(a.id, { groupId: gb.id, roleCode: 'r', itemKey: 'k', status: 'done' }), 'not_found', 404)
    const ga = await store.addGroup(a.id, { name: 'GA', targetCode: null })
    await expectOrgError(store.updatePerson(b.id, pb.id, { groupId: ga.id }), 'not_found', 404)
    await store.updatePerson(b.id, pb.id, { groupId: gb.id, currentCode: '2411-01' })
    expect((await store.people(b.id))[0].currentCode).toBe('2411-01')
    await store.deletePerson(b.id, pb.id)
    expect(await store.people(b.id)).toEqual([])
  })

  it('keys plan steps by role', async () => {
    const { store } = await setup()
    const org = await store.createOrg('u1', { name: 'A', type: 'hr' })
    const g = await store.addGroup(org.id, { name: 'G', targetCode: null })
    await store.setPlanStep(org.id, { groupId: g.id, roleCode: '2411-01', itemKey: 'k1', status: 'in_progress' })
    expect((await store.planSteps(org.id, g.id, '2411-01')).get('k1')).toBe('in_progress')
    await store.setPlanStep(org.id, { groupId: g.id, roleCode: '2411-01', itemKey: 'k1', status: 'done' })
    expect((await store.planSteps(org.id, g.id, '2411-01')).get('k1')).toBe('done')
    expect((await store.planSteps(org.id, g.id, '2524-02')).size).toBe(0)
  })
})
