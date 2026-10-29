// App state, hash routing, guest saving and one click handler for every screen (buttons use data-go / data-act).
import { t as translate } from '/shared/i18n.js'
import { createGuestStore, resumeChoice } from '/shared/guestStore.js'
import welcome from './screens/welcome.js'
import returning from './screens/returning.js'
import access from './screens/access.js'
import category from './screens/category.js'
import org from './screens/org.js'
import source from './screens/source.js'
import upload from './screens/upload.js'
import form from './screens/form.js'
import review from './screens/review.js'
import summary from './screens/summary.js'
import nextModule from './screens/nextModule.js'
import { esc } from './ui.js'

const SCREENS = { welcome, returning, access, category, org, source, upload, form, review, summary }
const NEXT = ['assess', 'radar', 'match', 'roadmap', 'sdg', 'futures']
const TABS = ['summary', ...NEXT]

const fresh = () => ({ screen: 'welcome', lang: 'en', access: null, category: null, profile: null })
const store = createGuestStore()
let state = fresh()
let resumeTo = null
let saved = false
const t = (key, vars) => translate(state.lang, key, vars)

function persist() {
  saved = store.save(state)
}

function go(screen) {
  state.screen = screen
  if (location.hash !== `#${screen}`) history.pushState(null, '', `#${screen}`)
  persist()
  render()
  window.scrollTo(0, 0)
}

const actions = {
  lang: (lang) => { state.lang = lang; persist(); render() },
  guest: () => { state.access = 'guest'; go('category') },
  accountSoon: () => {},
  category: (k) => { state.category = k; go(k === 'C' || k === 'D' ? 'org' : 'source') },
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
}

function render() {
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
document.getElementById('langSel').addEventListener('change', (event) => actions.lang(event.target.value))
window.addEventListener('popstate', () => { state.screen = location.hash.slice(1) || 'welcome'; render() })

// Boot: a saved guest session past the start screens gets the "Welcome back" choice.
const previous = store.load()
if (previous) {
  state = { ...fresh(), ...previous }
  saved = true
}
if (resumeChoice(previous) === 'ask') {
  resumeTo = previous.screen
  state.screen = 'returning'
} else if (location.hash) {
  state.screen = location.hash.slice(1)
}
render()
