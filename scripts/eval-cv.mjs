// Extraction evaluation (CV spec §12 "Extraction evaluation metrics"): builds each synthetic CV in
// testing/eval-cvs.json as a real PDF or DOCX, runs the same steps as POST /api/cv/extract in-process, and writes
// measured precision, recall and F1 per field, the wrong-item rate, the failure rate and the latency to
// docs/eval-results.md. No targets are claimed.  Run: node scripts/eval-cv.mjs
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { detectLanguage } from '../server/cv/detectLanguage.js'
import { EXTRACTOR_VERSION, extractProfile } from '../server/cv/extract.js'
import { readText } from '../server/cv/readText.js'
import { validateFile } from '../server/cv/validateFile.js'
import { createNormalizer } from '../server/skills/normalize.js'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'
import { makeDocx, makePdf } from '../tests/helpers/cvFixtures.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIELDS = ['skills', 'qualifications', 'jobs', 'certifications']
const round = (n) => Math.round(n * 1000) / 1000
const norm = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim()

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

export const sumScores = (scores) => rates(scores.reduce((a, s) => ({ tp: a.tp + s.tp, fp: a.fp + s.fp, fn: a.fn + s.fn }), { tp: 0, fp: 0, fn: 0 }))

const foundFields = (profile) => ({
  skills: profile.skills.map((s) => s.name),
  qualifications: profile.education.records.map((r) => r.qualification),
  jobs: profile.employment.records.map((r) => r.jobTitle),
  certifications: profile.certifications.map((c) => c.name),
})

async function extractCase(entry, catalogue, normalizer) {
  const buffer = entry.format === 'docx' ? makeDocx(entry.lines) : makePdf(entry.lines)
  const checked = validateFile(buffer, { maxBytes: 10 * 1024 * 1024 })
  if (!checked.ok) return { error: checked.code }
  const read = await readText(buffer, checked.type)
  if (!read.ok) return { error: read.code }
  const { language } = detectLanguage(read.lines)
  const { profile, warnings } = await extractProfile({ lines: read.lines, language, interfaceLanguage: 'en', catalogue, normalizer })
  return { profile, language, warnings }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function main() {
  const set = JSON.parse(await readFile(path.join(ROOT, 'testing', 'eval-cvs.json'), 'utf8'))
  const catalogue = await loadSkillCatalogue(path.join(ROOT, 'data', 'onet'))
  const normalizer = createNormalizer({ catalogue })
  await extractCase(set.cases[0], catalogue, normalizer) // warm-up (pdf.js load), not timed

  const results = []
  for (const entry of set.cases) {
    const started = performance.now()
    const out = await extractCase(entry, catalogue, normalizer)
    const ms = Math.round(performance.now() - started)
    const handled = entry.expectedError ? out.error === entry.expectedError : !out.error
    const found = out.profile ? foundFields(out.profile) : { skills: [], qualifications: [], jobs: [], certifications: [] }
    const scores = Object.fromEntries(FIELDS.map((f) => [f, scoreField(entry.expected[f], found[f])]))
    // Only Good for a skill used in a job or project (owner, 31 Oct) may come from a CV.
    const levels = out.profile ? out.profile.skills.filter((s) => s.proficiency !== null && s.proficiencyStatus !== 'from_projects').length : 0
    const withId = out.profile ? out.profile.skills.filter((s) => s.canonicalId).length : 0
    results.push({ entry, out, ms, handled, found, scores, levels, withId })
  }

  const totals = Object.fromEntries(FIELDS.map((f) => [f, sumScores(results.map((r) => r.scores[f]))]))
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
    'Measured numbers only; no target is claimed. A found item counts as right when it equals or contains the expected text.',
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
    '| CV | Tags | Language | Outcome | Skills P / R | Qualifications P / R | Jobs P / R | Certificates P / R | ms |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.entry.id} | ${r.entry.tags.join(', ')} | ${r.out.language ?? '—'} | ${r.out.error ? `${r.out.error}${r.handled ? ' (expected)' : ''}` : 'draft'} | ${FIELDS.map((f) => `${cell(r.scores[f].precision)} / ${cell(r.scores[f].recall)}`).join(' | ')} | ${r.ms} |`),
    '',
    '## What was found where it differs from the labels',
    '',
    ...results.flatMap((r) => FIELDS.filter((f) => r.scores[f].fp || r.scores[f].fn).map((f) => `- **${r.entry.id} · ${f}** — expected: ${r.entry.expected[f].join(', ') || '(none)'} · found: ${r.found[f].join(', ') || '(none)'}`)),
    '',
  ]
  await writeFile(path.join(ROOT, 'docs', 'eval-results.md'), lines.join('\n'))
  console.log(`docs/eval-results.md written · ${set.cases.length} CVs · failures ${failures.length}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
