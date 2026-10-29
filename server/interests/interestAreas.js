// "Career interests and fields": the O*NET 31.0 interest areas (data/onet/interest_areas.tsv), checked against the
// manifest. Each job's interest value is kept in the file for the matching module; the form only needs the names.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function loadInterestAreas(onetDir) {
  const manifest = JSON.parse(await readFile(path.join(onetDir, 'manifest.json'), 'utf8'))
  const text = (await readFile(path.join(onetDir, 'interest_areas.tsv'), 'utf8')).replace(/\r\n/g, '\n')
  if (createHash('sha256').update(text).digest('hex') !== manifest.files?.['interest_areas.tsv']) throw new Error('interest_areas.tsv does not match the manifest')
  const byId = new Map()
  for (const row of text.split('\n').slice(1).filter(Boolean)) {
    const [elementId, name] = row.split('\t')
    byId.set(`onet:ia:${elementId}`, name)
  }
  const list = [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { version: manifest.version, list }
}
