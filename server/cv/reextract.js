// AI re-extraction (spec §9), only with the user's consent: RunPod (OpenAI-compatible chat) first, Claude as backup.
// Every returned item must quote the CV word for word or it is dropped; levels, ids and codes never come from the AI
// (a skill used in a job or project starts at Good by the owner's rule, not by the AI).
// AI replies and CV text are never logged.
import { emptyProfile, levelFromUse, makeSkill } from '../../shared/profileSchema.js'
import { readText } from './readText.js'
import { validateFile } from './validateFile.js'
import { CV_SCHEMA, SYSTEM_PROMPT, userMessage } from './reextractPrompt.js'
import { createWindowLimiter } from '../rateLimit.js'
import { mergeSkills } from '../skills/normalize.js'
import { levelOf } from './patterns.js'

const RUNS_PER_UPLOAD = 3
const RUNS_PER_HOUR = 20
const HOUR_MS = 3600 * 1000
const UPLOAD_LIFETIME_MS = 24 * HOUR_MS
const MAX_BYTES = 10 * 1024 * 1024
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages'
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
function checkShape(reply) {
  if (!reply || typeof reply !== 'object') return false
  return Object.entries(FIELDS).every(([list, fields]) => Array.isArray(reply[list])
    && reply[list].every((entry) => entry && typeof entry === 'object' && fields.every((f) => typeof entry[f] === 'string' || (OPTIONAL.has(f) && entry[f] === undefined))))
}

// The value(s) of an item that its quote must contain (for education, any one of the three: a Malay CV says
// "Ijazah Sarjana Muda" where the label is "Bachelor degree").
const MAIN = { education: ['qualification', 'fieldOfStudy', 'institution'], jobs: ['jobTitle'], skills: ['name'], certifications: ['name'], projects: ['title'] }
const MIN_EVIDENCE = 3

// Keeps only the schema's fields (so levels, ids and codes go) of items whose evidence occurs in the CV word for word
// and contains the item itself.
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
      fields[list].push(Object.fromEntries(keys.filter((key) => !OPTIONAL.has(key) || entry[key] !== undefined).map((key) => [key, String(entry[key] ?? '').trim()])))
    }
  }
  return { fields, dropped }
}

export function providersFromEnv(env = process.env) {
  const providers = []
  if (env.CV_LLM_URL && env.CV_LLM_KEY && env.CV_LLM_MODEL) providers.push({ kind: 'runpod', url: env.CV_LLM_URL, key: env.CV_LLM_KEY, model: env.CV_LLM_MODEL })
  if (env.CV_LLM_BACKUP_KEY) providers.push({ kind: 'claude', key: env.CV_LLM_BACKUP_KEY, model: env.CV_LLM_BACKUP_MODEL || 'claude-opus-5-5' })
  return providers
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

const CALLS = {
  async runpod(provider, cvText, fetchImpl, timeoutMs) {
    const data = await post(fetchImpl, `${provider.url.replace(/\/+$/, '')}/chat/completions`,
      { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
      {
        model: provider.model,
        temperature: 0,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(cvText) }],
        response_format: { type: 'json_schema', json_schema: { name: 'cv_profile', strict: true, schema: CV_SCHEMA } },
      }, timeoutMs)
    return parse(data.choices?.[0]?.message?.content ?? '')
  },
  async claude(provider, cvText, fetchImpl, timeoutMs) {
    const data = await post(fetchImpl, CLAUDE_URL,
      { 'content-type': 'application/json', 'x-api-key': provider.key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      {
        model: provider.model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage(cvText) }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: CV_SCHEMA } },
        fallbacks: 'default',
      }, timeoutMs)
    if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') throw new ProviderError(data.stop_reason)
    return parse((data.content ?? []).find((block) => block.type === 'text')?.text ?? '')
  },
}

export function createReextractor({ tempStore, providers, fetchImpl = fetch, normalizer, now = () => new Date(), timeoutMs = 30000 }) {
  // 3 runs per upload (an upload is kept at most a day) and 20 per hour per address.
  const perUpload = createWindowLimiter({ limit: RUNS_PER_UPLOAD, windowMs: UPLOAD_LIFETIME_MS, now })
  const perAddress = createWindowLimiter({ limit: RUNS_PER_HOUR, windowMs: HOUR_MS, now })
  const allowed = (extractionId, ip) => perAddress.hit(ip) && perUpload.hit(String(extractionId))

  async function suggestedProfile(fields, provider, interfaceLanguage) {
    const at = now().toISOString()
    const extraction = (evidence) => ({ method: 'ai', evidence, confidence: null, extractorVersion: `ai:${provider.model}`, provider: provider.kind, at, kind: 'explicit' })
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

  async function run({ extractionId, consent, ip = 'unknown', interfaceLanguage = 'en' }) {
    if (consent !== true) return { status: 'error', code: 'consent_required' }
    if (!providers.length || !tempStore) return { status: 'unavailable', reason: 'not_configured' }
    if (!allowed(extractionId, ip)) return { status: 'error', code: 'rate_limited' }
    const file = typeof extractionId === 'string' ? await tempStore.get(`cv-temp/${extractionId}`).catch(() => null) : null
    if (!file) return { status: 'unavailable', reason: 'cv_expired' }
    const checked = validateFile(file.buffer, { maxBytes: MAX_BYTES })
    const read = checked.ok ? await readText(file.buffer, checked.type) : null
    if (!read?.ok) return { status: 'unavailable', reason: 'cv_unreadable' }
    const cvText = read.lines.join('\n')

    for (const provider of providers) {
      try {
        const reply = await CALLS[provider.kind](provider, cvText, fetchImpl, timeoutMs)
        if (!checkShape(reply)) throw new ProviderError('bad_reply')
        const { fields, dropped } = keepQuoted(reply, cvText)
        const suggested = await suggestedProfile(fields, provider, interfaceLanguage)
        return { status: 'ok', provider: provider.kind, model: provider.model, dropped, suggested }
      } catch (error) {
        console.error(`[reextract] ${provider.kind} failed:`, error?.kind ?? error?.name ?? 'Error')
      }
    }
    return { status: 'unavailable', reason: 'providers_failed' }
  }

  return { run }
}
