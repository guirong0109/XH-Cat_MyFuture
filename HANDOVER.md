# HANDOVER — `main` (important points only)

Updated 2026-10-31. Every feature branch has a detailed `HANDOVER.md` and `CLAUDE.md`. Read those for the work in
that branch. This file keeps only what matters across the whole project.

## Goal
FutureReady MY is a career-planning app for Malaysia, built for the Domain 1 finalist round. A user builds a
**confirmed, structured profile** (from a CV or a form). Later modules use it: matching, learning roadmap, SDG and
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
| Learning roadmap and the rest of the journey | not started | — | Next |

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
- **Matching:** review the SDG team drafts in `#admin` (all shown now, labelled "team draft, not yet reviewed";
  approval is a future step); review BM and 中文 matching wording; the ~685 KB role list could be compressed (needs
  OK for a new package).

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

## Next module: learning roadmap (not started)
It can reuse the confirmed profile and the matching result (`skillMatch`, gaps per O\*NET element).

**No scoring method from the old project.**

## What is not switched on yet (needs the owner's keys or OK)
- **`ONET_API_KEY`:** live O\*NET search. Until then the lookup uses the bundled O\*NET 31.0 snapshot, marked
  "cached".
- **Cloudflare D1 (`D1_*`) and R2 (`R2_*`):** without them, accounts say "not available" and guests still work
  fully.
- **Radar storage and refresh:** a deployed Radar needs R2 settings (`RADAR_STORE`, `R2_*`) and a free OpenAlex key;
  `RADAR_STORE=memory` is for local trials only and forgets everything on restart. See `docs/radar/deploy.md`. No
  host chosen yet (owner's price decision).
- **RunPod endpoints:** L3 skill matching and the AI re-read. Ask the owner to approve the price first. There is no
  Claude key either (`CV_LLM_BACKUP_KEY`).

## Commands
```bash
npm install
npm test          # expect 803 passed
npm start         # http://localhost:3200, reads .env if present (copy .env.example)
python -m unittest discover pipeline/tests   # expect 48 OK
python pipeline/fetch_radar_bridge.py        # rebuild the eMASCO → O*NET code chain
node scripts/radar-bootstrap.mjs             # rebuild the bundled Radar data (see docs/radar/deploy.md)
python pipeline/fetch_onet.py 31.0           # rebuild data/onet (jobs, skills, software, interest areas)
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
- Branches: `main`, `claude/cv-profile-module`, `claude/future-radar` (worktree `C:\Users\guiro\XH_Cat_Final-radar`)
  and `claude/career-matching` (in `C:\Users\guiro\XH_Cat_Final`). `main` is also checked out as a worktree at
  `C:\Users\guiro\XH_Cat_Final-main`; merge there, since `git checkout main` fails in the first folder.
- Node ≥ 22.12 (built on 24.16.0), Python 3 for `pipeline/`.
