# FutureReady MY: live demo sheet for judges

Team XH-Cat · SDC Hackathon 2026 · Domain 1 (Future-Ready Workforce) · Final pitch 1 Nov 2026

## Live link

**https://futures.grong.my**

- Hosted on the team's own computer through a Cloudflare Tunnel (free on Cloudflare's side).
- If the link shows a certificate error, see "If the link does not open" below.

## How to start (guest, no sign-up)

1. Open the link. Press **Get started**.
2. **Who is it for?** → **For myself**.
3. **How would you like to continue?** → **Continue as guest** ("No sign-up. Saved in this browser only. Your CV
   file is never kept here.").
4. **What is your goal?** → pick one, e.g. **Find a direction**.
5. **Do you have a CV or resume that you would like to upload?** → **Upload my CV** (or **I do not have a CV —
   continue manually** for the form).
6. Check the five profile parts (Education, Employment Background, Skills and Proficiency, Using AI, Interests),
   press **Review and confirm**, then **Confirm my profile**.
7. The top tabs then open **Future Skills Radar**, **Career matching** and **Study pathway**.

Nothing is pre-filled. Every result is worked out from the profile you confirm.

## Demo CV

`Demo_CV_Aina_synthetic.docx` (in this folder). Aina Binti Ahmad is a made-up person:

- Diploma in Information Technology, Politeknik Ungku Omar, 2021
- IT Support Executive, Acme Sdn Bhd, Jan 2022 to now
- Skills: Python, Excel, Critical Thinking, Customer service, Troubleshooting

You may also upload your own made-up CV (PDF or DOCX, up to 10 MB). Please do not upload a real person's CV: the
live site sends the CV text to DeepSeek AI (the upload screen says "Your CV is read by DeepSeek AI (stored in China)").

## Test account (optional)

- Guests can use every personal screen. An account only keeps the profile on other devices.
- If you want to try **Create an account**, use a made-up email (e.g. `judge1@example.com`) and a password you use
  nowhere else. Do not use a real password.
- The organisation view (**For my organisation**) needs an account.

## When the trend data change

The trend data are official datasets, each with its source and date (on screen and in `data/SOURCES.md`): DOSM Job Market Insights 2026 Q2 (job
ads by occupation group), OpenAlex (AI research), the Anthropic Economic Index and ILO Working Paper 140 (AI in jobs),
O\*NET and eMASCO. The Python scripts in `pipeline/` rebuild the data files from the official sources; the DOSM
workbook is kept unchanged and read by `server/radar/dosmTable.js`. The AI news refreshes every 3 hours.

When a trend changes (for example a new DOSM quarter), the rule on screen gives the new trend and roles move between
the four groups in **Career matching**. The Skill Match never changes because of a trend.

See it yourself: in **Career matching**, switch **AI scenario** from **Moderate AI** to **Rapid AI**. The AI signal
changes, a banner says how many roles moved between groups, and ends with "Skill Match numbers did not change."

## What is real and what is synthetic

| Item | Real or synthetic | Source |
|---|---|---|
| Demo CV (Aina) | Synthetic | this folder |
| Roles (1,812 Malaysian roles) | Real | eMASCO (MOHR), crawled 2026-10-23 |
| Needed skill levels | Real | O\*NET 31.0 (US Dept of Labor, CC BY 4.0) |
| AI scenarios | Real research data, shown as **ESTIMATE** | Moderate: Anthropic Economic Index (release 2026-06-26). Rapid: ILO Working Paper 140 (2025) |
| Job-ad trends | Real | DOSM Job Market Insights 2026 Q2 |
| Research trends | Real | OpenAlex, fetched 2026-10-30 |
| Courses and programmes | Real pages, checked 2026-10-31 | team picks in `data/pathway/picks.json` |
| SDG links | Team drafts, labelled "team draft, not yet reviewed" | UN SDG API |
| AI news | Real, live | DeepSeek Search, refreshed every 3 hours |

Every data file, date and licence: `data/SOURCES.md`.

## If the link does not open

- **Certificate error on campus Wi-Fi:** the campus DNS may still point `futures.grong.my` to the old host. Use a
  phone hotspot, or set the laptop's DNS to `8.8.8.8`.
- **Run it on your own computer** (Node.js 22.12 or later):
  ```bash
  git clone https://github.com/guirong0109/XH-Cat_MyFuture.git
  cd XH-Cat_MyFuture
  npm install
  npm start            # then open http://localhost:3200
  ```
  No settings are needed. Without keys: the CV is read by rules only (no AI), the AI news says
  "News is off: no DeepSeek key set on this server.". Everything else works the same.
