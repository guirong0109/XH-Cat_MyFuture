// GET /api/news (spec §7, plan Task 4): real app on port 0 with an injected news service. No real search.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createNewsServiceFromEnv } from '../../server/news/service.js'

let server = null
afterEach(() => {
  server?.close()
  server = null
})

async function get(news, url = '/api/news') {
  server = createApp({ news, d1: null, tempStore: null, llmProviders: [], onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`)
  return { status: response.status, body: await response.json() }
}

// A news service double: a fixed snapshot, counting wake-ups and starts.
function double(snapshot = async () => ({ enabled: true, fields: [] })) {
  const calls = { wake: 0, start: 0 }
  return { calls, service: { enabled: true, snapshot, wakeIfDue: async () => { calls.wake++ }, start: async () => { calls.start++ }, stop() {}, runNow: async () => ({}) } }
}

describe('GET /api/news', () => {
  it('answers the snapshot and wakes the refresh once', async () => {
    const { service, calls } = double(async () => ({ enabled: true, source: 'DeepSeek Search', fields: [{ code: '06', items: [] }] }))
    const { status, body } = await get(service)
    expect(status).toBe(200)
    expect(body).toEqual({ enabled: true, source: 'DeepSeek Search', fields: [{ code: '06', items: [] }] })
    expect(calls.wake).toBe(1)
  })

  it('takes no input: a query string changes nothing', async () => {
    const { service } = double(async () => ({ enabled: true, fields: [] }))
    expect((await get(service, '/api/news?profile=x')).body).toEqual({ enabled: true, fields: [] })
  })

  it('a failed snapshot is 503 news_unavailable, retryable, with no stack or path', async () => {
    const { service } = double(async () => { throw new Error('C:\\secret\\path boom') })
    const { status, body } = await get(service)
    expect(status).toBe(503)
    expect(body).toEqual({ error: { code: 'news_unavailable', message: expect.any(String), retryable: true } })
    expect(JSON.stringify(body)).not.toMatch(/secret|boom|at /)
  })

  it('without a DeepSeek key the reply says off and has 10 empty lists', async () => {
    const news = createNewsServiceFromEnv({ dataDir: 'data', env: {}, fetchImpl: async () => { throw new Error('no outside request') }, storeFile: path.join(mkdtempSync(path.join(tmpdir(), 'news-route-')), 'latest.json') })
    const { status, body } = await get(news)
    expect(status).toBe(200)
    expect(body.enabled).toBe(false)
    expect(body.fields).toHaveLength(10)
    expect(body.fields.every((f) => f.items.length === 0)).toBe(true)
  })

  it('creating the app does not start the refresh timer', async () => {
    const { service, calls } = double()
    await get(service)
    expect(calls.start).toBe(0)
  })
})
