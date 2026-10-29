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
- **Use plain words** with the owner.

## Commands
```bash
npm install && npm test     # expect 229 passed
npm start                   # http://localhost:3200
```
