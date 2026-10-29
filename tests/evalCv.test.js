import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { scoreField, sumScores } from '../scripts/eval-cv.mjs'

describe('CV extraction evaluation', () => {
  it('precision and recall on a fixed tiny case', () => {
    // expected 3, found 4: Python and SQL right, Teamwork and Driving extra, Excel missed
    const score = scoreField(['Python', 'SQL', 'Microsoft Excel'], ['python', 'Structured query language SQL', 'Teamwork', 'Driving'])
    expect(score).toEqual({ tp: 2, fp: 2, fn: 1, precision: 0.5, recall: 0.667, f1: 0.571 })
  })

  it('one found item counts for one expected item only; empty lists give null precision', () => {
    expect(scoreField(['SQL', 'SQL Server'], ['Microsoft SQL Server'])).toMatchObject({ tp: 1, fp: 0, fn: 1 })
    expect(scoreField([], [])).toEqual({ tp: 0, fp: 0, fn: 0, precision: null, recall: null, f1: null })
    expect(sumScores([{ tp: 1, fp: 1, fn: 0 }, { tp: 1, fp: 0, fn: 2 }])).toEqual({ tp: 2, fp: 1, fn: 2, precision: 0.667, recall: 0.5, f1: 0.571 })
  })

  it('the eval set has the cases the spec asks for', async () => {
    const set = JSON.parse(await readFile(new URL('../testing/eval-cvs.json', import.meta.url), 'utf8'))
    const tags = set.cases.flatMap((c) => c.tags)
    for (const tag of ['en', 'ms', 'zh', 'mixed', 'two_degrees', 'no_job', 'project_only', 'injection', 'docx', 'scanned']) expect(tags, tag).toContain(tag)
    expect(set.cases.length).toBeGreaterThanOrEqual(10)
  })
})
