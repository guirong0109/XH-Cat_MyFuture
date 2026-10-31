# HANDOVER — `main` (important points only)

Updated 2026-10-31. Every feature branch has a detailed `HANDOVER.md` and `CLAUDE.md`. Read those for the work in
that branch. This file keeps only what matters across the whole project.

## Goal
FutureReady MY is a career-planning app for Malaysia, built for the Domain 1 finalist round. A user builds a
**confirmed, structured profile** (from a CV or a form). Later modules use it: matching, study pathway, SDG and
scenario comparison.

## Modules on `main`
| Module | Branch (detailed docs there) | Merged | State |
|---|---|---|---|
| CV extraction and structured profile | `claude/cv-profile-module` | PR #1, `301c10e`, 2026-10-29 | Done; 179 tests pass; final review fixed |
| Search pickers, field of study, skill suggestions, career interests (owner requests) | `claude/cv-profile-module` | merge `05b72c9`, pushed 2026-10-30 | Done; checked in the browser |
| Fix: skill search finds everyday skills | `claude/cv-profile-module` | merged 2026-10-30 | Done; 232 tests pass; CV eval unchanged |
| Light mode by default, switch to dark | `main` | 2026-10-30 | Done |
| Future Skills Radar Round 1 + skill trends from O\*NET | `claude/future-radar` | merged 2026-10-30 | Done; 651 tests pass; whole-branch reviews fixed |
| Career matching, AI scenarios and SDG links | `claude/career-matching` | merged 2026-10-31 | Done; 803 tests pass; checked in the browser |
| Landing page (ATM intro, guide figures, roller counters) | `claude/website-interface` | merged 2026-10-31 | Merged as built; 829 tests pass; checked in the browser |
| Radar charts that follow your profile, pages for long lists | `claude/future-radar` | merged 2026-10-31 | Done; 955 tests pass; whole-branch review fixed; checked in the browser |
| Study pathway (study route + skills to build, team-picked courses and programmes) | `claude/study-pathway` | merged 2026-10-31 | Done; 1088 tests pass after the merge; whole-branch review fixed; checked in the browser |
| Overall match: 4 UNESCO-based AI questions + AI know-how on the role card (M17) | `claude/career-matching` | merged 2026-10-31 | Done; 1129 tests pass; whole-branch review fixed; checked in the browser |
| Organisation view: HR / L&D and career centres (roster, join links, heatmap, team plan, outlook, SDG count) | `hr-branch` | merged 2026-10-31 | Done; 1335 tests pass after the merge; whole-branch review fixed; checked in the browser (fake D1) |
| SDG contribution page and Compare futures | not started | — | Next |

## Future Skills Radar (since 2026-10-30)
- **Screen `#radar`**, two tabs: Skills & Careers (first) and AI Impact. By default it shows only what relates to
  the user's confirmed profile, worked out in the browser; "View all" sits at the bottom. Every number links to its
  source and date. Admin `#admin` and judge test `#judge` use server keys (`RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`,
  `RADAR_SESSION_SECRET`); keys never reach the browser.
- **Sources:** OpenAlex (AI research papers per topic), DOSM (Malaysian online job ads by MASCO major group),
  O\*NET skill flags (which software skills US job ads ask for, compared between releases) and O\*NET Hot
  Technologies (US job-ad counts, yearly snapshots).
- **No scores, weights or rankings.** The Radar publishes `radar-signal/v1` for the later matching module
  (`docs/radar/contract.md`); `GET /api/radar/export` is its input.
- **Owner decides:** field ↔ AI topic links (16 proposals, pending until approved in `#admin`) and possible DOSM
  structural breaks (4, incl. 2025 Q3, which blocks most group comparisons until reviewed or until 2026 Q3).
- **Charts follow the profile (D28–D33, 31 Oct):** Skills & Careers opens with the in-demand O\*NET software skills of
  the user's own jobs (O\*NET roles, field-of-study jobs, eMASCO roles through the code chain), sized by 2025 US job-ad
  counts. AI Impact opens with the user's O\*NET tasks and how often AI does them (Anthropic Economic Index) plus the
  ILO WP140 exposure gradient; the six-topic chart below shows the field's approved topics. Long lists show 10 rows a
  page with a page bar; long notes fold. Counts and shares only, never a score. `GET /api/radar/ai-tasks` takes no
  parameters, so the profile never leaves the browser.
- **Two copies of the chain walker:** `shared/radar/chain.js` is a copy of `shared/matching/chain.js` (only its header
  line differs; hashes in `data/radar/copied-from-main.json`). Merge them into one module at a later clean-up.

## Profile form since 2026-10-30 (owner requests)
- **Search as you type:** skills (O\*NET), roles of interest (O\*NET + eMASCO) and field of study (UNESCO
  ISCED-F 2013). Nothing is linked silently.
- **"Prefer not to say" is the default** of every optional field (a dropdown, no checkbox). Skill level starts on
  "Not assessed yet".
- **Field of study → O\*NET** through official tables only: ISCED-F → CIP (Statistics Canada) → O\*NET jobs (O\*NET
  crosswalk). 118 of 124 fields reach O\*NET. Originals are kept in `data/isced/source/`.
- **Skills suggested from the field of study:** "typical of the field" (more common in its jobs than overall).
  They are click-to-add chips, never added automatically. This is not matching and gives no score.
- **"Career interests and fields"** is one list: the 41 O\*NET interest areas, several allowed.
  `preferredCareerFields` is gone; old profiles are converted.
- **Skill search covers more than software.** It also searches O\*NET work styles (e.g. Leadership Orientation),
  knowledge areas and work activities, with general skills before software products. These lists are for search
  only, so CV reading is unchanged. O\*NET's wording is needed: "Cooperation", not "teamwork".
- **Every list shows its source on screen.** The owner calls this highly important; keep it for anything new.
- **O\*NET interest-area values (1–7)** are marked "AI/Expert" by O\*NET (05/2026). They are kept for matching
  and not used yet.

## Open points for the owner
- **Weak skill suggestions can appear.** The rule has no minimum gap above the average, e.g. Accounting → Programming
  (1.76 against 1.60). Adding a minimum gap is the owner's call.
- **Field-of-study names are English only.** There is no official BM or 中文 list; the BM and 中文 hint says to search
  in English.
- **The reason for a suggested skill is hover text,** so phones don't show it. Revisit at the visual redesign.
- **Radar:** review the 16 field ↔ topic proposals and 4 possible breaks; review BM and 中文 Radar wording (marked
  "translation: owner review"); decide a "rising" rule for Hot Technology counts when the 2026 window appears;
  accept or trim ~10.8 MB of bundled O\*NET snapshots; find an official source that MASCO 2020 major groups match
  ISCO-08.
- **Radar profile charts:** review the new BM and 中文 lines ("translation: owner review"); eMASCO roles in one 4-digit
  MASCO group show the same chart (the chain works at that level); the "Your profile" card still says "Add your field
  of study or roles" for a profile with only O\*NET roles; copy the three browser-check screenshots into
  `docs/record/screens/` (blocked by a permission check for Claude).
- **Matching:** review the SDG team drafts in `#admin` (all shown now, labelled "team draft, not yet reviewed";
  approval is a future step); review BM and 中文 matching wording; the ~685 KB role list could be compressed (needs
  OK for a new package). Overall match: the page's sources table has no UNESCO row yet (shown on the questions page);
  zh mixes 您/你.
- **Tests:** since the 31 Oct merges, a plain `npm test` sometimes fails a few unrelated server tests under load;
  `npx vitest run --maxWorkers=3` is green. Decide a worker limit or timeout in the test settings.
- **Study pathway:** review the team picks in `#admin` (none approved yet; a note is required per decision); fill
  the 60 accredited picks that have no MQA reference yet (the scripted MQR query works, see the branch handover);
  review BM and 中文 pathway wording; professional bodies not linked (law, architecture and town planning,
  veterinary, social work); a few weaker course fits.
- **Organisation view:** in the judge's Trend Change Test session the Outlook still names DOSM as the job-ad source
  while the bands come from test data (`server/org/service.js`, add a `judgeSession` guard and a test); D1 keys and
  price before any trial with real accounts; one roster import on real D1 not yet timed; review BM and 中文 org
  wording; small wording points in `docs/org/acceptance.md` ("raise to X", "1 people").

## Career matching (since 2026-10-31, details: branch `claude/career-matching`)
- **Screen `#match`** lists eMASCO roles (pages of 10) with a Skill Match chart, an outlook under two AI scenarios
  and SDG tags; screen `#sdg` shows the SDG links. Design: `docs/superpowers/specs/2026-10-30-career-matching-design.md`
  and `docs/architecture-matching.html`.
- **Skill Match** = Σ min(you, needed) ÷ Σ needed over O\*NET skills + knowledge with importance ≥ 3.0. Levels: basic
  2, good 4, expert 6; "Not assessed yet" meets the level and marks the result provisional. No language model.
- **Official code chain only:** eMASCO → ISCO-08 → SOC 2010 → SOC 2018 → O\*NET (`data/radar/occupation-bridge.json`,
  BLS crosswalks kept in `data/radar/source/`). MASCO → ISCO uses the same 4-digit code where ISCO has it, labelled
  "code match, not an official table". A broken chain says "not available" and names the missing step. 1261 of
  1812 roles have a Skill Match; Malaysian-only groups (e.g. 1121) stay unavailable.
- **Scenarios:** Moderate AI = Anthropic Economic Index observed use; Rapid AI = ILO WP140 exposure. Trends and
  scenarios set the outlook and one of four bands, never the Skill Match.
- **SDG:** team drafts shown with a UN goal link; rejected links hidden; approved links dated. The path contribution
  is a count of links with reasons, never a score.
- The profile sent to `/api/matching` is never stored or logged. Forbidden keys: score, weight, rank, opportunit.
- **Overall match (M17, 31 Oct):** profile section 6 "Using AI" asks 4 yes/no questions based on the UNESCO AI
  competency framework for students (2024, https://doi.org/10.54675/JKJB9835). AI know-how = Yes ÷ answered.
  Overall = Skill Match × (1 − AI touch) + AI know-how × AI touch; AI touch = share of the job's tasks seen in AI use
  (Moderate, Anthropic) or the ILO exposure score (Rapid). The Skill Match and the bands never change; inside a band
  roles sort by Overall. No answers → an "Answer AI questions" button; no AI data → Overall = Skill Match. Code
  `shared/matching/overall.js`.

## Landing page (since 2026-10-31, details: branch `claude/website-interface`)
- The welcome screen is now the landing page. Its "Get started" buttons open the sign-in / guest choice
  (`access`); every other screen is the app as before.
- The 3D ATM intro (three.js 0.186.1, served from `node_modules`, no CDN) stays as built. **The owner will say
  later what changes in the ATM section; do not alter it until then.**
- Its stage list still says only the profile is built; radar and matching exist now. Owner to decide the wording.

## Study pathway (since 2026-10-31, details: branch `claude/study-pathway`)
- **Screen `#pathway`** (the old "Learning roadmap" tab; `#roadmap` opens it). "Plan my study pathway" on a `#match`
  card saves the role; several roles, one tab each. Design: `docs/superpowers/specs/2026-10-31-study-pathway-design.md`
  (P1–P16), `docs/architecture-pathway.html`, approved mockup `docs/mockup-pathway.html`.
- **Part 1, study route:** eMASCO's qualification first, O\*NET's US education level under it; fields of study read
  backwards through the official ISCED-F ↔ CIP ↔ O\*NET tables, each with accredited Malaysian programmes,
  professional bodies and starter courses. 99 of 118 fields have a programme; the other 19 are in
  `docs/pathway/fill-report.md` with the sources searched.
- **Part 2, skills to build:** matching's own gap points (`POST /api/pathway` reuses `matching.role()`), biggest
  first, each with team-picked courses (all 68 O\*NET items) and "More on <site>" search links. Started / Done per
  skill, saved in the browser; it never changes the Skill Match.
- **Team picks** (`data/pathway/picks.json`, sites in `sites.json`): only name, link, date checked, plus
  institution and MQA reference or body; nothing invented; names copied from the page heading. Owner review in
  `#admin` (approve / reject with a note); approved picks show the date; no "team draft" word on `#pathway` (P15).
- **NEC hint:** a field code is shown only where it is known (P16); MQA's register cannot be linked, only searched.
- A bad picks file stops the server at start-up and names the pick. The profile is never stored or logged.

## Organisation view (since 2026-10-31, details: branch `hr-branch`)
- **Screen `#org`** for category C (HR / L&D) and D (TVET / university career centre); account needed (D1). One
  account owns one organisation. Design: `docs/superpowers/specs/2026-10-31-hr-org-view-design.md` (O1–O8),
  `docs/architecture-org.html`, mockup `docs/mockup-org.html`, browser results `docs/org/acceptance.md`.
- **People in two ways:** a roster CSV of made-up people (checked and previewed before import; names already in the
  organisation refused) or a one-time join link (32 random bytes, only its hash stored, 7 days) with which an
  employee shares **skills only** (O\*NET skill/knowledge + level, group, role, name). One share per employee; they
  see exactly what HR holds and can update or stop.
- **Numbers are matching's:** each person goes through `matching.role()` for their current and target role;
  `shared/org/team.js` only counts and sums. Heatmap cells, a team plan per role (pathway courses, no hours), band
  counts under Moderate / Rapid AI and an SDG link count (never a score). Scenarios change only the band counts.
- Tables `orgs`, `org_groups`, `org_people`, `org_skills`, `org_invites`, `org_plan_steps` (cascade delete). Nothing
  personal is logged; team results are never stored.

**No scoring method from the old project.**

## What is not switched on yet (needs the owner's keys or OK)
- **`ONET_API_KEY`:** live O\*NET search. Until then the lookup uses the bundled O\*NET 31.0 snapshot, marked
  "cached".
- **Cloudflare D1 (`D1_*`) and R2 (`R2_*`):** without them, accounts say "not available" and guests still work
  fully. The organisation view needs D1 (check Cloudflare's current D1 price and tell the owner first). Local
  trial: `node scripts/serve-local-accounts.mjs` (in-memory stand-ins).
- **Radar storage and refresh:** a deployed Radar needs R2 settings (`RADAR_STORE`, `R2_*`) and a free OpenAlex key;
  `RADAR_STORE=memory` is for local trials only and forgets everything on restart. See `docs/radar/deploy.md`. No
  host chosen yet (owner's price decision).
- **RunPod endpoints:** L3 skill matching and the AI re-read. Ask the owner to approve the price first. There is no
  Claude key either (`CV_LLM_BACKUP_KEY`).

## Commands
```bash
npm install
npm test          # expect 1335 passed
npm start         # http://localhost:3200, reads .env if present (copy .env.example)
python -m unittest discover pipeline/tests   # expect 49 OK
python pipeline/fetch_radar_bridge.py        # rebuild the eMASCO → O*NET code chain
node scripts/radar-bootstrap.mjs             # rebuild the bundled Radar data (see docs/radar/deploy.md)
python pipeline/fetch_onet.py 31.0           # rebuild data/onet (jobs, skills, software, interest areas, education)
python pipeline/fetch_isced.py               # rebuild data/isced (fields of study + CIP bridge)
```
Every data file, its source, date and licence: `data/SOURCES.md`.

## Rules that apply to every branch
- **Branches:** one branch per feature. Each branch keeps a detailed `HANDOVER.md` and `CLAUDE.md`. On every merge
  to `main`, put only the important points into these two files.
- Follow the owner's architecture diagrams exactly. Add nothing they do not state, such as extra limits.
- Use no scoring method from the previous project. Don't use the `C:/Users/guiro/XH-Cat_Domain1` folder as a
  template.
- Ask the owner before anything paid, and before merge, push, PR or force-push.

## Repository
- `C:\Users\guiro\XH_Cat_Final`, GitHub `https://github.com/guirong0109/XH-Cat_MyFuture` (private).
- Branches: `main`, `claude/cv-profile-module`, `claude/future-radar` (worktree `C:\Users\guiro\XH_Cat_Final-radar`),
  `claude/career-matching` (in `C:\Users\guiro\XH_Cat_Final`), `claude/study-pathway` (worktree
  `C:\Users\guiro\XH_Cat_Final-pathway`) and `hr-branch` (worktree `C:\Users\guiro\XH_Cat_Final-hr`). `main` is also checked out as a worktree at
  `C:\Users\guiro\XH_Cat_Final-main`; merge there, since `git checkout main` fails in the first folder.
- Node ≥ 22.12 (built on 24.16.0), Python 3 for `pipeline/`.
