// Relevance check client (spec Amendment 1, N9 and §5; plan A1 Task 2). A fake fetch only: no real call, nothing paid.
import { describe, expect, it } from 'vitest'
import { CHECK_MODEL, CHECK_URL, DROP_REASONS, checkMessages, createRelevanceCheck, readAnswer } from '../../server/news/relevance.js'
import { NewsSearchError } from '../../server/news/deepseek.js'

const ITEMS = [
  { title: 'AI tutors arrive in Penang schools', url: 'https://news.example.com/1', site: 'Example News', date: '2026-10-30T00:00:00Z', snippet: 'Teachers try AI tutors.' },
  { title: 'Artificial Intelligence — arXiv listing', url: 'https://arxiv.org/list/cs.AI', site: 'arXiv', date: '2026-10-30T00:00:00Z', snippet: 'New submissions.' },
  { title: 'Assignment: AI in education essay', url: 'https://filo.example/q', site: 'Filo', date: '2026-10-30T00:00:00Z', snippet: 'Answer the question.' },
]
const chat = (content, finish = 'stop') => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content }, finish_reason: finish }] }) })
const http = (status) => ({ ok: false, status, json: async () => ({ error: { message: 'Bearer test-key bad' } }) })
const GOOD = '{"keep":[0],"drop":[{"id":1,"reason":"listing"},{"id":2,"reason":"homework"}]}'

function fake(...answers) {
  const calls = []
  const sleeps = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { calls, sleeps, client: createRelevanceCheck({ apiKey: 'test-key', fetchImpl, sleep: async (ms) => sleeps.push(ms) }) }
}
const failure = async (promise) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a failure')
}

describe('relevance check: request', () => {
  it('posts the exact model, thinking off, JSON mode, temperature 0 and max_tokens 1000', async () => {
    const { client, calls } = fake(chat(GOOD))
    await client.check('Education', ITEMS)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(CHECK_URL)
    expect(CHECK_URL).toBe('https://api.deepseek.com/chat/completions')
    expect(CHECK_MODEL).toBe('deepseek-flash')
    expect(calls[0].options.method).toBe('POST')
    expect(calls[0].options.headers.authorization).toBe('Bearer test-key')
    const body = JSON.parse(calls[0].options.body)
    expect(body).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, temperature: 0, max_tokens: 1000 })
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'response_format', 'temperature', 'thinking'])
  })

  it('the messages name the field, number the items from 0 with headline, site and snippet, ask for JSON, and hold no links', () => {
    const text = checkMessages('Education', ITEMS).map((m) => m.content).join('\n')
    expect(text).toMatch(/json/i)
    expect(text).toContain('Education')
    for (const [i, item] of ITEMS.entries()) {
      expect(text).toContain(`${i}.`)
      expect(text).toContain(item.title)
      expect(text).toContain(item.site)
      expect(text).toContain(item.snippet)
    }
    expect(text).toContain('{"keep":')
    expect(text).not.toMatch(/https?:/)
    for (const reason of DROP_REASONS) expect(text).toContain(reason)
  })
})

describe('relevance check: reading the answer', () => {
  it('keeps the listed ids and counts the reasons', () => {
    expect(readAnswer(GOOD, 3)).toEqual({ keep: [0], reasons: { listing: 1, homework: 1 } })
  })

  it('only whole numbers naming a sent item count; a repeat keeps the item once', () => {
    expect(readAnswer('{"keep":["2",2.5,-1,3,0,0],"drop":[]}', 3).keep).toEqual([0])
  })

  it('an unknown or missing reason counts as other, so the reasons add up to the dropped items', () => {
    const { keep, reasons } = readAnswer('{"keep":[0],"drop":[{"id":1,"reason":"spam"}]}', 3)
    expect(keep).toEqual([0])
    expect(reasons).toEqual({ other: 2 })
  })

  it('an id in both keep and drop is kept, its drop reason not counted', () => {
    expect(readAnswer('{"keep":[0,1],"drop":[{"id":1,"reason":"paper"}]}', 2)).toEqual({ keep: [0, 1], reasons: {} })
  })

  it.each([['empty', ''], ['blank', '   '], ['cut off', '{"keep":'], ['keep not a list', '{"keep":"0"}'], ['not an object', '[0]'], ['null', 'null']])('%s is bad_reply', (_, content) => {
    let error = null
    try {
      readAnswer(content, 3)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(NewsSearchError)
    expect(error.code).toBe('bad_reply')
  })
})

describe('relevance check: retries and errors', () => {
  it('returns keep and reasons', async () => {
    const { client } = fake(chat(GOOD))
    expect(await client.check('Education', ITEMS)).toEqual({ keep: [0], reasons: { listing: 1, homework: 1 } })
  })

  it('a blank answer is retried once after 30 seconds', async () => {
    const { client, calls, sleeps } = fake(chat('  '), chat(GOOD))
    expect((await client.check('Education', ITEMS)).keep).toEqual([0])
    expect(calls).toHaveLength(2)
    expect(sleeps).toEqual([30000])
  })

  it('a blank answer twice is bad_reply after 2 calls', async () => {
    const { client, calls } = fake(chat(''), chat(''))
    expect((await failure(client.check('Education', ITEMS))).code).toBe('bad_reply')
    expect(calls).toHaveLength(2)
  })

  it('an answer cut off at max_tokens is a bad reply', async () => {
    const { client } = fake(chat('{"keep":[0,', 'length'), chat('{"keep":[0', 'length'))
    expect((await failure(client.check('Education', ITEMS))).code).toBe('bad_reply')
  })

  it('a reply with no choices is a bad reply', async () => {
    const { client } = fake({ ok: true, status: 200, json: async () => ({}) }, { ok: true, status: 200, json: async () => ({}) })
    expect((await failure(client.check('Education', ITEMS))).code).toBe('bad_reply')
  })

  it('429 then 200 is retried', async () => {
    const { client, calls } = fake(http(429), chat(GOOD))
    expect((await client.check('Education', ITEMS)).keep).toEqual([0])
    expect(calls).toHaveLength(2)
  })

  it.each([400, 401, 402])('%i is not retried', async (status) => {
    const { client, calls } = fake(http(status))
    expect((await failure(client.check('Education', ITEMS))).code).toBe(`http_${status}`)
    expect(calls).toHaveLength(1)
  })

  it('the error never carries the key', async () => {
    const { client } = fake(http(401))
    const error = await failure(client.check('Education', ITEMS))
    expect(`${error.message} ${error.code} ${JSON.stringify(error)}`).not.toContain('test-key')
  })
})
