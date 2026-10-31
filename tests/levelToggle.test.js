import { describe, expect, it } from 'vitest'
import form from '../public/js/screens/form.js'
import { emptyProfile, makeSkill } from '../shared/profileSchema.js'

const t = (key) => key
const skillsPage = (skills) => form({ t, state: { section: 2, profile: { ...emptyProfile(), skills }, occ: {}, pick: {} } })
const python = (proficiency = null) => ({ ...makeSkill({ name: 'Python', canonicalId: 'onet:tech:python', source: 'user_input' }), proficiency, proficiencyStatus: proficiency ? 'self_reported' : 'not_assessed' })
const segments = (html) => [...html.matchAll(/<button class="([^"]*)" role="radio" aria-checked="(true|false)" data-act="level" data-arg="0\|(\w*)">(\w+)<\/button>/g)]
  .map(([, cls, checked, value, label]) => ({ on: cls === 'on' && checked === 'true', value, label }))

describe('Skills and proficiency: the level is a toggle bar', () => {
  it('one bar of four segments in order, no dropdown', () => {
    const html = skillsPage([python()])
    expect(html).toContain('<div class="toggle" role="radiogroup"')
    expect(html).not.toContain('data-level=')
    expect(segments(html).map(({ value, label }) => [value, label])).toEqual([['', 'levelNone'], ['basic', 'basic'], ['good', 'good'], ['expert', 'expert']])
  })

  it('"Not assessed yet" is on until a level is chosen; then only that level is on', () => {
    expect(segments(skillsPage([python()])).filter((s) => s.on).map((s) => s.value)).toEqual([''])
    expect(segments(skillsPage([python('good')])).filter((s) => s.on).map((s) => s.value)).toEqual(['good'])
  })

  it('the bar looks like one connected switch', async () => {
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.toggle\{[^}]*display:inline-flex/)
    expect(css).toMatch(/\.toggle button\.on\{[^}]*background:var\(--ink\)/)
  })
})
