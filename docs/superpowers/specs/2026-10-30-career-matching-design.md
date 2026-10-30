# Career Matching — Design

Date: 2026-10-30 · Branch `claude/career-matching` (from `main` at `b24660e`) · Status: approved in brainstorming
(5 parts), waiting for written-spec review.

Inputs: Aiversecity Domain 1 Finalist Guide (must-haves 3 "Future-role matching", 5 "SDG mapping", 6 "Handling
uncertainty"; technical expectations "Explainable scoring", "Grounding and guardrails", "Scenario model", "SDG mapping
method", "Robustness"); the owner's screenshots of the old matching screen (**look only**); the owner's "How Fit Is
Worked Out" chart (maths and chart); `HANDOVER.md` on `main`; Radar contract `docs/radar/contract.md`.

**No scoring method from the old project.** The old screens are a layout reference only. Their weights (0.8 / 0.6),
70% ready line, 60% Moderate factor and bge-m3 "AI fit" are not used.

Architecture diagram: `docs/architecture-matching.html` (owner approves it; it then binds the build).

## 1. Goal and success

A user with a confirmed profile sees Malaysian eMASCO roles ranked inside clear bands, each with:

- a **Skill Match %** whose reason fits in one sentence ("You meet 9.2 of 12.1 needed levels for Software
  Developers, so fit is 76%") and a You vs Needed chart;
- **what would raise it** (the items with the biggest gaps, in points);
- a **job outlook** for the chosen AI scenario (Moderate / Rapid), as separate sourced parts, never blended;
- **SDG tags** with one-line reasons (owner-approved only), and an SDG contribution for the role the user chooses.

Success: judges can ask "why this score, and what would raise it?" and read the answer on the card; switching the
scenario or changing the trend data visibly moves roles between bands with a banner saying what moved; every number
names its source and date; a role with no official data says so instead of guessing.

## 2. Decisions (owner, 30 Oct)

| # | Topic | Decision |
|---|---|---|
| M1 | Old screenshots | Layout and sections only; new maths |
| M2 | Roles shown | eMASCO (MASCO 2020), 1,766 roles, with description, tasks, skill sentences and qualification |
| M3 | eMASCO data | Both: copy the team's 23 Oct 2026 crawl now (data only) **and** write a new crawl script for refreshes |
| M4 | Link to skills | **Official code chain** only: eMASCO → ISCO-08 → SOC 2010 → SOC 2018 → O\*NET-SOC 2019. No AI or word linking |
| M5 | Requirements | O\*NET **skills + knowledge** that O\*NET OnLine lists for the job (importance ≥ 3.0). Software, work styles and work activities are shown as "also asked for this job", not counted |
| M6 | Skill Match maths | **Levels met ÷ levels needed** (owner's chart) |
| M7 | User level | basic = 2, good = 4, expert = 6 on O\*NET's level scale (its anchor points); "Not assessed yet" counts as meeting the level and marks the score **provisional** |
| M8 | Trends | Never in the Skill Match. A separate outlook, and the bands of the list |
| M9 | AI exposure | ILO WP140 (Rapid) + Anthropic Economic Index (Moderate) |
| M10 | Scope | Matching + scenarios + SDG mapping. Study plan stays "not available yet" |
| M11 | SDG links | Team draft at MASCO sub-major group level (≈43) and for the 68 O\*NET skills + knowledge items; pending until the owner approves each in `#admin` |
| M12 | Career interests | Not used in v1 (O\*NET marks the values "AI/Expert"; no official cut-off) |
| M13 | Diagram | Claude drafts `docs/architecture-matching.html`; the owner approves it |

## 3. Data

Every file is recorded in `data/SOURCES.md` (where from, date, licence), checked against a manifest SHA-256, and the
original is kept when it is small. Nothing is invented: a missing value stays missing and the screen says so.

| File | Content | Source | Notes |
|---|---|---|---|
| `data/emasco/role_details.json` | 1,766 roles: code, title, description, tasks, skill sentences (`basic`/`specific`), qualification, tags, page URL | Copied from the team's eMASCO crawl, English pages, fetched 2026-10-23 | Display only; not in the %. 46 "tasks only" and 2 "unparsed" pages are kept as such |
| (refresh) | Same shape, new date | `pipeline/fetch_emasco.py`, https://emasco.mohr.gov.my, `robots.txt` checked first | Writes a new dated file; never edits the copy |
| `data/onet/skills.tsv`, `knowledge.tsv` (+ `level` column) | O\*NET 31.0 Level (LV, 0–7) and its "Recommend Suppress" flag beside Importance | `pipeline/fetch_onet.py 31.0` (same zip as now) | Suppressed rows are not counted and the screen says so |
| `data/radar/occupation-bridge.json` (extend) | The steps already set up as `pending`: SOC 2018 ↔ 2010, SOC 2010 ↔ ISCO-08 (BLS), ISCO-08 ↔ MASCO 2020 | BLS crosswalk files saved by the owner in `data/radar/source/`; an official Malaysian source for MASCO 2020 ↔ ISCO-08 | `pipeline/fetch_radar_bridge.py` builds them; one bridge, used in both directions |
| `data/ai/ilo_wp140.tsv` | GenAI exposure per ISCO-08 4-digit occupation: mean score and ILO gradient | ILO Working Paper 140 (2025), its published data file | Licence and file URL recorded at fetch |
| `data/ai/aei_tasks.tsv` | Observed AI use per O\*NET task: share, and the split "AI does the task" (automation) vs "AI helps a person" (augmentation) | Anthropic Economic Index, its published dataset (release recorded at fetch) | Licence and release recorded at fetch |
| `data/sdg/targets.json` | 17 goals and 169 targets, official UN wording | UN Statistics Division SDG list | — |
| `data/sdg/links.json` | Team-draft links: `{id, kind: masco_submajor\|onet_element, code, target, reason{en,ms,zh}}` | Written for this project, labelled "team draft" | Owner decisions are stored like the Radar reviews; only approved links are used |

The Radar export (`radar-signal/v1`, read in-process from the active manifest) gives the DOSM major-group signals and
the O\*NET "in demand" lists. Matching reads it and never changes it.

## 4. The code chain (`shared/matching/chain.js`)

eMASCO `2521-03` → unit group `2521` (first four digits) → ISCO-08 `2521` → SOC 2010 codes → SOC 2018 codes →
O\*NET-SOC 2019 jobs. Each step carries `{system, code, version, source, sourceUrl, status}`, as the Radar bridge does.
Result per role: `{jobs: [O*NET codes], path, missingStep}`. A role whose chain breaks gets `missingStep` and **no
Skill Match**: "Skill Match not available: no official link for this role (missing: SOC 2010 → ISCO-08)". Until the
owner saves the BLS files and the MASCO ↔ ISCO-08 source is recorded, every role shows this, with the open step named.

## 5. Skill Match (`shared/matching/fit.js`, pure)

For one O\*NET job:

1. **Items** = its skills and knowledge with importance ≥ 3.0 (O\*NET OnLine's display rule: 50+ on its 0–100
   scale), not suppressed.
2. **Needed** level `N` = the job's O\*NET level (0–7) for the item.
3. **You** `Y` = 0 if the item is not in the profile; basic 2, good 4, expert 6; "Not assessed yet" → `Y = N`, and the
   result is `provisional: true`.
4. **Met** = Σ min(Y, N); **needed** = Σ N; **Skill Match = met ÷ needed × 100**, rounded to a whole number.
   Met and needed are shown to one decimal.
5. **What would raise it**: per item, gap = N − min(Y, N); points = gap ÷ needed × 100. Top 3 by points (ties by
   O\*NET element id). Missing → "Learn *X* to *level word* (+p pts)"; below → "Raise *X* from basic to good (+p pts)".
   The level word is the lowest of basic / good / expert that reaches N; when N > 6, it says expert still leaves a gap.

Per role: compute for every O\*NET job in its chain; the card shows the **best** (highest %, ties by O\*NET code) and
names the others. **Why this match** shows the sentence, the You vs Needed chart (O\*NET 0–7 scale, one pair of bars
per item), each item's importance, level and source, and the chain path.

Worked example (the owner's chart, used as a test): needed 2, 2, 2, 1.2, 2.85, 2 → 12.05 (shown 12.1); you 1.5, 2,
1.5, 1.5, 1.5, 1.5 → met 1.5 + 2 + 1.5 + 1.2 + 1.5 + 1.5 = 9.2; fit = 9.2 ÷ 12.05 = 76%.

**Thin profile**: no O\*NET skill or knowledge item in the profile → no percentages; "Add skills to see a Skill
Match". Profile items of other kinds (software, work styles, work activities) are listed as "not used in the %" and
shown against the job's "also asked" lists. Unknown ids are listed as "not used in matching".

## 6. Outlook, scenarios and bands (`shared/matching/outlook.js`, pure)

**Scenario parameter "AI adoption speed"** (labelled estimate):

- **Moderate AI = observed today**: Anthropic Economic Index over the job's O\*NET tasks — share of tasks with observed
  AI use, and of that use, the automation vs augmentation split. No data for the job → "no observed data".
- **Rapid AI = full potential**: ILO WP140 exposure for the ISCO-08 code, with ILO's gradient.

No invented factor. The scenario never changes the Skill Match.

**Outlook parts per role** (never blended):

- **Job ads**: DOSM signal `dosm:masco2020:<first digit>` — direction and evidence sufficiency, labelled "group level,
  not this job", with the path eMASCO code → first digit → MASCO 2020 major group.
- **AI in this job**: the scenario part above.
- **In-demand software**: O\*NET "in demand" flags for the best O\*NET job (US job ads, software only), ✓ when the
  profile has it.

**Bands** (per scenario; inside a band, Skill Match high to low, then title):

1. **Job ads growing or steady, AI mostly helps** — DOSM `rising` or `stable` with sufficient evidence, AI data present,
   band 2 rule not met.
2. **AI may change much of this job (this scenario)** — Rapid: ILO gradient in its top two; Moderate: observed AI use
   exists and more than half of it is automation. Not band 3.
3. **Fewer job ads** — DOSM `declining` with sufficient evidence.
4. **Not enough evidence yet** — everything else (DOSM insufficient or missing, or no AI data for the scenario).

Until the owner reviews the DOSM 2025 Q3 possible break, most groups are "insufficient", so most roles sit in band 2
or 4. That is shown honestly. When the scenario or the trend data changes, a banner lists the roles that moved band.

**Lists**: "In your field" first — roles whose O\*NET jobs are reached from the profile's field of study (ISCED-F →
CIP → O\*NET), or that match a past job or a role of interest (`employment.records[].occupation.code`,
`occupationMappings`). "Explore all roles" holds the rest. A role with no chain cannot be "in your field" through
O\*NET; it still appears when its eMASCO code matches a past job or role of interest.

## 7. SDG mapping (`shared/matching/sdg.js`, pure)

- Links come from `data/sdg/links.json`; **only owner-approved links** are used. A role takes the approved links of its
  MASCO sub-major group (first two digits); a skill or knowledge item takes its own. No approved link → "SDG not
  tagged yet".
- Each tag shows goal, target, the one-line reason and "team draft, approved by owner on <date>".
- **Choose this role** (saved in the guest store) sets the path. The **SDG contribution** counts approved links on the
  path: the role's links plus the links of the items still to learn or raise for its best O\*NET job. Shown per goal
  ("SDG 4: 2 links, SDG 8: 3"), every reason listed, labelled "potential, not measured". No impact score.
- **SDG filter** on the list ("roles linked to SDG 7") narrows what is shown; it never changes a Skill Match or band.
- Owner review in `#admin` (same keys and review store as the Radar): approve or reject each draft link.

## 8. Server and screen

- `POST /api/matching` `{profile, lang}` → for every role: code, title, URL, best O\*NET job, Skill Match (or the
  reason it is missing), provisional, in-your-field, band per scenario, SDG goals; plus sources and dates. The profile is
  validated, used and dropped: never stored or logged.
- `POST /api/matching/role` `{profile, code}` → the full card detail: items, chart data, raise list, chain path, outlook
  parts for both scenarios, also-asked lists, SDG tags.
- Matching reads the same Radar manifest the Radar screen uses, including a judge Trend Change Test session, so the
  change test moves bands.
- Screen `#matching`: scenario switch, SDG filter, source line; "In your field" then "Explore all roles"; four bands;
  role cards (title, code, eMASCO link, best O\*NET job, Skill Match or reason, provisional label, outlook parts, SDG
  tags, Why this match, Choose this role, "Study plan not available yet"); SDG contribution panel for the chosen role.
  Every list and number shows its source and date. EN / BM / 中文 strings (BM and 中文 marked "owner review").
  Works at 360 px.

## 9. Errors

One error shape `{error:{code, message, retryable}}`. Thin profile → no %. Broken chain → "not available" with the
missing step. Radar or AI data unavailable → last good snapshot with its date, or "not available"; the role falls into
band 4. A bad data file at start → clear start-up error naming the file. The page never crashes.

## 10. Testing

Test first (Vitest) for each unit; Python unit tests for each pipeline script with saved small fixtures.

- `fit.js`: the owner's chart example (12.05 needed, 9.2 met, 76%); missing, below-level, above-level (capped),
  not-assessed (provisional), suppressed rows, importance < 3 excluded, raise list order and points, N > 6.
- `chain.js`: full path; each missing step; one ISCO code to several O\*NET jobs; best-job choice and ties.
- `outlook.js`: each band in each scenario; insufficient DOSM; missing AI data; band-move banner list.
- `sdg.js`: only approved links; group inheritance; path count; filter.
- Routes: real app on a random port; profile never logged; thin profile; unknown ids.
- Browser check on `127.0.0.2:3200` (desktop and 360 px): scenario switch, why-this-match chart, choose a role, SDG
  panel, judge change test moves bands.

`npm test` before every commit; every step goes into the build record.

## 11. Owner actions and risks

- **Blocking the Skill Match**: save the two BLS crosswalk files (BLS blocks automated downloads) and name an official
  MASCO 2020 ↔ ISCO-08 source. Until then every role says "not available" with the missing step; the screen, bands,
  SDG and outlook still work where their own data allows.
- **SDG**: review the draft links in `#admin`.
- **Licences** of the ILO and Anthropic data files are recorded at fetch; if a licence does not allow reuse, that part
  shows "not available" and the owner is asked.
- **DOSM break review** (Radar open point) decides how many roles leave band 4.
- Out of scope: study plan and courses, career interests, HR view, any meaning or embedding model.
