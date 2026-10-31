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
