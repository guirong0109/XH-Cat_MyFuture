# HANDOVER — branch `claude/cv-profile-module` (CV extraction and structured profile module)

Written 2026-10-29 at the end of the session that built this module. This is the detailed handover for this
feature branch. `main` has a short version with only the important points.
Repository: `C:\Users\guiro\XH_Cat_Final`, GitHub `https://github.com/guirong0109/XH-Cat_MyFuture` (private).

---

## 1. The task and the ultimate goal

**Product:** FutureReady MY, a career-planning app for Malaysia. It is built for the "Domain 1" finalist round, and the
owner's guide is `Domain 1 - Finalist Guide.md`, which is not in this repo.

**This branch** builds the first module: **CV Extraction and Structured Profile**. A user ends with a
**confirmed, structured profile**: studies, jobs, skills with O\*NET ids and levels (or an explicit "not assessed"),
certificates, projects, preferences, occupation links with source and version, and provenance. They get there in
one of three ways:
- **Case A:** upload a CV.
- **Case B:** fill in a form.
- **Case C:** review and confirm.

**Ultimate goal:** the confirmed profile is the input for the next modules: matching, learning roadmap, SDG and
scenario comparison. Those modules are not built. The CV spec's acceptance criterion is "real changes to the
confirmed profile produce explainable changes in career guidance". Until matching exists, this module proves that the
profile, its JSON and the summary change (spec §11 adaptation).

**Binding documents (read in this order):**
1. `docs/superpowers/specs/2026-10-29-cv-profile-module-design.md`: the spec. It is authoritative and aligned to the
   owner's architecture diagram.
2. `docs/superpowers/plans/2026-10-29-cv-profile-module.md`: the plan, 18 tasks plus Review Focus.
3. The owner's diagram: `C:/Users/guiro/XH-Cat_Domain1/docs/architecture-cv-profile.html`. Read it only; that
   folder is another project.
4. The starting UI: `docs/mockup-journey.html`. The look will be redesigned at the final stage.

The older documents are SUPERSEDED. Do not follow them:
- `docs/superpowers/specs/2026-10-29-futureready-final-design.md`
- `docs/superpowers/specs/2026-10-29-cv-profile-design.md`
- `docs/superpowers/plans/2026-10-29-futureready-final.md`

---

## 2. What is done, and where

All 18 plan tasks are done. Task 12 (L3) was built but **switched off by the owner's choice**. There was a final
whole-branch review by a fresh reviewer: 0 Critical, 7 Important and 11 Minor findings, all fixed, each with a test
that failed first. The branch was merged into `main` via PR #1
(`https://github.com/guirong0109/XH-Cat_MyFuture/pull/1`, merge commit `301c10e`).

| Area | Files |
|---|---|
| Server entry, app wiring | `server/index.js` (PORT 3200), `server/app.js` (`createApp({...})`, all optional services injected) |
| Errors | `server/errors.js`: one shape `{error:{code,message,retryable}}` |
| CV pipeline (Case A) | `server/cv/validateFile.js` → `readText.js` (pdfjs-dist legacy build, ≤300 lines, ≤20,000 chars, ≤500 chars/line) → `detectLanguage.js` → `extract.js` (L1 sections, L2 rules + O\*NET names, L4 merge; `EXTRACTOR_VERSION='cv-1.0'`) with `patterns.js`; route `server/routes/cv.js` `POST /api/cv/extract` (raw body, 20 s timeout) |
| L3 semantic match (off) | `server/cv/semantic.js` (RunPod OpenAI-compatible `/embeddings`, warm-up at start), `scripts/model-eval.mjs`, `testing/model-eval-set.json` (61 terms), `docs/model-eval.md` ("Not run") |
| Skills | `server/skills/onetSkills.js` (catalogue ids `onet:tech:<name>`, `onet:el:<element id>`), `server/skills/normalize.js`, `server/routes/skills.js` `POST /api/skills/normalize` |
| Occupations | `server/occupations/{onetLive,cache,onetSnapshot,lookup}.js`, `server/routes/occupations.js` `GET /api/occupations/search?q=`; order live → cached (cached live answer, else snapshot) → eMASCO alternative → failed |
| Accounts / storage | `server/auth.js` (scrypt, `fr_session` cookie, sign-in limit 10 per 15 min), `server/routes/auth.js`, `server/store/d1.js` + `migrations.sql`, `server/store/r2.js` (SigV4), `server/rateLimit.js`, `server/routes/profiles.js` (validate, save, list, get, PATCH with version → 409, mappings) |
| DeepSeek reads every CV (31 Oct, owner decision; spec `docs/superpowers/specs/2026-10-31-cv-ai-reading-design.md`) | `server/cv/aiRead.js` (one chat call, `response_format: json_object`, 15 s, 20 reads per hour per address, every item must quote the CV, CV text never logged), `aiReadPrompt.js`, `mergeDrafts.js` (rules win; the AI fills empty fields and adds missed items; a different AI value gives `extraction.aiDiffers` and an uncertain `ai_differs`; same item = evidence on word boundaries of at least 8 characters (tried first for every AI item), else an equal main field unless the employer or institution is filled in on both and differs; AI items match rules items only; skills by O\*NET id when both have one, else normalised name). `server/routes/cv.js` runs both readers together and waits for the AI only for the time left on the 20 s upload clock (500 ms margin); warnings `ai_unavailable`, `ai_limit`; `extractor.layers` gains `ai` and `extractor.model` when merged. Browser: upload notice (en/ms/zh), tag "Found by AI — check it", "<field> — AI read this as: … Check it." and "<field>: filled in by AI — check it." lines, fallback line on the ready receipt. `mergeDraft` now keeps repeated draft items. Tests: 352 pass |
| Removed on 31 Oct | `POST /api/cv/reextract`, `reextract.js`, `reextractPrompt.js`, the consent box, the compare view (`improveWithAi.js`, `compareView.js`), the Claude backup, `CV_LLM_BACKUP_*`, the R2 upload copy and its `cv-temp` deletes, `features.tempCopy`, `tempStore` in `createApp`. `server/store/r2.js` stays but the CV flow no longer uses it |
| Shared (browser + server + tests) | `shared/profileSchema.js`, `shared/profileState.js`, `shared/flow.js`, `shared/guestStore.js` (localStorage key `futureready-profile-v1`), `shared/i18n.js`, `shared/strings/{en,ms,zh}.js` (same keys, enforced by a test) |
| Browser (ES modules, no build) | `public/index.html`, `public/styles.css`, `public/js/app.js` (state, router, all actions), `public/js/{api,cvApi,accountApi,ui}.js`, `public/js/screens/*.js`, `public/js/components/*.js` |
| Data | `data/onet/*.tsv` + `manifest.json` (O\*NET 31.0, SHA-256 checked), `data/emasco/occupations.json` (1,766), `data/isced/*.tsv` + `manifest.json` (ISCED-F 2013, 124 fields, CIP bridge to O\*NET), `data/SOURCES.md` |
| Career interests and fields (30 Oct, owner request) | `data/onet/interest_areas.tsv` (from `pipeline/fetch_onet.py`), `server/interests/interestAreas.js`, `GET /api/interests`, `interestField` in `public/js/screens/form.js`, `mergeCareerFields` in `shared/profileState.js` |
| Skills from field of study (30 Oct, owner request) | `server/fields/fieldSkills.js`, route `GET /api/fields/:code/skills` in `server/routes/fields.js`, `public/js/components/fieldSuggestions.js` (Skills section) |
| Search pickers (30 Oct, owner request) | `public/js/components/searchPicker.js`; APIs `GET /api/skills/search` (`searchSkills` in `server/skills/onetSkills.js`) and `GET /api/fields/search` (`server/fields/isced.js`, `server/routes/fields.js`); roles reuse `/api/occupations/search`, now matching word starts |
| Pipeline | `pipeline/fetch_onet.py`, `pipeline/fetch_isced.py`, `pipeline/tests/test_fetch_onet.py`, `pipeline/tests/test_fetch_isced.py` |
| Evaluation | `scripts/eval-cv.mjs`, `testing/eval-cvs.json` (11 synthetic CVs), `docs/eval-results.md` |
| Docs | `README.md` (run, settings, owner setup), `docs/acceptance.md`, `docs/tools-declaration.md`, `docs/build-record.html` (step-by-step build record, generated), `docs/architecture-cv-branch.html` (diagram of this branch: every file by layer, git history, service status) |
| Look (31 Oct, owner request) | `public/styles.css` (landing page design language: cream, serif, mono, thin rules), fonts in `public/index.html`, receipt / ATM classes in `welcome.js`, `upload.js`, `review.js`, `summary.js`; checks in `tests/appLook.test.js`. No roller counters yet: these screens have no real counts |
| First question (31 Oct, owner request) | `welcome.js` asks "For myself" or "For my organisation" (`data-act="use"`, `state.use`); organisations then pick C or D in `category.js` (personal users: see "Which describes you best?" below); no Sign in link there (owner): sign in on the next screen or from the top bar. `access.js`: personal = guest or account; organisation = account only (no guest; `guest` action refuses `state.use === 'org'`); without accounts on the server it says so (`acOrgOff`) and offers "Use it for myself instead"; strings `useTitle`, `usePersonal(Text)`, `useOrg(Text)`; tests `tests/useChoice.test.js` |
| Goal question (31 Oct, owner request) | `public/js/screens/goal.js` after guest / account for personal users (`afterAccess()` in `app.js`; organisations go to `category`), then "Who are you?". Saved as `preferences.careerGoal`; the form offers the same four goals. Tests `tests/goal.test.js`. The one-line texts under the goals are Claude's wording, for the owner to check |
| Which describes you best? (31 Oct, owner requests) | Start = personal / organisation → guest or account → goal → CV or form; `category.js` ("Who are you?") is for organisations only (C, D). Personal users answer at the top of the profile form: four buttons (`WHO` in `form.js`, `choiceField` in `fields.js`, action `choose`): Student, Fresh graduate, Underemployed, Unemployed, plus a "Prefer not to say" pill. Saved as `userCategory`; `USER_CATEGORIES` in `shared/profileSchema.js` accepts them plus the two old values. Strings `catGrad`, `catStudent`, `catUnder`, `catUnemp` (+ `Text`); `catA`/`catB` left for `main`'s landing page. Tests `tests/category.test.js`. No "Working adult" option any more (owner's list) |
| No education status (31 Oct, owner request) | "Current education status" removed from the form (`form.js`) and the receipt (`review.js`, shown only if an earlier profile has an answer). `education.educationStatus` stays in `shared/profileSchema.js` for saved profiles |
| Qualifications (31 Oct, owner requests) | `form.js` `qualifications()`: "+ Add a qualification" adds a row with only the level (`QUALIFICATIONS`) and the field of study (major): a dropdown of all ISCED-F fields by broad area, from the read-only `GET /api/fields` (`server/routes/fields.js`, `isced.list()`). No highest qualification (shown on the receipt only for a profile saved earlier with one), no institution, no year. Tests `tests/qualifications.test.js` |
| No certificates, training or projects (31 Oct, owner request) | `SECTIONS` in `form.js` has four sections. `dropNotAsked` empties `certifications`, `training` and `projects` in the CV draft, rules and AI alike (`app.js`); the server's CV reader still finds them. The receipt shows them only for an earlier saved profile. Tests `tests/noCertificates.test.js` |
| No employment status (31 Oct, owner request) | "Current employment status" removed from the form (`form.js`) and the receipt (`review.js`, shown only if an earlier profile has an answer). `employment.status` stays in `shared/profileSchema.js` for saved profiles |
| Jobs: title then years (31 Oct, owner request) | `form.js` `jobRow()`/`work()`: Job title, then Years of work experience for that job (`years`, number box with arrows, `toYears`); the first job is on screen straight away and typing creates it; the occupation finder stays. Employer, period, industries and `employment.yearsOfExperience` are no longer asked (the receipt shows them only when a CV or earlier profile has them). Tests `tests/employment.test.js` |
| Last section renamed (31 Oct, owner request) | `secPrefs` reads "Interests" (BM "Minat", 中文 "兴趣"); the key and the questions inside are unchanged |
| Interests: one question (31 Oct, owner request) | `form.js` `prefs` is only `interestField` (Career interests and fields); career goal (asked on the goal screen), occupations of interest, work location and learning hours are not asked; the receipt shows location and hours only when saved earlier. Main's radar also reads occupations of interest |
| Review and confirm on Interests only (31 Oct, owner request) | `form.js`: sections 1-3 end with Back and Next (main button); only the last section shows Review and confirm |
| Skill level toggle bar (31 Oct, owner request) | `form.js` `levelBar()`: `.toggle` radiogroup of Not assessed yet / Basic / Good / Expert, `data-act="level" data-arg="<i>|<level>"`; `app.js` `level` action (empty = not assessed) |
| Skills grouped under jobs and projects (31 Oct, owner request) | `skills[].usedIn = [{ kind: 'job'|'project', title }]`, set by the CV reader (lines under a job or project) and the DeepSeek reader (`usedIn` field); `public/js/screens/skillGroups.js` draws a card per job and project plus Others, with Looks right / Confirm all / Edit (level bar) / + add skill. Links are by title: renaming keeps them, removing moves skills to Others. Projects are back (`NOT_ASKED` = certificates, training). |
| Used in a job or project = Good (31 Oct, owner rule) | `levelFromUse()` in `shared/profileSchema.js`: a skill with `usedIn` and not yet rated gets `proficiency: 'good'`, `proficiencyStatus: 'from_projects'` (tag "From your projects"); losing every link resets it; a user's level is never changed. Applied by the CV reader, the DeepSeek reader and `linkSkill`/`unlinkPlace`. Main's matching reads this level. Other skills are folded (`state.otherOpen`) |
| CV result: only Edit in the form (31 Oct, owner request) | `upload.js` `ready()`: one main button to the form; no Review and confirm or Upload another file there, because the CV reading is never fully correct |
| CV qualification and field prechosen (31 Oct, owner request) | CV reader sets `education.records[].level` (the AI never does) (`levelOf` in `server/cv/patterns.js`); `public/js/cvPrechoose.js` sets `field` to the first `/api/fields/search` match for the CV words (`via: 'cv_match'`, `term`) before the draft is merged; the form shows "Chosen from your CV … Check it is right" |
| Build record source | `docs/record/build_record.py` reads `docs/record/status.json` (+ `_head.html`, `_tail.html`) and writes `docs/build-record.html` |

---

## 3. Where it is stuck, and what to do next (by priority)

**No failing tests and no open errors.** The jam is that external services are not configured.
Each item below says what you will see and what to do.

1. **P1 — Accounts show "Accounts are not available on this server."**
   - **Cause:** no Cloudflare D1 settings. `createD1FromEnv()` returns null, and `/api/auth/*` answers
     503 `accounts_unavailable`.
   - **Do:** get the owner's `D1_ACCOUNT_ID`, `D1_DATABASE_ID` and `D1_TOKEN` and put them in `.env` (copy
     `.env.example`). Then create the tables once:
     `node --env-file-if-exists=.env -e "import('./server/store/d1.js').then(m => m.createD1FromEnv().migrate())"`.
   - **To test without Cloudflare:** run `node scripts/serve-local-accounts.mjs`, which uses an in-memory SQLite
     stand-in on port 3100, or 3201 via the launch config `cvaccounts`.
3. **P2 — Occupation lookup always says "From O\*NET snapshot 31.0 (cached, 2026-10-29)".**
   - **Cause:** there is no `ONET_API_KEY`, so the warning is `no_api_key`.
   - **Do:** the owner registers a free key at https://services.onetcenter.org and sets `ONET_API_KEY`.
   - API base `https://api-v2.onetcenter.org`, `X-API-Key` header, path `/online/search?keyword=`.
4. **P1 — DeepSeek accuracy check not run; no key yet, so CVs are read by the rules only.**
   - **Cause:** no `CV_LLM_KEY`. The upload shows "AI reading was not available this time; please check carefully".
   - **Do:** the owner puts `CV_LLM_KEY` in `.env` and says yes to the cost (11 CVs, under $0.50). Then run
     `node --env-file-if-exists=.env scripts/eval-cv.mjs --ai` (rules-only against rules + DeepSeek: precision,
     recall, F1, wrong-item rate, latency, tokens, cost at peak price). The owner then picks `deepseek-flash`
     (default) or `deepseek-v4-pro`. Also upload one synthetic CV in the browser to see the "Found by AI" tags.
   - **PDPA:** the CV text is sent to DeepSeek in China. Fine for synthetic data. Check Malaysia's PDPA
     cross-border rules before real users.
5. **P3 — L3 is off; extraction warnings say `semantic_unavailable`.**
   - The owner chose to skip it.
   - To enable: create a RunPod embedding endpoint (`BAAI/bge-m3`; the 16 GB pool showed $0.58/h while running;
     **ask for the price OK first**) and set `SEMANTIC_URL`, `SEMANTIC_KEY` and `SEMANTIC_MODEL`.
   - Then run `node scripts/model-eval.mjs` and set `SEMANTIC_CUTOFF` to the cutoff it writes to
     `docs/model-eval.md`.
6. **P3 — Known extraction misses** (`docs/eval-results.md`, left as measured, not tuned):
   - "Google" is taken from the certificate line "Google Data Analytics Certificate, 2023".
   - "Oracle Database" is taken from a Malay certificate line.
   - "QuickBooks Online" is not in O\*NET 31.0.
   - "MS Excel" stays a second, unknown skill next to "Microsoft Excel"; L3 would fix this.
7. **P4 — Visual redesign at the final stage.** The owner's plan: the screens currently use the mockup's look, so
   keep logic out of markup.
8. **P4 — Next module: matching.** It is not started. CV spec §12 "Profile modified" and §13 Tests 3 and 7 are
   accepted only in adapted form until it exists. It must consume the confirmed profile JSON:
   - skills with `canonicalId` and `proficiency`;
   - `employment.records[].occupation.code`;
   - `occupationMappings`;
   - `preferences`.
   **No scoring method from the old project.**

---

## 4. Commands run and results (last run 2026-10-29)

| Command (from `C:\Users\guiro\XH_Cat_Final`) | Result |
|---|---|
| `npm test` (= `vitest run`) | **43 files, 352 tests passed** on this branch (31 Oct) |
| `python -m unittest discover pipeline/tests` | **8 tests OK** |
| `python pipeline/fetch_isced.py` | 124 ISCED-F fields, 118 linked to O\*NET (run 30 Oct from files downloaded by hand) |
| `node scripts/eval-cv.mjs` | 11 CVs, 0 failures. Skills P 0.917 / R 0.971 / F1 0.943; qualifications, jobs and certificates 1.0; median 3–4 ms per CV; 0 levels set |
| `node scripts/model-eval.mjs` | **Not run.** It needs `SEMANTIC_*`, which the owner skipped |
| `python docs/record/build_record.py` | writes `docs/build-record.html` (20/21 done; T12 skipped) |
| `npm start` | server on http://localhost:3200; reads `.env` if present (`node --env-file-if-exists=.env`) |
| Browser acceptance | Recorded in `docs/acceptance.md`, all pass. Test 1 in BM, desktop; Test 2 and refresh in 中文 at 360 px; error exits in EN; Tests 3, 4, 5, 6 and 7 |

---

## 5. Pitfalls, wrong assumptions, and attempts not to repeat

**Owner rules (do not break):**
- **Do not use the `C:/Users/guiro/XH-Cat_Domain1` folder as a template.** Only data files were copied from it
  (eMASCO). Do not copy its code or its scoring.
- **No scoring or matching method from the previous project.**
- **Follow the owner's diagram exactly.** Add nothing it does not state. Example: I added per-address limits on
  sign-up, upload and search; the owner said "This dont limit" and they were removed (commit `372adad`). Only the
  spec's limits exist: sign-in 10 per 15 min; AI reading 20 per hour per address.
- **Anything paid needs the owner's OK on the price first,** including RunPod endpoints.
- **Integration (merge, push, PR) is the owner's decision.** Force-push only with an explicit OK.

**Search pickers and "Prefer not to say" (30 Oct):**
- **The owner chose the field-of-study list:** ISCED-F 2013 + O\*NET via the CIP files. O\*NET 31.0 itself has no
  field-of-study data: element 2.D.2 "Instructional Program Required" has no rows. Don't look for it again.
- **The bridge is stored only.** `isced_cip.tsv` and `cip_onet.tsv` are for the matching module. CIP Canada 2016 and
  CIP 2020 are joined on equal codes only, so 6 fields have no O\*NET link.
- **Field names are English only.** There is no official BM or 中文 list; the BM and 中文 hint says to search in English.
- **The picker redraws only its list (`#pick-<key>`), not the page,** so the input keeps focus. A full `render()`
  while typing would lose the cursor.
- **"Prefer not to say" default:** `showSection()` in `app.js` runs `declineUnanswered` for the open section.
  `isUntouched` ignores declined fields on purpose, so a CV draft or an account profile can still fill them.
- **Skill suggestions use the owner's rule B ("typical of the field").** There is no minimum gap above the average, so
  weak ones can appear, e.g. Accounting → Programming 1.76 against 1.60. Changing the rule is the owner's call.
- **Suggestions are click-to-add chips (owner, 30 Oct).** The owner found a ticked list with reasons too long. The
  reason is the chip's hover text; 8 show first.
- **Test in the browser on an address nobody else uses** (e.g. `127.0.0.2:3200`). The owner may click in any Browser
  pane tab, including `localhost`, `127.0.0.1` and `[::1]`. Each address has its own saved progress. Never edit
  localStorage in a tab the owner has touched. On 30 Oct a test script did that in the `[::1]` tab: it set career
  interests to "Data" and "Finance" and told the owner.
- **The skill search used to look broken for everyday words** ("pet" → IHS Petra, "leadership" → nothing): the
  catalogue was software products plus 36 basic skills. Work styles, knowledge areas and work activities are now
  in the search (`catalogue.more`), ordered general-first. O\*NET's own wording is needed ("Cooperation", not
  "teamwork").
- **Sources on screen are a must (owner: "highly important").** Any new list or suggestion must say where its data
  comes from.
- **Screenshots in the Browser pane can lag behind clicks.** Read state with `javascript_tool` before deciding
  that something failed.

**Technical traps that already bit:**
- **Bash heredocs break on apostrophes in this environment.** Write scripts with the Write tool into the scratchpad
  (`C:\Users\guiro\AppData\Local\Temp\claude\C--Users-guiro-XH-Cat-Final\<session>\scratchpad\`) and run them with
  `python <file>`.
- **Inline `python - <<'EOF'` that writes JS turns `'\n'` into a real line break.** Check with `vitest` after.
- **pdfjs-dist in Node needs `standardFontDataUrl`,** a path with forward slashes and a trailing slash, and
  `await task.destroy()`, not `doc.destroy()`. See the top of `server/cv/readText.js`.
- **Chinese headings like 技能 and 证书 have only 2 characters.** The reader keeps lines with ≥3 letters or ≥2 Han
  characters. Don't raise this threshold.
- **A long pasted paragraph must not stop reading.** Lines are cut to 500 characters and the reader continues.
  Don't change it back to `break`.
- **Normaliser:** a catalogue name that merely *contains* the input is offered as a candidate and never linked
  silently ("Teamwork" must not become "Digital Crew Teamwork Project Manager").
- **One-word software names** count only when capitalised. Inside a sentence, the first word is skipped ("Chef at
  Hilton…"). In list-like lines (with `, ; • | / ·`) or the Skills section, any position counts.
- **An outage is never `no_match`:** live failed plus zero snapshot hits gives state `cached`, with 0 candidates and
  a `live_failed:*` warning.
- **Sign-out clears browser storage** (shared computers). A version conflict (409) offers "Load the saved version".
  Don't remove either.
- **`safeLocalStorage()`** in `shared/guestStore.js`: reading `window.localStorage` itself throws when site data is
  blocked. Never touch `globalThis.localStorage` directly.
- **Old entries in `.claude/launch.json`** (`mockup`, `app-test`, `app-accounts`) point at the Domain1 folder.
  **Use `cvmodule` (3200), `cvaccounts` (3201) and `record` (8766).**
- **Browser testing:**
  - The owner clicks in tab-9 of the Browser pane; run scripted checks in another tab.
  - `preferences.careerGoal` is a `<select>`: set an option value such as `change`, not free text.
  - A reload wipes `window.*` test variables.
  - A reload with saved progress shows the "Welcome back" screen first.
- **Line endings:** `.gitattributes` keeps `data/onet/*.tsv` in LF so the manifest hashes match on Windows. The
  "LF will be replaced by CRLF" warnings on other files are harmless.
- **GitHub history:** the GitHub repo started with its own "Initial commit" (Apache-2.0 `LICENSE`, `a970dae`). It was
  merged in, not overwritten.

---

## 6. Workspace state (2026-10-29, end of session)

- **Branches** (all pushed, nothing uncommitted, no stash):
  - `main` at `301c10e` (merge of PR #1), tracking `origin/main`.
  - `claude/cv-profile-module` at `88b8ae0`, tracking `origin/claude/cv-profile-module`. It holds this detailed
    HANDOVER.md and CLAUDE.md once committed.
- **Remote:** `origin` = `https://github.com/guirong0109/XH-Cat_MyFuture.git`. `gh` is logged in as `guirong0109`.
- **Git-ignored and local only:**
  - `node_modules/`
  - `.env` (does not exist yet)
  - `data/cache/` (cached live O\*NET answers)
  - `.claude/` (launch configs)
  - `.superpowers/sdd/2026-10-29-cv-profile-module/`: the execution ledger `progress.md` with every `Ruling:` line,
    and the review package. It is safe to delete; its content is summarised in `docs/build-record.html`.
- **Environment:**
  - Node ≥ 22.12 required (`package.json` engines); built on **Node 24.16.0**. `node:sqlite` is used by the D1
    stand-in.
  - Python 3, built on 3.14.0, standard library only.
  - Dependencies: `express ^5.3.0` and `pdfjs-dist ^6.4.299`; dev `vitest ^5.0.5`. Install with `npm install`.
- **Settings:** all optional. They are listed in `.env.example` and the README:
  `ONET_API_KEY`, `D1_*`, `SEMANTIC_*`, `CV_LLM_URL`, `CV_LLM_KEY`, `CV_LLM_MODEL` (DeepSeek), `CV_MAX_MB`, `TRUST_PROXY`, `PORT`.
- **Start working:**
  ```bash
  cd /c/Users/guiro/XH_Cat_Final
  git checkout claude/cv-profile-module && git pull
  npm install
  npm test                                # expect 352 passed
  npm start                               # http://localhost:3200
  node scripts/serve-local-accounts.mjs   # accounts with in-memory stores, http://localhost:3100
  ```
- **Branch documentation rule (owner):**
  - Every branch keeps a detailed `HANDOVER.md` and `CLAUDE.md` for its feature.
  - `main` keeps short versions with only the important points.
  - On every merge to `main`, carry the important points into main's two files. Do not overwrite them with the
    branch's detailed ones.
