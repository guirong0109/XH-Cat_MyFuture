// The occupation bridge lookup (spec §4.3): eMASCO roles by code prefix; O*NET jobs through the built crosswalk steps.
// Pure, no I/O: the server (server/radar/references.js) and the browser (Radar screen, personal relevance) share it.
export function makeBridge(bridgeFile) {
  const steps = new Map((bridgeFile?.steps ?? []).map((s) => [s.id, s]))
  const stepRef = (id) => {
    const s = steps.get(id)
    return { stepId: id, status: s?.status ?? 'pending', source: s?.source ?? null }
  }

  function groupOf(system, code) {
    if (system === 'emasco') {
      if (typeof code !== 'string' || !/^\d{4}-\d{2}$/.test(code)) return { groupCode: null, status: 'unmapped', path: [] }
      return { groupCode: code[0], status: 'mapped', path: [{ system: 'MASCO 2020', code, method: 'code_prefix', source: 'eMASCO' }] }
    }
    if (system !== 'onet') return { groupCode: null, status: 'unmapped', path: [] }
    const path = []
    let codes = [code]
    for (const id of ['onet_to_soc2018', 'soc2018_to_soc2010', 'soc2010_to_isco08']) {
      const step = steps.get(id)
      if (step?.status !== 'built') return { groupCode: null, status: 'pending', path }
      const next = [...new Set(codes.flatMap((c) => step.links?.[c] ?? []))]
      if (!next.length) return { groupCode: null, status: 'unmapped', path }
      path.push({ ...stepRef(id), from: codes, to: next })
      codes = next
    }
    const last = steps.get('isco08_to_masco2020_major')
    if (last?.status !== 'built') return { groupCode: null, status: 'pending', path }
    // Only reached once the owner has recorded an official source for ISCO-08 major group = MASCO 2020 major group.
    const groups = [...new Set(codes.map((c) => c[0]))]
    path.push({ ...stepRef('isco08_to_masco2020_major'), from: codes, to: groups })
    return { groupCode: groups.length === 1 ? groups[0] : null, groupCodes: groups, status: 'mapped', path }
  }
  // ISCO-08 codes of one O*NET job: the same three built steps, sorted and unique; [] when a step is not built or has no row.
  function iscoOf(onetCode) {
    let codes = [onetCode]
    for (const id of ['onet_to_soc2018', 'soc2018_to_soc2010', 'soc2010_to_isco08']) {
      const step = steps.get(id)
      if (step?.status !== 'built') return []
      codes = [...new Set(codes.flatMap((c) => step.links?.[c] ?? []))]
      if (!codes.length) return []
    }
    return codes.sort()
  }
  return { groupOf, iscoOf, steps: [...steps.values()].map((s) => ({ id: s.id, status: s.status, pendingReason: s.pendingReason ?? null, source: s.source ?? null })) }
}
