// Career matching service (spec §4-§9). The profile is a function argument only: it is used for this answer and
// dropped. Nothing here stores it or logs it; logs carry codes only.
//
// createMatchingService({loadData, radar, references, demo, access, store, now, log}) ->
//   {list(profile, request) -> ListAnswer, role(profile, code, request) -> RoleAnswer | null (unknown code),
//    sdgDecided() -> drops the cached SDG decisions (called by the admin route after each decision)}
//   loadData: async () => loadMatchingData(...) result (throws MatchingDataError).
//   references: the Radar references (fieldJobs) or an async loader; store: the Radar review store (SDG decisions).
//   Signals: a judge (demo session) gets demo.diff(sessionId).signals, everyone else the active Radar manifest's
//   signals. Any failure -> no signals and radar.state 'unavailable' (job ads "not available", bands from AI only).
import { bestFit, profileLevels } from '../../shared/matching/fit.js'
import { aeiForJob, aiPart, bandOf, jobAdsPart } from '../../shared/matching/outlook.js'
import { goalsOfRole, linkStatuses, pathContribution, roleLinks } from '../../shared/matching/sdg.js'
import { nameKey } from '../skills/onetSkills.js'
import { loadReviews } from '../radar/reviews.js'
import { loadRadarReferences } from '../radar/references.js'
import { onetSkillsReference } from '../radar/routes.js'
import { linkHash } from './adminRoutes.js'
import { loadMatchingData } from './data.js'

const SDG_KIND = 'sdg_link'
// The SDG decisions are read from the review store at most once a minute (like the Radar's CHECKS_TTL_MS), and at once
// after a decision through /api/admin/matching/sdg-links (sdgDecided).
export const SDG_TTL_MS = 60000
const round2 = (n) => Math.round(n * 100) / 100
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const codeOf = (error) => error?.code ?? error?.name ?? 'Error'

// A loader called once; a failed load is retried next time (the loadFields pattern in server/app.js).
export function once(load) {
  let promise = null
  return () => {
    promise ??= Promise.resolve()
      .then(load)
      .catch((error) => {
        promise = null
        throw error
      })
    return promise
  }
}

// What the profile gives matching: levels of O*NET items that some job needs, owned software, and what is not used.
function readProfile(profile, data) {
  const all = profileLevels(profile)
  const levels = new Map([...all].filter(([key]) => data.knownKeys.has(key)))
  const unusedIds = []
  const software = new Set()
  for (const s of arr(profile?.skills)) {
    if (!plainObject(s)) continue
    const id = typeof s.canonicalId === 'string' && s.canonicalId ? s.canonicalId : null
    const name = typeof s.name === 'string' ? s.name : null
    if (!id) {
      unusedIds.push({ id: null, name, reason: 'no_id' })
      continue
    }
    const item = /^onet:(el|kn):(.+)$/.exec(id)
    if (item) {
      if (!data.knownKeys.has(`${item[1]}:${item[2]}`)) unusedIds.push({ id, name, reason: 'not_in_requirements' })
      continue
    }
    if (id.startsWith('onet:tech:')) software.add(nameKey(id.slice('onet:tech:'.length)))
    unusedIds.push({ id, name, reason: id.startsWith('onet:') ? 'not_in_percent' : 'unknown_id' })
  }
  const usable = levels.size > 0
  const provisional = usable && [...levels.values()].some((l) => l.notAssessed)
  return { levels, usable, provisional, unusedIds, software }
}

// Where the profile points: O*NET jobs from the fields of study, and the occupations of past jobs and chosen roles.
async function profilePointers(profile, loadReferences, log) {
  const fieldJobs = new Map() // onetCode -> [field codes]
  const fieldCodes = arr(profile?.education?.records).map((r) => r?.field?.code).filter((c) => typeof c === 'string' && c)
  if (fieldCodes.length) {
    try {
      const refs = await loadReferences()
      for (const code of new Set(fieldCodes)) {
        for (const job of arr(refs?.fieldJobs?.(code))) {
          if (!fieldJobs.has(job.code)) fieldJobs.set(job.code, [])
          fieldJobs.get(job.code).push(code)
        }
      }
    } catch (error) {
      log(`[matching] references unavailable: ${codeOf(error)}`)
    }
  }
  const occupations = []
  const add = (kind, o) => {
    if (!plainObject(o) || (o.source !== 'emasco' && o.source !== 'onet') || typeof o.code !== 'string') return
    if (!occupations.some((x) => x.kind === kind && x.source === o.source && x.code === o.code)) occupations.push({ kind, source: o.source, code: o.code })
  }
  for (const r of arr(profile?.employment?.records)) add('job', r?.occupation)
  for (const m of arr(profile?.occupationMappings)) add(m?.kind === 'job' ? 'job' : 'interest', m?.chosen)
  return { fieldJobs, occupations }
}

function inFieldOf(roleCode, jobs, pointers) {
  const via = []
  for (const job of jobs) for (const code of pointers.fieldJobs.get(job) ?? []) via.push({ kind: 'field', code, onetCode: job })
  for (const o of pointers.occupations) {
    if ((o.source === 'emasco' && o.code === roleCode) || (o.source === 'onet' && jobs.includes(o.code))) via.push({ ...o })
  }
  return via
}

// Group level only: a direction is shown only with sufficient evidence (Radar contract).
function jobAdsOf(signals, code) {
  const part = jobAdsPart(signals, code)
  const s = signals.find((x) => x?.signalId === part.signalId) ?? null
  return {
    ...part,
    direction: part.sufficient ? part.direction : null,
    evidenceSufficiency: s?.evidenceSufficiency ?? null,
    evidenceKind: s?.evidenceKind ?? null,
    granularity: s?.granularity ?? null,
    level: 'group',
  }
}

export function createMatchingService({ loadData, radar = null, references = null, demo = null, access = null, store = null, now = () => new Date(), log = (message) => console.error(message), sdgTtlMs = SDG_TTL_MS }) {
  const loadReferences = typeof references === 'function' ? once(references) : async () => references
  // {at, promise} of the last SDG decision read; a failed read is not kept. A decision drops it, also while a read
  // is still on its way (that read answers the requests already waiting on it, and is not kept).
  let sdgCache = null
  function sdgReviews() {
    const at = now().getTime()
    if (sdgCache && at - sdgCache.at >= 0 && at - sdgCache.at < sdgTtlMs) return sdgCache.promise
    const entry = { at, promise: null }
    entry.promise = loadReviews(store, SDG_KIND).catch((error) => {
      if (sdgCache === entry) sdgCache = null
      throw error
    })
    sdgCache = entry
    return entry.promise
  }
  function sdgDecided() {
    sdgCache = null
  }

  // The Radar inputs of this request: signals (a judge's demo session, or the active manifest) and in-demand lists.
  async function radarInputs(request) {
    let answer = null
    try {
      answer = radar ? await radar.answer() : null
    } catch (error) {
      log(`[matching] radar unavailable: ${codeOf(error)}`)
    }
    let inDemand = {}
    try {
      inDemand = answer ? onetSkillsReference(answer.view).inDemand ?? {} : {}
    } catch {
      inDemand = {}
    }
    let session = null
    try {
      session = access?.sessionOf?.(request)?.session ?? null
    } catch {
      session = null
    }
    if (session?.role === 'demo' && demo) {
      try {
        const report = await demo.diff(session.sessionId)
        return { signals: arr(report.signals), inDemand, info: { manifestId: report.manifests?.after ?? null, state: 'data', judgeSession: true } }
      } catch (error) {
        log(`[matching] judge signals unavailable: ${codeOf(error)}`)
        return { signals: [], inDemand, info: { manifestId: null, state: 'unavailable', judgeSession: true } }
      }
    }
    const signals = arr(answer?.view?.signals?.signals)
    if (!answer) return { signals: [], inDemand, info: { manifestId: null, state: 'unavailable', judgeSession: false } }
    const dosm = answer.states?.dosm ?? null
    return {
      signals,
      inDemand,
      info: { manifestId: answer.manifestId ?? null, state: 'data', judgeSession: false, observationPeriod: dosm?.observationPeriod ?? null, publishedAt: dosm?.publishedAt ?? null },
    }
  }

  // Owner-approved SDG links, each with its approval date.
  async function approvedLinks(data) {
    let reviews = []
    if (store) {
      try {
        reviews = await sdgReviews()
      } catch (error) {
        log(`[matching] sdg decisions unavailable: ${codeOf(error)}`)
      }
    }
    const hashed = data.sdg.links.map((l) => ({ ...l, hash: linkHash(l) }))
    return linkStatuses(hashed, reviews)
      .filter((l) => l.status === 'approved')
      .map(({ hash, reviewId, reviewedBy, ...l }) => ({ ...l, approvedAt: l.reviewedAt }))
  }

  // Everything one role needs, for both answers.
  function roleCore(role, data, mine, signals) {
    const r = data.chain.resolve(role.code)
    const jobs = r.jobs.map((code) => ({ code, title: data.jobs.get(code)?.title ?? null, items: data.jobs.get(code)?.items ?? [] }))
    const { best, others } = jobs.length ? bestFit(jobs, mine.levels) : { best: null, others: [] }
    const aei = best ? aeiForJob(best.code, data.tasksByJob, data.aeiByTask) : null
    const moderate = { ...aiPart('moderate', { aei }), onetCode: best?.code ?? null }
    // ISCO-08 only from the bridge step masco2020_unit_to_isco08 (spec M15), never a stand-in: no code -> not available,
    // with the chain's missing step so the screen can say why.
    const isco = r.isco ?? null
    const rapid = { ...aiPart('rapid', { ilo: isco ? data.ilo.get(isco) : null }), isco, missingStep: isco ? null : r.missingStep }
    const jobAds = jobAdsOf(signals, role.code)
    return { chain: r, best, others, ai: { moderate, rapid }, jobAds, bands: { moderate: bandOf(jobAds, moderate), rapid: bandOf(jobAds, rapid) } }
  }

  // Official UN goal titles (data/sdg/targets.json, UN Statistics Division SDG API), by goal number.
  const goalTitlesOf = (data) => Object.fromEntries(arr(data.sdg.targets.goals).map((g) => [String(g.code), g.title ?? null]))

  const skillMatchOf = (best, mine) =>
    mine.usable && best
      ? { percent: best.fit.percent, met: round2(best.fit.met), needed: round2(best.fit.needed), provisional: best.fit.provisional, onetCode: best.code, onetTitle: best.title }
      : null

  async function list(profile, request) {
    const data = await loadData()
    const mine = readProfile(profile, data)
    const [{ signals, info }, pointers, approved] = await Promise.all([radarInputs(request), profilePointers(profile, loadReferences, log), approvedLinks(data)])
    const roles = data.roles.map((role) => {
      const core = roleCore(role, data, mine, signals)
      const via = inFieldOf(role.code, core.chain.jobs, pointers)
      return {
        code: role.code,
        title: role.title,
        url: role.url,
        inField: via.length > 0,
        inFieldVia: via,
        skillMatch: skillMatchOf(core.best, mine),
        unavailable: core.chain.missingStep ? { missingStep: core.chain.missingStep } : null,
        bands: core.bands,
        sdgGoals: goalsOfRole(approved, role.code),
      }
    })
    return {
      sources: data.sources,
      radar: info,
      profile: { usable: mine.usable, provisional: mine.provisional, unusedIds: mine.unusedIds },
      goalTitles: goalTitlesOf(data),
      roles,
    }
  }

  async function role(profile, code, request) {
    const data = await loadData()
    const found = data.roles.find((r) => r.code === code)
    if (!found) return null
    const mine = readProfile(profile, data)
    const [{ signals, inDemand, info }, approved] = await Promise.all([radarInputs(request), approvedLinks(data)])
    const core = roleCore(found, data, mine, signals)
    const { best } = core
    const jobs = best ? [best, ...core.others].map((j) => ({ code: j.code, title: j.title, percent: mine.usable ? j.fit.percent : null })) : []
    const fit = mine.usable && best
      ? {
          onetCode: best.code,
          onetTitle: best.title,
          met: round2(best.fit.met),
          needed: round2(best.fit.needed),
          percent: best.fit.percent,
          provisional: best.fit.provisional,
          rows: best.fit.rows.map((row) => ({ ...row, needed: round2(row.needed), gap: round2(row.gap) })),
          raise: best.fit.raise,
          leftOut: data.jobs.get(best.code)?.leftOut ?? [],
        }
      : null
    let software = []
    if (best) {
      const flagged = new Set(arr(inDemand[best.code]).map((n) => nameKey(n)))
      const names = new Map()
      for (const n of [...(data.jobs.get(best.code)?.software ?? []), ...arr(inDemand[best.code])]) if (!names.has(nameKey(n))) names.set(nameKey(n), n)
      software = [...names].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([key, name]) => ({ name, inDemand: flagged.has(key), have: mine.software.has(key) }))
    }
    const targetTitle = new Map(arr(data.sdg.targets.targets).map((t) => [t.code, t.title]))
    const tags = roleLinks(approved, found.code).map((l) => ({
      id: l.id, goal: Number(String(l.target).split('.')[0]), target: l.target, targetTitle: targetTitle.get(l.target) ?? null, reason: l.reason, approvedAt: l.approvedAt,
    }))
    const gapKeys = best ? best.fit.rows.filter((row) => row.gap > 0).map((row) => row.key) : []
    return {
      code: found.code,
      title: found.title,
      url: found.url,
      description: found.description,
      radar: info,
      chain: { path: core.chain.path, missingStep: core.chain.missingStep },
      jobs,
      fit,
      outlook: { jobAds: core.jobAds, ai: core.ai },
      software,
      sdg: { tags, pathPreview: pathContribution(approved, found.code, gapKeys), goalTitles: goalTitlesOf(data) },
    }
  }

  return { list, role, sdgDecided }
}

// The app's matching service: data from dataDir (loaded once), the Radar's references and review store.
export function createMatchingServiceFromEnv({ dataDir, radar = null, demo = null, access = null, references = undefined, now = () => new Date(), log } = {}) {
  const refs = references !== undefined ? references : radar?.references ? () => radar.references() : () => loadRadarReferences(dataDir)
  return createMatchingService({
    loadData: once(() => loadMatchingData(dataDir)),
    radar,
    references: refs,
    demo,
    access,
    store: radar?.store ?? null,
    now,
    ...(log ? { log } : {}),
  })
}
