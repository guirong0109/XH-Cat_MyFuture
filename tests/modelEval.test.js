import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { chooseCutoff, score } from '../scripts/model-eval.mjs'
import { loadSkillCatalogue } from '../server/skills/onetSkills.js'

// rows: what the model answered for each labelled term
const ROWS = [
  { expected: 'a', id: 'a', similarity: 0.9 },
  { expected: 'b', id: 'b', similarity: 0.7 },
  { expected: 'c', id: 'x', similarity: 0.8 },
  { expected: null, id: 'y', similarity: 0.65 },
]

describe('Model Eval scoring', () => {
  it('precision and recall at a cutoff', () => {
    expect(score(ROWS, 0.6)).toEqual({ cutoff: 0.6, predicted: 4, correct: 2, positives: 3, precision: 0.5, recall: 0.667 })
    expect(score(ROWS, 0.85)).toEqual({ cutoff: 0.85, predicted: 1, correct: 1, positives: 3, precision: 1, recall: 0.333 })
    expect(score(ROWS, 0.95)).toMatchObject({ predicted: 0, precision: null, recall: 0 })
  })

  it('the chosen cutoff is the lowest with precision at least 0.90', () => {
    const table = [0.6, 0.7, 0.8, 0.85, 0.9].map((c) => score(ROWS, c))
    expect(chooseCutoff(table)).toBe(0.85)
    expect(chooseCutoff([score(ROWS, 0.6)])).toBe(null)
  })

  it('the eval set has at least 40 labelled terms, real O*NET 31.0 ids, EN/BM/中文 terms and negatives', async () => {
    const set = JSON.parse(await readFile(new URL('../testing/model-eval-set.json', import.meta.url), 'utf8'))
    const catalogue = await loadSkillCatalogue(new URL('../data/onet', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    const ids = new Set(catalogue.entries.map((e) => e.id))
    expect(set.pairs.length).toBeGreaterThanOrEqual(40)
    for (const pair of set.pairs) if (pair.expected !== null) expect(ids.has(pair.expected), pair.term).toBe(true)
    expect(set.pairs.some((p) => p.lang === 'ms')).toBe(true)
    expect(set.pairs.some((p) => p.lang === 'zh')).toBe(true)
    expect(set.pairs.filter((p) => p.expected === null).length).toBeGreaterThanOrEqual(5)
    expect(set.pairs).toContainEqual(expect.objectContaining({ term: 'JS', expected: 'onet:tech:javascript' }))
  })
})
