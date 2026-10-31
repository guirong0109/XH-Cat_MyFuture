# Data sources

Every data file the CV/profile module reads, where it comes from, when it was fetched and under which licence.
Only synthetic CVs are used; no personal data is stored here.

| File | What it is | Source | Date | Licence / notes |
|---|---|---|---|---|
| `onet/occupations.tsv` | O\*NET occupations: code, title, description (1,016) | O\*NET 31.0 Database, https://www.onetcenter.org/dl_files/database/db_31_0_text.zip | downloaded 2026-10-29 | CC BY 4.0, USDOL/ETA. Attribution in `onet/manifest.json` |
| `onet/job_titles.tsv` | Job titles and reported titles per O\*NET occupation | same | 2026-10-29 | CC BY 4.0 |
| `onet/skills.tsv` | Essential and Transferable Skills, importance scale (IM) | same | 2026-10-29 | CC BY 4.0 |
| `onet/software.tsv` | Software Skills examples (e.g. Python, Microsoft Excel) with their O\*NET category | same | 2026-10-29 | CC BY 4.0 |
| `onet/work_styles.tsv` | Work Styles (21, e.g. Leadership Orientation, Empathy) with each occupation's impact value (WI scale, −3 to 3); for the skill search | same (`Work Styles.txt`) | 2026-10-29 | CC BY 4.0 |
| `onet/knowledge.tsv` | Knowledge areas (33, e.g. Customer and Personal Service) with each occupation's importance (IM scale); for the skill search | same (`Knowledge.txt`) | 2026-10-29 | CC BY 4.0 |
| `onet/work_activities.tsv` | Detailed work activities (2,085, e.g. "Care for animals.") per occupation: ids from `Tasks to DWAs.txt`, names from `GWAs to IWAs to DWAs.txt`; for the skill search | same | 2026-10-29 | CC BY 4.0 |
| `onet/interest_areas.tsv` | Specific Interest Areas (41, e.g. Information Technology, Health Care Service) with each occupation's interest value (OI scale); the list for "Career interests and fields" | same (`Specific Interest Areas.txt`) | 2026-10-29 | CC BY 4.0 |
| `onet/manifest.json` | Version, URL, download date and SHA-256 of each file | written by `pipeline/fetch_onet.py` | 2026-10-29 | — |
| `emasco/occupations.json` | eMASCO occupations: code, title, page URL (1,766) | eMASCO (MASCO 2020), https://emasco.mohr.gov.my, English pages; copied from the team's earlier crawl as data only | fetched 2026-10-23 | Public government reference; only code, title and URL are kept |
| `isced/fields.tsv` | ISCED-F 2013 fields of study: 4-digit code, title, broad field (124) | UNESCO ISCED-F 2013, titles as given in the Statistics Canada concordance below; broad-field names from UNESCO UIS (2014) | 2026-10-30 | The list users pick their field of study from |
| `isced/isced_cip.tsv` | ISCED-F 2013 field to CIP programme, with partial links (`*`) and notes (1,809) | Statistics Canada, ISCED-F 2013 to CIP Canada 2016 concordance, https://www.statcan.gc.ca/sites/default/files/documents/isced-f-2013-cip2016-eng.csv | downloaded 2026-10-30 | Statistics Canada Open Licence |
| `isced/cip_onet.tsv` | CIP 2020 programme to O\*NET-SOC 2019 occupation (8,501) | O\*NET Resource Center crosswalk, https://www.onetcenter.org/crosswalks/cip/Education_CIP_to_ONET_SOC.xlsx | downloaded 2026-10-30 | CC BY 4.0, USDOL/ETA |
| `isced/source/isced-f-2013-cip2016-eng.csv` | Original Statistics Canada concordance as downloaded (Windows-1252), kept unchanged so `isced/fields.tsv` and `isced/isced_cip.tsv` can be checked; SHA-256 `120ae5c1…37e1` | Statistics Canada (URL above) | downloaded 2026-10-30 | Statistics Canada Open Licence |
| `isced/source/Education_CIP_to_ONET_SOC.xlsx` | Original O\*NET CIP crosswalk as downloaded, kept unchanged so `isced/cip_onet.tsv` can be checked; SHA-256 `4802101a…a6e8` | O\*NET Resource Center (URL above) | downloaded 2026-10-30 | CC BY 4.0, USDOL/ETA |
| `isced/manifest.json` | Sources, download date, SHA-256 of each file, and how many fields reach O\*NET (118 of 124) | written by `pipeline/fetch_isced.py` | 2026-10-30 | — |

Refresh O\*NET: `python pipeline/fetch_onet.py <version>` (see the script's header).
Refresh ISCED-F and its CIP bridge: `python pipeline/fetch_isced.py` (downloads again), or rebuild from the kept originals: `python pipeline/fetch_isced.py data/isced/source/isced-f-2013-cip2016-eng.csv data/isced/source/Education_CIP_to_ONET_SOC.xlsx`. The concordance uses CIP Canada 2016 and the O\*NET crosswalk CIP 2020; a CIP code is matched only when both tables use the same code, so 6 fields (e.g. 9999 Field unknown) have no O\*NET link.

## AI service (CV reading)

| Item | Source | Checked | Terms | Use |
|---|---|---|---|---|
| DeepSeek API, models `deepseek-flash` (DeepSeek-V4.1-Flash-1017) and `deepseek-v4-pro` (DeepSeek-V4-Pro-0813) | Pricing: https://api-docs.deepseek.com/quick_start/pricing. Privacy policy: https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html | 2026-10-31 | Data is stored on servers in China. Flash costs about $0.004 per CV at peak price | Reads every uploaded CV next to the rules reader (`server/cv/aiRead.js`). CV reading only. Used with synthetic data so far; check Malaysia's PDPA cross-border rules before real users. Off until the owner sets `CV_LLM_KEY` |

## Test and evaluation sets (synthetic)

| File | What it is |
|---|---|
| `../testing/eval-cvs.json` | 11 synthetic CVs (EN, BM, 中文, mixed, two degrees, no job, project only, injection attempt, DOCX, duplicates, scanned) with expected skills, qualifications, jobs and certificates, for `scripts/eval-cv.mjs` |
| `../testing/model-eval-set.json` | 61 labelled wordings → O\*NET 31.0 ids (incl. BM, 中文 and 7 with no match), for `scripts/model-eval.mjs` |

All names, employers and details in these files are invented.
