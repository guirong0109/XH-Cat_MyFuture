// Owner screens of the organisation view: pure render functions on a fixed team answer, the api helpers, the actions.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t as translate } from '../../shared/i18n.js'
import en from '../../shared/strings/en.js'
import ms from '../../shared/strings/ms.js'
import zh from '../../shared/strings/zh.js'
import orgScreen from '../../public/js/screens/org.js'
import accessScreen from '../../public/js/screens/access.js'
import { heatView, outlookView, peopleView, planView, setupView } from '../../public/js/screens/orgParts.js'
import { createOrgActions, orgEntry } from '../../public/js/orgActions.js'
import * as orgApi from '../../public/js/orgApi.js'

const t = (key, vars) => translate('en', key, vars)

const KN = 'kn:2.C.4.a'
const EL = 'el:2.A.1.a'
const slice = (code, percent, extra = {}) => ({ code, available: true, reason: null, missingStep: null, percent, provisional: false, ...extra })

function makeTeam(extra = {}) {
  return {
    org: { id: 'o1', name: 'Sample Logistics', type: 'hr' },
    view: 'current',
    scenario: 'moderate',
    groups: [
      { id: 'g1', name: 'Finance', targetCode: '2524-02', size: 2 },
      { id: 'g2', name: 'Operations', targetCode: null, size: 1 },
    ],
    people: [
      { id: 'p1', groupId: 'g1', displayName: 'Aisyah R.', source: 'shared', addedAt: '2026-10-31T01:00:00.000Z', current: slice('2411-01', 71, { provisional: true }), target: slice('2524-02', 48) },
      { id: 'p2', groupId: 'g1', displayName: 'Staff 02', source: 'roster', addedAt: '2026-10-31T01:00:00.000Z', current: slice('2411-01', 64), target: slice('2524-02', 41) },
      { id: 'p3', groupId: 'g2', displayName: 'Staff 03', source: 'roster', addedAt: '2026-10-31T01:00:00.000Z', current: { code: '2182-03', available: false, reason: 'chain_broken', missingStep: 'MASCO to ISCO-08: no same 4-digit code', percent: null, provisional: false }, target: null },
    ],
    heatmap: {
      columns: [
        { key: KN, name: 'Economics and Accounting', peopleShort: 2, levelsShort: 2.8 },
        { key: EL, name: 'Critical Thinking', peopleShort: 0, levelsShort: 0 },
      ],
      cells: {
        g1: {
          [KN]: { needing: 2, met: 0, below: 1, missing: 1, notAssessed: 0, levelsShort: 2.8, averageGap: 1.4, provisional: false },
          [EL]: { needing: 2, met: 1, below: 0, missing: 0, notAssessed: 1, levelsShort: 0, averageGap: 0, provisional: true },
        },
        g2: {},
      },
    },
    leftOut: [{ personId: 'p3', groupId: 'g2', reason: 'chain_broken', missingStep: 'MASCO to ISCO-08: no same 4-digit code' }],
    plans: {
      g1: {
        roleCode: '2411-01',
        steps: [
          { key: KN, name: 'Economics and Accounting', neededMax: 5.8, peopleShort: 2, missing: 1, below: 1, levelsShort: 2.8, to: 'expert', stillShort: false, status: 'planned',
            courses: [{ name: 'Accounting basics', link: 'https://elatih.example/a', site: 'elatih', siteName: 'e-LATiH', checkedAt: '2026-10-30' }],
            search: [{ site: 'coursera', name: 'Coursera', url: 'https://coursera.example/s?q=accounting' }] },
          { key: 'kn:2.C.1.a', name: 'Mathematics', neededMax: 4.7, peopleShort: 1, missing: 0, below: 1, levelsShort: 0.9, to: 'good', stillShort: false, status: 'in_progress',
            courses: [], search: [{ site: 'khan', name: 'Khan Academy', url: 'https://khan.example/s?q=maths' }] },
        ],
      },
      g2: { roleCode: null, steps: [] },
    },
    bands: { g1: [1, 1, 0, 0], g2: [0, 0, 0, 0] },
    moved: [{ personId: 'p1', from: 4, to: 2 }, { personId: 'p2', from: 4, to: 2 }],
    sdg: {
      g1: { goals: [{ goal: 8, count: 1, links: [{ target: '8.2', via: { kind: 'role', code: '24' }, reason: { en: 'Data analysis raises productivity' }, approvedAt: null }] }], total: 1 },
      g2: { goals: [], total: 0 },
    },
    sources: [
      { id: 'onet', name: 'O*NET 31.0', url: 'https://www.onetcenter.org', date: '2026-05-01', licence: 'CC BY 4.0' },
      { id: 'site:elatih', name: 'e-LATiH', url: 'https://elatih.example', date: '2026-10-30' },
    ],
    ...extra,
  }
}

function makeOrg(extra = {}) {
  const team = extra.team === undefined ? makeTeam() : extra.team
  return {
    tab: 'heat',
    status: 'ready',
    data: { org: { id: 'o1', name: 'Sample Logistics', type: 'hr' }, groups: (team?.groups ?? []).map(({ id, name, targetCode }) => ({ id, name, targetCode })), people: [] },
    team,
    view: 'current',
    scenario: 'moderate',
    page: 0,
    sel: null,
    planGroup: 'g1',
    sdgGroup: 'g1',
    preview: null,
    link: null,
    roleSearch: null,
    message: null,
    ...extra,
  }
}

const centreOrg = (extra = {}) => {
  const team = makeTeam({ org: { id: 'o1', name: 'Sample College', type: 'centre' }, view: 'target' })
  return makeOrg({ team, view: 'target', data: { org: team.org, groups: team.groups, people: [] }, ...extra })
}

const state = (org) => ({ lang: 'en', org, account: { status: 'in', user: { email: 'a@b.c' } } })
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('heatmap view', () => {
  it('shows "N of M" and "avg X short" in a cell, and the legend in levels', () => {
    const html = heatView(t, makeOrg())
    const cell = html.match(/<td[^>]*data-arg="g1\|kn:2\.C\.4\.a"[^>]*>[\s\S]*?<\/td>/)[0]
    expect(text(cell)).toContain('2 of 2')
    expect(text(cell)).toContain('avg 1.4 short')
    expect(html).toContain('Under 1 level')
    expect(html).toContain('2 or more')
    expect(html).toContain('Not needed')
  })

  it('marks a cell with someone not assessed as provisional', () => {
    const cell = heatView(t, makeOrg()).match(/<td[^>]*data-arg="g1\|el:2\.A\.1\.a"[^>]*>[\s\S]*?<\/td>/)[0]
    expect(text(cell)).toContain('provisional')
  })

  it('says how many people were left out of the sums', () => {
    const html = text(heatView(t, makeOrg()))
    expect(html).toContain('1 left out of the sums')
  })

  it('shows the cell panel with the counts and a button to the plan', () => {
    const html = heatView(t, makeOrg({ sel: { groupId: 'g1', key: KN } }))
    expect(text(html)).toContain('Economics and Accounting')
    expect(text(html)).toContain('Missing 1')
    expect(text(html)).toContain('Below 1')
    expect(html).toContain('data-act="orgToPlan"')
  })

  it('uses only the target role for a career centre', () => {
    const html = heatView(t, centreOrg())
    expect(html).not.toContain('data-arg="current"')
    expect(html).toContain('data-arg="target"')
  })

  it('says "no target role" for a group without one in the target view', () => {
    const html = heatView(t, makeOrg({ view: 'target', team: makeTeam({ view: 'target' }) }))
    expect(text(html)).toContain('no target role')
  })

  it('with no people asks to add them', () => {
    const team = makeTeam({ groups: [], people: [], heatmap: { columns: [], cells: {} }, leftOut: [], plans: {}, bands: {}, moved: [], sdg: {} })
    expect(text(heatView(t, makeOrg({ team })))).toContain('Add people with a roster or a join link')
  })
})

describe('plan view', () => {
  it('writes the step line and "Time: see each course page"', () => {
    const html = text(planView(t, makeOrg({ tab: 'plan' })))
    expect(html).toContain('2 people short (1 missing, 1 below)')
    expect(html).toContain('Time: see each course page.')
    expect(html).toContain('Accounting basics')
    expect(html).toContain('e-LATiH')
  })

  it('a step with no courses says "No team pick yet" and still has its search links', () => {
    const html = planView(t, makeOrg({ tab: 'plan' }))
    expect(text(html)).toContain('No team pick yet')
    expect(html).toContain('href="https://khan.example/s?q=maths"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('offers the three statuses, with the saved one chosen', () => {
    const html = planView(t, makeOrg({ tab: 'plan' }))
    expect(html).toContain('data-org-status="kn:2.C.1.a"')
    expect(html).toMatch(/<option value="in_progress" selected>/)
  })

  it('without a role in Setup says so', () => {
    const html = text(planView(t, makeOrg({ tab: 'plan', planGroup: 'g2', view: 'target', team: makeTeam({ view: 'target' }) })))
    expect(html).toContain('Choose a target role for this group in Setup to see gaps.')
  })
})

describe('outlook view', () => {
  it('shows the band counts of the scenario the answer was made for', () => {
    const moderate = outlookView(t, makeOrg({ tab: 'outlook' }))
    expect(moderate).toMatch(/data-band="1"[^>]*><b>1<\/b>/)
    expect(moderate).toMatch(/data-band="2"[^>]*><b>1<\/b>/)
    const rapid = outlookView(t, makeOrg({ tab: 'outlook', scenario: 'rapid', team: makeTeam({ scenario: 'rapid', bands: { g1: [0, 2, 0, 0], g2: [0, 0, 0, 1] } }) }))
    expect(rapid).toMatch(/data-band="2"[^>]*><b>2<\/b>/)
    expect(rapid).toMatch(/data-band="4"[^>]*><b>1<\/b>/)
  })

  it('has the hiring sentence, the moved line and the SDG link with its review label', () => {
    const html = text(outlookView(t, makeOrg({ tab: 'outlook' })))
    expect(html).toContain('This helps plan training. It does not make hiring decisions.')
    expect(html).toContain('Finance: 2 people, band 4 → 2')
    expect(html).toContain('potential, not measured')
    expect(html).toContain('8.2')
    expect(html).toContain('not yet reviewed')
    expect(html).toContain('never a score')
  })
})

describe('people and setup views', () => {
  const people = (org) => peopleView(t, org)

  it('with no people asks to add them, and carries the synthetic-only banner', () => {
    const html = text(people(makeOrg({ tab: 'people', team: makeTeam({ people: [], leftOut: [] }) })))
    expect(html).toContain('Add people with a roster or a join link')
    expect(html).toContain('Use synthetic (made-up) people only')
  })

  it('lists people with their Skill Match and says why one is left out', () => {
    const html = text(people(makeOrg({ tab: 'people' })))
    expect(html).toContain('Aisyah R.')
    expect(html).toContain('71%')
    expect(html).toContain('not available')
    expect(html).toContain('stops at the step')
    expect(html).toContain('MASCO to ISCO-08: no same 4-digit code')
  })

  it('shows the roster preview with what was rejected and an import button', () => {
    const preview = { name: 'r.csv', previewId: 'x1', accepted: 5, rejected: [{ row: 14, reason: 'role code 9999-99 is not in eMASCO' }], unrecognised: [{ row: 22, skill: 'Excel wizardry' }], newGroups: ['Sales'], notes: [], people: [] }
    const html = text(people(makeOrg({ tab: 'people', preview })))
    expect(html).toContain('Row 14: role code 9999-99 is not in eMASCO')
    expect(html).toContain('Excel wizardry')
    expect(html).toContain('Import 5 rows')
    expect(html).toContain('nothing saved yet')
  })

  it('shows a new join link once, with its note', () => {
    const html = text(people(makeOrg({ tab: 'people', link: { url: 'http://127.0.0.2:3200/#join=abc', expiresAt: '2026-11-07T00:00:00.000Z' } })))
    expect(html).toContain('Copy this link now, it is shown once.')
    expect(html).toContain('#join=abc')
  })

  it('setup asks for the name and type before an organisation exists', () => {
    const html = setupView(t, { tab: 'setup', status: 'none', data: null, team: null })
    expect(html).toContain('id="ogName"')
    expect(html).toContain('data-form="orgCreate"')
    expect(text(html)).toContain('This helps plan training. It does not make hiring decisions.')
  })

  it('setup lists groups with their target role and an add form', () => {
    const raw = setupView(t, makeOrg({ tab: 'setup' }))
    const html = text(raw)
    expect(html).toContain('Finance')
    expect(html).toContain('2524-02')
    expect(html).toContain('None set')
    expect(raw).toContain('placeholder="Add a department"')
  })

  it('a career centre uses programme and student words', () => {
    const raw = setupView(t, centreOrg({ tab: 'setup' }))
    expect(text(raw)).toContain('Programmes and target roles')
    expect(raw).toContain('placeholder="Add a programme"')
  })
})

describe('every view', () => {
  const orgs = { hr: makeOrg(), centre: centreOrg() }
  const views = { setupView, peopleView, heatView, planView, outlookView }

  it('has a source line and never prints "undefined"', () => {
    for (const [type, org] of Object.entries(orgs)) {
      for (const [name, view] of Object.entries(views)) {
        const html = view(t, { ...org, sel: { groupId: 'g1', key: KN } })
        expect(html, `${type} ${name}`).toContain('og-src')
        expect(html, `${type} ${name}`).toMatch(/Source/)
        expect(html, `${type} ${name}`).not.toMatch(/undefined|NaN|\[object/)
      }
    }
  })

  it('stays safe on an empty or half-loaded state', () => {
    const bare = [{ tab: 'heat', status: 'ready', data: { org: { id: 'o', name: 'X', type: 'hr' }, groups: [], people: [] }, team: null }, { status: 'ready', data: null, team: {} }]
    for (const org of bare) {
      for (const [name, view] of Object.entries(views)) expect(view(t, org), name).not.toMatch(/undefined|NaN|\[object/)
    }
  })

  it('escapes names', () => {
    const team = makeTeam()
    team.people[0].displayName = '<img src=x onerror=alert(1)>'
    const html = peopleView(t, makeOrg({ team }))
    expect(html).not.toContain('<img src=x')
  })

  it('the screen draws the tabs, the one chosen by state.org.tab, and loading/none/error states', () => {
    for (const tab of ['setup', 'people', 'heat', 'plan', 'outlook']) {
      const html = orgScreen({ t, state: state(makeOrg({ tab })) })
      expect(html).toContain(`data-act="orgTab" data-arg="${tab}"`)
      expect(html).toContain(`id="og-${tab}"`)
    }
    expect(text(orgScreen({ t, state: state({ status: 'loading' }) }))).toContain('Loading your organisation')
    expect(orgScreen({ t, state: state({ status: 'none', tab: 'setup', data: null }) })).toContain('data-form="orgCreate"')
    expect(orgScreen({ t, state: state({ status: 'error', code: 'server_error' }) })).toContain('data-act="orgRetry"')
    expect(text(orgScreen({ t, state: state({ status: 'off' }) }))).toContain('Accounts are not available')
  })
})

describe('strings', () => {
  const files = ['public/js/screens/org.js', 'public/js/screens/orgParts.js', 'public/js/orgActions.js', 'public/js/screens/access.js']
  const used = new Set()
  const DOM_IDS = new Set(['ogName', 'ogNewGroup', 'ogFile', 'ogRoleQ', 'ogInviteGroup', 'ogPlanGroup', 'ogSdgGroup', 'ogLinkText'])
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(/\bt\(\s*['"`]((?:og)[A-Za-z0-9_]*)['"`]/g)) used.add(m[1])
    for (const m of source.matchAll(/['"`](og[A-Za-z0-9_]+)['"`]/g)) used.add(m[1])
  }
  for (const id of DOM_IDS) used.delete(id)
  // keys built from a word (type, status, band, reason, error code)
  const built = []
  for (const type of ['hr', 'centre']) for (const w of ['dept', 'depts', 'people', 'staff', 'plan', 'person', 'addgroup', 'type']) built.push(`og_${w}_${type}`)
  for (const s of ['planned', 'in_progress', 'done']) built.push(`ogStatus_${s}`)
  for (const n of [1, 2, 3, 4]) built.push(`ogBand${n}`)
  for (const r of ['chain_broken', 'unknown_role', 'no_known_skill']) built.push(`ogReason_${r}`)
  for (const c of ['other', 'network', 'not_signed_in', 'exists', 'group_exists', 'group_has_people', 'unknown_role', 'preview_expired', 'too_large', 'bad_header', 'not_utf8', 'not_csv', 'bad_request']) built.push(`ogErr_${c}`)
  for (const tab of ['setup', 'heat', 'outlook']) built.push(`ogTab_${tab}`)

  it('every key the organisation screens use exists in en, ms and zh', () => {
    expect(used.size).toBeGreaterThan(40)
    for (const key of [...used, ...built]) {
      for (const [name, table] of [['en', en], ['ms', ms], ['zh', zh]]) expect(table[key], `${name}.${key}`).toBeTruthy()
    }
  })

  it('the access note exists', () => {
    expect(t('ogNeedAccount')).toBe('An account is needed for organisation tools')
  })
})

describe('entering the organisation tools', () => {
  it('signed out, category C or D goes to the access screen with the note', () => {
    expect(orgEntry({ account: { status: 'none' } })).toEqual({ screen: 'access', note: 'ogNeedAccount' })
    expect(orgEntry({ account: undefined })).toEqual({ screen: 'access', note: 'ogNeedAccount' })
  })

  it('signed in goes to the organisation screen', () => {
    expect(orgEntry({ account: { status: 'in' } })).toEqual({ screen: 'org', note: null })
  })

  it('the access screen shows the note', () => {
    const html = accessScreen({ t, state: { account: { status: 'none' }, accessNote: 'ogNeedAccount' } })
    expect(text(html)).toContain('An account is needed for organisation tools')
    expect(text(accessScreen({ t, state: { account: { status: 'none' } } }))).not.toContain('organisation tools')
  })
})

describe('orgApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls the owner routes with the right method, path and body', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push([init.method, url, init.body, init.headers?.['Content-Type']])
      return { ok: true, json: async () => ({ ok: 1 }), text: async () => 'a,b' }
    }))
    await orgApi.getOrg()
    await orgApi.createOrg('Acme', 'hr')
    await orgApi.team('target', 'rapid')
    await orgApi.previewRoster('name,group\n')
    await orgApi.importRoster('p1')
    await orgApi.invite('g1', '2411-01')
    await orgApi.setPlanStep({ groupId: 'g1', roleCode: '2411-01', itemKey: 'kn:1', status: 'done' })
    await orgApi.updateGroup('g1', { targetCode: null })
    expect(calls).toEqual([
      ['GET', '/api/org', undefined, undefined],
      ['POST', '/api/org', JSON.stringify({ name: 'Acme', type: 'hr' }), 'application/json'],
      ['GET', '/api/org/team?view=target&scenario=rapid', undefined, undefined],
      ['POST', '/api/org/roster/preview', 'name,group\n', 'text/csv'],
      ['POST', '/api/org/roster/import', JSON.stringify({ previewId: 'p1' }), 'application/json'],
      ['POST', '/api/org/invites', JSON.stringify({ groupId: 'g1', currentCode: '2411-01' }), 'application/json'],
      ['PUT', '/api/org/plan-steps', JSON.stringify({ groupId: 'g1', roleCode: '2411-01', itemKey: 'kn:1', status: 'done' }), 'application/json'],
      ['PATCH', '/api/org/groups/g1', JSON.stringify({ targetCode: null }), 'application/json'],
    ])
  })

  it('gives the error code of the server and never throws on a lost connection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: { code: 'no_organisation', message: 'x', retryable: false } }) })))
    expect(await orgApi.getOrg()).toEqual({ ok: false, code: 'no_organisation', retryable: false })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await orgApi.previewRoster('x')).toEqual({ ok: false, code: 'network', retryable: true })
  })
})

describe('actions', () => {
  function setup(apiOver = {}, org = makeOrg()) {
    const st = { screen: 'org', lang: 'en', account: { status: 'in', user: {} }, org }
    const render = vi.fn()
    const api = {
      getOrg: vi.fn(async () => ({ ok: true, data: { org: org.data.org, groups: org.data.groups, people: [] } })),
      team: vi.fn(async (view, scenario) => ({ ok: true, data: makeTeam({ view, scenario }) })),
      setPlanStep: vi.fn(async (body) => ({ ok: true, data: body })),
      ...apiOver,
    }
    return { st, render, api, ...createOrgActions({ state: st, render, api, t, go: vi.fn() }) }
  }

  it('a scenario switch asks the server again and keeps the tab', async () => {
    const s = setup()
    s.st.org.tab = 'outlook'
    await s.actions.orgScenario('rapid')
    expect(s.api.team).toHaveBeenCalledWith('current', 'rapid')
    expect(s.st.org.scenario).toBe('rapid')
    expect(s.st.org.tab).toBe('outlook')
    expect(s.render).toHaveBeenCalled()
  })

  it('a status change is saved for the group, role and item', async () => {
    const s = setup()
    const handled = await s.onChange({ dataset: { orgStatus: KN }, value: 'done', id: '' })
    expect(handled).toBe(true)
    expect(s.api.setPlanStep).toHaveBeenCalledWith({ groupId: 'g1', roleCode: '2411-01', itemKey: KN, status: 'done' })
    expect(s.st.org.team.plans.g1.steps[0].status).toBe('done')
  })

  it('onChange ignores controls that are not its own', () => {
    const s = setup()
    expect(s.onChange({ dataset: { field: 'x' }, id: 'something' })).toBe(false)
  })

  it('a cell click selects it and the plan button opens the plan of that group', () => {
    const s = setup()
    s.actions.orgCell(`g1|${KN}`)
    expect(s.st.org.sel).toEqual({ groupId: 'g1', key: KN })
    s.actions.orgToPlan('g1')
    expect(s.st.org.tab).toBe('plan')
    expect(s.st.org.planGroup).toBe('g1')
  })

  it('without an account, the screen goes to access with the note', async () => {
    const go = vi.fn()
    const st = { screen: 'org', lang: 'en', account: { status: 'none' } }
    const a = createOrgActions({ state: st, render: vi.fn(), api: {}, t, go })
    await a.actions.orgEnsure()
    expect(st.accessNote).toBe('ogNeedAccount')
    expect(go).toHaveBeenCalledWith('access')
  })

  it('with no organisation yet, loading ends in the setup state', async () => {
    const st = { screen: 'org', lang: 'en', account: { status: 'in', user: {} } }
    const api = { getOrg: vi.fn(async () => ({ ok: false, code: 'no_organisation', retryable: false })) }
    const a = createOrgActions({ state: st, render: vi.fn(), api, t, go: vi.fn() })
    await a.actions.orgEnsure()
    expect(st.org.status).toBe('none')
    expect(st.org.tab).toBe('setup')
  })
})
