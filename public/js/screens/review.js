// Case C: everything the user entered or the CV suggested, with its label, then Confirm.
import { improveWithAi } from '../components/improveWithAi.js'
import { esc, tag } from '../ui.js'

const get = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object)

export function fieldText(t, field, optionKeys = {}) {
  if (!field || field.state === 'empty') return tag('unv', t('tagEmpty'))
  if (field.state === 'declined') return tag('unv', t('tagDeclined'))
  return esc(optionKeys[field.value] ? t(optionKeys[field.value]) : field.value)
}

function recordTags(t, record) {
  const parts = []
  if (record.extraction && !record.userConfirmed) parts.push(tag('unv', t('tagUnverified')))
  if (record.needsReview) parts.push(tag('prov', t('needsReview')))
  return parts.join(' ')
}

export function skillTags(t, skill) {
  const parts = []
  if (skill.extraction && !skill.userConfirmed) parts.push(tag('unv', t('tagUnverified')))
  if (skill.proficiencyStatus === 'not_assessed') parts.push(tag('prov', t('tagNotAssessed')))
  else parts.push(tag(skill.proficiencyStatus === 'assessed' ? 'calc' : 'self', `${t(skill.proficiencyStatus === 'assessed' ? 'tagAssessed' : 'tagSelf')}: ${t(skill.proficiency)}`))
  if (skill.needsReview) parts.push(tag('prov', t('needsReview')))
  return parts.join(' ')
}

const OPTION_KEYS = {
  userCategory: { working_adult: 'optWorking', graduate_switcher: 'optGraduate' },
  'education.educationStatus': { studying: 'optStudying', graduated: 'optGraduated', not_studying: 'optNotStudying' },
  'education.highestQualification': { spm: 'optSPM', stpm: 'optSTPM', certificate: 'optCertificate', diploma: 'optDiploma', bachelor: 'optDegree', master: 'optMaster', phd: 'optPhD' },
  'employment.status': { employed: 'optEmployed', unemployed: 'optUnemployed', self_employed: 'optSelf', student: 'optStudent' },
  'preferences.careerGoal': { first_job: 'optFirstJob', improve: 'optImprove', change: 'optChange', explore_ai: 'optAI' },
}

export function profileTable(t, profile) {
  const row = (label, html) => `<tr><td style="width:40%">${esc(label)}</td><td>${html}</td></tr>`
  const field = (path, labelKey) => row(t(labelKey), fieldText(t, get(profile, path), OPTION_KEYS[path]))
  const list = (values) => (values?.length ? esc(values.join(', ')) : tag('unv', t('tagEmpty')))
  const records = (items, show) => (items.length ? items.map((r) => `<div>${esc(show(r))} ${recordTags(t, r)}</div>`).join('') : tag('unv', t('none')))
  return `<table>
    ${field('userCategory', 'fCategory')}
    ${field('education.educationStatus', 'fEduStatus')}
    ${field('education.highestQualification', 'fHighest')}
    ${row(t('qualification'), records(profile.education.records, (r) => [r.qualification, r.fieldOfStudy, r.institution, r.year].filter(Boolean).join(' · ')))}
    ${field('employment.status', 'fEmpStatus')}
    ${field('employment.yearsOfExperience', 'fYears')}
    ${row(t('fIndustries'), list(profile.employment.industries))}
    ${row(t('jobTitle'), records(profile.employment.records, (r) => [r.jobTitle, r.employer, r.period].filter(Boolean).join(' · ')))}
    ${row(t('secSkills'), profile.skills.length ? profile.skills.map((s) => `<div><b>${esc(s.name)}</b> ${s.canonicalId ? `<span class="tiny muted">${esc(s.canonicalId)}</span>` : `<span class="tiny muted">${esc(t('skillUnknown'))}</span>`} ${skillTags(t, s)}</div>`).join('') : tag('unv', t('none')))}
    ${row(t('certName'), records(profile.certifications, (r) => [r.name, r.issuer, r.year].filter(Boolean).join(' · ')))}
    ${row(t('trainingName'), records(profile.training, (r) => [r.name, r.year].filter(Boolean).join(' · ')))}
    ${row(t('projTitle'), records(profile.projects, (r) => [r.title, r.description].filter(Boolean).join(' — ')))}
    ${row(t('fInterests'), list(profile.preferences.careerInterests))}
    ${field('preferences.careerGoal', 'fGoal')}
    ${row(t('fFields'), list(profile.preferences.preferredCareerFields))}
    ${field('preferences.preferredWorkLocation', 'fLocation')}
    ${field('preferences.preferredLearningHoursPerWeek', 'fHours')}
    ${row(t('occLinked'), profile.occupationMappings.length ? profile.occupationMappings.map((m) => `<div>${esc(m.term)} → <b>${esc(m.chosen.title)}</b> <span class="tiny muted">${m.chosen.source === 'onet' ? 'O*NET' : 'eMASCO'} ${esc(m.chosen.code)} · ${esc(m.chosen.version ?? '')} · ${esc(String(m.chosen.fetchedAt ?? '').slice(0, 10))} · ${esc(m.chosen.lookupState ?? '')}</span></div>`).join('') : tag('unv', t('none')))}
  </table>`
}

export default ({ t, state }) => {
  const message = state.message ? `<div class="banner b-warn"><div>${esc(state.message)}</div></div>` : ''
  return `<h1>${esc(t('review'))}</h1><p class="lead">${esc(t('reviewLead'))}</p>${message}
  <div class="card" style="overflow-x:auto">${profileTable(t, state.profile)}</div>
  ${improveWithAi({ t, state })}
  <div class="row" style="margin-top:14px">
    <button class="btn" data-go="form">${esc(t('edit'))}</button>
    <button class="btn pri" data-act="confirm">${esc(t('confirmBtn'))}</button>
  </div>`
}
