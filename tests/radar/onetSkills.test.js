import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { flagSet, nextOnetSkillsSnapshot, flagChanges, onetSkillSignals, ONET_SKILLS_METHOD } from '../../shared/radar/onetSkills.js'
import { validateSignal } from '../../shared/radar/contract.js'
import { validateSnapshot } from '../../shared/radar/validate.js'
import { runPipeline } from '../../shared/radar/pipeline.js'
import { RADAR_CONFIG } from '../../shared/radar/config.js'

const load = (name) => {
  const text = readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
  const sha = /SHA-256 ([0-9a-f]{64})/.exec(text.split('\n')[0])[1]
  const rows = lines.slice(1).map((l) => {
    const [code, example, elementId, elementName, hot, inDemand] = l.split('\t')
    return { code, example, elementId, elementName, hot: hot === 'Y', inDemand: inDemand === 'Y' }
  })
  return { rows, sha }
}

let r302, r303, snap302, snap303, snap310
const fetchedAt = '2026-10-30T00:00:00.000Z'
beforeAll(() => {
  r302 = load('onet-flags-30_2.tsv')
  r303 = load('onet-flags-30_3.tsv')
  const set302 = flagSet({ release: '30.2', month: '2026-02', zipUrl: 'https://www.onetcenter.org/dl_files/database/db_30_2_text.zip', zipSha256: 'z302', fileSha256: r302.sha, rows: r302.rows })
  const set303 = flagSet({ release: '30.3', month: '2026-05', zipUrl: 'https://www.onetcenter.org/dl_files/database/db_30_3_text.zip', zipSha256: 'z303', fileSha256: r303.sha, rows: r303.rows })
  const set310 = flagSet({ release: '31.0', month: '2026-08', zipUrl: 'https://www.onetcenter.org/dl_files/database/db_31_0_text.zip', zipSha256: 'z310', fileSha256: r303.sha, rows: r303.rows })
  snap302 = nextOnetSkillsSnapshot(null, set302, fetchedAt)
  snap303 = nextOnetSkillsSnapshot(snap302, set303, fetchedAt)
  snap310 = nextOnetSkillsSnapshot(snap303, set310, fetchedAt)
})

describe('flagSet', () => {
  it('keeps only flagged rows, sorted by code then example', () => {
    const s = flagSet({
      release: '1.0', month: '2026-01', zipUrl: 'u', zipSha256: 'a', fileSha256: 'b',
      rows: [
        { code: '2', example: 'b', elementId: 'x', elementName: 'n', hot: false, inDemand: true },
        { code: '1', example: 'z', elementId: 'x', elementName: 'n', hot: false, inDemand: false },
        { code: '1', example: 'a', elementId: 'x', elementName: 'n', hot: true, inDemand: false },
      ],
    })
    expect(s.id).toBe('1.0')
    expect(s.releases).toEqual(['1.0'])
    expect(s.rows.map((r) => `${r.code}|${r.example}`)).toEqual(['1|a', '2|b'])
  })
})

describe('flagChanges 30.2 -> 30.3', () => {
  it('reports the measured Hot and In Demand changes', () => {
    const c = flagChanges(snap303)
    expect(c.previous).toBe('30.2')
    expect(c.current).toBe('30.3')
    expect(c.hot.added).toEqual(['Google Looker Analytics', 'Grafana Labs Grafana Cloud', 'Intuit TurboTax', 'Microsoft Power Platform software', 'Prometheus'])
    expect(c.hot.dropped).toEqual([])
    expect(c.inDemand.added.length).toBe(151)
    expect(c.inDemand.dropped.length).toBe(219)
    const added = (code) => c.inDemand.added.filter((x) => x.code === code).map((x) => x.example)
    const dropped = (code) => c.inDemand.dropped.filter((x) => x.code === code).map((x) => x.example)
    expect(added('15-1252.00')).toContain('Go')
    for (const e of ['Extensible markup language XML', 'JavaScript Object Notation JSON', 'Microsoft .NET Framework', 'Operating system software']) {
      expect(dropped('15-1252.00')).toContain(e)
    }
    expect(dropped('13-2011.00')).toContain('Accounting software')
    expect(added('27-2042.00')).toEqual([])
    expect(dropped('27-2042.00')).toEqual([])
  })

  it('first release alone: no previous, no changes, no signals', () => {
    const c = flagChanges(snap302)
    expect(c.previous).toBeNull()
    expect(c.inDemand.added).toEqual([])
    expect(c.hot.dropped).toEqual([])
    expect(onetSkillSignals(snap302, { manifestId: 'm', config: RADAR_CONFIG })).toEqual([])
  })
})

describe('nextOnetSkillsSnapshot (D25)', () => {
  it('a later release with identical flags extends the current set instead of replacing the baseline', () => {
    expect(snap303.meta.flagSets.map((s) => s.id)).toEqual(['30.2', '30.3'])
    expect(snap310.meta.flagSets.map((s) => s.id)).toEqual(['30.2', '30.3'])
    expect(snap310.meta.flagSets[1].releases).toEqual(['30.3', '31.0'])
    expect(snap310.classification.version).toBe('31.0')
    expect(snap310.snapshotId).toBe('onet-skills-31.0')
    expect(snap310.sourceId).toBe('onet-skills')
    expect(flagChanges(snap310).hot.added.length).toBe(5)
  })

  it('a different release replaces the older baseline', () => {
    const rows = r303.rows.filter((r) => r.code !== '15-1252.00')
    const next = nextOnetSkillsSnapshot(snap310, flagSet({ release: '31.1', month: '2026-11', zipUrl: 'u', zipSha256: 'z', fileSha256: 'different', rows }), fetchedAt)
    expect(next.meta.flagSets.map((s) => s.id)).toEqual(['30.3', '31.1'])
    expect(next.meta.flagSets[0].releases).toEqual(['30.3', '31.0'])
  })

  it('records a release check observation', () => {
    const o = snap310.observations.filter((x) => x.entityType === 'release')
    expect(o).toEqual([{ entityType: 'release', entityId: 'latest', period: '31.0', metric: 'release_checked', unit: 'release', value: 1 }])
  })
})

describe('onetSkillSignals', () => {
  let signals
  beforeAll(() => {
    signals = onetSkillSignals(snap310, { manifestId: 'm1', config: RADAR_CONFIG })
  })

  it('makes one signal per change and each passes validateSignal', () => {
    expect(signals.length).toBe(5 + 151 + 219)
    for (const s of signals) expect(validateSignal(s)).toEqual({ ok: true, errors: [] })
    const go = signals.find((s) => s.signalId === 'onet:indemand:15-1252.00:Go')
    expect(go.direction).toBe('rising')
    expect(go.baseline).toEqual({ period: '30.2', value: 0 })
    expect(go.recent).toEqual({ period: '30.3', value: 1 })
    expect(go.change).toEqual({ value: 1, unit: 'flag', relativePercent: null })
    expect(go.methodVersion).toBe(ONET_SKILLS_METHOD)
    expect(go.mappingVersion).toBe('onet-flags/30.2..30.3')
    expect(go.configVersion).toBe(RADAR_CONFIG.version)
    expect(go.entity.sourceUrl).toBe('https://www.onetonline.org/link/summary/15-1252.00')
    expect(go.granularity).toEqual({ level: 'occupation_skill', occupationCode: '15-1252.00' })
    expect(go.reasons).toEqual(['us_postings', 'software_only'])
    const hot = signals.find((s) => s.signalId === 'onet:hot:Prometheus')
    expect(hot.direction).toBe('rising')
    expect(hot.metric).toBe('hot_technology_flag')
    expect(hot.granularity).toEqual({ level: 'skill' })
    expect(hot.evidenceLinks.map((l) => l.url)).toContain('https://www.onetonline.org/search/hot_tech/')
    const dropped = signals.find((s) => s.signalId === 'onet:indemand:13-2011.00:Accounting software')
    expect(dropped.direction).toBe('declining')
    expect(dropped.baseline.value).toBe(1)
    expect(dropped.recent.value).toBe(0)
  })

  it('rejects a score-like field', () => {
    const bad = { ...signals[0], matchScore: 1 }
    expect(validateSignal(bad).errors.map((e) => e.code)).toContain('forbidden_field')
  })

  it('same inputs give identical output', () => {
    const again = onetSkillSignals(snap310, { manifestId: 'm1', config: RADAR_CONFIG })
    expect(JSON.stringify(again)).toBe(JSON.stringify(signals))
  })

  it('runPipeline adds the signals and the reference lists', () => {
    const out = runPipeline({ snapshots: { 'onet-skills': snap310 }, manifestId: 'm1' })
    expect(out.signals.length).toBe(signals.length)
    expect(out.onetSkills.previous).toBe('30.2')
    expect(runPipeline({ snapshots: {}, manifestId: 'm1' })).not.toHaveProperty('onetSkills')
  })
})

describe('validateSnapshot for onet-skills', () => {
  it('accepts the built snapshot', () => {
    expect(validateSnapshot(snap310)).toEqual({ ok: true, errors: [] })
    expect(validateSnapshot(snap302).ok).toBe(true)
  })

  it('rejects a non-integer flag value and a bad period', () => {
    const bad = JSON.parse(JSON.stringify(snap303))
    bad.observations[0].value = 0.5
    expect(validateSnapshot(bad).errors.map((e) => e.code)).toContain('bad_value')
    const badPeriod = JSON.parse(JSON.stringify(snap303))
    badPeriod.observations[0].period = 'x'
    expect(validateSnapshot(badPeriod).errors.map((e) => e.code)).toContain('bad_period')
  })
})
