// CV text lines → draft structured profile (spec §6). L1 sections, L2 rules and dictionaries, L3 semantic match
// (a hook filled by server/cv/semantic.js), L4 merge + schema check + uncertain list.
// Nothing here is confirmed. The only level set from a CV: Good (from_projects) for a skill used in a job or project.
import { emptyProfile, levelFromUse, makeSkill, val, validateProfile } from '../../shared/profileSchema.js'
import { mergeSkills } from '../skills/normalize.js'
import { nameKey, wordsOf } from '../skills/onetSkills.js'
import { DATE_RANGE, PERSONAL_LINE, QUALIFICATIONS, SECTION_WORDS, levelOfLabel, rangeMonths } from './patterns.js'

export const EXTRACTOR_VERSION = 'cv-1.0'
const MAX_LINES = 300
const MAX_LINE_CHARS = 500
const MAX_NGRAM = 5
const EVIDENCE_CHARS = 160
const MAX_ITEM_WORDS = 4
const LIST_SEPARATOR = /[,;•|/·]/

const cut = (text) => (text.length > EVIDENCE_CHARS ? `${text.slice(0, EVIDENCE_CHARS - 1)}…` : text)

function sectionOf(line) {
  const text = line.toLowerCase().replace(/[:：\s]+$/u, '').trim()
  if (text.length > 40) return null
  for (const [section, words] of Object.entries(SECTION_WORDS)) if (words.includes(text)) return section
  return null
}

// L1: the section of every line ('other' before the first heading).
function splitSections(lines) {
  let current = 'other'
  return lines.map((line) => {
    const heading = sectionOf(line)
    if (heading) current = heading
    return { line, section: current, heading: Boolean(heading) }
  })
}

function education(rows, hasSection, extraction) {
  const out = []
  for (const { line, section, heading } of rows) {
    if (heading || (hasSection && section !== 'education')) continue
    const found = QUALIFICATIONS.find(([re, label]) => re.test(line) && (label !== 'Certificate' || section === 'education'))
    if (!found) continue
    const match = found[0].exec(line)
    const after = line.slice(match.index + match[0].length).replace(/^\s*(?:in|of|dalam|bidang)\b/i, '')
    const parts = after.split(/,|\(|\s[-–]\s/).map((part) => part.trim())
    const year = line.match(/\b(?:19|20)\d{2}\b/g)?.at(-1) ?? ''
    out.push({
      qualification: found[1],
      // Chosen for the user to check (owner, 31 Oct), from the qualification the line names.
      level: levelOfLabel(found[1]),
      fieldOfStudy: parts[0]?.replace(/\b(?:19|20)\d{2}\b.*$/, '').trim() ?? '',
      institution: parts.slice(1).find((part) => part && !/^\d{4}\)?$/.test(part)) ?? '',
      year,
      userConfirmed: false,
      extraction: extraction('pattern', line, 0.9),
    })
  }
  return out
}

// Description lines: one that starts with a bullet, ends a sentence or is longer than six words describes the job or
// project above it.
const BULLET = /^[•\-*▪–·●○■◦►]\s*/u
const DESCRIBES = (line) => BULLET.test(line) || /[.!]$/.test(line) || line.split(/\s+/).length > 6
// A description line as shown to the user: without its bullet.
const described = (line) => line.trim().replace(BULLET, '')

// owner: for each row of the Experience section, the index of the job it belongs to (from the job's first line to the
// line before the next job). The other lines of a job are its description; skills found in them are linked to it.
function employment(rows, hasSection, extraction, now) {
  const records = []
  const starts = []
  let months = 0
  rows.forEach(({ line, section }, i) => {
    if (section === 'education' || (hasSection && section !== 'experience')) return
    const match = DATE_RANGE.exec(line)
    if (!match) return
    months += rangeMonths(match, now)
    let before = line.slice(0, match.index).replace(/[,|·(\s-]+$/u, '').trim()
    let start = i
    if (!before && i > 0) {
      before = rows[i - 1].line
      start = i - 1
    }
    const [title, employer] = before.split(/\s*,\s*|\s+at\s+|\s+di\s+/i)
    if (!title) return
    records.push({ jobTitle: title.trim(), employer: employer?.trim() ?? '', period: match[0].trim(), description: '', userConfirmed: false, extraction: extraction('pattern', line, 0.9) })
    starts.push({ start, dateRow: i })
  })
  const owner = new Map()
  starts.forEach(({ start, dateRow }, j) => {
    const end = j + 1 < starts.length ? starts[j + 1].start : rows.length
    const lines = []
    for (let i = start; i < end && !rows[i].heading && rows[i].section === 'experience'; i++) {
      owner.set(i, j)
      if (i !== start && i !== dateRow) lines.push(described(rows[i].line))
    }
    records[j].description = lines.join(' ')
  })
  return { records, years: months ? Math.round((months / 12) * 10) / 10 : null, owner }
}

// A project line often holds the title and a short description ("Attendance dashboard built with React").
// Split at " - ", " – " or ": " (the separator is dropped), else at the first split word with at least two words
// (for 使用: two characters) before it; the description then starts with the split word.
const PROJECT_SEPARATOR = /\s+[-\u2013]\s+|:\s+/g
// A separator followed by a year, "Jan 2023" or "Present" is part of a date range, not the title/description split.
const DATE_START = /^(?:\d{4}\b|\d{1,2}[/.-]\d{4}\b|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|(?:present|now|current|sekarang|kini)\b)/i
const PROJECT_SPLIT_WORD = /\s(built with|built using|using|with|dengan|menggunakan)(?=\s)/gi
const USE_WORD_ZH = '\u4f7f\u7528'
export function splitProject(line) {
  const text = line.trim()
  for (const sep of text.matchAll(PROJECT_SEPARATOR)) {
    const after = text.slice(sep.index + sep[0].length).trim()
    if (sep.index > 0 && after && !DATE_START.test(after)) return { title: text.slice(0, sep.index).trim(), description: after }
  }
  let at = -1
  for (const m of text.matchAll(PROJECT_SPLIT_WORD)) {
    if (text.slice(0, m.index).trim().split(/\s+/).length >= 2) { at = m.index + 1; break }
  }
  const zh = text.indexOf(USE_WORD_ZH)
  if (zh >= 2 && (at === -1 || zh < at)) at = zh
  if (at === -1) return { title: text, description: '' }
  return { title: text.slice(0, at).trim(), description: text.slice(at).trim() }
}

// Projects: a short line is a project's title; a description line (above) belongs to the project before it.
// owner: row index → project index, as for jobs.
function projectRecords(rows, extraction) {
  const records = []
  const owner = new Map()
  rows.forEach((row, i) => {
    if (row.section !== 'projects' || row.heading) return
    const line = row.line.trim()
    if (records.length && DESCRIBES(line)) {
      const project = records[records.length - 1]
      project.description = [project.description, described(line)].filter(Boolean).join(' ')
    } else records.push({ ...splitProject(line), userConfirmed: false, extraction: extraction('section', line, 0.9) })
    owner.set(i, records.length - 1)
  })
  return { records, owner }
}

const sectionRecords = (rows, section, key, extraction) => rows
  .filter((row) => row.section === section && !row.heading)
  .map((row) => ({ [key]: row.line, userConfirmed: false, extraction: extraction('section', row.line, 0.9) }))

// L2 skills: tokens of the Skills section through the normaliser; software names found anywhere (whole words).
// Plain skill words (e.g. "Writing") are only taken from the Skills section, to avoid false matches in sentences.
async function skillsFromRules(rows, catalogue, normalizer, extraction) {
  const skills = []
  for (const { line, section, heading } of rows) {
    // A list line has separators or is a few words; a sentence is left to the catalogue scan below.
    if (section !== 'skills' || heading || (!LIST_SEPARATOR.test(line) && line.split(/\s+/).length > MAX_ITEM_WORDS)) continue
    for (const token of line.split(/[,;•|/·]|\band\b|\bdan\b/i).map((t) => t.trim())) {
      if (token.length < 2 || token.length > 60 || !/\p{L}/u.test(token)) continue
      const found = await normalizer.normalizeSkill(token)
      const skill = makeSkill({ ...found, source: 'cv_rules', extraction: extraction(found.canonicalId ? 'dictionary' : 'section', line, found.canonicalId ? 0.9 : 0.5) })
      skills.push(found.candidates?.length ? { ...skill, candidates: found.candidates } : skill)
    }
  }
  for (const { line, section, heading } of rows) {
    // Certificate and education lines name issuers and schools, not software the person used.
    if (heading || section === 'certifications' || section === 'education') continue
    const words = wordsOf(line)
    const original = line.split(/\s+/)
    const listLike = section === 'skills' || LIST_SEPARATOR.test(line)
    for (let size = MAX_NGRAM; size >= 1; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const entry = catalogue.byName.get(words.slice(start, start + size).join(' '))
        if (!entry || !entry.id.startsWith('onet:tech:')) continue
        // A one-word software name counts only when written as a name (capitalised), e.g. "Python", not "python",
        // and, in a sentence, not as its first word ("Chef at Hilton…", "Go to person for…").
        const asName = (w, i) => nameKey(w.replace(/[^\p{L}\p{N}+#.]/gu, '')) === words[start] && /\p{Lu}/u.test(w) && (listLike || i > 0)
        if (size === 1 && !original.some(asName)) continue
        skills.push(makeSkill({ name: entry.name, originalText: entry.name, canonicalId: entry.id, category: entry.category, source: 'cv_rules', extraction: extraction('dictionary', line, 1) }))
      }
    }
  }
  return skills
}

export async function extractProfile({ lines, language, interfaceLanguage, catalogue, normalizer, semanticStep = null, now = new Date() }) {
  const at = now.toISOString()
  const extraction = (method, evidence, confidence, kind = 'explicit') => ({ method, evidence: cut(evidence), confidence, extractorVersion: EXTRACTOR_VERSION, at, kind })
  const layers = ['L1', 'L2']
  const warnings = []

  const kept = lines.slice(0, MAX_LINES).map((line) => String(line).slice(0, MAX_LINE_CHARS)).filter((line) => !PERSONAL_LINE.test(line))
  const rows = splitSections(kept)
  const has = (section) => rows.some((row) => row.heading && row.section === section)

  const profile = emptyProfile({ inputMethod: 'cv', interfaceLanguage })
  profile.cvLanguage = language
  profile.dataProvenance.extractionModel = EXTRACTOR_VERSION
  profile.education.records = education(rows, has('education'), extraction)
  const work = employment(rows, has('experience'), extraction, now)
  profile.employment.records = work.records
  if (work.years !== null) profile.employment.yearsOfExperience = { ...val(work.years), source: 'cv_rules', kind: 'inferred' }
  profile.certifications = sectionRecords(rows, 'certifications', 'name', extraction)
  const projects = projectRecords(rows, extraction)
  profile.projects = projects.records
  profile.training = sectionRecords(rows, 'training', 'name', extraction)

  let skills = await skillsFromRules(rows, catalogue, normalizer, extraction)

  // L3: semantic match for what the rules missed (RunPod-hosted model). Skipped and reported when not available.
  if (!semanticStep) warnings.push('semantic_unavailable')
  else {
    try {
      skills = await semanticStep({ lines: kept, rows, skills, extraction })
      layers.push('L3')
    } catch {
      warnings.push('semantic_failed')
    }
  }

  // Where each skill was used: the job or project of the line it was found on (matched by the quoted line).
  const usedAt = new Map()
  rows.forEach((row, i) => {
    const job = work.owner.get(i)
    const project = projects.owner.get(i)
    if (job !== undefined) usedAt.set(cut(row.line), { kind: 'job', title: work.records[job].jobTitle })
    else if (project !== undefined) usedAt.set(cut(row.line), { kind: 'project', title: profile.projects[project].title })
  })
  skills = skills.map((skill) => ({ ...skill, usedIn: usedAt.has(skill.extraction?.evidence) ? [usedAt.get(skill.extraction.evidence)] : [] }))

  // L4: one entry per skill (with every job and project it was used in); uncertain items listed for the review.
  layers.push('L4')
  profile.skills = mergeSkills(skills).map(levelFromUse)
  const uncertain = []
  profile.skills.forEach((skill, i) => {
    if (!skill.canonicalId) uncertain.push({ path: `skills.${i}`, reason: 'unknown_skill' })
    else if (skill.source === 'cv_semantic' && skill.extraction?.lowSimilarity) uncertain.push({ path: `skills.${i}`, reason: 'low_similarity' })
  })
  if (!validateProfile(profile).ok) warnings.push('schema_problem')
  return { profile, uncertain, layers, warnings }
}
