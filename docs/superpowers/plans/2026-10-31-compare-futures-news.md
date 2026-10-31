# Compare Futures: AI News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the latest AI news per study field on `#futures` (For you / Explore all), found by DeepSeek Search
every 3 hours, at most 25 rule-checked items per field.

**Architecture:** Pure rules in `shared/news/rules.js` (query, usable check, repeats, merge, For-you fields). The server
(`server/news/`) holds a DeepSeek Search client, a store (R2 or a local file), a service with a 3-hour timer and hard
caps, and `GET /api/news`. The browser screen `public/js/screens/futures.js` reads the reply and picks For-you fields
from the profile locally.

**Tech Stack:** Node ≥ 22.12, Express, ES modules, Vitest; browser screens are plain template strings.

**Spec:** `docs/superpowers/specs/2026-10-31-compare-futures-news-design.md` · Diagram:
`docs/architecture-compare-futures.html` (both approved by the owner, 31 Oct 2026).

## Global Constraints

- DeepSeek endpoint `POST https://api.deepseek.com/v1/tools/search`, header `Authorization: Bearer <key>`, body
  `{ query, count: 50, need_content: false }`. Key from `DEEPSEEK_API_KEY` only.
- Query: `"artificial intelligence" <words> after:<YYYY-MM-DD, 30 days before the run, UTC> lang:en`, at most 128 characters.
- Usable: non-empty `title`; `url` http/https with a host; `date` present, not after the run, at most 30 days before it.
- At most **25** items per field; newest first, ties by `url` A→Z. Kept fields: `title`, `url`, `site`, `date`, `snippet`, `foundAt`.
- Refresh every **3 hours**; caps **10 searches per run**, **80 per 24 hours**.
- Store: R2 object `news/latest.json` when R2 is set, else `data/cache/news/latest.json`.
- Logs: time, field code, outcome, error code only. Never the key, never a query result body.
- No profile data on the server or to DeepSeek. No DeepSeek chat model. News never touches matching, Radar or SDG code.
- Forbidden key names in any news JSON: `score`, `weight`, `rank` (matching's rule; DeepSeek's `rerank_score` is dropped).
- Interface strings in `en`, `ms`, `zh`; `ms` and `zh` lines end with `// translation: owner review`. DeepSeek text is
  always passed through `esc()`; links only through `safeUrl()`.
- Times on screen: `YYYY-MM-DD HH:MM MYT` (UTC+8).
- Test first; `npm test` before every commit; messages `feat:` / `fix:` / `docs:`, no attribution lines; every task adds
  a log entry to `docs/record/status.json` and runs `python docs/record/build_record.py`.
- No real DeepSeek call in tests or before the owner gives the key and the OK.

## Review Focus

1. **Odd DeepSeek replies** (no `results` array, `title` a number, `date` "2026-13-45", `url` "javascript:…") → the field
   is marked failed (`bad_reply`) or the item is dropped; nothing crashes. Tests in Task 1 and Task 2.
2. **Store unreadable** (corrupt JSON file, R2 down) → `/api/news` still answers with empty lists and the next run writes
   a fresh file. Test in Task 3.
3. **Crash-looping server** (restarts every minute) → the 80-per-24-hours cap is kept in the store, so restarts cannot
   raise the bill. Test in Task 3.
4. **A field that keeps failing for over 30 days** → its old items still disappear on screen (age rule applied when the
   reply is built). Test in Task 3.
5. **Profile field codes in odd shapes** (`"0613"`, `"06"`, `null`, `"0011"`, the same broad field twice) → each broad
   field once, in profile order, 00/99 and junk ignored. Test in Task 1.

---

### Task 1: Field list and pure rules

**Files:**
- Create: `data/news/fields.json`, `data/news/manifest.json`, `shared/news/rules.js`, `server/news/fields.js`
- Modify: `data/SOURCES.md` (new section "AI news (Compare futures)")
- Test: `tests/news/rules.test.js`, `tests/news/fields.test.js`

**Interfaces:**
- Produces (`shared/news/rules.js`): constants `MAX_ITEMS = 25`, `MAX_AGE_DAYS = 30`, `QUERY_MAX = 128`, `LANGUAGE = 'en'`;
  `buildQuery(words: string, runAt: Date) -> string` (throws `RangeError` over 128 chars);
  `usableItem(result: object, runAt: Date) -> { title, url, site, date, snippet } | null`;
  `mergeItems(kept: Item[], fresh: Item[], runAt: Date) -> Item[]` (fresh items get `foundAt = runAt.toISOString()`);
  `forYouFields(profile: object, knownCodes: string[]) -> string[]`.
- Produces (`server/news/fields.js`): `loadNewsFields(dataDir: string) -> Promise<Array<{ code, title, words }>>`,
  `class NewsDataError extends Error`.

- [ ] **Step 1: Write `data/news/fields.json`**: `{ "source": "ISCED-F 2013 broad fields (titles as in data/isced/fields.tsv); search words: team draft, owner may change", "fields": [ { "code": "01", "title": "Education", "words": "education teaching schools" }, … ] }` with the 10 rows of spec §4, in code order.

- [ ] **Step 2: Write the failing tests** in `tests/news/rules.test.js`:

```js
const runAt = new Date('2026-10-31T06:00:00Z')
const raw = (o = {}) => ({ title: 'AI tutors in schools', url: 'https://news.example.com/a', site_name: 'Example News', date: '2026-10-30T00:00:00+00:00', snippet: 'Short text', rerank_score: 2, ...o })

it('buildQuery adds the 30-day date and language', () => {
  expect(buildQuery('education teaching schools', runAt)).toBe('"artificial intelligence" education teaching schools after:2026-10-01 lang:en')
})
it('buildQuery refuses more than 128 characters', () => expect(() => buildQuery('x'.repeat(120), runAt)).toThrow(RangeError))
it('usableItem keeps only the five display fields', () => {
  expect(usableItem(raw(), runAt)).toEqual({ title: 'AI tutors in schools', url: 'https://news.example.com/a', site: 'Example News', date: '2026-10-30T00:00:00+00:00', snippet: 'Short text' })
})
it('usableItem falls back to the host for the site', () => expect(usableItem(raw({ site_name: null }), runAt).site).toBe('news.example.com'))
it.each([
  ['no title', { title: '  ' }], ['title not text', { title: 42 }], ['javascript link', { url: 'javascript:alert(1)' }],
  ['no host', { url: 'https://' }], ['no date', { date: null }], ['bad date', { date: '2026-13-45' }],
  ['future date', { date: '2026-10-31T07:00:00Z' }], ['older than 30 days', { date: '2026-09-30T05:59:59Z' }],
])('usableItem drops %s', (_, o) => expect(usableItem(raw(o), runAt)).toBeNull())
it('mergeItems drops repeats by link (host case, trailing slash, utm_*) and by headline, earlier kept wins', () => {
  const kept = [{ ...usableItem(raw(), runAt), foundAt: '2026-10-30T00:00:00.000Z' }]
  const fresh = [usableItem(raw({ url: 'https://NEWS.example.com/a/?utm_source=x', title: 'Other' }), runAt), usableItem(raw({ url: 'https://b.example.com/z', title: 'AI Tutors, in schools!' }), runAt)]
  const out = mergeItems(kept, fresh, runAt)
  expect(out).toHaveLength(1)
  expect(out[0].foundAt).toBe('2026-10-30T00:00:00.000Z')
})
it('mergeItems sorts newest first, ties by url, caps at 25, re-applies the age rule', () => {
  const fresh = Array.from({ length: 30 }, (_, i) => usableItem(raw({ url: `https://e.com/${String(i).padStart(2, '0')}`, title: `T${i}`, date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z` }), runAt))
  const out = mergeItems([{ ...fresh[0], url: 'https://old.com/x', title: 'Old', date: '2026-09-01T00:00:00Z' }], fresh, runAt)
  expect(out).toHaveLength(25)
  expect(out.some((i) => i.title === 'Old')).toBe(false)
  for (let i = 1; i < out.length; i++) expect(out[i - 1].date >= out[i].date).toBe(true)
  expect(out.every((i) => i.foundAt)).toBe(true)
})
it('forYouFields gives each broad field once in profile order, ignoring 00, 99 and junk', () => {
  const profile = { education: { records: [{ field: { code: '0613' } }, { field: { code: '0011' } }, { field: null }, { field: { code: '0912' } }, { field: { code: '0688' } }, { field: { code: '99' } }, { field: { code: 'ab' } }] } }
  expect(forYouFields(profile, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])).toEqual(['06', '09'])
  expect(forYouFields(null, ['06'])).toEqual([])
})
it('reply keys never use the forbidden names', () => {
  expect(JSON.stringify(usableItem(raw(), runAt))).not.toMatch(/score|weight|rank/i)
})
```

and `tests/news/fields.test.js`: `loadNewsFields('data')` returns 10 fields with codes `01`…`10`, titles equal to the
broad titles in `data/isced/fields.tsv`, and `buildQuery(words, new Date())` within 128 for each; a temp dir with 9
fields, a duplicate code or empty words rejects with `NewsDataError`; the SHA-256 of `data/news/fields.json` equals
`data/news/manifest.json` `files["fields.json"]`.

- [ ] **Step 3: Run** `npx vitest run tests/news` → FAIL (modules missing).

- [ ] **Step 4: Implement** `shared/news/rules.js` (pure, no imports from server) and `server/news/fields.js`. Link
  repeat key: `host.toLowerCase() + pathname without trailing "/" + search without utm_* params` (protocol ignored).
  Headline key: lower case, `/[\p{P}\p{S}\s]+/gu` → one space, trimmed. Merge order: kept first, then fresh in reply
  order; the first of a repeat stays.

- [ ] **Step 5: Write** `data/news/manifest.json` (`source`, `createdAt: "2026-10-31"`, `files: { "fields.json": "<sha256>" }`)
  and the `data/SOURCES.md` section: DeepSeek Search API (https://api-docs.deepseek.com/guides/search/, read
  2026-10-31, US$0.75 per 1,000 successful searches, DeepSeek's Search pages state no rule on storing or showing
  results: ask the owner if that matters; only title, link, site, date and snippet are kept) and `fields.json`
  (ISCED-F 2013 broad titles via `data/isced/`, search words by the team).

- [ ] **Step 6: Run** `npx vitest run tests/news` → PASS; then `npm test` → all pass.

- [ ] **Step 7: Record and commit**: log entry "News: field list and rules"; `python docs/record/build_record.py`;
  `git add data/news data/SOURCES.md shared/news server/news/fields.js tests/news docs/record docs/build-record.html && git commit -m "feat: news field list and usable rules"`.

---

### Task 2: DeepSeek Search client

**Files:**
- Create: `server/news/deepseek.js`
- Test: `tests/news/deepseek.test.js`

**Interfaces:**
- Produces: `createDeepseekSearch({ apiKey: string, fetchImpl = fetch, timeoutMs = 20000, retryDelayMs = 30000, sleep = (ms) => Promise }) -> { search(query: string): Promise<object[]> }`;
  `class NewsSearchError extends Error { code }` with `code` one of `network`, `timeout`, `bad_reply`, `http_<status>`.
  `NEWS_SEARCH_URL = 'https://api.deepseek.com/v1/tools/search'`.

- [ ] **Step 1: Write the failing tests** with a fake `fetchImpl` recording calls and `sleep` resolving at once:
  - sends one POST to `NEWS_SEARCH_URL` with header `authorization: Bearer test-key`, JSON body exactly `{ query: 'q', count: 50, need_content: false }`; returns the `results` array;
  - `{ results: [] }` → `[]` (not an error);
  - `{}` or `{ results: 'x' }` or non-JSON → `NewsSearchError` `bad_reply`, no retry;
  - 429 then 200 → one retry after `sleep(30000)`, returns results; 503 twice → throws `http_503` after 2 calls;
  - fetch rejects → retried once, then `network`; abort `TimeoutError` → `timeout`;
  - 400, 401, 402 → no retry, codes `http_400`, `http_401`, `http_402`;
  - the thrown error's `message` and `code` never contain `test-key`.

- [ ] **Step 2: Run** `npx vitest run tests/news/deepseek.test.js` → FAIL.

- [ ] **Step 3: Implement** `server/news/deepseek.js`, following `post()` in `server/cv/reextract.js` (AbortSignal.timeout,
  error kinds). Retry once only for `network`, `timeout`, 408, 429, ≥500.

- [ ] **Step 4: Run** → PASS; `npm test` → all pass.

- [ ] **Step 5: Record and commit**: `feat: DeepSeek Search client for news`.

---

### Task 3: Store and refresh service

**Files:**
- Create: `server/news/store.js`, `server/news/service.js`
- Test: `tests/news/service.test.js`

**Interfaces:**
- Consumes: `buildQuery`, `usableItem`, `mergeItems`, `MAX_ITEMS`, `MAX_AGE_DAYS`, `LANGUAGE` (Task 1); `loadNewsFields` (Task 1); `createDeepseekSearch`, `NewsSearchError` (Task 2).
- Produces (`store.js`): `createFileNewsStore(filePath) -> NewsStore`, `createR2NewsStore(r2, key = 'news/latest.json') -> NewsStore`,
  where `NewsStore = { read(): Promise<NewsState|null>, write(state: NewsState): Promise<void> }` and
  `NewsState = { lastRunAt: string|null, searches: string[] /* ISO times of searches in the last 24 h */, fields: { [code]: { query, items, searchedAt, lastAttemptAt, lastOutcome, lastError } } }`.
  A corrupt or unreadable store reads as `null`.
- Produces (`service.js`): constants `REFRESH_MS = 3 * 60 * 60 * 1000`, `MAX_PER_RUN = 10`, `MAX_PER_DAY = 80`;
  `createNewsService({ enabled: boolean, loadFields: () => Promise<Field[]>, store: NewsStore, search: { search(q) } | null, now = () => new Date(), log = console.info, setTimer = setTimeout, clearTimer = clearTimeout }) -> NewsService`, where
  `NewsService = { enabled, snapshot(): Promise<NewsReply>, runNow(): Promise<{ searched: number, stopped: string|null }>, start(): void, stop(): void, wakeIfDue(): void }` and `NewsReply` is the JSON of spec §7;
  `createNewsServiceFromEnv({ dataDir, env = process.env, fetchImpl = fetch, now, tempStore = null }) -> NewsService`
  (enabled iff `env.DEEPSEEK_API_KEY`; store = `tempStore ? createR2NewsStore(tempStore) : createFileNewsStore(join(dataDir, 'cache', 'news', 'latest.json'))`).

- [ ] **Step 1: Write the failing tests** with a memory store (`{ state: null, read, write }`), a fake `search`, a
  movable clock and a fake `setTimer` that records `(fn, ms)`:
  - **run**: one search per field (10), each with `buildQuery(words, runAt)`; items merged; `lastOutcome` `ok`, or `no_results` when nothing usable; `lastRunAt` = run start; state written once at the end;
  - **one run at a time**: two `runNow()` calls together → 10 searches, same promise;
  - **independent fields**: field 03 throws `http_503` → 03 `failed` / `http_503`, keeps its old items; others `ok`;
  - **401 / 402**: the run stops at that field (`stopped: 'http_402'`), later fields not searched and not marked; `log` called with `[news] deepseek 402`; no log line contains the key;
  - **caps**: a state with 75 searches in the last 24 h → only 5 searches, `stopped: 'daily_cap'`; searches older than 24 h are pruned from `searches`; never more than 10 per run even with 11 fields;
  - **crash loop** (Review Focus 3): 9 back-to-back `createNewsService(...).start()` on the same store with the clock moving 1 minute each → at most 80 searches in total;
  - **timer**: `start()` with no state runs at once and plans the next run at `REFRESH_MS`; with `lastRunAt` 1 h ago it does not run and plans at 2 h; `stop()` clears the timer; `enabled: false` → `start()` does nothing and no search is ever made;
  - **wake-up**: `wakeIfDue()` with `lastRunAt` 4 h ago starts a run; with 2 h ago does nothing;
  - **snapshot**: fields in `fields.json` order with `code`, `title`, `query`, `searchedAt`, `lastAttemptAt`, `lastOutcome`, `items`; `nextRunAt` = `lastRunAt + 3 h` (now when none); `rules = { maxItems: 25, maxAgeDays: 30, language: 'en' }`; `source: 'DeepSeek Search'`, `refreshEveryHours: 3`; items older than 30 days are left out even when the field last succeeded 40 days ago (Review Focus 4); no key `score|weight|rank`;
  - **store unreadable** (Review Focus 2): `createFileNewsStore` on a file holding `{not json` reads `null`; snapshot then has 10 empty lists with `lastOutcome: null`; a run writes a valid file (temp dir);
  - **from env**: no `DEEPSEEK_API_KEY` → `enabled: false`, `fetchImpl` never called by `snapshot()` or `wakeIfDue()`.

- [ ] **Step 2: Run** `npx vitest run tests/news/service.test.js` → FAIL.

- [ ] **Step 3: Implement** `store.js` (file: `mkdir(dirname, { recursive: true })`, write whole JSON; R2: `get`/`put` with
  `application/json`, `StoreError` on read → `null`) and `service.js`. Timer handles are `unref()`-ed when they have it.
  The cap counts each `search()` call (the client's internal retry is not counted again).

- [ ] **Step 4: Run** → PASS; `npm test` → all pass.

- [ ] **Step 5: Record and commit**: `feat: news refresh service with caps and last good lists`.

---

### Task 4: `GET /api/news` and wiring

**Files:**
- Create: `server/news/routes.js`
- Modify: `server/app.js` (new option `news`, route), `server/index.js` (create, start)
- Test: `tests/news/routes.test.js`

**Interfaces:**
- Consumes: `NewsService`, `createNewsServiceFromEnv` (Task 3).
- Produces: `newsRoutes({ news: NewsService }) -> express.Router`; `createApp({ …, news = undefined })` — default
  `createNewsServiceFromEnv({ dataDir, fetchImpl, now, tempStore })`, never started inside `createApp`;
  `server/index.js` builds the service, passes it in, and calls `news.start()` after `listen`.

- [ ] **Step 1: Write the failing tests** (real app on port 0, like `tests/matching/routes.test.js`, with an injected
  service over a memory store and fake search):
  - `GET /api/news` → 200 with the snapshot JSON; calls `wakeIfDue()` once;
  - the request takes no input: `GET /api/news?profile=x` gives the same body;
  - snapshot throws → 503 `news_unavailable`, retryable, no stack or path in the body;
  - default `createApp()` with `env` lacking the key → `enabled: false`, 10 empty lists, no outside request;
  - creating the app does not start a timer (fake `setTimer` never called).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the router (use `sendError` from `server/errors.js`) and wire it beside the other routes in
  `createApp`, before the `/api` 404 handler; in `server/index.js` create `const news = createNewsServiceFromEnv({ dataDir: DATA_DIR, tempStore: createR2FromEnv() })`, pass `news` to `createApp`, call `news.start()` in the `listen` callback.

- [ ] **Step 4: Run** → PASS; `npm test` → all pass.

- [ ] **Step 5: Record and commit**: `feat: GET /api/news and 3-hour refresh start`.

---

### Task 5: `#futures` screen

**Files:**
- Create: `public/js/screens/futures.js`, `public/js/newsApi.js`
- Modify: `public/js/app.js` (render `futures`, load once, actions, `persist` drops `news`), `shared/strings/en.js`, `ms.js`, `zh.js`
- Test: `tests/news/futuresScreen.test.js`

**Interfaces:**
- Consumes: `forYouFields` (Task 1); `NewsReply` shape (Task 3); `esc` from `public/js/ui.js`; `safeUrl` from `public/js/components/evidencePanel.js`.
- Produces: `newsApi.load({ base = '' } = {}) -> Promise<{ ok: true, data } | { ok: false, code, retryable }>` (GET `/api/news` via `api()`);
  `futuresView({ t, state }) -> string`, `myt(iso: string|null) -> string` (`YYYY-MM-DD HH:MM MYT`, `null` → `t('nwNever')` handled by the caller).
  UI state `state.news = { tab: 'you' | 'all', field: string | null, data: NewsReply | null, loading: boolean, failed: boolean }`;
  actions `data-act="newsTab" data-arg="you|all"`, `data-act="newsField" data-arg="<code>"`, `data-act="newsRetry"`.

- [ ] **Step 1: Add strings** (en text below; `ms`/`zh` translated, each line `// translation: owner review`):
  `nwTitle` "AI news" · `nwLead` "The latest news about AI in each study field, found by DeepSeek Search and checked by simple rules." · `nwTabYou` "For you" · `nwTabAll` "Explore all" · `nwPick` "Field" · `nwYourField` "your field" · `nwSource` "Found by DeepSeek Search for “{query}” · updated {updated} · next refresh about {next}" · `nwRules` "Kept: a title, a link and a publish date in the last {days} days; repeats removed; newest {max}." · `nwNever` "not yet" · `nwFailed` "Couldn't refresh at {time}; showing the list from {from}." · `nwEmpty` "No news found yet for this field." · `nwOff` "News is off: no DeepSeek key set on this server." · `nwLoadFailed` "News couldn't load." · `nwRetry` "Try again" · `nwLoading` "Loading news…" · `nwNoField` "Add your study field in your profile to see news for you." · `nwEditProfile` "Edit profile" · `nwExploreAll` "Explore all fields" · `nwPublished` "Published {date}".

- [ ] **Step 2: Write the failing tests** on `futuresView` with a hand-made `NewsReply` (10 fields, 06 with 2 items) and `t` from `shared/i18n.js`:
  - For you with a profile field `0613` → heading for field 06, both items as `<a href="…" target="_blank" rel="noopener noreferrer">`, site, `Published 2026-10-30 08:00 MYT`, snippet; source line with the query and `nwRules` text with 30 and 25;
  - For you with no study field → `nwNoField` text, buttons `data-go="form"` and `data-act="newsTab" data-arg="all"`;
  - Explore all → a picker with 10 `data-act="newsField"` buttons, 06 marked `your field`, one list shown;
  - `lastOutcome: 'failed'` → the `nwFailed` line with both times; empty items → `nwEmpty`; `enabled: false` → `nwOff` only; `failed: true` → `nwLoadFailed` and `data-act="newsRetry"`; `loading` → `nwLoading`;
  - a title `<img src=x onerror=alert(1)>` is shown escaped; an item url `javascript:alert(1)` gives no link;
  - `myt('2026-10-31T07:00:00Z')` → `2026-10-31 15:00 MYT`;
  - en, ms, zh have every `nw*` key (the existing `tests/i18n.test.js` also checks this).

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Implement** `newsApi.js`, `futures.js` and the `app.js` changes: in `render()` add
  `if (screen === 'futures') ensureNews()` and `else if (screen === 'futures') view = futuresView({ t, state })`;
  `ensureNews()` loads once when `state.news?.data` is missing and not loading/failed; actions set `tab`, `field`, or
  reset `failed` and load again; `persist()` adds `news: null`. The default Explore-all field is the first For-you
  field, else `01`.

- [ ] **Step 5: Run** → PASS; `npm test` → all pass.

- [ ] **Step 6: Record and commit**: `feat: Compare futures AI news screen`.

---

### Task 6: Browser check and branch docs

**Files:**
- Create: `docs/news/acceptance.md`
- Create: `scripts/news-local.js` (local browser check with a fake search; not part of the app)
- Modify: `HANDOVER.md`, `CLAUDE.md` (this branch's detailed versions), `docs/record/status.json`, `docs/build-record.html`

- [ ] **Step 1: Browser check** at `http://127.0.0.2:<free port>` (3200 may be taken by another session; start it
  through `.claude/launch.json`):
  - plain `npm start` with no DeepSeek key: C5 (news off line, no request to deepseek.com in the network list), C7;
  - `scripts/news-local.js` (local check only, never deployed): `createApp` with a `createNewsService` whose `search`
    is a fake returning fixed results for each field (one field throwing `http_503`), then `runNow()` and `listen`:
    C1–C4, C6 (the `/api/news` request carries no query or body).
  Screenshots and results go in `docs/news/acceptance.md`, one row per C1–C7.

- [ ] **Step 2: Owner gate**: ask the owner for the DeepSeek key and the OK on about US$1.80 a month. Only after a
  yes: one real run, then C1–C3 again on real data, recorded in `acceptance.md`. Without it, `acceptance.md` says
  "real run waits on the owner".

- [ ] **Step 3: Branch docs**: `HANDOVER.md` and `CLAUDE.md` describe `claude/compare-futures` (what is built, how to
  run, the key setting, cost, what waits on the owner); the career-matching notes stay below as the base branch.

- [ ] **Step 4:** `npm test` → all pass; `python -m unittest discover pipeline/tests` → 49 OK.

- [ ] **Step 5: Record and commit**: `docs: compare futures news acceptance and handover`.
