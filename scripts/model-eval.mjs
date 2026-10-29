// Model Eval for L3 (spec §6.6, diagram "Model Eval: precision · recall · latency"): runs the labelled terms in
// testing/model-eval-set.json through the RunPod-hosted embedding model and writes precision, recall and median latency
// per cutoff to docs/model-eval.md. The chosen cutoff is the lowest with precision >= 0.90.
// Run: node scripts/model-eval.mjs  (needs SEMANTIC_URL, SEMANTIC_KEY, SEMANTIC_MODEL)
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createSemanticFromEnv } from '../server/cv/semantic.js'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CUTOFFS = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]
const MIN_PRECISION = 0.9
const round = (n) => Math.round(n * 1000) / 1000

// rows: [{ expected: id|null, id, similarity }]. A prediction is the model's id at or above the cutoff.
export function score(rows, cutoff) {
  const predictedRows = rows.filter((row) => row.similarity >= cutoff)
  const correct = predictedRows.filter((row) => row.expected !== null && row.id === row.expected).length
  const positives = rows.filter((row) => row.expected !== null).length
  return {
    cutoff,
    predicted: predictedRows.length,
    correct,
    positives,
    precision: predictedRows.length ? round(correct / predictedRows.length) : null,
    recall: positives ? round(correct / positives) : 0,
  }
}

export function chooseCutoff(table) {
  return table.find((row) => row.precision !== null && row.precision >= MIN_PRECISION)?.cutoff ?? null
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function main() {
  const semantic = createSemanticFromEnv()
  if (!semantic) {
    console.error('Set SEMANTIC_URL, SEMANTIC_KEY and SEMANTIC_MODEL first (see .env.example).')
    process.exit(1)
  }
  const set = JSON.parse(await readFile(path.join(ROOT, 'testing', 'model-eval-set.json'), 'utf8'))
  const catalogue = await loadSkillCatalogue(path.join(ROOT, 'data', 'onet'))

  // The catalogue is embedded once (not timed); then one request per term, as in a real extraction.
  const warm = Date.now()
  await semantic.match(['warm-up'], catalogue.entries)
  const warmSeconds = round((Date.now() - warm) / 1000)
  const rows = []
  const latencies = []
  for (const pair of set.pairs) {
    const started = Date.now()
    const [best] = await semantic.match([pair.term], catalogue.entries)
    latencies.push(Date.now() - started)
    rows.push({ ...pair, id: best.id, name: best.name, similarity: best.similarity })
  }
  const table = CUTOFFS.map((cutoff) => score(rows, cutoff))
  const chosen = chooseCutoff(table)
  const date = new Date().toISOString().slice(0, 10)

  const lines = [
    '# Model Eval — L3 semantic match',
    '',
    `Run on ${date} · model \`${process.env.SEMANTIC_MODEL}\` on RunPod · catalogue O*NET ${catalogue.version} (${catalogue.entries.length} names) · ${set.pairs.length} labelled terms (\`testing/model-eval-set.json\`).`,
    '',
    `Median latency per term: **${median(latencies)} ms** · embedding the catalogue once (first use): ${warmSeconds} s.`,
    '',
    '| Cutoff | Kept | Correct | Precision | Recall |',
    '|---|---|---|---|---|',
    ...table.map((r) => `| ${r.cutoff.toFixed(2)} | ${r.predicted} | ${r.correct} | ${r.precision ?? '—'} | ${r.recall} |`),
    '',
    chosen === null
      ? `**No cutoff reached precision ${MIN_PRECISION}.** L3 stays off (leave \`SEMANTIC_CUTOFF\` unset).`
      : `**Chosen cutoff: ${chosen.toFixed(2)}** (lowest with precision ≥ ${MIN_PRECISION}), chosen on ${date}. Set \`SEMANTIC_CUTOFF=${chosen}\`.`,
    '',
    'A high similarity is not proof that two wordings mean the same skill: L3 matches are marked inferred and stay Unverified until the user confirms them.',
    '',
    '## Every term',
    '',
    '| Term | Lang | Expected | Model answer | Similarity |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.term} | ${r.lang} | ${r.expected ?? '(none)'} | ${r.id} | ${r.similarity} |`),
    '',
  ]
  await writeFile(path.join(ROOT, 'docs', 'model-eval.md'), lines.join('\n'))
  console.log(`docs/model-eval.md written · chosen cutoff ${chosen ?? 'none'}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
