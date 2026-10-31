// Calls to the AI news API (Compare futures, spec §7). No profile is sent: every visitor gets the same lists.
//   load() -> GET /api/news -> { enabled, source, refreshEveryHours, nextRunAt, rules, fields[] }
// Returns { ok:true, data } or { ok:false, code, retryable }.
import { api } from './api.js'

export async function load({ base = '' } = {}) {
  const out = await api('GET', `${base}/api/news`)
  return out.ok ? { ok: true, data: out.data } : { ok: false, code: out.code, retryable: out.retryable }
}
