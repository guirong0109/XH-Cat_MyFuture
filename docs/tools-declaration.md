# Technical and Tools Declaration — CV extraction and structured profile module

Every outside tool, data set, model and service this module uses or can use, and its status on 29 Oct 2026.

## Data

| Item | Use | Version / date | Licence | Status |
|---|---|---|---|---|
| O\*NET Database (occupations, job titles, skills, software examples) | Skill ids (`onet:tech:…`, `onet:el:…`), occupation search snapshot | 31.0, downloaded 2026-10-29 (`data/onet/manifest.json`, SHA-256 checked) | CC BY 4.0, U.S. Department of Labor / ETA | In use |
| O\*NET Web Services (api-v2, keyword search) | Live occupation lookup, first in the order live → cached → eMASCO | v2 API | O\*NET Web Services terms | Code ready; needs the owner's free key `ONET_API_KEY` |
| eMASCO (MASCO 2020, Ministry of Human Resources Malaysia) | Malaysian occupation titles listed next to O\*NET; fallback source | fetched 2026-10-23, 1,766 occupations (code, title, URL only) | Public government reference | In use |
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
| Cloudflare R2 (S3-compatible API, Signature V4) | Temporary CV copy `cv-temp/<extractionId>`, deleted on save and by a 1-day lifecycle rule | Code ready; needs the owner's R2 settings |

## Development tools

| Item | Use |
|---|---|
| Claude Code (Anthropic), with the Superpowers workflow (brainstorming → spec → plan → test-first execution) | Design, implementation and tests of this module, under the owner's direction and approvals. The build record is in `docs/build-record.html` |
| RunPod MCP tools | Read-only price and stock checks (no resources were created) |

## Not used

- No scoring or matching method from the team's earlier project. Matching is the next module.
- No OCR: scanned CVs get a clear message and the manual form.
- No real personal data.
