# CV extraction — evaluation results

Run on 2026-10-31 · extractor `cv-1.0` (L1, L2, L4; L3 semantic match off) · O*NET 31.0 · 11 synthetic CVs in `testing/eval-cvs.json` · `node scripts/eval-cv.mjs`.

Measured numbers only; no target is claimed. A found item counts as right when it equals or contains the expected text.

## Per field (all CVs together)

| Field | Right | Wrong (extra) | Missed | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| skills | 33 | 3 | 1 | 0.917 | 0.971 | 0.943 |
| qualifications | 12 | 0 | 0 | 1 | 1 | 1 |
| jobs | 9 | 0 | 0 | 1 | 1 | 1 |
| certifications | 3 | 0 | 0 | 1 | 1 | 1 |

- Wrong-item rate (extra items ÷ items found, all fields): **0.05**
- Skills linked to an O*NET id: **28 of 36** found skills (the rest stay "not in our list yet" for the user).
- Skill levels set by extraction: **0** (must be 0).
- Failure rate (a CV not handled as expected): **0 of 11**. The scanned CV is expected to fail with `scanned_no_ocr`.
- Latency per CV (build + read + extract, in-process): median **3 ms**, slowest 6 ms.

## Per CV

| CV | Tags | Language | Outcome | Skills P / R | Qualifications P / R | Jobs P / R | Certificates P / R | ms |
|---|---|---|---|---|---|---|---|---|
| en-pdf | en | en | draft | 0.8 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | 6 |
| ms-pdf | ms | ms | draft | 0.75 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | 4 |
| zh-docx | zh, docx | zh | draft | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | 3 |
| mixed-pdf | mixed | mixed | draft | 1 / 0.75 | 1 / 1 | 1 / 1 | — / — | 4 |
| two-degrees-pdf | en, two_degrees | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | 4 |
| no-job-docx | en, no_job, docx | en | draft | 1 / 1 | 1 / 1 | — / — | — / — | 1 |
| project-only-pdf | en, no_job, project_only | en | draft | 1 / 1 | 1 / 1 | — / — | — / — | 3 |
| injection-pdf | en, injection | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | 3 |
| multi-job-pdf | en, multiple_jobs | en | draft | 1 / 1 | 1 / 1 | 1 / 1 | — / — | 3 |
| duplicates-pdf | en, duplicates | uncertain | draft | 0.667 / 1 | 1 / 1 | — / — | — / — | 3 |
| scanned-pdf | scanned | — | scanned_no_ocr (expected) | — / — | — / — | — / — | — / — | 1 |

## What was found where it differs from the labels

- **en-pdf · skills** — expected: Python, Microsoft Excel, Critical Thinking, Customer service · found: Python, Critical Thinking, Customer service, Microsoft Excel, Google
- **ms-pdf · skills** — expected: SQL, Microsoft Excel, Python · found: SQL, Microsoft Excel, Python, Oracle Database
- **mixed-pdf · skills** — expected: Microsoft Excel, Bookkeeping, Komunikasi, QuickBooks Online · found: Microsoft Excel, Bookkeeping, Komunikasi
- **duplicates-pdf · skills** — expected: Python, Microsoft Excel · found: Python, Microsoft Excel, MS Excel
