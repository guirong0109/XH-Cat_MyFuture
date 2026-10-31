// DeepSeek CV reader (spec §5, §6): reads the CV text and returns an AI draft profile beside the rules reader's.
// Every returned item must quote the CV word for word or it is dropped; levels, ids and codes never come from the AI
// (a skill used in a job or project starts at Good by the owner's rule, not by the AI).
// AI replies and CV text are never logged; only the kind of failure.
import { emptyProfile, levelFromUse, makeSkill } from '../../shared/profileSchema.js'
import { CV_SCHEMA, systemPrompt, userMessage } from './aiReadPrompt.js'
import { createWindowLimiter } from '../rateLimit.js'
import { mergeSkills } from '../skills/normalize.js'
import { ONET_LINKABLE, nameKey } from '../skills/onetSkills.js'
import { levelOf } from './patterns.js'

const HOUR_MS = 3600 * 1000
const DEFAULT_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-flash'
// A real two-page CV takes DeepSeek more than 15 s (owner, 31 Oct: allow up to 40 s).
export const AI_TIMEOUT_MS = 40000
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
const OPTIONAL = new Set(['usedIn', 'onet', 'description'])
// Fields never checked against the CV text (description is optional but still checked).
const UNCHECKED = new Set(['usedIn', 'onet'])

// The reply must have the five lists of objects with string fields; anything else is a failed reply.
// Returns where the shape first breaks (names and types only, never CV text), or null when it is right.
export function shapeProblem(reply) {
  if (!reply || typeof reply !== 'object') return 'not an object'
  for (const [list, fields] of Object.entries(FIELDS)) {
    if (!Array.isArray(reply[list])) return `${list} ${reply[list] === null ? 'null' : typeof reply[list]}`
    for (const [i, entry] of reply[list].entries()) {
      if (!entry || typeof entry !== 'object') return `${list}[${i}] ${entry === null ? 'null' : typeof entry}`
      for (const f of fields) {
        const value = entry[f]
        if (typeof value !== 'string' && !(OPTIONAL.has(f) && (value === undefined || value === null))) return `${list}[${i}].${f} ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`
      }
    }
  }
  return null
}
export const checkShape = (reply) => shapeProblem(reply) === null

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
        return key === 'evidence' || UNCHECKED.has(key) || cv.includes(norm(value)) ? value : ''
      }
      fields[list].push(Object.fromEntries(keys.filter((key) => !OPTIONAL.has(key) || (entry[key] !== undefined && entry[key] !== null)).map((key) => [key, checked(key)])))
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
  // DeepSeek answers at once and sends the body when the model is done, so the time limit can end while reading it.
  let data
  try {
    data = await response.json()
  } catch (error) {
    throw new ProviderError(['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'bad_body')
  }
  if (!data) throw new ProviderError('bad_body')
  return data
}

const parse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('bad_json')
  }
}

export function createAiReader({ provider, fetchImpl = fetch, normalizer, catalogue, now = () => new Date(), timeoutMs = AI_TIMEOUT_MS, perHour = 20 }) {
  // One entry per name; the first wins, and skills come before knowledge areas (Mathematics is both: the skill wins).
  const linkable = new Map()
  for (const entry of ONET_LINKABLE(catalogue)) if (!linkable.has(nameKey(entry.name))) linkable.set(nameKey(entry.name), entry)
  const prompt = systemPrompt([...new Set([...linkable.values()].map((entry) => entry.name))].sort((a, b) => a.localeCompare(b)))
  const perAddress = createWindowLimiter({ limit: perHour, windowMs: HOUR_MS, now })

  async function suggestedProfile(fields, interfaceLanguage) {
    const at = now().toISOString()
    const extraction = (evidence) => ({ method: 'ai', evidence, confidence: null, extractorVersion: `ai:${provider.model}`, provider: 'deepseek', at, kind: 'explicit' })
    const profile = emptyProfile({ inputMethod: 'cv', interfaceLanguage })
    profile.dataProvenance.extractionModel = `ai:${provider.model}`
    profile.education.records = fields.education.map((e) => ({ qualification: e.qualification, level: levelOf(e.qualification), fieldOfStudy: e.fieldOfStudy, institution: e.institution, year: '', userConfirmed: false, extraction: extraction(e.evidence) }))
    profile.employment.records = fields.jobs.map((j) => ({ jobTitle: j.jobTitle, employer: j.employer, period: '', userConfirmed: false, extraction: extraction(j.evidence) }))
    profile.certifications = fields.certifications.map((c) => ({ name: c.name, issuer: '', year: '', userConfirmed: false, extraction: extraction(c.evidence) }))
    profile.projects = fields.projects.map((p) => ({ title: p.title, description: p.description ?? '', userConfirmed: false, extraction: extraction(p.evidence) }))
    // Where a skill was used: only a job or project the AI itself returned (and kept), by its title.
    const places = [
      ...profile.employment.records.map((j) => ({ kind: 'job', title: j.jobTitle })),
      ...profile.projects.map((p) => ({ kind: 'project', title: p.title })),
    ]
    const usedIn = (name) => places.filter((p) => name && norm(p.title) === norm(name)).slice(0, 1)
    // Skill names go through the same O*NET normaliser as everything else; ids never come from the AI.
    profile.skills = mergeSkills(await Promise.all(fields.skills.filter((s) => s.name).map(async (s) => {
      const found = await normalizer.normalizeSkill(s.name)
      const skill = makeSkill({ ...found, source: 'cv_ai', extraction: extraction(s.evidence), usedIn: usedIn(s.usedIn) })
      // The AI's closest O*NET name, only when it is on the catalogue's list and not the skill's own link.
      const suggested = s.onet ? linkable.get(nameKey(s.onet)) : null
      if (suggested && suggested.id !== skill.canonicalId) skill.aiSuggestion = { id: suggested.id, name: suggested.name, evidence: s.evidence }
      return skill
    }))).map(levelFromUse)
    return profile
  }

  // Never rejects: any failure is a skipped result, so the rules reader's draft still goes ahead.
  async function read({ cvText, ip = 'unknown', interfaceLanguage = 'en' }) {
    if (!provider) return { status: 'skipped', reason: 'ai_unavailable' }
    if (!perAddress.hit(ip)) return { status: 'skipped', reason: 'ai_limit' }
    const started = Date.now()
    try {
      const data = await post(fetchImpl, provider.url,
        { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
        {
          model: provider.model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: userMessage(cvText) }],
          response_format: { type: 'json_object' },
          // Copying facts needs no reasoning; with thinking on, hidden reasoning was up to 60% of the output and slow.
          thinking: { type: 'disabled' },
        }, timeoutMs)
      if (data.choices?.[0]?.finish_reason === 'length') throw new ProviderError('cut_off')
      const reply = parse(data.choices?.[0]?.message?.content ?? '')
      const problem = shapeProblem(reply)
      if (problem) throw new ProviderError(`bad_shape ${problem}`)
      const { fields, dropped } = keepQuoted(reply, cvText)
      const profile = await suggestedProfile(fields, interfaceLanguage)
      const usage = { input: Number(data.usage?.prompt_tokens) || 0, output: Number(data.usage?.completion_tokens) || 0 }
      return { status: 'ok', model: provider.model, dropped, usage, profile }
    } catch (error) {
      const kind = error?.kind ?? error?.name ?? 'Error'
      console.error(`[aiRead] failed: ${kind === 'timeout' ? `timeout after ${Date.now() - started} ms` : kind}`)
      return { status: 'skipped', reason: 'ai_unavailable' }
    }
  }

  return { read }
}
