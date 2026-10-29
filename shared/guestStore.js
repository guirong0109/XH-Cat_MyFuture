// A guest's progress, kept only in this browser. Storage can be missing or refuse (private mode, quota): then
// nothing is saved and the app still works. The profile is minimized before saving (no raw CV, no CV quotes).
const KEY = 'futureready-profile-v1'
// Screens before any profile work: nothing worth resuming yet.
const START = ['welcome', 'returning', 'access']

export function createGuestStore(storage = globalThis.localStorage, minimize = (profile) => profile) {
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    save(state) {
      try {
        if (!storage) return false
        const saved = state.profile ? { ...state, profile: minimize(state.profile) } : state
        storage.setItem(KEY, JSON.stringify(saved))
        return true
      } catch {
        return false
      }
    },
    clear() {
      try {
        storage?.removeItem(KEY)
      } catch {
        // nothing was saved, nothing to clear
      }
    },
  }
}

export function resumeChoice(saved) {
  return saved && saved.screen && !START.includes(saved.screen) ? 'ask' : 'fresh'
}
