// Light is the default look; the user can switch to dark and the choice is remembered in this browser.
const KEY = 'futureready-theme'

export function loadTheme(storage) {
  try {
    return storage?.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function saveTheme(storage, theme) {
  try {
    storage?.setItem(KEY, theme)
  } catch {
    // blocked site data: the switch still works for this visit
  }
}

export function toggleTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark'
}
