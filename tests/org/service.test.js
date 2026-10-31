// Team service: people's shared skills -> matching's numbers -> the team answer. Real matching service on the fixture
// data dir, real store on the fake D1, a stub pathway with one course per key.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createFakeD1 } from '../helpers/fakeStores.js'
import { createOrgStore } from '../../server/org/store.js'
import { createOrgService, profileOf } from '../../server/org/service.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { createDemoService } from '../../server/radar/demo.js'
import { createMatchingServiceFromEnv } from '../../server/matching/service.js'
import { readFileSync } from 'node:fs'
import { FIXTURE, fixtureReferences, makeMatchingFixture } from '../helpers/matchingFixture.js'

const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-tests-0123456789', RADAR_DEMO_KEY: 'demo-key-for-tests-9876543210', RADAR_SESSION_SECRET: 's'.repeat(40) }
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
const BASE = JSON.parse(readFileSync('data/radar/demo/base.json', 'utf8'))
const now = () => new Date('2026-10-31T00:00:00.000Z')
const NAMES = ['Aini Synth', 'Budi Synth', 'Citra Synth', 'Dewi Synth']

let fixture
let references
beforeAll(async () => {
  fixture = await makeMatchingFixture()
  references = await loadRadarReferences('data')
})
afterAll(async () => {
  await fixture?.cleanup()
})

function keysDeep(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      keysDeep(v, out)
    }
  }
  return out
}

function buildMatching() {
  const store = createMemoryStore()
  const radar = createRadarService({ store, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor: null, now, log: () => {} })
  const access = createRadarAccess({ env: ENV, now })
  const demo = createDemoService({ store, base: BASE, references: async () => references, now })
  const matching = createMatchingServiceFromEnv({ dataDir: fixture.dir, radar, demo, access, references: fixtureReferences, now, log: () => {} })
  return { matching, access, demo }
}

// One course per step key, whatever the role.
const stubPathway = () => ({
  pathway: vi.fn(async (profile, code) => {
    const mk = (s) => ({ ...s, courses: [{ title: `course ${s.key}`, url: 'https://example.org/c' }], search: [{ label: `search ${s.key}`, url: 'https://example.org/s' }] })
    const role = await buildMatching.current.role(profile, code, null)
    const rows = role?.fit?.rows ?? []
    const gaps = rows.filter((r) => r.status === 'below' || r.status === 'missing').map((r) => mk({ key: r.key, name: r.name }))
    const notAssessed = rows.filter((r) => r.status === 'not_assessed').map((r) => mk({ key: r.key, name: r.name }))
    const met = rows.filter((r) => r.status === 'met').map((r) => mk({ key: r.key, name: r.name }))
    return { code, steps: role?.fit ? { gaps, notAssessed, met } : null, sources: [{ id: 'onet', name: 'O*NET', url: 'https://www.onetcenter.org' }] }
  }),
})
buildMatching.current = null

const GOOD = [{ key: 'el:2.A.1.a', name: 'Reading', level: 'good' }, { key: 'kn:2.C.3.a', name: 'Computers', level: 'basic' }]

async function setup({ type = 'hr', matchingOverride = null, log = vi.fn() } = {}) {
  const d1 = createFakeD1()
  await d1.migrate()
  await d1.query('INSERT INTO users (id, email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)', ['u1', 'u1@example.test', 'h', 's', '2026-10-31T00:00:00Z'])
  let n = 0
  const store = createOrgStore({ d1, now, newId: () => `id${++n}` })
  const org = await store.createOrg('u1', { name: 'Synthetic Co', type })
  const built = matchingOverride ?? buildMatching()
  buildMatching.current = built.matching
  const pathway = stubPathway()
  const service = createOrgService({ store, matching: built.matching, pathway, log })
  return { store, org, service, pathway, built, log }
}

async function roster(store, org, people) {
  const preview = { people, newGroups: ['Ops'] }
  await store.importPeople(org.id, preview)
  const [group] = await store.groups(org.id)
  await store.updateGroup(org.id, group.id, { targetCode: FIXTURE.fullRole })
  return group
}

const THREE = [
  { name: NAMES[0], group: 'Ops', currentCode: FIXTURE.fullRole, skills: GOOD },
  { name: NAMES[1], group: 'Ops', currentCode: FIXTURE.fullRole, skills: [{ key: 'el:2.A.1.a', name: 'Reading', level: 'expert' }, { key: 'kn:2.C.3.a', name: 'Computers', level: 'good' }] },
  { name: NAMES[2], group: 'Ops', currentCode: FIXTURE.brokenRole, skills: GOOD },
]

describe('profileOf', () => {
  it('builds a matching profile from shared skills; not_assessed has no proficiency', () => {
    expect(profileOf([{ key: 'el:2.A.1.a', level: 'good' }, { key: 'kn:2.C.3.a', level: 'not_assessed' }])).toEqual({
      skills: [
        { canonicalId: 'onet:el:2.A.1.a', name: 'el:2.A.1.a', proficiency: 'good' },
        { canonicalId: 'onet:kn:2.C.3.a', name: 'kn:2.C.3.a', proficiency: null },
      ],
    })
  })
})

describe('team answer', () => {
  it('two people on a full chain make the heatmap; the broken chain person is left out with the missing step', async () => {
    const { store, org, service } = await setup()
    await roster(store, org, THREE)
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.org).toMatchObject({ id: org.id, type: 'hr' })
    expect(answer.view).toBe('current')
    expect(answer.groups).toEqual([{ id: expect.any(String), name: 'Ops', targetCode: FIXTURE.fullRole, targetTitle: expect.any(String), size: 3 }])
    const cells = Object.values(answer.heatmap.cells)[0]
    expect(cells['el:2.A.1.a'].needing).toBe(2)
    expect(answer.leftOut).toHaveLength(1)
    expect(answer.leftOut[0]).toMatchObject({ reason: 'chain_broken', missingStep: expect.objectContaining({ id: 'soc2010_to_isco08' }) })
    const left = answer.people.find((p) => p.id === answer.leftOut[0].personId)
    expect(left.current).toMatchObject({ code: FIXTURE.brokenRole, available: false, reason: 'chain_broken' })
    expect(left.target).toMatchObject({ code: FIXTURE.fullRole, available: true })
    expect(answer.sources.length).toBeGreaterThan(0)
  })

  it('each person current percent equals matching role fit percent', async () => {
    const { store, org, service, built } = await setup()
    await roster(store, org, THREE)
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    const people = await store.people(org.id)
    for (const p of people.filter((x) => x.currentCode === FIXTURE.fullRole)) {
      const expected = (await built.matching.role(profileOf(p.skills), FIXTURE.fullRole, null)).fit.percent
      expect(answer.people.find((a) => a.id === p.id).current.percent).toBe(expected)
      expect(answer.people.find((a) => a.id === p.id).target.percent).toBe(expected)
    }
  })

  it('a person with only an unknown key -> reason no_known_skill (and left out)', async () => {
    const { store, org, service } = await setup()
    await roster(store, org, [{ name: NAMES[3], group: 'Ops', currentCode: FIXTURE.fullRole, skills: [{ key: 'el:9.9.9', name: 'Made-up', level: 'expert' }] }])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.people[0].current).toMatchObject({ available: false, reason: 'no_known_skill', percent: null })
    expect(answer.leftOut).toEqual([expect.objectContaining({ reason: 'no_known_skill' })])
  })

  it('the scenario changes only bands and moved', async () => {
    const { store, org, service } = await setup()
    await roster(store, org, THREE)
    const a = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    const b = await service.team('u1', { view: 'current', scenario: 'rapid' }, null)
    expect(b.heatmap).toEqual(a.heatmap)
    expect(b.plans).toEqual(a.plans)
    expect(b.people).toEqual(a.people)
    expect(b.sdg).toEqual(a.sdg)
    expect(b.scenario).toBe('rapid')
    const gid = a.groups[0].id
    expect(a.bands[gid].reduce((x, y) => x + y, 0)).toBe(2)
  })

  it('change test: judge signals move bands and moved, not the heatmap', async () => {
    const built = buildMatching()
    const { store, org, service } = await setup({ matchingOverride: built })
    await roster(store, org, THREE)
    const login = built.access.login('demo', ENV.RADAR_DEMO_KEY, '127.0.0.1')
    expect(login.ok).toBe(true)
    await built.demo.start(login.session.sessionId)
    const judge = { headers: { cookie: login.cookie.split(';')[0] } }
    const gid = (await store.groups(org.id))[0].id
    const plain = await service.team('u1', { view: 'current', scenario: 'moderate' }, { headers: {} })
    const withJudge = await service.team('u1', { view: 'current', scenario: 'moderate' }, judge)
    expect(plain.bands[gid]).toEqual([0, 0, 0, 2])
    expect(withJudge.bands[gid]).toEqual([2, 0, 0, 0])
    expect(withJudge.heatmap).toEqual(plain.heatmap)
  })

  it('a centre org treats the current view as target; no current data is read', async () => {
    const { store, org, service } = await setup({ type: 'centre' })
    await roster(store, org, THREE.map((p) => ({ ...p, currentCode: null })))
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.view).toBe('target')
    expect(answer.people.every((p) => p.current === null && p.target?.available)).toBe(true)
  })

  it('plan role: target view uses the group target; current view the most common current code (ties: lowest)', async () => {
    const { store, org, service } = await setup()
    const group = await roster(store, org, THREE)
    const t = await service.team('u1', { view: 'target', scenario: 'moderate' }, null)
    expect(t.plans[group.id].roleCode).toBe(FIXTURE.fullRole)
    // the role title travels with the code: on the plan, the group target and each person's role
    expect(typeof t.plans[group.id].roleTitle).toBe('string')
    expect(t.plans[group.id].roleTitle.length).toBeGreaterThan(0)
    expect(t.groups.find((g) => g.id === group.id).targetTitle).toBe(t.plans[group.id].roleTitle)
    expect(t.people.find((p) => p.target?.available).target.title).toBe(t.plans[group.id].roleTitle)
    const c = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(c.plans[group.id].roleCode).toBe(FIXTURE.fullRole)
    // one on 2512-01 (broken chain), one on 2521-03: only people with a Skill Match count, so 2521-03 (final fix 1)
    const tie = await setup()
    const g = await roster(tie.store, tie.org, [THREE[0], THREE[2]])
    const answer = await tie.service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.plans[g.id].roleCode).toBe(FIXTURE.fullRole)
  })

  it('plan steps carry status (default planned), courses and search from the first person who has the key', async () => {
    const { store, org, service, pathway } = await setup()
    const group = await roster(store, org, THREE)
    await store.setPlanStep(org.id, { groupId: group.id, roleCode: FIXTURE.fullRole, itemKey: 'kn:2.C.3.a', status: 'done' })
    const answer = await service.team('u1', { view: 'target', scenario: 'moderate' }, null)
    const steps = answer.plans[group.id].steps
    expect(steps.length).toBeGreaterThan(0)
    const step = steps.find((s) => s.key === 'kn:2.C.3.a')
    expect(step).toMatchObject({ status: 'done', courses: [expect.objectContaining({ title: 'course kn:2.C.3.a' })], search: [expect.anything()] })
    expect(steps.filter((s) => s.key !== 'kn:2.C.3.a').every((s) => s.status === 'planned')).toBe(true)
    expect(pathway.pathway).toHaveBeenCalled()
  })

  it('logs carry codes only and the answer has no forbidden key', async () => {
    const log = vi.fn()
    const broken = { matching: { role: async () => { throw Object.assign(new Error(`boom ${NAMES[0]}`), { code: 'store_error' }) } } }
    const { store, org, service } = await setup({ log, matchingOverride: broken })
    await roster(store, org, THREE)
    await expect(service.team('u1', { view: 'current', scenario: 'moderate' }, null)).rejects.toBeTruthy()
    expect(log).toHaveBeenCalledWith('[org] team failed: store_error')

    const ok = await setup({ log })
    await roster(ok.store, ok.org, THREE)
    const answer = await ok.service.team('u1', { view: 'current', scenario: 'rapid' }, null)
    expect(keysDeep(answer).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
    const logged = JSON.stringify(log.mock.calls)
    for (const name of NAMES) expect(logged).not.toContain(name)
    expect(logged).not.toContain('el:2.A.1.a')
  })
})

// ---- final review fixes: a stub matching with two available roles and one broken chain
const ROW = (key, needed = 4) => ({ key, name: key, needed, you: 0, status: 'missing', gap: needed })
function fakeMatching({ listFails = false, judge = false } = {}) {
  const roles = {
    '1111-01': { title: 'Role A', rows: [ROW('el:A')] },
    '2222-01': { title: 'Role B', rows: [ROW('el:B')] },
    '3333-01': { title: 'Role C', broken: true },
  }
  const sdgFor = (code) => ({ pathPreview: { goals: [{ goal: 4, links: [{ via: { kind: 'role', code }, target: code === '1111-01' ? '4.4' : '8.2', reason: 'r' }] }] } })
  return {
    matching: {
      role: async (profile, code) => {
        const r = roles[code]
        if (!r) return null
        return {
          code, title: r.title, chain: { missingStep: r.broken ? { id: 'soc2010_to_isco08' } : null },
          fit: r.broken ? null : { percent: 0, provisional: false, rows: r.rows },
          outlook: { jobAds: null, ai: { moderate: { available: true }, rapid: { available: true } } },
          sdg: r.broken ? { pathPreview: { goals: [] } } : sdgFor(code),
        }
      },
      list: async () => {
        if (listFails) throw Object.assign(new Error('list down'), { code: 'data_error' })
        return {
          sources: [
            { id: 'aei', name: 'Anthropic Economic Index', date: '2026-09-15' },
            { id: 'ilo', name: 'ILO Working Paper 140', date: '2026-10-01' },
            { id: 'sdg-links', name: 'SDG links (team draft)', date: null },
          ],
          radar: judge ? { state: 'data', judgeSession: true } : { state: 'data', publishedAt: '2026-10-20', observationPeriod: '2026-Q2' },
        }
      },
    },
  }
}
const P = (name, currentCode, group = 'Ops') => ({ name, group, currentCode, skills: GOOD })

describe('final review fixes: current-view plan, sources, no current role, pathway failure', () => {
  it('1: the current-view plan and SDG use only people on the plan role; the screen count is k of n', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    const group = await roster(store, org, [P('A1', '1111-01'), P('A2', '1111-01'), P('B1', '2222-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    const plan = answer.plans[group.id]
    expect(plan.roleCode).toBe('1111-01')
    expect(plan.steps.map((s) => s.key)).toEqual(['el:A'])
    expect(plan.counted).toBe(2)
    expect(answer.sdg[group.id].goals.flatMap((g) => g.links.map((l) => l.target))).toEqual(['4.4'])
    // the heatmap still has every role
    expect(Object.keys(answer.heatmap.cells[group.id]).sort()).toEqual(['el:A', 'el:B'])
  })

  it('1: when the most common code is a broken chain, the most common AVAILABLE code is the plan role', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    const group = await roster(store, org, [P('C1', '3333-01'), P('C2', '3333-01'), P('B1', '2222-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.plans[group.id]).toMatchObject({ roleCode: '2222-01', counted: 1 })
  })

  it('1: no available person -> no plan role, with the reason none_available', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    const group = await roster(store, org, [P('C1', '3333-01'), P('C2', '3333-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.plans[group.id]).toMatchObject({ roleCode: null, noRole: 'none_available', steps: [] })
  })

  it('1: courses are looked up until every step key is found, not until the count matches', async () => {
    const { store, org, service, pathway } = await setup({ matchingOverride: fakeMatching() })
    // the first answer has a step that is not in the plan: the second person must still be asked
    pathway.pathway.mockImplementationOnce(async (profile, code) => ({ code, steps: { gaps: [{ key: 'el:Z', courses: [{ title: 'z' }], search: [] }], notAssessed: [], met: [] }, sources: [] }))
    const group = await roster(store, org, [P('A1', '1111-01'), P('A2', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.plans[group.id].steps[0].courses).toEqual([expect.objectContaining({ title: 'course el:A' })])
  })

  it('2: the dated AI, job-ad and SDG sources of matching travel as outlookSources', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    await roster(store, org, [P('A1', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    const ids = answer.outlookSources.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['aei', 'ilo', 'sdg-links', 'dosm']))
    expect(answer.outlookSources.find((s) => s.id === 'aei').date).toBe('2026-09-15')
    expect(answer.outlookSources.find((s) => s.id === 'dosm')).toMatchObject({ date: '2026-10-20' })
  })

  it('2: a judge Trend Change Test session never names DOSM as the job-ad source and says the data is test data', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching({ judge: true }) })
    await roster(store, org, [P('A1', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.outlookSources.map((s) => s.id)).not.toContain('dosm')
    expect(answer.judgeSession).toBe(true)
  })

  it('2: an ordinary session is not marked as a judge session', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    await roster(store, org, [P('A1', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.judgeSession).toBe(false)
  })

  it('2: real matching -> outlookSources has the Anthropic Economic Index, ILO and SDG sources', async () => {
    const { store, org, service } = await setup()
    await roster(store, org, THREE)
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    for (const id of ['aei', 'ilo', 'sdg-targets', 'sdg-links']) expect(answer.outlookSources.map((s) => s.id)).toContain(id)
  })

  it('2: a failing list call leaves outlookSources empty and logs the code only', async () => {
    const log = vi.fn()
    const { store, org, service } = await setup({ matchingOverride: fakeMatching({ listFails: true }), log })
    await roster(store, org, [P('A1', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.outlookSources).toEqual([])
    expect(log).toHaveBeenCalledWith('[org] sources failed: data_error')
  })

  it('12: an hr person with no current role is left out of the current view with no_current_role', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    const group = await roster(store, org, [P('A1', '1111-01'), P('N1', null)])
    const people = await store.people(org.id)
    const none = people.find((p) => p.displayName === 'N1')
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.leftOut).toEqual([{ personId: none.id, groupId: group.id, reason: 'no_current_role', missingStep: null }])
    const target = await service.team('u1', { view: 'target', scenario: 'moderate' }, null)
    expect(target.leftOut.some((l) => l.reason === 'no_current_role')).toBe(false)
  })

  it('13: a pathway failure keeps the team answer: no pick, no search links, code-only log', async () => {
    const log = vi.fn()
    const { store, org, service, pathway } = await setup({ matchingOverride: fakeMatching(), log })
    pathway.pathway.mockImplementation(async () => { throw Object.assign(new Error(`down ${NAMES[0]}`), { code: 'pathway_data' }) })
    const group = await roster(store, org, [P('A1', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.plans[group.id].steps).toEqual([expect.objectContaining({ key: 'el:A', courses: [], search: [] })])
    expect(log).toHaveBeenCalledWith('[org] pathway failed: pathway_data')
    expect(JSON.stringify(log.mock.calls)).not.toContain(NAMES[0])
  })
})

describe('final review fix 1: ties among available codes', () => {
  it('one person on each of two available roles -> the lowest code', async () => {
    const { store, org, service } = await setup({ matchingOverride: fakeMatching() })
    const group = await roster(store, org, [P('B1', '2222-01'), P('A1', '1111-01')])
    const answer = await service.team('u1', { view: 'current', scenario: 'moderate' }, null)
    expect(answer.plans[group.id]).toMatchObject({ roleCode: '1111-01', counted: 1 })
  })
})
