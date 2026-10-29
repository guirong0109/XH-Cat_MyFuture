// Case B (manual entry) and Case C editing: the profile form in five sections. Free movement between sections;
// every change is saved as partial progress by app.js.
import { esc, tag } from '../ui.js'
import { listField, recordsField, reviewToggle, stateField } from '../components/fields.js'

export const SECTIONS = ['secStudy', 'secWork', 'secSkills', 'secCerts', 'secPrefs']

const QUALIFICATIONS = [['spm', 'optSPM'], ['stpm', 'optSTPM'], ['certificate', 'optCertificate'], ['diploma', 'optDiploma'], ['bachelor', 'optDegree'], ['master', 'optMaster'], ['phd', 'optPhD']]

function study(ctx) {
  const { t } = ctx
  return [
    stateField({ ...ctx, path: 'userCategory', label: t('fCategory'), options: [['working_adult', 'optWorking'], ['graduate_switcher', 'optGraduate']] }),
    stateField({ ...ctx, path: 'education.educationStatus', label: t('fEduStatus'), options: [['studying', 'optStudying'], ['graduated', 'optGraduated'], ['not_studying', 'optNotStudying']] }),
    stateField({ ...ctx, path: 'education.highestQualification', label: t('fHighest'), options: QUALIFICATIONS }),
    recordsField({ ...ctx, listPath: 'education.records', fields: [['qualification', 'qualification'], ['fieldOfStudy', 'fieldOfStudy'], ['institution', 'institution'], ['year', 'year']], addLabel: t('addEducation') }),
  ].join('')
}

function work(ctx) {
  const { t } = ctx
  return [
    stateField({ ...ctx, path: 'employment.status', label: t('fEmpStatus'), options: [['employed', 'optEmployed'], ['unemployed', 'optUnemployed'], ['self_employed', 'optSelf'], ['student', 'optStudent']] }),
    stateField({ ...ctx, path: 'employment.yearsOfExperience', label: t('fYears'), kind: 'number' }),
    listField({ ...ctx, path: 'employment.industries', label: t('fIndustries') }),
    recordsField({ ...ctx, listPath: 'employment.records', fields: [['jobTitle', 'jobTitle'], ['employer', 'employer'], ['period', 'period']], addLabel: t('addJob') }),
  ].join('')
}

function skills({ t, profile }) {
  const rows = profile.skills.map((skill, i) => {
    const levelTag = skill.proficiencyStatus === 'not_assessed' ? '' : tag(skill.proficiencyStatus === 'assessed' ? 'calc' : 'self', t(skill.proficiencyStatus === 'assessed' ? 'tagAssessed' : 'tagSelf'))
    const from = skill.extraction ? `<div class="tiny" style="color:var(--self)">${esc(t('tagFromCv'))}${skill.extraction.evidence ? `: “${esc(skill.extraction.evidence)}”` : ''}</div>` : ''
    const unknown = skill.canonicalId ? '' : `<div class="tiny muted">${esc(t('skillUnknown'))}</div>`
    const original = skill.originalText && skill.originalText !== skill.name ? `<span class="tiny muted"> “${esc(skill.originalText)}”</span>` : ''
    return `<div class="card" style="margin-bottom:8px"><div class="row" style="justify-content:space-between">
      <div><b>${esc(skill.name)}</b>${original}${from}${unknown}</div>
      <div class="row"><label class="tiny muted" for="lv-${i}">${esc(t('level'))}</label>
        <select id="lv-${i}" data-level="${i}">${[['', 'levelNone'], ['basic', 'basic'], ['good', 'good'], ['expert', 'expert']].map(([v, k]) => `<option value="${v}" ${(skill.proficiency ?? '') === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select>
        ${levelTag} ${reviewToggle(t, `skills.${i}`, skill)}
        <button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="skills|${i}">${esc(t('remove'))}</button></div>
    </div></div>`
  }).join('')
  return `<div class="row" style="margin-bottom:12px"><input id="skillInput" class="btn" style="flex:1;min-width:200px;font-weight:400" placeholder="${esc(t('skillAdd'))}" aria-label="${esc(t('skillAdd'))}">${'<button class="btn pri" data-act="addSkill">' + esc(t('add')) + '</button>'}</div>${rows}`
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
  const { t } = ctx
  return [
    listField({ ...ctx, path: 'preferences.careerInterests', label: t('fInterests') }),
    stateField({ ...ctx, path: 'preferences.careerGoal', label: t('fGoal'), options: [['first_job', 'optFirstJob'], ['improve', 'optImprove'], ['change', 'optChange'], ['explore_ai', 'optAI']] }),
    listField({ ...ctx, path: 'preferences.preferredCareerFields', label: t('fFields') }),
    stateField({ ...ctx, path: 'preferences.preferredWorkLocation', label: t('fLocation') }),
    stateField({ ...ctx, path: 'preferences.preferredLearningHoursPerWeek', label: t('fHours'), kind: 'number' }),
  ].join('')
}

const BODIES = [study, work, skills, certs, prefs]

export default ({ t, state }) => {
  const section = state.section ?? 0
  const profile = state.profile
  const nav = `<div class="tabs">${SECTIONS.map((key, i) => `<button class="${i === section ? 'on' : ''}" data-act="section" data-arg="${i}"><span class="n">${i + 1}</span>${esc(t(key))}</button>`).join('')}</div>`
  const message = state.message ? `<div class="banner b-warn"><div>${esc(state.message)}</div></div>` : ''
  return `<h1>${esc(t('form'))}</h1>${nav}${message}
  <div class="card">${BODIES[section]({ t, profile })}</div>
  <div class="row" style="margin-top:14px">
    ${section > 0 ? `<button class="btn" data-act="section" data-arg="${section - 1}">${esc(t('back'))}</button>` : ''}
    ${section < SECTIONS.length - 1 ? `<button class="btn" data-act="section" data-arg="${section + 1}">${esc(t('next'))}</button>` : ''}
    <button class="btn pri" data-go="review">${esc(t('goReview'))} →</button>
  </div>`
}
