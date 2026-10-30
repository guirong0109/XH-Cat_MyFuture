// Calls to the career matching API (spec §8). The profile is sent to work out the matches; the server uses it for that
// answer and drops it (never stored, never logged).
//   list(profile)       -> POST /api/matching       -> every role: Skill Match or why not, bands, SDG goals, sources
//   role(profile, code) -> POST /api/matching/role  -> one role's detail: fit rows, chain path, outlook parts, SDG tags
// Both return { ok:true, data } or { ok:false, code, retryable }.
import { api } from './api.js'

async function post(url, body) {
  const out = await api('POST', url, body)
  return out.ok ? { ok: true, data: out.data } : { ok: false, code: out.code, retryable: out.retryable }
}

export const list = (profile, { base = '', lang } = {}) => post(`${base}/api/matching`, { profile, ...(lang ? { lang } : {}) })

export const role = (profile, code, { base = '', lang } = {}) => post(`${base}/api/matching/role`, { profile, code, ...(lang ? { lang } : {}) })
