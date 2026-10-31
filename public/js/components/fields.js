// Form controls for the profile. They only render HTML; app.js reads changes through the data-* attributes:
// data-field (optional single field), data-choice ("prefer not to say" or answer a typed field), data-list (comma
// list), data-rec ("listPath|index|key" of a repeatable record), data-act (buttons).
import { esc, tag } from '../ui.js'

const get = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object)

// An optional field. "Prefer not to say" is the first choice and the default; the user answers from there.
// answering: the user picked "I'll answer" on a typed field and has not typed yet (screen state only).
export function stateField({ t, profile, path, label, options = null, kind = 'text', answering = false }) {
  const field = get(profile, path) ?? { state: 'empty' }
  const value = field.state === 'value' ? field.value : ''
  const id = `f-${path.replace(/\./g, '-')}`
  const option = (v, text, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(text)}</option>`
  if (options) {
    return `<div class="field"><label for="${id}">${esc(label)}</label>
      <select id="${id}" data-field="${path}" data-kind="select">${option('', t('preferNot'), value === '')}${options.map(([v, key]) => option(v, t(key), value === v)).join('')}</select></div>`
  }
  const open = field.state === 'value' || answering
  const input = open
    ? `<input id="${id}" data-field="${path}" data-kind="${kind}" type="${kind === 'number' ? 'number' : 'text'}" ${kind === 'number' ? 'min="0" inputmode="numeric"' : ''} value="${esc(value)}" aria-label="${esc(label)}">`
    : ''
  return `<div class="field"><label for="${id}-c">${esc(label)}</label>
    <select id="${id}-c" data-choice="${path}">${option('', t('preferNot'), !open)}${option('answer', t('answerIt'), open)}</select>${input}</div>`
}

// An optional field shown as small buttons in one row, easier to see than a dropdown; the one-line explanation is the
// hover text. None chosen = "prefer not to say", which the pill under the buttons shows and can choose again.
// options: [value, labelKey, textKey?].
export function choiceField({ t, profile, path, label, options }) {
  const field = get(profile, path) ?? { state: 'empty' }
  const value = field.state === 'value' ? field.value : ''
  const id = `f-${path.replace(/\./g, '-')}-label`
  const button = ([v, labelKey, textKey]) => `<button class="option${value === v ? ' sel' : ''}" role="radio" aria-checked="${value === v}"${textKey ? ` title="${esc(t(textKey))}"` : ''} data-act="choose" data-arg="${path}|${esc(v)}">${esc(t(labelKey))}</button>`
  return `<div class="field"><span class="label" id="${id}">${esc(label)}</span>
    <div class="options" role="radiogroup" aria-labelledby="${id}">${options.map(button).join('')}</div>
    <div><button class="chip${value ? '' : ' on'}" aria-pressed="${!value}" data-act="choose" data-arg="${path}|">${esc(t('preferNot'))}</button></div></div>`
}

// A list of short texts typed as "a, b, c".
export function listField({ profile, path, label }) {
  const id = `l-${path.replace(/\./g, '-')}`
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" data-list="${path}" value="${esc((get(profile, path) ?? []).join(', '))}"></div>`
}

export function cvNote(t, record) {
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
// custom: { key: (record, i) => html } replaces the plain text box of that key (e.g. a search picker).
export function recordsField({ t, profile, listPath, fields, addLabel, extra = null, custom = {} }) {
  const items = get(profile, listPath) ?? []
  const cell = (record, i, key, labelKey) => (custom[key]
    ? custom[key](record, i)
    : `<div class="field"><label>${esc(t(labelKey))}</label><input data-rec="${listPath}|${i}|${key}" value="${esc(record[key] ?? '')}"></div>`)
  const rows = items.map((record, i) => `
    <div class="card" style="margin-bottom:10px">
      ${cvNote(t, record)}
      <div class="grid g2">${fields.map(([key, labelKey]) => cell(record, i, key, labelKey)).join('')}</div>
      ${extra ? extra(record, i) : ''}
      <div class="row">${reviewToggle(t, `${listPath}.${i}`, record)}<span class="sp" style="flex:1"></span><button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="${listPath}|${i}">${esc(t('remove'))}</button></div>
    </div>`).join('')
  return `${rows}<button class="btn sm" data-act="addRec" data-arg="${listPath}">${esc(addLabel)}</button>`
}
