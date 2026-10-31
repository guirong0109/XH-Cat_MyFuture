// AI news rules (Compare futures, spec docs/superpowers/specs/2026-10-31-compare-futures-news-design.md §5).
// Pure, no I/O: the server uses them on each refresh, the browser picks the For-you fields with forYouFields.
export const MAX_ITEMS = 25
export const MAX_AGE_DAYS = 30
export const QUERY_MAX = 128
export const LANGUAGE = 'en'

const DAY_MS = 24 * 60 * 60 * 1000
const BROAD = /^(0[1-9]|10)/

// The DeepSeek Search query of one field: the AI phrase, the field's words, the 30-day date and the language.
export function buildQuery(words, runAt) {
  const after = new Date(runAt.getTime() - MAX_AGE_DAYS * DAY_MS).toISOString().slice(0, 10)
  const query = `"artificial intelligence" ${String(words).trim()} after:${after} lang:${LANGUAGE}`
  if (query.length > QUERY_MAX) throw new RangeError(`news query longer than ${QUERY_MAX} characters`)
  return query
}

const webAddress = (value) => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url : null
  } catch {
    return null
  }
}

// Within the age rule: a real date, not after the run, at most 30 days before it.
const withinAge = (date, runAt) => {
  const time = typeof date === 'string' ? Date.parse(date) : NaN
  return Number.isFinite(time) && time <= runAt.getTime() && runAt.getTime() - time <= MAX_AGE_DAYS * DAY_MS
}

// One DeepSeek result as a news item (title, url, site, date, snippet), or null when it is not usable.
export function usableItem(result, runAt) {
  if (!result || typeof result !== 'object') return null
  const title = typeof result.title === 'string' ? result.title.trim() : ''
  const url = webAddress(result.url)
  if (!title || !url || !withinAge(result.date, runAt)) return null
  const site = typeof result.site_name === 'string' && result.site_name.trim() ? result.site_name.trim() : url.hostname
  return { title, url: result.url, site, date: result.date, snippet: typeof result.snippet === 'string' ? result.snippet.trim() : '' }
}

// Same article: the address without protocol, host case, trailing slash and utm_* parameters.
const linkKey = (value) => {
  const url = new URL(value)
  const params = [...url.searchParams].filter(([name]) => !name.toLowerCase().startsWith('utm_'))
  const query = params.length ? `?${new URLSearchParams(params)}` : ''
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${query}`
}
// Same headline: lower case, punctuation, symbols and spaces collapsed.
const headlineKey = (title) => title.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim()

// The kept list after a run: kept items first, then the new ones (found at runAt); the first of a repeat stays; the age
// rule again; newest first, ties by address; at most 25.
export function mergeItems(kept, found, runAt) {
  const links = new Set()
  const headlines = new Set()
  const out = []
  const all = [...(kept ?? []), ...(found ?? []).map((item) => ({ ...item, foundAt: runAt.toISOString() }))]
  for (const item of all) {
    if (!item || !webAddress(item.url) || !withinAge(item.date, runAt)) continue
    const link = linkKey(item.url)
    const headline = headlineKey(item.title)
    if (links.has(link) || headlines.has(headline)) continue
    links.add(link)
    headlines.add(headline)
    out.push(item)
  }
  out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  return out.slice(0, MAX_ITEMS)
}

// The broad study fields (01-10) of the profile's fields of study, each once, in profile order. Browser only.
export function forYouFields(profile, knownCodes) {
  const known = new Set(knownCodes)
  const out = []
  for (const record of profile?.education?.records ?? []) {
    const code = record?.field?.code
    const broad = typeof code === 'string' ? BROAD.exec(code)?.[1] : null
    if (broad && known.has(broad) && !out.includes(broad)) out.push(broad)
  }
  return out
}
