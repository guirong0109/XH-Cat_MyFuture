// Joins the rules reader's draft and the AI reader's draft (spec §6). Rules win; the AI fills what rules left empty and
// adds what rules missed; a different wording is kept beside the rules value and flagged. Pure: inputs are not changed.
import { mergeSkills } from '../skills/normalize.js'
import { levelFromUse } from '../../shared/profileSchema.js'
import { levelOf } from './patterns.js'

const norm = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const ALNUM = /[\p{L}\p{N}]/u
const MIN_EVIDENCE = 8

// The shorter quote (at least 8 characters) must sit inside the longer one on word boundaries.
function evidenceFits(a, b) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < MIN_EVIDENCE) return false
  for (let at = long.indexOf(short); at >= 0; at = long.indexOf(short, at + 1)) {
    const before = long[at - 1]
    const after = long[at + short.length]
    if ((before === undefined || !ALNUM.test(before)) && (after === undefined || !ALNUM.test(after))) return true
  }
  return false
}

const sameByEvidence = (rules, ai) => evidenceFits(norm(rules.extraction?.evidence), norm(ai.extraction?.evidence))

// Equal main field, unless a second identity field (job employer, education institution) is filled in on both and differs.
const sameByMain = (rules, ai, main, second) => {
  const m = norm(rules[main])
  if (!m || m !== norm(ai[main])) return false
  if (!second) return true
  const a = norm(rules[second])
  const b = norm(ai[second])
  return !a || !b || a === b
}

// Joins one list. Returns the new list and, for each matched AI record, the rules record it was matched to.
// AI records are matched to the rules records only (never to an AI record added before): first every AI record by its
// quote, then the ones left by an equal main field. A rules record is matched at most once.
function joinList(rulesList, aiList, { main, second, fields, path, uncertain, onFilled, sameMeaning }) {
  const list = rulesList.map((record) => ({ ...record, extraction: record.extraction ? { ...record.extraction } : record.extraction }))
  const used = new Set()
  const target = aiList.map(() => -1)
  const pass = (fits) => aiList.forEach((ai, k) => {
    if (target[k] >= 0) return
    const i = rulesList.findIndex((record, at) => !used.has(at) && fits(record, ai))
    if (i >= 0) {
      target[k] = i
      used.add(i)
    }
  })
  pass(sameByEvidence)
  pass((record, ai) => sameByMain(record, ai, main, second))
  const matches = []
  for (const [k, ai] of aiList.entries()) {
    const i = target[k]
    if (i < 0) {
      list.push({ ...ai, extraction: ai.extraction ? { ...ai.extraction } : ai.extraction })
      continue
    }
    const record = list[i]
    matches.push({ ai, rules: record })
    for (const field of fields) {
      const mine = String(record[field] ?? '')
      const theirs = String(ai[field] ?? '')
      if (!mine.trim() && theirs.trim()) {
        record[field] = theirs
        record.extraction = { ...record.extraction, aiFilled: [...(record.extraction?.aiFilled ?? []), field] }
        onFilled?.(record, field)
      } else if (mine.trim() && theirs.trim() && norm(mine) !== norm(theirs) && !sameMeaning?.(record, field, theirs)) {
        record.extraction = { ...record.extraction, aiDiffers: { ...record.extraction?.aiDiffers, [field]: theirs } }
        uncertain.push({ path: `${path}.${i}.${field}`, reason: 'ai_differs', aiValue: theirs })
      }
    }
  }
  return { list, matches }
}

// A suggestion is dropped when its id is already a skill in the draft, or an earlier skill kept the same one.
function dropTakenSuggestions(skills) {
  const taken = new Set(skills.map((s) => s.canonicalId).filter(Boolean))
  return skills.map((skill) => {
    if (!skill.aiSuggestion) return skill
    if (taken.has(skill.aiSuggestion.id)) {
      const { aiSuggestion, ...rest } = skill
      return rest
    }
    taken.add(skill.aiSuggestion.id)
    return skill
  })
}

export function mergeDrafts({ profile, uncertain }, aiProfile) {
  if (!aiProfile) return { profile, uncertain }
  const flags = [...uncertain]
  const education = joinList(profile.education.records, aiProfile.education.records, {
    main: 'qualification', second: 'institution', fields: ['qualification', 'fieldOfStudy', 'institution'], path: 'education.records', uncertain: flags,
    onFilled: (record, field) => { if (field === 'qualification') record.level = levelOf(record.qualification) },
    // The rules store a label ("Bachelor degree") where the AI quotes the CV ("Bachelor of Computer Science"): same level, no flag.
    sameMeaning: (record, field, theirs) => field === 'qualification' && Boolean(levelOf(theirs)) && levelOf(theirs) === (record.level || levelOf(record.qualification)),
  })
  const jobs = joinList(profile.employment.records, aiProfile.employment.records, {
    main: 'jobTitle', second: 'employer', fields: ['jobTitle', 'employer'], path: 'employment.records', uncertain: flags,
  })
  const projects = joinList(profile.projects, aiProfile.projects, {
    main: 'title', fields: ['title', 'description'], path: 'projects', uncertain: flags,
  })
  const certifications = joinList(profile.certifications, aiProfile.certifications, {
    main: 'name', fields: [], path: 'certifications', uncertain: flags,
  })

  // A skill's places follow the title the kept record has, not the AI's wording.
  const renamed = { job: new Map(), project: new Map() }
  for (const { ai, rules } of jobs.matches) renamed.job.set(norm(ai.jobTitle), rules.jobTitle)
  for (const { ai, rules } of projects.matches) renamed.project.set(norm(ai.title), rules.title)
  const places = (skill) => (skill.usedIn ?? []).map((place) => ({ ...place, title: renamed[place.kind]?.get(norm(place.title)) ?? place.title }))

  const skills = profile.skills.map((skill) => ({ ...skill, usedIn: [...(skill.usedIn ?? [])] }))
  for (const ai of aiProfile.skills) {
    const aiPlaces = places(ai)
    // Both identified: the ids decide. Otherwise the names do.
    const same = skills.find((s) => (s.canonicalId && ai.canonicalId ? s.canonicalId === ai.canonicalId : norm(s.name) === norm(ai.name)))
    if (!same) {
      skills.push({ ...ai, usedIn: aiPlaces })
      continue
    }
    if (ai.aiSuggestion && !same.aiSuggestion) same.aiSuggestion = ai.aiSuggestion
    for (const place of aiPlaces) if (!same.usedIn.some((p) => p.kind === place.kind && p.title === place.title)) same.usedIn.push(place)
  }

  return {
    profile: {
      ...profile,
      education: { ...profile.education, records: education.list },
      employment: { ...profile.employment, records: jobs.list },
      projects: projects.list,
      certifications: certifications.list,
      skills: dropTakenSuggestions(mergeSkills(skills).map(levelFromUse)),
    },
    uncertain: flags,
  }
}
