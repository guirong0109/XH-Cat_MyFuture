// O*NET Hot Technologies posting-count source (skill-trends spec 3.2). Reads the public page's table (Lightcast US unique
// postings; CC BY 4.0; allowed by robots.txt), checks its layout and returns one snapshot per counting window.
import { createHash } from 'node:crypto'
import { SourceError } from '../sourceError.js'

export const HOT_TECH_URL = 'https://www.onetonline.org/search/hot_tech/'
const TIMEOUT_MS = 30000
const USER_AGENT = 'Mozilla/5.0 (compatible; FutureReadyRadar/1.0)'
const layout = (reason) => new SourceError('hottech_layout', { detail: { reason } })

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      try { return String.fromCodePoint(cp) } catch { return m }
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}
const text = (cell) => decodeEntities(cell.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
const cells = (row, tag) => [...row.matchAll(new RegExp(String.raw`<${tag}\b[^>]*>([\s\S]*?)</${tag}>`, 'gi'))].map((m) => text(m[1]))

export function parseHotTechPage(html) {
  const page = String(html ?? '')
  const totalLine = /([\d,]+)\s+total postings between\s+(\d{1,2}\/(\d{2}))\s*[–—-]\s*(\d{1,2}\/(\d{2}))/i.exec(decodeEntities(page))
  if (!totalLine || !/^\d{1,3}(,\d{3})*$/.test(totalLine[1])) throw layout('total_line')
  const table = /<table\b[\s\S]*?<\/table>/i.exec(page)
  if (!table) throw layout('table')
  const rowsHtml = [...table[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0])
  const head = cells(rowsHtml[0] ?? '', 'th')
  const postingsAt = head.indexOf('Job Postings')
  const nameAt = head.indexOf('Hot Technology')
  if (postingsAt < 0 || nameAt < 0) throw layout('header')
  const rows = []
  for (const row of rowsHtml.slice(1)) {
    const c = cells(row, 'td')
    if (!c.length) continue
    const raw = c[postingsAt] ?? ''
    const technology = c[nameAt] ?? ''
    if (!/^\d{1,3}(,\d{3})*$/.test(raw) && !/^\d+$/.test(raw)) throw layout('count')
    if (!technology) throw layout('name')
    rows.push({ technology, postings: Number(raw.replace(/,/g, '')) })
  }
  if (!rows.length) throw layout('no_rows')
  const endYear = `20${totalLine[5]}`
  return {
    window: { label: `${totalLine[2]}–${totalLine[4]}`, year: endYear },
    total: Number(totalLine[1].replace(/,/g, '')),
    rows,
  }
}

export function createOnetHotTechSource({ fetchImpl = fetch, now = () => new Date() } = {}) {
  async function fetchSnapshot() {
    let bytes
    try {
      const response = await fetchImpl(HOT_TECH_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new SourceError('source_unavailable', { retryable: true, detail: { status: response.status } })
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (err) {
      if (err instanceof SourceError) throw err
      throw new SourceError('source_unavailable', { retryable: true })
    }
    const parsed = parseHotTechPage(bytes.toString('utf8'))
    const sha = createHash('sha256').update(bytes).digest('hex')
    const fetchedAt = now().toISOString()
    const { year } = parsed.window
    const obs = (entityId, value) => ({ entityType: 'skill_postings', entityId, period: year, metric: 'postings', unit: 'postings', value })
    const seen = new Set()
    const observations = []
    for (const r of parsed.rows) {
      if (seen.has(r.technology)) throw layout('duplicate_technology')
      seen.add(r.technology)
      observations.push(obs(r.technology, r.postings))
    }
    observations.push(obs('__total__', parsed.total))
    return {
      snapshot: {
        sourceId: 'onet-hottech',
        snapshotId: `onet-hottech-${year}-${sha.slice(0, 8)}`,
        fetchedAt,
        classification: { system: 'O*NET Hot Technologies', version: year, readAt: fetchedAt },
        sourceUrls: [{ label: 'O*NET Hot Technologies', url: HOT_TECH_URL }],
        originals: [{ sha256: sha, url: HOT_TECH_URL }],
        meta: { window: parsed.window, total: parsed.total },
        observations,
      },
      original: { bytes, sha256: sha },
    }
  }
  return { fetchSnapshot }
}
