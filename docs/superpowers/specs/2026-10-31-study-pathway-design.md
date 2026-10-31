# Study Pathway — Design

Date: 2026-10-31 · Branch `claude/study-pathway` (from `main` at `6ac16f4`) · Status: approved in brainstorming
(3 sections), waiting for written-spec review.

Inputs: `HANDOVER.md` and `CLAUDE.md` on `main`; the original plan's M5 "Roadmap" row
(`docs/superpowers/specs/2026-10-29-futureready-final-design.md`); the career matching design
(`docs/superpowers/specs/2026-10-30-career-matching-design.md`), whose role answer this module reuses; checks of
MQA's Malaysian Qualifications Register, e-LATiH and the other course sites made on 31 Oct 2026 (section 3); the
owner's change of 31 Oct asking for more sites than e-LATiH and MQA (P12).

**No scoring method from the old project.** The old mockup's roadmap order (OpenAlex growth × scenario factor) and its
13-course list are not used.

Architecture diagram: `docs/architecture-pathway.html` (owner approves it; it then binds the build).

## 1. Goal and success

A user picks one or more roles from career matching and, for each, sees a study pathway in two parts:

- **Study route**: the usual education level for the job, the fields of study that lead to it, and under each field
  named accredited Malaysian programmes and professional-body qualifications (e.g. MIA / ACCA for accounting), each a
  link to its own page;
- **Skills to build**: the role's skill and knowledge gaps, biggest first, each with named courses from several real
  sites (e-LATiH, Coursera, edX, Khan Academy, freeCodeCamp, Microsoft Learn, Google Skills, AWS Skill Builder,
  OpenLearning, MDEC, …), each a link to the course page, and "More on …" links that open each searchable site's own
  search for that skill (e.g. Python → Python courses on e-LATiH, Coursera, edX, Microsoft Learn, …).

This holds for **every** skill and **every** field of study, not only the examples (P13).

The user marks steps "started" or "done" (self-reported).

Success: a judge picks a role, sees exact named courses, clicks one and lands on that course's page; every list names
its source and date; every team pick says whether the owner has reviewed it; a role, field or skill with no data says
so instead of guessing.

## 2. Decisions (owner, 31 Oct)

| # | Topic | Decision |
|---|---|---|
| P1 | What "Study Pathway" covers | Both: a formal study route **and** short courses for the remaining skill gaps, on one screen in two parts |
| P2 | How far the study route goes | Field of study + usual education level **and** Malaysian programmes |
| P3 | Exact courses | **Both**: team-picked named courses and programmes (name, link, date checked only) **and** a live search link per skill for more |
| P4 | Order of skill steps | Biggest gap first, using matching's own gap points; no new maths |
| P5 | Progress | "Started" / "done" per step, labelled self-reported, saved in the browser; it never changes the Skill Match |
| P6 | Target roles | Several saved targets, chosen from `#match`; no limit on how many |
| P7 | "Not assessed yet" skills | Own group "Level not assessed yet", with courses and a link to set the level; the pathway is marked provisional. Nothing is locked |
| P8 | Approach | A: new pathway service (`shared/pathway/`, `server/pathway/`, `POST /api/pathway`) that reuses matching's role answer; matching's files are not changed except the card button |
| P9 | Team picks review | Same as SDG links (M16): shown now, labelled "team draft, not yet reviewed"; approved in `#admin` → "approved by owner on <date>"; rejected → hidden |
| P10 | First fill (changed by P13) | **All** fields and skills, not a demo subset: at least one named course for each of the 68 O\*NET skill and knowledge items, from the sites of P12 (e-LATiH first, then the others); for each field of study that reaches O\*NET (118 of 124), at least one accredited Malaysian programme and, where the field has one, its Malaysian professional body. Roughly 300–500 links, each opened in a browser. Where no real one is found, the screen shows "no team pick yet" plus the search links |
| P11 | Diagram | Claude drafts `docs/architecture-pathway.html`; the owner approves it |
| P12 | More sites (owner, 31 Oct, after the first spec) | Not only e-LATiH and MQA. Four groups: global course sites, tech-company learning, Malaysian platforms, professional bodies. Sites whose search can be linked (checked in a browser) get a "More on <site>" search link on every skill step; the others give named team picks only. No link is invented: every site and pick is real and opened in a browser before it is added |
| P13 | All fields (owner, 31 Oct) | Python and accounting were examples only. Every field of study gets "More on <site>" search links too (the field name as search word), as every skill does, and the first fill (P10) covers all fields and all skills |

## 3. What the course sites allow (checked 31 Oct 2026)

- **MQA, Malaysian Qualifications Register** (`https://www2.mqa.gov.my/mqr/`): a search form only (results come from a
  form `POST` to `eakrResult.cfm`; a plain link with the field filled in returned a server error). No download, no
  data feed, no per-programme page found. Footer: "All rights reserved © 2009 - Malaysian Qualifications Register,
  MQA"; no open licence. Programmes are filed under NEC field codes; 4-digit NEC codes read like ISCED-F 2013 codes
  (e.g. 0613 Computer Science), but no official NEC ↔ ISCED-F table was found.
- **e-LATiH, HRD Corp** (`https://elatih.hrdcorp.gov.my`): a catalogue of about 2,084 courses. A link with a search word
  opens the filtered list (`/courses?…&course=statistics` showed 1 course; `&categories=13` showed 5), checked in a
  browser on 31 Oct. Each course has a fixed page `/courses-details/<name>`. Terms of Use (5 May 2023), clause 4.6:
  content must not be reproduced or redistributed without authorisation. Courses carry e-LATiH's own skill areas,
  not O\*NET codes.
- **No open government dataset** of accredited programmes or training courses was found on data.gov.my or
  archive.data.gov.my. MyFutureJobs courses are for PERKESO-eligible users only and are not used.

Hence P3: the app stores only a name, a link and the date checked for each pick (no descriptions, prices or
durations; the user reads those on the site), and links to the official search for anything more. `data/SOURCES.md`
records both sites' terms and that the app only links.

**Other sites (P12), search links checked in a browser on 31 Oct 2026:**

| Group | Site | Search link (`<q>` = the skill's search word, URL-encoded) | Check |
|---|---|---|---|
| Malaysian | e-LATiH (HRD Corp) | `https://elatih.hrdcorp.gov.my/courses?order=None&categories=&levels=&languages=&start_duration=&end_duration=&content_provider=&ratings=&version=&start_price=&end_price=&course=<q>` | "statistics" → 1 course |
| Global | Coursera | `https://www.coursera.org/search?query=<q>` | "python" → results page |
| Global | edX | `https://www.edx.org/search?q=<q>` | "accounting" → 104 results |
| Global | Khan Academy | `https://www.khanacademy.org/search?page_search_query=<q>` | "accounting" → lessons listed |
| Tech | Microsoft Learn | `https://learn.microsoft.com/en-us/training/browse/?terms=<q>` | "python" → 47 results |
| Tech | Google Skills | `https://www.skills.google/catalog?keywords=<q>` | "python" → 71 results |
| Global | freeCodeCamp | none (its search finds articles, not courses) | named picks only |
| Tech | AWS Skill Builder | none (could not be opened in the check) | named picks only |
| Malaysian | OpenLearning | none (the search link opened the home page, not results) | named picks only |
| Malaysian | MDEC | none (no course search found) | named picks only |
| Professional | MIA, ACCA, BEM, IEM and other bodies the team adds | none | named picks only, under fields of study |

Search links copy no content: they open the site's own search. Each site's terms page is recorded in
`data/SOURCES.md` when the site is added; a site whose search link stops working is switched to "named picks only"
in `sites.json`.

## 4. Data

Every file is recorded in `data/SOURCES.md` (where from, date, licence) and checked against a manifest SHA-256.
Nothing is invented: a missing value stays missing and the screen says so.

| File | Content | Source | Notes |
|---|---|---|---|
| `data/onet/education.tsv` (new) | Per O\*NET job: the "Required Level of Education" (element 2.D.1, scale RL) percentage for each of the 12 categories, with the category names and the Recommend Suppress flag | *Education, Training, and Experience.txt* and *Education, Training, and Experience Categories.txt* from the O\*NET 31.0 zip already recorded (same SHA-256), via `pipeline/fetch_onet.py 31.0` | CC BY 4.0. US survey data, labelled so on screen. Suppressed rows are not shown and the screen says so |
| `data/pathway/sites.json` (new) | The course sites of section 3: id, name, group (malaysian / global / tech / professional), home page, terms page, search link with `<q>` or null, date the search link was checked, hosts its course pages use | Written by the FutureReady team; each search link opened in a browser | Only sites in this file can appear. Links must be `https` |
| `data/pathway/picks.json` (new) | Team picks: `courses` (per O\*NET item key or ISCED-F field code; any site in `sites.json`), `programmes` (per ISCED-F field code; kind `accredited` with institution and MQR reference number, or kind `professional` with the body's name), `searchWords` (per O\*NET item key and per ISCED-F field code). Each pick: id, site id or institution, name, link, date checked | Written by the FutureReady team; each link opened in a browser before it is added | Team draft (P9). Links must be `https`; a course link's host must be one of its site's hosts (e-LATiH links also start `/courses-details/`); a programme link may be on any institution or body's own site |
| `data/radar/occupation-bridge.json` (reused) | eMASCO → O\*NET code chain | As recorded | Through matching |
| `data/isced/cip_onet.tsv`, `isced_cip.tsv`, `fields.tsv` (reused) | O\*NET job ↔ CIP, CIP ↔ ISCED-F (partial links marked `*`), ISCED-F names | As recorded | Read backwards here |

A search word defaults to the O\*NET item name, or for a field to the ISCED-F field name; the team sets another only
where the name finds little on the sites (e.g. "Active Listening" → "listening skills"; "Accounting and taxation" →
"accounting"). One word serves every searchable site. A search word is a team draft
too and is reviewed with the picks.

## 5. Skills to build (`shared/pathway/steps.js`, pure)

Input: the `rows` of matching's `fitFor` for the job matching shows for the role (its best O\*NET job). Each row has
`key, name, needed, you, status (met | below | missing | not_assessed), gap`.

1. **Gaps**: rows with status `missing` or `below`. Points = gap ÷ Σ needed (all rows) × 100, rounded, the same formula
   as matching's "what would raise it", applied to every gap (not only the top 3). Order: points, largest first; ties
   by key. Each step shows the name, "your level → level needed" in words (basic / good / expert; "expert still leaves
   a gap" when needed > 6, as in matching), and the points.
2. **Level not assessed yet**: rows with status `not_assessed`, in O\*NET importance order. The pathway is marked
   provisional when this group is not empty.
3. **Already at the level**: rows with status `met`, folded, in O\*NET importance order.

Every step in groups 1 and 2 lists its shown team picks for that key, grouped by site (Malaysian first, then global,
then tech), then one "More on <site>" link per searchable site (see section 7). Worked
example: the owner's chart example (needed 12.05, met 9.2) gives the same gaps and points as matching's raise list for
its first three steps.

## 6. Study route (`shared/pathway/route.js`, pure)

For the same O\*NET job:

- **Usual education level**: the category with the highest RL percentage, shown with its percentage (wording like
  "Bachelor's degree, <N>% of US workers asked", N from the file), and the full list folded. Ties: both shown. No row or all suppressed: "O\*NET has
  no education data for this job".
- **Fields of study**: every CIP programme linked to the job in `cip_onet.tsv`, then every ISCED-F field linked to those
  CIP codes in `isced_cip.tsv`; a field reached only through partial links is labelled "partial link". Fields are
  listed by ISCED-F code, each with the CIP programmes that reach it (folded). The user's own field of study is
  marked "your field". No field: "no field of study in the official tables for this job".
- **Malaysian programmes**: under each field, its shown team picks of kind `accredited` (name, institution, MQR
  reference number, link to the institution's page, date checked, review label), then a link to the MQR search page
  with "choose NEC field <code>", labelled "code match, not an official table". No pick: "no team pick yet".
- **Professional qualifications**: under each field, its shown team picks of kind `professional` (body, qualification
  name, link to the body's page, date checked, review label), e.g. MIA or ACCA under accounting. None: the line is
  left out.
- **Courses for the field** (P13): under each field, its shown team course picks for that field code, then one
  "More on <site>" link per searchable site, searching for the field's search word (section 4).

The CIP crosswalk and ISCED table are 2020 / 2016 editions; the screen names both, as the profile form does.

## 7. Picks and links (`shared/pathway/picks.js`, pure)

- `checkSites(file)` and `checkPicks(file, sites)`: every site has id, name, group, https home and terms pages, and a
  search link that is null or `https` with exactly one `<q>`; every pick has id, name, link, date; links are `https`;
  a course pick names a known site and its link's host is one of that site's hosts (e-LATiH links under
  `/courses-details/`); ids are unique. A bad file stops the server at start-up with a clear message naming the file
  and the entry.
- `shownPicks(picks, reviews)`: not rejected → shown; approved → carries the owner's date; same rules as
  `shared/matching/sdg.js` (M16).
- `searchLinks(word, sites)`: for every site with a search link, in `sites.json` order, the link with `<q>` replaced by
  the URL-encoded word, and the site's name and date checked.
- MQR link: `https://www2.mqa.gov.my/mqr/english/ecarianakr.cfm` with the NEC code shown beside it.

## 8. Server and screen

- `POST /api/pathway` `{profile, code, lang}` → for one role: code, title, the O\*NET job used (or the missing chain
  step), study route, skill steps in three groups, provisional, picks with review labels, search links, and every
  source with its date. It calls matching's service (`role(profile, code)`) for the rows, so the numbers are the same
  as matching's by construction. The profile is validated, used and dropped: never stored or logged.
- `GET /api/admin/pathway/picks` and `POST /api/admin/pathway/picks` (admin key, same review store as the SDG links
  under its own name): list picks with status; approve or reject one.
- Screen `#pathway` (new tab after "Career matching"): one tab per saved target with "remove"; Part 1 "Study route";
  Part 2 "Skills to build"; a provisional banner when needed; a sources table. Each step: "started" / "done"
  buttons, labelled self-reported. Every list shows its source and date. EN / BM / 中文 strings (BM and 中文 marked
  "translation: owner review"). Works at 360 px.
- `#match`: the disabled "Study plan not available yet" button becomes "Plan my study pathway". It adds the role to the
  saved targets (or opens it if already saved) and opens `#pathway`.
- `#admin`: a "Pathway picks" list beside the SDG links.
- Browser storage (`shared/guestStore.js`): `pathway.targets` (code, title, date added) and `pathway.progress`
  (O\*NET item key → started | done, date). Progress is per skill, so it shows in every pathway that has that skill,
  and it is kept when a target is removed.

## 9. Errors

One error shape `{error:{code, message, retryable}}`, as matching. Unknown role → 404 "not found". Broken chain →
"not available" with the missing step; neither part is shown. Thin profile → the study route still shows; Part 2 says
what matching says. No education row, no field, no pick → the messages in sections 6 and 7. Bad picks file at start
→ start-up error naming the file. The page never crashes.

## 10. Rules carried over

No language model. The answer never has a key containing score, weight, rank or opportunit (tested). Trends and AI
scenarios play no part in the pathway. Marking a step "done" never changes the Skill Match; only updating the level in
the profile does.

## 11. Testing

Test first (Vitest) for each unit; a Python unit test for the `fetch_onet.py` change with a saved small fixture.

- `steps.js`: the owner's chart example; missing, below, met, not assessed; N > 6; ties by key; groups and order.
- `route.js`: a small chain fixture: one job → several CIP → several fields; partial links; the user's field; no
  field; education top category, tie, none, suppressed.
- `picks.js`: valid files; each bad case (http, unknown site, host not the site's, wrong e-LATiH path, search link
  without or with two `<q>`, duplicate id, missing date); review statuses; search links for every searchable site, in
  order, with encoding (e.g. "C++"); a field's search word falls back to its ISCED-F name.
- Data check: every one of the 68 O\*NET items and every field that reaches O\*NET has either a pick or is listed in
  the fill report `docs/pathway/fill-report.md` as "none found" with the sites searched and the date (P10).
- Routes: real app on a random port; profile never logged; forbidden keys absent; unknown code; broken chain; admin
  key required for the picks review.
- Browser check on `127.0.0.2:3200` (desktop and 360 px): plan a pathway from `#match`, two targets, open a team pick
  and a search link, mark started / done, not-assessed group, admin approve and reject. Results in
  `docs/pathway/acceptance.md`.

`npm test` before every commit; every step goes into the build record.

## 12. Owner actions and risks

- **Review the team picks** in `#admin` (P9).
- **Licences**: neither MQA nor e-LATiH gives an open licence, and the other sites are not open data either; the app
  stores only names, links and dates and links out. Written permission from MQA or HRD Corp would allow more; that is the owner's call.
- **NEC ↔ ISCED-F**: no official table found; the MQR hint is labelled "code match, not an official table".
- **Links go stale**: each pick and search link shows the date it was checked; a stale pick is fixed in `picks.json`,
  a broken search link is set to null in `sites.json`.
- **Not every search fits every skill**: a "More on <site>" link is shown for every skill, so a tech site may find
  little for e.g. accounting. The user sees the site's own result count; the app adds no filter.
- **US data**: the education level and the CIP crosswalk are US / Canadian; the screen says so.
- Out of scope: prices and durations copied into the app, automatic course finding, any meaning or embedding model,
  HR and career-centre views.
