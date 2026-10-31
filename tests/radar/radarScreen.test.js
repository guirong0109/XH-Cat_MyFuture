// Future Skills Radar screen (spec §11, §12, D2, D3, D18, D21, D22; test plan 29; Review Focus 3 and 4).
// Render functions are tested on real answers from the public API (bundled data, real server on port 0).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { startRadar } from '../helpers/radarData.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createRadarService } from '../../server/radar/service.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import * as radarApi from '../../public/js/radarApi.js'
import { usageText } from '../../shared/radar/profileCharts.js'
import { AI_TASK_IDS } from '../../shared/aiTasks.js'
import { aiTab, radarTabOf, keepCaret, onetSourceCards, pageForRow, pageItems, pageOf, parsePageArg, parsePageList, radarView, skillsChartCard, skillsTab, statusCards, withPage } from '../../public/js/screens/radar.js'
import { evidencePanel, ruleVars } from '../../public/js/components/evidencePanel.js'
import { t as translate } from '../../shared/i18n.js'
import { esc as esc_ } from '../../public/js/ui.js'

const t = (key, vars) => translate('en', key, vars)
const BUNDLE_ACTIVE = 'manifest-20261030T113958.380Z-ebe71e1d'
const BUNDLE_OLDER = 'manifest-20261030T073351.495Z-2c6bf0d6'

let radar
let base
let data
beforeAll(async () => {
  radar = await startRadar()
  ;({ base, data } = radar)
})
afterAll(() => radar.close())

// The AI usage question is answered (skipped) by default, so these tests see the Radar itself, not the question card.
const profile = (extra = {}) => ({
  profileStatus: 'confirmed', education: { records: [] }, employment: { records: [] }, preferences: { careerInterests: [] }, occupationMappings: [], aiTasks: { status: 'skipped', date: '2026-10-31' }, ...extra,
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
const panel = (html) => html.slice(html.indexOf('<section class="rd-tab"'), html.indexOf('</section>', html.indexOf('<section class="rd-tab"')))
const lineLabels = (html) => unesc(html.match(/<svg class="rd-lines"[^>]*aria-label="([^"]*)"/)[1])

describe('Radar screen', () => {
  it('For You is the first tab and is selected and shown by default (D43, D46)', () => {
    const html = view(ownProfile())
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0])
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toContain('data-arg="fy"')
    expect(tabs[0]).toContain('aria-selected="true"')
    expect(tabs[1]).toContain('data-arg="ex"')
    expect(tabs[1]).toContain('aria-selected="false"')
    expect(html).toContain('<span>For You</span>')
    expect(html).toContain('<span>Explore all trends</span>')
    expect(html.indexOf('For You')).toBeLessThan(html.indexOf('Explore all trends'))
  })

  it('has no "Your profile" card, with or without a profile (owner, 31 Oct)', () => {
    for (const prof of [ownProfile(), profile(), null]) {
      const html = view(prof)
      expect(html).not.toContain('rd-profile')
      expect(html).not.toContain('<h2>Your profile</h2>')
      expect(html).not.toContain('nothing personal is sent to the server')
    }
  })

  it('default shows only the profile own fields; View all is the last element of each tab', () => {
    const sk = skillsTab(ctx(ownProfile()))
    const b1 = section(sk, 'B1')
    expect(b1).toContain(groupName('2'))
    for (const code of ['1', '3', '4', '5', '6', '7', '8', '9']) expect(b1, code).not.toContain(groupName(code))
    expect(unesc(section(sk, 'B2'))).toContain(t('rdAxis_language'))
    expect(sk).not.toContain(t('rdAxis_robotics'))
    const ai = aiTab(ctx(ownProfile()))
    // The topic chart, its table and the line chart show the user's topics only (one here, so bars, not a radar).
    expect(section(ai, 'A2')).toContain('class="rd-bars"')
    expect(count(section(ai, 'A2'), /<button[^>]*data-act="axis"/g)).toBe(1)
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
    for (const radar of [{ tab: 'ex', open: { kind: 'axis', id: 'vision' } }, { tab: 'ai', open: { kind: 'axis', id: 'language' } }, { open: { kind: 'group', id: '2' } }, { open: { kind: 'axis', id: 'language' } }, { tab: 'ex', mode: 'share', open: { kind: 'axis', id: 'robotics' } }]) {
      const html = radarView({ t, state: { lang: 'en', profile: prof, radar }, data: bad })
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;img src=x')
    }
  })
})

describe('AI usage question (D34-D39)', () => {
  const D = '2026-10-31'
  const notAsked = () => { const p = profile(); delete p.aiTasks; return p }
  const card = (html) => html.slice(html.indexOf('<article class="rd-srccard rd-aiask"'), html.indexOf('</article>', html.indexOf('rd-aiask')))
  const NEW_KEYS = ['rdAiAskTitle', 'rdAiAskSub', 'rdAiAskNone', 'rdAiAskSource', 'rdAiAskPrivacy', 'rdAiAskContinue', 'rdAiAskSkip', 'rdAiAskChange',
    ...AI_TASK_IDS.flatMap((id) => [`rdAiTask_${id}`, `rdAiTaskEx_${id}`])]

  it('without an answer For You shows only the question card: ten boxes in order, none, source and privacy lines (D44)', () => {
    const html = view(notAsked())
    expect(html).toContain('rd-aiask')
    expect(html).toContain('role="tablist"')
    expect(panel(html)).not.toContain('data-sec=')
    const c = card(html)
    expect([...c.matchAll(/data-act="aiAskPick" data-arg="([a-z]+)"/g)].map((m) => m[1])).toEqual([...AI_TASK_IDS])
    expect(count(c, /type="checkbox"/g)).toBe(11)
    expect(c).toContain('data-act="aiAskNone"')
    expect(c).toContain('<legend>Which of these do you use AI for?</legend>')
    expect(unesc(c)).toContain('Tick all that apply. This does not change what the Radar shows.')
    expect(unesc(c)).toContain("I don't use AI for any of these")
    expect(c).toContain('Categories set by the FutureReady team (31 Oct 2026); not from an outside study.')
    expect(c).toContain('Kept with your profile: on this device, and in your account if you sign in and save it.')
    expect(c).toContain('Writing &amp; Documentation')
    expect(c).toContain('Reports, emails, meeting minutes, documentation')
    expect(c).toContain('data-act="aiAskSkip"')
  })

  it('Continue is off until something is ticked; ticks and none are shown checked', () => {
    expect(card(view(notAsked()))).toMatch(/<button class="btn" data-act="aiAskContinue" disabled>/)
    const ticked = card(view(notAsked(), { aiAsk: { picked: ['data'], none: false } }))
    expect(ticked).toMatch(/<button class="btn" data-act="aiAskContinue">/)
    expect(ticked).toMatch(/data-act="aiAskPick" data-arg="data" checked/)
    expect(ticked).not.toMatch(/data-act="aiAskPick" data-arg="writing" checked/)
    const none = card(view(notAsked(), { aiAsk: { picked: [], none: true } }))
    expect(none).toMatch(/<button class="btn" data-act="aiAskContinue">/)
    expect(none).toMatch(/data-act="aiAskNone" checked/)
  })

  it('once skipped or answered: no card, the Radar shows with a "Change my AI use answers" button; reopening shows the saved ticks', () => {
    for (const aiTasks of [{ status: 'skipped', date: D }, { status: 'answered', picked: ['writing'], date: D }]) {
      const html = view(profile({ aiTasks }))
      expect(html).not.toContain('rd-aiask"')
      expect(html).toContain('role="tablist"')
      expect(html).toContain('<button class="btn sm ghost" data-act="aiAskOpen">Change my AI use answers</button>')
    }
    const reopened = card(view(profile({ aiTasks: { status: 'answered', picked: ['writing'], date: D } }), { aiAsk: { open: true } }))
    expect(reopened).toMatch(/data-act="aiAskPick" data-arg="writing" checked/)
    const reopenedNone = card(view(profile({ aiTasks: { status: 'answered', picked: [], date: D } }), { aiAsk: { open: true } }))
    expect(reopenedNone).toMatch(/data-act="aiAskNone" checked/)
  })

  it('no profile: the Radar shows, without the card or the change button', () => {
    const html = view(null)
    expect(html).not.toContain('rd-aiask')
    expect(html).not.toContain('data-act="aiAskOpen"')
    expect(html).toContain('role="tablist"')
  })

  it('a saved unknown id is never echoed into the page', () => {
    const html = view(profile({ aiTasks: { status: 'answered', picked: ['<img src=x>'], date: D } }), { aiAsk: { open: true } })
    expect(html).not.toContain('<img')
  })

  it('the card works in all three languages; BM and 中文 lines are marked for owner review', () => {
    for (const lang of ['ms', 'zh']) {
      for (const key of NEW_KEYS) expect(translate(lang, key), `${lang} ${key}`).not.toBe(key)
      const lines = readFileSync(`shared/strings/${lang}.js`, 'utf8').split('\n')
      for (const key of NEW_KEYS) expect(lines.find((l) => l.trimStart().startsWith(`${key}:`)), `${lang} ${key}`).toContain('// translation: owner review')
      const html = radarView({ t: (k, v) => translate(lang, k, v), state: { lang, profile: notAsked(), radar: {} }, data: linked() })
      expect(html).toContain('rd-aiask')
    }
    for (const key of NEW_KEYS) expect(t(key), key).not.toBe(key)
  })

  it('D37: no Radar request carries the answers', async () => {
    const calls = []
    const real = globalThis.fetch
    globalThis.fetch = (url, init = {}) => { calls.push({ url: String(url), body: init.body }); return real(url, init) }
    try {
      await radarApi.load(BUNDLE_ACTIVE, { base })
      await radarApi.storeInfo({ base })
      await radarApi.signal('openalex:T10028', BUNDLE_ACTIVE, { base })
      await radarApi.aiTasks({ base })
    } finally {
      globalThis.fetch = real
    }
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c.body, c.url).toBeUndefined()
      expect(c.url).not.toMatch(/picked|aiTasks=|writing|programming/)
    }
  })
})

describe('two tabs (D43-D47)', () => {
  const D = '2026-10-31'
  const goal = (value) => profile({ preferences: { careerInterests: [], careerGoal: { state: 'value', value } } })
  const secs = (html) => [...panel(html).matchAll(/data-sec="([A-Z0-9]+)"/g)].map((m) => m[1])

  it('radarTabOf: Explore first only for a career switch; a picked tab wins; old tab ids fall back (Review Focus 2, 3)', () => {
    const st = (prof, radar = {}) => ({ lang: 'en', profile: prof, radar })
    expect(radarTabOf(st(null))).toBe('fy')
    expect(radarTabOf(st(profile()))).toBe('fy')
    expect(radarTabOf(st(goal('grow_field')))).toBe('fy')
    expect(radarTabOf(st(goal('switch_career')))).toBe('ex')
    expect(radarTabOf(st(profile({ preferences: { careerInterests: [], careerGoal: { state: 'declined' } } })))).toBe('fy')
    expect(radarTabOf(st(goal('switch_career'), { tab: 'fy' }))).toBe('fy')
    expect(radarTabOf(st(profile(), { tab: 'ex' }))).toBe('ex')
    for (const old of ['sk', 'ai', 'x']) {
      expect(radarTabOf(st(profile(), { tab: old }))).toBe('fy')
      expect(radarTabOf(st(goal('switch_career'), { tab: old }))).toBe('ex')
    }
  })

  it('a career switcher who has not answered lands on Explore; For You still asks first', () => {
    const p = goal('switch_career'); delete p.aiTasks
    const html = view(p)
    expect(html).toMatch(/aria-selected="true"[^>]*data-arg="ex"/)
    expect(html).toMatch(/aria-selected="false"[^>]*data-arg="fy"/)
    expect(secs(html)).toEqual(['AC', 'A2', 'A1'])
    expect(html).not.toContain('rd-aiask')
    expect(view(p, { tab: 'fy' })).toContain('rd-aiask')
  })

  it('Explore opens straight away even before the question is answered', () => {
    const p = profile(); delete p.aiTasks
    expect(secs(view(p, { tab: 'ex' }))).toEqual(['AC', 'A2', 'A1'])
  })

  // Owner, 1 Nov: a conclusion card above Research momentum by AI topic, from the same OpenAlex numbers (no samples).
  describe('conclusion card', () => {
    const mom = (a, mode) => a.momentum?.[mode === 'share' ? 'share' : 'counts']?.current
    const ranked = (axes, mode) => axes.filter((a) => Number.isFinite(mom(a, mode)?.value)).sort((x, y) => mom(y, mode).value - mom(x, mode).value)
    const topics = (html) => [...html.matchAll(/data-act="axis" data-arg="([a-z_]+)"/g)].map((m) => m[1])
    const half = (html, cls) => (html.match(new RegExp(`<div class="rd-con-col ${cls}">[\\s\\S]*?</ul>`)) ?? [''])[0]

    it('lists the 3 fastest-rising topics first to last and the 3 slowest, lowest first, from the momentum index', () => {
      const html = section(panel(view(ownProfile(), { tab: 'ex' })), 'AC')
      const r = ranked(data.ai.axes, 'count')
      expect(r.length).toBeGreaterThanOrEqual(6)
      expect(unesc(html)).toContain(t('rdConTitle'))
      expect(topics(half(html, 'rise'))).toEqual(r.slice(0, 3).map((a) => a.axisId))
      expect(topics(half(html, 'fall'))).toEqual(r.slice(-3).reverse().map((a) => a.axisId))
      const top = r[0]
      const cur = mom(top, 'count')
      const at = (y) => top.series.find((p) => p.year === y).value
      expect(unesc(half(html, 'rise'))).toContain(t('rdConItem', { index: Math.round(cur.value), from: at(cur.baselineYear).toLocaleString('en-US'), to: at(cur.recentYear).toLocaleString('en-US') }))
    })
    it('every number has its OpenAlex link, the window and source are said, and it says it is not about jobs', () => {
      const html = section(panel(view(ownProfile(), { tab: 'ex' })), 'AC')
      expectNumbersLinked(html)
      expect(html).toContain('https://openalex.org')
      expect(unesc(html)).toContain(t('rdConNote'))
      expect(t('rdConNote')).toMatch(/not .*jobs/i)
      expect(unesc(html)).not.toMatch(/placeholder|sample/i)
      for (const lang of ['ms', 'zh']) for (const k of ['rdConTitle', 'rdConUp', 'rdConDown', 'rdConItem', 'rdConNote', 'rdConFew']) expect(translate(lang, k)).not.toBe(k)
    })
    it('follows the Share switch like the momentum card', () => {
      const html = section(panel(view(ownProfile(), { tab: 'ex', mode: 'share' })), 'AC')
      expect(topics(half(html, 'rise'))[0]).toBe(ranked(data.ai.axes, 'share')[0].axisId)
    })
    it('with fewer than 2 topics with an index it says so and lists nothing (Review Focus)', () => {
      const none = { ...linked(), ai: { ...data.ai, axes: data.ai.axes.map((a, i) => (i ? { ...a, momentum: null } : a)) } }
      const html = section(panel(view(ownProfile(), { tab: 'ex' }, none)), 'AC')
      expect(unesc(html)).toContain(t('rdConFew'))
      expect(html).not.toContain('rd-con-col')
      expect(html).not.toMatch(/\bnull\b|NaN|undefined/)
    })
  })

  it('answered: For You shows the Change button, the AI tasks card and research signals for you, in that order, nothing else', () => {
    const html = view(ownProfile({ aiTasks: { status: 'answered', picked: ['data'], date: D } }))
    const pn = panel(html)
    expect(secs(html)).toEqual(['AI', 'A5'])
    expect(pn.indexOf('data-act="aiAskOpen"')).toBeGreaterThan(-1)
    expect(pn.indexOf('data-act="aiAskOpen"')).toBeLessThan(pn.indexOf('data-sec="AI"'))
    expect(html.indexOf('data-act="aiAskOpen"')).toBeGreaterThan(html.indexOf('role="tablist"'))
  })

  it('the five removed sections and the old View all are not on the page in either tab (D47)', () => {
    for (const radar of [{}, { tab: 'fy' }, { tab: 'ex' }]) {
      const html = view(ownProfile(), radar)
      for (const sec of ['SK', 'B1', 'B2', 'B5', 'B6']) expect(html, `${JSON.stringify(radar)} ${sec}`).not.toContain(`data-sec="${sec}"`)
      expect(html).not.toContain('data-act="viewAll"')
    }
  })

  it('no profile: For You shows the AI card hint and A5, no question card, no crash (Review Focus 4)', () => {
    const html = view(null)
    expect(html).not.toContain('rd-aiask')
    expect(secs(html)).toEqual(['AI', 'A5'])
    expect(html).not.toMatch(/\bnull\b|NaN|undefined/)
  })

  it('Explore shows all six topics with no View all; the linked topic keeps its tag (D45)', () => {
    const html = view(ownProfile(), { tab: 'ex' })
    const pn = panel(html)
    const a2 = section(pn, 'A2')
    expect(new Set([...a2.matchAll(/data-act="axis" data-arg="([a-z]+)"/g)].map((m) => m[1])).size).toBe(6)
    expect(lineLabels(pn).split(', ')).toHaveLength(6)
    const row = (id) => (a2.match(new RegExp(`<tr><td><button[^>]*data-arg="${id}"[\\s\\S]*?</tr>`)) ?? [''])[0]
    expect(row('language')).toContain(t('rdFromProfile'))
    expect(row('robotics')).toBeTruthy()
    expect(row('robotics')).not.toContain(t('rdFromProfile'))
    expect(pn).not.toContain('data-act="viewAll"')
    expect(pn).not.toContain(t('rdGlobalView'))
    expect(pn).not.toContain(t('rdTopicsOwn'))
  })

  it('the evidence panel opens from Explore (Review Focus 5)', () => {
    const html = view(ownProfile(), { tab: 'ex', open: { kind: 'axis', id: 'language' } })
    expect(html).toContain('id="radarDrawer"')
  })

  it('tab names in BM and 中文 are marked for owner review', () => {
    for (const lang of ['ms', 'zh']) {
      const lines = readFileSync(`shared/strings/${lang}.js`, 'utf8').split('\n')
      for (const key of ['rdTabFY', 'rdTabFYq', 'rdTabEX', 'rdTabEXq']) {
        expect(translate(lang, key), `${lang} ${key}`).not.toBe(key)
        expect(lines.find((l) => l.trimStart().startsWith(`${key}:`)), `${lang} ${key}`).toContain('// translation: owner review')
      }
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
    const dev = createApp({ radar, d1: null, aiProvider: null, onetLive: null }).listen(0)
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
    expect(t('rdSkNoOnetLink')).toBe("Reached through the official code chain: see 'Skills your jobs ask for' above.")
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
  // Owner, 1 Nov: one "Sources behind this page" table at the bottom, the same design as Career Matching.
  const srcTable = (html) => {
    const start = html.indexOf('<div class="card mt-sources rd-srclist">')
    return start < 0 ? '' : html.slice(start, html.indexOf('</table>', start))
  }
  const srcRows = (html) => [...srcTable(html).matchAll(/<tr><td>([^<]*)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)].map((m) => [unesc(m[1]), unesc(m[2])])

  it('the sources table sits at the bottom, below the tab panel, on both tabs, with no old cards or drop-down', () => {
    for (const radar of [{}, { tab: 'ex' }]) {
      const html = view(ownProfile(), radar)
      const panelEnd = html.indexOf('</section>', html.indexOf('id="radarPanel"'))
      expect(panelEnd).toBeGreaterThan(-1)
      expect(html.indexOf('<div class="card mt-sources rd-srclist">')).toBeGreaterThan(panelEnd)
      expect(unesc(srcTable(html))).toContain(`<h3>${t('rdSrcBehind')}</h3>`)
      expect(html).not.toContain('<details class="rd-sources">')
      expect(html).not.toContain('<div class="rd-srcgrid">')
      for (const gone of ['Department of Statistics Malaysia', t('rdSrcOnetSkills'), t('rdSrcOnetHot'), 'rd-onet-card']) expect(html, gone).not.toContain(gone)
    }
  })

  it('lists the three sources the page uses, each with its https link, licence and dates', () => {
    const rows = srcRows(view(ownProfile(), { tab: 'ex' }))
    expect(rows.map((r) => r[0])).toEqual([t('rdSrcRowPapers'), t('rdSrcRowAei'), t('rdSrcRowIlo')])
    const [papers, aei, ilo] = rows.map((r) => r[1])
    const oa = data.sources.find((s) => s.sourceId === 'openalex')
    expect(papers).toMatch(/^<a href="https:\/\/openalex\.org"/)
    for (const bit of [oa.policy, oa.observationPeriod, '2026-10-30', t('rdAvail_data'), data.manifestId]) expect(papers, bit).toContain(bit)
    expect(aei).toMatch(/^<a href="https:\/\/huggingface\.co\/datasets\/Anthropic\/EconomicIndex"/)
    expect(aei).toContain('CC BY')
    expect(ilo).toMatch(/^<a href="https:\/\/doi\.org\/10\.54394\/HETP0387"/)
    expect(ilo).toContain('CC BY 4.0')
    expect(srcTable(view(ownProfile()))).not.toMatch(/\bnull\b|NaN|undefined/)
    for (const lang of ['ms', 'zh']) for (const k of ['rdSrcBehind', 'rdSrcRowPapers', 'rdSrcRowAei', 'rdSrcRowIlo']) expect(translate(lang, k)).not.toBe(k)
  })

  it('once the AI task data is loaded, its release and period are in the Anthropic row', () => {
    const ai = { release: 'release_2026_06_26', dataPeriod: 'April-May 2026', fetchedAt: '2026-10-30T10:00:00Z', sourceLinks: [] }
    const aei = srcRows(view(ownProfile(), { aiTasks: { ok: true, data: ai } }))[1][1]
    expect(aei).toContain('release_2026_06_26')
    expect(aei).toContain('April-May 2026')
  })

  it('the admin screen keeps both OpenAlex and DOSM cards (statusCards default)', () => {
    const html = statusCards(data.states, t, { sources: data.sources, manifestId: data.manifestId, ai: data.ai, occ: data.occ })
    expect(count(html, /<article class="rd-srccard/g)).toBe(2)
  })

  it('a source card is a box in the app look: ink outline, round corners, paper, offset shadow', () => {
    const css = readFileSync('public/styles.css', 'utf8')
    const rule = css.match(/^\.rd-srccard\{([^}]*)\}/m)[1]
    for (const part of ['border:1px solid var(--ink)', 'border-radius:14px', 'background:var(--surface)', 'box-shadow:4px 4px 0 var(--ink)']) expect(rule).toContain(part)
    expect(css).toMatch(/^\.rd-srcgrid\{[^}]*display:grid/m)
  })

  it('a source that is not available gets a plain tag, not the green one', () => {
    const html = onetSourceCards([{ sourceId: 'onet-skills', version: '31.0', links: [] }], t, { 'onet-skills': { availability: 'unavailable' } })
    expect(html).toContain(`<span class="pill" aria-label="${t('rdDim_availability')}: ${t('rdAvail_unavailable')}">${t('rdAvail_unavailable')}</span>`)
  })

  it('per source: link, observation period, publication date, last fetch, manifest id and the five dimensions', () => {
    const html = statusCards(data.states, t, { sources: data.sources, manifestId: data.manifestId, ai: data.ai, occ: data.occ })
    for (const dim of ['availability', 'freshness', 'refreshHealth', 'servedFrom', 'comparability']) expect(count(html, new RegExp(t(`rdDim_${dim}`), 'g'))).toBe(2)
    // availability is the tag at the top of each card, named for screen readers
    expect(count(html, new RegExp(`<span class="pill ok" aria-label="${t('rdDim_availability')}: ${t('rdAvail_data')}">${t('rdAvail_data')}</span>`, 'g'))).toBe(2)
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

  it('two O*NET source cards: name, release or window, fetched date and link, in all three languages', () => {
    const sources = [
      { sourceId: 'onet-skills', name: 'O*NET skill flags (US job ads)', version: '31.0', observationPeriod: '31.0', fetchedAt: '2026-10-30T11:39:58Z', links: [{ label: 'O*NET', url: 'https://www.onetcenter.org/database.html' }] },
      { sourceId: 'onet-hottech', name: 'O*NET Hot Technologies (US job ads)', window: { label: '1/25–12/25', year: '2025' }, observationPeriod: '1/25–12/25', fetchedAt: '2026-10-30T11:40:00Z', links: [{ label: 'O*NET', url: 'https://www.onetonline.org/search/hot_tech/' }] },
    ]
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const html = onetSourceCards(sources, tl)
      expect(count(html, /rd-onet-card/g), lang).toBe(2)
      expect(html, lang).toContain(tl('rdSrcOnetSkills'))
      expect(html, lang).toContain(tl('rdSrcOnetHot'))
      expect(html, lang).toContain('31.0')
      expect(html, lang).toContain('1/25–12/25')
      expect(html, lang).toContain('href="https://www.onetonline.org/search/hot_tech/"')
      expect(html, lang).toContain('2026-10-30')
      expect(html, lang).not.toMatch(/null|NaN|undefined/)
    }
    // The state of each source: availability, last refresh and its code (same words as the OpenAlex and DOSM cards).
    for (const lang of ['en', 'ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const states = {
        'onet-skills': { availability: 'data', refreshHealth: 'failed', refreshCode: 'source_unavailable' },
        'onet-hottech': { availability: 'unavailable', refreshHealth: 'ok' },
      }
      const html = onetSourceCards(sources, tl, states)
      expect(html, lang).toContain(tl('rdDim_refreshHealth'))
      expect(html, lang).toContain(tl('rdAvail_data'))
      expect(html, lang).toContain(tl('rdAvail_unavailable'))
      expect(html, lang).toContain(tl('rdHealth_failed'))
      expect(html, lang).toContain(tl('rdHealth_ok'))
      expect(html, lang).toContain(tl('rdErr_source_unavailable'))
      expect(html, lang).not.toMatch(/null|NaN|undefined/)
    }
    expect(onetSourceCards([], t)).toBe('')
    expect(onetSourceCards([{ sourceId: 'onet-skills', name: '<b>x</b>', links: [] }], t)).not.toContain('<b>x</b>')
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

// ---------- Skills card (profile charts plan, task 7) ----------
describe('Skills card on Skills & Careers', () => {
  const job = (source, code, title) => profile({ occupationMappings: [{ term: 'x', kind: 'job', chosen: { source, code, title } }] })
  const dev = () => job('onet', '15-1252.00', 'Software Developers')
  const fieldOnly = () => profile({ education: { records: [{ field: { source: 'isced', code: '0413', title: 'Management and administration' } }] } })
  const acc = () => job('onet', '13-2011.00', 'Accountants and Auditors')
  const nurse = () => job('onet', '29-1141.00', 'Registered Nurses')
  const card = (prof, radar = {}, d = linked()) => skillsChartCard(ctx(prof, radar, d))
  const corners = (html) => [...html.matchAll(/data-act="skCorner" data-arg="(\d+)"/g)].map((m) => Number(m[1]))
  const rowNumbers = (html) => [...html.matchAll(/<li id="rd-sk-(\d+)"/g)].map((m) => Number(m[1]))
  const rows = (html) => html.match(/<li id="rd-sk-\d+"[\s\S]*?<\/li>/g) ?? []

  it('is the first card of Skills & Careers', () => {
    const html = skillsTab(ctx(dev()))
    expect(html.indexOf('data-sec="SK"')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('data-sec="SK"')).toBeLessThan(html.indexOf('data-sec="B1"'))
    expect(html).toContain(t('rdSkChartTitle'))
    expect(html).toContain(t('rdSkChartTag'))
  })
  it('developer and accountant get different corners; the accountant has 6 and Excel shows 3,211,598', () => {
    const d = card(dev())
    const a = card(acc())
    expect(corners(a)).toHaveLength(6)
    expect(unesc(d)).toContain('Python')
    expect(unesc(a)).not.toContain('Python')
    expect(rows(a).find((li) => li.includes('Microsoft Excel'))).toContain('3,211,598')
  })
  it('default 8 corners; 16; all = 29 with-count skills; the list always has 30 rows numbered 1 to 30', () => {
    const d8 = card(dev())
    expect(corners(d8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(corners(card(dev(), { corners: { sk: 16 } }))).toHaveLength(16)
    const all = card(dev(), { corners: { sk: 'all' } })
    expect(corners(all)).toHaveLength(29)
    // 10 rows a page; the three pages together are rows 1 to 30
    for (const radar of [{}, { corners: { sk: 'all' } }]) {
      const pages = [1, 2, 3, 4].map((p) => rowNumbers(card(dev(), { ...radar, pages: { sk: p } })))
      expect(pages[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(pages[1]).toEqual(Array.from({ length: 10 }, (_, i) => i + 11))
      expect([...pages[0], ...pages[1], ...pages[2]]).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
      expect(pages[2]).toEqual(Array.from({ length: 10 }, (_, i) => i + 21))
      expect(pages[3]).toEqual(pages[2]) // past the last page shows the last page
    }
    expect(d8).toContain('<polygon')
    expect(d8).toMatch(/data-arg="8"[^>]*aria-pressed="true"/)
    expect(all).toContain(t('rdCornersAll', { n: 29 }))
  })
  it('the corner switch buttons call skCorners', () => {
    const html = card(dev())
    for (const n of [8, 16, 30, 'all']) expect(html).toContain(`data-act="skCorners" data-arg="${n}"`)
  })
  it('search keeps the original list numbers', () => {
    const html = card(dev(), { q: 'git' })
    const nums = rowNumbers(html)
    expect(nums.length).toBeGreaterThan(0)
    expect(nums.length).toBeLessThan(30)
    const full = [1, 2, 3].flatMap((p) => rowNumbers(card(dev(), { pages: { sk: p } })))
    expect(full).toHaveLength(30)
    expect(nums.every((n) => full.includes(n))).toBe(true)
    for (const li of rows(html)) expect(unesc(li.match(/<b>([^<]*)<\/b>/)[1]).toLowerCase()).toContain('git')
    expect(html).toContain('data-radar-search')
    expect(html).toContain(t('rdSkShown', { shown: nums.length, n: 30, year: '2025' }))
    expect(card(dev(), { q: 'zzzz' })).toContain(t('rdSkNoMatch'))
  })
  it('a highlighted corner marks its row', () => {
    const html = card(dev(), { hl: 3 })
    expect(html.match(/<li id="rd-sk-3"[^>]*>/)[0]).toContain('hl')
    expect(html.match(/<li id="rd-sk-4"[^>]*>/)[0]).not.toContain('hl')
  })
  it('rows show where each skill comes from, a no-count mark, and the Hot Technologies link on counts', () => {
    const html = card(dev())
    expect(html).toContain(`${t('rdSkFrom')}:`)
    expect(html).toContain('https://www.onetonline.org/link/summary/15-1252.00')
    expect(card(dev(), { pages: { sk: 3 } })).toContain(t('rdSkNoCount'))
    expect(rows(html)[0]).toContain('2025')
    expect(html).toContain('CC BY 4.0')
    expect(html).toContain('Lightcast via O*NET')
    expect(rows(html)[0]).toMatch(/<a href="https:\/\/www\.onetonline\.org\/search\/hot_tech\/"/)
  })
  it('the nurse (no in-demand software) gets the explanation with the O*NET summary link and no chart', () => {
    const html = card(nurse())
    expect(unesc(html)).toContain('O*NET lists no in-demand software for')
    expect(unesc(html)).toContain('(O*NET database 30.3). No chart is drawn.')
    expect(html).toContain('https://www.onetonline.org/link/summary/29-1141.00')
    expect(html).not.toContain('<polygon')
    expect(corners(html)).toHaveLength(0)
  })
  it('eMASCO 1121-01 shows the chain stop and no guessed job', () => {
    const html = card(job('emasco', '1121-01', 'Chief Executive'))
    expect(unesc(html)).toContain('Not available for eMASCO 1121-01: the code chain stops at')
    expect(unesc(html)).toContain('MASCO 2020 1121 has no link in the next official table')
    expect(html).toContain('https://jtksm.gov.my/sites/default/files/2022-12/MASCO_2020_BI_Edaran.pdf')
    for (const lang of ['ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const out = skillsChartCard({ t: tl, state: { lang, profile: job('emasco', '1121-01', 'Chief Executive'), radar: {} }, data: linked() })
      expect(unesc(out), lang).toContain(tl('rdChainStop_no_row', { system: 'MASCO 2020', codes: '1121' }))
      expect(out, lang).not.toContain('has no link in the next official table')
    }
    expect(html).not.toContain('<polygon')
    expect(html).not.toContain('data-act="skCorner"')
  })
  it('eMASCO 2512-02 shows the code chain with step source links and the shared-unit note', () => {
    const html = card(job('emasco', '2512-02', 'Software Developer'))
    expect(html).toContain(t('rdChainPath'))
    expect(html).toContain('https://www.bls.gov/soc/isco_soc_crosswalk.xls')
    expect(html).toContain(t('rdChainSameUnit'))
    expect(html).toContain('15-1253.00')
    expect(unesc(html)).toContain('eMASCO 2512-02')
  })
  it('a confirmed profile with nothing on it gets the add-to-profile hint, not "confirm"; unavailable skills name O*NET', () => {
    const empty = card(profile())
    expect(empty).not.toContain(t('rdConfirmFirst'))
    expect(empty).toContain(t('rdAddProfile'))
    const off = card(dev(), {}, { ...linked(), skills: { state: 'unavailable' } })
    expect(off).toContain(t('rdSkUnavailable'))
    expect(off).toContain('O*NET')
    expect(off).toContain('https://www.onetcenter.org/database.html')
  })
  it('a field-only profile (many jobs) gives a long skills list and still renders', () => {
    const html = card(fieldOnly())
    expect(html).toContain('data-sec="SK"')
    expect(html).toContain('<polygon')
    expect(count(html, /<li id="rd-sk-\d+"/g)).toBe(10)
    expect(Number(unesc(html).match(/\d+ of (\d+) . numbered/)[1])).toBeGreaterThan(20)
  })
  it('a draft profile is asked to confirm first and no chart is drawn', () => {
    const html = card({ ...dev(), profileStatus: 'draft' })
    expect(html).toContain(t('rdConfirmFirst'))
    expect(html).toContain('data-go="form"')
    expect(html).not.toContain('<polygon')
    expect(card(null)).toContain(t('rdConfirmFirst'))
  })
  it('first snapshot shows the one-year note; sources, window label and legend are on the card', () => {
    expect(data.skills.postings.firstSnapshot).toBe(true)
    const html = card(dev())
    expect(html).toContain(t('rdSkOneYear'))
    expect(html).toContain('https://www.onetcenter.org/database.html')
    expect(html).toContain('https://www.onetonline.org/search/hot_tech/')
    expect(html).toContain(data.skills.postings.window.label)
    expect(html).toContain(t('rdSkLegend', { year: '2025' }))
    expect(html).toContain(t('rdSkSource'))
    const later = { ...linked(), skills: { ...data.skills, postings: { ...data.skills.postings, firstSnapshot: false } } }
    expect(card(dev(), {}, later)).not.toContain(t('rdSkOneYear'))
  })
  it('dropped skills sit in a fold with the release numbers', () => {
    const html = card(dev())
    const fold = html.match(/<details[\s\S]*?<\/details>/)[0]
    expect(fold).toContain(t('rdSkDroppedFold', { n: 4, previous: '30.2', current: '30.3' }))
    expect(card(nurse())).not.toContain('<details')
  })
  it('has no score, weight, rank or opportunity wording', () => {
    // The class name rd-rank-list is styling only; no visible text, data attribute or id carries these words.
    expect(card(dev(), { corners: { sk: 'all' } }).replace(/class="[^"]*"/g, '')).not.toMatch(/weight|rank|opportunit/i)
  })
  it('keepCaret focuses the search box and restores the caret', () => {
    const calls = []
    const box = { focus: () => calls.push('focus'), setSelectionRange: (a, b) => calls.push(['range', a, b]) }
    keepCaret(3, { querySelector: (sel) => (sel === '[data-radar-search]' ? box : null) })
    expect(calls).toEqual(['focus', ['range', 3, 3]])
    expect(() => keepCaret(2, { querySelector: () => null })).not.toThrow()
  })
  it('every new string exists in en, ms and zh with the review comment', () => {
    const keys = ['rdSkChartTitle', 'rdSkChartTag', 'rdCorners', 'rdCornersAll', 'rdSkSearch', 'rdSkShown', 'rdSkFrom', 'rdSkNew', 'rdSkNoCount', 'rdSkNoMatch', 'rdSkDroppedFold', 'rdSkNone', 'rdChainBroken', 'rdChainPath', 'rdSkOneYear', 'rdSkLegend', 'rdSkSource', 'rdConfirmFirst', 'rdChainSameUnit', 'rdSkAds', 'rdSkAria', 'rdSkLicence', 'rdChainStop_no_row', 'rdChainStop_pending', 'rdChainStop_invalid', 'rdChainStop_no_onet_data']
    for (const lang of ['en', 'ms', 'zh']) {
      const lines = readFileSync(`shared/strings/${lang}.js`, 'utf8').split('\n')
      for (const key of keys) {
        const line = lines.find((l) => l.trimStart().startsWith(`${key}:`))
        expect(line, `${lang}.${key}`).toBeTruthy()
        if (lang !== 'en') expect(line, `${lang}.${key}`).toMatch(/\/\/ translation: owner review\r?$/)
      }
    }
  })
})

// ---------- AI Impact card and own-topics filter (profile charts plan, task 8) ----------
describe('AI Impact card', () => {
  const job = (code) => ({ term: 'x', kind: 'job', chosen: { source: 'onet', code, title: 'x' } })
  const prof = (...codes) => profile({ occupationMappings: codes.map(job) })
  const dev = () => prof('15-1252.00')
  const fieldOnly = () => profile({ education: { records: [{ field: { source: 'isced', code: '0413', title: 'Management and administration' } }] } })
  const acc = () => prof('13-2011.00')
  const nurse = () => prof('29-1141.00')
  const pair = () => prof('27-1024.00', '11-2021.00')
  let ai
  beforeAll(async () => {
    const out = await radarApi.aiTasks({ base })
    expect(out.ok).toBe(true)
    ai = out.data
  })
  const tab = (p, radar = {}, d = linked()) => aiTab(ctx(p, { aiTasks: { ok: true, data: ai }, ...radar }, d))
  const corners = (html) => [...html.matchAll(/data-act="aiCorner" data-arg="(\d+)"/g)].map((m) => Number(m[1]))
  const card = (html) => section(html, 'AI')
  const aiRows = (html) => html.match(/<li id="rd-ai-\d+"[\s\S]*?<\/li>/g) ?? []

  it('is the first card of AI Impact, before the topic card', () => {
    const html = tab(dev())
    expect(html.indexOf('data-sec="AI"')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('data-sec="AI"')).toBeLessThan(html.indexOf('data-sec="A2"'))
    expect(unesc(html)).toContain(t('rdAiChartTitle'))
    expect(html).toContain(t('rdAiChartTag'))
  })
  it('developer and accountant show every task as a dot (8 and 11), different tasks; the accountant list has 11 rows', () => {
    const d = card(tab(dev()))
    const a = card(tab(acc()))
    expect(corners(d)).toHaveLength(8)
    expect(corners(a)).toHaveLength(11)
    expect(aiRows(d)).toHaveLength(8)
    expect(aiRows(a)).toHaveLength(10)
    expect(aiRows(card(tab(acc(), { pages: { ai: 2 } })))).toHaveLength(1)
    // D40: a scatter, not a spider web
    expect(d).toContain('class="rd-scatter"')
    expect(d).not.toContain('class="rd-radar"')
    expect(d).not.toContain('<polygon')
    expect(unesc(d)).toContain('Modify existing software to correct errors')
    expect(unesc(a)).not.toContain('Modify existing software to correct errors')
    expect(d).toContain(t('rdAiShown', { n: 8, total: 17 }))
    expect(a).toContain(t('rdAiShown', { n: 11, total: 30 }))
  })
  it('owner, 1 Nov: no "Tasks shown" switch; all tasks are drawn, whatever the old saved choice', () => {
    const html = card(tab(acc()))
    expect(html).not.toContain('data-act="aiCorners"')
    expect(html).not.toContain(t('rdAiDots'))
    expect(corners(card(tab(acc(), { corners: { ai: 8 } })))).toHaveLength(11)
  })
  it('the developer shows Gradient 3, ISCO 2512 and the ILO DOI link', () => {
    const html = card(tab(dev()))
    const row = ai.ilo.find((r) => r.isco === '2512')
    expect(html).toContain(t('rdAiGrad_G3'))
    expect(html).toContain('https://doi.org/10.54394/HETP0387')
    expect(unesc(html)).toContain(t('rdAiExposure', { job: 'Software Developers', gradient: t('rdAiGrad_G3'), isco: '2512', title: row.title, mean: row.mean.toFixed(2) }))
  })
  it('the nurse (two tasks) gets a scatter with two dots, no bars, and Not exposed (D40)', () => {
    const html = card(tab(nurse()))
    expect(html).not.toContain('<polygon')
    expect(html).not.toContain('class="rd-bars"')
    expect(html).toContain('class="rd-scatter"')
    expect(html).toContain(t('rdAiGrad_not_exposed'))
    expect(corners(html)).toHaveLength(2)
  })
  it('a job with one task in the source gets a scatter with one dot (D40, Review Focus 5)', () => {
    const counts = {}
    for (const x of ai.tasks) counts[x.code] = (counts[x.code] ?? 0) + 1
    const code = Object.keys(counts).sort().find((c) => counts[c] === 1)
    expect(code).toBeTruthy()
    const html = card(tab(prof(code)))
    expect(html).toContain('class="rd-scatter"')
    expect(corners(html)).toHaveLength(1)
  })

  it('the scatter dots carry the task text and numbers, and the legend explains both axes', () => {
    const html = card(tab(acc()))
    const dots = [...html.matchAll(/<g role="button" tabindex="0" data-act="aiCorner" data-arg="(\d+)" aria-label="([^"]*)"/g)]
    expect(dots).toHaveLength(11)
    expect(unesc(dots[0][2])).toMatch(/^T1\. .+: AI does it [\d.]+% · AI helps [\d.]+% · /)
    expect(unesc(html)).toContain(t('rdAiLegend'))
    expect(t('rdAiLegend')).toContain('Not a score')
    expect(unesc(html)).toContain(t('rdAiScHelps'))
    expect(html).not.toContain(`<span class="small muted">${t('rdCorners')}</span>`)
  })

  it('two jobs show a switch with 2 buttons; a stale job index falls back to job 0', () => {
    const html = card(tab(pair()))
    expect(count(html, /data-act="aiJob"/g)).toBe(2)
    expect(html).toContain(t('rdJob'))
    const first = card(tab(pair(), { aiJob: 0 }))
    expect(card(tab(pair(), { aiJob: 5 }))).toBe(first)
    expect(card(tab(pair(), { aiJob: 1 }))).not.toBe(first)
    expect(count(card(tab(dev())), /data-act="aiJob"/g)).toBe(0)
  })
  it('a field-only profile has many jobs: the job switch is a labelled drop-down, not buttons', () => {
    const jobs = data.refs.fields.find((f) => f.code === '0413').jobs
    expect(jobs.length).toBeGreaterThan(4)
    const html = card(tab(fieldOnly()))
    expect(count(html, /<option /g)).toBe(jobs.length)
    expect(html).toMatch(/<label[^>]*for="rd-ai-job"[^>]*>Job<\/label><select id="rd-ai-job" data-radar-aijob>/)
    expect(html).not.toContain('class="seg" role="group" aria-label="Job"')
    expect(html).not.toContain('data-act="aiJob"')
    expect(count(html, /<option [^>]*selected/g)).toBe(1)
    expect(unesc(html)).toContain(`${jobs[0].title} (${jobs[0].code})`)
    const second = card(tab(fieldOnly(), { aiJob: 1 }))
    expect(second).toMatch(/<option value="1" selected>/)
  })
  it('four jobs keep the buttons; five switch to the drop-down', () => {
    const four = card(tab(prof('15-1252.00', '13-2011.00', '29-1141.00', '27-1024.00')))
    expect(count(four, /data-act="aiJob"/g)).toBe(4)
    expect(four).not.toContain('<select')
    const five = card(tab(prof('15-1252.00', '13-2011.00', '29-1141.00', '27-1024.00', '11-2021.00')))
    expect(five).toContain('<select id="rd-ai-job"')
    expect(five).not.toContain('data-act="aiJob"')
  })

  it('the job drop-down stays inside the card on a phone (long job titles)', () => {
    const css = readFileSync('public/styles.css', 'utf8')
    const rule = css.match(/\.rd-tools select\{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/max-width:100%/)
    expect(rule).toMatch(/min-width:0/)
    expect(rule).toMatch(/text-overflow:ellipsis/)
  })

  it('up to 760 px wide the count and source column of a list row moves under the row text (one letter per line at 588 px before)', () => {
    const css = readFileSync('public/styles.css', 'utf8')
    const phone = [...css.matchAll(/@media \(max-width:760px\)\{([\s\S]*?\}\s*)\}/g)].map((m) => m[1]).find((b) => b.includes('.rd-rank-list')) ?? ''
    expect(phone).toMatch(/\.rd-rank-list \.rd-row\{grid-template-columns:2\.4em minmax\(0,1fr\)\}/)
    expect(phone).toMatch(/\.rd-rank-list \.rd-rc\{grid-column:2;white-space:normal\}/)
  })

  it('long job-name links in the list rows and card notes may wrap on a phone', () => {
    const css = readFileSync('public/styles.css', 'utf8')
    expect(css).toMatch(/\.rd-rank-list \.rd-src,\s*\.rd-note \.rd-src\{white-space:normal;overflow-wrap:anywhere\}/)
  })
  it('app wiring: the drop-down change calls the aiJob action', () => {
    const app = readFileSync('public/js/app.js', 'utf8')
    expect(app).toContain("hasAttribute?.('data-radar-aijob')) return actions.aiJob(event.target.value)")
  })
  it('loading, failed and missing data show their text and the topic card still renders', () => {
    for (const [aiTasks, key] of [[{ loading: true }, 'rdAiLoading'], [{ ok: false, code: 'network' }, 'rdAiUnavailable'], [undefined, 'rdAiLoading']]) {
      const html = aiTab(ctx(dev(), { aiTasks }))
      expect(card(html)).toContain(t(key))
      expect(html).toContain('data-sec="A2"')
    }
    const off = aiTab(ctx(dev(), { aiTasks: { ok: true, data: { state: 'unavailable', reason: 'x' } } }))
    expect(card(off)).toContain(t('rdAiUnavailable'))
    expect(card(off)).toContain('Anthropic Economic Index')
    expect(card(off)).toContain('https://doi.org/10.54394/HETP0387')
    // Confirmed but empty: the add-to-profile hint, not "confirm your profile".
    const empty = card(tab(profile()))
    expect(empty).toContain(t('rdAddProfile'))
    expect(empty).not.toContain(t('rdAiConfirmFirst').replace(/'/g, '&#39;'))
  })
  it('a draft profile is asked to confirm first; an eMASCO role with a broken chain shows its stop', () => {
    expect(unesc(card(tab({ ...dev(), profileStatus: 'draft' })))).toContain(t('rdAiConfirmFirst'))
    const broken = card(tab(profile({ occupationMappings: [{ term: 'x', kind: 'job', chosen: { source: 'emasco', code: '1121-01', title: 'Chief Executive' } }] })))
    expect(unesc(broken)).toContain('Not available for eMASCO 1121-01: the code chain stops at')
    expect(broken).not.toContain('data-act="aiCorner"')
  })
  it('a job with no ISCO code says so; a job with no task in the data gets the none message', () => {
    const noIlo = card(tab(dev(), { aiTasks: { ok: true, data: { ...ai, ilo: [] } } }))
    expect(unesc(noIlo)).toContain(t('rdAiNoIloRow', { isco: '2512' }))
    expect(noIlo).not.toContain(esc_(t('rdAiNoIsco')))
    expect(noIlo).toContain('https://doi.org/10.54394/HETP0387')
    // No ISCO-08 code at all: the other message.
    const base_ = linked()
    const noCode = { ...base_, refs: { ...base_.refs, bridge: { ...base_.refs.bridge, steps: base_.refs.bridge.steps.map((s) => (s.id === 'soc2010_to_isco08' ? { ...s, links: {} } : s)) } } }
    const noCodeHtml = card(tab(dev(), {}, noCode))
    expect(unesc(noCodeHtml)).toContain(t('rdAiNoIsco'))
    expect(noCodeHtml).not.toContain('rdAiNoIloRow')
    expect(noCodeHtml).toContain('https://doi.org/10.54394/HETP0387')
    const html = card(tab(dev(), { aiTasks: { ok: true, data: { ...ai, tasks: [] } } }))
    expect(unesc(html)).toContain(t('rdAiNone', { total: 17 }))
    expect(html).not.toContain('<polygon')
  })
  it('rows carry the release, data period and Hugging Face link; the card states what the data is not', () => {
    const html = card(tab(dev()))
    expect(html).toContain('https://huggingface.co/datasets/Anthropic/EconomicIndex')
    expect(html).toContain(t('rdAiSource'))
    expect(unesc(html)).toContain(t('rdAiLegend'))
    for (const li of aiRows(html)) {
      expect(li).toContain(ai.release)
      expect(li).toContain(ai.dataPeriod)
      expect(li).toContain('https://huggingface.co/datasets/Anthropic/EconomicIndex')
    }
    expect(aiRows(html)[0]).toContain(t('rdAiRow', { auto: '69.12', aug: '30.88', usage: '0.20' }).replace(/0\.20.*$/, ''))
  })
  it('a highlighted corner marks its row', () => {
    const html = card(tab(dev(), { aiHl: 3 }))
    expect(html.match(/<li id="rd-ai-3"[^>]*>/)[0]).toContain('hl')
    expect(html.match(/<li id="rd-ai-4"[^>]*>/)[0]).not.toContain('hl')
  })
  it('has no score, weight, rank or opportunity wording', () => {
    expect(card(tab(dev(), { corners: { ai: 'all' } })).replace(/class="[^"]*"/g, '')).not.toMatch(/weight|rank|opportunit/i)
  })
  it('topic chart shows only your topics by default, all six with View all, and all six plus the global note without approved links', () => {
    const axes = (html) => [...section(html, 'A2').matchAll(/<button[^>]*data-act="axis" data-arg="([^"]+)"/g)].map((m) => m[1])
    const own = tab(ownProfile())
    expect(own).toContain(t('rdTopicsOwn'))
    expect(axes(own)).toEqual(['language'])
    expect(own).toContain(t('rdTopicsViewAll'))
    const all = tab(ownProfile(), { all: { ai: true } })
    expect(axes(all)).toHaveLength(6)
    expect(all).not.toContain(t('rdTopicsOwn'))
    expect(all).toContain(t('rdViewMine'))
    const none = tab(ownProfile(), {}, data)
    expect(axes(none)).toHaveLength(6)
    expect(none).toContain(t('rdGlobalView'))
    // The global note belongs to the topic card: after the AI tasks card, before the topic card.
    expect(none.indexOf(t('rdGlobalView'))).toBeGreaterThan(none.indexOf(t('rdAiSource')))
    expect(none.indexOf(t('rdGlobalView'))).toBeLessThan(none.indexOf('data-sec="A2"'))
  })
  it('few-topics note: own view names the field link, the all-topics view keeps the valid-index reason', () => {
    expect(section(tab(ownProfile()), 'A2')).toContain(t('rdFewOwnAxes'))
    expect(section(tab(ownProfile()), 'A2')).not.toContain(t('rdFewAxes'))
    const withAll = section(tab(ownProfile(), { all: { ai: true } }), 'A2')
    expect(withAll).not.toContain(t('rdFewOwnAxes'))
    const six = { ...data, ai: { ...data.ai, axes: data.ai.axes.map((a) => ({ ...a, momentum: { counts: { current: { state: 'invalid' } }, share: { current: { state: 'invalid' } } } })) } }
    const few = section(tab(ownProfile(), { all: { ai: true } }, { ...linked(), ai: six.ai }), 'A2')
    expect(few).toContain(t('rdFewAxes'))
    expect(few).not.toContain(t('rdFewOwnAxes'))
  })
  it('T-prefix on corners and list rows; licences on the source line; usage text in the user language', () => {
    const html = card(tab(dev()))
    expect(html).toContain('>T1</text>') // the scatter labels each dot with its number (D40); the text is in the list and the aria label
    expect(html).toContain('<span class="rd-rn">T1</span>')
    expect(html).toContain('aria-label="T1. ')
    expect(html).toContain(t('rdAiLicence'))
    expect(html).toContain('CC-BY')
    expect(html).toContain('CC BY 4.0')
    expect(aiRows(html)[0]).toContain(`${usageText(ai.tasks.find((x) => x.automation === 69.12 && x.code === '15-1252.00').usage)}% of all`)
    const low = { ...ai, tasks: ai.tasks.map((x) => (x.code === '15-1252.00' ? { ...x, usage: 0.004 } : x)) }
    const lowHtml = card(tab(dev(), { aiTasks: { ok: true, data: low } }))
    expect(lowHtml).toContain(`${t('rdAiUnder')}% of all conversations`)
    expect(lowHtml).not.toContain('under 0.01 %')
    for (const lang of ['ms', 'zh']) {
      const tl = (key, vars) => translate(lang, key, vars)
      const out = aiTab({ t: tl, state: { lang, profile: dev(), radar: { aiTasks: { ok: true, data: low } } }, data: linked() })
      expect(out, lang).toContain(tl('rdAiUnder'))
      expect(out, lang).not.toContain('under 0.01')
    }
  })
  it('state made by the aiJob and aiCorner actions has no score, weight, rank, match or opportunity key', () => {
    const app = readFileSync('public/js/app.js', 'utf8')
    const src = app.split(/\r?\n/).find((l) => l.startsWith('  aiJob: ')).slice('aiJob'.length + 4).replace(/,$/, '')
    let st = { tab: 'ai' }
    const radarUi = () => st
    const setRadar = (patch) => { st = { ...st, ...patch } }
    const job = new Function('radarUi', 'setRadar', 'withPage', `return ${src}`)(radarUi, setRadar, withPage)
    job('1')
    st = { ...st, aiTasks: { ok: true, data: { state: 'data' } }, aiHl: 3 }
    const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).flatMap((k) => [k, ...keysOf(o[k])]) : [])
    expect(st.aiJob).toBe(1)
    expect(keysOf(st).filter((k) => /score|weight|rank|match|opportunit/i.test(k))).toEqual([])
    expect(keysOf(st).length).toBeGreaterThan(3)
  })
  it('app wiring: the two actions and loadAiTasks exist, the state keys are plain, and Radar state is still not persisted', () => {
    const app = readFileSync('public/js/app.js', 'utf8')
    for (const name of ['aiJob', 'aiCorner']) expect(app).toMatch(new RegExp(`\n  ${name}: `))
    expect(app).not.toMatch(/\n  aiCorners: /)
    expect(app).toContain('async function loadAiTasks()')
    expect(app).toContain('radar: null')
    const keys = [...app.matchAll(/(aiTasks|aiJob|aiHl)/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((k) => /score|weight|rank|match|opportunit/i.test(k))).toEqual([])
  })
  it('every new string exists in en, ms and zh with the review comment', () => {
    const keys = ['rdAiChartTitle', 'rdAiChartTag', 'rdAiExposure', 'rdAiGrad_G4', 'rdAiGrad_G3', 'rdAiGrad_G2', 'rdAiGrad_G1', 'rdAiGrad_minimal', 'rdAiGrad_not_exposed', 'rdAiNoIsco', 'rdAiShown', 'rdAiRow', 'rdAiLegend', 'rdAiNone', 'rdAiLoading', 'rdAiUnavailable', 'rdAiSource', 'rdAiLicence', 'rdFewOwnAxes', 'rdAiConfirmFirst', 'rdAiUnder', 'rdJob', 'rdAiNoIloRow', 'rdSkNoOnetLink', 'rdTopicsOwn', 'rdTopicsViewAll']
    for (const lang of ['en', 'ms', 'zh']) {
      const lines = readFileSync(`shared/strings/${lang}.js`, 'utf8').split('\n')
      for (const key of keys) {
        const line = lines.find((l) => l.trimStart().startsWith(`${key}:`))
        expect(line, `${lang}.${key}`).toBeTruthy()
        if (lang !== 'en') expect(line, `${lang}.${key}`).toMatch(/\/\/ translation: owner review\r?$/)
      }
    }
  })
})

// ---------- Pages for long lists, folds for long notes (owner request, 31 Oct) ----------
describe('Pages and folds on the Radar charts', () => {
  const fieldOnly = () => profile({ education: { records: [{ field: { source: 'isced', code: '0413', title: 'Management and administration' } }] } })
  const jobs = (...codes) => profile({ occupationMappings: codes.map((c) => ({ term: 'x', kind: 'job', chosen: { source: 'onet', code: c, title: 'x' } })) })
  const emasco = (code) => profile({ occupationMappings: [{ term: 'x', kind: 'job', chosen: { source: 'emasco', code, title: 'x' } }] })
  const sk = (radar = {}, p = fieldOnly()) => skillsChartCard(ctx(p, radar))
  const rowNums = (html) => [...html.matchAll(/<li id="rd-sk-(\d+)"/g)].map((m) => Number(m[1]))
  const pagerOf = (html) => html.match(/<div class="rd-pagerow">[\s\S]*?<\/form><\/div>/)?.[0] ?? ''
  const app = readFileSync('public/js/app.js', 'utf8')
  const css = readFileSync('public/styles.css', 'utf8')
  const total = (html) => Number(unesc(html).match(/\d+ of (\d+) . numbered/)[1])

  it('pageOf clamps: 1 when unset or not a number, the last page when past it', () => {
    expect(pageOf(undefined, 25)).toBe(1)
    expect(pageOf('abc', 25)).toBe(1)
    expect(pageOf(0, 25)).toBe(1)
    expect(pageOf(2, 25)).toBe(2)
    expect(pageOf('3', 25)).toBe(3)
    expect(pageOf(9, 25)).toBe(3)
    expect(pageOf(5, 0)).toBe(1)
    expect(pageOf(2, 25, 5)).toBe(2)
  })
  it('pageItems gives first, last and current +-1 with dots', () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
    expect(pageItems(5, 9)).toEqual([1, '…', 4, 5, 6, '…', 9])
    expect(pageItems(2, 9)).toEqual([1, 2, 3, '…', 9])
  })
  it('a field profile shows 10 skill rows and a pager; page 2 starts at row 11', () => {
    const p1 = sk()
    expect(rowNums(p1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const bar = pagerOf(p1)
    expect(bar).toContain('data-act="rdPage" data-arg="sk:2"')
    expect(bar).toContain('data-form="rdPageGo" data-arg="sk"')
    expect(bar).toContain('aria-current="page"')
    expect(unesc(bar)).toContain(t('rdShowingRows', { from: 1, to: 10, n: total(p1) }))
    const p2 = sk({ pages: { sk: 2 } })
    expect(rowNums(p2)[0]).toBe(11)
    expect(rowNums(p2)).toHaveLength(10)
  })
  it('a list of 10 rows or fewer has no pager', () => {
    expect(skillsChartCard(ctx(jobs('13-2011.00')))).not.toContain('rd-pagerow')
  })
  it('a search shows page 1 of the results and the numbers stay the original ones', () => {
    const devSk = (radar) => rowNums(sk(radar, jobs('15-1252.00')))
    const all = [1, 2, 3].flatMap((p) => devSk({ pages: { sk: p } }))
    // a stale page 2 with a short result list is clamped to page 1 of the results
    const hit = devSk({ q: 'git' })
    expect(hit.length).toBeGreaterThan(0)
    expect(hit.length).toBeLessThanOrEqual(10)
    expect(devSk({ q: 'git', pages: { sk: 2 } })).toEqual(hit)
    expect(hit.every((n) => all.includes(n))).toBe(true)
    // the text-change action sets the page to 1 (pure helper used by app.js)
    expect(withPage({ sk: 3, ai: 2 }, 'sk', 1)).toEqual({ sk: 1, ai: 2 })
    expect(withPage(undefined, 'ai', 1)).toEqual({ ai: 1 })
    // the numbers on a page of a long result list stay the original ones
    const long = devSk({ q: 'a', pages: { sk: 1 } })
    expect(long.length).toBeGreaterThan(0)
    expect(long.every((n) => all.includes(n))).toBe(true)
  })
  it('the AI task list is paged when a job has more than 10 tasks', async () => {
    const out = await radarApi.aiTasks({ base })
    const ai = out.data
    const per = new Map()
    for (const x of ai.tasks) per.set(x.code, (per.get(x.code) ?? 0) + 1)
    const code = [...per.entries()].find(([, n]) => n > 10)?.[0]
    expect(code).toBeTruthy()
    const aiHtml = (radar) => section(aiTab(ctx(jobs(code), { aiTasks: { ok: true, data: ai }, ...radar })), 'AI')
    const p1 = aiHtml({})
    expect(count(p1, /<li id="rd-ai-\d+"/g)).toBe(10)
    expect(p1).toContain('data-act="rdPage" data-arg="ai:2"')
    expect(aiHtml({ pages: { ai: 2 } })).toContain('<li id="rd-ai-11"')
  })
  it('pageForRow gives the page that holds a row; the corner opens it and highlights the row', () => {
    expect(pageForRow(1)).toBe(1)
    expect(pageForRow(10)).toBe(1)
    expect(pageForRow(11)).toBe(2)
    expect(pageForRow(15)).toBe(2)
    expect(pageForRow(30)).toBe(3)
    expect(pageForRow(0)).toBe(1)
    expect(pageForRow('x')).toBe(1)
    const html = sk({ hl: 15, pages: { sk: pageForRow(15) } })
    expect(rowNums(html)).toContain(15)
    expect(html.match(/<li id="rd-sk-15"[^>]*>/)[0]).toContain('hl')
  })
  it('page arguments are validated: bad lists, bad pages and extra text are rejected', () => {
    expect(parsePageArg('sk:2')).toEqual({ list: 'sk', page: 2 })
    expect(parsePageArg('skDrop:0')).toEqual({ list: 'skDrop', page: 1 })
    expect(parsePageArg('ai:999999')).toEqual({ list: 'ai', page: 999999 })
    for (const bad of ['', undefined, null, 'sk', 'sk:', 'sk:x', 'sk:-1', 'sk:1000000', 'other:2', 'sk:2:3', ' sk:2', 'sk:2 ', 'SK:2', '__proto__:2']) expect(parsePageArg(bad), String(bad)).toBeNull()
    for (const ok of ['sk', 'ai', 'skDrop']) expect(parsePageList(ok)).toBe(ok)
    for (const bad of ['', undefined, 'sk:2', 'x', 'SK', 'sk ']) expect(parsePageList(bad), String(bad)).toBeNull()
  })
  it('the dropped-skills fold is open only right after one of its pages was chosen, so it can be closed', () => {
    const open = (radar) => /<details class="rd-fold"( open)?><summary class="small">/.exec(sk(radar, jobs('15-1252.00')))
    expect(open({})[1]).toBeUndefined()
    expect(open({ pages: { skDrop: 2 } })[1]).toBeUndefined()
    expect(open({ pages: { skDrop: 2 }, openDrop: true })[1]).toBe(' open')
  })
  it('the disabled previous button label is escaped', () => {
    expect(sk()).toMatch(/aria-label="Previous page" disabled>‹<\/button>/)
  })
  it('app wiring: page actions, corner pages, search and job reset', () => {
    expect(app).toMatch(/rdPage: \(arg\)/)
    expect(app).toMatch(/rdPageGo: \(list\)/)
    expect(app).toContain('pageForRow(n)')
    expect(app).not.toMatch(/\/ 10/)
    expect(app).toMatch(/skCorner: [\s\S]*?withPage\(/)
    expect(app).toMatch(/aiCorner: [\s\S]*?withPage\(/)
    expect(app).toMatch(/aiJob: [^\n]*pages:/)
    expect(app).toMatch(/setRadar\(\{ q: event\.target\.value, pages: withPage\(/)
  })
  it('the page bar has its own rd- styles with variables only', () => {
    for (const c of ['.rd-pagerow', '.rd-pager', '.rd-pg', '.rd-goto', '.rd-gap-dots']) expect(css).toContain(c)
    const block = css.split('\n').filter((l) => /^\.rd-(pagerow|pager|pg|goto|goin|gap-dots)/.test(l)).join('\n')
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i)
  })

  it('several jobs without in-demand software are one fold line with the release; job links inside; source link next to it', () => {
    const html = skillsChartCard(ctx(jobs('29-1141.00', '15-1252.00', '31-1131.00', '29-1171.00')))
    const fold = html.match(/<details class="rd-fold">(?:(?!<\/details>)[\s\S])*in-demand software(?:(?!<\/details>)[\s\S])*<\/details>/)?.[0] ?? ''
    expect(fold).toBeTruthy()
    expect(unesc(fold)).toMatch(/<summary[^>]*>\d+ of your jobs list no in-demand software \(O\*NET database 30\.3\)<\/summary>/)
    expect(fold).toContain('https://www.onetonline.org/link/summary/29-1141.00')
    expect(html).toContain('https://www.onetcenter.org/database.html')
  })
  it('one job without in-demand software stays a plain note, no fold', () => {
    const html = skillsChartCard(ctx(jobs('29-1141.00')))
    expect(html).not.toContain('<details')
    expect(unesc(html)).toContain('O*NET lists no in-demand software for')
  })
  it('No chart is drawn only when there are no corners; otherwise "adds no corners"', () => {
    const none = skillsChartCard(ctx(jobs('29-1141.00')))
    expect(unesc(none)).toContain('No chart is drawn.')
    expect(none).not.toContain('<polygon')
    const some = skillsChartCard(ctx(jobs('15-1252.00', '29-1141.00')))
    expect(some).toContain('<polygon')
    expect(unesc(some)).not.toContain('No chart is drawn.')
    expect(unesc(some)).toContain(t('rdSkNoneSome1'))
    const many = skillsChartCard(ctx(jobs('15-1252.00', '29-1141.00', '31-1131.00')))
    expect(unesc(many)).not.toContain('No chart is drawn.')
    expect(unesc(many)).toContain(t('rdSkNoneSome'))
    const allNone = skillsChartCard(ctx(jobs('29-1141.00', '31-1131.00')))
    expect(unesc(allNone)).toContain(t('rdSkNoChart'))
    expect(unesc(allNone)).not.toContain(t('rdSkNoneSome'))
  })
  it('the code chain is a fold: one summary line with the step count, steps and links inside, a source link beside it', () => {
    const html = skillsChartCard(ctx(emasco('2512-02')))
    const fold = html.match(/<details class="rd-fold">(?:(?!<\/details>)[\s\S])*Code chain(?:(?!<\/details>)[\s\S])*<\/details>/)?.[0] ?? ''
    expect(fold).toBeTruthy()
    expect(unesc(fold)).toMatch(/<summary[^>]*>Code chain for eMASCO 2512-02: \d+ official steps<\/summary>/)
    expect(fold).toContain('https://www.bls.gov/soc/isco_soc_crosswalk.xls')
    const after = html.slice(html.indexOf('</details>'), html.indexOf('</details>') + 400)
    expect(after).toMatch(/<a href="https:/)
  })
  it('a broken chain stop note stays visible, not in a fold', () => {
    const html = skillsChartCard(ctx(emasco('1121-01')))
    expect(html).not.toContain('<details')
    expect(unesc(html)).toContain('Not available for eMASCO 1121-01')
  })
  it('new strings exist in en, ms and zh with the review comment; the page state has no score words', () => {
    const keys = ['rdPages', 'rdPrevPage', 'rdNextPage', 'rdPageN', 'rdGoToPage', 'rdGo', 'rdShowingRows', 'rdSkNoneFold', 'rdSkNoneOne', 'rdSkNoneSome', 'rdSkNoneSome1', 'rdSkNoChart', 'rdChainFold']
    for (const lang of ['en', 'ms', 'zh']) {
      const lines = readFileSync(`shared/strings/${lang}.js`, 'utf8').split('\n')
      for (const key of keys) {
        const line = lines.find((l) => l.trimStart().startsWith(`${key}:`))
        expect(line, `${lang}.${key}`).toBeTruthy()
        if (lang !== 'en') expect(line, `${lang}.${key}`).toMatch(/\/\/ translation: owner review\r?$/)
      }
    }
    const attrs = (sk({ pages: { sk: 2 } }).match(/data-(?:act|arg|form)="[^"]*"/g) ?? []).join(' ').toLowerCase()
    expect(attrs).not.toMatch(/score|weight|rank|match|opportunit/)
    expect(app).not.toMatch(/pages:[^\n]*(score|weight|rank|opportunit)/i)
  })
})

// Owner, 1 Nov 2026: the AI news moved from Compare futures into the Radar: For You shows the news for the user's own
// study fields, Explore all trends the news of any field.
describe('AI news inside the Radar tabs', () => {
  const news = { field: null, loading: false, failed: false, data: { enabled: true, source: 'DeepSeek Search', refreshEveryHours: 3, nextRunAt: '2026-10-31T09:00:00.000Z', rules: { maxItems: 25, maxAgeDays: 30, language: 'en' }, checkedBy: 'deepseek-flash', fields: [{ code: '06', title: 'Information and Communication Technologies (ICTs)', query: 'q', searchedAt: '2026-10-31T06:00:00.000Z', lastAttemptAt: '2026-10-31T06:00:00.000Z', lastOutcome: 'ok', dropped: 0, items: [{ title: 'ICT story', url: 'https://e.com/1', site: 'E', date: '2026-10-30T00:00:00Z', snippet: 's' }] }, { code: '01', title: 'Education', query: 'q', searchedAt: null, lastAttemptAt: null, lastOutcome: null, dropped: 0, items: [] }] } }
  const withField = (p) => ({ ...p, education: { ...(p.education ?? {}), records: [{ field: { code: '0613', title: 'Software' } }] } })
  const page = (prof, tab) => radarView({ t, state: { lang: 'en', profile: prof, radar: tab ? { tab } : {}, news }, data: linked() })

  it('For You ends with the news for the user\'s field', () => {
    const html = page(withField(ownProfile()), 'fy')
    expect(html).toContain(t('nwTitleYou'))
    expect(html).toContain('ICT story')
    expect(html).not.toContain('data-act="newsField"')
  })

  it('Explore all trends ends with the field picker and one field\'s news', () => {
    const html = page(withField(ownProfile()), 'ex')
    expect(html).toContain(t('nwTitleAll'))
    expect(html).toContain('data-act="newsField"')
  })

  it('the news shows in For You even while the AI usage question is asked', () => {
    const html = page(withField({ ...ownProfile(), aiTasks: undefined }), 'fy')
    expect(html).toContain(t('nwTitleYou'))
  })
})
