// Calls to the public Future Skills Radar API (spec §13). The first answer fixes the manifest id; every follow-up call
// sends ?manifest=<id> back, so one screen never mixes data versions (spec §6.5, Review Focus 4).
// An id the server no longer stores answers 409 manifest_gone → { reload: true } (the screen offers to reload).
// The server receives no profile data: personal relevance is worked out in the browser.
import { api } from './api.js'

const query = (manifestId) => (manifestId ? `?manifest=${encodeURIComponent(manifestId)}` : '')
const gone = (out) => !out.ok && out.code === 'manifest_gone'

// A newer active manifest than the one shown, from any answer (null when the shown one is still active).
function newerOf(manifestId, answers) {
  for (const a of answers) if (a?.activeManifestId && a.activeManifestId !== manifestId) return a.activeManifestId
  return null
}

// load(manifestId?) → { ok:true, data } | { reload:true } | { ok:false, code, retryable }
// data = { manifestId, activeManifestId, devStore, states, ai, occ, refs, sources, skills }
export async function load(manifestId, { base = '' } = {}) {
  const first = await api('GET', `${base}/api/radar/ai/topics${query(manifestId)}`)
  if (gone(first)) return { reload: true }
  if (!first.ok) return { ok: false, code: first.code, retryable: first.retryable }
  const id = first.data.manifestId
  const [occ, refs, sources, skills] = await Promise.all(
    ['occupations', 'references', 'sources', 'skills'].map((route) => api('GET', `${base}/api/radar/${route}${query(id)}`)),
  )
  if ([occ, refs, sources, skills].some(gone)) return { reload: true }
  const failed = [occ, refs, sources, skills].find((out) => !out.ok)
  if (failed) return { ok: false, code: failed.code, retryable: failed.retryable, devStore: Boolean(first.data.devStore) }
  const answers = [first.data, occ.data, refs.data, sources.data, skills.data]
  return {
    ok: true,
    data: {
      manifestId: id,
      activeManifestId: newerOf(id, answers) ?? id,
      devStore: Boolean(first.data.devStore),
      states: first.data.states ?? {},
      ai: first.data,
      occ: occ.data,
      refs: refs.data,
      sources: sources.data.sources ?? [],
      skills: skills.data,
    },
  }
}

// storeInfo() → { ok:true, devStore } | { ok:false, code }: the public manifest answer says whether the server runs on
// the development store (spec §7); the #admin and #judge key boxes read it on open (no key or session involved).
export async function storeInfo({ base = '' } = {}) {
  const out = await api('GET', `${base}/api/radar/manifest`)
  if (!out.ok) return { ok: false, code: out.code, retryable: out.retryable }
  return { ok: true, devStore: Boolean(out.data?.devStore) }
}

// signal(id, manifestId) → { ok:true, signal, activeManifestId } | { reload:true } | { ok:false, code }
export async function signal(signalId, manifestId, { base = '' } = {}) {
  const out = await api('GET', `${base}/api/radar/signals/${encodeURIComponent(signalId)}${query(manifestId)}`)
  if (gone(out)) return { reload: true }
  if (!out.ok) return { ok: false, code: out.code, retryable: out.retryable }
  return { ok: true, signal: out.data.signal, activeManifestId: out.data.activeManifestId ?? manifestId }
}

// aiTasks() → { ok:true, data } | { ok:false, code, retryable }: static AI task data, no manifest and no profile data.
export async function aiTasks({ base = '' } = {}) {
  const out = await api('GET', `${base}/api/radar/ai-tasks`)
  return out.ok ? { ok: true, data: out.data } : { ok: false, code: out.code, retryable: out.retryable }
}
