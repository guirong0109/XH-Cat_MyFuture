// CV text lines → draft structured profile (spec §6). L1 sections, L2 rules and dictionaries, L3 semantic match
// (a hook filled by server/cv/semantic.js), L4 merge + schema check + uncertain list.
// Nothing here is confirmed, and a skill level is never set from a CV.
import { emptyProfile, makeSkill, val, validateProfile } from '../../shared/profileSchema.js'
import { mergeSkills } from '../skills/normalize.js'
import { nameKey, wordsOf } from '../skills/onetSkills.js'
import { DATE_RANGE, PERSONAL_LINE, QUALIFICATIONS, SECTION_WORDS, rangeMonths } from './patterns.js'

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
      fieldOfStudy: parts[0]?.replace(/\b(?:19|20)\d{2}\b.*$/, '').trim() ?? '',
      institution: parts.slice(1).find((part) => part && !/^\d{4}\)?$/.test(part)) ?? '',
      year,
      userConfirmed: false,
      extraction: extraction('pattern', line, 0.9),
    })
  }
  return out
}

function employment(rows, hasSection, extraction, now) {
  const records = []
  let months = 0
  rows.forEach(({ line, section }, i) => {
    if (section === 'education' || (hasSection && section !== 'experience')) return
    const match = DATE_RANGE.exec(line)
    if (!match) return
    months += rangeMonths(match, now)
    let before = line.slice(0, match.index).replace(/[,|·(\s-]+$/u, '').trim()
    if (!before && i > 0) before = rows[i - 1].line
    const [title, employer] = before.split(/\s*,\s*|\s+at\s+|\s+di\s+/i)
    if (!title) return
    records.push({ jobTitle: title.trim(), employer: employer?.trim() ?? '', period: match[0].trim(), userConfirmed: false, extraction: extraction('pattern', line, 0.9) })
  })
  return { records, years: months ? Math.round((months / 12) * 10) / 10 : null }
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
  for (const { line, heading } of rows) {
    if (heading) continue
    const words = wordsOf(line)
    const original = line.split(/\s+/)
    for (let size = MAX_NGRAM; size >= 1; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const entry = catalogue.byName.get(words.slice(start, start + size).join(' '))
        if (!entry || !entry.id.startsWith('onet:tech:')) continue
        // A one-word software name counts only when written as a name (capitalised), e.g. "Python", not "python".
        if (size === 1 && !original.some((w) => nameKey(w.replace(/[^\p{L}\p{N}+#.]/gu, '')) === words[start] && /\p{Lu}/u.test(w))) continue
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
  profile.projects = sectionRecords(rows, 'projects', 'title', extraction)
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

  // L4: one entry per skill; uncertain items listed for the review.
  layers.push('L4')
  profile.skills = mergeSkills(skills)
  const uncertain = []
  profile.skills.forEach((skill, i) => {
    if (!skill.canonicalId) uncertain.push({ path: `skills.${i}`, reason: 'unknown_skill' })
    else if (skill.source === 'cv_semantic' && skill.extraction?.lowSimilarity) uncertain.push({ path: `skills.${i}`, reason: 'low_similarity' })
  })
  if (!validateProfile(profile).ok) warnings.push('schema_problem')
  return { profile, uncertain, layers, warnings }
}
