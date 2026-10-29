// Skills suggested from the user's field of study (GET /api/fields/:code/skills): short chips, one click adds a skill.
// The reason for each (the O*NET numbers) is shown on hover. The level of an added skill stays "not assessed".
import { esc } from '../ui.js'

const FIRST = 8

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

const chip = (t, code, s) => `<button class="chip" data-act="addSuggestion" data-arg="${esc(code)}|${esc(s.id)}" title="${esc(why(t, s))}">+ ${esc(s.name)}</button>`

function group(t, code, labelKey, items) {
  if (!items.length) return ''
  return `<div class="sugg-group"><span class="tiny muted">${esc(t(labelKey))}</span><div class="chips">${items.map((s) => chip(t, code, s)).join('')}</div></div>`
}

function oneField(t, profile, state, { code, title }) {
  const data = state.suggest?.[code]
  const head = `<b>${esc(t('suggestTitle', { field: title }))}</b>`
  const box = (body) => `<div class="card sugg">${head}${body}</div>`
  if (!data || data === 'loading') return box(`<p class="tiny muted">${esc(t('occSearching'))}</p>`)
  if (data.failed) return box(`<p class="tiny">${esc(t('pickFailed'))}</p>`)
  if (!data.jobs) return box(`<p class="tiny muted">${esc(t('suggestNone'))}</p>`)
  const have = new Set(profile.skills.map((s) => s.canonicalId).filter(Boolean))
  const open = data.suggestions.filter((s) => !have.has(s.id))
  if (!open.length) return box(`<p class="tiny muted">${esc(t('suggestAllAdded'))}</p>`)
  const shown = state.suggestMore?.[code] ? open : open.slice(0, FIRST)
  const more = shown.length < open.length ? `<button class="btn sm ghost" data-act="suggestMore" data-arg="${esc(code)}">${esc(t('suggestMore', { n: open.length - shown.length }))}</button>` : ''
  return box(`<p class="tiny muted">${esc(t('suggestClick'))}</p>
    ${group(t, code, 'suggestGroupSkills', shown.filter((s) => s.kind === 'skill'))}
    ${group(t, code, 'suggestGroupTools', shown.filter((s) => s.kind !== 'skill'))}${more}`)
}

export function fieldSuggestions({ t, profile, state }) {
  return linkedFields(profile).map((field) => oneField(t, profile, state, field)).join('')
}
