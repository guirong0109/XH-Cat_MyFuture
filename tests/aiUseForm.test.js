import { describe, expect, it } from 'vitest'
import form, { SECTIONS } from '../public/js/screens/form.js'
import { emptyProfile } from '../shared/profileSchema.js'

const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k)

describe('profile section Using AI (M17)', () => {
  it('has a sixth section Using AI with four drop-downs, Prefer not to say by default, and the UNESCO source', () => {
    expect(SECTIONS[5]).toBe('secAi')
    const html = form({ t, state: { section: 5, profile: emptyProfile() } })
    expect(html.match(/data-aiuse="(mindset|ethics|apply|design)"/g)).toHaveLength(4)
    expect(html).toContain('10.54675/JKJB9835')
    expect(html).toContain('target="_blank" rel="noopener"')
    expect(html.match(/<option value="" selected>/g)).toHaveLength(4)
    expect(html).toContain('aiKnowHowNone')
  })
  it('shows the know-how line from the answers', () => {
    const profile = { ...emptyProfile(), aiUse: { mindset: 'yes', ethics: 'yes', apply: 'yes', design: 'no' } }
    expect(form({ t, state: { section: 5, profile } }).replaceAll("&quot;", "\"")).toContain('aiKnowHowLine:{"percent":75,"yes":3,"answered":4}')
  })
  it('a profile without aiUse still renders', () => {
    const profile = emptyProfile(); delete profile.aiUse
    expect(form({ t, state: { section: 5, profile } }).match(/data-aiuse=/g)).toHaveLength(4)
  })
})
