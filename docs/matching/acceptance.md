# Career matching: acceptance

Date: 30 Oct 2026 · Branch `claude/career-matching` at `a7f2c33` (before this docs commit)

## Test counts

| Suite | Command | Result |
|---|---|---|
| App tests (Vitest) | `npm test` | 766 passed (66 files) |
| Python pipeline tests | `python -m unittest discover pipeline/tests` | 48 tests, OK |

## How the browser check was run

- The app ran from this branch with `node server/index.js` on port 3220 and was opened at
  `http://matching.localhost:3220`, an address nobody else uses. The admin store was in memory (`RADAR_STORE=memory`);
  the trial admin and demo keys were kept in a file outside the repo.
- Synthetic profile (no real person): Diploma, ISCED-F 0613 Software and applications development and analysis;
  skills Programming (good), Critical Thinking (not assessed), Reading Comprehension (not assessed), Computers and
  Electronics (good), Mathematics knowledge (basic), English Language (good), Systems Analysis (basic), Python
  (software).
- The check was done by the controller, not by the person who wrote the docs. Nothing was pushed or merged.

## Results

| # | Check | Result |
|---|---|---|
| A1 | The `#match` screen loads with the confirmed profile (the matching request answers 200) | PASS. The first load takes about 5 seconds because the data files are read once. |
| A2 | "Not ready yet" state while the BLS files are absent | PASS. The note says Skill Match is not available yet for any role and waits for the ISCO-08 code list in the BLS ISCO file (1812 roles). Roles, outlook and SDG tags still show. |
| A3 | Size of the role list | PASS. 1812 roles under "Explore all roles". 2 roles without a title are hidden. |
| A4 | "In your field" | 0 roles. Expected today: the field link goes ISCED-F, then CIP, then O\*NET, and roles reach O\*NET only through the code chain that still waits for the BLS files. |
| A5 | Bands today | All 1812 roles sit in band 4, "Not enough evidence yet", under Moderate. No O\*NET job is linked, so there is no Anthropic data, and the DOSM groups are not sufficient because the 2025 Q3 break is not reviewed yet. Expected. |
| A6 | Card details ("Show outlook and details") for 2512-01 Software Developer | PASS. Job ads: "not enough evidence", MASCO 2020 major group 2, "group level, not this job", DOSM 2026 Q2 with the release link. The path reads eMASCO 2512-01, then MASCO 2020 major group 2. AI: "not available, no O\*NET job is linked to this role yet". Software: "list not available". Skill Match: "Not available", missing step "MASCO 2020 2512: waits for the ISCO-08 code list in the BLS ISCO file". |
| A7 | Phone width, 360 px | PASS. No sideways scroll. The Skill Match panel sits above the details. |
| A8 | Admin sign-in and the SDG review card | PASS. The card "SDG links (career matching), team draft: owner review" shows each group code with three eMASCO role titles, the official target wording, the reason, Approve and Reject buttons and a required note. |
| A9 | Approve link g25-9.c | PASS. "Decision saved." and the status shows Approved. |
| A10 | The SDG tag on the career screen after approval | PASS after a full page reload. Role 2512-01 shows "SDG 9", and the filter lists the official UN goal title. Without a reload the already-loaded list keeps its old tags (minor). |
| A11 | "Choose this role", then the `#sdg` tab | PASS. "Your chosen path": Software Developer, MASCO 2512-01, "potential, not measured", "This path links to SDG 9 (1 link)", target 9.c in the official wording, reached via the role (MASCO group 25), the reason, "team draft, approved by owner on 2026-10-30" and the source line UN Statistics Division SDG API. |
| A12 | Browser console | Only a 503 from `/api/auth/me` (accounts are not set up on this machine; existing behaviour). No errors from matching. |
| A13 | Percentages, chart, "What would raise it", scenario switch, judge change test | Not visible on real data until the BLS files exist. Covered by automated tests that build a small fixture code chain (`tests/matching/routes.test.js`, `tests/matching/matchScreen.test.js`). **Not checked in the browser on real data.** |

## What this means

- Works today on real data: role list, eMASCO card text, DOSM job-ad group evidence, honest "not available" messages
  that name the missing step, SDG tags, the SDG path tab and the owner approval of SDG links.
- Waits for the owner: the two BLS crosswalk files. Then Skill Match percentages, the chart, "What would raise it",
  the code chain, Rapid AI and "In your field" can be checked in the browser. This check must be repeated then.
- Minor: after approving an SDG link, reload the page to see the new tag.

## Owner UI round, 31 Oct 2026 (real data, BLS chain built; own server on http://127.0.0.2:3231, test profile with field 0613)

| # | Check | Result |
|---|---|---|
| U1 | Switch to Rapid AI | PASS. One line, no role names: "Switching to Rapid AI moved 400 roles from “AI may change much of this job (this scenario)” (group 2) to “Not enough evidence yet” (group 4); 73 roles from “Not enough evidence yet” (group 4) to “AI may change much of this job (this scenario)” (group 2). Skill Match numbers did not change." |
| U2 | Pages | PASS. 98 roles in your field, 1714 to explore; 10 cards per band page; pagers such as `‹ 1 2 … 155 ›`; page 2 button works; "Go to page" 999 shows the last page (155) and focus moves to it. |
| U3 | Show / Hide outlook and details | PASS. The button turns to "Hide outlook and details"; Job ads, AI in this job and Software asked sit in three columns at desktop width and stack at phone width (375 px, no sideways scroll); "Why this match?" is its own fold; source lines kept. |
| U4 | AI on the closed card | PASS. Moderate: "estimate AI does the task in 60.9% of observed use (Anthropic Economic Index)" with a bar; Rapid: "estimate GenAI exposure 57% · ILO group 3 of 4 (ILO WP140)" with a bar. |
| U5 | SDG tags (M16) | PASS. Cards show "SDG 9 team draft, not yet reviewed" with a link to https://sdgs.un.org/goals/goal9; `#sdg` lists every shown link (e.g. SDG 4, 6 links), each goal row links to its UN page, and the source line names the UN SDG site. |
