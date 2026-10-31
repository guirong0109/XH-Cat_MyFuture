# CLAUDE.md — `claude/compare-futures` (detailed)

Sub-branch of `claude/career-matching` (from `d82267e`). Read `HANDOVER.md` here first, then the spec
`docs/superpowers/specs/2026-10-31-compare-futures-news-design.md`, the diagram `docs/architecture-compare-futures.html`
and the plans `docs/superpowers/plans/2026-10-31-compare-futures-news.md` and `…-amendment-1.md`. All are approved and
bind the build: add nothing they do not state. Both plans are built and checked with real runs. Do not touch main's
files; the owner decides on merge (into `claude/career-matching` first).

## Compare futures: AI news rules
- DeepSeek **Search** API (`POST https://api.deepseek.com/v1/tools/search`) plus, since Amendment 1 (N9), the chat
  model **`deepseek-flash`** for the relevance check only (keep / drop; it writes nothing shown on screen). **Paid**:
  search US$0.75 per 1,000 successful searches; check about US$2-4 a month; total about US$4-6 a month. Key in
  `DEEPSEEK_API_KEY` only (server secrets; local `.env` for testing); never in the repo, the browser, a URL, a log or a
  reply. No real run without the owner's OK.
- 10 ISCED-F broad fields (`data/news/fields.json`, manifest hash), one search and at most one check per field every 3
  hours. Caps for each: 10 per run, 80 per 24 hours, counted in memory and in the store before each request.
- Usable = English (lang:en, said on screen), title, http(s) link, publish date within 30 days; repeats removed (also
  a headline ending in a site name); kept only if the check lists it; newest 25 per field. A failed check adds nothing.
- For you is picked in the browser from `education.records[].field.code`; no profile data reaches the server or DeepSeek.
- News never changes the Skill Match, the Overall match, the bands, the Radar or the SDG parts.
- Code: `shared/news/rules.js`, `server/news/`, `public/js/screens/futures.js`, `public/js/newsApi.js`. Tests:
  `tests/news/`. Browser results: `docs/news/acceptance.md`. Local check with a fake search and check:
  `scripts/news-local.mjs`.

## Base branch: `claude/career-matching`
Its spec `docs/superpowers/specs/2026-10-30-career-matching-design.md` and diagram `docs/architecture-matching.html`
still bind matching. Its final whole-branch review is still open on that branch.

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
- **M17 Overall match (31 Oct):** `Overall = Skill Match x (1 - AI touch) + AI know-how x AI touch`, in `shared/matching/overall.js`. AI touch = Anthropic observed task share (Moderate) / ILO exposure score (Rapid). AI know-how = Yes answers divided by answered, from four yes/no profile questions (`aiUse`) based on the UNESCO AI competency framework for students (2024, https://doi.org/10.54675/JKJB9835, CC BY-SA 3.0 IGO). It never changes the Skill Match or the bands; with no AI data Overall = Skill Match. Cards show Skill Match, AI touch and Overall; inside each band, roles sort by Overall, else Skill Match, then title; band membership never changes.
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
npm install && npm test     # expect 1510 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 49 OK
```

Main's Study Pathway and Radar chart work came in on 31 Oct 2026 (merge of `origin/main`).
Main's new CV screen design and the organisation view came in on 31 Oct 2026 (merge of `main`, df45b57).
