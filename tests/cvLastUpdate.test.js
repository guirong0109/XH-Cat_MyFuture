import { describe, expect, it } from 'vitest'
import upload from '../public/js/screens/upload.js'
import { emptyProfile } from '../shared/profileSchema.js'
import { t as translate } from '../shared/i18n.js'

// Owner, 1 Nov 2026: the CV screen header shows the last update so the owner can see the live site has the new version.
describe('CV screen header shows the last update date', () => {
  for (const lang of ['en', 'ms', 'zh']) {
    it(`in ${lang}, under the title`, () => {
      const t = (key, vars) => translate(lang, key, vars)
      const html = upload({ t, state: { profile: emptyProfile({ inputMethod: 'cv' }), lang, cv: { phase: 'idle' } } })
      const line = translate(lang, 'cvLastUpdate')
      expect(line).toContain('1')
      expect(line).not.toBe('cvLastUpdate')
      expect(html.indexOf(line)).toBeGreaterThan(html.indexOf('</h1>'))
    })
  }
  it('says 1 Nov 2026 in English', () => {
    expect(translate('en', 'cvLastUpdate')).toBe('Last update: 1 Nov 2026')
  })
})
