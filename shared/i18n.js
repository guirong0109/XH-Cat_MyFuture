// Interface text in English, Bahasa Melayu and Chinese. The language changes only when the user picks another one.
import en from './strings/en.js'
import ms from './strings/ms.js'
import zh from './strings/zh.js'

export const LANGS = ['en', 'ms', 'zh']
const TABLES = { en, ms, zh }

// t('ms', 'switchLang', { cv: 'English' }) — falls back to English, then to the key itself.
export function t(lang, key, vars = {}) {
  const text = TABLES[lang]?.[key] ?? en[key] ?? key
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}
