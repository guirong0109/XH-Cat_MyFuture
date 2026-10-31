# CV extraction — evaluation results

Run on 2026-10-31 · extractor `cv-1.0` (L1, L2, L4; L3 semantic match off) · O*NET 31.0 · 16 synthetic CVs in `testing/eval-cvs.json` · `node scripts/eval-cv.mjs`.

Measured numbers only; no target is claimed. A found item counts as right when it equals or contains the expected text. A field is scored only on the CVs labelled for it (projects and the Skill Match section: labelled CVs only).

## Per field (all CVs together)

| Field | Right | Wrong (extra) | Missed | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| skills | 49 | 0 | 6 | 1 | 0.891 | 0.942 |
| qualifications | 17 | 0 | 0 | 1 | 1 | 1 |
| jobs | 13 | 0 | 0 | 1 | 1 | 1 |
| certifications | 5 | 0 | 0 | 1 | 1 | 1 |
| projects | 4 | 0 | 2 | 1 | 0.667 | 0.8 |

- Wrong-item rate (extra items ÷ items found, all fields): **0**
- Skills linked to an O*NET id: **36 of 49** found skills (the rest stay "not in our list yet" for the user).
- Skill levels set by extraction, other than Good for a skill used in a job or project: **0** (must be 0).
- Failure rate (a CV not handled as expected): **0 of 16**. The scanned CV is expected to fail with `scanned_no_ocr`.
- Latency per CV (build + read + extract, in-process): median **4 ms**, slowest 14 ms.

## Per CV

| CV | Tags | Language | Outcome | Skills P / R | Qualifications P / R | Jobs P / R | Certificates P / R | Projects P / R | ms |
|---|---|---|---|---|---|---|---|---|---|
| en-pdf | en | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | not labelled | 8 |
| ms-pdf | ms | ms | draft | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | not labelled | 12 |
| zh-docx | zh, docx | zh | draft | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | not labelled | 4 |
| mixed-pdf | mixed | mixed | draft | 1 / 0.75 | 1 / 1 | 1 / 1 | — / — | not labelled | 10 |
| two-degrees-pdf | en, two_degrees | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | not labelled | 14 |
| no-job-docx | en, no_job, docx | en | draft | 1 / 1 | 1 / 1 | — / — | — / — | not labelled | 1 |
| project-only-pdf | en, no_job, project_only | en | draft | 1 / 1 | 1 / 1 | — / — | — / — | 1 / 1 | 4 |
| injection-pdf | en, injection | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | not labelled | 4 |
| multi-job-pdf | en, multiple_jobs | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | not labelled | 3 |
| duplicates-pdf | en, duplicates | uncertain | draft | 1 / 1 | 1 / 1 | — / — | — / — | 1 / 1 | 3 |
| long-projects-pdf | en, no_job, project_only, hard | en | draft | 1 / 0.375 | 1 / 1 | — / — | — / — | 1 / 0.333 | 3 |
| ms-soft-skills-pdf | ms, hard | ms | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | — / — | 3 |
| zh-soft-skills-docx | zh, docx, hard | zh | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | — / — | 1 |
| skills-in-jobs-pdf | en, hard | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | — / — | 8 |
| company-certificates-pdf | en, hard | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | — / — | 4 |
| scanned-pdf | scanned | — | scanned_no_ocr (expected) | — / — | — / — | — / — | — / — | not labelled | 1 |

## Reaches Skill Match (labelled CVs only)

The O*NET skill and knowledge names a CV's skills reach, against `expected.onet`. 5 CVs are labelled for this (labelled CVs only). Rules only counts skills the reader linked to an O*NET skill or knowledge id; rules + AI also counts the O*NET item the AI suggested (a user still has to keep it).

| Reader | Right | Wrong (extra) | Missed | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| rules only | 0 | 0 | 10 | — | 0 | 0 |

Rules + AI: not run (needs `--ai`, which is paid).

## What was found where it differs from the labels

- **mixed-pdf · skills** — expected: Microsoft Excel, Bookkeeping, Komunikasi, QuickBooks Online · found: Microsoft Excel, Bookkeeping, Komunikasi
- **long-projects-pdf · skills** — expected: Vue, Firebase, Python, pandas, Excel, SQL, Git, Teamwork · found: Git, Teamwork, Python
- **long-projects-pdf · projects** — expected: Campus event portal, Sales forecast notebook, Warehouse stock tracker · found: Campus event portal

## Rules only vs rules + DeepSeek (earlier test set: 10 CVs read, run 31 Oct 2026, before the projects field and the 5 harder CVs)

Model `deepseek-flash` · 2026-10-31 · 10 of 11 CVs read by the AI (the rest are listed below). Both sides cover the same 10 CVs. Source: `node --env-file-if-exists=.env scripts/eval-cv.mjs --ai`.

| Field | Rules P | Rules R | Rules F1 | Rules + AI P | Rules + AI R | Rules + AI F1 |
|---|---|---|---|---|---|---|
| skills | 0.917 | 0.971 | 0.943 | 0.917 | 0.971 | 0.943 |
| qualifications | 1 | 1 | 1 | 1 | 1 | 1 |
| jobs | 1 | 1 | 1 | 1 | 1 | 1 |
| certifications | 1 | 1 | 1 | 0.75 | 1 | 0.857 |

- Wrong-item rate: rules only **0.05** · rules + AI **0.066**
- Latency per CV: rules only median **3.5 ms** · rules + AI median **1250.5 ms** (rules and AI run together)
- Tokens and cost (AI reads that succeeded): 4198 input and 1822 output tokens, about **$0.0034** at peak price (cache miss; $0.3 in / $1.2 out per 1M tokens)

| CV | AI result | Rules F1 (skills / jobs) | Rules + AI F1 (skills / jobs) | ms rules + AI (run together) |
|---|---|---|---|---|
| en-pdf | read | 0.889 / 1 | 0.889 / 1 | 1353 |
| ms-pdf | read | 0.857 / 1 | 0.857 / 1 | 1410 |
| zh-docx | read | 1 / 1 | 1 / 1 | 1206 |
| mixed-pdf | read | 0.857 / 1 | 0.857 / 1 | 1136 |
| two-degrees-pdf | read | 1 / 1 | 1 / 1 | 1343 |
| no-job-docx | read | 1 / — | 1 / — | 1211 |
| project-only-pdf | read | 1 / — | 1 / — | 1238 |
| injection-pdf | read | 1 / 1 | 1 / 1 | 1126 |
| multi-job-pdf | read | 1 / 1 | 1 / 1 | 1288 |
| duplicates-pdf | read | 0.8 / — | 0.8 / — | 1263 |
| scanned-pdf | not read: rules step failed | — | — | — |
