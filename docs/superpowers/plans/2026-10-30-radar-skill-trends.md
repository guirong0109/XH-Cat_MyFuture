# Radar Skill Trends (O\*NET) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add skill-level trends to the Future Skills Radar from O\*NET's job-posting flags (A) and start yearly Hot
Technologies posting-count snapshots (B).

**Architecture:** Two new Radar sources, `onet-skills` and `onet-hottech`, go through the existing ingestor (validate →
compare → `runPipeline` → immutable snapshot/signals/manifest → conditional activation). A pure module
`shared/radar/onetSkills.js` builds the flag snapshots and the `skill_posting_flag` signals; the Skills & Careers B2
column shows them for the user's own O\*NET jobs, worked out in the browser.

**Tech Stack:** Node 22 ES modules, Express 5, Vitest, browser ES modules (no build step), existing zip reader
`server/cv/zip.js`.

**Spec:** `docs/superpowers/specs/2026-10-30-radar-skill-trends-design.md` (decisions D23–D27), on top of
`docs/superpowers/specs/2026-10-30-future-radar-round1-design.md`.

Work in `C:\Users\guiro\XH_Cat_Final-radar` on branch `claude/future-radar`.

## Global Constraints

- Labels on every skill item: "US job ads (Lightcast via O\*NET), not Malaysian" and "Software and technology skills only".
- Compare a release with the most recent earlier release whose flags differ (D25); show both release numbers.
- Only changes become signals; "still in demand" lists are reference data (D26).
- eMASCO jobs: "No official link to O\*NET: skill list not available" (D27). Never invent a crosswalk.
- B (`onet-hottech`): `direction: null`, reason `first_snapshot` while only one counting window exists. No new threshold.
- No key containing score, weight, rank, match or opportunit… anywhere (`FORBIDDEN_KEY_PATTERN`).
- Every UI text through `t(lang, key)`, in `shared/strings/en.js`, `ms.js` **and** `zh.js`; every interpolated HTML text through `esc()`.
- Every number and item shows its source link and date.
- Never log CV text, profile skills or any personal field; logs hold codes and ids only.
- Nothing personal is sent to the server: matching the user's jobs and skills happens in the browser.
- The 13 MB release zips are never committed or stored; keep URL + SHA-256. Keep the Hot Technologies page original (small).
- Test first. `npm test` must pass before every commit. Commits `feat:` / `fix:` / `docs:`, no attribution lines.
- No push, merge or PR without the owner's yes.

## Review Focus

1. A profile job whose O\*NET code has no flagged rows → the job is listed with "No skills flagged for this job in this release", never dropped silently. (Task 6 test.)
2. Skill names with spaces, `+`, `#`, `.` or `/` (e.g. `C++`, `Microsoft .NET Framework`) in `signalId` → `GET /api/radar/signals/:id` finds them when URL-encoded. (Task 5 test.)
3. Admin enters a release that is not newer than the active latest (e.g. `30.1` after `31.0`) → refused with `onet_release_not_newer`, nothing written. (Task 4 test.)
4. Hot Technologies page fetched again with the same window and counts → `no_change`; same window with changed counts → a new snapshot that is still `first_snapshot` (one window). (Task 3 test.)
5. A profile skill typed by the user (no `canonicalId`) never gets "On your profile" by fuzzy match. (Task 6 test.)

---

### Task 1: Flag snapshots and change signals (pure engine)

**Files:**
- Create: `shared/radar/onetSkills.js`
- Modify: `shared/radar/contract.js` (ENUMS), `shared/radar/validate.js` (source rules), `shared/radar/pipeline.js` (`runPipeline`)
- Create: `tests/fixtures/onet-flags-30_2.tsv`, `tests/fixtures/onet-flags-30_3.tsv` (real flagged rows only)
- Test: `tests/radar/onetSkills.test.js`

**Interfaces:**
- Produces:
  - `ONET_SKILLS_METHOD = 'onet-flag-v1'`
  - `flagSet({release, month, zipUrl, zipSha256, fileSha256, rows})` → `{id: release, releases: [release], month, zipUrl, zipSha256, fileSha256, rows}`; `rows = [{code, example, elementId, elementName, hot: bool, inDemand: bool}]` sorted by code, example; only rows with `hot || inDemand`.
  - `nextOnetSkillsSnapshot(activeSnapshot | null, parsedRelease, fetchedAt)` → snapshot `{sourceId: 'onet-skills', snapshotId: 'onet-skills-<latest release>', fetchedAt, classification: {system: 'O*NET Software Skills', version: <latest release>, readAt}, sourceUrls, meta: {flagSets: [previous?, current]}, observations}`. Rule (D25): no active → `flagSets = [current]`; parsed rows identical to active current set (same `fileSha256` or same rows) → keep both sets, append release to `current.releases`; else → `[active current, new set]`.
  - Observations: per flag set, per row and flag that is Y: `{entityType: 'skill_flag', entityId: 'indemand|<code>|<example>' | 'hot|<example>', period: <set id>, metric: 'in_demand_flag'|'hot_technology_flag', unit: 'flag', value: 1}`; plus one `{entityType: 'release', entityId: 'latest', period: <latest release>, metric: 'release_checked', unit: 'release', value: 1}`.
  - `flagChanges(snapshot)` → `{previous, current, inDemand: {added: [{code, example, elementId, elementName}], dropped: […], kept: {[code]: [example…]}}, hot: {added: [example…], dropped: [example…], current: [example…]}}`; `previous` null → added/dropped empty.
  - `onetSkillSignals(snapshot, {manifestId, config})` → `radar-signal/v1` signals per spec §5 (ids `onet:indemand:<code>:<example>`, `onet:hot:<example>`; `mappingVersion` = `'onet-flags/' + previous.id + '..' + current.id`; `configVersion` = `config.version`).
- Contract: add `skill_posting_flag` to `evidenceKind`, `skill` to `entityType`, `occupation_skill` and `skill` to `granularityLevel`, `flag` and `postings` to `changeUnit`.
- `validateSnapshot`: `SOURCES` gains `onet-skills`, `onet-hottech`; entity types `skill_flag`, `release`, `skill_postings`; units `flag`, `release`, `postings`. For the two O\*NET sources: period is a release (`/^\d{2}\.\d$/`) or a window (`/^\d{4}$/` for hottech), no contiguity check, values must be integers ≥ 0.
- `runPipeline`: `if (snapshots['onet-skills']) signals.push(...onetSkillSignals(...))`; output gains `onetSkills: flagChanges(...)` (reference lists) when present.

- [ ] **Step 1: Build the fixtures** from the official zips (30.2 `Technology Skills.txt`, 30.3 `Software Skills.txt`): flagged rows only, columns `code, example, elementId, elementName, hot, inDemand`. Write a one-off python helper in the scratchpad (not committed); record each source file's SHA-256 in a header comment line of the fixture.
- [ ] **Step 2: Write the failing tests** in `tests/radar/onetSkills.test.js`:
  - `flagChanges` 30.2 → 30.3: `hot.added` equals `['Google Looker Analytics','Grafana Labs Grafana Cloud','Intuit TurboTax','Microsoft Power Platform software','Prometheus']`, `hot.dropped` `[]`; `inDemand.added.length === 151`, `inDemand.dropped.length === 219`; 15-1252.00 added contains `Go`, dropped contains `Extensible markup language XML`, `JavaScript Object Notation JSON`, `Microsoft .NET Framework`, `Operating system software`; 13-2011.00 dropped contains `Accounting software`; no change listed for 27-2042.00.
  - `nextOnetSkillsSnapshot` with 30.2 then 30.3 then a 31.0 parse identical to 30.3 → `meta.flagSets.map(s => s.id)` is `['30.2','30.3']`, `meta.flagSets[1].releases` is `['30.3','31.0']`, `classification.version === '31.0'`.
  - First release alone → one flag set, `flagChanges(...).previous === null`, `onetSkillSignals` returns `[]`.
  - Every signal passes `validateSignal`; adding `{matchScore: 1}` to one makes it fail with `forbidden_field`.
  - Same inputs twice → `JSON.stringify` of signals identical.
  - `validateSnapshot` accepts the built snapshot and rejects one with a non-integer flag value.
- [ ] **Step 3: Run** `npx vitest run tests/radar/onetSkills.test.js` → FAIL (module missing).
- [ ] **Step 4: Implement** the module, enum and validation changes, and the `runPipeline` call.
- [ ] **Step 5: Run** `npm test` → all pass (existing radar tests unchanged).
- [ ] **Step 6: Commit** `feat: O*NET skill flag snapshots and change signals`.

### Task 2: O\*NET release source adapter

**Files:**
- Create: `server/radar/sources/onetSkills.js`
- Test: `tests/radar/onetSkillsSource.test.js`

**Interfaces:**
- Consumes: `readZipEntries(buffer)` from `server/cv/zip.js`; `SourceError` from `server/radar/sourceError.js`; `flagSet`, `nextOnetSkillsSnapshot` from Task 1.
- Produces:
  - `RELEASE_PATTERN = /^\d{2}\.\d$/`; `releaseZipUrl(release)` → `https://www.onetcenter.org/dl_files/database/db_<major>_<minor>_text.zip` (throws `TypeError` on a bad release).
  - `parseSkillsTable(text)` → rows; accepts header `O*NET-SOC Code, Example, Commodity Code, Commodity Title, Hot Technology, In Demand` and `O*NET-SOC Code, Title?, Workplace Example, Element ID, Element Name, Hot Technology, In Demand` (map by header name); missing column → `SourceError('onet_columns')`.
  - `createOnetSkillsSource({fetchImpl = fetch, now})` → `{fetchRelease(release, activeSnapshot)}` → snapshot from `nextOnetSkillsSnapshot`. Finds `Software Skills.txt` or `Technology Skills.txt` inside the zip; HTTP 404 → `onet_release_not_found`; other failures → `source_unavailable` (retryable). Release month is not fetched: the admin form passes nothing but the release; `month` comes from a fixed map in this file for seeded releases (`30.2: '2026-02'`, `30.3: '2026-05'`, `31.0: '2026-08'`) and is `null` otherwise (shown as "—").
- [ ] **Step 1: Failing tests** with a fake `fetchImpl` serving a small zip built in the test (use the existing zip helper in `tests/helpers/cvFixtures.js` if it writes zips; otherwise build with `node:zlib` deflateRaw in a helper): both header styles parse to the same rows; a header without `In Demand` → `onet_columns`; 404 → `onet_release_not_found`; `releaseZipUrl('31.0')` exact URL; `releaseZipUrl('31')` throws.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm test` → pass.
- [ ] **Step 5: Commit** `feat: O*NET release source for Radar skill flags`.

### Task 3: Hot Technologies posting-count source (B)

**Files:**
- Create: `server/radar/sources/onetHotTech.js`
- Modify: `shared/radar/onetSkills.js` (add `hotTechSignals`)
- Create: `tests/fixtures/onet-hottech-2025.html` (the real page, saved once with `curl`)
- Test: `tests/radar/onetHotTech.test.js`

**Interfaces:**
- Produces:
  - `HOT_TECH_URL = 'https://www.onetonline.org/search/hot_tech/'`
  - `parseHotTechPage(html)` → `{window: {label: '1/25–12/25', year: '2025'}, total: 46885153, rows: [{technology, postings}]}`; layout check per spec §3.2; failure → `SourceError('hottech_layout')`.
  - `createOnetHotTechSource({fetchImpl, now})` → `{fetchSnapshot()}` → `{snapshot, original: {bytes, sha256}}`; snapshot `sourceId 'onet-hottech'`, `snapshotId 'onet-hottech-<window year>-<sha8>'`, observations `{entityType: 'skill_postings', entityId: <technology>, period: <window year>, metric: 'postings', unit: 'postings', value}` plus a `total` observation `{entityType: 'skill_postings', entityId: '__total__', …}`, `originals: [{sha256, url: HOT_TECH_URL}]`.
  - `hotTechSignals(snapshot, {manifestId, config})` → one signal per technology, `signalId 'onet:postings:<technology>'`,
    `mappingVersion 'onet-hottech/<window year>'`, `methodVersion 'onet-postings-v1'`, spec §5 B shape (`direction: null`, `evidenceSufficiency: 'insufficient_evidence'`, `evidenceQuality: null`, reasons `['first_snapshot','us_postings']` when the snapshot holds one window).
- [ ] **Step 1: Failing tests:** the saved page parses to 176 rows, Python = 814,960, total 46,885,153, window year `2025`; a page with the table removed → `hottech_layout`; a count with letters → `hottech_layout`; signals validate and carry `first_snapshot`; re-parsing the same page gives identical canonical content (Review Focus 4, with Task 4's ingest test for `no_change`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm test` → pass.
- [ ] **Step 5: Commit** `feat: O*NET Hot Technologies posting-count snapshots`.

### Task 4: Ingest, manifest and admin refresh

**Files:**
- Modify: `server/radar/manifest.js` (`RADAR_SOURCES`, `makeManifest`), `server/radar/ingest.js`, `server/radar/adminRoutes.js`, `server/radar/service.js` (source construction in `createRadarServiceFromEnv`, states for new sources), `shared/radar/pipeline.js` (hottech signals), `scripts/radar-bootstrap.mjs`
- Modify: `data/radar/bundle/**` (regenerated)
- Test: `tests/radar/ingestOnet.test.js`, existing ingest/admin tests

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `RADAR_SOURCES = ['openalex', 'dosm', 'onet-skills', 'onet-hottech']`; manifests list all four (null when absent).
  - Ingestor: `refreshOnetRelease(release)` (validates `RELEASE_PATTERN`; not newer than the active `classification.version` → outcome `rejected`, code `onet_release_not_newer`); `refresh('onet-hottech')`; `refresh('onet-skills')` without a release → `failed` `not_configured`.
  - For `onet-skills` the `removed` observations of a rolled-off flag set do not hold the run (D25 rolls sets by design); every other source keeps the `periods_removed` rule.
  - Originals are stored with their own content type (`text/html` for hottech, XLSX for DOSM).
  - Admin: `POST /api/admin/radar/refresh/onet-skills` with JSON `{release}` (validated server-side; any other body field ignored); `POST /api/admin/radar/refresh/onet-hottech`.
  - Bootstrap: loads the existing bundle into the memory store first (OpenAlex and DOSM snapshots unchanged), then `refreshOnetRelease('30.2')`, `'30.3'`, `'31.0'` and `refresh('onet-hottech')`, then dumps.
- [ ] **Step 1: Failing tests:** ingest with fake sources publishes an `onet-skills` manifest whose signals include `onet:indemand:15-1252.00:Go`; 30.3 → 31.0 identical flags publishes a manifest with unchanged signal set and `classification.version '31.0'`; `refreshOnetRelease('30.1')` after `31.0` → `rejected` / `onet_release_not_newer` and active manifest unchanged; hottech same page twice → second `no_change`; hottech layout failure → `failed` / `hottech_layout`, active unchanged; admin route rejects `{release: '../x'}` with 400 and needs the admin session + CSRF like the other refresh routes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** run `node scripts/radar-bootstrap.mjs` (downloads three zips; slow) and check `data/radar/bundle/prod/active.json` names a manifest with all four sources. `npm test` → pass.
- [ ] **Step 5: Commit** `feat: Radar ingests O*NET skill flags and Hot Technologies`.

### Task 5: Public API and export

**Files:**
- Modify: `server/radar/routes.js`, `server/radar/service.js` if views need the new snapshots, `public/js/radarApi.js`
- Test: `tests/radar/routes.test.js` (or a new `tests/radar/skillsRoute.test.js`)

**Interfaces:**
- Produces:
  - `GET /api/radar/skills?manifest=<id>` → `{manifestId, activeManifestId, devStore, state, release: {latest, current: {id, releases, month}, previous: {id, releases, month} | null}, changes: {[code]: {added: [item], dropped: [item], kept: [item]}}, hot: {added: [item], dropped: [item]}, postings: {window, total, rows: [{technology, postings}]} | null, labels: {usPostings: true, softwareOnly: true}, sourceLinks: [{label, url}], fetchedAt}`; `item = {example, skillId: 'onet:tech:' + nameKey(example), elementName, signalId?}` (`nameKey` from `server/skills/onetSkills.js`, so the browser compares ids, not names).
  - Export: `references.onetSkills = {release, comparedWith, inDemand: {[code]: [example…]}, hot: [example…]}`.
  - `radarApi.load` also fetches `skills` (same `?manifest=` rule; `manifest_gone` → reload) and returns it as `data.skills`.
- [ ] **Step 1: Failing tests:** response for 15-1252.00 has `Go` in `added` with `skillId 'onet:tech:go'`; `GET /api/radar/signals/` + `encodeURIComponent('onet:indemand:15-1252.00:Microsoft .NET Framework')` → 200 (Review Focus 2); export has `references.onetSkills.comparedWith === '30.2'`; with no onet snapshot → `release: null`, empty lists, still 200.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm test` → pass.
- [ ] **Step 5: Commit** `feat: Radar skills API and export reference lists`.

### Task 6: Skills & Careers B2 screen and strings

**Files:**
- Modify: `public/js/screens/radar.js` (`skillsTab` B2 and its evidence panel), `shared/radar/relevance.js` (O\*NET job codes and profile skill ids), `public/styles.css` only if an existing class cannot be reused, `shared/strings/en.js`, `ms.js`, `zh.js`
- Test: `tests/radar/radarScreen.test.js` (existing screen tests), `tests/i18n.test.js`

**Interfaces:**
- Consumes: `data.skills` (Task 5); `relevantItems` occupations (`source`, `code`, `role`).
- Produces: `relevantItems(...)` gains `skillIds: Set<string>` from `profile.skills[].canonicalId` (only non-null ids).
- Screen per spec §6: column title "Skills in job ads (US, O\*NET)"; per own O\*NET job: Newly in demand / No longer in demand / Still in demand (`<details>` collapsed); "On your profile" tag when `skillIds.has(item.skillId)`; Became Hot Technologies list; US job ads in 2025 list with "First snapshot" note; eMASCO job message; heading text with release numbers and months; labels; links to `https://www.onetonline.org/link/summary/<code>` and the Hot Technologies page; View all lists every job with changes.
- [ ] **Step 1: Failing tests:** profile with O\*NET 15-1252.00 shows `Go` under Newly in demand and does not show 13-2011.00; skill with `canonicalId 'onet:tech:go'` gets the "On your profile" tag, a skill `{name: 'Go', canonicalId: null}` does not (Review Focus 5); eMASCO job shows the D27 message; a job with no flagged rows shows `rdSkNoFlags` (Review Focus 1); View all shows 13-2011.00; heading contains `30.2`, `30.3`, `31.0`; both labels present; every link `https`; no profile → global view with hint. `tests/i18n.test.js` passes with the new keys.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm test` → pass; open the local preview (`radar-trial` launch config, `http://radar.localhost:3210/#radar`) and check the B2 column at desktop and 360 px width.
- [ ] **Step 5: Commit** `feat: skill trends in the Radar Skills & Careers tab`.

### Task 7: Admin and source cards

**Files:**
- Modify: `public/js/screens/radarAdmin.js`, `public/js/radarAdminApi.js`, `public/js/screens/radar.js` (sources overview), `server/radar/routes.js` (`/api/radar/sources` lists the two new sources with name, dates, state), strings ×3
- Test: `tests/radar/radarAdmin.test.js`, routes test

**Interfaces:**
- Admin page: "O\*NET skill flags" row with a release input (pattern `\d{2}\.\d`) and Refresh; "O\*NET Hot Technologies" row with Refresh; both show last check, outcome code and active release/window.
- Sources overview: two new cards with name, release or window, fetched date, link.
- [ ] **Step 1: Failing tests:** admin render has both rows; submitting `31.1` calls `POST /api/admin/radar/refresh/onet-skills` with `{release: '31.1'}`; `/api/radar/sources` includes `onet-skills` with `version '31.0'` and `onet-hottech` with window `2025`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm test` → pass.
- [ ] **Step 5: Commit** `feat: Radar admin refresh for O*NET sources`.

### Task 8: Judge Scenario C

**Files:**
- Modify: `server/radar/demo.js`, `data/radar/demo/base.json` (add an `onet-skills` snapshot copied from the bundle, and `scenarios.C = {code: <demo job code>, example: <skill not in demand there>}`), `public/js/screens/radar*.js` judge controls, strings ×3
- Test: `tests/radar/demo.test.js`

**Interfaces:**
- `apply(sessionId, {scenario: 'C'})`: adds an In Demand = Y row for `scenarios.C` to the session's current flag set and recomputes; `diff` lists the new `onet:indemand:…` signal as rising; `reset` removes it. Real data never touched.
- [ ] **Step 1: Failing tests:** after C the session signals contain `onet:indemand:<code>:<example>` with direction `rising`; the production store has no new key; reset → signal gone.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm test` → pass.
- [ ] **Step 5: Commit** `feat: judge Scenario C for skill trends`.

### Task 9: Docs and records

**Files:**
- Modify: `data/SOURCES.md`, `docs/radar/contract.md`, `docs/radar/deploy.md`, `docs/tools-declaration.md`, `HANDOVER.md`, `CLAUDE.md`, `docs/record/status.json`, `docs/build-record.html` (regenerated with `python docs/record/build_record.py`)
- [ ] **Step 1:** SOURCES.md rows: O\*NET 30.2 / 30.3 / 31.0 database zips (URL, release month, zip and skills-file SHA-256, CC BY 4.0 USDOL/ETA, "zip not kept"); Hot Technologies page (URL, saved date, SHA-256, CC BY 4.0, Lightcast US postings 1/25–12/25).
- [ ] **Step 2:** contract.md: new `evidenceKind`, ids, metrics, units, `references.onetSkills`. deploy.md: the two refresh routes and what they download. Tools declaration: both sources.
- [ ] **Step 3:** HANDOVER.md / CLAUDE.md: what was added, test count, the D25 comparison rule, open item "B direction rule needs owner decision when the 2026 window appears".
- [ ] **Step 4:** build record entry; regenerate the HTML. `npm test` → pass.
- [ ] **Step 5: Commit** `docs: Radar skill trends from O*NET`.
