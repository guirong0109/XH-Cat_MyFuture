# Future Skills Radar Round 1 — browser acceptance

Date: 30 Oct 2026 · Branch `claude/future-radar` at `b827742` · Spec §15 (browser acceptance list)

## How it was run

- App started from a clean worktree with `node server/index.js`, `PORT=3295`, `RADAR_STORE=memory` and throwaway test
  keys (`RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`, `RADAR_SESSION_SECRET`) set only in the process environment. No `.env`
  file, nothing written to the repo. Server stopped afterwards.
- Browser: the Claude desktop app's browser pane (Chromium). Pages were opened on `http://radar.localhost:3295`
  (a `.localhost` name points at this machine). The public API was also checked on `http://127.0.0.2:3295`
  (`GET /` 200, `GET /api/radar/manifest` 200 with `devStore: true`).
- Widths: desktop (1090 px pane) and phone (375 × 812, mobile emulation). Languages: English, Bahasa Melayu, 中文.
- On first use the memory store was seeded from the bundled data (server log: `seeded prod from the bundle`).
- Test profile, built through the app's own form as a guest (Working adult → no CV → form):
  two fields of study (ISCED-F 0613 Software and applications development and analysis; ISCED-F 0913 Nursing and
  midwifery), one job (Software developer, linked by the user to O\*NET 15-1252.00 Software Developers), one role of
  interest (Data Scientists, O\*NET 15-2051.00). Confirmed on the review screen.

Result: **27 of 28 checks passed, 1 failed** (phone width on the Skills & Careers tab, F1). F1 is now fixed and
rows 27-28 were re-checked at 360 px (spec §15 width): **28 of 28 pass**. Details below.

## Results

| # | Check | Result | Note |
|---|---|---|---|
| 1 | Skills & Careers tab is first and opens by default (D21) | Pass | Tab order Skills & Careers, AI Impact; B1 shown on first open |
| 2 | Dev-store banner on every Radar screen (spec §7) | Pass | "Development store — not durable" on `#radar`, `#admin`, `#judge`, in EN, BM, 中文 |
| 3 | Source status cards with five state dimensions (§11.1, §12) | Pass | Availability, Freshness, Last refresh, Served from, Comparability for OpenAlex and DOSM; DOSM shows "next release expected 2026-11-18" |
| 4 | Own-fields default with no approved links yet (§11.2) | Pass (note) | Nothing in the profile reached a DOSM group or an approved AI topic, so the global view showed with "Add your field of study or roles to see what relates to you". This follows the spec ("no linked items → global view"), but the wording reads odd when the user has fields and roles. See note N1 |
| 5 | Own-fields default after one approval (06-language) | Pass | Skills & Careers: B1 says "None of your jobs or roles reaches a DOSM group yet" (ISCO-08 → MASCO step pending); B2 research column lists only Language Models & Text AI; field explorer lists both fields with jobs (official crosswalk), "Not mapped to a DOSM group yet" per job, and the approved topic for 0613 only ("approved at broad field level · 06-language"); 0913 says "Insufficient verified connections for this field". AI Impact: table marks Language Models & Text AI "From your profile"; personal summary shows only that axis |
| 6 | "View all" is the last item of each tab and opens everything | Pass | Last element on both tabs; opens all nine DOSM groups / all six topics; button turns into "Back to my profile only" |
| 7 | DOSM interim display (D18) | Pass | Banner "Insufficient Comparable Evidence" with the reason (possible structural break in 2025 Q3, until reviewed or 2026 Q3 data); latest shares and counts per group; "—" for year-on-year; total 555,509; Technicians 86,512; "Quarter-on-quarter change … — context only: −11.4%" with the note that it never classifies anything; Elementary shows "Insufficient evidence" |
| 8 | B1 drill-down: evidence panel with links (§11.5) | Pass | Professionals: source, period, published, fetched, manifest and snapshot ids, metric and unit, values ("Not compared: the two quarters straddle a possible structural break"), formula with numbers, rule, thresholds, break 2025 Q3 not reviewed, revisions, versions, limitations; links to the DOSM release page and data file |
| 9 | Radar drill-down with links (AI Impact) | Pass | Service AI point → evidence panel: official title, OpenAlex description, 1,786 → 8,114, formula clamp(50 + 20 × log2(8,114 ÷ 1,786)) = 93.7, rule text, steps, volatility, thresholds, CS reference (551,250 → 906,207, +64%), share view 79.3; links to openalex.org/T12128, api.openalex.org topic and works query |
| 10 | Keyboard through the radar points | Pass | Tab moves Share of Computer Science → Language Models (83) → Generative Media (81) → … → Service AI (94) → the evidence buttons; Enter on a point opens the panel with focus on it; Tab stays in the panel (Close, then links); Escape closes and focus returns to the same point |
| 11 | Keyboard on B1 rows | Pass | Each group is a button "Show the evidence: …"; Escape returns focus to that row |
| 12 | Admin: sign in | Pass | Key box (password field), optional reviewer name; "Signed in as admin · session ends in 60 min" |
| 13 | Admin: wrong key role | Pass | Judge key in the admin box (tried in 中文) → "您没有权限执行此操作。 not_allowed"; server log only `sign-in refused: not_allowed` |
| 14 | Admin: decision needs a note | Pass | Reject without a note → "A reviewer note is required for every decision. Nothing was sent." |
| 15 | Admin: approve one field ↔ topic proposal with a note | Pass | 06-language approved; status "Approved · acceptance-test · time"; decision history row with the note. Correction: at the time of this run a field ↔ topic decision published no manifest (it only changed the references); the new data version (`manifest-…074330…`) came from the break review recalculation (row 17 log: `reviews · activate · published`). Since the fix `mappingVersion includes field-topic decisions`, a field ↔ topic decision is applied by the same recalculation and publishes a new manifest whose `mappingVersion` names the decisions (Vitest; not re-run in the browser) |
| 16 | Admin: reject one proposal with a note | Pass | 10-robotics rejected; listed in the history |
| 17 | Admin: annotate the 2025 Q3 possible break | Pass | Note shown under 2025 Q3 with the evidence links (release page Q3 2025 and the archive listing); status stays "Not reviewed yet" (an annotation is not a decision); history row "dosm:2025 Q3 · Note added". The listing shows the title change (Q2 2025 "… and My Job Profile", Q3 2025 without it) as evidence, not a cause |
| 18 | Admin: status with five states, conflicts, orphans, log | Pass | Same five state rows as the public cards; Conflicts 0; Orphan objects 0; recent log `reviews · activate · published` with the manifest id |
| 19 | Admin: cleanup | Pass (limited) | With 0 orphans the Clean up button is disabled, so no cleanup ran. The cleanup itself is covered by the Vitest tests; no orphans can be made from the screens |
| 20 | Judge: sign in | Pass | "This test session ends in 120 min."; synthetic-data label |
| 21 | Judge: Scenario A (class change) | Pass | Professionals 2026 Q2 10,600 → 12,000: Stable (+0.60 pp, +6.0%) → Rising (+2.00 pp, +20.0%, 3 of 3 clean steps). Checked by hand: 9,600/96,000 = 10.00% → 12,000/100,000 = 12.00%. Affected: group 2 and 559 jobs (group level); fields none; skills "insufficient evidence"; "Career rankings are not part of this module yet." |
| 22 | Judge: Scenario B (break) | Pass | Factor 1.8 on the total and groups 1, 2, 3, 4, 5, 7, 8 in 2026 Q2: "Possible structural break 2026 Q2 · Total q/q +81.8% · Groups same way 7/9"; every group listed under "Comparisons that became insufficient comparable evidence" |
| 23 | Judge: invalid edit refused | Pass | Managers 2026 Q2 = 200,000 (above the total) → "validation_failed … total_below_groups 2026 Q2"; synthetic manifest stays demo-manifest-0 |
| 24 | Judge: Reset | Pass | "Reset to the synthetic base."; demo-manifest-0; Professionals 2026 Q2 back to 10,600; report "No change" |
| 25 | Judge never changes production | Pass | `GET /api/radar/manifest` before and after the judge runs: same `manifest-20261030T074330.482Z-1ea3dfae` |
| 26 | Languages EN / BM / 中文 | Pass (notes) | `#radar`, `#admin`, `#judge` all translated, including rule texts and reasons. Source names stay as published (OpenAlex titles, DOSM English group names), as the spec says. See note N3 |
| 27 | Phone 360 px: AI Impact, evidence panel, admin, judge | Pass | Re-checked at 360 px after the F1 fix (30 Oct): `document.documentElement.scrollWidth` = 360 on AI Impact (own view and View all), the evidence panel (opened from Skills & Careers and from AI Impact), `#admin` (signed in) and `#judge` (signed in), in EN, BM and 中文. Wide tables (break review, judge grid) scroll inside their own box; evidence panel fills the screen |
| 28 | Phone 360 px: Skills & Careers | Pass (after fix) | Failed at 375 px (F1); fixed by letting source links wrap in source lines and evidence panel lists. Re-checked at 360 px: scrollWidth 360 in EN, BM and 中文, default view and View all; the B1 source line ends at 325 px. With the old `nowrap` forced back the page was 445 px wide again |

## Failure (fixed)

**F1 — Skills & Careers overflows at phone width (all three languages).**
At 375 px the page is 445 px wide, so the whole page scrolls sideways. Cause: in the B1 source line
(`.rd-srcline`), the link "DOSM release page: Big Data Analytics: Job Market Insights, Second Quarter of 2026"
(`a.rd-src`) has `white-space: nowrap` and is 410 px wide. Same in EN, BM and 中文 (the link text is the DOSM title in
English), in both the own-fields view and "View all". The AI Impact tab, admin and judge screens stay at 375 px.

**Fixed** (commit `fix: Radar fits a 360 px phone`): `public/styles.css` now lets `.rd-src` links wrap
(`white-space: normal; overflow-wrap: anywhere`) inside `.rd-srcline` and the evidence panel's `.rd-list` / `.rd-kv`;
number-plus-link tags elsewhere keep `nowrap`. Re-check at 360 x 780 (browser pane, guest without a profile, so the
global view, plus View all; `RADAR_STORE=memory`, throwaway keys in the process environment only): every screen in
rows 27-28 has `scrollWidth` = 360 in EN, BM and 中文.

## Notes (not failures)

- **N1** — With fields and roles in the profile but no approved link or mapped group yet, the screen shows the global
  view with "Add your field of study or roles to see what relates to you". This matches the spec's rule (no linked
  items → global view), but the user already added them; a clearer sentence would help. For the owner to decide.
- **N2** — After an admin decision in the same tab, going back to `#radar` kept showing the previous data version until
  the page was reloaded (the public screen holds the data it loaded). A reload showed the new version and the new
  highlighting. **Fixed** (commit `fix: Radar reloads after admin decisions`): a successful decision, refresh or
  clean-up drops the Radar data in that tab, so `#radar` loads afresh (checked in the browser: going back to `#radar`
  after a decision fetched the references again).
- **N3** — In BM and 中文 the source link labels "DOSM release page: …" and "DOSM data file: Data JMI" stay in English
  (they come from the stored snapshot). The site header's "CV and profile module · synthetic data only" label also
  stays in English (existing header, not Radar).
- **N4** — In the judge report some rule texts print a hyphen for negative numbers ("-0.20 pp (-2.3% …") while the
  value line uses a minus sign ("−0.20 pp").
- **N5** — Admin and judge share one session cookie, so signing in as judge ends the admin session in that browser
  (and the other way round). Expected from the spec's design (one `fr_radar` cookie per role sign-in).
- **N6** — The server log held only codes and ids (`seeded prod from the bundle`, `review recorded`,
  `reviews activate published`, `demo request failed: validation_failed`, `sign-in refused: not_allowed`). No keys,
  cookies or profile data.
- Not run: admin "Refresh OpenAlex / Refresh DOSM" (they fetch from the live sources; not part of the acceptance list).

---

# Profile charts: browser check, 31 Oct 2026

Date: 31 Oct 2026 · Branch `claude/future-radar` at `76f2ac0` · Spec `2026-10-31-radar-profile-charts-design.md` (D28-D33)

## How it was run

- `node server/index.js` (radar-trial, port 3210), opened on its own address
  `http://check.radar.localhost:3210/#radar`, so its saved progress is separate from the owner's `radar.localhost`.
  Guest, confirmed profiles set in local storage.
- Widths: desktop and phone 375 px (light theme). Desktop dark theme. Languages: English, plus Bahasa Melayu for the AI card.

## Results

| Profile | Skills & Careers card | AI Impact card |
|---|---|---|
| O*NET 15-1252.00 Software Developers | 8 corners (1 Python ... 8 Linux). The Corners switch gives 8 / 16 / 30 / All (29); 30 rows listed. Rows read "814,960 O*NET Hot Technologies ads · 2025". Legend and the note "One year so far" shown | 8 corners T1-T8. "Generative AI exposure ... Gradient 3 for ISCO-08 2512 (mean task score 0.53)" with the ILO link. "8 of 17 O*NET tasks...". T1 row: "AI does it 69.12% · AI helps 30.88% · 0.20% of all conversations", release 2026-06-26, April-May 2026, Hugging Face link |
| O*NET 13-2011.00 Accountants | 6 corners (Office 3,421,542; Excel 3,211,598; Outlook 1,712,260; PowerPoint 1,618,650; SAP 534,138; QuickBooks 174,071). The shape differs from the developer's | Not re-checked in the browser (covered by tests: 11 tasks) |
| eMASCO 2512-02 IT Systems Architect | 8 corners. The code chain is printed: MASCO 2020 2512 → ISCO-08 2512 (code match, not an official table) → SOC 2010 15-1132, 15-1133 → SOC 2018 → O*NET 15-1252.00, 15-1253.00, each step with its source link. Note: eMASCO roles in the same 4-digit group share one O*NET link. Rows read "From: ... (eMASCO 2512-02)" | n/a |
| O*NET 29-1141.00 Registered Nurses + eMASCO 1121-01 | "O*NET lists no in-demand software for Registered Nurses (29-1141.00) (O*NET database 30.3). No chart is drawn." and "Not available for eMASCO 1121-01: the code chain stops at MASCO 2020 1121 has no link in the next official table. No O*NET job is guessed." with its source | Bars instead of a polygon (2 tasks, T1 and T2, "under 0.01% of all conversations"). "Not exposed for ISCO-08 2221 Nursing Professionals (mean task score 0.25)". Same chain-stop note |

Interactions:
- Typing "git" in the skills search kept focus and the caret (caret 3). The list showed 10 Git and 19 GitHub with their
  original list numbers.
- Corner click jumping to its row, and Enter on a focused corner: covered by tests, not repeated by hand.
- Phone 375 px, light: no sideways scroll on either tab (`scrollWidth` = `innerWidth`); the AI radar labels fit.
- Desktop dark theme: both charts readable.
- Malay: AI card headings and the exposure line are translated ("Bagaimana AI digunakan dalam tugas pekerjaan anda",
  "Gred 3", "Bucu").

## Notes (not failures)

- **P1** - The "100%" ring label sits close to the T1 corner label on the AI radar. Small; not changed.
- **P2** - Existing, found in this check: the "Your profile" card still shows "Add your field of study or roles to
  see what relates to you" for a profile that has an O*NET role. That hint looks only at DOSM groups and topics, so it
  now contradicts the two new cards. For the owner to decide (same family as N1).
  **Settled 31 Oct 2026:** the owner asked to remove the "Your profile" card; it is gone (checked in the browser at
  radar.localhost:3210: no card, no console errors from the Radar).
- **P3** - The dashed earlier-year line (Hot Technologies) cannot be seen yet: only one yearly snapshot is served, and the
  chart says "One year so far".
- **P4** - The eMASCO code chain works at the 4-digit unit, so every eMASCO role in one unit gives the same chart. The
  screen says so. Limit set by the official tables (D29).
- Not checked in the browser: BM and 中文 on the Skills card, the Accountant AI card, and a real keyboard Enter on a corner.

## AI usage question and AI tasks scatter (D34-D42), 31 Oct 2026

Checked on http://127.0.0.2:3210 (an address nobody else uses), server `radar-trial`, a test profile set up in that
browser only: confirmed, one O\*NET job (Software Developers 15-1252.00), no AI usage answer yet.

| # | Check | Result |
|---|---|---|
| Q1 | Opening the Radar without an answer shows only the question card (header and banner stay; no tabs, no source cards) | Pass |
| Q2 | 10 categories in the owner's order with examples, "none of these", source line and privacy line | Pass |
| Q3 | Continue is off with nothing ticked; one click on a box or on its label ticks it once; Continue then turns on | Pass |
| Q4 | "None of these" clears the ticks; a tick clears "none" | Pass |
| Q5 | Continue saves `{status:'answered', picked:['data'], date}`; the profile stays **confirmed** and the charts show | Pass |
| Q6 | After a reload the card does not come back; "Change my AI use answers" sits under the title | Pass |
| Q7 | Change reopens with the saved tick; a new tick then Skip keeps the earlier answer (`['data']`) | Pass |
| Q8 | No Radar request carries the answers: every request is a GET with only the manifest id | Pass |
| S1 | AI Impact draws the scatter (no spider web): 8 dots, switch "Tasks shown" 8 / 16 / All, dashed 50 % line, log ticks, "under 0.01 %" band, both side labels | Pass |
| S2 | Enter on a focused dot highlights its list row | Pass |
| S3 | 1280 px, 588 px and 360 px: no sideways scroll; the card fits at 360 px (16 px gutters) | Pass |
| S4 | Dark mode: card and scatter follow the theme | Pass |
| F2 | Found here: between about 560 and 760 px the list rows squeezed the task text to one letter per line (already so before today) | Fixed: rows stack up to 760 px (43e1691) |

Notes for the owner:
- **N7** - Dots at the same place overlap and their labels can touch (here T5 and T6, both near 45 % and 0.01 %). The spec
  keeps real values with no jitter (D42); the list under the chart holds every value.
- **N8** - At 360 px the scatter is shrunk to fit, so its small labels are hard to read; the list under it is readable.
- Console errors: only `/api/auth/me` 503 (accounts are not set up on this local server). None from the Radar.
- Not checked by hand: BM and 中文 on the card (covered by tests), a screen reader.

