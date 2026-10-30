// Future Skills Radar screen (spec §11, §12, D2, D3, D18, D21, D22; test plan 29; Review Focus 3 and 4).
// Render functions are tested on real answers from the public API (bundled data, real server on port 0).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createRadarService } from '../../server/radar/service.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import * as radarApi from '../../public/js/radarApi.js'
import { aiTab, radarView, skillsTab, statusCards } from '../../public/js/screens/radar.js'
import { evidencePanel, ruleVars } from '../../public/js/components/evidencePanel.js'
import { t as translate } from '../../shared/i18n.js'
import { esc as esc_ } from '../../public/js/ui.js'

const t = (key, vars) => translate('en', key, vars)
const BUNDLE_ACTIVE = 'manifest-20261030T113958.380Z-ebe71e1d'
const BUNDLE_OLDER = 'manifest-20261030T073351.495Z-2c6bf0d6'

let server
let base
let data
beforeAll(async () => {
  const references = await loadRadarReferences('data')
  const radar = createRadarService({ store: null, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor: null, now: () => new Date('2026-10-31T00:00:00Z') })
  server = createApp({ radar, d1: null, tempStore: null, llmProviders: [], onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  const out = await radarApi.load(undefined, { base })
  expect(out.ok).toBe(true)
  data = out.data
})
afterAll(() => new Promise((resolve) => server.close(resolve)))

const profile = (extra = {}) => ({
  profileStatus: 'confirmed', education: { records: [] }, employment: { records: [] }, preferences: { careerInterests: [] }, occupationMappings: [], ...extra,
})
const ownProfile = () => profile({
  education: { records: [{ field: { source: 'isced', code: '0613', title: 'Software and applications development and analysis' } }] },
  occupationMappings: [{ term: 'developer', kind: 'interest', chosen: { source: 'emasco', code: '2512-01', title: 'Software Developer', url: 'https://emasco.mohr.gov.my/masco/2512-01' } }],
})
// The bundled references have no approved field-topic link yet: tests add one owner decision (approved at narrow level).
const linked = () => ({ ...data, refs: { ...data.refs, fieldTopics: [{ mappingId: 'm-061-language', iscedCode: '061', axisId: 'language', reviewStatus: 'approved' }] } })
const view = (prof, radar = {}, d = linked()) => radarView({ t, state: { lang: 'en', profile: prof, radar }, data: d })
const ctx = (prof, radar = {}, d = linked()) => ({ t, state: { lang: 'en', profile: prof, radar }, data: d })
const groupName = (code) => data.occ.groups.find((g) => g.code === code).name
const count = (s, re) => (s.match(re) || []).length
const afterLast = (html, needle) => html.slice(html.lastIndexOf(needle))
// One card of a tab, from its data-sec marker to the next one.
function section(html, id) {
  const start = html.indexOf(`data-sec="${id}"`)
  const next = html.indexOf('data-sec=', start + 10)
  return html.slice(start, next < 0 ? undefined : next)
}
// Every number (rd-num) is followed directly by its https source link; there is at least one number.
function expectNumbersLinked(html) {
  const nums = [...html.matchAll(/<span class="rd-num">[^<]*<\/span>(.{0,40})/g)]
  expect(nums.length).toBeGreaterThan(0)
  for (const m of nums) expect(m[1]).toMatch(/^ <a href="https:\/\//)
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const lineLabels = (html) => unesc(html.match(/<svg class="rd-lines"[^>]*aria-label="([^"]*)"/)[1])

describe('Radar screen', () => {
  it('Skills & Careers is the first tab and is selected and shown by default (D21)', () => {
    const html = view(ownProfile())
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0])
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toContain('data-arg="sk"')
    expect(tabs[0]).toContain('aria-selected="true"')
    expect(tabs[1]).toContain('data-arg="ai"')
    expect(tabs[1]).toContain('aria-selected="false"')
    expect(html.indexOf(t('rdTabSK'))).toBeLessThan(html.indexOf(t('rdTabAI')))
    expect(html).toContain(t('rdB1Title'))
    expect(html).not.toContain(t('rdA2Title'))
  })

  it('default shows only the profile own fields; View all is the last element of each tab', () => {
    const sk = skillsTab(ctx(ownProfile()))
    const b1 = section(sk, 'B1')
    expect(b1).toContain(groupName('2'))
    for (const code of ['1', '3', '4', '5', '6', '7', '8', '9']) expect(b1, code).not.toContain(groupName(code))
    expect(unesc(section(sk, 'B2'))).toContain(t('rdAxis_language'))
    expect(sk).not.toContain(t('rdAxis_robotics'))
    const ai = aiTab(ctx(ownProfile()))
    // The radar draws all six axes (global evidence) and highlights the user's; the line chart and summary are own only.
    expect(ai).toContain('class="rd-radar"')
    expect(lineLabels(ai)).toBe(t('rdAxis_language'))
    for (const html of [sk, ai]) {
      const tail = afterLast(html, 'data-act="viewAll"')
      expect(tail).not.toContain('class="card')
      expect(tail).not.toContain('<h2')
      expect(count(html, /data-act="viewAll"/g)).toBe(1)
      expect(html).toContain(t('rdViewAll'))
    }
    const all = skillsTab(ctx(ownProfile(), { all: { sk: true } }))
    for (const code of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) expect(section(all, 'B1'), code).toContain(groupName(code))
    expect(all).toContain(t('rdViewMine'))
    expect(afterLast(all, 'data-act="viewAll"')).not.toContain('class="card')
    const allAi = aiTab(ctx(ownProfile(), { all: { ai: true } }))
    expect(lineLabels(allAi)).toContain(t('rdAxis_robotics'))
  })

  it('every number in both tabs sits next to a link (count <a href> ≥ count of numeric cells)', () => {
    for (const [prof, radar] of [[ownProfile(), {}], [null, {}], [ownProfile(), { all: { sk: true, ai: true } }], [ownProfile(), { mode: 'share' }]]) {
      for (const html of [skillsTab(ctx(prof, radar)), aiTab(ctx(prof, radar))]) {
        const nums = count(html, /class="rd-num"/g)
        expect(nums).toBeGreaterThan(0)
        expect(count(html, /<a href="https?:\/\//g)).toBeGreaterThanOrEqual(nums)
        // each number is followed directly by its source link
        expectNumbersLinked(html)
        // every numeric table cell holds a linked number
        for (const cell of html.match(/<td class="num">.*?<\/td>/g) ?? []) expect(cell).toMatch(/<a href="https?:\/\//)
      }
    }
  })

  it('source links in the B1 source line and the evidence panel lists may wrap on a phone (F1, spec §15)', () => {
    const css = readFileSync('public/styles.css', 'utf8')
    // The rule that lets a source link wrap: in the source lines and in the evidence panel lists.
    const rule = css.match(/([^}]*)\{[^}]*white-space:normal;overflow-wrap:anywhere[^}]*\}/g)?.find((r) => r.includes('.rd-srcline .rd-src')) ?? ''
    expect(rule).toContain('.rd-srcline .rd-src')
    expect(rule).toContain('.rd-drawer .rd-list .rd-src')
    expect(rule).toContain('.rd-drawer .rd-kv .rd-src')
    // Short tag layouts elsewhere (a number next to its link in a table) keep the link on one line.
    expect(css).toMatch(/\.rd-src\{[^}]*white-space:nowrap/)
    // The B1 source link sits in the wrapping source line.
    const b1 = section(skillsTab(ctx(ownProfile())), 'B1')
    const line = b1.match(/<p class="[^"]*\brd-srcline\b[^"]*">.*?<\/p>/s)?.[0] ?? ''
    expect(line).toMatch(/<a href="https:\/\/[^"]+"[^>]*class="rd-src"/)
    // The evidence panel's source links sit in .rd-list / .rd-kv inside the drawer.
    const panel = evidencePanel(data.occ.groups.find((g) => g.code === '2').signal, t)
    expect(panel).toMatch(/<ul class="rd-list">(?:(?!<\/ul>).)*class="rd-src"/s)
  })

  it('DOSM interim: ICE status with reason, latest shares and counts, and the context-only total change (D18)', () => {
    const sk = skillsTab(ctx(null))
    expect(sk).toContain(t('rdIce'))
    expect(sk).toContain(t('rdIceReason', { period: '2025 Q3', next: '2026 Q3' }))
    expect(sk).toContain(t('rdLatestShare'))
    expect(sk).toContain(t('rdLatestCount'))
    expect(sk).toContain('51.47%')
    expect(sk).toContain('285,907')
    expect(sk).toContain('86,512')
    expect(sk).toContain(t('rdContextLabel'))
    expect(sk).toContain('−11.4%')
    // no direction is shown while comparisons are insufficient
    expect(sk).not.toContain(`· ${t('rdDir_rising')}`)
    expect(sk).not.toContain(`· ${t('rdDir_declining')}`)
  })

  it('no profile → global view with the add-your-field hint', () => {
    const html = view(null)
    expect(html).toContain(t('rdAddProfile'))
    const sk = skillsTab(ctx(null))
    for (const g of data.occ.groups) expect(sk).toContain(g.name)
    const ai = aiTab(ctx(null))
    const lines = lineLabels(ai)
    for (const id of ['language', 'genmedia', 'vision', 'robotics', 'automation', 'service']) expect(lines).toContain(t(`rdAxis_${id}`))
    expect(ai).toContain(t('rdAddProfile'))
    // an unconfirmed draft is not used either
    expect(view({ ...ownProfile(), profileStatus: 'draft' })).toContain(t('rdAddProfile'))
  })

  it('field without approved links → rdNoFieldLinks, radar still drawn', () => {
    const prof = profile({ education: { records: [{ field: { source: 'isced', code: '0613', title: 'x' } }] } })
    const ai = aiTab(ctx(prof, {}, data))
    expect(ai).toContain(t('rdNoFieldLinks'))
    expect(ai).toContain('class="rd-radar"')
    expect(skillsTab(ctx(prof, {}, data))).toContain(t('rdNoFieldLinks'))
    // a broad approval with a detailed rejection on the same axis: not linked (effectiveFieldTopics in the browser)
    const rejected = { ...data, refs: { ...data.refs, fieldTopics: [
      { mappingId: 'a', iscedCode: '06', axisId: 'language', reviewStatus: 'approved' },
      { mappingId: 'b', iscedCode: '0613', axisId: 'language', reviewStatus: 'rejected' },
    ] } }
    expect(aiTab(ctx(prof, {}, rejected))).toContain(t('rdNoFieldLinks'))
    const approved = aiTab(ctx(prof, {}, linked()))
    expect(approved).not.toContain(t('rdNoFieldLinks'))
    expect(approved).toContain(t('rdLevel_narrow'))
  })

  it('manifest_gone → reload offer', async () => {
    expect(await radarApi.load('manifest-nope', { base })).toEqual({ reload: true })
    expect(await radarApi.signal('openalex:T10028', 'manifest-nope', { base })).toEqual({ reload: true })
    const html = radarView({ t, state: { lang: 'en', profile: null, radar: { gone: true } }, data: null })
    expect(html).toContain(t('rdErr_manifest_gone'))
    expect(html).toContain('data-act="reloadManifest"')
  })

  it('a newer active manifest than the one shown → "New data available — reload"', async () => {
    const older = await radarApi.load(BUNDLE_OLDER, { base })
    expect(older.ok).toBe(true)
    expect(older.data.manifestId).toBe(BUNDLE_OLDER)
    expect(older.data.activeManifestId).toBe(BUNDLE_ACTIVE)
    const html = radarView({ t, state: { lang: 'en', profile: ownProfile(), radar: {} }, data: older.data })
    expect(html).toContain(t('rdNewData'))
    expect(html).toContain('data-act="reloadManifest"')
    expect(html).not.toMatch(/\bnull\b|NaN|undefined/)
    expect(view(ownProfile())).not.toContain(t('rdNewData'))
    // a follow-up call that learns of a newer manifest also shows it
    expect(radarView({ t, state: { lang: 'en', profile: null, radar: { newerManifestId: 'manifest-newer' } }, data })).toContain(t('rdNewData'))
    const sig = await radarApi.signal('openalex:T10028', BUNDLE_ACTIVE, { base })
    expect(sig.ok).toBe(true)
    expect(sig.signal.signalId).toBe('openalex:T10028')
    expect(sig.activeManifestId).toBe(BUNDLE_ACTIVE)
  })

  it('B2 shows three separate columns; the first is O*NET skills in US job ads', () => {
    const sk = skillsTab(ctx(ownProfile()))
    const cols = sk.match(/<div class="rd-col[^"]*"[\s\S]*?<\/div><!--col-->/g)
    expect(cols).toHaveLength(3)
    expect(unesc(cols[0])).toContain(t('rdColOnet'))
    expect(t('rdColOnet')).toBe('Skills in job ads (US, O*NET)')
    expect(cols[1]).toContain(t('rdColProxy'))
    expect(cols[1]).toContain(t('rdColProxyNote'))
    expect(cols[2]).toContain(t('rdColAi'))
    expect(cols[2]).toContain(t('rdColAiNote'))
  })

  it('a comparable DOSM change is drawn as a diverging bar with its pp text label and direction word', () => {
    const d = linked()
    const groups = d.occ.groups.map((g) => (g.code !== '2' ? g : { ...g, signal: { ...g.signal, evidenceSufficiency: 'sufficient', evidenceQuality: 'moderate', direction: 'rising', reasons: [], rule: { key: 'rdRuleDosmRising', vars: { pp: 1.5, relativePercent: 11, agree: 2, clean: 3, materialPp: 1, materialRelativePercent: 10 } } } }))
    const sk = skillsTab(ctx(ownProfile(), {}, { ...d, occ: { ...d.occ, groups } }))
    expect(sk).toContain('class="rd-div"')
    expect(sk).toContain(`+5.67 ${t('rdPpUnit')} · ${t('rdDir_rising')}`)
    expect(sk).not.toContain(t('rdIce'))
    // all insufficient: the bars would only repeat the status column, so only the table is shown
    expect(skillsTab(ctx(ownProfile()))).not.toContain('class="rd-div"')
  })

  it('Continue to My Career Matches goes to match (next-module placeholder)', () => {
    const sk = skillsTab(ctx(ownProfile()))
    expect(sk).toMatch(new RegExp(`<button[^>]*data-go="match"[^>]*>${t('rdB6Next')}</button>`))
    expect(sk).toContain(t('rdNoRankings'))
  })

  it('never renders "null", "NaN" or "undefined"', () => {
    const shown = [
      view(ownProfile()), view(null), view(ownProfile(), { tab: 'ai' }), view(ownProfile(), { tab: 'ai', mode: 'share', all: { ai: true } }),
      view(ownProfile(), { all: { sk: true } }), view(ownProfile(), { open: { kind: 'group', id: '2' } }), view(ownProfile(), { open: { kind: 'axis', id: 'vision' } }),
      radarView({ t, state: { lang: 'en', profile: null, radar: { loading: true } }, data: null }),
      radarView({ t, state: { lang: 'en', profile: null, radar: { error: 'network' } }, data: null }),
    ]
    for (const s of data.ai.axes.map((a) => a.signal).concat(data.occ.groups.map((g) => g.signal))) shown.push(evidencePanel(s, t))
    for (const html of shown) expect(html).not.toMatch(/\bnull\b|NaN|undefined/)
  })

  it('every interpolated value is escaped', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const d = linked()
    const bad = {
      ...d,
      occ: { ...d.occ, groups: d.occ.groups.map((g) => ({ ...g, name: evil, signal: { ...g.signal, entity: { ...g.signal.entity, name: evil } } })) },
      ai: { ...d.ai, axes: d.ai.axes.map((a) => ({ ...a, officialTitle: evil, description: evil })) },
    }
    const prof = profile({
      education: { records: [{ field: { source: 'isced', code: '0613', title: evil } }] },
      occupationMappings: [{ kind: 'interest', term: evil, chosen: { source: 'emasco', code: '2512-01', title: evil } }],
      preferences: { careerInterests: [evil] },
    })
    for (const radar of [{}, { tab: 'ai' }, { open: { kind: 'group', id: '2' } }, { open: { kind: 'axis', id: 'language' } }, { all: { sk: true, ai: true } }]) {
      const html = radarView({ t, state: { lang: 'en', profile: prof, radar }, data: bad })
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;img src=x')
    }
  })
})

describe('evidence panel (spec §11.5, ruling R16/R18)', () => {
  it('DOSM ICE signal: rule text with the break period, values, thresholds, breaks and every link', () => {
    const s = data.occ.groups.find((g) => g.code === '2').signal
    const html = evidencePanel(s, t)
    expect(html).toContain(t('rdRuleDosmBreak', { breakPeriods: '2025 Q3' }))
    expect(html).toContain(t('rdIce'))
    expect(html).toContain('2025 Q2')
    expect(html).toContain('2026 Q2')
    expect(html).toContain('51.47')
    // the comparison straddles the break: no year-on-year change and no baseline share are shown (D18)
    expect(html).toContain(t('rdNotCompared'))
    expect(html).not.toContain('+5.67')
    expect(html).not.toContain('45.80')
    expect(html).toContain(t('rdBreak_unreviewed'))
    expect(html).toContain(s.manifestId)
    for (const l of s.evidenceLinks) expect(html).toContain(`href="${l.url.replace(/&/g, '&amp;')}"`)
    expect(count(html, /<a href="https?:\/\//g)).toBeGreaterThanOrEqual(count(html, /class="rd-num"/g))
  })

  it('OpenAlex signal: rounded rule text, formula with the numbers filled in, steps', () => {
    const s = data.ai.axes.find((a) => a.axisId === 'language').signal
    const html = evidencePanel(s, t)
    expect(html).toContain(t('rdRuleRising', { ratio: '3.17', limit: '1.25', agree: '3' }))
    expect(html).not.toContain('3.1700466')
    expect(html).toContain('clamp(50 + 20 × log2(25,167 ÷ 7,939), 0, 100) = 83.3')
    expect(html).toContain(t('rdEvSteps'))
    expect(html).toContain('+0.47')
  })

  it('rule vars are formatted before t(): pp 2 dp, percent 1 dp, ratio 2 dp, null → —, arrays joined', () => {
    expect(ruleVars({ key: 'rdRuleDosmRising', vars: { pp: 5.66547, relativePercent: 12.3694, agree: 2, clean: 3, materialPp: 1, materialRelativePercent: 10 } }))
      .toEqual({ pp: '5.67', relativePercent: '12.4', agree: '2', clean: '3', materialPp: '1.00', materialRelativePercent: '10.0' })
    expect(ruleVars({ key: 'rdRuleStable', vars: { ratio: 1.0449, rising: 1.25, declining: 0.8 } })).toEqual({ ratio: '1.04', rising: '1.25', declining: '0.80' })
    expect(ruleVars({ key: 'rdRuleDosmBreak', vars: { breakPeriods: ['2025 Q3', '2026 Q1'] } })).toEqual({ breakPeriods: '2025 Q3, 2026 Q1' })
    expect(ruleVars({ key: 'rdRuleDosmMixedSteps', vars: { pp: null, relativePercent: undefined, agree: 1, clean: 2 } })).toEqual({ pp: '—', relativePercent: '—', agree: '1', clean: '2' })
    expect(ruleVars({ key: 'rdRuleMixedVolatility', vars: { ratio: 1.1, volatility: 17.97, high: 16 } })).toEqual({ ratio: '1.10', volatility: '18.0', high: '16.0' })
    expect(ruleVars({ key: 'rdRuleDosmMixedVolatility', vars: { pp: 0.4, volatility: 1.8512, high: 1.75 } })).toEqual({ pp: '0.40', volatility: '1.85', high: '1.75' })
  })
})

describe('development store banner (spec §7)', () => {
  it('the bundled read-only data shows no banner; a development store answer does', () => {
    expect(data.devStore).toBe(false)
    expect(view(ownProfile())).not.toContain(t('rdDevStore'))
    expect(view(ownProfile(), {}, { ...linked(), devStore: true })).toContain(t('rdDevStore'))
  })

  it('stays up while loading, after an error and after manifest_gone, once the server has reported devStore', () => {
    for (const radar of [{ loading: true }, { error: 'store_unavailable' }, { gone: true }]) {
      expect(radarView({ t, state: { lang: 'en', radar: { ...radar, devStore: true } }, data: null }), JSON.stringify(radar)).toContain(t('rdDevStore'))
      expect(radarView({ t, state: { lang: 'en', radar }, data: null })).not.toContain(t('rdDevStore'))
    }
  })

  it('a development store server answers devStore on the public manifest and every Radar answer', async () => {
    const references = await loadRadarReferences('data')
    const store = createMemoryStore()
    const radar = createRadarService({ store, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor: null, now: () => new Date('2026-10-31T00:00:00Z'), devStore: true, log: () => {} })
    const dev = createApp({ radar, d1: null, tempStore: null, llmProviders: [], onetLive: null }).listen(0)
    await new Promise((resolve) => dev.once('listening', resolve))
    try {
      const devBase = `http://127.0.0.1:${dev.address().port}`
      expect(await radarApi.storeInfo({ base: devBase })).toEqual({ ok: true, devStore: true })
      const out = await radarApi.load(undefined, { base: devBase })
      expect(out.data.devStore).toBe(true)
      expect(radarView({ t, state: { lang: 'en', radar: {} }, data: out.data })).toContain(t('rdDevStore'))
      expect(await radarApi.storeInfo({ base })).toEqual({ ok: true, devStore: false })
    } finally {
      await new Promise((resolve) => dev.close(resolve))
    }
  })
})

describe('B2 O*NET skills column (skill-trends spec §6, D23–D27)', () => {
  const firstCol = (html) => html.match(/<div class="rd-col[^"]*"[\s\S]*?<\/div><!--col-->/g)[0]
  const onetJob = (code, title, kind = 'job') => ({ term: title, kind, chosen: { source: 'onet', code, title } })
  const devProfile = (skills = []) => profile({ occupationMappings: [onetJob('15-1252.00', 'Software Developers')], skills })
  const col = (prof, radar = {}, d = linked()) => firstCol(skillsTab(ctx(prof, radar, d)))
  // The part of a job block between two headings.
  const between = (html, from, to) => {
    const a = html.indexOf(from)
    const b = html.indexOf(to, a + from.length)
    return a < 0 ? '' : html.slice(a, b < 0 ? undefined : b)
  }

  it('own O*NET job: Go under Newly in demand, dropped skills under No longer in demand; other jobs not shown', () => {
    const c = col(devProfile())
    expect(c).toContain('15-1252.00')
    const added = between(c, t('rdSkAdded'), t('rdSkDropped'))
    expect(added).toContain('>Go<')
    const dropped = between(c, t('rdSkDropped'), '<details>')
    expect(dropped).toContain('Microsoft .NET Framework')
    expect(dropped).not.toContain('>Go<')
    expect(c).not.toContain('13-2011.00')
    expect(c).not.toContain('Accounting software')
  })

  it('Still in demand is a collapsed list (reference data, D26)', () => {
    const c = col(devProfile())
    const kept = c.match(/<details(?![^>]*\bopen\b)[^>]*>\s*<summary>[^<]*Still in demand[\s\S]*?<\/details>/)
    expect(kept).toBeTruthy()
    expect(kept[0]).toContain('Apache Kafka')
  })

  it('"On your profile" only for a skill with the official id; a typed name never matches (Review Focus 5)', () => {
    expect(t('rdOnProfile')).toBe('On your profile')
    const tagged = col(devProfile([{ name: 'Go', canonicalId: 'onet:tech:go' }]))
    expect(between(tagged, t('rdSkAdded'), t('rdSkDropped'))).toContain(t('rdOnProfile'))
    const typed = col(devProfile([{ name: 'Go', canonicalId: null }]))
    expect(typed).not.toContain(t('rdOnProfile'))
  })

  it('eMASCO job: no official link to O*NET (D27)', () => {
    expect(t('rdSkNoOnetLink')).toBe('No official link to O*NET: skill list not available')
    const c = col(ownProfile())
    expect(c).toContain('2512-01')
    expect(unesc(c)).toContain(t('rdSkNoOnetLink'))
  })

  it('an O*NET job with no flagged rows is listed with "No skills flagged" (Review Focus 1)', () => {
    expect(data.skills.changes['25-1199.00']).toBeUndefined()
    const prof = profile({ occupationMappings: [onetJob('25-1199.00', 'Postsecondary Teachers, All Other')] })
    const c = col(prof)
    expect(c).toContain('25-1199.00')
    expect(c).toContain(esc_(t('rdSkNoFlags')))
  })

  it('heading names both releases with months and the release that left the flags unchanged', () => {
    const c = unesc(col(devProfile()))
    for (const s of ['30.2', '30.3', '31.0', 'Feb 2026', 'May 2026']) expect(c, s).toContain(s)
    expect(c).toContain(t('rdSkHeading', { previous: '30.2', previousMonth: 'Feb 2026', current: '30.3', currentMonth: 'May 2026', same: '31.0' }))
  })

  it('both labels, the Hot Technologies list and the US job ads table with the first-snapshot note', () => {
    const c = unesc(col(devProfile()))
    expect(t('rdSkLabelUs')).toBe('US job ads (Lightcast via O*NET), not Malaysian')
    expect(t('rdSkLabelSoftware')).toBe('Software and technology skills only')
    expect(c).toContain(t('rdSkLabelUs'))
    expect(c).toContain(t('rdSkLabelSoftware'))
    expect(c).toContain(t('rdSkHot'))
    expect(c).toContain('Prometheus')
    expect(c).toContain(t('rdSkPostings', { year: '2025' }))
    expect(c).toContain(t('rdSkFirstSnapshot'))
    expect(c).toContain('3,421,542')
    expect(c).toContain('https://www.onetonline.org/search/hot_tech/')
    expect(c).toContain('https://www.onetonline.org/link/summary/15-1252.00')
  })

  it('every link in the column is https and every number has its link', () => {
    for (const prof of [devProfile(), null, ownProfile()]) {
      for (const radar of [{}, { all: { sk: true } }]) {
        const c = col(prof, radar)
        const hrefs = [...c.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
        expect(hrefs.length).toBeGreaterThan(0)
        for (const h of hrefs) expect(h).toMatch(/^https:\/\//)
        expectNumbersLinked(c)
      }
    }
  })

  const blocks = (html, kind) => [...html.matchAll(/data-block="(\w+)"[\s\S]*?<!--block-->/g)].filter((m) => m[1] === kind).map((m) => m[0])
  const LABELS = () => [t('rdSkLabelUs'), t('rdSkLabelSoftware')]

  it('both labels sit inside every block: own job card, Hot list, postings, every View all job card', () => {
    const c = unesc(col(devProfile()))
    for (const kind of ['job', 'hot', 'postings']) {
      const list = blocks(c, kind)
      expect(list.length, kind).toBeGreaterThan(0)
      for (const b of list) for (const l of LABELS()) expect(b, kind).toContain(l)
    }
    const all = unesc(col(devProfile(), { all: { sk: true } }))
    const cards = blocks(all, 'alljob')
    expect(cards.length).toBe(Object.values(data.skills.changes).filter((v) => v.added.length + v.dropped.length).length)
    for (const b of cards) for (const l of LABELS()) expect(b).toContain(l)
  })

  it('every item shows its release and month next to its source link; postings rows show the window', () => {
    const c = unesc(col(devProfile()))
    const date = 'O*NET 30.3 · May 2026'
    for (const kind of ['job', 'hot']) {
      const items = blocks(c, kind).flatMap((b) => b.match(/<li>[\s\S]*?<\/li>/g) ?? [])
      expect(items.length, kind).toBeGreaterThan(0)
      for (const li of items) expect(li, kind).toMatch(new RegExp(`${reEsc(date)} <a href="https://`))
    }
    const kept = blocks(c, 'job')[0].match(/<details>[\s\S]*?<\/details>/)[0]
    expect(kept).toContain(date)
    const cells = blocks(c, 'postings')[0].match(/<td class="num">[\s\S]*?<\/td>/g)
    expect(cells.length).toBeGreaterThan(10)
    for (const cell of cells) expect(cell).toMatch(/<a href="https:\/\/[^"]*"[^>]*>[^<]*1\/25–12\/25<\/a>/)
    for (const b of blocks(unesc(col(devProfile(), { all: { sk: true } })), 'alljob')) expect(b).toMatch(new RegExp(`${reEsc(date)} <a href="https://`))
  })

  it('View all job cards use the O*NET title from the skills answer', () => {
    const codes = Object.entries(data.skills.changes).filter(([, v]) => v.added.length + v.dropped.length)
    const all = col(devProfile(), { all: { sk: true } })
    for (const [code, v] of codes) {
      expect(v.title, code).toBeTruthy()
      expect(all, code).toContain(`<b>${esc_(v.title)}</b>`)
    }
    const item = { example: 'Go', skillId: 'onet:tech:go', elementName: null }
    const d = { ...linked(), skills: { ...data.skills, changes: { '99-0000.00': { title: 'Test Job Title', added: [item], dropped: [], kept: [] } } } }
    expect(col(null, {}, d)).toContain('<b>Test Job Title</b>')
  })

  it('the first-snapshot note follows the posting signals: hidden once a second window exists', () => {
    expect(data.skills.postings.firstSnapshot).toBe(true)
    expect(unesc(col(devProfile()))).toContain(t('rdSkFirstSnapshot'))
    const d = { ...linked(), skills: { ...data.skills, postings: { ...data.skills.postings, firstSnapshot: false } } }
    expect(unesc(col(devProfile(), {}, d))).not.toContain(t('rdSkFirstSnapshot'))
  })

  it('View all lists every job with changes', () => {
    const c = col(devProfile(), { all: { sk: true } })
    expect(c).toContain('13-2011.00')
    expect(c).toContain('Accounting software')
    const withChanges = Object.entries(data.skills.changes).filter(([, v]) => v.added.length + v.dropped.length).map(([code]) => code)
    for (const code of withChanges) expect(c, code).toContain(`O*NET ${code}`)
  })

  it('no profile → global view of every job with changes, with the add-your-profile hint', () => {
    const c = col(null)
    expect(c).toContain(t('rdAddProfile'))
    expect(c).toContain('13-2011.00')
    expect(c).toContain('15-1252.00')
    expect(c).not.toContain(t('rdOnProfile'))
  })

  it('no O*NET data → says so, no crash, no null', () => {
    const d = { ...linked(), skills: { ...data.skills, state: 'unavailable', release: null, changes: {}, hot: { added: [], dropped: [] }, postings: null, sourceLinks: [] } }
    for (const prof of [devProfile(), null]) {
      const c = col(prof, {}, d)
      expect(c).toContain(esc_(t('rdSkUnavailable')))
      expect(c).not.toMatch(/\bnull\b|NaN|undefined/)
    }
    const none = col(devProfile(), {}, { ...linked(), skills: undefined })
    expect(none).toContain(esc_(t('rdSkUnavailable')))
  })

  it('never renders null/undefined and escapes skill names', () => {
    expect(col(devProfile())).not.toMatch(/\bnull\b|NaN|undefined/)
    const evil = '<img src=x onerror=alert(1)>'
    const s = data.skills
    const bad = { ...linked(), skills: { ...s, changes: { '15-1252.00': { added: [{ example: evil, skillId: 'onet:tech:x', elementName: evil }], dropped: [], kept: [] } }, hot: { added: [{ example: evil, skillId: 'x', elementName: null }], dropped: [] }, postings: { ...s.postings, rows: [{ technology: evil, postings: 3 }] } } }
    for (const radar of [{}, { all: { sk: true } }]) {
      const c = col(devProfile(), radar, bad)
      expect(c).not.toContain('<img')
      expect(c).toContain('&lt;img src=x')
    }
  })

  it('BM and 中文: the column texts are translated and the months follow the language', () => {
    for (const lang of ['ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const c = unesc(firstCol(skillsTab({ t: tl, state: { lang, profile: devProfile(), radar: {} }, data: linked() })))
      expect(tl('rdColOnet')).not.toBe(t('rdColOnet'))
      expect(c, lang).toContain(tl('rdColOnet'))
      expect(c, lang).toContain(tl('rdSkLabelUs'))
      expect(c, lang).not.toMatch(/\bnull\b|NaN|undefined/)
    }
    const zh = unesc(firstCol(skillsTab({ t: (k, v) => translate('zh', k, v), state: { lang: 'zh', profile: devProfile(), radar: {} }, data: linked() })))
    expect(zh).toContain('2026年2月')
  })
})

describe('status cards (spec §11.1, §12)', () => {
  it('per source: link, observation period, publication date, last fetch, manifest id and the five dimensions', () => {
    const html = statusCards(data.states, t, { sources: data.sources, manifestId: data.manifestId, ai: data.ai, occ: data.occ })
    for (const dim of ['availability', 'freshness', 'refreshHealth', 'servedFrom', 'comparability']) expect(count(html, new RegExp(t(`rdDim_${dim}`), 'g'))).toBe(2)
    expect(html).toContain('href="https://openalex.org"')
    expect(html).toContain('href="https://www.dosm.gov.my"')
    expect(html).toContain(t('rdServed_bundled_read_only'))
    expect(html).toContain(t('rdHealth_not_configured'))
    expect(html).toContain('2026 Q2')
    expect(html).toContain('2026-08-18')
    // The next DOSM release date is worked out (publication date + one quarter), so it is labelled as an estimate.
    expect(html).toContain(t('rdNextRelease', { date: '2026-11-18' }))
    expect(t('rdNextRelease', { date: 'D' })).toBe('next release D (estimated: quarterly, from the last publication date)')
    expect(html).toContain(data.manifestId)
    expect(html).not.toMatch(/\bnull\b|NaN|undefined/)
  })

  it('the estimated next DOSM release is labelled as an estimate in BM and 中文 too (translations marked for review)', () => {
    for (const lang of ['ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const html = statusCards(data.states, tl, { sources: data.sources, manifestId: data.manifestId, ai: data.ai, occ: data.occ })
      expect(html, lang).toContain(tl('rdNextRelease', { date: '2026-11-18' }))
      expect(tl('rdNextRelease', { date: 'D' }), lang).not.toBe(t('rdNextRelease', { date: 'D' }))
      const line = readFileSync(`shared/strings/${lang}.js`, 'utf8').split('\n').find((l) => l.trimStart().startsWith('rdNextRelease:'))
      expect(line, lang).toContain('// translation: owner review')
    }
    expect(translate('ms', 'rdNextRelease', { date: 'D' })).toMatch(/anggaran/)
    expect(translate('zh', 'rdNextRelease', { date: 'D' })).toMatch(/估计/)
  })
})
