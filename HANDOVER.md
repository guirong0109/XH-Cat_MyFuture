# HANDOVER — `claude/career-matching` (detailed)

Updated 2026-10-31 (all 16 tasks built). Branch from `main` at `b24660e` (after the Radar merge). `main` keeps a
short version of this file;
on merge, put only the important points there and do not overwrite it with this one.

## State
- **All 16 plan tasks are built and reviewed** (1129 Vitest tests, 49 pipeline tests). A **final whole-branch review is
  next**, then the owner decides on merge. Nothing is pushed or merged.
- A1-A12 checked in the browser on real data (`docs/matching/acceptance.md`); A13 (percentages, chart, what would
  raise it, scenario moves, judge test) by tests only until the BLS files exist.
- Spec: `docs/superpowers/specs/2026-10-30-career-matching-design.md`; plan: `docs/superpowers/plans/2026-10-30-career-matching.md`;
  diagram: `docs/architecture-matching.html`.

- **M17 Overall match (31 Oct, built and checked in the browser, `docs/matching/acceptance.md`):** `Overall = Skill Match x (1 - AI touch) + AI know-how x AI touch`, in `shared/matching/overall.js`. AI touch = Anthropic observed task share (Moderate) / ILO exposure score (Rapid). AI know-how = Yes answers divided by answered, from four yes/no profile questions (`aiUse`) based on the UNESCO AI competency framework for students (2024, https://doi.org/10.54675/JKJB9835, CC BY-SA 3.0 IGO). It never changes the Skill Match or the bands; with no AI data Overall = Skill Match. Cards show Skill Match, AI touch and Overall; inside each band, roles sort by Overall, else Skill Match, then title; band membership never changes.
- Fixed in the final review: under Moderate the AI block now shows one number: the big AI touch %, with "AI use seen on X% of this job's tasks" and a bar at the same X; the automation share stays in the open panel.

### Works today
Role list (1812 titled eMASCO roles), card text, DOSM job-ad evidence at group level, "not available" messages that
name the missing step, SDG tags, `#sdg` path tab, owner review of SDG links in `#admin`, and the judge change test
(tested with a fixture).
Owner UI round (31 Oct): a one-line banner grouped by (from group, to group) with no role names; each band list shows
10 roles per page (`‹ 1 … N ›` and a "Go to page" box; paging, not a cap); "Show / Hide outlook and details" with Job
ads, AI and Software as three boxes (side by side from 760 px) and "Why this match" as its own fold; the AI touch (big %, one line with its source, purple bar) in the right column of every closed card (Moderate: AEI observed task share; Rapid: ILO GenAI exposure % and group); all SDG team drafts
shown at once with a link to the goal's UN page (M16).

### Waits on the owner
- **BLS crosswalk files: done 2026-10-31** (fetched with the owner's OK, kept in `data/radar/source/`, chain
  rebuilt). 1,261 of 1,812 roles now reach O\*NET and show a Skill Match; 540 roles in Malaysian-only 4-digit
  groups stop at the same-code step (M15) and 11 reach only O\*NET "All Other" jobs with no skill data.
- **SDG reviews** of the 126 team-draft links in `#admin`. Since M16 (31 Oct) every link shows at once as "team
  draft, not yet reviewed"; approving adds the date, rejecting hides it.
- **DOSM 2025 Q3 break review** (Radar). Until then the job-ad parts are "not enough evidence" and most roles sit in
  band 4.
- **BM / 中文 wording review** (strings marked "translation: owner review", also the SDG reasons).
- A live eMASCO refresh (`pipeline/fetch_emasco.py`) only with the owner's go-ahead.

### Rulings made during the build (from the ledger)
- Matching uses its own forbidden-key pattern (score, weight, rank, opportunit); the key is `skillMatch`.
- The judge test may inject signals through a service option if the demo base cannot give a sufficient direction; the
  real path is still wired.
- Downloads named in the plan (O\*NET zip, ILO, Anthropic, UN API, one eMASCO page) were approved with the plan.
- `role_details.json` keeps 1814 entries; the list shows the 1812 with a title, the 2 stubs stay as data only.
- O\*NET rows marked "Recommend Suppress = Y" (24 of 19,851 important items) are left out, and the screen says so.
- ILO gradient G3 is "mean at least 0.5 and mean plus SD at least 0.5", closing a gap in the plan's reading of Table 5;
  no real row is affected.
- Anthropic task usage is the file's `pct`; only the latest monthly slice (May 2026) of release 2026-06-26 is kept.
- The UN SDG API is asked per goal with `includechildren=true` (the other form returns no targets).
- The job-ads part carries `evidenceKind` and `granularity` from DOSM, labelled "group level, not this job", and shows no
  direction unless the evidence is sufficient.
- With a thin profile (no percentage) the best O\*NET job is the one with the lowest code, so its Moderate AI part is
  deterministic.
- M16 (owner, 31 Oct): every SDG team-draft link is shown at once, labelled with its review state; a rejected link is
  hidden; the path counts every shown link; each tag links to `https://sdgs.un.org/goals/goal<N>`. Replaces "only
  owner-approved links".
- Rapid AI uses the ISCO code from the code chain only, never the first four digits of the role code. Until the BLS
  files are saved it says "not available". The owner may instead approve the ILO file's ISCO-08 list for that check.

## What this module does
Ranks Malaysian eMASCO roles for a confirmed profile, with:
- **Skill Match = levels met ÷ levels needed** (owner's "How Fit Is Worked Out" chart). Items: O\*NET skills +
  knowledge with importance ≥ 3.0; needed = O\*NET level (0–7); you = basic 2 / good 4 / expert 6, missing 0,
  "Not assessed yet" = meets it and marks the score provisional.
- **Why this match**: one sentence ("You meet 9.2 of 12.1 needed levels …") + You vs Needed bar chart + chain path.
- **What would raise it**: top 3 gaps in points.
- **Outlook per scenario**, never in the %: Moderate = observed AI use (Anthropic Economic Index), Rapid = potential
  (ILO WP140), plus the DOSM group trend (group level, not this job) and O\*NET in-demand software.
- **4 bands**: (1) job ads growing/steady and AI mostly helps, (2) AI may change much of this job in this scenario,
  (3) fewer job ads, (4) not enough evidence. "In your field" first, then "Explore all roles".
- **SDG**: team-draft links (48 MASCO sub-major groups + 68 O\*NET items), all shown now (M16), rejected ones hidden,
  approved ones dated after review in `#admin`; "Choose this role" → path contribution as a count of links per goal with reasons ("potential, not
  measured"); SDG filter on the list.

## Owner decisions (30 Oct) — spec §2, M1–M15 (M14 mockup, M15 MASCO to ISCO by the same 4-digit code)
Old screenshots = look only, new maths · eMASCO roles · copy the 23 Oct crawl **and** write a new crawl script ·
**official code chain only** (eMASCO → ISCO-08 → SOC 2010 → SOC 2018 → O\*NET) · skills + knowledge only · levels-met
maths · trends only in a separate outlook and bands · ILO + Anthropic for AI exposure · scope = matching + scenarios +
SDG (no study plan) · SDG team draft, owner approves · career interests not used in v1 · Claude drafts the diagram.

## Blocking / waiting on the owner
- **BLS crosswalk files**: saved 2026-10-31 (BLS refuses scripted downloads; fetched with the web-fetch tool with the
  owner's OK; the ISCO `.xls` sheet saved as `.csv` by Excel). Refresh the same way if BLS publishes new tables.
- **Official MASCO 2020 ↔ ISCO-08 source** (also a Radar open point). Today the step uses the same 4-digit code (M15).
- ILO and Anthropic data licences are recorded at fetch; if one does not allow reuse, ask the owner.

## Data used (all on `main` unless marked new)
| Data | Use |
|---|---|
| eMASCO roles (new: `data/emasco/role_details.json`, 1,814 entries, 1,812 shown; copied from the team's 23 Oct crawl; old folder read for data only) | Role list and card text; not in the % |
| O\*NET 31.0 skills + knowledge (new column: level, suppress flag) | Requirements, importance filter, needed level |
| `data/radar/occupation-bridge.json` (finish the pending steps) | The code chain |
| ISCED-F → CIP → O\*NET (`data/isced/`) | "In your field" |
| Radar export (DOSM groups, O\*NET in-demand lists) | Outlook and bands |
| New: ILO WP140, Anthropic Economic Index, UN SDG targets, SDG team draft | Scenarios and SDG |

## Not allowed (project rules)
- No method from the old project (no 0.8/0.6 weights, no 70% ready line, no 60% factor, no bge-m3 AI fit).
- No AI or word linking between eMASCO and O\*NET; no crosswalk that has no official source.
- Radar signals never become a score; group trends are never shown as one job's trend.
- Nothing beyond the approved diagram.

## Commands
```bash
npm test                                      # 1126 passed
python -m unittest discover pipeline/tests    # 49 OK
npm start                                     # http://localhost:3200, tabs #match and #sdg
python pipeline/fetch_radar_bridge.py         # after the BLS files are saved
```

## Where things are
| What | Where |
|---|---|
| Engine (chain, fit, outlook, SDG) | `shared/matching/` |
| API and admin review routes | `server/matching/` (`/api/matching`, SDG review in `adminRoutes.js`) |
| Screens | `public/js/screens/match.js`, `sdgTab.js`, `public/js/matchApi.js` |
| Data | `data/emasco/`, `data/onet/requirements.tsv` and `tasks.tsv`, `data/ai/`, `data/sdg/`, `data/radar/occupation-bridge.json` |
| Pipeline scripts | `pipeline/fetch_emasco.py`, `import_emasco_details.py`, `fetch_ilo.py`, `fetch_aei.py`, `fetch_sdg_targets.py`, `fetch_radar_bridge.py` |
| Tests | `tests/matching/`, `pipeline/tests/` |
| Docs | `docs/matching/acceptance.md`, `data/SOURCES.md`, `docs/tools-declaration.md`, `docs/build-record.html` |

Main's Study Pathway and Radar chart work came in on 31 Oct 2026 (merge of `origin/main`).
