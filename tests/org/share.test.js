// Join links and skill sharing: store functions on the fake D1, and the routes on the real app.
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createOrgStore } from '../../server/org/store.js'
import { createFakeD1 } from '../helpers/fakeStores.js'
import { writeCatalogue } from '../helpers/onetFixture.js'

const ROLE_A = '2521-03'
const sha = (t) => createHash('sha256').update(t).digest('hex')
const DAY = 24 * 3600 * 1000
const SKILLS = [
  { name: 'Reading Comprehension', canonicalId: 'onet:el:2.A.1.a', proficiency: 'good' },
  { name: 'Biology', canonicalId: 'onet:kn:2.C.1.b', proficiency: null },
  { name: 'Teamwork', canonicalId: 'custom:teamwork', proficiency: 'expert' },
  { name: 'Cooking', canonicalId: null, proficiency: 'basic' },
]

describe('store: invites and shares', () => {
  async function setup(clock = { t: new Date('2026-10-31T00:00:00Z') }) {
    const d1 = createFakeD1()
    await d1.migrate()
    for (const id of ['owner', 'emp', 'emp2']) {
      await d1.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', [id, `${id}@example.test`, 'h', 's', '2026-10-31T00:00:00Z'])
    }
    let n = 0
    const store = createOrgStore({ d1, now: () => clock.t, newId: () => `id${++n}` })
    const org = await store.createOrg('owner', { name: 'Synthetic Co', type: 'hr' })
    const group = await store.addGroup(org.id, { name: 'Ops' })
    return { d1, store, org, group, clock }
  }
  const skills = [{ key: 'el:2.A.1.a', level: 'good' }, { key: 'kn:2.C.1.b', level: 'not_assessed' }]

  it('stores only the SHA-256 of the token; valid 7 days', async () => {
    const { d1, store, org, group } = await setup()
    const { token, expiresAt } = await store.createInvite(org.id, { groupId: group.id, currentCode: ROLE_A })
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(expiresAt).toBe('2026-11-07T00:00:00.000Z')
    const { rows } = await d1.query('SELECT token_hash FROM org_invites')
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toBe(token)
    expect(rows[0].token_hash).toBe(sha(token))
    expect(JSON.stringify(await d1.query('SELECT * FROM org_invites'))).not.toContain(token)
  })

  it('createInvite refuses a group of another organisation', async () => {
    const { store, org } = await setup()
    await expect(store.createInvite(org.id, { groupId: 'nope' })).rejects.toMatchObject({ code: 'not_found', status: 404 })
  })

  it('inviteOf describes a link; unknown token is null', async () => {
    const { store, org, group } = await setup()
    const { token } = await store.createInvite(org.id, { groupId: group.id, currentCode: ROLE_A })
    expect(await store.inviteOf(token)).toMatchObject({ orgId: org.id, orgName: 'Synthetic Co', groupId: group.id, groupName: 'Ops', currentCode: ROLE_A, usedAt: null })
    expect(await store.inviteOf('wrong')).toBeNull()
  })

  it('share with a token creates a shared person and uses the link once', async () => {
    const { store, org, group } = await setup()
    const { token } = await store.createInvite(org.id, { groupId: group.id, currentCode: ROLE_A })
    await store.share('emp', { token, displayName: 'Aini', skills })
    const [p] = await store.people(org.id)
    expect(p).toMatchObject({ displayName: 'Aini', source: 'shared', groupId: group.id, currentCode: ROLE_A })
    expect(p.skills).toEqual([{ key: 'el:2.A.1.a', level: 'good' }, { key: 'kn:2.C.1.b', level: 'not_assessed' }])
    expect((await store.inviteOf(token)).usedAt).not.toBeNull()
    await expect(store.share('emp2', { token, displayName: 'B', skills })).rejects.toMatchObject({ code: 'link_expired', status: 410 })
    expect(await store.people(org.id)).toHaveLength(1)
  })

  it('a token 7 days + 1 second old is refused; 1 second before is fine', async () => {
    const { store, org, group, clock } = await setup()
    const { token } = await store.createInvite(org.id, { groupId: group.id })
    clock.t = new Date(clock.t.getTime() + 7 * DAY + 1000)
    await expect(store.share('emp', { token, displayName: 'A', skills })).rejects.toMatchObject({ code: 'link_expired', status: 410 })
    expect(await store.people(org.id)).toHaveLength(0)
    clock.t = new Date('2026-10-31T00:00:00Z')
    const second = await store.createInvite(org.id, { groupId: group.id })
    clock.t = new Date(clock.t.getTime() + 7 * DAY - 1000)
    await store.share('emp', { token: second.token, displayName: 'A', skills })
    expect(await store.people(org.id)).toHaveLength(1)
  })

  it('the owner cannot join their own organisation', async () => {
    const { store, org, group } = await setup()
    const { token } = await store.createInvite(org.id, { groupId: group.id })
    await expect(store.share('owner', { token, displayName: 'Boss', skills })).rejects.toMatchObject({ code: 'own_organisation', status: 409 })
    expect((await store.inviteOf(token)).usedAt).toBeNull()
  })

  it('sharing again with a new link updates the same person', async () => {
    const { store, org, group } = await setup()
    const a = await store.createInvite(org.id, { groupId: group.id })
    const b = await store.createInvite(org.id, { groupId: group.id })
    await store.share('emp', { token: a.token, displayName: 'Aini', skills })
    await store.share('emp', { token: b.token, displayName: 'Aini 2', skills: [{ key: 'el:9', level: 'basic' }] })
    const people = await store.people(org.id)
    expect(people).toHaveLength(1)
    expect(people[0].displayName).toBe('Aini 2')
    expect(people[0].skills).toEqual([{ key: 'el:9', level: 'basic' }])
  })

  it('share without a token replaces; with no share -> 404 no_share', async () => {
    const { store, org, group } = await setup()
    await expect(store.share('emp', { displayName: 'x', skills })).rejects.toMatchObject({ code: 'no_share', status: 404 })
    const { token } = await store.createInvite(org.id, { groupId: group.id })
    await store.share('emp', { token, displayName: 'Aini', skills })
    await store.share('emp', { displayName: 'Aini', skills: [{ key: 'kn:1', level: 'expert' }] })
    expect((await store.people(org.id))[0].skills).toEqual([{ key: 'kn:1', level: 'expert' }])
  })

  it('shareOf and stopSharing', async () => {
    const { d1, store, org, group } = await setup()
    expect(await store.shareOf('emp')).toBeNull()
    const { token } = await store.createInvite(org.id, { groupId: group.id })
    await store.share('emp', { token, displayName: 'Aini', skills })
    expect(await store.shareOf('emp')).toEqual({ orgName: 'Synthetic Co', groupName: 'Ops', displayName: 'Aini', skills })
    await store.stopSharing('emp')
    expect(await store.shareOf('emp')).toBeNull()
    expect((await d1.query('SELECT COUNT(*) AS c FROM org_skills')).rows[0].c).toBe(0)
    expect(await store.people(org.id)).toHaveLength(0)
  })

  it('stopSharing leaves roster people alone', async () => {
    const { store, org } = await setup()
    await store.importPeople(org.id, { people: [{ name: 'R', group: 'Ops', currentCode: null, skills: [] }], newGroups: [] })
    await store.stopSharing('emp')
    expect(await store.people(org.id)).toHaveLength(1)
  })
})

describe('routes', () => {
  let dir
  let d1
  let server
  let base
  // a test clock: each new user moves it 16 minutes on, so the per-address limit starts fresh for each test
  let clockMs = Date.parse('2026-10-31T00:00:00Z')
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'org-share-'))
    await mkdir(path.join(dir, 'onet'))
    await writeCatalogue(path.join(dir, 'onet'))
    await mkdir(path.join(dir, 'emasco'))
    await writeFile(path.join(dir, 'emasco', 'role_details.json'), JSON.stringify({ roles: [{ code: ROLE_A, title: 'Fixture Database Designer' }] }))
    d1 = createFakeD1()
    await d1.migrate()
    server = createApp({ dataDir: dir, onetLive: null, d1, matching: {}, pathway: {}, now: () => new Date(clockMs) }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })

  const call = async (method, url, body, cookie) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  let n = 0
  const newUser = async () => {
    clockMs += 16 * 60 * 1000
    const r = await call('POST', '/api/auth/signup', { email: `share${++n}@example.com`, password: 'password 123' })
    const me = await call('GET', '/api/auth/me', null, r.cookie)
    return { cookie: r.cookie, id: me.body.user.id }
  }
  async function saveProfile(user, skills = SKILLS) {
    const id = `p${++n}`
    await d1.query('INSERT INTO profiles (id, user_id, version, status, json, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, user.id, 1, 'confirmed', JSON.stringify({ skills }), '2026-10-31T00:00:00Z'])
    return id
  }
  async function setupOrg() {
    const owner = await newUser()
    await call('POST', '/api/org', { name: 'Synthetic Co', type: 'hr' }, owner.cookie)
    const group = (await call('POST', '/api/org/groups', { name: 'Ops' }, owner.cookie)).body
    const invite = await call('POST', '/api/org/invites', { groupId: group.id, currentCode: ROLE_A }, owner.cookie)
    return { owner, group, invite }
  }

  it('owner makes a link; token returned once, only its hash is stored', async () => {
    const { invite } = await setupOrg()
    expect(invite.status).toBe(201)
    expect(invite.body.url).toBe(`/#join=${invite.body.token}`)
    expect(invite.body.expiresAt).toBeTruthy()
    expect((await d1.query('SELECT token_hash FROM org_invites WHERE token_hash = ?', [sha(invite.body.token)])).rows).toHaveLength(1)
    expect((await d1.query('SELECT token_hash FROM org_invites WHERE token_hash = ?', [invite.body.token])).rows).toHaveLength(0)
  })

  it('invites need a signed-in owner of an organisation, and a group of their own', async () => {
    const { group, owner } = await setupOrg()
    expect((await call('POST', '/api/org/invites', { groupId: group.id })).status).toBe(401)
    const other = await newUser()
    expect((await call('POST', '/api/org/invites', { groupId: group.id }, other.cookie)).body.error.code).toBe('no_organisation')
    await call('POST', '/api/org', { name: 'Other', type: 'hr' }, other.cookie)
    expect((await call('POST', '/api/org/invites', { groupId: group.id }, other.cookie)).status).toBe(404)
    expect((await call('POST', '/api/org/invites', { groupId: group.id, currentCode: 'bad' }, owner.cookie)).status).toBe(422)
  })

  it('join -> share -> owner sees a shared person with only O*NET skills', async () => {
    const { owner, invite } = await setupOrg()
    const emp = await newUser()
    const join = await call('POST', '/api/org/join', { token: invite.body.token }, emp.cookie)
    expect(join.status).toBe(200)
    expect(join.body).toEqual({ orgName: 'Synthetic Co', groupName: 'Ops', willShare: ['skill names and levels', 'group', 'role', 'display name'] })
    const profileId = await saveProfile(emp)
    const put = await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'Aini Synth', profileId }, emp.cookie)
    expect(put.status).toBe(200)
    expect(put.body.shared).toEqual([{ key: 'el:2.A.1.a', name: 'Reading Comprehension', level: 'good' }, { key: 'kn:2.C.1.b', name: 'Biology', level: 'not_assessed' }])
    expect(put.body.notShared).toEqual([
      { name: 'Teamwork', reason: 'not an O*NET skill or knowledge item' },
      { name: 'Cooking', reason: 'not an O*NET skill or knowledge item' },
    ])
    const org = await call('GET', '/api/org', null, owner.cookie)
    const person = org.body.people.find((p) => p.displayName === 'Aini Synth')
    expect(person).toMatchObject({ source: 'shared', currentCode: ROLE_A })
    expect(person.skills).toEqual([{ key: 'el:2.A.1.a', level: 'good' }, { key: 'kn:2.C.1.b', level: 'not_assessed' }])
    const mine = await call('GET', '/api/org/share', null, emp.cookie)
    expect(mine.body).toMatchObject({ orgName: 'Synthetic Co', groupName: 'Ops', displayName: 'Aini Synth' })
  })

  it('dryRun answers the same lists, saves nothing and does not use the link', async () => {
    const { owner, invite } = await setupOrg()
    const emp = await newUser()
    const profileId = await saveProfile(emp)
    const dry = await call('PUT', '/api/org/share', { token: invite.body.token, profileId, dryRun: true }, emp.cookie)
    expect(dry.status).toBe(200)
    expect(dry.body.shared).toEqual([{ key: 'el:2.A.1.a', name: 'Reading Comprehension', level: 'good' }, { key: 'kn:2.C.1.b', name: 'Biology', level: 'not_assessed' }])
    expect(dry.body.notShared).toHaveLength(2)
    expect((await call('GET', '/api/org/share', null, emp.cookie)).body).toBeNull()
    const org = await call('GET', '/api/org', null, owner.cookie)
    expect(org.body.people).toHaveLength(0)
    // the link still works afterwards
    const real = await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'Aini Synth', profileId }, emp.cookie)
    expect(real.status).toBe(200)
    expect(real.body.shared).toEqual(dry.body.shared)
    // another user's profile is still 404 on a dry run
    const other = await newUser()
    expect((await call('PUT', '/api/org/share', { profileId, dryRun: true }, other.cookie)).status).toBe(404)
  })

  it('re-using the token -> 410 link_expired with the message', async () => {
    const { invite } = await setupOrg()
    const a = await newUser()
    const b = await newUser()
    await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'A', profileId: await saveProfile(a) }, a.cookie)
    const join = await call('POST', '/api/org/join', { token: invite.body.token }, b.cookie)
    expect(join.status).toBe(410)
    expect(join.body.error.code).toBe('link_expired')
    expect(join.body.error.message).toBe('This link has expired or was already used. Ask HR for a new one.')
    const put = await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'B', profileId: await saveProfile(b) }, b.cookie)
    expect(put.status).toBe(410)
  })

  it('an expired link -> 410; a made-up token -> 410', async () => {
    const { invite } = await setupOrg()
    await d1.query('UPDATE org_invites SET expires_at = ? WHERE token_hash = ?', ['2000-01-01T00:00:00.000Z', sha(invite.body.token)])
    const emp = await newUser()
    expect((await call('POST', '/api/org/join', { token: invite.body.token }, emp.cookie)).status).toBe(410)
    expect((await call('POST', '/api/org/join', { token: 'made-up' }, emp.cookie)).status).toBe(410)
  })

  it('the owner opening their own link -> 409 own_organisation', async () => {
    const { owner, invite } = await setupOrg()
    const r = await call('POST', '/api/org/join', { token: invite.body.token }, owner.cookie)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('own_organisation')
  })

  it('join and share need a session', async () => {
    expect((await call('POST', '/api/org/join', { token: 'x' })).status).toBe(401)
    expect((await call('PUT', '/api/org/share', { displayName: 'x', profileId: 'p' })).status).toBe(401)
    expect((await call('GET', '/api/org/share')).status).toBe(401)
    expect((await call('DELETE', '/api/org/share')).status).toBe(401)
  })

  it('another user profile id -> 404; bad body -> 400; a failed attempt does not use the link', async () => {
    const { invite } = await setupOrg()
    const a = await newUser()
    const b = await newUser()
    const aProfile = await saveProfile(a)
    const r = await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'B', profileId: aProfile }, b.cookie)
    expect(r.status).toBe(404)
    expect((await call('GET', '/api/org/share', null, b.cookie)).body).toBeNull()
    expect((await call('PUT', '/api/org/share', { token: invite.body.token, displayName: '', profileId: aProfile }, a.cookie)).status).toBe(400)
    expect((await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'A' }, a.cookie)).status).toBe(400)
    expect((await call('POST', '/api/org/join', { token: invite.body.token }, b.cookie)).status).toBe(200)
  })

  it('sharing twice (second without a token) leaves one person with replaced skills', async () => {
    const { owner, invite } = await setupOrg()
    const emp = await newUser()
    await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'Aini', profileId: await saveProfile(emp) }, emp.cookie)
    const second = await saveProfile(emp, [{ name: 'Chemistry', canonicalId: 'onet:kn:2.C.2.a', proficiency: 'expert' }])
    const r = await call('PUT', '/api/org/share', { displayName: 'Aini', profileId: second }, emp.cookie)
    expect(r.status).toBe(200)
    const people = (await call('GET', '/api/org', null, owner.cookie)).body.people.filter((p) => p.source === 'shared')
    expect(people).toHaveLength(1)
    expect(people[0].skills).toEqual([{ key: 'kn:2.C.2.a', level: 'expert' }])
  })

  it('share without a token and without a share -> 404 no_share', async () => {
    const emp = await newUser()
    const r = await call('PUT', '/api/org/share', { displayName: 'A', profileId: await saveProfile(emp) }, emp.cookie)
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('no_share')
  })

  it('stop sharing removes the person and skills', async () => {
    const { owner, invite } = await setupOrg()
    const emp = await newUser()
    await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'Aini', profileId: await saveProfile(emp) }, emp.cookie)
    const r = await call('DELETE', '/api/org/share', null, emp.cookie)
    expect(r.body).toEqual({ stopped: true })
    expect((await call('GET', '/api/org', null, owner.cookie)).body.people).toHaveLength(0)
    expect((await call('GET', '/api/org/share', null, emp.cookie)).body).toBeNull()
  })

  it('deleting the employee account removes the person', async () => {
    const { owner, invite } = await setupOrg()
    const emp = await newUser()
    await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'Aini', profileId: await saveProfile(emp) }, emp.cookie)
    expect((await call('GET', '/api/org', null, owner.cookie)).body.people).toHaveLength(1)
    expect((await call('DELETE', '/api/auth/me', null, emp.cookie)).status).toBe(200)
    expect((await call('GET', '/api/org', null, owner.cookie)).body.people).toHaveLength(0)
  })

  it('the owner cannot change the skills of a shared person: no route', async () => {
    const { owner, invite } = await setupOrg()
    const emp = await newUser()
    await call('PUT', '/api/org/share', { token: invite.body.token, displayName: 'Aini', profileId: await saveProfile(emp) }, emp.cookie)
    const person = (await call('GET', '/api/org', null, owner.cookie)).body.people[0]
    const r = await fetch(`${base}/api/org/people/${person.id}/skills`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: owner.cookie }, body: '{"skills":[]}' })
    expect(r.status).toBe(404)
    expect((await call('PATCH', `/api/org/people/${person.id}`, { skills: [] }, owner.cookie)).status).toBe(400)
  })

  it('the 11th join attempt in 15 minutes -> 429 too_many_attempts', async () => {
    const emp = await newUser()
    let last
    for (let i = 0; i < 11; i++) last = await call('POST', '/api/org/join', { token: 'nope' }, emp.cookie)
    expect(last.status).toBe(429)
    expect(last.body.error.code).toBe('too_many_attempts')
  })
})
