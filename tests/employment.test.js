import { describe, expect, it } from 'vitest'
import form, { SECTION_FIELDS, toYears } from '../public/js/screens/form.js'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile, val } from '../shared/profileSchema.js'
import { setField } from '../shared/profileState.js'
import { t as translate } from '../shared/i18n.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const q = (text) => text.replace(/"/g, '&quot;')
const withJobs = (records) => ({ ...emptyProfile(), employment: { ...emptyProfile().employment, records } })
const work = (profile) => form({ t, state: { section: 1, profile, occ: {}, pick: {} } })

describe('Employment background: each job is a job title, then its years of work experience', () => {
  it('opens with a first job ready: Job title first, then Years as a number box with arrows', () => {
    const html = work(emptyProfile())
    const title = html.indexOf('data-rec="employment.records|0|jobTitle"')
    const years = html.indexOf('data-rec="employment.records|0|years"')
    expect(title).toBeGreaterThan(-1)
    expect(years).toBeGreaterThan(title)
    expect(html).toMatch(/<input id="jy-0" type="number" min="0" max="60" step="1" inputmode="numeric" data-rec="employment.records\|0\|years" value="">/)
    expect(html).toContain('data-act="addRec" data-arg="employment.records"')
    expect(html).not.toContain('data-act="delRec" data-arg="employment.records|0"')
  })

  it('asks nothing else: no employer, period, industries or overall years', () => {
    const html = work(withJobs([{ jobTitle: 'Audit associate', employer: 'Sample & Co', period: '2022 - now', years: 2 }]))
    for (const gone of ['|employer"', '|period"', 'data-list="employment.industries"', 'employment.yearsOfExperience']) expect(html).not.toContain(gone)
    expect(SECTION_FIELDS[1]).toEqual([])
  })

  it('a saved job shows its title and years, the standard-occupation finder and Remove', () => {
    const html = work(withJobs([{ jobTitle: 'Audit associate', years: 2 }]))
    expect(html).toContain('value="Audit associate"')
    expect(html).toMatch(/data-rec="employment.records\|0\|years" value="2">/)
    expect(html).toContain('data-act="occFind" data-arg="job|0"')
    expect(html).toContain('data-act="delRec" data-arg="employment.records|0"')
  })

  it('years are a whole or part number from 0 up; anything else is left empty', () => {
    expect(toYears('3')).toBe(3)
    expect(toYears('2.5')).toBe(2.5)
    expect(toYears('0')).toBe(0)
    for (const bad of ['', ' ', '-1', 'abc', '61']) expect(toYears(bad)).toBe(null)
  })

  it('the receipt shows each job with its years; employer and period from a CV still show', () => {
    const html = profileTable(t, withJobs([{ jobTitle: 'Audit associate', employer: 'Sample & Co', period: '2022 - now', years: 2 }]))
    expect(html).toContain(`Audit associate · Sample &amp; Co · 2022 - now · ${q('jobYears:{"n":2}')}`)
  })

  it('the overall years and industries show on the receipt only when a CV or an earlier profile has them', () => {
    const empty = profileTable(t, emptyProfile())
    expect(empty).not.toContain('fYears')
    expect(empty).not.toContain('fIndustries')
    const old = setField(setField(emptyProfile(), 'employment.yearsOfExperience', val(4)), 'employment.industries', ['Finance'])
    expect(profileTable(t, old)).toContain('fYears')
    expect(profileTable(t, old)).toContain('fIndustries')
  })

  it('the years wording exists in every language', () => {
    for (const lang of ['en', 'ms', 'zh']) expect(translate(lang, 'jobYears', { n: 2 })).toContain('2')
    expect(translate('en', 'jobYears', { n: 2 })).toBe('2 years')
  })
})

describe('the years box always shows its arrows', () => {
  it('the up/down arrows of number boxes are visible without hovering', async () => {
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/input\[type=number\]::-webkit-inner-spin-button[^{]*\{[^}]*opacity:1/)
  })
})
