import { describe, it, expect, beforeAll } from 'vitest'
import { fieldTopicMappingVersion, runPipeline } from '../../shared/radar/pipeline.js'
import { buildSignal, validateSignal, FORBIDDEN_KEYS } from '../../shared/radar/contract.js'
import { dependencyReport } from '../../shared/radar/dependencies.js'
import { realInputs, DOSM_RELEASE_URL, DOSM_DATA_URL } from '../helpers/radarInputs.js'

let inputs
let out
beforeAll(async () => {
  inputs = await realInputs()
  out = runPipeline(inputs)
})

const byId = (signals, id) => signals.find((s) => s.signalId === id)
const clone = (x) => JSON.parse(JSON.stringify(x))
const deepKeys = (x, acc = []) => {
  if (Array.isArray(x)) x.forEach((v) => deepKeys(v, acc))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) acc.push(k), deepKeys(v, acc)
  return acc
}
// Dismiss the 2025 Q3 possible break for shares, tied to its exact observations.
const dismiss2025Q3 = (breaks) => {
  const b = breaks.find((x) => x.period === '2025 Q3')
  return [{ reviewId: 'rev-1', sourceId: 'dosm', decision: 'dismissed_shares', appliesTo: { period: b.period, observationHash: b.observationHash } }]
}

describe('radar-signal/v1 from the real bundled inputs', () => {
  it('every signal from the real bundled inputs validates and has evidence links', () => {
    expect(out.signals.length).toBe(6 + 9)
    for (const s of out.signals) {
      expect(validateSignal(s)).toEqual({ ok: true, errors: [] })
      expect(s.evidenceLinks.length).toBeGreaterThan(0)
      for (const l of s.evidenceLinks) expect(l.url).toMatch(/^https:\/\//)
      expect(s).toMatchObject({ contract: 'radar-signal/v1', manifestId: 'manifest-test-1', configVersion: 'radar-config/v1' })
      expect(typeof s.mappingVersion).toBe('string')
    }
    expect(out.signals.map((s) => s.signalId)).toEqual([...out.signals.map((s) => s.signalId)].sort())
  })

  it('no score-like field can pass validation, at any depth', () => {
    const anySignal = out.signals[0]
    expect(FORBIDDEN_KEYS).toEqual(['score', 'weight', 'rank', 'match', 'opportunityScore', 'fitScore'])
    expect(validateSignal({ ...anySignal, change: { ...anySignal.change, score: 1 } }).ok).toBe(false)
    for (const key of FORBIDDEN_KEYS) {
      expect(validateSignal({ ...anySignal, [key]: 1 }).ok).toBe(false)
      expect(validateSignal({ ...anySignal, evidenceLinks: [{ ...anySignal.evidenceLinks[0], [key]: 1 }] }).ok).toBe(false)
    }
    for (const s of out.signals) for (const key of deepKeys(s)) expect(FORBIDDEN_KEYS).not.toContain(key)
  })

  it('any score, weight, rank, match or opportunity-like key is rejected at any depth', () => {
    const s = out.signals[0]
    expect(validateSignal({ ...s, matchScore: 1 }).ok).toBe(false)
    expect(validateSignal({ ...s, change: { ...s.change, opportunityIndex: 2 } }).ok).toBe(false)
    expect(validateSignal({ ...s, breaks: [{ period: '2025 Q3', status: 'unreviewed', Ranking: 1 }] }).ok).toBe(false)
    expect(validateSignal({ ...s, entity: { ...s.entity, fitWeighting: 1 } }).ok).toBe(false)
    expect(validateSignal(s).ok).toBe(true)
  })

  it('signals carry the explanation rule and steps from the trend core', () => {
    const lang = byId(out.signals, 'openalex:T10028')
    expect(lang.rule.key).toBe('rdRuleRising')
    expect(lang.steps).toHaveLength(3)
    const keys = Object.keys(lang)
    expect(keys.slice(keys.indexOf('reasons'), keys.indexOf('reasons') + 3)).toEqual(['reasons', 'rule', 'steps'])
    const prof = byId(out.signals, 'dosm:masco2020:2')
    expect(prof.rule).toEqual({ key: 'rdRuleDosmBreak', vars: { breakPeriods: ['2025 Q3'] } })
    expect(Array.isArray(prof.steps)).toBe(true)
    expect(validateSignal({ ...lang, rule: { key: 7, vars: {} } }).ok).toBe(false)
    expect(validateSignal({ ...lang, steps: 'x' }).ok).toBe(false)
  })

  it('topic signals record the field-topic decisions in mappingVersion (file version + decisions version)', () => {
    expect(fieldTopicMappingVersion({ fieldTopics: 'radar-field-topics/v1' })).toBe('radar-field-topics/v1')
    expect(fieldTopicMappingVersion({ fieldTopics: 'radar-field-topics/v1', fieldTopicDecisions: 'decisions-0123456789abcdef' })).toBe('radar-field-topics/v1+decisions:decisions-0123456789abcdef')
    // No file version: still missing, whatever decisions exist (validation refuses it).
    expect(fieldTopicMappingVersion({ fieldTopics: null, fieldTopicDecisions: 'decisions-0123456789abcdef' })).toBeNull()
    expect(fieldTopicMappingVersion(undefined)).toBeNull()
    const references = { ...inputs.references, versions: { ...inputs.references.versions, fieldTopicDecisions: 'decisions-0123456789abcdef' } }
    const r = runPipeline({ ...inputs, references })
    for (const s of r.signals) {
      expect(validateSignal(s).ok).toBe(true)
      if (s.signalId.startsWith('openalex:')) expect(s.mappingVersion).toBe(`${inputs.references.versions.fieldTopics}+decisions:decisions-0123456789abcdef`)
      else expect(s.mappingVersion).toBe(inputs.references.versions.bridge)
    }
    for (const s of out.signals) if (s.signalId.startsWith('openalex:')) expect(s.mappingVersion).toBe(inputs.references.versions.fieldTopics)
  })

  it('a missing mapping version is not papered over', () => {
    const references = { ...inputs.references, versions: { ...inputs.references.versions, fieldTopics: null, bridge: null } }
    const r = runPipeline({ ...inputs, references })
    for (const s of r.signals) {
      expect(s.mappingVersion).toBeNull()
      expect(validateSignal(s).ok).toBe(false)
    }
  })

  it('missing evidence links and unknown enums are rejected', () => {
    const s = out.signals[0]
    expect(validateSignal({ ...s, evidenceLinks: [] }).ok).toBe(false)
    const { evidenceLinks, ...noLinks } = s
    expect(validateSignal(noLinks).ok).toBe(false)
    expect(validateSignal({ ...s, evidenceLinks: [{ label: 'x', url: '' }] }).ok).toBe(false)
    expect(validateSignal({ ...s, direction: 'up' }).ok).toBe(false)
    expect(validateSignal({ ...s, evidenceKind: 'job' }).ok).toBe(false)
    expect(validateSignal({ ...s, evidenceSufficiency: 'enough' }).ok).toBe(false)
    expect(validateSignal({ ...s, evidenceQuality: 'great' }).ok).toBe(false)
    expect(validateSignal({ ...s, entity: { ...s.entity, type: 'skill' } }).ok).toBe(false)
    expect(validateSignal({ ...s, granularity: { level: 'person' } }).ok).toBe(false)
    expect(validateSignal({ ...s, change: { ...s.change, unit: 'stars' } }).ok).toBe(false)
    expect(validateSignal({ ...s, breaks: [{ period: '2025 Q3', status: 'ignored' }] }).ok).toBe(false)
    expect(validateSignal({ ...s, contract: 'radar-signal/v0' }).ok).toBe(false)
    expect(validateSignal(null).ok).toBe(false)
  })

  it('DOSM signals are group level; OpenAlex signals are research indicators', () => {
    const dosm = out.signals.filter((s) => s.evidenceKind === 'occupation_group')
    const oa = out.signals.filter((s) => s.evidenceKind === 'research_indicator')
    expect(dosm).toHaveLength(9)
    expect(oa).toHaveLength(6)
    for (const s of dosm) {
      expect(s.entity.type).toBe('occupation_group')
      expect(s.granularity).toEqual({ level: 'group', groupSystem: 'MASCO 2020 major group', groupCode: s.entity.code })
      expect(s.methodVersion).toBe('dosm-share-v1')
      expect(s.change.unit).toBe('pp')
      expect(s.evidenceLinks.map((l) => l.url)).toEqual([DOSM_RELEASE_URL, DOSM_DATA_URL])
      expect(s.momentum).toBeUndefined()
      expect(s.sourceSnapshotIds).toEqual(['dosm-jmi-2026q2'])
    }
    for (const s of oa) {
      expect(s.entity.type).toBe('ai_topic')
      expect(s.granularity).toEqual({ level: 'topic' })
      expect(s.methodVersion).toBe('openalex-count-v1')
      expect(s.evidenceLinks[0].url).toBe(`https://openalex.org/${s.entity.code}`)
      expect(s.momentum).toMatchObject({ method: 'log2-v1', k: 20, windowYears: 3 })
      expect(s.shareMomentum.referencePopulation).toBeTruthy()
    }
  })

  it('direction and evidence come from the trend engine, never from the index', () => {
    const lang = byId(out.signals, 'openalex:T10028')
    expect(lang).toMatchObject({ direction: 'rising', evidenceSufficiency: 'sufficient', evidenceQuality: 'strong' })
    expect(lang.momentum.value).toBeCloseTo(83.3, 1)
    expect(lang.baseline).toEqual({ period: '2022', value: 7939 })
    expect(lang.recent).toEqual({ period: '2025', value: 25167 })
    expect(lang.change.value).toBeCloseTo(Math.log2(25167 / 7939), 9)
    expect(lang.volatility).toMatchObject({ unit: 'log_points', label: 'high' })
    const vision = byId(out.signals, 'openalex:T12549')
    expect(vision.direction).toBe('stable')
    const prof = byId(out.signals, 'dosm:masco2020:2')
    expect(prof).toMatchObject({ direction: null, evidenceSufficiency: 'insufficient_comparable_evidence', evidenceQuality: null })
    expect(prof.reasons).toContain('possible_break')
    expect(prof.change.value).toBeCloseTo(5.67, 2)
    expect(prof.breaks).toContainEqual({ period: '2025 Q3', status: 'unreviewed' })
    expect(byId(out.signals, 'dosm:masco2020:9').reasons).toContain('new_reporting_category')
  })

  it('returns breaks, the DOSM context indicator and momentum per axis', () => {
    expect(out.breaks.map((b) => b.period)).toEqual(['2020 Q2', '2020 Q3', '2021 Q3', '2025 Q3'])
    expect(out.breaks.every((b) => b.status === 'unreviewed')).toBe(true)
    expect(out.context.dosm.period).toBe('2026 Q2')
    expect(Object.keys(out.momentum).sort()).toEqual(['automation', 'genmedia', 'language', 'robotics', 'service', 'vision'])
    expect(out.momentum.language.counts.current.value).toBeCloseTo(83.3, 1)
    expect(out.momentum.language.share.current.state).toBe('ok')
  })

  it('a break review tied to the exact observations reopens the comparison', () => {
    const reviewed = runPipeline({ ...inputs, reviews: dismiss2025Q3(out.breaks) })
    const prof = byId(reviewed.signals, 'dosm:masco2020:2')
    expect(prof.evidenceSufficiency).toBe('sufficient')
    expect(prof.breaks).toContainEqual({ period: '2025 Q3', status: 'dismissed_shares', reviewId: 'rev-1' })
    const stale = [{ ...dismiss2025Q3(out.breaks)[0], appliesTo: { period: '2025 Q3', observationHash: 'other' } }]
    expect(byId(runPipeline({ ...inputs, reviews: stale }).signals, 'dosm:masco2020:2').evidenceSufficiency).toBe('insufficient_comparable_evidence')
  })

  it('revisions recorded on the snapshot reach the signal and lower quality', () => {
    const openalex = { ...inputs.snapshots.openalex, meta: { revisions: [{ entityId: 'T10028', period: '2024', old: 17379, new: 16000 }] } }
    const s = byId(runPipeline({ ...inputs, snapshots: { ...inputs.snapshots, openalex } }).signals, 'openalex:T10028')
    expect(s.revisions).toEqual({ count: 1, items: [{ period: '2024', old: 17379, new: 16000 }] })
    expect(s.evidenceQuality).toBe('limited')
  })

  it('buildSignal takes direction and evidence only from the core', () => {
    const s = out.signals[0]
    const core = { direction: 'stable', volatility: null, evidenceSufficiency: 'sufficient', evidenceQuality: 'moderate', reasons: ['x'] }
    const built = buildSignal(core, { ...s, direction: 'rising', evidenceQuality: 'strong' })
    expect(built).toMatchObject({ direction: 'stable', evidenceQuality: 'moderate', reasons: ['x'], volatility: null })
    expect(Object.keys(built)).toEqual(Object.keys(buildSignal(core, { ...s })))
  })
})

describe('dependencyReport', () => {
  let after
  beforeAll(() => {
    after = runPipeline({ ...inputs, reviews: dismiss2025Q3(out.breaks) })
  })

  it('same inputs and versions -> byte-identical output and dependency report', () => {
    expect(JSON.stringify(runPipeline(inputs))).toBe(JSON.stringify(runPipeline(inputs)))
    const r1 = dependencyReport(out, after, inputs.references)
    const r2 = dependencyReport(clone(out), clone(after), inputs.references)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
    expect(Object.keys(r1)).toEqual(['changedSignals', 'affected'])
    expect(Object.keys(r1.affected)).toEqual(['groups', 'occupations', 'fields', 'skills'])
  })

  it('no change -> nothing affected except the fixed skills note', () => {
    const r = dependencyReport(out, clone(out), inputs.references)
    expect(r.changedSignals).toEqual([])
    expect(r.affected).toEqual({ groups: [], occupations: [], fields: [], skills: [{ reason: 'skill_demand_insufficient_evidence' }] })
  })

  it('a changed DOSM group lists its eMASCO jobs as group level and skills as insufficient', () => {
    const r = dependencyReport(out, after, inputs.references)
    const changed = r.changedSignals.find((c) => c.signalId === 'dosm:masco2020:2')
    expect(changed.changes).toContain('evidenceSufficiency')
    expect(changed.before.evidenceSufficiency).toBe('insufficient_comparable_evidence')
    expect(changed.after.evidenceSufficiency).toBe('sufficient')
    expect(r.changedSignals.map((c) => c.signalId)).toEqual([...r.changedSignals.map((c) => c.signalId)].sort())
    expect(r.changedSignals.every((c) => c.signalId.startsWith('dosm:'))).toBe(true)

    const groupCodes = r.affected.groups.map((g) => g.code)
    expect(groupCodes).toContain('2')
    expect(groupCodes).toEqual([...groupCodes].sort())
    const roles = inputs.references.emascoRoles
    const expected = roles.filter((role) => groupCodes.includes(role.code[0]))
    expect(r.affected.occupations).toHaveLength(expected.length)
    const dev = r.affected.occupations.find((o) => o.code === '2512-01')
    expect(dev).toMatchObject({ system: 'emasco', level: 'group' })
    expect(Object.keys(dev)).toEqual(['system', 'code', 'name', 'level', 'path'])
    expect(dev.path.at(-1)).toMatchObject({ system: 'MASCO 2020 major group', code: '2', signalId: 'dosm:masco2020:2' })
    expect(r.affected.occupations.every((o) => o.level === 'group')).toBe(true)
    const keys = r.affected.occupations.map((o) => `${o.system}|${o.code}`)
    expect(keys).toEqual([...keys].sort())
    expect(r.affected.fields).toEqual([])
    expect(r.affected.skills).toEqual([{ reason: 'skill_demand_insufficient_evidence' }])
  })

  it('fields appear only through approved mappings', () => {
    // Change the language topic signal.
    const changed = clone(out)
    byId(changed.signals, 'openalex:T10028').direction = 'mixed'
    // Bundled proposals are all pending: no field is reached.
    expect(inputs.references.fieldTopics.every((m) => m.reviewStatus === 'pending')).toBe(true)
    expect(dependencyReport(out, changed, inputs.references).affected.fields).toEqual([])
    // Approve one mapping in memory: exactly that path appears; rejected and pending never do.
    const fieldTopics = inputs.references.fieldTopics.map((m) =>
      m.mappingId === '06-language' ? { ...m, reviewStatus: 'approved' } : m.mappingId === '04-language' ? { ...m, reviewStatus: 'rejected' } : m
    )
    const r = dependencyReport(out, changed, { ...inputs.references, fieldTopics })
    expect(r.affected.fields).toEqual([{ iscedCode: '06', axisId: 'language', mappingId: '06-language', level: 'broad', excludes: [] }])
    expect(r.affected.groups).toEqual([])
    expect(r.affected.occupations).toEqual([])
    expect(r.changedSignals).toHaveLength(1)
    expect(r.changedSignals[0].changes).toEqual(['direction'])
  })

  it('field reach follows overrides: a detailed rejection is excluded from a broad approval', () => {
    const changed = clone(out)
    byId(changed.signals, 'openalex:T10028').direction = 'mixed'
    const base = { relationship: 'field_related_to_ai_topic', method: 'curated' }
    const fieldTopics = [
      { ...base, mappingId: '06-language', iscedCode: '06', axisId: 'language', reviewStatus: 'approved' },
      { ...base, mappingId: '0613-language', iscedCode: '0613', axisId: 'language', reviewStatus: 'rejected' },
      { ...base, mappingId: '0612-vision', iscedCode: '0612', axisId: 'vision', reviewStatus: 'rejected' },
      { ...base, mappingId: '0411-language', iscedCode: '0411', axisId: 'language', reviewStatus: 'rejected' },
    ]
    const r = dependencyReport(out, changed, { ...inputs.references, fieldTopics })
    expect(r.affected.fields).toEqual([{ iscedCode: '06', axisId: 'language', mappingId: '06-language', level: 'broad', excludes: ['0613'] }])
    // A detailed approval overridden by nothing more detailed is reported at its own level.
    const detailed = [...fieldTopics, { ...base, mappingId: '0613-language-b', iscedCode: '061', axisId: 'language', reviewStatus: 'approved' }]
    const r2 = dependencyReport(out, changed, { ...inputs.references, fieldTopics: detailed })
    expect(r2.affected.fields).toEqual([
      { iscedCode: '06', axisId: 'language', mappingId: '06-language', level: 'broad', excludes: ['0613'] },
      { iscedCode: '061', axisId: 'language', mappingId: '0613-language-b', level: 'narrow', excludes: ['0613'] },
    ])
  })

  it('added and removed signals are reported', () => {
    const fewer = { signals: out.signals.filter((s) => s.signalId !== 'openalex:T10028') }
    const r = dependencyReport(fewer, out, inputs.references)
    expect(r.changedSignals).toEqual([{ signalId: 'openalex:T10028', before: null, after: expect.any(Object), changes: ['added'] }])
    expect(dependencyReport(out, fewer, inputs.references).changedSignals[0].changes).toEqual(['removed'])
  })
})

describe('references for the pipeline', () => {
  it('loads the eMASCO roles used to reach jobs through a group', () => {
    expect(inputs.references.emascoRoles.length).toBeGreaterThan(1000)
    expect(inputs.references.emascoRoles[0]).toMatchObject({ code: expect.stringMatching(/^\d{4}-\d{2}$/), title: expect.any(String) })
  })
})
