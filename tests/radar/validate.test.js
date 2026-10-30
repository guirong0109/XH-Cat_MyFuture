import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseDosmJmi } from '../../server/radar/dosmTable.js'
import {
  canonicalContent,
  dosmSnapshotObservations,
  dosmTableFromSnapshot,
  openalexCounts
} from '../../shared/radar/snapshot.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { diffSnapshots } from '../../shared/radar/diff.js'

const base = (sourceId, observations, extra = {}) => ({
  snapshotId: 's1',
  sourceId,
  fetchedAt: '2026-10-30T00:00:00Z',
  publishedAt: null,
  observationStart: 'a',
  observationEnd: 'b',
  sourceUrls: [{ label: 'x', url: 'https://example.org' }],
  classification: { system: 'x', version: '1', readAt: '2026-10-30', countingRule: null },
  observations,
  originals: [],
  meta: {},
  ...extra
})
const oa = (entityId, period, value, extra = {}) => ({
  entityType: 'ai_topic', entityId, period, metric: 'works_primary_topic', unit: 'papers', value, ...extra
})
const dosm = (entityType, entityId, period, value, extra = {}) => ({
  entityType, entityId, period, metric: 'online_job_offerings', unit: 'offerings', value, ...extra
})
const codes = (r) => r.errors.map((e) => e.code)
const oaSnap = (obs) => base('openalex', obs)
const OPTS = { expectedEntities: ['T1'], lastYear: 2025 }

function dosmSnap(totalQ, groupValues, q = '2026 Q1') {
  const obs = [dosm('total', 'masco2020:total', q, totalQ)]
  for (let g = 1; g <= 9; g++) obs.push(dosm('occupation_group', `masco2020:${g}`, q, groupValues))
  return base('dosm', obs)
}

describe('validateSnapshot', () => {
  it('accepts a minimal valid OpenAlex snapshot', () => {
    const r = validateSnapshot(oaSnap([oa('T1', '2024', 5), oa('T1', '2025', 7)]), OPTS)
    expect(r).toEqual({ ok: true, errors: [] })
  })
  it('bad_structure', () => {
    expect(codes(validateSnapshot(null, OPTS))).toContain('bad_structure')
    expect(codes(validateSnapshot({ ...oaSnap([]), observations: 'x' }, OPTS))).toContain('bad_structure')
    expect(codes(validateSnapshot(oaSnap([{ entityId: 'T1' }]), OPTS))).toContain('bad_structure')
    expect(codes(validateSnapshot({ ...oaSnap([oa('T1', '2025', 1)]), sourceId: 'zzz' }, OPTS))).toContain('bad_structure')
  })
  it('bad_period', () => {
    expect(codes(validateSnapshot(oaSnap([oa('T1', '25', 1)]), OPTS))).toContain('bad_period')
    expect(codes(validateSnapshot(oaSnap([oa('T1', '2025 Q1', 1)]), OPTS))).toContain('bad_period')
    expect(codes(validateSnapshot(dosmSnap(10, 1, '2026 Q5'), { expectedEntities: [], lastYear: 2026 }))).toContain('bad_period')
  })
  it('duplicate_period and period_order', () => {
    expect(codes(validateSnapshot(oaSnap([oa('T1', '2024', 1), oa('T1', '2024', 2)]), OPTS))).toContain('duplicate_period')
    expect(codes(validateSnapshot(oaSnap([oa('T1', '2025', 1), oa('T1', '2024', 2)]), OPTS))).toContain('period_order')
  })
  it('bad_value: negative, non-numeric, NaN', () => {
    for (const v of [-1, '5', NaN, undefined]) {
      expect(codes(validateSnapshot(oaSnap([oa('T1', '2025', v)]), OPTS))).toContain('bad_value')
    }
  })
  it('unknown_unit', () => {
    expect(codes(validateSnapshot(oaSnap([oa('T1', '2025', 1, { unit: 'apples' })]), OPTS))).toContain('unknown_unit')
  })
  it('missing_entity', () => {
    const r = validateSnapshot(oaSnap([oa('T1', '2025', 1)]), { expectedEntities: ['T1', 'T2'], lastYear: 2025 })
    expect(r.errors).toContainEqual({ code: 'missing_entity', path: 'T2' })
  })
  it('future_year', () => {
    expect(codes(validateSnapshot(oaSnap([oa('T1', '2026', 1)]), OPTS))).toContain('future_year')
  })
  it('DOSM total below the sum of the nine groups', () => {
    const o = { expectedEntities: [], lastYear: 2026 }
    expect(codes(validateSnapshot(dosmSnap(80, 10), o))).toContain('total_below_groups')
    expect(validateSnapshot(dosmSnap(90, 10), o).ok).toBe(true)
    expect(validateSnapshot(dosmSnap(95, 10), o).ok).toBe(true)
  })
  it('a null value in a published quarter is valid', () => {
    const snap = dosmSnap(100, 10)
    snap.observations.find((x) => x.entityId === 'masco2020:3').value = null
    expect(validateSnapshot(snap, { expectedEntities: [], lastYear: 2026 })).toEqual({ ok: true, errors: [] })
  })
})

describe('diffSnapshots', () => {
  const prev = oaSnap([oa('T1', '2023', 10), oa('T1', '2024', 20)])
  it('identical content is sameContent even with other metadata', () => {
    const next = { ...oaSnap([oa('T1', '2024', 20), oa('T1', '2023', 10)]), snapshotId: 's2', fetchedAt: 'later' }
    expect(diffSnapshots(prev, next)).toEqual({ sameContent: true, newObservations: [], revisions: [], removed: [] })
  })
  it('a changed past value is a revision', () => {
    const d = diffSnapshots(prev, oaSnap([oa('T1', '2023', 10), oa('T1', '2024', 25)]))
    expect(d.sameContent).toBe(false)
    expect(d.revisions).toEqual([{ entityId: 'T1', period: '2024', old: 20, new: 25 }])
    expect(d.newObservations).toEqual([])
    expect(d.removed).toEqual([])
  })
  it('a new period is a new observation', () => {
    const d = diffSnapshots(prev, oaSnap([oa('T1', '2023', 10), oa('T1', '2024', 20), oa('T1', '2025', 30)]))
    expect(d.newObservations).toHaveLength(1)
    expect(d.newObservations[0].period).toBe('2025')
    expect(d.revisions).toEqual([])
  })
  it('a vanished period is removed', () => {
    const d = diffSnapshots(prev, oaSnap([oa('T1', '2023', 10)]))
    expect(d.removed).toEqual([{ entityId: 'T1', period: '2024' }])
  })
  it('a null cell inside a published quarter is not a removed period', () => {
    const a = oaSnap([oa('T1', '2023', 10), oa('T1', '2024', 20)])
    const b = oaSnap([oa('T1', '2023', 10), oa('T1', '2024', null)])
    const d = diffSnapshots(a, b)
    expect(d.removed).toEqual([])
    expect(d.revisions).toEqual([{ entityId: 'T1', period: '2024', old: 20, new: null }])
    expect(diffSnapshots(b, b).sameContent).toBe(true)
  })
  it('no previous snapshot: everything is new', () => {
    const d = diffSnapshots(null, prev)
    expect(d.sameContent).toBe(false)
    expect(d.newObservations).toHaveLength(2)
  })
})

describe('canonicalContent and helpers', () => {
  it('is deterministic and ignores order and metadata', () => {
    const a = oaSnap([oa('T2', '2024', 1), oa('T1', '2025', 2), oa('T1', '2024', 3)])
    const b = { ...oaSnap([oa('T1', '2024', 3), oa('T1', '2025', 2), oa('T2', '2024', 1)]), snapshotId: 'zz', fetchedAt: 'x' }
    expect(canonicalContent(a)).toBe(canonicalContent(b))
    expect(canonicalContent(a)).not.toBe(canonicalContent(oaSnap([oa('T2', '2024', 9)])))
  })
  it('openalexCounts returns {year: count} for one topic', () => {
    const s = oaSnap([oa('T1', '2024', 3), oa('T1', '2025', 2), oa('T2', '2024', 9)])
    expect(openalexCounts(s, 'T1')).toEqual({ 2024: 3, 2025: 2 })
  })
  it('round-trips the real DOSM workbook', () => {
    const table = parseDosmJmi(readFileSync('data/radar/source/dosm-jmi-2026q2.xlsx'))
    const obs = dosmSnapshotObservations(table)
    expect(obs.find((o) => o.entityType === 'total').entityId).toBe('masco2020:total')
    expect(obs.every((o) => o.metric === 'online_job_offerings' && o.unit === 'offerings')).toBe(true)
    const snap = base('dosm', obs)
    expect(dosmTableFromSnapshot(snap)).toEqual(table)
    expect(validateSnapshot(snap, { expectedEntities: ['masco2020:total'], lastYear: 2026 }).errors).toEqual([])
  })
})
