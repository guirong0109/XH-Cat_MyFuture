# CLAUDE.md — `hr-branch` (detailed)

Read `HANDOVER.md` here first, then the spec `docs/superpowers/specs/2026-10-31-hr-org-view-design.md` and the
diagram `docs/architecture-org.html`. They are approved and bind the build: add nothing they do not state. All 12 plan
tasks are built. Do not touch main's files; the owner decides on merge.

## Rules (from `main`, all still apply)
- **One branch per feature.** This branch keeps the detailed `HANDOVER.md` and `CLAUDE.md`. On merge to `main`, update
  main's two short files with only the important points; don't overwrite them with these.
- **Follow the owner's architecture diagram exactly** (`docs/architecture-org.html`).
- **No scoring or matching method from the previous project or from the claude.ai prototype.**
  `C:/Users/guiro/XH-Cat_Domain1` is not a template.
- **Ask the owner before:** anything paid (state the price), merge, push, PR, and above all force-push.
- **Test first** (Vitest). Run `npm test` before every commit. Commit messages: `feat:`, `fix:` or `docs:`, with no
  attribution lines.
- **Record every step** in the build record (`docs/record/status.json` → `python docs/record/build_record.py`).
- **Show the source and date of every list, number and suggestion on screen** (owner: "highly important").
- **Test in the browser on an address nobody else uses** (e.g. `127.0.0.2:3200`).
- **New data needs a source:** `data/SOURCES.md` (where from, date, licence), a manifest hash, and the original kept
  when it is small.
- **Use plain words** with the owner.

## Organisation-view rules
- Skill Match and gaps come only from matching's service. Trends and AI scenarios set only the outlook (band counts
  and "moved"); they never change the heatmap, the plan order or the gaps.
- eMASCO → O\*NET only through `data/radar/occupation-bridge.json` (via matching). A broken chain shows "not
  available" with the missing step; the person is left out of that role's sums, and of band counts, "moved" and the
  SDG count, and the screen says how many.
- Levels: basic, good, expert, not_assessed. Not listed = gap; not_assessed meets the level and marks the result
  provisional.
- HR sees only shared skills (O\*NET item key and level), group, role and display name. Never a CV, profile, match,
  pathway or progress. Stopping sharing removes the person from every number.
- Team results are worked out on every request and never stored. No skill, name or token in any log.
- Join token: 32 random bytes (`randomBytes(32).toString('base64url')`), stored only as SHA-256 hex, single use, valid
  7 days. Join and share: 10 attempts per 15 minutes per address (dry-run previews not counted).
- Errors: one shape `{error:{code, message, retryable}}` through `sendError` (`server/errors.js`). No D1 → 503; no
  session → 401; another organisation's id → 404.
- Roster: UTF-8 CSV, header `name,group,current_role_code,skill,level`, at most 1 MB; the screen says "Use synthetic
  (made-up) people only". The preview saves nothing.
- Screens say "This helps plan training. It does not make hiring decisions." Strings in EN / BM / 中文
  (`shared/strings/`), BM and 中文 marked `// translation: owner review`. Works at 360 px.
- No language model. Forbidden keys in any answer: score, weight, rank, opportunit (tested). No hours (no file has a
  sourced duration): steps say "Time: see each course page."
- SDG: a count of links with reasons (M16 labels), never a score, never multiplied by headcount.
- Never approve SDG links or pathway picks on the owner's behalf.

## Code
- Pure sums: `shared/org/team.js`.
- Server: `server/org/` (`csv.js`, `roster.js`, `rosterSkills.js`, `store.js`, `service.js`, `routes.js`,
  `shareRoutes.js`); wired in `server/app.js`; tables at the end of `server/store/migrations.sql`.
- Browser: `public/js/orgApi.js`, `orgActions.js`, `public/js/screens/org.js`, `orgParts.js`, `orgShare.js`.
- Data: `data/org/` (synthetic rosters, template, `manifest.json`). Tests: `tests/org/`. Browser results:
  `docs/org/acceptance.md`.

## Working here
- Folder `C:\Users\guiro\XH_Cat_Final-hr` is this branch's worktree. `main` is the worktree
  `C:\Users\guiro\XH_Cat_Final-main`; merge there. Chain git steps with `&&`.
- Bash heredocs break on apostrophes here. Write helper scripts with the Write tool and run them with python.

## Commands
```bash
npm install && npm test     # expect 1297 passed
npm start                   # http://localhost:3200, tab #org
node scripts/serve-local-accounts.mjs   # local server with a fake in-memory D1 (accounts work without keys)
python -m unittest discover pipeline/tests   # expect 49 OK
```
