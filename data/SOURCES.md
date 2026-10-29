# Data sources

Every data file the CV/profile module reads, where it comes from, when it was fetched and under which licence.
Only synthetic CVs are used; no personal data is stored here.

| File | What it is | Source | Date | Licence / notes |
|---|---|---|---|---|
| `onet/occupations.tsv` | O\*NET occupations: code, title, description (1,016) | O\*NET 31.0 Database, https://www.onetcenter.org/dl_files/database/db_31_0_text.zip | downloaded 2026-10-29 | CC BY 4.0, USDOL/ETA. Attribution in `onet/manifest.json` |
| `onet/job_titles.tsv` | Job titles and reported titles per O\*NET occupation | same | 2026-10-29 | CC BY 4.0 |
| `onet/skills.tsv` | Essential and Transferable Skills, importance scale (IM) | same | 2026-10-29 | CC BY 4.0 |
| `onet/software.tsv` | Software Skills examples (e.g. Python, Microsoft Excel) with their O\*NET category | same | 2026-10-29 | CC BY 4.0 |
| `onet/manifest.json` | Version, URL, download date and SHA-256 of each file | written by `pipeline/fetch_onet.py` | 2026-10-29 | — |
| `emasco/occupations.json` | eMASCO occupations: code, title, page URL (1,766) | eMASCO (MASCO 2020), https://emasco.mohr.gov.my, English pages; copied from the team's earlier crawl as data only | fetched 2026-10-23 | Public government reference; only code, title and URL are kept |
| `isced/fields.tsv` | ISCED-F 2013 fields of study: 4-digit code, title, broad field (124) | UNESCO ISCED-F 2013, titles as given in the Statistics Canada concordance below; broad-field names from UNESCO UIS (2014) | 2026-10-30 | The list users pick their field of study from |
| `isced/isced_cip.tsv` | ISCED-F 2013 field to CIP programme, with partial links (`*`) and notes (1,809) | Statistics Canada, ISCED-F 2013 to CIP Canada 2016 concordance, https://www.statcan.gc.ca/sites/default/files/documents/isced-f-2013-cip2016-eng.csv | downloaded 2026-10-30 | Statistics Canada Open Licence |
| `isced/cip_onet.tsv` | CIP 2020 programme to O\*NET-SOC 2019 occupation (8,501) | O\*NET Resource Center crosswalk, https://www.onetcenter.org/crosswalks/cip/Education_CIP_to_ONET_SOC.xlsx | downloaded 2026-10-30 | CC BY 4.0, USDOL/ETA |
| `isced/manifest.json` | Sources, download date, SHA-256 of each file, and how many fields reach O\*NET (118 of 124) | written by `pipeline/fetch_isced.py` | 2026-10-30 | — |

Refresh O\*NET: `python pipeline/fetch_onet.py <version>` (see the script's header).
Refresh ISCED-F and its CIP bridge: `python pipeline/fetch_isced.py`. The concordance uses CIP Canada 2016 and the O\*NET crosswalk CIP 2020; a CIP code is matched only when both tables use the same code, so 6 fields (e.g. 9999 Field unknown) have no O\*NET link.

## Test and evaluation sets (synthetic)

| File | What it is |
|---|---|
| `../testing/eval-cvs.json` | 11 synthetic CVs (EN, BM, 中文, mixed, two degrees, no job, project only, injection attempt, DOCX, duplicates, scanned) with expected skills, qualifications, jobs and certificates, for `scripts/eval-cv.mjs` |
| `../testing/model-eval-set.json` | 61 labelled wordings → O\*NET 31.0 ids (incl. BM, 中文 and 7 with no match), for `scripts/model-eval.mjs` |

All names, employers and details in these files are invented.
