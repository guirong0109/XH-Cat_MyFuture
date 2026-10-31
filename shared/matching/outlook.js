// Outlook parts for one job: AI exposure (two scenarios), job-ads group signal, and four bands. Pure, no I/O.
// The caller passes parsed data in. No number here ranks or scores anything: a band is a plain label.
export const SCENARIOS = ['moderate', 'rapid']

const GROUP_SYSTEM = 'MASCO 2020 major group'
const round1 = (n) => Math.round(n * 10) / 10
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

// Usage-weighted mean of `field` over rows that have it; null when none do.
function usageMean(rows, field) {
  const have = rows.filter((r) => isNum(r[field]))
  if (!have.length) return null
  const total = have.reduce((s, r) => s + (isNum(r.usage) ? r.usage : 0), 0)
  if (total <= 0) return round1(have.reduce((s, r) => s + r[field], 0) / have.length)
  return round1(have.reduce((s, r) => s + (isNum(r.usage) ? r.usage : 0) * r[field], 0) / total)
}

// observedShare is a percent 0-100 (one decimal): observed tasks over all tasks of the job.
export function aeiForJob(onetCode, tasksByJob, aeiByTask) {
  const ids = tasksByJob?.get(onetCode) ?? []
  const observedRows = ids.map((id) => aeiByTask?.get(id)).filter(Boolean)
  if (!observedRows.length) return null
  return {
    tasks: ids.length,
    observed: observedRows.length,
    observedShare: round1((observedRows.length / ids.length) * 100),
    automationPct: usageMean(observedRows, 'automation'),
    augmentationPct: usageMean(observedRows, 'augmentation'),
  }
}

export function aiPart(scenario, { aei, ilo } = {}) {
  if (scenario === 'rapid') {
    if (!ilo?.gradient) return { available: false, changesMuch: null, source: 'ilo', values: null }
    return {
      available: true,
      changesMuch: ilo.gradient === 'G3' || ilo.gradient === 'G4',
      source: 'ilo',
      values: { gradient: ilo.gradient, mean: ilo.mean ?? null, sd: ilo.sd ?? null },
    }
  }
  if (!aei || !isNum(aei.automationPct)) return { available: false, changesMuch: null, source: 'aei', values: null }
  return {
    available: true,
    changesMuch: aei.automationPct > 50,
    source: 'aei',
    values: { automationPct: aei.automationPct, augmentationPct: aei.augmentationPct ?? null, observedShare: aei.observedShare ?? null },
  }
}

// Group level only: a major-group trend says nothing about one job inside it. The path is always returned.
export function jobAdsPart(signals, emascoCode) {
  const groupCode = String(emascoCode ?? '').charAt(0)
  const signalId = `dosm:masco2020:${groupCode}`
  const path = [{ system: 'eMASCO', code: emascoCode }, { system: GROUP_SYSTEM, code: groupCode }]
  const list = signals instanceof Map ? [...signals.values()] : Array.isArray(signals) ? signals : []
  const s = list.find((x) => x?.signalId === signalId)
  if (!s) return { available: false, groupCode, direction: null, sufficient: false, signalId, evidenceLinks: [], path }
  return {
    available: true,
    groupCode,
    direction: s.direction ?? null,
    sufficient: s.evidenceSufficiency === 'sufficient',
    signalId,
    evidenceLinks: s.evidenceLinks ?? [],
    path,
  }
}

export function bandOf(jobAds, ai) {
  const sufficient = jobAds?.sufficient === true
  if (sufficient && jobAds.direction === 'declining') return 3
  if (ai?.changesMuch === true) return 2
  if (sufficient && (jobAds.direction === 'rising' || jobAds.direction === 'stable') && ai?.available) return 1
  return 4
}

export function movedRoles(before, after) {
  const was = new Map((before ?? []).map((r) => [r.code, r.band]))
  const out = []
  for (const r of after ?? []) {
    if (was.has(r.code) && was.get(r.code) !== r.band) out.push({ code: r.code, from: was.get(r.code), to: r.band })
  }
  return out
}
