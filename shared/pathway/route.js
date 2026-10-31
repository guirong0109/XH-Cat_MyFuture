// Study route: which fields of study (ISCED-F) lead to an O*NET job, and the usual education level for a job.
// Pure, no I/O: server and browser share it. Links come from the CIP crosswalks in data/isced/; nothing is guessed.
const push = (map, key, value) => {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

// jobCips: O*NET code -> CIP codes; cipFields: CIP code -> [{code, title, partial}] (ISCED field links).
export function indexRoute({ isced, cip, fields }) {
  const titles = new Map(fields.map((f) => [f.code, f.title]))
  const cipFields = new Map()
  const jobCips = new Map()
  for (const r of isced) {
    push(cipFields, r.cip_code, { code: r.isced_code, title: titles.get(r.isced_code) ?? r.isced_title, cipTitle: r.cip_title, partial: r.partial === 'Y' })
  }
  for (const r of cip) push(jobCips, r.code, r.cip_code)
  return { cipFields, jobCips }
}

export function fieldsFor(index, onetCode, yourCodes = []) {
  const byField = new Map()
  for (const cipCode of new Set(index.jobCips.get(onetCode) ?? [])) {
    for (const f of index.cipFields.get(cipCode) ?? []) {
      if (!byField.has(f.code)) byField.set(f.code, { code: f.code, title: f.title, cips: [] })
      const entry = byField.get(f.code)
      if (!entry.cips.some((c) => c.code === cipCode)) entry.cips.push({ code: cipCode, title: f.cipTitle, partial: f.partial })
    }
  }
  return [...byField.values()]
    .map((f) => ({ ...f, partial: f.cips.every((c) => c.partial), yours: yourCodes.includes(f.code) }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

export function fieldsReachingOnet(index) {
  const codes = new Set()
  for (const [cipCode, fs] of index.cipFields) {
    if (![...index.jobCips.values()].some((list) => list.includes(cipCode))) continue
    for (const f of fs) codes.add(f.code)
  }
  return [...codes].sort()
}

export function educationFor(rows, onetCode) {
  const mine = rows.filter((r) => r.code === onetCode)
  const kept = mine.filter((r) => r.suppress !== 'Y')
  if (!kept.length) return null
  const all = kept
    .map((r) => ({ category: Number(r.category), label: r.label, percent: Number(r.percent) }))
    .sort((a, b) => a.category - b.category)
  const best = Math.max(...all.map((r) => r.percent))
  return { top: all.filter((r) => r.percent === best), all, suppressedLeftOut: mine.length - kept.length }
}
