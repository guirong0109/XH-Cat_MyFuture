import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { DEEPSEEK_PRICES, checkAiSettings, costLine, costOf, scoreField, sumScores } from '../scripts/eval-cv.mjs'

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

  it('costOf prices tokens per million; the table holds the spec prices', () => {
    expect(costOf({ input: 5000, output: 2000 }, DEEPSEEK_PRICES['deepseek-flash'])).toBeCloseTo(0.0039, 4)
    expect(DEEPSEEK_PRICES['deepseek-v4-pro']).toEqual({ input: 1.32, output: 3.96 })
  })

  it('--ai without a key gives the exact message; with a key gives null', () => {
    expect(checkAiSettings({})).toBe("CV_LLM_KEY is not set; the AI check needs the owner's DeepSeek key.")
    expect(checkAiSettings({ CV_LLM_KEY: 'k' })).toBeNull()
  })

  it('costLine shows the cost for a known model and says the price is unknown otherwise', () => {
    expect(costLine({ input: 5000, output: 2000 }, 'deepseek-flash')).toContain('0.0039')
    const unknown = costLine({ input: 5000, output: 2000 }, 'mystery')
    expect(unknown).toContain('5000')
    expect(unknown).toContain('price is unknown')
  })
})
