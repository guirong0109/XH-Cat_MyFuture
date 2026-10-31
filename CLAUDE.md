# CLAUDE.md — `main`

Read `HANDOVER.md` here first. Then switch to the feature branch you work on: its `HANDOVER.md` and `CLAUDE.md`
are detailed.

## Rules
- **One branch per feature.** Each branch keeps a detailed `HANDOVER.md` and `CLAUDE.md` about its feature. `main`
  keeps short versions with only the important points. On every merge to `main`, update main's two files. Don't
  overwrite them with a branch's detailed version.
- **Follow the owner's architecture diagram exactly.** Add nothing it does not state.
- **Use no scoring or matching method from the previous project.** Don't use `C:/Users/guiro/XH-Cat_Domain1` as a
  template; read its diagrams only.
- **Ask the owner before:** anything paid (state the price), merge, push, PR, and above all force-push.
- **Test first** (Vitest). Run `npm test` before every commit. Commit messages use the form `feat:`, `fix:` or
  `docs:`, with no attribution lines.
- **Record every step** in the build record (`docs/record/status.json` → `python docs/record/build_record.py`).
- **Show the source of every list and suggestion on screen** (owner: "highly important").
- **Test in the browser on an address nobody else uses** (e.g. `127.0.0.2:3200`); the owner clicks in the same
  Browser pane, and each address keeps its own saved progress.
- **New data needs a source:** record it in `data/SOURCES.md` (where from, date, licence), check it against a
  manifest hash, and keep the downloaded original when it is small.
- **Use plain words** with the owner.

## Working here
- `main` is checked out as a worktree at `C:\Users\guiro\XH_Cat_Final-main`. Merge to `main` there:
  `git checkout main` fails in `C:\Users\guiro\XH_Cat_Final`. Chain git steps with `&&`, so that a failed step stops
  the rest.
- Bash heredocs break on apostrophes here. Write helper scripts with the Write tool and run them with python.

## Commands
```bash
npm install && npm test     # expect 1088 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 49 OK
```

## Future Skills Radar (details: branch `claude/future-radar`)
- Pure engine in `shared/radar/`, server in `server/radar/`, screens `public/js/screens/radar.js` and `radarAdmin.js`.
- Output contract `radar-signal/v1` (`docs/radar/contract.md`): never add score, weight, rank or match fields.
- Field ↔ topic links and structural breaks are the owner's decisions; never approve them on the owner's behalf.
- Admin and judge keys live only in server env; never print, log or commit them.
- Both Radar charts are built in the browser from the confirmed profile (D28–D33): skills of the user's own jobs and
  AI use of their tasks. eMASCO reaches O\*NET only through the code chain (D29 replaced D27).

## Career matching (details: branch `claude/career-matching`)
- Code in `shared/matching/`, `server/matching/`, `public/js/screens/match.js` and `sdgTab.js`.
- Skill Match = Σ min(you, needed) ÷ Σ needed (O\*NET skills + knowledge, importance ≥ 3.0); the owner's example
  12.05 / 9.2 / 76% is a test. Trends and AI scenarios never change it. No language model.
- eMASCO → O\*NET only through `data/radar/occupation-bridge.json`; a broken chain shows "not available" with the
  missing step, never a guess.
- Only show SDG links as the owner decided (M16: team drafts labelled, rejected hidden); never approve on the
  owner's behalf. The profile sent to `/api/matching` is never stored or logged.

## Study pathway (details: branch `claude/study-pathway`)
- Code in `shared/pathway/`, `server/pathway/`, `public/js/screens/pathway.js`, `pathwayParts.js`, `pathwayApi.js`.
- Gap points are matching's own (`POST /api/pathway` calls `matching.role()`); no new maths, no language model.
- Team picks (`data/pathway/picks.json`): only name, link, date (+ institution and MQA ref, or body); never invent a
  link, name or MQA reference; copy the page's main heading (a leading programme code is dropped). Keep the manifest
  hash in step; a bad picks file stops start-up.
- eMASCO qualification first, O\*NET US level under it (P14). No "team draft" word on `#pathway` (P15). The NEC code
  is shown only where known (P16). Never approve picks on the owner's behalf.
- Forbidden keys: score, weight, rank, opportunit. The profile sent to `/api/pathway` is never stored or logged.
