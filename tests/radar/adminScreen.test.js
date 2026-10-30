// Radar admin review and judge Trend Change Test screens (spec §8, §9, §11.5a, §12, §13; Task 20).
// Render functions are tested on real answers: a real server on port 0 with a memory store (development store),
// the browser API helpers (public/js/radarAdminApi.js) driven through a small cookie jar, as a browser would.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarAccess } from '../../server/radar/access.js'
import { createRadarService } from '../../server/radar/service.js'
import { createIngestor } from '../../server/radar/ingest.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { SourceError } from '../../server/radar/sourceError.js'
import * as radarApi from '../../public/js/radarApi.js'
import { createRadarAdminApi } from '../../public/js/radarAdminApi.js'
import { adminView, judgeView } from '../../public/js/screens/radarAdmin.js'
import { staleRadar } from '../../public/js/screens/radar.js'
import { ruleText } from '../../public/js/components/evidencePanel.js'
import { t as translate } from '../../shared/i18n.js'
import en from '../../shared/strings/en.js'

const t = (key, vars) => translate('en', key, vars)
const ENV = { RADAR_ADMIN_KEY: 'admin-key-for-screen-tests-0123', RADAR_DEMO_KEY: 'demo-key-for-screen-tests-4567', RADAR_SESSION_SECRET: 's'.repeat(40) }
const NOW = new Date('2026-10-31T00:00:00.000Z')
const SPEC_CODES = [
  'openalex_key_missing', 'openalex_rate_limited', 'openalex_auth_failed', 'source_unavailable', 'dosm_dataset_missing',
  'dosm_layout_unexpected', 'validation_failed', 'periods_removed', 'publish_conflict', 'store_unavailable',
  'not_configured', 'not_allowed', 'csrf_failed', 'demo_expired', 'demo_full', 'manifest_gone',
]

const failingSource = (code) => ({
  lastCompleteYear: () => 2025,
  fetchSnapshot: async () => { throw new SourceError(code) },
  discover: async () => { throw new SourceError(code) },
})

let server
let base
// A browser-like fetch: keeps the fr_radar cookie, sends Origin, and records every request's headers.
function jar() {
  let cookie = null
  const sent = []
  const fetchImpl = async (url, options = {}) => {
    const headers = { ...(options.headers ?? {}), origin: base }
    if (cookie) headers.cookie = cookie
    sent.push({ url, method: options.method ?? 'GET', headers: { ...(options.headers ?? {}) }, body: options.body })
    const response = await fetch(url, { ...options, headers })
    const set = response.headers.get('set-cookie')
    if (set) {
      const pair = set.split(';')[0]
      cookie = pair.endsWith('=') ? null : pair
    }
    return response
  }
  return { fetchImpl, sent }
}

let publicData
let admin
let adminJar
let judge
let judgeJar
let initial
let afterA
let afterB
beforeAll(async () => {
  const references = await loadRadarReferences('data')
  const store = createMemoryStore()
  const now = () => NOW
  const ingestor = createIngestor({ store, sources: { openalex: failingSource('openalex_rate_limited'), dosm: failingSource('dosm_dataset_missing') }, references, now, log: () => {} })
  const radar = createRadarService({ store, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor, now, devStore: true, log: () => {} })
  server = createApp({ radar, radarAccess: createRadarAccess({ env: ENV, now }), d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  await radar.answer()
  const out = await radarApi.load(undefined, { base })
  expect(out.ok).toBe(true)
  publicData = out.data
  adminJar = jar()
  admin = createRadarAdminApi({ base, fetchImpl: adminJar.fetchImpl })
  judgeJar = jar()
  judge = createRadarAdminApi({ base, fetchImpl: judgeJar.fetchImpl })
  expect((await admin.signIn('admin', ENV.RADAR_ADMIN_KEY, { label: 'owner' })).ok).toBe(true)
  expect((await judge.signIn('demo', ENV.RADAR_DEMO_KEY)).ok).toBe(true)
  initial = await judge.diff()
  afterA = await judge.apply({ scenario: 'A' })
  afterB = await judge.apply({ scenario: 'B' })
  for (const out of [initial, afterA, afterB]) expect(out.ok).toBe(true)
})
afterAll(() => new Promise((resolve) => server.close(resolve)))

const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const text = (html) => unesc(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')
async function adminData() {
  const [status, mappings, breaks] = await Promise.all([admin.status(), admin.mappings(), admin.breaks()])
  for (const out of [status, mappings, breaks]) expect(out.ok).toBe(true)
  return { public: publicData, status: status.data, mappings: mappings.data, breaks: breaks.data, now: NOW.getTime() }
}
const adminState = (ui = {}) => ({ lang: 'en', radarAdmin: { session: admin.session(), ...ui } })
const judgeState = (ui = {}) => ({ lang: 'en', radarAdmin: { session: judge.session(), ...ui } })
const clean = (html) => {
  const words = text(html)
  expect(words).not.toMatch(/\b(null|NaN|undefined)\b/)
  expect(words).not.toMatch(/\{[a-zA-Z]+\}/) // no unfilled placeholder
  expect(words).not.toMatch(/\bscores?\b|\bweights?\b|\branked\b/i)
}

describe('sign-in and session (spec §8.1)', () => {
  it('the key box is a labelled password field that never shows the key', () => {
    for (const html of [adminView({ t, state: { lang: 'en', radarAdmin: {} }, data: null }), judgeView({ t, state: { lang: 'en', radarAdmin: {} }, data: null })]) {
      const input = html.match(/<input[^>]*type="password"[^>]*>/)[0]
      expect(input).toContain('autocomplete="off"')
      expect(input).not.toMatch(/\svalue=/)
      const id = input.match(/id="([^"]+)"/)[1]
      expect(html).toContain(`<label for="${id}"`)
    }
    expect(adminView({ t, state: { lang: 'en', radarAdmin: {} }, data: null })).toContain(t('rdAdminKey'))
    expect(judgeView({ t, state: { lang: 'en', radarAdmin: {} }, data: null })).toContain(t('rdJudgeKey'))
  })

  it('after sign-in the key and the CSRF token appear nowhere: not in the session, the state or the screen', async () => {
    const data = await adminData()
    const html = adminView({ t, state: adminState(), data })
    const session = JSON.stringify(admin.session())
    expect(admin.session()).toMatchObject({ role: 'admin' })
    for (const secret of [ENV.RADAR_ADMIN_KEY, ENV.RADAR_DEMO_KEY]) {
      expect(html).not.toContain(secret)
      expect(session).not.toContain(secret)
    }
    // A mutation carries the token in the X-Radar-CSRF header; the token never shows in session(), state or HTML.
    await admin.cleanup()
    const token = adminJar.sent.filter((r) => r.method === 'POST' && r.url.endsWith('/api/admin/radar/cleanup')).at(-1).headers['X-Radar-CSRF']
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(10)
    expect(session).not.toContain(token)
    expect(html).not.toContain(token)
    expect(JSON.stringify(adminState())).not.toContain(token)
    // Reads send no token.
    expect(adminJar.sent.filter((r) => r.method === 'GET').every((r) => r.headers['X-Radar-CSRF'] === undefined)).toBe(true)
    // Every mutation sends it.
    expect(adminJar.sent.filter((r) => r.method === 'POST' && !r.url.endsWith('/api/radar/session')).every((r) => typeof r.headers['X-Radar-CSRF'] === 'string')).toBe(true)
  })

  it('the app never persists the Radar admin state (key, token, data) through the guest store', () => {
    const app = readFileSync('public/js/app.js', 'utf8')
    const persist = app.slice(app.indexOf('function persist()'), app.indexOf('}', app.indexOf('function persist()')))
    expect(persist).toContain('radarAdmin: null')
    expect(app).not.toMatch(/localStorage/)
    const api = readFileSync('public/js/radarAdminApi.js', 'utf8')
    expect(api).not.toMatch(/localStorage|sessionStorage|document\.cookie|guestStore/)
  })

  it('a wrong key is refused with its code and text; the key is not echoed', async () => {
    const other = createRadarAdminApi({ base, fetchImpl: jar().fetchImpl })
    const out = await other.signIn('admin', 'wrong-key-<b>')
    expect(out).toMatchObject({ ok: false, code: 'not_allowed' })
    expect(other.session()).toBe(null)
    const html = adminView({ t, state: { lang: 'en', radarAdmin: { msgs: { signin: { kind: 'bad', code: out.code } } } }, data: null })
    expect(html).toContain(t('rdErr_not_allowed'))
    expect(html).not.toContain('wrong-key')
  })

  it('the development store banner shows when the server reports the memory store', async () => {
    const data = await adminData()
    expect(data.status.devStore).toBe(true)
    expect(adminView({ t, state: adminState(), data })).toContain(t('rdDevStore'))
    expect(judgeView({ t, state: judgeState(), data: { report: afterA.data, now: NOW.getTime() } })).toContain(t('rdDevStore'))
    const off = { ...data, status: { ...data.status, devStore: false }, public: { ...data.public, devStore: false } }
    expect(adminView({ t, state: adminState(), data: off })).not.toContain(t('rdDevStore'))
  })

  it('the key-box screens (#admin, #judge) show the banner from the public manifest answer, before any sign-in', async () => {
    const out = await radarApi.storeInfo({ base })
    expect(out).toEqual({ ok: true, devStore: true })
    const signedOut = (devStore) => ({ lang: 'en', radarAdmin: { devStore } })
    const adminBox = adminView({ t, state: signedOut(out.devStore), data: null })
    expect(adminBox).toContain('id="admKey"')
    expect(adminBox).toContain(t('rdDevStore'))
    const judgeBox = judgeView({ t, state: signedOut(out.devStore), data: { report: null } })
    expect(judgeBox).toContain('id="admKey"')
    expect(judgeBox).toContain(t('rdDevStore'))
    for (const html of [adminView({ t, state: signedOut(false), data: null }), judgeView({ t, state: signedOut(false), data: { report: null } })]) {
      expect(html).not.toContain(t('rdDevStore'))
    }
    // Signed in, while the data is still loading, the remembered answer keeps the banner up.
    expect(adminView({ t, state: { lang: 'en', radarAdmin: { session: admin.session(), devStore: true, loading: true } }, data: null })).toContain(t('rdDevStore'))
    expect(judgeView({ t, state: { lang: 'en', radarAdmin: { session: judge.session(), devStore: true, loading: true } }, data: { report: null } })).toContain(t('rdDevStore'))
  })
})

describe('admin review (spec §8.2, §8.4)', () => {
  it('mapping list shows id, field and level, AI topic, reason, status and approve / reject / revise with a required note', async () => {
    const data = await adminData()
    const html = adminView({ t, state: adminState(), data })
    const first = data.mappings.mappings[0]
    expect(html).toContain(t('rdAdminMapTitle'))
    expect(html).toContain(esc(first.mappingId))
    expect(unesc(html)).toContain(first.reason.en)
    expect(html).toContain(t('rdLevel_broad'))
    expect(html).toContain(t('rdStatusProposed'))
    expect(unesc(html)).toContain(t(`rdAxis_${first.axisId}`))
    for (const [decision, label] of [['approved', 'rdApprove'], ['rejected', 'rdReject'], ['revise', 'rdRevise']]) {
      expect(html).toContain(`data-arg="${esc(first.mappingId)}|${decision}"`)
      expect(html).toContain(t(label))
    }
    const note = html.match(/<textarea[^>]*id="admMapNote"[^>]*>/)[0]
    expect(note).toContain('required')
    expect(html).toContain('<label for="admMapNote"')
  })

  it('a mapping decision without a note is refused before anything is sent; with a note it is stored', async () => {
    const before = adminJar.sent.length
    const refused = await admin.decideMapping({ mappingId: '06-language', decision: 'approved', note: '   ' })
    expect(refused).toMatchObject({ ok: false, code: 'note_required' })
    expect(adminJar.sent.length).toBe(before)
    const html = adminView({ t, state: adminState({ msgs: { map: { kind: 'bad', code: 'note_required' } } }), data: await adminData() })
    expect(html).toContain(t('rdNoteRequired'))
    const out = await admin.decideMapping({ mappingId: '06-language', decision: 'approved', note: 'Checked the ISCED-F 06 programmes.' })
    expect(out.ok).toBe(true)
    const data = await adminData()
    const row = adminView({ t, state: adminState(), data })
    expect(row).toContain(t('rdStatusApproved'))
    // The decision history lists it with reviewer, decision and note.
    expect(unesc(row)).toContain('Checked the ISCED-F 06 programmes.')
    expect(row).toContain(t('rdDecision_approved'))
  })

  it('break list shows each flagged quarter with evidence links (incl. the listing title) and the four decisions', async () => {
    const data = await adminData()
    const html = adminView({ t, state: adminState(), data })
    const periods = data.breaks.breaks.map((b) => b.period)
    expect(periods).toContain('2025 Q3')
    expect(html).toContain(t('rdAdminBreakTitle'))
    expect(html).toContain('https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q32025')
    expect(html).toContain('https://www.dosm.gov.my/portal-main/release-archive/big-data-analytics-job-market-insights-q22026')
    // The listing title of the imported release is shown as evidence (not a cause).
    expect(unesc(html)).toContain(publicData.occ.listingTitle)
    expect(unesc(html)).toContain(t('rdBrkEvTitle', { title: publicData.occ.listingTitle }))
    const i = periods.indexOf('2025 Q3')
    for (const [decision, label] of [['confirmed', 'rdBreakConfirm'], ['dismissed_counts', 'rdBreakDismiss'], ['dismissed_shares', 'rdBreakDismissShares'], ['annotate', 'rdBreakAnnotate']]) {
      expect(html).toContain(`data-arg="${i}|${decision}"`)
      expect(html).toContain(t(label))
    }
    expect(html).toContain(t('rdBreak_unreviewed'))
    // Total change and groups moving the same way, formatted.
    const b = data.breaks.breaks[i]
    expect(html).toContain(`${b.groupsSameWay}/${b.eligibleGroups}`)
    expect(html).toMatch(/<textarea[^>]*id="admBrkNote"[^>]*required/)
  })

  it('the 2025 Q3 break shows the listing titles of 2025 Q2 and 2025 Q3 side by side, with the server release links', async () => {
    const data = await adminData()
    const b = data.breaks.breaks.find((x) => x.period === '2025 Q3')
    const html = adminView({ t, state: adminState(), data })
    const titles = html.match(/<table class="rd-brk-titles[^"]*"[\s\S]*?<\/table>/g) ?? []
    const q3 = titles.find((tb) => tb.includes('2025 Q3') && tb.includes('2025 Q2'))
    expect(q3).toBeTruthy()
    expect(unesc(q3)).toContain('Big Data Analytics: Job Market Insights and My Job Profile, Second Quarter of 2025')
    expect(unesc(q3)).toContain('Big Data Analytics: Job Market Insights, Third Quarter of 2025')
    expect(q3.indexOf('2025 Q2')).toBeLessThan(q3.indexOf('2025 Q3'))
    expect(html).toContain(t('rdBrkEvTitles'))
    // A quarter the listing does not reach says so.
    expect(html).toContain(t('rdBrkEvNotListed'))
    // The links come from the server answer (no URL pattern in the browser).
    const moved = structuredClone(data)
    moved.breaks.breaks.find((x) => x.period === '2025 Q3').releaseLinks = { page: 'https://www.dosm.gov.my/page-from-server', listing: 'https://www.dosm.gov.my/listing-from-server' }
    const out = adminView({ t, state: adminState(), data: moved })
    expect(out).toContain('https://www.dosm.gov.my/page-from-server')
    expect(out).toContain('https://www.dosm.gov.my/listing-from-server')
    // The release page link of the row is the one the server sent (the title links keep their own real pages).
    expect(out).toMatch(new RegExp(`href="https://www\\.dosm\\.gov\\.my/page-from-server"[^>]*>${t('rdBrkEvRelease', { period: '2025 Q3' })}</a>`))
    expect(out).not.toMatch(new RegExp(`q32025"[^>]*>${t('rdBrkEvRelease', { period: '2025 Q3' })}</a>`))
    expect(b.releaseLinks.page).toBe('https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q32025')
  })

  it('each listing title links to its real DOSM release page (D3)', async () => {
    const data = await adminData()
    const html = adminView({ t, state: adminState(), data })
    const q3 = (html.match(/<table class="rd-brk-titles[^"]*"[\s\S]*?<\/table>/g) ?? []).find((tb) => tb.includes('>2025 Q3<') && tb.includes('>2025 Q2<'))
    expect(q3).toContain('<a href="https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-and-my-job-profile-second-quarter-of-"')
    expect(q3).toContain('<a href="https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q32025"')
    expect(q3).toMatch(/<a href="[^"]*second-quarter-of-"[^>]*>Big Data Analytics: Job Market Insights and My Job Profile, Second Quarter of 2025<\/a>/)
    // A title without a usable link stays plain escaped text.
    const noLink = structuredClone(data)
    const b = noLink.breaks.breaks.find((x) => x.period === '2025 Q3')
    b.evidence.listing[0].pageUrl = 'javascript:alert(1)'
    b.evidence.listing[0].title = '<script>x</script>'
    b.evidence.listing[1].title = '<img src=x>"t'
    const out = adminView({ t, state: adminState(), data: noLink })
    expect(out).not.toContain('javascript:alert(1)')
    expect(out).not.toContain('<script>x</script>')
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(out).not.toContain('<img src=x>')
    expect(out).toContain('&lt;img src=x&gt;&quot;t</a>')
  })

  it('listing titles are escaped', async () => {
    const data = structuredClone(await adminData())
    const b = data.breaks.breaks.find((x) => x.period === '2025 Q3')
    b.evidence.listing[0].title = '<img src=x onerror=alert(1)>"q'
    b.evidence.listing[1].publishedAt = '<b>2026</b>'
    const html = adminView({ t, state: adminState(), data })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>2026</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;q')
  })

  it('the browser has no DOSM URL builder of its own', async () => {
    const mod = await import('../../public/js/radarAdminApi.js')
    expect(mod.dosmReleaseLinks).toBeUndefined()
    expect(readFileSync('public/js/radarAdminApi.js', 'utf8')).not.toContain('dosm.gov.my')
    expect(readFileSync('public/js/screens/radarAdmin.js', 'utf8')).not.toContain('dosm.gov.my')
  })

  it('a break decision sends the evidence links and reports where it applies', async () => {
    const data = await adminData()
    const b = data.breaks.breaks.find((x) => x.period === '2025 Q3')
    expect((await admin.decideBreak({ brk: b, decision: 'annotate', note: '' })).code).toBe('note_required')
    const out = await admin.decideBreak({ brk: b, decision: 'annotate', note: 'Title changed at this release.', link: 'https://example.org/evidence' })
    expect(out.ok).toBe(true)
    expect(out.data.review.evidence).toEqual(expect.arrayContaining([
      'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q32025',
      'https://www.dosm.gov.my/portal-main/release-archive/big-data-analytics-job-market-insights-q22026',
      'https://example.org/evidence',
    ]))
    const bad = await admin.decideBreak({ brk: b, decision: 'annotate', note: 'x', link: 'javascript:alert(1)' })
    expect(bad).toMatchObject({ ok: false, code: 'bad_link' })
    const html = adminView({ t, state: adminState({ msgs: { brk: { kind: 'ok', recalculation: out.data.recalculation } } }), data: await adminData() })
    clean(html)
    expect(text(html)).toMatch(new RegExp(out.data.recalculation.appliesAt === 'now' ? 'applied' : 'next refresh'))
  })

  it('status shows the five state dimensions, last checks, the log, conflicts and orphans with a clean-up button', async () => {
    const data = await adminData()
    const html = adminView({ t, state: adminState(), data })
    for (const key of ['rdDim_availability', 'rdDim_freshness', 'rdDim_refreshHealth', 'rdDim_servedFrom', 'rdDim_comparability']) expect(html, key).toContain(t(key))
    expect(html).toContain(t('rdAdminIngestTitle'))
    expect(html).toContain(t('rdAdminOrphans'))
    expect(html).toContain(t('rdAdminConflicts'))
    expect(html).toContain('data-act="admCleanup"')
    expect(html).toContain(data.status.activeManifestId)
    // With orphans listed, each key is shown.
    const withOrphans = { ...data, status: { ...data.status, orphans: ['prod/snapshots/dosm/dosm-2026q1-20261001T000000Z.json'] } }
    expect(adminView({ t, state: adminState(), data: withOrphans })).toContain('prod/snapshots/dosm/dosm-2026q1-20261001T000000Z.json')
  })

  it('refresh buttons per source show the code the server returned', async () => {
    const out = await admin.refresh('openalex')
    expect(out).toMatchObject({ ok: false, code: 'openalex_rate_limited' })
    const data = await adminData()
    const html = adminView({ t, state: adminState({ msgs: { refresh: { kind: 'bad', source: 'openalex', code: out.code } } }), data })
    expect(html).toContain('data-act="admRefresh" data-arg="openalex"')
    expect(html).toContain('data-act="admRefresh" data-arg="dosm"')
    expect(html).toContain('<code>openalex_rate_limited</code>')
    expect(html).toContain(t('rdErr_openalex_rate_limited'))
    // The failed check now shows in the status (last checks / log) with its code text.
    expect(html).toContain(t('rdErr_openalex_rate_limited'))
    const ok = adminView({ t, state: adminState({ msgs: { refresh: { kind: 'ok', source: 'dosm', result: { outcome: 'no_change' } } } }), data })
    expect(ok).toContain(t('rdRefreshNoChange', { source: 'DOSM' }))
  })

  it('export shows the approved mappings and reviews as JSON', async () => {
    const out = await admin.exportJson()
    expect(out.ok).toBe(true)
    const html = adminView({ t, state: adminState({ exported: out.data }), data: await adminData() })
    expect(html).toContain('<pre')
    expect(unesc(html)).toContain('"schemaVersion": "radar-field-topics/v1"')
  })

  it('every error code from spec §13 is shown with its rdErr text and code', async () => {
    const data = await adminData()
    for (const code of SPEC_CODES) {
      expect(en[`rdErr_${code}`], code).toBeTruthy()
      const html = adminView({ t, state: adminState({ msgs: { status: { kind: 'bad', code } } }), data })
      expect(html, code).toContain(t(`rdErr_${code}`))
      expect(html, code).toContain(`<code>${code}</code>`)
      const j = judgeView({ t, state: judgeState({ msgs: { judge: { kind: 'bad', code } } }), data: { report: afterA.data, now: NOW.getTime() } })
      expect(j, code).toContain(t(`rdErr_${code}`))
    }
    // An unknown code still shows a plain text, never a raw key.
    const html = adminView({ t, state: adminState({ msgs: { status: { kind: 'bad', code: 'weird_code' } } }), data })
    expect(html).toContain(t('rdErr_other'))
    expect(html).not.toContain('rdErr_weird_code')
  })

  it('a not-configured server (no keys) says so on the sign-in screen', () => {
    const html = adminView({ t, state: { lang: 'en', radarAdmin: { msgs: { signin: { kind: 'bad', code: 'not_configured' } } } }, data: null })
    expect(html).toContain(t('rdErr_not_configured'))
  })
})

describe('judge Trend Change Test (spec §9)', () => {
  it('shows Scenario A and B, editable values, Apply and Reset', () => {
    const html = judgeView({ t, state: judgeState(), data: { report: initial.data, now: NOW.getTime() } })
    expect(html).toContain(t('rdJudgeTitle'))
    expect(html).toContain(t('rdScenA'))
    expect(html).toContain(t('rdScenB'))
    expect(html).toContain('data-act="demoApply"')
    expect(html).toContain('data-act="demoReset"')
    expect(html).toContain(t('rdJudgeReset'))
    // Scenario A (default): number inputs for the synthetic counts, labelled with group and quarter.
    const cell = html.match(/<input[^>]*data-demo-cell="2\|2026 Q2"[^>]*>/)[0]
    expect(cell).toContain('type="number"')
    expect(cell).toContain('value="10600"')
    expect(cell).toMatch(/aria-label="[^"]*Professionals[^"]*2026 Q2/)
    const b = judgeView({ t, state: judgeState({ scen: 'B' }), data: { report: initial.data, now: NOW.getTime() } })
    expect(b).toMatch(/<input[^>]*id="demoFactor"[^>]*value="1.8"/)
    expect(b).toContain('<label for="demoFactor"')
    expect(b).toContain('aria-pressed="true"')
    expect(html).toContain(t('rdJudgeSynthetic'))
    expect(html).toContain(t('rdJudgeExpires', { minutes: 120 }))
    clean(html)
  })

  it('Scenario A report: manifest ids, changed observation, classification with rule text (R16), affected entities, no rankings', () => {
    const r = afterA.data
    const html = judgeView({ t, state: judgeState(), data: { report: r, now: NOW.getTime() } })
    expect(html).toContain(t('rdJudgeDiff'))
    expect(html).toContain(r.manifests.before)
    expect(html).toContain(r.manifests.after)
    expect(html).toContain('10,600')
    expect(html).toContain('11,400')
    const changed = r.changedSignals.find((c) => c.signalId === 'dosm:masco2020:2')
    expect(changed).toBeTruthy()
    // Rule text formatted in the browser per R16 (pp 2 dp, percent 1 dp), never the server's English text.
    const after = changed.details.after
    expect(after.rule?.key).toMatch(/^rdRuleDosm/)
    const rule = ruleText(after.rule, t)
    expect(rule).toContain(`${after.rule.vars.pp.toFixed(2)} pp`)
    expect(unesc(html)).toContain(rule)
    expect(html).toContain(t(`rdDir_${after.direction}`))
    expect(html).toContain(t('rdJudgeAffected'))
    expect(unesc(html)).toContain(r.affected.groups[0].name)
    expect(html).toContain(t('rdJudgeSkills'))
    expect(html).toContain(t('rdNoRankings'))
    clean(html)
  })

  it('Scenario B report: the possible break added and the comparisons that became insufficient', () => {
    const r = afterB.data
    expect(r.breaks.added.length).toBeGreaterThan(0)
    const html = judgeView({ t, state: judgeState({ scen: 'B' }), data: { report: r, now: NOW.getTime() } })
    expect(html).toContain(t('rdJudgeBreaksAdded'))
    expect(html).toContain(t('rdJudgePossibleBreak'))
    expect(html).toContain(r.breaks.added[0].period)
    expect(html).toContain(t('rdJudgeInsufficient'))
    expect(r.insufficientComparisons.length).toBeGreaterThan(0)
    expect(unesc(html)).toContain(r.insufficientComparisons[0].entity.name)
    expect(html).toContain(t('rdIce'))
    expect(html).toContain(t('rdNoRankings'))
    clean(html)
  })

  it('a refused edit shows the validation code and keeps the last state; reset restores the base', async () => {
    const out = await judge.apply({ scenario: 'A', edits: [{ entityId: 'masco2020:2', period: '2026 Q2', value: -5 }] })
    expect(out).toMatchObject({ ok: false, code: 'validation_failed' })
    expect(out.errors.length).toBeGreaterThan(0)
    const html = judgeView({ t, state: judgeState({ msgs: { judge: { kind: 'bad', code: out.code, errors: out.errors } } }), data: { report: afterB.data, now: NOW.getTime() } })
    expect(html).toContain(t('rdErr_validation_failed'))
    expect(html).toContain(t('rdJudgeKept'))
    expect(html).toContain(`<code>${out.errors[0].code}</code>`)
    const reset = await judge.reset()
    expect(reset.ok).toBe(true)
    expect(reset.data.manifests.after).toBe('demo-manifest-0')
    const after = judgeView({ t, state: judgeState(), data: { report: reset.data, now: NOW.getTime() } })
    expect(after).toContain(t('rdJudgeNoChange'))
    expect(after).toContain(t('rdNoRankings'))
  })

  it('collects only changed cells as edits (Scenario A)', () => {
    // judgeEdits is the pure helper the app uses to turn the inputs into edits.
    return import('../../public/js/screens/radarAdmin.js').then(({ judgeEdits }) => {
      const report = initial.data
      const edits = judgeEdits(report, [['2|2026 Q2', '11400'], ['1|2026 Q2', String(report.current.dosm.groups['1'].values.at(-1))], ['3|2026 Q1', '']])
      expect(edits).toEqual([{ entityId: 'masco2020:2', period: '2026 Q2', value: 11400 }])
      expect(judgeEdits(report, [['2|2026 Q2', '12.5x']])).toEqual([{ entityId: 'masco2020:2', period: '2026 Q2', value: Number.NaN }])
    })
  })
})

describe('escaping', () => {
  it('every interpolated value is escaped (admin and judge)', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    const data = await adminData()
    const d = structuredClone(data)
    d.mappings.mappings[0].reason.en = evil
    d.mappings.mappings[0].mappingId = evil
    d.breaks.breaks[0].period = evil
    d.status.log = [{ time: '2026-10-31T00:00:00Z', source: evil, operation: evil, outcome: evil, code: evil, ids: { manifestId: evil } }]
    d.status.orphans = [evil]
    d.mappings.reviews = [{ reviewId: 'r1', kind: 'field_topic', target: evil, decision: 'approved', note: evil, reviewer: evil, reviewedAt: '2026-10-31T00:00:00Z', evidence: [] }]
    d.public = { ...d.public, occ: { ...d.public.occ, listingTitle: evil } }
    const html = adminView({ t, state: adminState({ msgs: { status: { kind: 'bad', code: evil } }, exported: { evil } }), data: d })
    expect(html).not.toContain('<img')
    const r = structuredClone(afterB.data)
    r.label = evil
    r.observations = [{ sourceId: 'dosm', entityId: evil, period: evil, old: 1, new: 2 }]
    r.affected.groups[0].name = evil
    r.insufficientComparisons[0].entity.name = evil
    r.breaks.added[0].period = evil
    r.manifests.after = evil
    r.current.dosm.groups['2'].name = evil
    const j = judgeView({ t, state: judgeState({ msgs: { judge: { kind: 'bad', code: 'validation_failed', errors: [{ code: evil, path: evil }] } } }), data: { report: r, now: NOW.getTime() } })
    expect(j).not.toContain('<img')
  })
})

describe('the public Radar after an admin decision (acceptance note N2)', () => {
  it('staleRadar drops the loaded data (so #radar loads again) and keeps the view choices', () => {
    const before = { tab: 'ai', mode: 'share', hidden: ['robotics'], all: { sk: true }, devStore: true, data: publicData, open: { kind: 'axis', id: 'language' }, signal: { signalId: 'x' }, newerManifestId: 'm-2', gone: true, error: 'network', loading: true }
    const after = staleRadar(before)
    expect(after).toMatchObject({ tab: 'ai', mode: 'share', hidden: ['robotics'], all: { sk: true }, devStore: true })
    expect(after).toMatchObject({ data: null, open: null, signal: null, newerManifestId: null, gone: false, error: null, loading: false })
    expect(staleRadar(undefined)).toMatchObject({ data: null, loading: false })
  })

  it('every successful admin decision, refresh and clean-up marks the Radar stale; loads cannot land after that', () => {
    const app = readFileSync('public/js/app.js', 'utf8')
    const body = (name) => {
      const start = app.indexOf(`  ${name}: async`)
      expect(start, name).toBeGreaterThan(0)
      return app.slice(start, app.indexOf('\n  },', start))
    }
    for (const name of ['admMap', 'admBreak', 'admRefresh', 'admCleanup']) expect(body(name), name).toContain('radarStale()')
    // A failed mapping or break decision leaves the Radar as it is (nothing changed on the server).
    for (const name of ['admMap', 'admBreak']) {
      const b = body(name)
      expect(b.indexOf('radarStale()'), name).toBeGreaterThan(b.indexOf('if (!out.ok)'))
    }
    const stale = app.slice(app.indexOf('function radarStale()'), app.indexOf('\n}', app.indexOf('function radarStale()')))
    expect(stale).toContain('staleRadar(')
    // A load still on its way when the data went stale is dropped (it may hold the data from before the decision).
    expect(app).toMatch(/async function loadRadar\([^)]*\) \{\r?\n\s+const run = \+\+radarRun/)
    expect(app).toMatch(/if \(run !== radarRun\) return/)
    // ensureRadar loads again once the data was dropped.
    expect(app).toMatch(/function ensureRadar\(\) \{[^}]*!r\.data && !r\.loading/)
  })

  it('a mapping decision publishes no manifest of its own, yet a fresh load returns the decided references', async () => {
    const out = await admin.decideMapping({ mappingId: '06-language', decision: 'approved', note: 'N2 check.' })
    expect(out.ok).toBe(true)
    // What #radar showed before the decision: the proposal still pending.
    expect(publicData.refs.fieldTopics.find((m) => m.mappingId === '06-language')?.reviewStatus ?? 'pending').not.toBe('approved')
    const fresh = await radarApi.load(undefined, { base })
    expect(fresh.ok).toBe(true)
    expect(fresh.data.refs.fieldTopics.find((m) => m.mappingId === '06-language').reviewStatus).toBe('approved')
  })
})

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
