// Matching data, read once from the data dir (spec §3). Every file listed in a manifest is checked against its SHA-256
// (CRLF read as LF, as server/fields/fieldSkills.js does). A missing, malformed or changed file throws MatchingDataError
// naming the file (relative to the data dir); nothing is guessed.
//
// loadMatchingData(dataDir) -> {roles, chain, jobs: Map<onetCode, {title, items, leftOut, software}>, tasksByJob,
//   aeiByTask, ilo: Map<isco, {title, mean, sd, gradient}>, sdg: {targets, links}, sources: Source[]}
//   roles: role_details.json entries with a title (the unparsed stubs have none and are never listed).
//   items: requirementItems (fit.js); leftOut: rows of kind el/kn with importance >= 3 that O*NET marks Recommend
//   Suppress = Y (not counted; the screen says "O*NET marks this rating as not precise enough").
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { makeChain } from '../../shared/matching/chain.js'
import { MIN_IMPORTANCE, requirementItems } from '../../shared/matching/fit.js'

export class MatchingDataError extends Error {
  constructor(file, reason) {
    super(`matching data file ${file}: ${reason}`)
    this.name = 'MatchingDataError'
    this.file = file
    this.reason = reason
  }
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

async function readText(dataDir, file) {
  try {
    return (await readFile(path.join(dataDir, ...file.split('/')), 'utf8')).replace(/\r\n/g, '\n')
  } catch {
    throw new MatchingDataError(file, 'missing or unreadable')
  }
}

async function readJson(dataDir, file) {
  const text = await readText(dataDir, file)
  try {
    return JSON.parse(text)
  } catch {
    throw new MatchingDataError(file, 'not valid JSON')
  }
}

function checkHash(file, text, expected) {
  if (typeof expected !== 'string' || sha256(text) !== expected) throw new MatchingDataError(file, 'does not match its manifest')
}

function parseTsv(file, text, columns) {
  const [header, ...rows] = text.split('\n').filter(Boolean)
  const names = (header ?? '').split('\t')
  for (const c of columns) if (!names.includes(c)) throw new MatchingDataError(file, `column ${c} missing`)
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

const num = (v) => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function checkedTsv(dataDir, dir, name, manifestFiles, columns) {
  const file = `${dir}/${name}`
  const text = await readText(dataDir, file)
  checkHash(file, text, manifestFiles?.[name])
  return parseTsv(file, text, columns)
}

export async function loadMatchingData(dataDir) {
  const onetManifest = await readJson(dataDir, 'onet/manifest.json')
  const aiManifest = await readJson(dataDir, 'ai/manifest.json')
  const emascoManifest = await readJson(dataDir, 'emasco/manifest.json')

  const rolesText = await readText(dataDir, 'emasco/role_details.json')
  checkHash('emasco/role_details.json', rolesText, emascoManifest.files?.['role_details.json'])
  let details
  try {
    details = JSON.parse(rolesText)
  } catch {
    throw new MatchingDataError('emasco/role_details.json', 'not valid JSON')
  }
  if (!Array.isArray(details?.roles)) throw new MatchingDataError('emasco/role_details.json', 'no roles list')
  const roles = details.roles
    .filter((r) => r && typeof r.code === 'string' && typeof r.title === 'string' && r.title.trim())
    .map((r) => ({ code: r.code, title: r.title, url: r.url ?? null, description: r.description ?? null, pageState: r.pageState ?? null }))

  const reqRows = await checkedTsv(dataDir, 'onet', 'requirements.tsv', onetManifest.files, ['kind', 'element_id', 'element', 'code', 'importance', 'level', 'suppress', 'not_relevant'])
  const taskRows = await checkedTsv(dataDir, 'onet', 'tasks.tsv', onetManifest.files, ['task_id', 'code'])
  const occRows = await checkedTsv(dataDir, 'onet', 'occupations.tsv', onetManifest.files, ['code', 'title'])
  const softRows = await checkedTsv(dataDir, 'onet', 'software.tsv', onetManifest.files, ['example', 'code'])
  const iloRows = await checkedTsv(dataDir, 'ai', 'ilo_wp140.tsv', aiManifest.files, ['isco', 'mean', 'sd', 'gradient'])
  const aeiRows = await checkedTsv(dataDir, 'ai', 'aei_tasks.tsv', aiManifest.aei?.files, ['task_id', 'usage_pct', 'automation_pct', 'augmentation_pct'])

  const titles = new Map(occRows.map((o) => [o.code, o.title]))
  const rowsByJob = new Map()
  for (const r of reqRows) {
    if (!rowsByJob.has(r.code)) rowsByJob.set(r.code, [])
    rowsByJob.get(r.code).push(r)
  }
  const softwareByJob = new Map()
  for (const r of softRows) {
    if (!softwareByJob.has(r.code)) softwareByJob.set(r.code, new Set())
    softwareByJob.get(r.code).add(r.example)
  }
  const jobs = new Map()
  const knownKeys = new Set()
  for (const [code, rows] of rowsByJob) {
    const items = requirementItems(rows)
    for (const r of rows) if (r.kind === 'el' || r.kind === 'kn') knownKeys.add(`${r.kind}:${r.element_id}`)
    const leftOut = rows
      .filter((r) => (r.kind === 'el' || r.kind === 'kn') && r.suppress === 'Y' && (num(r.importance) ?? 0) >= MIN_IMPORTANCE)
      .map((r) => ({ key: `${r.kind}:${r.element_id}`, name: r.element, reason: 'suppressed' }))
    jobs.set(code, { title: titles.get(code) ?? null, items, leftOut, software: [...(softwareByJob.get(code) ?? [])].sort() })
  }

  const tasksByJob = new Map()
  for (const r of taskRows) {
    if (!tasksByJob.has(r.code)) tasksByJob.set(r.code, [])
    const list = tasksByJob.get(r.code)
    if (!list.includes(r.task_id)) list.push(r.task_id)
  }
  const aeiByTask = new Map(aeiRows.map((r) => [r.task_id, { usage: num(r.usage_pct), automation: num(r.automation_pct), augmentation: num(r.augmentation_pct) }]))
  const ilo = new Map(iloRows.map((r) => [r.isco, { title: r.title ?? null, mean: num(r.mean), sd: num(r.sd), gradient: r.gradient || null }]))

  const bridgeFile = await readJson(dataDir, 'radar/occupation-bridge.json')
  if (!Array.isArray(bridgeFile?.steps)) throw new MatchingDataError('radar/occupation-bridge.json', 'no steps list')
  const chain = makeChain(bridgeFile, { hasRequirements: (c) => (jobs.get(c)?.items.length ?? 0) > 0 })

  const targets = await readJson(dataDir, 'sdg/targets.json')
  if (!Array.isArray(targets?.targets) || !Array.isArray(targets?.goals)) throw new MatchingDataError('sdg/targets.json', 'no goals or targets list')
  const linksFile = await readJson(dataDir, 'sdg/links.json')
  if (!Array.isArray(linksFile?.links)) throw new MatchingDataError('sdg/links.json', 'no links list')

  const sources = [
    { id: 'emasco', name: details.source ?? 'eMASCO (MASCO 2020)', url: 'https://emasco.mohr.gov.my', date: details.fetchedAt ?? emascoManifest.fetchedAt ?? null, note: emascoManifest.copiedFrom ?? null },
    { id: 'onet', name: `${onetManifest.source ?? 'O*NET Database'} ${onetManifest.version ?? ''}`.trim(), version: onetManifest.version ?? null, url: onetManifest.sourceUrl ?? null, licence: onetManifest.licence ?? null, date: onetManifest.downloadedAt ?? null },
    { id: 'ilo', name: aiManifest.source ?? 'ILO Working Paper 140', url: aiManifest.paperUrl ?? aiManifest.sourceUrl ?? null, dataUrl: aiManifest.sourceUrl ?? null, licence: aiManifest.licence ?? null, date: aiManifest.downloadedAt ?? null },
    { id: 'aei', name: aiManifest.aei?.source ?? 'Anthropic Economic Index', version: aiManifest.aei?.release ?? null, url: aiManifest.aei?.sourceUrl ?? null, licence: aiManifest.aei?.licence ?? null, date: aiManifest.aei?.downloadedAt ?? null, period: aiManifest.aei?.dataPeriod ?? null },
    { id: 'bridge', name: 'Occupation bridge (eMASCO to O*NET)', version: bridgeFile.schemaVersion ?? null, url: null, urls: bridgeFile.steps.filter((s) => s.source?.url).map((s) => ({ step: s.id, url: s.source.url })), date: bridgeFile.builtAt ?? null },
    { id: 'sdg-targets', name: targets.source ?? 'UN Statistics Division SDG API', url: targets.url ?? null, date: targets.fetchedAt ?? null },
    { id: 'sdg-links', name: 'SDG links (FutureReady team draft, used only after owner approval)', url: null, urls: [], status: linksFile.status ?? 'team draft', date: null },
  ]

  return {
    roles,
    chain,
    jobs,
    knownKeys,
    tasksByJob,
    aeiByTask,
    ilo,
    sdg: { targets, links: linksFile.links },
    sources,
  }
}
