# HANDOVER — branch `claude/future-radar` (Future Skills Radar)

Updated 30 Oct 2026. Branch made from `main` at 928f4a7. Nothing pushed or merged.

## Where things stand
- **Round 1 is built and checked in the browser.** All 21 plan tasks are done, each reviewed, plus a few integration
  fixes found on the way.
- Tests: **556 Vitest tests pass** (`npm test`; the CV module's 232 are among them) and
  **11 Python tests OK** (`python -m unittest discover pipeline/tests`).
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
npm test                                    # 556 passed
python -m unittest discover pipeline/tests  # 11 OK
node scripts/radar-bootstrap.mjs            # rebuilds data/radar/bundle/ (fetches OpenAlex live; DOSM from the kept workbook)
```
To try admin and judge on your own machine, set these **in the shell or a local `.env` (never committed)**:
`RADAR_STORE=memory`, `RADAR_ADMIN_KEY=<any>`, `RADAR_DEMO_KEY=<a different value>`,
`RADAR_SESSION_SECRET=<32 or more characters>`. Every screen then says "Development store — not durable"; everything
is lost when the server stops. Test on an address nobody else uses (e.g. `127.0.0.2` or `radar.localhost`).

## Still needed from you (spec §17)
1. **BLS crosswalk files** (SOC 2010 ↔ 2018; ISCO-08 ↔ SOC 2010): download them in a browser into
   `data/radar/source/`. BLS blocks automated downloads. Until then O\*NET jobs are not linked to DOSM groups.
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
    BLS parsers are tested on synthetic files only (the real files are not in yet).
- **Storage, access and operations**
  - R2 signing: some rare characters and query ordering follow a simpler rule than AWS's; R2's 409 conflict code is not
    mapped; checked with a fake only until real R2 settings exist.
  - Sign-out ends a session only in the process that received it; limits and caches are per process (run one
    instance, see `docs/radar/deploy.md`).
  - Field ↔ topic decisions do not change `mappingVersion`; admin lists are not paged.
  - Originals are never removed by the cleanup (by design; documented).
  - Judge: session-limit check has a small race; logging out does not free the session slot; fractional counts are
    accepted; the synthetic base contains one real DOSM link.
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
