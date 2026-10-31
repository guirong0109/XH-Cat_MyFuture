import { describe, expect, it } from 'vitest'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile } from '../shared/profileSchema.js'
import { t as translate } from '../shared/i18n.js'
import { cvNote } from '../public/js/components/fields.js'

const t = (key) => key

describe('review screen', () => {
  it('an occupation mapping without a chosen occupation does not break the page', () => {
    const profile = { ...emptyProfile(), occupationMappings: [{ term: 'Barista', kind: 'job', chosen: null, candidatesShown: 0 }] }
    expect(() => profileTable(t, profile)).not.toThrow()
    expect(profileTable(t, profile)).toContain('Barista')
  })
})

describe('AI tags on records (cvNote)', () => {
  const real = (key, vars) => translate('en', key, vars)
  it('an AI-only record says Found by AI and quotes the CV; a rules record keeps the CV tag', () => {
    const ai = cvNote(real, { extraction: { method: 'ai', evidence: 'Helpdesk at Acme' } })
    expect(ai).toContain('Found by AI — check it')
    expect(ai).toContain('Helpdesk at Acme')
    const rules = cvNote(real, { extraction: { method: 'rules', evidence: 'x' } })
    expect(rules).toContain(real('tagFromCv'))
    expect(rules).not.toContain('Found by AI')
  })
  it('a field the AI read differently is shown as "AI read this as"', () => {
    const html = cvNote(real, { extraction: { method: 'rules', evidence: 'x', aiDiffers: { jobTitle: 'IT Support Exec' } } })
    expect(html).toContain('AI read this as: IT Support Exec. Check it.')
  })
  it('no extraction, no note', () => {
    expect(cvNote(real, {})).toBe('')
  })
  it('the review screen has no Improve extraction with AI button', async () => {
    const mod = await import('../public/js/screens/review.js')
    const html = mod.default({ t: real, state: { profile: emptyProfile(), lang: 'en' } })
    expect(html).not.toContain('Improve extraction with AI')
    expect(html).not.toContain('data-act="aiOpen"')
  })
})
