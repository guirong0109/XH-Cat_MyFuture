// Pure: counts and sums of matching's numbers, no new maths. Server and browser share it; nothing is mutated.
import { bandOf, movedRoles } from '../matching/outlook.js'
import { LEVEL_POINTS } from '../matching/fit.js'

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const goalOf = (target) => Number(String(target).split('.')[0])

// One matching role answer -> the parts the team view reads.
export function sliceOf(answer) {
  const fit = answer?.fit ?? null
  const missingStep = answer?.chain?.missingStep ?? null
  const available = !missingStep && fit != null
  const ai = answer?.outlook?.ai
  const jobAds = answer?.outlook?.jobAds
  return {
    code: answer?.code ?? null,
    available,
    reason: missingStep ? 'chain_broken' : fit == null ? 'no_known_skill' : null,
    missingStep,
    percent: available ? fit.percent ?? null : null,
    provisional: available ? fit.provisional === true : false,
    rows: available ? fit.rows ?? [] : null,
    bands: { moderate: bandOf(jobAds, ai?.moderate), rapid: bandOf(jobAds, ai?.rapid) },
    sdgLinks: (answer?.sdg?.pathPreview?.goals ?? []).flatMap((g) => g.links ?? []),
  }
}

const sliceFor = (p, view) => (view === 'target' ? p.target : p.current) ?? null
const usable = (s) => s != null && s.available && Array.isArray(s.rows)

function order(list) {
  return list.sort((a, b) => b.peopleShort - a.peopleShort || b.levelsShort - a.levelsShort || byKey(a.key, b.key))
}

export function heatmap(groups, people, view) {
  const ids = new Set((groups ?? []).map((g) => g.id))
  const cells = Object.fromEntries([...ids].map((id) => [id, {}]))
  const cols = new Map()
  const leftOut = []
  for (const p of people ?? []) {
    if (!ids.has(p.groupId)) continue
    const s = sliceFor(p, view)
    if (!s) continue
    if (!usable(s)) {
      leftOut.push({ personId: p.id, groupId: p.groupId, reason: s.reason ?? 'no_known_skill', missingStep: s.missingStep ?? null })
      continue
    }
    for (const r of s.rows) {
      const c = (cells[p.groupId][r.key] ??= { needing: 0, met: 0, below: 0, missing: 0, notAssessed: 0, levelsShort: 0 })
      c.needing += 1
      if (r.status === 'met') c.met += 1
      else if (r.status === 'below') c.below += 1
      else if (r.status === 'missing') c.missing += 1
      else if (r.status === 'not_assessed') c.notAssessed += 1
      c.levelsShort += r.gap ?? 0
      const col = cols.get(r.key) ?? { key: r.key, name: r.name, peopleShort: 0, levelsShort: 0 }
      if (r.status === 'below' || r.status === 'missing') col.peopleShort += 1
      col.levelsShort += r.gap ?? 0
      cols.set(r.key, col)
    }
  }
  for (const g of Object.values(cells)) {
    for (const [key, c] of Object.entries(g)) {
      const levelsShort = round(c.levelsShort, 2)
      g[key] = { ...c, levelsShort, averageGap: round(levelsShort / c.needing, 1), provisional: c.notAssessed > 0 }
    }
  }
  const columns = order([...cols.values()].map((c) => ({ ...c, levelsShort: round(c.levelsShort, 2) })))
  return { columns, cells, leftOut }
}

export function planSteps(groupId, people, view) {
  const steps = new Map()
  for (const p of people ?? []) {
    if (p.groupId !== groupId) continue
    const s = sliceFor(p, view)
    if (!usable(s)) continue
    for (const r of s.rows) {
      const st = steps.get(r.key) ?? { key: r.key, name: r.name, neededMax: 0, peopleShort: 0, missing: 0, below: 0, levelsShort: 0 }
      st.neededMax = Math.max(st.neededMax, r.needed)
      if (r.status === 'below') { st.below += 1; st.peopleShort += 1 }
      if (r.status === 'missing') { st.missing += 1; st.peopleShort += 1 }
      st.levelsShort += r.gap ?? 0
      steps.set(r.key, st)
    }
  }
  const out = [...steps.values()].filter((st) => st.peopleShort > 0).map((st) => {
    const to = ['basic', 'good', 'expert'].find((w) => LEVEL_POINTS[w] >= st.neededMax) ?? 'expert'
    return { ...st, levelsShort: round(st.levelsShort, 2), to, stillShort: st.neededMax > LEVEL_POINTS.expert }
  })
  return order(out)
}

export function bandCounts(groups, people, view, scenario) {
  const out = Object.fromEntries((groups ?? []).map((g) => [g.id, [0, 0, 0, 0]]))
  for (const p of people ?? []) {
    const s = sliceFor(p, view)
    if (!usable(s) || !out[p.groupId]) continue
    out[p.groupId][s.bands[scenario] - 1] += 1
  }
  return out
}

export function moved(people, view) {
  const list = (people ?? []).map((p) => ({ id: p.id, s: sliceFor(p, view) })).filter((x) => usable(x.s))
  const before = list.map((x) => ({ code: x.id, band: x.s.bands.moderate }))
  const after = list.map((x) => ({ code: x.id, band: x.s.bands.rapid }))
  return movedRoles(before, after).map((m) => ({ personId: m.code, from: m.from, to: m.to }))
}

export function teamSdg(groupId, people, view, planKeys) {
  const keep = new Set(planKeys ?? [])
  const seen = new Set()
  const byGoal = new Map()
  for (const p of people ?? []) {
    if (p.groupId !== groupId) continue
    const s = sliceFor(p, view)
    if (!usable(s)) continue
    for (const l of s.sdgLinks ?? []) {
      if (l.via?.kind !== 'role' && !keep.has(l.via?.code)) continue
      const id = `${l.via?.kind}|${l.via?.code}|${l.target}`
      if (seen.has(id)) continue
      seen.add(id)
      const goal = goalOf(l.target)
      if (!byGoal.has(goal)) byGoal.set(goal, [])
      byGoal.get(goal).push(l)
    }
  }
  const goals = [...byGoal.keys()].sort((a, b) => a - b).map((goal) => ({ goal, count: byGoal.get(goal).length, links: byGoal.get(goal) }))
  return { goals, total: seen.size }
}
