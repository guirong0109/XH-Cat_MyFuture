// Accounts in D1 (spec §10): scrypt passwords, session tokens stored only as hashes, 7-day sessions,
// sign-in limit 10 per 15 minutes per address, and "delete my data" including any temporary CV.
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createWindowLimiter } from './rateLimit.js'

const scryptAsync = promisify(scrypt)
const SCRYPT = { N: 16384, r: 8, p: 1 }
const KEY_BYTES = 64
export const SESSION_SECONDS = 7 * 24 * 3600
const LIMIT = 10
const WINDOW_MS = 15 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8
const MAX_PASSWORD = 200

export class AuthError extends Error {
  constructor(status, code, retryable = false) {
    super(code)
    this.name = 'AuthError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scryptAsync(password, salt, KEY_BYTES, SCRYPT)
  return { hash: key.toString('hex'), salt }
}

export async function verifyPassword(password, hash, salt) {
  const key = await scryptAsync(password, salt, KEY_BYTES, SCRYPT)
  const expected = Buffer.from(hash, 'hex')
  return expected.length === key.length && timingSafeEqual(key, expected)
}

const tokenHash = (token) => createHash('sha256').update(token).digest('hex')
const publicUser = (row) => ({ id: row.id, email: row.email, language: row.language, createdAt: row.created_at })
// Checked against when the email is unknown, so both failures take the same time.
const DUMMY = hashPassword('dummy password', '00000000000000000000000000000000')

export function createAuth({ d1, now = () => new Date() }) {
  // Sign-in limit per address (spec §10: 10 per 15 minutes).
  const signIns = createWindowLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now })
  const countAttempt = (address) => {
    if (!signIns.hit(address)) throw new AuthError(429, 'too_many_attempts', true)
  }

  async function newSession(userId) {
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(now().getTime() + SESSION_SECONDS * 1000).toISOString()
    await d1.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash(token), userId, expires])
    return token
  }

  async function signup({ email, password, language }) {
    const address = String(email ?? '').trim().toLowerCase()
    if (!EMAIL.test(address) || address.length > 254) throw new AuthError(400, 'bad_email')
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) throw new AuthError(400, 'weak_password')
    const { rows } = await d1.query('SELECT id FROM users WHERE email = ?', [address])
    if (rows.length) throw new AuthError(409, 'email_taken')
    const { hash, salt } = await hashPassword(password)
    const row = { id: randomUUID(), email: address, language: ['en', 'ms', 'zh'].includes(language) ? language : 'en', created_at: now().toISOString() }
    await d1.query('INSERT INTO users (id, email, pass_hash, pass_salt, language, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [row.id, row.email, hash, salt, row.language, row.created_at])
    return { user: publicUser(row), token: await newSession(row.id) }
  }

  async function login({ email, password, address }) {
    countAttempt(address)
    const { rows } = await d1.query('SELECT * FROM users WHERE email = ?', [String(email ?? '').trim().toLowerCase()])
    const row = rows[0]
    const ok = row
      ? await verifyPassword(String(password ?? ''), row.pass_hash, row.pass_salt)
      : (await verifyPassword(String(password ?? ''), (await DUMMY).hash, (await DUMMY).salt), false)
    if (!ok) throw new AuthError(401, 'bad_credentials')
    return { user: publicUser(row), token: await newSession(row.id) }
  }

  async function me(token) {
    if (!token) return null
    const { rows } = await d1.query('SELECT users.*, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?', [tokenHash(token)])
    const row = rows[0]
    if (!row) return null
    if (row.expires_at <= now().toISOString()) {
      await d1.query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)])
      return null
    }
    return publicUser(row)
  }

  async function logout(token) {
    if (token) await d1.query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)])
  }

  // Everything about the user goes (sessions and profiles follow by ON DELETE CASCADE).
  async function deleteMe(userId) {
    await d1.query('DELETE FROM users WHERE id = ?', [userId])
    return { deleted: true }
  }

  return { signup, login, logout, me, deleteMe }
}
