import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { DEEPSEEK_PRICES, FIELDS, checkAiSettings, costLine, costOf, reachSection, scoreFields, scoreField, skillMatchNames, sumScores } from '../scripts/eval-cv.mjs'

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

describe('projects and Skill Match accuracy in the report', () => {
  const names = new Map([['onet:el:2.B.3.e', 'Programming'], ['onet:el:2.A.1.d', 'Speaking'], ['onet:kn:2.C.4.a', 'Mathematics']])
  const profile = { skills: [
    { name: 'Python', canonicalId: 'onet:tech:python', aiSuggestion: { id: 'onet:el:2.B.3.e', name: 'Programming', evidence: 'x' } },
    { name: 'Talking', canonicalId: 'onet:el:2.A.1.d' },
    { name: 'Maths', canonicalId: 'onet:kn:2.C.4.a', aiSuggestion: { id: 'onet:el:2.A.1.d', name: 'Speaking', evidence: 'y' } },
  ] }

  it('projects is a scored field', () => {
    expect(FIELDS).toContain('projects')
  })

  it('a field the CV is not labelled for is not scored', () => {
    const scores = scoreFields({ skills: ['Python'], jobs: [] }, { skills: ['Python'], jobs: [], projects: ['Extra'] })
    expect(scores.skills).toMatchObject({ tp: 1, fp: 0, fn: 0 })
    expect(scores.projects).toBeNull()
    expect(sumScores([scores.projects, scoreField(['A'], ['A'])])).toMatchObject({ tp: 1, fp: 0, fn: 0 })
  })

  it('an empty labelled list is labelled: extra items found are wrong; every new CV labels projects and onet', async () => {
    expect(scoreFields({ projects: [] }, { projects: ['Extra'] }).projects).toMatchObject({ tp: 0, fp: 1, fn: 0 })
    const set = JSON.parse(await readFile(new URL('../testing/eval-cvs.json', import.meta.url), 'utf8'))
    for (const c of set.cases.filter((x) => x.tags.includes('hard'))) {
      expect(Array.isArray(c.expected.projects), c.id).toBe(true)
      expect(Array.isArray(c.expected.onet), c.id).toBe(true)
    }
  })

  it('rules reach only the O*NET skills the reader linked; the AI adds its suggestions by catalogue name', () => {
    expect(skillMatchNames(profile, names, { withAi: false })).toEqual(['Speaking', 'Mathematics'])
    expect(skillMatchNames(profile, names, { withAi: true })).toEqual(['Speaking', 'Mathematics', 'Programming'])
  })

  it('the reach section says labelled CVs only and shows rules against rules + AI', () => {
    const rules = [scoreField(['Speaking', 'Programming'], ['Speaking'])]
    const withAi = [scoreField(['Speaking', 'Programming'], ['Speaking', 'Programming'])]
    const text = reachSection({ rules, ai: withAi, labelled: 1 }).join(' ')
    expect(text).toContain('labelled CVs only')
    expect(text).toContain('| rules only | 1 | 0 | 1 | 1 | 0.5 | 0.667 |')
    expect(text).toContain('| rules + AI | 2 | 0 | 0 | 1 | 1 | 1 |')
    expect(reachSection({ rules, ai: null, labelled: 1 }).join(' ')).toContain('not run')
  })
})
