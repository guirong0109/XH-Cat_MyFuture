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
npm install && npm test     # expect 1752 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 49 OK
```

## CV and profile screens (details: branch `claude/cv-profile-module`)
- Look: cream page, Instrument Serif / Geist / Geist Mono, thin rules; one rule per class in `public/styles.css`
  (`tests/appLook.test.js`). Main's other screens' rules sit at the end of that file. Don't alter the landing page's
  ATM intro until the owner says what changes.
- Start: landing → Get started → "Who is it for?" (in `access.js`) → personal: guest or account → goal → CV or form;
  organisation: account only → C/D → organisation view.
- Profile sections: Education, Employment background, Skills and proficiency, Using AI, Interests (found by name in
  `SECTIONS`, never by number). No certificates or training (`dropNotAsked`).
- Skills are grouped under the job or project they were used in (`skills[].usedIn`, `skillGroups.js`); a skill used in
  a job or project starts at Good, `proficiencyStatus: 'from_projects'` (owner rule; matching reads this level).
- After a CV: only "Edit in the form"; qualification level and field of study are prechosen for the user to check.
- **DeepSeek reads every CV (31 Oct)** next to the rules reader (`server/cv/aiRead.js`, `mergeDrafts.js`); rules win, the
  AI fills blanks and adds missed items, tagged "Found by AI — check it". `CV_LLM_KEY` turns it on (paid; ask before
  paid runs). Thinking off, 40 s AI / 45 s upload limits. CV text and AI replies are never logged; tests pass
  `aiProvider: null`. The old consent "AI re-read", compare view, Claude backup and R2 CV copy are gone.

## Future Skills Radar (details: branch `claude/future-radar`)
- Pure engine in `shared/radar/`, server in `server/radar/`, screens `public/js/screens/radar.js` and `radarAdmin.js`.
- Output contract `radar-signal/v1` (`docs/radar/contract.md`): never add score, weight, rank or match fields.
- Field ↔ topic links and structural breaks are the owner's decisions; never approve them on the owner's behalf.
- Admin and judge keys live only in server env; never print, log or commit them.
- Both Radar charts are built in the browser from the confirmed profile (D28–D33): skills of the user's own jobs and
  AI use of their tasks. eMASCO reaches O\*NET only through the code chain (D29 replaced D27).
- The Radar page has no "Your profile" card (owner, 31 Oct 2026). Do not bring it back.
- Two tabs (D43-D48, 31 Oct 2026): **For You** (the "Which of these do you use AI for?" question first, then the AI
  tasks scatter and research signals for you) and **Explore all trends** (research momentum and papers per year, all
  six topics). Explore opens first only for the goal "Switch career". Only the OpenAlex source card is on the page.
- The AI usage answer is `profile.aiTasks` (`shared/aiTasks.js`): only recorded, in no Radar request; save it without
  `update()` so a confirmed profile stays confirmed. The AI tasks chart is a scatter (`taskScatter.js`), no safe/risky words.

## Career matching (details: branch `claude/career-matching`)
- Code in `shared/matching/`, `server/matching/`, `public/js/screens/match.js` and `sdgTab.js`.
- Skill Match = Σ min(you, needed) ÷ Σ needed (O\*NET skills + knowledge, importance ≥ 3.0); the owner's example
  12.05 / 9.2 / 76% is a test. Trends and AI scenarios never change it. No language model.
- eMASCO → O\*NET only through `data/radar/occupation-bridge.json`; a broken chain shows "not available" with the
  missing step, never a guess.
- Only show SDG links as the owner decided (M16: team drafts labelled, rejected hidden); never approve on the
  owner's behalf. The profile sent to `/api/matching` is never stored or logged.
- Overall match (M17): Overall = Skill Match × (1 − AI touch) + AI know-how × AI touch (`shared/matching/overall.js`);
  it never changes the Skill Match or the bands. The 4 AI questions follow the UNESCO framework (source on screen).

## Study pathway (details: branch `claude/study-pathway`)
- Code in `shared/pathway/`, `server/pathway/`, `public/js/screens/pathway.js`, `pathwayParts.js`, `pathwayApi.js`.
- Gap points are matching's own (`POST /api/pathway` calls `matching.role()`); no new maths, no language model.
- Team picks (`data/pathway/picks.json`): only name, link, date (+ institution and MQA ref, or body); never invent a
  link, name or MQA reference; copy the page's main heading (a leading programme code is dropped). Keep the manifest
  hash in step; a bad picks file stops start-up.
- eMASCO qualification first, O\*NET US level under it (P14). No "team draft" word on `#pathway` (P15). The NEC code
  is shown only where known (P16). Never approve picks on the owner's behalf.
- Forbidden keys: score, weight, rank, opportunit. The profile sent to `/api/pathway` is never stored or logged.

## Organisation view (details: branch `hr-branch`)
- Code in `shared/org/team.js`, `server/org/` (store, service, routes, shareRoutes, roster), `public/js/orgApi.js`,
  `orgActions.js`, `screens/org.js`, `orgParts.js`, `orgShare.js`; data `data/org/` (synthetic rosters, manifest).
- Every number comes from `matching.role()` per person; `team.js` only counts and sums. Scenarios change only band
  counts. No hours, no language model, forbidden keys as above.
- HR sees only shared skills (O\*NET key + level), group, role and name. Join tokens: hash only, single use, 7 days.
  Never log names, skills or tokens; never store team results. Rosters: made-up people only.

## Compare futures: AI news (details: branch `claude/compare-futures`)
- Code in `shared/news/rules.js`, `server/news/` (deepseek, relevance, service, store, routes), `public/js/screens/futures.js`,
  `public/js/newsApi.js`; data `data/news/fields.json` (10 ISCED-F broad fields, manifest hash). Screen `#futures`:
  For you (profile study fields, picked in the browser) and Explore all.
- **The news refreshes every 3 hours (owner). Keep it that way on every host.** The timer runs in the server
  (`news.start()` in `server/index.js`); after a host sleeps, the first visit past the due time refreshes.
- DeepSeek Search finds the news; DeepSeek `deepseek-flash` only keeps or drops each new result (news about AI in the
  field) and writes nothing shown. **Paid**, about US$4-6 a month; caps 10 searches and 10 checks per run, 80 of each
  per 24 hours, counted in memory and in the store. `DEEPSEEK_API_KEY` turns it on (server secrets / local `.env`).
  The CV reader uses the same DeepSeek account under `CV_LLM_KEY`; set both names to use both features.
- Usable: English only (said on screen), title, http(s) link, date within 30 days, repeats removed, kept by the check,
  newest 25 per field. No profile data reaches the server or DeepSeek. News never changes matching, Radar or SDG.

## Accounts on this computer (details: branch `claude/local-accounts`)
- Owner (1 Nov 2026): host on this computer, no Cloudflare R2 / D1. `ACCOUNTS_DB=local` keeps accounts, sessions,
  saved profiles and organisations in a SQLite file (`server/store/localDb.js`, Node's built-in `node:sqlite`, same
  `query` / `migrate` interface as D1); default `data/cache/accounts/accounts.db` (git-ignored), `ACCOUNTS_DB_FILE`
  moves it. Tables are created on first use (`IF NOT EXISTS`, never touches data). D1 settings, if ever set, win.
- The file holds real accounts (emails, salted password hashes, profiles): never commit, log or send it; the owner
  backs it up by copying it. Claude never creates real accounts on the live site; test with a throw-away file.

## Live site: https://futures.grong.my (since 31 Oct 2026)
- **main is served live** from the owner's computer through the Cloudflare Tunnel `compare-futures` (config
  `C:\Users\guiro\.cloudflared\compare-futures.yml` → `http://localhost:3300`), no router port forwarding.
- Start: launch entry `main-live` (this folder's `server/index.js`, port 3300, `TRUST_PROXY=1`, main's `.env` then
  `C:\Users\guiro\XH_Cat_Final\.env` for `DEEPSEEK_API_KEY`), then in its own terminal tab
  `cloudflared tunnel --config C:\Users\guiro\.cloudflared\compare-futures.yml run compare-futures`. Stop: Ctrl-C in
  that tab. The site is up only while both run and the computer is awake; the news refreshes every 3 hours meanwhile.
- Run only one news server with the key at a time (not also the branch's `futures-real`), or refreshes are paid twice.
- CV AI reading is off on the live site until `CV_LLM_KEY` is set (same DeepSeek key, paid; ask first).
- Full procedure and history: branch `claude/compare-futures` `CLAUDE.md`.
