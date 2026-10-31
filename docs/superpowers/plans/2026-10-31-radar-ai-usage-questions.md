# Radar AI usage question and AI tasks scatter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask "Which of these do you use AI for?" (10 owner categories, checkboxes, skippable) before the Radar shows and keep the answer in the profile; and draw the AI tasks chart as a scatter instead of a spider web.

**Architecture:** Pure rules and the category list in `shared/aiTasks.js`; the profile check in `shared/profileSchema.js`; the question card and the gate in `public/js/screens/radar.js`, wired by actions in `public/js/app.js` that save without turning the profile into a draft. The scatter is a new pure SVG-string component next to `profileRadar`.

**Tech Stack:** Node ≥ 22.12, plain ES modules in the browser, Vitest, SVG strings, CSS variables in `public/styles.css`.

**Spec:** `docs/superpowers/specs/2026-10-31-radar-ai-usage-questions-design.md` (D34–D42). Read it first.

## Global Constraints

- Category ids, in this order: `writing, learning, programming, data, creative, communication, planning, admin, customer, automation`. Names and examples exactly as spec §3.
- Source line (EN): "Categories set by the FutureReady team (31 Oct 2026); not from an outside study."
- Privacy line (EN): "Kept with your profile: on this device, and in your account if you sign in and save it."
- Card heading "Which of these do you use AI for?", sub-line "Tick all that apply. This does not change what the Radar shows.", none option "I don't use AI for any of these", buttons "Continue" and "Skip for now", reopen button "Change my AI use answers".
- Stored shape: `{status:'skipped', date}` or `{status:'answered', picked:[ids in §3 order], date}`; `date` is `YYYY-MM-DD`.
- No key named score, weight, rank, match or opportunit anywhere new. No profile data in any Radar request or log.
- Every UI text through `t(lang, key)` in `en.js`, `ms.js` and `zh.js`; BM and 中文 lines end with `// translation: owner review`. Every HTML value through `esc()`. Browser storage only through the existing guest store.
- `public/styles.css`: one rule per class (`tests/appLook.test.js`).
- Scatter: across = `automation` 0–100 %, dashed line at 50; up = `usage` on log ticks 0.01, 0.1, 1, 10 (%), under 0.01 on a band labelled "under 0.01 %"; colour `var(--est)`; no jitter; side labels "AI mostly helps" / "AI mostly does the task"; up axis "used more often".
- Test first. `npm test` before every commit (expect all to pass; the CV PDF test can time out under load: re-run once before treating it as a failure). Commits `feat:` / `fix:` / `docs:`, no attribution lines. Heredocs break on apostrophes: write helper scripts with the Write tool.

## Review Focus

1. **A confirmed profile stays confirmed** after Continue or Skip: the Radar charts must not vanish. → Task 3 test.
2. **Reopen then Skip keeps the earlier answer** (never overwrites `answered` with `skipped`). → Task 1 test.
3. **Career matching still accepts a profile carrying `aiTasks`** (its route checks the profile's shape). → Task 1 test against `/api/matching` validation.
4. **Old profiles** (no `aiTasks`, or `null`) load, validate and show the card once. → Task 1 and Task 2 tests.
5. **Scatter with one or two tasks** (the spider web needed three) and **many dots at the same spot** (most tasks are under 0.01 %) render without errors. → Task 4 and Task 5 tests.

---

### Task 1: Category list, rules and profile check

**Files:**
- Create: `shared/aiTasks.js`
- Modify: `shared/profileSchema.js` (after the `aiUse` block, ~line 146)
- Test: `tests/aiTasks.test.js` (new), `tests/profileSchema.test.js`, `tests/matching/routes.test.js`

**Interfaces:**
- Produces:
  - `AI_TASK_IDS: string[]` (frozen, §3 order)
  - `togglePick(picked: string[], id: string): string[]` — adds or removes `id`, result in §3 order; unknown id → unchanged copy
  - `answered(picked: string[], date: string) → {status:'answered', picked, date}` (picked sorted to §3 order, duplicates dropped)
  - `skipped(date: string) → {status:'skipped', date}`
  - `afterSkip(current, date) → current if current?.status === 'answered', else skipped(date)`
  - `needsAsking(profile) → boolean` — true when `profile` is an object and `profile.aiTasks` is `undefined` or `null`; false for `null`/missing profile
  - `aiTasksErrors(value) → {path, code}[]` used by `validateProfile`
  - The UI keeps the "none of these" choice as `picked: []` plus a flag `none: true` in screen state only; `canContinue({picked, none}) → picked.length > 0 || none === true`

- [ ] **Step 1: Write the failing tests** in `tests/aiTasks.test.js`:
  - `AI_TASK_IDS` equals the ten ids in order.
  - `togglePick(['data'], 'writing')` → `['writing','data']`; `togglePick(['writing','data'], 'writing')` → `['data']`; `togglePick([], 'nope')` → `[]`.
  - `answered(['data','writing','data'], '2026-10-31')` → `{status:'answered', picked:['writing','data'], date:'2026-10-31'}`.
  - `afterSkip({status:'answered', picked:['data'], date:'2026-10-30'}, '2026-10-31')` returns the same answered object; `afterSkip(undefined, d)` and `afterSkip({status:'skipped', date:'x'}, d)` → `skipped(d)`.
  - `needsAsking({})`, `needsAsking({aiTasks:null})` true; `needsAsking({aiTasks:skipped(d)})` false; `needsAsking(null)` false.
  - `canContinue({picked:[], none:false})` false; with `none:true` or one pick true.
  In `tests/profileSchema.test.js` (new `describe('aiTasks (D38)')`): `validateProfile` ok for no key, `null`, skipped, answered, answered with `[]`; errors `aiTasks` (array or string), `aiTasks.status` (`'maybe'`), `aiTasks.picked` (unknown id, duplicate, wrong order, present with skipped, missing with answered), `aiTasks.date` (`'31/10/2026'`, missing). `emptyProfile()` has no `aiTasks` key.
  In `tests/matching/routes.test.js`: a valid matching request whose profile has `aiTasks: answered(['writing'], '2026-10-31')` is accepted (same status as without it).

- [ ] **Step 2: Run** `npx vitest run tests/aiTasks.test.js tests/profileSchema.test.js tests/matching/routes.test.js` — expect the new tests to FAIL (module not found / errors not reported).

- [ ] **Step 3: Implement** `shared/aiTasks.js` (pure, no I/O) and call `errors.push(...aiTasksErrors(profile.aiTasks))` from `validateProfile` when `profile.aiTasks` is neither `undefined` nor `null`. Error code for a wrong kind is `bad_type`, for a wrong value `bad_enum` (same codes as `aiUse`). Do not add `aiTasks` to `emptyProfile()`.

- [ ] **Step 4: Run** the same command — PASS; then `npm test` — all pass.

- [ ] **Step 5: Commit** `feat: aiTasks categories, rules and profile check (D34, D35, D38)`.

### Task 2: Question card, gate and change button

**Files:**
- Modify: `public/js/screens/radar.js` (`radarView` ~line 877; new exported `aiTasksQuestion`)
- Modify: `shared/strings/en.js`, `ms.js`, `zh.js` (keys below, near the other `rd` keys)
- Modify: `public/styles.css` (after the `.rd-srccard…` rules)
- Test: `tests/radar/radarScreen.test.js`

**Interfaces:**
- Consumes: `AI_TASK_IDS`, `needsAsking`, `canContinue` from Task 1.
- Produces:
  - `aiTasksQuestion({ t, state }) → string` — the card; reads ticks from `state.radar.aiAsk = { picked: string[], none: boolean, open: boolean }`, falling back to the saved `state.profile.aiTasks.picked` (and `none` when saved `picked` is `[]`).
  - `radarView` shows header + banners + the card **only**, whenever `needsAsking(state.profile) || state.radar?.aiAsk?.open`; otherwise today's page plus, right after the header, `<p class="rd-aiask-line"><button class="btn sm ghost" data-act="aiAskOpen">Change my AI use answers</button></p>` when `state.profile?.aiTasks` exists.
  - Card markup: `<article class="rd-srccard rd-aiask"><fieldset><legend>…heading…</legend>` + sub-line + one `<label class="rd-aiask-opt"><input type="checkbox" data-act="aiAskPick" data-arg="<id>" [checked]> <span>name<span class="tiny muted">examples</span></span></label>` per id + the none option with `data-act="aiAskNone"` + source and privacy lines + `<button class="btn" data-act="aiAskContinue" [disabled]>` + `<button class="btn ghost" data-act="aiAskSkip">`.
  - String keys: `rdAiAskTitle`, `rdAiAskSub`, `rdAiAskNone`, `rdAiAskSource`, `rdAiAskPrivacy`, `rdAiAskContinue`, `rdAiAskSkip`, `rdAiAskChange`, and per id `rdAiTask_<id>` (name) and `rdAiTaskEx_<id>` (examples).

- [ ] **Step 1: Write the failing tests** (new `describe('AI usage question (D34-D39)')`):
  - `view(profile())` (no `aiTasks`) contains `rd-aiask`, 10 checkboxes with the §3 ids in order, the none option, the EN source and privacy lines verbatim, and **no** `role="tablist"`.
  - Continue has `disabled` with nothing ticked; not disabled with `radar: { aiAsk: { picked: ['data'], none: false } }` or `{ picked: [], none: true }`.
  - With `aiTasks: skipped(d)` or `answered(['writing'], d)`: no card, the tab bar shows, and the "Change my AI use answers" button is present; with `aiAsk.open: true` the card shows with `writing` checked.
  - `view(null)` shows the Radar (no card).
  - Escaping: names come from `t()`, but a saved unknown id must not be echoed raw (`picked: ['<img>']` in a hand-made profile renders no `<img`).
  - All three languages render the card without missing keys (`t(key) !== key` for every new key in `ms` and `zh`), and every new `ms`/`zh` line carries `// translation: owner review`.
  - D37: with `globalThis.fetch` replaced by a recorder, call every exported function of `public/js/radarApi.js` (public ones; the existing `aiTasks()` there is the server's AI task data, not the answers) and assert no request has a body and no URL contains a category id such as `writing` or the word `picked` (no Radar request can carry the answers).
  - The existing tests that render the Radar with a profile pass `aiTasks: skipped('2026-10-31')` in the `profile()` helper's defaults, so they keep testing the page, not the card; add one test proving the default helper without it shows the card.

- [ ] **Step 2: Run** `npx vitest run tests/radar/radarScreen.test.js` — new tests FAIL.

- [ ] **Step 3: Implement** the card, gate, button, strings (EN text from Global Constraints and spec §3; write BM and 中文, marked for review) and CSS: `.rd-aiask fieldset` reset (no border, no padding), `.rd-aiask-opt{display:flex;gap:10px;align-items:flex-start}` and spacing; card full width (`max-width:none`). Phone: no sideways scroll at 360 px.

- [ ] **Step 4: Run** the screen tests, then `npm test` — all pass.

- [ ] **Step 5: Commit** `feat: Radar asks which tasks you use AI for before it shows (D35, D36, D39)`.

### Task 3: Actions in the app

**Files:**
- Modify: `public/js/app.js` (the `actions` object ~line 588; near `setRadar`)
- Test: `tests/radar/aiAskActions.test.js` (new)

**Interfaces:**
- Consumes: Task 1 functions; Task 2's `data-act` names and `state.radar.aiAsk`.
- Produces: a pure reducer exported from `shared/aiTasks.js` so it can be tested without the DOM:
  `aiAskStep(state, act, arg, date) → { profile, aiAsk }` for `act` in `pick | none | continue | skip | open`, where `continue` sets `profile.aiTasks = answered(picked, date)` (`[]` when `none`), `skip` sets `profile.aiTasks = afterSkip(profile.aiTasks, date)`, both close the card (`aiAsk = null`) and **leave `profileStatus` unchanged**; `pick` / `none` change only `aiAsk` (D35: a pick clears none, none clears picks); `open` seeds `aiAsk` from the saved answer with `open: true`. `continue` with `canContinue` false returns the state unchanged.
  `app.js` actions `aiAskPick`, `aiAskNone`, `aiAskContinue`, `aiAskSkip`, `aiAskOpen` call it with `today()`, then assign `state.profile` directly, `setRadar({ aiAsk })`, `persist()` and `render()` — **never `update()`**.

- [ ] **Step 1: Write the failing tests:** confirmed profile + `continue` with `picked:['data']` → `aiTasks.status 'answered'`, `profileStatus 'confirmed'`; `skip` on a reopened answered profile keeps the answer; `none` then `pick('writing')` → `none:false, picked:['writing']`; `continue` with nothing ticked → unchanged; `open` seeds the saved ticks; the returned profile still passes `validateProfile`.
  Also assert in this test that `public/js/app.js` source has no `update(` call inside the five `aiAsk*` actions (read the file, slice from `aiAskPick:` to the end of `aiAskOpen`).

- [ ] **Step 2: Run** `npx vitest run tests/radar/aiAskActions.test.js` — FAIL.

- [ ] **Step 3: Implement** `aiAskStep` in `shared/aiTasks.js` and the five actions in `app.js`. Checkbox clicks arrive through the existing `data-act` click handler (`app.js` ~line 1227); confirm a click on the `<input>` reaches it and the re-render keeps the tick.

- [ ] **Step 4: Run** tests, then `npm test` — pass.

- [ ] **Step 5: Commit** `feat: Continue, Skip and Change keep the profile confirmed (D36, D38)`.

### Task 4: Scatter component

**Files:**
- Create: `public/js/components/charts/taskScatter.js`
- Test: `tests/radar/charts.test.js`

**Interfaces:**
- Produces: `taskScatter({ items, act, label, t }) → string` (SVG). `items: { id: string, n: number, text: string, automation: number, usage: number, aria: string }[]`. Exported helpers for tests: `xOf(automation) → px`, `yOf(usage) → px` (usage < 0.01 → the band's y), plot box constants `PLOT = { left, right, top, bottom, band }`.
  SVG: `class="rd-scatter"`, `role="group"`, `aria-label` = label; grid lines at x 0/25/50/75/100 (50 dashed, `stroke-dasharray`), y ticks 0.01/0.1/1/10 with labels "0.01%"…"10%", the band with text `t('rdAiScUnder')`; side texts `t('rdAiScHelps')` and `t('rdAiScDoes')`; axis titles `t('rdAiScX')` and `t('rdAiScUp')`; each dot `<g role="button" tabindex="0" data-act="<act>" data-arg="<id>" aria-label="<aria>"><circle class="rd-pt" … style="fill:var(--est)"/><text>T<n></text></g>`. Values outside 0–100 are clamped to the plot; non-finite values are left out (and counted in the list only).
  String keys (EN): `rdAiScX` "AI does the task (% of this task's AI conversations)", `rdAiScUp` "Used more often (share of all AI conversations, log scale)", `rdAiScHelps` "AI mostly helps", `rdAiScDoes` "AI mostly does the task", `rdAiScUnder` "under 0.01%".

- [ ] **Step 1: Write the failing tests:** `xOf(0)` = `PLOT.left`, `xOf(100)` = `PLOT.right`, `xOf(50)` midway; `yOf(10)` = `PLOT.top`, `yOf(0.01)` above `PLOT.band`, `yOf(0.001)` and `yOf(0)` = the band y; one item renders one `role="button"` dot (no bar fallback); 40 items at the same values render 40 dots at identical coordinates; output has the dashed 50 line, the four tick labels, both side labels, `var(--est)`, and none of `score|rank|risk|safe` (case-insensitive) in the text; every text and aria value escaped (`text: '<b>'`).

- [ ] **Step 2: Run** `npx vitest run tests/radar/charts.test.js` — FAIL.

- [ ] **Step 3: Implement** with a log10 mapping between 0.01 and 10; viewBox about 460 × 320 with room for the axis titles; dot labels `T<n>` to the right of the dot, font 10px, `fill:var(--ink)`; strings in all three languages (BM, 中文 marked for review).

- [ ] **Step 4: Run** tests, then `npm test` — pass.

- [ ] **Step 5: Commit** `feat: task scatter chart component (D40-D42)`.

### Task 5: AI tasks card uses the scatter

**Files:**
- Modify: `public/js/screens/radar.js` (`aiTasksCard` ~line 683–697; drop `AI_SCALE` / `AI_RINGS` if unused)
- Modify: `shared/strings/*.js` (`rdAiLegend` text for the scatter)
- Test: `tests/radar/radarScreen.test.js`

**Interfaces:**
- Consumes: `taskScatter` from Task 4; existing `taskCorners`, `AI_CORNER_CHOICES`, `aiCorner` action.
- Produces: the card's chart is `<div class="rd-chart">${taskScatter({ items, act: 'aiCorner', label, t })}</div>`; items are the same first-k numbered tasks as today, each with `aria: T<n>. <text>: <rowText>`.
  New `rdAiLegend` (EN): "Each dot is one task. Across: share of the task's AI conversations where AI does the task (left of the dashed line, AI mostly helps). Up: how often the task appears in all AI conversations. Not a score."

- [ ] **Step 1: Write the failing tests:** the AI card (an O\*NET job with tasks, as in the existing AI card tests) contains `class="rd-scatter"` and not `class="rd-radar"`; dot count equals the corner choice (8 default, 16, All); a job with 1 and with 2 tasks shows a scatter with 1 and 2 dots; clicking data (`data-act="aiCorner" data-arg="3"`) is present; the numbered list, ILO line and source line are unchanged; the D33 labels are still on the card. Update the existing AI-card tests that expected `rd-radar` for the AI chart; the skills chart keeps `rd-radar`.

- [ ] **Step 2: Run** the screen tests — FAIL.

- [ ] **Step 3: Implement** the swap and the legend text (three languages).

- [ ] **Step 4: Run** tests, then `npm test` — pass.

- [ ] **Step 5: Commit** `feat: AI tasks card draws a scatter instead of a spider web (D40)`.

### Task 6: Browser check and records

**Files:**
- Modify: `docs/radar/acceptance.md`, `HANDOVER.md`, `CLAUDE.md`, `docs/record/status.json` (then `python docs/record/build_record.py`)

- [ ] **Step 1:** Start `radar-trial` (http://radar.localhost:3210, Browser pane). With a fresh guest profile: the card shows first; Continue is off until a tick; "none" clears ticks; Continue → Radar; reload → no card; Change → saved ticks; Skip there keeps them. With a confirmed Software Developer profile: after Continue the charts still show (profile stays confirmed). AI Impact: the scatter with 8 / 16 / All, a dot click highlights its row, keyboard Tab + Enter works. Check 1280 px, 375 px (no sideways scroll) and dark mode (switch back afterwards). No console errors from the Radar.
- [ ] **Step 2:** Write the results as a new section in `docs/radar/acceptance.md`; add D34–D42 to `HANDOVER.md` ("AI usage question and scatter") and the rules to `CLAUDE.md` (test count); log the step in `status.json`; rebuild the record.
- [ ] **Step 3:** `npm test` — pass; commit `docs: AI usage question and task scatter, browser check and records`.
