// AI news store and refresh service (spec §3, §6, §7; plan Task 3). Fake search, memory store and a movable clock:
// no real search, nothing paid.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_CHECKS_PER_DAY, MAX_CHECKS_PER_RUN, MAX_PER_DAY, MAX_PER_RUN, REFRESH_MS, createNewsService, createNewsServiceFromEnv } from '../../server/news/service.js'
import { createFileNewsStore, createR2NewsStore } from '../../server/news/store.js'
import { NewsSearchError } from '../../server/news/deepseek.js'
import { loadNewsFields } from '../../server/news/fields.js'
import { buildQuery } from '../../shared/news/rules.js'

const T0 = new Date('2026-10-31T06:00:00Z')
const HOUR = 60 * 60 * 1000
const FIELDS = await loadNewsFields('data')

function memoryStore(state = null) {
  const store = { state, writes: 0, async read() { return store.state === null ? null : structuredClone(store.state) }, async write(s) { store.writes++; store.state = structuredClone(s) } }
  return store
}
// One usable result per query, its headline and link made from the query (so fields never repeat each other).
function fakeSearch({ fail = {} } = {}) {
  const queries = []
  return {
    queries,
    async search(query) {
      queries.push(query)
      const field = FIELDS.find((f) => query.includes(f.words))
      if (fail[field?.code]) throw new NewsSearchError(fail[field.code])
      if (field?.code === '05') return [{ title: '', url: 'https://e.com/x', date: '2026-10-30T00:00:00Z' }]
      return [{ title: `News for ${field?.code}`, url: `https://e.com/${field?.code}`, site_name: 'E', date: '2026-10-30T00:00:00Z', snippet: 's' }]
    },
  }
}
function clock(start = T0) {
  let t = start.getTime()
  return { now: () => new Date(t), move: (ms) => { t += ms } }
}
function timers() {
  const planned = []
  return { planned, setTimer: (fn, ms) => { const h = { fn, ms, cleared: false }; planned.push(h); return h }, clearTimer: (h) => { if (h) h.cleared = true } }
}
// A relevance check that keeps everything, recording what it was sent (Amendment 1).
function passAll() {
  const sent = []
  return { sent, async check(title, items) { sent.push({ title, items }); return { keep: items.map((_, i) => i), reasons: {} } } }
}
const make = (o = {}) => {
  const c = o.clock ?? clock()
  const tm = o.timers ?? timers()
  const logs = []
  const service = createNewsService({ enabled: true, loadFields: async () => FIELDS, store: o.store ?? memoryStore(), search: o.search ?? fakeSearch(), relevance: o.relevance ?? passAll(), now: c.now, log: (line) => logs.push(line), setTimer: tm.setTimer, clearTimer: tm.clearTimer, ...o.options })
  return { service, clock: c, timers: tm, logs }
}

describe('news service: a run', () => {
  it('searches each field once with its query, merges, marks ok or no_results, writes before each search and at the end', async () => {
    const store = memoryStore()
    const search = fakeSearch()
    const { service } = make({ store, search })
    expect(await service.runNow()).toEqual({ searched: 10, stopped: null })
    expect(search.queries).toEqual(FIELDS.map((f) => buildQuery(f.words, T0)))
    // Once before each search and each check (the counts survive a restart mid-run) and once at the end; field 05 has
    // no usable result, so no check.
    expect(store.writes).toBe(20)
    expect(store.state.lastRunAt).toBe(T0.toISOString())
    expect(store.state.fields['06']).toMatchObject({ query: buildQuery(FIELDS[5].words, T0), searchedAt: T0.toISOString(), lastAttemptAt: T0.toISOString(), lastOutcome: 'ok', lastError: null })
    expect(store.state.fields['06'].items).toEqual([{ title: 'News for 06', url: 'https://e.com/06', site: 'E', date: '2026-10-30T00:00:00Z', snippet: 's', foundAt: T0.toISOString(), checked: true }])
    expect(store.state.fields['05']).toMatchObject({ lastOutcome: 'no_results', items: [] })
  })

  it('runs one at a time', async () => {
    const search = fakeSearch()
    const { service } = make({ search })
    const [a, b] = [service.runNow(), service.runNow()]
    expect(a).toBe(b)
    await a
    expect(search.queries).toHaveLength(10)
  })

  it('a failing field keeps its old items and leaves the others ok', async () => {
    const old = { query: 'q', items: [{ title: 'Old one', url: 'https://o.com/1', site: 'O', date: '2026-10-29T00:00:00Z', snippet: '', foundAt: '2026-10-29T03:00:00.000Z' }], searchedAt: '2026-10-29T03:00:00.000Z', lastAttemptAt: '2026-10-29T03:00:00.000Z', lastOutcome: 'ok', lastError: null }
    const store = memoryStore({ lastRunAt: '2026-10-29T03:00:00.000Z', searches: [], fields: { '03': old } })
    const { service, logs } = make({ store, search: fakeSearch({ fail: { '03': 'http_503' } }) })
    await service.runNow()
    expect(store.state.fields['03']).toMatchObject({ items: old.items, searchedAt: old.searchedAt, lastAttemptAt: T0.toISOString(), lastOutcome: 'failed', lastError: 'http_503' })
    expect(store.state.fields['04'].lastOutcome).toBe('ok')
    expect(logs.some((l) => l.includes('03') && l.includes('http_503'))).toBe(true)
  })

  it.each(['http_401', 'http_402'])('%s stops the run at that field', async (code) => {
    const store = memoryStore()
    const search = fakeSearch({ fail: { '04': code } })
    const { service, logs } = make({ store, search })
    expect(await service.runNow()).toEqual({ searched: 4, stopped: code })
    expect(search.queries).toHaveLength(4)
    expect(store.state.fields['04'].lastOutcome).toBe('failed')
    expect(store.state.fields['05']).toBeUndefined()
    expect(logs).toContain(`[news] deepseek ${code.slice(5)}`)
  })

  it('log lines hold no key and no result text', async () => {
    const { service, logs } = make({ search: fakeSearch({ fail: { '02': 'http_402' } }) })
    await service.runNow()
    for (const line of logs) {
      expect(line).not.toMatch(/key|News for|Bearer/i)
    }
  })
})

describe('news service: caps', () => {
  it('stops at 80 searches in 24 hours and drops older ones from the count', async () => {
    const recent = Array.from({ length: 75 }, () => new Date(T0.getTime() - HOUR).toISOString())
    const old = Array.from({ length: 20 }, () => new Date(T0.getTime() - 25 * HOUR).toISOString())
    const store = memoryStore({ lastRunAt: null, searches: [...old, ...recent], fields: {} })
    const search = fakeSearch()
    const { service } = make({ store, search })
    expect(await service.runNow()).toEqual({ searched: 5, stopped: 'daily_cap' })
    expect(search.queries).toHaveLength(5)
    expect(store.state.searches).toHaveLength(MAX_PER_DAY)
  })

  it('never more than 10 searches in one run, even with 11 fields', async () => {
    const eleven = [...FIELDS, { code: '11', title: 'Extra', words: 'extra words' }]
    const search = fakeSearch()
    const { service } = make({ search, options: { loadFields: async () => eleven } })
    expect(await service.runNow()).toEqual({ searched: MAX_PER_RUN, stopped: 'run_cap' })
    expect(search.queries).toHaveLength(10)
  })

  it('a server restarting every minute cannot pass 80 searches', async () => {
    const store = memoryStore()
    const search = fakeSearch()
    const c = clock()
    for (let i = 0; i < 9; i++) {
      const { service } = make({ store, search, clock: c })
      await service.start()
      c.move(60 * 1000)
    }
    expect(search.queries.length).toBeLessThanOrEqual(80)
  })
})

describe('news service: timer and wake-up', () => {
  it('start with no state runs at once and plans the next run in 3 hours', async () => {
    const { service, timers: tm } = make()
    await service.start()
    expect(tm.planned.at(-1).ms).toBe(REFRESH_MS)
    expect(REFRESH_MS).toBe(3 * HOUR)
  })

  it('start 1 hour after the last run does not run and plans it in 2 hours', async () => {
    const search = fakeSearch()
    const store = memoryStore({ lastRunAt: new Date(T0.getTime() - HOUR).toISOString(), searches: [], fields: {} })
    const { service, timers: tm } = make({ store, search })
    await service.start()
    expect(search.queries).toHaveLength(0)
    expect(tm.planned.at(-1).ms).toBe(2 * HOUR)
  })

  it('the planned timer runs the next refresh and plans the one after', async () => {
    const search = fakeSearch()
    const { service, timers: tm, clock: c } = make({ search })
    await service.start()
    c.move(REFRESH_MS)
    await tm.planned.at(-1).fn()
    expect(search.queries).toHaveLength(20)
    expect(tm.planned.at(-1).ms).toBe(REFRESH_MS)
  })

  it('stop clears the timer', async () => {
    const { service, timers: tm } = make()
    await service.start()
    service.stop()
    expect(tm.planned.at(-1).cleared).toBe(true)
  })

  it('disabled: start does nothing and no search is made', async () => {
    const search = fakeSearch()
    const { service, timers: tm } = make({ search, options: { enabled: false } })
    await service.start()
    await service.wakeIfDue()
    expect(await service.runNow()).toEqual({ searched: 0, stopped: 'disabled' })
    expect(search.queries).toHaveLength(0)
    expect(tm.planned).toHaveLength(0)
  })

  it('wakeIfDue runs when the last run is over 3 hours old, not before', async () => {
    const search = fakeSearch()
    const store = memoryStore({ lastRunAt: new Date(T0.getTime() - 2 * HOUR).toISOString(), searches: [], fields: {} })
    const { service, clock: c } = make({ store, search })
    await service.wakeIfDue()
    expect(search.queries).toHaveLength(0)
    c.move(2 * HOUR)
    await service.wakeIfDue()
    expect(search.queries).toHaveLength(10)
  })
})

describe('news service: snapshot', () => {
  it('lists the fields in order with their record, times and rules', async () => {
    const { service, clock: c } = make()
    const before = await service.snapshot()
    expect(before.nextRunAt).toBe(T0.toISOString())
    await service.runNow()
    c.move(HOUR)
    const reply = await service.snapshot()
    expect(reply).toMatchObject({ enabled: true, source: 'DeepSeek Search', refreshEveryHours: 3, nextRunAt: new Date(T0.getTime() + REFRESH_MS).toISOString(), rules: { maxItems: 25, maxAgeDays: 30, language: 'en' } })
    expect(reply.fields.map((f) => f.code)).toEqual(FIELDS.map((f) => f.code))
    expect(Object.keys(reply.fields[5]).sort()).toEqual(['code', 'dropped', 'items', 'lastAttemptAt', 'lastOutcome', 'query', 'searchedAt', 'title'])
    expect(reply.fields[5]).toMatchObject({ code: '06', title: FIELDS[5].title, lastOutcome: 'ok' })
    expect(JSON.stringify(reply)).not.toMatch(/score|weight|rank/i)
  })

  it('leaves out items older than 30 days even when the field last worked 40 days ago', async () => {
    const day = 24 * HOUR
    const store = memoryStore({ lastRunAt: new Date(T0.getTime() - 40 * day).toISOString(), searches: [], fields: { '06': { query: 'q', items: [{ title: 'Old', url: 'https://o.com/1', site: 'O', date: new Date(T0.getTime() - 41 * day).toISOString(), snippet: '', foundAt: 'x' }], searchedAt: 'x', lastAttemptAt: 'x', lastOutcome: 'ok', lastError: null } } })
    const { service } = make({ store })
    expect((await service.snapshot()).fields[5].items).toEqual([])
  })

  it('an unreadable store gives 10 empty lists, and the next run writes a good file', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'news-store-')), 'news', 'latest.json')
    const store = createFileNewsStore(file)
    await store.write({ lastRunAt: null, searches: [], fields: {} })
    writeFileSync(file, '{not json')
    expect(await store.read()).toBeNull()
    const { service } = make({ store })
    const reply = await service.snapshot()
    expect(reply.fields).toHaveLength(10)
    expect(reply.fields.every((f) => f.items.length === 0 && f.lastOutcome === null)).toBe(true)
    await service.runNow()
    expect(JSON.parse(readFileSync(file, 'utf8')).fields['06'].lastOutcome).toBe('ok')
  })
})

describe('news store on R2', () => {
  it('reads and writes news/latest.json as JSON; R2 down is an error, not an empty store', async () => {
    const objects = new Map()
    const r2 = { async get(key) { return objects.has(key) ? { buffer: objects.get(key) } : null }, async put(key, buffer, type) { expect(type).toBe('application/json'); objects.set(key, buffer) } }
    const store = createR2NewsStore(r2)
    expect(await store.read()).toBeNull()
    await store.write({ lastRunAt: 'x', searches: [], fields: {} })
    expect([...objects.keys()]).toEqual(['news/latest.json'])
    expect(await store.read()).toEqual({ lastRunAt: 'x', searches: [], fields: {} })
    const down = createR2NewsStore({ async get() { throw new Error('down') } })
    await expect(down.read()).rejects.toThrow()
  })
})

describe('news store on a file', () => {
  it('a missing or corrupt file reads as empty; a file that cannot be read is an error', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'news-file-'))
    expect(await createFileNewsStore(path.join(dir, 'none.json')).read()).toBeNull()
    writeFileSync(path.join(dir, 'bad.json'), '{not json')
    expect(await createFileNewsStore(path.join(dir, 'bad.json')).read()).toBeNull()
    await expect(createFileNewsStore(dir).read()).rejects.toThrow()
  })
})

describe('news service: the search count does not depend on the store (final review)', () => {
  it('store writes failing while reads work: page views cannot pass 10 searches per 3 hours or 80 per 24 hours', async () => {
    const old = { lastRunAt: new Date(T0.getTime() - 4 * HOUR).toISOString(), searches: [], fields: {} }
    const store = { async read() { return structuredClone(old) }, async write() { throw new Error('disk full') } }
    const search = fakeSearch()
    const { service, clock: c } = make({ store, search })
    for (let i = 0; i < 50; i++) {
      await service.snapshot()
      await service.wakeIfDue()
      c.move(60 * 1000)
    }
    expect(search.queries).toHaveLength(10)
    for (let i = 0; i < 24 * 6; i++) {
      await service.snapshot()
      await service.wakeIfDue()
      c.move(10 * 60 * 1000)
    }
    // About 25 hours: at most one run per 3 hours (9 runs), never 80 inside one 24-hour window.
    expect(search.queries.length).toBeLessThanOrEqual(MAX_PER_DAY + MAX_PER_RUN)
  })

  it('each search is counted in the store before it is made', async () => {
    const store = memoryStore()
    const seen = []
    const search = { async search() { seen.push(store.state?.searches?.length ?? 0); return [] } }
    const { service } = make({ store, search })
    await service.runNow()
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('a store that cannot be read: no search is made, the reply still has 10 empty lists', async () => {
    const store = { async read() { throw new Error('R2 down') }, async write() {} }
    const search = fakeSearch()
    const { service, logs } = make({ store, search })
    expect(await service.runNow()).toEqual({ searched: 0, stopped: 'store_unavailable' })
    await service.start()
    await service.wakeIfDue()
    expect(search.queries).toHaveLength(0)
    expect(logs.some((l) => l.includes('store_unavailable'))).toBe(true)
    const reply = await service.snapshot()
    expect(reply.fields).toHaveLength(10)
    expect(reply.fields.every((f) => f.items.length === 0)).toBe(true)
  })

  it('a run that throws plans the next one 3 hours on and the timer never rejects', async () => {
    let loads = 0
    const { service, timers: tm, logs } = make({ options: { loadFields: async () => { loads++; throw new Error('manifest mismatch') } } })
    await service.start().catch(() => {})
    const next = tm.planned.at(-1)
    expect(next.ms).toBe(REFRESH_MS)
    await expect(next.fn()).resolves.not.toThrow()
    expect(tm.planned.at(-1).ms).toBe(REFRESH_MS)
    expect(loads).toBe(2)
    expect(logs.some((l) => l.includes('run failed'))).toBe(true)
  })
})

describe('news service from env', () => {
  it('without DEEPSEEK_API_KEY it is off and never calls out', async () => {
    let calls = 0
    const dir = mkdtempSync(path.join(tmpdir(), 'news-env-'))
    const service = createNewsServiceFromEnv({ dataDir: 'data', env: {}, fetchImpl: async () => { calls++ }, now: () => T0, storeFile: path.join(dir, 'latest.json') })
    expect(service.enabled).toBe(false)
    const reply = await service.snapshot()
    await service.wakeIfDue()
    expect(reply.enabled).toBe(false)
    expect(reply.fields).toHaveLength(10)
    expect(calls).toBe(0)
  })
})

describe('news service: relevance check (Amendment 1)', () => {
  const item = (code, n, o = {}) => ({ title: `Story ${n} for ${code}`, url: `https://e.com/${code}/${n}`, site: 'E', date: '2026-10-30T00:00:00Z', snippet: 's', ...o })
  // Three results per field: story 1 (news), story 2 (news), "Listing" (not news).
  const threeEach = () => ({
    queries: [],
    async search(query) {
      this.queries.push(query)
      const code = FIELDS.find((f) => query.includes(f.words)).code
      return [item(code, 1), item(code, 2), item(code, 3, { title: `Listing page ${code}` })]
    },
  })
  // Keeps every item whose headline does not start with "Listing"; the others are "listing".
  const dropListings = () => {
    const sent = []
    return {
      sent,
      async check(title, items) {
        sent.push({ title, items })
        const keep = items.map((x, i) => (x.title.startsWith('Listing') ? null : i)).filter((i) => i !== null)
        return { keep, reasons: items.length - keep.length ? { listing: items.length - keep.length } : {} }
      },
    }
  }
  const storeWith = (fields) => memoryStore({ lastRunAt: null, searches: [], checks: [], fields })
  const record = (items, o = {}) => ({ query: 'q', items, searchedAt: 'x', lastAttemptAt: 'x', lastOutcome: 'ok', lastError: null, ...o })
  const only06 = { loadFields: async () => [FIELDS[5]] }

  it('sends each field its new items once, keeps the checked ones and counts the dropped', async () => {
    const store = memoryStore()
    const relevance = dropListings()
    const { service } = make({ store, search: threeEach(), relevance })
    await service.runNow()
    expect(relevance.sent).toHaveLength(10)
    expect(relevance.sent[5]).toMatchObject({ title: FIELDS[5].title })
    expect(relevance.sent[5].items.map((x) => x.title)).toEqual(['Story 1 for 06', 'Story 2 for 06', 'Listing page 06'])
    const f = store.state.fields['06']
    expect(f).toMatchObject({ lastOutcome: 'ok', dropped: 1, dropReasons: { listing: 1 } })
    expect(f.items.map((x) => x.title).sort()).toEqual(['Story 1 for 06', 'Story 2 for 06'])
    expect(f.items.every((x) => x.checked === true)).toBe(true)
  })

  it('items already checked are not sent again; only new ones are', async () => {
    const store = memoryStore()
    const relevance = dropListings()
    const { service, clock: c } = make({ store, search: threeEach(), relevance })
    await service.runNow()
    c.move(REFRESH_MS)
    relevance.sent.length = 0
    await service.runNow()
    // Same results again: the stories are kept already, the listing was dropped, so the listing alone is new.
    expect(relevance.sent[5].items.map((x) => x.title)).toEqual(['Listing page 06'])
    expect(store.state.fields['06']).toMatchObject({ lastOutcome: 'no_results', dropped: 1 })
    expect(store.state.fields['06'].items).toHaveLength(2)
  })

  it('a field with no new item makes no check request and keeps its list', async () => {
    const kept = [{ ...item('06', 1), foundAt: 'x', checked: true }]
    const store = storeWith({ '06': record(kept) })
    const relevance = dropListings()
    const search = { async search() { return [item('06', 1)] } }
    const { service } = make({ store, search, relevance, options: only06 })
    await service.runNow()
    expect(relevance.sent).toHaveLength(0)
    expect(store.state.fields['06']).toMatchObject({ lastOutcome: 'no_results', dropped: 0, items: kept })
  })

  it('a check that keeps nothing: no_results, dropped = number sent, last list kept', async () => {
    const kept = [{ ...item('06', 9), foundAt: 'x', checked: true }]
    const store = storeWith({ '06': record(kept) })
    const relevance = { async check(title, items) { return { keep: [], reasons: { off_topic: items.length } } } }
    const { service } = make({ store, search: threeEach(), relevance, options: only06 })
    await service.runNow()
    expect(store.state.fields['06']).toMatchObject({ lastOutcome: 'no_results', dropped: 3, dropReasons: { off_topic: 3 } })
    expect(store.state.fields['06'].items.map((x) => x.title)).toEqual(['Story 9 for 06'])
  })

  it('items saved before the amendment are sent once with the new ones', async () => {
    const legacy = [{ ...item('06', 7), foundAt: '2026-10-29T00:00:00.000Z' }]
    const store = storeWith({ '06': record(legacy) })
    const relevance = dropListings()
    const { service } = make({ store, search: threeEach(), relevance, options: only06 })
    await service.runNow()
    expect(relevance.sent[0].items.map((x) => x.title)).toEqual(['Story 7 for 06', 'Story 1 for 06', 'Story 2 for 06', 'Listing page 06'])
    const seven = store.state.fields['06'].items.find((x) => x.title === 'Story 7 for 06')
    expect(seven).toMatchObject({ checked: true, foundAt: '2026-10-29T00:00:00.000Z' })
  })

  it('a failed check adds nothing, marks the field check_<code> and the others go on', async () => {
    const store = memoryStore()
    const relevance = { async check(title, items) { if (title === FIELDS[2].title) throw new NewsSearchError('bad_reply'); return { keep: items.map((_, i) => i), reasons: {} } } }
    const { service, logs } = make({ store, search: threeEach(), relevance })
    expect(await service.runNow()).toEqual({ searched: 10, stopped: null })
    expect(store.state.fields['03']).toMatchObject({ lastOutcome: 'failed', lastError: 'check_bad_reply', items: [] })
    expect(store.state.fields['04'].lastOutcome).toBe('ok')
    expect(logs.some((l) => l.includes('03') && l.includes('check_bad_reply'))).toBe(true)
  })

  it('402 from the check stops the run', async () => {
    const store = memoryStore()
    const relevance = { async check(title) { if (title === FIELDS[1].title) throw new NewsSearchError('http_402'); return { keep: [0], reasons: {} } } }
    const search = threeEach()
    const { service, logs } = make({ store, search, relevance })
    expect(await service.runNow()).toEqual({ searched: 2, stopped: 'check_http_402' })
    expect(search.queries).toHaveLength(2)
    expect(logs).toContain('[news] deepseek 402')
    expect(store.state.fields['03']).toBeUndefined()
  })

  it('stops at 80 checks in 24 hours, before searching the next field', async () => {
    const recent = Array.from({ length: 75 }, () => new Date(T0.getTime() - HOUR).toISOString())
    const store = memoryStore({ lastRunAt: null, searches: [], checks: recent, fields: {} })
    const relevance = dropListings()
    const search = threeEach()
    const { service } = make({ store, search, relevance })
    expect(await service.runNow()).toEqual({ searched: 5, stopped: 'daily_check_cap' })
    expect(relevance.sent).toHaveLength(5)
    expect(search.queries).toHaveLength(5)
    expect(store.state.checks).toHaveLength(MAX_CHECKS_PER_DAY)
    expect(MAX_CHECKS_PER_RUN).toBe(10)
  })

  it('each check is counted in the store before it is made, and a failing write cannot reset the count', async () => {
    const store = memoryStore()
    const seen = []
    const relevance = { async check(title, items) { seen.push(store.state?.checks?.length ?? 0); return { keep: items.map((_, i) => i), reasons: {} } } }
    const { service } = make({ store, search: threeEach(), relevance })
    await service.runNow()
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    const old = { lastRunAt: new Date(T0.getTime() - 4 * HOUR).toISOString(), searches: [], checks: [], fields: {} }
    const broken = { async read() { return structuredClone(old) }, async write() { throw new Error('disk full') } }
    const counted = dropListings()
    const second = make({ store: broken, search: threeEach(), relevance: counted })
    for (let i = 0; i < 24 * 6; i++) {
      await second.service.snapshot()
      await second.service.wakeIfDue()
      second.clock.move(10 * 60 * 1000)
    }
    expect(counted.sent.length).toBeLessThanOrEqual(MAX_CHECKS_PER_DAY + MAX_CHECKS_PER_RUN)
  })

  it('the reply shows only checked items, without the flag, with checkedBy and dropped', async () => {
    const fields = { '06': record([{ ...item('06', 1), foundAt: 'x', checked: true }, { ...item('06', 2), foundAt: 'x' }], { dropped: 4 }) }
    const { service } = make({ store: storeWith(fields) })
    const reply = await service.snapshot()
    expect(reply.checkedBy).toBe('deepseek-flash')
    expect(reply.fields[5].items.map((x) => x.title)).toEqual(['Story 1 for 06'])
    expect(reply.fields[5].items[0]).not.toHaveProperty('checked')
    expect(reply.fields[5].dropped).toBe(4)
    expect(reply.fields[0].dropped).toBe(0)
    expect(JSON.stringify(reply)).not.toMatch(/score|weight|rank/i)
  })

  it('from env without a key no check is built', () => {
    const service = createNewsServiceFromEnv({ dataDir: 'data', env: {}, storeFile: path.join(mkdtempSync(path.join(tmpdir(), 'news-a1-')), 'latest.json') })
    expect(service.enabled).toBe(false)
  })
})
