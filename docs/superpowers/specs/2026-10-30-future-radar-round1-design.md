# Future Skills Radar — Round 1 Design

Date: 30 Oct 2026 · Branch `claude/future-radar` (from `main` 928f4a7) · Status: **written spec, waiting for owner review**

Source of the requirements: the owner's "AI Impact & Future Skills Radar" specification (pasted 30 Oct 2026) and the
owner's decisions in the brainstorming session of 30 Oct 2026 (§2). Calibration evidence: `docs/radar/index-analysis.md`
and `docs/radar/threshold-analysis.md` with their scripts and raw data. Layout reference: `docs/mockup-radar.html`
(to be updated first, §11.6).

Owner rules that apply throughout: follow the owner's decisions exactly and add nothing they do not state; no scoring
or matching method from the previous project; `C:/Users/guiro/XH-Cat_Domain1` is not a template; ask before anything
paid, before merge, push or PR; test first; every UI text in English, Bahasa Melayu and 中文; every list and number
shows its source on screen with a working link.

---

## 1. Goal and scope

Round 1 builds the Future Skills Radar as a complete, independently testable module. It shows how AI research and the
Malaysian online job market are changing, from real, dated, updatable sources, and links those changes to the user's
own confirmed profile. It produces **validated trend signals and affected occupation and skill relationships**, through
a stable versioned contract (`radar-signal/v1`) that the later Matching module will read.

**In scope (Round 1)**

- Two tabs: **Skills & Careers** (first, opens by default) and **AI Impact** (D21).
- Two real sources: **OpenAlex** (research activity on six approved AI topics) and **DOSM Big Data Analytics: Job
  Market Insights** (online job offerings by MASCO major group).
- Reference data already in the repo: O\*NET 31.0, eMASCO (MASCO 2020), UNESCO ISCED-F 2013 with the
  ISCED-F → CIP → O\*NET bridge.
- Trend engine (pure, shared), Research Momentum Index, structural-break detection, evidence rules.
- Versioned snapshots, an atomic manifest, admin-only refresh, R2 persistence, read-only bundled fallback.
- Admin screens: mapping review, structural-break review, ingestion status, refresh.
- Judge **Trend Change Test** with two synthetic scenarios, before/after report and reset.
- Personal relevance: by default only the user's own fields, jobs and roles; "View all" at the bottom.
- `radar-signal/v1` output contract and an export for Matching.

**Out of scope (Round 1)** — later rounds, each with its own approval

- Matching scores, Current Skill Match, Future Opportunity scores, ranking weights, skills gaps, ranked careers.
  No such number is produced or shown anywhere. The six-stage finalist journey is **not** complete after Round 1.
- AI exposure (ILO, OECD), AI usage (Anthropic Economic Index), MyCOL, skills network graph (Round 2–3).
- Data-driven field ↔ topic evidence from OpenAlex co-occurrence (Round 2, stored apart from approved mappings).
- Account-based roles in D1 (when D1 is switched on).

**Known gap, stated plainly:** OpenAlex + DOSM do not establish which **workforce skills** or **detailed jobs** are
rising or declining. DOSM's data file stops at nine major groups; OpenAlex counts research papers, not skills.
Round 1 shows "Insufficient evidence" for individual skill demand and detailed job trends, and never treats a research
topic as a workforce skill. Candidate sources for later rounds (none verified yet; each needs its own check and the
owner's approval): DOSM release text (top 5 detailed jobs per quarter), MyCOL, ILMIA publications, WEF Future of Jobs
(Malaysia profile; survey-based estimate), O\*NET Hot Technology flags (US postings, labelled as US).

## 2. Owner decisions (30 Oct 2026)

| # | Decision |
|---|---|
| D1 | Build in rounds: 1 core (this spec), 2 visuals (exposure, network), 3 extra evidence. |
| D2 | Default view shows only the user's own fields (fields of study, fields they want to move to, jobs and roles of interest); "View all" at the very bottom opens everything. |
| D3 | Every evidence item has a clickable reference link to the original source. |
| D4 | Radar axes: OpenAlex topics as source of truth, friendly labels for display; one topic per axis; reviewed cross-disciplinary topics allowed. |
| D5 | Axes approved: T10028 (Language Models & Text AI), T10775 (Generative Media AI), T12549 (Computer Vision), T10653 (Robotics), T13287 (Process Automation), T12128 (Service AI). |
| D6 | Field ↔ topic links: proposed with reasons, `pending` until the owner approves each; only approved links change highlighting. Data-driven evidence later and separate. |
| D7 | Admin and judge access by server keys (`RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`) with signed short-lived sessions; account roles later with D1. |
| D8 | Deploy as one long-running Node process (Render or Railway class), with a storage interface; R2 for deployed state; nothing paid without approval. |
| D9 | Round 1 exposes a stable contract for Matching; no scores, weights or rankings. |
| D10 | One shared pure trend engine; no new packages unless justified; own xlsx reader tested against the real workbook. |
| D11 | Counting by OpenAlex `primary_topic`; complete calendar years; comparisons inside one snapshot; new observations vs revisions kept apart. |
| D12 | Occupation path O\*NET-SOC 2019 → SOC 2018 → SOC 2010 → ISCO-08 → MASCO major group; unsupported steps stay pending; DOSM evidence stays group level. |
| D13 | No DOSM-based skill-demand proxy; individual skill demand shows insufficient evidence. |
| D14 | Research Momentum Index: log2, k = 20; it never decides trend direction. Separate optional "share of Computer Science" view. |
| D15 | DOSM main indicator: group share of online job advertisements, YoY, in percentage points. |
| D16 | Possible structural breaks detected, reviewed by admin with evidence; never assumed to be coverage changes. |
| D17 | Source-specific prototype thresholds (calibration doc), versioned. |
| D18 | While DOSM directions are insufficient: show latest shares, counts and DOSM's quarter-on-quarter total change as "context only" (Option B). |
| D19 | Two judge scenarios: normal trend change, and structural break. |
| D20 | Section 3 refinements: OpenAlex key for deployed refresh; DOSM discovery through the official release listing; revision handling; atomic manifest; demo security and expiry on every request; separate answer-state dimensions. |
| D21 | Mockup v2 approved (30 Oct 2026). Tab order: **Skills & Careers first** (opens by default), then **AI Impact**. |
| D22 | The Radar screens use the app's existing design on `main` (`public/styles.css`: colour tokens, light and dark themes, teal accent, cards, tags, buttons). The mockup gives layout and content only, not its dark-navy style. |
| D23–D27 | Skill trends from O\*NET job-posting flags (US, software skills only), added 30 Oct 2026: see `2026-10-30-radar-skill-trends-design.md`. |
| D28–D33 | Charts that follow the user's confirmed profile (skills chart, AI task chart, eMASCO code chain, corner switch, files copied from `main`), added 31 Oct 2026: see `2026-10-31-radar-profile-charts-design.md`. D29 replaces D27. |

## 3. Architecture

Follows the existing layers: Express 5 `server/`, browser ES modules with no build step in `public/`, pure modules in
`shared/` used by browser, server and tests. `createApp({...})` receives every optional service; missing settings mean
"not available", never a crash.

```
shared/radar/                      pure, deterministic, no I/O
  config.js        radar-config/v1 (thresholds, k, windows, limits) + version
  momentum.js      Research Momentum Index (log2, k = 20) and share view
  trend.js         direction, consistency, volatility, emerging, evidence sufficiency/quality
  breaks.js        possible structural-break detection
  dosm.js          shares, YoY pp, comparability windows, context indicator
  validate.js      snapshot validation (schema, periods, totals, coverage)
  diff.js          new observations vs revisions vs removals
  pipeline.js      runPipeline(snapshots, references, reviews, config) → signals
  dependencies.js  dependencyReport(oldSignals, newSignals, references) → affected entities
  relevance.js     personal relevance from profile codes (fields, jobs, roles)
  contract.js      radar-signal/v1 builder + validator
server/radar/
  sources/openalex.js   fetch + normalise (needs OPENALEX_API_KEY for deployed refresh)
  sources/dosm.js       release discovery, download, normalise
  xlsx.js               workbook reader on top of server/cv/zip.js
  store/index.js        storage interface; store/file.js, store/memory.js, store/r2.js
  ingest.js             Fetch → Validate → Normalise → Compare → Calculate → Save → Publish
  manifest.js           immutable manifests, conditional activation
  access.js             admin/demo keys, signed sessions, CSRF, rate limits
  demo.js               judge sessions, synthetic base, scenarios, expiry
  routes.js             /api/radar/*, /api/admin/radar/*, /api/demo/radar/*
public/js/screens/radar.js, admin.js;  public/js/components/charts/*.js (SVG)
data/radar/                        version-controlled reference data and bundled snapshots
```

The trend engine never imports server code, storage or HTTP. Production refreshes and judge edits call the same
`runPipeline` and `dependencyReport`.

## 4. Reference data (`data/radar/`, version-controlled)

### 4.1 Topics — `topics.json` (`radar-topics/v1`)

Per axis: `axisId`, `openalexId`, `officialTitle`, `description` (OpenAlex), `keywords`, `hierarchy`
`{domain, field, subfield}` with OpenAlex ids, `sourceUrl` (`https://openalex.org/T…`), `friendlyLabel {en, ms, zh}`,
`taxonomyReadAt`, `topicUpdatedDate`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `note`.

| Axis | OpenAlex id | Official title | Subfield | Friendly label (en) |
|---|---|---|---|---|
| language | T10028 | Topic Modeling | Artificial Intelligence | Language Models & Text AI |
| genmedia | T10775 | Generative Adversarial Networks and Image Synthesis | Computer Vision and Pattern Recognition | Generative Media AI |
| vision | T12549 | Image and Object Detection Techniques | Computer Vision and Pattern Recognition | Computer Vision |
| robotics | T10653 | Robot Manipulation and Learning | Control and Systems Engineering | Robotics |
| automation | T13287 | Robotic Process Automation Applications | Industrial and Manufacturing Engineering | Process Automation |
| service | T12128 | AI in Service Interactions | Artificial Intelligence | Service AI |

The six axes are **approved by the owner in the brainstorming session on 30 Oct 2026** (D5); the file records
`reviewStatus: "approved"`, `reviewedBy: "owner"`, `reviewedAt: "2026-10-30"`, `note: "approved in design review"`.
T10028's panel always shows its official title "Topic Modeling" and OpenAlex's description. T12549's panel states it is
a narrow topic (~400–800 papers a year). BM and 中文 friendly labels are translations and are marked for owner review
in the strings files.

### 4.2 Field ↔ topic proposals — `field-topic-mappings.json` (`radar-field-topics/v1`)

Many-to-many records: `mappingId`, `iscedCode` (broad, narrow or detailed field), `axisId`, `relationship:
"field_related_to_ai_topic"`, `method: "curated"`, `reason {en, ms, zh}`, `reviewStatus: "pending" | "approved" |
"rejected"`, `reviewedBy`, `reviewedAt`, `mappingVersion`, `revisionOf`. All proposals ship as `pending`. Approved state
in the deployed app lives in R2 (§7) and can be exported to this file and committed. Only `approved` records change
highlighting. Missing approvals → "Insufficient verified connections for this field" while the global radar stays.
A record at a broad (2-digit) or narrow (3-digit) level applies to every detailed field under it; a rejected record
at a more detailed level overrides it for that field. The screen names the level the link was approved at. The
first proposals (one reason each, all `pending`) are drafted as a plan task and reviewed in the admin screen.

### 4.3 Occupation bridge — `occupation-groups.json` (`radar-occupation-bridge/v1`)

- **eMASCO role** (MASCO 2020 code, e.g. `2512-01`): major group = first digit. Recorded as `method:
  "code_prefix"`, source eMASCO.
- **O\*NET occupation**: O\*NET-SOC 2019 → SOC 2018 (O\*NET crosswalk CSV, onetcenter.org) → SOC 2010 (BLS
  2010↔2018 crosswalk) → ISCO-08 (BLS ISCO-08↔SOC 2010 crosswalk) → MASCO 2020 major group. Every step stores codes,
  system, version, source file name, URL and hash; many-to-many is kept.
- **The two BLS files block automated download.** The owner downloads them in a browser and puts them in
  `data/radar/source/`; `pipeline/fetch_radar_bridge.py` builds the bridge from the kept originals.
- **ISCO-08 major group = MASCO 2020 major group** needs an official Malaysian source. Until one is recorded, that step
  is `pending`, and O\*NET-coded jobs show "Not mapped to a DOSM group yet". No link is invented.
- A job with no path is `unmapped` and listed as such.

### 4.4 Bundled snapshots and demo base

- `data/radar/snapshots/openalex/<id>.json`, `data/radar/snapshots/dosm/<id>.json`: the first real snapshots, with
  originals in `data/radar/source/` (DOSM workbook ~350 KB; OpenAlex responses as JSON) and `data/SOURCES.md` entries.
- `data/radar/manifests/<id>.json` and `data/radar/active.json`: bundled manifest used when R2 is not configured.
- `data/radar/demo/base.json`: the synthetic base for judges (clearly fictional values), with the two scenarios.

## 5. Calculations (`shared/radar/`, config `radar-config/v1`)

All thresholds are **prototype settings** with calibration in `docs/radar/threshold-analysis.md`; the evidence panel
shows them. Every output records inputs, periods, snapshot ids, `configVersion`, `methodVersion`, `mappingVersion`.
Same inputs and versions → identical outputs.

### 5.1 Research Momentum Index (`momentum.js`, method `log2-v1`) — chart value only

`index = clamp(50 + 20 × log2(R ÷ B), 0, 100)`, R = count in the last complete year Y, B = count in Y−3, counted by
`primary_topic`, inside one snapshot. Comparison outline: same method for Y−1 vs Y−4. Capped values say "≥ 5.7×" and
show the real ratio. Zero and missing: B = 0 & R > 0 → no index ("New activity — no baseline"); B > 0 & R = 0 → no index,
flagged for admin review; both 0 → "No activity"; missing/invalid → snapshot rejected. min(B, R) < 100 → hollow point,
"Small counts". Share view: same formula on topic ÷ Computer Science (`primary_topic.field = 17`) counts from the same
fetch; never blended with the count index. The index never decides direction.

### 5.2 OpenAlex trend (`trend.js`, method `openalex-count-v1`)

- Net = log2(R ÷ B), same window. Rising R ÷ B ≥ 1.25; Declining ≤ 0.80.
- Steps: annual changes Y−3→Y−2, Y−2→Y−1, Y−1→Y; Rising/Declining need ≥ 2 of 3 with the net's sign, else Mixed / unclear.
- Stable: between the limits and volatility not High; else Mixed / unclear.
- Emerging: B < 100 (incl. 0), R ≥ 100, (B = 0 or R ÷ B ≥ 3), last two steps up, ≥ 4 years of history. No division by 0.
- Volatility: SD (n − 1) of ln(c[y+1] ÷ c[y]) for y = Y−5…Y−1, × 100 (log points ≈ %). Low < 8, Moderate 8–16, High > 16;
  needs six years > 0, else "not computable".
- Context line on every OpenAlex panel: Computer Science growth over the same window.

### 5.3 DOSM trend (`dosm.js` + `trend.js`, method `dosm-share-v1`)

- Share = group ÷ DOSM total × 100. Net = YoY change in **percentage points** for the latest quarter.
- Material: |net| ≥ 1.0 pp **and** |relative share change| ≥ 10%.
- Steps: YoY pp of Q vs Q−4, Q−1 vs Q−5, Q−2 vs Q−6; only clean steps count (no unreviewed possible break between the
  two compared quarters). Rising/Declining: material and ≥ 2 clean steps agree with the net (with only 1–2 clean steps,
  all must agree and evidence is at most Limited); else Mixed / unclear. Stable: not material, volatility not High.
- Volatility: SD (n − 1) of the last four clean YoY pp changes, in pp (needs ≥ 3). Low < 0.75, Moderate 0.75–1.75,
  High > 1.75.
- No Emerging for DOSM. A new reporting category (fewer than 8 reported quarters) → insufficient evidence.
- Context indicator (D18): DOSM's quarter-on-quarter change in **total** offerings, labelled "Quarter-on-quarter
  change in total online job advertisements — context only". Never used to classify a group, job or skill.

### 5.4 Possible structural breaks (`breaks.js`, method `break-v1`)

Flag quarter t when |total(t) ÷ total(t−1) − 1| ≥ 50% **and** ≥ 75% of eligible groups (both quarters > 0) move the
same way by ≥ 40%. On today's data it flags 2020 Q2, 2020 Q3, 2021 Q3, 2025 Q3. Counts and shares are restricted
separately: a comparison whose two periods straddle an unreviewed flag → `insufficient_comparable_evidence`, with the
reason shown. Admin review (§8.4) may **confirm**, **dismiss** (per measure: counts and/or shares) or **annotate**. A
review is tied to the exact event: source id, flagged quarter, the observations that triggered it and their content hash.
If those observations change in a later snapshot, the review no longer applies and the flag returns to unreviewed.
Historical observations are never changed by a review.

### 5.5 Evidence (`trend.js`)

`evidenceSufficiency: "sufficient" | "insufficient_evidence" | "insufficient_comparable_evidence"` is separate from
`evidenceQuality: "strong" | "moderate" | "limited"` (only for sufficient results).

| | Strong | Moderate | Limited |
|---|---|---|---|
| OpenAlex | min(B, R) ≥ 300, six years, no revision > 5% in window | min(B, R) ≥ 100 | otherwise |
| DOSM | 3 clean steps, ≥ 1,000 offerings in both compared quarters | ≥ 2 clean steps, ≥ 300 | 1 clean step or < 300 |

Insufficient evidence: OpenAlex — B or R missing, R = 0 with B > 0, < 4 years; DOSM — "-" in a compared quarter, new
reporting category. Insufficient comparable evidence: an unreviewed possible break inside the comparison.

## 6. Ingestion, validation, publishing, propagation (`server/radar/ingest.js`)

Flow: **Fetch → Validate → Normalise → Compare → Calculate → Save snapshot → Write manifest → Activate → Refresh screens.**
Only an admin starts a real refresh (Round 1). Opening the Radar never fetches from a source.

### 6.1 OpenAlex

- Queries: per axis `filter=primary_topic.id:T…,publication_year:2015-<Y>&group_by=publication_year`; CS reference
  `primary_topic.field.id:17`; topic metadata `/topics/T…`. Y = last complete calendar year.
- `OPENALEX_API_KEY` is **required for a deployed admin refresh**; without it the refresh answers
  `openalex_key_missing` and nothing changes. Local tests use a fake fetch; bundled snapshots need no key.
- 429 / budget exhausted → `openalex_rate_limited` (with reset time if given); 401/403 → `openalex_auth_failed`;
  timeout or network → `source_unavailable`. In every case the active manifest is untouched.
- Stored per fetch: every query URL (without the key), fetch time, topic `updated_date`, counts.

### 6.2 DOSM

- Discovery: read the official release archive
  (`/portal-main/release-archive/big-data-analytics-job-market-insights-q<N><YYYY>` and the listing it contains). A
  release counts as new only when the listing shows a **Job Market Insights** title for a **quarter later than the
  active one**, with its publication date. Then open the release page, find the "Data" document link, download it.
- Checks before accepting: the file is a real xlsx; the workbook has the expected sheet and "Table 2 … Major Group
  Occupation"; the last quarter in the table equals the quarter named in the listing. A release page without a valid
  dataset → `dosm_dataset_missing`; an unexpected layout → `dosm_layout_unexpected`. Nothing is published in either case.
- Kept: the original workbook, its SHA-256, release page URL, data URL, listing title, publication date.
- Listing evidence such as the title change at 2025 Q3 ("… and My Job Profile" dropped) is stored as evidence for the
  break review, not as a cause.

### 6.3 Validate (`validate.js`, pure)

Malformed data is rejected; legitimate revisions are not.

- **Reject:** wrong structure; missing, duplicate or out-of-order periods; non-numeric or negative values; unknown
  units; an expected topic or group missing; OpenAlex counts for a year after Y.
- **DOSM totals check, as the source is structured:** total ("Jumlah") ≥ sum of the nine groups (DOSM also has an
  "Unclassified" row and "-" cells; the difference is kept as "unclassified/unreported"). Failing → reject.
- **Revisions:** a changed value for an existing period is a revision, not an error. It goes to the comparison
  (§6.4) and is shown. A revision larger than 5% of the old value lowers evidence quality for windows containing it
  (§5.5). Disappearing periods → `periods_removed`: held for admin review, not published automatically.
- Logs: source, operation, error code, timestamp, snapshot ids. Never keys, never full responses.

### 6.4 Compare

Normalise to observations `{sourceId, entityType, entityId, period, metric, unit, value}`. Hash the normalised content.
Same hash as the active snapshot → record "checked — no new data", nothing else. Otherwise classify each period:
new observation, revision (old → new), removed.

### 6.5 Save and activate (`manifest.js`)

1. Write the snapshot (immutable, "only if absent").
2. Run `runPipeline` → write signals (immutable).
3. Write a **manifest** (immutable): `{manifestId, createdAt, snapshots {openalex, dosm}, mappingVersion, configVersion,
   signalsId, breakReviewsVersion, previousManifestId}`.
4. Read back and validate every referenced object (exists, hash matches).
5. Activate: conditional write of `prod/active.json` (`If-Match` on the etag read before step 1). Conflict →
   `publish_conflict`; the refresh re-reads the new active manifest and reports, never overwrites.
6. An interrupted run leaves unreferenced objects only; `active.json` still points at a complete manifest. Orphans are
   listed in the ingestion status and removed by admin cleanup.

Every Radar API answer carries the `manifestId` it used; the browser sends it back on follow-up requests, so one screen
never mixes versions. When a newer manifest is active, the screen offers "New data available — reload".

### 6.6 Propagation (`dependencies.js`, pure)

`dependencyReport(old, new, references)` lists: changed observations; changed signals (direction, evidence, values);
linked occupation groups → eMASCO/O\*NET jobs (with mapping paths, marked group-level); fields linked through
**approved** field ↔ topic records; skills (always "insufficient evidence" for demand in Round 1). Deterministic: same
inputs and versions → identical report. The judge report uses the same function.

## 7. Storage (`server/radar/store/`)

Interface: `get(key)`, `put(key, bytes, {ifNoneMatch, ifMatch})` → `{etag}`, `list(prefix)`, `delete(key)`.

| Adapter | Use | Writes |
|---|---|---|
| file | bundled reference data and snapshots in `data/radar/` | read-only at runtime |
| memory | tests | yes |
| r2 | deployed state | yes |

- R2 client additions (`server/store/r2.js`): `list` (ListObjectsV2) and conditional `put` (`If-Match`,
  `If-None-Match: *`). Tested with a fake; checked against real R2 once the owner provides R2 settings.
- Keys are built only by server code from fixed prefixes: `prod/…` and `demo/<sessionId>/…`. The demo store wrapper
  rejects any key outside its own prefix. No request parameter is ever used as a key.
- Without R2: the app serves the bundled manifest read-only; refresh, mapping approval and break review answer
  "not available on this server"; judge sessions are not available (they need durable state).
- Local development only: `RADAR_STORE=memory` explicitly switches on the memory adapter for admin and demo writes,
  and every screen then shows "Development store — not durable". It is never the default and never used when
  deployed (`NODE_ENV=production` refuses it).

## 8. Admin and judge access (`server/radar/access.js`)

### 8.1 Keys and sessions

- Secrets: `RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`, `RADAR_SESSION_SECRET` (≥ 32 bytes), from `.env` locally and the host's
  secret settings when deployed. Never in the browser, URLs, logs or the repo. Missing secret → that role's operations
  fail closed (`not_configured`).
- `#admin` shows a key box. `POST /api/radar/session` with the key (compared in constant time) issues a cookie
  `fr_radar` signed with HMAC-SHA256: `{role, sessionId, issuedAt, expiresAt, keyVersion}`; `HttpOnly`, `Secure`,
  `SameSite=Strict`, 60 minutes for admin, 2 hours for demo. Rotating a key changes `keyVersion` and ends old sessions.
- CSRF: protected requests need the `X-Radar-CSRF` header matching a token returned at login and bound to the session;
  `Origin` must match the host.
- Rate limits (existing limiter): login 10 per 15 min per address; admin refresh once per 5 min per source; demo
  mutations 30 per minute per session.
- Every protected route checks role on the server. Admin cannot act as demo and demo cannot act as admin.

### 8.2 Admin

Review field ↔ topic proposals (approve / reject / revise, with note); review possible structural breaks
(confirm / dismiss counts / dismiss shares / annotate, with evidence links); view ingestion status and logs; start a
refresh per source; export approved mappings and reviews as JSON for committing. Every decision stores reviewer
(`owner` or the admin label set at login), timestamp, mapping or review version and the evidence.

### 8.3 Judge (demo)

Apply synthetic changes, run the real pipeline, view before/after, reset. A demo session can never read or write
`prod/` mutable state, approved mappings or other sessions.

### 8.4 Review records

`{reviewId, kind: "field_topic" | "break", target, decision, note, evidence[], reviewer, reviewedAt, version,
appliesTo {sourceId, period, observationHash}}`, stored under `prod/reviews/`, immutable, newest wins; the history stays.

## 9. Judge Trend Change Test (`server/radar/demo.js`)

- A session starts from `data/radar/demo/base.json` (synthetic, labelled as such), stored under `demo/<id>/`.
- **Scenario A — normal change:** synthetic quarterly counts for the nine groups with clean history. The judge edits a
  value (e.g. Professionals in the latest quarter). Pipeline → before/after shows the share, pp change, steps, rule text
  ("net +1.4 pp and +12% → material; steps agree 3/3 → Rising"), direction change if a limit is crossed, and the
  affected jobs, fields and skills.
- **Scenario B — structural break:** the judge applies a jump to the total and most groups. The break detector flags
  it; the report shows "Possible structural break" and the comparisons that became insufficient comparable evidence.
- Both: validation runs first (invalid edits are refused with a reason, last state kept); same `runPipeline` and
  `dependencyReport`; before/after lists previous and new manifest ids, observations, classifications, momentum
  indices (for OpenAlex-type edits), affected entities, evidence and calculation details. **Reset** restores the base.
- The report says plainly: "Career rankings are not part of this module yet."
- Expiry: 2 hours from creation, checked **on every demo request** against the stored `expiresAt` (works after a
  restart or sleep); expired → `demo_expired`, data deleted on that request; also swept opportunistically on any demo
  login. At most 20 active sessions (config); the 21st login answers `demo_full`.

## 10. Output contract `radar-signal/v1` (`contract.js`)

```
{ contract: "radar-signal/v1", signalId, manifestId,
  evidenceKind: "research_indicator" | "occupation_group" | "occupation_direct",
  entity: { type: "ai_topic" | "occupation_group" | "occupation", system, code, name, sourceUrl },
  granularity: { level: "topic" | "group" | "occupation", groupSystem?, groupCode? },
  metric, unit, baseline: {period, value}, recent: {period, value},
  change: { value, unit: "percent" | "pp" | "log2", relativePercent? },
  momentum?: { method: "log2-v1", k, windowYears, value, ratio, capped, state },
  shareMomentum?: { referencePopulation, value, ratio },
  direction: "rising" | "declining" | "stable" | "emerging" | "mixed" | null,
  volatility: { value, unit, label } | null,
  evidenceSufficiency, evidenceQuality | null, reasons: [codes],
  breaks: [{ period, status: "unreviewed" | "confirmed" | "dismissed_counts" | "dismissed_shares", reviewId? }],
  revisions: { count, items: [{ period, old, new }] },
  classification: { system, version, readAt, countingRule? },
  mappingPath?: [{ system, code, version, source, sourceUrl, status }],
  sourceSnapshotIds, evidenceLinks: [{ label, url }], publishedAt, fetchedAt,
  methodVersion, configVersion, mappingVersion }
```

No score, weight, rank or match field exists. `GET /api/radar/export` returns the active signals and references for
Matching (documented in `docs/radar/contract.md`).

## 11. Screens

### 11.1 Common header

Title, subtitle and explanation (owner spec §6). Per-source status cards: source name with link, observation period,
publication date (DOSM), last successful fetch, active manifest id, and the five state dimensions (§12). "View data
sources" opens the source list with links and policies. No global "Updated today".

### 11.2 Personal relevance (D2)

From the confirmed profile, computed in the browser by `shared/radar/relevance.js` with reference data from the API
(nothing personal is sent or stored by the server):

- **Own fields:** every `education.records[].field.code` (ISCED-F) — there may be several.
- **Fields to move to / roles:** roles of interest (`occupationMappings` of kind interest), jobs held
  (`employment.records[].occupation.code`), and the field-of-study → O\*NET jobs bridge. O\*NET interest areas
  (`preferences.careerInterests`) are listed as the user's interests but are **not** linked to groups in Round 1.
- Default view lists only these and the DOSM groups and AI axes they reach through approved or official links, each
  with its path. The radar chart still draws all six axes (global evidence) and highlights the user's linked ones.
- **"View all"** at the very bottom of each tab expands to every group and topic. Nothing else from outside the
  profile is shown by default.
- No profile or no linked items → the global view with "Add your field of study or roles to see what relates to you".

### 11.3 AI Impact tab (Round 1)

- **A1 research activity over time:** SVG multi-line chart of yearly `primary_topic` counts, 2015–Y, per axis, with
  legend toggles; metric named "Research papers per year (OpenAlex)".
- **A2 Research Momentum radar:** six axes, rings at 30 / 50 / 70 / 90 labelled "halved / same / doubled / 4×",
  selected window filled cyan, comparison window dashed grey, hollow and grey points per §5.1, fewer than 3 valid axes
  → bar chart. Toggle "Paper counts / Share of Computer Science". Field highlighting from approved links only, with the
  insufficient-connections message. Tooltip and "Why this index?" text per `docs/radar/index-analysis.md` §8.
  Keyboard: each point is a button.
- **A5 personal summary:** research signals for the user's linked axes, each sentence with its source link. No job
  predictions.
- Exposure (ILO/OECD) and AI usage (Anthropic) are not shown in Round 1.

### 11.4 Skills & Careers tab (Round 1)

- **B1 "Change in share of Malaysian online job advertisements":** diverging bars in pp with text labels (never colour
  alone); click → evidence panel (shares, counts, quarters, publication date, rule text, breaks, links). While
  comparisons are insufficient: latest shares and counts, the status "Insufficient comparable evidence" with the
  reason ("A possible structural break in 2025 Q3 makes year-on-year comparison unreliable until it is reviewed or
  until 2026 Q3 data arrives"), and DOSM's quarter-on-quarter total change labelled "context only".
- **B2 skills:** three labelled columns kept apart: Direct skill demand (insufficient evidence, explained), Derived
  proxy (not produced, explained), AI research momentum (the six axes, labelled research, not hiring).
- **B5 field explorer** limited to the user's fields by default: linked jobs (official crosswalk), their DOSM groups
  (group-level), linked AI axes (approved only), each with paths and links.
- **B6 summary:** what changed for the user's fields and roles, with links; "Continue to My Career Matches" leads to
  the existing next-module placeholder.

### 11.5 Evidence panel (every number)

Source name and link(s), official names and ids, observation period, publication date, fetch time, manifest and
snapshot ids, metric and unit, values, formula with the numbers filled in, thresholds used, breaks and reviews,
revisions, mapping path, limitations. Every factual item has a reference link (D3).

### 11.5a Tab order and look (D21, D22)

Skills & Careers is the first tab and opens by default; AI Impact is second. All Radar, admin and judge screens
reuse `public/styles.css` (tokens `--bg`, `--surface`, `--accent`, `--src`, `--calc`, `--est`, `--ok`, `--bad`,
its light/dark themes and classes `.card`, `.tag`, `.btn`, `.tabs`) and add only Radar-specific classes built on
those tokens. Chart colours come from the same tokens, with text labels as before.

### 11.6 Mockup first

`docs/mockup-radar.html` is updated to this spec (D2 own fields + "View all", evidence links, k = 20 radar, pp bars,
insufficient-comparable state, admin and demo screens, EN/BM/中文) and approved by the owner before screen code.

### 11.7 Languages

Every UI text through `t(lang, key)`, keys in `en.js`, `ms.js`, `zh.js` (`tests/i18n.test.js`). Source names stay as
published (OpenAlex titles; DOSM English names, with DOSM's Malay names where the workbook gives them). Friendly
labels and reasons are translated; translations are marked for owner review.

## 12. Answer-state model

Each source in each answer carries five separate dimensions:

| Dimension | Values |
|---|---|
| availability | `data`, `no_records`, `unavailable` |
| freshness | `current`, `stale` (OpenAlex: no successful check for 14 days; DOSM: 14 days past the next expected release without import) |
| refreshHealth | `ok`, `failed` (+ code), `never_run`, `not_configured` |
| servedFrom | `active_manifest` (R2), `bundled_read_only`, `cached_fallback` (last good after a failed refresh) |
| comparability / evidence | per signal: `evidenceSufficiency`, `evidenceQuality` |

So "stale, cached and the last refresh failed, data still shown" is one valid combination. The screen shows each with
its dates and a plain explanation.

## 13. API

| Route | Access | Purpose |
|---|---|---|
| `GET /api/radar/manifest` | public | active manifest id, source states |
| `GET /api/radar/sources` | public | source registry, links, policies, states |
| `GET /api/radar/ai/topics?manifest=` | public | axes, series, momentum, signals |
| `GET /api/radar/occupations?manifest=` | public | DOSM groups: shares, counts, signals, context indicator |
| `GET /api/radar/references` | public | bridge, approved field ↔ topic links, ISCED-F names (for relevance) |
| `GET /api/radar/signals/:id?manifest=` | public | full evidence for one signal |
| `GET /api/radar/export` | public | `radar-signal/v1` bundle for Matching |
| `POST /api/radar/session` | key | admin or demo login |
| `POST /api/radar/logout` | session | end session |
| `GET /api/admin/radar/status` | admin | ingestion log, orphans, conflicts |
| `POST /api/admin/radar/refresh/:source` | admin | real refresh |
| `GET/POST /api/admin/radar/mappings` | admin | list / decide field ↔ topic proposals |
| `GET/POST /api/admin/radar/breaks` | admin | list / review possible breaks |
| `GET /api/admin/radar/export` | admin | approved mappings and reviews as JSON |
| `POST /api/demo/radar/apply` | demo | apply a synthetic change (scenario A or B) |
| `GET /api/demo/radar/diff` | demo | before/after report |
| `POST /api/demo/radar/reset` | demo | restore the synthetic base |

Errors keep the app's shape `{error:{code,message,retryable}}`. New codes: `openalex_key_missing`,
`openalex_rate_limited`, `openalex_auth_failed`, `source_unavailable`, `dosm_dataset_missing`,
`dosm_layout_unexpected`, `validation_failed`, `periods_removed`, `publish_conflict`, `store_unavailable`,
`not_configured`, `not_allowed`, `csrf_failed`, `demo_expired`, `demo_full`, `manifest_gone`.

## 14. Privacy and logging

The Radar server never receives profile data. Logs hold source, operation, error code, time and ids only — no keys,
cookies, CV text or personal fields. Admin labels are not personal data beyond what the owner enters.

## 15. Test plan (Vitest, test first; existing 232 tests must stay green)

**Pure engine (`tests/radar/*.test.js`)**
1. Momentum: worked values (2× → 70, 0.5× → 30, 5.7× → 100 capped), all zero/missing cases, share view.
2. OpenAlex trend: each rule on the real six series (expected results from `threshold-analysis.md` §7), thresholds
   exactly at the limits, Emerging with B = 0, volatility formula against the T10028 example (18.0).
3. DOSM: shares and pp from the real workbook values; Technicians 2025 Q2 → Mixed; Clerical 2025 Q2 → Declining;
   Professionals 2026 Q2 → insufficient comparable evidence; Elementary → new reporting category; volatility 0.85.
4. Breaks: flags exactly 2020 Q2, 2020 Q3, 2021 Q3, 2025 Q3 on the real totals; review applies only to the matching
   observation hash; changed observations reopen the flag.
5. Validation: each reject code; legitimate revision accepted and listed; DOSM total ≥ sum of groups.
6. Diff: new vs revision vs removed; identical content after repeated fetch → "no new data".
7. Dependency report: deterministic (same inputs → byte-identical), group-level marking, approved-only field links.
8. Contract: every produced signal validates; no score/weight/rank fields; evidence links present on every signal.
9. Relevance: own fields only by default; several fields; interest areas not linked; no profile → global.

**Sources and storage**
10. xlsx reader on the real DOSM workbook: cell addresses, shared strings, merged year headers, "-" values, empty
    cells; Technicians Q2 2026 = 86,512 (the cell a positional reader got wrong); unexpected layouts rejected.
11. Missing `OPENALEX_API_KEY` on a deployed refresh.
12. OpenAlex 429 and invalid-key responses; network timeout; active manifest unchanged after each.
13. DOSM release page existing without a valid dataset.
14. DOSM unexpected workbook layout.
15. Valid historical revisions in a new snapshot.
16. Identical normalised content after repeated fetch.
17. Incomplete snapshot writes (failure after snapshot, after signals, before activation) → active unchanged,
    orphans reported.
18. Concurrent conditional publication → one wins, the other gets `publish_conflict`.
19. R2 unavailable → bundled read-only fallback with correct states.
20. R2 client `list` and conditional `put` with a fake (request signing and headers).

**Access and demo**
21. Expired judge session after a simulated restart or sleep (expiry from stored `expiresAt`).
22. Repeated and unauthorised demo mutations (no session, wrong role, bad CSRF, rate limit).
23. Attempted demo-to-production storage access (keys outside `demo/<id>/`) refused.
24. Missing secrets → fail closed; key rotation ends old sessions; constant-time compare.
25. Scenario A changes a classification exactly as computed by hand; Scenario B raises a possible break; reset
    restores the base; production manifest unchanged throughout.

**States and screens**
26. Simultaneously stale, cached and source-failure states reported together.
27. Deterministic dependency reports for the same input and calculation versions.
28. i18n: every new key in en/ms/zh; every interpolated value through `esc()`.
29. Screen tests (render functions): evidence link on every number; "View all" only at the bottom; insufficient
    comparable message with reason; "context only" label on the DOSM total change.

**Browser acceptance (on `127.0.0.2:3200`, desktop and 360 px, EN/BM/中文)**: own-fields default and View all; radar
drill-down; DOSM interim display; admin approve/reject; break review; judge scenarios A and B with reset; keyboard use.

## 16. Deployment notes (documentation only — nothing deployed or paid without approval)

`docs/radar/deploy.md` will cover: one Node 24 instance, `npm start`, `TRUST_PROXY=1`; secrets
(`RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`, `RADAR_SESSION_SECRET`, `OPENALEX_API_KEY`, `R2_*`); R2 layout and backups
(export of `prod/` manifests, snapshots, reviews; committed exports of approvals); recovery (point `active.json` at a
previous manifest; restore from bundled data). Host prices are checked and put to the owner before any choice.

## 17. Owner actions needed (Round 1 can be built and tested without them; they unlock live use)

1. Download the two BLS crosswalk files in a browser (SOC 2010↔2018; ISCO-08↔SOC 2010) into `data/radar/source/`.
2. Provide or confirm an official source that MASCO 2020 major groups match ISCO-08 major groups (else that step stays pending).
3. R2 settings (free allowance) for deployed state and the real-R2 check of conditional writes.
4. A free OpenAlex API key for deployed refreshes.
5. Review the field ↔ topic proposals and the 2025 Q3 (and other) possible breaks in the admin screen.
6. Approve the updated mockup before screen code.
