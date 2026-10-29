// App state, hash routing, guest saving and one event handler for every screen.
// Buttons use data-go / data-act; form controls use data-field, data-decline, data-list, data-rec, data-level.
import { t as translate } from '/shared/i18n.js'
import { createGuestStore, resumeChoice } from '/shared/guestStore.js'
import { DECLINED, EMPTY, emptyProfile, makeSkill, val, validateProfile } from '/shared/profileSchema.js'
import { addRecord, confirmProfile, markForReview, minimizeForGuest, removeRecord, setField } from '/shared/profileState.js'
import { afterConfirm } from '/shared/flow.js'
import welcome from './screens/welcome.js'
import returning from './screens/returning.js'
import access from './screens/access.js'
import category from './screens/category.js'
import org from './screens/org.js'
import source from './screens/source.js'
import upload from './screens/upload.js'
import form, { SECTIONS } from './screens/form.js'
import review from './screens/review.js'
import summary from './screens/summary.js'
import nextModule from './screens/nextModule.js'
import { esc } from './ui.js'
import { api } from './api.js'

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

const fresh = () => ({ screen: 'welcome', lang: 'en', access: null, category: null, profile: null, section: 0, usable: false, message: null })
const store = createGuestStore(globalThis.localStorage, minimizeForGuest)
let state = fresh()
let resumeTo = null
let saved = false
const t = (key, vars) => translate(state.lang, key, vars)

function persist() {
  // occupation search results are only shown, never saved
  saved = store.save({ ...state, message: null, occ: {}, occBusy: null })
}

function go(screen) {
  if (NEEDS_PROFILE.includes(screen) && !state.profile) state.profile = emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
  state.screen = screen
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
  guest: () => { state.access = 'guest'; go('category') },
  accountSoon: () => {},
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
  section: (i) => { state.section = Number(i); persist(); render(); window.scrollTo(0, 0) },
  addRec: (listPath) => update(addRecord(state.profile, listPath, { ...NEW_RECORD[listPath] })),
  delRec: (arg) => {
    const [listPath, i] = arg.split('|')
    update(removeRecord(state.profile, listPath, Number(i)))
  },
  review: (arg) => {
    const [path, on] = arg.split('|')
    update(markForReview(state.profile, path, on === 'on'))
  },
  addSkill: async () => {
    const input = document.getElementById('skillInput')
    const text = input?.value.trim()
    if (!text) return
    input.disabled = true
    const out = await api('POST', '/api/skills/normalize', { texts: [text] })
    // Without the server the skill is kept as typed (unknown), never guessed.
    const found = out.ok ? out.data.skills[0] : { name: text, canonicalId: null, category: null, originalText: text, candidates: [] }
    const key = (found.canonicalId ?? found.name).toLowerCase()
    if (state.profile.skills.some((s) => (s.canonicalId ?? s.name).toLowerCase() === key)) return render()
    const skill = { ...makeSkill({ ...found, source: 'user_input' }), ...(found.candidates?.length ? { candidates: found.candidates } : {}) }
    update({ ...state.profile, skills: [...state.profile.skills, skill] })
  },
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
    const term = key === 'interest' ? document.getElementById('occInterest')?.value.trim() ?? '' : state.profile.employment.records[Number(key.split('|')[1])]?.jobTitle ?? ''
    if (key === 'interest') state.occInterest = term
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
    go(next.screen)
  },
}

// Form changes (fired on change, so typing is not interrupted by re-rendering).
function onChange(target) {
  const d = target.dataset
  if (d.field) {
    const raw = target.value
    let value = EMPTY
    if (raw !== '') value = d.kind === 'number' ? (Number.isFinite(Number(raw)) && Number(raw) >= 0 ? val(Number(raw)) : EMPTY) : val(raw)
    return update(setField(state.profile, d.field, value))
  }
  if (d.decline) return update(setField(state.profile, d.decline, target.checked ? DECLINED : EMPTY))
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

function render() {
  // A profile screen opened directly (link, reload) still gets a profile to work on.
  if (NEEDS_PROFILE.includes(state.screen) && !state.profile) state.profile = emptyProfile({ inputMethod: 'manual', interfaceLanguage: state.lang })
  document.documentElement.lang = state.lang
  document.getElementById('langSel').value = state.lang
  const screen = state.screen
  const tabs = TABS.includes(screen)
    ? `<div class="tabs">${TABS.map((id) => `<button class="${screen === id ? 'on' : ''}" data-go="${id}">${esc(t(id))}</button>`).join('')}</div>`
    : ''
  const view = NEXT.includes(screen) ? nextModule({ t, state, screen }) : (SCREENS[screen] ?? welcome)({ t, state })
  document.getElementById('main').innerHTML = tabs + view
  const pill = document.getElementById('savePill')
  pill.className = saved ? 'pill ok' : 'pill'
  pill.textContent = saved ? t('savedLocal') : state.access ? t('storageOff') : t('notSaved')
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-go],[data-act]')
  if (!target) return
  if (target.dataset.go) return go(target.dataset.go)
  actions[target.dataset.act]?.(target.dataset.arg)
})
document.addEventListener('change', (event) => {
  if (event.target.id === 'langSel') return actions.lang(event.target.value)
  onChange(event.target)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.id === 'skillInput') actions.addSkill()
})
window.addEventListener('popstate', () => { state.screen = location.hash.slice(1) || 'welcome'; render() })

// Boot: a saved guest session past the start screens gets the "Welcome back" choice.
const previous = store.load()
if (previous) {
  state = { ...fresh(), ...previous }
  saved = true
}
if (state.section >= SECTIONS.length) state.section = 0
if (resumeChoice(previous) === 'ask') {
  resumeTo = previous.screen
  state.screen = 'returning'
} else if (location.hash) {
  state.screen = location.hash.slice(1)
}
render()
