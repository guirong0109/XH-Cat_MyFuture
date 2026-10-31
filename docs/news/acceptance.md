# Compare futures: AI news — browser acceptance

Spec: `docs/superpowers/specs/2026-10-31-compare-futures-news-design.md` §12. Checked 31 Oct 2026 in the in-app browser
on addresses no other session uses: `http://futures.localhost:3270` (`npm start` with no DeepSeek key, launch entry
`futures-off`) and `http://futures.localhost:3271` (`scripts/news-local.mjs`, a **fake search**, launch entry
`futures-local`). No DeepSeek call was made and nothing was paid.

The fake search gives each field 3 results per run (field 06: 30 results plus one 40 days old and one repeat with a
`utm_source` link); in the second run field 09 fails with `http_503`.

| # | Check | Result |
|---|---|---|
| C1 | For you with a profile study field 0613 (Software) shows the ICT list | Pass: one list, "Information and Communication Technologies (ICTs)" |
| C2 | Headline link, site, date, snippet; at most 25; newest first; none older than 30 days | Pass: 25 items of 32 results; the 40-day-old item and the `utm_source` repeat are gone; links open in a new tab with `rel="noopener noreferrer"` |
| C3 | Source line with query, updated time, next refresh and rules | Pass: "Found by DeepSeek Search for “…” · updated 2026-10-31 21:25 MYT · next refresh about 2026-11-01 00:25 MYT", then the rules line |
| C4 | DeepSeek failing keeps the last list with the note | Pass: Health and welfare shows "Couldn't refresh at … ; showing the list from …" above the run-1 items |
| C5 | No key: news is off, no request to DeepSeek | Pass: "News is off: no DeepSeek key set on this server."; the server log has no `[news]` line; the browser's only news request is `GET /api/news` |
| C6 | No profile data in any news request | Pass: the one request is `GET /api/news` with no query string and no body |
| C7 | No study field: "Add your study field" | Pass: the line with "Edit profile" and "Explore all fields" buttons |

Also checked: Explore all shows the 10-field picker with one list; Bahasa Melayu interface strings show; at 375 px wide
there is no sideways scroll.

## Real run (31 Oct 2026, 21:43 MYT)

With the owner's key in `.env` (git-ignored) and the owner's OK on the cost, launch entry `futures-real`
(`http://futures.localhost:3272`). One refresh, **10 searches** (the store's count), at most US$0.0075; the server was
stopped right after, so no further refresh ran.

| # | Check | Result |
|---|---|---|
| C1 | For you with study field 0613 | Pass: the ICT list, 25 real items (first: "Can AI Make Anyone a Hacker? The Growing Risks of AI-Powered Cybercrime", Open Magazine) |
| C2 | Link, site, date, snippet; ≤ 25; newest first; ≤ 30 days | Pass: all 10 fields `ok` with 25 items each; 21-25 different sites per field; the oldest item in any field was 3.9 days old |
| C3 | Source line | Pass: "Found by DeepSeek Search for “…software computing cybersecurity after:2026-10-01 lang:en” · updated 2026-10-31 21:43 MYT · next refresh about 2026-11-01 00:43 MYT", then the rules |

Seen on real data, for the owner (not failures of the spec's rules):
- **DeepSeek dates are day-level in Malaysia/Beijing time**: every date reads `…T16:00:00+00:00` (= 00:00 UTC+8). So
  today's articles carry a time in the past and are kept; the "future date" concern from the final review is small.
- **Some kept items are not news articles**: an arXiv listing page, a homework-help page, a conference alert, open-access
  book and journal pages. They pass the rules (title, link, date). Filtering them would need a new rule or a
  relevance check, which the owner chose not to use (decision N4).
- **Near-repeats from copy sites**: the same CNBC story appears under a slightly different headline on another site
  ("… | News"), so the repeat rule does not catch it.
