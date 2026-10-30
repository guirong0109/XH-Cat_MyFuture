# HANDOVER — branch `claude/future-radar` (Future Skills Radar)

Updated 30 Oct 2026. Branch made from `main` at 928f4a7. Nothing pushed.

## Where things stand
- **Design done, waiting for the owner's review of the written spec:**
  `docs/superpowers/specs/2026-10-30-future-radar-round1-design.md`. No Radar code yet.
- Next after spec approval: the implementation plan (writing-plans), then the owner picks how to run it. The plan's
  first screen task is updating `docs/mockup-radar.html` for owner approval.

## What the Radar is (Round 1)
Two tabs, **AI Impact** and **Skills & Careers**, from two real sources:
- **OpenAlex:** research papers per year for six approved AI topics (by `primary_topic`).
- **DOSM Big Data Analytics: Job Market Insights:** online job offerings by MASCO major group, quarterly since 2019 Q3,
  from the quarterly Excel file ("Data JMI Qn YYYY").

It produces trend signals (`radar-signal/v1`) and the jobs, fields and skills they relate to. **No scores or rankings**:
Matching is a later module with its own spec.

## Owner decisions to remember (full list D1–D20 in the spec)
- Rounds: 1 core, 2 visuals (ILO/OECD exposure, network), 3 extra evidence (MyCOL, Anthropic, …).
- Default view shows only the user's own fields, jobs and roles; "View all" at the bottom. Every item has a source link.
- Axes (approved): T10028 Language Models & Text AI (official title "Topic Modeling"), T10775 Generative Media AI,
  T12549 Computer Vision (narrow topic), T10653 Robotics, T13287 Process Automation, T12128 Service AI.
- Field ↔ topic links: proposals `pending` until the owner approves each in the admin screen.
- **Research Momentum Index** = clamp(50 + 20·log2(R/B), 0, 100), 3-year window; chart only, never decides direction.
- **DOSM indicator** = group share of all online job ads, year on year, in percentage points.
- **Possible structural breaks** at 2020 Q2, 2020 Q3, 2021 Q3, 2025 Q3 (rule in spec §5.4). Not assumed to be coverage
  changes. Because of 2025 Q3, DOSM directions are "insufficient comparable evidence" until reviewed or until the
  2026 Q3 release (due 17 Nov 2026). Meanwhile show shares, counts and DOSM's q/q total change as "context only".
- Thresholds are versioned prototype settings (`radar-config/v1`), calibrated in `docs/radar/threshold-analysis.md`.
- Admin and judge access by server keys with signed cookies; deployed state in R2; one Node instance (Render/Railway
  class); nothing paid without approval.

## Evidence kept in the repo
- `docs/radar/index-analysis.md` (+ raw OpenAlex counts and query URLs, script): why log2 with k = 20.
- `docs/radar/threshold-analysis.md` (+ scripts): DOSM shares, breaks, thresholds, volatility, edge cases.
- `docs/mockup-radar.html`: first mockup (sample data); to be updated to the spec.

## Things found that matter
- OpenAlex files most LLM papers under T10028, titled "Topic Modeling".
- Computer Science papers grew +64% in 2022–2025, so the share-of-CS view is offered separately.
- DOSM totals doubled in 2021 Q3 and 2025 Q3; at 2025 Q3 the release title also dropped "and My Job Profile"
  (evidence for the review, not a proven cause).
- DOSM's data file stops at nine major groups: no detailed job or skill trends from it (stated as a known gap).

## Waiting on the owner
1. Review the Round 1 spec.
2. Download two BLS crosswalk files in a browser (they block automated download).
3. An official source that MASCO 2020 major groups match ISCO-08 major groups (else O\*NET jobs stay unmapped to groups).
4. R2 settings; a free OpenAlex API key (only for deployed refresh).

## Commands
```bash
npm install && npm test     # expect 232 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 8 OK
```

## Repository
- `C:\Users\guiro\XH_Cat_Final`, GitHub `https://github.com/guirong0109/XH-Cat_MyFuture` (private).
- `main` is checked out as a worktree at `C:\Users\guiro\XH_Cat_Final-main`; merge there.
- Node ≥ 22.12 (built on 24.16.0), Python 3.
