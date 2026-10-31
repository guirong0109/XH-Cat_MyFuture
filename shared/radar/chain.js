// Copied from main d4286d6 shared/matching/chain.js; only this header line differs (spec D32). The matching code chain: eMASCO role -> MASCO unit -> ISCO-08 -> SOC 2010 -> SOC 2018 -> O*NET jobs.
// Pure, no I/O: server and browser share it. It reads the bridge file (data/radar/occupation-bridge.json) and walks
// the BLS steps backwards. It never guesses: a pending step or a code with no row stops the walk and says why.
const FIRST = 'masco2020_unit_to_isco08'
// [bridge step id, direction of the walk is the inverse of the file], with plain words for a missing row.
const INVERTED = [
  { id: 'soc2010_to_isco08', gap: (c) => `ISCO-08 ${c} has no row in the BLS ISCO-08 to SOC 2010 crosswalk` },
  { id: 'soc2018_to_soc2010', gap: (c) => `SOC 2010 ${c} has no row in the BLS SOC 2010 to SOC 2018 crosswalk` },
  { id: 'onet_to_soc2018', gap: (c) => `SOC 2018 ${c} has no row in the O*NET-SOC to SOC 2018 crosswalk` },
]
const NO_ONET = 'the linked O*NET jobs have no skill data (e.g. "All Other" codes)'

const uniq = (xs) => [...new Set(xs)]
// "SOC" + "2010" -> "SOC 2010"; "ISCO-08" + "2008" stays "ISCO-08" (version already in the name).
const sysName = (s, fallback) => {
  if (!s?.system) return fallback
  const v = s.version == null ? '' : String(s.version)
  if (!v || s.system.includes(v) || s.system.endsWith(v.slice(-2))) return s.system
  return `${s.system} ${v}`
}

export function makeChain(bridgeFile, { hasRequirements = () => true } = {}) {
  const steps = new Map((bridgeFile?.steps ?? []).map((s) => [s.id, s]))
  const inverse = new Map()
  const invert = (id) => {
    if (!inverse.has(id)) {
      const m = new Map()
      for (const [from, tos] of Object.entries(steps.get(id)?.links ?? {})) {
        for (const to of tos) m.set(to, [...(m.get(to) ?? []), from])
      }
      inverse.set(id, m)
    }
    return inverse.get(id)
  }
  const pathStep = (id, s, from, to, fromSys, toSys) => ({
    id, from: { system: fromSys, codes: from }, to: { system: toSys, codes: to },
    method: s.method ?? null, label: s.label ?? null,
    source: s.source ? { name: s.source.name, url: s.source.url, sha256: s.source.sha256 } : null,
  })

  function resolve(emascoCode) {
    const path = []
    // kind: 'pending' (step not built), 'no_row' (no link for these codes), 'invalid' (not a MASCO unit code) or
    // 'no_onet_data'. The screen words the step from id + kind in the user's language; `reason` stays an English detail.
    const stop = (isco, id, system, codes, reason, kind) => ({ isco, jobs: [], path, missingStep: { id, kind, from: { system, codes }, reason } })
    const unit = typeof emascoCode === 'string' && /^\d{4}/.test(emascoCode) ? emascoCode.slice(0, 4) : null
    const first = steps.get(FIRST)
    const mascoSys = sysName(first?.from, 'MASCO 2020')
    const fromCodes = unit ? [unit] : []
    if (first?.status !== 'built') {
      return stop(null, FIRST, mascoSys, fromCodes, first?.pendingReason ?? 'the MASCO to ISCO-08 step is not built yet', 'pending')
    }
    const iscoList = unit ? uniq(first.links?.[unit] ?? []) : []
    if (!iscoList.length) {
      return stop(null, FIRST, mascoSys, fromCodes, unit
        ? `MASCO unit ${unit} has no matching ISCO-08 code`
        : 'the code is not a MASCO 4-digit unit code', unit ? 'no_row' : 'invalid')
    }
    path.push(pathStep(FIRST, first, fromCodes, iscoList, mascoSys, sysName(first.to, 'ISCO-08')))
    const isco = iscoList[0]

    let codes = iscoList
    let system = sysName(first.to, 'ISCO-08')
    for (const { id, gap } of INVERTED) {
      const s = steps.get(id)
      if (s?.status !== 'built') return stop(isco, id, system, codes, s?.pendingReason ?? `the ${id} step is not built yet`, 'pending')
      const m = invert(id)
      const next = uniq(codes.flatMap((c) => m.get(c) ?? []))
      if (!next.length) return stop(isco, id, system, codes, gap(codes.join(', ')), 'no_row')
      const toSys = sysName(s.from, system)
      path.push(pathStep(id, s, codes, next, system, toSys))
      codes = next
      system = toSys
    }
    const jobs = codes.filter((c) => hasRequirements(c)).sort()
    if (!jobs.length) return stop(isco, 'no_onet_data', system, codes, NO_ONET, 'no_onet_data')
    return { isco, jobs, path, missingStep: null }
  }
  return { resolve }
}
