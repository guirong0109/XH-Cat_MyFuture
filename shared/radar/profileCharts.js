// Radar profile charts (spec D28-D33): the O*NET jobs that follow the user's confirmed profile.
// Pure, no I/O. Jobs come from O*NET roles, then education fields, then eMASCO roles through the code chain.

// rel = relevantItems() of the confirmed profile (null when none). chain = makeChain(...); onetTitle = code -> title.
// Job = { code, title, via: [{ kind:'role'|'field'|'chain', from:{source,code,title}, path?, isco? }] }
export function profileJobs(rel, { chain, onetTitle }) {
  const jobs = []
  const broken = []
  if (!rel) return { jobs, broken }
  const byCode = new Map()
  const add = (code, title, via) => {
    let job = byCode.get(code)
    if (!job) {
      job = { code, title: title ?? onetTitle(code) ?? null, via: [] }
      byCode.set(code, job)
      jobs.push(job)
    }
    job.via.push(via)
  }
  const occupations = rel.occupations ?? []

  for (const o of occupations.filter((x) => x.source === 'onet')) {
    add(o.code, onetTitle(o.code) ?? o.title, { kind: 'role', from: { source: 'onet', code: o.code, title: o.title ?? null } })
  }
  for (const f of rel.fields ?? []) {
    for (const j of f.jobs ?? []) {
      add(j.code, j.title ?? onetTitle(j.code), { kind: 'field', from: { source: 'field', code: f.code, title: f.title ?? null } })
    }
  }
  for (const o of occupations.filter((x) => x.source === 'emasco')) {
    const r = chain.resolve(o.code)
    if (r.missingStep) {
      broken.push({ source: 'emasco', code: o.code, title: o.title ?? null, missingStep: r.missingStep })
      continue
    }
    for (const code of r.jobs) {
      add(code, onetTitle(code), { kind: 'chain', from: { source: 'emasco', code: o.code, title: o.title ?? null }, path: r.path, isco: r.isco })
    }
  }
  return { jobs, broken }
}

// In-demand O*NET software skills of the user's jobs (spec D30), with US job-ad counts (labelled as such on screen).
// skills = /api/radar/skills answer. Compared by skillId, never by name.
export function skillCorners(jobs, skills) {
  const changes = skills?.changes ?? {}
  const rows = skills?.postings?.rows ?? []
  const count = (list) => new Map((list ?? []).map((r) => [r.skillId, r.postings]))
  const now = count(rows)
  const before = count(skills?.postings?.previous?.rows)
  const byId = new Map()
  const droppedById = new Map()
  const noSkills = []
  const addTo = (map, item, job, extra = {}) => {
    let entry = map.get(item.skillId)
    if (!entry) {
      entry = { skillId: item.skillId, example: item.example, jobs: [], ...extra }
      map.set(item.skillId, entry)
    }
    if (!entry.jobs.some((j) => j.code === job.code)) entry.jobs.push({ code: job.code, title: job.title, via: job.via })
    return entry
  }
  for (const job of jobs ?? []) {
    const c = changes[job.code]
    const inDemand = [...(c?.kept ?? []), ...(c?.added ?? [])]
    if (!inDemand.length) noSkills.push({ code: job.code, title: job.title })
    for (const it of c?.kept ?? []) addTo(byId, it, job, { isNew: true }).isNew = false
    for (const it of c?.added ?? []) addTo(byId, it, job, { isNew: true })
    for (const it of c?.dropped ?? []) addTo(droppedById, it, { code: job.code, title: job.title, via: [] })
  }
  const items = [...byId.values()].map((e) => ({
    skillId: e.skillId,
    example: e.example,
    postings: now.get(e.skillId) ?? null,
    previousPostings: before.get(e.skillId) ?? null,
    isNew: e.isNew,
    jobs: e.jobs,
  }))
  items.sort((a, b) => (a.postings === null) - (b.postings === null) || (b.postings ?? 0) - (a.postings ?? 0) || a.example.localeCompare(b.example, 'en'))
  const dropped = [...droppedById.values()]
    .filter((e) => !byId.has(e.skillId))
    .map((e) => ({ example: e.example, skillId: e.skillId, jobs: e.jobs.map((j) => ({ code: j.code, title: j.title })) }))
  return { items, dropped, noSkills, release: skills?.release ?? null, window: skills?.postings?.window ?? null, firstSnapshot: skills?.postings?.firstSnapshot ?? false }
}

export function filterItems(items, q) {
  const needle = String(q ?? '').trim().toLowerCase()
  return needle ? items.filter((i) => i.example.toLowerCase().includes(needle)) : items
}
