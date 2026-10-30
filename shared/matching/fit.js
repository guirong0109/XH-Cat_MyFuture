// Skill Match: levels met over levels needed, for one job. Pure, no I/O: server and browser share it.
// Needed levels come from O*NET (requirements.tsv); "you" comes from the profile skills the person stated.
export const LEVEL_POINTS = { basic: 2, good: 4, expert: 6 }
export const MIN_IMPORTANCE = 3

const WORDS = ['basic', 'good', 'expert']
const wordFor = (points) => WORDS.find((w) => LEVEL_POINTS[w] === points) ?? null
const num = (v) => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Rows of ONE job -> the skills and knowledge it needs (importance >= 3, not suppressed, relevant, with a level).
export function requirementItems(rows) {
  const items = []
  for (const r of rows ?? []) {
    if (r.kind !== 'el' && r.kind !== 'kn') continue
    if (r.suppress === 'Y' || r.not_relevant === 'Y') continue
    const importance = num(r.importance)
    const needed = num(r.level)
    if (importance == null || needed == null || importance < MIN_IMPORTANCE) continue
    items.push({ key: `${r.kind}:${r.element_id}`, elementId: r.element_id, kind: r.kind, name: r.element, importance, needed })
  }
  return items
}

// profile.skills -> Map key -> {points, notAssessed}. The highest stated level wins; not assessed only when none has one.
export function profileLevels(profile) {
  const out = new Map()
  for (const s of profile?.skills ?? []) {
    const m = /^onet:(el|kn):(.+)$/.exec(s?.canonicalId ?? '')
    if (!m) continue
    const key = `${m[1]}:${m[2]}`
    const pts = LEVEL_POINTS[s.proficiency] ?? null
    const prev = out.get(key)
    if (!prev) out.set(key, { points: pts, notAssessed: pts == null })
    else if (pts != null && (prev.points == null || pts > prev.points)) out.set(key, { points: pts, notAssessed: false })
  }
  return out
}

// rows {needed, you} -> levels met (each capped at what is needed) over levels needed.
export function levelsMet(rows) {
  let met = 0
  let needed = 0
  for (const r of rows) {
    met += Math.min(r.you, r.needed)
    needed += r.needed
  }
  return { met, needed, percent: needed > 0 ? Math.round((met / needed) * 100) : null }
}

export function fitFor(items, levels) {
  const rows = items.map((it) => {
    const l = levels.get(it.key)
    let you = 0
    let status = 'missing'
    if (l) {
      if (l.points == null) { you = it.needed; status = 'not_assessed' }
      else { you = l.points; status = you >= it.needed ? 'met' : 'below' }
    }
    return { ...it, you, status, gap: Math.max(0, it.needed - you) }
  })
  const raise = rows
    .filter((r) => r.gap > 0)
    .map((r) => {
      const to = WORDS.find((w) => LEVEL_POINTS[w] >= r.needed) ?? 'expert'
      return {
        key: r.key, name: r.name,
        action: r.status === 'missing' ? 'learn' : 'raise',
        from: r.status === 'missing' ? null : wordFor(r.you),
        to, points: Math.round((r.gap / r.needed) * 100), stillShort: r.needed > LEVEL_POINTS.expert,
      }
    })
    .sort((a, b) => b.points - a.points || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, 3)
  return { ...levelsMet(rows), provisional: rows.some((r) => r.status === 'not_assessed'), rows, raise }
}

// jobs {code, title, items} -> the best fit (highest percent, ties by code) and the rest in the same order.
export function bestFit(jobs, levels) {
  const all = (jobs ?? []).map((j) => ({ code: j.code, title: j.title, fit: fitFor(j.items, levels) }))
  all.sort((a, b) => (b.fit.percent ?? -1) - (a.fit.percent ?? -1) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  return { best: all[0] ?? null, others: all.slice(1) }
}
