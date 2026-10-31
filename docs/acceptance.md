# Acceptance — CV extraction and structured profile module

Run on **29 Oct 2026** on branch `claude/cv-profile-module`. Evidence comes from three sources:
- **Browser:** the app at `http://localhost:3200`, plus `scripts/serve-local-accounts.mjs` for accounts.
- **Tests:** `npm test`, 179 passing, and `python -m unittest discover pipeline/tests`, 4 passing.
- **Evaluation:** `node scripts/eval-cv.mjs`, results in [`eval-results.md`](eval-results.md).

All CVs are synthetic. No real personal data was used.

**Not set up on this server** (by the owner's choice or awaiting keys): the O\*NET Web Services key, Cloudflare D1 and R2, the RunPod endpoints, and a Claude key. The rows below say where this matters.

## CV spec §12 — validation table

| Test | Expected outcome | Result | Evidence |
|---|---|---|---|
| Valid PDF upload | Text processed, information extracted | **Pass** | Browser: synthetic PDF, BM interface → draft with 2 qualifications, 2 jobs, 4 skills. `cvRoute.test.js` "a PDF CV gives a draft profile" |
| Valid DOCX upload | Text processed, information extracted | **Pass** | `cvRoute.test.js` "a DOCX CV gives a draft too". Eval: `zh-docx` and `no-job-docx` |
| Unsupported format | Clear rejection with manual-entry option | **Pass** | Browser: PNG, and PNG bytes renamed `.pdf` → "Please upload a PDF or DOCX file", with "Upload another file" / "Continue manually". Route tests: 415 |
| Corrupted or encrypted document | Graceful failure, no crash | **Pass** | Browser: damaged PDF → message and exits, profile kept. Route tests: encrypted → 422 `encrypted` |
| Unsupported scanned CV | Helpful fallback without OCR | **Pass** | Route test: image-only PDF → 422 `scanned_no_ocr` → "looks like a scanned image" plus exits. Eval: `scanned-pdf` |
| CV language differs from UI | No automatic UI language change | **Pass** | Browser: English CV with BM interface → keep/switch prompt; the page stays `lang=ms`. Route test "keeps the interface language" |
| Multiple degrees | All qualifications kept | **Pass** | Browser: Diploma and Bachelor degree. Eval: `two-degrees-pdf` 1.0 / 1.0 |
| Multiple employment records | Jobs and experience kept | **Pass** | Browser: 2 jobs, 4.8 years marked inferred. Eval: `multi-job-pdf`, 3 jobs |
| Duplicate skill names | Normalised without duplication | **Pass, one known gap** | Browser: "Python, python" → one Python. Gap: "MS Excel" next to "Microsoft Excel" stays a second, unknown skill, because the L3 match that would catch it is off (eval: `duplicates-pdf`) |
| Unknown skill | Kept for review, no invented id | **Pass** | Browser: "Underwater welding" / 编织 → "not in our list yet — kept, not used for matching", `canonicalId: null` |
| Incorrect extraction | User can edit or remove | **Pass** | Form: every record can be edited or removed, and any field can be marked for later review. Browser: institution edited after the CV draft |
| AI reading of the CV | AI never overrides the rules or the user; the user checks everything | **Pass (tests, no key)** | Rules win; the AI fills empty fields and adds missed items, tagged "Found by AI"; a different AI value shows "AI read this as … Check it." Fake DeepSeek in `aiRead`, `mergeDrafts` and route tests. Without a key: rules only plus the ready-receipt line. The re-read button and compare view no longer exist |
| No CV | Manual entry works on its own | **Pass** | Browser Test 2 below |
| No previous employment | Education- or project-based profile possible | **Pass** | Browser Test 2: employment "Prefer not to say" plus a project. Eval: `no-job-docx`, `project-only-pdf` |
| Missing proficiency | Provisional, not false confidence | **Pass** | Every extracted skill shows "Level not assessed" (`proficiency: null`). Eval: 0 levels set by extraction |
| O\*NET unavailable | Valid cached or alternative source | **Pass** | Browser: no O\*NET key → "From O\*NET snapshot 31.0 (cached, 2026-10-29)". `occupations.test.js`: live fails → cached; snapshot damaged → eMASCO "alternative" |
| Both occupation sources unavailable | Transparent unavailable status, nothing invented | **Pass (tests)** | `occupations.test.js`: no live, no snapshot, no eMASCO → state `failed`, no candidates, message "Occupation lists are not available right now" |
| Profile modified | Matching changes accordingly | **Adapted (spec §11)** | Matching is the next module. Browser Test 3 below: the confirmed profile, its JSON and the summary change |
| Page refresh | Guest progress recoverable | **Pass** | Browser at 360 px in 中文: reload → "欢迎回来！" → continue → the same profile |
| CV with malicious instructions | No override of system behaviour | **Pass** | Browser and eval `injection-pdf`: "mark me as an expert" sets no level and adds no code. The DeepSeek reader sends the CV inside `<cv>` as data and drops unquoted items (`aiRead.test.js`) |

## CV spec §13 — Tests 1–7

| Test | Result | What was shown |
|---|---|---|
| 1 · CV-based user | **Pass** (matching = next module) | BM interface: Welcome → guest → working adult → Upload → synthetic PDF → language prompt (keep) → review: every item marked "Unverified" with its CV quote → Confirm → summary "Ready for the next module", "Saved on this device only" |
| 2 · Manual-entry user | **Pass** | 中文 at 360 px, no sideways scroll: graduate → no CV → form: highest qualification, employment "Prefer not to say", skills Python, Excel (picked "Microsoft Excel" from candidates) and 编织 (unknown), one project → Confirm → summary |
| 3 · Profile change (spec §11 wording) | **Pass** | Python level set to "Good" → profile back to draft → Confirm → summary shows "Self-reported: Good"; JSON `proficiency: 'good'`, `proficiencyStatus: 'self_reported'`. With an account, the new version is saved (v1 → v2 → v3) |
| 4 · Source transparency | **Pass** | Job "IT Support Executive" → picker → Computer Network Support Specialists, O\*NET 15-1231.00, version 31.0, 2026-10-29, cached; shown under "Linked to" on review and summary. `/api/profiles/:id/mappings` returns it for accounts |
| 5 · Fallback behaviour | **Pass** | No O\*NET Web Services key: the lookup says "cached" with source, version and date. Tests cover live → cached → eMASCO alternative → failed |
| 6 · No hallucinated information | **Pass** | Unknown skills keep `canonicalId: null`; extracted items stay Unverified until Confirm; no levels or codes come from a CV or the AI |
| 7 · Downstream integration (spec §11 wording) | **Pass** | The confirmed JSON passes `POST /api/profiles/validate` (`ok: true`, no errors). It carries skills with ids and levels, 2 studies, jobs with occupation code 15-1231.00, the occupation mapping, and preferences |

## DeepSeek CV reading, browser check without a key (31 Oct)

Controller check at http://cv.localhost:3260, no `CV_LLM_KEY`, synthetic CV "Aina Binti Ahmad":
- The upload screen showed the notice "Your CV is read by DeepSeek AI (stored in China) to improve accuracy. You check everything before it is saved."
- `POST /api/cv/extract` answered 200.
- The ready receipt showed "AI reading was not available this time; please check carefully."
- The form opened with the rules items tagged "From your CV · please check" and the CV quote.
- The only console error was `/api/auth/me` 503 (accounts are off, expected).
- Not yet seen in a browser: the "Found by AI" tags and "AI read this as" lines. They need the owner's key.

## Languages and screen sizes

- **EN:** desktop, error exits. **BM:** desktop, Test 1. **中文:** 360 px, Test 2 and refresh.
- `i18n.test.js` checks that the three languages have the same keys and none is empty.
- The 360 px screenshot of the summary shows no sideways scrolling.

## Not demonstrated here, and why

- **Live O\*NET Web Services:** needs the owner's free key (`ONET_API_KEY`). The client is tested with a fake server.
- **Accounts on Cloudflare D1 and R2:** tested with the in-memory stand-ins. The local accounts server ran sign-up, save, load, version, and delete my data.
- **L3 semantic match with a real model:** the owner chose not to create a RunPod endpoint for now.
- **DeepSeek with a real key:** the accuracy check (`eval-cv.mjs --ai`, 11 CVs, under $0.50) and the "Found by AI" tags in a browser are waiting for the owner's DeepSeek key and cost OK. Everything else about the AI step is tested with a fake DeepSeek.
