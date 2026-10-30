# Technical and Tools Declaration — CV extraction and structured profile module, Future Skills Radar

Every outside tool, data set, model and service these modules use or can use, and its status (CV module 29 Oct 2026;
Future Skills Radar Round 1, branch `claude/future-radar`, 30 Oct 2026).

## Data

| Item | Use | Version / date | Licence | Status |
|---|---|---|---|---|
| O\*NET Database (occupations, job titles, skills, software examples) | Skill ids (`onet:tech:…`, `onet:el:…`), occupation search snapshot | 31.0, downloaded 2026-10-29 (`data/onet/manifest.json`, SHA-256 checked) | CC BY 4.0, U.S. Department of Labor / ETA | In use |
| O\*NET Web Services (api-v2, keyword search) | Live occupation lookup, first in the order live → cached → eMASCO | v2 API | O\*NET Web Services terms | Code ready; needs the owner's free key `ONET_API_KEY` |
| eMASCO (MASCO 2020, Ministry of Human Resources Malaysia) | Malaysian occupation titles listed next to O\*NET; fallback source | fetched 2026-10-23, 1,766 occupations (code, title, URL only) | Public government reference | In use |
| OpenAlex API (`api.openalex.org`: topics and works grouped by publication year) | Radar AI Impact: yearly research-paper counts for six approved AI topics by `primary_topic`, plus the Computer Science field (17) as reference | Snapshot fetched 2026-10-30 without a key (`data/radar/bundle/`); query URLs kept, never with a key | OpenAlex data CC0 | In use (bundled). Deployed refresh needs the owner's free key `OPENALEX_API_KEY` |
| DOSM Big Data Analytics: Job Market Insights (release pages, release archive listing, quarterly workbook "Data JMI") | Radar Skills & Careers: online job advertisements by MASCO 2020 major group, shares and possible structural breaks; release titles as break evidence | Q2 2026 workbook downloaded 2026-10-30, kept byte for byte with SHA-256 (`data/radar/source/`); archive page saved 2026-10-30 | Public DOSM release; licence terms per dosm.gov.my (to confirm) | In use (bundled). Admin refresh discovers the next release from the official listing |
| UNESCO ISCED-F 2013, Statistics Canada concordance, O\*NET CIP and SOC crosswalks | Radar personal relevance: field of study → O\*NET jobs → (SOC 2018 → SOC 2010 → ISCO-08 → MASCO major group) | see `data/SOURCES.md` | as listed there | O\*NET → SOC 2018 in use; BLS steps and ISCO-08 → MASCO pending (owner actions) |
| O\*NET database releases 30.2 (Feb 2026), 30.3 (May 2026), 31.0 (Aug 2026), Software Skills: "In Demand" and "Hot Technology" flags per job | Radar skill trends: which software and technology skills became or stopped being in demand between two releases (US job ads, Lightcast via O\*NET) | Zips from `https://www.onetcenter.org/dl_files/database/db_<v>_text.zip`, downloaded 2026-10-30; zip and file SHA-256 in `data/SOURCES.md`; zips not kept. No AI model involved | CC BY 4.0, USDOL/ETA | In use (bundled). Admin refresh reads a newer release |
| O\*NET OnLine Hot Technologies page (`onetonline.org/search/hot_tech/`; Lightcast US unique postings, 1/25 to 12/25) | Radar skill trends: posting counts of 176 hot technologies; first counting window, so no direction yet | Saved 2026-10-30, original kept with SHA-256; `robots.txt` allows the page. No AI model involved | CC BY 4.0, USDOL/ETA | In use (bundled). Admin refresh reads the page again |
| Synthetic Radar base (`data/radar/demo/base.json`) | Judge Trend Change Test only (Scenarios A, B and C; C changes one In Demand flag) | written by the team, labelled synthetic on screen | — | In use; every value fictional |
| Synthetic CVs and labelled terms (`testing/`) | Tests, extraction evaluation, Model Eval | written by the team | — | In use; no real CVs |

## Models and AI services

| Item | Use | Status |
|---|---|---|
| Embedding model `BAAI/bge-m3` on a RunPod serverless endpoint (OpenAI-compatible `/embeddings`) | L3 semantic match of CV wordings to O\*NET skill names, above a cutoff chosen by Model Eval | Code and Model Eval ready. **No endpoint created**: the owner chose to skip L3 for now, so extractions report `semantic_unavailable` |
| Chat model (proposed `Qwen/Qwen2.5-7B-Instruct`) on a RunPod serverless endpoint (OpenAI-compatible chat) | "Improve extraction with AI", first provider; consent required | Code ready. **Not created** (owner's choice) |
| Claude API, model `claude-opus-5-5` (Anthropic), raw HTTPS, `anthropic-version: 2026-10-21` | "Improve extraction with AI", backup provider; consent required | Code ready. **No key set** (owner's choice) |

Rules for every AI path:
- the CV is sent as data inside `<cv>` tags;
- every item must quote the CV word for word or it is dropped;
- levels, skill ids and occupation codes never come from a model;
- suggestions change nothing until the user ticks them, and stay Unverified until Confirm;
- CV text and model replies are never logged;
- CVs are never used as training data.

## Infrastructure and libraries

| Item | Use | Status |
|---|---|---|
| Node.js ≥ 22.12 (built-in `node:sqlite`, `crypto`, `fetch`) | Server, tests, D1 stand-in | In use (developed on 24.16) |
| Express 5.3 | HTTP server and API | In use |
| pdfjs-dist 6.4 (legacy Node build) | Reading PDF text | In use |
| Vitest 5.0 | Tests | In use (dev only) |
| Python 3 (standard library) | `pipeline/fetch_onet.py` O\*NET refresh and its tests | In use |
| Cloudflare D1 (REST query API) | Accounts, sessions, saved profiles | Code ready; needs the owner's D1 settings. Tested with `node:sqlite` and the real `migrations.sql` |
| Cloudflare R2 (same client, plus `ListObjectsV2` and conditional `If-Match` / `If-None-Match: *` writes) | Radar state: immutable snapshots, manifests, signals, owner reviews and ingestion log under `prod/`; judge sessions under `demo/<session>/`; `prod/active.json` switched only by conditional write | Code ready, tested with a fake; needs the owner's R2 settings (free allowance) and the real-R2 check. Without R2 the Radar serves its bundled data read-only |
| Cloudflare R2 (S3-compatible API, Signature V4) | Temporary CV copy `cv-temp/<extractionId>`, deleted on save and by a 1-day lifecycle rule | Code ready; needs the owner's R2 settings |

## Development tools

| Item | Use |
|---|---|
| Claude Code (Anthropic), with the Superpowers workflow (brainstorming → spec → plan → test-first execution) | Design, implementation and tests of this module, under the owner's direction and approvals. The build record is in `docs/build-record.html` |
| RunPod MCP tools | Read-only price and stock checks (no resources were created) |

## Not used

- No scoring or matching method from the team's earlier project. Matching is the next module. The Radar produces no
  score, weight or ranking.
- No new npm packages for the Radar: its xlsx reader is built on the app's own zip reader and tested against the real
  DOSM workbook.
- No AI exposure (ILO, OECD), AI usage (Anthropic Economic Index) or MyCOL data in Radar Round 1 (later rounds, each
  with its own approval).
- No OCR: scanned CVs get a clear message and the manual form.
- No real personal data.
