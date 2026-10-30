# Future Skills Radar — Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Round 1 Future Skills Radar: real OpenAlex and DOSM data through one pure trend engine into versioned
`radar-signal/v1` signals, with admin review, a judge change test, and two Radar tabs in EN/BM/中文.

**Architecture:** Pure deterministic calculations in `shared/radar/` (used by server, browser and tests). Server code in
`server/radar/` for sources, storage (file / memory / R2), ingestion with immutable snapshots and an atomic manifest,
access control and judge sessions. Browser screens in `public/js/` with hand-written SVG charts, no build step.

**Tech Stack:** Node ≥ 22.12 (ES modules), Express 5, Vitest 5, `node:crypto`, `node:zlib`; no new packages.

**Spec:** `docs/superpowers/specs/2026-10-30-future-radar-round1-design.md` (approved 30 Oct 2026). Calibration:
`docs/radar/index-analysis.md`, `docs/radar/threshold-analysis.md`.

## Global Constraints

- No new npm packages. Node ≥ 22.12. ES modules. Express 5.
- No score, weight, rank, match or opportunity field anywhere (spec §10). No method from the previous project.
- Never invent ids, crosswalk steps or trends: unsupported → `pending` / `unmapped` / insufficient evidence.
- Never mark a field ↔ topic link or a break review approved in code or data except the six axes (spec §4.1).
- Every UI text through `t(lang, key)` with keys in `shared/strings/en.js`, `ms.js`, `zh.js`; HTML values through `esc()`.
- Every displayed number and list carries a source link (spec D3, §11.5).
- Error shape `{error:{code,message,retryable}}` via `sendError`; error codes exactly as spec §13.
- Logs: source, operation, code, time, ids only. Never keys, cookies, full responses, CV or profile data.
- Config values exactly as `radar-config/v1` in Task 2; any change needs the owner.
- Test first; real servers on port 0; the existing 232 tests stay green after every task.
- Commits small: `feat:` / `fix:` / `docs:`, no attribution lines. After each task, update `docs/record/status.json`
  (group "Step 9") and run `python docs/record/build_record.py`; commit both with the task.
- Screen tasks (17–20) start only after the owner approves the mockup from Task 1.

## Review Focus

1. **OpenAlex `group_by` leaves out years with zero papers.** A missing year in the response must become 0, not
   "missing" (else zero-baseline topics would be rejected). Test in Task 9.
2. **"Last complete year" on 1 January.** Y = current **UTC** year − 1, from the injected clock. Test in Task 9.
3. **A profile with several fields of study, repeated codes, or a field approved only at broad level.** Each field once,
   broad approvals inherited, a detailed rejection wins. Test in Task 7.
4. **The active manifest changes between two requests of one screen.** An old `manifest=` that no longer exists answers
   409 `manifest_gone`, an older still-stored one is served as asked; the screen offers "reload". Tests in Tasks 14 and 18.
5. **DOSM workbook with an empty cell inside a published quarter (not "-").** Treated as not available for that quarter
   (null), never shifts later cells, and the validator does not treat it as a removed period. Test in Task 3.

---

### Task 1: Mockup v2 for owner approval

**Files:**
- Modify: `docs/mockup-radar.html`

**Interfaces:**
- Consumes: spec §11, §12, D2, D3, D14, D15, D18, D19.
- Produces: an approved layout that Tasks 17–20 follow.

- [ ] **Step 1: Update the mockup** to the spec, still with labelled sample data:
  default view shows only the profile's own fields (two fields of study, one role, one job) with "View all" at the very
  bottom of each tab; every number has a source link; A2 radar with rings 30/50/70/90 labelled "halved / same / doubled /
  4×", hollow small-count point, the tooltip and "Why this index?" text from `docs/radar/index-analysis.md` §8, and the
  "Paper counts / Share of Computer Science" toggle; B1 bars in pp titled "Change in share of Malaysian online job
  advertisements" showing the interim state (shares, counts, "Insufficient Comparable Evidence" with the 2025 Q3 reason,
  and "Quarter-on-quarter change in total online job advertisements — context only: −11.4%"); B2 three separate
  columns; the five state dimensions in the header; an `#admin` page (key box, mapping review, break review, status,
  refresh) and the judge panel with Scenario A and B and Reset; a language switch showing BM and 中文 for a few labels.
  Remove ILO/OECD/Anthropic/MyCOL/network sections (later rounds).
- [ ] **Step 2: Check in the Browser pane** (`record` config, 8766) at desktop and 375 px: no console errors, no
  horizontal scroll.
- [ ] **Step 3: Commit** `docs: Radar mockup v2 to the Round 1 spec` and **stop for the owner's approval** before Task 17.

---

### Task 2: Config and Research Momentum Index

**Files:**
- Create: `shared/radar/config.js`, `shared/radar/momentum.js`
- Test: `tests/radar/momentum.test.js`

**Interfaces:**
- Produces: `RADAR_CONFIG` (frozen, below); `momentumIndex({baseline, recent}, cfg = RADAR_CONFIG.momentum) →
  {value: number|null, ratio: number|null, changePercent: number|null, capped: boolean, state:
  'ok'|'no_baseline'|'dropped_to_zero'|'no_activity'|'invalid', smallCounts: boolean}`;
  `topicMomentum(counts: {[year: string]: number}, lastYear: number, cfg?) → {current, comparison}` (each a
  `momentumIndex` result plus `{baselineYear, recentYear}`); `shareSeries(topic, reference) → {[year]: number}`.

`RADAR_CONFIG` exact values (spec §5, threshold-analysis.md):

```js
{ version: 'radar-config/v1',
  momentum: { method: 'log2-v1', k: 20, windowYears: 3, smallCount: 100 },
  openalex: { method: 'openalex-count-v1', rising: 1.25, declining: 0.8, minYears: 4,
    volatility: { low: 8, high: 16, years: 6 },
    emerging: { baselineBelow: 100, recentAtLeast: 100, ratioAtLeast: 3, minYears: 4 },
    evidence: { strong: 300, moderate: 100, revisionPercent: 5 } },
  dosm: { method: 'dosm-share-v1', materialPp: 1.0, materialRelativePercent: 10, newCategoryQuarters: 8,
    volatility: { low: 0.75, high: 1.75, steps: 4, minSteps: 3 },
    evidence: { strong: 1000, moderate: 300 } },
  breaks: { method: 'break-v1', totalPercent: 50, groupShare: 0.75, groupPercent: 40 },
  freshness: { openalexDays: 14, dosmDaysAfterExpected: 14 },
  demo: { ttlMs: 7200000, maxSessions: 20 } }
```

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest'
import { RADAR_CONFIG } from '../../shared/radar/config.js'
import { momentumIndex, topicMomentum, shareSeries } from '../../shared/radar/momentum.js'

describe('Research Momentum Index (log2, k = 20)', () => {
  it('doubling = 70, halving = 30, same = 50', () => {
    expect(momentumIndex({ baseline: 100, recent: 200 }).value).toBeCloseTo(70)
    expect(momentumIndex({ baseline: 200, recent: 100 }).value).toBeCloseTo(30)
    expect(momentumIndex({ baseline: 500, recent: 500 }).value).toBe(50)
  })
  it('caps at 100 from 5.66x and keeps the real ratio', () => {
    const r = momentumIndex({ baseline: 1000, recent: 6000 })
    expect(r).toMatchObject({ value: 100, capped: true, state: 'ok' })
    expect(r.ratio).toBeCloseTo(6)
  })
  it('real T10028 2022->2025 gives 83.3', () => {
    expect(momentumIndex({ baseline: 7939, recent: 25167 }).value).toBeCloseTo(83.3, 1)
  })
  it('zero and missing never produce a number', () => {
    expect(momentumIndex({ baseline: 0, recent: 140 })).toMatchObject({ value: null, state: 'no_baseline' })
    expect(momentumIndex({ baseline: 80, recent: 0 })).toMatchObject({ value: null, state: 'dropped_to_zero' })
    expect(momentumIndex({ baseline: 0, recent: 0 })).toMatchObject({ value: null, state: 'no_activity' })
    expect(momentumIndex({ baseline: null, recent: 5 })).toMatchObject({ value: null, state: 'invalid' })
  })
  it('small counts are flagged', () => {
    expect(momentumIndex({ baseline: 91, recent: 456 }).smallCounts).toBe(true)
  })
  it('topicMomentum uses Y vs Y-3 and Y-1 vs Y-4', () => {
    const counts = { 2021: 7830, 2022: 7939, 2023: 10983, 2024: 17379, 2025: 25167 }
    const m = topicMomentum({ ...counts, 2020: 6758 }, 2025)
    expect(m.current).toMatchObject({ baselineYear: 2022, recentYear: 2025 })
    expect(m.comparison).toMatchObject({ baselineYear: 2021, recentYear: 2024 })
  })
  it('shareSeries divides by the reference', () => {
    expect(shareSeries({ 2025: 25167 }, { 2025: 906207 })[2025]).toBeCloseTo(0.02777, 4)
  })
  it('config is frozen and versioned', () => {
    expect(RADAR_CONFIG.version).toBe('radar-config/v1')
    expect(Object.isFrozen(RADAR_CONFIG)).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/radar/momentum.test.js` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `config.js` (deep-freeze the object above) and `momentum.js`: `value = clamp(50 + k·log2(R/B), 0, 100)`; `state` per spec §5.1; `smallCounts = min(B, R) < smallCount`.
- [ ] **Step 4: Run** the test — Expected: PASS. Run `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: Radar config and Research Momentum Index`

---

### Task 3: Workbook reader and DOSM table parser (real file)

**Files:**
- Create: `server/radar/xlsx.js`, `server/radar/dosmTable.js`
- Create: `data/radar/source/dosm-jmi-2026q2.xlsx` (download "Data JMI Q2 2026" from
  `https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742`; it is an xlsx served behind
  that link; check it opens as a zip with `xl/workbook.xml`), entry in
  `data/SOURCES.md` (DOSM, release page URL, data URL `release-document-log?release_document_id=20742`, downloaded
  2026-10-30, SHA-256, licence as stated on dosm.gov.my)
- Test: `tests/radar/xlsx.test.js`, `tests/helpers/xlsxFixture.js`

**Interfaces:**
- Consumes: `readZipEntries(buffer)` from `server/cv/zip.js`.
- Produces: `readWorkbook(buffer) → {sheets: [{name, cell(ref) → string|null, rows: number[], merges: string[]}]}`
  (throws `WorkbookError` with `code`); `parseDosmJmi(buffer) → DosmTable` where
  `DosmTable = {periods: string[] /* '2019 Q3'… */, total: (number|null)[], unclassified: (number|null)[],
  groups: {[code '1'..'9']: {name: string, values: (number|null)[]}}, monthly?: undefined}`; throws `DosmLayoutError`
  (`code: 'dosm_layout_unexpected'`, `detail`). `tests/helpers/xlsxFixture.js` exports
  `makeXlsx({sheetXml, sharedStrings, mergeCells}) → Buffer` (stored zip entries) for synthetic layouts.

Rules: cells by address; shared strings including rich-text runs (`<r><t>`) and inline strings; merged ranges fill from
their top-left cell; year headers carry right across quarter columns; "-" → null; an empty cell inside the table → null;
quarters after the last non-null total are dropped; group rows mapped by name prefix (case-insensitive): Managers 1,
Professionals 2, Technicians 3, Clerical 4, Service 5, Skilled agricultural 6, Craft 7, Plant 8, Elementary 9.
Reject when: no sheet, no "Table 2" title containing "Major Group Occupation", no quarter header row, a group missing,
an unknown group row, a non-numeric value other than "-".

- [ ] **Step 1: Write the failing tests** (real file + synthetic layouts)

```js
const real = await readFile('data/radar/source/dosm-jmi-2026q2.xlsx')
it('reads the real DOSM table by cell address', () => {
  const t = parseDosmJmi(real)
  expect(t.periods[0]).toBe('2019 Q3')
  expect(t.periods.at(-1)).toBe('2026 Q2')
  expect(t.total.at(-1)).toBe(555509)
  expect(t.groups['2'].values.at(-1)).toBe(285907)
  expect(t.groups['3'].values.at(-1)).toBe(86512) // a positional reader got this wrong
  expect(t.groups['1'].values.at(-1)).toBe(87950)
  expect(t.total[t.periods.indexOf('2025 Q3')]).toBe(588148)
})
it('"-" and empty cells become null without shifting later cells', () => { /* makeXlsx: group row with C5 empty, D5 '-' , E5 7 → [.., null, null, 7] */ })
it('merged year headers fill the quarter columns', () => { /* mergeCells K3:N3 '2020' → 2020 Q1..Q4 */ })
it('rich-text shared strings are joined', () => { /* <si><r><t>Profes</t></r><r><t>sionals</t></r></si> → group 2 */ })
it('rejects unexpected layouts', () => {
  for (const bad of [noTable2, noQuarterRow, missingGroup, unknownGroupRow, textValue])
    expect(() => parseDosmJmi(bad)).toThrow(expect.objectContaining({ code: 'dosm_layout_unexpected' }))
  expect(() => readWorkbook(Buffer.from('not a zip'))).toThrow(expect.objectContaining({ code: 'not_xlsx' }))
})
```

- [ ] **Step 2: Run** `npx vitest run tests/radar/xlsx.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `readWorkbook` and `parseDosmJmi` per the rules above (regex XML reading like `server/cv/`; column letters → index).
- [ ] **Step 4: Run** — Expected: PASS; `npm test` all pass.
- [ ] **Step 5: Commit** `feat: workbook reader and DOSM Job Market Insights table parser (real Q2 2026 file)`

---

### Task 4: OpenAlex trend rules

**Files:**
- Create: `shared/radar/trend.js`
- Test: `tests/radar/trendOpenAlex.test.js` (reads `docs/radar/index-analysis-openalex-2026-10-30.json`)

**Interfaces:**
- Consumes: `RADAR_CONFIG.openalex`.
- Produces: `classifyOpenAlex(counts: {[year]: number}, lastYear: number, {revisions = []} = {}, cfg?) → TrendCore`;
  `openalexVolatility(counts, lastYear, cfg?) → number|null`; `volatilityLabel(value, {low, high}) →
  'low'|'moderate'|'high'|null`.
  `TrendCore = {direction: 'rising'|'declining'|'stable'|'emerging'|'mixed'|null, net: {ratio, log2}|null,
  steps: number[], volatility: {value, unit: 'log_points'|'pp', label}|null, evidenceSufficiency:
  'sufficient'|'insufficient_evidence'|'insufficient_comparable_evidence', evidenceQuality:
  'strong'|'moderate'|'limited'|null, reasons: string[], rule: {key: string, vars: object}}`.
  Reason codes: `fewer_years`, `missing_value`, `dropped_to_zero`, `zero_baseline`, `steps_disagree`,
  `high_volatility`, `revision_over_5`, `small_counts`. `rule.key` is a string key (e.g. `rdRuleRising`) for the screen.

- [ ] **Step 1: Write the failing tests** (values from threshold-analysis.md §5 and §7)

```js
const six = JSON.parse(await readFile('docs/radar/index-analysis-openalex-2026-10-30.json', 'utf8'))
const c = (id) => Object.fromEntries(Object.entries(six.topics[id].counts).map(([y, v]) => [y, v]))
it('T10028 2025: Rising, High volatility 18.0, Strong', () => {
  const r = classifyOpenAlex(c('T10028'), 2025)
  expect(r).toMatchObject({ direction: 'rising', evidenceSufficiency: 'sufficient', evidenceQuality: 'strong' })
  expect(r.volatility.value).toBeCloseTo(18.0, 1)
  expect(r.volatility.label).toBe('high')
})
it('T12549 2025: Stable, volatility 8.2, Strong', () => {
  expect(classifyOpenAlex(c('T12549'), 2025)).toMatchObject({ direction: 'stable', evidenceQuality: 'strong' })
})
it('limits are inclusive: 1.25 rises, 0.80 declines', () => { /* B=1000,R=1250 → rising; B=1000,R=800 → declining (steps agree) */ })
it('two of three steps against the net → mixed', () => { /* 1000,1500,1400,1300 → net 1.3 but steps +,-,- → mixed, reasons steps_disagree */ })
it('within limits but high volatility → mixed', () => {})
it('Emerging from a zero baseline without dividing', () => { /* {2019:0,2020:0,2021:0,2022:0,2023:40,2024:90,2025:140} → emerging */ })
it('fewer than 4 years → insufficient_evidence', () => {})
it('R = 0 with B > 0 → insufficient_evidence, dropped_to_zero', () => {})
it('a revision over 5% inside the window lowers quality to limited', () => {
  expect(classifyOpenAlex(c('T10028'), 2025, { revisions: [{ period: '2024', old: 17379, new: 16000 }] }).evidenceQuality).toBe('limited')
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §5.2 and §5.5 (window Y−3..Y; steps = the three annual log changes; volatility = SD (n−1) of the five annual log changes Y−5..Y × 100).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: OpenAlex trend rules (direction, volatility, evidence)`

---

### Task 5: DOSM shares, structural breaks and DOSM trend rules

**Files:**
- Create: `shared/radar/dosm.js`, `shared/radar/breaks.js`; Modify: `shared/radar/trend.js` (export shared helpers only)
- Test: `tests/radar/dosm.test.js` (uses `parseDosmJmi` on the real file)

**Interfaces:**
- Consumes: `DosmTable` (Task 3), `TrendCore` shape and `volatilityLabel` (Task 4).
- Produces: `shares(table) → {[code]: (number|null)[]}`; `yoyPp(table, code, i) → number|null`;
  `detectBreaks(table, cfg?) → Break[]` with `Break = {period, totalChangePercent, groupsSameWay, eligibleGroups,
  observationHash}` (`observationHash` = stable string of the total and group values of the two quarters, hashed by the
  caller); `applyBreakReviews(breaks, reviews) → Break[]` adding `status: 'unreviewed'|'confirmed'|'dismissed_counts'|
  'dismissed_shares'`, `reviewId` (a review applies only when `appliesTo.period` and `appliesTo.observationHash` match);
  `classifyDosmGroup(table, code, breaks, cfg?) → TrendCore & {share: {baseline, recent, periods}, pp, relativePercent,
  counts: {baseline, recent}}`; `dosmContext(table) → {period, previousPeriod, totalChangePercent}`.

- [ ] **Step 1: Write the failing tests** (expected values from threshold-analysis.md)

```js
const t = parseDosmJmi(await readFile('data/radar/source/dosm-jmi-2026q2.xlsx'))
it('flags exactly 2020 Q2, 2020 Q3, 2021 Q3, 2025 Q3', () => {
  expect(detectBreaks(t).map((b) => b.period)).toEqual(['2020 Q2', '2020 Q3', '2021 Q3', '2025 Q3'])
})
it('Professionals 2026 Q2: +5.67 pp but insufficient comparable evidence', () => {
  const r = classifyDosmGroup(t, '2', applyBreakReviews(detectBreaks(t), []))
  expect(r.pp).toBeCloseTo(5.67, 2)
  expect(r).toMatchObject({ direction: null, evidenceSufficiency: 'insufficient_comparable_evidence' })
})
it('as of 2025 Q2: Technicians mixed, Clerical declining, Professionals volatility 0.85', () => {
  const upTo = truncateTable(t, '2025 Q2') // test helper: keep periods up to that quarter
  const b = applyBreakReviews(detectBreaks(upTo), [])
  expect(classifyDosmGroup(upTo, '3', b).direction).toBe('mixed')
  expect(classifyDosmGroup(upTo, '4', b)).toMatchObject({ direction: 'declining' })
  expect(classifyDosmGroup(upTo, '2', b).volatility.value).toBeCloseTo(0.85, 2)
})
it('Elementary occupations is a new reporting category', () => {
  expect(classifyDosmGroup(t, '9', applyBreakReviews(detectBreaks(t), [])).reasons).toContain('new_reporting_category')
})
it('a dismissal for shares applies only to the same observations', () => {
  const b = detectBreaks(t).find((x) => x.period === '2025 Q3')
  const ok = applyBreakReviews([b], [{ reviewId: 'r1', decision: 'dismissed_shares', appliesTo: { period: '2025 Q3', observationHash: b.observationHash } }])
  const stale = applyBreakReviews([b], [{ reviewId: 'r2', decision: 'dismissed_shares', appliesTo: { period: '2025 Q3', observationHash: 'other' } }])
  expect(ok[0].status).toBe('dismissed_shares')
  expect(stale[0].status).toBe('unreviewed')
})
it('context indicator is DOSM total q/q: -11.4%', () => {
  expect(dosmContext(t)).toMatchObject({ period: '2026 Q2', previousPeriod: '2026 Q1' })
  expect(dosmContext(t).totalChangePercent).toBeCloseTo(-11.4, 1)
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §5.3–5.5 (material = |pp| ≥ 1.0 and |relative| ≥ 10%; steps Q/Q−4, Q−1/Q−5, Q−2/Q−6; clean = no unreviewed or `confirmed` break with period in (earlier, later]; `dismissed_shares` makes shares clean; new category = fewer than 8 non-null quarters; volatility SD of last ≤ 4 clean YoY pp, needs ≥ 3).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: DOSM shares, possible structural breaks and share-based trend rules`

---

### Task 6: Snapshot shape, validation and diff

**Files:**
- Create: `shared/radar/snapshot.js`, `shared/radar/validate.js`, `shared/radar/diff.js`
- Test: `tests/radar/validate.test.js`

**Interfaces:**
- Produces:
  `Snapshot = {snapshotId, sourceId: 'openalex'|'dosm', fetchedAt, publishedAt|null, observationStart, observationEnd,
  sourceUrls: [{label, url}], classification: {system, version, readAt, countingRule|null}, observations: Observation[],
  originals: [{name, sha256}], meta: object}`;
  `Observation = {entityType: 'ai_topic'|'reference'|'occupation_group'|'total'|'unclassified', entityId, period,
  metric, unit, value: number|null}` (OpenAlex: `ai_topic` `T10028`, period `'2025'`, metric `works_primary_topic`,
  unit `papers`; reference `openalex:field:17`. DOSM: `occupation_group` `masco2020:2`, period `'2026 Q2'`, metric
  `online_job_offerings`, unit `offerings`);
  `canonicalContent(snapshot) → string` (sorted observations, values only; hashed by the server);
  `dosmTableFromSnapshot(snapshot) → DosmTable`, `dosmSnapshotObservations(table) → Observation[]`,
  `openalexCounts(snapshot, topicId) → {[year]: number}`;
  `validateSnapshot(snapshot, {expectedEntities, lastYear}) → {ok, errors: [{code, path}]}` with codes
  `bad_structure`, `bad_period`, `duplicate_period`, `period_order`, `bad_value`, `unknown_unit`, `missing_entity`,
  `future_year`, `total_below_groups`;
  `diffSnapshots(previous|null, next) → {sameContent, newObservations, revisions: [{entityId, period, old, new}],
  removed: [{entityId, period}]}`.

- [ ] **Step 1: Write the failing tests:** each reject code on a minimal snapshot; DOSM total below the sum of the nine
  groups → `total_below_groups`; a `null` value in a published quarter is valid; OpenAlex year after `lastYear` →
  `future_year`; diff: identical content → `sameContent: true`; one changed past value → one revision (old/new);
  one new quarter → one new observation; a vanished period → `removed`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the three modules (pure).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar snapshot shape, validation and diff`

---

### Task 7: Reference data, occupation bridge and personal relevance

**Files:**
- Create: `data/radar/topics.json` (six axes, spec §4.1, `reviewStatus: "approved"`, `reviewedBy: "owner"`,
  `reviewedAt: "2026-10-30"`, `note: "approved in design review"`; descriptions and hierarchy copied from the
  OpenAlex `/topics/T…` responses saved with the index analysis), `data/radar/field-topic-mappings.json` (proposals,
  all `pending`, one reason each in en/ms/zh — draft at least: 06 ICT ↔ language, genmedia, vision, automation;
  04 Business ↔ automation, service, language; 07 Engineering ↔ robotics, vision, automation; 02 Arts ↔ genmedia;
  09 Health ↔ vision, language; 10 Services ↔ service, robotics; 01 Education ↔ language),
  `pipeline/fetch_radar_bridge.py` (downloads the O\*NET 2019→SOC 2018 CSV; reads the two BLS files if present in
  `data/radar/source/`; writes `data/radar/occupation-bridge.json` with every step's source, version, URL and SHA-256;
  steps whose file is absent and the ISCO-08 → MASCO step are `pending`), `pipeline/tests/test_radar_bridge.py`,
  `server/radar/references.js`, `shared/radar/relevance.js`, `data/SOURCES.md` entries
- Test: `tests/radar/relevance.test.js`

**Interfaces:**
- Consumes: eMASCO `data/emasco/occupations.json`; ISCED-F `data/isced/fields.tsv`; ISCED→CIP→O\*NET bridge used by
  `server/fields/fieldSkills.js`.
- Produces: `loadRadarReferences(dataDir) → References` where `References = {topics: Axis[], fieldTopics:
  Mapping[], bridge: {groupOf(system: 'emasco'|'onet', code) → {groupCode|null, status: 'mapped'|'pending'|'unmapped',
  path: Step[]}}, fieldJobs(iscedCode) → {code, title}[], fieldName(code) → string|null, versions}`;
  `effectiveFieldTopics(mappings, iscedCode) → [{axisId, mappingId, level: 'broad'|'narrow'|'detailed'}]` (approved
  only; detailed rejection overrides broader approval); `relevantItems(profile, refs) → {fields, occupations, groups,
  axes, interests, empty}`.

- [ ] **Step 1: Write the failing tests** (Review Focus 3)

```js
it('lists each field once, even when repeated, and several fields', () => { /* two records 0613 + one 0411 → fields ['0613','0411'] */ })
it('a broad approval applies to detailed fields; a detailed rejection wins', () => {
  const m = [{ mappingId: 'a', iscedCode: '06', axisId: 'language', reviewStatus: 'approved' },
             { mappingId: 'b', iscedCode: '0613', axisId: 'language', reviewStatus: 'rejected' },
             { mappingId: 'c', iscedCode: '06', axisId: 'vision', reviewStatus: 'pending' }]
  expect(effectiveFieldTopics(m, '0612')).toEqual([{ axisId: 'language', mappingId: 'a', level: 'broad' }])
  expect(effectiveFieldTopics(m, '0613')).toEqual([])
})
it('eMASCO role maps by first digit; O*NET role stays pending until the MASCO step is sourced', () => {})
it('interest areas are listed but reach no group', () => {})
it('no profile or nothing linked → empty: true', () => {})
it('pending proposals never highlight', () => {})
```
  Python: `test_radar_bridge.py` checks a step without its source file is `pending` and that hashes are recorded.

- [ ] **Step 2: Run** `npx vitest run tests/radar/relevance.test.js` and `python -m unittest discover pipeline/tests` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above; run `python pipeline/fetch_radar_bridge.py` to produce the bridge (O\*NET step real; BLS and MASCO steps pending until the owner adds files).
- [ ] **Step 4: Run** both test commands — Expected: PASS (pipeline 9+ OK).
- [ ] **Step 5: Commit** `feat: Radar reference data, occupation bridge and personal relevance`

---

### Task 8: Signal contract, pipeline and dependency report

**Files:**
- Create: `shared/radar/contract.js`, `shared/radar/pipeline.js`, `shared/radar/dependencies.js`, `docs/radar/contract.md`
- Test: `tests/radar/pipeline.test.js`

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6, 7.
- Produces: `buildSignal(core, ctx) → RadarSignal` (exact shape spec §10); `validateSignal(signal) → {ok, errors}`
  (rejects any key in `['score','weight','rank','match','opportunityScore','fitScore']` at any depth, missing
  `evidenceLinks`, unknown enums); `runPipeline({snapshots: {openalex, dosm}, references, reviews, config, manifestId})
  → {signals: RadarSignal[], breaks: Break[], context: {dosm}, momentum: {[axisId]: {counts, share}}}`;
  `dependencyReport(before: {signals}, after: {signals}, references) → {changedSignals: [{signalId, before, after,
  changes: string[]}], affected: {groups, occupations: [{system, code, name, level: 'group', path}], fields:
  [{iscedCode, axisId, mappingId}], skills: [{reason: 'skill_demand_insufficient_evidence'}]}}` — arrays sorted by id,
  stable key order.

- [ ] **Step 1: Write the failing tests**

```js
it('every signal from the real bundled inputs validates and has evidence links', () => {
  const out = runPipeline(realInputs)
  expect(out.signals.length).toBe(6 + 9)
  for (const s of out.signals) { expect(validateSignal(s).ok).toBe(true); expect(s.evidenceLinks.length).toBeGreaterThan(0) }
})
it('no score-like field can pass validation', () => {
  expect(validateSignal({ ...anySignal, change: { ...anySignal.change, score: 1 } }).ok).toBe(false)
})
it('DOSM signals are group level; OpenAlex signals are research indicators', () => {})
it('same inputs and versions → byte-identical output and dependency report', () => {
  expect(JSON.stringify(runPipeline(realInputs))).toBe(JSON.stringify(runPipeline(realInputs)))
  const r1 = dependencyReport(a, b, refs), r2 = dependencyReport(a, b, refs)
  expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
})
it('a changed DOSM group lists its eMASCO jobs as group level and skills as insufficient', () => {})
it('fields appear only through approved mappings', () => {})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; write `docs/radar/contract.md` (fields, enums, what Matching may read, what it must not infer: group signals are not job signals; research is not hiring).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: radar-signal/v1 contract, pipeline and dependency report`

---

### Task 9: OpenAlex source adapter

**Files:**
- Create: `server/radar/sources/openalex.js`, `server/radar/sourceError.js`
- Test: `tests/radar/openalexSource.test.js`

**Interfaces:**
- Consumes: `Snapshot` (Task 6), axes from `References.topics`.
- Produces: `class SourceError extends Error {code, retryable, detail}`;
  `createOpenAlexSource({fetchImpl, apiKey, now, requireKey}) → {lastCompleteYear() → number,
  fetchSnapshot(topics) → Snapshot}`. Queries per spec §6.1; `api_key` added only to the request, never stored
  (`sourceUrls` hold the URL without it); `snapshotId = 'openalex-' + fetchedAt compact`.

- [ ] **Step 1: Write the failing tests** (fake `fetchImpl`)

```js
it('missing key with requireKey → openalex_key_missing, no request made', async () => {})
it('429 → openalex_rate_limited (retryable); 401/403 → openalex_auth_failed; timeout → source_unavailable', async () => {})
it('years missing from group_by become 0 (Review Focus 1)', async () => {
  /* response group_by lacks 2019 → observation {period:'2019', value:0} */
})
it('last complete year uses UTC: 2027-01-01T00:30+08:00 → 2025 (Review Focus 2)', () => {
  expect(createOpenAlexSource({ now: () => new Date('2026-12-31T16:30:00Z') }).lastCompleteYear()).toBe(2025)
})
it('stored URLs never contain the key', async () => {})
it('records topic updated_date and counting rule primary_topic', async () => {})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (15 s timeout per request via `AbortSignal.timeout`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: OpenAlex source adapter with key, rate-limit and failure handling`

---

### Task 10: DOSM source adapter

**Files:**
- Create: `server/radar/sources/dosm.js`
- Test: `tests/radar/dosmSource.test.js`, fixtures `tests/helpers/dosmPages.js` (trimmed archive and release HTML)

**Interfaces:**
- Consumes: `parseDosmJmi` (Task 3), `dosmSnapshotObservations` (Task 6), `SourceError` (Task 9).
- Produces: `createDosmSource({fetchImpl, now}) → {discover(activeQuarter: string) → {status: 'none'|'new', release?:
  {quarter, title, publishedAt, pageUrl}}, fetchSnapshot(release) → {snapshot: Snapshot, original: {name, bytes,
  sha256}}}`. Archive URL from the active release slug
  `https://www.dosm.gov.my/portal-main/release-archive/big-data-analytics-job-market-insights-q<N><YYYY>`; listing
  lines `DD.MM.YYYY - … Job Market Insights…, <First|Second|Third|Fourth> Quarter of YYYY`; data link = first
  `release-document-log?release_document_id=<digits>` inside `id="data"`.

- [ ] **Step 1: Write the failing tests:** listing with a later quarter → `new` with quarter `2026 Q3` and
  `publishedAt` from the listing; listing without a later quarter → `none`; release page without a `data` link →
  `dosm_dataset_missing`; data link returning HTML → `dosm_dataset_missing`; workbook whose last quarter differs from
  the listing → `dosm_layout_unexpected`; real workbook fixture → snapshot with 28 quarters, `originals[0].sha256`,
  `sourceUrls` with page and data URLs; title change evidence (`meta.listingTitle`) recorded.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: DOSM release discovery and dataset download`

---

### Task 11: Storage adapters and R2 additions

**Files:**
- Create: `server/radar/store/memory.js`, `server/radar/store/file.js`, `server/radar/store/r2.js`,
  `server/radar/store/scoped.js`; Modify: `server/store/r2.js` (add `list`, conditional `put`, `etag` on `get`)
- Test: `tests/radar/store.test.js`; extend `tests/r2.test.js`

**Interfaces:**
- Produces: `RadarStore = {get(key) → {bytes, etag}|null, put(key, bytes, {contentType, ifMatch, ifNoneMatch}) →
  {etag}, list(prefix) → string[], delete(key)}`; errors `StoreError` codes `precondition_failed`,
  `store_unavailable`, `read_only`; `createMemoryStore()`, `createFileStore(dir)` (read-only: `put`/`delete` →
  `read_only`), `createR2RadarStore(r2)`, `scopedStore(store, prefix)` (rejects keys not starting with `prefix`, with
  `..`, `\\`, leading `/` → `StoreError('not_allowed')`); R2 client: `put(key, body, contentType, {ifMatch,
  ifNoneMatch})` sends `If-Match` / `If-None-Match`, 412 → `precondition_failed`; `list(prefix)` = ListObjectsV2 with
  continuation tokens.

- [ ] **Step 1: Write the failing tests:** memory store etags change on put; `ifNoneMatch: '*'` on an existing key →
  `precondition_failed`; `ifMatch` with an old etag → `precondition_failed`; file store refuses writes; scoped store
  refuses `prod/active.json`, `demo/other/x`, `demo/s1/../../prod/x` (Test plan 23); R2 `list` sends
  `list-type=2&prefix=` signed and follows `NextContinuationToken`; R2 conditional headers are signed; 412 maps to
  `precondition_failed`; 5xx → `store_unavailable`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS (existing r2 tests unchanged).
- [ ] **Step 5: Commit** `feat: Radar storage interface (memory, file, R2 with list and conditional writes)`

---

### Task 12: Ingestion, manifests and atomic activation

**Files:**
- Create: `server/radar/manifest.js`, `server/radar/ingest.js`
- Test: `tests/radar/ingest.test.js`

**Interfaces:**
- Consumes: Tasks 6, 8, 9, 10, 11.
- Produces: `readActive(store) → {manifest, etag}|null`; `loadManifest(store, id) → Manifest|null`;
  `Manifest = {manifestId, createdAt, snapshots: {openalex, dosm}, mappingVersion, configVersion, signalsId,
  breakReviewsVersion, previousManifestId}`;
  `createIngestor({store, sources, references, config, now, log}) → {refresh(sourceId) → {outcome:
  'published'|'no_change'|'rejected'|'held'|'failed', code?, manifestId?, diff?}, status() → {lastChecks, orphans,
  log}}`. Keys: `prod/snapshots/<source>/<id>.json`, `prod/originals/<source>/<sha256>`,
  `prod/signals/<id>.json`, `prod/manifests/<id>.json`, `prod/active.json`, `prod/ingest-log/<time>.json`,
  `prod/reviews/<id>.json`.

- [ ] **Step 1: Write the failing tests** (memory store, fake sources)

```js
it('identical content after a repeated fetch → no_change, active unchanged (Test 16)', async () => {})
it('a valid historical revision publishes and lists the revision (Test 15)', async () => {})
it('validation failure → rejected, active unchanged, log has only code and ids', async () => {})
it('removed periods → held for review', async () => {})
it('failure after the snapshot, after signals, or before activation leaves active unchanged and reports orphans (Test 17)', async () => {})
it('two refreshes racing: one publishes, the other gets publish_conflict (Test 18)', async () => {})
it('source failure → failed with the source code; active unchanged', async () => {})
it('manifest references are read back and hash-checked before activation', async () => {})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the flow of spec §6.4–6.5 (write snapshot `ifNoneMatch: '*'`, signals, manifest; read back; activate with `ifMatch` of the etag read at start; on `precondition_failed` → `publish_conflict`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar ingestion with immutable snapshots and atomic manifest activation`

---

### Task 13: Bundled real snapshots

**Files:**
- Create: `scripts/radar-bootstrap.mjs` (runs both adapters once and writes snapshots, originals, signals and a
  manifest into `data/radar/` with the same keys under `data/radar/bundle/`), `data/radar/bundle/**`,
  `data/SOURCES.md` entries (OpenAlex counts with fetch date and query URLs; DOSM workbook)
- Test: `tests/radar/bundle.test.js`

**Interfaces:**
- Consumes: Tasks 9–12 with a file-writing store used only by this script.
- Produces: a bundled active manifest readable through `createFileStore('data/radar/bundle')`.

- [ ] **Step 1: Write the failing test:** the bundled active manifest exists; every referenced object exists and
  matches its hash; every signal validates; OpenAlex last year is 2025; DOSM last quarter is 2026 Q2.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Run** `node scripts/radar-bootstrap.mjs` (real network; no key needed for this one-time local fetch; the DOSM workbook is the committed original from Task 3, not re-downloaded if the hash matches).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: bundled real OpenAlex and DOSM snapshots`

---

### Task 14: Public Radar API and answer states

**Files:**
- Create: `server/radar/service.js`, `server/radar/routes.js`, `shared/radar/states.js`
- Modify: `server/app.js` (new option `radar = createRadarServiceFromEnv({dataDir, fetchImpl, now})`, mount routes
  before the `/api` 404), `.env.example` (`RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`, `RADAR_SESSION_SECRET`,
  `OPENALEX_API_KEY`, `RADAR_STORE`, comments)
- Test: `tests/radar/routes.test.js`

**Interfaces:**
- Consumes: Tasks 8, 11, 12, 13.
- Produces: `sourceStates({manifest, servedFrom, lastChecks, now, config}) → {[sourceId]: {availability, freshness,
  refreshHealth, servedFrom}}`; `createRadarService({store, bundleStore, references, ingestor, now, env}) → {active(),
  manifest(id), …}`; routes of spec §13 (public ones in this task). Every answer includes `manifestId` and `states`.
  Freshness: OpenAlex `stale` when the last successful check is older than 14 days; DOSM `stale` when 14 days have
  passed since the expected next release, taken as the active release's `publishedAt` + 92 days (quarterly).
  `RADAR_STORE=memory` refused when `NODE_ENV=production`.

- [ ] **Step 1: Write the failing tests** (real server, port 0)

```js
it('without R2 serves the bundled manifest read-only (Test 19)', async () => {
  /* GET /api/radar/manifest → states.openalex.servedFrom 'bundled_read_only', refreshHealth 'not_configured' */
})
it('stale + cached_fallback + failed together (Test 26)', async () => {})
it('an unknown manifest id → 409 manifest_gone; an older stored one is served as asked (Review Focus 4)', async () => {})
it('/api/radar/occupations has shares, counts, signals and the context indicator labelled context_only', async () => {})
it('/api/radar/export returns radar-signal/v1 only, no score fields', async () => {})
it('RADAR_STORE=memory is refused in production', () => {})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS; `npm test` all pass.
- [ ] **Step 5: Commit** `feat: public Radar API with manifest consistency and answer states`

---

### Task 15: Admin and judge access, admin API

**Files:**
- Create: `server/radar/access.js`, `server/radar/adminRoutes.js`, `server/radar/reviews.js`
- Test: `tests/radar/access.test.js`, `tests/radar/admin.test.js`

**Interfaces:**
- Consumes: `createWindowLimiter` (`server/rateLimit.js`), Tasks 12, 14.
- Produces: `createRadarAccess({env, now}) → {login(role, key, ip) → {ok, cookie, csrf}|{ok: false, code},
  require(role) → express middleware, logout}`; cookie `fr_radar` = `base64url(JSON) + '.' + HMAC-SHA256`
  (payload `{role, sessionId, issuedAt, expiresAt, keyVersion}`; `keyVersion` = first 8 hex of SHA-256 of the role's
  key); `HttpOnly; Secure; SameSite=Strict; Path=/`; admin 60 min, demo 120 min; CSRF header `X-Radar-CSRF` =
  HMAC(sessionId); `Origin` must equal the request host. `recordReview(store, review) → review` (immutable, newest
  wins). Admin routes of spec §13, plus `POST /api/admin/radar/cleanup` (deletes only the orphans listed by
  `status()`, never anything an active or stored manifest references; spec §6.5).

- [ ] **Step 1: Write the failing tests:** missing `RADAR_SESSION_SECRET` or role key → login and protected routes
  answer `not_configured` (Test 24); wrong key → 401 `not_allowed` and the 11th try in 15 min → 429; constant-time
  compare (uses `timingSafeEqual`); expired cookie → 401; changed key ends sessions; demo cookie on an admin route →
  403; missing/wrong CSRF → 403 `csrf_failed`; refresh twice within 5 min → 429; mapping decision stores reviewer,
  time, version, note; break review stores decision, evidence, `appliesTo` with the observation hash; export returns
  approved mappings and reviews only; cleanup removes listed orphans and refuses any referenced key.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar admin and judge access with signed sessions; admin review API`

---

### Task 16: Judge Trend Change Test

**Files:**
- Create: `server/radar/demo.js`, `data/radar/demo/base.json` (synthetic, `"synthetic": true`, nine groups with
  12 clean quarters and totals, plus one synthetic OpenAlex topic series; values chosen so Scenario A's default edit
  crosses a limit), `server/radar/demoRoutes.js`
- Test: `tests/radar/demo.test.js`

**Interfaces:**
- Consumes: Tasks 8, 11, 15.
- Produces: `createDemoService({store, base, references, now, config}) → {start(sessionId), apply(sessionId,
  {scenario: 'A'|'B', edits?: [{entityId, period, value}], factor?: number}), diff(sessionId), reset(sessionId)}`;
  keys only via `scopedStore(store, 'demo/<sessionId>/')`; `expiresAt` stored at start and checked on every call;
  sweep of expired sessions on every `start`.

- [ ] **Step 1: Write the failing tests**

```js
it('Scenario A: one edit changes the class exactly as computed by hand; report states the rule (Test 25)', async () => {})
it('Scenario B: a jump raises a possible structural break and makes comparisons insufficient', async () => {})
it('invalid edit (negative, unknown entity) is refused; state unchanged', async () => {})
it('reset restores the base; production manifest unchanged throughout', async () => {})
it('expired after a simulated restart (new service instance, same store, clock +2h) → demo_expired, data deleted (Test 21)', async () => {})
it('21st active session → demo_full', async () => {})
it('no session / admin cookie / bad CSRF / over 30 per minute → refused (Test 22)', async () => {})
it('report says career rankings are not part of this module yet', async () => {})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: judge Trend Change Test with two synthetic scenarios`

---

### Task 17: Strings (EN, BM, 中文)

*(Starts after the owner approves the Task 1 mockup.)*

**Files:**
- Modify: `shared/strings/en.js`, `ms.js`, `zh.js`
- Test: existing `tests/i18n.test.js`; new `tests/radar/strings.test.js`

**Interfaces:**
- Produces: keys prefixed `rd` used by Tasks 18–20, including the exact English copy fixed by the spec:
  `rdTooltip` and `rdWhyIndex` (index-analysis.md §8), `rdB1Title` = "Change in share of Malaysian online job
  advertisements", `rdContextLabel` = "Quarter-on-quarter change in total online job advertisements — context only",
  `rdNoFieldLinks` = "Insufficient verified connections for this field", `rdNoRankings` = "Career rankings are not part
  of this module yet.", `rdIce` = "Insufficient Comparable Evidence", `rdIceReason` = "A possible structural break in
  {period} makes year-on-year comparison unreliable until it is reviewed or until {next} data arrives.",
  `rdDevStore` = "Development store — not durable", one key per reason code, state value, direction, rule key and
  error code. BM and 中文 for friendly axis labels and reasons carry a `// translation: owner review` comment.

- [ ] **Step 1: Write the failing test:** every `rd*` key referenced in `public/js/screens/radar.js`,
  `admin.js` and chart components exists in all three files (scan source for `t('rd…')`), and the fixed English copies
  equal the strings above.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Add** the keys.
- [ ] **Step 4: Run** `npx vitest run tests/i18n.test.js tests/radar/strings.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar strings in English, Bahasa Melayu and Chinese`

---

### Task 18: SVG chart components

**Files:**
- Create: `public/js/components/charts/radarChart.js`, `lineChart.js`, `divergingBars.js`
- Test: `tests/radar/charts.test.js`

**Interfaces:**
- Produces: `radarChart({axes: [{axisId, label, value: number|null, state, smallCounts, highlighted}], comparison:
  (number|null)[], t}) → string` (SVG; rings 30/50/70/90 with `rdRing*` labels; each point a `<g role="button"
  tabindex="0" data-act="axis" data-arg="<axisId>">` with `aria-label`; null → grey labelled point at the centre and
  excluded from the polygon; fewer than 3 values → returns the bar-chart fallback);
  `lineChart({series: [{id, label, points: [{year, value}]}], hidden: Set, t}) → string`;
  `divergingBars({rows: [{id, label, pp: number|null, direction, status, text}], t}) → string` (each row has a text
  label, never colour alone; `pp: null` rows show the status text).

- [ ] **Step 1: Write the failing tests:** six values → one polygon with six points; one null → five-point polygon and
  a grey labelled marker; two values → bar fallback (no `<polygon>`); every point has `role="button"` and
  `aria-label`; all labels pass through `esc()` (a label `<b>` appears escaped); diverging bars show "+5.67 pp" text and
  status text for null rows.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar SVG charts (radar, lines, diverging bars) with keyboard and text labels`

---

### Task 19: Radar screen

**Files:**
- Create: `public/js/screens/radar.js`, `public/js/radarApi.js`, `public/js/components/evidencePanel.js`
- Modify: `public/js/app.js` (`radar` renders the new screen instead of `nextModule`; actions `axis`, `group`,
  `radarTab`, `viewAll`, `radarMode`, `reloadManifest`; the manifest id kept in state and sent on follow-up calls),
  `public/styles.css`
- Test: `tests/radar/radarScreen.test.js`

**Interfaces:**
- Consumes: Tasks 7 (`relevantItems`), 14 (API), 17, 18.
- Produces: `radarView({t, state, data}) → string` and pieces `aiTab`, `skillsTab`, `evidencePanel(signal, t)`,
  `statusCards(states, t)` for tests. `radarApi.load(manifestId?)` → data; 409 `manifest_gone` → `{reload: true}`.

- [ ] **Step 1: Write the failing tests** (spec Test plan 29, Review Focus 3 and 4)

```js
it('default shows only the profile own fields; View all is the last element of each tab', () => {})
it('every number in both tabs sits next to a link (count <a href> ≥ count of numeric cells)', () => {})
it('DOSM interim: ICE status with reason, latest shares and counts, and the context-only total change', () => {})
it('no profile → global view with the add-your-field hint', () => {})
it('field without approved links → rdNoFieldLinks, radar still drawn', () => {})
it('manifest_gone → reload offer', () => {})
it('a newer active manifest than the one shown → "New data available — reload"', () => {})
it('B2 shows three separate columns; skill demand says insufficient evidence', () => {})
it('Continue to My Career Matches goes to match (next-module placeholder)', () => {})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** following the approved mockup.
- [ ] **Step 4: Run** — Expected: PASS; `npm test` all pass.
- [ ] **Step 5: Commit** `feat: Future Skills Radar screen (AI Impact and Skills & Careers)`

---

### Task 20: Admin and judge screens

**Files:**
- Create: `public/js/screens/radarAdmin.js`, `public/js/radarAdminApi.js`
- Modify: `public/js/app.js` (hash `#admin` and `#judge`), `public/styles.css`
- Test: `tests/radar/adminScreen.test.js`

**Interfaces:**
- Consumes: Tasks 15, 16, 17.
- Produces: `adminView({t, state, data})`, `judgeView({t, state, data})`; API helpers send `X-Radar-CSRF`.

- [ ] **Step 1: Write the failing tests:** key box never echoes the key; mapping list shows status, reason, level,
  approve/reject/revise with a required note; break list shows evidence links (incl. the listing title change) and the
  four decisions; status shows the five state dimensions and orphans; judge view shows Scenario A and B, the
  before/after table, rule text, affected entities, `rdNoRankings`, and Reset; development store banner when the
  server reports `memory`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Radar admin review and judge change-test screens`

---

### Task 21: Browser acceptance, docs and handover

**Files:**
- Create: `docs/radar/deploy.md` (spec §16), `docs/radar/acceptance.md`
- Modify: `HANDOVER.md`, `CLAUDE.md` (test count, state), `README.md` (Radar commands), `docs/tools-declaration.md`
  (OpenAlex API, DOSM data), `docs/record/status.json`

- [ ] **Step 1: Run** `npm test` and `python -m unittest discover pipeline/tests` — Expected: all pass; record the counts.
- [ ] **Step 2: Browser acceptance** on `127.0.0.2:3200` (start `npm start` with `RADAR_STORE=memory`, test keys in
  `.env`, never committed), desktop and 360 px, EN/BM/中文: own-fields default and View all; radar drill-down with
  link; DOSM interim display; admin approve/reject of one proposal and one break annotation; judge Scenario A and B
  with Reset; keyboard through the radar points. Record each check with a screenshot note in `docs/radar/acceptance.md`.
- [ ] **Step 3: Write** `deploy.md` and update the docs listed above.
- [ ] **Step 4: Commit** `docs: Radar Round 1 acceptance, deployment notes and handover`
