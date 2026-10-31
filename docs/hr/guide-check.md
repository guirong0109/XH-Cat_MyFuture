# HR view — check of the prototype against the Domain 1 Finalist Guide

Date: 2026-10-31. Prototype: claude.ai artifact "FutureReady Navigator" (`K68uTX6kEqAHiaAvTRyXNK`), HR screens
`h-setup`, `h-overview`, `h-employees`, `h-heatmap`, `h-planner`, `h-outlook`. Guide: "Domain 1 - Finalist Guide"
(Aiversecity, final marking rubric).

## Where the HR view sits in the guide
- The guide lists it as a **good-to-have** (section 7): "Employer / HR view: a workforce-level skills-gap heatmap and
  reskilling plan for a team or company". It earns credit inside **Innovation & Creativity (25%)** and **Impact &
  Feasibility (20%)**, and is not scored on its own.
- A good-to-have "never makes up for a missing must-have". On `main` must-have 4 (the reskilling pathway) is
  **not started**. A missing must-have caps Problem-Solution Fit, so the pathway should be done before the HR view.
- HR managers are one of the four user groups the guide names (section 2), so the view does fit the brief.

## What the prototype already does well (keep)
| Guide asks for | Prototype |
|---|---|
| Skills-gap heatmap for a team | Departments × skills grid, gap = required − average of assessed staff |
| Reskilling plan for a team | Planner: pick a gap, ordered steps with hours, links to real free courses (Kaggle, Microsoft Learn, Elements of AI, UiPath, IFRS) |
| Two scenarios, labelled as estimates | Moderate / Rapid switch on heatmap and outlook; "ESTIMATE" and "ASSUMPTIONS" labels |
| Source and date on screen | Source line on evidence; trend snapshot date; stale-feed label |
| Say so when no source exists | "No verified resource in our course table yet"; "Not enough data" cells under 25% coverage |
| Robustness, thin data | Unknown skills are "not assessed", never counted as a gap |
| Human-centred, no hiring decisions | Employees confirm their own profile; private career exploration hidden from HR; "does not make hiring decisions" |
| Synthetic data only | All people are synthetic; invites and sign-up are simulated |

## What would fail the Final's checks (fix before building)
1. **Numbers are hand-written.** The heatmap averages and counts (`HEAT`), both trend snapshots, the vacancy
   shares and the "40% / 65% of Malaysian firms" lines are typed in. The guide: judges spot-check numbers, and
   "pre-recorded or hard-coded output presented as live" is a common mistake. In the app they must be worked out
   from the employees' real (synthetic) profiles and from the Radar data.
2. **"Below target" is guessed.** It is `assessed × gap ÷ required × 1.3`, not a count of the people below the
   level. It should count each person.
3. **"Employees needing reskilling (3 yrs)"** has no time basis, so it reads as a prediction with no source.
   Remove it or say exactly what it counts.
4. **The change test is faked.** Snapshots A and B are two typed lists. The app already has a real, dated Radar
   (OpenAlex, DOSM, O\*NET), so the HR view should read that instead.
5. **The Rapid scenario's numbers are invented** (×1.5, ×1.6, +1 required level). The guide wants scenarios driven
   by parameters applied to trend signals. The app already has sourced scenarios (Moderate = Anthropic Economic
   Index, Rapid = ILO WP140).
6. **HRD Corp is "verify" only.** It's fine to leave it unclaimed, but the screen should say "not checked", or each
   course should be checked against HRD Corp's own list.
7. **No SDG on the HR side.** "SDG contribution aggregated for a company" is another good-to-have. The team's
   planned reskilling could reuse matching's SDG links (a count of links with reasons, not a score).
8. **English only.** The app has BM / 中文 elsewhere, and the guide gives credit for them.
9. **Privacy (PDPA).** The guide asks how personal data is protected. HR holds employee skill data, so the
   screen needs a consent and purpose note, and the report needs a PDPA section.

## Clashes with this project's rules (owner decides)
- **Match score `0.60 × overlap + 0.25 × momentum + 0.15 × readiness`.** This is a weighted score that trends feed
  into. It breaks our rules (no weights, Radar never becomes a score, trends never change the Skill Match), so it
  must not be carried over. The HR view should reuse `skillMatch` from `shared/matching/`.
- **Its own 14-skill list and 4 levels.** Ours is O\*NET skills + knowledge with levels basic 2 / good 4 / expert 6.
  The HR view should use the same items and levels as the profile and matching.
- **Required levels "set by HR per department".** These could come from O\*NET via each role's code chain
  (eMASCO → O\*NET), or HR could type them in. If HR types them, the screen must show them as "set by HR".
- **Priority list "gap × headcount × momentum".** This is a ranking that uses Radar momentum, which the Radar
  contract forbids. It needs an owner ruling, or it should be shown without the momentum part.
- **Study hours per skill step** have no source. The pathway module has to settle where hours come from first.
- **Accounts and invitations** need D1, which isn't switched on. Without it the HR view is guest-only or simulated
  and must be labelled that way.

## Suggested order
1. Build the learning pathway (must-have 4) on its own branch first.
2. Owner approves an HR spec and a diagram (project rule: build nothing the diagram does not state).
3. Then build the HR view on `hr-branch`, reusing profile, Radar, matching, SDG and pathway.
