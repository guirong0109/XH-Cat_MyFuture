// Future Skills Radar: what a change in signals reaches (spec §6.6). Pure and deterministic: arrays sorted by id,
// keys in a fixed order. Jobs are reached only through their DOSM group and are marked group level: a group signal is
// never a signal about one job. Fields are reached only through approved field-topic records. Skill demand has no
// evidence in Round 1.

const GROUP_SYSTEM = 'MASCO 2020 major group'
const SKILLS = [{ reason: 'skill_demand_insufficient_evidence' }]
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Each entry: change name and the fields it compares, in report order.
const CHECKS = [
  ['direction', ['direction']],
  ['evidenceSufficiency', ['evidenceSufficiency']],
  ['evidenceQuality', ['evidenceQuality']],
  ['values', ['baseline', 'recent', 'change', 'momentum', 'shareMomentum', 'volatility']],
  ['reasons', ['reasons']],
  ['breaks', ['breaks']],
  ['revisions', ['revisions']],
  ['versions', ['methodVersion', 'configVersion', 'mappingVersion']],
]

function summary(s) {
  if (!s) return null
  return {
    direction: s.direction,
    evidenceSufficiency: s.evidenceSufficiency,
    evidenceQuality: s.evidenceQuality,
    baseline: s.baseline,
    recent: s.recent,
    change: s.change,
  }
}

function changedSignals(before, after) {
  const old = new Map((before?.signals ?? []).map((s) => [s.signalId, s]))
  const now = new Map((after?.signals ?? []).map((s) => [s.signalId, s]))
  const ids = [...new Set([...old.keys(), ...now.keys()])].sort(cmp)
  const out = []
  for (const signalId of ids) {
    const a = old.get(signalId)
    const b = now.get(signalId)
    let changes
    if (!a) changes = ['added']
    else if (!b) changes = ['removed']
    else changes = CHECKS.filter(([, keys]) => keys.some((k) => !same(a[k], b[k]))).map(([name]) => name)
    if (changes.length) out.push({ signalId, before: summary(a), after: summary(b), changes, signal: b ?? a })
  }
  return out
}

export function dependencyReport(before, after, references = {}) {
  const changed = changedSignals(before, after)

  const groups = changed
    .filter((c) => c.signal.evidenceKind === 'occupation_group')
    .map((c) => ({ system: c.signal.entity.system, code: c.signal.entity.code, name: c.signal.entity.name, signalId: c.signalId }))
    .sort((x, y) => cmp(x.code, y.code))
  const groupByCode = new Map(groups.map((g) => [g.code, g]))

  const occupations = []
  if (groupByCode.size) {
    for (const role of references.emascoRoles ?? []) {
      const reach = references.bridge?.groupOf('emasco', role.code)
      const group = reach?.status === 'mapped' ? groupByCode.get(reach.groupCode) : null
      if (!group) continue
      occupations.push({
        system: 'emasco',
        code: role.code,
        name: role.title,
        level: 'group',
        path: [...reach.path, { system: GROUP_SYSTEM, code: group.code, signalId: group.signalId }],
      })
    }
    occupations.sort((x, y) => cmp(`${x.system}|${x.code}`, `${y.system}|${y.code}`))
  }

  const axes = new Set()
  for (const c of changed) {
    if (c.signal.evidenceKind !== 'research_indicator') continue
    const topic = (references.topics ?? []).find((t) => t.openalexId === c.signal.entity.code)
    if (topic) axes.add(topic.axisId)
  }
  const fields = (references.fieldTopics ?? [])
    .filter((m) => m.reviewStatus === 'approved' && axes.has(m.axisId))
    .map((m) => ({ iscedCode: m.iscedCode, axisId: m.axisId, mappingId: m.mappingId }))
    .sort((x, y) => cmp(x.mappingId, y.mappingId))

  return {
    changedSignals: changed.map(({ signalId, before: b, after: a, changes }) => ({ signalId, before: b, after: a, changes })),
    affected: { groups, occupations, fields, skills: SKILLS.map((s) => ({ ...s })) },
  }
}
