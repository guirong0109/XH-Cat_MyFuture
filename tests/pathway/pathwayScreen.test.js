// Study pathway screen (#pathway, Task 8, spec §8, mockup docs/mockup-pathway.html). The render function is tested on a
// fixed answer in the shape of POST /api/pathway, and once on a real answer from the API (fixture data dir, port 0).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createRadarService } from '../../server/radar/service.js'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import { createMatchingServiceFromEnv } from '../../server/matching/service.js'
import { createPathwayServiceFromEnv } from '../../server/pathway/service.js'
import * as pathwayApi from '../../public/js/pathwayApi.js'
import { pathwayScreen, pathwayToSave } from '../../public/js/screens/pathway.js'
import { roleCard, stepText } from '../../public/js/screens/match.js'
import en from '../../shared/strings/en.js'
import ms from '../../shared/strings/ms.js'
import zh from '../../shared/strings/zh.js'
import { t as translate } from '../../shared/i18n.js'
import { FIXTURE, fixtureReferences } from '../helpers/matchingFixture.js'
import { makePathwayFixture } from '../helpers/pathwayFixture.js'

const t = (key, vars) => translate('en', key, vars)
const root = join(import.meta.dirname, '..', '..')
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const text = (html) => unesc(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ')

const search = (word) => [
  { site: 'elatih', name: 'e-LATiH (HRD Corp)', url: `https://elatih.hrdcorp.gov.my/courses?course=${encodeURIComponent(word)}`, checkedAt: '2026-10-31' },
  { site: 'coursera', name: 'Coursera', url: `https://www.coursera.org/search?query=${encodeURIComponent(word)}`, checkedAt: '2026-10-31' },
]
const MQR = 'https://www2.mqa.gov.my/mqr/english/ecarianakr.cfm'
const step = (o) => ({ kind: 'el', importance: 4, needed: 4, you: 2, status: 'below', from: 'basic', to: 'good', points: 10, stillShort: false, courses: [], search: search(o.name), ...o })
const SOURCES = [
  { id: 'onet', name: 'O*NET Database 31.0', url: 'https://www.onetcenter.org/dl_files/database/db_31_0_text.zip', date: '2026-10-30', licence: 'CC BY 4.0' },
  { id: 'bridge', name: 'Occupation bridge (eMASCO to O*NET)', url: null, date: '2026-10-30', licence: null },
  { id: 'emasco-qualification', name: 'eMASCO (MASCO 2020), English pages', url: 'https://emasco.mohr.gov.my', date: '2026-10-23', licence: null },
  { id: 'isced-cip', name: 'ISCED-F 2013 to CIP Canada 2016 concordance (Statistics Canada)', url: 'https://www.statcan.gc.ca/x.csv', date: '2026-10-30', licence: 'Statistics Canada Open Licence' },
  { id: 'cip-onet', name: '2020 CIP to O*NET-SOC 2019 crosswalk', url: 'https://www.onetcenter.org/crosswalks/cip/x.xlsx', date: '2026-10-30', licence: 'CC BY 4.0' },
  { id: 'pathway-picks', name: 'FutureReady team picks (owner review in Admin)', url: null, date: '2026-10-31', licence: null },
  { id: 'site:elatih', name: 'e-LATiH (HRD Corp)', url: 'https://elatih.hrdcorp.gov.my/', date: '2026-10-31', licence: null },
  { id: 'site:coursera', name: 'Coursera', url: 'https://www.coursera.org/', date: '2026-10-31', licence: null },
]
const COURSE = { id: 'c1', for: 'kn:2.C.3.a', site: 'elatih', name: 'Computer Fundamentals', link: 'https://elatih.hrdcorp.gov.my/courses-details/1234', checkedAt: '2026-10-31', type: 'course', approvedAt: null }
const COURSE_OK = { id: 'c2', for: 'kn:2.C.3.a', site: 'coursera', name: 'Approved Course', link: 'https://www.coursera.org/learn/x', checkedAt: '2026-10-30', type: 'course', approvedAt: '2026-10-31T09:00:00.000Z' }

// A role with every part: two fields (0611 partial, 0613 yours), two gaps, one not assessed, one met.
const ANSWER = {
  code: '2521-03',
  title: 'Fixture Database Designer',
  qualification: { text: 'Degree', url: 'https://emasco.mohr.gov.my/masco/2521-03' },
  onet: { code: '15-1243.00', title: 'Database Architects' },
  chain: { path: [], missingStep: null },
  skillMatch: 71,
  provisional: true,
  reason: null,
  route: {
    education: {
      top: [{ category: 6, label: "Bachelor's Degree", percent: 55 }],
      all: [{ category: 4, label: 'Associate Degree', percent: 0 }, { category: 6, label: "Bachelor's Degree", percent: 55 }, { category: 7, label: 'Post-Baccalaureate Certificate', percent: 45 }],
      suppressedLeftOut: 1,
    },
    fields: [
      {
        code: '0611', title: 'Computer use', partial: true, yours: false,
        cips: [{ code: '11.0802', title: 'Data modelling/warehousing and database administration', partial: true }],
        programmes: [], professional: [], courses: [], search: search('Computer use'), mqr: { url: MQR, nec: '0614', necChecked: true },
      },
      {
        code: '0613', title: 'Software and applications development and analysis', partial: false, yours: true,
        cips: [{ code: '11.0802', title: 'Data modelling/warehousing and database administration', partial: false }],
        programmes: [
          { id: 'p1', field: '0613', kind: 'accredited', name: 'Bachelor of Computer Science (Software Engineering)', link: 'https://www.um.edu.my/programmes/bcs-se', checkedAt: '2026-10-31', institution: 'Universiti Malaya', mqrRef: 'MQA/FA1234', type: 'programme', for: 'field:0613', approvedAt: '2026-10-31T10:00:00.000Z' },
          { id: 'p2', field: '0613', kind: 'accredited', name: 'BSc Software Engineering', link: 'https://www.utm.my/se', checkedAt: '2026-10-29', institution: 'UTM', type: 'programme', for: 'field:0613', approvedAt: null },
        ],
        professional: [{ id: 'p3', field: '0613', kind: 'professional', name: 'Professional Technologist (Ts.)', link: 'https://www.mbot.org.my/', checkedAt: '2026-10-31', body: 'MBOT', type: 'programme', for: 'field:0613', approvedAt: null }],
        courses: [{ id: 'c3', for: 'field:0613', site: 'elatih', name: 'Basic of Programming', link: 'https://elatih.hrdcorp.gov.my/courses-details/basic-of-programming', checkedAt: '2026-10-31', type: 'course', approvedAt: null }],
        search: search('Software and applications development and analysis'), mqr: { url: MQR, nec: null, necChecked: false },
      },
    ],
  },
  steps: {
    gaps: [
      step({ key: 'kn:2.C.3.a', name: 'Computers and Electronics', kind: 'kn', needed: 4, you: 2, from: 'basic', to: 'good', points: 29, courses: [COURSE, COURSE_OK] }),
      step({ key: 'el:2.B.4.g', name: 'Systems Analysis', needed: 6.5, you: 0, status: 'missing', from: null, to: 'expert', points: 21, stillShort: true }),
    ],
    notAssessed: [step({ key: 'el:2.A.2.b', name: 'Active Learning', needed: 3.62, you: 3.62, status: 'not_assessed', from: null, to: 'good', points: null })],
    met: [step({ key: 'el:2.A.1.a', name: 'Reading Comprehension', needed: 3, you: 4, status: 'met', from: 'good', to: 'good', points: null })],
  },
  sources: SOURCES,
}
const OTHER = { ...ANSWER, code: '2411-01', title: 'Fixture Accountant', skillMatch: 40, route: { ...ANSWER.route, education: null }, qualification: { text: null, url: null } }
const BROKEN = {
  code: '2512-01', title: 'Fixture Software Developer', qualification: { text: 'Bachelor’s degree or equivalent', url: 'https://emasco.mohr.gov.my/masco/2512-01' }, onet: null,
  chain: { path: [], missingStep: { id: 'soc2010_to_isco08', kind: 'no_row', from: { system: 'ISCO-08', codes: ['2512'] }, reason: 'ISCO-08 2512 has no row' } },
  skillMatch: null, provisional: false, reason: 'chain_broken', route: null, steps: null, sources: SOURCES,
}
const THIN = { ...ANSWER, skillMatch: null, provisional: false, reason: 'no_known_skill', steps: null }

const target = (code, title) => ({ code, title, addedAt: '2026-10-31' })
const PROFILE = { profileStatus: 'confirmed', education: { records: [{ qualification: 'Diploma', field: { code: '0613', title: 'Software and applications development and analysis' } }] }, skills: [] }
const view = (pathway, profile = PROFILE) => pathwayScreen({ t, lang: 'en', state: { lang: 'en', profile, pathway: { targets: [], active: null, progress: {}, answers: {}, ...pathway } } })
const two = (extra = {}) => view({
  targets: [target(ANSWER.code, ANSWER.title), target(OTHER.code, OTHER.title)], active: ANSWER.code,
  answers: { [ANSWER.code]: ANSWER, [OTHER.code]: OTHER }, ...extra,
})

describe('Study pathway screen', () => {
  it('no target: a line pointing to Career matching', () => {
    const html = view({})
    expect(text(html)).toContain(t('pwNoTarget'))
    expect(html).toMatch(/data-go="match"/)
    expect(html).not.toContain('data-act="pwRemove"')
  })

  it('one tab per target with remove, each with its Skill Match and progress counts', () => {
    const html = two({ progress: { 'kn:2.C.3.a': { state: 'started', at: '2026-10-31' }, 'el:2.B.4.g': { state: 'done', at: '2026-10-31' } } })
    expect([...html.matchAll(/data-act="pwTab" data-arg="([^"]+)"/g)].map((m) => m[1])).toEqual(['2521-03', '2411-01'])
    expect([...html.matchAll(/data-act="pwRemove" data-arg="([^"]+)"/g)].map((m) => m[1])).toEqual(['2521-03', '2411-01'])
    expect(text(html)).toContain('Skill Match 71%')
    expect(text(html)).toContain('Skill Match 40%')
    expect(text(html)).toContain('2 to build · 1 started · 1 done')
    expect(html).toMatch(/class="pw-tgt on"[^>]*>\s*<button[^>]*data-arg="2521-03"/)
    // the role header: title, Skill Match now, the O*NET job matching used
    expect(text(html)).toContain(t('pwSkillMatchNow'))
    expect(text(html)).toContain('Database Architects (15-1243.00)')
  })

  it('Part 1: eMASCO qualification first, then In the US with the top level and percent; 0% rows folded out', () => {
    const html = two()
    const s = text(html)
    expect(s).toContain('Degree')
    expect(s).toContain('eMASCO, Malaysia')
    expect(s.indexOf('eMASCO, Malaysia')).toBeLessThan(s.indexOf('In the US'))
    expect(s).toContain("In the US: Bachelor's Degree, 55% of workers in this job who were asked")
    expect(s).toContain('All education levels (US)')
    expect(s).toContain('Post-Baccalaureate Certificate')
    expect(s).not.toContain('Associate Degree')
    expect(s).toContain(t('pwEduZero'))
    expect(s).toContain(t('pwEduSuppressed', { count: 1 }))
  })

  it('Part 1: no education rows and no qualification say so', () => {
    const s = text(two({ active: OTHER.code }))
    expect(s).toContain('O*NET has no education data for this job')
    expect(s).toContain('eMASCO lists no qualification for this role')
  })

  it('broken chain: the qualification and the missing step only, no Part 2', () => {
    const html = view({ targets: [target(BROKEN.code, BROKEN.title)], active: BROKEN.code, answers: { [BROKEN.code]: BROKEN } })
    const s = text(html)
    expect(s).toContain('Bachelor’s degree or equivalent')
    expect(s).toContain('eMASCO, Malaysia')
    expect(s).toContain(t('mtNotAvailable'))
    expect(s).toContain(stepText(t, BROKEN.chain.missingStep))
    expect(s).not.toContain('In the US')
    expect(s).not.toContain(t('pwFieldsTitle'))
    expect(s).not.toContain(t('pwPart2Title'))
    expect(html).not.toContain('data-act="pwStarted"')
  })

  it('fields: partial link, your field, programmes and professional picks with review labels, no team pick yet, More on, MQA register', () => {
    const html = two()
    const s = text(html)
    const f0611 = html.slice(html.indexOf('>ISCED-F 0611<'), html.indexOf('>ISCED-F 0613<'))
    const f0613 = html.slice(html.indexOf('>ISCED-F 0613<'), html.indexOf('data-src="fields"'))
    expect(text(f0611)).toContain('partial link')
    expect(text(f0611)).not.toContain('your field')
    expect(text(f0611)).toContain('No team pick yet')
    expect(text(f0613)).toContain('your field')
    expect(text(f0613)).not.toContain('partial link')
    expect(html).toMatch(/class="pw-field pw-yours"/)
    // the CIP fold
    expect(text(f0613)).toContain('11.0802 Data modelling/warehousing and database administration')
    // accredited: institution, linked name, MQA ref or "not shown on the page", checked date, approved date only when approved
    expect(f0613).toContain('href="https://www.um.edu.my/programmes/bcs-se"')
    expect(text(f0613)).toContain('Universiti Malaya')
    expect(text(f0613)).toContain('MQA ref MQA/FA1234 · checked 2026-10-31')
    expect(text(f0613)).toContain('MQA ref not shown on the page · checked 2026-10-29')
    expect(text(f0613)).toContain('approved by owner on 2026-10-31')
    expect(text(f0613).match(/approved by owner/g)).toHaveLength(1)
    // professional: the body, the link, checked date
    expect(text(f0613)).toContain('MBOT')
    expect(f0613).toContain('href="https://www.mbot.org.my/"')
    expect(text(f0613)).toContain(t('pwProfessional'))
    // courses for the field and the field's search links
    expect(text(f0613)).toContain(t('pwFieldCourses'))
    expect(text(f0613)).toContain('Basic of Programming')
    expect(text(f0613)).toContain('More on')
    expect(f0613).toContain('href="https://www.coursera.org/search?query=Software%20and%20applications%20development%20and%20analysis"')
    // MQA register: link, NEC field code, the label
    expect(f0613).toContain(`href="${MQR}"`)
    // no NEC code (MQR numbers this range differently): the field's title, no code-match tag
    expect(text(f0613)).toContain('choose the NEC field for Software and applications development and analysis')
    expect(text(f0613)).not.toContain('choose NEC field')
    expect(text(f0613)).not.toContain('code match, not an official table')
    // a pair checked by name in MQR: the NEC code and its own label, no code-match tag
    expect(text(f0611)).toContain('choose NEC field 0614')
    expect(text(f0611)).toContain('NEC code checked in MQR')
    expect(text(f0611)).not.toContain('code match, not an official table')
  })

  it('a field whose code is used as the NEC code keeps the "code match, not an official table" label', () => {
    const f = { ...ANSWER.route.fields[0], code: '0411', title: 'Accounting and taxation', mqr: { url: MQR, nec: '0411', necChecked: false } }
    const a = { ...ANSWER, route: { ...ANSWER.route, fields: [f] } }
    const s = text(view({ targets: [target(a.code, a.title)], active: a.code, answers: { [a.code]: a } }))
    expect(s).toContain('choose NEC field 0411')
    expect(s).toContain('code match, not an official table')
    expect(s).not.toContain('NEC code checked in MQR')
  })

  it('never says "team draft" or "not yet reviewed" on #pathway (P15), in any language', () => {
    for (const html of [two(), view({ targets: [target(BROKEN.code, BROKEN.title)], active: BROKEN.code, answers: { [BROKEN.code]: BROKEN } })]) {
      expect(text(html)).not.toMatch(/team draft|not yet reviewed/i)
    }
    for (const table of [en, ms, zh]) {
      for (const [key, value] of Object.entries(table)) if (key.startsWith('pw')) expect(value).not.toMatch(/team draft|not yet reviewed|draf pasukan|团队草稿|尚未审核/i)
    }
    // a pick not yet reviewed shows its site and checked date, no label
    const s = text(two())
    expect(s).toContain('e-LATiH (HRD Corp) Computer Fundamentals ↗ checked 2026-10-31')
  })

  it('Part 2: gaps in answer order with your level → needed words and points; not-assessed group; provisional; folded met group', () => {
    const html = two()
    const s = text(html)
    expect(s.indexOf('Computers and Electronics')).toBeLessThan(s.indexOf('Systems Analysis'))
    expect(s).toContain('Your level basic → needed good')
    expect(s).toContain('Not in your profile → needed expert')
    expect(s).toContain('(O*NET level 4.0 of 7)')
    expect(s).toContain(t('mtStillShort'))
    expect(s).toContain('+29')
    expect(s).toContain('+21')
    expect(s).toContain(t('pwPoints'))
    // courses: approved one dated, the other with no label; then the search links
    expect(s).toContain('Approved Course ↗ approved by owner on 2026-10-31 checked 2026-10-30')
    expect(html).toContain('href="https://www.coursera.org/search?query=Computers%20and%20Electronics"')
    // a gap with no course: no team pick yet
    const sys = html.slice(html.indexOf('Systems Analysis'), html.indexOf(t('pwNaTitle')))
    expect(text(sys)).toContain('No team pick yet')
    // not assessed yet: own group, a link to the profile skills section
    expect(s).toContain(t('pwNaTitle'))
    const na = html.slice(html.indexOf(t('pwNaTitle')))
    expect(na).toContain('data-act="editSkills"')
    expect(text(na)).toContain('Active Learning')
    // provisional banner, with a link to set the levels
    expect(s).toContain(t('pwProvText', { count: 1 }))
    const banner = html.slice(html.indexOf('pw-prov'), html.indexOf('pw-prov') + 600)
    expect(banner).toContain('data-act="editSkills"')
    // already at the level: folded
    expect(html).toMatch(/<details[^>]*>\s*<summary>Already at the level \(1\)<\/summary>[\s\S]*Reading Comprehension/)
  })

  it('started / done, labelled self-reported, reflect progress for the same key across two targets', () => {
    const progress = { 'kn:2.C.3.a': { state: 'done', at: '2026-10-31' } }
    for (const active of [ANSWER.code, OTHER.code]) {
      const html = two({ active, progress })
      expect(html).toContain('data-act="pwClear" data-arg="kn:2.C.3.a" aria-pressed="true"')
      expect(html).toContain('data-act="pwStarted" data-arg="kn:2.C.3.a" aria-pressed="false"')
      expect(html).toContain('data-act="pwStarted" data-arg="el:2.B.4.g" aria-pressed="false"')
      expect(html).toContain('data-act="pwDone" data-arg="el:2.B.4.g" aria-pressed="false"')
      expect(text(html)).toContain('self-reported')
      expect(text(html)).toContain(t('pwDoneNote'))
    }
    const started = two({ progress: { 'el:2.B.4.g': { state: 'started', at: '2026-10-31' } } })
    expect(started).toContain('data-act="pwClear" data-arg="el:2.B.4.g" aria-pressed="true"')
    expect(started).toContain('data-act="pwDone" data-arg="el:2.B.4.g" aria-pressed="false"')
    // the not-assessed step has the buttons too
    expect(started).toContain('data-act="pwStarted" data-arg="el:2.A.2.b"')
  })

  it('thin profile (steps null, no_known_skill): the reason text and a link to the profile skills; Part 1 still shows', () => {
    const html = view({ targets: [target(THIN.code, THIN.title)], active: THIN.code, answers: { [THIN.code]: THIN } })
    const s = text(html)
    expect(s).toContain(t('pwThin'))
    const part2 = html.slice(html.indexOf(t('pwPart2Title')))
    expect(part2).toContain('data-act="editSkills"')
    expect(s).toContain(t('pwFieldsTitle'))
    expect(html).not.toContain('data-act="pwStarted"')
  })

  it('404: not found and remove; loading and other errors', () => {
    const gone = view({ targets: [target('0000-00', 'Old role')], active: '0000-00', answers: { '0000-00': { error: 'not_found' } } })
    expect(text(gone)).toContain('Not found')
    expect(gone).toContain('data-act="pwRemove" data-arg="0000-00"')
    const loading = view({ targets: [target('2521-03', 'X')], active: '2521-03', answers: { '2521-03': { loading: true } } })
    expect(loading).toContain('class="spin"')
    const failed = view({ targets: [target('2521-03', 'X')], active: '2521-03', answers: { '2521-03': { error: 'network' } } })
    expect(text(failed)).toContain(t('pwError'))
    expect(failed).toMatch(/data-act="pwTab" data-arg="2521-03"[^>]*>[^<]*Try again/)
    // the active target falls back to the first one when the saved one is gone
    const fallback = two({ active: 'nope' })
    expect(fallback).toMatch(/class="pw-tgt on"[^>]*>\s*<button[^>]*data-arg="2521-03"/)
  })

  it('no profile: asks to build one first', () => {
    const html = view({ targets: [target('2521-03', 'X')], active: '2521-03' }, null)
    expect(text(html)).toContain(t('mtNoProfile'))
    expect(html).toContain('data-go="source"')
  })

  it('every list has a source line and the sources table names every source with date and licence', () => {
    const html = two()
    expect((html.match(/class="pw-src"/g) ?? []).length).toBeGreaterThanOrEqual(3)
    const table = html.slice(html.indexOf('pw-sources'))
    for (const name of ['O*NET Database 31.0', 'Occupation bridge (eMASCO to O*NET)', 'eMASCO (MASCO 2020), English pages', 'Statistics Canada', '2020 CIP to O*NET-SOC 2019 crosswalk', 'e-LATiH (HRD Corp)', 'Coursera']) {
      expect(text(table)).toContain(name)
    }
    expect(text(table)).toContain('FutureReady team picks (owner review in Admin)')
    expect(text(table)).toContain('2026-10-23')
    expect(text(table)).toContain('Statistics Canada Open Licence')
  })

  it('a course pick shows its site name (siteName), not the site id', () => {
    const fcc = { ...COURSE, id: 'c9', site: 'freecodecamp', siteName: 'freeCodeCamp', name: 'Responsive Web Design', link: 'https://www.freecodecamp.org/learn/x' }
    const a = { ...ANSWER, steps: { ...ANSWER.steps, gaps: [{ ...ANSWER.steps.gaps[0], courses: [fcc] }] } }
    const s = text(view({ targets: [target(a.code, a.title)], active: a.code, answers: { [a.code]: a } }))
    expect(s).toContain('freeCodeCamp Responsive Web Design ↗')
    expect(s).not.toContain('freecodecamp')
  })

  it('links open in a new tab with noopener; bad links are not links; every text is escaped', () => {
    const bad = {
      ...ANSWER, title: '<img src=x onerror=alert(1)>',
      steps: { ...ANSWER.steps, gaps: [step({ key: 'kn:x"><b>', name: '<script>alert(1)</script>', points: 5, courses: [{ ...COURSE, link: 'javascript:alert(1)', name: 'Bad <i>link</i>' }] })] },
    }
    const html = view({ targets: [target(bad.code, '<b>t</b>')], active: bad.code, answers: { [bad.code]: bad } })
    const anchors = html.match(/<a [^>]*>/g) ?? []
    expect(anchors.length).toBeGreaterThan(10)
    for (const a of anchors) {
      expect(a).toMatch(/target="_blank"/)
      expect(a).toMatch(/rel="noopener/)
      expect(a).toMatch(/href="https:\/\//)
    }
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>t</b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('data-arg="kn:x&quot;&gt;&lt;b&gt;"')
  })

  it('pathwayToSave keeps only targets, active and progress', () => {
    const p = { targets: [target('a', 'A')], active: 'a', progress: { k: { state: 'done', at: '2026-10-31' } }, answers: { a: ANSWER }, loading: true, error: 'x' }
    expect(pathwayToSave(p)).toEqual({ targets: [target('a', 'A')], active: 'a', progress: { k: { state: 'done', at: '2026-10-31' } } })
    expect(pathwayToSave(null)).toEqual({ targets: [], active: null, progress: {} })
    expect(pathwayToSave({ targets: 'x', active: 3, progress: [] })).toEqual({ targets: [], active: null, progress: {} })
  })
})

describe('Career matching card and app wiring', () => {
  it('the card button plans a study pathway', () => {
    const html = roleCard({ t, role: { code: '2521-03', title: 'X' } })
    expect(html).toMatch(/<button class="btn sm" type="button" data-act="pwPlan" data-arg="2521-03">Plan my study pathway<\/button>/)
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Plan my study pathway/)
  })

  it('the tab is "Study pathway" in three languages; #roadmap opens #pathway', () => {
    expect(en.pathway).toBe('Study pathway')
    for (const table of [en, ms, zh]) {
      expect(table.pathway).toBeTruthy()
      expect(table.roadmap).toBeUndefined()
    }
    const app = readFileSync(join(root, 'public/js/app.js'), 'utf8')
    expect(app).toMatch(/const NEXT = \['assess', 'radar', 'match', 'pathway', 'sdg', 'futures'\]/)
    expect(app).toMatch(/roadmap: 'pathway'/)
    expect(app).toMatch(/pathway: state\.pathway \? pathwayToSave\(state\.pathway\) : null/)
    // back / forward to #roadmap also shows #pathway in the address
    const popstate = app.slice(app.indexOf("window.addEventListener('popstate'"))
    expect(popstate.slice(0, popstate.indexOf('})'))).toContain("history.replaceState(null, '', '#pathway')")
    // progress and addedAt use the local date, not the UTC one
    const today = app.slice(app.indexOf('const today = '), app.indexOf('function setProgress'))
    expect(today).toMatch(/getFullYear\(\)[\s\S]*getMonth\(\) \+ 1[\s\S]*getDate\(\)/)
    expect(today).not.toContain('toISOString')
  })
})

describe('pathwayApi and the screen on a real answer', () => {
  let fixture
  let server
  let base
  beforeAll(async () => {
    fixture = await makePathwayFixture()
    const references = await loadRadarReferences('data')
    const now = () => new Date('2026-10-31T00:00:00.000Z')
    const store = createMemoryStore()
    const radar = createRadarService({ store, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor: null, now, log: () => {} })
    const matching = createMatchingServiceFromEnv({ dataDir: fixture.dir, radar, demo: null, access: null, references: fixtureReferences, now, log: () => {} })
    const pathway = createPathwayServiceFromEnv({ dataDir: fixture.dir, matching, store, now, log: () => {} })
    server = createApp({ radar, radarDemo: null, matching, pathway, d1: null, tempStore: null, llmProviders: [], onetLive: null, now }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    await fixture?.cleanup()
  })

  it('get answers {ok, data}; an unknown code gives not_found; the real answer renders', async () => {
    const skill = (name, canonicalId, proficiency) => ({ name, originalText: name, canonicalId, category: null, source: 'user_input', userConfirmed: true, proficiency, proficiencyStatus: 'self_reported', extraction: null })
    const profile = { profileStatus: 'confirmed', education: { records: [] }, employment: { records: [] }, occupationMappings: [], skills: [skill('Reading Comprehension', 'onet:el:2.A.1.a', 'good'), skill('Computers and Electronics', 'onet:kn:2.C.3.a', 'basic')] }
    const out = await pathwayApi.get(profile, FIXTURE.fullRole, { base, lang: 'en' })
    expect(out.ok).toBe(true)
    expect(out.data.code).toBe(FIXTURE.fullRole)
    expect(await pathwayApi.get(profile, '0000-00', { base })).toMatchObject({ ok: false, code: 'not_found' })
    const html = view({ targets: [target(FIXTURE.fullRole, out.data.title)], active: FIXTURE.fullRole, answers: { [FIXTURE.fullRole]: out.data } }, profile)
    const s = text(html)
    expect(s).toContain('Computer Fundamentals')
    expect(s).toContain('Universiti Malaya')
    expect(s).toContain('MQA ref MQA/FA1234')
    expect(s).toContain('MBOT')
    expect(s).toContain("In the US: Bachelor's Degree, 55% of workers in this job who were asked")
    expect(s).toContain('Skill Match 71%')
    expect(s).not.toMatch(/team draft|not yet reviewed/i)
  })
})
