// Owner routes of the organisation view: real app on the fake D1, stub matching and pathway.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createFakeD1 } from '../helpers/fakeStores.js'
import { writeCatalogue } from '../helpers/onetFixture.js'

const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
const ROLE_A = '2521-03'
const ROLE_B = '2512-01'
const NAMES = ['Aini Synth', 'Budi Synth']

const ROLES = [
  { code: ROLE_B, title: 'Fixture Software Developer' },
  { code: ROLE_A, title: 'Fixture Database Designer' },
  { code: '1113-01', title: null },
]
const ROWS = [{ key: 'el:2.A.1.a', name: 'Reading', needed: 4, status: 'missing', gap: 4 }]
// a stub matching: ROLE_A has a full answer, ROLE_B a broken chain, anything else is unknown
const matching = {
  async role(profile, code) {
    if (code === ROLE_A) return { code, fit: { percent: 40, provisional: false, rows: ROWS }, outlook: {}, sdg: {} }
    if (code === ROLE_B) return { code, fit: null, chain: { missingStep: { id: 'soc2010_to_isco08', label: 'SOC 2010 to ISCO-08' } } }
    return null
  },
}
const pathway = { pathway: async () => ({ steps: { gaps: [], notAssessed: [], met: [] }, sources: [{ id: 'onet', name: 'O*NET', url: 'https://www.onetcenter.org' }] }) }

let dir
let d1
let server
let base
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'org-routes-'))
  await mkdir(path.join(dir, 'onet'))
  await writeCatalogue(path.join(dir, 'onet'))
  await mkdir(path.join(dir, 'emasco'))
  await writeFile(path.join(dir, 'emasco', 'role_details.json'), JSON.stringify({ roles: ROLES }))
  d1 = createFakeD1()
  await d1.migrate()
  server = createApp({ dataDir: dir, onetLive: null, d1, matching, pathway }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

const call = async (method, url, body, cookie, headers = {}) => {
  const isCsv = typeof body === 'string' || Buffer.isBuffer(body)
  const response = await fetch(base + url, {
    method,
    headers: { ...(body && !isCsv ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? (isCsv ? body : JSON.stringify(body)) : undefined,
  })
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
let n = 0
const newUser = async () => (await call('POST', '/api/auth/signup', { email: `owner${++n}@example.com`, password: 'password 123' })).cookie
const csv = (text, cookie) => call('POST', '/api/org/roster/preview', text, cookie, { 'Content-Type': 'text/csv' })
const keysDeep = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keysDeep(x, out) }
  return out
}

async function withOrg(type = 'hr') {
  const cookie = await newUser()
  await call('POST', '/api/org', { name: 'Synthetic Co', type }, cookie)
  return cookie
}

describe('access', () => {
  it('no cookie -> 401', async () => {
    const r = await call('GET', '/api/org')
    expect(r.status).toBe(401)
  })
  it('signed in without an organisation -> 404 no_organisation', async () => {
    const cookie = await newUser()
    const r = await call('GET', '/api/org', null, cookie)
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('no_organisation')
  })
  it('without D1 -> 503 accounts_unavailable', async () => {
    const app = createApp({ dataDir: dir, onetLive: null, d1: null, matching, pathway }).listen(0)
    await new Promise((resolve) => app.once('listening', resolve))
    const r = await fetch(`http://127.0.0.1:${app.address().port}/api/org`)
    expect(r.status).toBe(503)
    expect((await r.json()).error.code).toBe('accounts_unavailable')
    await new Promise((resolve) => app.close(resolve))
  })
})

describe('organisation', () => {
  it('create, read, rename, delete; a second create is 409', async () => {
    const cookie = await newUser()
    const made = await call('POST', '/api/org', { name: 'Synthetic Co', type: 'hr' }, cookie)
    expect(made.status).toBe(201)
    expect(made.body).toMatchObject({ name: 'Synthetic Co', type: 'hr' })
    expect((await call('POST', '/api/org', { name: 'Again', type: 'hr' }, cookie)).status).toBe(409)
    expect((await call('POST', '/api/org', { name: '', type: 'hr' }, await newUser())).status).toBe(400)
    const read = await call('GET', '/api/org', null, cookie)
    expect(read.body).toEqual({ org: made.body, groups: [], people: [] })
    expect((await call('PATCH', '/api/org', { name: 'Renamed' }, cookie)).status).toBe(200)
    expect((await call('GET', '/api/org', null, cookie)).body.org.name).toBe('Renamed')
    expect((await call('DELETE', '/api/org', null, cookie)).body).toEqual({ deleted: true })
    expect((await call('GET', '/api/org', null, cookie)).status).toBe(404)
  })
})

describe('groups', () => {
  it('add, duplicate name 409, unknown role 422, rename, delete', async () => {
    const cookie = await withOrg()
    const g = await call('POST', '/api/org/groups', { name: 'Ops', targetCode: ROLE_A }, cookie)
    expect(g.status).toBe(201)
    expect(g.body).toMatchObject({ name: 'Ops', targetCode: ROLE_A })
    const dup = await call('POST', '/api/org/groups', { name: 'Ops' }, cookie)
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('group_exists')
    expect((await call('POST', '/api/org/groups', { name: 'X', targetCode: '0000-00' }, cookie)).body.error.code).toBe('unknown_role')
    expect((await call('POST', '/api/org/groups', { name: 'X', targetCode: '1113-01' }, cookie)).status).toBe(422)
    const other = await call('POST', '/api/org/groups', { name: 'Sales' }, cookie)
    expect((await call('PATCH', `/api/org/groups/${other.body.id}`, { name: 'Ops' }, cookie)).status).toBe(409)
    expect((await call('PATCH', `/api/org/groups/${other.body.id}`, { name: 'Sales 2', targetCode: ROLE_B }, cookie)).body).toMatchObject({ name: 'Sales 2', targetCode: ROLE_B })
    expect((await call('DELETE', `/api/org/groups/${other.body.id}`, null, cookie)).body).toEqual({ deleted: true })
  })

  it('another owner sees their group and person ids as 404', async () => {
    const a = await withOrg()
    const b = await withOrg()
    const g = await call('POST', '/api/org/groups', { name: 'Ops' }, a)
    await csv(`name,group,current_role_code,skill,level\n${NAMES[0]},Ops,${ROLE_A},,\n`, a).then((p) => call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, a))
    const person = (await call('GET', '/api/org', null, a)).body.people[0]
    expect((await call('PATCH', `/api/org/groups/${g.body.id}`, { name: 'Hack' }, b)).status).toBe(404)
    expect((await call('DELETE', `/api/org/groups/${g.body.id}`, null, b)).status).toBe(404)
    expect((await call('PATCH', `/api/org/people/${person.id}`, { groupId: g.body.id }, b)).status).toBe(404)
    expect((await call('DELETE', `/api/org/people/${person.id}`, null, b)).status).toBe(404)
    expect((await call('PUT', '/api/org/plan-steps', { groupId: g.body.id, roleCode: ROLE_A, itemKey: 'el:2.A.1.a', status: 'done' }, b)).status).toBe(404)
  })
})

describe('roster', () => {
  const FILE = `name,group,current_role_code,skill,level\n${NAMES[0]},Ops,${ROLE_A},,\n${NAMES[1]},Ops,${ROLE_B},,\n`

  it('preview saves nothing; import adds them; the same previewId twice -> 410', async () => {
    const cookie = await withOrg()
    const p = await csv(FILE, cookie)
    expect(p.status).toBe(200)
    expect(p.body.previewId).toEqual(expect.any(String))
    expect(p.body.people).toHaveLength(2)
    expect((await call('GET', '/api/org', null, cookie)).body.people).toEqual([])
    const done = await call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, cookie)
    expect(done.body).toEqual({ added: 2, groupsAdded: 1 })
    expect((await call('GET', '/api/org', null, cookie)).body.people).toHaveLength(2)
    const again = await call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, cookie)
    expect(again.status).toBe(410)
    expect(again.body.error.code).toBe('preview_expired')
    expect((await call('POST', '/api/org/roster/import', { previewId: 'nope' }, cookie)).status).toBe(410)
  })

  it('another owner cannot import my preview', async () => {
    const a = await withOrg()
    const b = await withOrg()
    const p = await csv(FILE, a)
    expect((await call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, b)).status).toBe(410)
    expect((await call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, a)).status).toBe(200)
  })

  it('a bad header -> 422 bad_header; a file over 1 MB -> 413 too_large', async () => {
    const cookie = await withOrg()
    const bad = await csv('a,b\n1,2\n', cookie)
    expect(bad.status).toBe(422)
    expect(bad.body.error.code).toBe('bad_header')
    const big = await csv('name,group,current_role_code,skill,level\n' + 'x'.repeat(1_100_000), cookie)
    expect([413, 422]).toContain(big.status)
    expect(big.body.error.code).toBe('too_large')
  })

  it('a preview older than 15 minutes is gone', async () => {
    let t = new Date('2026-10-31T00:00:00Z').getTime()
    const d = createFakeD1()
    await d.migrate()
    const app = createApp({ dataDir: dir, onetLive: null, d1: d, matching, pathway, now: () => new Date(t) }).listen(0)
    await new Promise((resolve) => app.once('listening', resolve))
    const url = `http://127.0.0.1:${app.address().port}`
    const send = async (method, p, body, cookie, type) => {
      const r = await fetch(url + p, { method, headers: { ...(type ? { 'Content-Type': type } : body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: type ? body : body ? JSON.stringify(body) : undefined })
      return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }
    }
    const cookie = (await send('POST', '/api/auth/signup', { email: 'late@example.com', password: 'password 123' })).cookie
    await send('POST', '/api/org', { name: 'Co', type: 'hr' }, cookie)
    const p = await send('POST', '/api/org/roster/preview', FILE, cookie, 'text/csv')
    t += 16 * 60 * 1000
    expect((await send('POST', '/api/org/roster/import', { previewId: p.body.previewId }, cookie)).status).toBe(410)
    await new Promise((resolve) => app.close(resolve))
  })
})

describe('people', () => {
  it('may change only group and current role; delete works', async () => {
    const cookie = await withOrg()
    const p = await csv(`name,group,current_role_code,skill,level\n${NAMES[0]},Ops,${ROLE_A},,\n`, cookie)
    await call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, cookie)
    const g2 = await call('POST', '/api/org/groups', { name: 'Sales' }, cookie)
    const person = (await call('GET', '/api/org', null, cookie)).body.people[0]
    expect((await call('PATCH', `/api/org/people/${person.id}`, { skills: [] }, cookie)).status).toBe(400)
    expect((await call('PATCH', `/api/org/people/${person.id}`, { currentCode: '0000-00' }, cookie)).body.error.code).toBe('unknown_role')
    expect((await call('PATCH', `/api/org/people/${person.id}`, { groupId: g2.body.id, currentCode: ROLE_B }, cookie)).status).toBe(200)
    const after = (await call('GET', '/api/org', null, cookie)).body.people[0]
    expect(after).toMatchObject({ groupId: g2.body.id, currentCode: ROLE_B })
    expect((await call('DELETE', `/api/org/people/${person.id}`, null, cookie)).body).toEqual({ deleted: true })
  })
})

describe('team and plan steps', () => {
  async function seeded() {
    const cookie = await withOrg()
    const g = await call('POST', '/api/org/groups', { name: 'Ops', targetCode: ROLE_A }, cookie)
    const p = await csv(`name,group,current_role_code,skill,level\n${NAMES[0]},Ops,${ROLE_A},,\n${NAMES[1]},Ops,${ROLE_A},,\n`, cookie)
    await call('POST', '/api/org/roster/import', { previewId: p.body.previewId }, cookie)
    return { cookie, groupId: g.body.id }
  }

  it('team answer has no forbidden key; bad view or scenario -> 400', async () => {
    const { cookie } = await seeded()
    const ok = await call('GET', '/api/org/team?view=target&scenario=rapid', null, cookie)
    expect(ok.status).toBe(200)
    expect(ok.body.scenario).toBe('rapid')
    expect(keysDeep(ok.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
    expect((await call('GET', '/api/org/team?view=sideways', null, cookie)).body.error.code).toBe('bad_request')
    expect((await call('GET', '/api/org/team?scenario=wild', null, cookie)).status).toBe(400)
  })

  it('a step set for one role does not show for the group new target role', async () => {
    const { cookie, groupId } = await seeded()
    const key = 'el:2.A.1.a'
    expect((await call('PUT', '/api/org/plan-steps', { groupId, roleCode: ROLE_B, itemKey: key, status: 'done' }, cookie)).status).toBe(200)
    const stepOf = (team) => team.body.plans[groupId].steps.find((s) => s.key === key)
    expect(stepOf(await call('GET', '/api/org/team?view=target', null, cookie)).status).toBe('planned')
    await call('PUT', '/api/org/plan-steps', { groupId, roleCode: ROLE_A, itemKey: key, status: 'in_progress' }, cookie)
    expect(stepOf(await call('GET', '/api/org/team?view=target', null, cookie)).status).toBe('in_progress')
    // the target moves from A to B and back: each role keeps its own status
    await call('PATCH', `/api/org/groups/${groupId}`, { targetCode: ROLE_B }, cookie)
    await call('PATCH', `/api/org/groups/${groupId}`, { targetCode: ROLE_A }, cookie)
    expect(stepOf(await call('GET', '/api/org/team?view=target', null, cookie)).status).toBe('in_progress')
  })

  it('plan-steps checks its values', async () => {
    const { cookie, groupId } = await seeded()
    const put = (b) => call('PUT', '/api/org/plan-steps', { groupId, roleCode: ROLE_A, itemKey: 'el:2.A.1.a', status: 'done', ...b }, cookie)
    expect((await put({ status: 'finished' })).status).toBe(400)
    expect((await put({ itemKey: 'nonsense' })).status).toBe(400)
    expect((await put({ roleCode: '0000-00' })).body.error.code).toBe('unknown_role')
  })
})

describe('final review fix 7: one preview per owner', () => {
  const FILE = `name,group,current_role_code,skill,level\n${NAMES[0]},Ops,${ROLE_A},,\n`
  it('a new preview replaces the old one: the old previewId gives 410, the new one imports', async () => {
    const cookie = await withOrg()
    const first = await csv(FILE, cookie)
    const second = await csv(FILE, cookie)
    const old = await call('POST', '/api/org/roster/import', { previewId: first.body.previewId }, cookie)
    expect(old.status).toBe(410)
    expect(old.body.error.code).toBe('preview_expired')
    const ok = await call('POST', '/api/org/roster/import', { previewId: second.body.previewId }, cookie)
    expect(ok.body).toEqual({ added: 1, groupsAdded: 1 })
  })

  it('another owner keeps their own preview', async () => {
    const a = await withOrg()
    const b = await withOrg()
    const pa = await csv(FILE, a)
    await csv(FILE, b)
    expect((await call('POST', '/api/org/roster/import', { previewId: pa.body.previewId }, a)).status).toBe(200)
  })
})
