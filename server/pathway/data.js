// Study Pathway data, read once from the data dir (spec §4). Every file is checked against its manifest SHA-256 (CRLF
// read as LF, as server/matching/data.js does). A missing, malformed or changed file, or a bad site or pick, throws
// PathwayDataError naming the file (relative to the data dir); nothing is guessed.
//
// loadPathwayData(dataDir) -> {education, qualifications, routeIndex, sites, picks, itemKeys, fieldCodes, sources}
//   education: onet/education.tsv rows; qualifications: Map eMASCO code -> trimmed qualification or null (P14);
//   routeIndex: indexRoute(...) of the isced files; picks: checkPicks(...) flat list, each with hash = pickHash(pick);
//   itemKeys: every el:/kn: key in onet/requirements.tsv; fieldCodes: Set of fieldsReachingOnet(routeIndex).
// pickHash(pick): SHA-256 of what a pick decision is about (its id, type, for and content; not checkedAt).
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fieldsReachingOnet, indexRoute } from '../../shared/pathway/route.js'
import { PICKS_SOURCE, checkPicks, checkSites } from '../../shared/pathway/picks.js'

export class PathwayDataError extends Error {
  constructor(file, reason) {
    super(`pathway data file ${file}: ${reason}`)
    this.name = 'PathwayDataError'
    this.file = file
    this.reason = reason
  }
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

export function pickHash(pick) {
  const fields = ['id', 'type', 'for', 'site', 'institution', 'body', 'kind', 'mqrRef', 'name', 'link', 'word']
  return sha256(JSON.stringify(Object.fromEntries(fields.map((f) => [f, pick?.[f] ?? null]))))
}

async function readText(dataDir, file) {
  try {
    return (await readFile(path.join(dataDir, ...file.split('/')), 'utf8')).replace(/\r\n/g, '\n')
  } catch {
    throw new PathwayDataError(file, 'missing or unreadable')
  }
}

function parseJson(file, text) {
  try {
    return JSON.parse(text)
  } catch {
    throw new PathwayDataError(file, 'not valid JSON')
  }
}

const readJson = async (dataDir, file) => parseJson(file, await readText(dataDir, file))

// The file's text, checked against the hash its manifest lists under its own name.
async function checkedText(dataDir, file, manifest) {
  const text = await readText(dataDir, file)
  const expected = manifest?.files?.[file.split('/').pop()]
  if (typeof expected !== 'string' || sha256(text) !== expected) throw new PathwayDataError(file, 'does not match its manifest')
  return text
}

function parseTsv(file, text, columns) {
  const [header, ...rows] = text.split('\n').filter(Boolean)
  const names = (header ?? '').split('\t')
  for (const c of columns) if (!names.includes(c)) throw new PathwayDataError(file, `column ${c} missing`)
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

const checkedTsv = async (dataDir, file, manifest, columns) => parseTsv(file, await checkedText(dataDir, file, manifest), columns)

// A check from shared/pathway/picks.js throws a plain Error naming the entry; here it names the file too.
function checked(file, check) {
  try {
    return check()
  } catch (error) {
    throw new PathwayDataError(file, error.message)
  }
}

export async function loadPathwayData(dataDir) {
  const onetManifest = await readJson(dataDir, 'onet/manifest.json')
  const iscedManifest = await readJson(dataDir, 'isced/manifest.json')
  const emascoManifest = await readJson(dataDir, 'emasco/manifest.json')
  const pathwayManifest = await readJson(dataDir, 'pathway/manifest.json')

  const details = parseJson('emasco/role_details.json', await checkedText(dataDir, 'emasco/role_details.json', emascoManifest))
  if (!Array.isArray(details?.roles)) throw new PathwayDataError('emasco/role_details.json', 'no roles list')
  const qualifications = new Map()
  for (const r of details.roles) {
    if (!r || typeof r.code !== 'string') continue
    const text = typeof r.qualification === 'string' ? r.qualification.trim() : ''
    qualifications.set(r.code, text || null)
  }

  const education = await checkedTsv(dataDir, 'onet/education.tsv', onetManifest, ['code', 'category', 'label', 'percent', 'suppress'])
  const reqRows = await checkedTsv(dataDir, 'onet/requirements.tsv', onetManifest, ['kind', 'element_id'])
  const itemKeys = new Set(reqRows.filter((r) => r.kind === 'el' || r.kind === 'kn').map((r) => `${r.kind}:${r.element_id}`))
  // Item name per key (the O*NET element name) and field title per ISCED code: the admin list says what a pick is for.
  const itemNames = new Map(reqRows.filter((r) => itemKeys.has(`${r.kind}:${r.element_id}`) && r.element).map((r) => [`${r.kind}:${r.element_id}`, r.element]))

  const fields = await checkedTsv(dataDir, 'isced/fields.tsv', iscedManifest, ['code', 'title'])
  const isced = await checkedTsv(dataDir, 'isced/isced_cip.tsv', iscedManifest, ['isced_code', 'isced_title', 'cip_code', 'cip_title', 'partial'])
  const cip = await checkedTsv(dataDir, 'isced/cip_onet.tsv', iscedManifest, ['cip_code', 'code'])
  const fieldTitles = new Map(fields.map((f) => [f.code, f.title]))
  const routeIndex = indexRoute({ isced, cip, fields })
  const fieldCodes = new Set(fieldsReachingOnet(routeIndex))

  const sitesFile = parseJson('pathway/sites.json', await checkedText(dataDir, 'pathway/sites.json', pathwayManifest))
  const sites = checked('pathway/sites.json', () => checkSites(sitesFile))
  const picksFile = parseJson('pathway/picks.json', await checkedText(dataDir, 'pathway/picks.json', pathwayManifest))
  const picks = checked('pathway/picks.json', () => checkPicks(picksFile, sites, { itemKeys, fieldCodes })).map((p) => ({ ...p, hash: pickHash(p) }))

  // The bridge is read (not checked) as matching reads it; only its build date is used here.
  const bridge = await readJson(dataDir, 'radar/occupation-bridge.json')
  const [statcan, crosswalk] = Array.isArray(iscedManifest.sources) ? iscedManifest.sources : []
  const iscedSource = (id, s) => ({ id, name: s ? `${s.what} (${s.by})` : null, url: s?.url ?? null, date: iscedManifest.downloadedAt ?? null, licence: s?.licence ?? null })
  const sources = [
    { id: 'onet', name: `${onetManifest.source ?? 'O*NET Database'} ${onetManifest.version ?? ''}`.trim(), url: onetManifest.sourceUrl ?? null, date: onetManifest.downloadedAt ?? null, licence: onetManifest.licence ?? null },
    { id: 'bridge', name: 'Occupation bridge (eMASCO to O*NET)', url: null, date: bridge?.builtAt ?? null, licence: null },
    { id: 'emasco-qualification', name: details.source ?? 'eMASCO (MASCO 2020)', url: 'https://emasco.mohr.gov.my', date: details.fetchedAt ?? emascoManifest.fetchedAt ?? null, licence: null },
    iscedSource('isced-cip', statcan),
    iscedSource('cip-onet', crosswalk),
    { id: PICKS_SOURCE, name: 'FutureReady team picks (owner review in Admin)', url: null, date: pathwayManifest.builtAt ?? null, licence: null },
    ...sites.filter((s) => s.search).map((s) => ({ id: `site:${s.id}`, name: s.name, url: s.home, date: s.searchCheckedAt ?? null, licence: null })),
  ]

  return { education, qualifications, routeIndex, sites, picks, itemKeys, itemNames, fieldTitles, fieldCodes, sources }
}

// The start-up check (server/index.js): the loaded data, or one error line naming the file and the bad entry (spec §7,
// §9: a bad picks file stops the server at start-up). Never throws.
export async function checkPathwayData(dataDir) {
  try {
    return { data: await loadPathwayData(dataDir), error: null }
  } catch (error) {
    const message = String(error?.message ?? error?.name ?? 'Error').replace(/\s+/g, ' ')
    return { data: null, error: `[pathway] start-up stopped: ${message}` }
  }
}
