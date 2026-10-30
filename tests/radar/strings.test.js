import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import en from '../../shared/strings/en.js'
import ms from '../../shared/strings/ms.js'
import zh from '../../shared/strings/zh.js'
import { t } from '../../shared/i18n.js'

const root = join(import.meta.dirname, '..', '..')
const tables = { en, ms, zh }

// Only files that exist are scanned (screens and charts arrive in later tasks).
function radarSources() {
  const files = ['public/js/screens/radar.js', 'public/js/screens/radarAdmin.js']
  const dir = join(root, 'public/js/components/charts')
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.js')) files.push(`public/js/components/charts/${f}`)
  return files.filter((f) => existsSync(join(root, f)))
}

const fixed = {
  rdB1Title: 'Change in share of Malaysian online job advertisements',
  rdContextLabel: 'Quarter-on-quarter change in total online job advertisements — context only',
  rdNoFieldLinks: 'Insufficient verified connections for this field',
  rdNoRankings: 'Career rankings are not part of this module yet.',
  rdIce: 'Insufficient Comparable Evidence',
  rdIceReason:
    'A possible structural break in {period} makes year-on-year comparison unreliable until it is reviewed or until {next} data arrives.',
  rdDevStore: 'Development store — not durable',
  rdTooltip:
    'Research Momentum Index: how fast research papers on this topic grew over 3 years. 50 = same as before. Each doubling adds 20 points; each halving takes 20 away. It counts research papers — it does not measure jobs, hiring or how good the AI is.',
  rdWhyIndex:
    'AI research often grows by doubling, so we use doublings, not percentages. That keeps fast-growing topics apart instead of all hitting the top. We always show the real paper counts too, because a small topic can grow fast from very few papers.',
}

const required = [
  ...['rising', 'declining', 'stable', 'emerging', 'mixed', 'insufficient'].map((d) => `rdDir_${d}`),
  ...['low', 'moderate', 'high'].map((v) => `rdVol_${v}`),
  ...['sufficient', 'insufficient_evidence', 'insufficient_comparable_evidence'].map((v) => `rdSuff_${v}`),
  ...['strong', 'moderate', 'limited'].map((v) => `rdQual_${v}`),
  ...[
    'fewer_years', 'missing_value', 'dropped_to_zero', 'zero_baseline', 'steps_disagree', 'high_volatility',
    'revision_over_5', 'small_counts', 'new_reporting_category', 'possible_structural_break', 'not_material',
    'few_clean_steps', 'possible_break',
  ].map((c) => `rdReason_${c}`),
  ...[
    'Rising', 'Declining', 'Stable', 'Emerging', 'MixedSteps', 'MixedVolatility', 'InsufficientYears',
    'InsufficientMissing', 'InsufficientZero', 'InsufficientBaseline', 'DosmRising', 'DosmDeclining', 'DosmStable',
    'DosmMixedSteps', 'DosmMixedVolatility', 'DosmMissing', 'DosmNewCategory', 'DosmBreak',
  ].map((r) => `rdRule${r}`),
  ...['available', 'no_records', 'unavailable'].map((v) => `rdAvail_${v === 'available' ? 'data' : v}`),
  ...['current', 'stale'].map((v) => `rdFresh_${v}`),
  ...['ok', 'failed', 'never_run', 'not_configured'].map((v) => `rdHealth_${v}`),
  ...['active_manifest', 'bundled_read_only', 'cached_fallback'].map((v) => `rdServed_${v}`),
  ...['ok', 'no_activity', 'no_baseline', 'dropped_to_zero', 'invalid'].map((v) => `rdMom_${v}`),
  ...['unreviewed', 'confirmed', 'dismissed_counts', 'dismissed_shares'].map((v) => `rdBreak_${v}`),
  ...[
    'openalex_key_missing', 'openalex_rate_limited', 'openalex_auth_failed', 'source_unavailable',
    'dosm_dataset_missing', 'dosm_layout_unexpected', 'validation_failed', 'periods_removed', 'publish_conflict',
    'store_unavailable', 'not_configured', 'not_allowed', 'csrf_failed', 'demo_expired', 'demo_full', 'manifest_gone',
  ].map((c) => `rdErr_${c}`),
  ...['Halved', 'Same', 'Doubled', 'Four'].map((r) => `rdRing${r}`),
  ...['language', 'genmedia', 'vision', 'robotics', 'automation', 'service'].map((a) => `rdAxis_${a}`),
  'rdTabSK', 'rdTabAI', 'rdWhyTitle', 'rdAdminTitle', 'rdJudgeTitle',
]

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',')

describe('Radar strings', () => {
  it('fixed English copy is exact', () => {
    for (const [key, text] of Object.entries(fixed)) expect(en[key]).toBe(text)
  })

  it('every required key exists in en, ms and zh and is not empty', () => {
    for (const [name, table] of Object.entries(tables)) {
      for (const key of required) {
        expect(String(table[key] ?? '').trim(), `${name}.${key}`).not.toBe('')
      }
    }
  })

  it('every rd key has the same placeholders in all three languages', () => {
    for (const key of Object.keys(en).filter((k) => k.startsWith('rd'))) {
      expect(placeholders(ms[key]), `ms.${key}`).toBe(placeholders(en[key]))
      expect(placeholders(zh[key]), `zh.${key}`).toBe(placeholders(en[key]))
    }
  })

  it('rule texts use only the variables the trend rules provide', () => {
    expect(placeholders(en.rdRuleRising)).toBe('{agree},{limit},{ratio}')
    expect(placeholders(en.rdRuleEmerging)).toBe(['{baseline}', '{baselineBelow}', '{ratioAtLeast}', '{recent}', '{recentAtLeast}'].sort().join(','))
    expect(placeholders(en.rdRuleInsufficientYears)).toBe('{minYears},{years}')
    expect(t('zh', 'rdIceReason', { period: '2025 Q3', next: '2026 Q3' })).toContain('2025 Q3')
  })

  it('DOSM rule texts show their numbers and use only the vars shared/radar/dosm.js passes', () => {
    const passed = {
      rdRuleDosmRising: ['pp', 'relativePercent', 'agree', 'clean', 'materialPp', 'materialRelativePercent'],
      rdRuleDosmDeclining: ['pp', 'relativePercent', 'agree', 'clean', 'materialPp', 'materialRelativePercent'],
      rdRuleDosmMixedSteps: ['pp', 'relativePercent', 'agree', 'clean'],
      rdRuleDosmMixedVolatility: ['pp', 'volatility', 'high'],
      rdRuleDosmStable: ['pp', 'relativePercent', 'materialPp', 'materialRelativePercent'],
      rdRuleDosmNewCategory: ['quarters', 'minQuarters'],
      rdRuleDosmBreak: ['breakPeriods'],
      rdRuleDosmMissing: [],
    }
    for (const [key, vars] of Object.entries(passed)) {
      for (const [name, table] of Object.entries(tables)) {
        const used = (String(table[key]).match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1))
        for (const v of used) expect(vars, `${name}.${key} uses {${v}}`).toContain(v)
        // every variable passed is shown, except the thresholds of Stable which are also shown
        for (const v of vars) expect(used, `${name}.${key} shows {${v}}`).toContain(v)
      }
    }
  })

  it('every t(\'rd...\') used in existing Radar sources has a key in all three languages', () => {
    for (const file of radarSources()) {
      const text = readFileSync(join(root, file), 'utf8')
      for (const m of text.matchAll(/['"`](rd[A-Za-z0-9_]+)['"`]/g)) {
        for (const [name, table] of Object.entries(tables)) expect(table[m[1]], `${file}: ${name}.${m[1]}`).toBeTruthy()
      }
    }
  })

  it('rule and reason keys used by shared/radar/trend.js exist', () => {
    const text = readFileSync(join(root, 'shared/radar/trend.js'), 'utf8')
    for (const m of text.matchAll(/'(rdRule[A-Za-z]+)'/g)) expect(en[m[1]], m[1]).toBeTruthy()
    for (const m of text.matchAll(/reasons\.push\('([a-z_0-9]+)'\)/g)) expect(en[`rdReason_${m[1]}`], m[1]).toBeTruthy()
  })
})
