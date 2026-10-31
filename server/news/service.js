// AI news refresh (spec §3, §6, §7): every 3 hours one DeepSeek search per field, the usable results merged into the kept
// list (top 25), written to the store. Hard caps: 10 searches per run, 80 per 24 hours. The search count and the last
// run time are kept in memory as well as in the store (the larger of the two counts), so a store that fails to write
// cannot reset them, and each search is written down before it is made, so a restart mid-run cannot either. No search
// is made when the store cannot be read. A failed field keeps its last good list. Logs hold time, field code, outcome
// and error code only.
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
const later = (a, b) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b)
// Two lists of search times as one: each time as often as the list that has it most often.
function unionStamps(a, b) {
  const count = new Map()
  for (const list of [a, b]) {
    const own = new Map()
    for (const t of list) own.set(t, (own.get(t) ?? 0) + 1)
    for (const [t, n] of own) count.set(t, Math.max(count.get(t) ?? 0, n))
  }
  return [...count].flatMap(([t, n]) => Array(n).fill(t))
}

export function createNewsService({ enabled, loadFields, store, search, now = () => new Date(), log = console.info, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let running = null
  let started = false
  let timer = null
  // What this process knows even when the store does not: the last run, the last attempt and the searches made.
  let lastRunAt = null
  let lastAttemptAt = null
  let searches = []

  // The stored state merged with memory; down = the store could not be read.
  const readState = async () => {
    let stored = null
    let down = false
    try {
      stored = await store.read()
    } catch {
      down = true
    }
    const state = stateOf(stored)
    const at = now().getTime()
    state.lastRunAt = later(state.lastRunAt, lastRunAt)
    state.searches = unionStamps(state.searches, searches).filter((t) => at - Date.parse(t) < DAY_MS)
    lastRunAt = state.lastRunAt
    searches = [...state.searches]
    return { state, down }
  }
  const save = async (state, stamp) => {
    try {
      await store.write(state)
    } catch (error) {
      log(`[news] ${stamp} store write failed ${error?.code ?? error?.name ?? 'error'}`)
    }
  }

  function plan(ms) {
    if (timer) clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      return runNow().catch(() => {})
    }, Math.max(0, ms))
    timer?.unref?.()
  }

  async function run() {
    const runAt = now()
    const stamp = runAt.toISOString()
    lastAttemptAt = stamp
    const fields = await loadFields()
    const { state, down } = await readState()
    if (down) {
      log(`[news] ${stamp} store_unavailable: no search made`)
      return { searched: 0, stopped: 'store_unavailable' }
    }
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
      searches = [...state.searches]
      searched++
      await save(state, stamp)
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
    await save(state, stamp)
    return { searched, stopped }
  }

  // The last run or attempt, whichever is later: a failed run waits the same 3 hours as a good one.
  const last = () => later(lastRunAt, lastAttemptAt)
  const due = () => !last() || now().getTime() - Date.parse(last()) >= REFRESH_MS

  function runNow() {
    if (!enabled) return Promise.resolve({ searched: 0, stopped: 'disabled' })
    running ??= run()
      .catch((error) => {
        log(`[news] ${lastAttemptAt} run failed ${error?.code ?? error?.name ?? 'error'}`)
        throw error
      })
      .finally(() => {
        running = null
        if (started) plan(Date.parse(last()) + REFRESH_MS - now().getTime())
      })
    return running
  }

  return {
    enabled,
    runNow,
    // At start-up: run now when the last run is 3 hours old or more (or there is none), else plan it.
    async start() {
      if (!enabled || started) return
      started = true
      await readState()
      if (due()) await runNow()
      else plan(Date.parse(last()) + REFRESH_MS - now().getTime())
    },
    stop() {
      started = false
      if (timer) clearTimer(timer)
      timer = null
    },
    // A request after the due time (the host slept): start a run in the background; the caller does not wait for it.
    async wakeIfDue() {
      if (!enabled || running) return
      if (!last()) await readState()
      if (due()) await runNow()
    },
    async snapshot() {
      const fields = await loadFields()
      const { state } = await readState()
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
