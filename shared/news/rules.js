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
// A trailing site name (Amendment 1): the text after the last " | ", " - ", " – " or " — ", at most 40 characters.
// Final review: only when it looks like a site name and not part of the headline: no digits in it ("Part 2",
// "Episode 13"), and what is left has at least 4 words and is longer ("Opinion | …" and "Interview - …" stay whole).
const SITE_ENDING = /^(.*\S)\s+[|\-–—]\s+([^|\-–—]{1,40})$/u
const withoutSiteName = (title) => {
  const m = SITE_ENDING.exec(title)
  if (!m) return title
  const [, left, ending] = m
  return !/\d/.test(ending) && left.trim().split(/\s+/).length >= 4 && left.length > ending.length ? left : title
}
// Same headline: without a trailing site name; lower case, punctuation, symbols and spaces collapsed.
const headlineKey = (title) => withoutSiteName(title).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim()

// Walks items in order and keeps the first of each repeat (same link or same headline); seen carries the keys.
function firstOfEach(items, runAt, seen = { links: new Set(), headlines: new Set() }) {
  const out = []
  for (const item of items) {
    if (!item || typeof item.title !== 'string' || !webAddress(item.url) || !withinAge(item.date, runAt)) continue
    const link = linkKey(item.url)
    const headline = headlineKey(item.title)
    if (seen.links.has(link) || seen.headlines.has(headline)) continue
    seen.links.add(link)
    seen.headlines.add(headline)
    out.push(item)
  }
  return out
}

// The kept list after a run: kept items first, then the new ones (found at runAt); the first of a repeat stays; the age
// rule again; newest first, ties by address; at most 25.
export function mergeItems(kept, found, runAt) {
  const out = firstOfEach([...(kept ?? []), ...(found ?? []).map((item) => ({ ...item, foundAt: runAt.toISOString() }))], runAt)
  out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  return out.slice(0, MAX_ITEMS)
}

// The found items that repeat neither a kept item nor an earlier found one, in found order (Amendment 1: only these are
// sent to the relevance check). The age rule applies; nothing is added to the items.
export function newItems(kept, found, runAt) {
  const seen = { links: new Set(), headlines: new Set() }
  firstOfEach(kept ?? [], runAt, seen)
  return firstOfEach(found ?? [], runAt, seen)
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
