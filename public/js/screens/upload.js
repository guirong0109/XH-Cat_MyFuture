// Case A: upload a CV, watch it being read, then check the draft. Errors always leave three ways out and never
// touch what the user already typed. The interface language only changes when the user chooses to.
import { LANGS } from '/shared/i18n.js'
import { btn, esc, tag } from '../ui.js'

export const STEPS = ['uploading', 'validating', 'reading', 'extracting', 'mapping', 'ready']
// step 0: the file is being sent; step 1: the server checks, reads, extracts and maps in one go.
const SERVER_STEPS = ['validating', 'reading', 'extracting', 'mapping']

function progress(t, step) {
  const state = (name, i) => {
    if (name === 'ready') return 'todo'
    if (step === 0) return i === 0 ? 'now' : 'todo'
    return SERVER_STEPS.includes(name) ? 'now' : 'done'
  }
  return `<div class="card"><ol class="steps">${STEPS.map((name, i) => {
    const s = state(name, i)
    const mark = s === 'done' ? '✓' : s === 'now' ? '<span class="spin"></span>' : '·'
    return `<li class="${s}"><span class="mark">${mark}</span> ${esc(t(`cvStep_${name}`))}</li>`
  }).join('')}</ol>
  ${step === 1 ? `<p class="tiny muted">${esc(t('cvServerNote'))}</p>` : ''}</div>`
}

function failure(t, cv) {
  const message = t(`cvErr_${cv.code}`) === `cvErr_${cv.code}` ? t('cvErr_other') : t(`cvErr_${cv.code}`)
  return `<div class="banner b-bad" role="alert"><div><b>${esc(message)}</b> ${esc(t('cvKept'))}</div>
    <div class="row">${btn(t('cvAnother'), { act: 'cvReset' })}${cv.retryable ? btn(t('cvRetry'), { act: 'cvRetry' }) : ''}${btn(t('cvManual'), { go: 'form' })}</div></div>`
}

function languagePrompt(t, state) {
  const cv = state.cv.language
  if (!LANGS.includes(cv) || cv === state.lang || state.cv.langAnswered) return ''
  const names = { cv: t(`langName_${cv}`), ui: t(`langName_${state.lang}`) }
  return `<div class="banner b-info"><div>${esc(t('langPrompt', names))}</div>
    <div class="row">${btn(t('keepLang'), { act: 'cvKeepLang' })}${btn(t('switchLang', names), { act: 'cvSwitchLang', arg: cv })}</div></div>`
}

function ready(t, state) {
  const p = state.profile
  const list = (items) => (items.length ? items.map(esc).join(', ') : `<span class="muted">${esc(t('cvNothing'))}</span>`)
  const cvLanguage = LANGS.includes(state.cv.language) ? t(`langName_${state.cv.language}`) : t(`cvLang_${state.cv.language}`)
  return `${languagePrompt(t, state)}
  <div class="card"><h3>✓ ${esc(t('cvStep_ready'))} ${tag('unv', t('cvUnverified'))}</h3>
    <table>
      <tr><th>${esc(t('cvRowEducation'))}</th><td>${list(p.education.records.map((r) => [r.qualification, r.fieldOfStudy].filter(Boolean).join(' · ')))}</td></tr>
      <tr><th>${esc(t('cvRowJobs'))}</th><td>${list(p.employment.records.map((r) => [r.jobTitle, r.employer].filter(Boolean).join(' · ')))}</td></tr>
      <tr><th>${esc(t('cvRowSkills'))}</th><td>${list(p.skills.map((s) => s.name))}</td></tr>
      <tr><th>${esc(t('cvRowLanguage'))}</th><td>${esc(cvLanguage)}</td></tr>
    </table>
    <p class="tiny muted">${esc(t('cvCheckNote'))}</p>
    <div class="row" style="margin-top:12px">${btn(t('cvToReview'), { go: 'review', kind: 'pri' })}${btn(t('cvToForm'), { go: 'form' })}${btn(t('cvAnother'), { act: 'cvReset' })}</div>
  </div>`
}

export default ({ t, state }) => {
  const cv = state.cv ?? { phase: 'idle' }
  let body
  if (cv.phase === 'busy') body = progress(t, cv.step)
  else if (cv.phase === 'error') body = failure(t, cv)
  else if (cv.phase === 'ready') body = ready(t, state)
  else {
    body = `<div class="drop" id="cvDrop"><div class="big" style="font-size:36px">⇪</div><p style="margin:8px 0">${esc(t('cvDrag'))}</p>
      <label class="btn pri" for="cvFile">${esc(t('cvChoose'))}</label>
      <input id="cvFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
      <p class="tiny muted" style="margin-top:10px">${esc(t('cvLimits'))}</p></div>
      <div class="row" style="margin-top:12px">${btn(t('cvManual'), { go: 'form' })}</div>`
  }
  return `<h1>${esc(t('upload'))}</h1><p class="lead">${esc(t('cvLead'))}</p>
  <div class="banner b-info"><div>${esc(t('cvPrivacy'))}</div></div>${body}`
}
