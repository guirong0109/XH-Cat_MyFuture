import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OnetLiveError, createOnetLive } from '../server/occupations/onetLive.js'
import { createCache } from '../server/occupations/cache.js'
import { OnetUnavailable, loadOnetSnapshot } from '../server/occupations/onetSnapshot.js'
import { createOccupationLookup } from '../server/occupations/lookup.js'
import { EMASCO, writeCatalogue } from './helpers/onetFixture.js'

let dir
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'occ-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const noSleep = async () => {}
const liveReply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body })
const LIVE_BODY = { occupation: [{ code: '15-2051.00', title: 'Data Scientists', href: 'https://api-v2.onetcenter.org/online/occupations/15-2051.00/' }] }

async function lookupWith({ live = null, damage = null, emasco = async () => EMASCO } = {}) {
  await writeCatalogue(dir, { damage })
  return createOccupationLookup({ live, cache: createCache(path.join(dir, 'cache')), snapshotLoader: () => loadOnetSnapshot(dir), emascoLoader: emasco, now: () => new Date('2026-10-29T08:00:00Z') })
}

describe('O*NET live client', () => {
  it('sends the key in X-API-Key with GET and reads occupations', async () => {
    let sent
    const live = createOnetLive({ apiKey: 'k1', sleep: noSleep, fetchImpl: async (url, options) => { sent = { url, options }; return liveReply(200, LIVE_BODY)() } })
    expect(await live.search('data scientist')).toEqual([{ code: '15-2051.00', title: 'Data Scientists', via: 'live' }])
    expect(sent.url).toBe('https://api-v2.onetcenter.org/online/search?keyword=data%20scientist')
    expect(sent.options.method).toBe('GET')
    expect(sent.options.headers['X-API-Key']).toBe('k1')
  })

  it('retries at most twice', async () => {
    let calls = 0
    const live = createOnetLive({ apiKey: 'k', sleep: noSleep, fetchImpl: async () => { calls++; return liveReply(429, {})() } })
    await expect(live.search('x')).rejects.toMatchObject({ kind: 'rate_limited' })
    expect(calls).toBe(3)
  })

  it('a timeout is an OnetLiveError of kind timeout', async () => {
    const live = createOnetLive({ apiKey: 'k', retries: 0, sleep: noSleep, fetchImpl: async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e } })
    await expect(live.search('x')).rejects.toBeInstanceOf(OnetLiveError)
  })
})

describe('O*NET snapshot', () => {
  it('exact title beats job title', async () => {
    await writeCatalogue(dir)
    const snap = await loadOnetSnapshot(dir)
    expect(snap.search('data scientists')[0]).toEqual({ code: '15-2051.00', title: 'Data Scientists', via: 'title' })
    expect(snap.search('Data Entry Clerk')[0]).toEqual({ code: '43-9021.00', title: 'Data Entry Keyers', via: 'job_title' })
  })

  it('a job title shared by several occupations lists all of them', async () => {
    await writeCatalogue(dir)
    const codes = (await loadOnetSnapshot(dir)).search('data analyst').filter((r) => r.via === 'job_title').map((r) => r.code)
    expect(codes.sort()).toEqual(['15-2051.00', '43-9021.00'])
  })

  it('a changed file makes the snapshot unavailable', async () => {
    await writeCatalogue(dir, { damage: 'occupations.tsv' })
    await expect(loadOnetSnapshot(dir)).rejects.toBeInstanceOf(OnetUnavailable)
  })
})

describe('occupation lookup (live-first with verified fallback)', () => {
  it('live success answers live and updates the cache', async () => {
    const live = createOnetLive({ apiKey: 'k', sleep: noSleep, fetchImpl: liveReply(200, LIVE_BODY) })
    const lookup = await lookupWith({ live })
    const out = await lookup.search('data scientist')
    expect(out).toMatchObject({ state: 'live', cacheStatus: 'fresh', fetchedAt: '2026-10-29T08:00:00.000Z' })
    expect(out.candidates[0]).toMatchObject({ source: 'onet', code: '15-2051.00', via: 'live' })
    const cached = await createCache(path.join(dir, 'cache')).get('data scientist')
    expect(cached).toMatchObject({ source: 'O*NET Web Services', validated: true, candidates: [{ code: '15-2051.00' }] })
  })

  it('429 after retries answers cached from the snapshot', async () => {
    const live = createOnetLive({ apiKey: 'k', sleep: noSleep, fetchImpl: liveReply(429, {}) })
    const out = await (await lookupWith({ live })).search('data scientists')
    expect(out).toMatchObject({ state: 'cached', cacheStatus: 'snapshot', version: '31.0', fetchedAt: '2026-10-29', warning: 'live_failed:rate_limited' })
    expect(out.candidates[0].code).toBe('15-2051.00')
  })

  it('a cached live answer is preferred over the snapshot when live fails', async () => {
    const ok = createOnetLive({ apiKey: 'k', sleep: noSleep, fetchImpl: liveReply(200, LIVE_BODY) })
    await (await lookupWith({ live: ok })).search('data scientist')
    const down = createOnetLive({ apiKey: 'k', sleep: noSleep, fetchImpl: liveReply(500, {}) })
    const out = await (await lookupWith({ live: down })).search('data scientist')
    expect(out).toMatchObject({ state: 'cached', cacheStatus: 'cached', source: 'O*NET Web Services' })
  })

  it('no API key answers cached with a warning', async () => {
    const out = await (await lookupWith()).search('data scientists')
    expect(out).toMatchObject({ state: 'cached', warning: 'no_api_key' })
  })

  it('damaged snapshot and failed live answer alternative from eMASCO', async () => {
    const out = await (await lookupWith({ damage: 'occupations.tsv' })).search('data analyst')
    expect(out).toMatchObject({ state: 'alternative', source: 'eMASCO', fetchedAt: '2026-10-23' })
    expect(out.candidates).toEqual([{ source: 'emasco', code: '2524-02', title: 'Data Analyst', via: 'title', url: 'https://emasco.mohr.gov.my/masco/2524-02' }])
  })

  it('real zero result is no_match, not failed', async () => {
    const out = await (await lookupWith()).search('underwater basket weaving')
    expect(out).toMatchObject({ state: 'no_match', candidates: [] })
  })

  it('during a live outage zero snapshot hits are not reported as no_match', async () => {
    const down = createOnetLive({ apiKey: 'k', sleep: noSleep, fetchImpl: liveReply(500, {}) })
    const out = await (await lookupWith({ live: down })).search('underwater basket weaving')
    expect(out).toMatchObject({ state: 'cached', cacheStatus: 'snapshot', candidates: [], warning: expect.stringMatching(/^live_failed:/) })
  })

  it('everything down is failed with no candidates', async () => {
    const out = await (await lookupWith({ damage: 'occupations.tsv', emasco: async () => { throw new Error('gone') } })).search('data analyst')
    expect(out).toMatchObject({ state: 'failed', candidates: [] })
  })

  it('eMASCO title matches are listed next to O*NET for Malaysian context', async () => {
    const out = await (await lookupWith()).search('data analyst')
    expect(out.candidates.some((c) => c.source === 'onet')).toBe(true)
    expect(out.candidates).toContainEqual(expect.objectContaining({ source: 'emasco', code: '2524-02' }))
  })
})
