import { describe, expect, it } from 'vitest'
import upload from '../public/js/screens/upload.js'
import { emptyProfile } from '../shared/profileSchema.js'
import { t as translate } from '../shared/i18n.js'

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

describe('DeepSeek reads every CV: upload notice and fallback line', () => {
  const real = (lang) => (key, vars) => translate(lang, key, vars)
  const page = (lang, cv) => upload({ t: real(lang), state: { profile: emptyProfile({ inputMethod: 'cv' }), lang, features: { tempCopy: true }, cv } })

  it('the upload notice names DeepSeek and China in en, ms and zh, and the old server-copy line is gone', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const html = page(lang, { phase: 'idle' })
      expect(html).toContain(translate(lang, 'cvPrivacy'))
      expect(translate(lang, 'cvPrivacy')).toContain('DeepSeek')
      expect(html).not.toContain(translate('en', 'cvPrivacyServer'))
    }
    expect(translate('en', 'cvPrivacy')).toBe('Your CV is read by DeepSeek AI (stored in China) to improve accuracy. You check everything before it is saved.')
    expect(translate('ms', 'cvPrivacy')).toContain('China')
    expect(translate('zh', 'cvPrivacy')).toContain('中国')
  })

  it('the ready receipt shows the AI-not-used line only when the server said so', () => {
    const ready = { phase: 'ready', language: 'en' }
    expect(page('en', { ...ready, warnings: ['ai_unavailable'] })).toContain('AI reading was not available this time; please check carefully.')
    expect(page('en', { ...ready, warnings: ['ai_limit'] })).toContain('AI reading is paused for a while; please check carefully.')
    const none = page('en', { ...ready, warnings: [] })
    expect(none).not.toContain('AI reading was not')
    expect(none).not.toContain('AI reading is paused')
    expect(page('en', ready)).not.toContain('AI reading')
  })
})
