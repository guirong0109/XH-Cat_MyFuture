import { describe, expect, it } from 'vitest'
import upload from '../public/js/screens/upload.js'
import { emptyProfile } from '../shared/profileSchema.js'

const t = (key) => key
const ready = () => upload({ t, state: { profile: emptyProfile({ inputMethod: 'cv' }), lang: 'en', cv: { phase: 'ready', language: 'en' } } })

describe('after a CV is read, the only way on is to edit it in the form (owner, 31 Oct: the reading is never fully correct)', () => {
  it('shows one button, "Edit in the form", as the main button', () => {
    const html = ready()
    expect(html).toContain('<button class="btn pri" data-go="form"')
    expect(html).toContain('cvToForm')
    expect(html).not.toContain('data-go="review"')
    expect(html).not.toContain('cvToReview')
    expect(html).not.toContain('cvAnother')
    expect(html.match(/<button /g)).toHaveLength(1)
  })
})
