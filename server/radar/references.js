// Radar reference data for the browser and the server (spec §4.1-§4.3): topics, field-topic proposals, the occupation
// bridge, the eMASCO roles and the field -> O*NET jobs bridge. Read-only; nothing personal passes through here.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadFieldSkills } from '../fields/fieldSkills.js'

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

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
  return { groupOf, steps: [...steps.values()].map((s) => ({ id: s.id, status: s.status, pendingReason: s.pendingReason ?? null, source: s.source ?? null })) }
}

export async function loadRadarReferences(dataDir) {
  const radarDir = path.join(dataDir, 'radar')
  const [topics, mappings, bridgeFile, emasco, fieldSkills] = await Promise.all([
    readJson(path.join(radarDir, 'topics.json')),
    readJson(path.join(radarDir, 'field-topic-mappings.json')),
    readJson(path.join(radarDir, 'occupation-bridge.json')),
    readJson(path.join(dataDir, 'emasco', 'occupations.json')),
    loadFieldSkills({ iscedDir: path.join(dataDir, 'isced'), onetDir: path.join(dataDir, 'onet') }),
  ])
  return {
    topics: topics.topics,
    fieldTopics: mappings.mappings,
    bridge: makeBridge(bridgeFile),
    // eMASCO roles {code, title, url}: the jobs a DOSM group signal reaches (group level, by first digit).
    emascoRoles: (emasco.roles ?? []).map((r) => ({ code: r.code, title: r.title, url: r.url ?? null })),
    fieldJobs: (code) => fieldSkills.jobsOf(code),
    fieldName: (code) => fieldSkills.titleOf(code),
    versions: { ...fieldSkills.versions, topics: topics.schemaVersion ?? null, fieldTopics: mappings.mappingVersion ?? null, bridge: bridgeFile.schemaVersion ?? null },
  }
}
