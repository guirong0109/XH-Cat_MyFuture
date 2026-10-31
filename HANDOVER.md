# HANDOVER — `hr-branch` (detailed)

Updated 2026-10-31 (all 12 plan tasks built; final review fixes done). Branch from `main` at `d4286d6` (after the study pathway merge). `main`
keeps a short version of this file; on merge, put only the important points there and do not overwrite it with this
one.

## State
- **All 12 plan tasks are built**, with the final review fixes (1297 Vitest tests, 49 pipeline tests). The owner decides on merge. Nothing is
  pushed or merged.
- The organisation view (HR and L&D managers, TVET and university career centres) works end to end: setup, people
  (roster upload and join links), heatmap, team plan, outlook and SDG. Both organisation types are built (`hr` and
  `centre`).
- Browser check of 31 Oct 2026 (controller run, made-up accounts only) is in `docs/org/acceptance.md`. Two rows were
  not run in the browser and are covered by tests only (see that file).
- Spec: `docs/superpowers/specs/2026-10-31-hr-org-view-design.md` (O1-O8); plan:
  `docs/superpowers/plans/2026-10-31-hr-org-view.md`; diagram: `docs/architecture-org.html`; mockup:
  `docs/mockup-org.html`; guide check: `docs/hr/guide-check.md`.

### Works today
- **Screens `#org`** with tabs. Setup (name, type, groups, target role from the eMASCO list), People (roster upload
  with a preview that saves nothing, join links, list with each person's Skill Match for the current and target role
  or "not available" with the missing step), Heatmap (groups by O\*NET skill and knowledge items, 6 columns a page,
  cell counts and levels short), Team plan (steps with real e-LATiH course pages and "More on <site>" search links,
  status per step), Outlook (Moderate / Rapid, band counts, who moves, estimates label) and SDG (count of links with
  reasons).
- **Employee side:** an employee opens the join link (`/#join=...`), signs in, picks a profile, sees exactly what HR
  will see (skills and levels, group, role, display name), presses Share. They can update or stop sharing. The link
  token is removed from the address bar on arrival and is not kept in `localStorage`.
- **Sample data:** `data/org/sample-roster-hr.csv`, `sample-roster-centre.csv`, `roster-template.csv`, all synthetic,
  with a manifest hash. Sample people show large gaps because a roster lists only some of a role's O\*NET items and
  "not listed = a gap" (the rule matching uses).
- **Without D1 keys** the org screens say "not available on this server" (the existing accounts check). Locally,
  `node scripts/serve-local-accounts.mjs` runs the server with a fake in-memory D1.

### Owner decisions (31 Oct) — spec §2, O1-O8
- **O1** Team data comes from both a synthetic roster ("entered by HR") and employees who join by link ("shared by
  the employee"). The sums are the same for both.
- **O2** A real workspace on the existing D1 accounts: one account owns one organisation.
- **O3** One-time join link per invite, valid 7 days; HR copies and sends it. The app sends no email.
- **O4** Gaps are measured against each person's current eMASCO role and, when set, the group's target role; needed
  levels from O\*NET through the official code chain, exactly as matching.
- **O5** Not listed = gap (level 0); "Not assessed yet" meets the level and marks the result provisional.
- **O6** HR sees only shared skills (O\*NET item and level), group, role and display name. Stopping sharing removes
  the person from every number.
- **O7** Approach 1: the server works out team numbers on every request by calling matching's service. Nothing
  computed is stored.
- **O8** Both C and D on the same screens; HR first, the career-centre type last.

### Rulings made during the build (controller)
1. The role used for the "current" team plan is the most common current code among the group's people who have a
   Skill Match (ties: lowest code); a broken chain is never the plan role. The plan and its SDG count only the people
   on that role ("For <role>: k of n people in this group"). The heatmap keeps every role.
2. People left out (broken chain, or no known skill) are also left out of band counts, "moved" and the SDG count.
3. "Moved" compares Moderate (before) with Rapid (after).
4. A roster row with a level but no skill is rejected: "skill is empty".
5. Rosters accept O\*NET skills and knowledge by exact name first, then the CV skill normaliser.
6. An employee's dry-run share preview (`dryRun: true`) is not counted in the 10-per-15-minutes limit and does not
   use the link.
7. A pending join link is forgotten on sign-out, delete and reset.
8. The share screen shows the role HR will see.
9. One share per user: sharing through a link of another organisation first removes the share with the first one
   (person and skills); the screen warns "Sharing with <B> stops your sharing with <A>."
10. A roster person whose name (ignoring case and outer spaces) is already in the organisation is rejected "already in
    the organisation" (once, at the first row) and never imported. A row with an empty group is rejected.
11. Only the latest roster preview of an owner is kept; an older previewId answers 410.
12. Skills are written in multi-row inserts of at most 33 rows (D1 binds at most 100 parameters).
13. An hr person with no current role is counted as left out of the current view ("no_current_role").
14. A pathway failure keeps the team answer: steps show "No team pick yet." without search links; the log has the code
    only.

Other points to know:
- Join and share each have their own limiter (10 attempts per 15 minutes per address).
- A roster preview is held in server memory for 15 minutes, for its owner only; import saves the accepted rows of a
  preview the owner confirms.
- Read routes beyond the spec table: `GET /api/org/roster/sample` and `GET /api/org/share`.

### Waits on the owner
- **D1 keys** for trials and the demo (`D1_*`). The price must be checked on Cloudflare's own D1 pricing page and
  stated to the owner before anything is switched on. No price or free allowance is assumed here.
- **BM / 中文 wording review** (strings marked "translation: owner review").
- **Whether the deployed site gets D1** (without it the org view is "not available").
- **Merge decision.**

### Open points (known gaps, none fixed)
- Roles in a group whose target nobody holds yet show the code only (no title).
- The plan says "raise to <level>", not "from -> to" (the data holds no "from" level per step).
- D1's REST API has no transactions, so a database failure in the middle of an import or a share can leave a partial
  write.
- Roster previews are in memory (lost on restart); one per owner.
- Small wording points: "1 people" in the moved list; the share confirmation doubles a full stop when the display
  name ends with one; the heat grid shows small white diamond artefacts between cells.

## Not allowed (project rules)
- No method from the old project and none from the claude.ai prototype (no 0.60 / 0.25 / 0.15 weights, no "x 1.3"
  estimate, no invented scenario multipliers, no hours).
- No language model anywhere in this module.
- No word or AI linking between eMASCO and O\*NET.
- Trends and AI scenarios never change the gaps, the cells or the plan order.
- Nothing beyond the approved diagram and spec.

## Commands
```bash
npm test                                      # 1297 passed
python -m unittest discover pipeline/tests    # 49 OK
npm start                                     # http://localhost:3200, tab #org
node scripts/serve-local-accounts.mjs         # local server with a fake in-memory D1
```

## Where things are
| What | Where |
|---|---|
| Pure team sums (cells, columns, plan, bands) | `shared/org/team.js` |
| Roster check, store, service, routes | `server/org/` (`csv.js`, `roster.js`, `rosterSkills.js`, `store.js`, `service.js`, `routes.js`, `shareRoutes.js`) |
| D1 tables | `server/store/migrations.sql` (`orgs`, `org_groups`, `org_people`, `org_skills`, `org_invites`, `org_plan_steps`) |
| Screens | `public/js/screens/org.js`, `orgParts.js`, `orgShare.js`; API and actions `public/js/orgApi.js`, `orgActions.js` |
| Data | `data/org/` (synthetic rosters, template, manifest) |
| Tests | `tests/org/` |
| Docs | `docs/org/acceptance.md`, `docs/hr/guide-check.md`, `data/SOURCES.md`, `docs/tools-declaration.md`, `docs/build-record.html` |

## Reused, unchanged
`data/emasco/role_details.json`, `data/radar/occupation-bridge.json`, `data/onet/requirements.tsv`, the Radar export,
`data/ai/`, `data/sdg/`, `data/pathway/picks.json` and `sites.json`; matching's service (`server/matching/`) and the
study pathway's picks (`shared/pathway/picks.js`).
