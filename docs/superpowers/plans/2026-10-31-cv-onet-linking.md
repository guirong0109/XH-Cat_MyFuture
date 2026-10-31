# CV skills that reach Skill Match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CV skills link to the O\*NET skills and knowledge that Skill Match counts (rules, plus a DeepSeek suggestion the user keeps), and project lines split into title and description.

**Architecture:** Rules change in the catalogue, normaliser and rules reader. The AI reply gains `skills[].onet` and `projects[].description`; the server checks the name against the 68 O\*NET names and stores `aiSuggestion` on the skill. The form shows Keep / Remove. Matching code is not touched.

**Tech Stack:** Node 24 ESM, Express, Vitest, browser ES modules (no build), strings in `shared/strings/{en,ms,zh}.js`.

**Spec:** `docs/superpowers/specs/2026-10-31-cv-onet-linking-design.md` (approved 31 Oct 2026). Background: `2026-10-31-cv-ai-reading-design.md`.

## Global Constraints

- Worktree `C:\Users\guiro\XH_Cat_Final-cv`, branch `claude/cv-profile-module`. Never push or merge to `main` without the owner.
- Test first (Vitest). `npm test` before every commit. Commit messages `feat:` / `fix:` / `docs:`, no attribution lines.
- Tests never call the real DeepSeek API. CV text and AI replies are never logged.
- Ids, levels and codes never come from the AI: an `aiSuggestion.id` is looked up from our list by exact name.
- A suggestion never counts in Skill Match until the user presses Keep (`aiSuggestion` is not a `canonicalId`).
- Strings in en, ms and zh with the same keys. Every suggestion shows its source on screen.
- Bash heredocs break on apostrophes: write helper scripts with the Write tool.
- Record each task in `docs/record/status.json` and run `python docs/record/build_record.py`.

## Review Focus

1. A knowledge name that equals a skill name ("Mathematics") must stay the skill `onet:el:2.A.1.e` — Task 2 test.
2. The skill search must not list a knowledge area twice after it moves into the main list — Task 2 test.
3. A suggestion naming something near but not on the list ("Customer Service") is dropped, not fuzzily matched — Task 4 test.
4. A rules skill and an AI skill for the same thing must end with one skill carrying one suggestion, also after `mergeSkills` — Task 5 test.
5. Keep on a skill whose suggestion is already a skill (added by hand meanwhile) adds no duplicate — Task 6 test.

---

### Task 1: Bring `main` into the CV branch (owner OK given with this plan)

**Files:** merge only.

- [ ] `git merge origin/main` in the CV worktree. Keep the CV branch's detailed `HANDOVER.md` and `CLAUDE.md` (if overwritten, `git checkout HEAD -- HANDOVER.md CLAUDE.md` then re-add the CV-only lines); merge `docs/record/status.json` log entries from both sides.
- [ ] `npm install && npm test`: all pass (report the count). Commit the merge. No push.

### Task 2: Knowledge areas and short forms in the catalogue and normaliser

**Files:** Modify `server/skills/onetSkills.js`, `server/skills/normalize.js`. Test `tests/normalize.test.js` (and the catalogue/search tests that exist). Fixture `tests/helpers/onetFixture.js` (add `2.C.1.e Customer and Personal Service`, `2.C.4.a Mathematics` knowledge rows, a skill row `2.A.1.e Mathematics` if missing, software rows `Structured query language SQL` ×3 codes, `Structure query language SQL` ×1 code, `Microsoft Excel`).

**Interfaces — Produces:** `catalogue.entries` now includes knowledge entries `{ id: 'onet:kn:<element_id>', name, category: 'O*NET knowledge', occupations }` (occupations = codes with importance ≥ 3); knowledge no longer in `catalogue.more`. New export `ONET_LINKABLE = (catalogue) => entries whose id starts with onet:el: or onet:kn:` (used by Task 4). Normaliser match kinds: `'exact' | 'word' | 'short_form' | 'semantic' | null`.

- [ ] **Tests (write first, see them fail):**
  - `normalizeSkill('Customer and Personal Service')` → `canonicalId 'onet:kn:2.C.1.e'`, match `'exact'`.
  - `normalizeSkill('Mathematics')` → `'onet:el:2.A.1.e'` (skill wins over knowledge).
  - `normalizeSkill('SQL')` → `'onet:tech:structured query language sql'`, match `'short_form'`, `originalText 'SQL'`.
  - Two fitting names with equal occupations (add a fixture pair, e.g. `Alpha Beta AB` and `Apple Banana AB`, 1 code each) → `canonicalId null`, both in `candidates`.
  - `normalizeSkill('MS Excel')` → `'onet:tech:microsoft excel'`, match `'short_form'`.
  - `normalizeSkill('sql')` (not all capitals) → not `short_form` (stays as today).
  - `searchSkills(catalogue, 'Customer and Personal')` lists `onet:kn:2.C.1.e` exactly once.
- [ ] **Implement.** Load knowledge into `entries`; in `byName` a knowledge entry never replaces an existing name. Short-form step runs after the exact step and before the word step: an input that is one all-capital word of 2–6 letters matches software names whose last word equals it and whose preceding words' first letters spell it in order; pick most occupations, tie → candidates. Leading `MS ` → `Microsoft ` then exact lookup.
- [ ] `npm test` passes; commit `feat: CV reader links O*NET knowledge areas and short forms`.

### Task 3: Rules reader — no skills from certificate/education lines; project title and description

**Files:** Modify `server/cv/extract.js`. Test `tests/extract.test.js`.

- [ ] **Tests first:**
  - CV with `CERTIFICATIONS` / `Google Data Analytics Certificate, 2023` → no skill named `Google`; the certification is still found.
  - Education line `Diploma in Information Technology, Politeknik Ungku Omar` adds no software skill from that line.
  - Project `Student attendance dashboard built with React and Node.js` → title `Student attendance dashboard`, description `built with React and Node.js`; React and Node.js skills have `usedIn [{kind:'project', title:'Student attendance dashboard'}]` and level Good.
  - `Library booking app in JavaScript` → title unchanged (no split word), description `''`.
  - `Weather app - built using Flutter` → title `Weather app`, description `built using Flutter`.
  - `Sistem tempahan dengan PHP` → title `Sistem tempahan`, description `dengan PHP`; `Chat bot with Python` → title `Chat bot`.
  - A project line whose split word comes after only one word (`App using Java`) → not split.
- [ ] **Implement** `splitProject(line) -> { title, description }`: first split at ` - `, ` – `, `: `; else at the first whole-word, case-insensitive ` built with `, ` built using `, ` using `, ` with `, ` dengan `, ` menggunakan `, or `使用`, only when ≥ 2 words (for `使用`: ≥ 2 characters) precede it. The software scan skips rows whose section is `certifications` or `education`.
- [ ] `npm test`; commit `fix: CV rules keep certificates out of skills and split project title from description`.

### Task 4: AI reply — `onet` suggestion and project description

**Files:** Modify `server/cv/aiReadPrompt.js`, `server/cv/aiRead.js`. Test `tests/aiRead.test.js`.

**Interfaces — Consumes:** `ONET_LINKABLE(catalogue)` from Task 2. `createAiReader` gains `catalogue` (the server and `scripts/eval-cv.mjs` pass the one they already load). `SYSTEM_PROMPT` becomes `systemPrompt(names: string[]) -> string` (names = the 68 linkable names, sorted); keep the old export name only if other code imports it. **Produces:** AI skills may carry `aiSuggestion: { id, name, evidence }`; AI projects carry `description`.

- [ ] **Tests first (fake fetch):**
  - Schema: `skills` items have `onet` (optional, string); `projects` items have `description` (optional). A reply without them is still accepted.
  - Prompt contains every linkable name and the words "closest" and "never invent".
  - `onet: 'customer and personal service'` on a quoted skill → `aiSuggestion { id: 'onet:kn:2.C.1.e', name: 'Customer and Personal Service', evidence }`.
  - `onet: 'Customer Service'` (not on the list) → no `aiSuggestion`; skill still kept.
  - `onet` on a skill whose evidence is not in the CV → skill and suggestion dropped.
  - `onet` equal to the skill's own linked id (skill "Critical Thinking", onet "Critical Thinking") → no `aiSuggestion`.
  - Project `{ title, description, evidence }` with description in the CV → kept; not in the CV → `''`.
  - The request body still has `thinking: { type: 'disabled' }`; nothing new is logged.
- [ ] **Implement.** Add `onet` and `description` as optional fields (like `usedIn`); `keepQuoted` treats `onet` like `usedIn` (not checked against the CV text). In `suggestedProfile`, look up `onet` by `nameKey` among `ONET_LINKABLE`.
- [ ] Update `server/app.js` / `server/routes/cv.js` wiring and `scripts/eval-cv.mjs` to pass `catalogue`. `npm test`; commit `feat: DeepSeek suggests the closest O*NET skill or knowledge area for each CV skill`.

### Task 5: Merge keeps one suggestion per skill

**Files:** Modify `server/cv/mergeDrafts.js`, `server/skills/normalize.js` (`mergeSkills`). Test `tests/mergeDrafts.test.js`, `tests/normalize.test.js`.

- [ ] **Tests first:**
  - Rules skill Python (`onet:tech:python`) + AI skill Python with `aiSuggestion Programming` → one Python skill carrying that suggestion.
  - Rules skill already has `aiSuggestion`; AI brings another → the first stays.
  - A suggestion whose id is already a skill's `canonicalId` in the merged draft (e.g. rules found "Programming") → suggestion removed.
  - Two skills suggesting the same id → only the first keeps it.
  - `mergeSkills` of two entries of the same skill keeps an `aiSuggestion` from either.
  - Rules project description empty, AI description filled and in the CV → description filled, `extraction.aiFilled` lists `description`.
- [ ] **Implement** the move in the skills loop, then one final pass over the merged skills dropping taken or repeated suggestions. `npm test`; commit `feat: merged CV draft keeps one AI suggestion per skill`.

### Task 6: Form — Keep / Remove a suggestion

**Files:** Modify `public/js/screens/skillGroups.js`, `public/js/app.js`, `shared/strings/{en,ms,zh}.js`. Test `tests/skillGroups.test.js` (and the app action tests if they exist; else test the pure helper).

**Interfaces — Produces:** pure helper `keepSuggestion(profile, i) -> profile` and `dropSuggestion(profile, i) -> profile` (in a module the browser and tests can import, e.g. `public/js/cvSuggest.js`); actions `keepAi` / `dropAi` with `data-arg="<skill index>"`.

- [ ] **Tests first:**
  - Edit row and chip area of a skill with `aiSuggestion` shows "AI suggests: Programming — from "built models in Python". Check it.", the source line, and buttons `keepAi` / `dropAi`.
  - `keepSuggestion`: adds `{ name, canonicalId: id, source: 'cv_ai', userConfirmed: true, usedIn: <original's> }` passed through `levelFromUse` (Good + `from_projects` when usedIn not empty; else not assessed); removes `aiSuggestion` from the original; profile passes `validateProfile`.
  - `keepSuggestion` when a skill with that id already exists → no new skill, suggestion removed.
  - `dropSuggestion` removes only `aiSuggestion`.
  - Short-form chip shows `SQL → Structured query language SQL (O*NET)` (from `originalText` and `match 'short_form'`, using the existing `fromText` wording where it fits).
  - Strings: new keys exist in en, ms, zh: `aiSuggests` ("AI suggests: {name} — from "{evidence}". Check it."), `aiSuggestSource` ("O*NET 31.0 skills and knowledge list, suggested by DeepSeek"), `keep` ("Keep") if missing.
- [ ] **Implement.** Check that `aiSuggestion` survives the browser's draft merge (`mergeDraft` in `public/js`) and saving; a suggestion left alone is removed when the profile is confirmed (spec §4.5: never saved as a skill — it is not a skill, so only make sure it does not leak into `canonicalId`).
- [ ] `npm test`; commit `feat: form shows the AI's O*NET suggestion with Keep and Remove`.

### Task 7: Matching sees a kept suggestion

**Files:** Test only, `tests/` next to the matching fit tests (e.g. `tests/matching/fit.test.js`).

- [ ] Test: profile with Python (`onet:tech:python`) only → `profileLevels` empty; after `keepSuggestion` to `onet:el:2.B.3.e` used in a job → `profileLevels` has `el:2.B.3.e` with 4 points, and `fitFor` for an item needing Programming 3.5 counts it as met. No matching code change. Commit `test: a kept CV suggestion counts in Skill Match`.

### Task 8: Harder test CVs and the accuracy report

**Files:** Modify `testing/eval-cvs.json`, `scripts/eval-cv.mjs`, `tests/evalCv.test.js`; regenerate `docs/eval-results.md` (rules only).

- [ ] Add 5 synthetic CVs (all names marked synthetic), each with `expected.projects` and `expected.onet`:
  1. Long project lines with "built with", "using", " - " (projects + tools).
  2. Malay CV with "Komunikasi", "Kerja berpasukan", "Penyelesaian masalah" (expected onet: Speaking, Coordination, Complex Problem Solving — reachable only by the AI).
  3. Chinese CV with "沟通", "客户服务" (expected onet: Speaking, Customer and Personal Service).
  4. Skills only in job lines ("Built models in Python and dashboards in Tableau") plus "SQL", "MS Excel" (expected onet: Programming, Mathematics).
  5. Certificate naming a company ("AWS Certified Cloud Practitioner", "Google Project Management Certificate") — no "Google"/"AWS" skill expected.
- [ ] Add `expected.projects` to the existing `project-only-pdf` and `duplicates-pdf`.
- [ ] Eval: a `projects` field (titles, same scoring), and a "reaches Skill Match" section: rules = skills with `onet:el:`/`onet:kn:` ids scored against `expected.onet`; rules + AI = those ids plus `aiSuggestion` ids. Tests in `tests/evalCv.test.js` for the new scoring with a fake AI.
- [ ] Run `node scripts/eval-cv.mjs` (rules only, free); commit the code, test CVs and `docs/eval-results.md` as `feat: harder test CVs, project and Skill Match accuracy in the CV report`.
- [ ] **Stop and ask the owner** before `--ai` (paid, under $0.01).

### Task 9: Docs and record

- [ ] Update `HANDOVER.md`, `CLAUDE.md` (test count), `docs/cv/acceptance.md` (browser check of Keep/Remove on `127.0.0.2`-style address via the `cv-trial` launch entry), `docs/architecture-cv-branch.html` (suggestion step), `README` if settings changed, build record. Commit `docs: CV O*NET linking handover and acceptance`.
