# Pre-flight checklist (morning of 1 Nov 2026)

Do this at least 45 minutes before the pitch. Tick each line.

## 1. Start the live site (owner's PC)

- [ ] PC on mains power; sleep and screen-off set to **Never** (the link and the 3-hour news refresh stop if it sleeps).
- [ ] Start the server: in the Claude app, launch entry **`main-live`** (port 3300). Or in PowerShell:
  ```powershell
  $env:PORT="3300"; $env:TRUST_PROXY="1"; $env:ACCOUNTS_DB="local"
  node --env-file-if-exists=C:/Users/guiro/XH_Cat_Final-live/.env --env-file-if-exists=C:/Users/guiro/XH_Cat_Final-main/.env --env-file-if-exists=C:/Users/guiro/XH_Cat_Final/.env C:/Users/guiro/XH_Cat_Final-live/server/index.js
  ```
- [ ] Run only **one** server with the DeepSeek key (`main-live` **or** `futures-real`, never both), or the news is
  refreshed and paid twice.
- [ ] Start the tunnel in its own terminal tab:
  ```powershell
  cloudflared tunnel --config C:\Users\guiro\.cloudflared\compare-futures.yml run compare-futures
  ```
- [ ] `http://localhost:3300` opens on the PC.
- [ ] Stop: Ctrl-C in the tunnel tab (the link then shows a Cloudflare error; nothing else changes).

## 2. DNS and network check (on the demo laptop, on the venue Wi-Fi)

- [ ] `nslookup futures.grong.my` → should give Cloudflare addresses. If it gives **103.7.9.22**, the network's DNS
  is stale (seen on campus DNS 10.242.3.200) and the browser shows a certificate error.
- [ ] `nslookup futures.grong.my 8.8.8.8` → Cloudflare addresses (this works).
- [ ] If stale: (a) use a phone hotspot, or (b) owner sets the laptop's DNS to `8.8.8.8` (then `ipconfig /flushdns`),
  or (c) use the local fallback (section 5).

## 3. Incognito test on https://futures.grong.my (5 minutes, synthetic CV only)

- [ ] Landing page loads with no certificate warning.
- [ ] **Get started → For myself → Continue as guest → Find a direction → Upload my CV** → `Demo_CV_Aina_synthetic.docx`.
  The receipt shows **READY FOR REVIEW**. Note whether "AI reading was not available this time" appears (if so, AI
  CV reading is off or failed; the demo still works on the rules draft).
- [ ] **Edit in the form** → … → **Review and confirm →** → **Confirm my profile**.
- [ ] **CAREER MATCHING** shows roles with Skill Match; **Rapid AI** shows the "Switching to Rapid AI moved …" banner.
- [ ] **STUDY PATHWAY** after **Plan my study pathway** → **Plan study pathway (1 role) →** shows Part 1 and Part 2.
- [ ] **FUTURE SKILLS RADAR** → **AI news by field** shows items and the next refresh time (not "News is off").
- [ ] Close the incognito window (clears the guest data).

## 4. Prepare the demo windows (see `demo-script.md`)

- [ ] **Window 1:** fresh incognito on the landing page (nothing built).
- [ ] **Window 2 (backup):** Aina's profile already confirmed, on **Career matching**.
- [ ] In any reused normal window, press **Reset** in the top bar ("Clear what this browser saved") before the demo.
- [ ] Browser zoom 110-125% so the back row can read; dark mode off (light is the default).
- [ ] Demo CV file on the desktop.

## 5. Local fallback (no internet needed after install)

- [ ] On the owner's PC, in a terminal:
  ```bash
  cd C:/Users/guiro/XH_Cat_Final-main
  npm start            # http://localhost:3200
  ```
  `npm start` has no DeepSeek key: CV reading is rules only and the AI news says "News is off". Nothing paid is called.
- [ ] Open http://localhost:3200 and run the same flow once.
- [ ] Do not run it on port 3300 at the same time as `main-live`.

## 6. Hardware

- [ ] HDMI / USB-C display adapter, and a spare.
- [ ] Laptop charger; phone charged (for the hotspot).
- [ ] Display mirrored (not extended); notifications off (Focus mode); close chat apps.
- [ ] Mouse (easier drag-and-drop of the CV).

## 7. Last 5 minutes

- [ ] Window 1 on the landing page, Window 2 (backup) ready on **Career matching**.
- [ ] Timer visible to Presenter A (10:00 hard stop; −1 point per 30 s over).
- [ ] Both presenters know who answers which Q&A topic (`qa-prep.md`).
