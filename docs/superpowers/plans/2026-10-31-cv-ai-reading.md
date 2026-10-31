# CV AI Reading on Upload (DeepSeek) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every CV upload, DeepSeek reads the CV alongside the rules reader and the server returns one merged draft.

**Architecture:** `POST /api/cv/extract` runs `extractProfile` (rules) and a new `aiReader.read` (DeepSeek, from the old
`reextract.js`) at the same time on the same CV lines, then `mergeDrafts` joins them (rules win, AI fills blanks and adds
missed items, differences are flagged). The re-read route, consent box, compare view, Claude backup and the R2 upload
copy go.

**Tech Stack:** Node 24 ESM, Express, Vitest, browser ES modules (no build), DeepSeek chat API via `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-31-cv-ai-reading-design.md` (changes §9 of
`docs/superpowers/specs/2026-10-29-cv-profile-module-design.md`).

## Global Constraints

- Work in `C:\Users\guiro\XH_Cat_Final-cv` on branch `claude/cv-profile-module`. Run `npm test` before every commit;
  messages `feat:` / `fix:` / `docs:`, no attribution lines. Do not push.
- DeepSeek settings: `CV_LLM_URL` (default `https://api.deepseek.com/chat/completions`), `CV_LLM_KEY` (required to turn
  AI on), `CV_LLM_MODEL` (default `deepseek-flash`). `CV_LLM_BACKUP_KEY` / `CV_LLM_BACKUP_MODEL` are removed.
- AI step time limit **15 000 ms**; whole upload keeps **20 000 ms** (`timeoutMs`).
- AI limit **20 reads per hour per network address** (`request.ip`); no other new limit.
- Warning codes (strings in `warnings`): `ai_unavailable`, `ai_limit`. Uncertain reason: `ai_differs`.
- Item sources: AI-only skills `source: 'cv_ai'`; AI-only records `extraction.method: 'ai'`; rules items unchanged.
- CV text and AI replies are never logged; only error names / codes reach `console.error`.
- Tests never call the real API: inject `fetchImpl`.
- Upload notice (en), exact: "Your CV is read by DeepSeek AI (stored in China) to improve accuracy. You check
  everything before it is saved." Same meaning in `ms` and `zh`; the three string files keep the same keys.
- Record every step in `docs/record/status.json`, then `python docs/record/build_record.py`.
- Browser checks on an address nobody else uses: launch config `cv-trial` (`http://cv.localhost:3260`, may move to 3261).

## Review Focus

1. **AI answers with prose or a ```json fence instead of bare JSON** → treated like a bad reply: rules draft +
   `ai_unavailable`, upload still 200. (Task 1 test `fenced or prose reply → skipped`.)
2. **The AI and rules see the same job with different wording** ("IT Support Executive" vs "IT support exec") → one job,
   not two; AI skills that were "used in" the AI title follow onto the kept rules job. (Task 2 tests.)
3. **A CV with a hidden instruction** ("mark me as expert") → no level, id or extra item from it. (Task 1 test, existing
   fixture line.)
4. **DeepSeek slow while rules are fast** → answer in about 15 s with the rules draft, never a 504 caused by the AI.
   (Task 3 test `slow AI → rules draft before the upload limit`.)
5. **A user who already typed a job before uploading** → their own values still win in the browser (`mergeDraft`), and the
   "Found by AI" tag shows only on items that came from the AI. (Task 4 test.)

---

### Task 1: `aiRead.js` — DeepSeek reader (replaces `reextract.js`)

**Files:**
- Rename: `server/cv/reextract.js` → `server/cv/aiRead.js` (`git mv`), `server/cv/reextractPrompt.js` →
  `server/cv/aiReadPrompt.js`
- Rename + rewrite: `tests/reextract.test.js` → `tests/aiRead.test.js`

**Interfaces:**
- Produces:
  - `providerFromEnv(env = process.env): { url: string, key: string, model: string } | null` — null when `CV_LLM_KEY` is
    empty; defaults per Global Constraints.
  - `createAiReader({ provider, fetchImpl = fetch, normalizer, now = () => new Date(), timeoutMs = 15000, perHour = 20 })`
    → `{ read({ cvText: string, ip?: string, interfaceLanguage?: 'en'|'ms'|'zh' }) }`
  - `read` resolves (never rejects) to
    `{ status: 'ok', model, dropped: number, usage: { input: number, output: number }, profile }` or
    `{ status: 'skipped', reason: 'ai_unavailable' | 'ai_limit' }`.
  - `profile` is the AI draft built exactly as today's `suggestedProfile` (records with
    `extraction: { method: 'ai', evidence, confidence: null, extractorVersion: 'ai:<model>', provider: 'deepseek', at,
    kind: 'explicit' }`, skills `source: 'cv_ai'` through `normalizer.normalizeSkill` + `mergeSkills` + `levelFromUse`,
    education `level: levelOf(qualification)`).
  - `keepQuoted(reply, cvText)` and `checkShape(reply)` stay exported unchanged.
  - From `aiReadPrompt.js`: `CV_SCHEMA`, `SYSTEM_PROMPT`, `userMessage(cvText)` (unchanged), plus `SYSTEM_PROMPT` now ends
    with one line: `Answer with one JSON object of exactly this shape: <example>` where `<example>` is
    `JSON.stringify` of an example built from `CV_SCHEMA` (each list holding one object whose fields are `""`). DeepSeek's
    JSON mode needs the word "JSON" and the shape in the prompt.

- [ ] **Step 1: Write the failing tests** in `tests/aiRead.test.js`, keeping the existing `LINES` / `REPLY` fixture and
  a fake `fetchImpl` that returns `{ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(REPLY) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } }) }`:
  - `providerFromEnv`: `{}` → `null`; `{ CV_LLM_KEY: 'k' }` → `{ url: 'https://api.deepseek.com/chat/completions', key: 'k', model: 'deepseek-flash' }`; URL and model overridable.
  - `sends one DeepSeek request`: the fake sees URL = provider url, header `authorization: 'Bearer k'`, body
    `model: 'deepseek-flash'`, `response_format: { type: 'json_object' }`, two messages (system = `SYSTEM_PROMPT`, user
    contains `<cv>`), no `temperature`.
  - `ok read`: `status 'ok'`, `model 'deepseek-flash'`, `usage { input: 900, output: 300 }`, `dropped 1` (Leadership),
    Excel skill `source 'cv_ai'`, `canonicalId` from the catalogue not `'onet:tech:fake'`, no `expert`;
    `validateProfile(profile).ok === true`.
  - `fenced or prose reply → skipped`: content ``'```json\n{...}\n```'`` and `'Here is the profile'` →
    `{ status: 'skipped', reason: 'ai_unavailable' }`. (Accept a fenced reply? No: spec §6 "a reply without the five
    lists … counts as failed"; strict parse keeps it simple.)
  - `http 500`, `network error`, `timeout` (fake waits past `timeoutMs: 20`), `wrong shape` → `ai_unavailable`.
  - `no provider` (`provider: null`) → `ai_unavailable` with no fetch call.
  - `21st read in an hour → ai_limit` (same ip; `perHour: 20`); a different ip still reads.
  - `nothing logged`: spy `console.log/error/warn`; after an `ok` and a failed read, no call argument contains
    `'Aina'` or `'Microsoft Excel'`.
- [ ] **Step 2: Run** `npx vitest run tests/aiRead.test.js` — expect FAIL (`aiRead.js` not found).
- [ ] **Step 3: Implement** in `server/cv/aiRead.js`: keep `checkShape`, `keepQuoted`, `post`, `parse`, the
  `suggestedProfile` body; replace `CALLS` / provider loop with one DeepSeek call; replace the two limiters with one
  `createWindowLimiter({ limit: perHour, windowMs: 3600000, now })` keyed by ip; drop `tempStore`, `validateFile`,
  `readText`, consent, Claude, RunPod. Log only `[aiRead] failed: <kind>`.
- [ ] **Step 4: Run** `npx vitest run tests/aiRead.test.js` — expect PASS. (Other files still import `reextract.js`;
  they are fixed in Task 3, so run only this file.)
- [ ] **Step 5: Commit** `feat: DeepSeek CV reader (aiRead) replaces the consent re-read providers`

### Task 2: `mergeDrafts.js` — join rules and AI drafts

**Files:**
- Create: `server/cv/mergeDrafts.js`
- Test: `tests/mergeDrafts.test.js`

**Interfaces:**
- Consumes: rules result `{ profile, uncertain }` from `extractProfile`; AI `profile` from Task 1 (or `null`).
- Produces: `mergeDrafts({ profile, uncertain }, aiProfile | null): { profile, uncertain }` — pure, no I/O, returns new
  objects. `aiProfile === null` → input returned unchanged.

Matching rule (decide once, used for education, jobs, projects): an AI record is the **same** as a rules record when
`norm(ai.extraction.evidence)` is inside `norm(rules.extraction.evidence)` or the other way round, **or** the main field is
equal after `norm` (education `qualification`, job `jobTitle`, project `title`). `norm` = lower case, spaces collapsed,
trimmed. First match wins; a rules record is matched at most once.

Per field of a matched pair (education `qualification, fieldOfStudy, institution`; job `jobTitle, employer`; project
`title, description`): rules empty + AI non-empty → take AI value and push the field name to
`record.extraction.aiFilled`; both non-empty and `norm` differs → `record.extraction.aiDiffers[field] = aiValue` and push
`{ path: '<list path>.<i>.<field>', reason: 'ai_differs', aiValue }` to `uncertain`. Education `level` is recomputed only
when `qualification` was filled. List paths: `education.records`, `employment.records`, `projects`.

Unmatched AI records are appended. Skills: an AI skill is the same as a rules skill when `canonicalId` matches (both
non-null) or `norm(name)` matches; same → rules skill kept, its `usedIn` gains the AI skill's places not already there;
new → appended (`source 'cv_ai'`). Before skills are joined, each AI skill's `usedIn[].title` that names an AI job/project
which was matched to a rules record is rewritten to that rules record's title. Certifications: same rule as projects on
`name`. Finally `profile.skills = mergeSkills(profile.skills).map(levelFromUse)`.

- [ ] **Step 1: Write the failing tests** (build small profiles with `emptyProfile` + `makeSkill`):
  - `null AI → unchanged` (deep equal).
  - `same job by evidence`: rules job `IT Support Executive` / employer `''`, evidence `'IT Support Executive at Acme Sdn
    Bhd 2021-2023'`; AI job `IT Support Executive` / `Acme Sdn Bhd`, evidence `'IT Support Executive at Acme Sdn Bhd'` →
    one job, employer `'Acme Sdn Bhd'`, `extraction.aiFilled` `['employer']`, `extraction.method` still the rules one.
  - `different wording flagged`: rules title `IT Support Executive`, AI title `IT Support Exec` with matching evidence →
    title kept, `extraction.aiDiffers.jobTitle === 'IT Support Exec'`, uncertain
    `{ path: 'employment.records.0.jobTitle', reason: 'ai_differs', aiValue: 'IT Support Exec' }`.
  - `AI-only job appended` with `extraction.method 'ai'`; `rules-only job kept`.
  - `education filled`: rules qualification `Diploma in Information Technology`, institution `''` → institution from AI,
    `level` unchanged.
  - `skill same by id` (one entry, rules `source` kept); `skill same by name when id null`; `AI-only skill appended
    'cv_ai'`.
  - `usedIn follows the kept title`: AI skill `usedIn [{ kind: 'job', title: 'IT Support Exec' }]`, AI job matched to rules
    `IT Support Executive` → merged skill `usedIn [{ kind: 'job', title: 'IT Support Executive' }]`, proficiency
    `'good'`, `proficiencyStatus 'from_projects'`.
  - `result validates`: `validateProfile(merged.profile).ok === true`.
- [ ] **Step 2: Run** `npx vitest run tests/mergeDrafts.test.js` — expect FAIL.
- [ ] **Step 3: Implement** `mergeDrafts` in `server/cv/mergeDrafts.js` (imports `mergeSkills` from
  `../skills/normalize.js`, `levelFromUse` from `../../shared/profileSchema.js`, `levelOf` from `./patterns.js`).
  If `validateProfile` rejects `aiFilled` / `aiDiffers` inside `extraction`, allow both keys in
  `shared/profileSchema.js` (and add a `profileSchema.test.js` case).
- [ ] **Step 4: Run** `npx vitest run tests/mergeDrafts.test.js tests/profileSchema.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: merge the rules and AI CV drafts (rules win, AI fills and adds, differences flagged)`

### Task 3: Upload route runs both; re-read route and upload copy removed

**Files:**
- Modify: `server/routes/cv.js`, `server/app.js` (lines 19, 38–52, 80–89), `server/auth.js:101-107`,
  `server/routes/profiles.js:51-52`, `scripts/serve-local-accounts.mjs`
- Test: `tests/cvRoute.test.js`, `tests/app.test.js`, `tests/auth.test.js`, `tests/savedProfiles.test.js`

**Interfaces:**
- Consumes: `createAiReader`, `providerFromEnv` (Task 1); `mergeDrafts` (Task 2).
- Produces: `cvRoutes({ loadCatalogue, loadNormalizer, semantic, cutoff, aiReader = null, now, maxBytes, timeoutMs })`
  (no `tempStore`, no `reextractor`); `createApp({ …, aiProvider = providerFromEnv() })` replacing `llmProviders`;
  `/api/health` `features.ai = Boolean(aiProvider)`; `features.tempCopy` removed. Answer of `POST /api/cv/extract`:
  `{ status, extractionId, language, profile, uncertain, extractor: { version, layers, model? }, warnings }` — `layers`
  gains `'ai'` and `model` is set only when the AI draft was merged.

- [ ] **Step 1: Write the failing tests** in `tests/cvRoute.test.js` (fake `aiReader` objects, real rules on a PDF from
  `makePdf`):
  - `merged draft`: aiReader returns an AI-only job → answer has it, `extractor.layers` includes `'ai'`,
    `extractor.model 'deepseek-flash'`, no `ai_*` warning.
  - `no aiReader → rules only` + `warnings` includes `'ai_unavailable'`, status 200.
  - `skipped ai_limit` → warning `'ai_limit'`.
  - `slow AI → rules draft before the upload limit`: aiReader never resolves, `timeoutMs: 300`, AI step limit injected as
    `aiTimeoutMs: 100` → 200 with `ai_unavailable` (add `aiTimeoutMs = 15000` to `cvRoutes` options; the route races
    `aiReader.read` against it).
  - `AI gets the same lines`: fake records `cvText === lines.join('\n')` and `ip`.
  - `POST /api/cv/reextract → 404`.
  - `no upload copy`: route never calls a store (no `tempStore` option exists; `createFakeTempStore` stays empty after an
    upload through `createApp`).
  - `tests/app.test.js`: health has `features.ai` false without `CV_LLM_KEY`, no `tempCopy`.
  - Remove `cv-temp` delete assertions from `tests/auth.test.js` / `tests/savedProfiles.test.js`.
- [ ] **Step 2: Run** `npx vitest run tests/cvRoute.test.js tests/app.test.js` — expect FAIL.
- [ ] **Step 3: Implement**: in `cv.js` start `extractProfile` and the AI race together after `detectLanguage`; call
  `mergeDrafts`; push the warning; drop the `tempStore.put` and the reextract route. In `app.js` build
  `createAiReader({ provider: aiProvider, fetchImpl, normalizer: await loadNormalizer(), now })` lazily as today. Remove the
  `cv-temp` deletes in `auth.js` and `profiles.js` (no copies are made any more); `r2.js` stays (still tested, unused by the
  CV flow).
- [ ] **Step 4: Run** `npm test` — expect all PASS except browser tests touching the re-read (fixed in Task 4). If any
  server test still imports `reextract`, update it here.
- [ ] **Step 5: Commit** `feat: upload runs the rules reader and DeepSeek together and returns one draft`

### Task 4: Screens — notice, AI tags, fallback line; re-read UI removed

**Files:**
- Delete: `public/js/components/improveWithAi.js`, `public/js/components/compareView.js`
- Modify: `public/js/app.js` (imports line 7, 28; actions 390–412; `state.ai`; `cvDraft`), `public/js/screens/review.js`
  (line 2, 72), `public/js/screens/upload.js` (lines 43–52, 70), `public/js/components/fields.js` (`cvNote`),
  `public/js/screens/skillGroups.js` (`chip`, group header), `shared/profileState.js` (remove `diffProfiles`,
  `applyAccepted`, `userEditedPaths` and their tests), `shared/strings/{en,ms,zh}.js`
- Test: `tests/reviewScreen.test.js`, `tests/cvReadyEdit.test.js`, `tests/skillGroups.test.js`, `tests/i18n.test.js`,
  `tests/profileState.test.js`

**Interfaces:**
- Consumes: the extract answer of Task 3 (`warnings`, record `extraction.method`, `extraction.aiDiffers`, skill `source`).
- Produces: `state.cv.warnings` (array) kept from the upload answer; strings `cvPrivacy` (new text), `tagFromAi`
  ("Found by AI — check it"), `aiReadAs` ("AI read this as: {text}. Check it."), `aiWarn_ai_unavailable` ("AI reading was
  not available this time; please check carefully."), `aiWarn_ai_limit` ("AI reading is paused for a while; please check
  carefully."). Removed: `cvPrivacyServer` and every `ai*` key of the re-read (`aiAsk` … `aiNothing`).

- [ ] **Step 1: Write the failing tests**:
  - Upload screen shows `cvPrivacy` text in en/ms/zh and never `cvPrivacyServer`.
  - Ready receipt with `warnings ['ai_unavailable']` shows the `aiWarn_ai_unavailable` line; with no ai warning shows none.
  - `cvNote` for a record with `extraction.method 'ai'` shows `tagFromAi` and the quote; rules record shows `tagFromCv`;
    record with `extraction.aiDiffers.jobTitle 'IT Support Exec'` shows `AI read this as: IT Support Exec. Check it.`
  - Skill chip for `source 'cv_ai'` carries `tagFromAi`; `cv_rules` does not.
  - Job card header (skillGroups) for an AI-only job shows `tagFromAi`.
  - User typed a job before the upload, CV draft has the same job from AI → after `mergeDraft` the user's title stays and
    no `tagFromAi` on it.
  - Review screen has no "Improve extraction with AI" button; `i18n.test.js` still finds the same keys in all three files.
- [ ] **Step 2: Run** the listed test files — expect FAIL.
- [ ] **Step 3: Implement** the screens and strings; delete the two components, the `ai*` actions, `state.ai`, `cvDraft`
  (only the compare view used it) and the three `profileState` helpers.
- [ ] **Step 4: Run** `npm test` — expect all PASS; note the new count.
- [ ] **Step 5: Browser check** (`preview_start cv-trial`, no `CV_LLM_KEY`): upload a synthetic CV from
  `testing/eval-cvs.json` (build it with `scripts/eval-cv.mjs` helpers or `tests/helpers/cvFixtures.js`) → notice shown,
  ready receipt shows the `ai_unavailable` line, form works; screenshot. Record results in `docs/acceptance.md`.
- [ ] **Step 6: Commit** `feat: upload notice names DeepSeek; AI tags and fallback line; re-read screens removed`

### Task 5: Accuracy check mode in `eval-cv.mjs`

**Files:**
- Modify: `scripts/eval-cv.mjs`
- Test: `tests/evalCv.test.js`

**Interfaces:**
- Consumes: `createAiReader`, `providerFromEnv` (Task 1); `mergeDrafts` (Task 2).
- Produces: `node scripts/eval-cv.mjs --ai` (reads `.env` via `node --env-file-if-exists=.env`); exported
  `costOf(usage: { input, output }, price: { input, output }): number` (USD, prices per 1M tokens) and
  `DEEPSEEK_PRICES = { 'deepseek-flash': { input: 0.30, output: 1.20 }, 'deepseek-v4-pro': { input: 1.32, output: 3.96 } }`
  (peak, cache miss, from the spec §3, dated 31 Oct 2026).

- [ ] **Step 1: Write the failing tests**: `costOf({ input: 5000, output: 2000 }, DEEPSEEK_PRICES['deepseek-flash'])`
  ≈ `0.0039` (toBeCloseTo 4 digits); `--ai` without `CV_LLM_KEY` exits with the message
  `CV_LLM_KEY is not set; the AI check needs the owner's DeepSeek key.` (test the exported `checkAiSettings(env)` that
  returns that string or `null`).
- [ ] **Step 2: Run** `npx vitest run tests/evalCv.test.js` — expect FAIL.
- [ ] **Step 3: Implement**: with `--ai`, each case runs rules-only and rules + AI (`mergeDrafts`), and
  `docs/eval-results.md` gets both tables side by side (precision, recall, F1 per field, wrong-item rate, latency) plus
  total tokens and cost at peak price, the model name and the date. Without `--ai` the output is unchanged.
- [ ] **Step 4: Run** `npx vitest run tests/evalCv.test.js` then `npm test` — expect PASS.
- [ ] **Step 5: Commit** `feat: eval-cv --ai compares rules-only with rules + DeepSeek, with tokens and cost`

### Task 6: Docs, sources and the paid check

**Files:**
- Modify: `data/SOURCES.md`, `HANDOVER.md`, `CLAUDE.md` (test count, settings), `README.md`, `docs/tools-declaration.md`,
  `docs/acceptance.md`, `docs/architecture-cv-branch.html` (status line PLANNED → ON once Task 5 runs),
  `docs/record/status.json`

- [ ] **Step 1:** `data/SOURCES.md`: DeepSeek API entry — pricing and privacy URLs from spec §3, checked 31 Oct 2026,
  models `deepseek-flash` / `deepseek-v4-pro`, data stored in China, used for CV reading only.
- [ ] **Step 2:** Update HANDOVER/CLAUDE/README/tools-declaration: settings `CV_LLM_*`, removed parts, new test count,
  the PDPA note (real CVs leave Malaysia; fine for synthetic data, check before real users).
- [ ] **Step 3: Ask the owner** for `CV_LLM_KEY` in `C:\Users\guiro\XH_Cat_Final-cv\.env` and a yes on the cost (11 CVs,
  under $0.50). Only after the yes: `node --env-file=.env scripts/eval-cv.mjs --ai`; show the owner the table and the
  real cost; the owner picks `deepseek-flash` or `deepseek-v4-pro`.
- [ ] **Step 4:** Browser check with the key: upload one synthetic CV, see "Found by AI" items and no warning line;
  screenshot into `docs/acceptance.md`.
- [ ] **Step 5:** Build record entry, `python docs/record/build_record.py`, `npm test`, commit
  `docs: DeepSeek CV reading — sources, handover, acceptance and eval results`.
