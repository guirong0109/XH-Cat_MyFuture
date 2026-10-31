import { describe, expect, it } from 'vitest'
import { StoreError } from '../../server/store/d1.js'
import { createFakeD1 } from '../helpers/fakeStores.js'

const TABLES = ['orgs', 'org_groups', 'org_people', 'org_skills', 'org_invites', 'org_plan_steps']

async function seeded() {
  const d1 = createFakeD1()
  await d1.migrate()
  await d1.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', ['u1', 'hr@example.test', 'h', 's', '2026-10-31T00:00:00Z'])
  await d1.query('INSERT INTO orgs (id, owner_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)', ['o1', 'u1', 'Synthetic Co', 'hr', '2026-10-31T00:00:00Z'])
  await d1.query('INSERT INTO org_groups (id, org_id, name, target_code) VALUES (?, ?, ?, ?)', ['g1', 'o1', 'Team A', null])
  await d1.query('INSERT INTO org_people (id, org_id, group_id, display_name, current_code, source, user_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ['p1', 'o1', 'g1', 'Person One', null, 'roster', null, '2026-10-31T00:00:00Z'])
  await d1.query('INSERT INTO org_skills (person_id, item_key, level) VALUES (?, ?, ?)', ['p1', '2.A.1.a', 'basic'])
  return d1
}

describe('organisation view tables', () => {
  it('migrate runs twice without error and creates every org table', async () => {
    const d1 = createFakeD1()
    await d1.migrate()
    await d1.migrate()
    const { rows } = await d1.query("SELECT name FROM sqlite_master WHERE type = 'table'")
    const names = rows.map((r) => r.name)
    for (const table of TABLES) expect(names).toContain(table)
  })

  it('deleting a user removes the org and everything under it', async () => {
    const d1 = await seeded()
    await d1.query('DELETE FROM users WHERE id = ?', ['u1'])
    for (const table of ['orgs', 'org_groups', 'org_people', 'org_skills']) {
      const { rows } = await d1.query(`SELECT COUNT(*) AS n FROM ${table}`)
      expect(rows[0].n, table).toBe(0)
    }
  })

  it('one organisation per owner: a second org for the same owner fails', async () => {
    const d1 = await seeded()
    await expect(
      d1.query('INSERT INTO orgs (id, owner_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)', ['o2', 'u1', 'Other', 'centre', '2026-10-31T00:00:00Z']),
    ).rejects.toBeInstanceOf(StoreError)
  })

  it("a skill level outside basic, good, expert, not_assessed fails", async () => {
    const d1 = await seeded()
    await expect(
      d1.query('INSERT INTO org_skills (person_id, item_key, level) VALUES (?, ?, ?)', ['p1', '2.A.1.b', 'great']),
    ).rejects.toBeInstanceOf(StoreError)
  })
})
