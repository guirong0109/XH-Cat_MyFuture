// AI suggestions next to the profile: New / Changed / Different from yours, each needing confirmation.
// Rows the user edited are locked ("You edited this — kept"); the user ticks what to add.
import { btn, esc, tag } from '../ui.js'

const KIND = { new: 'aiNew', changed: 'aiChanged', conflict: 'aiDifferent' }

// One line of text for a record or a single field.
function describe(path, value) {
  if (!value) return ''
  if (value.state) return value.state === 'value' ? String(value.value) : ''
  const list = path.split('#')[0]
  if (list === 'skills') return [value.name, value.canonicalId].filter(Boolean).join(' · ')
  if (list === 'education.records') return [value.qualification, value.fieldOfStudy, value.institution].filter(Boolean).join(' · ')
  if (list === 'employment.records') return [value.jobTitle, value.employer].filter(Boolean).join(' · ')
  if (list === 'projects') return value.title ?? ''
  return value.name ?? ''
}

export function compareView({ t, ai }) {
  const rows = ai.rows.filter((row) => row.kind !== 'same')
  const dropped = ai.dropped ? `<p class="tiny muted">${esc(t('aiDropped', { n: ai.dropped }))}</p>` : ''
  if (!rows.length) return `<p>${esc(t('aiNothing'))}</p>${dropped}${btn(t('aiCancel'), { act: 'aiClose' })}`
  const lines = rows.map((row, i) => {
    const quote = row.to?.extraction?.evidence ? `<div class="tiny" style="color:var(--self)">“${esc(row.to.extraction.evidence)}”</div>` : ''
    const yours = row.from ? `<div class="tiny muted">${esc(t('aiYours'))} ${esc(describe(row.path, row.from))}</div>` : ''
    const pick = row.locked
      ? `<span class="tiny muted">${esc(t('aiLocked'))}</span>`
      : `<input type="checkbox" data-ai-row="${i}" aria-label="${esc(describe(row.path, row.to))}">`
    return `<tr><td>${pick}</td><td>${tag('est', t(KIND[row.kind]))} <b>${esc(describe(row.path, row.to))}</b> ${tag('prov', t('aiNeedsConfirm'))}${quote}${yours}</td></tr>`
  }).join('')
  return `<h3>${esc(t('aiTitle'))}</h3>${dropped}<table>${lines}</table>
    <div class="row" style="margin-top:10px">${btn(t('aiAccept'), { act: 'aiAccept', kind: 'pri' })}${btn(t('aiCancel'), { act: 'aiClose' })}</div>`
}

// The rows behind the ticked boxes (index into the visible, non-'same' rows).
export const visibleRows = (ai) => ai.rows.filter((row) => row.kind !== 'same')
