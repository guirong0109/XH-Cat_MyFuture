# Organisation view: acceptance

Date: 31 Oct 2026 · Branch `hr-branch` · Checked by the controller in the browser pane.

Server: `node scripts/serve-local-accounts.mjs` (fake in-memory D1), PORT 3250, opened at `http://org.localhost:3250`
(an address no one else uses; the project's other trials use their own `*.localhost` ports). Made-up accounts only.

## Test counts

| Suite | Command | Result |
|---|---|---|
| Vitest | `npm test` | 1256 passed (91 files) |
| Pipeline | `python -m unittest discover pipeline/tests` | 49 OK |

## Browser results

| # | Check | Result |
|---|---|---|
| 1 | Sign up as HR, create organisation "Sample Logistics Sdn Bhd" (type HR) | Pass (201, 201) |
| 2 | Sample roster preview | Pass: 60 rows accepted, 0 rejected, 1 not recognised ("Excel wizardry"), new groups Finance / Customer Service / Operations; nothing saved before Import |
| 3 | Import | Pass: 12 people, 3 groups |
| 4 | Setup screen | Pass: groups with "4 staff", target role picker, source line "target roles from eMASCO (MOHR), crawled 23 Oct 2026", hiring sentence |
| 5 | Heatmap | Pass: 38 O\*NET columns paged 6 at a time, cells "N of M / avg X short", legend in levels, banner "1 left out of the sums" (Store Executive 2182-03, chain stops at MASCO → ISCO-08), source line O\*NET 31.0 |
| 6 | Team plan | Pass: steps ordered by people short, "N people short (M missing, K below) · X levels short · raise to <level>", real e-LATiH course pages (e.g. https://elatih.hrdcorp.gov.my/courses-details/microsoft-office-basics) and "More on" search links (e-LATiH, Coursera, edX, Khan Academy, Microsoft Learn, Google Skills), "Time: see each course page.", status per step, sources with dates. (Changed after the run, covered by tests: in the current view the plan and its SDG count only the people on the plan role, the most common role with a Skill Match, and say "For <role>: k of n people in this group".) |
| 7 | Outlook Moderate ↔ Rapid | Pass: band counts change (Customer Service 0/2/0/2 → 0/3/0/1), "Moved between Moderate and Rapid" list, ESTIMATES label, "Scenarios change only these counts…", AI and job-ad sources with dates |
| 8 | SDG contribution | Pass: "Planned skills for <group> touch N links across G goals. A count of links with reasons, never a score.", each link with reason and "team draft, not yet reviewed", "potential, not measured" |
| 9 | Join link (owner) → employee | Pass: link made; employee opened `/#join=…`; token removed from the address bar and absent from localStorage; screen showed exactly Mathematics (good) and Economics and Accounting (basic), "Not shared: Microsoft Excel (not an O\*NET skill or knowledge item)", group; after Share the server held only el/kn keys + levels, group and display name. (The role line was added after this run by the Task 10 fix; covered by route and render tests. Changed after the run, covered by tests: an existing share shows what HR holds now and the new list under "After Update"; a link from a second organisation warns that sharing moves the one share there.) |
| 10 | Phone width 360 px | Pass: setup, people, heatmap, plan, outlook: no sideways scroll |
| 11 | Career centre organisation | Pass: sample centre roster 61 accepted / 0 rejected / 1 not recognised, programmes Business Studies / Customer Service / Logistics; screens say Students, Programme, Cohort plan; "current role" appears on no screen; outlook "by target role"; band counts change between scenarios |
| 12 | Judge "change the trend data" test | **Not run in the browser** (needs the Radar demo key); covered by `tests/org/service.test.js` (band counts change, heatmap and plan do not) |
| 13 | Stop sharing / account deletion | **Not run in the browser**; covered by `tests/org/share.test.js` |

## Notes for the owner (small, not fixed)

- The plan text says "raise to <level>" (the data has no "from" level).
- "1 people" grammar in the moved list.
- The share confirmation doubles a full stop when the display name ends with one.
- The heat grid shows small white diamond artefacts between cells.
- The sample people show large gaps because a roster lists only some of a role's O\*NET items; "not listed = gap" is
  the rule matching uses.
