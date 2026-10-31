// DeepSeek Search client (spec §5-§6, plan Task 2). A fake fetch only: no real search, nothing paid.
import { describe, expect, it } from 'vitest'
import { NEWS_SEARCH_URL, NewsSearchError, createDeepseekSearch } from '../../server/news/deepseek.js'

const RESULTS = [{ title: 'A', url: 'https://e.com/a', date: '2026-10-30T00:00:00Z' }]
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) })

// Answers in order; each entry is a reply, or an Error to throw. Records every call and every sleep.
function fake(...answers) {
  const calls = []
  const sleeps = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  }
  const client = createDeepseekSearch({ apiKey: 'test-key', fetchImpl, sleep: async (ms) => sleeps.push(ms) })
  return { client, calls, sleeps }
}

const failure = async (promise) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a failure')
}

describe('DeepSeek Search client', () => {
  it('sends one POST with the key and the exact body, and returns the results', async () => {
    const { client, calls } = fake(reply(200, { results: RESULTS }))
    expect(await client.search('q')).toEqual(RESULTS)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(NEWS_SEARCH_URL)
    expect(NEWS_SEARCH_URL).toBe('https://api.deepseek.com/v1/tools/search')
    expect(calls[0].options.method).toBe('POST')
    expect(calls[0].options.headers.authorization).toBe('Bearer test-key')
    expect(JSON.parse(calls[0].options.body)).toEqual({ query: 'q', count: 50, need_content: false })
  })

  it('an empty result list is not an error', async () => {
    const { client } = fake(reply(200, { results: [] }))
    expect(await client.search('q')).toEqual([])
  })

  it.each([
    ['no results array', {}],
    ['results not a list', { results: 'x' }],
  ])('a reply with %s is bad_reply, not retried', async (_, body) => {
    const { client, calls } = fake(reply(200, body))
    const error = await failure(client.search('q'))
    expect(error).toBeInstanceOf(NewsSearchError)
    expect(error.code).toBe('bad_reply')
    expect(calls).toHaveLength(1)
  })

  it('a reply that is not JSON is bad_reply', async () => {
    const { client } = fake({ ok: true, status: 200, json: async () => { throw new SyntaxError('x') } })
    expect((await failure(client.search('q'))).code).toBe('bad_reply')
  })

  it('429 then 200: one retry after 30 seconds', async () => {
    const { client, calls, sleeps } = fake(reply(429, {}), reply(200, { results: RESULTS }))
    expect(await client.search('q')).toEqual(RESULTS)
    expect(calls).toHaveLength(2)
    expect(sleeps).toEqual([30000])
  })

  it('503 twice: gives up after 2 calls with http_503', async () => {
    const { client, calls } = fake(reply(503, {}), reply(503, {}))
    expect((await failure(client.search('q'))).code).toBe('http_503')
    expect(calls).toHaveLength(2)
  })

  it('408 is retried once', async () => {
    const { client, calls } = fake(reply(408, {}), reply(200, { results: [] }))
    expect(await client.search('q')).toEqual([])
    expect(calls).toHaveLength(2)
  })

  it('a network failure is retried once, then network', async () => {
    const { client, calls } = fake(new TypeError('fetch failed'), new TypeError('fetch failed'))
    expect((await failure(client.search('q'))).code).toBe('network')
    expect(calls).toHaveLength(2)
  })

  it('a timeout is timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const { client } = fake(timeout, timeout)
    expect((await failure(client.search('q'))).code).toBe('timeout')
  })

  it.each([400, 401, 402])('%i is not retried', async (status) => {
    const { client, calls } = fake(reply(status, { error: { message: 'Bearer test-key is bad' } }))
    const error = await failure(client.search('q'))
    expect(error.code).toBe(`http_${status}`)
    expect(calls).toHaveLength(1)
  })

  it('the error never carries the key', async () => {
    const { client } = fake(reply(401, { error: { message: 'Bearer test-key is bad' } }))
    const error = await failure(client.search('q'))
    expect(`${error.message} ${error.code} ${JSON.stringify(error)}`).not.toContain('test-key')
  })
})
