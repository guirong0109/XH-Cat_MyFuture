# CV O*NET linking: acceptance

Date: 31 Oct 2026 - Branch `claude/cv-profile-module` (merged to `main` as `a771c15`)

## Test counts

| Suite | Command | Result |
|---|---|---|
| App tests (Vitest) | `npx vitest run --testTimeout=30000` | 1716 passed (115 files). The default 5 s timeout failed under load with no assertion failure |
| Python pipeline tests | `python -m unittest discover pipeline/tests` | 49 OK |

## How the browser check was run

- The app ran on `http://cvcheck.localhost:3263`, an address nobody else uses, started from the launch entries
  `cv-fakeai` and `cv-check` in `.claude/launch.json`. `cv-fakeai` is a local fake DeepSeek that answers with fixed
  suggestions, so nothing was paid and no key was used.
- Synthetic CV: "Priya Nair (synthetic)". No real person.

## Results

| Check | Result |
|---|---|
| The form shows an AI suggestion under the skill, with its source (the quote from the CV) and Keep / Remove | Pass |
| Keep added Programming at Good, in the job and in the project where it was used | Pass |
| SQL and MS Excel (short forms) linked to O*NET by the rules | Pass |
| Project split: title "Sales forecast app", description "built with Python and Flask" | Pass |
| A suggestion left alone is not counted in the Skill Match (test: "a kept CV suggestion counts in Skill Match") | Pass (test) |
| The suggestion repeats on every card where the skill appears | Seen, deferred minor |

## Evaluation

`node scripts/eval-cv.mjs` (rules only, 16 synthetic CVs): 36 of 49 found skills linked to an O*NET id; wrong-item rate
0; levels set by extraction other than Good 0. Known gap: `long-projects-pdf` finds 1 of 3 projects.
The paid `--ai` run for the new suggestions has not been run (needs the owner's OK, under US$0.01).
