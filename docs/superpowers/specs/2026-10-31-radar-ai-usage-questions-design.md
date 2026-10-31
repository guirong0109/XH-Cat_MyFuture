# Future Skills Radar — "Which of these do you use AI for?" (design)

Status: design approved in conversation by the owner on 31 Oct 2026 ("Go ahead"); this written spec waits for the
owner's review. Branch `claude/future-radar`. Builds on the Round 1, skill trends and profile charts specs; everything
there still applies unless this document says otherwise.

## 1. Why

The owner's request (31 Oct 2026): before the Future Skills Radar shows, ask the user which kinds of tasks they use AI
for, from the owner's list of 10 categories. For now the answers are **only recorded** so that later modules can use
them; the Radar shows the same as today.

## 2. Decisions

| # | Decision |
|---|---|
| D34 | **The 10 categories are the owner's own list** (31 Oct 2026). The screen says so under the list: "Categories set by the FutureReady team (31 Oct 2026); not from an outside study." No outside source is claimed. |
| D35 | **One question, checkboxes:** "Which of these do you use AI for?" Each category is a checkbox with its examples under it, plus "I don't use AI for any of these". Ticking "none" clears the other ticks; ticking a category clears "none". |
| D36 | **Asked first, can be skipped.** While the profile has no `aiTasks`, opening the Radar shows only the question card (header and banners stay). **Continue** (enabled once at least one box is ticked) saves the answer; **Skip for now** saves that the user skipped. After either, the card is not shown again by itself. |
| D37 | **Only recorded.** The answers change no chart, list, signal, Skill Match, Overall match or band, and go into no request the Radar makes and no log. No score, weight, rank or match field. |
| D38 | **Kept in the profile** as the optional part `aiTasks` (approach A), so later modules can read it. Saving it does **not** turn a confirmed profile back into a draft (it is not CV content the user confirms). |
| D39 | **Changing answers:** a small "Change my AI use answers" button under the Radar title (only once `aiTasks` exists) opens the card again with the saved ticks. This is the only new thing on the Radar page. |

## 3. The categories

Ids are fixed (they are what is stored); names and examples are screen text in `t()` (EN, BM, 中文).

| Id | Name (EN) | Examples (EN) |
|---|---|---|
| `writing` | Writing & Documentation | Reports, emails, meeting minutes, documentation |
| `learning` | Learning & Research | Understanding concepts, tutoring, finding research directions |
| `programming` | Programming & Technical Work | Writing code, debugging, explaining errors |
| `data` | Data & Analytics | Spreadsheet formulas, data analysis, charts, insights |
| `creative` | Creative & Design | Images, presentations, marketing materials, videos |
| `communication` | Communication & Language | Translation, proofreading, communication practice |
| `planning` | Planning & Decision Support | Scheduling, brainstorming, comparing options |
| `admin` | Administrative Work | Data entry, document processing, repetitive office tasks |
| `customer` | Customer & Business Support | Customer replies, sales content, business analysis |
| `automation` | Automation & AI Agents | Connected workflows, AI assistants using tools or APIs |

The list lives in one place, `shared/aiTasks.js` (ids in this order), used by the screen and the profile check.

## 4. Stored shape

`profile.aiTasks` is optional; profiles saved before it have none and still load.

- not asked yet: no `aiTasks` key (or `null`)
- skipped: `{ status: 'skipped', date: 'YYYY-MM-DD' }`
- answered: `{ status: 'answered', picked: ['writing', 'programming'], date: 'YYYY-MM-DD' }`; "none of these" is
  `picked: []`

The profile check (`shared/profileSchema.js`) accepts exactly these: `status` is `skipped` or `answered`; `picked`
appears only with `answered` and holds known ids, each at most once, in the §3 order; `date` is `YYYY-MM-DD`. Anything
else is an error with its path (`aiTasks`, `aiTasks.status`, `aiTasks.picked`, `aiTasks.date`).

Where it is kept is the same as the rest of the profile: in this browser (`safeLocalStorage()` through the guest
store), and in the user's account only when they are signed in and save their profile. The privacy line on the card
says exactly that: "Kept with your profile: on this device, and in your account if you sign in and save it."

## 5. Screen

The question card uses the source-card look (`.rd-srccard`: ink outline, 14px corners, paper, offset shadow), one
column, full width of the Radar area:

- heading "Which of these do you use AI for?" and one line "Tick all that apply. This does not change what the Radar
  shows."
- the 10 checkboxes (name in normal text, examples in small muted text), then "I don't use AI for any of these"
- the source line (D34) and the privacy line (§4) in small muted text
- buttons **Continue** (primary, disabled until something is ticked) and **Skip for now** (ghost)

Opened again with "Change my AI use answers", the card shows the saved ticks and the same buttons; Skip keeps the
earlier answer as it was (it does not overwrite an answer with "skipped"). Ticks not yet saved live in the screen
state only; nothing is saved until Continue or Skip.

Keyboard and screen readers: real `<input type="checkbox">` with `<label>`, a `<fieldset>` with the heading as its
`<legend>`; the disabled Continue uses `disabled`. Phone width: no sideways scroll at 360 px.

## 6. Code

- `shared/aiTasks.js` (new, pure): `AI_TASK_IDS`, `pickTask(picked, id)` / `pickNone()` rules for D35,
  `answered(picked, date)`, `skipped(date)`, `needsAsking(profile)`.
- `shared/profileSchema.js`: the optional `aiTasks` check (§4).
- `public/js/screens/radar.js`: `aiTasksCard(t, state)`; `radarView` shows only it (after header and banners) while
  `needsAsking` is true or the card was reopened; the "Change my AI use answers" button under the title otherwise.
- `public/js/app.js`: actions to tick, Continue, Skip and reopen; saving sets `profile.aiTasks` and persists **without**
  calling `update()` (D38: no draft).
- `public/styles.css`: only what the card needs beyond `.rd-srccard` (checkbox rows), one rule per class.
- Strings in `shared/strings/en.js`, `ms.js`, `zh.js`; BM and 中文 lines marked `// translation: owner review`.

## 7. Testing (test first)

- profile check: valid skipped / answered / none; bad status, unknown id, duplicate id, wrong order, `picked` with
  skipped, bad date; a profile without `aiTasks` still passes.
- rules: ticking "none" clears the others and the reverse; Continue disabled with nothing ticked.
- screen: card shown first while not asked; Radar hidden behind it; Skip and Continue both stop it showing; Change
  reopens with the saved ticks; Skip on a reopened card keeps the earlier answer; every value through `esc()`; the
  three languages; the source and privacy lines present.
- saving does not change `profileStatus`; no Radar request carries `aiTasks` (checked on the requests the screen makes).
- browser: desktop, 360–375 px and dark mode on an address nobody else uses; result in `docs/radar/acceptance.md`.

## 8. Not in this change

Using the answers anywhere (Radar, Matching, organisation view), showing them on the profile review or summary
screens, and any link from a category to outside data. Each needs its own decision by the owner.

## 9. Added the same day: the AI tasks chart becomes a scatter (D40-D42)

The owner's request (31 Oct 2026, with a sample scatter picture of roles): replace the spider web on "How AI is used
in your job's tasks" with a scatter chart, to make it more engaging. The owner chose the **tasks scatter on real data**
over the roles-and-demand-growth picture (no comparable growth source exists, and "safest / riskiest" would be a
forecast, which D33 rules out).

| # | Decision |
|---|---|
| D40 | **Scatter replaces the spider web of D31** on the AI tasks card. One dot per task of the user's job (the same tasks, order, numbers T1, T2 ..., corner switch 8 / 16 / All, numbered list and click-to-highlight as today). Across: share of the task's AI conversations where AI does the task (`automation`, 0-100 %), with a dashed line at 50 % ("half and half"). Up: the task's share of all AI conversations (`usage`), on a log scale with ticks 0.01 %, 0.1 %, 1 %, 10 %; tasks under 0.01 % sit on a bottom band labelled "under 0.01 %". |
| D41 | **No judgement words.** The two sides are labelled "AI mostly helps" (left of 50 %) and "AI mostly does the task" (right); the up axis says "used more often". No safe, risky, score or rank. The labels from D33 stay: "not a score" and "how AI is used today, not a forecast of jobs lost". |
| D42 | **Values as they are.** Dots are drawn at their real values: no jitter, no rounding beyond the source's. Dots at the same place overlap; the list under the chart holds every value. Every dot is a keyboard button with the task text and its numbers as its label. Colour: `--est`. |

Code: a new pure component `public/js/components/charts/taskScatter.js`; `aiTasksCard` in
`public/js/screens/radar.js` uses it instead of `profileRadar` (which stays for the skills chart). Tests: the scale
mapping (including the under-0.01 % band and 100 %), the 50 % line, labels, keyboard attributes, no score or rank
words, and the card using the scatter for 1, 2 and many tasks (the spider web needed 3).

## 10. Added the same day: two tabs, For You and Explore all trends (D43-D48)

The owner's request (31 Oct 2026): split the Radar into two tabs, put the 10 questions first in For You, keep only the
research charts in Explore all trends, and remove the rest from the page. Settled in conversation, one question at a time.

| # | Decision |
|---|---|
| D43 | **Two tabs, For You and Explore all trends**, replacing "Skills & Careers" and "AI Impact" (replaces D21's tab names and order). For You is first in the tab bar. The source cards and the sources list stay above the tabs. |
| D44 | **For You:** until the AI usage question is answered or skipped, the tab shows only the question card (the gate of D36 now covers this tab only; Explore all trends opens straight away). After Continue or Skip it shows the "Change my AI use answers" button at the top, then "How AI is used in your job's tasks" (the scatter, D40), then "What the research signals say for you". Nothing else. |
| D45 | **Explore all trends:** only "Research momentum by AI topic" and "Research papers per year", showing **all six topics by default**; no "View all" switch in this tab (replaces D2 for this tab and the "View all six topics" of D31). Topics linked to the user's field keep their "from your profile" tag. |
| D46 | **Which tab opens first:** Explore all trends when the profile's career goal is "Switch career" (`preferences.careerGoal` = `switch_career`); For You for everyone else, including no profile or no goal. Read in the browser; nothing is sent. A tab the user picks stays picked while they use the page (screen state only, not saved). |
| D47 | **Removed from the page:** "Skills your jobs ask for", "Change in share of Malaysian online job advertisements", "Rising, declining and emerging skills", "Your fields of study", "What this means for you", and that tab's "View all". Their code, data and server routes stay in the project; the admin and judge screens are unchanged. |
| D48 | **Only sources shown on the page are listed:** the source cards and the "View data sources" list show OpenAlex only (DOSM and both O\*NET sources are no longer on the page). The Anthropic Economic Index and ILO stay named, with links, inside the scatter card. The admin screen keeps all its source cards. |

Code: `radarView` in `public/js/screens/radar.js` (tabs, default tab, gate inside For You, which sources it lists);
the For You and Explore bodies reuse the existing AI tasks card, A5, A2 and A1 builders. Tests: tab names and order,
the default tab for `switch_career` and for other or missing goals, the gate only in For You, the exact sections in
each tab (and none of the removed ones), all six topics in Explore with no View all, and only the OpenAlex source card.
