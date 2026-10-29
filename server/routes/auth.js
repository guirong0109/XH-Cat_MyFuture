// /api/auth/{signup,login,logout,me} and DELETE /api/auth/me. Without D1 every route answers 503 accounts_unavailable.
import express from 'express'
import { AuthError, SESSION_SECONDS } from '../auth.js'
import { jsonBody, sendError } from '../errors.js'

const COOKIE = 'fr_session'
const MESSAGES = {
  bad_email: 'Please enter a valid email address.',
  weak_password: 'The password needs at least 8 characters.',
  email_taken: 'An account with this email already exists.',
  bad_credentials: 'The email or password is not right.',
  too_many_attempts: 'Too many sign-in attempts. Please wait 15 minutes.',
}

export const sessionToken = (request) => {
  for (const part of (request.get('Cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === COOKIE) return value.join('=')
  }
  return null
}
const setSession = (response, token, maxAge = SESSION_SECONDS) =>
  response.set('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`)

function fail(response, error) {
  if (error instanceof AuthError) return sendError(response, error.status, error.code, MESSAGES[error.code] ?? 'Request refused.', error.retryable)
  if (error?.name === 'StoreError') return sendError(response, 503, 'store_unavailable', 'Accounts are not reachable right now.', true)
  throw error
}

// Middleware for routes that need a signed-in user (request.user).
export function makeRequireUser(auth) {
  return async (request, response, next) => {
    if (!auth) return sendError(response, 503, 'accounts_unavailable', 'Accounts are not available on this server.')
    try {
      request.user = await auth.me(sessionToken(request))
    } catch (error) {
      return fail(response, error)
    }
    if (!request.user) return sendError(response, 401, 'not_signed_in', 'Please sign in.')
    return next()
  }
}

export function authRoutes({ auth }) {
  const router = express.Router()
  const requireUser = makeRequireUser(auth)
  const available = (request, response, next) =>
    auth ? next() : sendError(response, 503, 'accounts_unavailable', 'Accounts are not available on this server.')

  router.post('/api/auth/signup', available, jsonBody('10kb'), async (request, response) => {
    try {
      const { user, token } = await auth.signup({ ...(request.body ?? {}), address: request.ip })
      return setSession(response, token).status(201).json({ user })
    } catch (error) {
      return fail(response, error)
    }
  })
  router.post('/api/auth/login', available, jsonBody('10kb'), async (request, response) => {
    try {
      const { user, token } = await auth.login({ ...(request.body ?? {}), address: request.ip })
      return setSession(response, token).json({ user })
    } catch (error) {
      return fail(response, error)
    }
  })
  router.post('/api/auth/logout', available, async (request, response) => {
    try {
      await auth.logout(sessionToken(request))
      return setSession(response, '', 0).json({ ok: true })
    } catch (error) {
      return fail(response, error)
    }
  })
  router.get('/api/auth/me', requireUser, (request, response) => response.json({ user: request.user }))
  router.delete('/api/auth/me', requireUser, async (request, response) => {
    try {
      const result = await auth.deleteMe(request.user.id)
      return setSession(response, '', 0).json(result)
    } catch (error) {
      return fail(response, error)
    }
  })
  return router
}
