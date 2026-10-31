

---

# FutureReady MY

> Helps Malaysian students and young workers turn their CV or profile into explainable career matches, a view of how
> AI is changing those jobs, and a study pathway of official courses, with the source of every number on screen.

---

## Team Information

| Field                  | Details                                     |
| ---------------------- | ------------------------------------------- |
| **Team Name**          | XH-Cat                                      |
| **Team Domain**        | Domain 1 (Future-Ready Workforce)           |
| **SDG Track (1–17)**   | SDG 8 — Decent Work and Economic Growth; SDG 4 — Quality Education |
| **Team Leader**        | Yip Gui Rong                                |
| **University**         | Multimedia University                       |
| **Number of Members**  | 2                                           |

## Links

| Resource                      | Link                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| GitHub Repository (final)     | https://github.com/guirong0109/XH-Cat_MyFuture             |
| GitHub Repository (preliminary round) | https://github.com/guirong0109/XH-Cat_Domain1      |
| Live Demo                     | https://futures.grong.my                                   |
| RunPod Endpoint               | None in the final build (see "How We Use RunPod")          |
| Slide Deck                    | To add                                                     |
| Demo Video                    | To add                                                     |

---

## Overview

### Problem

Malaysian students and young workers choosing a course or a first job cannot easily see which jobs fit the skills
they have, what is missing, or how AI is changing that work. The facts exist (the eMASCO occupation standard,
accredited programmes, DOSM job-ad data, AI-exposure research) but they are scattered and hard to turn into a
personal plan. Youth unemployment was 10.2% in June 2026 (OpenDOSM).

### Solution

FutureReady reads a CV (or a short form), lets the user confirm a structured skills profile, and matches it against
1,812 eMASCO roles through the official eMASCO → ISCO-08 → SOC → O\*NET code chain. The match is plain arithmetic on
official O\*NET skill levels ("you meet 9.2 of 12.05 needed levels, 76%"), so every result can be explained. AI is
used only where it helps and is always checked: DeepSeek reads CVs (each AI item must quote the CV word for word and
the user confirms it) and DeepSeek Search finds AI news per study field. Matching itself uses no language model.

### Key Features

- **CV and structured profile** — upload a PDF/DOCX CV or fill in a form; a rules reader plus DeepSeek fill the
  profile and the user confirms every item. English, Bahasa Melayu and 中文.
- **Future Skills Radar** — research and job-ad trends (OpenAlex, DOSM) linked to your own skills, plus AI news
  for 10 study fields refreshed every 3 hours (For you / Explore all).
- **Career matching** — Skill Match, AI touch and Overall match for each role, sorted into bands; tick several roles
  and plan a pathway for them at once.
- **Study pathway** — every missing O\*NET skill gets an exact, checked course page, plus accredited Malaysian
  programmes for 99 of 124 fields of study.
- **Organisation view** — career centres and HR teams see a group's skill gaps and plan target roles.
- **Sources on screen** — every list, number and suggestion shows where it came from (`data/SOURCES.md`).

### Tech Stack

| Layer         | Technology                   |
| ------------- | ---------------------------- |
| Frontend      | Plain JavaScript ES modules (no build step), three.js landing intro, pdf.js |
| Backend       | Node.js 22.12+ (runs on 24), Express 5 |
| Database      | SQLite through Node's built-in `node:sqlite` (Cloudflare D1 supported); news in a JSON file |
| AI            | DeepSeek `deepseek-flash` (CV reading, news relevance check), DeepSeek Search (news) |
| Data pipeline | Python 3 (standard library only)  |
| Hosting       | The team's computer, published through a Cloudflare Tunnel (free) at futures.grong.my |

---

## Project Structure

```
.
├── data/                    # Bundled official data with SHA-256 manifests (sources: data/SOURCES.md)
├── docs/                    # Specs, plans, architecture diagrams, acceptance checks, build record
│   └── project-details.md   # Full module notes, settings and setup (the earlier README)
├── pipeline/                # Python scripts that rebuild the data (+ pipeline/tests)
├── public/                  # Browser app: screens in public/js/screens/
├── scripts/                 # Evaluation and local helper scripts
├── server/                  # Express API: cv/, matching/, pathway/, radar/, news/, org/, store/, routes/
├── shared/                  # Logic used by both browser and server: matching/, radar/, pathway/, news/
├── submission/              # Required submission documents
│   ├── SDC2026_XH-Cat_Preliminary.pdf      # Preliminary submission (Phase 1)
│   ├── SDC2026_XH-Cat_Final.pdf            # Final project & prototype report (Phase 2)
│   ├── SDC2026_XH-Cat_TechDeclaration.pdf  # Technical & tools declaration
│   ├── SDC2026_XH-Cat_Replit_POU.pdf       # Replit proof of use (preliminary round)
│   └── SDC2026_XH-Cat_Runpod_POU.pdf       # RunPod proof of use (preliminary round)
├── testing/                 # Synthetic CVs and labelled test sets
├── tests/                   # Vitest tests
├── .env.example             # Example environment variables (all optional)
├── LICENSE
├── package.json
└── README.md
```

### Architecture

```
Browser (public/) ──► Cloudflare (DNS, HTTPS) ──► Cloudflare Tunnel ──► Node.js + Express (server/)
                                                                          │
                     shared/ logic + bundled official data (data/) ◄──────┤
                     SQLite: accounts, profiles, organisations   ◄────────┤
                     DeepSeek API: CV reading, news check         ◄───────┤
                     DeepSeek Search: AI news every 3 hours       ◄───────┘
```

Diagrams: `docs/architecture-*.html` (open in a browser).

---

## How to Run

### Option 1 — Use the live site

Open https://futures.grong.my. Guests can use everything; sign up to save profiles.

### Option 2 — Run locally

Needs Node.js 22.12 or later.

```bash
# 1. Clone the repository
git clone https://github.com/guirong0109/XH-Cat_MyFuture.git
cd XH-Cat_MyFuture

# 2. Install dependencies
npm install

# 3. Configure environment variables (optional)
cp .env.example .env            # Windows: copy .env.example .env

# 4. Run the app
npm start                       # http://localhost:3200
```

With no settings the app still works on the bundled data. `ACCOUNTS_DB=local` turns on accounts in a local SQLite
file; `CV_LLM_KEY` turns on AI CV reading and `DEEPSEEK_API_KEY` the AI news (both paid, DeepSeek). Every setting is
explained in `.env.example` and `docs/project-details.md`.

### Run Tests

```bash
npm test                                      # Vitest
python -m unittest discover pipeline/tests    # Python data pipeline
```

---

## How We Use Replit *(Required)*

- **Preliminary round:** the first prototype was built and deployed with Replit Deployments, in the preliminary-round
  repository https://github.com/guirong0109/XH-Cat_Domain1.
- **Final round:** this repository is a separate, new build. It is not hosted on Replit; it runs on the team's
  computer and is published through a Cloudflare Tunnel at https://futures.grong.my.

📄 Proof of use: [`submission/SDC2026_XH-Cat_Replit_POU.pdf`](submission/SDC2026_XH-Cat_Replit_POU.pdf)

## How We Use RunPod *(Required)*

- **Preliminary round:** RunPod GPU Pods were used offline to compare 5 embedding models and run bge-m3 skill
  similarity (about USD 0.25, 22 Oct 2026), in https://github.com/guirong0109/XH-Cat_Domain1.
- **Final round:** the live app calls no GPU, so there is no RunPod endpoint. Matching is arithmetic on official
  data; CV reading and news use the DeepSeek API. The code still supports an optional RunPod embedding endpoint
  (`SEMANTIC_*` in `.env.example`), switched off on the live site.

📄 Proof of use: [`submission/SDC2026_XH-Cat_Runpod_POU.pdf`](submission/SDC2026_XH-Cat_Runpod_POU.pdf)

---

## Challenges & Learnings

- Similarity scores from embedding models (preliminary round) could not be explained to a student, so we replaced
  them with arithmetic on official O\*NET levels and the official code chain; a broken chain says "not available".
- A rules-only CV reader missed items; adding DeepSeek with a word-for-word quote check and user confirmation fixed
  recall without letting the AI invent skills.
- The first real news runs kept preprints and homework pages, so we added a relevance check; it drops 6 to 34
  non-news results per field each refresh.
- Writing a test first for every change (and recording every step in `docs/build-record.html`) caught a cost-cap
  bypass and a crash path before they went live.

## Future Improvements

- [ ] Run the planned pilot with at least 20 students
- [ ] Live feeds for DOSM job ads, HRD Corp courses and MQA programmes
- [ ] AI news in Bahasa Melayu and 中文
- [ ] Managed hosting (Cloudflare D1, already supported) and a PDPA review before real users upload CVs

## Team

| Name         | Role       | GitHub                                         |
| ------------ | ---------- | ---------------------------------------------- |
| Yip Gui Rong | Team Lead  | [@Guirong0109](https://github.com/Guirong0109) |
| Sit Jia En   | Member     | [@Jane2151](https://github.com/Jane2151)       |

---

## Submission Checklist

- [x] Team name, domain (Domain 1) and SDG track filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [x] Replit used, with proof of use in `submission/` (preliminary round)
- [x] RunPod used, with proof of use in `submission/` (preliminary round)
- [x] Preliminary submission completed (`SDC2026_XH-Cat_Preliminary.pdf`)
- [x] Final report completed (`SDC2026_XH-Cat_Final.pdf`)
- [x] Technology declaration completed (`SDC2026_XH-Cat_TechDeclaration.pdf`)
- [x] Submission files renamed with the team name
- [x] "How to Run" steps verified
- [x] No API keys or secrets committed to the repository

## License

This project is licensed under the [Apache License 2.0](LICENSE).
