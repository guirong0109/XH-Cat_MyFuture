# Organisation View (HR and career centres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An HR / L&D manager or a career centre signs in, sets up one organisation, adds people by synthetic roster or join link, and sees a skill-gap heatmap, a team plan, band counts under two AI scenarios and an SDG link count, all worked out from matching's own numbers.

**Architecture:** New D1 tables hold organisations, groups, people and their skills (O\*NET item key + level only). On every `GET /api/org/team` the server turns each person's skills into profile skills, asks the existing matching service (`role`) and study pathway service (`pathway`) per person and role, and a pure module `shared/org/team.js` adds the answers up. Nothing computed is stored. Screens live under `#org` in the existing vanilla-JS app.

**Tech Stack:** Node ≥ 22.12, Express, vanilla ES modules in `public/`, Cloudflare D1 over REST (`server/store/d1.js`), Vitest, `node:sqlite` fake D1 in tests. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-31-hr-org-view-design.md` (approved 31 Oct 2026). Diagram: `docs/architecture-org.html` (approved 31 Oct 2026; binds the build). Mockup: `docs/mockup-org.html`.

## Global Constraints

- Start only after `claude/study-pathway` is merged into `main` (Task 0). Do not touch `main`'s files; the owner decides on merge.
- Test first (Vitest). `npm test` before every commit. Commit messages `feat:`, `fix:` or `docs:`, no attribution lines.
- Record every task in `docs/record/status.json` (group "Step 13", tasks O6a…) and run `python docs/record/build_record.py`.
- No language model. No scoring method from the old project or from the prototype (no 0.60/0.25/0.15 weights, no "× 1.3", no invented scenario multipliers, no hours).
- No answer key contains `score`, `weight`, `rank` or `opportunit` (tested).
- Skill Match and gaps only from matching's service; trends and AI scenarios change only band counts and "moved".
- eMASCO → O\*NET only through `data/radar/occupation-bridge.json` (via matching). Broken chain → "not available" with the missing step; the person is left out of that role's sums and counted.
- Levels: `basic`, `good`, `expert`, `not_assessed`. Not listed = gap; `not_assessed` meets the level and marks provisional.
- HR sees only shared skills (O\*NET item key and level), group, role and display name. No skill, name or token in any log. Team results never stored.
- Join token: 32 random bytes (`randomBytes(32).toString('base64url')`), stored only as SHA-256 hex, single use, valid 7 days. Join and share: 10 attempts per 15 minutes per address.
- Errors: one shape `{error:{code, message, retryable}}` via `sendError`. No D1 → 503 `accounts_unavailable` (existing `makeRequireUser`). No session → 401. Another organisation's id → 404.
- Roster: UTF-8 CSV, header `name,group,current_role_code,skill,level`, at most 1 MB. Screen text "Use synthetic (made-up) people only".
- Every list shows its source and date. Strings in EN / BM / 中文; BM and 中文 entries carry the same "translation: owner review" marker the matching strings use. Works at 360 px.
- Screens say "This helps plan training. It does not make hiring decisions."
- Browser checks at `127.0.0.2:3200`.

## Review Focus

1. **A person with no recognised O\*NET skill** (roster row with skills that all failed, or an employee whose profile has only software): matching returns `fit: null`; they must appear in People as "no known skill" and be counted as left out, never crash the heatmap. Test in Task 3 and Task 5.
2. **The same skill twice for one person in a roster** (two rows, different levels): keep the highest level, as `profileLevels` does, and say so in the preview. Test in Task 2.
3. **Excel-style CSV**: a UTF-8 BOM, CRLF line ends, quoted fields with commas and doubled quotes must parse; a file in another encoding is rejected with a reason. Test in Task 2.
4. **A join link opened by the organisation's own owner, or by someone already sharing with this organisation**: owner → 409 `own_organisation`; an existing share is updated, never duplicated (one share per user per organisation). Test in Task 7.
5. **A group's target role changed after plan steps were set**: steps are keyed by role code, so the old steps stay stored but are not shown for the new role, and the new plan starts at "planned". Test in Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `server/store/migrations.sql` (modify) | Six new tables |
| `server/org/csv.js` | `parseCsv(text)`: RFC 4180 rows, BOM and CRLF |
| `server/org/roster.js` | `checkRoster(...)`: row checks, preview answer |
| `shared/org/team.js` | Pure sums: heatmap, plan steps, band counts, moved, team SDG |
| `server/org/store.js` | All D1 reads and writes for organisations |
| `server/org/service.js` | Per-person calls to matching and pathway, then `team.js` |
| `server/org/routes.js` | Owner routes (organisation, groups, people, roster, team, plan steps) |
| `server/org/shareRoutes.js` | Invites, join, share, stop sharing |
| `server/app.js` (modify) | Wire the services and routes |
| `data/org/*.csv`, `data/org/manifest.json`, `data/SOURCES.md` (modify) | Synthetic sample rosters and template |
| `public/js/orgApi.js` | Fetch helpers for every org route |
| `public/js/screens/org.js` (replace), `orgParts.js` | Owner screens (setup, people, heatmap, plan, outlook & SDG) |
| `public/js/screens/orgShare.js` | Employee join and share screen |
| `public/js/orgActions.js` | Click / submit / change handlers for the org screens |
| `public/js/app.js` (modify) | Category C/D → sign in → `#org`; dispatch to `orgActions` |
| `shared/strings/en.js`, `ms.js`, `zh.js` (modify) | All new strings |
| `tests/org/*.test.js` | Tests per task |
| `docs/org/acceptance.md` | Browser check |

---

### Task 0: Bring the branch up to date

**Files:** none new.

- [ ] **Step 1:** Confirm `claude/study-pathway` is merged: `git -C C:/Users/guiro/XH_Cat_Final-main log --oneline -1 --grep "study-pathway"` shows a merge commit. If not, stop and tell the owner.
- [ ] **Step 2:** In `C:\Users\guiro\XH_Cat_Final-hr`: `git merge main` (resolve conflicts only in this branch's files; `docs/record/status.json` keeps both sides' entries).
- [ ] **Step 3:** `npm install && npm test` → all pass (note the count; it is the new baseline). `ls server/pathway shared/pathway` lists `service.js` and `picks.js`.
- [ ] **Step 4:** Record "O6a branch up to date with main" in the build record; commit `docs: hr-branch up to date with main after study pathway merge`.

### Task 1: D1 tables

**Files:**
- Modify: `server/store/migrations.sql`
- Test: `tests/org/migrations.test.js`

**Interfaces:**
- Produces: tables `orgs`, `org_groups`, `org_people`, `org_skills`, `org_invites`, `org_plan_steps` exactly as below.

```sql
CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('hr','centre')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_groups (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, target_code TEXT, UNIQUE (org_id, name));
CREATE TABLE IF NOT EXISTS org_people (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES org_groups(id), display_name TEXT NOT NULL, current_code TEXT,
  source TEXT NOT NULL CHECK (source IN ('roster','shared')), user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL, UNIQUE (org_id, user_id));
CREATE TABLE IF NOT EXISTS org_skills (person_id TEXT NOT NULL REFERENCES org_people(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('basic','good','expert','not_assessed')), PRIMARY KEY (person_id, item_key));
CREATE TABLE IF NOT EXISTS org_invites (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE, current_code TEXT, token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS org_plan_steps (org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE, role_code TEXT NOT NULL, item_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','in_progress','done')), updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, role_code, item_key));
```

- [ ] **Step 1: Write the failing test** `tests/org/migrations.test.js`: with `createFakeD1()` + `migrate()` twice (safe to run again): each table exists (`SELECT name FROM sqlite_master`); inserting a user, an org, a group, a person and a skill, then `DELETE FROM users` leaves zero rows in `orgs`, `org_groups`, `org_people`, `org_skills`; a second org for the same owner fails (`StoreError`); `level 'great'` fails.
- [ ] **Step 2:** `npx vitest run tests/org/migrations.test.js` → FAIL (no such table).
- [ ] **Step 3:** Append the SQL above to `server/store/migrations.sql` (no `;` inside comments: the splitter cuts on `;`).
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: D1 tables for the organisation view`.

### Task 2: CSV reading and roster check

**Files:**
- Create: `server/org/csv.js`, `server/org/roster.js`
- Test: `tests/org/roster.test.js`

**Interfaces:**
- Produces: `parseCsv(text: string) -> string[][]` (throws `RosterError('not_csv')` on an unclosed quote).
- Produces: `class RosterError extends Error { code }` with codes `too_large`, `not_utf8`, `not_csv`, `bad_header`.
- Produces: `checkRoster({ bytes: Buffer, type: 'hr'|'centre', groups: string[], roleCodes: Set<string>, normalizeSkill: (text) => Promise<{canonicalId, name}> }) -> Promise<RosterPreview>` where
  `RosterPreview = { people: [{ name, group, currentCode: string|null, skills: [{ key: 'el:…'|'kn:…', name, level }] }], accepted: number, rejected: [{ row: number, reason: string }], unrecognised: [{ row, skill }], newGroups: string[], notes: [{ row, note }] }`.
  `row` is the 1-based line number in the file (header = 1).

Rules (spec §5): `bytes.length > 1_048_576` → `too_large`; not valid UTF-8 (`new TextDecoder('utf-8', { fatal: true })`) → `not_utf8`; strip a leading BOM; header must equal `name,group,current_role_code,skill,level` after trim and lower-case → else `bad_header`. Per row: empty `name` → rejected "name is empty"; `type === 'hr'` and code not in `roleCodes` → rejected `role code <c> is not in eMASCO`; `type === 'centre'` and a code given → rejected "career centres have no current role"; level (lower-case, `not assessed` → `not_assessed`) not one of the four → rejected `level '<v>' is not basic / good / expert / not assessed`; `skill` empty and `level` empty → person with no skills (accepted); skill whose `normalizeSkill` result has no `canonicalId` matching `/^onet:(el|kn):/` → `unrecognised` (row still accepted, skill not counted); same name with a different group or code → rejected "same person with a different group or role"; same skill twice → keep the higher level (basic < good < expert; `not_assessed` loses to any level) and add a note "skill listed twice; the higher level is kept". Groups not in `groups` → `newGroups` (unique, file order).

- [ ] **Step 1: Write the failing tests** in `tests/org/roster.test.js`:
  - `parseCsv('a,"b,c","d ""q"""\r\n1,2,3\r\n')` → `[['a','b,c','d "q"'],['1','2','3']]`; a trailing empty line gives no row; an unclosed quote throws `not_csv`.
  - A good 4-row file (stub `normalizeSkill` mapping "Mathematics" → `onet:kn:2.C.4.a`, "Excel" → `onet:tech:Microsoft Excel`) → `accepted 4`, the Excel row in `unrecognised`, people grouped by name with skills `[{key:'kn:2.C.4.a', level:'good'}]`.
  - Each rejected reason above, with its exact text and row number.
  - BOM + CRLF file parses the same as the plain file.
  - A Latin-1 byte `0xE9` → throws `not_utf8`; 1 MB + 1 byte → `too_large`; header `Name;Group` → `bad_header`.
  - Same skill twice (`basic` then `expert`) → one skill `expert` and the note text.
  - `type: 'centre'` with an empty code column → accepted with `currentCode: null`.
- [ ] **Step 2:** `npx vitest run tests/org/roster.test.js` → FAIL.
- [ ] **Step 3:** Implement `parseCsv` (character loop, quote state) and `checkRoster` in the two files.
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: roster CSV check for the organisation view`.

### Task 3: The sums (`shared/org/team.js`)

**Files:**
- Create: `shared/org/team.js`
- Test: `tests/org/team.test.js`

**Interfaces:**
- Consumes: matching's role answer fields `fit.rows` (`{key, name, needed, you, status: 'met'|'below'|'missing'|'not_assessed', gap}`), `fit.percent`, `fit.provisional`, `chain.missingStep`, `outlook.ai`, `outlook.jobAds`, `sdg.pathPreview.goals[].links[]` (`{target, reason, approvedAt, via:{kind, code, name}}`); `bandOf` and `movedRoles` from `shared/matching/outlook.js`; `LEVEL_POINTS` from `shared/matching/fit.js`.
- Produces (all pure, never mutate input):
  - `type RoleSlice = { code, available: boolean, reason: null|'chain_broken'|'no_known_skill', missingStep: string|null, percent: number|null, provisional: boolean, rows: Row[]|null, bands: {moderate: 1|2|3|4, rapid: 1|2|3|4}, sdgLinks: Link[] }`
  - `sliceOf(roleAnswer) -> RoleSlice` (bands via `bandOf(outlook.jobAds, outlook.ai.moderate|rapid)`; `available` false when `chain.missingStep` or `fit` is null; `reason` `'chain_broken'` if `missingStep`, else `'no_known_skill'` when `fit` null; `sdgLinks` = flattened `pathPreview.goals[].links`).
  - `type TeamPerson = { id, groupId, current: RoleSlice|null, target: RoleSlice|null }` (`view` picks one).
  - `heatmap(groups: {id}[], people: TeamPerson[], view: 'current'|'target') -> { columns: [{ key, name, peopleShort, levelsShort }], cells: { [groupId]: { [key]: Cell } }, leftOut: [{ personId, groupId, reason, missingStep }] }`, `Cell = { needing, met, below, missing, notAssessed, levelsShort, averageGap, provisional }`.
  - `planSteps(groupId, people, view) -> [{ key, name, neededMax, peopleShort, missing, below, levelsShort, to: 'basic'|'good'|'expert', stillShort: boolean }]`.
  - `bandCounts(groups, people, view, scenario: 'moderate'|'rapid') -> { [groupId]: [n1, n2, n3, n4] }`.
  - `moved(people, view) -> [{ personId, from, to }]` (via `movedRoles` with `code = personId`).
  - `teamSdg(groupId, people, view, planKeys: string[]) -> { goals: [{ goal, count, links }], total }`.

Decisions the tests pin:
- Cell counts only people whose slice is `available` and whose rows contain the key; `needing = met + below + missing + notAssessed`; `levelsShort = Σ gap` rounded to 2 decimals; `averageGap = levelsShort / needing` rounded to 1 decimal; `provisional = notAssessed > 0`; a key nobody in the group needs has no cell.
- Column order and plan order: `peopleShort = below + missing` descending, then `levelsShort` descending, then `key` ascending. Columns sum over all groups; plan steps over one group; steps only where `peopleShort > 0`.
- `to` = the first of basic 2 / good 4 / expert 6 whose points ≥ `neededMax`, else `'expert'` with `stillShort = neededMax > 6` (matching's raise wording).
- `teamSdg` takes the links of every available person in the group, keeps those with `via.kind === 'role'` or `via.code ∈ planKeys`, removes duplicates by `${via.kind}|${via.code}|${target}`, groups by goal number ascending; `count` = links in the goal, `total` = all; no headcount factor.
- A person with `view` slice `null` (no target role) is in neither cells nor `leftOut`.

- [ ] **Step 1: Write the failing tests** in `tests/org/team.test.js`, building slices by hand:
  - Two people in group A needing `kn:x` (needed 4): one `below` (you 2, gap 2), one `not_assessed` (gap 0) → cell `{needing 2, met 0, below 1, missing 0, notAssessed 1, levelsShort 2, averageGap 1, provisional true}`.
  - Group B nobody needs `kn:x` → `cells.B['kn:x']` is `undefined`.
  - Column order with ties broken by `levelsShort` then key.
  - A broken-chain person → `leftOut [{reason:'chain_broken', missingStep:'masco2020_unit_to_isco08'}]`, not in cells; a `fit: null` person → `reason 'no_known_skill'` (Review Focus 1).
  - `planSteps` `to`: neededMax 3.4 → `'good'`; 5.8 → `'expert'`, `stillShort false`; 6.5 → `'expert'`, `stillShort true`.
  - `bandCounts` and `moved`: person bands `{moderate:4, rapid:2}` → moderate `[0,0,0,1]`, rapid `[0,1,0,0]`, moved `[{personId, from:4, to:2}]`.
  - `teamSdg`: two people with overlapping links → duplicates counted once; an item link whose key is not in `planKeys` is left out.
  - Owner's chart example through `sliceOf`: a role answer with `fit {met 9.2, needed 12.05, percent 76}` → `slice.percent === 76`.
  - `JSON.stringify` of every function's output matches none of `/score|weight|rank|opportunit/i`.
- [ ] **Step 2:** `npx vitest run tests/org/team.test.js` → FAIL.
- [ ] **Step 3:** Implement the functions in `shared/org/team.js` (head comment: "Pure: counts and sums of matching's numbers, no new maths").
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: team sums for the organisation view`.

### Task 4: Organisation store

**Files:**
- Create: `server/org/store.js`
- Test: `tests/org/store.test.js`

**Interfaces:**
- Consumes: `d1.query(sql, params) -> {rows, changes}` (Task 1 tables).
- Produces: `createOrgStore({ d1, now = () => new Date(), newId = randomUUID })` returning
  - `createOrg(ownerId, {name, type}) -> Org` (`Org = {id, name, type, createdAt}`); second call for the same owner → throws `OrgError('exists', 409)`.
  - `orgOf(ownerId) -> Org|null`; `renameOrg(ownerId, name)`; `deleteOrg(ownerId)`.
  - `groups(orgId) -> [{id, name, targetCode}]`; `addGroup(orgId, {name, targetCode})`; `updateGroup(orgId, groupId, {name?, targetCode?})`; `deleteGroup(orgId, groupId)` → `OrgError('group_has_people', 409)` when people remain.
  - `people(orgId) -> [{id, groupId, displayName, currentCode, source, addedAt, skills: [{key, level}]}]`.
  - `importPeople(orgId, preview: RosterPreview) -> {added: number, groupsAdded: number}` (creates `newGroups` with no target, then one person per `preview.people` with `source 'roster'`).
  - `updatePerson(orgId, personId, {groupId?, currentCode?})`; `deletePerson(orgId, personId)`.
  - `planSteps(orgId, groupId, roleCode) -> Map<itemKey, status>`; `setPlanStep(orgId, {groupId, roleCode, itemKey, status})`.
  - `class OrgError extends Error { code, status }`; any id not in `orgId` → `OrgError('not_found', 404)`.
- Invites and shares are added in Task 7.

- [ ] **Step 1: Write the failing tests** in `tests/org/store.test.js` with the fake D1: create, read, rename, delete (cascade empties every org table); second org → 409; groups add/update/delete with the 409 rule; `importPeople` of a 2-person preview with one new group → `{added 2, groupsAdded 1}` and `people()` returns the skills; ids from another org → 404 for update and delete; plan steps keyed by role: set `in_progress` for role `2411-01`, then `planSteps(group, '2524-02')` is empty (Review Focus 5).
- [ ] **Step 2:** `npx vitest run tests/org/store.test.js` → FAIL.
- [ ] **Step 3:** Implement `server/org/store.js`; every query uses `?` parameters, never template strings.
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: organisation store on D1`.

### Task 5: Team service

**Files:**
- Create: `server/org/service.js`
- Test: `tests/org/service.test.js`

**Interfaces:**
- Consumes: Task 3 functions; Task 4 store; `matching.role(profile, code, request)`; `pathway.pathway(profile, code, request)` (returns `steps.{gaps,notAssessed,met}[]` with `key, courses[], search[]`, and `sources`).
- Produces: `createOrgService({ store, matching, pathway, log })` → `{ team(ownerId, { view, scenario }, request) -> TeamAnswer }` where
  `TeamAnswer = { org, view, scenario, groups: [{ id, name, targetCode, size }], people: [{ id, groupId, displayName, source, addedAt, current: PersonRole|null, target: PersonRole|null }], heatmap, plans: { [groupId]: { roleCode, steps: [...planSteps, status, courses, search] } }, bands: { [groupId]: [n1..n4] }, moved, sdg: { [groupId]: teamSdg }, leftOut, sources }`,
  `PersonRole = { code, available, reason, missingStep, percent, provisional }`.
- `profileOf(skills) -> { skills: [{ canonicalId: 'onet:' + key, name: key, proficiency: level === 'not_assessed' ? null : level }] }` (exported for tests).
- Per person: `current` from `currentCode` (`hr` only); `target` from the group's `targetCode`. `view === 'current'` on a `centre` org is treated as `'target'`. Plan role per group: `target` view → group target; `current` view → the most common current code in the group (ties: lowest code). Plan step courses and search: from the first person in the group whose pathway answer has the key in any of the three step groups. Status from `store.planSteps`, default `'planned'`. The `request` is passed to both services so a judge's Radar session applies (change test).
- Logs carry codes only (`[org] team failed: <code>`), never names or skills.

- [ ] **Step 1: Write the failing tests** in `tests/org/service.test.js` using `makeMatchingFixture()` (`tests/helpers/matchingFixture.js`, roles `2521-03` full chain, `2512-01` broken, `9999-01` no ISCO) and a stub pathway that returns one course per key:
  - Two roster people in one group on `2521-03`, one on `2512-01` → heatmap cells from the two, `leftOut` has the third with its `missingStep`.
  - Each person's `current.percent` equals `matching.role(profileOf(skills), code).fit.percent`.
  - A person with only an unknown key → `reason 'no_known_skill'` (Review Focus 1).
  - `scenario` changes only `bands`/`moved`: heatmap and plans deep-equal between `moderate` and `rapid`.
  - Change test: with a matching service whose demo signals differ (as in `tests/matching/routes.test.js` `demoOverride`), `bands` change and `heatmap` does not.
  - A log spy sees no display name or item key.
  - No forbidden key in `JSON.stringify(answer)`.
- [ ] **Step 2:** `npx vitest run tests/org/service.test.js` → FAIL.
- [ ] **Step 3:** Implement `server/org/service.js`.
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: team service for the organisation view`.

### Task 6: Owner routes

**Files:**
- Create: `server/org/routes.js`
- Modify: `server/app.js` (create `orgStore`, `orgService` when `d1`; `app.use(orgRoutes(...))` after `matchingRoutes`)
- Test: `tests/org/routes.test.js`

**Interfaces:**
- Consumes: `makeRequireUser(auth)`, `jsonBody`, `sendError`; Tasks 2, 4, 5; `loadNormalizer()` and the eMASCO code set (from `data/emasco/role_details.json`, codes with a title).
- Produces: `orgRoutes({ auth, store, service, loadNormalizer, loadRoleCodes, log })` with routes (all `requireUser`; owner = `store.orgOf(request.user.id)`, none → 404 `no_organisation` except `POST /api/org`):
  - `POST /api/org {name, type}` → 201 Org; `GET /api/org` → `{org, groups, people}`; `PATCH /api/org {name}`; `DELETE /api/org` → `{deleted: true}`.
  - `POST /api/org/groups {name, targetCode?}`, `PATCH /api/org/groups/:id`, `DELETE /api/org/groups/:id` (409 `group_has_people`). A `targetCode` not in eMASCO → 422 `unknown_role`.
  - `POST /api/org/roster/preview` (body `text/csv`, `express.raw({ type: 'text/csv', limit: '1mb' })`) → `RosterPreview` plus `previewId`; nothing saved. `POST /api/org/roster/import {previewId}` → `{added, groupsAdded}`; previews are kept in memory per owner for 15 minutes (a Map; never logged); unknown or expired `previewId` → 410 `preview_expired`. `RosterError` → 422 with its code.
  - `PATCH /api/org/people/:id {groupId?, currentCode?}`; `DELETE /api/org/people/:id`. A shared person: `PATCH` may change only `groupId` and `currentCode`; there is no route that edits skills.
  - `GET /api/org/team?view=current|target&scenario=moderate|rapid` → `TeamAnswer`; other values → 400 `bad_request`.
  - `PUT /api/org/plan-steps {groupId, roleCode, itemKey, status}`.
  - `OrgError` → its status and code; `StoreError` → 503 `store_unavailable`.

- [ ] **Step 1: Write the failing tests** in `tests/org/routes.test.js`, app built as in `tests/savedProfiles.test.js` with `createFakeD1`, the matching fixture data dir and a stub pathway: no D1 → 503 `accounts_unavailable`; no cookie → 401; create → read → rename → delete; second create → 409; user B reading user A's group or person ids → 404; preview saves nothing (`GET /api/org` people unchanged), import adds them, a second import with the same `previewId` → 410; `text/csv` over 1 MB → 413 or 422 `too_large`; team answer has no forbidden key; `view=sideways` → 400; plan step set for role X then group target changed to Y → team plan for Y shows `planned` (Review Focus 5).
- [ ] **Step 2:** `npx vitest run tests/org/routes.test.js` → FAIL.
- [ ] **Step 3:** Implement `server/org/routes.js` and wire it in `server/app.js`.
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: organisation routes for owners`.

### Task 7: Join links and sharing

**Files:**
- Modify: `server/org/store.js` (invites and shares)
- Create: `server/org/shareRoutes.js`
- Modify: `server/app.js`
- Test: `tests/org/share.test.js`

**Interfaces:**
- Produces in the store: `createInvite(orgId, {groupId, currentCode}) -> {token, expiresAt}` (token returned once; only `sha256(token)` stored; 7 days); `inviteOf(token) -> {inviteId, orgId, orgName, groupId, groupName, currentCode, expiresAt, usedAt}|null`; `share(userId, {token?, displayName, skills})` (with token: the invite must be unused and not expired, marks `used_at`, creates the person with `source 'shared'`; without token: the user's existing share is replaced, else 404 `no_share`); `shareOf(userId) -> {orgName, groupName, displayName, skills}|null`; `stopSharing(userId)`.
- Produces routes `shareRoutes({ auth, store, loadProfileSkills, now })`:
  - `POST /api/org/invites {groupId, currentCode?}` (owner) → `{token, url: '/#join=' + token, expiresAt}`.
  - `POST /api/org/join {token}` (signed in) → `{orgName, groupName, willShare: ['skill names and levels', 'group', 'role', 'display name']}`; bad, used or expired → 410 `link_expired` with message "This link has expired or was already used. Ask HR for a new one."; the organisation's owner → 409 `own_organisation`.
  - `PUT /api/org/share {token?, displayName, profileId}` → reads the user's saved profile (`profiles` table, own only), keeps skills with `canonicalId` matching `/^onet:(el|kn):/` and returns `{shared: [...], notShared: [{name, reason: 'not an O*NET skill or knowledge item'}]}`. An existing share in the same organisation is updated, never duplicated (Review Focus 4).
  - `GET /api/org/share` → `shareOf`; `DELETE /api/org/share` → `{stopped: true}`.
  - Join and share limited with `createWindowLimiter` (`server/rateLimit.js`): 10 per 15 minutes per address → 429 `too_many_attempts`.

- [ ] **Step 1: Write the failing tests** in `tests/org/share.test.js`: the stored `token_hash` is not the token and equals its SHA-256; join → share → owner's `GET /api/org` lists the person `source 'shared'` with only O\*NET skills; re-using the token → 410; a token 7 days + 1 second old (`now` stub) → 410; owner opening own link → 409; sharing twice → one person, skills replaced; stop sharing → person and skills gone; deleting the employee's account (`DELETE /api/auth/me`) removes the person; 11th join attempt in 15 minutes → 429; the owner cannot `PATCH` a shared person's skills (no route: 404).
- [ ] **Step 2:** `npx vitest run tests/org/share.test.js` → FAIL.
- [ ] **Step 3:** Implement the store functions and `server/org/shareRoutes.js`; wire in `server/app.js`.
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: join links and skill sharing for the organisation view`.

### Task 8: Sample rosters

**Files:**
- Create: `data/org/sample-roster-hr.csv`, `data/org/roster-template.csv`, `data/org/manifest.json`
- Modify: `data/SOURCES.md`
- Test: `tests/org/sampleRoster.test.js`

**Interfaces:**
- Produces: `GET /data/org/...` is not served; the files are read by Task 9's "Use the sample roster" through `GET /api/org/roster/sample?type=hr` (add to `server/org/routes.js`, returns `text/csv`).
- Sample HR roster: 3 departments (Finance, Customer Service, Operations), 12 made-up people ("Staff 01"…), current roles from real eMASCO codes that reach O\*NET (e.g. `2411-01` Accountant, `1222-04` Customer Service Manager) plus one role that stops at the chain (e.g. `2182-03`) so "not available" shows; skills written with real O\*NET names (e.g. "Economics and Accounting", "Mathematics", "Customer and Personal Service", "Critical Thinking") and a mix of all four levels; one "Excel wizardry" row so "not recognised" shows.
- `manifest.json`: `{ "files": { "<name>": "<sha256 hex>" } }`; `SOURCES.md`: "Synthetic rosters, written for this build, 31 Oct 2026; made-up people; role codes from eMASCO and skill names from O\*NET 31.0; no licence needed".

- [ ] **Step 1: Write the failing test**: every file's SHA-256 equals the manifest; `checkRoster` on the sample with the real normaliser and real eMASCO codes → `rejected` empty, exactly one `unrecognised`; with the real matching service, at least one person per department has `available: true` and exactly the planned "not available" role has `chain_broken`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write the files and the route. **Step 4:** Run → PASS; `npm test`.
- [ ] **Step 5:** Commit `feat: synthetic sample roster for the organisation view`.

### Task 9: Owner screens

**Files:**
- Create: `public/js/orgApi.js`, `public/js/screens/orgParts.js`, `public/js/orgActions.js`
- Replace: `public/js/screens/org.js`
- Modify: `public/js/app.js`, `shared/strings/en.js`, `ms.js`, `zh.js`
- Test: `tests/org/orgScreen.test.js`

**Interfaces:**
- `orgApi.js`: one function per route of Tasks 6–8 (`getOrg()`, `createOrg(name, type)`, `team(view, scenario)`, `previewRoster(text)`, `importRoster(previewId)`, `invite(groupId, currentCode)`, `setPlanStep(...)`, …), same fetch style as `public/js/accountApi.js`.
- `org.js`: `export default ({ t, state }) -> string`, renders by `state.org.tab` ∈ `setup | people | heat | plan | outlook`; `orgParts.js` exports `setupView`, `peopleView`, `heatView`, `planView`, `outlookView`, each `(t, orgState) -> string`.
- `orgActions.js`: `createOrgActions({ state, render, api, t })` → `{ actions: { [name]: (arg) => void }, onChange(el) -> boolean }`; `app.js` spreads `actions` into its `actions` object and calls `onChange` first in its change handler.
- `app.js`: category C or D → if signed in `go('org')`, else `go('access')` with a note "An account is needed for organisation tools"; `#org` loads `getOrg()`; no organisation → setup.
- Layout and wording follow `docs/mockup-org.html` (tabs, heat cells "N of M" with "avg X short", legend in levels, cell panel, plan steps with "N people short (M missing, K below)", "Time: see each course page", band boxes, "potential, not measured"), with real data from `team()`.
- Every list has a source line (spec §3). The "hiring decisions" sentence on setup and outlook. The "synthetic only" banner on the roster upload.

- [ ] **Step 1: Write the failing tests** in `tests/org/orgScreen.test.js` (render functions with a fixed `TeamAnswer`): heat cell text; a `leftOut` count line; plan step text and "Time: see each course page"; a step with no courses shows "No team pick yet" plus its search links; an organisation with no people shows "Add people with a roster or a join link"; band counts per scenario; a source line in every view; every new string key exists in `en`, `ms`, `zh`; no `undefined` in any rendered view; category C while signed out → access screen with the note.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm test`.
- [ ] **Step 5:** Browser check at `127.0.0.2:3200` with `scripts/serve-local-accounts.mjs` (fake D1): sign up, create organisation, import sample roster, heatmap, cell, plan, scenario switch, 360 px. Note results in `docs/org/acceptance.md`.
- [ ] **Step 6:** Commit `feat: organisation screens for HR`.

### Task 10: Employee share screen

**Files:**
- Create: `public/js/screens/orgShare.js`
- Modify: `public/js/app.js`, `public/js/orgActions.js`, `public/js/orgApi.js`, strings
- Test: `tests/org/orgShare.test.js`

**Interfaces:**
- Opening `/#join=<token>` keeps the token in memory only (removed from the address bar with `history.replaceState`), asks the user to sign in if needed, then `POST /api/org/join`.
- `orgShare.js`: `(t, shareState) -> string` showing the organisation name, the exact list from `PUT /api/org/share` dry run (`{dryRun: true}` → same answer, nothing saved; add `dryRun` to Task 7's route), the "not shared" list, the display name field, "Share my skills", and, once shared, "Update shared skills" and "Stop sharing".
- The user's own profile chooser lists their saved profiles (`GET /api/profiles`); none → link to build one with the existing CV / form tools.

- [ ] **Step 1: Write the failing tests**: the token is not left in `location.hash` after load; dry run saves nothing (route test); the screen lists exactly the skills HR will see and the "not shared" ones; expired link message text.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm test`.
- [ ] **Step 5:** Browser check: owner makes a link, a second account opens it, shares, owner sees the person, employee stops sharing, owner no longer sees them. Add to `docs/org/acceptance.md`.
- [ ] **Step 6:** Commit `feat: join and share screen for employees`.

### Task 11: Career centre type (last; may be dropped — O8)

**Files:**
- Modify: `server/org/roster.js` (already accepts `type`), `server/org/service.js`, `public/js/screens/orgParts.js`, strings
- Create: `data/org/sample-roster-centre.csv` (manifest and SOURCES updated)
- Test: extend `tests/org/roster.test.js`, `tests/org/service.test.js`, `tests/org/orgScreen.test.js`, `tests/org/sampleRoster.test.js`

**Interfaces:**
- Words by type: department → programme, staff → student, team plan → cohort plan (string keys `orgGroup_hr` / `orgGroup_centre` etc.).
- `centre`: no current-role column or switch; a group with no target role shows "Choose a target role to see gaps"; outlook counts by target role.

- [ ] **Step 1: Write the failing tests**: centre roster with a code → rejected; centre team answer has every `current: null` and `view` forced to `target`; centre screens contain no "Current role" text; sample centre roster passes the Task 8 checks.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm test`.
- [ ] **Step 5:** Browser check as a career centre; add to `docs/org/acceptance.md`.
- [ ] **Step 6:** Commit `feat: career centre type for the organisation view`.

### Task 12: Handover

**Files:**
- Create: `HANDOVER.md` and `CLAUDE.md` for this branch (detailed; main's short files untouched), `docs/org/acceptance.md` (complete)
- Modify: `docs/record/status.json`, `docs/build-record.html`, `docs/tools-declaration.md` (no new API, model or dataset; synthetic rosters listed)

- [ ] **Step 1:** Full browser run (spec §11 list) at `127.0.0.2:3200`; every line in `docs/org/acceptance.md` with result and date.
- [ ] **Step 2:** Write the branch `HANDOVER.md` (state, decisions O1–O8, what waits on the owner: D1 keys with Cloudflare's current D1 price stated, BM/中文 review) and `CLAUDE.md` (rules of this module, commands, expected test count).
- [ ] **Step 3:** `npm test` and `python -m unittest discover pipeline/tests` → all pass; record; commit `docs: organisation view handover, acceptance and build record`.
