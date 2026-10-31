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

With no settings at all, guests can use everything. Occupation lookups use the bundled O\*NET 31.0 snapshot, marked "cached". Accounts say "not available on this server". The AI reading of CVs is off and the upload says "AI reading was not available this time".

To try accounts without Cloudflare (development only, data in memory):

```bash
node scripts/serve-local-accounts.mjs   # http://localhost:3100 (PORT to change)
```

## Settings (`.env.example` lists them all)

| Setting | What it turns on |
|---|---|
| `ONET_API_KEY` | Live O\*NET Web Services search (free key from https://services.onetcenter.org). Without it the lookup answers from the snapshot |
| `D1_ACCOUNT_ID`, `D1_DATABASE_ID`, `D1_TOKEN` | Accounts and saved profiles in Cloudflare D1 |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Durable Radar state in Cloudflare R2 (see the Radar section). The CV flow does not use R2 |
| `SEMANTIC_URL`, `SEMANTIC_KEY`, `SEMANTIC_MODEL`, `SEMANTIC_CUTOFF` | L3 semantic match (RunPod embedding endpoint, cutoff from Model Eval) |
| `CV_LLM_KEY` | Turns on DeepSeek AI reading of every CV, next to the rules reader. The CV text goes to DeepSeek (servers in China). Without it: rules only |
| `CV_LLM_URL`, `CV_LLM_MODEL` | DeepSeek address (default `https://api.deepseek.com/chat/completions`) and model (default `deepseek-flash`) |
| `CV_MAX_MB` | Upload limit (default 10) |
| `TRUST_PROXY` | Behind a reverse proxy: number of proxy hops, so the sign-in and AI reading limits count each visitor, not the proxy |

## Future Skills Radar (branch `claude/future-radar`)

Two tabs at `#radar` — Skills & Careers and AI Impact — built from OpenAlex research counts and DOSM Job Market
Insights, linked to the user's own confirmed profile. No scores or rankings. Spec:
`docs/superpowers/specs/2026-10-30-future-radar-round1-design.md`; acceptance: `docs/radar/acceptance.md`;
deployment notes: `docs/radar/deploy.md`; contract for Matching: `docs/radar/contract.md`.

```bash
npm start                                   # #radar serves the bundled data in data/radar/bundle/ (read-only)
npm test                                    # all tests, Radar included (568)
python -m unittest discover pipeline/tests  # Python pipeline tests, Radar bridge included (11)
node scripts/radar-bootstrap.mjs            # rebuild the bundle: OpenAlex fetched live (no key), DOSM from the kept workbook
python pipeline/fetch_radar_bridge.py       # rebuild the O*NET -> MASCO major group bridge from the kept files
```

| Setting | What it turns on |
|---|---|
| `RADAR_ADMIN_KEY`, `RADAR_DEMO_KEY`, `RADAR_SESSION_SECRET` | `#admin` (reviews, refresh, status) and `#judge` (Trend Change Test). The two keys must differ; the secret needs 32+ bytes |
| `R2_*` (above) | Durable Radar state under `prod/` and judge sessions under `demo/`; without R2 the Radar is read-only |
| `OPENALEX_API_KEY` | Admin refresh of OpenAlex on a deployed server (`NODE_ENV=production`) |
| `RADAR_STORE=memory` | Local development only: admin and judge writes kept in memory, lost on restart; refused in production |

## Career matching (branch `claude/career-matching`)

Two tabs, `#match` and `#sdg`. Percentages and the chart appear only once the two BLS files are saved (see the end of
this section). From a confirmed profile it lists Malaysian eMASCO roles and shows, for each one:
- **Skill Match**: the levels you meet divided by the levels the job needs (O\*NET skills and knowledge), with a
  sentence, a You-versus-Needed chart and "What would raise it". It is never changed by trends or AI.
- **Outlook**, kept apart from the percentage: job-ad trend of the role's group (DOSM, group level only), AI in two
  scenarios (Moderate: observed use, Anthropic Economic Index; Rapid: potential, ILO WP140), in-demand software.
- **Four bands** per scenario, and **SDG links** (team draft, shown only after the owner approves each link in `#admin`).

The two routes from a role to O\*NET jobs and from a profile to roles:
1. **Official code chain**: eMASCO, ISCO-08, SOC 2010, SOC 2018, O\*NET. No word matching, no model, no guess; a broken
   chain says which step is missing.
2. **Your field**: ISCED-F field of study, CIP, O\*NET, shown first as "In your field".

Data comes from eMASCO, O\*NET 31.0, ILO WP140, the Anthropic Economic Index, DOSM (through the Radar) and the UN SDG
API; every file, date and licence is in `data/SOURCES.md`. The profile sent to `/api/matching` is never stored or logged.

**What waits on the owner:** the two BLS crosswalk files (until saved in `data/radar/source/`, Skill Match, the chain,
Rapid AI and "In your field" say "not available yet"), approval of the SDG links, the review of the DOSM 2025 Q3 break,
and the BM / 中文 wording review. Spec: `docs/superpowers/specs/2026-10-30-career-matching-design.md`; diagram:
`docs/architecture-matching.html`; browser check: `docs/matching/acceptance.md`.

## Setting up the outside services (owner)

1. **Cloudflare D1:**
   1. Create a database.
   2. Make an API token with D1 edit rights and set the three `D1_*` settings.
   3. Create the tables once, by running the statements in `server/store/migrations.sql` in the D1 console. Or from Node:
      ```bash
      node --env-file-if-exists=.env -e "import('./server/store/d1.js').then(m => m.createD1FromEnv().migrate())"
      ```
      The Node command reads the `D1_*` settings from `.env`.
2. **Cloudflare R2 (for the Radar):**
   1. Create a bucket and an R2 API token (access key id and secret), then set the four `R2_*` settings.
   2. The Radar keeps its state under `prod/` and `demo/`. The CV flow no longer stores anything in R2 (31 Oct).
3. **O\*NET Web Services:** register for a free key and set `ONET_API_KEY`.
4. **DeepSeek (paid per use, about $0.0003 per CV):** create an API key at DeepSeek and set `CV_LLM_KEY` in `.env`.
5. **RunPod (optional, billed per second while running):**
   1. Create a serverless endpoint for the embedding model (`BAAI/bge-m3`) behind the OpenAI-compatible route, then set the `SEMANTIC_*` settings.
   2. For L3, run `node scripts/model-eval.mjs` and set `SEMANTIC_CUTOFF` to the cutoff it writes into `docs/model-eval.md`.
4. **DeepSeek (optional, paid per use, about $0.004 per CV at peak price):** make an API key at https://platform.deepseek.com and set `CV_LLM_KEY`. Compare rules-only with rules + AI on the 11 synthetic CVs: `node --env-file-if-exists=.env scripts/eval-cv.mjs --ai`.

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
server/        Express app: cv/ (file checks, reading, language, extraction, L3, DeepSeek reader and merge), skills/, occupations/,
               store/ (D1; R2 code stays, the CV flow no longer uses it), routes/, auth.js
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
