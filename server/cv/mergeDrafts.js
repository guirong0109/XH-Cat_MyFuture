// Joins the rules reader's draft and the AI reader's draft (spec §6). Rules win; the AI fills what rules left empty and
// adds what rules missed; a different wording is kept beside the rules value and flagged. Pure: inputs are not changed.
import { mergeSkills } from '../skills/normalize.js'
import { levelFromUse } from '../../shared/profileSchema.js'
import { levelOf } from './patterns.js'

const norm = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const sameRecord = (rules, ai, main) => {
  const a = norm(rules.extraction?.evidence)
  const b = norm(ai.extraction?.evidence)
  if (a && b && (a.includes(b) || b.includes(a))) return true
  const m = norm(rules[main])
  return Boolean(m) && m === norm(ai[main])
}

// Joins one list. Returns the new list and, for each matched AI record, the rules record it was matched to.
function joinList(rulesList, aiList, { main, fields, path, uncertain, onFilled }) {
  const list = rulesList.map((record) => ({ ...record, extraction: record.extraction ? { ...record.extraction } : record.extraction }))
  const used = new Set()
  const matches = []
  for (const ai of aiList) {
    const i = list.findIndex((record, at) => !used.has(at) && sameRecord(record, ai, main))
    if (i < 0) {
      list.push({ ...ai, extraction: ai.extraction ? { ...ai.extraction } : ai.extraction })
      continue
    }
    used.add(i)
    const record = list[i]
    matches.push({ ai, rules: record })
    for (const field of fields) {
      const mine = String(record[field] ?? '')
      const theirs = String(ai[field] ?? '')
      if (!mine.trim() && theirs.trim()) {
        record[field] = theirs
        record.extraction = { ...record.extraction, aiFilled: [...(record.extraction?.aiFilled ?? []), field] }
        onFilled?.(record, field)
      } else if (mine.trim() && theirs.trim() && norm(mine) !== norm(theirs)) {
        record.extraction = { ...record.extraction, aiDiffers: { ...record.extraction?.aiDiffers, [field]: theirs } }
        uncertain.push({ path: `${path}.${i}.${field}`, reason: 'ai_differs', aiValue: theirs })
      }
    }
  }
  return { list, matches }
}

export function mergeDrafts({ profile, uncertain }, aiProfile) {
  if (!aiProfile) return { profile, uncertain }
  const flags = [...uncertain]
  const education = joinList(profile.education.records, aiProfile.education.records, {
    main: 'qualification', fields: ['qualification', 'fieldOfStudy', 'institution'], path: 'education.records', uncertain: flags,
    onFilled: (record, field) => { if (field === 'qualification') record.level = levelOf(record.qualification) },
  })
  const jobs = joinList(profile.employment.records, aiProfile.employment.records, {
    main: 'jobTitle', fields: ['jobTitle', 'employer'], path: 'employment.records', uncertain: flags,
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
    const same = skills.find((s) => (s.canonicalId && ai.canonicalId && s.canonicalId === ai.canonicalId) || norm(s.name) === norm(ai.name))
    if (!same) {
      skills.push({ ...ai, usedIn: aiPlaces })
      continue
    }
    for (const place of aiPlaces) if (!same.usedIn.some((p) => p.kind === place.kind && p.title === place.title)) same.usedIn.push(place)
  }

  return {
    profile: {
      ...profile,
      education: { ...profile.education, records: education.list },
      employment: { ...profile.employment, records: jobs.list },
      projects: projects.list,
      certifications: certifications.list,
      skills: mergeSkills(skills).map(levelFromUse),
    },
    uncertain: flags,
  }
}
