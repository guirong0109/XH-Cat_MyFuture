// Overall match (spec section 5a): Skill Match and AI know-how, blended by how much AI touches the job.
// Pure, no I/O: server and browser share it. No number here ranks anything on its own; it only orders roles inside a band.
export const AI_USE_KEYS = ['mindset', 'ethics', 'apply', 'design']

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

// profile -> the four AI answers, each 'yes' | 'no' | null (anything else, or no aiUse, is unanswered).
export function readAiUse(profile) {
  const raw = profile?.aiUse
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {}
  for (const k of AI_USE_KEYS) out[k] = src[k] === 'yes' || src[k] === 'no' ? src[k] : null
  return out
}

// aiUse -> Yes answers over answered questions, whole percent; null when nothing is answered.
export function aiKnowHow(aiUse) {
  let yes = 0
  let answered = 0
  for (const k of AI_USE_KEYS) {
    const v = aiUse?.[k]
    if (v === 'yes') { yes += 1; answered += 1 }
    else if (v === 'no') answered += 1
  }
  return answered > 0 ? { percent: Math.round((yes / answered) * 100), yes, answered } : null
}

// Overall = S x (1 - T) + K x T. No Skill Match or no know-how: none. No AI data: Overall = Skill Match.
export function overallMatch(skillMatch, knowHow, touchPct) {
  if (!skillMatch || !isNum(skillMatch.percent) || !knowHow || !isNum(knowHow.percent)) return null
  const skill = skillMatch.percent
  const base = { provisional: Boolean(skillMatch.provisional), skill, knowHow: knowHow.percent }
  if (!isNum(touchPct)) return { percent: skill, ...base, noAiData: true, touch: null }
  const t = touchPct / 100
  const percent = Math.min(100, Math.max(0, Math.round(skill * (1 - t) + knowHow.percent * t)))
  return { percent, ...base, noAiData: false, touch: t }
}

// Value to order roles inside a band: Overall for the scenario, else Skill Match, else -1 (last).
export function sortValue(role, scenario) {
  return role?.overallMatch?.[scenario]?.percent ?? role?.skillMatch?.percent ?? -1
}
