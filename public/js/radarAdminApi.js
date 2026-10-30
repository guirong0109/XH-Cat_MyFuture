// Calls to the Radar admin and judge API (spec §8, §9, §13). Sign-in sends the key once; the server answers with an
// HttpOnly session cookie (kept by the browser, never readable here) and a CSRF token. The token lives only in this
// module's memory: it is never put in the app state, the guest store or any browser storage, and it is gone after a
// reload (then the user signs in again). Every request that changes something sends it as X-Radar-CSRF.
// Every call returns { ok:true, data } or { ok:false, code, retryable, errors?, result? }.

const webLink = (url) => {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && url.length <= 500
  } catch {
    return false
  }
}

const RELEASE_PATTERN = /^\d{2}\.\d$/ // same as server/radar/sources/onetSkills.js

export function createRadarAdminApi({ base = '', fetchImpl = (...args) => fetch(...args) } = {}) {
  // { role, expiresAt, csrf } in memory only; session() hands out a copy without the token.
  let current = null

  async function call(method, route, body) {
    const headers = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (method !== 'GET' && current?.csrf) headers['X-Radar-CSRF'] = current.csrf
    let response
    try {
      response = await fetchImpl(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch {
      return { ok: false, code: 'network', retryable: true }
    }
    const data = await response.json().catch(() => null)
    if (response.ok) return { ok: true, data }
    const error = data?.error
    if (!error?.code) return { ok: false, code: 'server_error', retryable: true }
    // A session the server no longer accepts (expired, signed out elsewhere, key rotated) ends here too.
    if (error.code === 'not_allowed' && response.status === 401) current = null
    if (error.code === 'demo_expired') current = null
    return {
      ok: false,
      code: error.code,
      retryable: Boolean(error.retryable),
      ...(Array.isArray(data.errors) ? { errors: data.errors } : {}),
      ...(data.result ? { result: data.result } : {}),
    }
  }

  const needNote = (note) => typeof note !== 'string' || note.trim() === ''

  return {
    session: () => (current ? { role: current.role, expiresAt: current.expiresAt } : null),

    // The key is sent once and not kept anywhere; only role, expiry and the token are remembered (memory only).
    async signIn(role, key, { label } = {}) {
      current = null
      const body = { role, key }
      if (typeof label === 'string' && label.trim()) body.label = label.trim()
      const out = await call('POST', '/api/radar/session', body)
      if (!out.ok) return out
      current = { role: out.data.role, expiresAt: out.data.expiresAt, csrf: out.data.csrf }
      return { ok: true, data: { role: current.role, expiresAt: current.expiresAt } }
    },

    async signOut() {
      const out = current ? await call('POST', '/api/radar/logout') : { ok: true, data: null }
      current = null
      return out
    },

    // ---- admin ----
    status: () => call('GET', '/api/admin/radar/status'),
    mappings: () => call('GET', '/api/admin/radar/mappings'),
    breaks: () => call('GET', '/api/admin/radar/breaks'),
    sdgLinks: () => call('GET', '/api/admin/matching/sdg-links'),
    exportJson: () => call('GET', '/api/admin/radar/export'),
    // onet-skills sends {release} (checked here too: two digits, a dot, one digit); the others send no body.
    refresh(source, { release } = {}) {
      const bad = Promise.resolve({ ok: false, code: 'bad_request', retryable: false })
      if (source === 'openalex' || source === 'dosm' || source === 'onet-hottech') return call('POST', `/api/admin/radar/refresh/${source}`)
      if (source === 'onet-skills') return RELEASE_PATTERN.test(String(release ?? '')) ? call('POST', '/api/admin/radar/refresh/onet-skills', { release }) : bad
      return bad
    },
    cleanup: () => call('POST', '/api/admin/radar/cleanup'),

    // Every decision needs a reviewer note (refused here, before anything is sent).
    async decideMapping({ mappingId, decision, note }) {
      if (needNote(note)) return { ok: false, code: 'note_required', retryable: false }
      return call('POST', '/api/admin/radar/mappings', { mappingId, decision, note: note.trim(), evidence: [] })
    },

    // Owner decision on one SDG team-draft link (career matching); a note is required here as for mappings.
    async decideSdgLink({ id, decision, note }) {
      if (needNote(note)) return { ok: false, code: 'note_required', retryable: false }
      return call('POST', '/api/admin/matching/sdg-links', { id, decision, note: note.trim() })
    },

    // brk: the flagged break as listed (period, observationHash, releaseLinks). Evidence: the DOSM release page and the
    // release listing of that quarter as the server built them (GET /api/admin/radar/breaks), plus the reviewer's own
    // link (http/https only).
    async decideBreak({ brk, decision, note, link = '' }) {
      if (needNote(note)) return { ok: false, code: 'note_required', retryable: false }
      const extra = String(link ?? '').trim()
      if (extra && !webLink(extra)) return { ok: false, code: 'bad_link', retryable: false }
      const release = [brk?.releaseLinks?.page, brk?.releaseLinks?.listing].filter((url) => typeof url === 'string' && webLink(url))
      const evidence = [...release, ...(extra ? [extra] : [])]
      return call('POST', '/api/admin/radar/breaks', { period: brk?.period, observationHash: brk?.observationHash, decision, note: note.trim(), evidence })
    },

    // ---- judge ----
    diff: () => call('GET', '/api/demo/radar/diff'),
    apply: (change) => call('POST', '/api/demo/radar/apply', change),
    reset: () => call('POST', '/api/demo/radar/reset'),
  }
}

// The app's instance (same origin; the browser keeps the cookie).
export const radarAdminApi = createRadarAdminApi()
