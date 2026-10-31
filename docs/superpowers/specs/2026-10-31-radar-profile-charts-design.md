# Future Skills Radar — charts that follow your profile (design)

Status: approved in conversation by the owner on 31 Oct 2026 (sections 1–3 and the mockup). Branch
`claude/future-radar`. Builds on `2026-10-30-future-radar-round1-design.md` and
`2026-10-30-radar-skill-trends-design.md`; everything there still applies unless this document says otherwise.
Mockup (real numbers, not the screen): `docs/radar/mockup/role-skill-chart.html`.

## 1. Why

The owner's request (31 Oct 2026): the Radar must show trends specific to the user's own roles, jobs and field, with a
**different chart shape for different profiles**, not the same chart for everyone. Today both Radar charts have the
same six corners (AI research topics) for every user; the profile only changes which corners are highlighted. The
owner's sample picture (a six-corner chart, solid line and dashed line) is a layout reference only: the app keeps its
own colours.

## 2. Decisions

| # | Decision |
|---|---|
| D28 | **Skills chart.** Corners = the in-demand software skills (O\*NET In Demand flag, latest flag release) of the user's own jobs; value = 2025 US job ads asking for the skill (O\*NET Hot Technologies page). Different jobs give different corners. |
| D29 | **eMASCO roles reach O\*NET only through the official code chain** eMASCO → MASCO unit → ISCO-08 → SOC 2010 → SOC 2018 → O\*NET (the chain Career matching uses). Every step is named on screen; a broken chain says "not available" and names the missing step. **Replaces D27.** The chain works at the 4-digit MASCO unit, so all eMASCO roles in one unit give the same chart; the screen says so. |
| D30 | **Corners:** 8 by default, ordered by the chart's value (highest first, ties by name). A switch shows 16, 30 or All; a numbered list (1, 2, 3…) under the chart holds every item, with a search box. The number is a list position shown on screen, never a stored field. |
| D31 | **AI Impact follows the profile.** Its first chart's corners = the O\*NET tasks of the user's job that appear in the Anthropic Economic Index; value = the share of that task's conversations where AI does the task (automation); the rest is AI helping (augmentation). Each job also shows its ILO WP140 generative-AI exposure gradient. The six-topic research chart stays, below it, showing only the topics linked to the user's field (owner-approved links) by default, with "View all six topics" at the bottom. |
| D32 | **No merge of `main`** (owner, 31 Oct). The files these charts need are copied from `main` unchanged (§3), with their hashes checked against `main`'s manifests. |
| D33 | Both charts are counts and shares from their sources, labelled "not a score"; the AI chart is labelled "how AI is used today, not a forecast of jobs lost". No score, weight, rank or match field anywhere. |

## 3. Data

Already on this branch (no change): O\*NET flag snapshots 30.2 / 30.3 / 31.0, the Hot Technologies 2025 snapshot,
ISCED-F → CIP → O\*NET field jobs.

Copied from `main` byte for byte (D32). They are already listed in `main`'s `data/SOURCES.md`, and those rows are copied
too:

| File | What | Source |
|---|---|---|
| `data/radar/occupation-bridge.json` (+ its BLS originals in `data/radar/source/`) | the full code chain, incl. `masco2020_unit_to_isco08` and the inverted BLS steps | BLS crosswalks, O\*NET crosswalk, eMASCO; built by `pipeline/fetch_radar_bridge.py` |
| `shared/matching/chain.js` → copied as `shared/radar/chain.js` | the pure chain walker `makeChain(bridgeFile).resolve(emascoCode)` | `main` code; same tests copied |
| `data/onet/tasks.tsv` | O\*NET 31.0 task statements per job | O\*NET 31.0, CC BY 4.0 |
| `data/ai/aei_tasks.tsv`, `data/ai/manifest.json` | Anthropic Economic Index per O\*NET task: usage share, automation share, augmentation share | Anthropic/EconomicIndex `release_2026_06_26` (claude.ai, Apr–May 2026), CC-BY |
| `data/ai/ilo_wp140.tsv` | ILO WP140 exposure per ISCO-08 code: mean task score, gradient | ILO Working Paper 140 (2025), CC BY 4.0 |

A test checks each copied file's SHA-256 against `main`'s manifest values. On a later merge the files are identical, so
they cause no conflict.

## 4. Skills chart (Skills & Careers tab, new first card)

Title: "Skills your jobs ask for", tag "US job ads · O\*NET".

1. **Your jobs:**
   - your O\*NET roles;
   - the O\*NET jobs of your field of study (official ISCED-F → CIP → O\*NET tables, as today);
   - your eMASCO roles through the chain (D29).
   Only a confirmed profile counts; without one the card asks you to confirm your profile.
2. **Skills:** the union of your jobs' in-demand skills at the latest flag release, i.e. `kept` + `added` from
   `/api/radar/skills`. Each skill appears once, matched by `skillId` (`onet:tech:<nameKey>`). Each skill lists which of
   your jobs brought it in and how (role / field / chain).
3. **Value:** the 2025 US job-ad count from the Hot Technologies snapshot, matched by the same `nameKey`. A skill with no
   count is not a corner; it goes to the end of the list as "no US ad count".
4. **Scale and drawing:**
   - log scale, with rings labelled 10k, 100k and 1M ads; the edge is 5M;
   - a skill `added` in the latest release is drawn as a hollow point labelled "new";
   - skills `dropped` from your jobs are listed under "No longer in demand (30.2 → 30.3)" and never drawn;
   - a dashed earlier-year line is drawn only when a second yearly Hot snapshot exists. Until then the note says "one
     year so far".
5. **Few or no skills:**
   - fewer than 3 corners → bars;
   - no skills for a job → "O\*NET lists no in-demand software for <job> (O\*NET database <release>)";
   - a broken chain → "not available" and the missing step.
6. **Corners and list:** D30. Each list row shows its number, name, "new" mark, the jobs it came from, the count with its
   source link, and the year. Clicking or pressing Enter on a corner jumps to its row.
7. **Source line:** O\*NET database release (In Demand flags) · O\*NET Hot Technologies (US job ads, window, Lightcast
   via O\*NET) · CC BY 4.0 · "US data, not Malaysian · software skills only · a count of job ads, not a score".

The existing B2 column ("Skills in job ads (US, O\*NET)") stays as it is.

## 5. AI Impact tab

**First card: "How AI is used in your jobs' tasks"**, tag "observed use · Anthropic Economic Index".

1. **Your jobs:** the same as §4.1. With several jobs, a job switch picks one; the first job is shown first.
2. **Exposure line:** the job's ILO WP140 gradient and mean task score for each ISCO-08 code, with the ILO link.
   - O\*NET jobs get their ISCO-08 code by walking the bridge forward (O\*NET → SOC 2018 → SOC 2010 → ISCO-08).
   - eMASCO roles use the chain's ISCO code.
   - No ISCO code → "not available".
3. **Corners:** the job's O\*NET tasks that appear in `aei_tasks.tsv` (matched by Task ID). They are ordered by usage
   share, then automation share, then task text. Labels are T1, T2… with short text; with more than 10 corners, only the
   number is shown.
4. **Value:** the automation share, 0–100 %, on a linear scale. Rings are at 25 / 50 / 75 / 100 %, and the 50 % ring is
   dashed ("half and half").
5. **List:** T-number, full task text, "AI does it x % · AI helps y % · z % of all conversations" (a usage share under
   0.01 is shown as "under 0.01 %"), and the source link. The note above it says "<n> of <total> O\*NET tasks of this job
   appear in AI conversations".
6. **Few or no tasks:**
   - fewer than 3 tasks → bars;
   - none → "None of this job's <total> O\*NET tasks appear in the AI conversations data";
   - a broken chain → "not available" with the missing step.
7. **Corners switch:** 8 / 16 / All (D30).
8. **Source line:** Anthropic Economic Index (release, data months, CC-BY) · ILO WP140 (DOI, CC BY 4.0) · "how AI is
   used today, not a forecast of jobs lost, and not a score".

**Second card: the existing six-topic research chart.**
- It shows only the topics linked to your field (owner-approved links) by default.
- With no approved link it says so and shows all six.
- "View all six topics" is at the bottom.
- The AI research-paper lines (A1) and research signals (A5) stay below it, unchanged.

## 6. How the data reaches the browser

The profile never leaves the browser (Round 1 §11.2); all relevance is worked out there.

- `/api/radar/skills` already sends the per-job flags and counts.
- `/api/radar/references` gains:
  - `bridge`: the full chain file (it already sends the bridge);
  - `emascoChain: true`, so the browser knows the chain steps are present.
- **New `GET /api/radar/ai-tasks`** (no parameters, the same for everyone, cached by manifest).
  - **Payload:** `{ release, tasks: [{ taskId, code, text, usage, automation, augmentation }], ilo: [{ isco, title, mean, gradient }], sourceLinks, fetchedAt }`.
  - **Size:** only the 2,710 tasks that have AI data (647 jobs, about 0.4 MB before gzip).
  - The browser fetches it only when the AI Impact tab opens.

## 7. Code

- **Engine** (`shared/radar/profileCharts.js`, pure):
  - `skillCorners(jobs, skills)` → `{ items, dropped, noSkills, broken }`;
  - `taskCorners(job, aiTasks)` → `{ items, total, ilo }`;
  - `profileJobs(relevantItems, refs, chain)` → the job list of §4.1, with how each was reached.
  - No I/O, no score keys.
- **Chain:** `shared/radar/chain.js` (copied, D32). `shared/radar/bridge.js` gains `iscoOf(onetCode)` (forward walk).
- **Server:**
  - `server/radar/aiTasks.js` loads the two TSVs and the tasks file once at start and checks their hashes.
  - `routes.js` adds the route.
  - Errors use the Radar error shape; if the files are missing → `state: 'unavailable'`, and the card says "AI task
    data not available".
- **Charts:**
  - `public/js/components/charts/profileRadar.js` is one radar component for both cards. It takes a scale (`log` or
    `linear`), ring labels and a "new" mark, and keeps the bar fallback. It uses app colour tokens only: `--accent` for
    skills, `--est` for AI.
  - The momentum `radarChart.js` stays for the six-topic card.
- **Screen** (`radar.js`):
  - the new card on each tab;
  - UI state `radar.corners.{sk,ai}`, `radar.q`, `radar.aiJob`;
  - the AI tab's existing topic chart gets the "own topics by default" filter.
- **Strings:** en / ms / zh; ms and zh are marked "translation: owner review".

## 8. Errors

| Case | Screen |
|---|---|
| No confirmed profile | The card asks to confirm the profile (button to the form) |
| Skills or AI data unavailable | "Not available" with the source name; the rest of the tab still works |
| Job with no listed skills / no AI tasks | The plain message from §4.5 / §5.6, with the source and release |
| eMASCO chain broken | "Not available" plus the missing step, in the user's language |
| Search finds nothing | "No skill matches this search" |

## 9. Tests (written first, Vitest)

1. **Different profiles, different shapes.**
   - Software Developers (15-1252.00) and Accountants (13-2011.00) give different corner sets.
   - Accountants give exactly 6 skills, incl. Microsoft Excel 3,211,598 and Intuit QuickBooks 174,071.
   - On the AI tab, the two give different task corners (8 of 17 tasks and 11 of 30 tasks).
2. **Only your own items:**
   - no skills or tasks from jobs you did not choose;
   - no confirmed profile → no chart.
3. **Order and list:**
   - by value, then by name;
   - default 8; 16 / 30 / All work;
   - search is case-insensitive and finds part of a name;
   - no-count skills go last and are never corners;
   - the list numbers follow the order.
4. **Merging and marks:**
   - a skill from two jobs appears once and names both jobs;
   - an `added` skill gets the "new" mark;
   - a `dropped` skill appears only in "No longer in demand".
5. **Edge cases:**
   - Registered Nurses (29-1141.00): no skills message; 2 AI tasks → bars; ILO "not exposed";
   - eMASCO 1121-01: chain breaks at MASCO 1121, missing step named;
   - eMASCO 2512-02 reaches 15-1252.00 and 15-1253.00, with the steps listed;
   - dashed line hidden with one Hot snapshot, drawn with two.
6. **Rules:**
   - no score / weight / rank / match / opportunit keys in engine output or the new route;
   - every row and chart has a source link and a date;
   - charts use CSS variables only (no fixed colours);
   - corners are keyboard buttons with text labels;
   - no request carries profile data (the new route has no parameters).
7. **Data:**
   - copied files match `main`'s SHA-256;
   - `data/SOURCES.md` lists them;
   - the copied chain tests pass.
8. **Browser check** (`127.0.0.2:3210`, light and dark, phone width with no sideways scroll):
   - profiles Software Developer, Accountant, an eMASCO role and Registered Nurse;
   - screenshots in the build record.

## 10. Docs

- `data/SOURCES.md`;
- `docs/radar/contract.md` (the new route is reference data, not signals);
- D28–D33 in the Round 1 spec's pointer row;
- branch `HANDOVER.md` and `CLAUDE.md`;
- build record (`docs/record/status.json` → `python docs/record/build_record.py`).
