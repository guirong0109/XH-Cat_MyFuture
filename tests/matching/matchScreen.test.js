// Career matching and SDG contribution screens (Task 14, spec §8, mockup docs/mockup-matching.html).
// Render functions are tested on real answers from the matching API (real server on port 0, fixture data dir with a
// built bridge, bundled Radar manifest, SDG links approved by the owner in a memory store (all drafts show anyway, M16).
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
import { bandsAt, matchView, roleCard, matchToSave, softwareChips, stepText, trendMoves } from '../../public/js/screens/match.js'
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
    const full = card(FIXTURE.fullRole, { detail: details[FIXTURE.fullRole], open: true })
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
    expect(card(FIXTURE.fullRole, { detail, open: true })).toContain('data-act="mAllBars"')
    expect(card(FIXTURE.fullRole, { detail: details[FIXTURE.fullRole], open: true })).not.toContain('data-act="mAllBars"')
  })

  it('switching scenario keeps every percent and lists moved roles', () => {
    const moderate = view({ scenario: 'moderate' })
    const rapid = view({ scenario: 'rapid', prevScenario: 'moderate' })
    expect(percents(moderate).sort()).toEqual(percents(rapid).sort())
    expect(percents(rapid)).toContain('71')
    expect(moderate).not.toContain('class="banner mt-banner"')
    const banner = text(rapid.slice(rapid.indexOf('mt-banner'), rapid.indexOf('data-act="mBannerClose"'))).replace(/\s+/g, ' ')
    expect(banner).toContain('Switching to Rapid AI moved 1 role from “Not enough evidence yet” (group 4) to “AI may change much of this job (this scenario)” (group 2).')
    expect(banner).not.toContain('Fixture Software Developer')
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
    const noIsco = text(card(FIXTURE.noIscoRole, { detail: details[FIXTURE.noIscoRole], scenario: 'rapid', open: true }))
    expect(noIsco).toContain(t('mtAiNoIsco'))
    expect(noIsco).toContain(`MASCO 2020 9999: ${t('mtStep_no_row', { codes: '9999', step: t('mtStepName_masco2020_unit_to_isco08') })}`)
    // every role unavailable (today's real data): the "chain not ready" note, and the screen stays usable
    const today = { ...list, roles: list.roles.map((r) => ({ ...r, skillMatch: null, unavailable: { missingStep: { id: 'masco2020_unit_to_isco08', kind: 'pending', from: { system: 'MASCO 2020', codes: [r.code.slice(0, 4)] }, reason: 'waits for the ISCO-08 code list in the BLS ISCO file' } } })) }
    const page = text(view({ data: today }))
    expect(page).toContain(t('mtChainTitle'))
    expect(page).toContain(t('mtStep_waitsBls', { step: 'MASCO 2020 → ISCO-08' }))
    // the data's own reason stays as an English detail in the chain path
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
    // a role with no SDG link says so
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
    // M16: the SDG links source states the rule shown now (team drafts shown, rejected hidden, approved dated)
    const links = list.sources.find((s) => s.id === 'sdg-links')
    expect(links.name).not.toMatch(/only after owner approval/)
    expect(links.name).toMatch(/shown now/)
    expect(html).not.toMatch(/only after owner approval/)
  })

  it('every interpolated value is escaped', () => {
    const bad = '<b>Bold</b>'
    const role = { ...roleOf(list, FIXTURE.fullRole), title: bad, url: 'javascript:alert(1)', skillMatch: { ...roleOf(list, FIXTURE.fullRole).skillMatch, onetTitle: bad } }
    const d = details[FIXTURE.fullRole]
    const detail = { ...d, title: bad, fit: { ...d.fit, onetTitle: bad, rows: d.fit.rows.map((r) => ({ ...r, name: bad })), raise: d.fit.raise.map((r) => ({ ...r, name: bad })) }, software: [{ name: bad, inDemand: true, have: false }] }
    const html = roleCard({ t, lang: 'en', role, detail, scenario: 'moderate', chosen: null, usable: true, open: true })
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

describe('Missing step in the user\'s language (final review 3)', () => {
  const STEPS = [
    { id: 'masco2020_unit_to_isco08', kind: 'pending', from: { system: 'MASCO 2020', codes: ['2512'] }, reason: 'waits for the ISCO-08 code list in the BLS ISCO file' },
    { id: 'masco2020_unit_to_isco08', kind: 'no_row', from: { system: 'MASCO 2020', codes: ['9999'] }, reason: 'MASCO unit 9999 has no matching ISCO-08 code' },
    { id: 'masco2020_unit_to_isco08', kind: 'invalid', from: { system: 'MASCO 2020', codes: [] }, reason: 'the code is not a MASCO 4-digit unit code' },
    { id: 'soc2010_to_isco08', kind: 'pending', from: { system: 'ISCO-08', codes: ['2512'] }, reason: 'isco_soc_crosswalk.csv is not in data/radar/source/.' },
    { id: 'soc2010_to_isco08', kind: 'no_row', from: { system: 'ISCO-08', codes: ['2519'] }, reason: 'ISCO-08 2519 has no row in the BLS ISCO-08 to SOC 2010 crosswalk' },
    { id: 'soc2018_to_soc2010', kind: 'pending', from: { system: 'SOC 2010', codes: ['15-1132'] }, reason: 'soc_2010_to_2018_crosswalk.csv is not in data/radar/source/.' },
    { id: 'onet_to_soc2018', kind: 'no_row', from: { system: 'SOC 2018', codes: ['15-1299'] }, reason: 'SOC 2018 15-1299 has no row in the O*NET-SOC to SOC 2018 crosswalk' },
    { id: 'no_onet_data', kind: 'no_onet_data', from: { system: 'O*NET-SOC 2019', codes: ['15-1299.00'] }, reason: 'the linked O*NET jobs have no skill data (e.g. "All Other" codes)' },
  ]
  const tables = { en, ms, zh }

  it('every missing step id and kind has its own text in en, ms and zh (no English data reason in BM or 中文)', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      for (const step of STEPS) {
        const out = stepText(tl, step)
        // a pending step built from the BLS files says it waits for them
        const key = step.kind === 'pending' && step.id !== 'onet_to_soc2018' ? 'mtStep_waitsBls' : `mtStep_${step.kind}`
        expect(out, `${lang} ${step.id} ${step.kind}`).toContain(tl(key, { step: tl(`mtStepName_${step.id}`), codes: step.from.codes.join(', ') }))
        if (step.from.codes.length) expect(out).toContain(`${step.from.system} ${step.from.codes.join(', ')}`)
        if (lang !== 'en') expect(out, `${lang} ${step.id}`).not.toContain(step.reason)
        expect(out).not.toMatch(/mtStep/)
      }
      for (const id of ['masco2020_unit_to_isco08', 'soc2010_to_isco08', 'soc2018_to_soc2010', 'onet_to_soc2018']) expect(tables[lang][`mtStepName_${id}`], `${lang} ${id}`).toBeTruthy()
    }
  })

  it('cards, the Rapid part and the chain note use the translated text; the data reason is only an English detail', () => {
    for (const lang of ['ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const broken = roleCard({ t: tl, lang, role: roleOf(list, FIXTURE.brokenRole), detail: null, scenario: 'moderate', chosen: null })
      const side = text(broken.slice(broken.indexOf('class="mt-side"')))
      const want = tl('mtStep_no_row', { codes: '2512', step: tl('mtStepName_soc2010_to_isco08') })
      expect(text(broken.slice(broken.indexOf('class="mt-side"'), broken.indexOf('<details')))).toContain(want)
      expect(text(broken.slice(broken.indexOf('class="mt-side"'), broken.indexOf('<details')))).not.toContain('has no row in the BLS')
      // the chain path keeps the data reason, marked as English
      expect(side).toContain(tl('mtStepDetail'))
      expect(broken).toContain('<span lang="en">ISCO-08 2512 has no row in the BLS ISCO-08 to SOC 2010 crosswalk</span>')
      const rapid = roleCard({ t: tl, lang, role: roleOf(list, FIXTURE.noIscoRole), detail: details[FIXTURE.noIscoRole], scenario: 'rapid', chosen: null, open: true })
      const ai = text(rapid.slice(rapid.indexOf('class="mt-outgrid"'), rapid.indexOf('<details', rapid.indexOf('class="mt-outgrid"'))))
      expect(ai).toContain(tl('mtStep_no_row', { codes: '9999', step: tl('mtStepName_masco2020_unit_to_isco08') }))
      expect(ai).not.toContain('has no matching ISCO-08 code')
      const today = { ...list, roles: list.roles.map((r) => ({ ...r, skillMatch: null, unavailable: { missingStep: STEPS[0] } })) }
      const page = matchView({ t: tl, state: { lang, profile: FULL, match: match({ data: today }) } })
      const note = text(page.slice(page.indexOf('class="mt-steps"'), page.indexOf('</ul>', page.indexOf('class="mt-steps"'))))
      expect(note).toContain(tl('mtStep_waitsBls', { step: 'MASCO 2020 → ISCO-08' }))
      expect(note).not.toContain('waits for')
    }
  })
})

describe('Trend data changed banner (final review 1)', () => {
  it('trendMoves lists the roles that moved band in the scenario shown before', () => {
    const before = { scenario: 'moderate', bands: bandsAt(list, 'moderate') }
    expect(before.bands.length).toBe(list.roles.length)
    const role = list.roles[0]
    const from = before.bands[0].band
    const to = from === 3 ? 1 : 3
    const after = { ...list, roles: list.roles.map((r, i) => (i === 0 ? { ...r, bands: { ...r.bands, moderate: to } } : r)) }
    expect(trendMoves(before, after)).toEqual({ scenario: 'moderate', moved: [{ code: role.code, from, to }] })
    expect(trendMoves(before, list)).toEqual({ scenario: 'moderate', moved: [] })
    expect(trendMoves(null, list)).toBeNull()
  })

  it('the banner names what moved, says the Skill Match did not change, and closes; in all three languages', () => {
    const role = roleOf(list, FIXTURE.fullRole)
    const trend = { scenario: 'moderate', moved: [{ code: role.code, from: 4, to: 3 }] }
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const html = matchView({ t: tl, state: { lang, profile: FULL, match: match({ trend }) } })
      const banner = html.slice(html.indexOf('data-banner="trend"'), html.indexOf('</div>', html.indexOf('data-banner="trend"') + 200) + 6)
      const moves = tl('mtMoveOne', { from: tl('mtBand4'), fromNum: 4, to: tl('mtBand3'), toNum: 3 })
      expect(text(banner)).toContain(tl('mtTrendMoved', { scenario: tl('mtScnModerate'), moves }))
      expect(text(banner)).not.toContain(role.title)
      expect(text(banner)).toContain(tl('mtBannerSame'))
      expect(html).toContain('data-act="mBannerClose"')
    }
    // nothing moved: still says the data changed ("none"); another scenario shown now, or no trend: no banner
    expect(text(view({ trend: { scenario: 'moderate', moved: [] } })).replace(/\s+/g, ' ')).toContain(t('mtTrendNoMove', { scenario: t('mtScnModerate') }))
    expect(view({ trend: { scenario: 'rapid', moved: [] } })).not.toContain('data-banner="trend"')
    expect(view()).not.toContain('data-banner="trend"')
    // escaped
    const bad = { ...list, roles: list.roles.map((r) => (r.code === role.code ? { ...r, title: '<b>Bold</b>' } : r)) }
    expect(view({ data: bad, trend })).not.toContain('<b>Bold')
  })

  it('app: every trend change, judge sign-in / sign-out and SDG decision marks matching stale; the list keeps the bands from before', () => {
    const app = readFileSync(join(root, 'public/js/app.js'), 'utf8')
    const body = (name) => {
      const start = app.indexOf(`  ${name}: async`)
      expect(start, name).toBeGreaterThan(0)
      return app.slice(start, app.indexOf('\n  },', start))
    }
    const fn = (name) => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}', app.indexOf(`function ${name}(`)))
    // wherever the Radar goes stale, matching does too
    expect(fn('radarStale')).toContain('matchStale()')
    for (const name of ['demoApply', 'demoReset']) {
      const b = body(name)
      expect(b, name).toContain('matchStale()')
      expect(b.indexOf('matchStale()'), name).toBeGreaterThan(b.indexOf('if (!out.ok)'))
    }
    expect(body('admSdg')).toContain('matchStale(false)')
    expect(body('admSdg').indexOf('matchStale(false)')).toBeGreaterThan(body('admSdg').indexOf('if (!out.ok)'))
    expect(body('admSignIn')).toMatch(/if \(role === 'demo'\) matchStale\(\)/)
    expect(body('admSignOut')).toMatch(/wasJudge\) matchStale\(\)/)
    // stale: drop loads on their way and load again on the next render
    const stale = fn('matchStale')
    expect(stale).toContain('matchRun += 1')
    expect(fn('ensureMatch')).toMatch(/matchFor !== state\.profile \|\| matchStaleBy\) loadMatch\(\)/)
    // the bands from before (same profile, trend change only) give the banner
    const load = fn('loadMatch')
    expect(load).toContain("matchStaleBy !== 'trend' || matchFor !== profile")
    expect(load).toContain('bandsAt(m.data, scenarioOf(m))')
    expect(load).toContain('trendMoves(matchBefore, out.data)')
    expect(app).toMatch(/mBannerClose: \(\) => \{[^}]*trend: null/)
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

  it('a remembered chosen role but no profile: the no-profile card, not a spinner (final review 6)', () => {
    const html = sdgView({ t, state: { lang: 'en', profile: null, match: match({ data: null, chosen: FIXTURE.fullRole }) } })
    expect(text(html)).toContain(t('mtNoProfile'))
    expect(html).toContain('data-go="source"')
    expect(html).not.toContain('class="spin"')
  })

  it('no chosen role: a card that leads to Career matching', () => {
    const html = sdgView({ t, state: { lang: 'en', profile: FULL, match: match() } })
    expect(text(html)).toContain(t('mtSdgNoRole'))
    expect(html).toContain('data-go="match"')
  })

  it('a path with no SDG link says SDG not tagged yet', () => {
    const html = sdgView({ t, state: { lang: 'en', profile: FULL, match: match({ chosen: FIXTURE.noIscoRole, details: { [FIXTURE.noIscoRole]: details[FIXTURE.noIscoRole] } }) } })
    expect(text(html)).toContain(t('mtSdgNone'))
    expect(text(html)).toContain('potential, not measured')
  })
})

describe('Career matching strings and code', () => {
  const DYNAMIC = [1, 2, 3, 4].flatMap((b) => [`mtBand${b}`, `mtBand${b}Why`])
    .concat(['el', 'kn'].map((k) => `mtKind_${k}`), ['basic', 'good', 'expert'].map((w) => `mtLevel_${w}`))
    .concat(['pending', 'no_row', 'invalid', 'no_onet_data', 'waitsBls'].map((k) => `mtStep_${k}`))
    .concat(['masco2020_unit_to_isco08', 'soc2010_to_isco08', 'soc2018_to_soc2010', 'onet_to_soc2018'].map((id) => `mtStepName_${id}`))

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

describe('Banner and missing-step wording (owner feedback 31 Oct)', () => {
  const bannerOf = (html, marker) => {
    const at = html.indexOf(marker)
    return at < 0 ? '' : text(html.slice(at, html.indexOf('data-act="mBannerClose"', at))).replace(/\s+/g, ' ')
  }
  it('a scenario switch that moves no role says so plainly, with no count, "none" or "role(s)"', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const data = { ...list, roles: list.roles.map((r) => ({ ...r, bands: { moderate: 4, rapid: 4 } })) }
      const html = matchView({ t: tl, state: { lang, profile: FULL, match: match({ data, scenario: 'moderate', prevScenario: 'rapid' }) } })
      const b = bannerOf(html, 'mt-banner')
      expect(b).toContain(tl('mtBannerNoMove', { scenario: tl('mtScnModerate') }))
      expect(b).toContain(tl('mtBannerSame'))
      expect(b).not.toContain('role(s)')
    }
  })

  it('one moved role reads "1 role", several read "N roles"', () => {
    expect(t('mtMoveOne', { from: 'A', fromNum: 4, to: 'B', toNum: 2 })).toBe('1 role from “A” (group 4) to “B” (group 2)')
    expect(t('mtMoveMany', { count: 3, from: 'A', fromNum: 4, to: 'B', toNum: 2 })).toBe('3 roles from “A” (group 4) to “B” (group 2)')
    const one = list.roles.find((r) => r.bands.moderate !== r.bands.rapid)
    const data = { ...list, roles: list.roles.map((r) => (r.code === one.code ? r : { ...r, bands: { moderate: 4, rapid: 4 } })) }
    expect(bannerOf(view({ data, scenario: 'rapid', prevScenario: 'moderate' }), 'mt-banner')).toContain('moved 1 role from')
  })

  it('a trend change that moves no role says so plainly', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const html = matchView({ t: tl, state: { lang, profile: FULL, match: match({ trend: { scenario: 'moderate', moved: [] } }) } })
      const b = bannerOf(html, 'data-banner="trend"')
      expect(b).toContain(tl('mtTrendNoMove', { scenario: tl('mtScnModerate') }))
      expect(b).not.toMatch(/0/)
    }
  })

  it('a step that waits for the BLS crosswalk files says so, in all three languages', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      for (const id of ['masco2020_unit_to_isco08', 'soc2010_to_isco08', 'soc2018_to_soc2010']) {
        const step = { id, kind: 'pending', from: { system: 'MASCO 2020', codes: ['2512'] }, reason: 'x' }
        expect(stepText(tl, step)).toContain(tl('mtStep_waitsBls', { step: tl(`mtStepName_${id}`) }))
      }
      // a pending step that does not depend on BLS keeps the plain wording
      const other = { id: 'onet_to_soc2018', kind: 'pending', from: { system: 'SOC 2018', codes: ['15-1252'] }, reason: 'x' }
      expect(stepText(tl, other)).toContain(tl('mtStep_pending', { step: tl('mtStepName_onet_to_soc2018') }))
    }
    expect(t('mtStep_waitsBls', { step: 'MASCO 2020 → ISCO-08' })).toMatch(/BLS/)
  })
})

describe('Owner UI round (31 Oct)', () => {
  const cardsOf = (html) => [...html.matchAll(/class="card mt-role[^"]*" data-code="([^"]+)"/g)].map((m) => m[1])
  const pad = (i) => String(i).padStart(3, '0')
  // n roles outside the field, all in one band, with no Skill Match (ordered by title)
  const many = (n, bands = { moderate: 4, rapid: 4 }) => ({
    ...list,
    roles: Array.from({ length: n }, (_, i) => ({ ...roleOf(list, FIXTURE.noIscoRole), code: `9${pad(i)}-01`, title: `Role ${pad(i)}`, inField: false, bands, sdgGoals: [] })),
  })
  const pagerOf = (html) => {
    const at = html.indexOf('class="mt-pager"')
    return at < 0 ? '' : html.slice(at, html.indexOf('</nav>', at))
  }
  const pageNums = (pager) => [...pager.matchAll(/data-act="mPage" data-arg="[a-z]+:\d:(\d+)"[^>]*>(\d+)</g)].map((m) => Number(m[2]))
  const aiLine = (html) => {
    const at = html.indexOf('class="mt-aicard"')
    return at < 0 ? '' : html.slice(at, html.indexOf('</div>', at))
  }

  describe('1. short banner that names the groups', () => {
    it('groups the moved roles by (from, to) with the band names in words and numbers; no role names', () => {
      const roles = many(25).roles.map((r, i) => ({ ...r, bands: { moderate: 4, rapid: i < 20 ? 2 : i < 23 ? 1 : 4 } }))
      const html = view({ data: { ...list, roles }, scenario: 'rapid', prevScenario: 'moderate' })
      const b = text(html.slice(html.indexOf('mt-banner'), html.indexOf('data-act="mBannerClose"'))).replace(/\s+/g, ' ').trim()
      expect(b).toContain('Switching to Rapid AI moved 20 roles from “Not enough evidence yet” (group 4) to “AI may change much of this job (this scenario)” (group 2); 3 roles from “Not enough evidence yet” (group 4) to “Job ads growing or steady, AI mostly helps” (group 1). Skill Match numbers did not change.')
      expect(b).not.toContain('Role 0')
    })

    it('the trend banner uses the same short form, in all three languages', () => {
      const roles = many(3).roles
      const trend = { scenario: 'moderate', moved: roles.map((r) => ({ code: r.code, from: 4, to: 3 })) }
      for (const lang of ['en', 'ms', 'zh']) {
        const tl = (key, vars) => translate(lang, key, vars)
        const html = matchView({ t: tl, state: { lang, profile: FULL, match: match({ data: { ...list, roles }, trend }) } })
        const b = text(html.slice(html.indexOf('data-banner="trend"'), html.indexOf('data-act="mBannerClose"', html.indexOf('data-banner="trend"'))))
        const moves = tl('mtMoveMany', { count: 3, from: tl('mtBand4'), fromNum: 4, to: tl('mtBand3'), toNum: 3 })
        expect(b).toContain(tl('mtTrendMoved', { scenario: tl('mtScnModerate'), moves }))
        expect(b).not.toContain('Role 000')
      }
    })
  })

  describe('2. pages instead of long lists', () => {
    it('10 roles per page, page buttons with aria-labels and aria-current, prev/next and a Go-to-page box', () => {
      const html = view({ data: many(25) })
      expect(cardsOf(html)).toHaveLength(10)
      const pager = pagerOf(html)
      expect(pageNums(pager)).toEqual([1, 2, 3])
      expect(pager).toMatch(/<button[^>]*data-arg="other:4:1"[^>]*aria-current="page"/)
      expect(pager).toContain(`aria-label="${t('mtPageN', { page: 2 })}"`)
      expect(pager).toMatch(/<button[^>]*aria-label="[^"]+"[^>]*disabled[^>]*>‹</)
      expect(pager).toMatch(/<button[^>]*data-arg="other:4:2"[^>]*aria-label="[^"]+"[^>]*>›</)
      expect(html).toMatch(/<form[^>]*data-form="mPageGo" data-arg="other:4"/)
      expect(html).toMatch(/<input[^>]*type="number"[^>]*min="1" max="3"/)
      expect(text(html)).toContain(t('mtGoToPage'))
    })

    it('every role stays reachable; a page past the end shows the last page', () => {
      const data = many(25)
      const seen = [1, 2, 3].flatMap((p) => cardsOf(view({ data, pages: { 'other:4': p } })))
      expect(seen.sort()).toEqual(data.roles.map((r) => r.code).sort())
      expect(cardsOf(view({ data, pages: { 'other:4': 3 } }))).toEqual(['9020-01', '9021-01', '9022-01', '9023-01', '9024-01'])
      expect(cardsOf(view({ data, pages: { 'other:4': 99 } }))).toHaveLength(5)
    })

    it('first, last, current ± 1 and ellipses', () => {
      const pager = pagerOf(view({ data: many(120), pages: { 'other:4': 6 } }))
      expect(pageNums(pager)).toEqual([1, 5, 6, 7, 12])
      expect(pager.match(/…/g)).toHaveLength(2)
      expect(pager).toMatch(/data-arg="other:4:6"[^>]*aria-current="page"/)
    })

    it('a list of 10 or fewer has no pager; "In your field" has its own pages', () => {
      expect(view()).not.toContain('class="mt-pager"')
      const field = { ...many(12), roles: many(12).roles.map((r) => ({ ...r, inField: true })) }
      const html = view({ data: field, pages: { 'field:4': 2 } })
      expect(cardsOf(html)).toEqual(['9010-01', '9011-01'])
      expect(pagerOf(html)).toMatch(/data-arg="field:4:2"[^>]*aria-current="page"/)
    })

    it('app: page state lives in state.match, resets on scenario, SDG filter and new data, and is not saved', () => {
      const app = readFileSync(join(root, 'public/js/app.js'), 'utf8')
      const line = (name) => app.slice(app.indexOf(`  ${name}: `), app.indexOf('\n  ', app.indexOf(`  ${name}: `) + 3))
      const block = (name) => app.slice(app.indexOf(`  ${name}: `), app.indexOf('\n  },', app.indexOf(`  ${name}: `)))
      expect(block('mScn')).toContain('pages: {}')
      expect(line('mFilter')).toContain('pages: {}')
      const load = app.slice(app.indexOf('async function loadMatch('), app.indexOf('\n}', app.indexOf('async function loadMatch(')))
      expect(load).toContain('pages: {}')
      expect(app).toContain('mPage: ')
      expect(app).toContain('mPageGo: ')
      expect(matchToSave(match({ pages: { 'other:4': 3 }, open: { a: true } }))).toEqual({ scenario: 'moderate', chosen: null })
    })
  })

  describe('3. details open and close', () => {
    const d = () => details[FIXTURE.fullRole]
    it('closed: "Show outlook and details"; open: "Hide outlook and details" with three boxes and a Why fold', () => {
      const closed = card(FIXTURE.fullRole, { detail: d(), open: false })
      expect(closed).toMatch(/data-act="mOpen" data-arg="2521-03" aria-expanded="false">Show outlook and details</)
      expect(closed).not.toContain('class="mt-outgrid"')
      const open = card(FIXTURE.fullRole, { detail: d(), open: true })
      expect(open).toMatch(/data-act="mOpen" data-arg="2521-03" aria-expanded="true">Hide outlook and details</)
      const grid = open.slice(open.indexOf('class="mt-outgrid"'), open.indexOf('<details class="mt-why"', open.indexOf('class="mt-outgrid"')))
      expect(grid.match(/class="mt-box"/g)).toHaveLength(3)
      for (const key of ['mtJobAds', 'mtAiPart', 'mtSoftware']) expect(text(grid)).toContain(t(key))
      // every source line stays
      expect(text(grid)).toContain('DOSM')
      expect(text(grid)).toContain(t('mtAiModerateSrc', { job: FIXTURE.bestJob }))
      expect(text(grid)).toContain(t('mtSwShown'))
      // "Why this match" is its own fold, closed until asked (open while "Show all" is used)
      expect(open).toMatch(/<details class="mt-why"><summary>Why this match\?<\/summary>/)
      expect(card(FIXTURE.fullRole, { detail: d(), open: true, allBars: true })).toMatch(/<details class="mt-why" open>/)
    })

    it('open while loading: a spinner; open after a failure: try again', () => {
      expect(card(FIXTURE.fullRole, { detail: { loading: true }, open: true })).toContain('class="spin"')
      const failed = card(FIXTURE.fullRole, { detail: { error: 'network' }, open: true })
      expect(text(failed)).toContain(t('mtDetailError'))
      expect(failed).toContain('data-act="mDetail"')
    })

    it('the "Ask the AI questions" button opens the form on the AI section', () => {
      const app = readFileSync(join(root, 'public/js/app.js'), 'utf8')
      const at = app.indexOf('  mAskAi: ')
      const body = app.slice(at, app.indexOf('\n', at))
      expect(body).toContain('state.section = AI_SECTION')
      expect(body).toContain("go('form')")
      expect(app).toMatch(/const AI_SECTION = SECTIONS.indexOf\('secAi'\)/)
    })

    it('the page passes the open state per role code; CSS puts the boxes side by side from 760 px', () => {
      const html = view({ details: { [FIXTURE.fullRole]: d() }, open: { [FIXTURE.fullRole]: true } })
      expect(html).toContain('class="mt-outgrid"')
      expect(view({ details: { [FIXTURE.fullRole]: d() } })).not.toContain('class="mt-outgrid"')
      const css = readFileSync(join(root, 'public/styles.css'), 'utf8')
      expect(css).toMatch(/\.mt-outgrid\{display:grid;[^}]*grid-template-columns:minmax\(0,1fr\)/)
      expect(css).toMatch(/@media \(min-width:760px\)\{[^@]*\.mt-outgrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/)
      const app = readFileSync(join(root, 'public/js/app.js'), 'utf8')
      expect(app.slice(app.indexOf('  mOpen: '), app.indexOf('\n  },', app.indexOf('  mOpen: ')))).toContain('loadMatchDetail(code)')
    })
  })

  describe('4. AI on the closed card', () => {
    it('Moderate: the AEI automation % with a bar, labelled estimate with its source', () => {
      const line = aiLine(card(FIXTURE.fullRole))
      expect(text(line)).toContain("AI use seen on 66.7% of this job's tasks")
      expect(text(line)).not.toContain('30%')
      expect(line).toContain('mt-aibar')
      expect(text(line)).toContain(t('mtEstimate'))
      expect(text(line)).toContain('Anthropic Economic Index')
      expect(line).toContain('style="width:66.7%"') // M17: the bar shows the AI touch (observed share), not the automation share
      // M17: now in the right column, after the Skill Match
      const html = card(FIXTURE.fullRole)
      expect(html.indexOf('class="mt-aicard"')).toBeGreaterThan(html.indexOf('class="mt-side"'))
    })

    it('Moderate: the bar width and the number in the text are the same value', () => {
      const line = aiLine(card(FIXTURE.fullRole))
      const num = /AI use seen on ([\d.]+)%/.exec(text(line))[1]
      expect(line).toContain(`style="width:${num}%"`)
    })

    it('Rapid: GenAI exposure % and the ILO group; minimal / not exposed in words, bar still shown', () => {
      const line = aiLine(card(FIXTURE.fullRole, { scenario: 'rapid' }))
      expect(text(line)).toContain('GenAI exposure 45% · ILO group 1 of 4')
      expect(text(line)).toContain('ILO')
      expect(line).toContain('style="width:45%"')
      for (const [gradient, word] of [['minimal', 'minimal exposure'], ['not_exposed', 'not exposed']]) {
        const role = { ...roleOf(list, FIXTURE.fullRole), ai: { moderate: { available: false, automationPct: null }, rapid: { available: true, exposurePct: 31, gradient } } }
        const l = aiLine(roleCard({ t, lang: 'en', role, scenario: 'rapid' }))
        expect(text(l)).toContain(`GenAI exposure 31% · ILO: ${word}`)
        expect(l).toContain('style="width:31%"')
      }
    })

    it('no data: "no observed data" or "not available", with no bar', () => {
      const noIsco = aiLine(card(FIXTURE.noIscoRole, { scenario: 'rapid' }))
      expect(text(noIsco)).toContain(t('mtNotAvailableTag'))
      expect(noIsco).not.toContain('class="bar')
      // Moderate: the chain stops before O*NET -> not available; it reaches O*NET but AEI has no data -> no observed data
      expect(text(aiLine(card(FIXTURE.brokenRole)))).toContain(t('mtNotAvailableTag'))
      const uncovered = { ...roleOf(list, FIXTURE.fullRole), ai: { moderate: { available: false, automationPct: null }, rapid: { available: false, exposurePct: null, gradient: null } } }
      const l = aiLine(roleCard({ t, lang: 'en', role: uncovered }))
      expect(text(l)).toContain(t('mtNoObserved'))
      expect(l).not.toContain('class="bar')
      // a role answer with no ai part (older answer) shows no number, never an error
      const bare = { ...roleOf(list, FIXTURE.fullRole) }
      delete bare.ai
      expect(text(aiLine(roleCard({ t, lang: 'en', role: bare })))).toContain(t('mtNoObserved'))
    })
  })

  describe('5. every SDG team-draft link shown, each with a UN link (M16)', () => {
    const un = (n) => `href="https://sdgs.un.org/goals/goal${n}" target="_blank" rel="noopener`
    it('card tags link to the UN goal page and say whether the owner reviewed them', () => {
      const role = roleOf(list, FIXTURE.fullRole)
      expect(role.sdgGoals).toEqual([8, 9])
      const html = card(FIXTURE.fullRole)
      expect(html).toContain(`<a class="tag mt-sdg" ${un(9)}`)
      expect(html).toContain(un(8))
      expect(text(html)).toContain('team draft, approved by owner on 2026-10-31')
      const draft = text(roleCard({ t, lang: 'en', role: { ...role, sdgReviewed: {} } }))
      expect(draft).toContain('team draft, not yet reviewed')
      expect(draft).not.toContain('approved by owner')
      const mixed = text(roleCard({ t, lang: 'en', role: { ...role, sdgReviewed: { 9: '2026-10-31' } } }))
      expect(mixed).toContain('SDG 9: team draft, approved by owner on 2026-10-31')
      expect(mixed).toContain('SDG 8: team draft, not yet reviewed')
    })

    it('open panel tags (per target) link to the UN goal page with their review state', () => {
      const d = details[FIXTURE.fullRole]
      const draft = { ...d, sdg: { ...d.sdg, tags: d.sdg.tags.map((x) => ({ ...x, approvedAt: null })) } }
      const html = card(FIXTURE.fullRole, { detail: draft, open: true })
      expect(html).toContain(un(9))
      expect(text(html)).toContain('team draft, not yet reviewed')
    })

    it('the filter lists every goal of a shown link; the #sdg tab links each goal row and names the UN SDG site', () => {
      expect(text(view())).toContain(t('mtSdgFilterSrc'))
      expect(t('mtSdgFilterSrc')).not.toMatch(/approved/)
      const d = details[FIXTURE.fullRole]
      const pending = { ...d, sdg: { ...d.sdg, tags: d.sdg.tags.map((x) => ({ ...x, approvedAt: null })), pathPreview: { ...d.sdg.pathPreview, goals: d.sdg.pathPreview.goals.map((g) => ({ ...g, links: g.links.map((l) => ({ ...l, approvedAt: null })) })) } } }
      const html = sdgView({ t, state: { lang: 'en', profile: FULL, match: match({ chosen: FIXTURE.fullRole, details: { [FIXTURE.fullRole]: pending } }) } })
      for (const g of [4, 8, 9]) expect(html).toContain(un(g))
      expect(text(html)).toContain('team draft, not yet reviewed')
      expect(text(html)).not.toContain('approved by owner')
      expect(text(html)).toContain('sdgs.un.org')
      // the count is of every shown link
      expect(text(html)).toContain('SDG 4 (1 link)')
    })
  })

  it('new values are escaped and the forbidden words stay out', () => {
    const role = { ...roleOf(list, FIXTURE.fullRole), sdgGoals: ['<b>x</b>'], sdgReviewed: { '<b>x</b>': '<b>y</b>' }, ai: { moderate: { available: true, automationPct: '<b>z</b>' }, rapid: { available: true, exposurePct: 3, gradient: '<b>g</b>' } } }
    for (const scenario of ['moderate', 'rapid']) {
      const html = roleCard({ t, lang: 'en', role, scenario })
      for (const v of ['<b>x', '<b>y', '<b>z', '<b>g']) expect(html).not.toContain(v)
      expect(html).not.toMatch(/goal<|goalNaN|goal&lt;/)
    }
    const page = view({ data: many(25), pages: { 'other:4': '<b>2</b>' } })
    expect(page).not.toContain('<b>2')
    expect(cardsOf(page)).toHaveLength(10)
  })
})

describe('SDG filter width (owner screenshot 31 Oct: long UN goal titles widened the page)', () => {
  it('the filter column can shrink and the select fills it, so long goal titles never widen the page', () => {
    const html = view()
    expect(html).toMatch(/<div class="mt-filter"><label[^>]*for="mtSdgFilter"/)
    const css = readFileSync(join(root, 'public/styles.css'), 'utf8')
    expect(css).toMatch(/\.mt \.mt-filter\{[^}]*min-width:0[^}]*\}/)
    expect(css).toMatch(/\.mt \.mt-filter \.mt-sel\{[^}]*width:100%[^}]*\}/)
  })
})

describe('Software asked box (owner request 31 Oct: too long)', () => {
  const sw = (n, have, inDemand) => ({ name: `Tool ${n}`, have, inDemand })
  const many = [sw(1, false, false), sw(2, false, true), sw(3, true, false), ...Array.from({ length: 20 }, (_, i) => sw(i + 4, false, i % 3 === 0)), sw(24, true, true)]

  it('shows a one-line count, the 8 most useful chips first (yours, then in demand), and the rest behind a fold', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const html = softwareChips(tl, many)
      expect(text(html)).toContain(tl('mtSwSummary', { have: 2, total: 24, demand: many.filter((s) => s.inDemand).length }))
      const shown = html.slice(0, html.indexOf('<details'))
      expect((shown.match(/class="mt-chip( have)?"/g) || []).length).toBe(8)
      // yours first, then in demand
      const at = (name) => shown.indexOf(`${name}</span>`) >= 0 ? shown.indexOf(`${name}</span>`) : shown.indexOf(`${name} · `)
      expect(at('Tool 3')).toBeGreaterThan(-1)
      expect(at('Tool 3')).toBeLessThan(at('Tool 2'))
      expect(at('Tool 24')).toBeLessThan(at('Tool 2'))
      expect(shown).not.toContain('Tool 1</span>')
      const more = html.slice(html.indexOf('<details'))
      expect(text(more)).toContain(tl('mtSwMore', { count: 16 }))
      expect((more.match(/class="mt-chip( have)?"/g) || []).length).toBe(16)
      expect(text(html)).toContain(tl('mtSwShown'))
    }
  })

  it('8 or fewer: no fold; none: "not available"; names are escaped', () => {
    const few = softwareChips(t, many.slice(0, 5))
    expect(few).not.toContain('<details')
    expect(softwareChips(t, [])).toContain(t('mtSwNone'))
    expect(softwareChips(t, [{ name: '<b>x</b>', have: true, inDemand: false }])).not.toContain('<b>x</b>')
  })
})

describe('Overall match on the card (M17 task 4)', () => {
  const k = { percent: 75, yes: 3, answered: 4 }
  const mk = (over) => ({ code: '2512-01', title: 'Software Developer', skillMatch: { percent: 64, met: 9, needed: 14, provisional: false, onetCode: '15-1252.00', onetTitle: 'Software Developers' },
    ai: { moderate: { available: true, automationPct: 54.7, touchPct: 71 }, rapid: { available: true, exposurePct: 58, gradient: 'G3', touchPct: 58 } },
    overallMatch: { moderate: { percent: 72, provisional: false, noAiData: false, skill: 64, knowHow: k, touch: 0.71 }, rapid: { percent: 70, provisional: false, noAiData: false, skill: 64, knowHow: k, touch: 0.58 } },
    bands: { moderate: 2, rapid: 2 }, sdgGoals: [], inField: true, ...over })
  const stateWith = (roles) => ({ lang: 'en', profile: FULL, match: match({ data: { ...list, roles, aiKnowHow: k } }) })

  it('moves the AI bar to the right column, under the Skill Match, then the Overall', () => {
    const html = roleCard({ t, role: mk(), scenario: 'moderate', knowHow: k })
    const side = html.slice(html.indexOf('class="mt-side"'))
    expect(html.slice(0, html.indexOf('class="mt-side"'))).not.toContain('mt-aicard')
    expect(side.indexOf('Skill Match')).toBeLessThan(side.indexOf('mt-aitouch'))
    expect(side.indexOf('mt-aitouch')).toBeLessThan(side.indexOf('mt-overall'))
  })
  it('writes the sum out with two decimals', () =>
    expect(text(roleCard({ t, role: mk(), scenario: 'moderate', knowHow: k }))).toContain('64% skills × 0.29 + 75% AI know-how × 0.71 = 72%'))
  it('switching scenario changes Overall but not Skill Match', () => {
    const m = roleCard({ t, role: mk(), scenario: 'moderate', knowHow: k }); const r = roleCard({ t, role: mk(), scenario: 'rapid', knowHow: k })
    expect(m).toContain('>64%<'); expect(r).toContain('>64%<')
    expect(m).toContain('>72%<'); expect(r).toContain('>70%<')
    expect(m).not.toContain('>70%<'); expect(r).not.toContain('>72%<')
  })
  it('no AI data -> Overall equals Skill Match with the note', () => {
    const o = { percent: 64, provisional: false, noAiData: true, skill: 64, knowHow: k, touch: null }
    const html = roleCard({ t, role: mk({ overallMatch: { moderate: o, rapid: null } }), scenario: 'moderate', knowHow: k })
    expect(text(html)).toContain('No AI data for this job in this scenario, so Overall = Skill Match.')
    expect(html).not.toContain('data-act="mAskAi"')
  })
  it('no answers -> the ask button, no Overall number', () => {
    const html = roleCard({ t, role: mk({ overallMatch: { moderate: null, rapid: null } }), scenario: 'moderate', knowHow: null })
    expect(html).toContain('data-act="mAskAi"'); expect(text(html)).not.toContain('AI know-how ×')
    expect(roleCard({ t, role: mk({ overallMatch: { moderate: null, rapid: null } }), scenario: 'moderate' })).toContain('data-act="mAskAi"')
  })
  it('a role with no Skill Match shows no Overall block', () => {
    const html = roleCard({ t, role: mk({ skillMatch: null, overallMatch: { moderate: null, rapid: null } }), scenario: 'moderate', knowHow: null })
    expect(html).not.toContain('mt-overall'); expect(html).not.toContain('mAskAi')
  })
  it('sorts a band by Overall, then Skill Match, roles with neither last', () => {
    const a = mk({ code: '1000-01', title: 'A', skillMatch: { ...mk().skillMatch, percent: 20 }, overallMatch: { moderate: { ...mk().overallMatch.moderate, percent: 50 }, rapid: null } })
    const b = mk({ code: '1000-02', title: 'B', overallMatch: { moderate: null, rapid: null }, skillMatch: { ...mk().skillMatch, percent: 60 } })
    const c = mk({ code: '1000-03', title: 'C', skillMatch: null, overallMatch: { moderate: null, rapid: null } })
    const html = matchView({ t, state: stateWith([c, a, b]) })
    expect(html.indexOf('data-code="1000-02"')).toBeLessThan(html.indexOf('data-code="1000-01"'))
    expect(html.indexOf('data-code="1000-01"')).toBeLessThan(html.indexOf('data-code="1000-03"'))
  })
  it('has no forbidden words', () => expect(roleCard({ t, role: mk(), scenario: 'rapid', knowHow: k })).not.toMatch(FORBIDDEN))
})
