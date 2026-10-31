// AI news (spec docs/superpowers/specs/2026-10-31-compare-futures-news-design.md §8), shown in the Future Skills Radar's
// tabs since 1 Nov 2026 (owner; it was the Compare futures tab).
// For you: the lists of the profile's broad study fields (picked here, in the browser). Explore all: any of the 10.
// Every list says where it came from, when it was searched, when the next refresh is due and which rules kept it.
// DeepSeek text is always escaped; links only for http(s) addresses.
import { esc } from '../ui.js'
import { safeUrl } from './evidencePanel.js'
import { forYouFields } from '/shared/news/rules.js'

const MYT_MS = 8 * 60 * 60 * 1000

// A time in Malaysia (UTC+8): "2026-10-31 15:00 MYT".
export function myt(iso) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  const d = new Date(time + MYT_MS).toISOString()
  return `${d.slice(0, 10)} ${d.slice(11, 16)} MYT`
}

const when = (t, iso) => (iso ? myt(iso) : t('nwNever'))

function item(t, i) {
  const url = safeUrl(i.url)
  const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)
  return `<li class="card"><h3>${title}</h3>
    <div class="tiny muted">${esc(i.site)} · ${esc(t('nwPublished', { date: myt(i.date) }))}</div>
    ${i.snippet ? `<p class="small">${esc(i.snippet)}</p>` : ''}</li>`
}

function list(t, data, field) {
  // Amendment 1: how the results were checked (N9), and how many the check dropped in the last run.
  const dropped = Number.isInteger(field.dropped) && field.dropped > 0 ? ` · ${t('nwDropped', { n: field.dropped })}` : ''
  const checked = data.checkedBy ? `<br>${esc(t('nwChecked', { model: data.checkedBy }) + dropped)}` : ''
  const source = `<p class="tiny muted">${esc(t('nwSource', { query: field.query, updated: when(t, field.searchedAt), next: when(t, data.nextRunAt) }))}<br>${esc(t('nwRules', { days: data.rules?.maxAgeDays, max: data.rules?.maxItems }))}${checked}</p>`
  const failed = field.lastOutcome === 'failed' ? `<div class="banner b-warn"><div>${esc(t('nwFailed', { time: when(t, field.lastAttemptAt), from: when(t, field.searchedAt) }))}</div></div>` : ''
  const items = field.items?.length ? `<ul class="nw-items">${field.items.map((i) => item(t, i)).join('')}</ul>` : `<p class="muted">${esc(t('nwEmpty'))}</p>`
  return `<section class="nw-list"><h2>${esc(field.title)}</h2>${source}${failed}${items}</section>`
}

// The news section of a Radar tab (owner, 1 Nov 2026: moved from Compare futures). tab 'you' (For You): the lists of
// the profile's broad study fields; tab 'all' (Explore all trends): a picker of the 10 fields and one list.
export function newsSection({ t, state, tab = 'you' }) {
  const news = state?.news ?? {}
  const head = `<h2 class="nw-h2">${esc(t(tab === 'all' ? 'nwTitleAll' : 'nwTitleYou'))}</h2><p class="small muted">${esc(t('nwLead'))}</p>`
  const data = news.data
  if (!data) {
    const body = news.failed
      ? `<div class="banner b-bad"><div>${esc(t('nwLoadFailed'))}</div><button class="btn sm" type="button" data-act="newsRetry">${esc(t('nwRetry'))}</button></div>`
      : `<p class="muted"><span class="spin"></span> ${esc(t('nwLoading'))}</p>`
    return `<div class="nw">${head}${body}</div>`
  }
  if (!data.enabled) return `<div class="nw">${head}<div class="banner"><div>${esc(t('nwOff'))}</div></div></div>`
  const fields = data.fields ?? []
  const mine = forYouFields(state?.profile, fields.map((f) => f.code))
  let body
  if (tab !== 'all') {
    body = mine.length
      ? mine.map((code) => list(t, data, fields.find((f) => f.code === code))).join('')
      : `<div class="card"><p>${esc(t('nwNoField'))}</p><div class="row"><button class="btn pri" type="button" data-go="form">${esc(t('nwEditProfile'))}</button> <button class="btn" type="button" data-act="radarTab" data-arg="ex">${esc(t('nwExploreAll'))}</button></div></div>`
  } else {
    const chosen = fields.find((f) => f.code === news.field) ?? fields.find((f) => f.code === mine[0]) ?? fields[0]
    const picker = fields
      .map((f) => `<button type="button" class="${f === chosen ? 'on' : ''}" data-act="newsField" data-arg="${esc(f.code)}" aria-pressed="${f === chosen}">${esc(f.title)}${mine.includes(f.code) ? `<small>${esc(t('nwYourField'))}</small>` : ''}</button>`).join('')
    body = `<div class="tiny muted">${esc(t('nwPick'))}</div><div class="mt-seg" role="group" aria-label="${esc(t('nwPick'))}">${picker}</div>${chosen ? list(t, data, chosen) : ''}`
  }
  return `<div class="nw">${head}${body}</div>`
}
