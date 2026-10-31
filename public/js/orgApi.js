// Organisation calls (owner side). The session lives in an HttpOnly cookie. Every call returns { ok:true, data } or
// { ok:false, code, retryable }, like api.js. The roster goes to the server as text/csv and is never kept here.
import { api } from './api.js'

const enc = encodeURIComponent

// Same result shape as api(), for the one call that sends text/csv instead of JSON.
async function csv(url, body) {
  let response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body })
  } catch {
    return { ok: false, code: 'network', retryable: true }
  }
  const data = await response.json().catch(() => null)
  if (response.ok) return { ok: true, data }
  const error = data?.error
  return error?.code ? { ok: false, code: error.code, retryable: Boolean(error.retryable) } : { ok: false, code: 'server_error', retryable: true }
}

export const getOrg = () => api('GET', '/api/org')
export const createOrg = (name, type) => api('POST', '/api/org', { name, type })
export const renameOrg = (name) => api('PATCH', '/api/org', { name })
export const deleteOrg = () => api('DELETE', '/api/org')

export const addGroup = (name, targetCode = null) => api('POST', '/api/org/groups', { name, targetCode })
export const updateGroup = (id, patch) => api('PATCH', `/api/org/groups/${enc(id)}`, patch)
export const deleteGroup = (id) => api('DELETE', `/api/org/groups/${enc(id)}`)

export const previewRoster = (text) => csv('/api/org/roster/preview', text)
export const importRoster = (previewId) => api('POST', '/api/org/roster/import', { previewId })
// The made-up sample roster (HR only) as text, to be checked like any uploaded file.
export async function sampleRoster(type) {
  let response
  try {
    response = await fetch(`/api/org/roster/sample?type=${enc(type)}`)
  } catch {
    return { ok: false, code: 'network', retryable: true }
  }
  return response.ok ? { ok: true, data: await response.text() } : { ok: false, code: 'not_found', retryable: false }
}

export const updatePerson = (id, patch) => api('PATCH', `/api/org/people/${enc(id)}`, patch)
export const deletePerson = (id) => api('DELETE', `/api/org/people/${enc(id)}`)

export const team = (view, scenario) => api('GET', `/api/org/team?view=${enc(view)}&scenario=${enc(scenario)}`)
export const setPlanStep = ({ groupId, roleCode, itemKey, status }) => api('PUT', '/api/org/plan-steps', { groupId, roleCode, itemKey, status })

export const invite = (groupId, currentCode = null) => api('POST', '/api/org/invites', currentCode ? { groupId, currentCode } : { groupId })

// eMASCO roles for a target role or a current role: the usual role search, only the eMASCO answers kept.
export async function searchRoles(term) {
  const out = await api('GET', `/api/occupations/search?q=${enc(term)}`)
  if (!out.ok) return out
  return { ok: true, data: (out.data?.candidates ?? []).filter((c) => c.source === 'emasco') }
}
