# Radar charts that follow the profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both Radar tabs open with a chart whose corners come from the user's own jobs: in-demand skills (Skills & Careers) and AI use per task (AI Impact). Different profiles give different shapes.

**Architecture:**
- A pure engine `shared/radar/profileCharts.js` builds the corners in the browser from the confirmed profile and public reference data.
- One new public route `/api/radar/ai-tasks` takes no parameters, so the profile never leaves the browser.
- One chart component draws both charts.
- Files the work needs from `main` are copied byte for byte (no merge).

**Tech Stack:** Node ≥ 22.12, Express, plain ES modules in the browser, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-radar-profile-charts-design.md` (D28–D33). Mockup with real numbers: `docs/radar/mockup/role-skill-chart.html` + `mock-data.js` (its numbers are the test values below).

## Global Constraints

- Work in `C:\Users\guiro\XH_Cat_Final-radar` on `claude/future-radar`. Do not merge `main`, push, or open a PR (owner decides).
- Test first. Run `npm test` before every commit. Commit messages start `feat:`, `fix:` or `docs:`, with no attribution lines.
- No key named score, weight, rank, match or opportunit in engine output, routes or UI state. A list number is shown on screen, never stored.
- Every chart, row and message shows its source link and its release/year/date.
- Colours: CSS variables only (`--accent` for skills, `--est` for AI, plus `--line`, `--ink`, `--muted`, `--surface`). No hex values in the new component.
- Only a confirmed profile (`profileStatus === 'confirmed'`) counts. No profile data in any request.
- Strings in `shared/strings/en.js`, `ms.js`, `zh.js`. ms and zh lines end with the comment `// translation: owner review`.
- Bash heredocs break on apostrophes here: write helper scripts with the Write tool and run them with python or node.
- Copied files must stay byte-identical to `main` commit `d4286d6`.

## Review Focus

1. **Search box re-render.** Typing in the skills search re-renders the screen; the user must keep focus and caret position. The test pins this as a pure helper; the browser check covers the rest.
2. **Same skill from two jobs, or a field and a role giving the same O\*NET job.** It must appear once and name each job once. The test is in Task 3.
3. **AI tab opened before `/api/radar/ai-tasks` answers, or it fails.** Show "loading" or "not available", never a crash, and the six-topic card still works. The test is in Task 8.
4. **Job switch index left over from a profile with more jobs.** If `radar.aiJob` is ≥ the new job count, show job 0. The test is in Task 8.
5. **A Hot Technologies name that differs from the flag file's name only by case or spacing, or by a version suffix.** It must still match, because both sides use `nameKey`. The test is in Task 5.

---

### Task 1: Copy the chain and AI data from `main`

**Files:**
- Copy from `C:\Users\guiro\XH_Cat_Final-main` (byte for byte):
  - `data/radar/occupation-bridge.json` (overwrite)
  - `data/radar/source/ISCO_SOC_Crosswalk.csv`, `ISCO_SOC_Crosswalk.xls`, `soc_2010_to_2018_crosswalk.xlsx`
  - `pipeline/fetch_radar_bridge.py` (overwrite)
  - `data/onet/tasks.tsv`
  - `data/ai/aei_tasks.tsv`, `data/ai/ilo_wp140.tsv`, `data/ai/manifest.json`
- Copy and rename:
  - `shared/matching/chain.js` → `shared/radar/chain.js`. Only the first comment line changes: it says the file was copied from `main` `shared/matching/chain.js`.
  - `tests/matching/chain.test.js` → `tests/radar/chain.test.js`. Only the import path changes.
- Create `data/radar/copied-from-main.json`: `{ "fromBranch": "main", "fromCommit": "d4286d6", "copiedAt": "2026-10-31", "files": { "<path>": "<sha256>", … } }` covering every copied file.
- Modify `data/SOURCES.md`: copy `main`'s rows for `ai/ilo_wp140.tsv`, `ai/aei_tasks.tsv`, `ai/manifest.json`, `onet/tasks.tsv` and `radar/occupation-bridge.json` (the bridge row replaces this branch's). Add one line under them: "Copied unchanged from `main` d4286d6 (spec D32); hashes in `data/radar/copied-from-main.json`."
- Test: `tests/radar/copiedFromMain.test.js`

- [ ] **Step 1: Write the failing test.** `copiedFromMain.test.js`:
  - For every entry in `copied-from-main.json`, the file exists and its SHA-256 equals the recorded value.
  - It also pins these values from `main`'s manifests:
    - `data/onet/tasks.tsv` → `5a8d44e15262c3bc8eb606b4b86a7af61eca4305955bb845cb677178aacdca4e`
    - `data/ai/ilo_wp140.tsv` → `0f954dbbf77b4f93d0299b0785cd9841decef56c16a6e7afdb56c33c82d17422`
    - `data/ai/aei_tasks.tsv` → the value in `data/ai/manifest.json`
  - `data/SOURCES.md` contains `ai/aei_tasks.tsv`, `ai/ilo_wp140.tsv`, `onet/tasks.tsv` and `copied-from-main.json`.
- [ ] **Step 2:** Run `npx vitest run tests/radar/copiedFromMain.test.js`. Expected: FAIL (files missing).
- [ ] **Step 3: Copy the files.** Write a small node script in the scratchpad that copies the files, then writes `copied-from-main.json` with `crypto.createHash('sha256')`. Then edit `SOURCES.md`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass, including the copied `chain.test.js`, `relevance.test.js`, `routes.test.js` and `admin.test.js`. The new bridge file keeps the same O\*NET → ISCO steps, and `isco08_to_masco2020_major` stays pending. If an existing test pins the old bridge hash, update that expectation to the new hash and record the change in the commit message body.
- [ ] **Step 5: Commit** `feat: copy code chain and AI task data from main unchanged (D32)`

### Task 2: Your jobs (profileJobs) and ISCO codes for O\*NET jobs

**Files:**
- Modify: `shared/radar/bridge.js` (add `iscoOf`)
- Create: `shared/radar/profileCharts.js` (`profileJobs` only, in this task)
- Test: `tests/radar/profileCharts.test.js`

**Interfaces:**
- Consumes: `relevantItems(profile, refs)` → `{ fields:[{code,title,jobs:[{code,title}]}], occupations:[{source:'onet'|'emasco', code, title, role}] }` (`shared/radar/relevance.js`); `makeChain(bridgeFile).resolve(emascoCode)` → `{ isco, jobs:[onetCode], path:[step], missingStep:null|{id,kind,from,reason} }` (`shared/radar/chain.js`).
- Produces:
  - `makeBridge(file).iscoOf(onetCode) → string[]`: walks `onet_to_soc2018` → `soc2018_to_soc2010` → `soc2010_to_isco08`. Unique, sorted, `[]` when a step is not built or has no row.
  - `profileJobs(rel, { chain, onetTitle }) → { jobs: Job[], broken: Broken[] }`, where:
    - `Job = { code, title, via: [{ kind:'role'|'field'|'chain', from:{source,code,title}, path?:step[] }] }`, unique by `code`, in first-seen order: roles (O\*NET), then fields, then eMASCO roles;
    - `Broken = { source:'emasco', code, title, missingStep }`;
    - each eMASCO job gets `isco` from the chain on its `via` entry (`via.isco`).

- [ ] **Step 1: Write failing tests** (real bridge file via `JSON.parse(readFileSync('data/radar/occupation-bridge.json'))`):
  - `iscoOf('15-1252.00')` contains `'2512'`; `iscoOf('99-9999.99')` is `[]`.
  - An O\*NET role `15-1252.00` gives `jobs[0].code === '15-1252.00'` with `via[0].kind === 'role'`.
  - eMASCO `2512-02` gives jobs `['15-1252.00','15-1253.00']`, each `via.kind === 'chain'` with a non-empty `path` and `via.isco === '2512'`.
  - eMASCO `1121-01` gives no job and `broken[0].missingStep.id === 'masco2020_unit_to_isco08'`, `kind === 'no_row'`.
  - The O\*NET role `15-1252.00` together with eMASCO `2512-02` gives `15-1252.00` once, with two `via` entries (role + chain).
  - A field whose jobs include an O\*NET role already chosen adds a `field` via to the same job, not a second job.
- [ ] **Step 2:** Run `npx vitest run tests/radar/profileCharts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `iscoOf` and `profileJobs`. `profileJobs` takes `rel` (already confirmed-only; `null` → `{ jobs: [], broken: [] }`).
- [ ] **Step 4:** Run the test file, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar works out your O*NET jobs from roles, field and eMASCO code chain`

### Task 3: Skill corners

**Files:**
- Modify: `shared/radar/profileCharts.js`, `server/radar/routes.js`. In `skills()`:
  - each `postings.rows` item gains `skillId: 'onet:tech:'+nameKey(technology)`;
  - `postings` gains `previous: null`. Ruling: the view holds one Hot snapshot today. The engine and chart already read `previous = { window, rows:[{ technology, skillId, postings }] }`, so the dashed line appears without a screen change once a second yearly snapshot is served; serving it is a later Radar refresh task.
- Create: `tests/helpers/radarData.js`: `startRadar() → Promise<{ base, data, close }>`, moved from `radarScreen.test.js`'s `beforeAll` (bundled store, `now` 2026-10-31). `radarScreen.test.js` then uses it.
- Test: `tests/radar/profileCharts.test.js`, `tests/radar/skillsRoute.test.js`

**Interfaces:**
- Consumes: `profileJobs` (Task 2); `data.skills` from `/api/radar/skills`:
  - `changes[code] = { added:[Item], dropped:[Item], kept:[Item] }`, where `Item = { example, skillId, elementName }`;
  - `postings = { window, rows:[{ technology, skillId, postings }], firstSnapshot }`;
  - `release = { current, previous }`.
- Produces: `skillCorners(jobs, skills) → { items: SkillItem[], dropped: [{ example, skillId, jobs:[{code,title}] }], noSkills: [{code,title}], release, window, firstSnapshot }`:
  - `SkillItem = { skillId, example, postings: number|null, previousPostings: number|null, isNew: boolean, jobs: [{ code, title, via }] }`; `previousPostings` comes from `postings.previous.rows` by `skillId`, else `null`;
  - order: `postings` descending, `null` last, ties by `example` (`localeCompare`, `'en'`);
  - in-demand = `kept` ∪ `added`; `isNew` is true only when no job of the user has the skill in `kept`;
  - `dropped` lists skills dropped for a job that is not also in demand for another of the user's jobs.
- Produces: `filterItems(items, q) → items` (case-insensitive substring on `example`; empty `q` → all).

- [ ] **Step 1: Write failing tests** (real data from `startRadar()`):
  - Accountants `13-2011.00`: exactly 6 items. They include `{ example:'Microsoft Excel', postings:3211598 }` and `{ example:'Intuit QuickBooks', postings:174071 }`. The first item is `Microsoft Office software`, with 3421542.
  - Software Developers `15-1252.00`: 30 items, 29 with postings. The item set differs from the Accountants set.
  - Order is non-increasing in `postings`, and the `null` items come last.
  - Registered Nurses `29-1141.00`: `items` is `[]` and `noSkills[0].code === '29-1141.00'`.
  - Graphic Designers + Marketing Managers (`27-1024.00`, `11-2021.00`): 16 items. `Microsoft Office software`, `Microsoft Excel` and `Microsoft PowerPoint` each appear once, with `jobs` codes exactly `['27-1024.00','11-2021.00']`; every other item has one job.
  - `filterItems(items, 'excel')` and `filterItems(items, 'EXC')` both return Excel; `filterItems(items, '')` returns all.
  - `skillsRoute.test.js`: every `postings.rows` item has `skillId` starting with `onet:tech:`.
  - With `postings.previous = null`, every `previousPostings` is `null`. With a synthetic `previous` row for Excel of 3000000, Excel's `previousPostings` is 3000000.
  - Review Focus 5: a synthetic `skills` whose posting row is `'Microsoft  EXCEL '` matches the flag `'Microsoft Excel'` by `skillId`.
  - No key matching `/score|weight|rank|match|opportunit/i` anywhere in the output (deep scan).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement** `skillCorners`, `filterItems` and the `skillId` on posting rows.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: skill corners from your jobs' in-demand O*NET skills and US job-ad counts`

### Task 4: AI task data on the server

**Files:**
- Create: `server/radar/aiTasks.js`: `loadAiTasks(dataDir) → Promise<AiTasks>`, memoised by the caller
- Modify: `server/radar/routes.js`: `radarRoutes({ radar, aiTasks })`, where `aiTasks` is a `() => Promise<AiTasks>`; add `GET /api/radar/ai-tasks`. `/api/radar/references` gains `emascoChain: true` when the bridge has a built `masco2020_unit_to_isco08` step.
- Modify: `server/app.js` (pass a memoised `aiTasks` loader); `public/js/radarApi.js` (`aiTasks({ base }) → { ok:true, data } | { ok:false, code, retryable }`)
- Test: `tests/radar/aiTasksRoute.test.js`

**Interfaces:**
- Produces: `AiTasks = { state:'data', release, dataPeriod, tasks:[{ taskId, code, text, usage, automation, augmentation }], taskCounts:{ [code]: number }, ilo:[{ isco, title, mean, gradient }], sourceLinks:[{label,url}], fetchedAt }`:
  - `taskCounts` = the number of rows per code in the full `tasks.tsv` (`15-1252.00` → 17, `13-2011.00` → 30, `29-1141.00` → 27);
  - `tasks` = only the rows of `data/onet/tasks.tsv` whose `task_id` is in `aei_tasks.tsv` (2,710 rows, 647 distinct codes);
  - `release`, `dataPeriod` and the URLs come from `data/ai/manifest.json` (`aei.release`, `aei.dataPeriod`, `aei.sourceUrl`, `paperUrl`); `fetchedAt` = `aei.downloadedAt`;
  - files missing or a hash differing from `data/ai/manifest.json` → `{ state:'unavailable', reason }`.
- The route answers 200 with that body plus the usual Radar envelope fields where available. It has no query parameters, and any query string is ignored.

- [ ] **Step 1: Write failing tests:**
  - GET `/api/radar/ai-tasks` → 200 with `tasks.length === 2710`.
  - Tasks for `15-1252.00`: 8, `13-2011.00`: 11, `29-1141.00`: 2. `taskCounts` gives 17, 30 and 27.
  - `ilo` has 427 rows; ISCO `2512` → `gradient:'G3'`, `mean:0.53`; ISCO `2221` → `'not_exposed'`.
  - `sourceLinks` include the Hugging Face dataset URL and `https://doi.org/10.54394/HETP0387`.
  - Loading from a temp dir without `data/ai` → `state:'unavailable'`.
  - `/api/radar/references` has `emascoChain: true`.
  - No forbidden keys.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Parse the TSVs by header name, not by position. Numbers via `Number`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: public AI task data route for the Radar (Anthropic Economic Index, ILO WP140)`

### Task 5: Task corners

**Files:** Modify `shared/radar/profileCharts.js`; test `tests/radar/profileCharts.test.js`

**Interfaces:**
- Consumes: `Job` (Task 2), `AiTasks` (Task 4), `makeBridge(file).iscoOf`.
- Produces: `taskCorners(job, aiTasks, { iscoOf }) → { items: TaskItem[], total: number|null, ilo: IloRow[] }`:
  - `TaskItem = { taskId, text, usage, automation, augmentation }`;
  - order: `usage` desc, then `automation` desc, then `text`;
  - `total` = `aiTasks.taskCounts[job.code] ?? 0`.
  - ISCO codes: `via.isco` for chain jobs, else `iscoOf(job.code)`; `ilo` = the matching rows, in code order.
- Produces: `usageText(usage) → string`: `'under 0.01'` when `usage < 0.005`, else `usage.toFixed(2)`.

- [ ] **Step 1: Write failing tests:**
  - Software Developers: 8 items of total 17, first `Modify existing software to correct errors…` (automation 69.12); `ilo[0]` = `{ isco:'2512', gradient:'G3' }`.
  - Accountants: 11 of 30. The task-text set differs from the developers'.
  - Registered Nurses: 2 items, `ilo[0].gradient === 'not_exposed'`.
  - eMASCO `2512-02` job `15-1253.00`: 17 of 30, ISCO `2512`.
  - `usageText(0)` → `'under 0.01'`; `usageText(0.2)` → `'0.20'`.
  - `aiTasks` with `state:'unavailable'` → `{ items:[], total:null, ilo:[] }`.
- [ ] **Step 2–4:** Run → FAIL; implement; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: task corners from Anthropic Economic Index for each of your jobs`

### Task 6: One chart component for both charts

**Files:** Create `public/js/components/charts/profileRadar.js`; test `tests/radar/charts.test.js` (add a `describe('profileRadar')`).

**Interfaces:**
- Produces: `profileRadar({ items, scale, rings, act, label, colour, t }) → string` (SVG, or bars when `items.length < 3`):
  - `items: [{ id, label, value, previous?:number|null, hollow?:boolean, aria }]`. A dashed polygon (`stroke-dasharray`) for `previous` is drawn only when every item has a finite `previous`;
  - `scale`: `{ kind:'log', min:10000, max:5000000 }` or `{ kind:'linear', min:0, max:100 }`;
  - `rings: [{ value, label, dashed?:boolean }]`;
  - `act` is the `data-act` name for corner buttons (`'skCorner'` / `'aiCorner'`), with `data-arg = id`;
  - `colour` is `'accent'` or `'est'`;
  - corner labels: the list number + label wrapped to ≤ 3 lines of ~16 characters when `items.length ≤ 16` (skills) or `≤ 10` (tasks, which the caller passes as `numbersOnlyAbove`); otherwise the number only;
  - a log value below `min` is drawn at 4 % of the radius, never at 0.
- Same viewBox and keyboard pattern as `radarChart.js`: `<g role="button" tabindex="0" data-act data-arg aria-label>`.

- [ ] **Step 1: Write failing tests:**
  - 6 items → one `<polygon` for the data, plus one per ring, and 6 `role="button"` groups with `data-act="skCorner"`.
  - A `hollow` item's circle uses `fill:var(--surface)`.
  - Ring labels `10k`, `100k` and `1M` appear.
  - 2 items → output contains `rd-bars` and no `<polygon`.
  - The output contains no `#` colour (`/#[0-9a-f]{3,6}\b/i` does not match) and uses `var(--est)` when `colour:'est'`.
  - A label with `<script>` is escaped.
  - 30 items → corner texts are numbers only.
  - Items without `previous` → exactly one data polygon with no `stroke-dasharray`. Items all with `previous` → a second polygon with `stroke-dasharray`.
- [ ] **Step 2–4:** Run → FAIL; implement; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: profile radar chart component (log or linear scale, keyboard corners, bar fallback)`

### Task 7: Skills card on Skills & Careers

**Files:**
- Modify: `public/js/screens/radar.js` (new `skillsChartCard({ t, state, data })`, placed first in `skillsTab`), `public/js/app.js`, the three strings files, `public/styles.css` (`rd-rank-list` and related, built on tokens)
- Test: `tests/radar/radarScreen.test.js`

**Interfaces:**
- Consumes: `profileJobs`, `skillCorners`, `filterItems`, `profileRadar`, `makeChain` (built once per references answer, like `refsFor`).
- UI state: `radar.corners = { sk: 8|16|30|'all', ai: 8|16|'all' }` (default 8); `radar.q` (string); `radar.hl` (the highlighted list number, or null).
- App actions:
  - `skCorners(n)`, `skCorner(n)`: sets `hl` and clears `q`, then scrolls `#rd-sk-<n>` into view;
  - the input listener handles `data-radar-search`: sets `radar.q`, then restores focus and caret through a new exported pure helper `keepCaret(prevSelectionStart)` used after render.
- Strings (en; ms/zh with the review comment):
  - `rdSkChartTitle` "Skills your jobs ask for", `rdSkChartTag` "US job ads · O*NET", `rdCorners` "Corners", `rdCornersAll` "All ({n})";
  - `rdSkSearch` "Search your {n} skills", `rdSkShown` "{shown} of {n} · numbered by {year} US job ads";
  - `rdSkFrom` "From", `rdSkNew` "new in {release}", `rdSkNoCount` "no US ad count", `rdSkNoMatch` "No skill matches this search";
  - `rdSkDropped` "No longer in demand ({n}), dropped between O*NET {previous} and {current}";
  - `rdSkNone` "O*NET lists no in-demand software for {job} (O*NET database {release}). No chart is drawn.";
  - `rdChainBroken` "Not available for eMASCO {code}: the code chain stops at {step}. No O*NET job is guessed.";
  - `rdChainPath` "Code chain";
  - `rdSkOneYear` "One year so far: the earlier-year dashed line appears with the next yearly count.";
  - `rdSkLegend` "{year} US job ads asking for the skill (log scale) · hollow point = new in demand";
  - `rdSkSource` "US data, not Malaysian · software skills only · a count of job ads, not a score";
  - `rdConfirmFirst` "Confirm your profile to see the skills your jobs ask for." (button to the form);
  - `rdChainSameUnit` "eMASCO roles in the same 4-digit group share one O*NET link, so they show the same skills."

- [ ] **Step 1: Write failing tests** (`startRadar()` data, rendered HTML):
  - A Software Developer profile (O\*NET role 15-1252.00 in `occupationMappings`) and an Accountant profile render different `data-act="skCorner"` sets. Accountant shows 6 corners, and the list holds `3,211,598` next to Microsoft Excel.
  - Default 8 corners for the developer. With `radar.corners.sk = 16`, 16; with `'all'`, 29 corners (no-count items excluded); the list always has 30 rows numbered 1–30.
  - `radar.q = 'git'` shows only rows whose name contains "git", keeping their original numbers.
  - The nurse profile shows the `rdSkNone` text with the O\*NET summary link and no `<polygon`.
  - eMASCO `1121-01` shows `rdChainBroken` naming MASCO 1121. eMASCO `2512-02` shows the chain path, the step source links and the `rdChainSameUnit` note.
  - A draft profile shows `rdConfirmFirst` and no chart.
  - With `postings.firstSnapshot` true, the card shows `rdSkOneYear`.
  - The card contains the O\*NET database link, the Hot Technologies link (`https://www.onetonline.org/search/hot_tech/`) and the window label.
  - `keepCaret` restores the selection start that was given.
  - Every new string key exists in en, ms and zh (the existing `strings.test.js` pattern).
- [ ] **Step 2–4:** Run → FAIL; implement; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: Skills & Careers opens with a chart of the skills your jobs ask for`

### Task 8: AI Impact card and own-topics filter

**Files:**
- Modify: `public/js/screens/radar.js` (new `aiTasksCard({ t, state, data })`, placed first in `aiTab`; the six-topic chart and its table use `sc.axes` instead of all axes), `public/js/app.js`, the strings files
- Test: `tests/radar/radarScreen.test.js`

**Interfaces:**
- UI state:
  - `radar.aiTasks`: `{ loading:true } | { ok:true, data:AiTasks } | { ok:false, code }`, fetched once by `loadAiTasks()` when the AI tab is first shown (from `radarTab('ai')` and on a render of the AI tab without it);
  - `radar.aiJob` (number, default 0; ≥ job count → 0).
- Actions: `aiJob(i)`, `aiCorners(n)`, `aiCorner(n)` (scroll `#rd-ai-<n>`).
- Strings (en):
  - `rdAiChartTitle` "How AI is used in your jobs' tasks", `rdAiChartTag` "observed use · Anthropic Economic Index";
  - `rdAiExposure` "Generative AI exposure of {job}: {gradient} for ISCO-08 {isco} {title} (mean task score {mean})";
  - `rdAiGrad_G4` "Gradient 4 (highest exposure)", `rdAiGrad_G3` "Gradient 3", `rdAiGrad_G2` "Gradient 2", `rdAiGrad_G1` "Gradient 1", `rdAiGrad_minimal` "Minimal exposure", `rdAiGrad_not_exposed` "Not exposed";
  - `rdAiNoIsco` "no ISCO-08 code on the chain, so not available";
  - `rdAiShown` "{n} of {total} O*NET tasks of this job appear in AI conversations; ordered by how often";
  - `rdAiRow` "AI does it {auto}% · AI helps {aug}% · {usage}% of all conversations";
  - `rdAiLegend` "Each point: share of this task's AI conversations where AI does the task. The rest is AI helping a person. Dashed ring = half and half.";
  - `rdAiNone` "None of this job's {total} O*NET tasks appear in the AI conversations data. No chart is drawn.";
  - `rdAiLoading` "Loading AI task data…", `rdAiUnavailable` "AI task data not available.";
  - `rdAiSource` "how AI is used today, not a forecast of jobs lost, and not a score";
  - `rdJob` "Job";
  - `rdTopicsOwn` "AI research topics linked to your field", `rdTopicsViewAll` "View all six topics".

- [ ] **Step 1: Write failing tests** (with `radar.aiTasks = { ok:true, data }` from the real route):
  - The developer and accountant profiles render different `data-act="aiCorner"` sets: 8 and 8 by default, with 11 accountant rows in the list.
  - The developer shows `Gradient 3` and ISCO `2512`, with the ILO DOI link.
  - The nurse renders bars (no `<polygon` in this card) and `Not exposed`.
  - The designer + marketing profile shows a job switch with 2 buttons. `radar.aiJob = 5` renders job 0 (Review Focus 4).
  - `radar.aiTasks = { loading:true }` renders `rdAiLoading`; `{ ok:false }` renders `rdAiUnavailable`. In both cases the topic card still renders (Review Focus 3).
  - With the default view, the topic chart shows only `sc.ownAxes` when the profile has approved links. With `radar.all.ai`, it shows all 6. With no approved links, all 6 plus the existing `rdGlobalView` note.
  - `rdAiSource` and the Hugging Face link are present.
  - No forbidden keys in UI state after the actions.
- [ ] **Step 2–4:** Run → FAIL; implement; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: AI Impact opens with how AI is used in your jobs' tasks; topic chart shows your field's topics`

### Task 9: Docs, browser check, build record

**Files:**
- `docs/radar/contract.md` (the `/api/radar/ai-tasks` row: reference data, not signals)
- `docs/superpowers/specs/2026-10-30-future-radar-round1-design.md` (pointer row to D28–D33)
- `docs/superpowers/specs/2026-10-30-radar-skill-trends-design.md` (D27: "replaced by D29 on 31 Oct")
- `docs/tools-declaration.md` (no new tool, unless one is added)
- the branch's `HANDOVER.md` and `CLAUDE.md` (test count, the new decisions, the copied-from-main note)
- `docs/radar/acceptance.md` (or the existing browser-results file)
- `docs/record/status.json` → `python docs/record/build_record.py`

- [ ] **Step 1: Browser check.** Start `radar-trial` (`radar.localhost:3210`, or `127.0.0.2:3210`). Check light and dark, plus 375 px width with no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`). Use confirmed profiles for Software Developer, Accountant, eMASCO 2512-02 and Registered Nurse. Check both tabs, the corner switch, search with focus kept, a corner click jumping to its row, and keyboard Enter on a corner. Take screenshots.
- [ ] **Step 2:** Write the docs above and the build-record entry with the screenshots' findings.
- [ ] **Step 3:** Run `npm test` and `python -m unittest discover pipeline/tests`. Expected: all pass. Write the counts into `HANDOVER.md`/`CLAUDE.md`.
- [ ] **Step 4: Commit** `docs: profile charts browser check, contract, handover and build record`
