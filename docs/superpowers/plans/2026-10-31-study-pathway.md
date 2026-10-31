# Study Pathway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `#pathway` screen that shows, for each role the user saved from `#match`, a study route (usual education
level, fields of study, Malaysian programmes and professional bodies) and the skills to build (gaps biggest first),
each with named team-picked courses and "More on <site>" search links, plus started / done progress.

**Architecture:** Pure rules in `shared/pathway/` (steps, route, picks). A server service in `server/pathway/` calls
the existing matching service's `role(profile, code, request)` for the fit rows, so its numbers equal matching's, and
adds the study route and picks; `POST /api/pathway` serves one role. Owner review of picks uses the Radar review store
(new kind `pathway_pick`), like the SDG links. The browser keeps saved targets and progress in the guest store.

**Tech Stack:** Node ≥ 22.12, Express 5, Vitest 5, plain ES modules in the browser, Python 3 for `pipeline/`.

**Spec:** `docs/superpowers/specs/2026-10-31-study-pathway-design.md` (decisions P1–P13). Diagram:
`docs/architecture-pathway.html`. Read both before any task.

## Global Constraints

- Work in `C:\Users\guiro\XH_Cat_Final-pathway` on branch `claude/study-pathway`. Never touch `main`.
- Test first (Vitest). Run `npm test` before every commit (803 passed at the start). Commit messages `feat:`, `fix:`
  or `docs:`, no attribution lines. Never push, merge or open a PR without the owner's OK.
- Record every task in `docs/record/status.json` (group "Step 12") and run `python docs/record/build_record.py`.
  Bash heredocs break on apostrophes: write helper scripts with the Write tool and run them with python.
- No language model. No method from the old project. No key in any answer may match `/score|weight|rank|opportunit/i`.
- The profile sent to `/api/pathway` is never stored or logged; logs carry codes only.
- Gap points = gap ÷ Σ needed (all rows of the job) × 100, rounded; the same formula as `fitFor().raise` in
  `shared/matching/fit.js`. Levels: basic 2, good 4, expert 6.
- Only name, link and date checked are stored for any pick. No descriptions, prices or durations.
- Every link is `https`. A course link's host must be one of its site's `hosts`; e-LATiH course links start
  `/courses-details/`. No invented link: every site, pick and search link is opened in a browser before it is added.
- Every list and number on screen shows its source and date. On `#pathway` a pick not yet reviewed shows no review
  label (P15: no "team draft" word in the first build); an approved pick shows "approved by owner on <date>";
  rejected picks are hidden. `#admin` still shows "not yet reviewed" for undecided picks.
- New data: entry in `data/SOURCES.md` (where from, date, licence) and a SHA-256 in a manifest.
- EN / BM / 中文 strings for every new text; BM and 中文 marked "translation: owner review" in `data/SOURCES.md`'s
  strings note as matching did. `tests/i18n.test.js` requires every key in all three.
- Browser checks on `http://127.0.0.2:3200` (an address nobody else uses), desktop and 360 px.
- Use plain words with the owner.

## Review Focus

1. **Thin profile** (no skill with an O\*NET id, so matching's `fit` is `null`): the study route still shows; Part 2
   says why (`reason: 'no_known_skill'`, shown as "add skills with a level to your profile" with a link to it), never
   an empty list or a crash. Tests in Tasks 6 and 8.
2. **Saved target no longer in the data** (role code removed in a data refresh): `/api/pathway` answers 404 and the tab
   shows "not found" with its "remove" button still working. Test in Tasks 6 and 8.
3. **Search words with special characters** ("C++", "Customer and Personal Service", "Food Production" with spaces,
   "Ç"): each search link is the template with `encodeURIComponent(word)` in place of `<q>`, nothing else changed.
   Test in Task 5.
4. **Review store unreachable**: picks still show, all with `approvedAt: null` (no label on screen, P15); the log line carries the error code only.
   Test in Task 6.
5. **A pick for an item or field not in the data** (typo in `for`): the server refuses to start and names the pick id,
   instead of silently never showing it. Test in Task 5 (`checkPicks`) and Task 6 (start-up).

---

### Task 1: O\*NET usual education level data

**Files:**
- Modify: `pipeline/fetch_onet.py` (add `education.tsv` to `FILES`)
- Test: `pipeline/tests/test_fetch_onet.py`, fixture rows in `pipeline/tests/fixtures/` (same style as the existing ones)
- Create (by running the script): `data/onet/education.tsv`; Modify: `data/onet/manifest.json`, `data/SOURCES.md`

**Interfaces:**
- Produces: `data/onet/education.tsv` with header `code	category	label	percent	suppress`, one row per job and
  category of element `2.D.1` "Required Level of Education", scale `RL`. `label` comes from
  *Education Categories.txt* (Element ID `2.D.1`, Scale ID `RL`, Category → Category
  Description). `suppress` is O\*NET's Recommend Suppress (`Y`/`N`).

- [ ] **Step 1: Write the failing Python test** `test_education_rows` in `pipeline/tests/test_fetch_onet.py`: a fixture
  zip with two jobs, RL rows for categories 1, 6, 12 (one row Recommend Suppress `Y`), one non-RL row (scale `PT`) and a
  categories file → `education.tsv` has exactly the RL rows with labels joined, `percent` as in the source, `suppress`
  kept; the non-RL row is absent; the manifest lists `education.tsv` with its SHA-256.
- [ ] **Step 2: Run** `python -m unittest pipeline.tests.test_fetch_onet -v` → the new test FAILS (no `education.tsv`).
- [ ] **Step 3: Implement** in `pipeline/fetch_onet.py`: an `education.tsv` entry (`optional: True`) that keeps
  `Element ID == "2.D.1"` and `Scale ID == "RL"` from *Education.txt* (columns `CODE`,
  `Category`, `Data Value`, `Recommend Suppress`) and joins the label from the categories file. If `FILES` cannot
  express the join, add a small function beside `REQUIREMENTS` in the same style.
- [ ] **Step 4: Run** `python -m unittest discover pipeline/tests` → 49 OK (48 + 1).
- [ ] **Step 5: Run the script** `python pipeline/fetch_onet.py 31.0` (free download from onetcenter.org). Check the zip
  SHA-256 printed equals the one already in `data/SOURCES.md` (`6883548a…b23a9`) and that the other `data/onet/*.tsv`
  files are byte-identical (`git diff --stat data/onet` shows only `education.tsv` and `manifest.json`).
- [ ] **Step 6: Add the `data/SOURCES.md` row** for `onet/education.tsv` (O\*NET 31.0, *Education.txt*, same zip and date, CC BY 4.0, "US survey data, shown as such").
- [ ] **Step 7: Run** `npm test` → 803 passed. **Commit** `feat: O*NET usual education level per job (education.tsv)`.

### Task 2: Course sites and the empty picks file

**Files:**
- Create: `data/pathway/sites.json`, `data/pathway/picks.json`, `data/pathway/manifest.json`
- Modify: `data/SOURCES.md`

**Interfaces:**
- Produces `sites.json`: `{schemaVersion: 'pathway-sites/v1', sites: [{id, name, group: 'malaysian'|'global'|'tech'|'professional', home, terms, search: string|null, searchCheckedAt: 'YYYY-MM-DD'|null, hosts: [string]}]}`,
  in this order: `elatih, coursera, edx, khan, mslearn, googleskills, freecodecamp, awsskillbuilder, openlearning, mdec`.
  `search` values exactly as spec §3's table (with `<q>`), `searchCheckedAt: '2026-10-31'` for the six searchable
  sites, `null` search for the other four. Professional bodies are not sites; they appear only as programme picks.
- Produces `picks.json`: `{schemaVersion: 'pathway-picks/v1', status: 'team draft', courses: [], programmes: [], searchWords: []}`.
- Produces `manifest.json`: `{files: {'sites.json': <sha256>, 'picks.json': <sha256>}, builtAt}`.

- [ ] **Step 1: Open each site's home and terms page** in the browser pane; record the terms URL and the course-page
  hosts (e.g. `www.coursera.org`, `www.edx.org`, `www.khanacademy.org`, `learn.microsoft.com`, `www.skills.google`,
  `elatih.hrdcorp.gov.my`, `www.freecodecamp.org`, `skillbuilder.aws`/`explore.skillbuilder.aws`,
  `www.openlearning.com`, `mdec.my`). Re-open each of the six search links with "python" and confirm results.
- [ ] **Step 2: Write the three files** and their SHA-256 (write a small python helper with the Write tool).
- [ ] **Step 3: Add `data/SOURCES.md` rows**: `pathway/sites.json` (team list, each site's terms URL, "the app only
  links; nothing copied"), `pathway/picks.json` (team draft, P9, name + link + date only; MQR "all rights reserved",
  e-LATiH Terms of Use clause 4.6 recorded).
- [ ] **Step 4: Run** `npm test` → 803 passed. **Commit** `feat: course sites list and empty team picks file`.

### Task 3: Skills to build (`shared/pathway/steps.js`)

**Files:**
- Create: `shared/pathway/steps.js`; Test: `tests/pathway/steps.test.js`

**Interfaces:**
- Consumes: rows as in `role()`'s `fit.rows` (`{key, elementId, kind, name, importance, needed, you, status, gap}`;
  status `met | below | missing | not_assessed`).
- Produces: `pathwaySteps(rows) -> {gaps: Step[], notAssessed: Step[], met: Step[], provisional: boolean}` with
  `Step = {key, name, kind, importance, needed, you, status, from: 'basic'|'good'|'expert'|null, to: 'basic'|'good'|'expert', points: number|null, stillShort: boolean}`.
  `points` only on gaps (null elsewhere); `from` null for `missing` and for a `you` that is not 2/4/6; `to` = lowest
  word whose points ≥ needed, else `'expert'`; `stillShort` = needed > 6.

- [ ] **Step 1: Write the failing tests** in `tests/pathway/steps.test.js`:
  - `owner chart example`: needs `[2, 2, 2, 1.2, 2.85, 2]`, you `[1.5, 2, 1.5, 1.5, 1.5, 1.5]`, all status from the
    you/needed comparison → `gaps.map(g => [g.key, g.points])` equals `[['el:i4', 11], ['el:i0', 4], ['el:i2', 4], ['el:i5', 4]]`;
    `met` keys `['el:i1', 'el:i3']` (importance order, ties by key); `provisional` false. The first three gaps equal
    `fitFor(items, levels).raise` keys and points for the same input (import `fitFor`).
  - `missing gives from null and learn`: a `missing` row needed 4 → `from: null, to: 'good'`.
  - `not assessed go to their own group`: two `not_assessed` rows, importance 4.5 and 3.2 → `notAssessed` in that
    order, `provisional: true`, none in `gaps`.
  - `needed above 6`: needed 6.5, you 6 → `to: 'expert', stillShort: true`.
  - `no rows`: `pathwaySteps([])` → all groups empty, `provisional: false`.
  - `no forbidden keys`: `JSON.stringify(result)` has no key matching `/score|weight|rank|opportunit/i`.
- [ ] **Step 2: Run** `npx vitest run tests/pathway/steps.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** `pathwaySteps(rows)` in `shared/pathway/steps.js` (pure, no imports from server code).
  Sort gaps by points desc then key; notAssessed and met by importance desc then key.
- [ ] **Step 4: Run** the test file → PASS. **Step 5:** `npm test` → all pass. **Commit** `feat: pathway steps from matching rows (gaps biggest first)`.

### Task 4: Study route (`shared/pathway/route.js`)

**Files:**
- Create: `shared/pathway/route.js`; Test: `tests/pathway/route.test.js`

**Interfaces:**
- Produces:
  - `indexRoute({isced: IscedCipRow[], cip: CipOnetRow[], fields: FieldRow[]}) -> RouteIndex` (rows as in
    `data/isced/isced_cip.tsv`, `cip_onet.tsv`, `fields.tsv` headers).
  - `fieldsFor(index, onetCode, yourCodes: string[]) -> Field[]`, `Field = {code, title, partial: boolean, yours: boolean, cips: [{code, title, partial: boolean}]}`,
    sorted by code. `partial` on a field = every CIP link reaching it is partial (`partial === 'Y'`).
    `yours` = the code equals one of `yourCodes` (the profile's `education.records[].field.code`).
  - `fieldsReachingOnet(index) -> string[]`: every field code with at least one CIP that has an O\*NET job (used by
    the coverage check; expected 118 on the real data).
  - `educationFor(rows: EducationRow[], onetCode) -> {top: [{category, label, percent}], all: [{category, label, percent}], suppressedLeftOut: number} | null`.
    Suppressed rows are left out and counted; `top` = all rows with the highest percent (ties kept); `all` by category;
    null when no unsuppressed row.

- [ ] **Step 1: Write the failing tests** with a small inline fixture: job `15-1242.00` reached by CIP `11.0802`
  (→ ISCED `0613`, not partial, and `0611`, partial) and CIP `11.0701` (→ `0613`):
  - `fieldsFor` → codes `['0611', '0613']`; `0611.partial === true`; `0613.partial === false`; `0613.cips` lists both
    CIPs; `yours` true only for the code passed in.
  - unknown job → `[]`.
  - `fieldsReachingOnet` on the fixture → `['0611', '0613']`.
  - `educationFor`: categories 6 (40), 7 (40), 3 (20) → `top` has 6 and 7; a suppressed row is left out and counted;
    only suppressed rows → `null`; unknown job → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/pathway/route.test.js` → FAIL.
- [ ] **Step 3: Implement** the four functions in `shared/pathway/route.js` (pure).
- [ ] **Step 4: Run** → PASS; `npm test` → all pass. **Commit** `feat: pathway study route (fields of study and education level)`.

### Task 5: Picks, review statuses and search links (`shared/pathway/picks.js`)

**Files:**
- Create: `shared/pathway/picks.js`; Test: `tests/pathway/picks.test.js`

**Interfaces:**
- Produces:
  - `PICK_KIND = 'pathway_pick'`, `PICKS_SOURCE = 'pathway-picks'`.
  - `checkSites(file) -> Site[]` (throws `Error` whose message names `sites.json` and the site id).
  - `checkPicks(file, sites, {itemKeys: Set<string>, fieldCodes: Set<string>}) -> Pick[]` — one flat list, each
    `{id, type: 'course'|'programme'|'searchWord', for: 'el:…'|'kn:…'|'field:<code>', …own fields}`. Throws naming
    `picks.json` and the pick id for: non-`https` link; unknown `site`; link host not in the site's `hosts`; e-LATiH
    link not under `/courses-details/`; `for` not in `itemKeys` and not `field:` + a code in `fieldCodes`; programme
    `kind` not `accredited`/`professional`; duplicate id; missing name, link (not for searchWord) or `checkedAt`.
  - `pickStatuses(picks, reviews) -> (Pick & {status: 'approved'|'rejected'|'pending', reviewedAt, reviewedBy, reviewId})[]`
    — same rules as `linkStatuses` in `shared/matching/sdg.js`, for review kind `pathway_pick`, matched on
    `target === pick.id` and `appliesTo.observationHash === pick.hash` (hash is set by the server).
  - `shownPicks(picks, reviews) -> (Pick & {approvedAt: string|null})[]` — not rejected; `approvedAt` = owner's date.
  - `searchWordFor(key, picksShown, defaultName) -> string`.
  - `searchLinks(word, sites) -> [{site, name, url, checkedAt}]` — every site with a `search`, in file order,
    `url = search.replace('<q>', encodeURIComponent(word))`.
  - `coverage(picks, itemKeys, fieldCodes, reported: Set<string>) -> {missing: string[]}` — every item key with no
    course pick, and every `field:<code>` with no accredited programme pick, that is not in `reported`.

- [ ] **Step 1: Write the failing tests**: one valid sites + picks fixture passes; one test per throw case listed above
  (assert the message contains the pick id); `pickStatuses` approved / rejected / revise→pending / decision on old hash
  ignored; `shownPicks` hides rejected and dates approved; `searchLinks('C++', sites)` gives
  `https://www.coursera.org/search?query=C%2B%2B` and e-LATiH's long link ending `&course=C%2B%2B`, in file order,
  skipping sites with `search: null`; `searchLinks('Customer and Personal Service', …)` encodes spaces as `%20`;
  `coverage` lists exactly the uncovered keys and drops reported ones; no forbidden keys in any output.
- [ ] **Step 2: Run** `npx vitest run tests/pathway/picks.test.js` → FAIL.
- [ ] **Step 3: Implement** in `shared/pathway/picks.js` (pure; no Node crypto — hashes come from the server).
- [ ] **Step 4: Run** → PASS; `npm test` → all pass. **Commit** `feat: pathway picks checks, review statuses and search links`.

### Task 6: Pathway service and `POST /api/pathway`

**Files:**
- Create: `server/pathway/data.js`, `server/pathway/service.js`, `server/pathway/routes.js`,
  `tests/helpers/pathwayFixture.js`; Test: `tests/pathway/routes.test.js`
- Modify: `server/radar/reviews.js` (`REVIEW_KINDS` gets `'pathway_pick'`; header comment line), `server/app.js`
  (mount routes, option `pathway`)

**Interfaces:**
- Consumes: `createMatchingServiceFromEnv(...).role(profile, code, request)` (unchanged); Tasks 3–5.
- Produces:
  - `loadPathwayData(dataDir) -> {education, qualifications, routeIndex, sites, picks, itemKeys, fieldCodes, sources}`;
    `qualifications` = Map eMASCO code → trimmed `qualification` string or null, from `emasco/role_details.json`
    checked against `emasco/manifest.json` (P14); checks `onet/education.tsv` against `onet/manifest.json`, the isced files against `isced/manifest.json`, `pathway/*.json`
    against `pathway/manifest.json`; throws `PathwayDataError(file, reason)` (same shape as `MatchingDataError`).
    `itemKeys` = every `el:`/`kn:` key in `onet/requirements.tsv`; `fieldCodes` = `fieldsReachingOnet`.
  - `pickHash(pick)` = SHA-256 of `JSON.stringify({id, type, for, site, institution, body, name, link, word})`
    (missing fields as null).
  - `createPathwayService({loadData, matching, store, now, log}) -> {pathway(profile, code, request) -> Answer | null, picksDecided()}`
    (picks decisions cached 60 s like `SDG_TTL_MS`; store failure → no reviews, log `[pathway] reviews unavailable: <code>`).
  - `Answer = {code, title, qualification: {text: string|null, url}, onet: {code, title}|null, chain: {path, missingStep}, provisional, reason: string|null,
    route: {education, fields: [Field & {programmes, professional, courses, search, mqr: {url, nec}}]}|null,
    steps: {gaps, notAssessed, met} (each Step & {courses, search})|null, sources: [{id, name, url, date, licence}]}`.
    `route` and `steps` null when the chain is broken (`reason: 'chain_broken'`); `steps` null and
    `reason: 'no_known_skill'` when the chain is whole but matching's `fit` is null (thin profile: no profile skill with
    an O\*NET skill or knowledge id); otherwise `reason: null`. `mqr.url = 'https://www2.mqa.gov.my/mqr/english/ecarianakr.cfm'`, `mqr.nec` = the field code.
  - `pathwayRoutes({pathway, log}) -> Router`: `POST /api/pathway {profile, code, lang}`; same body size, validation
    and error shape as `server/matching/routes.js`; unknown code → 404 `not_found`.
  - `createApp({..., pathway})`: default `createPathwayServiceFromEnv({dataDir, matching: matchingService, store: radar?.store})`.

- [ ] **Step 1: Write `tests/helpers/pathwayFixture.js`**: `makePathwayFixture()` = `makeMatchingFixture()` plus
  `onet/education.tsv` (job `15-1243.00`: categories 6 = 55, 7 = 45), the three isced files (CIP `11.0802` →
  `15-1243.00`; ISCED `0613` and partial `0611`), `pathway/sites.json` (elatih + coursera), `pathway/picks.json`
  (one course for `kn:2.C.3.a`, one accredited programme and one professional pick for `field:0613`), and rewritten
  `onet/manifest.json`, `isced/manifest.json`, `pathway/manifest.json` with correct hashes.
- [ ] **Step 2: Write the failing route tests** (real app on port 0, as `tests/matching/routes.test.js`):
  - full role `2521-03` with a profile that has `onet:kn:2.C.3.a` at `basic` → 200; `steps.gaps[0].key === 'kn:2.C.3.a'`;
    its `points` equal `/api/matching/role`'s `fit.raise` points for that key; the gap has 1 course and 2 search links;
    `route.education.top[0].category === 6`; `qualification.text` equals the fixture role's `qualification` (`'Degree'`); `route.fields` codes `['0611', '0613']`, `0611.partial`; `0613` has the
    programme, the professional pick and `mqr.nec === '0613'`.
  - the user's `education.records[0].field.code = '0613'` → that field `yours: true`.
  - thin profile (no O\*NET ids) → 200, `route` present, `steps === null`, `reason === 'no_known_skill'`.
  - broken chain role `2512-01` → 200, `chain.missingStep` set, `route === null`, `steps === null`, but
    `qualification` still present (P14).
  - unknown code → 404 `not_found`; non-string code or code over 32 chars → 400.
  - profile never logged: spy on `console.*` and the `log` option; no profile skill name appears.
  - forbidden keys: `keysDeep(answer)` has none matching `/score|weight|rank|opportunit/i`.
  - review store throws → picks shown, all `approvedAt: null`; log line has the code only.
  - a rejected pick review (recordReview with kind `pathway_pick`) → that pick absent; approved → `approvedAt` set.
  - a picks file with an unknown `for` → `loadPathwayData` rejects with `PathwayDataError` naming the pick id.
- [ ] **Step 3: Run** `npx vitest run tests/pathway/routes.test.js` → FAIL.
- [ ] **Step 4: Implement** `data.js`, `service.js`, `routes.js`; add `'pathway_pick'` to `REVIEW_KINDS`; mount in
  `server/app.js` after the matching routes.
- [ ] **Step 5: Run** → PASS; `npm test` → all pass (existing radar review tests unchanged).
  **Commit** `feat: pathway API reusing matching's role answer`.

### Task 7: Owner review of picks in `#admin`

**Files:**
- Create: `server/pathway/adminRoutes.js`; Test: `tests/pathway/picksAdmin.test.js`
- Modify: `server/app.js`, `public/js/radarAdminApi.js` (`pathwayPicks()`, `decidePathwayPick(id, decision, note)`),
  `public/js/screens/radarAdmin.js` (a "Pathway picks" section beside the SDG links), `public/js/app.js` (load and
  decide, as the SDG section), `shared/strings/{en,ms,zh}.js`

**Interfaces:**
- Produces `pathwayAdminRoutes({radar, access, now, dataDir, onDecision, log})`, mirroring
  `server/matching/adminRoutes.js`: `GET /api/admin/pathway/picks` → `{writable, picks: [...with status, reviewedAt, reviewedBy, reviewId, hash]}`;
  `POST /api/admin/pathway/picks {id, decision: approved|rejected|revise, note}` → 201 `{review, pick}`; same errors,
  admin session, CSRF and Origin rules; `onDecision` = `pathwayService.picksDecided()`.

- [ ] **Step 1: Write the failing tests** copying the cases of `tests/matching/sdgAdmin.test.js` for picks (no session
  → 401/403 as there; list; approve; reject; revise; unknown id 404; bad decision 400; store not writable 503; a
  decision on an old hash no longer applies).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the routes and mount them in `server/app.js` beside
  `matchingAdminRoutes`.
- [ ] **Step 4: Add the admin section**: list each pick with its type, `for` (item name or field title), site or
  institution, name, link (opens in a new tab), date checked, status, and approve / reject / revise with a note, the
  same controls and messages as the SDG section. Strings in en, ms, zh.
- [ ] **Step 5: Run** → PASS; `npm test` → all pass. **Commit** `feat: owner review of pathway picks in admin`.

### Task 8: `#pathway` screen, saved targets and progress

**Files:**
- Create: `public/js/pathwayApi.js`, `public/js/screens/pathway.js`; Test: `tests/pathway/pathwayScreen.test.js`
- Modify: `public/js/app.js` (`NEXT`: `'roadmap'` → `'pathway'`; `#roadmap` → `#pathway`; state, save, actions),
  `public/js/screens/match.js:313` (button), `shared/strings/{en,ms,zh}.js` (`roadmap` label → "Study pathway" key
  `pathway`; `mtStudyPlan` → "Plan my study pathway"; all new texts), `public/css` file that holds `.mt-*` styles (new
  `.pw-*` styles, 360 px)

**Interfaces:**
- Produces:
  - `pathwayApi.get(profile, code, {base, lang}) -> {ok, data} | {ok:false, code, retryable}` (POST `/api/pathway`).
  - `pathwayScreen({t, state, lang}) -> string` (HTML), reading `state.pathway = {targets: [{code, title, addedAt}], active: code|null, progress: {[key]: {state: 'started'|'done', at}}, answers: {}, loading, error}`.
  - Saved in the guest store: `pathway.targets`, `pathway.active`, `pathway.progress` only (answers fetched again), as
    `matchToSave` does for matching.
  - Actions (data-act): `pwPlan` (from a `#match` card: add target if absent, set active, go to `#pathway`),
    `pwTab`, `pwRemove` (removes the target, keeps progress), `pwStarted`, `pwDone`, `pwClear`.

- [ ] **Step 1: Write the failing screen tests** (render the function with a fixed answer, as
  `tests/matching/matchScreen.test.js` does): one tab per target with remove; Part 1 shows eMASCO's qualification labelled "eMASCO, Malaysia" first, then "In the US" with the education top label
  and percent, or "O*NET has no education data for this job" when `education` is null; a broken chain still shows the
  qualification; each field shows "partial link" when partial, "your field" when yours, programmes and
  professional picks with review labels, "no team pick yet" when none, "More on <site>" links, and the MQR link with
  "choose NEC field 0613" and "code match, not an official table"; Part 2 shows gaps in answer order with
  "your level → level needed" words and points, a "Level not assessed yet" group with a link to the profile skill
  section and a provisional banner, a folded "Already at the level" group; started / done buttons labelled
  "self-reported" reflect `progress` for the same key across two targets; `steps === null` with `reason: 'no_known_skill'` shows the reason text and a link to the profile skills;
  a 404 answer shows "not found" and remove; every list has a source line; no target → a line pointing to `#match`;
  all links `target="_blank" rel="noopener"`; output passes the HTML escaping used in `match.js`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `pathwayApi.js`, `screens/pathway.js`, the app.js wiring, the
  match.js button (enabled, `data-act="pwPlan"`), strings in three languages and styles.
- [ ] **Step 4: Run** → PASS; `npm test` → all pass (update any existing test that names the `roadmap` tab to
  `pathway`). **Commit** `feat: study pathway screen with saved targets and progress`.

### Task 9: Team fill of all skills and fields

**Files:**
- Modify: `data/pathway/picks.json`, `data/pathway/manifest.json`
- Create: `docs/pathway/fill-report.md`; Test: `tests/pathway/picksData.test.js`

**Interfaces:**
- Consumes: `checkPicks`, `coverage` (Task 5), `loadPathwayData` (Task 6).
- `fill-report.md` has one table row per uncovered key: `key | name | sites searched | date | note`; the test reads the
  first column as `reported`.

- [ ] **Step 1: Write the failing data test** `tests/pathway/picksData.test.js`: the real `data/pathway/*.json` load
  through `loadPathwayData('data')` without error; `coverage(...)` with the report's keys gives `missing: []`; every
  pick's `checkedAt` is a date not after today; `fieldsReachingOnet` on the real data has 118 codes.
- [ ] **Step 2: Run** → FAIL (no picks yet).
- [ ] **Step 3: Fill courses** for all 68 O\*NET skill and knowledge items: for each, search e-LATiH first, then the
  other sites, open the course page in the browser pane, and add `{id, type:'course', for, site, name, link,
  checkedAt}`; add a `searchWord` pick only where the O\*NET name finds little. An item with nothing real found goes
  into `fill-report.md`.
- [ ] **Step 4: Fill programmes** for every field in `fieldsReachingOnet`: at least one accredited Malaysian programme
  (MQR search by NEC field, then the institution's own programme page; record name, institution, MQR reference
  number, link) and, where the field has one, its Malaysian professional body. Nothing found → `fill-report.md`.
  Commit in batches (e.g. per ISCED broad field) so progress is never lost; run `npm test` before each.
- [ ] **Step 5: Update the manifest hashes**, run the data test → PASS, `npm test` → all pass.
  **Commit** `feat: team picks for all skills and fields of study (team draft)`.

### Task 10: Browser check, docs and record

**Files:**
- Create: `docs/pathway/acceptance.md`; Modify: `HANDOVER.md`, `CLAUDE.md` (this branch's detailed versions),
  `docs/record/status.json`, `docs/build-record.html`

- [ ] **Step 1: Start the app** on `http://127.0.0.2:3200` (a `.claude/launch.json` entry, `preview_start`).
- [ ] **Step 2: Check, desktop and 360 px**, and write each result in `docs/pathway/acceptance.md`: plan a pathway from
  a `#match` card; add a second target and switch tabs; remove one (progress stays); open one named course and one
  "More on Coursera" link (correct page opens); mark started then done; a not-assessed skill shows in its group with
  the provisional banner; a thin profile shows the study route and the reason; a broken-chain role shows the missing
  step; `#roadmap` opens `#pathway`; `#admin` approve and reject a pick and see the label change / the pick disappear;
  BM and 中文 switch. Screenshots for the owner.
- [ ] **Step 3: Write this branch's detailed `HANDOVER.md` and `CLAUDE.md`** (what was built, decisions P1–P13, data
  files, commands, open points for the owner: review picks in `#admin`, BM / 中文 wording, licence permission).
- [ ] **Step 4: Update the build record**, `npm test` → all pass, `python -m unittest discover pipeline/tests` → 49 OK.
  **Commit** `docs: Study Pathway browser check, handover and build record`.
