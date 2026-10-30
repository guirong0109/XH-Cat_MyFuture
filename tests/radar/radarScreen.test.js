// Future Skills Radar screen (spec §11, §12, D2, D3, D18, D21, D22; test plan 29; Review Focus 3 and 4).
// Render functions are tested on real answers from the public API (bundled data, real server on port 0).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { createRadarService } from '../../server/radar/service.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import * as radarApi from '../../public/js/radarApi.js'
import { aiTab, radarView, skillsTab, statusCards } from '../../public/js/screens/radar.js'
import { evidencePanel, ruleVars } from '../../public/js/components/evidencePanel.js'
import { t as translate } from '../../shared/i18n.js'

const t = (key, vars) => translate('en', key, vars)
const BUNDLE_ACTIVE = 'manifest-20261030T060700.206Z-b09a0a5b'
const BUNDLE_OLDER = 'manifest-20261030T060700.153Z-fea18e78'

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
        expect(html).not.toMatch(/<span class="rd-num">[^<]*<\/span>(?! <a href="https?:\/\/)/)
        // every numeric table cell holds a linked number
        for (const cell of html.match(/<td class="num">.*?<\/td>/g) ?? []) expect(cell).toMatch(/<a href="https?:\/\//)
      }
    }
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

  it('B2 shows three separate columns; skill demand says insufficient evidence', () => {
    const sk = skillsTab(ctx(ownProfile()))
    const cols = sk.match(/<div class="rd-col[^"]*"[\s\S]*?<\/div><!--col-->/g)
    expect(cols).toHaveLength(3)
    expect(cols[0]).toContain(t('rdColDirect'))
    expect(cols[0]).toContain(t('rdTagNone'))
    expect(cols[0]).toContain(t('rdColDirectNote'))
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
    expect(html).toContain(data.manifestId)
    expect(html).not.toMatch(/\bnull\b|NaN|undefined/)
  })
})
