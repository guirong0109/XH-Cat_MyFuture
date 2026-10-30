# CLAUDE.md — `claude/career-matching` (detailed)

Read `HANDOVER.md` here first, then the spec `docs/superpowers/specs/2026-10-30-career-matching-design.md` and the
diagram `docs/architecture-matching.html`. They are approved and bind the build: add nothing they do not state. All 16 plan tasks are built; the final
whole-branch review is next. Do not touch main's files; the owner decides on merge.

## Rules (from `main`, all still apply)
- **One branch per feature.** This branch keeps the detailed `HANDOVER.md` and `CLAUDE.md`. On merge to `main`, update
  main's two short files with only the important points; don't overwrite them with these.
- **Follow the owner's architecture diagram exactly** (`docs/architecture-matching.html` once approved).
- **No scoring or matching method from the previous project.** `C:/Users/guiro/XH-Cat_Domain1` is not a template.
  Its eMASCO crawl file was read for data only (owner decision M3); never its code.
- **Ask the owner before:** anything paid (state the price), merge, push, PR, and above all force-push.
- **Test first** (Vitest). Run `npm test` before every commit. Commit messages: `feat:`, `fix:` or `docs:`, with no
  attribution lines.
- **Record every step** in the build record (`docs/record/status.json` → `python docs/record/build_record.py`).
- **Show the source of every list, number and suggestion on screen** (owner: "highly important").
- **Test in the browser on an address nobody else uses** (e.g. `127.0.0.2:3200`).
- **New data needs a source:** `data/SOURCES.md` (where from, date, licence), a manifest hash, and the original kept
  when it is small.
- **Use plain words** with the owner.

## Matching-specific rules
- Skill Match = Σ min(you, needed) ÷ Σ needed over O\*NET skills + knowledge with importance ≥ 3.0. Levels: basic 2,
  good 4, expert 6; "Not assessed yet" meets the level and marks the result provisional. The owner's chart example
  (needed 12.05, met 9.2, 76%) is a test.
- eMASCO → O\*NET only through the official chain in `data/radar/occupation-bridge.json`. A broken chain shows "not
  available" with the missing step, never a guess.
- Trends and the AI scenario never change the Skill Match; they set the outlook parts and the band.
- Read Radar signals as the contract says (`docs/radar/contract.md`, "What Matching may read / must not infer").
- Every SDG team-draft link appears now (M16, 31 Oct), labelled "not yet reviewed" or "approved by owner on <date>"; rejected ones are hidden; the path contribution is a count of links with reasons, never a score.
- The profile sent to `/api/matching` is never stored or logged.
- Matching uses no language model. Its forbidden keys are score, weight, rank, opportunit; the key is `skillMatch`.
- Rapid AI uses the ISCO code from the code chain only. Suppressed O\*NET rows are left out and the screen says so.
- Code: `shared/matching/`, `server/matching/`, `public/js/screens/match.js` and `sdgTab.js`. Browser results:
  `docs/matching/acceptance.md`.

## Working here
- Folder `C:\Users\guiro\XH_Cat_Final` is on this branch. `main` is the worktree `C:\Users\guiro\XH_Cat_Final-main`;
  merge there. Chain git steps with `&&`.
- Bash heredocs break on apostrophes here. Write helper scripts with the Write tool and run them with python.

## Commands
```bash
npm install && npm test     # expect 766 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 48 OK
```
