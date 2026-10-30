# Career Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank Malaysian eMASCO roles for a confirmed profile with a "levels met ÷ levels needed" Skill Match, a
separate sourced outlook per AI scenario (Moderate / Rapid) that sorts roles into four bands, and owner-approved SDG
links with a path contribution.

**Architecture:** Offline Python pipelines write hashed data files (eMASCO details, O\*NET requirements and tasks, the
finished occupation bridge, ILO and Anthropic AI data, UN SDG targets, team SDG drafts). Pure modules in
`shared/matching/` (chain, fit, outlook, sdg) do all the maths. `server/matching/` loads the data once, reads the
Radar's active manifest (or a judge's demo session) and answers two POST routes; the profile is used and dropped.
The browser renders the `#match` and `#sdg` tabs as in the approved mockup; SDG decisions reuse the Radar admin, its
keys and its review store.

**Tech Stack:** Node ≥ 22.12 ES modules, Express 5, Vitest, browser ES modules (no build step), Python 3 standard
library for `pipeline/` (`unittest`), existing helpers `fetch_isced.read_xlsx_rows`, `server/radar/reviews.js`.

**Spec:** `docs/superpowers/specs/2026-10-30-career-matching-design.md` (decisions M1–M15). Diagram:
`docs/architecture-matching.html`. Approved mockup: `docs/mockup-matching.html`. Radar contract:
`docs/radar/contract.md`.

Work in `C:\Users\guiro\XH_Cat_Final` on branch `claude/career-matching`.

## Global Constraints

- No scoring or matching method from the old project: no 0.8/0.6 weights, no 70% ready line, no 60% factor, no
  bge-m3 or any meaning model, no word matching between eMASCO and O\*NET.
- eMASCO → O\*NET only through `data/radar/occupation-bridge.json`. A broken chain answers "not available" with the
  missing step, never a guess.
- Skill Match = Σ min(you, needed) ÷ Σ needed × 100, rounded to a whole number; items = O\*NET skills (Essential +
  Transferable) and knowledge with importance ≥ 3.0, excluding Recommend Suppress = Y and Not Relevant = Y; levels
  basic 2, good 4, expert 6; "Not assessed yet" = meets the level and sets `provisional: true`.
- Trends and the AI scenario never change the Skill Match.
- Read Radar signals only as `docs/radar/contract.md` allows ("What Matching may read / must not infer"). Group signals
  are always labelled "group level, not this job".
- No key containing `score`, `weight`, `rank` or `opportunit` in any matching response or data file (the Radar's
  `FORBIDDEN_KEY_PATTERN`); the Skill Match key is `skillMatch`, its value `percent`.
- Only owner-approved SDG links are used. The path contribution is a count of links per goal, never a score.
- The profile sent to `/api/matching*` is never stored and never logged; logs hold codes only.
- Every list and number on screen shows its source and date; every UI text goes through `t(lang, key)` with keys in
  `shared/strings/en.js`, `ms.js` and `zh.js` (BM and 中文 marked `translation: owner review` in a comment); every
  interpolated HTML text goes through `esc()`.
- New data: a row in `data/SOURCES.md` (where from, date, licence), SHA-256 in a manifest, the original kept when small
  (< 2 MB). The 219 MB Anthropic file and the 13 MB O\*NET zip are not kept; their URL and SHA-256 are.
- Test first. `npm test` passes before every commit; `python -m unittest discover pipeline/tests` passes after any
  pipeline change. Commits `feat:` / `fix:` / `docs:`, no attribution lines. Record each finished task in
  `docs/record/status.json` and run `python docs/record/build_record.py`.
- No push, merge, PR or paid service without the owner's yes.

## Review Focus

1. A profile skill with no `canonicalId`, or an id that is in no job's requirements → listed under `unusedIds`, never
   an error and never counted. (Task 13 test.)
2. The same `canonicalId` twice in a profile with different levels → the highest stated level counts; "not assessed"
   only when no entry has a level. (Task 10 test.)
3. A chain that reaches only O\*NET "All Other" codes (no requirement rows) → those jobs are dropped; with none left the
   role gets `missingStep.id = 'no_onet_data'`. (Task 9 test.)
4. Radar store unreadable or a judge session that has expired → `/api/matching` still answers 200, job ads
   "not available", bands from the AI part only (band 4 when nothing is known). (Task 13 test.)
5. A malformed body (`profile` not an object, `skills` not an array, body over 64 kB) → 400 `bad_request` in the app's
   error shape, nothing logged. (Task 13 test.)

---

### Task 1: eMASCO role details (copied crawl)

**Files:**
- Create: `pipeline/import_emasco_details.py`, `pipeline/tests/test_import_emasco_details.py`
- Create (output): `data/emasco/role_details.json`, `data/emasco/manifest.json`
- Modify: `data/SOURCES.md`

**Interfaces:**
- Produces: `data/emasco/role_details.json` = `{schemaVersion: "emasco-role-details/v1", source, fetchedAt:
  "2026-10-23", roles: [{code, title, description, url, group, tags, qualification, tasks: [str], skills: [{text,
  type: "basic"|"specific"}], pageState: "full"|"tasks_only"|"unparsed"}]}`, sorted by code.
- Python: `build_details(old: dict) -> dict` (pure), `main(argv)` with `argv[1]` = path to the old crawl file.

- [ ] **Step 1: Write the failing tests** — `test_build_details_keeps_fields_and_order` (two roles out of order → sorted;
  only the listed keys kept), `test_tasks_only_and_unparsed_states` (a role from `tasksOnly` gets `pageState:
  "tasks_only"`, a code from `unparsed` text `"1113-01: …"` gets a stub `{code, title: null, pageState: "unparsed"}` when
  absent from roles), `test_bad_skill_type_rejected` (type `"other"` → `ValueError`).
- [ ] **Step 2: Run** `python -m unittest pipeline.tests.test_import_emasco_details` — FAIL (module missing).
- [ ] **Step 3: Implement** `build_details`; `main` reads `C:/Users/guiro/XH-Cat_Domain1/data/emasco/occupations.json`
  (data only, owner decision M3), writes the output with `newline="\n"`, writes `manifest.json` `{files:
  {"role_details.json": sha256}, copiedFrom: "team eMASCO crawl", fetchedAt: "2026-10-23", builtAt: today}`.
- [ ] **Step 4: Run** the tests — PASS. Run `python pipeline/import_emasco_details.py "C:/Users/guiro/XH-Cat_Domain1/data/emasco/occupations.json"` — prints `1766 roles`.
- [ ] **Step 5:** Add the `data/SOURCES.md` row (eMASCO English pages, fetched 2026-10-23, public government reference, display only). Commit `feat: eMASCO role details from the team crawl (display only)`.

### Task 2: eMASCO crawl script (refresh)

**Files:**
- Create: `pipeline/fetch_emasco.py`, `pipeline/tests/test_fetch_emasco.py`, `pipeline/tests/fixtures/emasco_2521-03.html`

**Interfaces:**
- Python: `parse_role(html: str, code: str, url: str) -> dict` (same role shape as Task 1, plus `subMajorGroup:
  {code, title} | None` when the page shows it), `allowed(robots_txt: str, path: str) -> bool`, `main(argv)` writes
  `data/emasco/crawl-<YYYY-MM-DD>.json` (never overwrites `role_details.json`), one request per second.

- [ ] **Step 1:** Save one real page `https://emasco.mohr.gov.my/masco/2521-03` as the fixture (check `robots.txt`
  first; record the save date in the test file's header comment).
- [ ] **Step 2: Write the failing tests** — `test_parse_fixture` (title `Business Database Analyst`, ≥ 1 task, ≥ 1
  skill with type in {basic, specific}), `test_robots_disallow` (`Disallow: /masco/` → `allowed(...) is False`),
  `test_main_refuses_when_disallowed` (fake fetch returning that robots text → exit code 2, no file written).
- [ ] **Step 3: Run** — FAIL. **Step 4: Implement** with `html.parser` only. **Step 5: Run** — PASS.
- [ ] **Step 6:** Commit `feat: eMASCO crawl script for refreshes (robots.txt first, one request per second)`.

### Task 3: O\*NET requirements and task statements

**Files:**
- Modify: `pipeline/fetch_onet.py` (add two tables to `FILES`), `pipeline/tests/test_fetch_onet.py`
- Create (output): `data/onet/requirements.tsv`, `data/onet/tasks.tsv`; `data/onet/manifest.json` gains their hashes

**Interfaces:**
- `requirements.tsv` header `kind	element_id	element	code	importance	level	suppress	not_relevant`; `kind` `el` for
  Essential/Transferable Skills (and old `Skills.txt`), `kn` for Knowledge; one row per job and element, joining the IM
  and LV rows (`suppress` = `Y` if either row has Recommend Suppress `Y`; `not_relevant` from the LV row).
- `tasks.tsv` header `task_id	code	task` from `Task Statements.txt` (`Task ID`, `O*NET-SOC Code`, `Task`).

- [ ] **Step 1: Write the failing tests** in `test_fetch_onet.py` with a tiny in-memory zip:
  `test_requirements_join_im_and_lv` (IM 3.88 + LV 4.12 → one row `el …	3.88	4.12	N	N`),
  `test_requirements_suppress_and_not_relevant`, `test_tasks_table`, and `test_existing_files_unchanged` (the other
  output files are byte-identical to before for the same zip).
- [ ] **Step 2: Run** `python -m unittest pipeline.tests.test_fetch_onet` — FAIL.
- [ ] **Step 3: Implement** a `requirements(archive)` builder like `work_activities` (it needs two scales, so it is
  not a plain `FILES` entry) and a `tasks.tsv` entry in `FILES`.
- [ ] **Step 4: Run** tests — PASS. Run `python pipeline/fetch_onet.py 31.0`; check with `git diff --stat data/onet`
  that only `requirements.tsv`, `tasks.tsv` and `manifest.json` changed (if another file changed, stop and report).
- [ ] **Step 5:** `npm test` — 651+ passed. Update the O\*NET rows in `data/SOURCES.md`. Commit `feat: O*NET 31.0 requirement levels and task statements`.

### Task 4: Finish the code chain (BLS steps + MASCO same-code step)

**Files:**
- Modify: `pipeline/fetch_radar_bridge.py`, `pipeline/tests/test_radar_bridge.py`, `data/radar/occupation-bridge.json`
- Modify if a test needs it: `shared/radar/bridge.js` (only to ignore the new step id)

**Interfaces:**
- New step `{id: "masco2020_unit_to_isco08", from: {system: "MASCO", version: "2020"}, to: {system: "ISCO-08",
  version: "2008"}, method: "same_code", status, source: {name: "MASCO 2020 publication (MOHR): developed in
  accordance with ISCO; owner decision M15, 30 Oct 2026", url: "https://jtksm.gov.my/sites/default/files/2022-12/MASCO_2020_BI_Edaran.pdf", file: null, sha256: null}, label: "code match, not an official table", links: {"2521": ["2521"], …}}`.
  It is `built` when the `soc2010_to_isco08` step is built: links = every 4-digit code in `role_details.json` that is
  also an ISCO-08 code in that step's links; otherwise `pending` with `pendingReason` "waits for the ISCO-08 code list in
  the BLS ISCO file".
- Accept `ISCO_SOC_Crosswalk.xlsx` / `.csv` as file names for the ISCO step (owner saves the `.xls` as one of these).

- [ ] **Step 1: Write the failing tests** — `test_masco_step_pending_without_isco_file`,
  `test_masco_step_same_code_only_for_isco_codes` (eMASCO codes 2512-01 and 1611-01; ISCO file has 2512 → links
  `{"2512": ["2512"]}`; 1611 absent), `test_isco_file_name_variants`.
- [ ] **Step 2: Run** `python -m unittest pipeline.tests.test_radar_bridge` — FAIL.
- [ ] **Step 3: Implement**; `build_bridge(source_dir, now=None, emasco_codes=None)` gains the optional code list
  (read from `data/emasco/role_details.json` in `main`).
- [ ] **Step 4: Run** pipeline tests and `npm test` (Radar bridge tests must still pass) — PASS. Run
  `python pipeline/fetch_radar_bridge.py` and commit the regenerated bridge.
- [ ] **Step 5:** Commit `feat: chain step MASCO 2020 to ISCO-08 by same code (owner decision M15)`.

### Task 5: ILO WP140 exposure per ISCO-08 occupation

**Files:**
- Create: `pipeline/fetch_ilo.py`, `pipeline/tests/test_fetch_ilo.py`
- Create (output): `data/ai/ilo_wp140.tsv`, `data/ai/source/Final_Scores_ISCO08_Gmyrek_et_al_2025.xlsx` (kept if
  < 2 MB), `data/ai/manifest.json`

**Interfaces:**
- `ilo_wp140.tsv` header `isco	title	mean	sd	gradient`; gradient one of `G4 G3 G2 G1 minimal not_exposed`.
- Python: `gradient(mean: float, sd: float) -> str` implementing WP140 Table 5 exactly:
  G4 μ≥0.6 and μ−σ≥0.5; G3 0.5≤μ<0.6 and μ+σ≥0.5; G2 0.4≤μ<0.5 and μ+σ≥0.5; G1 μ<0.4 and μ+σ≥0.5;
  minimal μ<0.5 and μ+σ>0.4; else not_exposed. Rules are checked in this order; record in a comment that G1/G2 are
  checked before minimal.
- Reads columns `ISCO_08`, `Title`, `mean_score_2025`, `SD_2025` (one value per occupation; first row per `ISCO_08`).

- [ ] **Step 1: Write the failing tests** — `test_gradient_bounds` (0.6/0.1 → G4; 0.6/0.15 → G3 because μ−σ<0.5;
  0.55/0.0 → G3; 0.45/0.1 → G2; 0.35/0.2 → G1; 0.35/0.1 → minimal; 0.2/0.1 → not_exposed),
  `test_one_row_per_isco` (an xlsx fixture from `tests/helpers`-style builder in Python with two task rows for 2512).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (download from the repository's raw URL; confirm the branch name
  at run time and record the exact URL). **Step 4: Run** — PASS; run the script.
- [ ] **Step 5:** `data/SOURCES.md` row (CC BY 4.0, paper DOI, repository URL, date). Commit `feat: ILO WP140 GenAI exposure by ISCO-08 occupation`.

### Task 6: Anthropic Economic Index per O\*NET task

**Files:**
- Create: `pipeline/fetch_aei.py`, `pipeline/tests/test_fetch_aei.py`
- Create (output): `data/ai/aei_tasks.tsv`; `data/ai/manifest.json` gains release, URL, SHA-256 of the original

**Interfaces:**
- `aei_tasks.tsv` header `task_id	usage_pct	automation_pct	augmentation_pct`.
- Python: `extract(rows: Iterable[dict], tasks: dict) -> list[tuple]` keeps rows with `category_name == "onet"` and
  `hierarchy_level == "0"`, metric ids `usage_pct`, `collaboration_bucket_automation_pct`,
  `collaboration_bucket_augmentation_pct`, global geography only (`geo_level` as the documentation names it; record
  it). `node_external_id` is matched to `tasks.tsv` by Task ID; if the file keys tasks by statement text instead, by
  exact text (`tasks` maps both). Unmatched rows are counted and printed, never guessed.
- Source: `https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/release_2026_06_26/data/aei_claude_ai_2026-06-26.csv`
  (confirm the path at run time), streamed to a temp file, SHA-256 recorded, file deleted after.

- [ ] **Step 1: Write the failing tests** — `test_extract_task_rows_only`, `test_match_by_id_or_text`,
  `test_unmatched_counted`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with `csv` streaming. **Step 4: Run** — PASS; run the script
  (free download, 219 MB) and report the matched / unmatched counts in the commit body.
- [ ] **Step 5:** `data/SOURCES.md` row (CC-BY data, release, date). Commit `feat: Anthropic Economic Index task usage (release 2026-06-26)`.

### Task 7: UN SDG goals and targets

**Files:**
- Create: `pipeline/fetch_sdg_targets.py`, `pipeline/tests/test_fetch_sdg_targets.py`,
  `pipeline/tests/fixtures/sdg_goal4_targets.json` (a saved real answer for goal 4)
- Create (output): `data/sdg/targets.json`

**Interfaces:**
- `targets.json` = `{source: "UN Statistics Division SDG API", url, fetchedAt, goals: [{code: "4", title}], targets:
  [{code: "4.4", goal: "4", title}]}` — 17 goals, 169 targets; one request per goal
  (`/v1/sdg/Goal/{n}/Target/List?includechildren=false`; the all-goals call times out).
- Python: `parse_goal_targets(payload) -> list[dict]`.

- [ ] **Step 1–4:** tests `test_parse_goal4` (target `4.4` present with the official title) and
  `test_counts_17_and_169` (on the written file, skipped when absent) → FAIL → implement → PASS; run the script.
- [ ] **Step 5:** SOURCES row (terms "not stated on the API; UN material"). Commit `feat: UN SDG goals and targets`.

### Task 8: SDG team-draft links

**Files:**
- Create: `data/sdg/links.json`, `tests/matching/sdgLinksData.test.js`

**Interfaces:**
- `links.json` = `{schemaVersion: "sdg-links/v1", status: "team draft", links: [{id, kind: "masco_submajor" |
  "onet_element", code, name, target, reason: {en, ms, zh}}]}`; `id` = `g<code>-<target>` or `<kind>:<element_id>-<target>`
  (e.g. `g25-9.c`, `el:2.A.1.a-4.4`); `code` for elements is `el:<id>` or `kn:<id>`.
- Coverage: every 2-digit group present in `role_details.json` (48) and every element in `requirements.tsv` (68) has ≥ 1
  link. Group `name`: the sub-major group title from the eMASCO crawl (Task 2) where captured, else `null` (admin then
  shows the code and three role titles from `role_details.json`). No name is invented.

- [ ] **Step 1: Write the failing test** `sdgLinksData.test.js`: every group and element covered; every `target` exists
  in `targets.json`; every `reason` non-empty in en/ms/zh and ≤ 160 characters; ids unique; no key matching
  `FORBIDDEN_KEY_PATTERN`.
- [ ] **Step 2: Run** `npx vitest run tests/matching/sdgLinksData.test.js` — FAIL.
- [ ] **Step 3: Write the links** — one plain-words reason each, naming why the work or skill serves that target; BM and
  中文 marked owner review in `data/SOURCES.md`.
- [ ] **Step 4: Run** — PASS. **Step 5:** SOURCES row ("team draft, used only after owner approval"). Commit `feat: SDG team-draft links for MASCO groups and O*NET items`.

### Task 9: `shared/matching/chain.js`

**Files:**
- Create: `shared/matching/chain.js`, `tests/matching/chain.test.js`

**Interfaces:**
- `makeChain(bridgeFile, { hasRequirements: (onetCode) => boolean }) -> { resolve(emascoCode: string) }`
- `resolve` returns `{ isco: string|null, jobs: string[], path: Step[], missingStep: null | { id, from, reason } }`;
  `Step = { id, from: {system, codes}, to: {system, codes}, method, label: string|null, source: {name, url, sha256}|null }`.
  Order: MASCO unit (first 4 digits) → ISCO-08 (`masco2020_unit_to_isco08`) → SOC 2010 (invert `soc2010_to_isco08`) →
  SOC 2018 (invert `soc2018_to_soc2010`) → O\*NET (invert `onet_to_soc2018`), then keep jobs with requirements.
  `missingStep.id` is the bridge step id that is pending or has no link, or `no_onet_data`.

- [ ] **Step 1: Write the failing tests** with a fixture bridge: `full path 2512-01 → 15-1252.00`, `one ISCO code to
  several O*NET jobs (2521 → 15-1242.00, 15-1243.00)`, `pending BLS step → missingStep soc2010_to_isco08`, `MASCO code
  absent from ISCO → missingStep masco2020_unit_to_isco08`, `All Other only → no_onet_data` (Review Focus 3), `the MASCO
  step's label is "code match, not an official table"`.
- [ ] **Step 2: Run** `npx vitest run tests/matching/chain.test.js` — FAIL. **Step 3: Implement.** **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: matching code chain from eMASCO to O*NET`.

### Task 10: `shared/matching/fit.js`

**Files:**
- Create: `shared/matching/fit.js`, `tests/matching/fit.test.js`

**Interfaces:**
- `LEVEL_POINTS = {basic: 2, good: 4, expert: 6}`, `MIN_IMPORTANCE = 3`
- `requirementItems(rows) -> Item[]` from `requirements.tsv` rows of one job: importance ≥ 3, suppress ≠ Y,
  not_relevant ≠ Y; `Item = {key: "el:<id>"|"kn:<id>", elementId, kind, name, importance, needed}` (needed = level).
- `profileLevels(profile) -> Map<key, {points: number|null, notAssessed: boolean}>` from `profile.skills` with
  `canonicalId` `onet:el:<id>` / `onet:kn:<id>`; duplicates keep the highest level (Review Focus 2).
- `levelsMet(rows: {needed, you}[]) -> {met, needed, percent}` (percent `Math.round(met / needed * 100)`, `null` when
  needed is 0).
- `fitFor(items, levels) -> {met, needed, percent, provisional, rows: Row[], raise: Raise[]}`;
  `Row = {...Item, you, status: "met"|"below"|"missing"|"not_assessed", gap}`;
  `Raise = {key, name, action: "learn"|"raise", from: level word|null, to: level word, points, stillShort}` — top 3 by
  points, ties by `key`; `to` = lowest of basic/good/expert with points ≥ needed, `expert` with `stillShort: true` when
  needed > 6; `points = Math.round(gap / needed * 100)`.
- `bestFit(jobs: {code, title, items}[], levels) -> {best: {code, title, fit}|null, others: [...]}` — highest percent,
  ties by code.

- [ ] **Step 1: Write the failing tests**: `owner chart example` — `levelsMet([{needed:2,you:1.5},{needed:2,you:2},
  {needed:2,you:1.5},{needed:1.2,you:1.5},{needed:2.85,you:1.5},{needed:2,you:1.5}])` → `met` 9.2 (±1e-9),
  `needed` 12.05, `percent` 76; `importance below 3 and suppressed rows are left out`; `missing counts 0`; `above
  level capped`; `not assessed meets the level and sets provisional`; `duplicate ids keep the highest level`; `raise
  list order and points`; `needed above 6 → expert, stillShort`; `bestFit tie by code`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4:** PASS. **Step 5:** Commit `feat: Skill Match as levels met over levels needed`.

### Task 11: `shared/matching/outlook.js`

**Files:**
- Create: `shared/matching/outlook.js`, `tests/matching/outlook.test.js`

**Interfaces:**
- `SCENARIOS = ["moderate", "rapid"]`
- `aeiForJob(onetCode, tasksByJob: Map<code, taskId[]>, aeiByTask: Map<taskId, {usage, automation, augmentation}>)
  -> {tasks, observed, observedShare, automationPct, augmentationPct} | null` — shares weighted by `usage`; `null` when
  no task is observed.
- `aiPart(scenario, {aei, ilo}) -> {available: boolean, changesMuch: boolean|null, source: "aei"|"ilo", values}` —
  rapid: `ilo.gradient` in {G3, G4} → true, other gradients false, no ILO row → unavailable; moderate: `aei` null →
  unavailable, else `automationPct > 50`.
- `jobAdsPart(signals, emascoCode) -> {available, groupCode, direction, sufficient, signalId, evidenceLinks, path}` —
  signal `dosm:masco2020:<first digit>`; `sufficient` only when `evidenceSufficiency === "sufficient"`.
- `bandOf(jobAds, ai) -> 1|2|3|4` — 3 if sufficient and declining; else 2 if `ai.changesMuch === true`; else 1 if
  sufficient, rising or stable, and `ai.available`; else 4.
- `movedRoles(before: {code, band}[], after) -> {code, from, to}[]`.

- [ ] **Step 1: Write the failing tests**: each band in each scenario; `insufficient DOSM → never band 1 or 3`; `no AI
  data → band 4 unless declining`; `aeiForJob weights by usage`; `movedRoles lists only changes`; `no forbidden keys in
  any returned object`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: matching outlook parts and four bands per AI scenario`.

### Task 12: `shared/matching/sdg.js` and SDG decisions

**Files:**
- Create: `shared/matching/sdg.js`, `tests/matching/sdg.test.js`, `server/matching/adminRoutes.js`,
  `tests/matching/sdgAdmin.test.js`
- Modify: `server/radar/reviews.js` (`REVIEW_KINDS` gains `sdg_link`; `validReview` uses `MAPPING_DECISIONS` for it),
  `server/app.js` (mount the admin routes)

**Interfaces:**
- `linkHash(link) -> string` (SHA-256 of `{id, kind, code, target, reason}`) — in `server/matching/adminRoutes.js`
  (Node crypto); the browser never needs it.
- `approvedLinks(links, reviews) -> Link[]` — newest `sdg_link` review per `id` whose `appliesTo.observationHash`
  equals the link's hash; decision `approved` only (`revise`/`rejected` = not shown). Pure: takes precomputed hashes
  as `links[i].hash`.
- `roleLinks(approved, emascoCode)`, `itemLinks(approved, key)`, `goalsOfRole(approved, emascoCode) -> number[]`
- `pathContribution(approved, emascoCode, gapKeys) -> {goals: [{goal, count, links: [{target, reason, via:
  {kind: "role"|"item", code, name}}]}], total}` — goals ascending, no score.
- Routes (admin session required, CSRF on POST, like `/api/admin/radar/mappings`):
  `GET /api/admin/matching/sdg-links` → `{writable, links: [...with status, reviewedAt]}`;
  `POST /api/admin/matching/sdg-links` `{id, decision, note}` → 201 `{review, link}`; 404 unknown id; 503
  `not_configured` without a writable store.

- [ ] **Step 1: Write the failing tests**: `only approved links count`; `a changed reason needs a new decision`
  (hash mismatch → pending); `role inherits its 2-digit group links`; `path counts role links plus links of gap items`;
  admin route tests on a memory store (approve → GET shows approved; no session → 401; wrong role → 403).
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test`, all Radar review tests too).
- [ ] **Step 5:** Commit `feat: SDG links with owner decisions in the Radar review store`.

### Task 13: Matching data loader, service and routes

**Files:**
- Create: `server/matching/data.js`, `server/matching/service.js`, `server/matching/routes.js`,
  `tests/matching/routes.test.js`, `tests/helpers/matchingFixture.js`
- Modify: `server/app.js` (option `matching = createMatchingServiceFromEnv(...)`, mount `matchingRoutes`)

**Interfaces:**
- `loadMatchingData(dataDir) -> {roles, chain, jobs: Map<code, {title, items, software: string[]}>, tasksByJob,
  aeiByTask, ilo: Map<isco, row>, sdg: {targets, links}, sources: Source[]}`; a missing or malformed file throws
  `MatchingDataError` with `file` set; loaded once, retried after a failed load (same pattern as `loadFields` in
  `server/app.js`).
- `createMatchingService({ loadData, radar, references, demo, access, store, now })` with
  `list(profile, request) -> ListAnswer` and `role(profile, code, request) -> RoleAnswer`.
  Signals: `demo.diff(sessionId).signals` when `access.sessionOf(request).session?.role === "demo"` and `demo`
  exists, else `(await radar.answer()).view.signals.signals`; any failure → `[]` and `radarState: "unavailable"`.
- `ListAnswer = {sources, radar: {manifestId, state, judgeSession}, profile: {usable, provisional, unusedIds},
  roles: [{code, title, url, inField, inFieldVia: [...], skillMatch: {percent, met, needed, provisional, onetCode,
  onetTitle}|null, unavailable: {missingStep}|null, bands: {moderate, rapid}, sdgGoals}]}`.
- `RoleAnswer = {code, title, url, description, chain: {path, missingStep}, jobs: [{code, title, percent}], fit: {met,
  needed, percent, provisional, rows, raise}|null, outlook: {jobAds, ai: {moderate, rapid}}, software: [{name,
  inDemand, have}], sdg: {tags, pathPreview}}`.
- In your field: `references.fieldJobs(iscedCode)` for each `education.records[].field.code`, plus
  `employment.records[].occupation` and `occupationMappings[].chosen` (`source` `emasco` matches the role code, `onet`
  matches a role job).
- In-demand software: the Radar export's `references.onetSkills.inDemand` for the best job, names compared with the
  profile's `onet:tech:` ids (lower case).
- Routes: `POST /api/matching` `{profile}`, `POST /api/matching/role` `{profile, code}`, `jsonBody('64kb')`, errors via
  `sendError`; unknown role code → 404.

- [ ] **Step 1: Write the failing tests** (real app on port 0, fixture data dir from `matchingFixture.js`):
  `thin profile → usable false and no percent`; `profile is never logged` (spy on `console.*`, POST a profile with a
  unique marker string, assert no call contains it); Review Focus 1, 4 and 5; `judge session signals move a band`
  (memory store + demo service: apply a DOSM change, the role's band changes); `role detail has the chain path and the
  MASCO step label`; `no forbidden keys in either answer`.
- [ ] **Step 2: Run** `npx vitest run tests/matching/routes.test.js` — FAIL.
- [ ] **Step 3: Implement** data loader, service, routes; wire in `createApp`.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5:** Commit `feat: matching API (profile used, never stored or logged)`.

### Task 14: Match and SDG tabs in the browser

**Files:**
- Create: `public/js/matchApi.js`, `public/js/screens/match.js`, `public/js/screens/sdgTab.js`,
  `public/js/components/fitChart.js`, `tests/matching/matchScreen.test.js`
- Modify: `public/js/app.js` (screens `match` and `sdg` leave `NEXT`'s placeholder; state `match`), `public/styles.css`,
  `shared/strings/en.js`, `ms.js`, `zh.js` (keys prefixed `mt`), `tests/radar/strings.test.js` only if it scans files by
  list

**Interfaces:**
- `matchApi.list(profile, {base})`, `matchApi.role(profile, code, {base})` → `{ok, data}` or `{ok: false, code}`.
- `fitChart({rows, t, all}) -> string` — SVG, rows sorted by importance (ties by name), first 8 unless `all`, bars
  "You" and "Needed" on the 0–7 scale, legend with "basic = 2, good = 4, expert = 6".
- `matchView({t, state})`, `roleCard({t, role, detail, scenario, chosen})`, `sdgView({t, state})` — pure string
  renderers like `radarView`.
- State `state.match = {scenario, prevScenario, sdgFilter, data, details: {}, chosen, loading, error}`; `scenario` and
  `chosen` are saved with the guest profile; `data` and `details` are not.
- Layout, texts and states follow `docs/mockup-matching.html` (scenario switch with its two lines, SDG filter, source
  line, provisional note, "today: chain not ready" note, thin-profile card, four bands with empty-band text, banner of
  moved roles, Explore all roles, sources table, Skill Match above details at < 760 px).

- [ ] **Step 1: Write the failing tests** on a real server with fixture data: `card shows the one-sentence reason`,
  `chart orders by importance and shows 8 then all`, `switching scenario keeps every percent and lists moved roles`,
  `unavailable role shows the missing step`, `SDG filter hides roles without that goal`, `sdg tab shows counts and
  "potential, not measured"`, `every text key exists in en, ms and zh`, `every interpolated value is escaped` (a role
  title with `<b>` renders as text).
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: Career matching and SDG contribution tabs`.

### Task 15: SDG review card in the Radar admin

**Files:**
- Modify: `public/js/screens/radarAdmin.js` (a `sdgLinkCard` beside `mappingCard`), `public/js/radarAdminApi.js`
  (`sdgLinks()`, `decideSdgLink({id, decision, note})`), `public/js/app.js` (admin load includes the links; actions),
  strings (3 languages), `tests/radar/adminScreen.test.js`

**Interfaces:**
- Consumes Task 12's routes. The card lists links grouped by kind with status, target tag, reason (en, with ms/zh on
  open), Approve / Reject; "store not writable" note when `writable` is false.

- [ ] **Step 1–4:** tests `card lists pending links`, `approve calls the API with the CSRF token and refreshes`,
  `not writable disables the buttons` → FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: owner review of SDG links in admin`.

### Task 16: Docs, acceptance in the browser, handover

**Files:**
- Modify: `data/SOURCES.md` (check every new row), `docs/tools-declaration.md` (ILO data, Anthropic Economic Index, UN
  SDG API, BLS files), `README.md`, `HANDOVER.md`, `CLAUDE.md`, `docs/record/status.json`, `docs/build-record.html`
- Create: `docs/matching/acceptance.md`

- [ ] **Step 1:** `npm test` and `python -m unittest discover pipeline/tests` — all pass; note the counts.
- [ ] **Step 2:** Start the app on `127.0.0.2:3200` (`.claude/launch.json` entry, Browser pane). With a synthetic
  profile check, desktop and 360 px: Skill Match sentence and chart; "What would raise it"; scenario switch banner;
  bands; "today" state while the BLS files are absent; thin profile; choose a role → SDG tab; admin approve → tag
  appears; judge change test moves a band. Write each check and result into `docs/matching/acceptance.md`.
- [ ] **Step 3:** Update the docs listed above and the build record. Commit `docs: career matching acceptance, sources and handover`.
- [ ] **Step 4:** Report to the owner: what works, what waits on the BLS files and SDG approvals. Ask before any push
  or merge.
