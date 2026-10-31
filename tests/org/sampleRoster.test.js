// The synthetic sample rosters (Task 8): hashes match the manifest, the sample reads cleanly with the real
// normaliser and real eMASCO codes, and the real matching service reaches O*NET for the planned roles.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createMatchingServiceFromEnv } from '../../server/matching/service.js'
import { checkRoster } from '../../server/org/roster.js'
import { profileOf } from '../../server/org/service.js'
import { createNormalizer } from '../../server/skills/normalize.js'
import { loadSkillCatalogue } from '../../server/skills/onetSkills.js'
import { createFakeD1 } from '../helpers/fakeStores.js'

const dataDir = path.resolve('data')
const orgDir = path.join(dataDir, 'org')
const BROKEN_ROLE = '2182-03'
const HR_GROUPS = ['Finance', 'Customer Service', 'Operations']

async function sampleCheck() {
  const bytes = await readFile(path.join(orgDir, 'sample-roster-hr.csv'))
  const normalizer = createNormalizer({ catalogue: await loadSkillCatalogue(path.join(dataDir, 'onet')) })
  const roles = JSON.parse(await readFile(path.join(dataDir, 'emasco', 'role_details.json'), 'utf8')).roles
  const roleCodes = new Set(roles.filter((r) => r.title).map((r) => r.code))
  return checkRoster({ bytes, type: 'hr', groups: HR_GROUPS, roleCodes, normalizeSkill: normalizer.normalizeSkill })
}

describe('files and manifest', () => {
  it('every file hashes to its manifest entry, and the manifest lists both CSVs', async () => {
    const manifest = JSON.parse(await readFile(path.join(orgDir, 'manifest.json'), 'utf8'))
    expect(Object.keys(manifest.files).sort()).toEqual(['roster-template.csv', 'sample-roster-hr.csv'])
    for (const [name, hash] of Object.entries(manifest.files)) {
      const bytes = await readFile(path.join(orgDir, name))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash)
    }
  })
  it('the template is just the header and one example', async () => {
    const text = await readFile(path.join(orgDir, 'roster-template.csv'), 'utf8')
    expect(text.split('\n')[0]).toBe('name,group,current_role_code,skill,level')
  })
})

describe('sample HR roster', () => {
  it('reads cleanly: nothing rejected, one unrecognised skill, 12 made-up people in 3 departments', async () => {
    const r = await sampleCheck()
    expect(r.rejected).toEqual([])
    expect(r.unrecognised).toHaveLength(1)
    expect(r.unrecognised[0].skill).toBe('Excel wizardry')
    expect(r.people).toHaveLength(12)
    expect(r.people.every((p) => /^Staff \d\d$/.test(p.name))).toBe(true)
    expect([...new Set(r.people.map((p) => p.group))].sort()).toEqual([...HR_GROUPS].sort())
    expect(new Set(r.people.flatMap((p) => p.skills.map((s) => s.level)))).toEqual(new Set(['basic', 'good', 'expert', 'not_assessed']))
  })

  it('with the real matching, each department has someone available and only the planned role breaks the chain', async () => {
    const r = await sampleCheck()
    const matching = createMatchingServiceFromEnv({ dataDir })
    const byGroup = new Map()
    const broken = []
    for (const p of r.people) {
      const answer = await matching.role(profileOf(p.skills), p.currentCode)
      expect(answer).not.toBeNull()
      const available = answer.chain.missingStep === null && answer.fit !== null
      if (answer.chain.missingStep) broken.push(p.currentCode)
      byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + (available ? 1 : 0))
    }
    for (const g of HR_GROUPS) expect(byGroup.get(g)).toBeGreaterThanOrEqual(1)
    expect([...new Set(broken)]).toEqual([BROKEN_ROLE])
  })
})

describe('GET /api/org/roster/sample', () => {
  let server
  let base
  beforeAll(async () => {
    const d1 = createFakeD1()
    await d1.migrate()
    server = createApp({ dataDir, onetLive: null, d1 }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it('needs a signed-in user', async () => {
    expect((await fetch(`${base}/api/org/roster/sample?type=hr`)).status).toBe(401)
  })
  it('returns the CSV as text/csv; other types are 404', async () => {
    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sample-owner@example.com', password: 'password 123' }),
    })
    const cookie = signup.headers.get('set-cookie').split(';')[0]
    const ok = await fetch(`${base}/api/org/roster/sample?type=hr`, { headers: { Cookie: cookie } })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toMatch(/^text\/csv/)
    expect(await ok.text()).toBe(await readFile(path.join(orgDir, 'sample-roster-hr.csv'), 'utf8'))
    for (const type of ['centre', 'x', '']) {
      expect((await fetch(`${base}/api/org/roster/sample?type=${type}`, { headers: { Cookie: cookie } })).status).toBe(404)
    }
  })
})
