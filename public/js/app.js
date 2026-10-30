// App state, hash routing, guest saving and one event handler for every screen.
// Buttons use data-go / data-act; form controls use data-field, data-choice, data-list, data-rec, data-level;
// search pickers use data-search.
import { t as translate } from '/shared/i18n.js'
import { createGuestStore, resumeChoice, safeLocalStorage } from '/shared/guestStore.js'
import { DECLINED, emptyProfile, makeSkill, val, validateProfile } from '/shared/profileSchema.js'
import { addRecord, applyAccepted, confirmProfile, declineUnanswered, diffProfiles, isUntouched, mergeCareerFields, userEditedPaths, markForReview, mergeDraft, minimizeForGuest, removeRecord, setField } from '/shared/profileState.js'
import { afterConfirm } from '/shared/flow.js'
import welcome from './screens/welcome.js'
import returning from './screens/returning.js'
import access from './screens/access.js'
import category from './screens/category.js'
import org from './screens/org.js'
import source from './screens/source.js'
import upload from './screens/upload.js'
import form, { SECTION_FIELDS, SECTIONS } from './screens/form.js'
import review from './screens/review.js'
import summary from './screens/summary.js'
import nextModule from './screens/nextModule.js'
import { esc } from './ui.js'
import { api } from './api.js'
import { checkBeforeUpload, uploadCv } from './cvApi.js'
import * as accountApi from './accountApi.js'
import { accountLink } from './components/accountBox.js'
import { visibleRows } from './components/compareView.js'
import { pickerList } from './components/searchPicker.js'
import { linkedFields } from './components/fieldSuggestions.js'
import { INTRO_LENGTH, shouldPlayIntro } from './intro/timeline.js'
import { armOdometers } from './components/odometer.js'

const SCREENS = { welcome, returning, access, category, org, source, upload, form, review, summary }
const NEXT = ['assess', 'radar', 'match', 'roadmap', 'sdg', 'futures']
const TABS = ['summary', ...NEXT]
const NEEDS_PROFILE = ['upload', 'form', 'review', 'summary']
const NEW_RECORD = {
  'education.records': { qualification: '', fieldOfStudy: '', institution: '', year: '' },
  'employment.records': { jobTitle: '', employer: '', period: '' },
  certifications: { name: '', issuer: '', year: '' },
  training: { name: '', year: '' },
  projects: { title: '', description: '' },
}

// Search picker endpoints by kind (skills: O*NET catalogue; roles: O*NET and eMASCO; field of study: ISCED-F 2013).
const SEARCH_URL = { skill: '/api/skills/search', interest: '/api/occupations/search', field: '/api/fields/search' }
const SEARCH_DELAY_MS = 250
const SKILLS_SECTION = 2
const PREFERENCES_SECTION = 4

const fresh = () => ({ screen: 'welcome', lang: 'en', access: null, category: null, profile: null, section: 0, usable: false, message: null })
const store = createGuestStore(safeLocalStorage(), minimizeForGuest)
let state = fresh()
let resumeTo = null
let saved = false
// The chosen CV file stays in memory only (for Retry); it is never saved in the browser.
let cvFile = null
// The CV draft as it came from the server: the compare view locks what the user changed since. Memory only.
let cvDraft = null
const t = (key, vars) => translate(state.lang, key, vars)

function persist() {
  // occupation search results and upload progress are only shown, never saved
  saved = store.save({ ...state, message: null, occ: {}, occBusy: null, pick: {}, answering: {}, suggest: {}, suggestMore: {}, interests: null, account: null, features: null, ai: null, cvSession: null, cv: state.cv?.phase === 'ready' ? state.cv : null })
}

// A form section on screen: what the user leaves unanswered there is "prefer not to say" (the default shown).
function showSection() {
  if (state.screen === 'form' && state.profile) state.profile = declineUnanswered(state.profile, SECTION_FIELDS[state.section ?? 0] ?? [])
  if (state.screen === 'form' && state.section === SKILLS_SECTION) loadSuggestions()
  if (state.screen === 'form' && state.section === PREFERENCES_SECTION) loadInterests()
}

// The O*NET interest areas for "Career interests and fields", fetched once (again after a failure).
async function loadInterests() {
  if (state.interests && !state.interests.failed) return
  state.interests = { loading: true }
  const out = await api('GET', '/api/interests')
  state.interests = out.ok ? out.data : { failed: true }
  if (state.screen === 'form' && state.section === PREFERENCES_SECTION) render()
}

// Skills suggested from each linked field of study, fetched once per field while the Skills section is open.
async function loadSuggestions() {
  for (const { code } of linkedFields(state.profile ?? { education: {} })) {
    if (state.suggest?.[code]) continue
    state.suggest = { ...state.suggest, [code]: 'loading' }
    api('GET', `/api/fields/${encodeURIComponent(code)}/skills`).then((out) => {
      state.suggest = { ...state.suggest, [code]: out.ok ? out.data : { failed: true } }
      if (state.screen === 'form' && state.section === SKILLS_SECTION) render()
    })
  }
}

function go(screen) {
  if (NEEDS_PROFILE.includes(screen) && !state.profile) state.profile = emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
  state.screen = screen
  showSection()
  state.message = null
  if (location.hash !== `#${screen}`) history.pushState(null, '', `#${screen}`)
  persist()
  render()
  window.scrollTo(0, 0)
}

// Any edit makes a confirmed profile a draft again: it must be confirmed anew.
function update(profile) {
  state.profile = { ...profile, profileStatus: 'draft' }
  state.message = null
  persist()
  render()
}

const actions = {
  lang: (lang) => { state.lang = lang; if (state.profile) state.profile.interfaceLanguage = lang; persist(); render() },
  // Landing page links scroll within the page (a #hash would be read as a screen).
  scrollTo: (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  replayIntro: () => { window.scrollTo(0, 0); startIntro() },
  guest: () => { state.access = 'guest'; go('category') },
  acSignup: () => accountCall('signup'),
  acLogin: () => accountCall('login'),
  acLogout: async () => {
    await accountApi.logout()
    // A shared computer must not show the next person this account's profile.
    store.clear()
    state = { ...fresh(), lang: state.lang, account: { status: 'none', user: null } }
    cvFile = null
    cvDraft = null
    go('welcome')
  },
  // After a version conflict: take the account's newer copy (it replaces the changes on this device).
  loadSaved: async () => {
    const out = await accountApi.loadProfile(state.profile.profileId)
    if (!out.ok) return render()
    state.profile = mergeCareerFields(out.data.profile)
    state.usable = afterConfirm(state.profile).usable
    state.savedWhere = 'account'
    go('summary')
  },
  acDelete: async () => {
    if (!confirm(t('acDeleteConfirm'))) return
    const out = await accountApi.deleteMyData()
    if (!out.ok) {
      state.account = { ...state.account, message: { kind: 'bad', text: t('acErr_other') } }
      return render()
    }
    store.clear()
    state = { ...fresh(), lang: state.lang, account: { status: 'none', user: null, message: { kind: 'ok', text: t('acDeleted') } } }
    go('access')
  },
  category: (k) => {
    state.category = k
    if (k === 'A' || k === 'B') {
      state.profile ??= emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
      state.profile = setField(state.profile, 'userCategory', val(k === 'A' ? 'working_adult' : 'graduate_switcher'))
    }
    go(k === 'C' || k === 'D' ? 'org' : 'source')
  },
  resume: () => go(resumeTo ?? 'source'),
  startNew: () => {
    if (!confirm(t('backNewConfirm'))) return
    state = { ...fresh(), lang: state.lang }
    go('access')
  },
  reset: () => {
    if (!confirm(t('backDeleteConfirm'))) return
    store.clear()
    state = { ...fresh(), lang: state.lang }
    go('welcome')
  },
  section: (i) => { state.section = Number(i); showSection(); persist(); render(); window.scrollTo(0, 0) },
  addRec: (listPath) => update(addRecord(state.profile, listPath, { ...NEW_RECORD[listPath] })),
  delRec: (arg) => {
    const [listPath, i] = arg.split('|')
    update(removeRecord(state.profile, listPath, Number(i)))
  },
  review: (arg) => {
    const [path, on] = arg.split('|')
    update(markForReview(state.profile, path, on === 'on'))
  },
  // A skill in the user's own words: normalised by the server (O*NET id, candidates to pick, or unknown).
  addSkill: async (typed) => {
    const text = String(typed ?? '').trim()
    if (!text) return
    const out = await api('POST', '/api/skills/normalize', { texts: [text] })
    // Without the server the skill is kept as typed (unknown), never guessed.
    const found = out.ok ? out.data.skills[0] : { name: text, canonicalId: null, category: null, originalText: text, candidates: [] }
    const key = (found.canonicalId ?? found.name).toLowerCase()
    if (state.profile.skills.some((s) => (s.canonicalId ?? s.name).toLowerCase() === key)) return render()
    const skill = { ...makeSkill({ ...found, source: 'user_input' }), ...(found.candidates?.length ? { candidates: found.candidates } : {}) }
    update({ ...state.profile, skills: [...state.profile.skills, skill] })
  },
  // A choice from a search picker ("<key>|<index>").
  pick: (arg) => {
    const parts = arg.split('|')
    const index = Number(parts.pop())
    const key = parts.join('|')
    const pick = state.pick?.[key]
    const chosen = pick?.result?.candidates?.[index]
    if (!chosen) return
    state.pick = { ...state.pick, [key]: null }
    if (key === 'skill') {
      if (state.profile.skills.some((s) => s.canonicalId === chosen.id)) return render()
      return update({ ...state.profile, skills: [...state.profile.skills, makeSkill({ name: chosen.name, canonicalId: chosen.id, category: chosen.category, source: 'user_input' })] })
    }
    if (key === 'interest') {
      state.occ = { ...(state.occ ?? {}), interest: { ...pick.result, term: pick.term } }
      return actions.occPick(`interest|${chosen.source}|${chosen.code}`)
    }
    // Field of study: the standard field the user chose replaces their words; how it was found is kept.
    const i = Number(key.split('|')[1])
    const field = { source: 'isced', code: chosen.code, title: chosen.title, version: pick.result.version, via: chosen.via, programme: chosen.programme, term: pick.term }
    update(setField(setField(state.profile, `education.records.${i}.fieldOfStudy`, chosen.title), `education.records.${i}.field`, field))
  },
  // Keep what the user typed: a skill is still normalised; a field of study stays unlinked.
  pickTyped: (key) => {
    const term = state.pick?.[key]?.term?.trim()
    state.pick = { ...state.pick, [key]: null }
    if (!term) return render()
    if (key === 'skill') return actions.addSkill(term)
    const i = Number(key.split('|')[1])
    update(setField(setField(state.profile, `education.records.${i}.fieldOfStudy`, term), `education.records.${i}.field`, null))
  },
  fieldUnlink: (i) => update(setField(state.profile, `education.records.${i}.field`, null)),
  // One click on a suggested skill ("<field code>|<skill id>") adds it; the level stays "not assessed".
  addSuggestion: (arg) => {
    const [code, ...rest] = arg.split('|')
    const id = rest.join('|')
    const data = state.suggest?.[code]
    const chosen = data?.suggestions?.find((s) => s.id === id)
    if (!chosen || state.profile.skills.some((s) => s.canonicalId === id)) return
    const from = { source: 'isced', code, title: data.field.title, version: data.isced, onetVersion: data.onet }
    const skill = { ...makeSkill({ name: chosen.name, canonicalId: chosen.id, category: chosen.category, source: 'user_input' }), suggestedFrom: from }
    update({ ...state.profile, skills: [...state.profile.skills, skill] })
  },
  interestRemove: (i) => update(setField(state.profile, 'preferences.careerInterests', state.profile.preferences.careerInterests.filter((_, j) => j !== Number(i)))),
  suggestMore: (code) => { state.suggestMore = { ...state.suggestMore, [code]: true }; render() },
  pickSkill: (arg) => {
    const [i, id] = arg.split('|')
    const skills = state.profile.skills.map((skill, j) => {
      if (j !== Number(i)) return skill
      const chosen = skill.candidates.find((c) => c.id === id)
      const { candidates, ...rest } = skill
      return { ...rest, name: chosen.name, canonicalId: chosen.id, category: chosen.category }
    })
    update({ ...state.profile, skills })
  },
  editSkills: () => { state.section = 2; go('form') },
  occFind: async (key) => {
    const term = state.profile.employment.records[Number(key.split('|')[1])]?.jobTitle ?? ''
    if (term.length < 2) return
    state.occBusy = key
    render()
    const out = await api('GET', `/api/occupations/search?q=${encodeURIComponent(term)}`)
    state.occBusy = null
    state.occ = { ...(state.occ ?? {}), [key]: out.ok ? { ...out.data, term } : { state: 'failed', candidates: [], term } }
    render()
  },
  occPick: (arg) => {
    const parts = arg.split('|')
    const [kind, index, source, code] = parts[0] === 'interest' ? ['interest', null, parts[1], parts[2]] : parts
    const key = kind === 'job' ? `job|${index}` : 'interest'
    const result = state.occ[key]
    const c = result.candidates.find((x) => x.source === source && x.code === code)
    const chosen = { source: c.source, code: c.code, title: c.title, via: c.via, url: c.url, version: result.version, fetchedAt: result.fetchedAt, lookupState: result.state }
    const mapping = { term: result.term, kind: kind === 'job' ? 'job' : 'interest', chosen, candidatesShown: result.candidates.length }
    let profile = state.profile
    let mappings = profile.occupationMappings
    if (kind === 'job') {
      profile = setField(profile, `employment.records.${index}.occupation`, chosen)
      mappings = mappings.filter((m) => !(m.kind === 'job' && m.term === result.term))
    }
    state.occ = { ...state.occ, [key]: null }
    update({ ...profile, occupationMappings: [...mappings, mapping] })
  },
  occUnlink: (arg) => {
    const [kind, index] = arg.split('|')
    let profile = state.profile
    if (kind === 'job') {
      const term = profile.employment.records[Number(index)]?.jobTitle
      profile = setField(profile, `employment.records.${index}.occupation`, null)
      profile = { ...profile, occupationMappings: profile.occupationMappings.filter((m) => !(m.kind === 'job' && m.term === term)) }
    } else {
      profile = { ...profile, occupationMappings: profile.occupationMappings.filter((_, i) => i !== Number(index)) }
    }
    update(profile)
  },
  cvFile: async (file) => {
    cvFile = file
    const check = checkBeforeUpload(file)
    if (!check.ok) {
      state.cv = { phase: 'error', ...check }
      return render()
    }
    state.cv = { phase: 'busy', step: 0 }
    render()
    const out = await uploadCv(file, { lang: state.lang, onUploaded: () => { state.cv = { phase: 'busy', step: 1 }; render() } })
    if (!out.ok) {
      state.cv = { phase: 'error', code: out.code, retryable: out.retryable }
      return render()
    }
    // What the user already typed wins; the draft only adds. Nothing is confirmed until Confirm.
    state.profile = mergeDraft(state.profile, out.data.profile)
    cvDraft = out.data.profile
    state.cvSession = true
    state.ai = null
    state.extractionId = out.data.extractionId
    state.cv = { phase: 'ready', language: out.data.language, langAnswered: false }
    persist()
    render()
  },
  cvRetry: () => (cvFile ? actions.cvFile(cvFile) : actions.cvReset()),
  cvReset: () => { cvFile = null; state.cv = null; render() },
  cvKeepLang: () => { state.cv.langAnswered = true; persist(); render() },
  cvSwitchLang: (lang) => { state.cv.langAnswered = true; actions.lang(lang) },
  aiOpen: () => { state.ai = { phase: 'consent' }; render() },
  aiClose: () => { state.ai = null; render() },
  aiRun: async () => {
    if (!document.getElementById('aiConsent')?.checked) return
    state.ai = { phase: 'busy' }
    render()
    const out = await api('POST', '/api/cv/reextract', { extractionId: state.extractionId, consent: true, interfaceLanguage: state.lang })
    if (!out.ok) {
      state.ai = { phase: 'error', reason: out.reason ?? out.code }
      return render()
    }
    // What the user changed since the CV draft is locked: the AI never overwrites it.
    const rows = diffProfiles(state.profile, out.data.suggested, userEditedPaths(cvDraft, state.profile))
    state.ai = { phase: 'compare', rows, dropped: out.data.dropped }
    render()
  },
  aiAccept: () => {
    const rows = visibleRows(state.ai)
    const ticked = new Set([...document.querySelectorAll('[data-ai-row]:checked')].map((box) => rows[Number(box.dataset.aiRow)].path))
    state.ai = null
    update(applyAccepted(state.profile, rows, ticked))
  },
  confirm: async () => {
    // Case C: the server normalises skills against O*NET and checks every field; nothing is saved here.
    const out = await api('POST', '/api/profiles/validate', { profile: state.profile })
    if (out.ok) state.profile = out.data.profile
    const check = validateProfile(state.profile)
    if (!check.ok) {
      state.message = t('fixErrors')
      return render()
    }
    state.profile = confirmProfile(state.profile)
    const next = afterConfirm(state.profile)
    state.usable = next.usable
    await saveConfirmed()
    go(next.screen)
  },
}

// Sign up or sign in with the email and password typed in the account box.
async function accountCall(kind) {
  const email = document.getElementById('acEmail')?.value.trim() ?? ''
  const password = document.getElementById('acPass')?.value ?? ''
  const out = kind === 'signup' ? await accountApi.signup(email, password, state.lang) : await accountApi.login(email, password)
  if (!out.ok) {
    const key = `acErr_${out.code}`
    state.account = { status: out.code === 'accounts_unavailable' ? 'off' : 'none', user: null, message: { kind: 'bad', text: t(key) === key ? t('acErr_other') : t(key) } }
    render()
    if (document.getElementById('acEmail')) document.getElementById('acEmail').value = email
    return
  }
  state.account = { status: 'in', user: out.data.user }
  state.access = 'account'
  // A signed-in user with a saved profile gets it back, unless this browser already holds their current work.
  const latest = await accountApi.loadLatestProfile()
  const local = state.profile
  // A local copy linked to another profile id (another account) is not this user's saved profile.
  if (local?.profileId && local.profileId !== latest.data?.id) state.profile = { ...local, profileId: null, profileVersion: 0 }
  const olderCopy = local?.profileId && local.profileId === latest.data?.id && local.profileVersion < latest.data.version
  if (latest.ok && latest.data && (!state.profile || isUntouched(state.profile) || olderCopy)) {
    state.profile = mergeCareerFields(latest.data.profile)
    state.usable = afterConfirm(state.profile).usable
    state.savedWhere = 'account'
    return go('summary')
  }
  go('category')
}

// After Confirm: always on this device; also in the account when signed in.
async function saveConfirmed() {
  if (state.account?.status !== 'in') {
    state.savedWhere = saved ? 'device' : 'nowhere'
    return
  }
  const out = await accountApi.saveProfile(state.profile, { guestStore: { save: persist }, extractionId: state.extractionId })
  if (out.ok) {
    state.profile = { ...state.profile, profileId: out.data.id, profileVersion: out.data.version }
    state.extractionId = null
    state.savedWhere = 'account'
  } else {
    state.savedWhere = out.code === 'stale_version' ? 'stale' : saved ? 'device' : 'nowhere'
  }
}

// Form changes (fired on change, so typing is not interrupted by re-rendering).
function onChange(target) {
  const d = target.dataset
  if (d.field) {
    const raw = target.value.trim()
    // Cleared, or the first choice ("Prefer not to say"): back to the default.
    let value = DECLINED
    if (raw !== '') value = d.kind === 'number' ? (Number.isFinite(Number(raw)) && Number(raw) >= 0 ? val(Number(raw)) : DECLINED) : val(raw)
    if (value === DECLINED) state.answering = { ...state.answering, [d.field]: false }
    return update(setField(state.profile, d.field, value))
  }
  // An interest area chosen in the dropdown joins the list (several allowed).
  if (d.interest !== undefined) {
    const area = state.interests?.areas?.find((a) => a.id === target.value)
    if (!area) return undefined
    const chosen = { source: 'onet', id: area.id, name: area.name, version: state.interests.version }
    return update(setField(state.profile, 'preferences.careerInterests', [...state.profile.preferences.careerInterests, chosen]))
  }
  // "Prefer not to say" or "I'll answer" on a typed field: answering opens the box; nothing is saved until typed.
  if (d.choice) {
    state.answering = { ...state.answering, [d.choice]: target.value === 'answer' }
    if (target.value !== 'answer') return update(setField(state.profile, d.choice, DECLINED))
    render()
    return document.getElementById(`f-${d.choice.replace(/\./g, '-')}`)?.focus()
  }
  if (d.list) return update(setField(state.profile, d.list, target.value.split(',').map((s) => s.trim()).filter(Boolean)))
  if (d.rec) {
    const [listPath, i, key] = d.rec.split('|')
    return update(setField(state.profile, `${listPath}.${i}.${key}`, target.value))
  }
  if (d.level !== undefined) {
    const level = target.value || null
    const skills = state.profile.skills.map((skill, i) => (i !== Number(d.level) ? skill : {
      ...skill, userConfirmed: true, proficiency: level, proficiencyStatus: level ? 'self_reported' : 'not_assessed',
    }))
    return update({ ...state.profile, skills })
  }
}

// The ATM intro (three.js, loaded only here). Skipped for "reduce motion", without WebGL, or if loading fails.
let introStarted = false
function startIntro() {
  introStarted = true
  if (document.querySelector('.atm-intro')) return
  let webgl = false
  try { webgl = Boolean(document.createElement('canvas').getContext('webgl2')) } catch { webgl = false }
  if (!shouldPlayIntro({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, webgl })) return
  // The skip button and Esc work at once, even while three.js is still loading; a timer ends a stalled intro.
  const host = document.createElement('div')
  host.className = 'atm-intro'
  host.innerHTML = `<button class="atm-skip">${esc(t('introSkip'))} →</button>`
  document.body.append(host)
  document.body.classList.add('intro-playing')
  let scene = null
  const show = () => document.body.classList.remove('intro-playing')
  const done = () => {
    show()
    host.remove()
    window.removeEventListener('keydown', onKey)
  }
  const skip = () => (scene ? scene.skip() : done())
  const onKey = (event) => { if (event.key === 'Escape') skip() }
  host.querySelector('.atm-skip').addEventListener('click', skip)
  window.addEventListener('keydown', onKey)
  setTimeout(() => { if (host.isConnected) skip() }, (INTRO_LENGTH + 6) * 1000)
  import('./intro/atmIntro.js')
    .then((intro) => intro.playIntro({ t, host, onReveal: show, onDone: done }))
    .then((controls) => { scene = controls })
    .catch(done)
}

function render() {
  // A profile screen opened directly (link, reload) still gets a profile to work on.
  if (NEEDS_PROFILE.includes(state.screen) && !state.profile) state.profile = emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
  document.documentElement.lang = state.lang
  document.getElementById('langSel').value = state.lang
  const screen = state.screen
  const tabs = TABS.includes(screen)
    ? `<div class="tabs">${TABS.map((id) => `<button class="${screen === id ? 'on' : ''}" data-go="${id}">${esc(t(id))}</button>`).join('')}</div>`
    : ''
  const page = NEXT.includes(screen) ? null : SCREENS[screen] ?? welcome
  const view = page ? page({ t, state }) : nextModule({ t, state, screen })
  // The landing page brings its own navigation and full-width layout, and opens with the ATM intro once per visit.
  document.body.classList.toggle('landing', page === welcome)
  if (page === welcome && !introStarted) startIntro()
  document.getElementById('main').innerHTML = tabs + view
  if (page === welcome) armOdometers(document.getElementById('main'), { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })
  document.getElementById('acctLink').innerHTML = accountLink({ t, state })
  const pill = document.getElementById('savePill')
  pill.className = saved ? 'pill ok' : 'pill'
  pill.textContent = saved ? t('savedLocal') : state.access ? t('storageOff') : t('notSaved')
}

document.addEventListener('click', (event) => {
  // A click outside a search picker closes its list (the words typed stay in the box).
  if (!event.target.closest('.picker')) {
    for (const list of document.querySelectorAll('.picker-list')) list.innerHTML = ''
    state.pick = {}
  }
  const target = event.target.closest('[data-go],[data-act]')
  if (!target) return
  if (target.dataset.go) return go(target.dataset.go)
  actions[target.dataset.act]?.(target.dataset.arg)
})
document.addEventListener('change', (event) => {
  if (event.target.id === 'langSel') return actions.lang(event.target.value)
  if (event.target.id === 'cvFile') return event.target.files[0] && actions.cvFile(event.target.files[0])
  onChange(event.target)
})
// Search pickers: search while typing, after a short pause; only the list is redrawn, so typing goes on.
const searchTimers = {}
async function runSearch(kind, key, term) {
  const box = document.getElementById(`pick-${key.replace(/\|/g, '-')}`)
  const show = () => {
    const pick = state.pick[key]
    if (box) box.innerHTML = pick ? pickerList({ t, kind, key, term: pick.term, result: pick.result, busy: pick.busy }) : ''
  }
  if (term.trim().length < 2) {
    state.pick = { ...state.pick, [key]: null }
    return show()
  }
  state.pick = { ...state.pick, [key]: { term, busy: true } }
  show()
  const out = await api('GET', `${SEARCH_URL[kind]}?q=${encodeURIComponent(term.trim())}`)
  // A newer search in the same box wins.
  if (state.pick[key]?.term !== term) return
  state.pick = { ...state.pick, [key]: { term, result: out.ok ? out.data : { failed: true, candidates: [] } } }
  show()
}
document.addEventListener('input', (event) => {
  const search = event.target.dataset?.search
  if (!search) return
  const [kind, ...rest] = search.split('|')
  const key = rest.join('|')
  state.pick ??= {}
  clearTimeout(searchTimers[key])
  searchTimers[key] = setTimeout(() => runSearch(kind, key, event.target.value), SEARCH_DELAY_MS)
})
document.addEventListener('keydown', (event) => {
  const search = event.target.dataset?.search
  if (event.key !== 'Enter' || !search) return
  event.preventDefault()
  const key = search.split('|').slice(1).join('|')
  // Enter takes the first choice found; with none, the words as typed (skills and field of study).
  if (state.pick?.[key]?.result?.candidates?.length) return actions.pick(`${key}|0`)
  if (key !== 'interest' && state.pick?.[key]?.term) actions.pickTyped(key)
})
// Drag and drop on the upload area.
document.addEventListener('dragover', (event) => {
  if (event.target.closest?.('#cvDrop')) event.preventDefault()
})
document.addEventListener('drop', (event) => {
  if (!event.target.closest?.('#cvDrop')) return
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file) actions.cvFile(file)
})
window.addEventListener('popstate', () => { state.screen = location.hash.slice(1) || 'welcome'; render() })

// Boot: a saved guest session past the start screens gets the "Welcome back" choice.
const previous = store.load()
if (previous) {
  state = { ...fresh(), ...previous }
  if (state.profile) state.profile = mergeCareerFields(state.profile)
  saved = true
}
if (state.section >= SECTIONS.length) state.section = 0
showSection()
if (resumeChoice(previous) === 'ask') {
  resumeTo = previous.screen
  state.screen = 'returning'
} else if (location.hash) {
  state.screen = location.hash.slice(1)
}
render()
// Who is signed in (the session cookie is HttpOnly, so ask the server).
// Which optional services the server has (e.g. whether a temporary CV copy is kept).
api('GET', '/api/health').then((out) => {
  state.features = out.ok ? out.data.features ?? null : null
  render()
})
accountApi.me().then((out) => {
  if (out.ok) state.account = { status: 'in', user: out.data.user }
  else state.account = { status: out.code === 'not_signed_in' ? 'none' : 'off', user: null }
  render()
})
