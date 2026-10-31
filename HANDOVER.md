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
| Organisation view: HR / L&D and career centres (roster, join links, heatmap, team plan, outlook, SDG count) | `hr-branch` | merged 2026-10-31 | Done; 1338 tests pass after the merge; whole-branch review fixed; checked in the browser (fake D1); judge-test source label fixed |
| CV and profile screens redesign: landing look, Who is it for, goal, grouped skills, prechosen CV answers (owner requests) | `claude/cv-profile-module` | merged 2026-10-31 | Done; 1425 tests pass after the merge; checked in the browser |
| Radar: "Your profile" card removed; source details as four cards (owner requests) | `claude/future-radar` | merged 2026-10-31 | Done; 1429 tests pass; checked in the browser |
| DeepSeek reads every CV next to the rules reader (merged draft, "Found by AI" tags; consent re-read removed) | `claude/cv-profile-module` | merged 2026-10-31 | Done; 1481 tests pass after the merge; whole-branch review fixed; checked with the owner's key and real CV |
| CV skills that reach Skill Match: O*NET knowledge areas and short forms (SQL, MS Excel) linked; DeepSeek suggests the closest O*NET skill/knowledge, counted only after the user presses Keep; project title and description split; no skills from certificate lines | `claude/cv-profile-module` | merged 2026-10-31 | Built, task-reviewed and whole-branch reviewed (4 Important fixed, merged 2026-11-01); checked in the browser with a local fake AI; paid AI accuracy run still open |
| Radar: AI usage question (10 owner categories), AI tasks scatter, two tabs For You / Explore all trends (owner requests) | `claude/future-radar` | merged 2026-10-31 | Done; 1535 tests pass after the merge; whole-branch reviews fixed; checked in the browser |
| Compare futures: AI news per study field (DeepSeek Search every 3 hours, DeepSeek relevance check, English only) | `claude/compare-futures` | merged 2026-10-31 | Done; 1673 tests pass after the merge; whole-branch reviews fixed; checked with the owner's key |
| SDG contribution page | not started | — | Next |

## Compare futures: AI news (since 2026-10-31)
- **Screen `#futures` → AI news:** For you (the profile's study fields) and Explore all (10 ISCED-F broad fields),
  up to 25 items each with link, site, date and snippet; every list names DeepSeek Search, the query, the update
  time, the next refresh, "English articles only" and how many results the check dropped.
- **Refreshes every 3 hours (owner rule).** Paid DeepSeek: about US$4-6 a month, hard caps 80 searches and 80
  checks a day. Key `DEEPSEEK_API_KEY` (the CV reader uses `CV_LLM_KEY`).
- **Waits on the owner:** BM / 中文 wording, the search words per field (Natural sciences keeps few items), and the
  Cloudflare Tunnel set-up for `futures.grong.my` (procedure in the branch `CLAUDE.md`).

## Future Skills Radar (since 2026-10-30)
- **Screen `#radar`**, two tabs since 31 Oct (D43-D48): **For You** (first; the AI usage question until answered or
  skipped, then the AI tasks scatter and research signals for you) and **Explore all trends** (research momentum and
  papers per year, all six topics; opens first for the goal "Switch career"). The Skills & Careers sections (skills
  chart, DOSM job ads, skill changes, fields, what it means) are off the page; their code and data stay. Worked out in
  the browser from the confirmed profile. Every number links to its
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

## CV and profile screens since 2026-10-31 (owner requests, details: branch `claude/cv-profile-module`)
- **Look:** the app screens use the landing page's design (cream, serif headlines, mono labels, thin rules, ATM and
  receipts). Main's matching, Radar, pathway and organisation screens keep their rules, now in the same colours.
- **Start:** "Who is it for?" → personal: guest or account, then "What is your goal?" (4 goals), then CV or form;
  organisation: account only (no guest), then C/D and the organisation view. Sign-in notes from the organisation
  view skip the question.
- **Profile:** five sections — Education (qualification + field of study dropdowns), Employment background (job title
  + years), Skills and proficiency, Using AI, Interests (career interests only). "Review and confirm" is on the last
  section, Interests. No certificates or training; projects are kept as cards in Skills.
- **Skills:** a card per job and project with the skills used there, "Other skills" folded. A skill used in a job or
  project starts at **Good** (tag "From your projects"; the owner's rule) — matching counts it as Good.
- **After a CV:** only "Edit in the form"; the qualification level and field of study come prechosen ("Chosen from
  your CV … check it is right").
- **CV skills that reach Skill Match (31 Oct, owner decisions L1-L3):** only `onet:el:`/`onet:kn:` skills count in Skill
  Match, so tools like Python counted for nothing. Now: knowledge areas and short forms link by rules; DeepSeek picks the
  closest of the 68 O*NET skill/knowledge names (checked against our list, quoting the CV) and the form shows "AI
  suggests … Check it" with Keep / Remove; a kept one starts at Good when used in a job or project. Spec
  `docs/superpowers/specs/2026-10-31-cv-onet-linking-design.md`. Still open: the paid `--ai` accuracy
  run (under $0.01), then designs B (tools used in each career) and C (field of study to careers).
- **DeepSeek reads every CV (31 Oct, owner decision):** the rules reader and DeepSeek (`deepseek-flash`, thinking off)
  read the CV together and the server merges them: rules win, the AI fills empty fields and adds missed items (tag
  "Found by AI — check it"; "AI read this as …" when it read a field differently). The upload screen says the CV is read
  by DeepSeek (stored in China). If the AI fails or takes over 40 s, the rules draft comes with a note. Checked with the
  owner's key on 10 synthetic CVs (about $0.0034) and the owner's real CV. The consent "AI re-read", compare view,
  Claude backup and the R2 CV copy were removed. **PDPA:** fine for synthetic data; check Malaysia's PDPA cross-border
  rules before real users.
- **Merge note:** on a Windows checkout with `core.autocrlf=true`, `tests/radar/copiedFromMain.test.js` fails 2 checks
  (line endings change the files' SHA-256); the files themselves are unchanged.

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
  MASCO group show the same chart (the chain works at that level); copy the three browser-check screenshots into
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
- **Organisation view:** D1 keys and price before any trial with real accounts; one roster import on real D1 not yet timed; review BM and 中文 org
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
- **Overall match (M17, 31 Oct):** profile section 4 "Using AI" asks 4 yes/no questions based on the UNESCO AI
  competency framework for students (2024, https://doi.org/10.54675/JKJB9835). AI know-how = Yes ÷ answered.
  Overall = Skill Match × (1 − AI touch) + AI know-how × AI touch; AI touch = share of the job's tasks seen in AI use
  (Moderate, Anthropic) or the ILO exposure score (Rapid). The Skill Match and the bands never change; inside a band
  roles sort by Overall. No answers → an "Answer AI questions" button; no AI data → Overall = Skill Match. Code
  `shared/matching/overall.js`.

## Landing page (since 2026-10-31, details: branch `claude/website-interface`)
- The welcome screen is now the landing page. Its "Get started" buttons open "Who is it for?" (for myself / for my
  organisation), then the guest or account choice (`access`).
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
- **RunPod endpoint:** L3 skill matching. Ask the owner to approve the price first.
- **DeepSeek (`CV_LLM_KEY`):** set in the owner's own `.env` on the CV branch; a deployed server needs it too (paid per
  use, about $0.0003 per CV).

## Commands
```bash
npm install
npm test          # expect 1744 passed
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
  `claude/career-matching`, `claude/compare-futures` (in `C:\Users\guiro\XH_Cat_Final`), `claude/study-pathway` (worktree
  `C:\Users\guiro\XH_Cat_Final-pathway`) and `hr-branch` (worktree `C:\Users\guiro\XH_Cat_Final-hr`). `main` is also checked out as a worktree at
  `C:\Users\guiro\XH_Cat_Final-main`; merge there, since `git checkout main` fails in the first folder.
- Node ≥ 22.12 (built on 24.16.0), Python 3 for `pipeline/`.
