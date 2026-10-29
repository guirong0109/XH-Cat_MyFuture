import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

let directory
let server
let base

async function start(extra = {}) {
  server = createApp({ dataDir: directory, ...extra }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-'))
})
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

describe('server skeleton', () => {
  it('GET /api/health returns {ok:true}', async () => {
    await start()
    const response = await fetch(`${base}/api/health`)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('GET / serves index.html', async () => {
    await start()
    const response = await fetch(`${base}/`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('FutureReady')
  })

  it('GET /shared/ serves a shared module as JavaScript', async () => {
    await start()
    const response = await fetch(`${base}/shared/version.js`)
    expect(response.headers.get('content-type')).toContain('javascript')
    expect(await response.text()).toContain("MODULE_VERSION = 'cv-profile-1'")
  })

  it('unknown /api route is 404 with the error shape', async () => {
    await start()
    const response = await fetch(`${base}/api/nope`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: expect.any(String), retryable: false } })
  })

  it('a thrown error answers 500 request_failed without a stack', async () => {
    await start({ extraRoutes: (app) => app.get('/api/boom', () => { throw new Error('secret path C:/x') }) })
    const response = await fetch(`${base}/api/boom`)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: { code: 'request_failed', message: expect.any(String), retryable: true } })
    expect(text).not.toContain('C:/x')
  })
})
