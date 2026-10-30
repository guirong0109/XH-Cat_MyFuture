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
npm install && npm test     # expect 651 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 11 OK
```

## Future Skills Radar (details: branch `claude/future-radar`)
- Pure engine in `shared/radar/`, server in `server/radar/`, screens `public/js/screens/radar.js` and `radarAdmin.js`.
- Output contract `radar-signal/v1` (`docs/radar/contract.md`): never add score, weight, rank or match fields.
- Field ↔ topic links and structural breaks are the owner's decisions; never approve them on the owner's behalf.
- Admin and judge keys live only in server env; never print, log or commit them.
