# Future Skills Radar — skill trends from O\*NET (design)

Status: approved in conversation by the owner on 30 Oct 2026 (sections 1–3). Branch `claude/future-radar`.
Builds on `2026-10-30-future-radar-round1-design.md` (Round 1 spec); everything there still applies unless this
document says otherwise.

## 1. Why

The Finalist Guide asks the Radar for "rising and declining skills and roles, each showing its source and date", and the
change test ("results change when the data changes"). Round 1 shows AI research topics and DOSM job groups, but no
skill-level trend: B2's "Direct skill demand" column says "insufficient evidence" (D13). This adds a skill-level
signal from an official, free, updatable source the project already uses.

## 2. Decisions

| # | Decision |
|---|---|
| D23 | O\*NET's employer job-posting flags count as evidence of **skill demand**, always labelled "US job ads (Lightcast via O\*NET), not Malaysian" and "software and technology skills only". D13 stays: no DOSM-based skill proxy. |
| D24 | Approach **A** (compare O\*NET releases) now, and **B** (yearly Hot Technologies posting counts) starts collecting snapshots now. B shows no direction until a second yearly snapshot exists; its direction rule is brought to the owner then (no new limit is added without approval). |
| D25 | A release is compared with **the most recent earlier release whose flags differ** (the previous flag update), and both release numbers are shown. Reason: O\*NET does not refresh the flags every release; 31.0's `Software Skills.txt` is byte-identical to 30.3's (SHA-256 `3fd63fb0…4f4c`), so comparing 31.0 with 30.3 alone would show no change. |
| D26 | Changes become signals; "still in demand" lists are reference data in the export, not signals. |
| D27 | eMASCO jobs get no O\*NET skill list: there is no official eMASCO → O\*NET crosswalk, so none is invented. |

## 3. Sources

### 3.1 `onet-skills` (A): O\*NET release flags
- Files: the official database zips, `https://www.onetcenter.org/dl_files/database/db_<v>_text.zip`. Up to 30.2 the
  table is `Technology Skills.txt` (`Example`, `Commodity Code`, `Commodity Title`); from 30.3 it is
  `Software Skills.txt` (`Workplace Example`, `Element ID`, `Element Name`). Both have `O*NET-SOC Code`,
  `Hot Technology` (Y/N: "frequently included across all employer job postings") and `In Demand` (Y/N: frequently
  included in postings for that occupation). Licence CC BY 4.0, USDOL/ETA.
- Snapshot: release number, release month (from `https://www.onetcenter.org/db_releases.html`), zip URL, zip SHA-256,
  skills-file SHA-256, and only the rows with `Hot Technology = Y` or `In Demand = Y`
  (`{code, example, elementId, hot, inDemand}`; about 2,600 rows). The zip itself (≈13 MB) is not kept.
- Seeded releases: 30.2 (Feb 2026), 30.3 (May 2026), 31.0 (Aug 2026).
- Measured, 30.2 → 30.3: Hot 171 → 176; 5 became Hot (Google Looker Analytics, Grafana Labs Grafana Cloud,
  Intuit TurboTax, Microsoft Power Platform software, Prometheus), none dropped. In Demand job-skill links
  2,493 → 2,425: 151 added, 219 dropped. Examples: 15-1252.00 Software Developers + Go; − Extensible markup
  language XML, JavaScript Object Notation JSON, Microsoft .NET Framework, Operating system software.
  13-2011.00 Accountants and Auditors − Accounting software. 27-2042.00 Musicians and Singers: no change.
- Refresh: admin enters a release number (e.g. 31.1). The server downloads the zip, checks the table and columns, and
  stores a new immutable snapshot; the manifest is republished as for other sources.

### 3.2 `onet-hottech` (B): Hot Technologies posting counts
- Page: `https://www.onetonline.org/search/hot_tech/` ("Employer-Based Hot Technologies", source "Lightcast US
  unique postings data"). Allowed by `robots.txt`; CC BY 4.0. The counts appear only in the page's table (the
  CSV/XLSX downloads hold names only).
- Snapshot: the original HTML (kept, hashed), the counting window (e.g. "1/25–12/25"), the total
  (46,885,153), and 176 `{technology, postings}` rows (e.g. Python 814,960).
- Parse checks (fail closed): a table with a "Job Postings" and a "Hot Technology" column, at least one row, integer
  counts, and a "total postings between …" line. Anything else → error `hottech_layout`, last good snapshot stays.
- Direction: none while only one window exists (reason `first_snapshot`). A snapshot with the same window as the
  previous one is not a new year.

## 4. Engine

New pure module `shared/radar/onetSkills.js`, called from `runPipeline`:
- `flagChanges(previous, latest)` → per `(code, example)`: In Demand `rising` (N→Y), `declining` (Y→N); per example:
  Hot `rising` / `declining`. Kept flags are `stable` and go to the reference lists, not to signals (D26).
- `previousFlagUpdate(snapshots)` → the newest earlier snapshot whose flagged rows differ from the latest (D25);
  `null` when none → no change signals, the screen says "No earlier O\*NET release to compare".
- Same inputs → byte-identical output.

## 5. Contract `radar-signal/v1`

- New `evidenceKind`: `skill_posting_flag`. New `methodVersion`: `onet-flag-v1`.
- `signalId`: `onet:indemand:<O*NET-SOC code>:<example>` or `onet:hot:<example>`.
- `entity`: `{type: 'skill', system: 'O*NET Software Skills', code: <Element ID>, name: <example>, sourceUrl}`;
  `granularity`: `{level: 'occupation_skill', occupationCode}` or `{level: 'skill'}`.
- `metric`: `in_demand_flag` or `hot_technology_flag`; `unit`: `flag`. `baseline` / `recent`:
  `{period: '<release>', value: 0|1}`. `change`: `{value: ±1, unit: 'flag', relativePercent: null}`.
- `direction`: `rising` | `declining`. `evidenceSufficiency: sufficient`, `evidenceQuality: limited`,
  `reasons: ['us_postings', 'software_only']`, `breaks: []`, `revisions: {count: 0, items: []}`.
- `evidenceLinks`: the O\*NET occupation page (`https://www.onetonline.org/link/summary/<code>`) and, for Hot, the Hot
  Technologies page.
- B (`onet-hottech`) signals: `signalId` `onet:postings:<technology>`, `evidenceKind` `skill_posting_flag`,
  metric `postings`, unit `postings`, `direction: null`, `evidenceSufficiency: insufficient_evidence`,
  `reasons: ['first_snapshot', 'us_postings']` until a second window exists.
- Export: adds `references.onetSkills = {release, comparedWith, inDemand: {<code>: [example…]}, hot: [example…]}`.
- Still no key containing score, weight, rank, match or opportunit…; `validateSignal` accepts the new enums only.

## 6. Screen (Skills & Careers, B2)

- B2's first column becomes **"Skills in job ads (US, O\*NET)"**; the AI research column stays separate.
- Default: only the user's own O\*NET jobs (held, target, interest). Per job: **Newly in demand**, **No longer in
  demand**, and **Still in demand** (collapsed). Heading: "Changed at the last O\*NET skills update
  (30.2, Feb 2026 → 30.3, May 2026; unchanged in 31.0)".
- A skill whose exact O\*NET name is on the profile gets the tag "On your profile".
- **Became Hot Technologies** list (all US ads).
- **US job ads in 2025** (B): counts with link; note "First snapshot: a trend appears from the next yearly snapshot".
- eMASCO jobs: "No official link to O\*NET: skill list not available" (D27).
- Every item: link to O\*NET, release and date; labels "US job ads (Lightcast via O\*NET), not Malaysian" and
  "Software and technology skills only". View all (bottom) lists every job's changes. All texts in EN, BM, 中文.

## 7. Judge test

Scenario C: marks one skill "newly in demand" for the demo job in the demo copy only; Reset undoes it. Real data is
never touched.

## 8. Errors

- Download, column or layout failure → error code to admin (`onet_release_not_found`, `onet_columns`,
  `hottech_layout`), the last good snapshot stays live, the screen shows each source's date and state.
- No personal data, CV text or skill lists from profiles are logged.

## 9. Tests (written first)

1. `flagChanges` on 30.2 → 30.3 fixtures finds Go added and XML, JSON, .NET Framework, Operating system software
   dropped for 15-1252.00, Accounting software dropped for 13-2011.00, exactly 5 new Hot, 0 dropped Hot.
2. `previousFlagUpdate` skips an identical release (31.0 vs 30.3 → compares with 30.2).
3. No earlier release → no change signals, reference lists still built.
4. Determinism: same inputs → byte-identical signals.
5. Every new signal passes `validateSignal`; a signal with a forbidden key is rejected.
6. Zip parser reads both column sets (30.2 and 31.0 names); a missing column → `onet_columns`.
7. Hot Technologies parser reads the saved page; a changed layout → `hottech_layout` and the active manifest is
   unchanged.
8. Screen: own jobs only by default; "On your profile" tag; eMASCO job message; View all; all keys in en/ms/zh.
9. Judge Scenario C changes the list; Reset restores it.

## 10. Docs

`data/SOURCES.md` (both sources, URLs, dates, licence, hashes), `docs/radar/contract.md`, Round 1 spec D-table
pointer to D23–D27, `docs/tools-declaration.md`, HANDOVER.md, CLAUDE.md, build record.
