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

**Real run: waits on the owner** (DeepSeek key `DEEPSEEK_API_KEY` and the OK on about US$1.80 a month).
