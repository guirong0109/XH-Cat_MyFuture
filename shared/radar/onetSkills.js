// Future Skills Radar: O*NET software-skill flag snapshots and change signals (skill-trends spec §3.1, §4, §5). Pure, no I/O.
// A flag set is the flagged rows of one O*NET release; a release is compared with the most recent earlier release whose
// flags differ (D25). Only changes become signals; "still in demand" lists are reference data (D26).

import { buildSignal } from './contract.js'

export const ONET_SKILLS_METHOD = 'onet-flag-v1'
export const ONET_SKILLS_SOURCE_ID = 'onet-skills'
export const ONET_SKILLS_SYSTEM = 'O*NET Software Skills'
export const ONET_SUMMARY_URL = 'https://www.onetonline.org/link/summary/'
export const ONET_HOT_URL = 'https://www.onetonline.org/search/hot_tech/'

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const pairKey = (r) => `${r.code}\u0000${r.example}`

function cleanRow(r) {
  return { code: r.code, example: r.example, elementId: r.elementId, elementName: r.elementName, hot: !!r.hot, inDemand: !!r.inDemand }
}

export function flagSet({ release, month, zipUrl, zipSha256, fileSha256, rows }) {
  const flagged = (rows ?? []).filter((r) => r.hot || r.inDemand).map(cleanRow).sort((a, b) => cmp(a.code, b.code) || cmp(a.example, b.example))
  return { id: release, releases: [release], month, zipUrl, zipSha256, fileSha256, rows: flagged }
}

const sameRows = (a, b) => JSON.stringify(a.rows) === JSON.stringify(b.rows)
const copySet = (s) => ({ ...s, releases: [...s.releases], rows: s.rows.map((r) => ({ ...r })) })

export function setObservations(set) {
  const out = []
  const hot = new Set()
  for (const r of set.rows) {
    if (r.inDemand) out.push({ entityType: 'skill_flag', entityId: `indemand|${r.code}|${r.example}`, period: set.id, metric: 'in_demand_flag', unit: 'flag', value: 1 })
    if (r.hot) hot.add(r.example)
  }
  for (const example of [...hot].sort(cmp)) {
    out.push({ entityType: 'skill_flag', entityId: `hot|${example}`, period: set.id, metric: 'hot_technology_flag', unit: 'flag', value: 1 })
  }
  return out
}

// parsedRelease is a flagSet(...) result (or its inputs, which are turned into one).
export function nextOnetSkillsSnapshot(active, parsedRelease, fetchedAt) {
  const parsed = parsedRelease.id ? parsedRelease : flagSet(parsedRelease)
  const incoming = copySet(parsed)
  const activeSets = active?.meta?.flagSets ?? []
  let flagSets
  if (!activeSets.length) flagSets = [incoming]
  else {
    const current = activeSets[activeSets.length - 1]
    const identical = (current.fileSha256 && current.fileSha256 === incoming.fileSha256) || sameRows(current, incoming)
    if (identical) {
      const merged = copySet(current)
      for (const rel of incoming.releases) if (!merged.releases.includes(rel)) merged.releases.push(rel)
      flagSets = [...activeSets.slice(0, -1).map(copySet), merged]
    } else flagSets = [copySet(current), incoming]
  }
  const currentSet = flagSets[flagSets.length - 1]
  const latest = currentSet.releases[currentSet.releases.length - 1]
  return {
    sourceId: ONET_SKILLS_SOURCE_ID,
    snapshotId: `${ONET_SKILLS_SOURCE_ID}-${latest}`,
    fetchedAt,
    classification: { system: ONET_SKILLS_SYSTEM, version: latest, readAt: fetchedAt },
    sourceUrls: flagSets.map((s) => ({ label: `O*NET ${s.id} database (zip)`, url: s.zipUrl })),
    meta: { flagSets },
    observations: [
      ...flagSets.flatMap(setObservations),
      { entityType: 'release', entityId: 'latest', period: latest, metric: 'release_checked', unit: 'release', value: 1 },
    ],
  }
}

function hotMap(set) {
  const m = new Map()
  for (const r of set?.rows ?? []) if (r.hot && !m.has(r.example)) m.set(r.example, r)
  return m
}
function demandMap(set) {
  const m = new Map()
  for (const r of set?.rows ?? []) if (r.inDemand) m.set(pairKey(r), r)
  return m
}
const brief = (r) => ({ code: r.code, example: r.example, elementId: r.elementId, elementName: r.elementName })
const byCodeExample = (a, b) => cmp(a.code, b.code) || cmp(a.example, b.example)

function changeDetail(snapshot) {
  const sets = snapshot?.meta?.flagSets ?? []
  const current = sets[sets.length - 1] ?? null
  const previous = sets.length > 1 ? sets[sets.length - 2] : null
  const curDemand = demandMap(current)
  const prevDemand = demandMap(previous)
  const curHot = hotMap(current)
  const prevHot = hotMap(previous)
  const added = previous ? [...curDemand].filter(([k]) => !prevDemand.has(k)).map(([, r]) => r) : []
  const dropped = previous ? [...prevDemand].filter(([k]) => !curDemand.has(k)).map(([, r]) => r) : []
  const hotAdded = previous ? [...curHot].filter(([k]) => !prevHot.has(k)).map(([, r]) => r) : []
  const hotDropped = previous ? [...prevHot].filter(([k]) => !curHot.has(k)).map(([, r]) => r) : []
  return { previous, current, added, dropped, hotAdded, hotDropped, curDemand, curHot, prevDemand }
}

export function flagChanges(snapshot) {
  const d = changeDetail(snapshot)
  const kept = {}
  for (const [k, r] of [...d.curDemand].sort((a, b) => cmp(a[0], b[0]))) {
    if (!d.previous || d.prevDemand.has(k)) (kept[r.code] ??= []).push(r.example)
  }
  return {
    previous: d.previous?.id ?? null,
    current: d.current?.id ?? null,
    inDemand: {
      added: d.added.map(brief).sort(byCodeExample),
      dropped: d.dropped.map(brief).sort(byCodeExample),
      kept,
    },
    hot: {
      added: d.hotAdded.map((r) => r.example).sort(cmp),
      dropped: d.hotDropped.map((r) => r.example).sort(cmp),
      current: [...d.curHot.keys()].sort(cmp),
    },
  }
}

export function onetSkillSignals(snapshot, { manifestId, config } = {}) {
  const d = changeDetail(snapshot)
  if (!d.previous || !d.current) return []
  const prevId = d.previous.id
  const curId = d.current.id
  const mappingVersion = `onet-flags/${prevId}..${curId}`
  const classification = { system: ONET_SKILLS_SYSTEM, version: snapshot.classification?.version ?? curId, readAt: snapshot.classification?.readAt ?? snapshot.fetchedAt ?? null }
  const common = {
    manifestId,
    evidenceKind: 'skill_posting_flag',
    unit: 'flag',
    breaks: [],
    revisions: { count: 0, items: [] },
    classification,
    sourceSnapshotIds: [snapshot.snapshotId],
    publishedAt: null,
    fetchedAt: snapshot.fetchedAt ?? null,
    methodVersion: ONET_SKILLS_METHOD,
    configVersion: config?.version,
    mappingVersion,
  }
  const core = (direction) => ({ direction, volatility: null, evidenceSufficiency: 'sufficient', evidenceQuality: 'limited', reasons: ['us_postings', 'software_only'] })
  const change = (from, to) => ({ baseline: { period: prevId, value: from }, recent: { period: curId, value: to }, change: { value: to - from, unit: 'flag', relativePercent: null } })

  const signals = []
  const demand = (r, direction) => {
    const [from, to] = direction === 'rising' ? [0, 1] : [1, 0]
    const url = `${ONET_SUMMARY_URL}${r.code}`
    signals.push(buildSignal(core(direction), {
      ...common,
      signalId: `onet:indemand:${r.code}:${r.example}`,
      entity: { type: 'skill', system: ONET_SKILLS_SYSTEM, code: r.elementId, name: r.example, sourceUrl: url },
      granularity: { level: 'occupation_skill', occupationCode: r.code },
      metric: 'in_demand_flag',
      ...change(from, to),
      evidenceLinks: [{ label: `O*NET OnLine occupation page ${r.code}`, url }],
    }))
  }
  const hot = (r, direction) => {
    const [from, to] = direction === 'rising' ? [0, 1] : [1, 0]
    signals.push(buildSignal(core(direction), {
      ...common,
      signalId: `onet:hot:${r.example}`,
      entity: { type: 'skill', system: ONET_SKILLS_SYSTEM, code: r.elementId, name: r.example, sourceUrl: ONET_HOT_URL },
      granularity: { level: 'skill' },
      metric: 'hot_technology_flag',
      ...change(from, to),
      evidenceLinks: [{ label: 'O*NET OnLine Hot Technologies', url: ONET_HOT_URL }],
    }))
  }
  for (const r of d.added) demand(r, 'rising')
  for (const r of d.dropped) demand(r, 'declining')
  for (const r of d.hotAdded) hot(r, 'rising')
  for (const r of d.hotDropped) hot(r, 'declining')
  return signals.sort((a, b) => cmp(a.signalId, b.signalId))
}
