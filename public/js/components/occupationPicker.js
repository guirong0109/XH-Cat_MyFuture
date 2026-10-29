// Occupation picker: search O*NET (live, cached snapshot) and eMASCO, show the lookup state with source, version and
// date, and let the user choose. Similar wording never decides for the user.
import { esc } from '../ui.js'

// key: where the choice goes ('job|<index>' or 'interest'); result: the last /api/occupations/search answer for it.
export function occupationPicker({ t, key, term, result, busy }) {
  const button = `<button class="btn sm" data-act="occFind" data-arg="${esc(key)}" ${busy ? 'disabled' : ''}>${esc(busy ? t('occSearching') : t('occFind'))}</button>`
  if (!result) return `<div class="row" style="margin-top:6px">${button}</div>`
  const stateLine = t(`occ_${result.state}`, { source: result.source ?? '', version: result.version ?? '', date: String(result.fetchedAt ?? '').slice(0, 10) })
  const list = result.candidates.map((c) => `<button class="choice" style="padding:8px 12px;margin-top:6px" data-act="occPick" data-arg="${esc(key)}|${esc(c.source)}|${esc(c.code)}">
      <b>${esc(c.title)}</b><span class="tiny muted">${c.source === 'onet' ? 'O*NET' : 'eMASCO'} ${esc(c.code)} · ${esc(t(`via_${c.via}`))}</span></button>`).join('')
  const attribution = result.candidates.some((c) => c.source === 'onet') ? `<p class="tiny muted" style="margin-top:6px">${esc(t('occAttribution'))}</p>` : ''
  return `<div style="margin-top:6px">${button}<p class="tiny muted" style="margin-top:6px">${esc(stateLine)} ${esc(term)}</p>${list}${attribution}</div>`
}

export function linkedLine(t, occupation, unlinkArg) {
  if (!occupation) return ''
  return `<div class="tiny" style="margin-top:6px">${esc(t('occLinked'))}: <b>${esc(occupation.title)}</b> · ${occupation.source === 'onet' ? 'O*NET' : 'eMASCO'} ${esc(occupation.code)}
    · ${esc(occupation.version ?? '')} ${esc(String(occupation.fetchedAt ?? '').slice(0, 10))}
    <button class="btn sm ghost" data-act="occUnlink" data-arg="${esc(unlinkArg)}">${esc(t('occUnlink'))}</button></div>`
}
