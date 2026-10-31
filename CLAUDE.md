# CLAUDE.md — `claude/study-pathway` (detailed)

Read `HANDOVER.md` here first, then the spec `docs/superpowers/specs/2026-10-31-study-pathway-design.md`, the diagram
`docs/architecture-pathway.html` and the mockup `docs/mockup-pathway.html`. They are approved and bind the build: add
nothing they do not state. All 10 plan tasks are built; the final review fix wave is done. Do not touch main's
files; the owner decides on merge.

## Rules (from `main`, all still apply)
- **One branch per feature.** This branch keeps the detailed `HANDOVER.md` and `CLAUDE.md`. On merge to `main`, update
  main's two short files with only the important points; don't overwrite them with these.
- **Follow the owner's architecture diagram exactly.** Add nothing it does not state.
- **Use no scoring or matching method from the previous project.** Don't use `C:/Users/guiro/XH-Cat_Domain1` as a
  template.
- **Ask the owner before:** anything paid (state the price), merge, push, PR, and above all force-push.
- **Test first** (Vitest). Run `npm test` before every commit. Commit messages: `feat:`, `fix:` or `docs:`, with no
  attribution lines.
- **Record every step** in the build record (`docs/record/status.json` → `python docs/record/build_record.py`).
- **Show the source of every list, number and suggestion on screen** (owner: "highly important").
- **Test in the browser on an address nobody else uses** (e.g. `127.0.0.2:3200`, or a `localhost` name such as
  `pathway.localhost:3241` in the launcher); each address keeps its own saved progress.
- **New data needs a source:** `data/SOURCES.md` (where from, date, licence), a manifest hash, and the original kept
  when it is small.
- **Use plain words** with the owner.

## Pathway-specific rules
- Gap points are matching's own formula (Σ min(you, needed) ÷ Σ needed; levels basic 2, good 4, expert 6). No new
  maths. Progress ("Started" / "Done") is self-reported and never changes the Skill Match.
- Only name, link and date checked are stored for a pick (plus institution, MQA ref and professional body where they
  apply). No invented link: every site and pick was opened in a browser before it was added.
- Pick names are the linked page's main heading verbatim, minus a leading code (`<code> - `, ` : `, ` | `, ` – `).
- P14: the usual education level shows eMASCO's qualification first ("eMASCO, Malaysia"), then O\*NET's US
  percentages ("In the US"). It shows even when the code chain is broken.
- P15: no "team draft" word on `#pathway`. An unreviewed pick has no review label; an approved pick shows "approved by
  owner on <date>"; a rejected pick is hidden. `#admin` keeps "not yet reviewed".
- NEC hint (Ruling 15): a code is shown only outside ISCED 061x/071x/073x ("code match, not an official table"), plus
  the two pairs confirmed by name in MQR (0611 to 0614, 0712 to 0717; "NEC code checked in MQR"); otherwise "choose the
  NEC field for <field title>". Add a pair only when it was checked by name in MQR.
- A pick without an MQA reference says "MQA ref not recorded yet" (Ruling 16).
- Picks are reviewed in `#admin`; never approve or reject on the owner's behalf.
- The profile sent to `/api/pathway` is never stored or logged. Targets and progress live in the browser only.
- The pathway uses no language model. Its forbidden keys are score, weight, rank, opportunit; the Skill Match key is
  `skillMatch`.
- eMASCO → O\*NET only through the official chain (`data/radar/occupation-bridge.json`). A broken chain shows the
  missing step, never a guess.
- Code: `shared/pathway/`, `server/pathway/`, `public/js/screens/pathway.js` and `pathwayParts.js`, data in
  `data/pathway/`, tests in `tests/pathway/`. Browser results: `docs/pathway/acceptance.md`; unfilled fields:
  `docs/pathway/fill-report.md`.

## Working here
- Folder `C:\Users\guiro\XH_Cat_Final-pathway` is the worktree for this branch. `main` is the worktree
  `C:\Users\guiro\XH_Cat_Final-main`; merge there. Chain git steps with `&&`, so a failed step stops the rest.
- Bash heredocs break on apostrophes here. Write helper scripts with the Write tool and run them with python.

## Commands
```bash
npm install && npm test     # expect 936 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 49 OK
```
