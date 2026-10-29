// Account calls. The session lives in an HttpOnly cookie the page never sees.
import { api } from './api.js'

export const signup = (email, password, language) => api('POST', '/api/auth/signup', { email, password, language })
export const login = (email, password) => api('POST', '/api/auth/login', { email, password })
export const me = () => api('GET', '/api/auth/me')
export const logout = () => api('POST', '/api/auth/logout')
export const deleteMyData = () => api('DELETE', '/api/auth/me')

// Fields the server keeps for itself; everything else in the profile can be sent as a change.
const SERVER_FIELDS = ['profileId', 'profileVersion', 'profileStatus']

// Saves on this device first (guestStore.save), then to the account: POST the first time, then PATCH with the version
// it was loaded or last saved at. → api() result plus where: 'account' | 'device'.
export async function saveProfile(profile, { guestStore, extractionId = null }) {
  guestStore.save(profile)
  const out = profile.profileId
    ? await api('PATCH', `/api/profiles/${encodeURIComponent(profile.profileId)}`, {
        version: profile.profileVersion,
        changes: Object.fromEntries(Object.entries(profile).filter(([key]) => !SERVER_FIELDS.includes(key))),
      })
    : await api('POST', '/api/profiles', extractionId ? { profile, extractionId } : { profile })
  return { ...out, where: out.ok ? 'account' : 'device' }
}

// One saved profile: { id, version, profile }.
export const loadProfile = (id) => api('GET', `/api/profiles/${encodeURIComponent(id)}`)

// The most recently saved profile of the signed-in user: { id, version, profile } or null.
export async function loadLatestProfile() {
  const list = await api('GET', '/api/profiles')
  if (!list.ok) return list
  const latest = list.data.profiles[0]
  return latest ? loadProfile(latest.id) : { ok: true, data: null }
}
