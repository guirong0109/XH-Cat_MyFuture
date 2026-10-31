# Overall Match (M17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four UNESCO-based AI questions to the profile and show an Overall match (Skill Match blended with AI know-how by how much AI touches the job) on every role card, with the purple AI bar moved to the right column.

**Architecture:** One new pure module `shared/matching/overall.js` does all the maths. The server (`server/matching/service.js`) reads `profile.aiUse`, adds `touchPct` to the closed card's AI numbers, `aiKnowHow` once per answer and `overallMatch` per scenario per role. The browser adds a sixth profile section and redraws the card's right column; the profile stays in the browser and is never stored or logged on the server.

**Tech Stack:** Node ≥ 22 ESM, Express 5, Vitest, browser ES modules (no build step), strings in `shared/strings/{en,ms,zh}.js`.

**Spec:** `docs/superpowers/specs/2026-10-30-career-matching-design.md`, section 5a and decision M17 (also sections 1, 6, 8, 10, 11). Approved mockup: `docs/mockup-overall-match.html`.

## Global Constraints

- Overall = S × (1 − T) + K × T, rounded to a whole number. S = Skill Match percent, K = AI know-how percent, T = AI touch 0–1.
- K = Yes answers ÷ answered questions × 100 (whole number); no question answered → K missing.
- T: Moderate = `observedShare` ÷ 100 (Anthropic Economic Index, best O\*NET job); Rapid = ILO WP140 `mean_score_2025` (0–1). Both kept as `touchPct` (0–100, one decimal) and the maths uses `touchPct / 100`, so the sum on the card reproduces the result.
- S missing → no Overall. K missing → no Overall, button "Answer 4 AI questions to see your overall match". T missing → Overall = S with `noAiData: true`. S provisional → Overall provisional.
- The Skill Match never changes. Bands never change. Inside a band: Overall high to low where it exists, else Skill Match, then title.
- `aiUse: {mindset, ethics, apply, design}`, each `'yes'`, `'no'` or `null`; default `null` shown as "Prefer not to say". Old profiles without `aiUse` read as all `null`.
- Forbidden keys anywhere in matching output: score, weight, rank, opportunit. New keys: `aiUse`, `aiKnowHow`, `touchPct`, `overallMatch`.
- The profile sent to `/api/matching` is never stored or logged. Matching uses no language model.
- Every list and number shows its source on screen. Questions: "based on" UNESCO *AI competency framework for students* (2024), https://doi.org/10.54675/JKJB9835, CC BY-SA 3.0 IGO.
- EN / BM / 中文 strings; BM and 中文 entries marked `// translation: owner review`. Works at 360 px.
- Test first (Vitest). `npm test` before every commit. Commit messages `feat:` / `fix:` / `docs:`, no attribution lines. Each task adds a build record entry (`docs/record/status.json` → `python docs/record/build_record.py`).
- Ask the owner before any merge, push or PR.

## Review Focus

1. **A profile saved before M17** (no `aiUse` key) is sent to `/api/matching` → 200, `aiKnowHow: null`, every `overallMatch` null, cards show the "Answer AI questions" button; nothing crashes. Test in Task 3.
2. **A tampered `aiUse`** (string, array, unknown values like `"maybe"`) → `aiUse` not a plain object is 400; unknown values count as unanswered. Tests in Tasks 1 and 3.
3. **T = 0 or T = 1** (Rapid score 0 or a job whose every task is observed) → Overall = S exactly, or = K exactly; never NaN, never outside 0–100. Test in Task 1.
4. **Switching scenario** changes the Overall and its sum line but never the Skill Match number on the same card. Test in Task 4.
5. **Sorting with mixed roles** in one band (some with Overall, some with Skill Match only, some with neither) → Overall/Skill value high to low, roles with neither last, then title. Test in Task 4.

---

### Task 0: Bring `main` into this branch

`main` has the Study Pathway and Radar chart work (it changed `public/js/app.js`, `server/matching/routes.js`, `public/js/screens/match.js` and the strings). M17 builds on the current files.

**Files:** whatever the merge touches.

- [ ] **Step 1: Ask the owner** "OK to merge `main` into `claude/career-matching` before building M17?" and wait for a yes.
- [ ] **Step 2: Merge**

Run: `git fetch origin && git merge --no-ff origin/main`
Expected: merge commit, or conflicts. In conflicts keep both sides' features. The branch keeps its own detailed `HANDOVER.md` and `CLAUDE.md`: on those two files take the branch side (`git checkout --ours HANDOVER.md CLAUDE.md`) and add one line each saying main's Study Pathway and Radar chart work came in on 31 Oct.

- [ ] **Step 3: Run all tests**

Run: `npm test` then `python -m unittest discover pipeline/tests`
Expected: all pass (about 829 + this branch's own; write the real number into `CLAUDE.md`'s Commands block); 48 OK.

- [ ] **Step 4: Commit** (if the merge stopped for conflicts) with `git commit` using the default merge message, then a build record entry "Brought main into the branch (Study Pathway, Radar charts)".

---

### Task 1: Pure maths `shared/matching/overall.js`

**Files:**
- Create: `shared/matching/overall.js`
- Test: `tests/matching/overall.test.js`

**Interfaces:**
- Produces:
  - `export const AI_USE_KEYS = ['mindset', 'ethics', 'apply', 'design']`
  - `readAiUse(profile) -> {mindset, ethics, apply, design}`: each `'yes' | 'no' | null`; anything else (missing `aiUse`, non-object, other values) → `null`.
  - `aiKnowHow(aiUse) -> {percent: number, yes: number, answered: number} | null`
  - `overallMatch(skillMatch, knowHow, touchPct) -> {percent, provisional, noAiData, skill, knowHow, touch} | null` where `skillMatch` is `{percent, provisional}` or null, `knowHow` is `aiKnowHow`'s result or null, `touchPct` is a number 0–100 or null. `touch` in the result is `touchPct / 100` (or null when `noAiData`).
  - `sortValue(role, scenario) -> number`: `role.overallMatch?.[scenario]?.percent`, else `role.skillMatch?.percent`, else `-1`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest'
import { AI_USE_KEYS, aiKnowHow, overallMatch, readAiUse, sortValue } from '../../shared/matching/overall.js'

describe('readAiUse', () => {
  it('reads an old profile as all null', () => expect(readAiUse({})).toEqual({ mindset: null, ethics: null, apply: null, design: null }))
  it('keeps yes/no and drops anything else', () =>
    expect(readAiUse({ aiUse: { mindset: 'yes', ethics: 'maybe', apply: 'no', design: 7 } })).toEqual({ mindset: 'yes', ethics: null, apply: 'no', design: null }))
  it('treats a non-object aiUse as unanswered', () => expect(readAiUse({ aiUse: 'yes' })).toEqual({ mindset: null, ethics: null, apply: null, design: null }))
  it('has the four UNESCO dimensions in order', () => expect(AI_USE_KEYS).toEqual(['mindset', 'ethics', 'apply', 'design']))
})

describe('aiKnowHow', () => {
  it('is missing when nothing is answered', () => expect(aiKnowHow(readAiUse({}))).toBeNull())
  it('3 Yes of 4 is 75%', () => expect(aiKnowHow({ mindset: 'yes', ethics: 'yes', apply: 'yes', design: 'no' })).toEqual({ percent: 75, yes: 3, answered: 4 }))
  it('counts only answered questions: 1 Yes of 2 is 50%', () => expect(aiKnowHow({ mindset: 'yes', ethics: null, apply: 'no', design: null })).toEqual({ percent: 50, yes: 1, answered: 2 }))
})

describe('overallMatch', () => {
  const k75 = { percent: 75, yes: 3, answered: 4 }
  it('mockup example: S 64, K 75, T 71% -> 72', () => expect(overallMatch({ percent: 64, provisional: false }, k75, 71).percent).toBe(72))
  it('no AI data -> Overall = Skill Match, flagged', () => expect(overallMatch({ percent: 41, provisional: false }, k75, null)).toMatchObject({ percent: 41, noAiData: true, touch: null }))
  it('T = 0 -> S, T = 100 -> K', () => {
    expect(overallMatch({ percent: 30, provisional: false }, k75, 0).percent).toBe(30)
    expect(overallMatch({ percent: 30, provisional: false }, k75, 100).percent).toBe(75)
  })
  it('no Skill Match or no know-how -> none', () => {
    expect(overallMatch(null, k75, 50)).toBeNull()
    expect(overallMatch({ percent: 50, provisional: false }, null, 50)).toBeNull()
  })
  it('carries provisional', () => expect(overallMatch({ percent: 50, provisional: true }, k75, 50).provisional).toBe(true))
  it('has no forbidden keys', () => expect(JSON.stringify(overallMatch({ percent: 50, provisional: false }, k75, 50))).not.toMatch(/"[^"]*(score|weight|rank|opportunit)[^"]*":/i))
})

describe('sortValue', () => {
  it('prefers Overall, then Skill Match, then -1', () => {
    expect(sortValue({ overallMatch: { rapid: { percent: 60 } }, skillMatch: { percent: 20 } }, 'rapid')).toBe(60)
    expect(sortValue({ overallMatch: { rapid: null }, skillMatch: { percent: 20 } }, 'rapid')).toBe(20)
    expect(sortValue({}, 'rapid')).toBe(-1)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/matching/overall.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** the five exports in `shared/matching/overall.js` (pure, no I/O; header comment naming spec section 5a and saying no number here ranks anything). Overall = `Math.round(S * (1 - T) + K * T)` with `T = touchPct / 100`, clamped to 0–100.
- [ ] **Step 4: Run** the test file → PASS; then `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: Overall match maths from Skill Match, AI know-how and AI touch (M17)` with a build record entry.

---

### Task 2: Profile — the "Using AI" section

**Files:**
- Modify: `shared/profileSchema.js` (`emptyProfile`, `validateProfile`)
- Modify: `public/js/screens/form.js` (`SECTIONS`, `SECTION_FIELDS`, `BODIES`, new `aiUseSection`)
- Modify: `public/js/app.js` (change handler for `data-aiuse`; update the header comment list of form controls)
- Modify: `shared/strings/en.js`, `ms.js`, `zh.js`
- Modify: `data/SOURCES.md` (UNESCO row)
- Test: `tests/profileSchema.test.js`, `tests/formPickers.test.js` (or a new `tests/aiUseForm.test.js`)

**Interfaces:**
- Consumes: `AI_USE_KEYS`, `readAiUse`, `aiKnowHow` from Task 1.
- Produces: `profile.aiUse` saved in the guest store; `SECTIONS[5] === 'secAi'`.

- [ ] **Step 1: Check the source.** Open https://doi.org/10.54675/JKJB9835 (full text) and confirm the four competency dimensions are named Human-centred mindset, Ethics of AI, AI techniques and applications, AI system design. If any name differs, use UNESCO's wording in the strings and tell the owner. Add a `data/SOURCES.md` row: "AI know-how questions (`shared/strings/*`, keys `aiQ_*`): four yes/no questions, one per dimension of the UNESCO AI competency framework for students (2024); wording by the FutureReady team, labelled 'based on'", source URL the DOI, date checked, licence CC BY-SA 3.0 IGO. No data file, so no hash.

- [ ] **Step 2: Write the failing tests**

```js
// tests/profileSchema.test.js
it('a new profile has aiUse all null', () => expect(emptyProfile().aiUse).toEqual({ mindset: null, ethics: null, apply: null, design: null }))
it('accepts a profile without aiUse (saved before M17)', () => { const p = emptyProfile(); delete p.aiUse; expect(validateProfile(p).ok).toBe(true) })
it('rejects a bad aiUse value', () => {
  const p = { ...emptyProfile(), aiUse: { mindset: 'maybe', ethics: null, apply: null, design: null } }
  expect(validateProfile(p).errors).toContainEqual({ path: 'aiUse.mindset', code: 'bad_enum' })
})

// form test
import form, { SECTIONS } from '../public/js/screens/form.js'
it('has a sixth section Using AI with four drop-downs, Prefer not to say by default, and the UNESCO source', () => {
  expect(SECTIONS[5]).toBe('secAi')
  const html = form({ t: (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k), state: { section: 5, profile: emptyProfile() } })
  expect(html.match(/data-aiuse="(mindset|ethics|apply|design)"/g)).toHaveLength(4)
  expect(html).toContain('10.54675/JKJB9835')
  expect(html.match(/<option value="" selected>/g)).toHaveLength(4)
})
it('shows the know-how line from the answers', () => {
  const profile = { ...emptyProfile(), aiUse: { mindset: 'yes', ethics: 'yes', apply: 'yes', design: 'no' } }
  expect(form({ t: (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k), state: { section: 5, profile } })).toContain('aiKnowHowLine:{"percent":75,"yes":3,"answered":4}')
})
```

- [ ] **Step 3: Run** them → FAIL.
- [ ] **Step 4: Implement**
  - `emptyProfile` adds `aiUse: { mindset: null, ethics: null, apply: null, design: null }`.
  - `validateProfile`: when `aiUse` is present it must be a plain object (`{path: 'aiUse', code: 'bad_type'}`), and each of the four keys `null`, `'yes'` or `'no'` (`{path: 'aiUse.<key>', code: 'bad_enum'}`). Missing `aiUse` is fine.
  - `form.js`: `SECTIONS` gains `'secAi'`, `SECTION_FIELDS` gains `[]`, `BODIES` gains `aiUseSection`. It renders the intro (`aiUseIntro`), one row per key with the dimension (`aiDim_<key>`), the question (`aiQ_<key>`) and `<select data-aiuse="<key>">` with options `''` → `preferNot`, `yes` → `aiYes`, `no` → `aiNo`; then `aiKnowHowLine` with `aiKnowHow(readAiUse(profile))` (or `aiKnowHowNone`), then the source line `aiUseSource` with a link to `https://doi.org/10.54675/JKJB9835`. Update the file's header comment ("six sections").
  - `app.js`: on change of `[data-aiuse]`, set `state.profile.aiUse = { ...readAiUse(state.profile), [key]: value || null }` through the same save path the `data-level` handler uses.
  - Strings (en, then ms and zh marked `// translation: owner review`): `secAi` "Using AI"; `aiUseIntro` "Four short questions about how you use AI. They add your AI know-how to the Overall match."; `aiDim_mindset` "Human-centred mindset"; `aiDim_ethics` "Ethics of AI"; `aiDim_apply` "AI techniques and applications"; `aiDim_design` "AI system design"; the four `aiQ_*` questions copied from spec 5a; `aiYes` "Yes"; `aiNo` "No"; `aiKnowHowLine` "Your AI know-how: {percent}% ({yes} Yes of {answered} answered)"; `aiKnowHowNone` "Your AI know-how: no question answered yet"; `aiUseSource` "Questions based on the four parts of the UNESCO AI competency framework for students (2024) · your answers stay in this browser".
- [ ] **Step 5: Run** the tests → PASS; `npm test` → all pass (the i18n test checks every key exists in all three languages).
- [ ] **Step 6: Commit** `feat: profile asks four UNESCO-based AI questions (M17)` with a build record entry.

---

### Task 3: Server — `aiKnowHow`, `touchPct` and `overallMatch`

**Files:**
- Modify: `server/matching/service.js` (`readProfile`, `aiNumbers`, `list`)
- Modify: `server/matching/routes.js` (`validProfile`)
- Test: `tests/matching/routes.test.js`

**Interfaces:**
- Consumes: `readAiUse`, `aiKnowHow`, `overallMatch` from Task 1.
- Produces (per spec section 8), in the `POST /api/matching` answer:
  - top level `aiKnowHow`: `{percent, yes, answered}` or `null`;
  - each role's `ai.moderate.touchPct` (= `observedShare`, one decimal, or `null`) and `ai.rapid.touchPct` (= `mean × 100`, one decimal, or `null`);
  - each role's `overallMatch: {moderate, rapid}`, each `overallMatch(skillMatch, aiKnowHow, touchPct)`'s result or `null`.

- [ ] **Step 1: Write the failing tests** (real app on a random port, as the existing tests in `routes.test.js` do; reuse their profile helper with a usable skill):

```js
it('a profile saved before M17 gets no know-how and no Overall', async () => {
  const body = await postList(profileWithSkills())            // no aiUse key
  expect(body.aiKnowHow).toBeNull()
  expect(body.roles.every((r) => r.overallMatch.moderate === null && r.overallMatch.rapid === null)).toBe(true)
})
it('answers give know-how and an Overall that follows the formula', async () => {
  const body = await postList({ ...profileWithSkills(), aiUse: { mindset: 'yes', ethics: 'yes', apply: 'yes', design: 'no' } })
  expect(body.aiKnowHow).toEqual({ percent: 75, yes: 3, answered: 4 })
  const r = body.roles.find((x) => x.skillMatch && x.ai.rapid.touchPct !== null)
  const t = r.ai.rapid.touchPct / 100
  expect(r.overallMatch.rapid.percent).toBe(Math.round(r.skillMatch.percent * (1 - t) + 75 * t))
  expect(r.skillMatch.percent).toBe((await postList(profileWithSkills())).roles.find((x) => x.code === r.code).skillMatch.percent)
})
it('no AI data for the scenario -> Overall equals Skill Match', async () => {
  const body = await postList({ ...profileWithSkills(), aiUse: { mindset: 'yes', ethics: null, apply: null, design: null } })
  const r = body.roles.find((x) => x.skillMatch && x.ai.moderate.touchPct === null)
  expect(r.overallMatch.moderate).toMatchObject({ percent: r.skillMatch.percent, noAiData: true })
})
it('a non-object aiUse is a bad request', async () => expect((await postRaw({ profile: { aiUse: 'yes' } })).status).toBe(400))
it('never logs the AI answers and has no forbidden keys', async () => {
  // same log capture as the existing "profile never logged" test in this file
  const body = await postList({ ...profileWithSkills(), aiUse: { mindset: 'yes', ethics: 'no', apply: 'yes', design: 'no' } })
  expect(capturedLogs().join('\n')).not.toMatch(/mindset|aiUse/)
  expect(JSON.stringify(body)).not.toMatch(/"[^"]*(score|weight|rank|opportunit)[^"]*":/i)
})
```

`postList`, `postRaw`, `profileWithSkills` and `capturedLogs` stand for the helpers `routes.test.js` already has for posting to the real app, building a profile with a usable skill and capturing the log; use those, or add them in the same style.

- [ ] **Step 2: Run** `npx vitest run tests/matching/routes.test.js` → the new tests FAIL.
- [ ] **Step 3: Implement**
  - `readProfile` also returns `knowHow: aiKnowHow(readAiUse(profile))`.
  - `aiNumbers` adds `touchPct` to both scenarios: Moderate `moderate.available ? moderate.values.observedShare ?? null : null`; Rapid `round1(rapid.values.mean * 100)` when `mean` is a number, else `null`. Update its comment.
  - `list` adds `aiKnowHow: mine.knowHow` to the answer and per role `overallMatch: { moderate: overallMatch(sm, mine.knowHow, ai.moderate.touchPct), rapid: overallMatch(sm, mine.knowHow, ai.rapid.touchPct) }` where `sm = skillMatchOf(core.best, mine)` and `ai = aiNumbers(core.ai)` (compute each once).
  - `validProfile` in `routes.js`: `profile.aiUse` must be `undefined` or a plain object.
- [ ] **Step 4: Run** the tests → PASS; `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: matching answers carry AI know-how, AI touch and Overall match per scenario (M17)` with a build record entry.

---

### Task 4: Card and list

**Files:**
- Modify: `public/js/screens/match.js` (`sidePanel`, `aiCard` → right column, `roleCard`, `pctOf`/`bandList` sort, new ask button)
- Modify: `public/js/app.js` (handler for `data-act="mAskAi"`: go to the form, `state.section = 5`)
- Modify: `public/styles.css`
- Modify: `shared/strings/en.js`, `ms.js`, `zh.js`
- Test: `tests/matching/matchScreen.test.js`

**Interfaces:**
- Consumes: the role fields from Task 3 (`skillMatch`, `ai.<scenario>.touchPct`, `overallMatch.<scenario>`), `sortValue` from Task 1.
- Produces: `roleCard({..., scenario})` HTML with the right column in this order: Skill Match block (unchanged), `.mt-aitouch` block, `.mt-overall` block.

- [ ] **Step 1: Write the failing tests** (use the file's existing `t` stub and role fixtures):

```js
const k = { percent: 75, yes: 3, answered: 4 }
const role = (over) => ({ code: '2512-01', title: 'Software Developer', skillMatch: { percent: 64, met: 9, needed: 14, provisional: false, onetCode: '15-1252.00', onetTitle: 'Software Developers' },
  ai: { moderate: { available: true, automationPct: 54.7, touchPct: 71 }, rapid: { available: true, exposurePct: 58, gradient: 'G3', touchPct: 58 } },
  overallMatch: { moderate: { percent: 72, provisional: false, noAiData: false, skill: 64, knowHow: k, touch: 0.71 }, rapid: { percent: 70, provisional: false, noAiData: false, skill: 64, knowHow: k, touch: 0.58 } },
  bands: { moderate: 2, rapid: 2 }, sdgGoals: [], ...over })

it('moves the AI bar to the right column, under the Skill Match, then the Overall', () => {
  const html = roleCard({ t, role: role(), scenario: 'moderate' })
  const side = html.slice(html.indexOf('class="mt-side"'))
  expect(html.slice(0, html.indexOf('class="mt-side"'))).not.toContain('mt-aicard')
  expect(side.indexOf('mtSkillMatch')).toBeLessThan(side.indexOf('mt-aitouch'))
  expect(side.indexOf('mt-aitouch')).toBeLessThan(side.indexOf('mt-overall'))
})
it('writes the sum out with two decimals', () =>
  expect(roleCard({ t, role: role(), scenario: 'moderate' })).toContain('mtOverallSum:{"skill":64,"rest":"0.29","know":75,"touch":"0.71","percent":72}'))
it('switching scenario changes Overall but not Skill Match', () => {
  const m = roleCard({ t, role: role(), scenario: 'moderate' }); const r = roleCard({ t, role: role(), scenario: 'rapid' })
  expect(m).toContain('64%'); expect(r).toContain('64%')
  expect(m).toContain('>72%<'); expect(r).toContain('>70%<')
})
it('no AI data -> Overall equals Skill Match with the note', () => {
  const html = roleCard({ t, role: role({ overallMatch: { moderate: { percent: 64, provisional: false, noAiData: true, skill: 64, knowHow: k, touch: null }, rapid: null } }), scenario: 'moderate' })
  expect(html).toContain('mtOverallNoAi')
})
it('no answers -> the ask button, no Overall number', () => {
  const html = roleCard({ t, role: role({ overallMatch: { moderate: null, rapid: null } }), scenario: 'moderate', knowHow: null })
  expect(html).toContain('data-act="mAskAi"'); expect(html).not.toContain('mtOverallSum')
})
it('sorts a band by Overall, then Skill Match, roles with neither last', () => {
  // matchView with the state shape the existing matchView tests use (state.match.data = { roles, aiKnowHow, ... })
  const a = role({ code: '1000-01', title: 'A', skillMatch: { ...role().skillMatch, percent: 20 }, overallMatch: { moderate: { ...role().overallMatch.moderate, percent: 50 }, rapid: null } })
  const b = role({ code: '1000-02', title: 'B', overallMatch: { moderate: null, rapid: null }, skillMatch: { ...role().skillMatch, percent: 60 } })
  const c = role({ code: '1000-03', title: 'C', skillMatch: null, overallMatch: { moderate: null, rapid: null } })
  const html = matchView({ t, state: stateWith([c, a, b]) })
  expect(html.indexOf('data-code="1000-02"')).toBeLessThan(html.indexOf('data-code="1000-01"'))
  expect(html.indexOf('data-code="1000-01"')).toBeLessThan(html.indexOf('data-code="1000-03"'))
})
it('has no forbidden words', () => expect(roleCard({ t, role: role(), scenario: 'rapid' })).not.toMatch(FORBIDDEN))
```

`stateWith(roles)` is a small helper in the test file that builds the match state the existing `matchView` tests already build, with these roles in "Explore all roles" and `aiKnowHow: k`.

- [ ] **Step 2: Run** `npx vitest run tests/matching/matchScreen.test.js` → the new tests FAIL.
- [ ] **Step 3: Implement**
  - `roleCard` takes `knowHow` (the list answer's `aiKnowHow`) and passes `scenario` and `knowHow` to `sidePanel`; the left column no longer renders `aiCard`.
  - `sidePanel(t, role, scenario, knowHow)`: Skill Match block unchanged; then `.mt-aitouch`: label `mtAiTouch` with the `estimate` tag, `touchPct` as a whole percent, the purple bar (reuse `aiCard`'s bar and the `mtAiCardSrcModerate` / `mtAiCardSrcRapid` source lines; no data → the current "not available" / "no observed data" tag); then `.mt-overall` only when the role has a Skill Match: with `overallMatch[scenario]` → `mtOverall` label (+ provisional tag when set), big `percent%`, green bar, and either `mtOverallSum` `{skill, rest: (1 − touch).toFixed(2), know: knowHow.percent, touch: touch.toFixed(2), percent}` or `mtOverallNoAi`; with `knowHow` null → `mtOverallAsk` text and `<button class="btn sm pri" type="button" data-act="mAskAi">` labelled `mtOverallBtn`.
  - The list page passes `data.aiKnowHow` into every `roleCard`.
  - Sort inside a band: replace `pctOf(y) - pctOf(x)` with `sortValue(y, scenario) - sortValue(x, scenario)`; keep the title tie-break.
  - `app.js`: `mAskAi` → `state.screen = 'form'; state.section = 5`, then render (the same way other screens are opened).
  - CSS: `.mt-aitouch` and `.mt-overall` in `.mt-side` (overall box `background: var(--ok-soft)`, number `color: var(--ok)`, bar fill `var(--ok)`; AI bar keeps the existing purple), each separated by a top border like the mockup; nothing wider than the column at 360 px.
  - Strings (en; ms and zh marked `// translation: owner review`): `mtAiTouch` "AI touches this job"; `mtOverall` "Overall match"; `mtOverallSum` "{skill}% skills × {rest} + {know}% AI know-how × {touch} = {percent}%"; `mtOverallNoAi` "No AI data for this job in this scenario, so Overall = Skill Match."; `mtOverallAsk` "Answer 4 short AI questions to see your overall match."; `mtOverallBtn` "Answer AI questions". Add one sentence to `mtLead`: "The Overall match adds your AI know-how where AI touches the job."
- [ ] **Step 4: Run** the tests → PASS; `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: role card shows AI touch and Overall match on the right; lists sort by Overall (M17)` with a build record entry.

---

### Task 5: Browser check and documents

**Files:**
- Modify: `docs/matching/acceptance.md`, `HANDOVER.md`, `CLAUDE.md`, `docs/architecture-matching.html`, `docs/record/status.json`

- [ ] **Step 1: Browser check** on `http://matching.localhost:3220` (launch entry `matching-trial`), desktop and 360 px:
  - the profile shows section 6 "Using AI"; answers save and survive a reload; the know-how line updates;
  - a role card shows Skill Match, AI touch and Overall on the right, the sum line adds up, the left purple bar is gone;
  - Moderate ↔ Rapid changes Overall, never Skill Match; all four questions on "Prefer not to say" → the ask button, which opens section 6;
  - no console errors; no horizontal scroll at 360 px. Record each line with pass/fail in `docs/matching/acceptance.md`.
- [ ] **Step 2: Diagram.** In `docs/architecture-matching.html` add the AI questions → `overall.js` → card path (profile `aiUse`, `touchPct` from the AI parts, Overall beside the unchanged Skill Match), labelled M17.
- [ ] **Step 3: Handover.** `HANDOVER.md` and `CLAUDE.md` (branch, detailed): M17 in the matching rules (formula, sources, never changes Skill Match or bands), the new test count, the UNESCO source.
- [ ] **Step 4: Run** `npm test` → all pass; commit `docs: M17 browser check, diagram, handover and build record`.
- [ ] **Step 5: Ask the owner** whether to push the branch and merge to `main` (main's short files get only the important points).
