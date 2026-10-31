// Case B (manual entry) and Case C editing: the profile form in five sections. Free movement between sections;
// every change is saved as partial progress by app.js.
import { esc } from '../ui.js'
import { choiceField, cvNote, reviewToggle } from '../components/fields.js'
import { linkedLine, occupationPicker } from '../components/occupationPicker.js'
import { AI_USE_KEYS, aiKnowHow, readAiUse } from '/shared/matching/overall.js'
import { skillGroups } from './skillGroups.js'

// Certificates and training are not asked (owner, 31 Oct); projects are cards in Skills and proficiency. Using AI (M17)
// is the last section.
export const SECTIONS = ['secStudy', 'secWork', 'secSkills', 'secPrefs', 'secAi']
// The optional single fields of each section: shown with "Prefer not to say" as the default.
export const SECTION_FIELDS = [
  ['userCategory'],
  [],
  [],
  [],
  [],
]

// Career interests and fields: O*NET interest areas, several allowed (chips with ×); none chosen = prefer not to say.
function interestField({ t, profile, state }) {
  const chosen = profile.preferences.careerInterests ?? []
  const chips = chosen.length
    ? `<div class="chips">${chosen.map((item, i) => `<span class="chip on">${esc(item?.name ?? item)} <button class="chip-x" data-act="interestRemove" data-arg="${i}" aria-label="${esc(t('remove'))}">×</button></span>`).join('')}</div>`
    : `<div class="tiny muted">${esc(t('preferNot'))}</div>`
  const list = state.interests
  let control = `<p class="tiny muted">${esc(t('occSearching'))}</p>`
  if (list?.failed) control = `<p class="tiny">${esc(t('pickFailed'))}</p>`
  else if (list?.areas) {
    const taken = new Set(chosen.map((item) => item?.id).filter(Boolean))
    control = `<select id="f-interest" data-interest><option value="">${esc(t('interestAdd'))}</option>${list.areas.filter((a) => !taken.has(a.id)).map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
      <div class="tiny muted">${esc(t('interestSource', { version: list.version }))}</div>`
  }
  return `<div class="field"><label for="f-interest">${esc(t('fInterests'))}</label>${chips}${control}</div>`
}

// "Which describes you best?" offers the answers of the Who are you? screen. A profile saved with an older answer keeps
// it as an extra option.
export const OLD_CATEGORIES = { working_adult: 'optWorking', graduate_switcher: 'optGraduate' }
// "Which describes you best?" (owner, 31 Oct): the first question of the profile, as four buttons.
export const WHO = [
  ['student', 'catStudent', 'catStudentText'],
  ['fresh_graduate', 'catGrad', 'catGradText'],
  ['underemployed', 'catUnder', 'catUnderText'],
  ['unemployed', 'catUnemp', 'catUnempText'],
]
const withOld = (options, old, field) => [...options, ...(old[field?.value] ? [[field.value, old[field.value]]] : [])]

// Qualification levels, lowest to highest.
export const QUALIFICATIONS = [['spm', 'optSPM'], ['stpm', 'optSTPM'], ['certificate', 'optCertificate'], ['diploma', 'optDiploma'], ['bachelor', 'optDegree'], ['master', 'optMaster'], ['phd', 'optPhD']]
export const levelLabel = (value) => QUALIFICATIONS.find(([v]) => v === value)?.[1]
const asWritten = (t, text) => `<div class="tiny" style="color:var(--self)">${esc(t('asWritten', { text }))}</div>`

// Field of study: a dropdown of the ISCED-F 2013 fields grouped by broad area (GET /api/fields, loaded by app.js).
// Words typed or read from a CV stay visible until a standard field is chosen.
function fieldSelect({ t, state }, record, i) {
  const list = state.fields
  let control = `<p class="tiny muted">${esc(t('occSearching'))}</p>`
  if (list?.failed) control = `<p class="tiny">${esc(t('pickFailed'))}</p>`
  else if (list?.fields) {
    const groups = new Map()
    for (const f of list.fields) groups.set(f.broadTitle, [...(groups.get(f.broadTitle) ?? []), f])
    const option = (f) => `<option value="${esc(f.code)}"${f.code === record.field?.code ? ' selected' : ''}>${esc(f.title)}</option>`
    control = `<select id="fs-${i}" data-field-pick="${i}"><option value="">${esc(t('fieldChoose'))}</option>${[...groups].map(([broad, items]) => `<optgroup label="${esc(broad)}">${items.map(option).join('')}</optgroup>`).join('')}</select>
      <div class="tiny muted">${esc(t('fieldListSource', { version: list.version, n: list.fields.length }))}</div>`
  }
  // Chosen from the CV words (owner, 31 Oct): the user checks it against them; changing the dropdown makes it theirs.
  const picked = record.field?.via === 'cv_match' ? `<div class="tiny" style="color:var(--self)">${esc(t('cvPicked', { text: record.field.term }))}</div>` : ''
  const typed = !record.field && record.fieldOfStudy ? asWritten(t, record.fieldOfStudy) : picked
  const hint = record.field ? `<div class="tiny muted">${esc(t('fieldSuggestHint'))}</div>` : ''
  return `<div class="field"><label for="fs-${i}">${esc(t('fieldOfStudy'))}</label>${control}${typed}${hint}</div>`
}

// One qualification (owner, 31 Oct): the level and the field of study (major), nothing else. Institution and year are
// not asked; a CV may still fill them, and the receipt then shows them.
function qualificationRow(ctx, record, i) {
  const { t } = ctx
  const level = `<div class="field"><label for="ql-${i}">${esc(t('qualification'))}</label>
    <select id="ql-${i}" data-rec="education.records|${i}|level"><option value="">${esc(t('qualChoose'))}</option>${QUALIFICATIONS.map(([v, key]) => `<option value="${v}"${record.level === v ? ' selected' : ''}>${esc(t(key))}</option>`).join('')}</select>
    ${!record.level && record.qualification ? asWritten(t, record.qualification) : ''}</div>`
  const tools = `<div class="row">${reviewToggle(t, `education.records.${i}`, record)}<span style="flex:1"></span><button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="education.records|${i}">${esc(t('remove'))}</button></div>`
  return `<div class="card">${cvNote(t, record)}<div class="grid g2">${level}${fieldSelect(ctx, record, i)}</div>${tools}</div>`
}

function qualifications(ctx) {
  const { t, profile } = ctx
  const rows = profile.education.records.map((record, i) => qualificationRow(ctx, record, i)).join('')
  return `${rows}<button class="btn sm" data-act="addRec" data-arg="education.records">${esc(t('addEducation'))}</button>`
}

function study(ctx) {
  const { t } = ctx
  return [
    choiceField({ ...ctx, path: 'userCategory', label: t('fCategory'), options: withOld(WHO, OLD_CATEGORIES, ctx.profile.userCategory) }),
    qualifications(ctx),
  ].join('')
}

// Years of work experience in a job: a number from 0 to 60 (part years allowed); anything else is left empty.
export function toYears(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : null
}

// One job (owner, 31 Oct): the job title, then its years of work experience (a number box with arrows). The
// standard-occupation finder links the title for matching. Employer, period and industries are not asked; a CV may
// still fill them, and the receipt then shows them. saved: false for the first job shown before any exists.
function jobRow(ctx, record, i, saved) {
  const { t, state } = ctx
  const title = `<div class="field"><label for="jt-${i}">${esc(t('jobTitle'))}</label><input id="jt-${i}" data-rec="employment.records|${i}|jobTitle" value="${esc(record.jobTitle ?? '')}"></div>`
  const years = `<div class="field"><label for="jy-${i}">${esc(t('fYears'))}</label><input id="jy-${i}" type="number" min="0" max="60" step="1" inputmode="numeric" data-rec="employment.records|${i}|years" value="${esc(record.years ?? '')}"></div>`
  const link = saved
    ? linkedLine(t, record.occupation, `job|${i}`) + (record.jobTitle ? occupationPicker({ t, key: `job|${i}`, term: record.jobTitle, result: state.occ?.[`job|${i}`], busy: state.occBusy === `job|${i}` }) : '')
    : ''
  const tools = saved
    ? `<div class="row">${reviewToggle(t, `employment.records.${i}`, record)}<span style="flex:1"></span><button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="employment.records|${i}">${esc(t('remove'))}</button></div>`
    : ''
  return `<div class="card">${cvNote(t, record)}<div class="grid g2">${title}${years}</div>${link}${tools}</div>`
}

function work(ctx) {
  const { t, profile } = ctx
  const records = profile.employment.records
  const rows = (records.length ? records : [{}]).map((record, i) => jobRow(ctx, record, i, records.length > 0)).join('')
  return `${rows}<button class="btn sm" data-act="addRec" data-arg="employment.records">${esc(t('addJob'))}</button>`
}

// Skills and proficiency: skills grouped under the jobs and projects they were used in (skillGroups.js).
const skills = (ctx) => skillGroups(ctx)

// Interests (owner, 31 Oct): only Career interests and fields. The goal is asked at the start; occupations of interest,
// work location and learning hours are not asked. A profile saved earlier keeps its answers, and the receipt shows them.
const prefs = (ctx) => interestField(ctx)

// Using AI (M17): four yes/no questions, one per dimension of the UNESCO AI competency framework for students.
function aiUseSection(ctx) {
  const { t, profile } = ctx
  const answers = readAiUse(profile)
  const rows = AI_USE_KEYS.map((key) => `<div style="margin-bottom:12px"><label for="ai-${key}"><b>${esc(t(`aiDim_${key}`))}</b><br>${esc(t(`aiQ_${key}`))}</label>
    <select id="ai-${key}" data-aiuse="${key}">${[['', 'preferNot'], ['yes', 'aiYes'], ['no', 'aiNo']].map(([v, k]) => `<option value="${v}"${(answers[key] ?? '') === v ? ' selected' : ''}>${esc(t(k))}</option>`).join('')}</select></div>`).join('')
  const know = aiKnowHow(answers)
  const line = know ? t('aiKnowHowLine', { percent: know.percent, yes: know.yes, answered: know.answered }) : t('aiKnowHowNone')
  return `<p>${esc(t('aiUseIntro'))}</p>${rows}<p><b>${esc(line)}</b></p>
  <p class="tiny">${esc(t('aiUseSource'))} · <a href="https://doi.org/10.54675/JKJB9835" target="_blank" rel="noopener">UNESCO, 2024</a></p>`
}

const BODIES = [study, work, skills, prefs, aiUseSection]

// Lists the profile no longer asks for: what a CV or the AI re-read finds for them is left out, so the profile never holds
// something the user cannot see or edit.
export const NOT_ASKED = ['certifications', 'training']
export const dropNotAsked = (profile) => ({ ...profile, ...Object.fromEntries(NOT_ASKED.map((list) => [list, []])) })

export default ({ t, state }) => {
  const section = state.section ?? 0
  const profile = state.profile
  const nav = `<div class="tabs">${SECTIONS.map((key, i) => `<button class="${i === section ? 'on' : ''}" data-act="section" data-arg="${i}"><span class="n">${i + 1}</span>${esc(t(key))}</button>`).join('')}</div>`
  const message = state.message ? `<div class="banner b-warn"><div>${esc(state.message)}</div></div>` : ''
  return `<h1>${esc(t('form'))}</h1>${nav}${message}
  <div class="card">${BODIES[section]({ t, profile, state })}</div>
  <div class="row" style="margin-top:14px">
    ${section > 0 ? `<button class="btn" data-act="section" data-arg="${section - 1}">${esc(t('back'))}</button>` : ''}
    ${section < SECTIONS.length - 1
    ? `<button class="btn pri" data-act="section" data-arg="${section + 1}">${esc(t('next'))} →</button>`
    : `<button class="btn pri" data-go="review">${esc(t('goReview'))} →</button>`}
  </div>`
}
