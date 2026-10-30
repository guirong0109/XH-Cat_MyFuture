# HANDOVER — `claude/career-matching` (detailed)

Updated 2026-10-30. Branch from `main` at `b24660e` (after the Radar merge). `main` keeps a short version of this file;
on merge, put only the important points there and do not overwrite it with this one.

## State
- **Brainstorming done; spec written; waiting for the owner's review** of
  `docs/superpowers/specs/2026-10-30-career-matching-design.md` and the diagram `docs/architecture-matching.html`.
- No code yet. Next: owner approves spec + diagram → implementation plan (`superpowers:writing-plans`) → owner picks
  how to run it → build test first.

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
- **SDG**: team-draft links (48 MASCO sub-major groups + 68 O\*NET items), shown only after owner approval in
  `#admin`; "Choose this role" → path contribution as a count of links per goal with reasons ("potential, not
  measured"); SDG filter on the list.

## Owner decisions (30 Oct) — spec §2, M1–M13
Old screenshots = look only, new maths · eMASCO roles · copy the 23 Oct crawl **and** write a new crawl script ·
**official code chain only** (eMASCO → ISCO-08 → SOC 2010 → SOC 2018 → O\*NET) · skills + knowledge only · levels-met
maths · trends only in a separate outlook and bands · ILO + Anthropic for AI exposure · scope = matching + scenarios +
SDG (no study plan) · SDG team draft, owner approves · career interests not used in v1 · Claude drafts the diagram.

## Blocking / waiting on the owner
- **BLS crosswalk files** (SOC 2018 ↔ 2010, SOC 2010 ↔ ISCO-08): BLS blocks automated downloads; the owner saves them in
  `data/radar/source/`. Without them every role shows "Skill Match not available" with the missing step.
- **Official MASCO 2020 ↔ ISCO-08 source** (also a Radar open point).
- **SDG draft links** review in `#admin` once built.
- **DOSM 2025 Q3 possible break** (Radar): until reviewed, most roles sit in band 2 or 4.
- ILO and Anthropic data licences are recorded at fetch; if one does not allow reuse, ask the owner.

## Data used (all on `main` unless marked new)
| Data | Use |
|---|---|
| eMASCO 1,766 roles (new: `data/emasco/role_details.json`, copied from the team's 23 Oct crawl; old folder read for data only) | Role list and card text; not in the % |
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
