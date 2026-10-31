// App state, hash routing, guest saving and one event handler for every screen.
// Buttons use data-go / data-act; form controls use data-field, data-choice, data-list, data-rec, data-field-pick, data-aiuse;
// search pickers use data-search.
import { t as translate } from '/shared/i18n.js'
import { afterGetStarted, createGuestStore, resumeChoice, safeLocalStorage, screenToSave, startScreen } from '/shared/guestStore.js'
import { DECLINED, emptyProfile, makeSkill, val, validateProfile } from '/shared/profileSchema.js'
import { aiAskStep } from '/shared/aiTasks.js'
import { addRecord, confirmProfile, declineUnanswered, isUntouched, mergeCareerFields, markForReview, mergeDraft, minimizeForGuest, removeRecord, setField } from '/shared/profileState.js'
import { afterConfirm } from '/shared/flow.js'
import welcome from './screens/welcome.js'
import returning from './screens/returning.js'
import access from './screens/access.js'
import goal from './screens/goal.js'
import category from './screens/category.js'
import org from './screens/org.js'
import orgShare from './screens/orgShare.js'
import source from './screens/source.js'
import upload from './screens/upload.js'
import form, { SECTION_FIELDS, SECTIONS, dropNotAsked, toYears } from './screens/form.js'
import { confirmGroup, groupsOf, linkSkill, placeOf, renamePlace, unlinkPlace, unlinkSkill } from './screens/skillGroups.js'
import { prechooseFields } from './cvPrechoose.js'
import review from './screens/review.js'
import summary from './screens/summary.js'
import nextModule from './screens/nextModule.js'
import { loadTheme, saveTheme, toggleTheme } from '/shared/theme.js'
import radarScreen, { aiAskFocus, radarTabOf, keepCaret, pageForRow, parsePageArg, parsePageList, staleRadar, withPage } from './screens/radar.js'
import * as radarApi from './radarApi.js'
import { adminView, judgeView, judgeEdits } from './screens/radarAdmin.js'
import { radarAdminApi as adminApi } from './radarAdminApi.js'
import matchScreen, { bandsAt, matchToSave, scenarioOf, trendMoves } from './screens/match.js'
import sdgScreen from './screens/sdgTab.js'
import * as matchApi from './matchApi.js'
import pathwayScreen, { activeOf, pathwayToSave } from './screens/pathway.js'
import * as pathwayApi from './pathwayApi.js'
import { futuresView } from './screens/futures.js'
import * as newsApi from './newsApi.js'
import { readAiUse } from '/shared/matching/overall.js'
import { esc } from './ui.js'
import { api } from './api.js'
import { checkBeforeUpload, uploadCv } from './cvApi.js'
import * as accountApi from './accountApi.js'
import * as orgApi from './orgApi.js'
import { consumeJoinHash, createOrgActions, orgEntry } from './orgActions.js'
import { accountLink } from './components/accountBox.js'
import { pickerList } from './components/searchPicker.js'
import { linkedFields } from './components/fieldSuggestions.js'
import { shouldPlayIntro } from './intro/timeline.js'
import { armOdometers } from './components/odometer.js'

const SCREENS = { welcome, returning, access, goal, category, org, share: ({ t, state }) => orgShare(t, state.share), source, upload, form, review, summary }
const NEXT = ['assess', 'radar', 'match', 'pathway', 'sdg', 'futures']
// Old screen names that open their new screen (#roadmap was the placeholder of the Study pathway tab).
const ALIAS = { roadmap: 'pathway' }
const screenOf = (name) => ALIAS[name] ?? name
const TABS = ['summary', ...NEXT]
const NEEDS_PROFILE = ['upload', 'form', 'review', 'summary']
const NEW_RECORD = {
  'education.records': { level: '', qualification: '', fieldOfStudy: '', institution: '', year: '' },
  'employment.records': { jobTitle: '', years: null },
  certifications: { name: '', issuer: '', year: '' },
  training: { name: '', year: '' },
  projects: { title: '', description: '' },
}

// Search picker endpoints by kind (skills: O*NET catalogue; roles: O*NET and eMASCO; field of study: ISCED-F 2013).
const SEARCH_URL = { skill: '/api/skills/search', interest: '/api/occupations/search', field: '/api/fields/search' }
const SEARCH_DELAY_MS = 250
const STUDY_SECTION = 0
const SKILLS_SECTION = SECTIONS.indexOf('secSkills')
const PREFERENCES_SECTION = SECTIONS.indexOf('secPrefs')
const AI_SECTION = SECTIONS.indexOf('secAi')

const fresh = () => ({ screen: 'welcome', lang: 'en', use: null, access: null, category: null, profile: null, section: 0, usable: false, message: null })
const store = createGuestStore(safeLocalStorage(), minimizeForGuest)
let theme = loadTheme(safeLocalStorage())
let state = fresh()
let resumeTo = null
let saved = false
// The chosen CV file stays in memory only (for Retry); it is never saved in the browser.
let cvFile = null
const t = (key, vars) => translate(state.lang, key, vars)
// After guest or account: personal users are asked their goal first; organisations go to "Who are you?".
// The ISCED-F field search (field names and the CIP programmes linked to them); null when it is not available.
const searchFields = async (words) => {
  const out = await api('GET', `/api/fields/search?q=${encodeURIComponent(words)}`)
  return out.ok ? out.data : null
}

const afterAccess = () => (state.use === 'org' ? 'category' : 'goal')

function persist() {
  // occupation search results and upload progress are only shown, never saved (nor the Radar data, nor anything of the
  // Radar admin and judge screens: their key is never in the state and their CSRF token stays in radarAdminApi memory)
  // Career matching: only the AI scenario and the chosen role are kept; the answers (data, details) are fetched again.
  // Study pathway: only the targets, the active one and the progress are kept; the answers are fetched again.
  saved = store.save({ ...state, screen: screenToSave(state.screen, resumeTo), match: state.match ? matchToSave(state.match) : null, pathway: state.pathway ? pathwayToSave(state.pathway) : null, message: null, radar: null, radarAdmin: null, news: null, occ: {}, occBusy: null, pick: {}, groupEdit: null, groupAdd: null, otherOpen: false, answering: {}, suggest: {}, suggestMore: {}, interests: null, fields: null, account: null, org: null, share: null, accessNote: null, features: null, cvSession: null, cv: state.cv?.phase === 'ready' ? state.cv : null })
}

// A form section on screen: what the user leaves unanswered there is "prefer not to say" (the default shown).
function showSection() {
  if (state.screen === 'form' && state.profile) state.profile = declineUnanswered(state.profile, SECTION_FIELDS[state.section ?? 0] ?? [])
  if (state.screen === 'form' && state.section === STUDY_SECTION) loadFields()
  if (state.screen === 'form' && state.section === SKILLS_SECTION) loadSuggestions()
  if (state.screen === 'form' && state.section === PREFERENCES_SECTION) loadInterests()
}

// The ISCED-F 2013 fields of study for the dropdown, fetched once (again after a failure).
async function loadFields() {
  if (state.fields && !state.fields.failed) return
  state.fields = { loading: true }
  const out = await api('GET', '/api/fields')
  state.fields = out.ok ? out.data : { failed: true }
  if (state.screen === 'form' && state.section === STUDY_SECTION) render()
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
  // Get started on the landing page: a saved session is offered first (Welcome back).
  if (screen === 'access' && state.screen === 'welcome') screen = afterGetStarted(resumeTo)
  if (NEEDS_PROFILE.includes(screen) && !state.profile) state.profile = emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
  state.screen = screen
  if (screen !== 'access') state.accessNote = null
  showSection()
  state.message = null
  if (location.hash !== `#${screen}`) history.pushState(null, '', `#${screen}`)
  persist()
  render()
  window.scrollTo(0, 0)
}

// ---------- Future Skills Radar ----------
// The screen keeps the manifest id it loaded and sends it on every follow-up call (spec §6.5, Review Focus 4).
const radarUi = () => (state.radar ??= {})
function setRadar(patch) {
  state.radar = { ...radarUi(), openDrop: false, ...patch }
  render()
}
// Each load gets a number; a load that ends after a newer one started (or after the data went stale) is dropped.
let radarRun = 0
async function loadRadar(manifestId) {
  const run = ++radarRun
  state.radar = { ...radarUi(), loading: true, error: null, gone: false }
  const out = await radarApi.load(manifestId)
  if (run !== radarRun) return
  // devStore is remembered from the last answer that said it, so the banner stays up without data (spec §7).
  const devStore = out.data?.devStore ?? out.devStore ?? radarUi().devStore
  if (out.reload) state.radar = { ...radarUi(), loading: false, gone: true }
  else if (!out.ok) state.radar = { ...radarUi(), loading: false, error: out.code ?? 'network', devStore }
  else state.radar = { ...radarUi(), loading: false, data: out.data, newerManifestId: null, devStore }
  if (state.screen === 'radar') render()
}
// Open the evidence panel at once with the signal already loaded; then ask for it again with the same manifest id.
async function openEvidence(kind, id, signalId) {
  setRadar({ open: { kind, id }, signal: null })
  document.getElementById('radarDrawer')?.focus()
  const data = radarUi().data
  if (!data || !signalId) return
  const out = await radarApi.signal(signalId, data.manifestId)
  if (radarUi().open?.id !== id) return
  if (out.reload) return setRadar({ gone: true })
  if (!out.ok) return undefined
  setRadar({ signal: out.signal, newerManifestId: out.activeManifestId && out.activeManifestId !== data.manifestId ? out.activeManifestId : radarUi().newerManifestId ?? null })
  document.getElementById('radarDrawer')?.focus()
}
// The AI task data is static reference data (no manifest, no profile): fetched once, when For You is first shown.
async function loadAiTasks() {
  state.radar = { ...radarUi(), aiTasks: { loading: true } }
  const out = await radarApi.aiTasks()
  state.radar = { ...radarUi(), aiTasks: out.ok ? { ok: true, data: out.data } : { ok: false, code: out.code } }
  if (state.screen === 'radar') render()
}
function ensureRadar() {
  const r = radarUi()
  if (!r.data && !r.loading && !r.error && !r.gone) loadRadar()
  if (radarTabOf(state) === 'fy' && !r.aiTasks) loadAiTasks()
}
// After an admin decision, refresh or clean-up the Radar data in this tab may be out of date (a field-topic decision
// changes the references without a manifest of its own): drop it, so going to #radar loads afresh (acceptance N2).
function radarStale() {
  radarRun += 1
  state.radar = staleRadar(state.radar)
  matchStale()
}

// ---------- Radar admin (#admin) and judge Trend Change Test (#judge) ----------
// The key is read from the password box once, the box is cleared at once, and the key is never stored. The CSRF token
// stays in radarAdminApi's memory; state.radarAdmin holds only what is shown and is never persisted (see persist()).
const adminUi = () => (state.radarAdmin ??= {})
function setAdmin(patch, focus = null) {
  state.radarAdmin = { ...adminUi(), ...patch, focus }
  render()
}
const adminMsg = (name, m) => ({ msgs: { ...adminUi().msgs, [name]: m } })
// A failed call: back to the key box when the session is gone (expired, signed out, key rotated), else the message.
function adminFailed(name, out) {
  if (!adminApi.session()) {
    state.radarAdmin = { msgs: { signin: { kind: 'bad', code: out.code } }, focus: 'admKey' }
    return render()
  }
  setAdmin({ loading: false, ...adminMsg(name, { kind: 'bad', code: out.code, errors: out.errors }) }, `admMsg-${name}`)
}
// Everything the admin screen shows, read again after each decision, refresh or clean-up (one render at the end).
async function reloadAdmin(patch = {}, focus = null) {
  const [pub, status, mappings, breaks, sdgLinks, picks] = await Promise.all([radarApi.load(), adminApi.status(), adminApi.mappings(), adminApi.breaks(), adminApi.sdgLinks(), adminApi.pathwayPicks()])
  const failed = [status, mappings, breaks].find((out) => !out.ok)
  if (failed) return adminFailed('status', failed)
  // A failed SDG link list fails only the SDG card (the rest of the admin screen still shows), unless the session is gone.
  if (!sdgLinks.ok && !adminApi.session()) return adminFailed('status', sdgLinks)
  const sdg = sdgLinks.ok ? { sdgLinks: sdgLinks.data, sdgLinksError: null } : { sdgLinks: null, sdgLinksError: sdgLinks.code ?? 'network' }
  // Likewise a failed pathway pick list fails only the pathway card.
  if (!picks.ok && !adminApi.session()) return adminFailed('status', picks)
  const pathwayPicks = picks.ok ? { pathwayPicks: picks.data, pathwayPicksError: null } : { pathwayPicks: null, pathwayPicksError: picks.code ?? 'network' }
  setAdmin({ ...patch, loading: false, data: { public: pub.ok ? pub.data : null, status: status.data, mappings: mappings.data, breaks: breaks.data, ...sdg, ...pathwayPicks } }, focus)
}
async function loadJudge() {
  state.radarAdmin = { ...adminUi(), loading: true }
  const out = await adminApi.diff()
  if (!out.ok) return adminFailed('judge', out)
  setAdmin({ loading: false, report: out.data }, 'admTop')
}
// The key boxes show the development store banner too (spec §7): read once from the public manifest answer on open.
async function checkStore() {
  adminUi().devStore = null
  const out = await radarApi.storeInfo()
  adminUi().devStore = out.ok ? out.devStore : null
  if (out.ok && out.devStore && (state.screen === 'admin' || state.screen === 'judge')) render()
}
function ensureAdmin(screen) {
  const a = adminUi()
  a.session = adminApi.session()
  if (a.devStore === undefined) checkStore()
  if (a.loading) return
  if (screen === 'admin' && a.session?.role === 'admin' && !a.data && !a.msgs?.status) {
    a.loading = true
    // The first full render replaces the page: focus goes back to the heading (after sign-in or Reload).
    reloadAdmin({}, 'admTop')
  }
  if (screen === 'judge' && a.session?.role === 'demo' && !a.report && !a.msgs?.judge) loadJudge()
}
const fieldValue = (id) => document.getElementById(id)?.value ?? ''

const adminActions = {
  admSignIn: async (role) => {
    const box = document.getElementById('admKey')
    let key = box?.value ?? ''
    if (box) box.value = ''
    const label = fieldValue('admLabel')
    if (!key) return setAdmin(adminMsg('signin', { kind: 'bad', code: 'not_allowed' }), 'admKey')
    const out = await adminApi.signIn(role === 'demo' ? 'demo' : 'admin', key, { label })
    key = ''
    if (!out.ok) return setAdmin(adminMsg('signin', { kind: 'bad', code: out.code }), 'admKey')
    // A judge's matching answers use the judge's test data from now on.
    if (role === 'demo') matchStale()
    state.radarAdmin = { msgs: {}, focus: 'admTop' }
    render()
  },
  admSignOut: async () => {
    const wasJudge = adminApi.session()?.role === 'demo'
    await adminApi.signOut()
    // Back to the live trend data in matching.
    if (wasJudge) matchStale()
    state.radarAdmin = { msgs: { signin: { kind: 'ok', key: 'rdSignedOut' } }, focus: 'admMsg-signin' }
    render()
  },
  admReload: () => {
    state.radarAdmin = { ...adminUi(), data: null, report: null, msgs: {}, loading: false }
    render()
  },
  admExport: async () => {
    const out = await adminApi.exportJson()
    if (!out.ok) return adminFailed('status', out)
    setAdmin({ exported: out.data }, 'admExportJson')
  },
  admExportClose: () => setAdmin({ exported: null }, 'admTop'),
  admMap: async (arg) => {
    const bar = String(arg).lastIndexOf('|')
    const note = fieldValue('admMapNote')
    const notes = { ...adminUi().notes, map: note }
    const out = await adminApi.decideMapping({ mappingId: String(arg).slice(0, bar), decision: String(arg).slice(bar + 1), note })
    if (!out.ok) {
      if (!adminApi.session()) return adminFailed('map', out)
      return setAdmin({ notes, ...adminMsg('map', { kind: 'bad', code: out.code }) }, out.code === 'note_required' ? 'admMapNote' : 'admMsg-map')
    }
    radarStale()
    reloadAdmin({ notes: { ...notes, map: '' }, ...adminMsg('map', { kind: 'ok', key: 'rdDecided', recalculation: out.data?.recalculation }) }, 'admMsg-map')
  },
  admSdg: async (arg) => {
    const bar = String(arg).lastIndexOf('|')
    const note = fieldValue('admSdgNote')
    const notes = { ...adminUi().notes, sdg: note }
    const out = await adminApi.decideSdgLink({ id: String(arg).slice(0, bar), decision: String(arg).slice(bar + 1), note })
    if (!out.ok) {
      if (!adminApi.session()) return adminFailed('sdg', out)
      return setAdmin({ notes, ...adminMsg('sdg', { kind: 'bad', code: out.code }) }, out.code === 'note_required' ? 'admSdgNote' : 'admMsg-sdg')
    }
    // The SDG tags in matching change (not the bands): fetch the list again, with no trend banner.
    matchStale(false)
    reloadAdmin({ notes: { ...notes, sdg: '' }, ...adminMsg('sdg', { kind: 'ok', key: 'rdDecided' }) }, 'admMsg-sdg')
  },
  admPick: async (arg) => {
    const bar = String(arg).lastIndexOf('|')
    const note = fieldValue('admPickNote')
    const notes = { ...adminUi().notes, pick: note }
    const out = await adminApi.decidePathwayPick({ id: String(arg).slice(0, bar), decision: String(arg).slice(bar + 1), note })
    if (!out.ok) {
      if (!adminApi.session()) return adminFailed('pick', out)
      return setAdmin({ notes, ...adminMsg('pick', { kind: 'bad', code: out.code }) }, out.code === 'note_required' ? 'admPickNote' : 'admMsg-pick')
    }
    // The pathway answers carry the picks' review labels: fetch them again.
    pathwayFor = null
    reloadAdmin({ notes: { ...notes, pick: '' }, ...adminMsg('pick', { kind: 'ok', key: 'rdDecided' }) }, 'admMsg-pick')
  },
  admBreak: async (arg) => {
    const [i, decision] = String(arg).split('|')
    const brk = adminUi().data?.breaks?.breaks?.[Number(i)]
    const note = fieldValue('admBrkNote')
    const link = fieldValue('admBrkLink')
    const notes = { ...adminUi().notes, brk: note, link }
    const out = await adminApi.decideBreak({ brk, decision, note, link })
    if (!out.ok) {
      if (!adminApi.session()) return adminFailed('brk', out)
      const focus = out.code === 'note_required' ? 'admBrkNote' : out.code === 'bad_link' ? 'admBrkLink' : 'admMsg-brk'
      return setAdmin({ notes, ...adminMsg('brk', { kind: 'bad', code: out.code }) }, focus)
    }
    radarStale()
    reloadAdmin({ notes: { ...notes, brk: '', link: '' }, ...adminMsg('brk', { kind: 'ok', recalculation: out.data.recalculation }) }, 'admMsg-brk')
  },
  admRefresh: async (source) => {
    const out = await adminApi.refresh(source)
    if (!out.ok && !adminApi.session()) return adminFailed('refresh', out)
    if (out.ok) radarStale()
    reloadAdmin(adminMsg('refresh', out.ok ? { kind: 'ok', source, result: out.data?.result } : { kind: 'bad', source, code: out.code }), 'admMsg-refresh')
  },
  admRefreshOnetSkills: async () => {
    const release = fieldValue('admOnetRelease').trim()
    if (!/^\d{2}\.\d$/.test(release)) return setAdmin(adminMsg('refresh', { kind: 'bad', source: 'onet-skills', code: 'bad_request' }), 'admOnetRelease')
    const out = await adminApi.refresh('onet-skills', { release })
    if (!out.ok && !adminApi.session()) return adminFailed('refresh', out)
    if (out.ok) radarStale()
    reloadAdmin(adminMsg('refresh', out.ok ? { kind: 'ok', source: 'onet-skills', result: out.data?.result } : { kind: 'bad', source: 'onet-skills', code: out.code }), 'admMsg-refresh')
  },
  admCleanup: async () => {
    const out = await adminApi.cleanup()
    if (!out.ok) return adminFailed('status', out)
    radarStale()
    reloadAdmin(adminMsg('status', { kind: 'ok', key: 'rdAdminCleaned', vars: { deleted: out.data.deleted.length, refused: out.data.refused.length } }), 'admMsg-status')
  },
  admScen: (scen) => {
    const id = scen === 'B' || scen === 'C' ? scen : 'A'
    setAdmin({ scen: id }, `demoScen${id}`)
  },
  demoApply: async (scen) => {
    const report = adminUi().report
    let body
    if (scen === 'C') {
      body = { scenario: 'C' }
    } else if (scen === 'B') {
      body = { scenario: 'B', factor: Number(fieldValue('demoFactor')) }
    } else {
      const edits = judgeEdits(report, [...document.querySelectorAll('[data-demo-cell]')].map((input) => [input.dataset.demoCell, input.value]))
      if (!edits.length) return setAdmin(adminMsg('judge', { kind: 'bad', code: 'no_edit' }), 'admMsg-judge')
      body = { scenario: 'A', edits }
    }
    const out = await adminApi.apply(body)
    if (!out.ok) return adminFailed('judge', out)
    matchStale()
    setAdmin({ report: out.data, ...adminMsg('judge', null) }, 'demoReport')
  },
  demoReset: async () => {
    const out = await adminApi.reset()
    if (!out.ok) return adminFailed('judge', out)
    matchStale()
    setAdmin({ report: out.data, ...adminMsg('judge', { kind: 'ok', key: 'rdJudgeResetDone' }) }, 'admMsg-judge')
  },
}

// ---------- Career matching (#match) and SDG contribution (#sdg) ----------
// The profile is sent to the matching API for each answer (never stored there). The list is fetched again when the
// profile changes (every edit makes a new profile object); a role's detail is fetched when it is asked for.
const matchUi = () => {
  if (!state.match?.details) state.match = { scenario: 'moderate', prevScenario: null, sdgFilter: '', data: null, details: {}, chosen: null, loading: false, error: null, explore: false, allBars: {}, pages: {}, open: {}, ...(state.match ?? {}), details: {} }
  return state.match
}
let matchFor = null
let matchRun = 0
// What changed on the server since the list was loaded: null (nothing known), 'trend' (Radar data or a judge's test
// data: bands may move, the banner says which) or 'sdg' (an SDG decision: tags only).
let matchStaleBy = null
// The bands shown before a trend change ({scenario, bands}), kept until the new list has come.
let matchBefore = null
const matchScreens = () => state.screen === 'match' || state.screen === 'sdg'
// The matching answers in this tab may be out of date: load them again on the next #match / #sdg render. A load or
// detail still on its way is dropped (it may hold the data from before the change).
function matchStale(trend = true) {
  matchRun += 1
  matchStaleBy = trend ? 'trend' : matchStaleBy ?? 'sdg'
  if (matchScreens()) render()
}
async function loadMatch() {
  const run = ++matchRun
  const profile = state.profile
  const m = matchUi()
  if (matchStaleBy !== 'trend' || matchFor !== profile) matchBefore = null
  else if (m.data) matchBefore = { scenario: scenarioOf(m), bands: bandsAt(m.data, scenarioOf(m)) }
  matchFor = profile
  matchStaleBy = null
  // New data: every list back to page 1, every card closed (pages and open cards are not saved to the guest store).
  state.match = { ...m, loading: true, error: null, data: null, details: {}, prevScenario: null, trend: null, pages: {}, open: {} }
  const out = await matchApi.list(minimizeForGuest(profile), { lang: state.lang })
  // Dropped (stale again, or a new profile): the next load keeps matchBefore when it still applies.
  if (run !== matchRun) return
  const trend = out.ok ? trendMoves(matchBefore, out.data) : null
  matchBefore = null
  state.match = { ...matchUi(), loading: false, data: out.ok ? out.data : null, error: out.ok ? null : out.code ?? 'network', trend }
  if (matchScreens()) render()
}
async function loadMatchDetail(code) {
  if (!code || !state.profile) return
  const run = matchRun
  const m = matchUi()
  m.details = { ...m.details, [code]: { loading: true } }
  if (matchScreens()) render()
  const out = await matchApi.role(minimizeForGuest(state.profile), code, { lang: state.lang })
  if (run !== matchRun) return
  state.match.details = { ...state.match.details, [code]: out.ok ? out.data : { error: out.code ?? 'network' } }
  if (matchScreens()) render()
}
function ensureMatch() {
  const m = matchUi()
  if (!state.profile) return
  if (matchFor !== state.profile || matchStaleBy) loadMatch()
  // The SDG tab shows the chosen role's path: its detail is needed.
  if (state.screen === 'sdg' && m.chosen && !state.match.details?.[m.chosen]) loadMatchDetail(m.chosen)
}
const matchActions = {
  // The scenario only moves roles between bands; the banner lists the roles that moved.
  mScn: (scenario) => {
    const m = matchUi()
    const next = scenario === 'rapid' ? 'rapid' : 'moderate'
    if (next === m.scenario) return
    state.match = { ...m, prevScenario: m.scenario, scenario: next, trend: null, pages: {} }
    persist()
    render()
  },
  mFilter: (goal) => { state.match = { ...matchUi(), sdgFilter: goal ?? '', prevScenario: null, pages: {} }; render() },
  // A page of one band list: "<list>:<band>:<page>" (list = field | other). The screen shows the last page when past it.
  mPage: (arg) => {
    const m = /^(field|other):([1-4]):(\d{1,6})$/.exec(String(arg ?? ''))
    if (!m) return
    const key = `${m[1]}:${m[2]}`
    state.match = { ...matchUi(), pages: { ...(matchUi().pages ?? {}), [key]: Math.max(1, Number(m[3])) } }
    render()
    document.querySelector(`.mt-pager [data-arg^="${key}:"][aria-current="page"]`)?.focus()
  },
  // The "Go to page" box of one band list (key = "<list>:<band>").
  mPageGo: (key) => {
    if (!/^(field|other):[1-4]$/.test(String(key ?? ''))) return
    const page = Number.parseInt(document.getElementById(`mtGo-${key.replace(':', '-')}`)?.value ?? '', 10)
    if (Number.isFinite(page) && page >= 1) matchActions.mPage(`${key}:${Math.min(page, 999999)}`)
  },
  // "Show outlook and details" / "Hide outlook and details": the open state per role code; the detail is loaded once.
  mOpen: (code) => {
    const m = matchUi()
    const isOpen = m.open?.[code] === true
    state.match = { ...m, open: { ...(m.open ?? {}), [code]: !isOpen } }
    const have = state.match.details?.[code]
    if (!isOpen && (!have || have.error)) return loadMatchDetail(code)
    render()
  },
  mBannerClose: () => { state.match = { ...matchUi(), prevScenario: null, trend: null }; render() },
  mExplore: () => { state.match = { ...matchUi(), explore: !matchUi().explore }; render() },
  mAllBars: (code) => { state.match = { ...matchUi(), allBars: { ...matchUi().allBars, [code]: true } }; render() },
  mDetail: (code) => loadMatchDetail(code),
  mChoose: (code) => {
    const m = matchUi()
    state.match = { ...m, chosen: m.chosen === code ? null : code, prevScenario: null }
    persist()
    render()
  },
  mAskAi: () => { state.section = AI_SECTION; persist(); go('form') },
  mReload: () => { matchFor = null; state.match = { ...matchUi(), error: null }; render() },
}

// ---------- Study pathway (#pathway) ----------
// The profile is sent to the pathway API for each target's answer (never stored there). The answers are fetched again
// when the profile changes; only targets, the active one and the progress are saved (pathwayToSave).
const pathwayUi = () => {
  state.pathway = { ...pathwayToSave(state.pathway), answers: state.pathway?.answers ?? {} }
  return state.pathway
}
let pathwayFor = null
let pathwayRun = 0
async function loadPathway(code) {
  const run = pathwayRun
  state.pathway.answers = { ...state.pathway.answers, [code]: { loading: true } }
  const out = await pathwayApi.get(minimizeForGuest(state.profile), code, { lang: state.lang })
  if (run !== pathwayRun) return
  state.pathway.answers = { ...state.pathway.answers, [code]: out.ok ? out.data : { error: out.code ?? 'network' } }
  if (state.screen === 'pathway') render()
}
function ensurePathway() {
  const p = pathwayUi()
  if (!state.profile) return
  if (pathwayFor !== state.profile) {
    pathwayFor = state.profile
    pathwayRun += 1
    p.answers = {}
  }
  for (const { code } of p.targets) if (!p.answers[code]) loadPathway(code)
}
// The local date (YYYY-MM-DD): in Malaysia (UTC+8) a toggle before 08:00 is still today.
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function setProgress(key, value) {
  if (typeof key !== 'string' || !key) return
  const p = pathwayUi()
  const progress = { ...p.progress }
  if (value) progress[key] = { state: value, at: today() }
  else delete progress[key]
  state.pathway = { ...p, progress }
  persist()
  render()
}
// Compare futures → AI news: the same lists for every visitor, loaded once (again after a failure). Never saved.
const newsUi = () => (state.news ??= { tab: 'you', field: null, data: null, loading: false, failed: false })
async function loadNews() {
  const n = newsUi()
  n.loading = true
  n.failed = false
  const out = await newsApi.load()
  state.news = { ...newsUi(), loading: false, data: out.ok ? out.data : null, failed: !out.ok }
  if (state.screen === 'futures') render()
}
function ensureNews() {
  const n = newsUi()
  if (!n.data && !n.loading && !n.failed) loadNews()
}
const newsActions = {
  newsTab: (tab) => { state.news = { ...newsUi(), tab: tab === 'all' ? 'all' : 'you' }; render() },
  newsField: (code) => { state.news = { ...newsUi(), tab: 'all', field: String(code ?? '') }; render() },
  newsRetry: () => loadNews(),
}

const pathwayActions = {
  // From a #match card: add the role (if not yet a target), make it active, open #pathway.
  pwPlan: (code) => {
    if (typeof code !== 'string' || !code) return
    const p = pathwayUi()
    const title = state.match?.data?.roles?.find((r) => r.code === code)?.title ?? code
    const targets = p.targets.some((x) => x.code === code) ? p.targets : [...p.targets, { code, title, addedAt: today() }]
    state.pathway = { ...p, targets, active: code }
    go('pathway')
  },
  // A target tab; on a failed answer it asks again.
  pwTab: (code) => {
    const p = pathwayUi()
    if (!p.targets.some((x) => x.code === code)) return
    const answers = { ...p.answers }
    if (answers[code]?.error) delete answers[code]
    state.pathway = { ...p, active: code, answers }
    persist()
    render()
  },
  // Removes the target only: the progress is per skill and stays.
  pwRemove: (code) => {
    const p = pathwayUi()
    const targets = p.targets.filter((x) => x.code !== code)
    const { [code]: _gone, ...answers } = p.answers
    state.pathway = { ...p, targets, answers, active: activeOf({ targets, active: p.active === code ? null : p.active }) }
    persist()
    render()
  },
  pwStarted: (key) => setProgress(key, 'started'),
  pwDone: (key) => setProgress(key, 'done'),
  pwClear: (key) => setProgress(key, null),
}

// The Radar's AI usage question (D35-D39). Its answer is not CV content, so it is saved without update(): a confirmed
// profile stays confirmed (D38). Unsaved ticks live in state.radar.aiAsk, which is never saved (persist drops radar).
function aiAsk(act, arg) {
  const out = aiAskStep({ profile: state.profile, aiAsk: radarUi().aiAsk ?? null }, act, arg, today())
  state.profile = out.profile
  if (act === 'continue' || act === 'skip') persist()
  setRadar({ aiAsk: out.aiAsk })
  // The render replaced the card: give keyboard and screen-reader users their place back (final review).
  const sel = aiAskFocus(act, arg)
  if (sel) document.querySelector(sel)?.focus()
}

// Any edit makes a confirmed profile a draft again: it must be confirmed anew.
function update(profile) {
  state.profile = { ...profile, profileStatus: 'draft' }
  state.message = null
  persist()
  render()
}

const actions = {
  // Radar: "Which of these do you use AI for?" (D35, D36, D39)
  aiAskPick: (id) => aiAsk('pick', id),
  aiAskNone: () => aiAsk('none'),
  aiAskContinue: () => aiAsk('continue'),
  aiAskSkip: () => aiAsk('skip'),
  aiAskOpen: () => aiAsk('open'),
  // Radar: For You and Explore all trends (D43); which one opens first follows the career goal (D46).
  radarTab: (tab) => {
    setRadar({ tab: tab === 'ex' ? 'ex' : 'fy', open: null })
    if (tab !== 'ex' && !radarUi().aiTasks) loadAiTasks()
  },
  viewAll: (tab) => setRadar({ all: { ...radarUi().all, [tab]: !radarUi().all?.[tab] } }),
  radarMode: (mode) => setRadar({ mode: mode === 'share' ? 'share' : 'count' }),
  // Skills card: how many corners, and a corner or list number picked (highlights its row and scrolls to it).
  skCorners: (n) => setRadar({ corners: { ai: 8, ...radarUi().corners, sk: n === 'all' ? 'all' : [8, 16, 30].includes(Number(n)) ? Number(n) : 8 } }),
  // AI tasks card: which job, how many corners, and a corner picked (highlights its row and scrolls to it).
  aiJob: (i) => setRadar({ aiJob: Math.max(0, Number(i) || 0), aiHl: null, pages: withPage(radarUi().pages, 'ai', 1) }),
  aiCorners: (n) => setRadar({ corners: { sk: 8, ...radarUi().corners, ai: n === 'all' ? 'all' : [8, 16].includes(Number(n)) ? Number(n) : 8 } }),
  // A corner opens the page of its row (10 rows a page; the list is whole again for the skills list), then highlights it.
  aiCorner: (n) => {
    setRadar({ aiHl: Number(n), pages: withPage(radarUi().pages, 'ai', pageForRow(n)) })
    document.getElementById(`rd-ai-${Number(n)}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
  skCorner: (n) => {
    setRadar({ hl: Number(n), q: '', pages: withPage(radarUi().pages, 'sk', pageForRow(n)) })
    document.getElementById(`rd-sk-${Number(n)}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
  // A page of a long list: "<list>:<page>" (list = sk | ai | skDrop). The screen shows the last page when past it.
  rdPage: (arg) => {
    const got = parsePageArg(arg)
    if (!got) return
    setRadar({ pages: withPage(radarUi().pages, got.list, got.page), openDrop: got.list === 'skDrop' })
    document.querySelector(`.rd-pager [data-arg^="${got.list}:"][aria-current="page"]`)?.focus()
  },
  // The "Go to page" box of one list.
  rdPageGo: (list) => {
    if (!parsePageList(list)) return
    const page = Number.parseInt(document.getElementById(`rdGo-${list}`)?.value ?? '', 10)
    if (Number.isFinite(page) && page >= 1) actions.rdPage(`${list}:${Math.min(page, 999999)}`)
  },
  radarLine: (axisId) => {
    const hidden = new Set(radarUi().hidden ?? [])
    if (hidden.has(axisId)) hidden.delete(axisId)
    else hidden.add(axisId)
    setRadar({ hidden: [...hidden] })
  },
  axis: (axisId) => {
    const axis = radarUi().data?.ai?.axes?.find((a) => a.axisId === axisId)
    openEvidence('axis', axisId, axis?.signal?.signalId)
  },
  group: (code) => {
    const group = radarUi().data?.occ?.groups?.find((g) => g.code === code)
    openEvidence('group', code, group?.signal?.signalId)
  },
  evClose: () => {
    const open = radarUi().open
    setRadar({ open: null, signal: null })
    if (open) document.querySelector(`[data-act="${open.kind}"][data-arg="${CSS.escape(open.id)}"]`)?.focus()
  },
  // A newer manifest, or the one shown is gone: load the active one afresh.
  reloadManifest: () => {
    state.radar = { ...radarUi(), data: null, open: null, signal: null, newerManifestId: null, gone: false, error: null }
    loadRadar()
    render()
  },
  lang: (lang) => { state.lang = lang; if (state.profile) state.profile.interfaceLanguage = lang; persist(); render() },
  // Landing page links scroll within the page (a #hash would be read as a screen).
  scrollTo: (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  // Start the ATM again from the waiting machine, at the top of the page.
  replayIntro: () => {
    stage?.dispose()
    stage = null
    window.scrollTo(0, 0)
    render()
  },
  use: (kind) => { state.use = kind; go('access') },
  // An organisation needs an account: no guest way in.
  guest: () => { if (state.use === 'org') return go('access'); state.access = 'guest'; go(afterAccess()) },
  // The goal from the start of the journey is the profile's career goal (the form can change it).
  goal: (value) => {
    state.profile ??= emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
    state.profile = setField(state.profile, 'preferences.careerGoal', val(value))
    go('source')
  },
  acSignup: () => accountCall('signup'),
  acLogin: () => accountCall('login'),
  acLogout: async () => {
    await accountApi.logout()
    // A shared computer must not show the next person this account's profile.
    store.clear()
    orgView.clearJoin()
    state = { ...fresh(), lang: state.lang, account: { status: 'none', user: null } }
    cvFile = null
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
    orgView.clearJoin()
    state = { ...fresh(), lang: state.lang, account: { status: 'none', user: null, message: { kind: 'ok', text: t('acDeleted') } } }
    go('access')
  },
  // "Who are you?" is for organisations (C, D): their tools need an account.
  category: (k) => {
    state.category = k
    const entry = orgEntry(state)
    state.accessNote = entry.note
    go(entry.screen)
  },
  resume: () => {
    const to = resumeTo ?? 'source'
    resumeTo = null
    go(to)
  },
  // A field answered with buttons ("path|value"); an empty value is "prefer not to say".
  choose: (arg) => {
    const [path, value] = arg.split('|')
    update(setField(state.profile, path, value ? val(value) : DECLINED))
  },
  // Skill level toggle bar: "<skill index>|<level>", an empty level = not assessed yet.
  level: (arg) => {
    const [index, value] = arg.split('|')
    const level = value || null
    const skills = state.profile.skills.map((skill, i) => (i !== Number(index) ? skill : {
      ...skill, userConfirmed: true, proficiency: level, proficiencyStatus: level ? 'self_reported' : 'not_assessed',
    }))
    update({ ...state.profile, skills })
  },
  startNew: () => {
    if (!confirm(t('backNewConfirm'))) return
    resumeTo = null
    orgView.clearJoin()
    state = { ...fresh(), lang: state.lang }
    go('access')
  },
  theme: () => {
    theme = toggleTheme(theme)
    saveTheme(safeLocalStorage(), theme)
    render()
  },
  reset: () => {
    if (!confirm(t('backDeleteConfirm'))) return
    store.clear()
    orgView.clearJoin()
    resumeTo = null
    state = { ...fresh(), lang: state.lang }
    go('welcome')
  },
  section: (i) => { state.section = Number(i); showSection(); persist(); render(); window.scrollTo(0, 0) },
  addRec: (listPath) => {
    // A new project opens in its card's Edit view, where its title is typed.
    if (listPath === 'projects') state.groupEdit = `project|${state.profile.projects.length}`
    update(addRecord(state.profile, listPath, { ...NEW_RECORD[listPath] }))
  },
  delRec: (arg) => {
    const [listPath, i] = arg.split('|')
    let profile = removeRecord(state.profile, listPath, Number(i))
    // The skills of a removed job or project go to Others (unless another one has the same title).
    const kind = { 'employment.records': 'job', projects: 'project' }[listPath]
    if (kind) {
      const title = kind === 'job' ? state.profile.employment.records[Number(i)]?.jobTitle : state.profile.projects[Number(i)]?.title
      const stays = groupsOf(profile).some((g) => g.kind === kind && g.title.trim().toLowerCase() === String(title ?? '').trim().toLowerCase())
      if (!stays) profile = unlinkPlace(profile, kind, title ?? '')
      state.groupEdit = null
      state.groupAdd = null
    }
    update(profile)
  },
  // Skills and proficiency cards: "Looks right", "Confirm all", Edit, "+ add skill", and taking a skill out of a card.
  groupOk: (key) => update(confirmGroup(state.profile, key)),
  groupOkAll: () => update(groupsOf(state.profile).filter((g) => g.needsCheck).reduce((profile, g) => confirmGroup(profile, g.key), state.profile)),
  groupEdit: (key) => { state.groupEdit = state.groupEdit === key ? null : key; render() },
  otherFold: () => { state.otherOpen = !state.otherOpen; render() },
  groupAdd: (key) => {
    state.groupAdd = state.groupAdd === key ? null : key
    render()
    document.querySelector(`[data-search="skill|gskill|${key}"]`)?.focus()
  },
  unlinkSkill: (arg) => {
    const [i, ...key] = arg.split('|')
    const place = placeOf(state.profile, key.join('|'))
    if (place) update(unlinkSkill(state.profile, Number(i), place))
  },
  review: (arg) => {
    const [path, on] = arg.split('|')
    update(markForReview(state.profile, path, on === 'on'))
  },
  // A skill in the user's own words: normalised by the server (O*NET id, candidates to pick, or unknown).
  // place: the job or project card it was added in ({ kind, title }), or null for Others.
  addSkill: async (typed, place = null) => {
    const text = String(typed ?? '').trim()
    if (!text) return
    const out = await api('POST', '/api/skills/normalize', { texts: [text] })
    // Without the server the skill is kept as typed (unknown), never guessed.
    const found = out.ok ? out.data.skills[0] : { name: text, canonicalId: null, category: null, originalText: text, candidates: [] }
    const profile = linkSkill(state.profile, found, place)
    if (profile === state.profile) return render()
    update(profile)
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
    if (key === 'skill' || key.startsWith('gskill|')) {
      const place = key === 'skill' ? null : placeOf(state.profile, key.slice('gskill|'.length))
      state.groupAdd = null
      // A skill added to Other skills opens the fold, so the user sees it.
      if (!place) state.otherOpen = true
      const profile = linkSkill(state.profile, { name: chosen.name, canonicalId: chosen.id, category: chosen.category }, place)
      return profile === state.profile ? render() : update(profile)
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
    if (key === 'skill') {
      state.otherOpen = true
      return actions.addSkill(term)
    }
    if (key.startsWith('gskill|')) {
      state.groupAdd = null
      return actions.addSkill(term, placeOf(state.profile, key.slice('gskill|'.length)))
    }
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
  editSkills: () => { state.section = SKILLS_SECTION; go('form') },
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
    // Certificates, training and projects found in the CV are left out: the profile does not ask for them.
    // The field of study is prechosen from the CV words, for the user to check (owner, 31 Oct).
    const draft = await prechooseFields(dropNotAsked(out.data.profile), searchFields)
    state.profile = mergeDraft(state.profile, draft)
    state.cvSession = true
    state.extractionId = out.data.extractionId
    state.cv = { phase: 'ready', language: out.data.language, langAnswered: false, warnings: out.data.warnings ?? [] }
    persist()
    render()
  },
  cvRetry: () => (cvFile ? actions.cvFile(cvFile) : actions.cvReset()),
  cvReset: () => { cvFile = null; state.cv = null; render() },
  cvKeepLang: () => { state.cv.langAnswered = true; persist(); render() },
  cvSwitchLang: (lang) => { state.cv.langAnswered = true; actions.lang(lang) },
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

// Organisation view (HR and career centres): its actions live in orgActions.js; the proxy keeps them on the current state.
const orgState = new Proxy({}, { get: (_, key) => state[key], set: (_, key, value) => { state[key] = value; return true } })
const orgView = createOrgActions({ state: orgState, render, api: orgApi, t, go })
Object.assign(actions, adminActions, matchActions, pathwayActions, newsActions, orgView.actions)

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
    return go(orgView.joinPending() ? 'share' : 'summary')
  }
  go(orgView.joinPending() ? 'share' : afterAccess())
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
    let profile = state.profile
    // The first job is on screen before it exists: typing in it creates it.
    if (listPath === 'employment.records' && Number(i) >= profile.employment.records.length) profile = addRecord(profile, listPath, { ...NEW_RECORD[listPath] })
    // A job or project renamed keeps the skills listed under it.
    if (listPath === 'employment.records' && key === 'jobTitle') profile = renamePlace(profile, 'job', profile.employment.records[Number(i)]?.jobTitle ?? '', target.value)
    if (listPath === 'projects' && key === 'title') profile = renamePlace(profile, 'project', profile.projects[Number(i)]?.title ?? '', target.value)
    return update(setField(profile, `${listPath}.${i}.${key}`, key === 'years' ? toYears(target.value) : target.value))
  }
  if (d.aiuse !== undefined) {
    return update({ ...state.profile, aiUse: { ...readAiUse(state.profile), [d.aiuse]: target.value || null } })
  }
  // A field of study chosen in the dropdown (ISCED-F 2013); "Choose a field" unlinks it and keeps the words.
  if (d.fieldPick !== undefined) {
    const i = Number(d.fieldPick)
    const chosen = state.fields?.fields?.find((f) => f.code === target.value)
    if (!chosen) return update(setField(state.profile, `education.records.${i}.field`, null))
    const field = { source: 'isced', code: chosen.code, title: chosen.title, version: state.fields.version, via: 'list' }
    return update(setField(setField(state.profile, `education.records.${i}.fieldOfStudy`, chosen.title), `education.records.${i}.field`, field))
  }
}

// The ATM stage, the landing page's first section (three.js, loaded only here). The ATM waits for a click, then
// prints the question section on a receipt that stays pinned; the section's headline and buttons then rise in beside
// it (the section carries the step as data-phase). The page is redrawn on every change, so the stage element lives on
// and is moved into each new drawing; a language change rebuilds it at the same step. With "reduce motion", without
// WebGL, or if three.js fails to load, the section shows the headline beside an HTML receipt instead (body.no-intro).
let stage = null
let stageAllowed = null
function canShowStage() {
  if (stageAllowed === null) {
    let webgl = false
    try { webgl = Boolean(document.createElement('canvas').getContext('webgl2')) } catch { webgl = false }
    stageAllowed = shouldPlayIntro({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, webgl })
  }
  return stageAllowed
}

function placeStage() {
  const slot = document.querySelector('.lp-atm-canvas')
  if (!slot) return
  if (!canShowStage()) return document.body.classList.add('no-intro')
  if (stage && stage.lang !== state.lang) {
    const pinned = !['arrive', 'idle'].includes(stage.el.dataset.phase)
    stage.dispose()
    stage = null
    return buildStage(slot, pinned)
  }
  if (!stage) return buildStage(slot, false)
  slot.append(stage.el)
  setPhase(stage.el, stage.el.dataset.phase)
}

const setPhase = (el, phase) => {
  el.dataset.phase = phase
  const section = el.closest('.lp-atm')
  if (section) section.dataset.phase = phase
}

function buildStage(slot, pinned) {
  const el = document.createElement('div')
  el.className = 'atm-stage'
  el.innerHTML = `<button class="atm-cta">${esc(t('introPress'))} <span aria-hidden="true">↵</span></button>`
    + `<button class="atm-skip">${esc(t('introSkip'))} →</button>`
    + `<button class="atm-replay">↺ ${esc(t('introReplay'))}</button>`
  slot.append(el)
  setPhase(el, pinned ? 'pinned' : 'arrive')
  const current = { el, lang: state.lang, controls: null, wantPrint: false }
  current.dispose = () => { current.controls?.dispose(); el.remove() }
  stage = current
  el.addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (button?.classList.contains('atm-skip')) return current.controls?.skip()
    if (button?.classList.contains('atm-replay')) return actions.replayIntro()
    if (!['arrive', 'idle'].includes(el.dataset.phase)) return
    if (current.controls) current.controls.print()
    else current.wantPrint = true
  })
  import('./intro/atmIntro.js')
    .then((intro) => intro.mountStage({ t, host: el, pinned, onPhase: (phase) => setPhase(el, phase) }))
    .then((controls) => {
      if (stage !== current) return controls.dispose()
      current.controls = controls
      if (current.wantPrint) controls.print()
    })
    .catch(() => {
      stageAllowed = false
      current.dispose()
      if (stage === current) stage = null
      document.body.classList.add('no-intro')
    })
}

// The gap section (second section) animates its bars when it first comes into view.
let gapSeen = false
let gapWatch = null
function watchGap() {
  const section = document.getElementById('gap')
  gapWatch?.disconnect()
  if (!section) return
  if (gapSeen) return section.classList.add('in')
  gapWatch = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    gapSeen = true
    section.classList.add('in')
    gapWatch.disconnect()
  }, { threshold: 0.3 })
  gapWatch.observe(section)
}

function render() {
  // A profile screen opened directly (link, reload) still gets a profile to work on.
  if (NEEDS_PROFILE.includes(state.screen) && !state.profile) state.profile = emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
  document.documentElement.lang = state.lang
  document.getElementById('langSel').value = state.lang
  document.documentElement.dataset.theme = theme
  document.getElementById('themeBtn').textContent = t(theme === 'dark' ? 'themeToLight' : 'themeToDark')
  const screen = state.screen
  const tabs = TABS.includes(screen)
    ? `<div class="tabs">${TABS.map((id) => `<button class="${screen === id ? 'on' : ''}" data-go="${id}">${esc(t(id))}</button>`).join('')}</div>`
    : ''
  if (screen === 'radar') ensureRadar()
  if (screen === 'admin' || screen === 'judge') ensureAdmin(screen)
  if (screen === 'match' || screen === 'sdg') ensureMatch()
  if (screen === 'pathway') ensurePathway()
  if (screen === 'futures') ensureNews()
  if (screen === 'org') actions.orgEnsure()
  if (screen === 'share') actions.shareEnsure()
  let view
  if (screen === 'radar') view = radarScreen({ t, state })
  else if (screen === 'match') view = matchScreen({ t, state })
  else if (screen === 'sdg') view = sdgScreen({ t, state })
  else if (screen === 'pathway') view = pathwayScreen({ t, state })
  else if (screen === 'futures') view = futuresView({ t, state })
  else if (screen === 'admin') view = adminView({ t, state, data: state.radarAdmin?.data ?? null })
  else if (screen === 'judge') view = judgeView({ t, state, data: { report: state.radarAdmin?.report ?? null } })
  const page = view !== undefined || NEXT.includes(screen) ? null : SCREENS[screen] ?? welcome
  if (view === undefined) view = page ? page({ t, state }) : nextModule({ t, state, screen })
  // The landing page brings its own navigation and full-width layout; its first section is the ATM stage.
  document.body.classList.toggle('landing', page === welcome)
  // A re-render while the key box is being filled (e.g. a late /api/health answer) keeps what was typed and the focus;
  // the key is carried over from the old box to the new one only, never through the state.
  const typing = ['admKey', 'admLabel'].map((id) => document.getElementById(id)).filter((box) => box?.value)
  const carried = typing.map((box) => [box.id, box.value, document.activeElement === box])
  document.getElementById('main').innerHTML = tabs + view
  for (const [id, value, focused] of carried) {
    const box = document.getElementById(id)
    if (!box) continue
    box.value = value
    if (focused) box.focus()
  }
  carried.length = 0
  // Admin and judge screens: focus moves to what the last action changed (a message, the report, a field to fix).
  const focus = state.radarAdmin?.focus
  if (focus) {
    state.radarAdmin.focus = null
    document.getElementById(focus)?.focus()
  }
  if (page === welcome) {
    placeStage()
    watchGap()
    armOdometers(document.getElementById('main'), { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })
  }
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
// Forms marked data-form (the Radar key box): Enter or the submit button runs the action; the page never reloads.
document.addEventListener('submit', (event) => {
  const form = event.target.closest?.('[data-form]')
  if (!form) return
  event.preventDefault()
  actions[form.dataset.form]?.(form.dataset.arg)
})
document.addEventListener('change', (event) => {
  if (event.target.id === 'langSel') return actions.lang(event.target.value)
  if (event.target.id === 'mtSdgFilter') return actions.mFilter(event.target.value)
  if (event.target.hasAttribute?.('data-radar-aijob')) return actions.aiJob(event.target.value)
  if (event.target.id === 'cvFile') return event.target.files[0] && actions.cvFile(event.target.files[0])
  if (orgView.onChange(event.target)) return
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
  // Radar skills card: the search box filters the list as you type; focus and caret come back after the redraw.
  if (event.target.hasAttribute?.('data-radar-search')) {
    if (event.isComposing) return // wait for compositionend (pinyin and other input methods)
    const pos = event.target.selectionStart ?? event.target.value.length
    setRadar({ q: event.target.value, pages: withPage(radarUi().pages, 'sk', 1) })
    return keepCaret(pos)
  }
  const search = event.target.dataset?.search
  if (!search) return
  const [kind, ...rest] = search.split('|')
  const key = rest.join('|')
  state.pick ??= {}
  clearTimeout(searchTimers[key])
  searchTimers[key] = setTimeout(() => runSearch(kind, key, event.target.value), SEARCH_DELAY_MS)
})
document.addEventListener('compositionend', (event) => {
  if (!event.target.hasAttribute?.('data-radar-search')) return
  setRadar({ q: event.target.value, pages: withPage(radarUi().pages, 'sk', 1) })
  keepCaret(event.target.selectionStart ?? event.target.value.length)
})
document.addEventListener('keydown', (event) => {
  // Radar: chart points are keyboard buttons (role="button"); Escape closes the evidence panel.
  const role = event.target.getAttribute?.('role')
  if ((event.key === 'Enter' || event.key === ' ') && role === 'button' && event.target.dataset?.act && event.target.tagName !== 'BUTTON') {
    event.preventDefault()
    return actions[event.target.dataset.act]?.(event.target.dataset.arg)
  }
  if (event.key === 'Escape' && state.radar?.open) return actions.evClose()
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
window.addEventListener('popstate', () => {
  state.screen = screenOf(location.hash.slice(1) || 'welcome')
  // #roadmap opens #pathway: the address shows the new name.
  if (location.hash === '#roadmap') history.replaceState(null, '', '#pathway')
  render()
})

// Boot: a saved guest session past the start screens gets the "Welcome back" choice.
const previous = store.load()
if (previous) {
  state = { ...fresh(), ...previous }
  if (state.profile) state.profile = mergeCareerFields(state.profile)
  saved = true
}
if (state.section >= SECTIONS.length) state.section = 0
showSection()
if (resumeChoice(previous) === 'ask') resumeTo = screenOf(previous.screen)
// A join link (#join=<token>) is read once, kept in memory only and removed from the address bar at once.
const joinToken = consumeJoinHash(location, history)
if (joinToken) orgView.startJoin(joinToken)
state.screen = joinToken ? 'share' : screenOf(startScreen(previous, location.hash))
// #roadmap opens #pathway: the address shows the new name.
if (location.hash === '#roadmap') history.replaceState(null, '', '#pathway')
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
