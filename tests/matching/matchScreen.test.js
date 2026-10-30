// Career matching and SDG contribution screens (Task 14, spec §8, mockup docs/mockup-matching.html).
// Render functions are tested on real answers from the matching API (real server on port 0, fixture data dir with a
// built bridge, bundled Radar manifest, owner-approved SDG links in a memory store).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { recordReview } from '../../server/radar/reviews.js'
import { linkHash } from '../../server/matching/adminRoutes.js'
import { createMatchingServiceFromEnv } from '../../server/matching/service.js'
import * as matchApi from '../../public/js/matchApi.js'
import { matchView, roleCard, matchToSave } from '../../public/js/screens/match.js'
import { sdgView } from '../../public/js/screens/sdgTab.js'
import { fitChart } from '../../public/js/components/fitChart.js'
import en from '../../shared/strings/en.js'
import ms from '../../shared/strings/ms.js'
import zh from '../../shared/strings/zh.js'
import { t as translate } from '../../shared/i18n.js'
import { FIXTURE, SDG_LINKS, fixtureReferences, makeMatchingFixture } from '../helpers/matchingFixture.js'

const t = (key, vars) => translate('en', key, vars)
const root = join(import.meta.dirname, '..', '..')
const NEW_FILES = ['public/js/matchApi.js', 'public/js/screens/match.js', 'public/js/screens/sdgTab.js', 'public/js/components/fitChart.js']
const FORBIDDEN = /score|weight|rank|opportunit/i
const now = () => new Date('2026-10-31T00:00:00.000Z')

const skill = (name, canonicalId, proficiency = null) => ({
  name, originalText: name, canonicalId, category: null, source: 'user_input', userConfirmed: true,
  proficiency, proficiencyStatus: proficiency ? 'self_reported' : 'not_assessed', extraction: null,
})
// Meets 5 of 7 levels for 15-1243.00 (71%); field 0613 puts 2521-03 "in your field".
const FULL = {
  profileStatus: 'confirmed',
  education: { records: [{ qualification: 'Diploma', field: { source: 'isced', code: '0613', title: 'Software and applications development and analysis' } }] },
  employment: { records: [] },
  occupationMappings: [],
  skills: [skill('Reading Comprehension', 'onet:el:2.A.1.a', 'good'), skill('Computers and Electronics', 'onet:kn:2.C.3.a', 'basic'), skill('MySQL', 'onet:tech:mysql')],
}
const THIN = { ...FULL, skills: [skill('MySQL', 'onet:tech:mysql')] }

let fixture
let server
let base
let list
let thin
const details = {}
beforeAll(async () => {
  fixture = await makeMatchingFixture()
  const references = await loadRadarReferences('data')
  const store = createMemoryStore()
  for (const [i, link] of SDG_LINKS.entries()) {
    await recordReview(store, {
      reviewId: `review-20261031T000000000Z-0000000${i}`, kind: 'sdg_link', target: link.id, decision: 'approved', note: '', evidence: [],
      reviewer: 'Owner', reviewedAt: '2026-10-31T00:00:00.000Z', version: 1, appliesTo: { sourceId: 'sdg-links', period: null, observationHash: linkHash(link) },
    })
  }
  const radar = createRadarService({ store, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor: null, now, log: () => {} })
  const matching = createMatchingServiceFromEnv({ dataDir: fixture.dir, radar, demo: null, access: null, references: fixtureReferences, now, log: () => {} })
  server = createApp({ radar, radarDemo: null, matching, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  const out = await matchApi.list(FULL, { base })
  expect(out.ok).toBe(true)
  list = out.data
  thin = (await matchApi.list(THIN, { base })).data
  for (const code of [FIXTURE.fullRole, FIXTURE.brokenRole, FIXTURE.noIscoRole]) {
    const r = await matchApi.role(FULL, code, { base })
    expect(r.ok).toBe(true)
    details[code] = r.data
  }
})
afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await fixture?.cleanup()
})

const match = (extra = {}) => ({ scenario: 'moderate', prevScenario: null, sdgFilter: '', data: list, details: {}, chosen: null, explore: true, ...extra })
const view = (m = {}, profile = FULL) => matchView({ t, state: { lang: 'en', profile, match: match(m) } })
const roleOf = (data, code) => data.roles.find((r) => r.code === code)
const card = (code, extra = {}) => roleCard({ t, lang: 'en', role: roleOf(list, code), detail: null, scenario: 'moderate', chosen: null, usable: true, ...extra })
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const text = (html) => unesc(html.replace(/<[^>]+>/g, ''))
// The Skill Match percents of every card, in page order.
const percents = (html) => [...html.matchAll(/class="mt-pct">(\d+)%</g)].map((m) => m[1])

describe('matchApi', () => {
  it('list and role answer {ok, data}; an unknown code gives {ok:false, code}', async () => {
    expect(roleOf(list, FIXTURE.fullRole).skillMatch).toMatchObject({ percent: 71 })
    expect(details[FIXTURE.fullRole].fit.percent).toBe(71)
    expect(await matchApi.role(FULL, '0000-00', { base })).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('Career matching screen', () => {
  it('card shows the one-sentence reason', () => {
    const html = card(FIXTURE.fullRole)
    expect(text(html)).toContain('You meet 5.0 of 7.0 needed levels for Database Architects, so fit is 71%.')
    expect(html).toContain('class="mt-pct">71%<')
    expect(text(html)).toContain('Fixture Database Designer')
    expect(html).toContain('href="https://emasco.mohr.gov.my/masco/2521-03"')
    // with the detail: the outlook parts, the Why this match block and the chain path with its label
    const full = card(FIXTURE.fullRole, { detail: details[FIXTURE.fullRole] })
    expect(text(full)).toContain(t('mtWhy'))
    expect(text(full)).toContain('code match, not an official table')
    expect(text(full)).toContain('Critical Thinking')
    expect(text(full)).toContain(t('mtLeftOut'))
    expect(text(full)).toContain('Database Administrators 40%')
    expect(text(full)).toContain(t('mtSwShown'))
    expect(full).toContain('MySQL')
  })

  it('chart orders by importance and shows 8 then all', () => {
    const rows = details[FIXTURE.fullRole].fit.rows
    const two = fitChart({ rows, t })
    // equal importance (4): by name
    expect(two.indexOf('Computers and Electronics')).toBeLessThan(two.indexOf('Reading Comprehension'))
    expect(two).toContain('basic = 2, good = 4, expert = 6')
    expect(two).toContain(t('mtYou'))
    expect(two).toContain(t('mtNeeded'))
    const many = Array.from({ length: 11 }, (_, i) => ({ key: `el:${i}`, name: `Item ${String.fromCharCode(65 + i)}`, kind: 'el', importance: 3 + (i % 3) * 0.5, needed: 3, you: 2, status: 'below' }))
    const eight = fitChart({ rows: many, t })
    const all = fitChart({ rows: many, t, all: true })
    const names = (svg) => [...svg.matchAll(/>(Item [A-K])</g)].map((m) => m[1])
    expect(names(eight)).toHaveLength(8)
    expect(names(all)).toHaveLength(11)
    // importance 4.0 first (C, F, I), then 3.5 (B, E, H, K), then 3.0
    expect(names(all)).toEqual(['Item C', 'Item F', 'Item I', 'Item B', 'Item E', 'Item H', 'Item K', 'Item A', 'Item D', 'Item G', 'Item J'])
    expect(names(eight)).toEqual(names(all).slice(0, 8))
    // the card offers "Show all" only when there are more than 8 items
    const detail = { ...details[FIXTURE.fullRole], fit: { ...details[FIXTURE.fullRole].fit, rows: many } }
    expect(card(FIXTURE.fullRole, { detail })).toContain('data-act="mAllBars"')
    expect(card(FIXTURE.fullRole, { detail: details[FIXTURE.fullRole] })).not.toContain('data-act="mAllBars"')
  })

  it('switching scenario keeps every percent and lists moved roles', () => {
    const moderate = view({ scenario: 'moderate' })
    const rapid = view({ scenario: 'rapid', prevScenario: 'moderate' })
    expect(percents(moderate).sort()).toEqual(percents(rapid).sort())
    expect(percents(rapid)).toContain('71')
    expect(moderate).not.toContain('class="banner mt-banner"')
    const banner = text(rapid.slice(rapid.indexOf('mt-banner'), rapid.indexOf('data-act="mBannerClose"')))
    expect(banner).toContain('Fixture Software Developer (group 4 → 2)')
    expect(banner).not.toContain('Fixture Database Designer')
    expect(banner).toContain(t('mtBannerSame'))
    // the scenario switch with its two lines
    expect(text(moderate)).toContain(t('mtScnModerateSub'))
    expect(text(moderate)).toContain(t('mtScnRapidSub'))
    // four bands, with the empty-band text where a band has no role
    for (const b of [1, 2, 3, 4]) expect(text(rapid)).toContain(t(`mtBand${b}`))
    expect(text(rapid)).toContain(t('mtBandEmpty'))
  })

  it('unavailable role shows the missing step', () => {
    const html = text(card(FIXTURE.brokenRole))
    expect(html).toContain(t('mtNotAvailable'))
    expect(html).toContain('ISCO-08 2512 has no row in the BLS ISCO-08 to SOC 2010 crosswalk')
    // Rapid with no ISCO-08 code: not available, with the missing step
    const noIsco = text(card(FIXTURE.noIscoRole, { detail: details[FIXTURE.noIscoRole], scenario: 'rapid' }))
    expect(noIsco).toContain(t('mtAiNoIsco'))
    expect(noIsco).toContain('MASCO unit 9999 has no matching ISCO-08 code')
    // every role unavailable (today's real data): the "chain not ready" note, and the screen stays usable
    const today = { ...list, roles: list.roles.map((r) => ({ ...r, skillMatch: null, unavailable: { missingStep: { id: 'masco2020_unit_to_isco08', from: { system: 'MASCO 2020', codes: [r.code.slice(0, 4)] }, reason: 'waits for the ISCO-08 code list in the BLS ISCO file' } } })) }
    const page = text(view({ data: today }))
    expect(page).toContain(t('mtChainTitle'))
    expect(page).toContain('waits for the ISCO-08 code list in the BLS ISCO file')
    expect(page).toContain('Fixture Database Designer')
    expect(page).toContain(t('mtChoose'))
  })

  it('thin profile: no percent and the Add skills card; provisional note when a level is not assessed', () => {
    const html = view({ data: thin }, THIN)
    expect(percents(html)).toEqual([])
    expect(text(html)).toContain(t('mtThinTitle'))
    expect(text(html)).toContain('MySQL')
    const prov = { ...FULL, skills: [...FULL.skills, skill('Critical Thinking', 'onet:el:2.A.2.a')] }
    const provData = { ...list, profile: { ...list.profile, provisional: true }, roles: list.roles.map((r) => (r.skillMatch ? { ...r, skillMatch: { ...r.skillMatch, provisional: true } } : r)) }
    expect(text(view({ data: provData }, prov))).toContain(t('mtProvTitle'))
    // no provisional note while no role has a Skill Match
    const none = { ...provData, roles: provData.roles.map((r) => ({ ...r, skillMatch: null })) }
    expect(text(view({ data: none }, prov))).not.toContain(t('mtProvTitle'))
  })

  it('SDG filter hides roles without that goal', () => {
    const all = text(view())
    expect(all).toContain('Fixture Unknown Unit Role')
    const nine = view({ sdgFilter: '9' })
    expect(text(nine)).toContain('Fixture Database Designer')
    expect(text(nine)).toContain('Fixture Software Developer')
    expect(text(nine)).not.toContain('Fixture Unknown Unit Role')
    expect(nine).toContain('<option value="9" selected>SDG 9 Industry, innovation and infrastructure</option>')
    expect(nine).toContain('<option value="8">SDG 8 Decent work</option>')
    // the filter never changes a percent
    expect(percents(nine)).toEqual(percents(view()))
    // a role with no approved link says so
    expect(text(card(FIXTURE.noIscoRole))).toContain(t('mtSdgNone'))
  })

  it('chosen role is marked and saved with scenario only (no data, no details)', () => {
    const html = card(FIXTURE.fullRole, { chosen: FIXTURE.fullRole })
    expect(html).toContain('mt-chosen')
    expect(text(html)).toContain(t('mtChosen'))
    expect(matchToSave(match({ chosen: FIXTURE.fullRole, scenario: 'rapid', details: { a: 1 } }))).toEqual({ scenario: 'rapid', chosen: FIXTURE.fullRole })
  })

  it('sources table and source line show where each part comes from', () => {
    const html = text(view())
    expect(html).toContain(t('mtSourcesTitle'))
    expect(html).toContain('O*NET Database 31.0')
    expect(html).toContain('2026-10-23')
    expect(html).toContain('DOSM')
    expect(html).toContain(t('mtNeverStored'))
  })

  it('every interpolated value is escaped', () => {
    const bad = '<b>Bold</b>'
    const role = { ...roleOf(list, FIXTURE.fullRole), title: bad, url: 'javascript:alert(1)', skillMatch: { ...roleOf(list, FIXTURE.fullRole).skillMatch, onetTitle: bad } }
    const d = details[FIXTURE.fullRole]
    const detail = { ...d, title: bad, fit: { ...d.fit, onetTitle: bad, rows: d.fit.rows.map((r) => ({ ...r, name: bad })), raise: d.fit.raise.map((r) => ({ ...r, name: bad })) }, software: [{ name: bad, inDemand: true, have: false }] }
    const html = roleCard({ t, lang: 'en', role, detail, scenario: 'moderate', chosen: null, usable: true })
    expect(html).not.toContain('<b>Bold')
    expect(html).toContain('&lt;b&gt;Bold')
    expect(html).not.toContain('javascript:')
    expect(fitChart({ rows: detail.fit.rows, t })).not.toContain('<b>Bold')
    const page = matchView({ t, state: { lang: 'en', profile: FULL, match: match({ data: { ...list, roles: [role] }, chosen: role.code }) } })
    expect(page).not.toContain('<b>Bold')
    const sdg = sdgView({ t, state: { lang: 'en', profile: FULL, match: match({ data: { ...list, roles: [role] }, chosen: role.code, details: { [role.code]: detail } }) } })
    expect(sdg).not.toContain('<b>Bold')
  })
})

describe('SDG contribution screen', () => {
  it('sdg tab shows counts and "potential, not measured"', () => {
    const html = sdgView({ t, state: { lang: 'en', profile: FULL, match: match({ chosen: FIXTURE.fullRole, details: { [FIXTURE.fullRole]: details[FIXTURE.fullRole] } }) } })
    const s = text(html)
    expect(s).toContain('potential, not measured')
    expect(s).toContain('Fixture Database Designer')
    // goals 4 (a skill to build: Computers and Electronics), 8 and 9 (the role's group 25), one link each
    expect(s).toContain('SDG 4 (1 link)')
    expect(s).toContain('SDG 8 (1 link)')
    expect(s).toContain('SDG 9 (1 link)')
    expect(s).toContain('Digital skills for work.')
    expect(s).toContain('Computers and Electronics')
    expect(s).toContain('2026-10-31')
    // the item link (a skill to build) shows its own approval date
    const item = html.slice(html.indexOf('Computers and Electronics'))
    expect(text(item.slice(0, item.indexOf('</div></div>')))).toContain('team draft, approved by owner on 2026-10-31')
    // the official UN goal title under each goal
    expect(s).toContain('Quality education')
    expect(s).toContain('Industry, innovation and infrastructure')
  })

  it('no chosen role: a card that leads to Career matching', () => {
    const html = sdgView({ t, state: { lang: 'en', profile: FULL, match: match() } })
    expect(text(html)).toContain(t('mtSdgNoRole'))
    expect(html).toContain('data-go="match"')
  })

  it('a path with no approved link says SDG not tagged yet', () => {
    const html = sdgView({ t, state: { lang: 'en', profile: FULL, match: match({ chosen: FIXTURE.noIscoRole, details: { [FIXTURE.noIscoRole]: details[FIXTURE.noIscoRole] } }) } })
    expect(text(html)).toContain(t('mtSdgNone'))
    expect(text(html)).toContain('potential, not measured')
  })
})

describe('Career matching strings and code', () => {
  const DYNAMIC = [1, 2, 3, 4].flatMap((b) => [`mtBand${b}`, `mtBand${b}Why`])
    .concat(['el', 'kn'].map((k) => `mtKind_${k}`), ['basic', 'good', 'expert'].map((w) => `mtLevel_${w}`))

  it('every text key exists in en, ms and zh', () => {
    const used = new Set(DYNAMIC)
    for (const file of NEW_FILES) {
      const src = readFileSync(join(root, file), 'utf8')
      for (const m of src.matchAll(/['"`](mt[A-Z][A-Za-z0-9_]*)['"`]/g)) used.add(m[1])
    }
    expect(used.size).toBeGreaterThan(40)
    const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',')
    for (const key of used) {
      for (const [name, table] of Object.entries({ en, ms, zh })) expect(String(table[key] ?? '').trim(), `${name}.${key}`).not.toBe('')
      expect(placeholders(ms[key]), `ms.${key}`).toBe(placeholders(en[key]))
      expect(placeholders(zh[key]), `zh.${key}`).toBe(placeholders(en[key]))
    }
    expect(en.mtPotential).toBe('potential, not measured')
  })

  it('no key or text matching score, weight, rank or opportunity in the new code and mt strings', () => {
    for (const file of NEW_FILES) expect(readFileSync(join(root, file), 'utf8'), file).not.toMatch(FORBIDDEN)
    for (const table of [en, ms, zh]) {
      for (const [key, value] of Object.entries(table).filter(([k]) => k.startsWith('mt'))) {
        expect(key).not.toMatch(FORBIDDEN)
        expect(String(value), key).not.toMatch(FORBIDDEN)
      }
    }
  })
})
