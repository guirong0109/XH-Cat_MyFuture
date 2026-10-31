// Calls to the Study Pathway API (spec §8). The profile is sent to work out one role's pathway; the server uses it for
// that answer and drops it (never stored, never logged).
//   get(profile, code) -> POST /api/pathway -> study route, skill steps, picks, search links, sources
// Returns { ok:true, data } or { ok:false, code, retryable } (an unknown role code -> code 'not_found').
import { api } from './api.js'

export async function get(profile, code, { base = '', lang } = {}) {
  const out = await api('POST', `${base}/api/pathway`, { profile, code, ...(lang ? { lang } : {}) })
  return out.ok ? { ok: true, data: out.data } : { ok: false, code: out.code, retryable: out.retryable }
}
