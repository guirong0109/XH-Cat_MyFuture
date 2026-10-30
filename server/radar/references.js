// Radar reference data for the browser and the server (spec §4.1-§4.3): topics, field-topic proposals, the occupation
// bridge, the eMASCO roles and the field -> O*NET jobs bridge. Read-only; nothing personal passes through here.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadFieldSkills } from '../fields/fieldSkills.js'
import { makeBridge } from '../../shared/radar/bridge.js'

export { makeBridge }

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

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
    // The bridge file as built, for the browser (it runs the same lookup for personal relevance).
    bridgeFile,
    // eMASCO roles {code, title, url}: the jobs a DOSM group signal reaches (group level, by first digit).
    emascoRoles: (emasco.roles ?? []).map((r) => ({ code: r.code, title: r.title, url: r.url ?? null })),
    fieldJobs: (code) => fieldSkills.jobsOf(code),
    fieldName: (code) => fieldSkills.titleOf(code),
    fieldList: () => fieldSkills.list(),
    // O*NET job title by code (the catalogue snapshot in data/onet/occupations.tsv).
    onetTitle: (code) => fieldSkills.jobTitle(code),
    versions: { ...fieldSkills.versions, topics: topics.schemaVersion ?? null, fieldTopics: mappings.mappingVersion ?? null, bridge: bridgeFile.schemaVersion ?? null },
  }
}
