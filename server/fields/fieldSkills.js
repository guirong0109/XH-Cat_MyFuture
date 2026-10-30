// Skills suggested from a field of study (owner request, 30 Oct). Only O*NET data and the two official bridge tables:
//   ISCED-F field → CIP programmes (Statistics Canada) → O*NET jobs (O*NET CIP crosswalk) → what those jobs list.
// A suggestion is something the field's jobs list more often than all O*NET jobs do:
//   software / tools: share of the field's jobs listing it > share of all jobs, and listed by at least 2 of the field's
//     jobs (or by its only job);
//   O*NET skills: average importance in the field's jobs > average across all jobs (top 5).
// Every suggestion carries the numbers that explain it. Nothing is added to a profile here: the user ticks.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { IscedUnavailable } from './isced.js'
import { SKILL_ELEMENT_CATEGORY, nameKey } from '../skills/onetSkills.js'

const TOP_SKILLS = 5
const TOP_SOFTWARE = 15
const MIN_JOBS = 2

function parseTsv(text) {
  const [header, ...rows] = text.split('\n').filter(Boolean)
  const names = header.split('\t')
  return rows.map((row) => Object.fromEntries(row.split('\t').map((cell, i) => [names[i], cell])))
}

async function readChecked(dir, names) {
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  const tables = {}
  for (const name of names) {
    const text = (await readFile(path.join(dir, name), 'utf8')).replace(/\r\n/g, '\n')
    if (createHash('sha256').update(text).digest('hex') !== manifest.files?.[name]) throw new Error(`${name} does not match the manifest`)
    tables[name] = parseTsv(text)
  }
  return { manifest, tables }
}

const round = (n) => Math.round(n * 100) / 100
const average = (values) => values.reduce((a, b) => a + b, 0) / values.length

export async function loadFieldSkills({ iscedDir, onetDir }) {
  let isced
  let onet
  try {
    isced = await readChecked(iscedDir, ['fields.tsv', 'isced_cip.tsv', 'cip_onet.tsv'])
    onet = await readChecked(onetDir, ['occupations.tsv', 'software.tsv', 'skills.tsv'])
  } catch (error) {
    throw new IscedUnavailable(error.message)
  }
  const jobsInSnapshot = new Set(onet.tables['occupations.tsv'].map((o) => o.code))
  const allJobs = jobsInSnapshot.size
  const fields = new Map(isced.tables['fields.tsv'].map((f) => [f.code, f.title]))
  const cipsOf = new Map()
  for (const link of isced.tables['isced_cip.tsv']) {
    if (!cipsOf.has(link.isced_code)) cipsOf.set(link.isced_code, new Set())
    cipsOf.get(link.isced_code).add(link.cip_code)
  }
  const jobsOfCip = new Map()
  for (const row of isced.tables['cip_onet.tsv']) {
    if (!jobsInSnapshot.has(row.code)) continue
    if (!jobsOfCip.has(row.cip_code)) jobsOfCip.set(row.cip_code, new Set())
    jobsOfCip.get(row.cip_code).add(row.code)
  }
  // software id → { name, category, jobs } (ids and names as in the skill catalogue)
  const software = new Map()
  for (const row of onet.tables['software.tsv']) {
    if (!row.example || !jobsInSnapshot.has(row.code)) continue
    const id = `onet:tech:${nameKey(row.example)}`
    if (!software.has(id)) software.set(id, { id, name: row.example, category: row.element || null, jobs: new Set() })
    software.get(id).jobs.add(row.code)
  }
  // skill element id → { name, importance by job }
  const elements = new Map()
  for (const row of onet.tables['skills.tsv']) {
    if (!jobsInSnapshot.has(row.code)) continue
    const id = `onet:el:${row.element_id}`
    if (!elements.has(id)) elements.set(id, { id, name: row.element, byJob: new Map() })
    elements.get(id).byJob.set(row.code, Number(row.importance))
  }
  const allImportance = new Map([...elements.values()].map((e) => [e.id, average([...e.byJob.values()])]))

  function suggest(code) {
    const field = { code, title: fields.get(code) }
    const jobs = new Set()
    for (const cip of cipsOf.get(code) ?? []) for (const job of jobsOfCip.get(cip) ?? []) jobs.add(job)
    if (!jobs.size) return { field, jobs: 0, suggestions: [] }

    const skills = []
    for (const element of elements.values()) {
      const values = [...jobs].filter((job) => element.byJob.has(job)).map((job) => element.byJob.get(job))
      if (!values.length) continue
      const inField = average(values)
      const overall = allImportance.get(element.id)
      if (inField > overall) skills.push({ id: element.id, name: element.name, category: SKILL_ELEMENT_CATEGORY, kind: 'skill', fieldImportance: round(inField), allImportance: round(overall), lift: inField - overall })
    }
    skills.sort((a, b) => b.lift - a.lift)

    const minJobs = Math.min(MIN_JOBS, jobs.size)
    const tools = []
    for (const entry of software.values()) {
      const inField = [...entry.jobs].filter((job) => jobs.has(job)).length
      if (inField < minJobs) continue
      const lift = inField / jobs.size - entry.jobs.size / allJobs
      if (lift > 0) tools.push({ id: entry.id, name: entry.name, category: entry.category, kind: 'software', inField, fieldJobs: jobs.size, allCount: entry.jobs.size, allJobs, lift })
    }
    tools.sort((a, b) => b.lift - a.lift || b.inField - a.inField || a.name.localeCompare(b.name))

    const suggestions = [...skills.slice(0, TOP_SKILLS), ...tools.slice(0, TOP_SOFTWARE)].map(({ lift, ...rest }) => rest)
    return { field, jobs: jobs.size, suggestions }
  }

  const jobTitles = new Map(onet.tables['occupations.tsv'].map((o) => [o.code, o.title]))
  // The O*NET jobs a field leads to through the CIP bridge, sorted by code (used by the Radar's personal relevance).
  function jobsOf(code) {
    const jobs = new Set()
    for (const cip of cipsOf.get(code) ?? []) for (const job of jobsOfCip.get(cip) ?? []) jobs.add(job)
    return [...jobs].sort().map((job) => ({ code: job, title: jobTitles.get(job) }))
  }

  return { has: (code) => fields.has(code), titleOf: (code) => fields.get(code) ?? null, list: () => [...fields].map(([code, title]) => ({ code, title })), jobsOf, suggest, versions: { isced: isced.manifest.version, onet: onet.manifest.version } }
}
