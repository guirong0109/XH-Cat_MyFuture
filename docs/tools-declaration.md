# Technical and Tools Declaration — CV extraction and structured profile module, Future Skills Radar

Every outside tool, data set, model and service these modules use or can use, and its status (CV module 29 Oct 2026;
Future Skills Radar Round 1, branch `claude/future-radar`, 30 Oct 2026; Career matching, branch `claude/career-matching`, 30 Oct 2026).

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
| ILO Working Paper 140, "Generative AI and Jobs: A 2025 update" (Gmyrek et al., 20 May 2025): GenAI exposure scores per ISCO-08 occupation (427), file from the lead author's repository `pgmyrek/2025_GenAI_scores_ISCO08` | Career matching, Rapid AI scenario: potential exposure and the paper's Table 5 gradient. Never part of the Skill Match percentage | Downloaded 2026-10-30; SHA-256 of the original and of `data/ai/ilo_wp140.tsv` in `data/ai/manifest.json`; the 2.6 MB original is not kept. No AI model involved | CC BY 4.0 | In use (bundled) |
| Anthropic Economic Index, Hugging Face dataset `Anthropic/EconomicIndex`, release 2026-06-26 (claude.ai usage per O\*NET task, May 2026 slice) | Career matching, Moderate AI scenario: how much AI is observed in use for the tasks of a job. Never part of the Skill Match percentage | Downloaded 2026-10-30; SHA-256 in `data/ai/manifest.json`; the 219 MB original is not kept. Only published counts are read; no AI model involved | CC-BY (data) | In use (bundled) |
| UN Statistics Division SDG API (`unstats.un.org/SDGAPI/v1`, one request per goal) | Career matching: official wording of the 17 goals and 169 targets, shown next to each SDG link | Fetched 2026-10-30 into `data/sdg/targets.json`; the team-draft links in `data/sdg/links.json` are written by the team and shown only after the owner approves each one | UN material; terms not stated on the API | In use (bundled) |
| BLS crosswalks (SOC 2018 to SOC 2010; SOC 2010 to ISCO-08) | Career matching: the official code chain from an eMASCO role to O\*NET jobs. BLS blocks automated downloads | The owner saves the two files in `data/radar/source/`; `pipeline/fetch_radar_bridge.py` then fills the pending steps with SHA-256 per step | US government publication | **Waiting for the owner**. Until then Skill Match, the chain, Rapid AI and "In your field" say "not available yet" |
| eMASCO role pages (MASCO 2020; description, tasks, skills, tags) | Career matching: role list and card text | Copied from the team's 23 Oct 2026 crawl by `pipeline/import_emasco_details.py` (1,814 entries); new crawl script `pipeline/fetch_emasco.py` for later refreshes, checks `robots.txt` first and fetches one page a second. Display only | Public government reference | In use (bundled). The crawl script has only been run against saved pages in tests; a live refresh needs the owner's go-ahead |
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
| three.js 0.186.1 | The landing page's 3D ATM intro (WebGL), served by our server from `node_modules` (no CDN); skipped for "reduce motion" or without WebGL | In use (MIT) |
| Google Fonts (Geist, Geist Mono, Instrument Serif) | Typefaces of the landing page, loaded from fonts.googleapis.com; system fonts are used when it cannot be reached | In use (SIL Open Font License) |
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

- No scoring or matching method from the team's earlier project. The Radar produces no score, weight or ranking.
- Career matching uses no language model. Skill Match is arithmetic on published O\*NET levels; the AI scenarios read
  published ILO and Anthropic numbers; roles reach O\*NET only through official code tables, never by word matching.
- No new npm packages for the Radar: its xlsx reader is built on the app's own zip reader and tested against the real
  DOSM workbook.
- No AI exposure or AI usage data in Radar Round 1 (career matching reads ILO and Anthropic data instead). No MyCOL data.
- No OCR: scanned CVs get a clear message and the manual form.
- No real personal data.
