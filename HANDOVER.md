# HANDOVER — `claude/study-pathway` (detailed)

Updated 2026-10-31 (all 10 plan tasks built; final review fix wave done). Branch from `main` at `6ac16f4`. `main` keeps a short version of this
file; on merge, put only the important points there and do not overwrite it with this one.

## State
- **All 10 plan tasks are built and reviewed** (936 Vitest tests, 49 pipeline tests). The final whole-branch review
  found items that were fixed in one fix wave (NEC hint, MQA wording, US education line, pick checks, course order,
  sources table, SOURCES row); the re-review was clean. The owner decides on merge. Nothing is pushed or merged.
- Browser check done by the controller on 31 Oct, twice: all checks pass, including admin (approve and reject) and a
  thin profile; only dark mode was not inspected by eye (`docs/pathway/acceptance.md`).
- Spec: `docs/superpowers/specs/2026-10-31-study-pathway-design.md`; plan: `docs/superpowers/plans/2026-10-31-study-pathway.md`;
  diagram: `docs/architecture-pathway.html`; approved mockup: `docs/mockup-pathway.html`; fill report:
  `docs/pathway/fill-report.md`.

## Goal
For each role the user saves as a target (from `#match`), one screen `#pathway` in two parts:
1. **Study route**: usual education level (eMASCO's own qualification first, then O\*NET's US percentages), fields of
   study that reach the role, accredited Malaysian programmes and professional bodies, courses to start with.
2. **Skills to build**: the role's skill gaps, biggest gap first, each with named courses and "More on <site>" search
   links. "Started" and "Done" are self-reported and never change the Skill Match.

## What was built
- **Data** (`data/pathway/`): `sites.json` (10 course sites), `picks.json` (125 courses, 135 programmes, 2 search
  words), `manifest.json` (hashes). O\*NET education rows (`education.tsv`, from the O\*NET 31.0 Education files) come
  from `pipeline/fetch_onet.py`. Sources are in `data/SOURCES.md`.
- **`shared/pathway/`** (pure): `steps.js` (skill steps from matching's gap points), `route.js` (study route, fields,
  education), `picks.js` (pick rules, hash, review status, coverage).
- **`server/pathway/`**: `service.js`, `routes.js` (`POST /api/pathway`), `data.js` (loader; a bad picks file stops
  start-up), `adminRoutes.js` (owner review of picks).
- **Screen**: `public/js/screens/pathway.js` and `pathwayParts.js`; "Plan my study pathway" button on `#match`
  cards; `#roadmap` opens `#pathway`. Targets and progress are stored in the browser only.
- **Admin review**: picks section in `#admin` (approve / reject with a note), same pattern as the SDG links.

## Owner decisions (spec §2)
| # | Decision |
|---|---|
| P1 | Both a formal study route and short courses for the remaining skill gaps, on one screen in two parts |
| P2 | Study route = field of study + usual education level and Malaysian programmes |
| P3 | Team-picked named courses and programmes (name, link, date checked only) and a live search link per skill |
| P4 | Skill steps: biggest gap first, using matching's own gap points; no new maths |
| P5 | "Started" / "done" per step, self-reported, saved in the browser; never changes the Skill Match |
| P6 | Several saved targets, chosen from `#match`; no limit |
| P7 | "Not assessed yet" skills get their own group with courses and a link to set the level; pathway marked provisional |
| P8 | New pathway service (`shared/pathway/`, `server/pathway/`, `POST /api/pathway`) reusing matching's role answer; matching files unchanged except the card button |
| P9 | Picks reviewed like SDG links (M16): shown now; approved in `#admin` shows "approved by owner on <date>"; rejected is hidden |
| P10 | First fill covers all skills and fields (changed by P13) |
| P11 | Claude drafts `docs/architecture-pathway.html`; owner approves |
| P12 | More sites than e-LATiH and MQA: global, tech-company, Malaysian and professional bodies; a "More on" link only where the site search was checked in a browser; no invented link |
| P13 | All 68 items and all fields get picks and "More on" links; Python and accounting were only examples |
| P14 | The usual education level shows eMASCO's qualification for the role first ("eMASCO, Malaysia"), then O\*NET's US percentages ("In the US"); shows even when the code chain is broken |
| P15 | No "team draft" word on `#pathway`; an unreviewed pick shows no review label; an approved pick shows its date. `#admin` still says "not yet reviewed" |

## Data counts
- **Courses:** 68 of 68 skill and knowledge items have at least one course pick (125 courses).
- **Fields:** 99 of 118 fields that reach O\*NET have an accredited Malaysian programme. The other 19 are in
  `docs/pathway/fill-report.md` with the sites searched.
- **Programme picks:** 135, including professional bodies.
- **Sites:** 10: 6 have a checked search link ("More on <site>"); 4 give named picks only.

## How MQR was queried
The Malaysian Qualifications Register (www2.mqa.gov.my/mqr) has no link interface. The team posted its search form
by script with every form field and the session cookie (programme code, name and institution empty, NEC field set,
all modes, levels and states). Diplomas and certificates count as accredited programmes. Each programme name is the
linked institution page's main heading, minus a leading code. Details are in the fill report.

## Commands
```bash
npm install && npm test     # expect 936 passed
npm start                   # http://localhost:3200
python -m unittest discover pipeline/tests   # expect 49 OK
```

## Fixed in the final review
- **NEC-vs-ISCED code hint (Finding A)**, commit 8877fa3, Ruling 15: a code is shown only outside ISCED 061x/071x/073x
  ("code match, not an official table"), plus 0611 to 0614 and 0712 to 0717 ("NEC code checked in MQR"); otherwise
  "choose the NEC field for <field title>". Covered by tests; not re-checked by eye.
- Picks without an MQA reference say "MQA ref not recorded yet" (Ruling 16).

## Open points for the owner
- **Review all team picks in `#admin`.** None is approved yet; the trial approvals were kept in a memory store and are
  gone. The weaker course fits are listed in the build ledger (for example items 2.B.3.c, 2.C.4.g and 2.C.10).
- **Fill the 60 missing MQA references from MQR.** Deferred by Ruling 16; the scripted MQR query works.
- **BM / 中文 wording** of the new strings (marked "translation: owner review").
- **NEC codes hidden inside ISCED 061x/071x/073x** that the team matched by name: they show no code on the screen
  (help only).
- **Professional bodies not linked:** law, architecture and town planning, veterinary, social work (recorded in the
  fill report).
- **Licence permission** from MQA and HRD Corp is optional; only name, link and date are kept.

## Not switched on
- Admin needs the server keys as before (`RADAR_ADMIN_KEY`, `RADAR_SESSION_SECRET`). Without them
  `#admin` is not available, so the pick review cannot be used until they are set.
- Dark mode was not inspected by eye. Nothing is pushed.

## Earlier work on `main`
Profile, CV, Radar and Career matching are described in `main`'s short `HANDOVER.md`; the detailed versions are on
their own branches.
