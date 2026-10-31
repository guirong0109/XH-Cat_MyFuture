// Team service: the shared skills of each person go through matching's own role answer; the sums come from
// shared/org/team.js. Nothing here is stored. Logs carry codes only, never names, skills or item keys.
import { OrgError } from './store.js'
import { bandCounts, heatmap, moved, planSteps, sliceOf, teamSdg } from '../../shared/org/team.js'

const STEP_GROUPS = ['gaps', 'notAssessed', 'met']
const usable = (s) => s != null && s.available && Array.isArray(s.rows)
const codeOf = (error) => error?.code ?? error?.name ?? 'error'

export function profileOf(skills) {
  return {
    skills: (skills ?? []).map((s) => ({
      canonicalId: `onet:${s.key}`,
      name: s.key,
      proficiency: s.level === 'not_assessed' ? null : s.level,
    })),
  }
}

// A role code matching does not know: left out like a broken chain, with its own reason.
const unknownSlice = (code) => ({
  code, title: null, available: false, reason: 'unknown_role', missingStep: null, percent: null, provisional: false,
  rows: null, bands: { moderate: 4, rapid: 4 }, sdgLinks: [],
})

const outRole = (s) => (s == null ? null : {
  code: s.code, title: s.title ?? null, available: s.available, reason: s.reason, missingStep: s.missingStep, percent: s.percent, provisional: s.provisional,
})

// Most common code; ties go to the lowest code. Null when there is none.
function commonCode(codes) {
  const counts = new Map()
  for (const c of codes) if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best = null
  for (const [code, n] of counts) {
    if (best === null || n > counts.get(best) || (n === counts.get(best) && code < best)) best = code
  }
  return best
}

export function createOrgService({ store, matching, pathway, log = () => {} }) {
  async function sliceFrom(skills, code, request) {
    if (!code) return null
    const answer = await matching.role(profileOf(skills), code, request)
    return answer ? sliceOf(answer) : unknownSlice(code)
  }

  async function build(ownerId, { view, scenario }, request) {
    const org = await store.orgOf(ownerId)
    if (!org) throw new OrgError('not_found', 404)
    const effective = org.type === 'centre' && view === 'current' ? 'target' : view
    const [groups, roster] = await Promise.all([store.groups(org.id), store.people(org.id)])
    const targetOf = new Map(groups.map((g) => [g.id, g.targetCode]))

    const people = await Promise.all(roster.map(async (p) => {
      const [current, target] = await Promise.all([
        org.type === 'hr' ? sliceFrom(p.skills, p.currentCode, request) : null,
        sliceFrom(p.skills, targetOf.get(p.groupId) ?? null, request),
      ])
      return { id: p.id, groupId: p.groupId, current, target }
    }))

    const map = heatmap(groups, people, effective)
    const { leftOut: chainLeftOut, ...heat } = map
    // an hr person with no current role has nothing to compare in the current view: counted, with its reason
    const noCurrent = effective === 'current'
      ? people.filter((p) => p.current === null && groups.some((g) => g.id === p.groupId))
        .map((p) => ({ personId: p.id, groupId: p.groupId, reason: 'no_current_role', missingStep: null }))
      : []
    const leftOut = [...chainLeftOut, ...noCurrent]

    // role titles come from matching's role answers of the people (null when no one has that role)
    const titles = new Map()
    for (const p of people) for (const s of [p.current, p.target]) if (s?.code && s.title) titles.set(s.code, s.title)
    const titleOf = (code) => (code ? titles.get(code) ?? null : null)
    const plans = {}
    const sdg = {}
    let sources = null
    const pathways = new Map()
    // a failed pathway answer counts as no answer: the plan keeps its steps without picks or search links
    const pathwayOf = async (person, code) => {
      const id = `${person.id}|${code}`
      if (!pathways.has(id)) {
        pathways.set(id, Promise.resolve()
          .then(() => pathway.pathway(profileOf(person.skills), code, request))
          .catch((error) => { log(`[org] pathway failed: ${codeOf(error)}`); return null }))
      }
      const answer = await pathways.get(id)
      if (sources === null && Array.isArray(answer?.sources)) sources = answer.sources
      return answer
    }

    for (const g of groups) {
      const members = people.filter((p) => p.groupId === g.id)
      let roleCode
      let noRole = null
      let planPeople
      if (effective === 'target') {
        roleCode = g.targetCode ?? null
        planPeople = members
        if (!roleCode) noRole = 'no_target'
      } else {
        // the most common current code among people with a Skill Match; a broken chain is never the plan role
        roleCode = commonCode(members.filter((p) => usable(p.current)).map((p) => p.current.code))
        planPeople = roleCode ? members.filter((p) => p.current?.code === roleCode) : []
        if (!roleCode) noRole = members.some((p) => p.current) ? 'none_available' : 'no_current_role'
      }
      const steps = roleCode ? planSteps(g.id, planPeople, effective) : []
      const statuses = roleCode ? await store.planSteps(org.id, g.id, roleCode) : new Map()
      const found = new Map()
      const byId = new Map(roster.map((p) => [p.id, p]))
      for (const m of planPeople) {
        if (!roleCode || steps.every((s) => found.has(s.key))) break
        const answer = await pathwayOf(byId.get(m.id), roleCode)
        for (const grp of STEP_GROUPS) {
          for (const s of answer?.steps?.[grp] ?? []) if (!found.has(s.key)) found.set(s.key, s)
        }
      }
      plans[g.id] = {
        roleCode,
        roleTitle: titleOf(roleCode),
        noRole,
        counted: planPeople.filter((p) => usable(effective === 'target' ? p.target : p.current)).length,
        steps: steps.map((s) => ({
          ...s,
          status: statuses.get(s.key) ?? 'planned',
          courses: found.get(s.key)?.courses ?? [],
          search: found.get(s.key)?.search ?? [],
        })),
      }
      sdg[g.id] = teamSdg(g.id, planPeople, effective, steps.map((s) => s.key))
    }

    // the sources are always shown: if no plan needed a pathway answer, ask once for the list
    if (sources === null) {
      for (const p of roster) {
        const code = (effective === 'target' ? targetOf.get(p.groupId) : p.currentCode) ?? null
        if (!code) continue
        await pathwayOf(p, code)
        break
      }
    }

    // matching's own dated sources (AI, SDG, eMASCO, O*NET) and the job-ad data date, for the Outlook and SDG tabs
    let outlookSources = []
    try {
      const listed = await matching.list(profileOf([]), request)
      outlookSources = Array.isArray(listed?.sources) ? [...listed.sources] : []
      const radar = listed?.radar
      if (radar?.state === 'data') {
        outlookSources.push({ id: 'dosm', name: `DOSM online job vacancies (MASCO major group)${radar.observationPeriod ? `, ${radar.observationPeriod}` : ''}`, url: null, date: radar.publishedAt ?? null })
      }
    } catch (error) {
      log(`[org] sources failed: ${codeOf(error)}`)
    }

    return {
      org: { id: org.id, name: org.name, type: org.type },
      view: effective,
      scenario,
      groups: groups.map((g) => ({ ...g, targetTitle: titleOf(g.targetCode), size: roster.filter((p) => p.groupId === g.id).length })),
      people: roster.map((p, i) => ({
        id: p.id, groupId: p.groupId, displayName: p.displayName, source: p.source, addedAt: p.addedAt,
        current: outRole(people[i].current), target: outRole(people[i].target),
      })),
      heatmap: heat,
      plans,
      bands: bandCounts(groups, people, effective, scenario),
      moved: moved(people, effective),
      sdg,
      leftOut,
      sources: sources ?? [],
      outlookSources,
    }
  }

  async function team(ownerId, options, request) {
    try {
      return await build(ownerId, options, request)
    } catch (error) {
      if (!(error instanceof OrgError)) log(`[org] team failed: ${error?.code ?? error?.name ?? 'error'}`)
      throw error
    }
  }

  return { team }
}
