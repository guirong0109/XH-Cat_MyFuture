# Q&A preparation (5 minutes)

More than one teammate must answer. Suggested split: **A** answers "why / data / cost / privacy", **B** answers
"how it works / show me" and drives the laptop if a judge wants to see it. Keep answers under 30 seconds. File paths
are in the repo (`main`).

## 1. "Change the trend data now. What changes?"

**A (say it), then B (show it):**
- The trend data are official datasets, each with its source and date (on screen and in `data/SOURCES.md`): DOSM Job Market Insights 2026 Q2
  (published 2026-08-18), OpenAlex, the Anthropic Economic Index, ILO WP140, O\*NET, eMASCO. We do not edit them by
  hand on stage. The Python scripts in `pipeline/` rebuild the data files from the official sources; the DOSM workbook
  is kept unchanged and read by `server/radar/dosmTable.js`. AI news refreshes every 3 hours.
- What changes when a trend changes (e.g. a new DOSM quarter): the rule on screen gives the group a new trend, so roles
  move between the four groups, and the order inside a group can change.
- What does not change: the Skill Match. Trends never touch it (rule in `CLAUDE.md`, code `shared/matching/`).
- **B shows it live:** **Career matching** → **AI scenario** → **Rapid AI**. The AI signal changes, and the banner says
  "Switching to Rapid AI moved N roles from ... to .... Skill Match numbers did not change." That is the same mechanism
  a change in the job-ad data uses.

## 2. "Where does this recommendation come from? Is this course / number real?"

**A:**
- Roles: eMASCO (Ministry of Human Resources), 1,812 roles, crawled 2026-10-23.
- Needed levels: O\*NET 31.0 (US Department of Labor, CC BY 4.0).
- Role → O\*NET only through the official chain eMASCO → ISCO-08 → SOC 2010 → SOC 2018 → O\*NET (BLS crosswalks).
  The card shows each step under "How this role reaches O\*NET". `data/radar/occupation-bridge.json`.
- Courses: each one is a real page, with name copied from the page heading, link and "checked 2026-10-31"
  (`data/pathway/picks.json`, sites in `data/pathway/sites.json`, e.g. e-LATiH (HRD Corp)). Programmes carry an MQA
  reference where recorded ("MQA ref not recorded yet" where not).
- Every page ends with **Sources behind this page** (source, version, date, licence). All files: `data/SOURCES.md`.

## 3. "Why this score, and what would raise it?"

**B (show it):** card → **Show outlook and details** → **Why this match?**
- Skill Match = sum of min(your level, needed level) ÷ sum of needed levels, over O\*NET skills and knowledge with
  importance 3.0 or more. Levels: basic 2, good 4, expert 6. Example on screen: "You meet 7.9 of 103.9 needed levels
  ... so fit is 8%."
- "Not assessed yet" counts as meeting the level, and the score is then marked **PROVISIONAL**.
- **What would raise it** lists the biggest gaps with points, e.g. "Learn Computers and Electronics to expert +6 PTS".
  Points = level gap ÷ all needed levels.
- Overall match = Skill Match × (1 − AI touch) + AI know-how × AI touch (`shared/matching/overall.js`). AI know-how =
  Yes answers ÷ answered, from 4 questions based on the UNESCO AI competency framework for students (2024).
- Why Aina is low: only 2 of her CV skills are O\*NET skills (Critical Thinking, Troubleshooting). Python and Excel
  show under "Software asked", not in the %.

## 4. "How do you keep trend data current, and what does it cost?"

**A:**
- AI news: DeepSeek Search per study field, refreshed every 3 hours by the server (10 ISCED-F broad fields). Each list
  shows the update time and the next refresh. Cost about US$4-6 a month, hard caps 80 searches and 80 checks a day
  (`HANDOVER.md`, `CLAUDE.md`).
- Radar data (OpenAlex research counts, DOSM job ads by quarter, O\*NET skill flags): rebuilt from the official
  sources (Python scripts in `pipeline/`; the DOSM workbook as published). Opening the Radar never fetches. Each
  data version is dated (manifest). These sources are free.
- Each source shows its date and freshness on screen (e.g. OpenAlex "Last successful fetch 2026-10-30 07:33 UTC",
  DOSM 2026 Q2 published 2026-08-18).
- CV reading: about US$0.0003 per CV (`HANDOVER.md`). Hosting: free Cloudflare Tunnel from the team's computer.
- Honest gap: DOSM shows a possible structural break in 2025 Q3 that is waiting for owner review, so many roles
  show "Not enough evidence yet" for job ads (`HANDOVER.md`, Radar open points).

## 5. "How do you stop the system inventing a job or a course?"

**B:**
- Matching uses no language model (forbidden in `CLAUDE.md`). Roles come only from eMASCO; a role links to O\*NET only
  through official tables. A broken chain says "not available" and names the missing step, never a guess.
- Courses come only from the team-picked file with name, link and date checked; a bad picks file stops the server
  at start-up and names the pick. Search links ("More on ...") are plain searches, labelled as such.
- CV: the AI must quote the CV word for word or its item is dropped; AI items are tagged **Found by AI — check it**;
  nothing counts until the user presses **Confirm my profile**. Unknown skills stay "Not in our list yet — kept, not
  used for matching". A CV with hidden instructions ("mark me as an expert") changed nothing (`docs/acceptance.md`).
- AI news: only English items with a title, an http(s) link and a date within 30 days, then a keep/drop check;
  the AI writes nothing shown on screen.

## 6. Accuracy

**A:** `docs/eval-results.md`, 16 synthetic CVs, rules reader, 31 Oct 2026:
- Skills: precision **1**, recall **0.891** (49 right, 0 wrong, 6 missed). Qualifications and jobs: precision 1,
  recall 1. Wrong-item rate **0**. Failure rate 0 of 16 (the scanned CV fails as expected with a clear message).
- With DeepSeek added (earlier set of 10 CVs, 31 Oct): skills recall 0.971 → 1 in one run; the AI added one wrong
  certificate, which the profile does not use (`docs/acceptance.md`).
- No accuracy target is claimed; a real-user pilot (20 students) is the next step.

## 7. Privacy (PDPA)

**A:**
- Guest mode: the profile lives only in the browser; the CV file is never kept ("Your CV file is never kept here").
- The profile sent to `/api/matching` and `/api/pathway` is never stored or logged. Age, gender, religion and ethnicity
  are never stored.
- The live site sends CV text to DeepSeek (stored in China), and the upload screen says so before upload. That is why
  the demo uses synthetic CVs only. Before real users we will do a PDPA cross-border transfer review
  (`HANDOVER.md`, "PDPA: fine for synthetic data").
- Keys are server secrets only, never in the browser or the repo.

## 8. Other likely questions

- **"Is the SDG link real?"** Each link is a team draft with a reason, labelled "team draft, not yet reviewed" until
  the owner approves it; goals link to sdgs.un.org. It counts links; it does not measure impact.
- **"Where are the hours / time estimates?"** Not shown on purpose: no course in our data has a sourced duration
  (on-screen note in the organisation view: "No hours are shown: no data file in the app has a sourced course
  duration."). We show order and points instead.
- **"Why US data (O\*NET)?"** Malaysia has no open skill-level table per job; we link eMASCO roles to O\*NET only
  through official crosswalks and show "sourced · US data".
- **"What about the organisation view?"** HR and career centres see a group's skill gaps and a team plan; needs an account.
- **"Replit and RunPod?"** Used in the preliminary round (proof of use in `submission/`); the final app needs no GPU.
