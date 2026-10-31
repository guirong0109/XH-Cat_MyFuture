// Extraction evaluation (CV spec §12 "Extraction evaluation metrics"): builds each synthetic CV in
// testing/eval-cvs.json as a real PDF or DOCX, runs the same steps as POST /api/cv/extract in-process, and writes
// measured precision, recall and F1 per field, the wrong-item rate, the failure rate and the latency to
// docs/eval-results.md. No targets are claimed.  Run: node scripts/eval-cv.mjs
// With --ai it also runs each CV through rules + DeepSeek and compares (paid; needs CV_LLM_KEY):
//   node --env-file-if-exists=.env scripts/eval-cv.mjs --ai
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createAiReader, providerFromEnv } from '../server/cv/aiRead.js'
import { detectLanguage } from '../server/cv/detectLanguage.js'
import { EXTRACTOR_VERSION, extractProfile } from '../server/cv/extract.js'
import { mergeDrafts } from '../server/cv/mergeDrafts.js'
import { readText } from '../server/cv/readText.js'
import { validateFile } from '../server/cv/validateFile.js'
import { createNormalizer } from '../server/skills/normalize.js'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'
import { makeDocx, makePdf } from '../tests/helpers/cvFixtures.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const FIELDS = ['skills', 'qualifications', 'jobs', 'certifications', 'projects']
const round = (n) => Math.round(n * 1000) / 1000
const norm = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim()

// Peak price, cache miss, USD per 1M tokens (spec §3, dated 31 Oct 2026).
export const DEEPSEEK_PRICES = { 'deepseek-flash': { input: 0.30, output: 1.20 }, 'deepseek-v4-pro': { input: 1.32, output: 3.96 } }
export const costOf = (usage, price) => (usage.input * price.input + usage.output * price.output) / 1e6

export const checkAiSettings = (env) => (env.CV_LLM_KEY ? null : "CV_LLM_KEY is not set; the AI check needs the owner's DeepSeek key.")

export function costLine(usage, model) {
  const price = DEEPSEEK_PRICES[model]
  const tokens = `${usage.input} input and ${usage.output} output tokens`
  return price
    ? `${tokens}, about **$${costOf(usage, price).toFixed(4)}** at peak price (cache miss; $${price.input} in / $${price.output} out per 1M tokens)`
    : `${tokens}; the price is unknown for model \`${model}\` (not in the price table), so no cost is shown`
}

const rates = ({ tp, fp, fn }) => {
  const precision = tp + fp ? round(tp / (tp + fp)) : null
  const recall = tp + fn ? round(tp / (tp + fn)) : null
  // F1 from the counts (2tp / (2tp + fp + fn)), not from the rounded precision and recall
  const f1 = tp + fp + fn ? round((2 * tp) / (2 * tp + fp + fn)) : null
  return { tp, fp, fn, precision, recall, f1 }
}

// A found item matches an expected one when it is the same text or contains it (e.g. "Google Data Analytics
// Certificate, 2023" contains "Google Data Analytics Certificate"). Each found item counts once.
export function scoreField(expected, found) {
  const left = found.map(norm)
  let tp = 0
  for (const want of expected.map(norm)) {
    const i = left.findIndex((got) => got === want || got.includes(want))
    if (i >= 0) {
      tp++
      left.splice(i, 1)
    }
  }
  return rates({ tp, fp: left.length, fn: expected.length - tp })
}

// Only the fields a CV is labelled for are scored (expected.projects and expected.onet are on some CVs only).
export const scoreFields = (expected, found) => Object.fromEntries(FIELDS.map((f) => [f, expected[f] ? scoreField(expected[f], found[f] ?? []) : null]))

export const sumScores = (scores) => rates(scores.filter(Boolean).reduce((a, s) => ({ tp: a.tp + s.tp, fp: a.fp + s.fp, fn: a.fn + s.fn }), { tp: 0, fp: 0, fn: 0 }))

const foundFields = (profile) => ({
  skills: profile.skills.map((s) => s.name),
  qualifications: profile.education.records.map((r) => r.qualification),
  jobs: profile.employment.records.map((r) => r.jobTitle),
  certifications: profile.certifications.map((c) => c.name),
  projects: (profile.projects ?? []).map((p) => p.title),
})

// O*NET skill and knowledge names a profile reaches Skill Match with: skills linked to onet:el:/onet:kn: ids; with the
// AI, also the O*NET item it suggested (not yet kept by a user, so this is the most the AI could add).
export function skillMatchNames(profile, nameById, { withAi }) {
  const names = new Set()
  const add = (id) => { if (/^onet:(el|kn):/.test(id ?? '') && nameById.has(id)) names.add(nameById.get(id)) }
  for (const s of profile.skills) add(s.canonicalId)
  if (withAi) for (const s of profile.skills) add(s.aiSuggestion?.id)
  return [...names]
}

export function reachSection({ rules, ai, labelled }) {
  const row = (label, scores) => {
    const t = sumScores(scores)
    return `| ${label} | ${t.tp} | ${t.fp} | ${t.fn} | ${t.precision ?? '—'} | ${t.recall ?? '—'} | ${t.f1 ?? '—'} |`
  }
  return [
    '## Reaches Skill Match (labelled CVs only)',
    '',
    `The O*NET skill and knowledge names a CV's skills reach, against \`expected.onet\`. ${labelled} CVs are labelled for this (labelled CVs only). Rules only counts skills the reader linked to an O*NET skill or knowledge id; rules + AI also counts the O*NET item the AI suggested (a user still has to keep it).`,
    '',
    '| Reader | Right | Wrong (extra) | Missed | Precision | Recall | F1 |',
    '|---|---|---|---|---|---|---|',
    row('rules only', rules),
    ...(ai ? [row('rules + AI', ai)] : []),
    ...(ai ? [] : ['', 'Rules + AI: not run (needs `--ai`, which is paid).']),
    '',
  ]
}

async function extractCase(entry, catalogue, normalizer) {
  const buffer = entry.format === 'docx' ? makeDocx(entry.lines) : makePdf(entry.lines)
  const checked = validateFile(buffer, { maxBytes: 10 * 1024 * 1024 })
  if (!checked.ok) return { error: checked.code }
  const read = await readText(buffer, checked.type)
  if (!read.ok) return { error: read.code }
  const { language } = detectLanguage(read.lines)
  const { profile, uncertain, warnings } = await extractProfile({ lines: read.lines, language, interfaceLanguage: 'en', catalogue, normalizer })
  return { profile, uncertain, language, warnings, lines: read.lines }
}

const median = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function main() {
  const useAi = process.argv.includes('--ai')
  if (useAi) {
    const problem = checkAiSettings(process.env)
    if (problem) {
      console.error(problem)
      process.exit(1)
    }
  }
  const set = JSON.parse(await readFile(path.join(ROOT, 'testing', 'eval-cvs.json'), 'utf8'))
  const catalogue = await loadSkillCatalogue(path.join(ROOT, 'data', 'onet'))
  const normalizer = createNormalizer({ catalogue })
  const nameById = new Map(catalogue.entries.map((e) => [e.id, e.name]))
  await extractCase(set.cases[0], catalogue, normalizer) // warm-up (pdf.js load), not timed

  const results = []
  for (const entry of set.cases) {
    const started = performance.now()
    const out = await extractCase(entry, catalogue, normalizer)
    const ms = Math.round(performance.now() - started)
    const handled = entry.expectedError ? out.error === entry.expectedError : !out.error
    const found = out.profile ? foundFields(out.profile) : { skills: [], qualifications: [], jobs: [], certifications: [], projects: [] }
    const scores = scoreFields(entry.expected, found)
    const reach = entry.expected.onet && out.profile ? scoreField(entry.expected.onet, skillMatchNames(out.profile, nameById, { withAi: false })) : null
    // Only Good for a skill used in a job or project (owner, 31 Oct) may come from a CV.
    const levels = out.profile ? out.profile.skills.filter((s) => s.proficiency !== null && s.proficiencyStatus !== 'from_projects').length : 0
    const withId = out.profile ? out.profile.skills.filter((s) => s.canonicalId).length : 0
    results.push({ entry, out, ms, handled, found, scores, reach, levels, withId })
  }

  // --ai: the same CVs through rules + DeepSeek (the upload route's merge). Rules errors skip the AI.
  let ai = null
  if (useAi) {
    const provider = providerFromEnv(process.env)
    const reader = createAiReader({ provider, normalizer, catalogue })
    const usage = { input: 0, output: 0 }
    for (const r of results) {
      if (r.out.error) {
        r.ai = { skipped: 'rules step failed' }
        continue
      }
      const started = performance.now()
      const answer = await reader.read({ cvText: r.out.lines.join('\n'), ip: 'eval', interfaceLanguage: 'en' })
      const aiMs = Math.round(performance.now() - started)
      if (answer.status !== 'ok') {
        r.ai = { skipped: answer.reason ?? 'unknown' }
        continue
      }
      usage.input += answer.usage.input
      usage.output += answer.usage.output
      const merged = mergeDrafts({ profile: r.out.profile, uncertain: r.out.uncertain }, answer.profile)
      const foundAi = foundFields(merged.profile)
      // Production runs both readers together, so the wait is the slower of the two.
      r.ai = {
        ms: Math.max(r.ms, aiMs),
        found: foundAi,
        scores: scoreFields(r.entry.expected, foundAi),
        reach: r.entry.expected.onet ? scoreField(r.entry.expected.onet, skillMatchNames(merged.profile, nameById, { withAi: true })) : null,
      }
    }
    ai = { provider, usage, ran: results.filter((r) => r.ai.scores) }
  }

  const totals = Object.fromEntries(FIELDS.map((f) => [f, sumScores(results.map((r) => r.scores[f]))]))
  const reachRules = results.map((r) => r.reach).filter(Boolean)
  const failures = results.filter((r) => !r.handled)
  const skillsFound = results.reduce((n, r) => n + r.found.skills.length, 0)
  const withId = results.reduce((n, r) => n + r.withId, 0)
  const date = new Date().toISOString().slice(0, 10)
  const cell = (v) => (v === null ? '—' : v)
  const lines = [
    '# CV extraction — evaluation results',
    '',
    `Run on ${date} · extractor \`${EXTRACTOR_VERSION}\` (L1, L2, L4; L3 semantic match off) · O*NET ${catalogue.version} · ${set.cases.length} synthetic CVs in \`testing/eval-cvs.json\` · \`node scripts/eval-cv.mjs\`.`,
    '',
    'Measured numbers only; no target is claimed. A found item counts as right when it equals or contains the expected text. A field is scored only on the CVs labelled for it (projects and the Skill Match section: labelled CVs only).',
    '',
    '## Per field (all CVs together)',
    '',
    '| Field | Right | Wrong (extra) | Missed | Precision | Recall | F1 |',
    '|---|---|---|---|---|---|---|',
    ...FIELDS.map((f) => `| ${f} | ${totals[f].tp} | ${totals[f].fp} | ${totals[f].fn} | ${cell(totals[f].precision)} | ${cell(totals[f].recall)} | ${cell(totals[f].f1)} |`),
    '',
    `- Wrong-item rate (extra items ÷ items found, all fields): **${round(FIELDS.reduce((n, f) => n + totals[f].fp, 0) / Math.max(1, FIELDS.reduce((n, f) => n + totals[f].tp + totals[f].fp, 0)))}**`,
    `- Skills linked to an O*NET id: **${withId} of ${skillsFound}** found skills (the rest stay "not in our list yet" for the user).`,
    `- Skill levels set by extraction, other than Good for a skill used in a job or project: **${results.reduce((n, r) => n + r.levels, 0)}** (must be 0).`,
    `- Failure rate (a CV not handled as expected): **${failures.length} of ${set.cases.length}**${failures.length ? ` (${failures.map((r) => r.entry.id).join(', ')})` : ''}. The scanned CV is expected to fail with \`scanned_no_ocr\`.`,
    `- Latency per CV (build + read + extract, in-process): median **${median(results.map((r) => r.ms))} ms**, slowest ${Math.max(...results.map((r) => r.ms))} ms.`,
    '',
    '## Per CV',
    '',
    '| CV | Tags | Language | Outcome | Skills P / R | Qualifications P / R | Jobs P / R | Certificates P / R | Projects P / R | ms |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.entry.id} | ${r.entry.tags.join(', ')} | ${r.out.language ?? '—'} | ${r.out.error ? `${r.out.error}${r.handled ? ' (expected)' : ''}` : 'draft'} | ${FIELDS.map((f) => `${r.scores[f] ? `${cell(r.scores[f].precision)} / ${cell(r.scores[f].recall)}` : 'not labelled'}`).join(' | ')} | ${r.ms} |`),
    '',
    ...reachSection({ rules: reachRules, ai: ai ? ai.ran.map((r) => r.ai.reach).filter(Boolean) : null, labelled: reachRules.length }),
    '## What was found where it differs from the labels',
    '',
    ...results.flatMap((r) => FIELDS.filter((f) => r.scores[f] && (r.scores[f].fp || r.scores[f].fn)).map((f) => `- **${r.entry.id} · ${f}** — expected: ${r.entry.expected[f].join(', ') || '(none)'} · found: ${r.found[f].join(', ') || '(none)'}`)),
    '',
  ]
  if (ai) {
    const aiTotals = Object.fromEntries(FIELDS.map((f) => [f, sumScores(ai.ran.map((r) => r.ai.scores[f]))]))
    // rules-only numbers over the same CVs the AI read, so the two columns are comparable
    const baseTotals = Object.fromEntries(FIELDS.map((f) => [f, sumScores(ai.ran.map((r) => r.scores[f]))]))
    const wrong = (t) => round(FIELDS.reduce((n, f) => n + t[f].fp, 0) / Math.max(1, FIELDS.reduce((n, f) => n + t[f].tp + t[f].fp, 0)))
    const cells = (t) => `${cell(t.precision)} | ${cell(t.recall)} | ${cell(t.f1)}`
    lines.push(
      '## Rules only vs rules + DeepSeek',
      '',
      `Model \`${ai.provider.model}\` · ${date} · ${ai.ran.length} of ${set.cases.length} CVs read by the AI (the rest are listed below). Both sides cover the same ${ai.ran.length} CVs. Source: \`node --env-file-if-exists=.env scripts/eval-cv.mjs --ai\`.`,
      '',
      '| Field | Rules P | Rules R | Rules F1 | Rules + AI P | Rules + AI R | Rules + AI F1 |',
      '|---|---|---|---|---|---|---|',
      ...FIELDS.map((f) => `| ${f} | ${cells(baseTotals[f])} | ${cells(aiTotals[f])} |`),
      '',
      `- Wrong-item rate: rules only **${wrong(baseTotals)}** · rules + AI **${wrong(aiTotals)}**`,
      `- Latency per CV: rules only median **${median(ai.ran.map((r) => r.ms))} ms** · rules + AI median **${median(ai.ran.map((r) => r.ai.ms))} ms** (rules and AI run together)`,
      `- Tokens and cost (AI reads that succeeded): ${costLine(ai.usage, ai.provider.model)}`,
      '',
      '| CV | AI result | Rules F1 (skills / jobs) | Rules + AI F1 (skills / jobs) | ms rules + AI (run together) |',
      '|---|---|---|---|---|',
      ...results.map((r) => (r.ai.scores
        ? `| ${r.entry.id} | read | ${cell(r.scores.skills.f1)} / ${cell(r.scores.jobs.f1)} | ${cell(r.ai.scores.skills.f1)} / ${cell(r.ai.scores.jobs.f1)} | ${r.ai.ms} |`
        : `| ${r.entry.id} | not read: ${r.ai.skipped} | — | — | — |`)),
      '',
    )
  }
  await writeFile(path.join(ROOT, 'docs', 'eval-results.md'), lines.join('\n'))
  console.log(`docs/eval-results.md written · ${set.cases.length} CVs · failures ${failures.length}${ai ? ` · AI ${ai.ran.length} read · ${costLine(ai.usage, ai.provider.model).replaceAll('**', '')}` : ''}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
