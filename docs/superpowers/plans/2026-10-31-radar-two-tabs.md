# Radar two tabs (For You, Explore all trends) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Radar's "Skills & Careers" and "AI Impact" tabs with "For You" (question card, then AI tasks scatter and research signals for you) and "Explore all trends" (research momentum and papers per year, all six topics), open the right tab by career goal, and list only the OpenAlex source.

**Architecture:** All in `public/js/screens/radar.js` (new `radarTabOf`, `forYouTab`, `exploreTab`; `radarView` uses them) plus the tab action and AI-task loading in `public/js/app.js`. The research cards of `aiTab` are split into a builder both tabs reuse. `skillsTab` and `aiTab` stay exported (D47 keeps the code) but `radarView` no longer calls them.

**Tech Stack:** plain ES modules, Vitest, `public/styles.css`.

**Spec:** `docs/superpowers/specs/2026-10-31-radar-ai-usage-questions-design.md` §10 (D43–D48); earlier sections still apply.

## Global Constraints

- Tab ids `fy` and `ex`; For You first in the tab bar. Labels (EN): "For You" with the line "Your AI use and the research linked to your field"; "Explore all trends" with the line "AI research across all six topics". BM and 中文 lines marked `// translation: owner review`.
- Default tab: `ex` only when `profile.preferences.careerGoal` is `{ state: 'value', value: 'switch_career' }`; otherwise `fy`. A picked tab (`state.radar.tab` = `fy` | `ex`) wins; it is screen state only.
- For You: card only while `needsAsking(profile) || radar.aiAsk.open` (with a profile); else Change button, AI tasks card (`data-sec="AI"`), A5. No other section.
- Explore: A2 then A1, all six topics, no `data-act="viewAll"`, no "global view" note; topics linked to the field keep the `rdFromProfile` tag.
- Not on the page: `data-sec` SK, B1, B2, B5, B6, A-tab View all. Source cards and "View data sources": OpenAlex only. Admin screen unchanged (`statusCards` keeps both sources by default).
- Test first; `npm test` before each commit (re-run a timing test alone once before calling it a failure). Commits `feat:`/`fix:`/`docs:`, no attribution lines.

## Review Focus

1. **AI task data loads when For You opens by default** (no click on a tab): the scatter must not stay on "loading". → Task 1 test on `radarTabOf` and an app.js source check that loading follows `radarTabOf`.
2. **A career switcher who has not answered** lands on Explore; For You still shows the card when they open it. → Task 1 test.
3. **A stale saved tab id** (`sk` / `ai` from before) falls back to the goal rule. → Task 1 test.
4. **No profile:** For You shows the scatter card's own "confirm your profile" hint and A5's hint, no question card, no crash. → Task 1 test.
5. **The evidence panel still opens from Explore** (axis rows and radar points keep `data-act="axis"`). → Task 2 test.

---

### Task 1: Tabs, default tab and the question gate inside For You

**Files:** Modify `public/js/screens/radar.js` (`tabOf` ~59, `aiTab` ~248–332, `radarView` ~895–930), `public/js/app.js` (`ensureRadar` ~193, `radarTab` ~609), `shared/strings/{en,ms,zh}.js`. Test: `tests/radar/radarScreen.test.js`, `tests/radar/aiAskActions.test.js`.

**Interfaces — Produces:**
- `radarTabOf(state) → 'fy' | 'ex'` (exported; replaces `tabOf`).
- `forYouTab({ t, state, data }) → string`, `exploreTab({ t, state, data }) → string` (exported).
- `researchCards({ t, state, data, all }) → { a2, a1, a5 }` (internal): `all: true` uses every axis; `all: false` keeps today's `scope(…, 'ai')` behaviour (so `aiTab` is unchanged).
- Keys `rdTabFY`, `rdTabFYq`, `rdTabEX`, `rdTabEXq`.

- [ ] **Step 1: Failing tests** (`describe('two tabs (D43-D46)')`): tab bar has exactly two tabs, `data-arg="fy"` first then `ex`, EN labels; `radarTabOf` → `fy` for no profile, no goal, `grow_field`; `ex` for `switch_career`; a picked `fy`/`ex` wins; `sk`/`ai` fall back. Not asked + `fy`: panel holds the card and no `data-sec`; Explore opens straight away (A2, A1 present) even when not asked. Answered + `fy`: Change button, then `data-sec="AI"`, then `data-sec="A5"`, in that order, and no `SK|B1|B2|B5|B6|A2|A1`. `view(null)`: For You shows no card, A5 shows its hint. Update tests that asserted the old tab names, the whole-page gate (`no role="tablist"` while not asked → now the tab bar is present) and sections in `view()` output; leave tests that call `skillsTab`/`aiTab` directly. In `aiAskActions.test.js`: `ensureRadar` uses `radarTabOf(state)` for `loadAiTasks` (source check), and the `radarTab` action accepts only `fy`/`ex`.
- [ ] **Step 2: Run** `npx vitest run tests/radar/radarScreen.test.js tests/radar/aiAskActions.test.js` — new tests FAIL.
- [ ] **Step 3: Implement.** `radarView`: header, banners, source cards, sources list, tab bar, panel = `forYouTab` or `exploreTab`, drawer; remove the whole-page gate and the Change button under the title (it moves into For You). `app.js`: import `radarTabOf`; `ensureRadar` and `radarTab` load AI tasks when the shown tab is `fy`; `radarTab` stores `fy`/`ex`. Strings in three languages.
- [ ] **Step 4: Run** those files, then `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: Radar tabs For You and Explore all trends, opened by career goal (D43, D44, D46, D47)`.

### Task 2: Explore all trends shows all six topics, no View all

**Files:** `public/js/screens/radar.js` (`researchCards`, `exploreTab`). Test: `tests/radar/radarScreen.test.js`.

- [ ] **Step 1: Failing tests:** with `ownProfile()` (one linked topic) Explore's A2 has 6 `data-act="axis"` rows/points and the line chart labels all six; the linked topic carries `rdFromProfile`; no `data-act="viewAll"`; no `rdGlobalView` and no `rdTopicsOwn` text; `radar.open = { kind: 'axis', id: 'language' }` with tab `ex` renders the evidence drawer.
- [ ] **Step 2: Run** — FAIL. **Step 3:** `exploreTab` = `a2 + a1` from `researchCards({ all: true })`. **Step 4:** run, `npm test`. **Step 5: Commit** `feat: Explore all trends shows all six topics without View all (D45)`.

### Task 3: Only the OpenAlex source

**Files:** `public/js/screens/radar.js` (`statusCards` options, `sourcesList` call in `radarView`). Test: `tests/radar/radarScreen.test.js`.

**Interfaces — Produces:** `statusCards(states, t, { …, ids = ['openalex', 'dosm'] })` — new optional `ids`; the admin screen keeps the default.

- [ ] **Step 1: Failing tests:** `view(ownProfile())` has exactly 1 `<article class="rd-srccard`, OpenAlex, and the sources list rows name only OpenAlex; no DOSM or O\*NET card; `statusCards(...)` without `ids` still gives 2 cards (admin). Update the earlier "four sources sit as cards" test to one card.
- [ ] **Step 2: Run** — FAIL. **Step 3:** `radarView` calls `statusCards(..., { ids: ['openalex'] })`, drops `onetSourceCards`, passes only OpenAlex sources to `sourcesList`. **Step 4:** run, `npm test`. **Step 5: Commit** `feat: Radar lists only the OpenAlex source it shows (D48)`.

### Task 4: Browser check and records

- [ ] On http://127.0.0.2:3210 (test profile): For You opens with the card; Explore opens straight away; after Continue the scatter and research signals show and the scatter loads without a tab click; goal `switch_career` opens Explore; Explore shows six topics and its evidence panel opens; one source card. 1280 px, 375 px, dark mode; no Radar console errors.
- [ ] Write a section in `docs/radar/acceptance.md`; update `HANDOVER.md`, `CLAUDE.md` (tabs, test count), `docs/record/status.json` → `python docs/record/build_record.py`; `npm test`; commit `docs: Radar two tabs, browser check and records`.
