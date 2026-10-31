// DeepSeek CV reader (spec §5, §6): reads the CV text and returns an AI draft profile beside the rules reader's.
// Every returned item must quote the CV word for word or it is dropped; levels, ids and codes never come from the AI
// (a skill used in a job or project starts at Good by the owner's rule, not by the AI).
// AI replies and CV text are never logged; only the kind of failure.
import { emptyProfile, levelFromUse, makeSkill } from '../../shared/profileSchema.js'
import { CV_SCHEMA, SYSTEM_PROMPT, userMessage } from './aiReadPrompt.js'
import { createWindowLimiter } from '../rateLimit.js'
import { mergeSkills } from '../skills/normalize.js'
import { levelOf } from './patterns.js'

const HOUR_MS = 3600 * 1000
const DEFAULT_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-flash'
const FIELDS = Object.fromEntries(Object.entries(CV_SCHEMA.properties).map(([list, { items }]) => [list, Object.keys(items.properties)]))

class ProviderError extends Error {
  constructor(kind) {
    super(kind)
    this.name = 'ProviderError'
    this.kind = kind
  }
}

const norm = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim()
// Fields a reply may leave out (replies from before they were asked for are still read).
const OPTIONAL = new Set(['usedIn'])

// The reply must have the five lists of objects with string fields; anything else is a failed reply.
export function checkShape(reply) {
  if (!reply || typeof reply !== 'object') return false
  return Object.entries(FIELDS).every(([list, fields]) => Array.isArray(reply[list])
    && reply[list].every((entry) => entry && typeof entry === 'object' && fields.every((f) => typeof entry[f] === 'string' || (OPTIONAL.has(f) && entry[f] === undefined))))
}

// The value(s) of an item that its quote must contain (for education, any one of the three: a Malay CV says
// "Ijazah Sarjana Muda" where the label is "Bachelor degree").
const MAIN = { education: ['qualification', 'fieldOfStudy', 'institution'], jobs: ['jobTitle'], skills: ['name'], certifications: ['name'], projects: ['title'] }
const MIN_EVIDENCE = 3

// Keeps only the schema's fields (so levels, ids and codes go) of items whose evidence occurs in the CV word for word
// and contains the item itself. Every other field of a kept item (employer, the other education fields, ...) must occur
// in the CV too, or it is left empty (usedIn is checked later against the kept titles).
export function keepQuoted(reply, cvText) {
  const cv = norm(cvText)
  let dropped = 0
  const fields = {}
  for (const [list, keys] of Object.entries(FIELDS)) {
    fields[list] = []
    for (const entry of reply[list] ?? []) {
      const evidence = norm(entry?.evidence ?? '')
      const itself = MAIN[list].map((key) => norm(entry?.[key] ?? '')).filter(Boolean)
      if (evidence.length < MIN_EVIDENCE || !cv.includes(evidence) || !itself.some((value) => evidence.includes(value))) {
        dropped++
        continue
      }
      const checked = (key) => {
        const value = String(entry[key] ?? '').trim()
        return key === 'evidence' || OPTIONAL.has(key) || cv.includes(norm(value)) ? value : ''
      }
      fields[list].push(Object.fromEntries(keys.filter((key) => !OPTIONAL.has(key) || entry[key] !== undefined).map((key) => [key, checked(key)])))
    }
  }
  return { fields, dropped }
}

// No key means the AI reader is off.
export function providerFromEnv(env = process.env) {
  if (!env.CV_LLM_KEY) return null
  return { url: env.CV_LLM_URL || DEFAULT_URL, key: env.CV_LLM_KEY, model: env.CV_LLM_MODEL || DEFAULT_MODEL }
}

async function post(fetchImpl, url, headers, body, timeoutMs) {
  let response
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new ProviderError(error?.name === 'TimeoutError' ? 'timeout' : 'network')
  }
  if (!response.ok) throw new ProviderError(`http_${response.status}`)
  const data = await response.json().catch(() => null)
  if (!data) throw new ProviderError('bad_reply')
  return data
}

const parse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('bad_reply')
  }
}

export function createAiReader({ provider, fetchImpl = fetch, normalizer, now = () => new Date(), timeoutMs = 15000, perHour = 20 }) {
  const perAddress = createWindowLimiter({ limit: perHour, windowMs: HOUR_MS, now })

  async function suggestedProfile(fields, interfaceLanguage) {
    const at = now().toISOString()
    const extraction = (evidence) => ({ method: 'ai', evidence, confidence: null, extractorVersion: `ai:${provider.model}`, provider: 'deepseek', at, kind: 'explicit' })
    const profile = emptyProfile({ inputMethod: 'cv', interfaceLanguage })
    profile.dataProvenance.extractionModel = `ai:${provider.model}`
    profile.education.records = fields.education.map((e) => ({ qualification: e.qualification, level: levelOf(e.qualification), fieldOfStudy: e.fieldOfStudy, institution: e.institution, year: '', userConfirmed: false, extraction: extraction(e.evidence) }))
    profile.employment.records = fields.jobs.map((j) => ({ jobTitle: j.jobTitle, employer: j.employer, period: '', userConfirmed: false, extraction: extraction(j.evidence) }))
    profile.certifications = fields.certifications.map((c) => ({ name: c.name, issuer: '', year: '', userConfirmed: false, extraction: extraction(c.evidence) }))
    profile.projects = fields.projects.map((p) => ({ title: p.title, description: '', userConfirmed: false, extraction: extraction(p.evidence) }))
    // Where a skill was used: only a job or project the AI itself returned (and kept), by its title.
    const places = [
      ...profile.employment.records.map((j) => ({ kind: 'job', title: j.jobTitle })),
      ...profile.projects.map((p) => ({ kind: 'project', title: p.title })),
    ]
    const usedIn = (name) => places.filter((p) => name && norm(p.title) === norm(name)).slice(0, 1)
    // Skill names go through the same O*NET normaliser as everything else; ids never come from the AI.
    profile.skills = mergeSkills(await Promise.all(fields.skills.filter((s) => s.name).map(async (s) => {
      const found = await normalizer.normalizeSkill(s.name)
      return makeSkill({ ...found, source: 'cv_ai', extraction: extraction(s.evidence), usedIn: usedIn(s.usedIn) })
    }))).map(levelFromUse)
    return profile
  }

  // Never rejects: any failure is a skipped result, so the rules reader's draft still goes ahead.
  async function read({ cvText, ip = 'unknown', interfaceLanguage = 'en' }) {
    if (!provider) return { status: 'skipped', reason: 'ai_unavailable' }
    if (!perAddress.hit(ip)) return { status: 'skipped', reason: 'ai_limit' }
    try {
      const data = await post(fetchImpl, provider.url,
        { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
        {
          model: provider.model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(cvText) }],
          response_format: { type: 'json_object' },
        }, timeoutMs)
      const reply = parse(data.choices?.[0]?.message?.content ?? '')
      if (!checkShape(reply)) throw new ProviderError('bad_reply')
      const { fields, dropped } = keepQuoted(reply, cvText)
      const profile = await suggestedProfile(fields, interfaceLanguage)
      const usage = { input: Number(data.usage?.prompt_tokens) || 0, output: Number(data.usage?.completion_tokens) || 0 }
      return { status: 'ok', model: provider.model, dropped, usage, profile }
    } catch (error) {
      console.error(`[aiRead] failed: ${error?.kind ?? error?.name ?? 'Error'}`)
      return { status: 'skipped', reason: 'ai_unavailable' }
    }
  }

  return { read }
}
