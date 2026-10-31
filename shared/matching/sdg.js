// SDG links with owner decisions. Pure, no I/O and no Node crypto: server and browser share it.
// A link (data/sdg/links.json) ties a MASCO sub-major group ("25") or an O*NET item ("el:<id>", "kn:<id>") to one
// official SDG target, with a reason in English, BM and Chinese. Every link not rejected by the owner is shown (M16); a decision
// applies only to the link text it was made on (links[i].hash, computed on the server from id, kind, code, target
// and reason). Decisions are Radar review records of kind 'sdg_link' (server/radar/reviews.js).
export const SDG_SOURCE = 'sdg-links'
const STATUS_OF = { approved: 'approved', rejected: 'rejected', revise: 'pending' }

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// Oldest first: by time, then version, then id (as byTime in server/radar/reviews.js).
const byTime = (a, b) =>
  cmp(String(a.reviewedAt ?? ''), String(b.reviewedAt ?? '')) || (Number(a.version) || 0) - (Number(b.version) || 0) || cmp(String(a.reviewId ?? ''), String(b.reviewId ?? ''))

const goalOf = (target) => Number(String(target).split('.')[0])

// Newest sdg_link review per link id, among those made on the link's current hash.
function newestDecisions(links, reviews) {
  const newest = new Map()
  for (const r of [...(reviews ?? [])].sort(byTime)) if (r?.kind === 'sdg_link') newest.set(`${r.target}\u0000${r.appliesTo?.observationHash}`, r)
  return (links ?? []).map((link) => newest.get(`${link.id}\u0000${link.hash}`) ?? null)
}

// Every link with its status (approved | rejected | pending), reviewedAt, reviewedBy and reviewId (null when none).
export function linkStatuses(links, reviews) {
  const decisions = newestDecisions(links, reviews)
  return (links ?? []).map((link, i) => {
    const r = decisions[i]
    return { ...link, status: r ? STATUS_OF[r.decision] ?? 'pending' : 'pending', reviewedAt: r?.reviewedAt ?? null, reviewedBy: r?.reviewer ?? null, reviewId: r?.reviewId ?? null }
  })
}

// The links whose newest decision on their current text is 'approved'. revise and rejected are not shown.
export function approvedLinks(links, reviews) {
  const decisions = newestDecisions(links, reviews)
  return (links ?? []).filter((_, i) => decisions[i]?.decision === 'approved')
}

// Owner decision M16 (31 Oct): every team-draft link is shown at once, except the ones the owner rejected. approvedAt is
// the date of the owner's approval on the link's current text, or null (not yet reviewed; 'revise' counts as not reviewed).
export function shownLinks(links, reviews) {
  return linkStatuses(links, reviews)
    .filter((l) => l.status !== 'rejected')
    .map(({ status, reviewedAt, reviewedBy, reviewId, ...l }) => ({ ...l, approvedAt: status === 'approved' ? reviewedAt : null }))
}

// A role inherits the links of its 2-digit MASCO sub-major group.
export function roleLinks(approved, emascoCode) {
  if (emascoCode == null) return []
  const group = String(emascoCode).slice(0, 2)
  if (group.length !== 2) return []
  return (approved ?? []).filter((l) => l.kind === 'masco_submajor' && l.code === group)
}

// Links of one skill or knowledge item, by its key (el:<element_id> / kn:<element_id>).
export function itemLinks(approved, key) {
  return (approved ?? []).filter((l) => l.kind === 'onet_element' && l.code === key)
}

// The SDG goals a role's group links reach, ascending.
export function goalsOfRole(approved, emascoCode) {
  return [...new Set(roleLinks(approved, emascoCode).map((l) => goalOf(l.target)))].sort((a, b) => a - b)
}

// What a path touches: the role's group links plus the links of the items still to learn, grouped by goal (ascending).
// count and total are numbers of links, each shown with its reason and the date the owner approved it (approvedAt,
// when the caller's approved links carry it); never a score.
export function pathContribution(approved, emascoCode, gapKeys) {
  const entries = roleLinks(approved, emascoCode).map((l) => ({ link: l, via: 'role' }))
  for (const key of new Set(gapKeys ?? [])) for (const l of itemLinks(approved, key)) entries.push({ link: l, via: 'item' })
  const byGoal = new Map()
  for (const { link, via } of entries) {
    const goal = goalOf(link.target)
    if (!byGoal.has(goal)) byGoal.set(goal, [])
    byGoal.get(goal).push({ target: link.target, reason: link.reason, approvedAt: link.approvedAt ?? null, via: { kind: via, code: link.code, name: link.name ?? null } })
  }
  const goals = [...byGoal.keys()].sort((a, b) => a - b).map((goal) => ({ goal, count: byGoal.get(goal).length, links: byGoal.get(goal) }))
  return { goals, total: entries.length }
}
