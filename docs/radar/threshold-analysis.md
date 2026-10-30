# Trend thresholds — calibration on real data (for owner approval)

Date: 30 Oct 2026 · Branch `claude/future-radar` · Status: **proposal; no threshold is approved or implemented**

Approved and unchanged: Research Momentum Index (log2, k = 20) is a chart value only and never decides direction.

Data:
- DOSM Big Data Analytics: Job Market Insights Q2 2026, data file "Data JMI Q2 2026" (release 18 Aug 2026),
  Table 2 "Number of Job Offerings Advertised Online by Major Group Occupation", quarterly 2019 Q3 – 2026 Q2.
  Read by cell address with merged year headers expanded; "-" = not available.
- OpenAlex primary-topic counts for every topic in subfield 1702 Artificial Intelligence (72 topics), 2015–2025,
  plus the six approved axes (`index-analysis-openalex-2026-10-30.json`).
- Scripts: `threshold_analysis.py`, `threshold_examples.py` (re-run to reproduce every number).

## 1. DOSM occupation shares

Share = group's online job offerings ÷ DOSM total ("Jumlah") × 100. Changes are in **percentage points (pp)**,
same quarter one year earlier. User label: **"Change in share of Malaysian online job advertisements."**

Share of total, Q2 each year (%):

| Group | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Managers | 14.36 | 18.43 | 11.22 | 15.15 | 17.13 | 17.34 | 15.83 |
| Professionals | 57.43 | 50.76 | 42.80 | 48.09 | 47.47 | 45.80 | 51.47 |
| Technicians & associate professionals | 21.85 | 19.18 | 18.21 | 18.32 | 16.40 | 22.65 | 15.57 |
| Clerical support workers | 3.41 | 6.27 | 9.93 | 6.85 | 7.57 | 5.35 | 7.27 |
| Service & sales workers | 1.48 | 1.27 | 9.64 | 6.95 | 7.26 | 5.49 | 5.85 |
| Skilled agricultural | 0.14 | 0.05 | 0.16 | 0.06 | 0.08 | 0.03 | 0.02 |
| Craft & related trades | 0.35 | 1.04 | 2.39 | 1.51 | 1.21 | 0.97 | 0.82 |
| Plant & machine operators | 0.98 | 3.00 | 5.65 | 3.08 | 2.88 | 2.37 | 2.33 |
| Elementary occupations | – | – | – | – | 0.00 | – | 0.84 |

YoY change in pp, last 8 quarters (* = the year compared contains a possible break, see §2):

| Group | 24Q3 | 24Q4 | 25Q1 | 25Q2 | 25Q3 | 25Q4 | 26Q1 | 26Q2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Managers | +2.10 | −1.39 | +0.40 | +0.21 | −0.68* | −2.13* | −1.86* | −1.51* |
| Professionals | −0.51 | −0.70 | +0.41 | −1.67 | −2.49* | −1.76* | +2.38* | +5.67* |
| Technicians | −2.51 | −0.77 | −0.74 | +6.25 | +1.08* | −0.37* | −1.12* | −7.07* |
| Clerical | +0.90 | +1.32 | −0.71 | −2.22 | −0.09* | +1.86* | +1.14* | +1.92* |
| Service & sales | −0.08 | +0.81 | +0.33 | −1.77 | +1.22* | +0.87* | −0.66* | +0.36* |
| Skilled agricultural | −0.02 | −0.32 | −0.02 | −0.05 | +0.07* | +0.03* | +0.01* | −0.01* |
| Craft & trades | −0.06 | +0.11 | −0.14 | −0.24 | +0.10* | +0.02* | −0.06* | −0.15* |
| Plant & machine | +0.17 | +0.94 | +0.48 | −0.51 | +0.68* | −0.09* | −0.48* | −0.05* |
| Elementary | – | – | – | – | +0.11* | +1.57* | – | – |

Clean YoY changes (no break inside, n = 96): |pp| P25 0.24 · P50 0.71 · P75 1.94 · P90 3.03.
Relative share change |%|: P25 4.6 · P50 13.3 · P75 32.2 · P90 47.6.

Elementary occupations only has values from 2025 Q3 (0 in 2024, "-" in 2025 Q1–Q2): a **new reporting
category**, never "Emerging demand".

## 2. Possible structural breaks (candidate rule, quarter on quarter)

Rule: total changes by ≥ ±50% **and** ≥ 75% of eligible groups (both quarters > 0) move the same way by ≥ 40%.

| Quarter | Total q/q | Groups same way ≥ 40% | Result |
|---|---:|---:|---|
| 2020 Q1 | −45.4% | 6/8 | no (total under 50%) |
| 2020 Q2 | −61.2% | 6/8 | **Possible structural break** |
| 2020 Q3 | +288.9% | 8/8 | **Possible structural break** |
| 2021 Q3 | +112.7% | 7/8 | **Possible structural break** |
| 2023 Q4 | +32.5% | 2/8 | no |
| 2025 Q3 | +108.8% | 8/8 | **Possible structural break** |

The rule finds Q3 2021 and Q3 2025, and also 2020 Q2–Q3 (the COVID-19 lockdown period). The rule cannot tell a
real shock from a coverage change; causes are not assumed. DOSM's releases describe the data only as "job offerings
advertised online through major private recruitment platforms" and give no reason for either jump.

Comparability (applied separately):
- **Counts:** a comparison whose two periods sit on different sides of a possible break → `insufficient_comparable_evidence`.
- **Shares:** the same, by default. An admin may **dismiss** a flag for shares (or counts) only with a written note
  and supporting evidence; the decision keeps reviewer, time and evidence. **Confirm** keeps the restriction.
  **Annotate** adds a note without changing it.

**Consequence today:** every YoY comparison for 2025 Q3 – 2026 Q2 crosses the 2025 Q3 flag, so the latest DOSM
directions are `insufficient_comparable_evidence` until the flag is reviewed. The first clean YoY comparison is
2026 Q3 vs 2025 Q3 (DOSM release due 17 Nov 2026).

## 3. DOSM direction (candidate `dosm-share-v1`)

- **Net change:** latest quarter's YoY change in pp.
- **Material change:** |net| ≥ **1.0 pp** and |relative share change| ≥ **10%**. (1.0 pp ≈ between the median and
  P75 of clean changes; the 10% condition stops tiny relative moves in the biggest group from counting.)
- **Steps (consistency):** the YoY pp changes of the last three quarters: Q vs Q−4, Q−1 vs Q−5, Q−2 vs Q−6. Only
  clean steps (no unreviewed break inside) count.
- **Rising / Declining:** material change **and** at least 2 of the clean steps have the same sign as the net change
  (if only 1–2 clean steps exist, all of them must agree, and evidence is at most Limited). Otherwise **Mixed / unclear**.
- **Stable:** not material and volatility not High; not material with High volatility → **Mixed / unclear**.
- **No Emerging for DOSM** in round 1: these are fixed occupation groups; a new reporting category is
  `insufficient_evidence`.

On 2021 Q1 – 2026 Q2 (198 group-quarters): Rising 12, Declining 14, Stable 59, Mixed 11, insufficient 102
(most windows contain one of the four flags).

## 4. OpenAlex direction (candidate `openalex-count-v1`)

3-year growth of AI-subfield topics (559 windows, baseline ≥ 100): P10 −18% · P25 −7% · P50 +15% · P75 +65% · P90 +127%.
Computer Science as a whole grew +64% in 2022–2025, so the panel always shows that context line.

- **Net change:** log2(R ÷ B), R = year Y, B = year Y−3 (same window as the index).
- **Rising:** R ÷ B ≥ **1.25** (+25%); **Declining:** R ÷ B ≤ **0.80** (−20%). Symmetric in doublings (±0.32).
- **Steps:** the three annual changes Y−3→Y−2, Y−2→Y−1, Y−1→Y. Rising/Declining needs ≥ 2 of 3 with the same sign
  as the net change; otherwise **Mixed / unclear**.
- **Stable:** between the two limits and volatility not High; else **Mixed / unclear**.
- **Emerging:** B < 100 (including 0) **and** R ≥ 100 **and** (B = 0 or R ÷ B ≥ 3) **and** both of the last two
  steps up **and** at least 4 years of history in the snapshot. Zero baselines are never divided.

On 72 AI topics, windows 2020–2025 (416): Rising 166, Declining 38, Stable 182, Mixed 30.

## 5. Volatility — exact formulas

- **OpenAlex** (unit: log points × 100 ≈ %): standard deviation (n − 1) of the five annual log changes
  ln(c[y+1] ÷ c[y]) for y = Y−5 … Y−1, × 100. Needs six years, all > 0; otherwise "not computable".
  Distribution: P25 7.3 · P50 10.3 · P75 15.0 · P90 21.5. Candidate: **Low < 8**, **Moderate 8–16**, **High > 16**.
  Example T10028 (2020–2025: 6,758 · 7,830 · 7,939 · 10,983 · 17,379 · 25,167): log changes 14.7, 1.4, 32.5, 45.9,
  37.0 → SD **18.0 → High** (growth sped up a lot, so year-to-year growth was uneven).
- **DOSM** (unit: pp): standard deviation (n − 1) of the last four clean YoY pp changes (needs ≥ 3).
  Distribution: P50 0.93 · P75 1.62 · P90 1.89. Candidate: **Low < 0.75**, **Moderate 0.75–1.75**, **High > 1.75**.
  Example Professionals 2025 Q2 (steps −0.51, −0.70, +0.41, −1.67) → SD **0.85 → Moderate**.

## 6. Evidence sufficiency and quality

`insufficient_evidence` (no direction): OpenAlex — B or R missing, R = 0 with B > 0, or fewer than 4 years;
DOSM — the latest comparison crosses an unreviewed possible break, a quarter is "-", or the group is a new
reporting category (fewer than 8 reported quarters).

`evidenceQuality` (only for usable results):

| | Strong | Moderate | Limited |
|---|---|---|---|
| OpenAlex | min(B, R) ≥ 300, six years available, no revision > 5% in the window | min(B, R) ≥ 100 | otherwise (incl. < 100 or a revision > 5%) |
| DOSM | 3 clean steps, ≥ 1,000 offerings in both compared quarters | ≥ 2 clean steps, ≥ 300 offerings | 1 clean step, or < 300 offerings |

300, not 1,000, for OpenAlex: Computer Vision (419–453 papers a year) is reliable data from a narrow topic.

## 7. Edge cases with the final classifications

| Case | Inputs | Result |
|---|---|---|
| T10028 Language Models, 2025 | 7,939 → 25,167 (3.17×); steps +32.5, +45.9, +37.0; vol 18.0 | **Rising · High volatility · Strong** |
| T12549 Computer Vision, 2025 | 453 → 419 (0.92×); steps +8.1, −4.8, −11.1; vol 8.2 | **Stable · Moderate · Strong** |
| DOSM Technicians, 2025 Q2 | +6.25 pp (+38%); steps −0.77, −0.74, +6.25 | **Mixed / unclear** (one quarter jumped; earlier quarters fell) |
| DOSM Clerical, 2025 Q2 | −2.22 pp (−29%); steps +1.32, −0.71, −2.22 | **Declining · Moderate volatility** |
| DOSM Professionals, 2026 Q2 | +5.67 pp, but compared year contains 2025 Q3 flag | **insufficient comparable evidence** (counts and shares shown, no direction) |
| DOSM Elementary occupations | first values 2025 Q3 | **insufficient evidence — new reporting category** (not Emerging) |
| Topic with B = 0, R = 140, rising two years | no ratio | **Emerging** (if ≥ 4 years of history); no momentum index |

## 8. What a judge's edit does

The judge works on a synthetic copy (own namespace). Example: synthetic Professionals counts for four clean
quarters and the totals. Changing one count:

1. Validation runs (numbers, dates, totals ≥ sum of groups).
2. Shares and YoY pp changes are recomputed by the same functions; the break check runs again (a big enough edit
   can itself create a "possible structural break", which the report then shows).
3. Direction, volatility and evidence are recomputed; the report shows the rule that decided: e.g. "net +1.4 pp,
   +12% relative ≥ 1.0 pp and 10% → material; steps +0.9, +1.1, +1.4 agree 3/3 → Rising".
4. Before/after lists every changed signal and the jobs and skills linked to that group, with mapping paths.
5. Reset restores the original synthetic snapshot.

## Open choices for the owner

1. Approve or change each numeric threshold above (DOSM 1.0 pp + 10%; OpenAlex 1.25 / 0.80; volatility limits;
   evidence limits).
2. Until the 2025 Q3 flag is reviewed (or Q3 2026 arrives), DOSM directions are insufficient. Show meanwhile:
   (a) nothing but the latest shares and counts, unclassified; or (b) also DOSM's own quarter-on-quarter count
   change, labelled "context, not classified".
