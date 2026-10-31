// Study Pathway service (spec §5-§10). The profile is a function argument only: it is passed to matching for this answer
// and dropped. Nothing here stores it or logs it; logs carry codes only. No language model; trends and AI play no part.
//
// createPathwayService({loadData, matching, store, now, log}) ->
//   {pathway(profile, code, request) -> Answer | null (unknown code), picksDecided() -> drops the cached pick decisions}
//   loadData: async () => loadPathwayData(...) result (throws PathwayDataError).
//   matching: the matching service; its role() answer gives the code chain, the O*NET job and the Skill Match rows, so
//   the numbers are matching's by construction. store: the Radar review store (pick decisions, kind 'pathway_pick').
import { pathwaySteps } from '../../shared/pathway/steps.js'
import { educationFor, fieldsFor } from '../../shared/pathway/route.js'
import { PICK_KIND, searchLinks, searchWordFor, shownPicks } from '../../shared/pathway/picks.js'
import { loadReviews } from '../radar/reviews.js'
import { SDG_TTL_MS, once } from '../matching/service.js'
import { loadPathwayData } from './data.js'

export const MQR_URL = 'https://www2.mqa.gov.my/mqr/english/ecarianakr.cfm'
// The NEC field to choose in MQR for an ISCED-F field. NEC codes read like ISCED-F codes, but MQR numbers 0611-0614,
// 0712-0717 and 0731-0734 differently (e.g. NEC 0712 Electricity and energy, 0716 Civil engineering, 0732 Urban and
// Regional Planning), so no code is given there (the screen names the field instead), except the pairs the team checked
// by name in MQR on 2026-10-31 (.superpowers/sdd/2026-10-31-study-pathway/task-9-fix-report.md): ISCED 0611 Computer
// use = NEC 0614 Computer Use; ISCED 0712 Environmental protection technology = NEC 0717. Elsewhere: the same code
// (code match, not an official table).
const NEC_CHECKED = { '0611': '0614', '0712': '0717' }
const NEC_DIFFERS = /^07[13]|^061/
export function necFor(code) {
  if (Object.hasOwn(NEC_CHECKED, code)) return { nec: NEC_CHECKED[code], necChecked: true }
  return { nec: NEC_DIFFERS.test(String(code)) ? null : code, necChecked: false }
}
// Pick decisions are read from the review store at most once a minute, as the SDG decisions are.
export const PICKS_TTL_MS = SDG_TTL_MS
const GROUP_ORDER = ['malaysian', 'global', 'tech', 'professional']
const arr = (v) => (Array.isArray(v) ? v : [])
const codeOf = (error) => error?.code ?? error?.name ?? 'Error'

export function createPathwayService({ loadData, matching, store = null, now = () => new Date(), log = (message) => console.error(message), picksTtlMs = PICKS_TTL_MS }) {
  // {at, promise} of the last decision read; a failed read is not kept (as sdgReviews in server/matching/service.js).
  let cache = null
  function pickReviews() {
    const at = now().getTime()
    if (cache && at - cache.at >= 0 && at - cache.at < picksTtlMs) return cache.promise
    const entry = { at, promise: null }
    entry.promise = loadReviews(store, PICK_KIND).catch((error) => {
      if (cache === entry) cache = null
      throw error
    })
    cache = entry
    return entry.promise
  }
  function picksDecided() {
    cache = null
  }

  // Every pick the owner has not rejected (approvedAt null = not yet reviewed). The hash stays on the server.
  async function picksShown(data) {
    let reviews = []
    if (store) {
      try {
        reviews = await pickReviews()
      } catch (error) {
        log(`[pathway] reviews unavailable: ${codeOf(error)}`)
      }
    }
    return shownPicks(data.picks, reviews).map(({ hash, ...p }) => p)
  }

  // Each course pick carries its site's name from sites.json (every site, also those with no search link). Picks are
  // listed by site group (Malaysian, global, tech, then professional; spec §5), in file order within a group.
  const siteOf = (sites, id) => (sites ?? []).find((s) => s.id === id)
  const groupAt = (sites, id) => {
    const at = GROUP_ORDER.indexOf(siteOf(sites, id)?.group)
    return at < 0 ? GROUP_ORDER.length : at
  }
  const coursesFor = (shown, key, sites) => shown
    .filter((p) => p.type === 'course' && p.for === key)
    .map((p, i) => ({ p, i, at: groupAt(sites, p.site) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map(({ p }) => ({ ...p, siteName: siteOf(sites, p.site)?.name ?? null }))
  const searchFor = (shown, key, name, sites) => searchLinks(searchWordFor(key, shown, name), sites)

  function routeOf(data, onetCode, profile, shown) {
    const yours = arr(profile?.education?.records).map((r) => r?.field?.code).filter((c) => typeof c === 'string' && c)
    const fields = fieldsFor(data.routeIndex, onetCode, yours).map((f) => {
      const key = `field:${f.code}`
      const programmes = shown.filter((p) => p.type === 'programme' && p.for === key)
      return {
        ...f,
        programmes: programmes.filter((p) => p.kind === 'accredited'),
        professional: programmes.filter((p) => p.kind === 'professional'),
        courses: coursesFor(shown, key, data.sites),
        search: searchFor(shown, key, f.title, data.sites),
        mqr: { url: MQR_URL, ...necFor(f.code) },
      }
    })
    return { education: educationFor(data.education, onetCode), fields }
  }

  function stepsOf(data, rows, shown) {
    const { gaps, notAssessed, met, provisional } = pathwaySteps(rows)
    const dress = (s) => ({ ...s, courses: coursesFor(shown, s.key, data.sites), search: searchFor(shown, s.key, s.name, data.sites) })
    return { steps: { gaps: gaps.map(dress), notAssessed: notAssessed.map(dress), met: met.map(dress) }, provisional }
  }

  async function pathway(profile, code, request) {
    // The role first: an unknown code is 404 even when the pathway data cannot be read.
    const role = await matching.role(profile, code, request)
    if (!role) return null
    const data = await loadData()
    const broken = Boolean(role.chain?.missingStep) || !arr(role.jobs).length
    const job = broken ? null : role.fit ? { code: role.fit.onetCode, title: role.fit.onetTitle } : { code: role.jobs[0].code, title: role.jobs[0].title }
    const shown = broken ? [] : await picksShown(data)
    const route = broken ? null : routeOf(data, job.code, profile, shown)
    const built = !broken && role.fit ? stepsOf(data, role.fit.rows, shown) : null
    return {
      code: role.code,
      title: role.title,
      qualification: { text: data.qualifications.get(role.code) ?? null, url: role.url ?? null },
      onet: job,
      chain: { path: role.chain?.path ?? [], missingStep: role.chain?.missingStep ?? null },
      skillMatch: role.fit?.percent ?? null,
      provisional: built?.provisional ?? false,
      reason: broken ? 'chain_broken' : built ? null : 'no_known_skill',
      route,
      steps: built?.steps ?? null,
      sources: data.sources,
    }
  }

  return { pathway, picksDecided }
}

// The app's pathway service: data from dataDir (loaded once), or the data the start-up check already loaded
// (server/index.js), matching's role answer, the Radar review store.
// No matching service -> no pathway service (the route answers 503 not_configured).
// loadData: the one shared loader (server/app.js gives the same one to the admin routes); else made here from data / dataDir.
export function createPathwayServiceFromEnv({ dataDir, data = null, loadData: shared = null, matching, store = null, now = () => new Date(), log } = {}) {
  if (!matching) return null
  const loadData = shared ?? (data ? async () => data : once(() => loadPathwayData(dataDir)))
  return createPathwayService({ loadData, matching, store, now, ...(log ? { log } : {}) })
}
