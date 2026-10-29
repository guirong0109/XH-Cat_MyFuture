# FutureReady MY (Final build) — Design

Date: 2026-10-29 · Status: approved in brainstorming (3 sections), waiting for written-spec review
Folder: `C:\Users\guiro\XH_Cat_Final` — a fresh build. **No code, screens or templates come from `XH-Cat_Domain1`; only public data files are copied (with source and date).**

Inputs (design only):
- Aiversecity Domain 1 Finalist Guide (six must-haves, rubric, live checks).
- Journey spec "Domain 1 — Complete Frontend User Journey and Functional Flow" (sections 1–16) and its clickable mockup `docs/mockup-journey.html`.
- CV and profile spec `docs/superpowers/specs/2026-10-29-cv-profile-design.md` (Cases A/B/C). Its decisions stand; its file paths and its build steps refer to the old app and are **replaced by this document**.

## 1. Goal and success

A synthetic user goes, live and in one session, from "who I am today" to "where I can be": profile (CV or form) → Future Skills Radar with sourced, dated trends → ranked roles with an explainable score and skills gap → ordered roadmap with real free/low-cost courses → SDG contribution with reasons → Moderate vs Fast AI futures. Judges can change the trend data and see results move, open any course link, and ask "why this score and what raises it".

Rules everywhere: nothing invented (unknown stays unknown); every number is labelled Sourced / Calculated / Estimate / Self-reported / Provisional; language changes only by the user; AI supports the user's decision and never decides.

## 2. Decisions (with the user, 29 Oct)

| Topic | Decision |
|---|---|
| Scope | Full finalist journey, built in milestones M1–M8 (§3) |
| Stack | React + Vite + Tailwind (browser), Express on Node ≥ 22.12 (server), Vitest. Written fresh |
| Data | Copy data files only from the old project, each listed in `data/SOURCES.md` with source URL and date |
| O\*NET | Dated O\*NET 31.0 snapshot (CC BY 4.0), labelled "snapshot", refresh script included |
| AI re-extraction | RunPod serverless open model first, Claude API backup (`claude-opus-5-5`, raw HTTP), consent first |
| Accounts | Cloudflare D1 (HTTP API) + R2 (temporary CV only, ≤ 1 day) |
| bge-m3 meaning match | **Not included** (2.2 GB model, not on Replit); rules + optional AI re-read instead |
| Packages | Only: express, react, react-dom, pdfjs-dist; dev: vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, vitest. Listed for the user's OK before `npm install` |

## 3. Milestones (each ends with a working demo)

| # | Milestone | Done when |
|---|---|---|
| M1 | Skeleton + data | `npm run dev` / `npm start` work; data copied with `data/SOURCES.md`; `GET /api/data`; EN/BM/中文 switch saved per guest; guest store; Welcome (ATM story, marked "draft copy") → access choice (guest / sign in / create account — the last two say "available in M7" until then) → returning-guest prompt (continue / start new / delete) |
| M2 | Profile (manual) | Category A/B; C/D shown as "preview — not working yet" (heatmap mock); five-section form (Study, Work, Skills, Certificates & projects, Preferences) with "prefer not to say", repeatable records, skill normaliser; review + Confirm → structured profile (§5) |
| M3 | Assessment + matching | Short quizzes for skills that have one, self-rating for the rest, save/skip; ranked roles with Current Skill Match and Future Outlook apart; "Why this score?" breakdown and "what raises it"; Provisional banner when levels are missing; "need more information" when no known skill |
| M4 | Radar + scenarios | Live refresh of OpenDOSM + OpenAlex with last-good fallback and status; source/observed/fetched dates on every signal; demand slider for the change test; Moderate/Fast switch used on every screen; Compare futures table |
| M5 | Roadmap + SDG | Target role → ordered steps (skill, why, course link, price, duration, hours); full roadmap locked until assessed (preview otherwise); progress (started / done, self-reported); SDG view: role + skill links with reasons, pathway total, "potential, not measured" |
| M6 | CV upload | Spec §6 Case A: content-based file checks (PDF/DOCX), text reading, language detection + switch prompt, rule extraction into the same form with quoted evidence; occupation picker (O\*NET 31.0 + eMASCO, four states) |
| M7 | Accounts | D1 sign-up/in/out, save/load/update with version check, delete my data, dashboard (plans, progress, "plan needs review" when trend data is newer than the plan); R2 temp CV; guest → account "save my profile to my account" |
| M8 | AI re-extraction | Consent, RunPod → Claude, evidence check, compare view with locked user edits |

Out of scope: guest→account merge options B–D (journey §12; only "save to my account"), notifications, HR/TVET tools (preview only), OCR for scans, model fine-tuning, the bge-m3 meaning match.

## 4. Layout

```
server/            index.js (start), app.js (createApp: routes, static), data.js (load data/*), errors.js (one error shape)
  trends/          opendosm.js, openalex.js, refresh.js (single in-flight, atomic write, last good kept)
  cv/              validateFile.js, zip.js, readText.js, detectLanguage.js, patterns.js, extract.js, reextract.js
  profile/         normalize.js
  occupations/     onet.js, lookup.js
  store/           d1.js, r2.js, migrations.sql
  auth.js, routes/ (profile.js, cv.js, occupations.js, trends.js, auth.js, saved.js)
src/
  lib/             score.js (all scoring maths), profileSchema.js, profileState.js, profileAdapter.js, guestStore.js,
                   i18n.js (+ strings/en.js, ms.js, zh.js), api.js
  screens/         Welcome, Access, Category, OrgPreview, ProfileSource, Profile (form + review), Assessment, Radar,
                   Matches, RoleDetail, Roadmap, Sdg, Futures, Dashboard
  components/      Tag (provenance labels), SourceLine, ScenarioSwitch, ExploreTabs, …
data/              copied files + SOURCES.md; onet/; cache/ (trend snapshots written at runtime)
pipeline/          fetch_onet.py
tests/             one test file per module/route; tests/helpers (SQLite stand-in for D1, fixture builders)
```

Navigation follows the mockup: onboarding pages in order; after Confirm, tabs Radar · Matching · Roadmap · SDG · Compare futures, plus "Edit profile". Hash routes (`#radar` …) so a judge can deep-link.

## 5. Structured profile

As in the CV spec §5 (three field states `empty`/`declined`/`value`; skills as objects with `source`, `userConfirmed`, `proficiency`, `proficiencyStatus`, `extraction`; draft → confirmed only on Confirm; forbidden personal fields never stored), plus `preferences.sdgInterests: number[]` and `userCategory` values `working_adult` | `graduate_switcher`. Proficiency levels: `basic` | `good` | `expert`.

## 6. Data (copied, never edited by the app)

| File | Content | Source (kept in SOURCES.md) |
|---|---|---|
| `roles.json` | 20 roles: eMASCO code, title, description, group, skills (label, type), automatable %, SDGs, source URL | eMASCO (KESUMA), fetched 2026-10-21; automatable % = team task labels |
| `skills.json` | 38 skills: hours, keywords, SDGs, courses (title, URL, price, duration, level, checked date) | Team list; e-LATiH (HRD Corp) / TVET portal, checked 2026-10-24 |
| `sdg.json` | SDG names, colours, targets | UN SDG targets |
| `trends.json` | OpenDOSM wages by occupation group (2020→2025) | api.data.gov.my, fetched 2026-10-26 |
| `research.json` | OpenAlex AI-research mentions per skill (2024, 2025) | openalex.org (CC0), fetched 2026-10-23 |
| `emasco/occupations.json` | 1,766 eMASCO occupations (code, title, URL) | eMASCO crawl 2026-10-23 |
| `onet/` | O\*NET 31.0 snapshot + manifest | onetcenter.org, downloaded 2026-10-29 |
| `sdg_links.json` (new) | one-line reason per role→SDG and skill→SDG link | written for this build, labelled "team draft" |
| `quiz.json` (new) | 1–3 short questions for skills that can be quizzed | written for this build, labelled "team draft" |

At start the server validates every file (shape, required fields) and refuses to start with a clear message if one is broken.

## 7. Scoring (`src/lib/score.js`, pure, shared by browser and server)

- **Current Skill Match** = Σ(weight × credit) / Σ weight × 100 over the role's skills. Weight: `specific` 1.5, `basic` 1.0 (team heuristic, shown). Credit: expert 1, good 0.75, basic 0.5, **not set 0.5 and marked Provisional**, missing 0. Not changed by the scenario.
- **Future Outlook** = 0.5 × demand + 0.5 × (100 − automatable% × factor). Demand = the role group's OpenDOSM wage growth scaled 0–100 across groups (min–max); unknown group → 50, marked. Factor: Moderate 0.6, Fast 1.0. Labelled Estimate.
- **Rank** = 0.6 × Match + 0.4 × Outlook + SDG bonus (5 per role SDG the user picked, max 10).
- **What raises it**: for each role skill below expert, the points gained by reaching expert (missing → learn; held → improve), top 3.
- **Roadmap order**: missing skills first, then lowest credit; ties by OpenAlex growth (2025 vs 2024), AI-linked skills × (1 + factor).
- **Need more information**: no skill with a known id → no percentages at all.
- **Change test**: an override for one group's demand (marked "edited, not sourced") and a refresh both re-run these functions; a banner says what moved.

## 8. Trends (M4)

`POST /api/trends/refresh` fetches OpenDOSM `wages_occupation` and OpenAlex counts (8 s timeout, 5 at a time), validates, writes `data/cache/trends.json` atomically, single refresh at a time. On failure the last good snapshot stays and the response says `{status:'fallback', reason, snapshotDate}`. `GET /api/data` returns data + trend snapshot + status. Every signal on screen shows source, observed period and fetched date; observed vs projected are labelled apart.

## 9. CV, occupations, accounts, AI (M6–M8)

As in the CV spec §6–§9, with these settings: max 10 MB (`CV_MAX_MB`); evidence quoted on every CV field; language prompt keep/switch; occupation lookup states `ok_snapshot` / `ok_alternative` / `no_match` / `unavailable`, O\*NET title → alternate title → strict BM25 → loose BM25 (≤5, "similar words"), eMASCO by title alongside, crosswalk only when `data/onet/soc_isco.csv` exists; D1 tables `users`, `sessions`, `profiles`, `plans`; sessions 7 days, cookie `fr_session` HttpOnly Secure SameSite=Lax; login 10 / 15 min; R2 key `cv-temp/<extractionId>`, deleted on save and by a 1-day lifecycle rule; AI: 3 runs per upload, 20 per hour per IP, 30 s per provider, evidence must occur word for word in the CV, no levels or codes from the model; Claude call: `anthropic-version: 2026-10-21`, `output_config.format` JSON schema, no temperature, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. Env names as in the CV spec §9 plus `CV_LLM_BACKUP_MODEL` (default `claude-opus-5-5`).

## 10. Errors and privacy

One error shape `{error:{code, message, retryable}}`; every user-facing message in EN/BM/中文; no stack traces in responses; CV text and personal fields never logged; guest store keeps the minimized profile only (no raw CV, no evidence text); storage refusals never crash the page.

## 11. Testing

- Test first for every module (Vitest). Pure maths in `score.js` has worked examples with exact numbers.
- Route tests start the real app on a random port; accounts use a SQLite (`node:sqlite`) stand-in for D1 with the real `migrations.sql`; R2 and model services are fakes; synthetic CV files are built in the tests.
- Acceptance in the browser at the end of each milestone (desktop and 360 px), and at M8 the Finalist Guide live checks: change the trend data, open a course link, "why this score", switch scenarios, CV upload, Tests 1–7 of the CV spec.

## 12. Risks

Under 3 days for M1–M8: M8 and the dashboard part of M7 are the most likely to be thin. OpenAlex without a key has a small daily budget (fallback covers it). D1/R2/RunPod need the user's accounts and keys; until then accounts show "not available" and AI shows "not configured". `sdg_links.json`, `quiz.json` and the ATM story copy are drafts for the team to review.
