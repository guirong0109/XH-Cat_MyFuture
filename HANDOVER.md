# HANDOVER — branch `claude/future-radar` (Future Skills Radar)

Updated 31 Oct 2026 (`main` merged in; "Your profile" card removed). Branch made from `main` at 928f4a7. Nothing pushed or merged.

## Where things stand
- **Round 1 is built and checked in the browser.** All 21 plan tasks are done, each reviewed, plus a few integration
  fixes found on the way.
- **Skill trends from O\*NET are built** (9 tasks, spec `docs/superpowers/specs/2026-10-30-radar-skill-trends-design.md`,
  D23–D27; plan `docs/superpowers/plans/2026-10-30-radar-skill-trends.md`). See "Skill trends" below.
- **Charts that follow your profile are built** (31 Oct 2026, spec `docs/superpowers/specs/2026-10-31-radar-profile-charts-design.md`,
  D28-D33; plan `docs/superpowers/plans/2026-10-31-radar-profile-charts.md`). See "Profile charts" below.
- **31 Oct 2026, later:** `main` was merged into this branch (7f6763e, everything from main since the Radar charts merge:
  CV screens in the new design, Study Pathway, Career Matching, organisation view). This branch kept its detailed
  `HANDOVER.md` and `CLAUDE.md`. Then, on your request, the **"Your profile" card was removed** from the Radar page
  (its heading, the fields / jobs / interests columns, its note and its strings in EN, BM and 中文).
  Now **1426 Vitest tests** and **49 Python tests** pass (the numbers below are from before the merge).
- Tests (before the merge): **751 Vitest tests pass** (`npm test`, default workers, 61 files; the CV module's 232 are among them) and
  **14 Python tests OK** (`python -m unittest discover pipeline/tests`; the bridge script test copied from `main` is among them). Round 1 alone was 568; skill trends took it to 647.
- Browser acceptance (`docs/radar/acceptance.md`): **28 of 28 checks pass** after the F1 fix (a long DOSM
  link made Skills & Careers wider than a phone; source links now wrap, re-checked at 360 px in EN, BM and 中文).
  Small notes (N1–N6) are listed there for your judgement.
- Deployment notes: `docs/radar/deploy.md` (nothing deployed, nothing paid).
- Spec: `docs/superpowers/specs/2026-10-30-future-radar-round1-design.md` (D1–D22). Plan:
  `docs/superpowers/plans/2026-10-30-future-radar-round1.md`. Output contract for Matching: `docs/radar/contract.md`.

## What the Radar is (Round 1)
Two tabs, **Skills & Careers** (first, opens by default) and **AI Impact**, from two real sources:
- **OpenAlex:** research papers per year (2015–2025) for six approved AI topics, counted by `primary_topic`.
- **DOSM Big Data Analytics: Job Market Insights:** online job advertisements by MASCO major group, every quarter from
  2019 Q3 to 2026 Q2, read from the real Q2 2026 workbook.

It produces trend signals (`radar-signal/v1`) and the jobs, fields and skills they relate to. **No scores, weights or
rankings anywhere**: Matching is a later module. The screens use the app's own design (`public/styles.css`).

What a user sees:
- By default only things linked to their own confirmed profile (fields of study, jobs, roles of interest). "View all"
  sits at the very bottom of each tab. The profile never leaves the browser.
- Every number has its source and a working link; clicking a bar, row or radar point opens the evidence panel (values,
  formula with the numbers, rule, thresholds, breaks, versions, limitations, links).
- DOSM is in its interim state: the possible structural break at 2025 Q3 makes year-on-year comparison unreliable, so
  the screen shows the latest shares and counts, "Insufficient comparable evidence" with the reason, and DOSM's own
  quarter-on-quarter total change (−11.4%) marked "context only".
- Admin (`#admin`, needs the admin key): approve / reject / revise field ↔ topic proposals, review or annotate possible
  breaks, see the five states per source, the log, conflicts and orphans, start a refresh, export decisions.
- Judge (`#judge`, needs the judge key): Trend Change Test on synthetic data — Scenario A (a normal change) and
  Scenario B (a structural break), before/after report, Reset. Production data is never touched.

## How to run it locally
```bash
npm install
npm start                                   # http://localhost:3200 — public Radar at #radar, bundled data, read-only
npm test                                    # 1426 passed
python -m unittest discover pipeline/tests  # 49 OK
node scripts/radar-bootstrap.mjs            # rebuilds data/radar/bundle/ (OpenAlex and Hot Technologies live; DOSM from the kept workbook); on the committed bundle it skips O*NET releases already active; RADAR_BUNDLE_DIR=<copy> targets another folder
ONET_ZIP_DIR=<folder with db_30_2.zip db_30_3.zip db_31_0.zip> node scripts/radar-bootstrap.mjs   # reads the O*NET zips locally instead of downloading 13 MB each
```
To try admin and judge on your own machine, set these **in the shell or a local `.env` (never committed)**:
`RADAR_STORE=memory`, `RADAR_ADMIN_KEY=<any>`, `RADAR_DEMO_KEY=<a different value>`,
`RADAR_SESSION_SECRET=<32 or more characters>`. Every screen then says "Development store — not durable"; everything
is lost when the server stops. Test on an address nobody else uses (e.g. `127.0.0.2` or `radar.localhost`).

## Skill trends (O\*NET), added 30 Oct 2026
Software and technology skills that became, or stopped being, "In Demand" in US job ads, from O\*NET. Every skill item
says "US job ads (Lightcast via O\*NET), not Malaysian" and "Software and technology skills only".
- **Sources** (both in `data/SOURCES.md` with URL, date, licence CC BY 4.0 and SHA-256): O\*NET database zips 30.2
  (Feb 2026), 30.3 (May 2026) and 31.0 (Aug 2026), and the O\*NET OnLine Hot Technologies page (saved 30 Oct 2026,
  Lightcast US postings 1/25 to 12/25, 176 technologies, 46,885,153 postings in total). The zips are not kept; the page
  original is. 30.3 and 31.0 have the same skills file.
- **Comparison rule (D25):** a release is compared with the most recent earlier release whose flags differ; both release
  numbers are shown. So today the comparison is 30.2 → 30.3 and the screen says "unchanged in 31.0". Measured: 5 newly
  Hot technologies (Google Looker Analytics, Grafana Labs Grafana Cloud, Intuit TurboTax, Microsoft Power Platform
  software, Prometheus), none dropped; In Demand: 151 added, 219 dropped across all jobs.
- **Only changes are signals (D26):** the "still in demand" lists are reference data. **eMASCO jobs (D27):** "No official
  link to O\*NET: skill list not available"; no crosswalk is invented.
- **Signals** (`docs/radar/contract.md`): `onet:indemand:<code>:<example>`, `onet:hot:<tech>` (rising or declining, `limited`
  quality) and `onet:postings:<tech>` (counts, direction `null`, reason `first_snapshot`). New `evidenceKind`
  `skill_posting_flag`, units `flag` and `postings`, export `references.onetSkills`.
- **Routes:** `GET /api/radar/skills`; `/api/radar/sources` lists four sources; admin `POST /api/admin/radar/refresh/onet-skills`
  (body `{release}`) and `/onet-hottech` (`docs/radar/deploy.md` §5b).
- **Screens:** the Skills & Careers middle column is now "Skills in job ads (US, O\*NET)": per own O\*NET job, newly and no
  longer in demand (with "On your profile" when the skill is on the confirmed profile), still-in-demand collapsed,
  Hot Technologies became/no longer, and the posting counts with links to the Hot Technologies page. `#admin` has the two
  refresh rows; judge Scenario C changes one In Demand flag for Software Developers.
- **Code:** `shared/radar/onetSkills.js`, `server/radar/sources/onetSkills.js` and `onetHotTech.js`, `server/radar/ingest.js`
  (`refreshOnetRelease`), `server/radar/demo.js`, `public/js/screens/radar.js`.

**Open for you (skill trends)**
1. **Hot Technologies direction (D24):** the page has one counting window (2025). When the 2026 window appears, decide the
   rule that turns two counts into rising or falling. Until then direction is empty and no threshold exists.
2. Review the new Bahasa Melayu and 中文 texts (marked "translation: owner review").
3. **Bundle size:** the three `onet-skills` snapshots are about 10.8 MB (30.3 and 31.0 nearly the same). Say if you want
   them trimmed before deploying.
4. After deploying, restart judge sessions: sessions made before this change have no O\*NET data and Scenario C fails for them.
5. Small deferred reviewer notes are in `.superpowers/sdd/2026-10-30-radar-skill-trends/progress.md` (for example a
   two-digit minor release such as 30.10 is not accepted yet).

## Profile charts (D28-D33), added 31 Oct 2026
Both Radar charts now follow the user's **confirmed** profile (nothing from the profile is sent to the server).
- **Skills & Careers** opens with a radar of the in-demand software skills of the user's jobs (O*NET In Demand flag),
  valued by 2025 US job ads (O*NET Hot Technologies). 8 corners by default (highest first, ties by name); a switch gives
  16, 30 or All; a numbered list with a search box holds every item. The number is a list position shown on screen, never stored.
- **eMASCO roles (D29, replaces D27)** reach O*NET only through the official code chain MASCO 2020 → ISCO-08 → SOC 2010 →
  SOC 2018 → O*NET. Every step is named with its source; a broken chain says "not available" and names the missing step.
- **AI Impact (D31)** opens with a chart of the user's job tasks that appear in the Anthropic Economic Index (value = share
  where AI does the task; the rest is AI helping), plus the ILO WP140 exposure gradient per job. The six-topic research
  chart stays below, showing only the topics linked to the user's field, with "View all six topics" at the bottom.
- **D30 / D33:** counts and shares only, labelled "not a score"; AI chart labelled "how AI is used today, not a forecast of
  jobs lost". No score, weight, rank or match field.
- **Copied from `main`, not merged (D32):** the code chain (`shared/radar/chain.js`, `data/radar/occupation-bridge.json`,
  its source files and script) and the AI data (`data/ai/*`, `data/onet/tasks.tsv`) are copied from `main` commit
  d4286d6. All are byte-identical except `shared/radar/chain.js` and `tests/radar/chain.test.js`, where only the header
  line and the import path changed. Their SHA-256 hashes are in `data/radar/copied-from-main.json`. The data and script
  files are identical on both sides. On a later merge `chain.js` and its test sit at new paths beside
  `shared/matching/chain.js`, so `main` will hold a second copy of the walker: a clean-up point for the owner at merge time.
- **New data route:** `GET /api/radar/ai-tasks` (reference data, not signals; `docs/radar/contract.md`). The skills route rows
  now carry `skillId` and `postings.previous`; the references route has `emascoChain`.
- **Browser check** (31 Oct, `docs/radar/acceptance.md`, last section): Software Developer, Accountant, eMASCO 2512-02 and
  Registered Nurse profiles. Scope: 375 px in the light theme only; the dark theme on desktop only; Bahasa Melayu on the AI card
  only (the Skills card in BM and 中文 was not checked by hand). Search keeps focus.

### Open points for you (profile charts)
- Review the Bahasa Melayu and 中文 lines marked `// translation: owner review` in `shared/strings/ms.js` and `zh.js`.
- **eMASCO limit:** the chain works at the 4-digit unit, so all eMASCO roles in one unit show the same chart (the screen says so).
- ~~"Your profile" card hint~~: settled on 31 Oct 2026, the whole card is removed (your request).
- The dashed earlier-year line appears only once a second yearly Hot Technologies snapshot is served (today: "One year so far").

## Still needed from you (spec §17)
1. **BLS crosswalk files** (SOC 2010 ↔ 2018; ISCO-08 ↔ SOC 2010): done. They are copied into `data/radar/source/` and both
   BLS steps are built (`data/radar/occupation-bridge.json`). Nothing needed from you here.
2. **An official source that MASCO 2020 major groups match ISCO-08 major groups.** Without it that step stays pending
   and the screens say "Not mapped to a DOSM group yet".
3. **R2 settings** (free allowance) for deployed state, and the real-R2 check of conditional writes.
4. **A free OpenAlex API key** for refreshes on a deployed server.
5. **Review in `#admin`**: the 16 field ↔ topic proposals (all pending) and the possible breaks at 2020 Q2, 2020 Q3,
   2021 Q3 and 2025 Q3.
6. Mockup approval — **done** (30 Oct, with D21 and D22).
Also: review the Bahasa Melayu and 中文 texts (marked for owner review), and decide on the acceptance notes N1–N6
(F1 is fixed).

## Decisions taken during the build (plain words)
Each was a judgement call where the spec was silent or two parts pulled apart; all are reversible.
- **File name:** the occupation bridge is `data/radar/occupation-bridge.json` (the plan's name), not
  `occupation-groups.json` (the spec's). Same content.
- **New reporting category:** a DOSM group counts as "new" by the number of quarters with a positive count
  (Elementary's zeros in 2024 are not reports).
- **DOSM volatility** uses the clean values among the last four quarters only, without reaching further back.
- **Missing years** in a snapshot are refused; the OpenAlex fetch writes explicit zeros, so a quiet year is a 0, not a gap.
- **Explanations in signals:** each signal carries the rule text key with its numbers and the yearly steps (no score),
  so the screen can show "why".
- **Revisions** are counted against the previous snapshot only.
- **First start with R2:** the server copies the bundled data into `prod/` (checked), then serves it.
- **DOSM discovery** imports releases in order, one quarter at a time, each with its own evidence.
- **What the public sees of your decisions:** approved and rejected field ↔ topic links are public (so a rejection of a
  detailed field can override a broad approval in the browser); pending ones are visible only in `#admin`.
- **Same key for admin and judge** → both refuse to work (fail closed). Use two different keys.
- **During a possible break** the evidence panel shows the latest share and count and says "not compared"; it does not
  show the year-earlier share or the change.
- **Number display:** pp to 2 decimals, percent to 1, ratios to 2; missing values show "—".
- **Cleanup** never removes anything less than 10 minutes older than the active version (clock-difference safety
  margin, a technical setting, not a product limit).
- **Admin decisions** go through an exclusive lock, so two decisions at once cannot overwrite each other.
- **Gap fix after review:** the "Development store" banner now shows on every Radar screen, and the DOSM release titles
  from the release listing are kept as evidence for the break review (with real links to each release page).

## Known follow-ups (small items deferred by the reviewers; none blocks Round 1)
- **Screens and wording**
  - Bahasa Melayu and 中文: about 21 new lines need your review; some new keys lack the "owner review" marker; "pp"
    wording is not uniform in ms/zh.
  - DOSM link labels ("DOSM release page", "DOSM data file") stay English in BM and 中文; the data-file label is generic.
  - Rule texts: one reason says "year" where DOSM means a quarter; the Emerging rule text hard-codes two years;
    negative numbers print with a hyphen in some rule texts.
  - Evidence panel: Escape works even when the panel is off screen; focus returns to the first matching element; the
    tabs have no arrow-key movement; DOSM panel lacks the job mapping path rows; momentum shows 0 vs 1 decimal in
    places; very long chart labels can clip; line-chart end labels may overlap.
  - Admin/judge: the break listing link is the same archive page for every break; an empty title would show a raw URL;
    the browser repeats a DOSM URL pattern the server could send; small loading-spinner and empty-factor details.
- **Data and calculations**
  - OpenAlex: a 404 is treated as "try again later"; duplicate keys keep the last; a topic without an update date is
    left out of the date map.
  - DOSM reader: no size limits on merged cells or downloads; label column fixed at B; listing titles not
    HTML-decoded; a blank row ends the group list.
  - Pipeline: total/reference revisions are not attached to signals; baseline year comes from the momentum window;
    callers must validate signals (the pipeline can emit an invalid one).
  - Validation and diff: a few cases untested (nested fields, unit changes, label-only changes, unstable sort for
    duplicates).
  - Reference data: an approved and a rejected link at the same level depend on list order (the rejection should win);
    the BLS parsers are tested on synthetic files, and the real files are also covered by the bridge script test and
    the code chain tests (both BLS steps are built from the real files).
- **Storage, access and operations**
  - R2 signing: some rare characters and query ordering follow a simpler rule than AWS's; R2's 409 conflict code is not
    mapped; checked with a fake only until real R2 settings exist.
  - Sign-out ends a session only in the process that received it; limits and caches are per process (run one
    instance, see `docs/radar/deploy.md`).
  - Admin lists are not paged. (Field ↔ topic decisions now publish a new manifest and change `mappingVersion` to
    `<file version>+decisions:<decisions version>`.)
  - Originals are never removed by the cleanup (by design; documented).
  - Judge: session-limit check has a small race; fractional counts are accepted (signing out now wipes the demo
    session and frees its slot); the synthetic base contains one real DOSM link.
  - Ingestion: a lost response on a plain write is not recorded as an orphan; a pipeline exception is reported as
    `validation_failed`.
- **Docs**
  - Spec §4.4 bundle paths are out of date (the bundle mirrors the `prod/` layout under `data/radar/bundle/`).
  - The bootstrap script hard-codes the Q2 2026 release details and does not check the workbook hash against
    `data/SOURCES.md`.

## Evidence kept in the repo
- `docs/radar/index-analysis.md` (+ raw OpenAlex counts and script): why log2 with k = 20.
- `docs/radar/threshold-analysis.md` (+ scripts): DOSM shares, breaks, thresholds, volatility.
- `docs/radar/contract.md`: `radar-signal/v1` for Matching. `docs/radar/acceptance.md`, `docs/radar/deploy.md`.
- `docs/mockup-radar.html`: approved mockup v2.
- Original source files with SHA-256 in `data/radar/source/` and `data/SOURCES.md`.

## Things found that matter
- OpenAlex files most LLM papers under T10028, titled "Topic Modeling".
- Computer Science papers grew +64% in 2022–2025, so the share-of-CS view is offered separately.
- DOSM totals doubled in 2021 Q3 and 2025 Q3; at 2025 Q3 the release title also dropped "and My Job Profile"
  (evidence for the review, not a proven cause).
- DOSM's data file stops at nine major groups: no detailed job or skill trends from it (stated on screen).

## Repository
- `C:\Users\guiro\XH_Cat_Final`, GitHub `https://github.com/guirong0109/XH-Cat_MyFuture` (private).
- `main` is checked out as a worktree at `C:\Users\guiro\XH_Cat_Final-main`; merge there (only with your OK).
- Node ≥ 22.12 (built on 24.16.0), Python 3.
