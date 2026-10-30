# CLAUDE.md — branch `claude/future-radar` (Future Skills Radar)

Read `HANDOVER.md` first: it has the state, what the owner decided and what is next. This file holds the standing
rules and how to work here.

## Owner rules (always)
- **Follow the owner's decisions exactly.** The source of truth is the Round 1 spec
  (`docs/superpowers/specs/2026-10-30-future-radar-round1-design.md`, decisions D1–D22). Add nothing it does not state:
  no extra limits, features or screens.
- **No scoring or matching.** No Current Skill Match, Future Opportunity score, ranking weight, skills gap or ranked
  careers in this branch. Use no method from the previous project. Don't use `C:/Users/guiro/XH-Cat_Domain1` as a template.
- **No invented data or links.** No made-up OpenAlex ids, crosswalks or trends. Unsupported steps stay `pending` or
  `unmapped`; thin data says "Insufficient evidence".
- **Reviews are the owner's.** Never mark a field ↔ topic link or a structural-break review as approved yourself.
- **Every number and list shows its source with a working link** (owner: "highly important", D3).
- **Default view = the user's own fields only;** "View all" sits at the very bottom (D2).
- Ask before anything paid (state the price), before merges, pushes and PRs, and always before a force-push.
- **Branch docs:** this branch keeps detailed `HANDOVER.md` and `CLAUDE.md`; `main` keeps short ones. On a merge to
  `main`, put only the important points into main's files.
- Use plain words with the owner. The owner writes English, sometimes briefly.

## State
- Round 1 is built (plan tasks 1–21 done) and browser-accepted (`docs/radar/acceptance.md`: 27 of 28 pass; F1 phone
  width on Skills & Careers is open). Deployment notes: `docs/radar/deploy.md`. Nothing pushed, merged or deployed.
- Mockup v2 approved 30 Oct with D21 (Skills & Careers tab first) and D22 (screens use `public/styles.css`).
- Any change beyond Round 1 (Round 2 visuals, Round 3 evidence, Matching) needs its own spec and the owner's approval.

## Data rules
- OpenAlex: count by `primary_topic`, complete calendar years, compare only inside one snapshot. Keep query URLs
  (never with the key), fetch time and topic `updated_date`.
- DOSM: read the workbook by **cell address** (a positional reader misread Technicians Q2 2026; the real value is
  86,512). Merged year headers fill to the right; "-" is not available. Keep the original workbook and its hash.
- New data needs a `data/SOURCES.md` entry (where from, date, licence) and a hash.
- BLS files block automated download: never work around it. The owner downloads them.

## Conventions (same as the rest of the app)
- **Test first** (Vitest): failing test, watch it fail, implement, run the whole suite. Real servers on port 0.
- Pure calculations live in `shared/radar/`; no I/O there. Server code in `server/radar/`.
- One error shape: `{error:{code,message,retryable}}`.
- Every UI text through `t(lang, key)`, in `shared/strings/en.js`, `ms.js` **and** `zh.js`; HTML values through `esc()`.
- Browser storage only through `safeLocalStorage()`.
- Never log keys, cookies, CV text or personal fields. Only codes, ids and times.
- Commits: small, `feat:` / `fix:` / `docs:`, no attribution lines.
- Record every step in `docs/record/status.json`, then `python docs/record/build_record.py`.
- Heredocs break on apostrophes here: write helper scripts with the Write tool and run them with python.

## Commands
```bash
npm install
npm test                                           # expect 568 passed (vitest.config.js skips helper worktrees)
python -m unittest discover pipeline/tests         # expect 11 OK
npm start                                          # http://localhost:3200, Radar at #radar (bundled data, read-only)
node scripts/radar-bootstrap.mjs                   # rebuild data/radar/bundle/ (OpenAlex live, DOSM from the kept workbook)
python pipeline/fetch_radar_bridge.py              # rebuild data/radar/occupation-bridge.json
python -I docs/radar/index_analysis.py <out.json>  # re-fetch OpenAlex and recompute the index analysis
python -I docs/radar/threshold_analysis.py <DOSM xlsx> <openalex cache json>   # threshold calibration
python docs/record/build_record.py                 # docs/record/status.json -> docs/build-record.html
```
Local admin and judge: set `RADAR_STORE=memory`, `RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY` (different values) and
`RADAR_SESSION_SECRET` (32+ characters) in the shell or an uncommitted `.env`. Never write keys into tracked files,
reports or chat. `RADAR_STORE=memory` is development only (refused with `NODE_ENV=production`).

Browser pane: `record` (8766) serves `docs/` (mockups, build record); `cvmodule` (3200). Test the app on an address
nobody else uses (e.g. `127.0.0.2:3200` or `radar.localhost`).
