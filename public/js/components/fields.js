// Form controls for the profile. They only render HTML; app.js reads changes through the data-* attributes:
// data-field (optional single field), data-decline ("prefer not to say"), data-list (comma list),
// data-rec ("listPath|index|key" of a repeatable record), data-act (buttons).
import { esc, tag } from '../ui.js'

const get = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object)

// An optional field with three states: empty, declined ("prefer not to say"), or a value.
export function stateField({ t, profile, path, label, options = null, kind = 'text' }) {
  const field = get(profile, path) ?? { state: 'empty' }
  const declined = field.state === 'declined'
  const value = field.state === 'value' ? field.value : ''
  const id = `f-${path.replace(/\./g, '-')}`
  const control = options
    ? `<select id="${id}" data-field="${path}" data-kind="select" ${declined ? 'disabled' : ''}>
        <option value="">${esc(t('choose'))}</option>
        ${options.map(([v, key]) => `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(t(key))}</option>`).join('')}
       </select>`
    : `<input id="${id}" data-field="${path}" data-kind="${kind}" type="${kind === 'number' ? 'number' : 'text'}" ${kind === 'number' ? 'min="0" inputmode="numeric"' : ''} value="${esc(value)}" ${declined ? 'disabled' : ''}>`
  return `<div class="field"><label for="${id}">${esc(label)}</label>${control}
    <label class="tiny muted"><input type="checkbox" data-decline="${path}" ${declined ? 'checked' : ''}> ${esc(t('preferNot'))}</label></div>`
}

// A list of short texts typed as "a, b, c".
export function listField({ profile, path, label }) {
  const id = `l-${path.replace(/\./g, '-')}`
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" data-list="${path}" value="${esc((get(profile, path) ?? []).join(', '))}"></div>`
}

function cvNote(t, record) {
  if (!record.extraction) return ''
  const quote = record.extraction.evidence ? `: “${esc(record.extraction.evidence)}”` : ''
  return `<div class="tiny" style="color:var(--self)">${esc(t('tagFromCv'))}${quote}</div>`
}

export function reviewToggle(t, path, record) {
  return record.needsReview
    ? `${tag('prov', t('needsReview'))} <button class="btn sm ghost" data-act="review" data-arg="${path}|off">×</button>`
    : `<button class="btn sm ghost" data-act="review" data-arg="${path}|on">${esc(t('markReview'))}</button>`
}

// Repeatable records (education, jobs, certificates, training, projects).
export function recordsField({ t, profile, listPath, fields, addLabel, extra = null }) {
  const items = get(profile, listPath) ?? []
  const rows = items.map((record, i) => `
    <div class="card" style="margin-bottom:10px">
      ${cvNote(t, record)}
      <div class="grid g2">${fields.map(([key, labelKey]) => `<div class="field"><label>${esc(t(labelKey))}</label><input data-rec="${listPath}|${i}|${key}" value="${esc(record[key] ?? '')}"></div>`).join('')}</div>
      ${extra ? extra(record, i) : ''}
      <div class="row">${reviewToggle(t, `${listPath}.${i}`, record)}<span class="sp" style="flex:1"></span><button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="${listPath}|${i}">${esc(t('remove'))}</button></div>
    </div>`).join('')
  return `${rows}<button class="btn sm" data-act="addRec" data-arg="${listPath}">${esc(addLabel)}</button>`
}
