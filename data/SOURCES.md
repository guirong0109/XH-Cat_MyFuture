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

Refresh O\*NET: `python pipeline/fetch_onet.py <version>` (see the script's header).
