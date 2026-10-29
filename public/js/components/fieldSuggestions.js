// Skills suggested from the user's field of study (GET /api/fields/:code/skills): tick boxes with the reason for each,
// and one button to add the ticked ones. Nothing is added until the user chooses; the level stays "not assessed".
import { esc } from '../ui.js'

const FIRST = 10

// Fields of study the user linked to ISCED-F, each once.
export function linkedFields(profile) {
  const out = new Map()
  for (const record of profile.education?.records ?? []) if (record.field?.code) out.set(record.field.code, { code: record.field.code, title: record.field.title })
  return [...out.values()]
}

const percent = (part, whole) => {
  const p = Math.round((part / whole) * 100)
  return p < 1 ? '<1' : p
}

function why(t, s) {
  return s.kind === 'skill'
    ? t('suggestWhySkill', { field: s.fieldImportance, all: s.allImportance })
    : t('suggestWhyTool', { n: s.inField, total: s.fieldJobs, all: percent(s.allCount, s.allJobs) })
}

function oneField(t, profile, state, { code, title }) {
  const data = state.suggest?.[code]
  const head = `<h3 style="margin-top:0">${esc(t('suggestTitle', { field: title }))}</h3>`
  if (!data || data === 'loading') return `<div class="card sugg">${head}<p class="tiny muted">${esc(t('occSearching'))}</p></div>`
  if (data.failed) return `<div class="card sugg">${head}<p class="tiny">${esc(t('pickFailed'))}</p></div>`
  if (!data.jobs) return `<div class="card sugg">${head}<p class="tiny muted">${esc(t('suggestNone'))}</p></div>`
  const have = new Set(profile.skills.map((s) => s.canonicalId).filter(Boolean))
  const open = data.suggestions.filter((s) => !have.has(s.id))
  if (!open.length) return `<div class="card sugg">${head}<p class="tiny muted">${esc(t('suggestAllAdded'))}</p></div>`
  const shown = state.suggestMore?.[code] ? open : open.slice(0, FIRST)
  // Ticks live in state.suggestTicked, so drawing the list again ("Show more", a level change) keeps them.
  const ticked = (s) => (state.suggestTicked?.has(`${code}|${s.id}`) ? ' checked' : '')
  const boxes = shown.map((s) => `<label class="sugg-item"><input type="checkbox" data-sugg="${esc(code)}|${esc(s.id)}"${ticked(s)}>
      <span><b>${esc(s.name)}</b><span class="tiny muted">${esc(why(t, s))}</span></span></label>`).join('')
  const more = shown.length < open.length ? `<button class="btn sm ghost" data-act="suggestMore" data-arg="${esc(code)}">${esc(t('suggestMore', { n: open.length - shown.length }))}</button>` : ''
  return `<div class="card sugg">${head}<p class="tiny muted">${esc(t('suggestLead', { jobs: data.jobs }))}</p>
    <div class="sugg-list">${boxes}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="addSuggested" data-arg="${esc(code)}">${esc(t('suggestAdd'))}</button>${more}</div>
    <p class="tiny muted" style="margin-top:6px">${esc(t('occAttribution'))}</p></div>`
}

export function fieldSuggestions({ t, profile, state }) {
  return linkedFields(profile).map((field) => oneField(t, profile, state, field)).join('')
}
