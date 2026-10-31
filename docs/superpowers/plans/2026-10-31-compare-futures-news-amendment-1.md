# Compare Futures News — Amendment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop non-news results with a DeepSeek relevance check (N9), drop copies of one story whose headline ends in a
site name, and say "English articles only" on every list (N10).

**Architecture:** A pure headline rule in `shared/news/rules.js`; a new `server/news/relevance.js` (prompt, request,
reading the answer); `server/news/service.js` sends each field's new items to the check, under its own caps, and the
reply shows checked items only; the screen adds the English and check lines.

**Tech Stack:** Node ≥ 22.12, Express, ES modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-compare-futures-news-design.md` (Amendment 1: N9, N10, §3, §5, §6, §7, §8,
§9, §11, §12) · Diagram `docs/architecture-compare-futures.html` (Amendment 1). Both approved by the owner, 31 Oct 2026.
Builds on the base plan `docs/superpowers/plans/2026-10-31-compare-futures-news.md` (done).

## Global Constraints

- Check request: `POST https://api.deepseek.com/chat/completions`, body `{ model: "deepseek-flash", thinking: { type: "disabled" }, response_format: { type: "json_object" }, temperature: 0, max_tokens: 1000, messages: [...] }`, header `Authorization: Bearer <DEEPSEEK_API_KEY>`.
- Answer shape `{"keep":[ids],"drop":[{"id":n,"reason":r}]}`, `r` in `paper, listing, homework, event, directory, shop, job, off_topic, other`. Kept = whole-number ids of sent items that appear in `keep`; all else dropped.
- Retry once for network, timeout, 408, 429, 5xx **and** a blank or wrong answer; 401/402 stop the run.
- Check caps: 10 per run, 80 per 24 hours, counted like searches (memory and store, before each request).
- Sent to the model: field title and each item's headline, site, snippet. Never a URL, never profile data.
- Unchecked items are never in `/api/news`. A failed check adds no new item (`lastError: "check_<code>"`).
- Trailing site name: text after the last ` | `, ` - `, ` – ` or ` — ` when that text is at most 40 characters.
- Strings in en/ms/zh; ms/zh lines end with `// translation: owner review`.
- Test first; `npm test` before every commit and stop on a failure; `feat:`/`fix:`/`docs:`, no attribution lines; a
  `docs/record/status.json` log entry per task, then `python docs/record/build_record.py`.
- No real DeepSeek call in tests. The one real run (Task 5) uses the owner's key in local `.env`, approved with the design.

## Review Focus

1. **Model ids in odd shapes** (`"3"`, `3.0`, `-1`, `99` out of range, repeated ids, an id in both keep and drop) → only
   whole numbers naming a sent item count; a repeated id keeps the item once. Test in Task 2.
2. **Answer cut off at `max_tokens`** (half a JSON object) or blank content (DeepSeek's JSON mode blanks bad output) →
   one retry, then `check_bad_reply`, no new items. Test in Task 2.
3. **A field with no new items** → no check request at all (no cost), outcome `no_results`, last list kept. Test in Task 3.
4. **The check keeps nothing** → `no_results`, `dropped` = number sent, last list kept. Test in Task 3.
5. **Items saved before the amendment while the check keeps failing** → never shown (reply filters on `checked`). Test in Task 3.

---

### Task 1: Headline repeat ignores a trailing site name

**Files:** Modify `shared/news/rules.js`; Test `tests/news/rules.test.js`

**Interfaces:**
- Produces: `newItems(kept: Item[], found: Item[]) -> Item[]` — the found items that do not repeat a kept item or an
  earlier found item (same link or headline rules as `mergeItems`), in found order, no `foundAt` added.
  `mergeItems` keeps its signature; its headline key now strips the trailing site name.

- [ ] **Step 1: Failing tests**
  - `mergeItems([], [a, b], runAt)` with `a.title = 'AI is coming to construction sites. But does it make workers safer?'` and `b.title = a.title + ' | News'` (other link) → 1 item, `a`.
  - same with suffixes `' - CNBC'`, `' – Site'`, `' — The Star'` → 1 item each.
  - a suffix of 41+ characters is not stripped: `'Big news - ' + 'x'.repeat(41)` and `'Big news'` → 2 items.
  - `'Rust - the language'`-style headline: `'Rust - the language'` vs `'Rust'` → 1 item (documents the 40-char rule; accepted).
  - `newItems([kept06], [repeatOfKept, fresh1, fresh1Copy])` → `[fresh1]`.
- [ ] **Step 2:** `npx vitest run tests/news/rules.test.js` → FAIL.
- [ ] **Step 3:** Implement: `headlineKey(title)` removes `/\s+[|\-–—]\s+([^|\-–—]{1,40})$/u` once before collapsing; add `newItems`.
- [ ] **Step 4:** Run → PASS; `npm test` → all pass.
- [ ] **Step 5:** Record and commit `feat: news repeats ignore a trailing site name`.

---

### Task 2: Relevance check client

**Files:** Create `server/news/relevance.js`; Test `tests/news/relevance.test.js`

**Interfaces:**
- Consumes: `NewsSearchError` from `server/news/deepseek.js` (same error codes).
- Produces: `CHECK_URL = 'https://api.deepseek.com/chat/completions'`, `CHECK_MODEL = 'deepseek-flash'`,
  `DROP_REASONS` (the 9 codes), `checkMessages(fieldTitle: string, items: Item[]) -> Array<{ role, content }>`,
  `readAnswer(content: string, count: number) -> { keep: number[], reasons: { [reason]: number } }` (throws
  `NewsSearchError('bad_reply')`), `createRelevanceCheck({ apiKey, fetchImpl = fetch, timeoutMs = 30000, retryDelayMs = 30000, sleep }) -> { check(fieldTitle, items): Promise<{ keep: number[], reasons }> }`.

- [ ] **Step 1: Failing tests** (fake fetch, no real call):
  - request: one POST to `CHECK_URL`, header `authorization: Bearer test-key`, body has exactly the Global Constraints
    fields; the messages contain the word `json`, the field title, each item's headline, site and snippet numbered from
    0, an example answer, and no `http` text and no profile words.
  - `readAnswer('{"keep":[0,2],"drop":[{"id":1,"reason":"paper"}]}', 3)` → `{ keep: [0, 2], reasons: { paper: 1 } }`.
  - `readAnswer` ignores `"2"`, `2.5`, `-1`, `3` (count 3), and a repeated `0` → `keep: [0]`; an unknown reason counts as `other`; dropped items with no listed reason count as `other` (so the reason counts add up to `count - keep.length`).
  - `readAnswer('', 3)`, `'   '`, `'{"keep":'`, `'{"keep":"0"}'`, `'[0]'` → `bad_reply`.
  - `check`: blank content then good content → one retry after `sleep(30000)`, result from the second; blank twice → `bad_reply` after 2 calls; 429 then 200 → retry; 401/402/400 → no retry, `http_<status>`; a choice with `finish_reason: "length"` and cut JSON → treated as bad reply.
  - the error never contains the key.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Content is `data.choices?.[0]?.message?.content`. Prompt text as in spec §5 (fixed, English).
- [ ] **Step 4:** Run → PASS; `npm test` → all pass.
- [ ] **Step 5:** Record and commit `feat: DeepSeek relevance check client for news`.

---

### Task 3: Service sends new items to the check

**Files:** Modify `server/news/service.js`; Test `tests/news/service.test.js`

**Interfaces:**
- Consumes: `newItems`, `mergeItems` (Task 1); `createRelevanceCheck`, `CHECK_MODEL` (Task 2).
- Produces: `createNewsService({ …, relevance: { check } | null })` (required when `enabled`); constants
  `MAX_CHECKS_PER_RUN = 10`, `MAX_CHECKS_PER_DAY = 80`; store state gains `checks: string[]`; field record gains
  `dropped: number`, `dropReasons: object`; kept items gain `checked: true`; snapshot gains `checkedBy: CHECK_MODEL`,
  per field `dropped`, and lists only `checked` items without the flag. `createNewsServiceFromEnv` builds the check from the same key.

- [ ] **Step 1: Failing tests** (fake search + fake check; existing tests get a pass-all fake check):
  - per field: candidates = kept items without `checked` + `newItems(checked kept, found)`; one `check(field.title, candidates)` call; kept candidates get `checked: true` and merge; `dropped` = candidates − kept; `dropReasons` stored; outcome `ok` when at least one kept, else `no_results` (Review Focus 4).
  - no candidates → no check call, outcome `no_results`, `dropped: 0` (Review Focus 3).
  - check throws `bad_reply` → field `failed`, `lastError: 'check_bad_reply'`, items unchanged, others go on; `http_402` from the check stops the run with `stopped: 'check_http_402'` and logs `[news] deepseek 402`.
  - check caps: 75 checks in the last 24 h in the store → 5 checks, then `stopped: 'daily_check_cap'`; never more than 10 per run; each check stamp written before the call; a store write failure cannot reset the count (as for searches).
  - snapshot: an unchecked item in the store is not in the reply (Review Focus 5); items have no `checked` key; `checkedBy: 'deepseek-flash'`; each field has `dropped` (0 when missing); still no `score|weight|rank` key.
  - from env without a key: no check is ever built or called.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement in `run()` right after `found` is computed; the check counter mirrors the search counter (`checks` in memory and store, union on read, pruned to 24 h).
- [ ] **Step 4:** Run → PASS; `npm test` → all pass.
- [ ] **Step 5:** Record and commit `feat: news relevance check in the refresh, checked items only`.

---

### Task 4: Screen lines and strings

**Files:** Modify `public/js/screens/futures.js`, `shared/strings/{en,ms,zh}.js`; Test `tests/news/futuresScreen.test.js`

**Interfaces:**
- Consumes: reply fields `checkedBy`, per-field `dropped` (Task 3).
- Strings: change `nwRules` to "Kept: English articles only; a title, a link and a publish date in the last {days} days; repeats removed; newest {max}."; add `nwChecked` "Checked by DeepSeek ({model}) as news about AI in this field" and `nwDropped` "{n} results dropped as not news." (ms/zh translated, owner review; ms/zh `nwRules` say the articles are in English).

- [ ] **Step 1: Failing tests:** the list shows `English articles only`; with `checkedBy: 'deepseek-flash'` and `dropped: 7` it shows `Checked by DeepSeek (deepseek-flash) as news about AI in this field · 7 results dropped as not news.`; with `dropped: 0` the dropped part is left out; without `checkedBy` (old reply) no check line; all text escaped.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement in `list()`.
- [ ] **Step 4:** Run → PASS; `npm test` → all pass.
- [ ] **Step 5:** Record and commit `feat: news screen says English only and how results were checked`.

---

### Task 5: Local check, real run and docs

**Files:** Modify `scripts/news-local.mjs` (fake check that drops items whose headline contains "arXiv" or "Assignment", one field's check failing), `data/SOURCES.md` (DeepSeek chat model row: endpoint, model, price, what is sent), `docs/news/acceptance.md` (C8, C9), `HANDOVER.md`, `CLAUDE.md`, `.env.example` (comment: the key also pays for the check), record.

- [ ] **Step 1:** Fake-search browser check at `futures.localhost:3271`: C9 (the failing field shows no new items, note shown), the English and check lines.
- [ ] **Step 2:** Real run at `futures.localhost:3272` (owner's `.env`): one refresh (10 searches, at most 10 checks); C8 — the junk kinds seen in the first run are gone, copies with a site-name ending show once, the lines show; record searches, checks and the dropped counts per field; stop the server.
- [ ] **Step 3:** Docs as listed; `npm test` → all pass; `python -m unittest discover pipeline/tests` → 49 OK.
- [ ] **Step 4:** Record and commit `docs: news relevance check acceptance and handover`.
