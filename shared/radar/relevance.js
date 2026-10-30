// Personal relevance for the Radar (spec §11.2): which fields, jobs, DOSM groups and AI axes relate to the user's
// confirmed profile. Pure; runs in the browser with reference data from the API. Nothing personal leaves the browser.
// Only approved field-topic links highlight an axis; pending proposals never do. Interest areas are listed, never linked.

const LEVELS = { 2: 'broad', 3: 'narrow', 4: 'detailed' }

// Approved links that apply to one ISCED-F field. A record at a broad (2-digit) or narrow (3-digit) level applies to
// every detailed field under it; per axis, the most detailed approved or rejected record decides.
// Per axis, the approved or rejected record that decides for one ISCED-F field: the most detailed one at or above it.
export function decidingFieldTopics(mappings, iscedCode) {
  const decided = new Map()
  for (const m of mappings ?? []) {
    if (m.reviewStatus !== 'approved' && m.reviewStatus !== 'rejected') continue
    const code = String(m.iscedCode ?? '')
    if (!LEVELS[code.length] || !String(iscedCode ?? '').startsWith(code)) continue
    const current = decided.get(m.axisId)
    if (!current || code.length > current.length) decided.set(m.axisId, { length: code.length, m })
  }
  return decided
}

// Approved records that reach fields on one axis, each with its level and the more detailed codes under it where a
// rejection on the same axis decides instead (spec §4.2).
export function approvedFieldReach(mappings, axisId) {
  const decides = (m) => decidingFieldTopics(mappings, m.iscedCode).get(axisId)?.m === m
  const onAxis = (mappings ?? []).filter((m) => m.axisId === axisId && decides(m))
  const rejected = onAxis.filter((m) => m.reviewStatus === 'rejected')
  return onAxis
    .filter((m) => m.reviewStatus === 'approved')
    .map((m) => {
      const code = String(m.iscedCode)
      const excludes = [...new Set(rejected.map((r) => String(r.iscedCode)).filter((c) => c.length > code.length && c.startsWith(code)))].sort()
      return { iscedCode: m.iscedCode, axisId, mappingId: m.mappingId, level: LEVELS[code.length], excludes }
    })
}

export function effectiveFieldTopics(mappings, iscedCode) {
  const decided = decidingFieldTopics(mappings, iscedCode)
  return [...decided.values()]
    .filter(({ m }) => m.reviewStatus === 'approved')
    .sort((a, b) => a.length - b.length)
    .map(({ length, m }) => ({ axisId: m.axisId, mappingId: m.mappingId, level: LEVELS[length] }))
}

export function relevantItems(profile, refs) {
  const fields = []
  const seenFields = new Set()
  for (const record of profile?.education?.records ?? []) {
    const code = record?.field?.code
    if (!code || seenFields.has(code)) continue
    seenFields.add(code)
    fields.push({
      code,
      title: refs.fieldName(code) ?? record.field.title ?? null,
      jobs: refs.fieldJobs(code),
      topics: effectiveFieldTopics(refs.fieldTopics, code),
    })
  }

  const occupations = []
  const seenJobs = new Set()
  const addJob = (occupation, role) => {
    if (!occupation?.code || !occupation?.source) return
    const key = `${occupation.source}|${occupation.code}`
    if (seenJobs.has(key)) return
    seenJobs.add(key)
    occupations.push({ source: occupation.source, code: occupation.code, title: occupation.title ?? null, role, group: refs.bridge.groupOf(occupation.source, occupation.code) })
  }
  for (const record of profile?.employment?.records ?? []) addJob(record?.occupation, 'held')
  for (const m of profile?.occupationMappings ?? []) addJob(m?.chosen, m?.kind === 'interest' ? 'interest' : 'job')

  const groups = []
  for (const o of occupations) {
    const code = o.group.groupCode
    if (!code) continue
    const via = { source: o.source, code: o.code, title: o.title }
    const existing = groups.find((g) => g.groupCode === code)
    if (existing) existing.via.push(via)
    else groups.push({ groupCode: code, system: 'MASCO 2020', via: [via], path: o.group.path })
  }

  const axes = []
  for (const field of fields) {
    for (const link of field.topics) {
      const via = { fieldCode: field.code, mappingId: link.mappingId, level: link.level }
      const existing = axes.find((a) => a.axisId === link.axisId)
      if (existing) existing.vias.push(via)
      else axes.push({ axisId: link.axisId, topic: refs.topics.find((t) => t.axisId === link.axisId) ?? null, via, vias: [via] })
    }
  }

  const interests = []
  for (const item of profile?.preferences?.careerInterests ?? []) {
    if (typeof item === 'string') {
      if (item.trim()) interests.push({ id: null, name: item, source: 'text' })
    } else if (item?.name) interests.push({ id: item.id ?? null, name: item.name, source: item.source ?? 'text' })
  }

  return { fields, occupations, groups, axes, interests, empty: !fields.length && !occupations.length && !interests.length }
}
