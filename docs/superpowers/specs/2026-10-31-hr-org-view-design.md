# Organisation View (HR and career centres) — Design

Date: 2026-10-31 · Branch `hr-branch` (from `main` at `d4286d6`) · Status: **approved by the owner on 31 Oct 2026**

Inputs: the Domain 1 Finalist Guide (good-to-have "Employer / HR view: a workforce-level skills-gap heatmap and
reskilling plan for a team or company"; user groups "HR and learning-and-development managers" and "TVET and
university career centres"); the owner's original plan (`docs/superpowers/specs/2026-10-29-futureready-final-design.md`
M2 and `docs/mockup-journey.html` screen `org`: categories C and D, account required, "upload a team roster
(synthetic), see gaps against a target role, and get one reskilling plan per team"); the guide check of the claude.ai
prototype "FutureReady Navigator" (`docs/hr/guide-check.md`); the career matching design
(`docs/superpowers/specs/2026-10-30-career-matching-design.md`); the study pathway design on `claude/study-pathway`
(`docs/superpowers/specs/2026-10-31-study-pathway-design.md`).

**No scoring method from the old project and none from the prototype.** The prototype's match score
(0.60 × overlap + 0.25 × momentum + 0.15 × readiness), its 14-skill list, its 1–4 levels, its hand-typed heatmap
numbers, its "below target × 1.3" estimate, its "employees needing reskilling (3 yrs)" figure and its invented
scenario multipliers are not used.

Architecture diagram: `docs/architecture-org.html` (Claude drafts it; the owner approves it; it then binds the build).
Mockup: `docs/mockup-org.html` (real role titles and O\*NET names; every person and number is sample data).

## 1. Goal and success

An HR / L&D manager (category C) or a TVET or university career centre (category D) signs in, sets up one
organisation, adds people by uploading a synthetic roster or by sharing a join link, and sees:

- a **heatmap** of skill gaps per group against each person's current role and the group's target role;
- a **team plan** per group and role: the skills with gaps, the one most people are short in first, with real
  courses from the study pathway;
- an **outlook** under the Moderate and Rapid AI scenarios (how many people sit in each of matching's four bands);
- the group's **SDG contribution** as a count of links with reasons.

Success: every number on these screens is worked out from the people's skills and the dated data already in the app;
each person's figures equal what they would see on `#match`; the outlook counts change when the Radar data changes
(the judge test) while the gaps do not; every list names its source and date; a person, role or item with no data
says so instead of guessing. The view helps people decide on training; it never makes hiring decisions, and the
screens say so.

## 2. Decisions (owner, 31 Oct)

| # | Topic | Decision |
|---|---|---|
| O1 | Where team data comes from | **Both**: HR uploads a roster of synthetic people (labelled "entered by HR"), **and** real employees join by link and share their own skills (labelled "shared by the employee"). Same sums for both |
| O2 | Workspace | A real workspace on the existing D1 accounts: one account owns one organisation |
| O3 | Invites | A one-time join link per invite (valid 7 days) that HR copies and shares itself. The app sends no email |
| O4 | Gaps measured against | Each person's **current** eMASCO role and, when set, their group's **target** role; needed levels from O\*NET through the official code chain, exactly as matching |
| O5 | Skill not in a profile | Same as matching: not listed = a gap (level 0); "Not assessed yet" meets the level and marks the result provisional |
| O6 | What HR sees | Only the skills an employee chose to share (O\*NET item and level) and their group and role. Never the CV, profile, matches, pathways or progress. Stopping sharing removes them from every number |
| O7 | Approach | **Approach 1**: the server works out team numbers on every request, from the stored skills, by calling matching's service. Nothing computed is stored |
| O8 | Who it is for | **Both C and D** on the same screens (words and the current-role column differ). HR is built first; the career-centre type is built last and may be dropped if time runs out |

## 3. Who uses it and the screens

**Getting in.** On "Who are you?", C and D stop being "preview": they ask the person to sign in or create an account
(existing accounts). At setup the person picks the organisation type: `hr` or `centre`. Without D1 keys the screens
say "not available on this server", as accounts do now.

**Screens** (one area `#org` with tabs; replaces `public/js/screens/org.js`):

1. **Setup**: organisation name and type; groups (departments for `hr`; programmes or cohorts for `centre`); per
   group an optional **target role** picked from the eMASCO role list (the same picker as the profile form).
2. **People**: two ways in.
   - **Upload a roster** (section 5). Each person is labelled "entered by HR".
   - **Join link**: HR picks a group (and for `hr` the person's current role) and makes a link. The token is shown
     once. The employee opens it, signs in or creates an account, picks or builds their profile with the existing CV
     and form tools, sees exactly what will be shared, and presses "Share my skills with <organisation>". They are
     labelled "shared by the employee" and can update or stop sharing at any time.
   The list shows each person's name, group, current role, source label, date added or shared, their Skill Match
   for the current and target role (or "not available" with the missing step), and "provisional" when it applies.
3. **Heatmap**: groups × O\*NET skill and knowledge items, with a switch "current role / target role" (`centre`:
   target role only). Each cell shows counts and levels short (section 6). Clicking a cell shows the people in it,
   the O\*NET item, the needed levels and the sources.
4. **Team plan**: pick a group and a role. Steps as in section 6, each with the study pathway's courses and
   "More on <site>" links; a status per step (planned / in progress / done, self-reported).
5. **Outlook and SDG**: Moderate / Rapid switch; per group, how many people sit in each band and who moves between
   the scenarios; the group's SDG contribution. Labelled as estimates, with every source and date.

**Career centre (`centre`).** Same screens; words change (programme / student instead of department / staff); no
current role, so the roster has no `current_role_code` and every gap is against the group's target role. A group
with no target role shows "choose a target role to see gaps".

Every list shows its source and date. EN / BM / 中文 strings (BM and 中文 marked "translation: owner review").
Works at 360 px.

## 4. Data and storage

**New D1 tables** (appended to `server/store/migrations.sql`, every statement safe to run again):

| Table | Columns |
|---|---|
| `orgs` | `id`, `owner_id` (users.id, unique, cascade delete), `name`, `type` (`hr` / `centre`), `created_at` |
| `org_groups` | `id`, `org_id` (cascade), `name`, `target_code` (eMASCO code or null) |
| `org_people` | `id`, `org_id` (cascade), `group_id`, `display_name`, `current_code` (eMASCO code or null; always null for `centre`), `source` (`roster` / `shared`), `user_id` (users.id for `shared`, cascade; null for `roster`), `added_at` |
| `org_skills` | `person_id` (cascade), `item_key` (`el:<id>` or `kn:<id>`), `level` (`basic` / `good` / `expert` / `not_assessed`) |
| `org_invites` | `id`, `org_id` (cascade), `group_id`, `current_code`, `token_hash`, `expires_at` (7 days), `used_at` |
| `org_plan_steps` | `org_id` (cascade), `group_id`, `role_code`, `item_key`, `status` (`planned` / `in_progress` / `done`), `updated_at` |

- A **shared person** is a copy of skills only (O\*NET item key and level), taken when the employee presses Share;
  the display name is what the employee types in the share step (default: the email's name part). No education,
  jobs, CV text or file. "Update shared skills" replaces the copy; "Stop sharing" deletes the person and their
  skills.
- Profile skills without an O\*NET item key (`canonicalId` not `onet:el:` / `onet:kn:`) are not shared, and the share
  step lists them as "not shared: not an O\*NET skill or knowledge item".
- Deleting the organisation deletes all its rows. Deleting an account (existing "delete my data") deletes its
  organisation and its shares.
- Team results are worked out on each request and never stored. No skill, name or token is logged.

**New data files** (recorded in `data/SOURCES.md` as "synthetic, written for this build", with manifest SHA-256):

| File | Content |
|---|---|
| `data/org/sample-roster-hr.csv` | Made-up staff in a few departments, with real eMASCO role codes that reach O\*NET and real O\*NET item names |
| `data/org/sample-roster-centre.csv` | Made-up students in a few programmes, same rules, no current role |
| `data/org/roster-template.csv` | Header row only, offered for download |

**Reused, unchanged:** `data/emasco/role_details.json`, `data/radar/occupation-bridge.json`,
`data/onet/requirements.tsv`, the Radar export, `data/ai/`, `data/sdg/`, and the study pathway's
`data/pathway/picks.json` and `sites.json`.

## 5. Roster file

- UTF-8 CSV with header `name,group,current_role_code,skill,level`; one row per person per skill (`centre`:
  `current_role_code` empty). A person with no skills is one row with `skill` and `level` empty.
- Each row is checked: group name exists in the organisation, or is offered as a new group in the preview; role code
  is in the eMASCO list (`hr` only); the skill name goes through the existing skill search (`server/skills`) and is
  kept only if it resolves to an O\*NET skill or knowledge item; level is one of `basic`, `good`, `expert`,
  `not assessed`. The same person name with two different groups or roles is an error.
- `POST /api/org/roster/preview` returns rows accepted, rows rejected with the reason, skills "not recognised, not
  counted", and new groups proposed. Nothing is saved. `POST /api/org/roster/import` saves the accepted rows of a
  preview the owner confirms.
- Files over 1 MB or not UTF-8 CSV are rejected with the reason. The upload screen says "Use synthetic (made-up)
  people only" (guide, Rules and Boundaries: Data).

## 6. The sums (`shared/org/team.js`, pure)

No new maths: counts and sums of matching's numbers.

**Per person** (`server/org/service.js`). The person's skills become profile skills
(`canonicalId: onet:<item_key>`, `proficiency: <level>` or none for `not_assessed`). Matching's existing service
answers for the role (current, and the group's target if set): the `fitFor` rows (`key, name, needed, you, status,
gap`) of the job matching shows for that role, plus `ai.moderate`, `ai.rapid`, `jobAds` and `bands`. A broken code
chain gives "not available" with the missing step: the person is listed but left out of the sums for that role, and
the screen shows how many were left out and why. Each person's Skill Match equals `#match` for the same skills.

**Heatmap cell** (group × item, for one role kind):
- `needing`: people in the group whose role needs the item; `met`, `below`, `missing`, `notAssessed`: how many of
  them have each status (the four add up to `needing`);
- `levelsShort` = Σ gap over those people; `averageGap` = `levelsShort ÷ needing`, shown to one decimal;
- colour by `averageGap`, legend in levels ("under 1 level short", "1 to 2", "2 or more"); `provisional` when
  `notAssessed > 0`; a cell where `needing = 0` is blank, not zero.
- Column order: `below + missing` (people short) largest first, then `levelsShort`, then item key. A sort with a
  stated reason on screen, not a score. Columns come in pages; none are cut off.

**Team plan** (one group, one role): steps are the items with `below + missing > 0`, in the column order. Each step
shows "N people short (M missing, K below)", the levels short, matching's raise wording for the level needed
("good → expert"; "expert still leaves a gap" when needed > 6), the study pathway's shown picks for that item key,
and its "More on <site>" links (`shared/pathway/picks.js`). No hours: no file in the app has a sourced duration, so
the step says "time: see each course page".

**Outlook** (scenario `moderate` / `rapid`): per group, the number of people in each band 1–4 from matching's
`bands` for their current role (`hr`) or the target role (`centre`), and the people whose band differs between the
two scenarios (`movedRoles`). Labelled "estimate", with the AI sources (Anthropic Economic Index, ILO WP140) and the
Radar job-ad source, each with its date; job-ad evidence keeps "group level, not this job". Scenarios and trends never
change the gaps, the cells or the plan order.

**SDG**: per group and role, `pathContribution(shown links, role code, the plan's gap item keys)` from
`shared/matching/sdg.js`, shown once for the group: "the planned skills touch N links across goals …", every link
with its reason and review label (M16), "potential, not measured". A count of links; never multiplied by headcount;
never a score.

**Forbidden keys**: no key in any answer contains `score`, `weight`, `rank` or `opportunit` (tested).

## 7. Server routes (`server/org/routes.js`)

All need a signed-in session (existing auth); no session → 401. The owner reaches only their own organisation; any
other id → 404 (not 403). An employee reaches only their own share.

| Route | Who | Does |
|---|---|---|
| `POST /api/org`, `GET /api/org`, `PATCH /api/org`, `DELETE /api/org` | owner | Create (one per account), read, rename, delete |
| `POST /api/org/groups`, `PATCH /api/org/groups/:id`, `DELETE /api/org/groups/:id` | owner | Groups and target roles (deleting a group with people asks to move them first: 409) |
| `POST /api/org/roster/preview`, `POST /api/org/roster/import` | owner | Section 5 |
| `PATCH /api/org/people/:id`, `DELETE /api/org/people/:id` | owner | Change group or current role; remove. A shared person's skills cannot be edited by the owner |
| `POST /api/org/invites` | owner | Make a join link; returns the token once |
| `POST /api/org/join` `{token}` | signed-in user | Checks the token (unused, not expired); returns the organisation name, group and what will be shared |
| `PUT /api/org/share` `{token?, displayName, profileId}`, `DELETE /api/org/share` | employee | Share (first time with the token, which is then marked used) or update the copy; stop sharing |
| `GET /api/org/team?view=current\|target&scenario=moderate\|rapid&lang=` | owner | Heatmap, plan, outlook and SDG, worked out now |
| `PUT /api/org/plan-steps` | owner | Set one step's status |

## 8. Privacy (PDPA) and safety

- Nothing is shared by default. Before sharing, the employee sees the exact list HR will see (skill names and
  levels, group, role, display name) and confirms with a button.
- HR never sees an employee's CV, profile, matches, pathways or progress.
- Roster data is HR's own, labelled "entered by HR"; the screen asks for synthetic people only.
- Join tokens: 32 random bytes, stored only as a SHA-256 hash, single use, 7 days. Join and share attempts are
  limited to 10 per 15 minutes per address, as sign-in.
- No skill, name or token in any log; team results never stored.
- Deleting an account or organisation deletes everything that belongs to it.
- The screens say: "This helps plan training. It does not make hiring decisions."
- The report's PDPA section (Impact & Feasibility) uses these points.

## 9. Errors

One error shape `{error:{code, message, retryable}}`, as the rest of the app.

| Case | Behaviour |
|---|---|
| No D1 configured | 503 `not_available`; screen "not available on this server" |
| No session | 401; screen offers sign in |
| Other organisation's id | 404 |
| Bad CSV | Listed per row in the preview; > 1 MB or not UTF-8 CSV rejected with the reason |
| Expired or used join link | "This link has expired or was already used. Ask HR for a new one." |
| Broken code chain | Person shown "not available" with the missing step; left out of that role's sums with a count |
| Radar unavailable | Outlook uses what matching gives (band 4 "not enough evidence" when evidence is missing); heatmap and plan still work |
| No pathway pick for an item | "no team pick yet" plus the search links |
| Empty organisation or group | "Add people with a roster or a join link"; a `centre` group without target role: "choose a target role to see gaps" |

The page never crashes.

## 10. Rules carried over

No language model. Skill Match and gaps come only from matching's service; trends and AI scenarios set only the
outlook. eMASCO → O\*NET only through `data/radar/occupation-bridge.json`. Radar signals are read as
`docs/radar/contract.md` allows (direction and sufficiency with `evidenceKind` and `granularity`); no signal becomes
a score or a sort key. SDG links are shown as M16 says. Every list shows its source and date.

## 11. Testing

Vitest, written before the code.

- `shared/org/team.js`: cell counts add up to `needing`; `averageGap`; blank cells; provisional; column and plan
  order with ties by key; people left out with a broken chain counted; each person's percentage equals matching's
  `fitFor` for the same skills; the owner's chart example (needed 12.05, met 9.2, 76%) through the team path.
- Roster check: a good file; each kind of bad row; unrecognised skills; too-big and non-UTF-8 files; preview saves
  nothing.
- Routes with the fake D1 used by the existing auth tests: owner-only access; 404 for another organisation; tokens
  hashed, single use, expiring; share, update, stop sharing; delete removes everything; 503 without D1.
- Change test: with a judge Radar signal injected through matching's existing demo path, the outlook counts change
  and the heatmap and plan do not.
- Rules: no forbidden key in any answer; no personal data in logs (log spy); the scenario never changes gaps.
- Screens: every string key in EN / BM / 中文; the `centre` type hides the current-role column.

Browser check at `127.0.0.2:3200`, written up in `docs/org/acceptance.md`: sign up as HR → upload the sample roster
→ heatmap → open a cell → team plan → click a real course → Moderate ↔ Rapid → judge change test → make a join link,
sign in as an employee, share, stop sharing → repeat as a career centre → 360 px.

## 12. Build order

1. Wait until `claude/study-pathway` is merged into `main`; bring `hr-branch` up to date with `main`.
2. Architecture diagram `docs/architecture-org.html`; the owner approves it before any code.
3. D1 tables and the roster check.
4. `shared/org/team.js`.
5. Server service and routes: organisation, groups, roster, team.
6. Join links and sharing.
7. Screens for `hr`: setup, people, heatmap, plan, outlook and SDG.
8. Career-centre type (last; may be dropped if time runs out).
9. Browser check, `HANDOVER.md` and `CLAUDE.md` for this branch, build record.

Each step ends tested, committed and recorded in `docs/record/status.json`.

## 13. Waiting on the owner

- D1 keys for local trials and the demo (Cloudflare D1 price to be checked and stated before anything is switched
  on), and whether the deployed site gets them.
- Approval of `docs/architecture-org.html`.
- BM / 中文 wording review.

## 14. Out of scope

Emails sent by the app; the owner editing a shared person's skills; more than one owner account per organisation;
hours per course or plan; fairness checks by age or gender (the app collects neither); real recruitment or HR system
links; payment.
