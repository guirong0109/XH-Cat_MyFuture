import { describe, expect, it } from 'vitest'
import en from '../shared/strings/en.js'
import ms from '../shared/strings/ms.js'
import zh from '../shared/strings/zh.js'
import { LANGS, t } from '../shared/i18n.js'

describe('strings', () => {
  it('every key exists in en, ms and zh', () => {
    const keys = Object.keys(en).sort()
    expect(Object.keys(ms).sort()).toEqual(keys)
    expect(Object.keys(zh).sort()).toEqual(keys)
    for (const table of [ms, zh]) for (const key of keys) expect(String(table[key]).trim()).not.toBe('')
  })

  it('t fills placeholders and falls back to English', () => {
    expect(LANGS).toEqual(['en', 'ms', 'zh'])
    expect(t('ms', 'start')).toBe(ms.start)
    expect(t('fr', 'start')).toBe(en.start)
    expect(t('en', 'no-such-key')).toBe('no-such-key')
    expect(t('en', 'langPrompt', { cv: 'English', ui: 'Bahasa Melayu' })).toBe(
      'Your CV appears to be written in English. Would you like to continue in Bahasa Melayu or switch to English?',
    )
  })
})
