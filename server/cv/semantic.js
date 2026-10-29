// L3 semantic match: an embedding model hosted on RunPod Inference behind an OpenAI-compatible /embeddings route
// (spec §6.6). Similar wording is not proof of the same skill: matches are only kept at or above the cutoff set by
// Model Eval (docs/model-eval.md), are marked inferred, and stay Unverified until the user confirms them.
import { makeSkill } from '../../shared/profileSchema.js'

const BATCH = 64
const REVIEW_MARGIN = 0.05
const MAX_LINES = 60

export class SemanticError extends Error {
  constructor(kind) {
    super(`semantic ${kind}`)
    this.name = 'SemanticError'
    this.kind = kind
  }
}

const cosine = (a, b) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export function createSemantic({ url, key, model, fetchImpl = fetch, timeoutMs = 15000 }) {
  const endpoint = `${url.replace(/\/+$/, '')}/embeddings`
  // Target vectors per target list (one list per catalogue version), embedded once.
  const targetVectors = new WeakMap()

  async function embedBatch(texts) {
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: texts }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new SemanticError(error?.name === 'TimeoutError' ? 'timeout' : 'network')
    }
    if (!response.ok) throw new SemanticError(`http_${response.status}`)
    const body = await response.json().catch(() => null)
    const data = Array.isArray(body?.data) ? [...body.data].sort((a, b) => a.index - b.index) : []
    if (data.length !== texts.length || data.some((item) => !Array.isArray(item.embedding))) throw new SemanticError('bad_reply')
    return data.map((item) => item.embedding)
  }

  async function embed(texts) {
    const out = []
    for (let i = 0; i < texts.length; i += BATCH) out.push(...(await embedBatch(texts.slice(i, i + BATCH))))
    return out
  }

  // Best target for each text: [{ text, id, name, similarity }].
  async function match(texts, targets) {
    if (!targetVectors.has(targets)) {
      const pending = embed(targets.map((target) => target.name))
      targetVectors.set(targets, pending)
      pending.catch(() => targetVectors.delete(targets))
    }
    const [vectors, wanted] = await Promise.all([targetVectors.get(targets), embed(texts)])
    return wanted.map((vector, i) => {
      let best = -1
      let bestScore = -Infinity
      vectors.forEach((target, j) => {
        const score = cosine(vector, target)
        if (score > bestScore) [best, bestScore] = [j, score]
      })
      return { text: texts[i], id: targets[best]?.id ?? null, name: targets[best]?.name ?? null, similarity: Math.round(bestScore * 1000) / 1000 }
    })
  }

  return { embed, match }
}

// SEMANTIC_URL (e.g. https://api.runpod.ai/v2/<endpoint id>/openai/v1), SEMANTIC_KEY, SEMANTIC_MODEL. Not set → null (L3 skipped).
export function createSemanticFromEnv(env = process.env) {
  if (!env.SEMANTIC_URL || !env.SEMANTIC_KEY || !env.SEMANTIC_MODEL) return null
  return createSemantic({ url: env.SEMANTIC_URL, key: env.SEMANTIC_KEY, model: env.SEMANTIC_MODEL })
}

// The L3 hook for extractProfile: Skills-section wordings the rules could not map, and CV lines from the other
// sections, compared with the O*NET skill names. Only matches at or above the cutoff are added.
export function createSemanticStep({ semantic, catalogue, cutoff }) {
  if (!semantic || cutoff === null || cutoff === undefined) return null
  return async ({ rows, skills, extraction }) => {
    const unknown = skills.filter((skill) => !skill.canonicalId && !skill.candidates?.length)
    const known = new Set(skills.map((skill) => skill.canonicalId).filter(Boolean))
    const lines = rows.filter((row) => !row.heading && row.section !== 'skills' && row.section !== 'education').map((row) => row.line).slice(0, MAX_LINES)
    const texts = [...unknown.map((skill) => skill.originalText), ...lines]
    if (!texts.length) return skills
    const matches = await semantic.match(texts, catalogue.entries)
    const byId = new Map(catalogue.entries.map((entry) => [entry.id, entry]))

    const replaced = new Map()
    const added = []
    matches.forEach((found, i) => {
      const entry = byId.get(found.id)
      if (!entry || found.similarity < cutoff) return
      const fromSkill = i < unknown.length ? unknown[i] : null
      if (!fromSkill && known.has(entry.id)) return
      const evidence = fromSkill ? fromSkill.extraction?.evidence ?? fromSkill.originalText : found.text
      const skill = makeSkill({
        name: entry.name,
        originalText: fromSkill ? fromSkill.originalText : entry.name,
        canonicalId: entry.id,
        category: entry.category,
        source: 'cv_semantic',
        extraction: { ...extraction('embedding', evidence, found.similarity, 'inferred'), lowSimilarity: found.similarity < cutoff + REVIEW_MARGIN },
      })
      if (fromSkill) replaced.set(fromSkill, skill)
      else added.push(skill)
      known.add(entry.id)
    })
    return [...skills.map((skill) => replaced.get(skill) ?? skill), ...added]
  }
}
