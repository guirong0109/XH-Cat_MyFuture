// Search-as-you-type picker for skills (O*NET), roles of interest (O*NET and eMASCO) and field of study (ISCED-F
// 2013). app.js searches on input (data-search="kind|key") and refreshes only the list (#pick-<key>), so typing is
// not interrupted. Choices are buttons: data-act="pick" (a listed item) or "pickTyped" (keep the user's own words).
import { esc } from '../ui.js'

const listId = (key) => `pick-${key.replace(/\|/g, '-')}`

export function searchPicker({ t, kind, key, label, placeholder, value = '', list = '' }) {
  const id = `${listId(key)}-q`
  return `<div class="field picker"><label for="${id}">${esc(label)}</label>
    <input id="${id}" data-search="${esc(kind)}|${esc(key)}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" role="combobox" aria-controls="${listId(key)}" aria-expanded="${list ? 'true' : 'false'}">
    <div id="${listId(key)}" class="picker-list" role="listbox">${list}</div></div>`
}

function item(key, i, title, detail) {
  return `<button class="choice" role="option" data-act="pick" data-arg="${esc(key)}|${i}"><b>${esc(title)}</b><span class="tiny muted">${esc(detail)}</span></button>`
}

const typed = (t, key, textKey, term) => `<button class="choice typed" data-act="pickTyped" data-arg="${esc(key)}">${esc(t(textKey, { text: term }))}</button>`

// result: the last search answer for this key ({ candidates, ... } or { failed: true }); busy while it runs.
export function pickerList({ t, kind, key, term, result, busy = false }) {
  if (busy) return `<p class="tiny muted">${esc(t('occSearching'))}</p>`
  if (!result || String(term ?? '').trim().length < 2) return ''
  const candidates = result.candidates ?? []
  let items = ''
  let note = ''
  if (kind === 'skill') {
    // which O*NET list it is from: "O*NET work style · 31.0", or "O*NET 31.0 · Spreadsheet software" for software
    const from = (c) => (c.category?.startsWith('O*NET') ? `${c.category} · ${result.version ?? ''}` : `O*NET ${result.version ?? ''} · ${c.category ?? ''}`)
    items = candidates.map((c, i) => item(key, i, c.name, from(c))).join('')
    items += typed(t, key, 'skillKeepTyped', term)
    note = `<p class="tiny muted">${esc(t('skillSource', { version: result.version ?? '' }))}</p>`
  } else if (kind === 'field') {
    items = candidates.map((c, i) => item(key, i, c.title, `ISCED-F ${c.code} · ${c.broadTitle}${c.via === 'programme' ? ` · ${t('fieldViaProgramme', { name: c.programme })}` : ''}`)).join('')
    items += typed(t, key, 'fieldKeepTyped', term)
    note = `<p class="tiny muted">${esc(t('fieldSource'))}</p>`
  } else {
    // roles: the lookup state says where the answer came from (live, cached snapshot, eMASCO, failed)
    if (!result.failed) note = `<p class="tiny muted">${esc(t(`occ_${result.state}`, { source: result.source ?? '', version: result.version ?? '', date: String(result.fetchedAt ?? '').slice(0, 10) }))}</p>`
    items = candidates.map((c, i) => item(key, i, c.title, `${c.source === 'onet' ? 'O*NET' : 'eMASCO'} ${c.code} · ${t(`via_${c.via}`)}`)).join('')
    if (candidates.some((c) => c.source === 'onet')) items += `<p class="tiny muted">${esc(t('occAttribution'))}</p>`
  }
  const empty = result.failed ? `<p class="tiny">${esc(t('pickFailed'))}</p>` : !candidates.length ? `<p class="tiny muted">${esc(t('pickNone'))}</p>` : ''
  // roles: where the answer came from goes first; skills and fields: the source line goes last
  return kind === 'interest' ? note + empty + items : empty + items + note
}
