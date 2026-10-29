# CV Extraction and Structured Profile Module — Design

Date: 2026-10-29 · Status: approved; aligned box by box with `architecture-cv-profile.html` on 29 Oct (the diagram wins wherever this text differed)
Folder: `C:\Users\guiro\XH_Cat_Final` · Starting point: `docs/mockup-journey.html`
Requirements: "FutureReady MY — CV Extraction and User Profile Technical Specification" (Cases A/B/C, §1–§14), referred to here as **the CV spec**. Structure reference: `XH-Cat_Domain1/docs/architecture-cv-profile.html` (diagram only; nothing else from that folder).

This document replaces `2026-10-29-futureready-final-design.md`, its plan, and the copied `2026-10-29-cv-profile-design.md` (all marked superseded).

## 1. Goal and success

Build the CV/profile module inside the mockup: a user with or without a CV ends with a **confirmed, structured profile** plus occupation and skill mappings, stored for a guest in the browser or for an account in Cloudflare D1. Success = the CV spec §12 test table and §13 Tests 1–7, with Test 3 and Test 7 adapted (§11 here) because the matching engine is a later module.

## 2. Decisions (with the user, 29 Oct)

| Topic | Decision |
|---|---|
| Starting point | Grow the real module inside the mockup; redesign the look at the final stage |
| Scoring | **No scoring from the previous project.** The mockup's old formula is removed. After Confirm a "Your profile" summary is shown; Radar, Matching, Role, Roadmap, SDG and Futures say "Next module — matching engine not built yet" |
| Code layout | Approach A: `public/` (mockup split into browser ES modules, no build step), `shared/` (pure modules used by browser, server and tests), `server/` (Express) |
| Server | Node ≥ 22.12 + Express; packages only `express`, `pdfjs-dist`; dev `vitest` (user OK before install) |
| Skill ids | O\*NET 31.0 skills (Software Skills examples + Essential/Transferable skill elements) |
| Occupations | Diagram "live-first with verified fallback": 1 O\*NET live (timeout, retry, rate limit; ok → update cache) → 2 cached snapshot (O\*NET 31.0, marked "cached") → 3 eMASCO reference (marked "alternative source") → 4 unavailable (structured error, never invented) |
| AI re-extraction | RunPod serverless open model first, Claude API (`claude-opus-5-5`) backup, consent first |
| Accounts | Cloudflare D1 (HTTP API); R2 keeps the uploaded CV ≤ 1 day for the AI re-read |
| L3 semantic match | An embedding model hosted on **RunPod Inference** (diagram box "RunPod Inference — hosts the model (L3)"); its similarity cutoff is set by **Model Eval** (precision · recall · latency) on synthetic CVs |
| Languages | EN / BM / 中文; the interface language changes only by the user |

## 3. Layout

```
public/index.html            the mockup's screens and styles (same look)
public/js/app.js             state, hash router, guest store wiring
public/js/screens/*.js       welcome, access, returning, category, org-preview, source, upload, form, review, summary, next-module
public/js/api.js             fetch helpers, one error shape
shared/profileSchema.js      profile format + validateProfile
shared/profileState.js       pure form helpers (set field, records, confirm, merge CV draft, diff for the AI compare view)
shared/strings/en.js ms.js zh.js
server/index.js app.js errors.js
server/cv/                   validateFile, zip, readText, detectLanguage, patterns, extract, reextract, reextractPrompt
server/skills/               onetSkills (catalogue), normalize
server/cv/semantic.js        L3 client for the RunPod-hosted embedding model
server/occupations/onetLive.js  O*NET live client (timeout, retry, rate limit) + cache update
scripts/model-eval.mjs       Model Eval: precision, recall, latency of L3 on synthetic CVs
server/occupations/          onet, lookup
server/store/                d1, r2, migrations.sql
server/auth.js  server/routes/{cv,skills,occupations,profiles,auth}.js
pipeline/fetch_onet.py       downloads O*NET 31.0 and writes data/onet/
data/onet/                   occupations, job titles, skills, software skills + manifest (version, URL, date, hashes)
data/emasco/occupations.json code, title, URL of eMASCO occupations (copied data, dated)
data/SOURCES.md              source, URL, date, licence of every data file
tests/                       Vitest; tests/helpers (SQLite stand-in for D1, synthetic PDF/DOCX builders)
```

Express serves `public/` and `shared/` as static files and the API under `/api`. Mockup screens that belong to later modules stay in `public/` but show the "Next module" note.

## 4. Structured profile (`shared/profileSchema.js`)

The CV spec §7.1 shape, with these rules:
- Optional single fields have three states: `{state:'empty'}` (no information), `{state:'declined'}` (prefer not to say), `{state:'value', value}`. "Unknown / not assessed" exists only for proficiency (`proficiencyStatus:'not_assessed'`).
- Repeatable records are arrays: `education.records`, `employment.records`, `employment.industries`, `skills`, `certifications`, `projects`, `training`, `preferences.careerInterests`, `preferences.preferredCareerFields`, `occupationMappings`.
- Numbers are numbers: `employment.yearsOfExperience`, `preferences.preferredLearningHoursPerWeek`.
- Skill = `{name, originalText, canonicalId, category, source:'cv_rules'|'cv_ai'|'user_input', userConfirmed, proficiency:'basic'|'good'|'expert'|null, proficiencyStatus:'not_assessed'|'self_reported'|'assessed', extraction}`; `extraction = {method, evidence, confidence, extractorVersion, at, kind:'explicit'|'inferred'} | null`. A CV never sets `proficiency`; extraction confidence is not proficiency.
- Every CV-derived record carries `userConfirmed:false` and an `extraction` block until reviewed.
- `profileStatus` `draft` → `confirmed` only on Confirm (`dataProvenance.profileReviewedByUser = true`).
- `occupationMappings[] = {term, chosen:{source:'onet'|'emasco', code, title, via, version, fetchedAt}|null, candidatesShown:number}`.
- Never stored: age, gender, ethnicity, religion, marital status, photo, address, IC number (`validateProfile` rejects them at any depth).
- `userCategory`: `working_adult` | `graduate_switcher` (C/D are organisation previews, not profiles).
- Usable for matching = at least one skill with a `canonicalId`; otherwise the summary says so and no percentages appear anywhere.

## 5. Screens (in the mockup)

1. Who are you? (A/B; C/D → "preview — not working yet").
2. "Do you have a CV or resume you would like to upload?" → Upload my CV / I don't have a CV — continue manually.
3. **Upload (Case A):** privacy note; progress Uploading → Validating file → Reading document → Extracting information → Mapping detected skills → Ready for review; errors with "upload another / retry (when retryable) / continue manually", typed data kept; language prompt keep / switch (never automatic).
4. **Form (Case B, and Case C editing):** five sections — Study and Experience, Employment Background, Skills and Proficiency, Certifications and Projects, Career Preferences; move freely; partial save; "Prefer not to say" on optional fields; repeatable records; skill box with normalisation ("not in our list yet — kept, not used for matching" for unknowns); occupation picker on jobs and career interests; CV fields show "From your CV · please check" with the quote; "mark for later review" flag.
5. **Review (Case C):** everything in one list with Unverified / Self-reported / Assessed / Provisional labels; "Missing or incorrect information? Improve extraction with AI"; Confirm.
6. **Your profile (summary):** confirmed profile, occupation and skill links with source, version and date, "View JSON", Edit, and the "Next module" tabs.

## 6. Case A pipeline (`POST /api/cv/extract`)

1. **validateFile** (content, not name): PDF `%PDF-` with `%%EOF` near the end, `/Encrypt` → encrypted; DOCX = zip with `word/document.xml`; legacy `.doc` and everything else → unsupported; > `CV_MAX_MB` (10) → too large. Never throws.
2. **readText:** pdfjs (Node legacy build) lines by position; DOCX paragraphs with heading styles; ≤ 300 lines, ≤ 20,000 chars; under 20 letters → `scanned_no_ocr` (PDF) / `no_text` (DOCX).
3. **detectLanguage:** `en` / `ms` / `zh` / `mixed` / `uncertain` (Han characters vs English and Malay common-word lists).
4. **L1** sections by heading words in EN/BM/中文 (Education/Pendidikan/教育, Experience/Pengalaman/工作经验, Skills/Kemahiran/技能, Certifications/Sijil/证书, Projects/Projek/项目, Training/Latihan/培训, Objective/Objektif/求职目标).
5. **L2** rules: qualifications (SPM, STPM, Certificate (education section only), Diploma, Degree/Bachelor/Ijazah/Sarjana Muda/学士, Master/Sarjana/硕士, PhD/博士) with field of study, institution, year; jobs from date ranges (English and Malay months, Present/Kini/至今) with years of experience as `inferred`; skills from the skills section and catalogue names anywhere (whole words); certificates, projects, training from their sections; lines about age, gender, religion, race or IC number skipped.
6. **L3** semantic match: CV lines and terms the rules missed are compared by the RunPod-hosted embedding model with O\*NET skill and occupation names (e.g. JS = JavaScript). Only matches at or above the documented cutoff from Model Eval are kept, marked `inferred`, `method:'embedding'`, with the similarity as match confidence. A high similarity is not proof of equivalence: these stay Unverified for the user. If the endpoint is not configured or fails, L3 is skipped and `warnings` says so.
7. **L4** merge duplicates, validate, list uncertain items (`unknown_skill`, `low_similarity`). Explicit vs inferred kept apart.

Response: `{status:'ok', extractionId, language, profile (draft), uncertain[], extractor:{version:'cv-1.0', layers}, warnings[]}`. Errors: `unsupported_type` 415, `too_large` 413, `encrypted` / `corrupted` / `no_text` / `scanned_no_ocr` 422, `timeout` 504 (20 s). The file goes to R2 as `cv-temp/<extractionId>` when R2 is configured. CV text is never logged.

## 7. Skills (`POST /api/skills/normalize`)

Catalogue from the O\*NET 31.0 snapshot: Software Skills examples → id `onet:tech:<lower-case example>` with category = O\*NET element name (e.g. "Development environment software"); Essential and Transferable skill elements → id `onet:el:<element id>` (e.g. `onet:el:2.A.1.a` Reading Comprehension). Match order: exact catalogue name (case-insensitive, trailing version removed) → whole-word catalogue name inside a short phrase (≤ 5 words) → L3 semantic match (§6) at or above the cutoff. Never a substring of a longer word; the original wording is kept; unknown → `canonicalId:null`. Duplicates merge (one per id, all original wordings kept).

## 8. Occupations (`GET /api/occupations/search?q=`)

Live-first with verified fallback, exactly as the diagram:
1. **O\*NET live** — O\*NET Web Services keyword search (credentials in env, `ONET_API_KEY`; auth per the O\*NET Web Services documentation), 8 s timeout, at most 2 retries with backoff, at most 5 requests per second; a success updates the cache (`data/cache/onet/<query>.json` with source, URL, code, version, fetched time, `validated:true`).
2. **Cached snapshot** — when the live call fails or no key is set: a cached result for the query, else the dated O\*NET 31.0 snapshot (`data/onet/`, checked against its manifest hashes), marked "cached".
3. **eMASCO reference** — when no O\*NET result can be produced: eMASCO occupations by title, marked "alternative source".
4. **Unavailable** — structured error, no candidates, nothing invented.

Response states (diagram): `live` · `cached` · `alternative` · `no_match` (valid zero results) · `failed` (no fallback). An outage is never reported as `no_match`. eMASCO candidates by title are listed with O\*NET results for Malaysian context (CV spec §6.1 step 5). Every candidate: source, code, title, how matched, URL; every response: state, source, version, fetched time, cache status, warning. Many candidates are allowed; similar wording never makes two occupations "the same": the user picks.

## 9. AI re-extraction (`POST /api/cv/reextract {extractionId, consent}`)

Consent box names the services. Providers: RunPod serverless OpenAI-compatible endpoint (`CV_LLM_URL`, `CV_LLM_KEY`, `CV_LLM_MODEL`; proposed Qwen2.5-7B-Instruct, created only after the user approves the price) → Claude API (`CV_LLM_BACKUP_KEY`, `CV_LLM_BACKUP_MODEL`, default `claude-opus-5-5`; raw fetch, `anthropic-version: 2026-10-21`, `output_config.format` JSON schema, no `temperature`, `fallbacks:'default'` with beta `server-side-fallback-2026-07-01`). CV inside `<cv>` tags with the rule to ignore instructions in it. Every returned item must quote the CV word for word or is dropped; levels, ids and codes are stripped; skill names go through §7. Limits: 3 runs per upload, 20 per hour per IP, 30 s per provider. Failure → `503 ai_unavailable` with a reason; the form is unchanged. Compare view: New / Changed / Different from yours; the user's own edits are locked; the user ticks what to accept.

## 10. Accounts and storage

- **Guest:** minimized profile (no raw CV, no CV quotes) in `localStorage`; resume prompt (continue / start new / delete); works without storage.
- **D1** tables `users`, `sessions`, `profiles(id, user_id, version, status, json, updated_at)`; scrypt passwords; cookie `fr_session` HttpOnly Secure SameSite=Lax, 7 days; sign-in limit 10 / 15 min; routes `/api/auth/{signup,login,logout,me}` and `DELETE /api/auth/me` (delete my data incl. any temporary CV).
- **Profiles:** `POST /api/profiles/validate` (check + normalise, saves nothing), `POST /api/profiles` (confirmed only), `GET /api/profiles` and `/:id`, `PATCH /api/profiles/:id {version, changes}` (named fields only; old version → 409), `GET /api/profiles/:id/mappings`. Another user's profile → 404.
- **R2:** `cv-temp/<extractionId>`, deleted on save and by a 1-day lifecycle rule (user sets it up). Raw file and text are deleted after use; extraction sessions expire; **CVs never become training data**.
- Without D1/R2 settings: accounts say "not available on this server", the AI re-read says "not configured"; guests work fully.

## 11. Errors, privacy, testing

- One error shape `{error:{code, message, retryable}}`; messages in EN/BM/中文; no stack traces; logs hold timings, codes and costs, never CV text, AI replies or personal fields; a failed lookup never removes extracted data.
- Tests first (Vitest): every `shared/` and `server/` module; routes on a real test server; D1 via a `node:sqlite` stand-in with the real `migrations.sql`; synthetic PDF/DOCX built in tests; the CV spec §12 table is the test list.
- `scripts/eval-cv.mjs` on ~10 synthetic CVs (EN, BM, 中文, mixed, two degrees, no job, project-only student, injection attempt) → measured precision/recall per field and latency in `docs/eval-results.md`; no target claimed.
- Browser acceptance: CV spec §13 Tests 1, 2, 4, 5, 6 as written; **Test 3** = changing a skill or level changes the confirmed profile, its mappings and the summary (matching comes later); **Test 7** = the confirmed profile JSON validates and carries everything the next module needs (skills with ids and levels, studies, jobs with occupation codes, preferences). Desktop and 360 px.

## 12. Build order (each ends working)

1. Split the mockup into `public/` + `shared/`, remove the old formula, add the "Next module" screens; Express serves it.
2. Profile schema, form state, manual form (Case B) and review/confirm (Case C) with the summary.
3. O\*NET snapshot + skill catalogue + normaliser; O\*NET live client + cache + eMASCO fallback; occupation picker.
4. Case A: file checks, reading, language, extraction (L1, L2, L4), upload screen; then L3 semantic match on RunPod Inference + Model Eval (cutoff, precision, recall, latency).
5. Accounts (D1), saved profiles, R2 temporary CV, delete my data.
6. AI re-extraction and the compare view.
7. Evaluation script, acceptance run, `README.md`, `data/SOURCES.md`, Technical & Tools Declaration.

## 13. Risks

Under 3 days for all seven steps; step 6 is the most likely to be thin. O\*NET skill names are US-centred; L3 semantic match covers other wordings only above the evaluated cutoff. D1/R2/RunPod/O\*NET Web Services need the user's accounts and keys; until then those parts report "not available" (lookup answers `cached`, L3 is skipped). The mockup's look changes at the final stage, so screens keep logic out of markup.
