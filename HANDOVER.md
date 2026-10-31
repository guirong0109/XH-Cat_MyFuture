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
| AI re-read (no provider) | `server/cv/reextract.js` + `reextractPrompt.js`, route `POST /api/cv/reextract` (consent, 3 per upload, 20 per hour) |
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
| First question (31 Oct, owner request) | `welcome.js` asks "For myself" or "For my organisation" (`data-act="use"`, `state.use`); `category.js` then shows A, B or C, D (all four if unanswered); no Sign in link there (owner): sign in on the next screen or from the top bar; strings `useTitle`, `usePersonal(Text)`, `useOrg(Text)`; tests `tests/useChoice.test.js` |
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
2. **P1 — No temporary CV copy; "Improve extraction with AI" answers `not_configured` or `cv_expired`.**
   - **Cause:** no R2 settings.
   - **Do:** set `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, and add a 1-day
     lifecycle rule on `cv-temp/`.
   - `GET /api/health` shows `features.tempCopy`.
3. **P2 — Occupation lookup always says "From O\*NET snapshot 31.0 (cached, 2026-10-29)".**
   - **Cause:** there is no `ONET_API_KEY`, so the warning is `no_api_key`.
   - **Do:** the owner registers a free key at https://services.onetcenter.org and sets `ONET_API_KEY`.
   - API base `https://api-v2.onetcenter.org`, `X-API-Key` header, path `/online/search?keyword=`.
4. **P2 — AI re-read: "No AI service is set up on this server yet."**
   - **Cause:** the owner chose "build, no provider yet".
   - **Do:** either set `CV_LLM_BACKUP_KEY` (Claude, model `claude-opus-5-5`), or create a RunPod chat endpoint
     **after the owner approves the price**, then set `CV_LLM_URL`, `CV_LLM_KEY` and `CV_LLM_MODEL`.
   - Earlier this session the 24 GB serverless pool showed $0.75/h; re-read the live price before asking.
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
| `npm test` (= `vitest run`) | **31 files, 232 tests passed** on this branch (30 Oct) |
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
  spec's limits exist: sign-in 10 per 15 min; AI re-read 3 per upload and 20 per hour.
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
  `ONET_API_KEY`, `D1_*`, `R2_*`, `SEMANTIC_*`, `CV_LLM_*`, `CV_LLM_BACKUP_*`, `CV_MAX_MB`, `TRUST_PROXY`, `PORT`.
- **Start working:**
  ```bash
  cd /c/Users/guiro/XH_Cat_Final
  git checkout claude/cv-profile-module && git pull
  npm install
  npm test                                # expect 232 passed
  npm start                               # http://localhost:3200
  node scripts/serve-local-accounts.mjs   # accounts with in-memory stores, http://localhost:3100
  ```
- **Branch documentation rule (owner):**
  - Every branch keeps a detailed `HANDOVER.md` and `CLAUDE.md` for its feature.
  - `main` keeps short versions with only the important points.
  - On every merge to `main`, carry the important points into main's two files. Do not overwrite them with the
    branch's detailed ones.
