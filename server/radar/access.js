// Future Skills Radar admin and judge access (spec §8.1). Stateless signed sessions; everything fails closed.
//
// createRadarAccess({env, now}) → {login(role, key, ip, {label}?) → {ok: true, cookie, csrf, session}|{ok: false, code},
//                                  require(role) → express middleware, logout → express handler, configured(role)}
// - Secrets: RADAR_ADMIN_KEY, RADAR_DEMO_KEY, RADAR_SESSION_SECRET (≥ 32 bytes). A missing secret or role key →
//   that role answers not_configured. The same key for both roles is refused for both (one key must not open both).
// - Cookie fr_radar = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, that first part));
//   payload {role, sessionId, issuedAt, expiresAt, keyVersion} (+ an optional admin `label`, the reviewer name);
//   HttpOnly; Secure; SameSite=Strict; Path=/; admin 60 min, demo 120 min.
// - keyVersion = first 8 hex of SHA-256 of the role key: rotating a key ends every session issued under the old one.
// - CSRF: requests that change something need X-Radar-CSRF = HMAC(secret, 'csrf:' + sessionId) and an Origin header
//   whose host equals the request host. GET/HEAD are read-only and rely on the role check and SameSite=Strict.
// - Login: 10 tries per 15 minutes per address (every try counts). Keys are compared in constant time (SHA-256 of both
//   sides, then timingSafeEqual). Keys, cookies and tokens are never logged or returned.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createWindowLimiter } from '../rateLimit.js'
import { sendError } from '../errors.js'

export const COOKIE = 'fr_radar'
export const CSRF_HEADER = 'x-radar-csrf'
const ROLES = Object.freeze({ admin: { keyVar: 'RADAR_ADMIN_KEY', minutes: 60 }, demo: { keyVar: 'RADAR_DEMO_KEY', minutes: 120 } })
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MIN_SECRET_BYTES = 32
const LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/
const SAFE_METHODS = new Set(['GET', 'HEAD'])
const MAX_REVOKED = 10000

const MESSAGES = {
  not_configured: [503, 'Admin and judge access is not set up on this server.', false],
  not_allowed: [401, 'Sign in with a valid key to continue.', false],
  wrong_role: [403, 'This session cannot use this part of the Radar.', false],
  csrf_failed: [403, 'The request could not be verified. Reload the page and try again.', false],
  too_many_attempts: [429, 'Too many sign-in attempts. Please wait and try again.', true],
}

export function sendAccessError(response, code) {
  const [status, message, retryable] = MESSAGES[code] ?? MESSAGES.not_allowed
  return sendError(response, status, code === 'wrong_role' ? 'not_allowed' : code, message, retryable)
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest()
// Constant time for any lengths: both sides are hashed to 32 bytes first.
const sameText = (a, b) => timingSafeEqual(sha256(String(a)), sha256(String(b)))

export function createRadarAccess({ env = process.env, now = () => new Date() } = {}) {
  const secret = typeof env.RADAR_SESSION_SECRET === 'string' ? env.RADAR_SESSION_SECRET : ''
  const secretOk = Buffer.byteLength(secret, 'utf8') >= MIN_SECRET_BYTES
  const isRole = (role) => typeof role === 'string' && Object.hasOwn(ROLES, role)
  const keyOf = (role) => (isRole(role) && typeof env[ROLES[role].keyVar] === 'string' ? env[ROLES[role].keyVar] : '')
  const sharedKey = keyOf('admin') !== '' && keyOf('admin') === keyOf('demo')
  const configured = (role) => isRole(role) && secretOk && keyOf(role) !== '' && !sharedKey
  const keyVersion = (role) => sha256(keyOf(role)).toString('hex').slice(0, 8)
  const mac = (text) => createHmac('sha256', secret).update(text, 'utf8').digest('base64url')
  const csrfFor = (sessionId) => mac(`csrf:${sessionId}`)
  const ms = () => now().getTime()

  const logins = createWindowLimiter({ limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS, now: ms })
  // Sessions ended by logout on this server, until they would have expired anyway.
  const revoked = new Map()
  const prune = () => {
    const t = ms()
    for (const [id, until] of revoked) if (until <= t) revoked.delete(id)
  }

  function login(role, key, ip, { label } = {}) {
    if (!isRole(role)) return { ok: false, code: 'not_allowed' }
    if (!configured(role)) return { ok: false, code: 'not_configured' }
    if (!logins.hit(String(ip ?? 'unknown'))) return { ok: false, code: 'too_many_attempts' }
    if (typeof key !== 'string' || !sameText(key, keyOf(role))) return { ok: false, code: 'not_allowed' }
    const issued = now()
    const session = {
      role,
      sessionId: randomBytes(16).toString('hex'),
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + ROLES[role].minutes * 60000).toISOString(),
      keyVersion: keyVersion(role),
    }
    if (role === 'admin' && typeof label === 'string' && LABEL.test(label.trim())) session.label = label.trim()
    const body = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
    const value = `${body}.${mac(body)}`
    const cookie = `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ROLES[role].minutes * 60}`
    return { ok: true, cookie, csrf: csrfFor(session.sessionId), session }
  }

  // The session in the request's cookie, or {code} saying why there is none.
  function sessionOf(request) {
    if (!secretOk) return { code: 'not_configured' }
    const value = cookieValue(request.headers.cookie)
    if (!value) return { code: 'not_allowed' }
    const dot = value.indexOf('.')
    if (dot <= 0 || dot !== value.lastIndexOf('.')) return { code: 'not_allowed' }
    const body = value.slice(0, dot)
    if (!sameText(value.slice(dot + 1), mac(body))) return { code: 'not_allowed' }
    let session
    try {
      session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
      return { code: 'not_allowed' }
    }
    if (!session || typeof session !== 'object' || !isRole(session.role)) return { code: 'not_allowed' }
    if (!configured(session.role)) return { code: 'not_configured' }
    const expires = Date.parse(session.expiresAt)
    const issued = Date.parse(session.issuedAt)
    if (!Number.isFinite(expires) || !Number.isFinite(issued) || expires <= ms()) return { code: 'not_allowed' }
    if (expires - issued > ROLES[session.role].minutes * 60000) return { code: 'not_allowed' }
    if (session.keyVersion !== keyVersion(session.role)) return { code: 'not_allowed' }
    if (typeof session.sessionId !== 'string' || !/^[0-9a-f]{32}$/.test(session.sessionId)) return { code: 'not_allowed' }
    prune()
    if (revoked.has(session.sessionId)) return { code: 'not_allowed' }
    return { session }
  }

  // Origin must name this host; the CSRF header must be this session's token.
  function csrfOk(request, session) {
    if (!originOk(request)) return false
    const token = request.get(CSRF_HEADER)
    return typeof token === 'string' && token !== '' && sameText(token, csrfFor(session.sessionId))
  }

  function require(role) {
    return (request, response, next) => {
      if (!configured(role)) return sendAccessError(response, 'not_configured')
      const { session, code } = sessionOf(request)
      if (!session) return sendAccessError(response, code === 'not_configured' ? 'not_allowed' : code)
      if (session.role !== role) return sendAccessError(response, 'wrong_role')
      if (!SAFE_METHODS.has(request.method) && !csrfOk(request, session)) return sendAccessError(response, 'csrf_failed')
      request.radarSession = session
      return next()
    }
  }

  // POST /api/radar/logout: needs a valid session (either role) and its CSRF token; always clears the cookie.
  // onEnd(session), when given, runs once the session and token are verified and before the session is revoked (the
  // judge's demo data is wiped there); a failure in it never keeps the session alive.
  async function logout(request, response, { onEnd } = {}) {
    const { session, code } = sessionOf(request)
    if (!session) {
      response.setHeader('Set-Cookie', clearCookie())
      return sendAccessError(response, code)
    }
    if (!csrfOk(request, session)) return sendAccessError(response, 'csrf_failed')
    if (typeof onEnd === 'function') {
      try {
        await onEnd(session)
      } catch {
        // reported by onEnd itself; the sign-out goes ahead
      }
    }
    if (revoked.size >= MAX_REVOKED) prune()
    revoked.set(session.sessionId, Date.parse(session.expiresAt))
    response.setHeader('Set-Cookie', clearCookie())
    return response.json({ ok: true })
  }

  return { login, require, logout, configured, originOk, sessionOf }
}

export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`

// The Origin header's host must equal the host the request was sent to (Express 5 request.host includes the port).
export function originOk(request) {
  const origin = request.get('origin')
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return false
  let host
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  return host !== '' && host === request.host
}

// The first fr_radar value in a Cookie header.
function cookieValue(header) {
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === COOKIE) {
      const value = part.slice(eq + 1).trim()
      return value === '' || value.length > 4096 ? null : value
    }
  }
  return null
}
