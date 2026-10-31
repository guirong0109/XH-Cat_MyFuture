# Compare Futures: AI News — Design

Date: 2026-10-31 · Branch `claude/compare-futures` (from `claude/career-matching` at `d82267e`) · Status: approved in
brainstorming (owner, 31 Oct), waiting for written-spec review.

Architecture diagram: `docs/architecture-compare-futures.html` (owner approves it; it then binds the build).

## 1. Goal and success

In the **Compare futures** section (`#futures`, journey step 6), a user sees the latest news about AI in study fields:

- **For you**: news for the user's own study field(s), taken from their profile;
- **Explore all**: news for any of the 10 broad study fields.

Each list holds at most 25 usable news items, newest first, refreshed automatically every 3 hours. Every item links to
the original article and shows its site and publish date; every list says where it came from, when it was searched,
when the next refresh is due and which rules kept it.

Success: the owner opens `#futures` and sees real, dated, linked AI news per field; a failed refresh keeps the last
good list and says so; nothing is invented; no profile data leaves the browser; the monthly cost stays near the stated
price.

## 2. Decisions (owner, 31 Oct)

| # | Topic | Decision |
|---|---|---|
| N1 | Search service | **DeepSeek Search API** (`POST https://api.deepseek.com/v1/tools/search`), US$0.75 per 1,000 successful searches; failed, empty and timed-out searches are not charged. Paid billing starts 1 Nov 2026, 00:00 Beijing time. No DeepSeek chat model is used |
| N2 | Fields | The **10 broad ISCED-F 2013 study fields** the app already uses (codes 01–10). Codes 00 (generic) and 99 (unknown) have no news list |
| N3 | For you | The broad field(s) of the study fields in the user's profile (`education.records[].field.code`, first 2 digits). Picked in the browser; the server never sees the profile |
| N4 | Usable result | Rule checks only (section 5). No relevance check by a model |
| N5 | Size | At most **25** usable items per field |
| N6 | Refresh | Automatic, **every 3 hours**, one search per field (10 searches per run) |
| N7 | Language | English news only in this version |
| N8 | Scope | AI news only. The Moderate vs Rapid scenario table in the old mockups is **not** part of this spec |

## 3. Cost

One run = 10 searches. 8 runs a day = 80 searches a day, about 2,400 a month = **about US$1.80 a month** at
US$0.75 per 1,000. The code refuses to run more than 10 searches per run and more than 80 per 24 hours, so a timer
fault cannot raise the bill. The owner supplies the DeepSeek key and gives the OK before the first real search; tests
never call DeepSeek.

## 4. Data

| File | Content | Source |
|---|---|---|
| `data/news/fields.json` (new) | The 10 fields: `code`, `title` (ISCED-F 2013 broad title, as in `data/isced/fields.tsv`), `words` (the search words for the field) | ISCED-F 2013 titles (UNESCO UIS, via `data/isced/`); search words written by the team, owner may change them without code changes |
| News store (new, not in git) | The kept lists per field (section 6) | DeepSeek Search results |

Search words per field (team draft; each query must stay within DeepSeek's 128-character limit):

| Code | Field | Words |
|---|---|---|
| 01 | Education | education teaching schools |
| 02 | Arts and humanities | arts humanities design media |
| 03 | Social sciences, journalism and information | social sciences journalism |
| 04 | Business, administration and law | business finance law |
| 05 | Natural sciences, mathematics and statistics | science mathematics statistics |
| 06 | Information and Communication Technologies (ICTs) | software computing cybersecurity |
| 07 | Engineering, manufacturing and construction | engineering manufacturing construction |
| 08 | Agriculture, forestry, fisheries and veterinary | agriculture fisheries veterinary |
| 09 | Health and welfare | healthcare medicine welfare |
| 10 | Services | services tourism hospitality transport |

`data/SOURCES.md` gets an entry for DeepSeek Search (where from, date, and that DeepSeek's Search pages state no rule
on storing or showing results; if that ever matters, ask the owner) and for `fields.json`. `fields.json` gets a
manifest hash like the other data files.

## 5. The search and the rules

**Query** per field: `"artificial intelligence" <words> after:<date 30 days ago, YYYY-MM-DD> lang:en`, with
`count: 50` (the price does not depend on the count) and `need_content: false`.

**A result is usable** only if all hold:

1. it has a non-empty `title`;
2. its `url` is an `http` or `https` address with a host;
3. its `date` is present, not in the future, and no more than 30 days before the run.

**Repeats** are dropped: two items are the same if their addresses match (lower-case host, path without a trailing
slash, `utm_*` parameters removed) or their headlines match (lower case, spaces and punctuation collapsed). The earlier
kept item wins.

**Each run** adds the new usable results to the field's kept list, applies the rules again to the whole list (so items
older than 30 days drop off), sorts newest first (ties by address, A to Z) and keeps the first 25.

**Kept per item**: `title`, `url`, `site` (`site_name`, else the address's host), `date`, `snippet` (DeepSeek's short
text meant for display), `foundAt` (time of the run that found it). Not kept: the long `summary`, page `content`,
`site_icon` and DeepSeek's quality numbers.

## 6. Refresh, store and failures

- **Timer**: the server process plans the next run 3 hours after the last run started. On start-up, if the last run
  is more than 3 hours old (or there is none), it runs at once. If the host slept, the first `/api/news` request
  after the due time starts a run in the background and is answered at once with the kept lists. Only one run at a
  time.
- **Store**: the R2 store when the R2 settings are present (object `news/latest.json`), else the local file
  `data/cache/news/latest.json` (ignored by git). Written whole after each run.
- **Per field record**: `code`, `query` (the exact words searched), `items`, `searchedAt` (last run that answered),
  `lastAttemptAt`, `lastOutcome` (`ok`, `no_results`, `failed`), `lastError` (the code only).
- **Fields are independent**: one field failing does not stop the others.
- **Retry**: once, after 30 seconds, for network errors, timeouts, 408, 429 and 5xx. No retry for other 4xx.
- **401 / 402** (bad key / no credit): the run stops, the server log says `[news] deepseek 401` or `402` (code only,
  never the key), and the screens keep the last lists.
- **No key** (`DEEPSEEK_API_KEY` not set): no timer, no searches; the screen says "News is off: no DeepSeek key set
  on this server."
- **Logs** hold time, field code, outcome and error code only.

## 7. API

`GET /api/news` → no input, no user data:

```json
{
  "enabled": true,
  "source": "DeepSeek Search",
  "refreshEveryHours": 3,
  "nextRunAt": "2026-10-31T15:00:00Z",
  "rules": { "maxItems": 25, "maxAgeDays": 30, "language": "en" },
  "fields": [
    { "code": "06", "title": "Information and Communication Technologies (ICTs)", "query": "...",
      "searchedAt": "...", "lastAttemptAt": "...", "lastOutcome": "ok", "items": [ { "title": "...", "url": "...",
      "site": "...", "date": "...", "snippet": "...", "foundAt": "..." } ] }
  ]
}
```

All 10 lists are sent at once (at most 250 items); the browser chooses what to show.

## 8. Screen (`#futures`)

Replaces the "next module" placeholder of `#futures` with **Compare futures → AI news**, two tabs:

- **For you**: one list per broad field found in the profile (in profile order, each once). No study field, or only
  code 00/99: "Add your study field in your profile to see news for you", with a link to the profile and to Explore
  all.
- **Explore all**: a picker with the 10 fields (the user's own fields marked "your field"); one list at a time.

**Each list** has a source line: "Found by DeepSeek Search for “<query>” · updated <date, time> · next refresh about
<time> · kept: title, link and publish date in the last 30 days; repeats removed; newest 25." Then the items: headline
(link to the original, opens in a new tab, `rel="noopener noreferrer"`), site, publish date, snippet.

**States**: last refresh failed → "Couldn't refresh at <time>; showing the list from <time>." No usable results yet →
"No news found yet for this field." News off → the no-key line. Loading failed → "News couldn't load. Try again."
with a retry button.

All text from DeepSeek is shown as plain text (escaped), never as HTML. Interface strings come in English, BM and 中文;
BM and 中文 are marked "translation: owner review". The news itself stays in English (N7).

## 9. Boundaries

- The news never changes the Skill Match, the Overall match, the bands, the Radar or the SDG parts. It is reading only.
- No profile data is sent to the server or to DeepSeek. The 10 searches use fixed words.
- The DeepSeek key lives only in the server's secret settings; never in the repo, the browser, URLs or logs.
- No DeepSeek chat model; no summary is written by a model.
- Nothing beyond this spec and the approved diagram.

## 10. Code

| What | Where |
|---|---|
| Query building, usable rules, repeats, merge, For-you fields (pure, shared) | `shared/news/` |
| DeepSeek Search client | `server/news/deepseek.js` |
| Refresh timer, caps, store | `server/news/service.js` |
| `GET /api/news` | `server/news/routes.js`, wired in `server/app.js` |
| Screen | `public/js/screens/futures.js`, `public/js/app.js` route, strings in `shared/strings/{en,ms,zh}.js` |
| Tests | `tests/news/` |
| Browser results | `docs/news/acceptance.md` |

## 11. Testing

Vitest, test first, with a fake DeepSeek reply (no real search):

- query text per field, within 128 characters, with the right `after:` date;
- each usable rule (no title, bad address, no date, future date, older than 30 days);
- repeats by address and by headline; merge with the kept list; newest first; cap 25;
- For you: profile codes → broad fields, each once, 00/99 ignored, no field → empty;
- timer: runs at start when overdue, not before 3 hours, one run at a time, wake-up run on a late request;
- caps: never more than 10 searches per run or 80 per 24 hours;
- failures: retry once on 429/5xx/timeout, none on 400; 401/402 stop the run; one field failing leaves others; the last
  list is kept and marked;
- no key: `enabled: false`, no fetch made; the key never appears in logs or the reply;
- the reply holds no user data; DeepSeek text is escaped on screen.

Browser check on `127.0.0.2:3200` with the local store (and, after the owner's OK and key, one real run), recorded in
`docs/news/acceptance.md`. `npm test` before every commit.

## 12. Acceptance

| # | Check |
|---|---|
| C1 | `#futures` shows For you and Explore all; a profile with an ICT field shows the ICT list under For you |
| C2 | Every item shows headline link, site, date and snippet; at most 25 per field; newest first; none older than 30 days |
| C3 | Every list shows the source line with query, updated time, next refresh and the rules |
| C4 | With DeepSeek failing, the last list stays with the "Couldn't refresh" note |
| C5 | With no key, the screen says news is off and no request goes to DeepSeek |
| C6 | No profile data in any request to `/api/news` or DeepSeek |
| C7 | A profile with no study field sees the "Add your study field" line |
