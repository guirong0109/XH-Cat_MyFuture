# Study Pathway: acceptance

Date: 31 Oct 2026 · Branch `claude/study-pathway` at `7e039d7` (before this docs commit)

## Test counts

| Suite | Command | Result |
|---|---|---|
| App tests (Vitest) | `npm test` | 920 passed (73 files) |
| Python pipeline tests | `python -m unittest discover pipeline/tests` | 49 tests, OK |

## How the browser check was run

- The controller ran the app from this branch with `node server/index.js` (launch entry "pathway-trial") on the real
  `data/`. The address was `http://pathway.localhost:3241`. The launcher accepts only a `localhost` name, not
  `127.0.0.2`, and port 3240 was taken, so 3241 was assigned. Nobody else uses this address, and it keeps its own saved
  progress. The start-up check of the pathway data passed with the real picks.
- Test profile (guest, built through the form): Fresh graduate; Bachelor degree; field of study "Software and
  applications development and analysis" (ISCED-F 0613); skills Critical Thinking = good, Programming = basic,
  Technology Design = not assessed yet.
- The check was done by the controller in the browser pane. The person who wrote these docs copied the notes and ran no
  extra checks. Nothing was pushed or merged.

## Results

| # | Check | Result |
|---|---|---|
| 1 | `#match` cards show an enabled "Plan my study pathway" button (20 on the first page) | Pass |
| 2 | Plan a pathway from a card (Information Systems Executive, 2512-03) opens `#pathway` with one target tab | Pass |
| 3 | Role header: Skill Match 11%, "17 to build · 0 started · 0 done"; compared with O\*NET job Software Developers (15-1252.00) | Pass |
| 4 | Provisional note for the 1 "Not assessed yet" skill | Pass |
| 5 | P14: "Usual education level" shows eMASCO "Bachelor's degree or equivalent" (eMASCO, Malaysia, with the eMASCO link) first, then "In the US: Bachelor's Degree, 84.8% of workers in this job who were asked" | Pass |
| 6 | Fields of study (0322, 0588, 0610, 0613 marked "your field", 0619, 0688, 0714) with real accredited programmes (e.g. UTM "Bachelor in Software Engineering with Honors", MQA ref MQA/SWA0770), the MQA register link "choose NEC field ..." with "code match, not an official table", the MBOT professional qualification, "Courses to start with" and "More on" chips | Pass (see Finding A) |
| 7 | Part 2: 17 skills, biggest gap first (1 Computers and Electronics +9 points, "expert still leaves a gap"; 2 Reading Comprehension +6; 3 Active Listening +6 ...), each with real course links and "More on" links; Started / Done labelled self-reported | Pass |
| 8 | P15: no "team draft" or "not yet reviewed" text anywhere on `#pathway` (English, Bahasa Melayu, 中文) | Pass |
| 9 | All 226 external links open in a new tab with `rel` noopener | Pass |
| 10 | Started on step 1: button pressed, header "1 started"; saved in the browser (`futureready-profile-v1`) | Pass |
| 11 | Add a second target (Information Technology Systems Architect, 2512-02): two tabs; the shared skill shows "1 started" there too (progress is per skill) | Pass |
| 12 | Remove the first target: one tab left, "1 started" kept | Pass |
| 13 | `#roadmap` opens `#pathway` (address becomes `#pathway`, screen "Study pathway") | Pass |
| 14 | Phone width 375 px: page width 375 = viewport, no sideways scroll; intro text fits (right edge 359); the sources table scrolls inside its own box; only the app's existing top tab strip is wider (same on every screen) | Pass |
| 15 | Bahasa Melayu ("Laluan pengajian") and 中文 ("学习路径") render; no raw `pw...` keys | Pass |
| 16 | API: Accountant 2411-01 gives qualification "Bachelor's degree or equivalent", US education Bachelor's Degree 77.48% (from the O\*NET job matching chose), fields 0411 (your field) with 1 programme and 2 professional bodies, 0412, 0419 | Pass |
| 17 | API: broken chain, Legislator 1111-01: `reason: chain_broken`, missing step "the linked O\*NET jobs have no skill data", `route` and `steps` null, `qualification` present (text null: eMASCO lists none for this role; the screen says so) | Pass |
| 18 | API: unknown role gives 404 | Pass |

## Not run

| # | Check | Why |
|---|---|---|
| 19 | `#admin` approve and reject a pick | Not run in the browser. This trial server has no admin key (`RADAR_ADMIN_KEY`), so admin is not available here. Covered by `tests/pathway/picksAdmin.test.js` (11 tests). |
| 20 | Dark mode | Not inspected by eye. All `.pw-*` colours use the app's CSS variables (task 8 review). |

Also not covered in the browser run: the 360 px width was checked at 375 px (the phone preset), and a thin profile
(no percentage) was not tried on the screen.

## Finding A (for the final review)

The MQA hint "choose NEC field <ISCED code>" uses the ISCED code. Malaysia's NEC code differs for some fields (for
example ISCED 0611 is NEC 0614, and 0712 is NEC 0717), so the hint is wrong for those fields. It is in the build
ledger and is to be fixed in the final whole-branch review: map the code or drop it.
