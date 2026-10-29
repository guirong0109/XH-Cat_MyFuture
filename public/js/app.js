// App state, hash routing and one click handler for every screen (buttons use data-go / data-act).
import en from '/shared/strings/en.js'
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
const STRINGS = { en }

const state = { screen: 'welcome', lang: 'en', access: null, category: null }
const t = (key) => STRINGS[state.lang]?.[key] ?? en[key] ?? key

function go(screen) {
  state.screen = screen
  if (location.hash !== `#${screen}`) history.pushState(null, '', `#${screen}`)
  render()
  window.scrollTo(0, 0)
}

const actions = {
  lang: (lang) => { state.lang = lang; document.documentElement.lang = lang; render() },
  guest: () => { state.access = 'guest'; go('category') },
  accountSoon: () => {},
  category: (k) => { state.category = k; go(k === 'C' || k === 'D' ? 'org' : 'source') },
  resume: () => go('form'),
  startNew: () => { if (confirm(t('backNewConfirm'))) go('access') },
  reset: () => {
    if (!confirm(t('backDeleteConfirm'))) return
    Object.assign(state, { access: null, category: null })
    go('welcome')
  },
}

function render() {
  document.getElementById('langSel').value = state.lang
  const screen = state.screen
  const tabs = TABS.includes(screen)
    ? `<div class="tabs">${TABS.map((id) => `<button class="${screen === id ? 'on' : ''}" data-go="${id}">${esc(t(id))}</button>`).join('')}</div>`
    : ''
  const view = NEXT.includes(screen) ? nextModule({ t, state, screen }) : (SCREENS[screen] ?? welcome)({ t, state })
  document.getElementById('main').innerHTML = tabs + view
  const pill = document.getElementById('savePill')
  pill.className = 'pill'
  pill.textContent = t('notSaved')
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-go],[data-act]')
  if (!target) return
  if (target.dataset.go) return go(target.dataset.go)
  actions[target.dataset.act]?.(target.dataset.arg)
})
document.getElementById('langSel').addEventListener('change', (event) => actions.lang(event.target.value))
window.addEventListener('popstate', () => { state.screen = location.hash.slice(1) || 'welcome'; render() })

state.screen = location.hash.slice(1) || 'welcome'
render()
