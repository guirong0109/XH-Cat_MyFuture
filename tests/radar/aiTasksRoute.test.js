// Public AI task data: Anthropic Economic Index task rows and the ILO WP140 occupation scores (static reference data).
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAiTasks } from '../../server/radar/aiTasks.js'
import { FORBIDDEN_KEY_PATTERN } from '../../shared/radar/contract.js'
import { aiTasks } from '../../public/js/radarApi.js'
import { startRadar } from '../helpers/radarData.js'

let radar
afterEach(async () => {
  await radar?.close()
  radar = null
})
const keysOf = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) out.push(k), keysOf(x, out)
  return out
}

describe('GET /api/radar/ai-tasks', () => {
  it('serves the task rows, the full task counts and the ILO rows', async () => {
    radar = await startRadar()
    const response = await fetch(`${radar.base}/api/radar/ai-tasks?manifest=ignored`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.state).toBe('data')
    expect(body.tasks).toHaveLength(2710)
    const per = (code) => body.tasks.filter((t) => t.code === code).length
    expect([per('15-1252.00'), per('13-2011.00'), per('29-1141.00')]).toEqual([8, 11, 2])
    expect([body.taskCounts['15-1252.00'], body.taskCounts['13-2011.00'], body.taskCounts['29-1141.00']]).toEqual([17, 30, 27])
    expect(new Set(body.tasks.map((t) => t.code)).size).toBe(647)
    expect(Object.keys(body.tasks[0]).sort()).toEqual(['augmentation', 'automation', 'code', 'taskId', 'text', 'usage'])
    expect(body.ilo).toHaveLength(427)
    expect(body.ilo.find((r) => r.isco === '2512')).toMatchObject({ gradient: 'G3', mean: 0.53 })
    expect(body.ilo.find((r) => r.isco === '2221').gradient).toBe('not_exposed')
    const urls = body.sourceLinks.map((l) => l.url)
    expect(urls).toContain('https://huggingface.co/datasets/Anthropic/EconomicIndex')
    expect(urls).toContain('https://doi.org/10.54394/HETP0387')
    expect(body.release).toBe('release_2026_06_26')
    expect(body.dataPeriod).toBe('April-May 2026')
    expect(body.fetchedAt).toBe('2026-10-30')
    expect(keysOf(body).filter((k) => FORBIDDEN_KEY_PATTERN.test(k))).toEqual([])
  })

  it('reports /api/radar/references emascoChain true', async () => {
    radar = await startRadar()
    const body = await (await fetch(`${radar.base}/api/radar/references`)).json()
    expect(body.emascoChain).toBe(true)
  })

  it('a loader that throws answers a fixed plain reason, never the error text', async () => {
    const { default: express } = await import('express')
    const { radarRoutes } = await import('../../server/radar/routes.js')
    const app = express()
    app.use(radarRoutes({ radar: {}, aiTasks: async () => { throw new Error('ENOENT C:\secret\path\tasks.tsv at stack') } }))
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    try {
      const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/radar/ai-tasks`)).json()
      expect(body).toEqual({ state: 'unavailable', reason: 'AI task data failed its check' })
    } finally {
      server.close()
    }
  })

  it('radarApi.aiTasks returns the body', async () => {
    radar = await startRadar()
    const out = await aiTasks({ base: radar.base })
    expect(out.ok).toBe(true)
    expect(out.data.tasks).toHaveLength(2710)
  })
})

describe('loadAiTasks', () => {
  it('is unavailable without data/ai', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-'))
    const out = await loadAiTasks(dir)
    expect(out.state).toBe('unavailable')
    expect(out.reason).toBe('AI task data files are missing')
  })
  it('a changed byte in data/onet/tasks.tsv fails the hash check and gives a plain reason', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-'))
    for (const sub of ['ai', 'onet', 'radar']) await cp(path.join('data', sub), path.join(dir, sub), { recursive: true })
    const file = path.join(dir, 'onet', 'tasks.tsv')
    const text = await readFile(file, 'utf8')
    await writeFile(file, text.replace('a', 'b'))
    const out = await loadAiTasks(dir)
    expect(out).toEqual({ state: 'unavailable', reason: 'AI task data failed its check' })
    expect(JSON.stringify(out)).not.toMatch(/tasks\.tsv|manifest|[\/]/)
  })
  it('the real data still loads from an untouched temp copy', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-'))
    for (const sub of ['ai', 'onet', 'radar']) await cp(path.join('data', sub), path.join(dir, sub), { recursive: true })
    expect((await loadAiTasks(dir)).state).toBe('data')
  })
})
