// O*NET release source adapter (skill-trends spec 3.1). Downloads one official O*NET text database zip, reads the
// software skills table and returns the flag snapshot. The zip itself is never stored: only URL and SHA-256 are kept.
import { createHash } from 'node:crypto'
import { SourceError } from '../sourceError.js'
import { readZipEntries } from '../../cv/zip.js'
import { nextOnetSkillsSnapshot } from '../../../shared/radar/onetSkills.js'

export const RELEASE_PATTERN = /^\d{2}\.\d$/
const TIMEOUT_MS = 60000
const FILE_NAMES = ['Software Skills.txt', 'Technology Skills.txt']
// Release months are not fetched; seeded releases only (spec 3.1). Other releases show "—".
const RELEASE_MONTHS = { '30.2': '2026-02', '30.3': '2026-05', '31.0': '2026-08' }

export function releaseZipUrl(release) {
  if (typeof release !== 'string' || !RELEASE_PATTERN.test(release)) throw new TypeError('bad O*NET release')
  const [major, minor] = release.split('.')
  return `https://www.onetcenter.org/dl_files/database/db_${major}_${minor}_text.zip`
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// Header names -> row fields. The 30.x file calls the example "Example" and the element "Commodity ...";
// 30.3 and later say "Workplace Example" and "Element ...". "Title" (31.0) is ignored.
const COLUMNS = {
  code: ['O*NET-SOC Code'],
  example: ['Workplace Example', 'Example'],
  elementId: ['Element ID', 'Commodity Code'],
  elementName: ['Element Name', 'Commodity Title'],
  hot: ['Hot Technology'],
  inDemand: ['In Demand'],
}

export function parseSkillsTable(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/)
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim())
  const at = {}
  for (const [field, names] of Object.entries(COLUMNS)) {
    const i = header.findIndex((h) => names.includes(h))
    if (i < 0) throw new SourceError('onet_columns', { detail: { missing: field } })
    at[field] = i
  }
  const rows = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split('\t')
    rows.push({
      code: (c[at.code] ?? '').trim(),
      example: (c[at.example] ?? '').trim(),
      elementId: (c[at.elementId] ?? '').trim(),
      elementName: (c[at.elementName] ?? '').trim(),
      hot: (c[at.hot] ?? '').trim() === 'Y',
      inDemand: (c[at.inDemand] ?? '').trim() === 'Y',
    })
  }
  return rows
}

export function createOnetSkillsSource({ fetchImpl = fetch, now = () => new Date() } = {}) {
  async function download(url) {
    let response
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }
    if (response.status === 404) throw new SourceError('onet_release_not_found')
    if (!response.ok) throw new SourceError('source_unavailable', { retryable: true, detail: { status: response.status } })
    try {
      return Buffer.from(await response.arrayBuffer())
    } catch {
      throw new SourceError('source_unavailable', { retryable: true })
    }
  }

  async function fetchRelease(release, activeSnapshot) {
    const zipUrl = releaseZipUrl(release)
    const zip = await download(zipUrl)
    let fileBytes
    try {
      const entries = readZipEntries(zip)
      const name = [...entries.keys()].find((n) => FILE_NAMES.includes(n.split('/').pop()))
      if (!name) throw new SourceError('onet_columns', { detail: { missing: 'skills_file' } })
      fileBytes = entries.get(name)()
    } catch (err) {
      if (err instanceof SourceError) throw err
      throw new SourceError('source_unavailable', { retryable: true })
    }
    const rows = parseSkillsTable(fileBytes.toString('utf8'))
    return nextOnetSkillsSnapshot(activeSnapshot ?? null, {
      release, month: RELEASE_MONTHS[release] ?? null, zipUrl, zipSha256: sha256(zip), fileSha256: sha256(fileBytes), rows,
    }, now().toISOString())
  }

  return { fetchRelease }
}
