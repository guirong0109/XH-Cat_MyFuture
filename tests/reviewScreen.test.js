import { describe, expect, it } from 'vitest'
import { profileTable } from '../public/js/screens/review.js'
import form from '../public/js/screens/form.js'
import { emptyProfile, makeSkill } from '../shared/profileSchema.js'
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
  it('a field the AI read differently is shown as "AI read this as", naming the field', () => {
    const html = cvNote(real, { extraction: { method: 'rules', evidence: 'x', aiDiffers: { jobTitle: 'IT Support Exec', institution: 'UiTM' } } })
    expect(html).toContain('Job title — AI read this as: IT Support Exec. Check it.')
    expect(html).toContain('Institution — AI read this as: UiTM. Check it.')
  })
  it('a field the AI filled in says so, naming the field, beside the CV tag', () => {
    const html = cvNote(real, { extraction: { method: 'rules', evidence: 'x', aiFilled: ['employer', 'fieldOfStudy'] } })
    expect(html).toContain(real('tagFromCv'))
    expect(html).toContain('Employer: filled in by AI — check it.')
    expect(html).toContain('Field of study (major): filled in by AI — check it.')
  })
  it('field names in the notes use the project labels and the user language', () => {
    const html = cvNote(real, { extraction: { method: 'rules', evidence: 'x', aiFilled: ['description'], aiDiffers: { title: 'Flood' } } })
    expect(html).toContain('What you did: filled in by AI — check it.')
    expect(html).toContain('Project — AI read this as: Flood. Check it.')
    const ms = cvNote((key, vars) => translate('ms', key, vars), { extraction: { method: 'rules', evidence: 'x', aiFilled: ['qualification'] } })
    expect(ms).toContain(translate('ms', 'aiFilledField', { field: translate('ms', 'qualification') }))
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

describe('AI text on screen is escaped', () => {
  const BAD = '<img src=x onerror=alert(1)>'
  const real = (key, vars) => translate('en', key, vars)
  const aiEx = { method: 'ai', evidence: BAD }
  const profile = () => ({
    ...emptyProfile({ inputMethod: 'cv' }),
    employment: { ...emptyProfile().employment, records: [{ jobTitle: BAD, employer: '', period: '', years: null, userConfirmed: false, extraction: aiEx }] },
    skills: [makeSkill({ name: BAD, source: 'cv_ai', extraction: aiEx })],
  })
  const safe = (html) => {
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  }
  it('in "AI read this as" and "filled in by AI" lines', () => {
    safe(cvNote(real, { extraction: { method: 'rules', evidence: 'x', aiDiffers: { jobTitle: BAD, [BAD]: 'y' }, aiFilled: [BAD] } }))
  })
  it('in an AI-only skill chip', () => {
    const html = form({ t: real, state: { section: 2, profile: profile(), occ: {}, pick: {}, otherOpen: true } })
    safe(html)
    expect(html).toContain('? &lt;img src=x onerror=alert(1)&gt; <small>')
  })
  it('in an AI-only job card', () => {
    const html = form({ t: real, state: { section: 1, profile: profile(), occ: {}, pick: {} } })
    safe(html)
    expect(html).toContain('value="&lt;img src=x onerror=alert(1)&gt;"')
  })
})
