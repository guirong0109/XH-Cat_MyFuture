// AI news refresh (spec §3, §6, §7): every 3 hours one DeepSeek search per field, the usable results merged into the kept
// list (top 25), written to the store. Hard caps: 10 searches per run, 80 per 24 hours, kept in the store so restarts
// cannot raise the bill. A failed field keeps its last good list. Logs hold time, field code, outcome and error code only.
import path from 'node:path'
import { LANGUAGE, MAX_AGE_DAYS, MAX_ITEMS, buildQuery, mergeItems, usableItem } from '../../shared/news/rules.js'
import { createDeepseekSearch } from './deepseek.js'
import { loadNewsFields } from './fields.js'
import { createFileNewsStore, createR2NewsStore } from './store.js'

export const REFRESH_MS = 3 * 60 * 60 * 1000
export const MAX_PER_RUN = 10
export const MAX_PER_DAY = 80

const DAY_MS = 24 * 60 * 60 * 1000
// A bad key or no credit: every other field would fail the same way, so the run stops.
const STOPS_RUN = new Set(['http_401', 'http_402'])

const stateOf = (s) => ({
  lastRunAt: typeof s?.lastRunAt === 'string' ? s.lastRunAt : null,
  searches: Array.isArray(s?.searches) ? s.searches.filter((t) => typeof t === 'string') : [],
  fields: s?.fields && typeof s.fields === 'object' && !Array.isArray(s.fields) ? s.fields : {},
})

export function createNewsService({ enabled, loadFields, store, search, now = () => new Date(), log = console.info, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let running = null
  let started = false
  let timer = null
  let lastRunAt = null

  const readState = async () => {
    const state = stateOf(await store.read().catch(() => null))
    if (state.lastRunAt) lastRunAt = state.lastRunAt
    return state
  }

  function plan(ms) {
    if (timer) clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      return runNow()
    }, Math.max(0, ms))
    timer?.unref?.()
  }

  async function run() {
    const runAt = now()
    const stamp = runAt.toISOString()
    const fields = await loadFields()
    const state = await readState()
    state.searches = state.searches.filter((t) => runAt.getTime() - Date.parse(t) < DAY_MS)
    let searched = 0
    let stopped = null
    for (const field of fields) {
      if (searched >= MAX_PER_RUN) {
        stopped = 'run_cap'
        break
      }
      if (state.searches.length >= MAX_PER_DAY) {
        stopped = 'daily_cap'
        log(`[news] ${stamp} daily cap of ${MAX_PER_DAY} searches reached`)
        break
      }
      const query = buildQuery(field.words, runAt)
      const before = state.fields[field.code] ?? {}
      state.searches.push(stamp)
      searched++
      try {
        const found = (await search.search(query)).map((result) => usableItem(result, runAt)).filter(Boolean)
        state.fields[field.code] = { query, items: mergeItems(before.items ?? [], found, runAt), searchedAt: stamp, lastAttemptAt: stamp, lastOutcome: found.length ? 'ok' : 'no_results', lastError: null }
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : 'error'
        state.fields[field.code] = { query, items: before.items ?? [], searchedAt: before.searchedAt ?? null, lastAttemptAt: stamp, lastOutcome: 'failed', lastError: code }
        log(`[news] ${stamp} ${field.code} failed ${code}`)
        if (STOPS_RUN.has(code)) {
          log(`[news] deepseek ${code.slice(5)}`)
          stopped = code
          break
        }
      }
    }
    state.lastRunAt = stamp
    lastRunAt = stamp
    try {
      await store.write(state)
    } catch (error) {
      log(`[news] ${stamp} store write failed ${error?.code ?? error?.name ?? 'error'}`)
    }
    return { searched, stopped }
  }

  function runNow() {
    if (!enabled) return Promise.resolve({ searched: 0, stopped: 'disabled' })
    running ??= run().finally(() => {
      running = null
      if (started) plan(Date.parse(lastRunAt) + REFRESH_MS - now().getTime())
    })
    return running
  }

  const due = () => !lastRunAt || now().getTime() - Date.parse(lastRunAt) >= REFRESH_MS

  return {
    enabled,
    runNow,
    // At start-up: run now when the last run is 3 hours old or more (or there is none), else plan it.
    async start() {
      if (!enabled || started) return
      started = true
      await readState()
      if (due()) await runNow()
      else plan(Date.parse(lastRunAt) + REFRESH_MS - now().getTime())
    },
    stop() {
      started = false
      if (timer) clearTimer(timer)
      timer = null
    },
    // A request after the due time (the host slept): start a run in the background; the caller does not wait for it.
    async wakeIfDue() {
      if (!enabled || running) return
      if (!lastRunAt) await readState()
      if (due()) await runNow()
    },
    async snapshot() {
      const fields = await loadFields()
      const state = await readState()
      const at = now()
      return {
        enabled,
        source: 'DeepSeek Search',
        refreshEveryHours: REFRESH_MS / (60 * 60 * 1000),
        nextRunAt: enabled ? new Date(state.lastRunAt ? Date.parse(state.lastRunAt) + REFRESH_MS : at.getTime()).toISOString() : null,
        rules: { maxItems: MAX_ITEMS, maxAgeDays: MAX_AGE_DAYS, language: LANGUAGE },
        fields: fields.map((field) => {
          const record = state.fields[field.code] ?? {}
          return {
            code: field.code,
            title: field.title,
            query: record.query ?? buildQuery(field.words, at),
            searchedAt: record.searchedAt ?? null,
            lastAttemptAt: record.lastAttemptAt ?? null,
            lastOutcome: record.lastOutcome ?? null,
            items: mergeItems(record.items ?? [], [], at),
          }
        }),
      }
    },
  }
}

// From the server's settings: on only with DEEPSEEK_API_KEY. The store is R2 when it is set, else the local file.
export function createNewsServiceFromEnv({ dataDir, env = process.env, fetchImpl = fetch, now = () => new Date(), tempStore = null, storeFile = path.join(dataDir, 'cache', 'news', 'latest.json'), log = console.info }) {
  const apiKey = String(env.DEEPSEEK_API_KEY ?? '').trim()
  let fieldsPromise = null
  const loadFields = () => {
    fieldsPromise ??= loadNewsFields(dataDir).catch((error) => {
      fieldsPromise = null
      throw error
    })
    return fieldsPromise
  }
  return createNewsService({
    enabled: Boolean(apiKey),
    loadFields,
    store: tempStore ? createR2NewsStore(tempStore) : createFileNewsStore(storeFile),
    search: apiKey ? createDeepseekSearch({ apiKey, fetchImpl }) : null,
    now,
    log,
  })
}
