# CV skills that reach Skill Match, and clearer projects — design

Date: 31 Oct 2026 · Branch: `claude/cv-profile-module` · Status: **for owner review**

Adds to `2026-10-31-cv-ai-reading-design.md` and `2026-10-29-cv-profile-module-design.md`, which stay authoritative
for everything else. Where they differ, this file wins. Matching (`claude/career-matching` spec) is not changed.

## 1. Why

A check on 31 Oct 2026 of the 10 readable test CVs (`testing/eval-cvs.json`, rules only) found 36 skills:

| Linked to | Count | Counts in Skill Match |
|---|---|---|
| O\*NET skill (`onet:el:`) | 8 | yes |
| O\*NET software (`onet:tech:`) | 20 | no |
| nothing | 8 | no |

Skill Match (`shared/matching/fit.js`) reads only `onet:el:` and `onet:kn:` ids. Knowledge areas (`onet:kn:`) are
never linked from a CV. "SQL", "MS Excel", "Customer service", "Komunikasi" and "沟通" stay unlinked; "Google" is taken
from a certificate line; a project's whole line becomes its title. Project accuracy has never been measured.

## 2. Owner decisions (31 Oct 2026)

| # | Decision |
|---|---|
| L1 | Linking = **rules + AI suggestion**. Rules link what is certain; DeepSeek suggests the closest O\*NET skill or knowledge area from our list, quoting the CV; it counts only after the user presses **Keep**. |
| L2 | Malay and Chinese skill words: **AI suggestion only**, no team word list. With no AI key they stay "not in our list yet", as today. |
| L3 | Order: this fix (A) first; then B (tools used in each career) and C (field of study → careers) as separate designs. |

## 3. Rules (no AI, always on) — `server/skills/normalize.js`, `server/skills/onetSkills.js`, `server/cv/extract.js`

1. **Knowledge areas join the CV list.** The 33 O\*NET knowledge areas (`knowledge.tsv`, `onet:kn:<element id>`) are
   linked by **exact name** by the CV reader and the normaliser. Where a name is both a skill and a knowledge area
   ("Mathematics"), the skill (`onet:el:`) is linked, as today. Work styles and work activities stay search-only.
2. **Short forms.**
   - An all-capital word of 2–6 letters links to an O\*NET software name when that name ends with the word and the
     words before it start with its letters in order ("SQL" → "Structured query language SQL"). When several names
     fit, the one listed for the most O\*NET occupations is linked (O\*NET 31.0 also has the misspelt "Structure
     query language SQL", 21 occupations, beside "Structured query language SQL", 151); a tie → offered to pick, as
     now; none → unknown.
   - "MS" at the start is read as "Microsoft" ("MS Excel" → "Microsoft Excel").
   - The match kind is `short_form`; the user's wording is kept in `originalText`.
3. **No skills from certificate or education lines.** The software-name scan skips the Certifications and Education
   sections ("Google Data Analytics Certificate" adds no "Google" skill). The Skills section and job and project
   lines are read as today.

## 4. AI suggestion — `server/cv/aiReadPrompt.js`, `server/cv/aiRead.js`, `server/cv/mergeDrafts.js`

1. **Request.** Each skill in the reply gets a new optional field `onet`: one name copied from the list of the 67
   unique O\*NET skill and knowledge names (35 skills, 33 knowledge areas; Mathematics is both, and the skill wins), sent in the system prompt, or empty. The prompt
   says: pick the one name whose meaning is closest to how the CV shows the skill; leave it empty when none is close;
   never invent a name. The skill's `evidence` is the quote for the suggestion too. A skill described only in a job
   or project line ("built models in Python") may be returned with that line as evidence.
2. **Checks (server).** A suggestion is kept only when its `onet` is **exactly** one of the 67 unique names (letter case
   ignored) and the skill itself passed `keepQuoted`. The id comes from our list, never from the AI. A suggestion is
   dropped when it names the skill's own id or an id already linked on another skill in the draft.
3. **Shape.** The skill carries `aiSuggestion: { id, name, evidence }`. Its own `canonicalId` is unchanged (so
   "Python" stays the software Python). `aiSuggestion` is not read by Skill Match.
4. **Merge.** When the AI skill matches a rules skill (same id, or same name as today), the suggestion moves onto the
   rules skill. At most one suggestion per skill.
5. **Keep.** In the form, **Keep** adds a new skill: the suggested id and name, `source: 'cv_ai'`,
   `userConfirmed: true`, the original skill's `usedIn`, and its level by the owner's rule (Good, `from_projects`,
   when used in a job or project; else "Not assessed yet"). The suggestion is then removed from the original skill.
   **Remove** removes only the suggestion. A suggestion left alone is never saved as a skill.
6. **Cost.** The name list adds about 400 input tokens per CV (Flash ≈ $0.0001 more at peak).
7. **Prompt-injection.** Unchanged rule: the CV is data. A CV that asks for a suggestion gets nothing beyond the
   checks above (exact list name, quoted evidence, user Keep).

## 5. Projects — `server/cv/extract.js`, `server/cv/aiReadPrompt.js`, `server/cv/aiRead.js`

1. **Rules.** A project line is split at the first of " built with ", " built using ", " using ", " with ",
   " dengan ", " menggunakan ", "使用" (whole words, letter case ignored) when at least two words come before it:
   the part before is the title, the split word and what follows start the description. "Student attendance
   dashboard built with React and Node.js" → title "Student attendance dashboard", description "built with React and
   Node.js". A title before " - ", " – " or ": " is split there first. Other lines are unchanged.
2. **AI.** A project in the reply gets `description` (checked against the CV like other secondary fields: left empty
   when it does not occur in the CV).
3. **Merge.** Unchanged rules: rules win, the AI fills an empty description.

## 6. What the user sees (en / ms / zh, same keys)

- Under a skill with a suggestion: "AI suggests: {name} — from "{evidence}". Check it." with **Keep** and **Remove**,
  and the source line "O\*NET 31.0 skills and knowledge list, suggested by DeepSeek".
- A short-form link shows its wording: "{originalText} → {name} (O\*NET)".
- Projects show title and description as two fields, as the form already allows.

## 7. Measuring

- About 5 new synthetic CVs in `testing/eval-cvs.json`: long project lines, Malay and Chinese skills, skills only
  described in job lines, a short form, a certificate naming a company. Each lists `expected.projects` (titles) and
  `expected.onet` (O\*NET skill or knowledge names a reader should reach).
- `docs/eval-results.md` gains a **projects** row and a **reaches Skill Match** line: skills with an `onet:el:` or
  `onet:kn:` id, and for rules + AI also the suggestions, scored against `expected.onet`.
- The paid run (`--ai`, under $0.01) only after the owner's OK.

## 8. Testing (Vitest, test first; never the real API)

- Normaliser: knowledge exact name; "SQL" short form; two fitting names → candidates; "MS Excel".
- Rules: no "Google" from a certificate line; project title and description split; a line with no split word.
- AI reader: `onet` kept when exactly on the list; dropped when not on the list, when the skill's quote failed, when
  it is the skill's own id or already linked; missing `onet` still accepted.
- Merge: the suggestion moves onto the matching rules skill.
- Browser: Keep adds the skill with the right level and id; Remove drops the suggestion; strings in three languages.
- Matching: a kept suggestion raises the Skill Match like any `onet:el:` skill (one test, no matching code change).

## 9. Not in this change

- No change to Skill Match, Overall match, bands, Radar or SDG.
- No team word list (L2). No AI link without the user's Keep (L1).
- B (tools used in each career) and C (field of study → careers): separate designs after this one.
