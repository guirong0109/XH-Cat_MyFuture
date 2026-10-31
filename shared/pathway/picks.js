// Study Pathway picks (data/pathway/picks.json) and sites (data/pathway/sites.json). Pure, no I/O and no Node crypto:
// server and browser share it. A pick is a course, a programme or a search word chosen by the team for one O*NET item
// ("el:<id>", "kn:<id>") or one field of study ("field:<ISCED code>"). Owner decisions are Radar review records of kind
// 'pathway_pick', matched on the pick id and on the pick's hash (set by the server), as for SDG links.
export const PICK_KIND = 'pathway_pick'
export const PICKS_SOURCE = 'pathway-picks'
const STATUS_OF = { approved: 'approved', rejected: 'rejected', revise: 'pending' }
const DATE = /^\d{4}-\d{2}-\d{2}$/
const KINDS = new Set(['accredited', 'professional'])
const GROUPS = new Set(['malaysian', 'global', 'tech', 'professional'])
// The keys each pick may have (spec §4); any other key stops the load.
const KEYS = {
  course: ['id', 'for', 'site', 'name', 'link', 'checkedAt'],
  accredited: ['id', 'field', 'kind', 'name', 'link', 'checkedAt', 'institution', 'mqrRef'],
  professional: ['id', 'field', 'kind', 'name', 'link', 'checkedAt', 'body'],
  searchWord: ['id', 'for', 'word', 'checkedAt'],
}

const isText = (v) => typeof v === 'string' && v.trim() !== ''

function httpsUrl(value) {
  if (!isText(value)) return null
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname ? u : null
  } catch {
    return null
  }
}

export function checkSites(file) {
  const out = []
  const seen = new Set()
  for (const [i, s] of (file?.sites ?? []).entries()) {
    const id = s?.id
    const fail = (why) => {
      throw new Error(`sites.json: site ${isText(id) ? id : `sites[${i}]`} ${why}`)
    }
    if (!isText(id)) fail('has no id')
    if (seen.has(id)) fail('has a duplicate id')
    seen.add(id)
    if (!isText(s.name)) fail('has no name')
    if (!GROUPS.has(s.group)) fail('group must be malaysian, global, tech or professional')
    if (!httpsUrl(s.home)) fail('home must be an https link')
    if (!httpsUrl(s.terms)) fail('terms must be an https link')
    if (!Array.isArray(s.hosts) || s.hosts.length === 0 || !s.hosts.every(isText)) fail('needs a list of hosts')
    if (s.search != null) {
      if (!httpsUrl(s.search) || s.search.split('<q>').length !== 2) fail('search must be an https link containing <q> exactly once')
      if (!DATE.test(String(s.searchCheckedAt ?? ''))) fail('search needs searchCheckedAt as YYYY-MM-DD')
    }
    out.push(s)
  }
  return out
}

// One flat list: courses, then programmes, then search words; each keeps its own fields and gains type and for.
export function checkPicks(file, sites, { itemKeys, fieldCodes } = {}) {
  const siteById = new Map((sites ?? []).map((s) => [s.id, s]))
  const items = itemKeys ?? new Set()
  const fields = fieldCodes ?? new Set()
  const seen = new Set()
  const out = []

  const forOk = (v) => typeof v === 'string' && (items.has(v) || (v.startsWith('field:') && fields.has(v.slice(6))))

  function each(list, listName, type, build) {
    for (const [i, p] of (list ?? []).entries()) {
      const id = p?.id
      const fail = (why) => {
        throw new Error(`picks.json: ${type} ${isText(id) ? id : `${listName}[${i}]`} ${why}`)
      }
      if (!isText(id)) fail('has no id')
      if (seen.has(id)) fail('has a duplicate id')
      seen.add(id)
      const allowed = KEYS[type === 'programme' ? p.kind : type]
      const extra = allowed ? Object.keys(p).filter((k) => !allowed.includes(k)) : []
      if (extra.length) fail(`has a key it may not have: ${extra.join(', ')}`)
      if (!DATE.test(String(p.checkedAt ?? ''))) fail('needs checkedAt as YYYY-MM-DD')
      out.push({ ...p, type, for: build(p, fail) })
    }
  }

  each(file?.courses, 'courses', 'course', (p, fail) => {
    if (!isText(p.name)) fail('has no name')
    const site = siteById.get(p.site)
    if (!site) fail(`has an unknown site "${p.site}"`)
    const url = httpsUrl(p.link)
    if (!url) fail('link must be an https link')
    if (!site.hosts.includes(url.hostname)) fail(`link host ${url.hostname} is not one of the hosts of ${site.id}`)
    if (site.id === 'elatih' && !url.pathname.startsWith('/courses-details/')) fail('e-LATiH link must be under /courses-details/')
    if (!forOk(p.for)) fail(`is for "${p.for}", which is not a known item or field`)
    return p.for
  })
  each(file?.programmes, 'programmes', 'programme', (p, fail) => {
    if (!isText(p.name)) fail('has no name')
    if (!KINDS.has(p.kind)) fail('kind must be accredited or professional')
    if (p.kind === 'accredited' && !isText(p.institution)) fail('needs an institution')
    if (p.kind === 'professional' && !isText(p.body)) fail('needs a body')
    if (!httpsUrl(p.link)) fail('link must be an https link')
    if (!fields.has(p.field)) fail(`has an unknown field "${p.field}"`)
    return `field:${p.field}`
  })
  each(file?.searchWords, 'searchWords', 'searchWord', (p, fail) => {
    if (!isText(p.word)) fail('has no word')
    if (!forOk(p.for)) fail(`is for "${p.for}", which is not a known item or field`)
    return p.for
  })
  return out
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// Oldest first: by time, then version, then id (as byTime in shared/matching/sdg.js).
const byTime = (a, b) =>
  cmp(String(a.reviewedAt ?? ''), String(b.reviewedAt ?? '')) || (Number(a.version) || 0) - (Number(b.version) || 0) || cmp(String(a.reviewId ?? ''), String(b.reviewId ?? ''))

// Every pick with its status (approved | rejected | pending), reviewedAt, reviewedBy and reviewId (null when none).
// Only the newest pathway_pick review made on the pick's current hash counts; revise counts as pending.
export function pickStatuses(picks, reviews) {
  const newest = new Map()
  for (const r of [...(reviews ?? [])].sort(byTime)) if (r?.kind === PICK_KIND) newest.set(`${r.target}\u0000${r.appliesTo?.observationHash}`, r)
  return (picks ?? []).map((pick) => {
    const r = newest.get(`${pick.id}\u0000${pick.hash}`)
    return { ...pick, status: r ? STATUS_OF[r.decision] ?? 'pending' : 'pending', reviewedAt: r?.reviewedAt ?? null, reviewedBy: r?.reviewer ?? null, reviewId: r?.reviewId ?? null }
  })
}

// Every pick the owner has not rejected. approvedAt is the date of the owner's approval on the pick's current text,
// or null (not yet reviewed; the screen shows no label for those, P15).
export function shownPicks(picks, reviews) {
  return pickStatuses(picks, reviews)
    .filter((p) => p.status !== 'rejected')
    .map(({ status, reviewedAt, reviewedBy, reviewId, ...p }) => ({ ...p, approvedAt: status === 'approved' ? reviewedAt : null }))
}

// The team's search word for an item key, or the item's own name.
export function searchWordFor(key, picksShown, defaultName) {
  const hit = (picksShown ?? []).find((p) => p.type === 'searchWord' && p.for === key)
  return hit ? hit.word : defaultName
}

// A search link on every site that has one, in file order.
export function searchLinks(word, sites) {
  const q = encodeURIComponent(word)
  return (sites ?? []).filter((s) => s.search).map((s) => ({ site: s.id, name: s.name, url: s.search.replace('<q>', () => q), checkedAt: s.searchCheckedAt }))
}

// Item keys with no course pick and fields with no accredited programme pick, unless already reported.
export function coverage(picks, itemKeys, fieldCodes, reported) {
  const list = picks ?? []
  const skip = reported ?? new Set()
  const courseFor = new Set(list.filter((p) => p.type === 'course').map((p) => p.for))
  const accreditedFor = new Set(list.filter((p) => p.type === 'programme' && p.kind === 'accredited').map((p) => p.for))
  const missing = []
  for (const key of itemKeys ?? []) if (!courseFor.has(key) && !skip.has(key)) missing.push(key)
  for (const code of fieldCodes ?? []) {
    const key = `field:${code}`
    if (!accreditedFor.has(key) && !skip.has(key)) missing.push(key)
  }
  return { missing }
}
