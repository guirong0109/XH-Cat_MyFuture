# CLAUDE.md — branch `claude/future-radar` (Future Skills Radar)

Read `HANDOVER.md` first: it has the state, what the owner decided and what is next. This file holds the standing
rules and how to work here.

## Owner rules (always)
- **Follow the owner's decisions exactly.** The source of truth is the Round 1 spec
  (`docs/superpowers/specs/2026-10-30-future-radar-round1-design.md`, decisions D1–D22). Add nothing it does not state:
  no extra limits, features or screens.
- **No scoring or matching.** No Current Skill Match, Future Opportunity score, ranking weight, skills gap or ranked
  careers in this branch. Use no method from the previous project. Don't use `C:/Users/guiro/XH-Cat_Domain1` as a template.
- **No invented data or links.** No made-up OpenAlex ids, crosswalks or trends. Unsupported steps stay `pending` or
  `unmapped`; thin data says "Insufficient evidence".
- **Reviews are the owner's.** Never mark a field ↔ topic link or a structural-break review as approved yourself.
- **Every number and list shows its source with a working link** (owner: "highly important", D3).
- **Default view = the user's own fields only;** "View all" sits at the very bottom (D2).
- Ask before anything paid (state the price), before merges, pushes and PRs, and always before a force-push.
- **Branch docs:** this branch keeps detailed `HANDOVER.md` and `CLAUDE.md`; `main` keeps short ones. On a merge to
  `main`, put only the important points into main's files.
- Use plain words with the owner. The owner writes English, sometimes briefly.

## State
- Round 1 is built (plan tasks 1–21 done) and browser-accepted (`docs/radar/acceptance.md`: 28 of 28 pass after F1). Deployment notes: `docs/radar/deploy.md`. Nothing pushed, merged or deployed.
- Skill trends from O\*NET are built on top (spec `docs/superpowers/specs/2026-10-30-radar-skill-trends-design.md`, D23–D27;
  see `HANDOVER.md` "Skill trends").
- Charts that follow the confirmed profile are built (spec `docs/superpowers/specs/2026-10-31-radar-profile-charts-design.md`,
  D28-D33; `HANDOVER.md` "Profile charts"). 1483 Vitest tests and 49 Python tests pass.
- `main` was merged into this branch on 31 Oct 2026 (7f6763e); this branch kept its own detailed `HANDOVER.md` and `CLAUDE.md`.
- The "Your profile" card is removed from the Radar page (owner, 31 Oct 2026). Do not bring it back.
- The four source blocks (OpenAlex, DOSM, O*NET skill flags, Hot Technologies) are cards in the app look (owner, 31 Oct 2026):
  `.rd-srccard` (ink outline, 14px corners, paper, 4px offset shadow), two by two, one column at 640px or less.
  Availability is the tag at the top (green when data is available), named "Availability" for screen readers.
- **AI usage question (D34-D39):** the Radar asks "Which of these do you use AI for?" first (owner's 10 categories,
  `shared/aiTasks.js`, ids fixed). Stored as `profile.aiTasks`; only recorded, changes nothing, in no Radar request.
  Save it without `update()` so a confirmed profile stays confirmed.
- **AI tasks scatter (D40-D42):** the AI tasks chart is `taskScatter` (across = AI does the task %, up = usage share on a
  log scale, band under 0.01 %); no jitter, no safe/risky words. The skills chart stays a spider web (`profileRadar`).
- **Two tabs (D43-D48):** For You (`fy`: question card, then AI tasks scatter and A5) and Explore all trends (`ex`: A2 and
  A1, all six topics, no View all). `radarTabOf` opens `ex` for the goal `switch_career`, else `fy`. Sections SK, B1, B2,
  B5, B6 are off the page (code kept; `skillsTab`/`aiTab` are no longer called by `radarView`). Only the OpenAlex
  source is listed on the page.
- Mockup v2 approved 30 Oct with D21 (Skills & Careers tab first) and D22 (screens use `public/styles.css`).
- Any change beyond Round 1 (Round 2 visuals, Round 3 evidence, Matching) needs its own spec and the owner's approval.

## Data rules
- OpenAlex: count by `primary_topic`, complete calendar years, compare only inside one snapshot. Keep query URLs
  (never with the key), fetch time and topic `updated_date`.
- DOSM: read the workbook by **cell address** (a positional reader misread Technicians Q2 2026; the real value is
  86,512). Merged year headers fill to the right; "-" is not available. Keep the original workbook and its hash.
- New data needs a `data/SOURCES.md` entry (where from, date, licence) and a hash.
- BLS files block automated download: never work around it. The owner downloads them.

## Skill trend rules (D23–D27; D27 replaced by D29, see below)
- Every skill item carries both labels: "US job ads (Lightcast via O\*NET), not Malaysian" and "Software and technology skills only".
- **D25:** compare a release with the most recent earlier release whose flags differ; show both release numbers.
- **D26:** only changes become signals; "still in demand" lists are reference data.
- **D27 (replaced by D29 on 31 Oct):** never invent a word-matching crosswalk; eMASCO reaches O\*NET only by the official code chain.
- Hot Technologies (`onet-hottech`): `direction: null`, reason `first_snapshot` while one counting window exists. The rule for
  two windows needs the owner's decision (D24); add no threshold.
- The 13 MB release zips are never committed; keep URL and SHA-256 in `data/SOURCES.md`. Keep the Hot Technologies original.
- The user's jobs and skills are matched in the browser; nothing personal goes to the server or the logs.

## Profile chart rules (D28-D33)
- Only a confirmed profile counts (`profileStatus === 'confirmed'`); no profile data goes in any request.
- **D29 replaces D27:** eMASCO roles reach O*NET only through the official code chain (MASCO 2020 → ISCO-08 → SOC 2010 → SOC 2018 → O*NET).
  Name every step with its source; a broken chain says "not available" and names the missing step. Never match by words.
- Corners: 8 by default, ordered by value (highest first, ties by name); the switch gives 16, 30, All. The list number is shown, never stored.
- Skills chart value = 2025 US job ads (Hot Technologies). AI chart value = share of the task's conversations where AI does the task.
  Both are "not a score"; AI chart is "how AI is used today, not a forecast of jobs lost". No key named score, weight, rank, match or opportunit.
- **Copied from `main` d4286d6 (D32); all byte-identical except `shared/radar/chain.js` and `tests/radar/chain.test.js`, where only the header line and the import path changed:** `shared/radar/chain.js`, `tests/radar/chain.test.js`,
  `data/radar/occupation-bridge.json`, `data/radar/source/ISCO_SOC_Crosswalk.*`, `data/radar/source/soc_2010_to_2018_crosswalk.xlsx`,
  `pipeline/fetch_radar_bridge.py`, `pipeline/tests/test_radar_bridge.py`, `data/onet/tasks.tsv`, `data/ai/*`. Hashes: `data/radar/copied-from-main.json`.
  Do not edit them here; change them on `main` and copy again. The data and script files are identical on both sides. On a later merge `chain.js` and its test sit at new paths (`shared/radar/`, `tests/radar/`) beside `shared/matching/chain.js`, so `main` will hold a second copy of the walker: a clean-up point for the owner at merge time.
- `/api/radar/ai-tasks` is reference data (no manifest, no parameters), not signals.
- Colours in the new chart component: CSS variables only (`--accent` skills, `--est` AI).

## Conventions (same as the rest of the app)
- **Test first** (Vitest): failing test, watch it fail, implement, run the whole suite. Real servers on port 0.
- Pure calculations live in `shared/radar/`; no I/O there. Server code in `server/radar/`.
- One error shape: `{error:{code,message,retryable}}`.
- Every UI text through `t(lang, key)`, in `shared/strings/en.js`, `ms.js` **and** `zh.js`; HTML values through `esc()`.
- Browser storage only through `safeLocalStorage()`.
- Never log keys, cookies, CV text or personal fields. Only codes, ids and times.
- Commits: small, `feat:` / `fix:` / `docs:`, no attribution lines.
- Record every step in `docs/record/status.json`, then `python docs/record/build_record.py`.
- Heredocs break on apostrophes here: write helper scripts with the Write tool and run them with python.

## Commands
```bash
npm install
npm test                                           # expect 1483 passed (vitest.config.js skips helper worktrees)
python -m unittest discover pipeline/tests         # expect 49 OK
npm start                                          # http://localhost:3200, Radar at #radar (bundled data, read-only)
node scripts/radar-bootstrap.mjs                   # rebuild data/radar/bundle/ (OpenAlex and Hot Technologies live, DOSM from the kept workbook); releases already active are skipped; RADAR_BUNDLE_DIR=<copy> targets another folder
ONET_ZIP_DIR=<dir with db_30_2.zip db_30_3.zip db_31_0.zip> node scripts/radar-bootstrap.mjs   # O*NET zips read locally, not downloaded
python pipeline/fetch_radar_bridge.py              # rebuild data/radar/occupation-bridge.json
python -I docs/radar/index_analysis.py <out.json>  # re-fetch OpenAlex and recompute the index analysis
python -I docs/radar/threshold_analysis.py <DOSM xlsx> <openalex cache json>   # threshold calibration
python docs/record/build_record.py                 # docs/record/status.json -> docs/build-record.html
```
Local admin and judge: set `RADAR_STORE=memory`, `RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY` (different values) and
`RADAR_SESSION_SECRET` (32+ characters) in the shell or an uncommitted `.env`. Never write keys into tracked files,
reports or chat. `RADAR_STORE=memory` is development only (refused with `NODE_ENV=production`).

Browser pane: `record` (8766) serves `docs/` (mockups, build record); `cvmodule` (3200). Test the app on an address
nobody else uses (e.g. `127.0.0.2:3200` or `radar.localhost`).
