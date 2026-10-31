// Study Pathway, skills to build: Skill Match rows (fitFor(...).rows) -> steps grouped as gaps, not assessed and met.
// Pure, no I/O: server and browser share it. Points are a share of ALL needed levels, as in fitFor().raise.
import { LEVEL_POINTS } from '../matching/fit.js'

const WORDS = ['basic', 'good', 'expert']
const wordFor = (points) => WORDS.find((w) => LEVEL_POINTS[w] === points) ?? null
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
const byImportance = (a, b) => b.importance - a.importance || byKey(a, b)

function stepFor(r, totalNeeded) {
  const isGap = r.status === 'below' || r.status === 'missing'
  return {
    key: r.key, name: r.name, kind: r.kind, importance: r.importance, needed: r.needed, you: r.you, status: r.status,
    from: r.status === 'missing' ? null : wordFor(r.you),
    to: WORDS.find((w) => LEVEL_POINTS[w] >= r.needed) ?? 'expert',
    points: isGap && totalNeeded > 0 ? Math.round((r.gap / totalNeeded) * 100) : null,
    stillShort: r.needed > LEVEL_POINTS.expert,
  }
}

export function pathwaySteps(rows) {
  const list = rows ?? []
  const totalNeeded = list.reduce((t, r) => t + r.needed, 0)
  const steps = list.map((r) => stepFor(r, totalNeeded))
  const of = (...statuses) => steps.filter((s) => statuses.includes(s.status))
  return {
    gaps: of('below', 'missing').sort((a, b) => b.points - a.points || byKey(a, b)),
    notAssessed: of('not_assessed').sort(byImportance),
    met: of('met').sort(byImportance),
    provisional: steps.some((s) => s.status === 'not_assessed'),
  }
}
