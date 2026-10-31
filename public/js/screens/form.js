// Case B (manual entry) and Case C editing: the profile form in five sections. Free movement between sections;
// every change is saved as partial progress by app.js.
import { esc, tag } from '../ui.js'
import { listField, recordsField, reviewToggle, stateField } from '../components/fields.js'
import { linkedLine, occupationPicker } from '../components/occupationPicker.js'
import { pickerList, searchPicker } from '../components/searchPicker.js'
import { fieldSuggestions } from '../components/fieldSuggestions.js'
import { GOALS } from './goal.js'
import { PERSONAL } from './category.js'

export const SECTIONS = ['secStudy', 'secWork', 'secSkills', 'secCerts', 'secPrefs']
// The optional single fields of each section: shown with "Prefer not to say" as the default.
export const SECTION_FIELDS = [
  ['userCategory', 'education.educationStatus', 'education.highestQualification'],
  ['employment.status', 'employment.yearsOfExperience'],
  [],
  [],
  ['preferences.careerGoal', 'preferences.preferredWorkLocation', 'preferences.preferredLearningHoursPerWeek'],
]

// A search picker with its current list (the last search for that key, or nothing yet).
function picker(ctx, kind, key, label, placeholder, value) {
  const { t, state } = ctx
  const pick = state.pick?.[key]
  const term = pick?.term ?? value
  return searchPicker({ t, kind, key, label, placeholder, value: term, list: pick ? pickerList({ t, kind, key, term, result: pick.result, busy: pick.busy }) : '' })
}

const field = (ctx, options) => stateField({ ...ctx, ...options, answering: Boolean(ctx.state?.answering?.[options.path]) })

// Field of study: picked from ISCED-F 2013; what the user (or the CV) wrote is kept until they link it.
function fieldOfStudy(ctx, record, i) {
  const { t } = ctx
  const link = record.field
    ? `<div class="tiny" style="margin-top:-6px">${esc(t('fieldLinked'))}: <b>${esc(record.field.title)}</b> · ISCED-F ${esc(record.field.code)} · ${esc(record.field.version ?? '')}
        <button class="btn sm ghost" data-act="fieldUnlink" data-arg="${i}">${esc(t('occUnlink'))}</button></div>
        <div class="tiny muted">${esc(t('fieldSuggestHint'))}</div>`
    : record.fieldOfStudy ? `<div class="tiny muted" style="margin-top:-6px">${esc(t('fieldNotLinked'))}</div>` : ''
  return `<div>${picker(ctx, 'field', `field|${i}`, t('fieldOfStudy'), t('fieldFind'), record.fieldOfStudy ?? '')}${link}</div>`
}

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

// Career goal and "Which describes you best?" offer the answers of the goal and Who are you? screens. A profile saved
// with an older answer keeps it as an extra option.
export const OLD_GOALS = { first_job: 'optFirstJob', improve: 'optImprove', change: 'optChange', explore_ai: 'optAI' }
export const OLD_CATEGORIES = { working_adult: 'optWorking', graduate_switcher: 'optGraduate' }
const withOld = (options, old, field) => [...options.map(([v, label]) => [v, label]), ...(old[field?.value] ? [[field.value, old[field.value]]] : [])]

const QUALIFICATIONS = [['spm', 'optSPM'], ['stpm', 'optSTPM'], ['certificate', 'optCertificate'], ['diploma', 'optDiploma'], ['bachelor', 'optDegree'], ['master', 'optMaster'], ['phd', 'optPhD']]

function study(ctx) {
  const { t } = ctx
  return [
    field(ctx, { path: 'userCategory', label: t('fCategory'), options: withOld(PERSONAL, OLD_CATEGORIES, ctx.profile.userCategory) }),
    field(ctx, { path: 'education.educationStatus', label: t('fEduStatus'), options: [['studying', 'optStudying'], ['graduated', 'optGraduated'], ['not_studying', 'optNotStudying']] }),
    field(ctx, { path: 'education.highestQualification', label: t('fHighest'), options: QUALIFICATIONS }),
    recordsField({ ...ctx, listPath: 'education.records', fields: [['qualification', 'qualification'], ['fieldOfStudy', 'fieldOfStudy'], ['institution', 'institution'], ['year', 'year']], addLabel: t('addEducation'), custom: { fieldOfStudy: (record, i) => fieldOfStudy(ctx, record, i) } }),
  ].join('')
}

function work(ctx) {
  const { t, state } = ctx
  const extra = (record, i) => linkedLine(t, record.occupation, `job|${i}`)
    + (record.jobTitle ? occupationPicker({ t, key: `job|${i}`, term: record.jobTitle, result: state.occ?.[`job|${i}`], busy: state.occBusy === `job|${i}` }) : '')
  return [
    field(ctx, { path: 'employment.status', label: t('fEmpStatus'), options: [['employed', 'optEmployed'], ['unemployed', 'optUnemployed'], ['self_employed', 'optSelf'], ['student', 'optStudent']] }),
    field(ctx, { path: 'employment.yearsOfExperience', label: t('fYears'), kind: 'number' }),
    listField({ ...ctx, path: 'employment.industries', label: t('fIndustries') }),
    recordsField({ ...ctx, listPath: 'employment.records', fields: [['jobTitle', 'jobTitle'], ['employer', 'employer'], ['period', 'period']], addLabel: t('addJob'), extra }),
  ].join('')
}

function skills(ctx) {
  const { t, profile } = ctx
  const rows = profile.skills.map((skill, i) => {
    const levelTag = skill.proficiencyStatus === 'not_assessed' ? '' : tag(skill.proficiencyStatus === 'assessed' ? 'calc' : 'self', t(skill.proficiencyStatus === 'assessed' ? 'tagAssessed' : 'tagSelf'))
    const from = skill.extraction ? `<div class="tiny" style="color:var(--self)">${esc(t('tagFromCv'))}${skill.extraction.evidence ? `: “${esc(skill.extraction.evidence)}”` : ''}</div>` : ''
    const pick = skill.candidates?.length
      ? `<div class="tiny" style="margin-top:4px">${esc(t('pickTerm'))} ${skill.candidates.map((c) => `<button class="btn sm" data-act="pickSkill" data-arg="${i}|${esc(c.id)}">${esc(c.name)}</button>`).join(' ')}</div>`
      : ''
    const unknown = skill.canonicalId ? `<div class="tiny muted">O*NET · ${esc(skill.canonicalId)}${skill.category ? ` · ${esc(skill.category)}` : ''}</div>` : `<div class="tiny muted">${esc(t('skillUnknown'))}</div>${pick}`
    const original = skill.originalText && skill.originalText !== skill.name ? `<span class="tiny muted"> “${esc(skill.originalText)}”</span>` : ''
    const suggested = skill.suggestedFrom ? `<div class="tiny muted">${esc(t('suggestFrom', { field: skill.suggestedFrom.title, source: `O*NET ${skill.suggestedFrom.onetVersion ?? ''}`.trim() }))}</div>` : ''
    return `<div class="card" style="margin-bottom:8px"><div class="row" style="justify-content:space-between">
      <div><b>${esc(skill.name)}</b>${original}${from}${suggested}${unknown}</div>
      <div class="row"><label class="tiny muted" for="lv-${i}">${esc(t('level'))}</label>
        <select id="lv-${i}" data-level="${i}">${[['', 'levelNone'], ['basic', 'basic'], ['good', 'good'], ['expert', 'expert']].map(([v, k]) => `<option value="${v}" ${(skill.proficiency ?? '') === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select>
        ${levelTag} ${reviewToggle(t, `skills.${i}`, skill)}
        <button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="skills|${i}">${esc(t('remove'))}</button></div>
    </div></div>`
  }).join('')
  return `${picker(ctx, 'skill', 'skill', t('skillSearch'), t('skillAdd'), '')}${fieldSuggestions(ctx)}${rows}`
}

function certs(ctx) {
  const { t } = ctx
  return [
    `<h3>${esc(t('certName'))}</h3>`,
    recordsField({ ...ctx, listPath: 'certifications', fields: [['name', 'certName'], ['issuer', 'issuer'], ['year', 'year']], addLabel: t('addCert') }),
    `<h3 style="margin-top:16px">${esc(t('trainingName'))}</h3>`,
    recordsField({ ...ctx, listPath: 'training', fields: [['name', 'trainingName'], ['year', 'year']], addLabel: t('addTraining') }),
    `<h3 style="margin-top:16px">${esc(t('projTitle'))}</h3>`,
    recordsField({ ...ctx, listPath: 'projects', fields: [['title', 'projTitle'], ['description', 'projDesc']], addLabel: t('addProject') }),
  ].join('')
}

function prefs(ctx) {
  const { t, profile } = ctx
  const interests = profile.occupationMappings.map((m, i) => (m.kind === 'interest' ? linkedLine(t, m.chosen, `interest|${i}`) : '')).join('')
  return [
    interestField(ctx),
    `${picker(ctx, 'interest', 'interest', t('occInterests'), t('occInterestFind'), '')}<div style="margin:-6px 0 12px">${interests}</div>`,
    field(ctx, { path: 'preferences.careerGoal', label: t('fGoal'), options: withOld(GOALS, OLD_GOALS, profile.preferences.careerGoal) }),
    field(ctx, { path: 'preferences.preferredWorkLocation', label: t('fLocation') }),
    field(ctx, { path: 'preferences.preferredLearningHoursPerWeek', label: t('fHours'), kind: 'number' }),
  ].join('')
}

const BODIES = [study, work, skills, certs, prefs]

export default ({ t, state }) => {
  const section = state.section ?? 0
  const profile = state.profile
  const nav = `<div class="tabs">${SECTIONS.map((key, i) => `<button class="${i === section ? 'on' : ''}" data-act="section" data-arg="${i}"><span class="n">${i + 1}</span>${esc(t(key))}</button>`).join('')}</div>`
  const message = state.message ? `<div class="banner b-warn"><div>${esc(state.message)}</div></div>` : ''
  return `<h1>${esc(t('form'))}</h1>${nav}${message}
  <div class="card">${BODIES[section]({ t, profile, state })}</div>
  <div class="row" style="margin-top:14px">
    ${section > 0 ? `<button class="btn" data-act="section" data-arg="${section - 1}">${esc(t('back'))}</button>` : ''}
    ${section < SECTIONS.length - 1 ? `<button class="btn" data-act="section" data-arg="${section + 1}">${esc(t('next'))}</button>` : ''}
    <button class="btn pri" data-go="review">${esc(t('goReview'))} →</button>
  </div>`
}
