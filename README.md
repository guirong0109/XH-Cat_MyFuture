# FutureReady MY — CV extraction and structured profile module

A user with or without a CV ends with a **confirmed, structured profile**. It holds studies, jobs, skills with O\*NET ids, levels or an explicit "not assessed", certificates and projects, preferences, and occupation links with their source. The next module (matching) uses that profile.

- **Case A:** upload a CV.
- **Case B:** fill in the form by hand.
- **Case C:** review and confirm.

The interface works in English, Bahasa Melayu and 中文.

- Design: `docs/superpowers/specs/2026-10-29-cv-profile-module-design.md`
- Plan: `docs/superpowers/plans/2026-10-29-cv-profile-module.md`
- Build record: `docs/build-record.html`
- Acceptance: `docs/acceptance.md`
- Evaluation: `docs/eval-results.md`
- Tools: `docs/tools-declaration.md`
- Data sources: `data/SOURCES.md`

## Run

Needs Node.js 22.12 or later.

```bash
npm install
npm start            # http://localhost:3200; reads .env if present (copy .env.example)
npm test             # Vitest
```

With no settings at all, guests can use everything. Occupation lookups use the bundled O\*NET 31.0 snapshot, marked "cached". Accounts say "not available on this server". The AI re-read says "not configured".

To try accounts without Cloudflare (development only, data in memory):

```bash
node scripts/serve-local-accounts.mjs   # http://localhost:3100 (PORT to change)
```

## Settings (`.env.example` lists them all)

| Setting | What it turns on |
|---|---|
| `ONET_API_KEY` | Live O\*NET Web Services search (free key from https://services.onetcenter.org). Without it the lookup answers from the snapshot |
| `D1_ACCOUNT_ID`, `D1_DATABASE_ID`, `D1_TOKEN` | Accounts and saved profiles in Cloudflare D1 |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Temporary CV copy in Cloudflare R2. The AI re-read needs it |
| `SEMANTIC_URL`, `SEMANTIC_KEY`, `SEMANTIC_MODEL`, `SEMANTIC_CUTOFF` | L3 semantic match (RunPod embedding endpoint, cutoff from Model Eval) |
| `CV_LLM_URL`, `CV_LLM_KEY`, `CV_LLM_MODEL` | AI re-read, first provider (RunPod chat endpoint) |
| `CV_LLM_BACKUP_KEY`, `CV_LLM_BACKUP_MODEL` | AI re-read, backup provider (Claude API, default model `claude-opus-5-5`) |
| `CV_MAX_MB` | Upload limit (default 10) |
| `TRUST_PROXY` | Behind a reverse proxy: number of proxy hops, so the sign-in and AI re-read limits count each visitor, not the proxy |

## Setting up the outside services (owner)

1. **Cloudflare D1:**
   1. Create a database.
   2. Make an API token with D1 edit rights and set the three `D1_*` settings.
   3. Create the tables once, by running the statements in `server/store/migrations.sql` in the D1 console. Or from Node:
      ```bash
      node --env-file-if-exists=.env -e "import('./server/store/d1.js').then(m => m.createD1FromEnv().migrate())"
      ```
      The Node command reads the `D1_*` settings from `.env`.
2. **Cloudflare R2:**
   1. Create a bucket and an R2 API token (access key id and secret), then set the four `R2_*` settings.
   2. Add a lifecycle rule on the bucket that deletes objects under `cv-temp/` after 1 day.
3. **O\*NET Web Services:** register for a free key and set `ONET_API_KEY`.
4. **RunPod (optional, billed per second while running):**
   1. Create serverless endpoints for the embedding model (`BAAI/bge-m3`) and/or a chat model behind the OpenAI-compatible routes, then set the matching settings.
   2. For L3, run `node scripts/model-eval.mjs` and set `SEMANTIC_CUTOFF` to the cutoff it writes into `docs/model-eval.md`.
5. **Claude API (optional):** set `CV_LLM_BACKUP_KEY`.

## Refresh the O\*NET data

```bash
python pipeline/fetch_onet.py 31.0     # or a newer release number
python pipeline/fetch_isced.py         # field-of-study list (ISCED-F 2013) and its CIP bridge to O*NET
python -m unittest discover pipeline/tests
```

This writes `data/onet/*.tsv` and `data/onet/manifest.json`, with the version, URL, date and SHA-256 of each file. The server refuses a snapshot whose files do not match the manifest.

## Measure

```bash
node scripts/eval-cv.mjs       # extraction precision / recall / latency → docs/eval-results.md
node scripts/model-eval.mjs    # L3 cutoff on the RunPod embedding model → docs/model-eval.md (needs SEMANTIC_*)
```

## Layout

```
public/        browser screens (ES modules, no build step), from docs/mockup-journey.html
shared/        profile schema, profile state helpers, strings (en / ms / zh); used by browser, server and tests
server/        Express app: cv/ (file checks, reading, language, extraction, L3, AI re-read), skills/, occupations/,
               store/ (D1, R2), routes/, auth.js
data/          O*NET 31.0 snapshot and eMASCO titles (see data/SOURCES.md)
pipeline/      O*NET download script (Python)
scripts/       evaluation scripts, local accounts server
testing/       synthetic CVs and labelled terms
tests/         Vitest tests (helpers build synthetic PDF and DOCX files)
```

Privacy:
- CV text is never logged.
- The raw file is kept only as a temporary R2 copy, when R2 is set up.
- Guests keep a minimised profile in their browser, without CV quotes.
- "Delete my data" removes the account, its profiles and any temporary CV.
