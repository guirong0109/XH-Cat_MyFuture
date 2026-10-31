# CLAUDE.md — branch `claude/cv-profile-module` (CV extraction and structured profile)

Read `HANDOVER.md` first. It covers the state, the next steps and the pitfalls. This file holds the standing rules
and how to work here.

## Owner rules (always)
- Follow the owner's architecture diagram exactly (`C:/Users/guiro/XH-Cat_Domain1/docs/architecture-cv-profile.html`).
  Add nothing it does not state: no extra limits, features or screens.
- Use **no scoring or matching method** from the previous project. Matching is a later module.
- **Do not use `C:/Users/guiro/XH-Cat_Domain1` as a template.** Read the diagram only; its data files were copied
  once already.
- Ask before anything paid (RunPod endpoints: state the hourly price and wait for a yes), before merges, pushes and
  PRs, and always before a force-push.
- **Branch docs:**
  - Every branch keeps a detailed `HANDOVER.md` and `CLAUDE.md` for its feature.
  - `main` keeps short versions with only the important points.
  - On every merge to `main`, update main's two files with the important points. Don't overwrite them with a
    branch's detailed version.
- Explain things to the owner in plain words. The owner writes English, sometimes briefly; answer clearly.

## Source of truth
- Spec: `docs/superpowers/specs/2026-10-29-cv-profile-module-design.md`.
- Plan: `docs/superpowers/plans/2026-10-29-cv-profile-module.md`.
- Files marked SUPERSEDED in `docs/superpowers/` are not to be followed.

## Commands
```bash
npm install
npm test                                          # Vitest, expect 258 passed
python -m unittest discover pipeline/tests        # expect 8 OK
npm start                                         # http://localhost:3200 (reads .env if present)
node scripts/serve-local-accounts.mjs             # dev only: accounts with in-memory D1/R2, port 3100
node scripts/eval-cv.mjs                          # writes docs/eval-results.md
node scripts/model-eval.mjs                       # needs SEMANTIC_* (L3 is off)
python docs/record/build_record.py                # docs/record/status.json -> docs/build-record.html
python pipeline/fetch_onet.py 31.0                # refresh O*NET data + manifest
python pipeline/fetch_isced.py                    # refresh ISCED-F fields + CIP bridge to O*NET
```
Browser pane launch configs (`.claude/launch.json`):
- Use `cvmodule` (3200), `cvaccounts` (3201) and `record` (8766).
- Do not use `mockup`, `app-test` or `app-accounts`; they point at the Domain1 folder.

## Architecture in one breath
- **Layers:** Express 5 `server/`, browser ES modules with no build step in `public/`, and pure modules in
  `shared/` used by browser, server and tests.
- **`createApp({...})`** in `server/app.js` receives every optional service: `d1`, `tempStore`, `semantic`,
  `llmProviders`, `onetLive`, `trustProxy`. Each is null or empty when its settings are missing, and that part
  then reports "not available".
- **One error shape:** `{error:{code,message,retryable}}`.

## Conventions
- **Test first.** Write a failing Vitest test, watch it fail, implement, then run the whole suite. Tests use real
  servers on port 0, synthetic PDF/DOCX from `tests/helpers/cvFixtures.js`, the O\*NET fixture from
  `tests/helpers/onetFixture.js`, and the D1/R2 stand-ins from `tests/helpers/fakeStores.js`.
- **Profile fields:**
  - Optional fields use `{state:'empty'|'declined'|'value', value}`.
  - Skills use `makeSkill()`. `source` is one of `cv_rules|cv_semantic|cv_ai|user_input`. `proficiency` stays null
    until the user sets it, and an extraction never sets it.
  - Forbidden fields are never stored: age, gender, ethnicity, religion, maritalStatus, photo, address, icNumber.
  - The form shows "Prefer not to say" as every optional field's default (a dropdown, never a checkbox; for button
    questions, a pill under the buttons that is on until an answer is chosen). Opening a
    section saves its unanswered fields as `declined` (`declineUnanswered`); `isUntouched` counts only answers.
  - Skills, roles of interest and field of study are picked with `searchPicker` (search as you type). Nothing is
    linked silently: typed or CV wording stays unlinked until the user picks.
  - Skills suggested from a linked field of study (`GET /api/fields/:code/skills`, rule "typical of the field") are only
    added when the user clicks them; they keep `suggestedFrom` and stay `not_assessed`.
  - `preferences.careerInterests` is one list (career interests and fields merged): O\*NET interest areas
    `{source:'onet', id:'onet:ia:…', name, version}`, or texts saved before. `preferredCareerFields` no longer exists.
  - `preferences.careerGoal` takes the four goals of the goal screen (`GOALS` in `public/js/screens/goal.js`: `where_i_stand`,
    `find_direction`, `switch_career`, `grow_field`). Old values (`first_job`, `improve`, `change`, `explore_ai`) still
    display (`OLD_GOALS` in `form.js`); don't convert them silently.
  - `userCategory` is the profile's first question, "Which describes you best?", answered with buttons (`choiceField` in
    `fields.js`, `WHO` in `public/js/screens/form.js`: `student`, `fresh_graduate`, `underemployed`, `unemployed`); `working_adult` and `graduate_switcher` stay valid for saved profiles
    (`USER_CATEGORIES`, `OLD_CATEGORIES`). Don't edit `catA`/`catB` strings: `main`'s landing page uses them.
  - Every list and suggestion shows its source on screen (owner: "highly important").
  - The skill search also offers O\*NET work styles, knowledge areas and work activities (`catalogue.more`). They are
    kept out of `byName`/`byWord`, so CV matching stays as measured. Don't merge them in without re-running the CV eval.
- **Strings:** every UI text goes through `t(lang, key)`. Add each key to `shared/strings/en.js`, `ms.js` **and**
  `zh.js`; `tests/i18n.test.js` fails otherwise. Every interpolated text in HTML goes through `esc()`.
- **Privacy:** never log CV text, AI replies or personal fields. Only error names and codes are logged.
- **Browser storage:** `safeLocalStorage()` (`shared/guestStore.js`), never `globalThis.localStorage` directly.
- **Writing JS from scripts:** in this environment, heredocs break on apostrophes. Write helper scripts with the
  Write tool and run them with python.
- **Commits:** small, one per task or fix. Messages use the form `feat:`, `fix:` or `docs:`. Don't add attribution
  lines.
- **Look (31 Oct, owner request):** the screens use the landing page's design language, all in `public/styles.css`:
  cream page, Instrument Serif headlines, Geist body, Geist Mono labels, thin rules instead of boxes. The CV drop
  zone is an ATM (`.drop.atm`); the CV reading, the draft, Review and Your profile are receipts (`.slot` > `.receipt`).
  Keep one rule per class (`tests/appLook.test.js`) and check light, dark and phone width after any CSS change.
- **Build record:** after each task, update `docs/record/status.json` and regenerate `docs/build-record.html`.
  The owner wants every step recorded.
