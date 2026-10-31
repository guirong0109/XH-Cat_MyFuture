# Research Momentum Index — formula analysis (for owner approval)

Date: 30 Oct 2026 · Branch `claude/future-radar` · Status: **proposal, not approved**

Data: OpenAlex, works counted by `primary_topic`, complete calendar years 2015–2025, fetched 2026-10-30T04:40:42Z
(topic data updated 2026-10-30T03:01:25). Raw counts and every query URL: `index-analysis-openalex-2026-10-30.json`.
Script: `index_analysis.py` (`python -I docs/radar/index_analysis.py <out.json>` re-fetches and recomputes).

Axes (approved 30 Oct 2026): T10028 Language Models & Text AI · T10775 Generative Media AI · T12549 Computer Vision ·
T10653 Robotics · T13287 Process Automation · T12128 Service AI.

## 1. The two formulas in plain words

- **Linear:** `clamp(50 + change% ÷ 2, 0, 100)`. Each +10% adds 5 points. A topic that doubles (+100%) already
  reaches the top (100). Anything growing faster also shows 100.
- **Logarithmic:** `clamp(50 + k × log2(R ÷ B), 0, 100)`. Each **doubling** adds k points; each **halving** takes k
  away. No change = 50. With k = 25, a topic hits 100 when it grows 4×; with k = 20, when it grows 5.7×.

Example for users: "Topic A went from 1,000 to 2,000 papers (doubled): +20 points → 70. Topic B went from 1,000 to
4,000 (doubled twice): +40 points → 90."

## 2. Latest window: 2025 vs 2022 (comparison outline: 2024 vs 2021)

| Topic | Name | 2022 | 2025 | Change | Linear | Log k=25 | Log k=20 | Saturated |
|---|---|---:|---:|---:|---:|---:|---:|---|
| T10028 | Language Models & Text AI | 7,939 | 25,167 | +217.0% | 100 | 91.6 | 83.3 | linear |
| T10775 | Generative Media AI | 3,732 | 10,899 | +192.0% | 100 | 88.7 | 80.9 | linear |
| T12549 | Computer Vision | 453 | 419 | −7.5% | 46.2 | 47.2 | 47.8 | no |
| T10653 | Robotics | 3,148 | 6,086 | +93.3% | 96.7 | 73.8 | 69.0 | no |
| T13287 | Process Automation | 1,052 | 3,333 | +216.8% | 100 | 91.6 | 83.3 | linear |
| T12128 | Service AI | 1,786 | 8,114 | +354.3% | 100 | **100** | 93.7 | linear, log k=25 |

Linear puts **four of six axes at 100**: the chart cannot tell Language Models, Generative Media, Process Automation
and Service AI apart. Log k=25 separates them except Service AI (4.5× growth, capped). Log k=20 separates all six.

Language Models and Process Automation have the same value under every formula because their real growth is the same
(both 3.17×). That is a genuine tie, not saturation.

## 3. All windows (Y = 2018 … 2025, baseline Y−3): 48 topic-windows

| Method | Values at 0 or 100 | Windows where saturation hides a difference |
|---|---:|---:|
| Linear | 21 / 48 (44%) | 6 / 8 |
| Log k=30 | 10 / 48 | 4 / 8 |
| Log k=25 | 8 / 48 | 3 / 8 (2018, 2019, 2025) |
| **Log k=20** | **4 / 48** | **2 / 8 (2018, 2019 only)** |

- All log k=20 saturations come from the 2015–2016 baselines, where three topics were small (91–249 papers) and grew
  5–6.6×. From 2020 on, k=20 never saturates.
- Large decreases: the largest real fall is Computer Vision 0.68× (2015→2018): linear 34, log k=25 36, log k=20 39. No
  method hits 0 on real data; log is symmetric (halving = −k), linear is not (it reaches 0 only at −100%).
- Growth ratios seen (R/B): 0.68 to 6.64. 5.66× is the top of the k=20 scale, so k=20 covers 46 of 48 real windows
  without capping.

## 4. Things that change interpretation

**Computer Science itself grew fast.** Papers whose primary topic is in Computer Science: 551,250 (2022) →
906,207 (2025), +64%. OpenAlex's own coverage and CS output both grow. So part of every topic's growth is
"CS grew". The **share** of CS papers removes that:

| Topic | Share 2022 (‰ of CS) | Share 2025 | Share-based log index (k=25) | Count-based (k=25) |
|---|---:|---:|---:|---:|
| Language Models & Text AI | 14.40 | 27.77 | 73.7 | 91.6 |
| Generative Media AI | 6.77 | 12.03 | 70.7 | 88.7 |
| Computer Vision | 0.82 | 0.46 | 29.3 | 47.2 |
| Robotics | 5.71 | 6.72 | 55.8 | 73.8 |
| Process Automation | 1.91 | 3.68 | 73.7 | 91.6 |
| Service AI | 3.24 | 8.95 | 86.7 | 100 |

The order is the same, but the levels differ a lot: Computer Vision is flat in counts but **falling in share**.
These are two different questions ("more papers?" vs "bigger part of CS?"). They are kept separate and never blended.

**Small volume:** Computer Vision (T12549) has only ~420–830 papers a year. It is a narrow topic ("Image and Object
Detection Techniques"); most computer-vision work sits in other topics. The axis stays as approved, but its evidence
panel says it is a narrow topic, and its counts are always shown.

**Reclassification:** OpenAlex re-assigns topics as its model changes. Each index is computed inside one snapshot;
a new snapshot that changes an old year is listed as a revision (Design section 1).

## 5. Zero and missing values (no invented numbers)

| Case | Index | What the chart shows | Trend engine |
|---|---|---|---|
| B = 0, R > 0 | none (undefined) | grey point at the centre labelled "New activity — no baseline"; counts shown | may be **Emerging** only if R ≥ minimum volume and earlier years are 0 |
| B > 0, R = 0 | none | grey point "Dropped to zero — check source"; flagged for admin review (likely reclassification) | Insufficient evidence until a second snapshot confirms |
| B = 0, R = 0 | none | grey "No activity" | Insufficient evidence |
| missing / invalid | none | grey "No data" | snapshot rejected at validation; last good snapshot kept |
| min(B, R) < 100 | computed | hollow point, "Small counts — limited evidence" | evidence quality at most Limited |

An axis without an index is left out of the polygon (the polygon joins the valid axes and the gap is labelled). Fewer
than 3 valid axes → bar chart instead of a radar (spec §7.2 fallback).

## 6. Recommendation

**Use the logarithmic index with k = 20, on publication counts, named "Research Momentum Index".**

- Why log: AI research grows by multiplying; on the real data the linear index caps 44% of values and makes the
  four fastest topics identical in the latest window.
- Why k = 20 rather than 25: same idea, fewer caps (4 vs 8 of 48), none since 2020, and every axis distinct in the
  latest window. The rule stays easy to say: **each doubling adds 20 points; each halving takes 20 away.**
- Keep 100 meaning "5.7× or more"; when capped, the chart says "≥ 5.7×" and the panel shows the real ratio.
- Add **share of Computer Science research** as a separate, optional view of the same axes (a toggle), using the same
  formula. Default: publication counts. Never averaged with the count index.

Limitations: the index is relative (10 → 40 and 10,000 → 40,000 look the same, so counts are always shown); 50 and
k = 20 are design choices, not standards; it measures research papers, not AI capability or jobs.

## 7. Implementation plan

- `shared/radar/momentum.js` (pure): `momentumIndex({baseline, recent}, {k: 20, cap: [0, 100]})` →
  `{value | null, ratio, changePercent, capped, state: 'ok'|'no_baseline'|'dropped_to_zero'|'no_activity'|'invalid',
  smallCounts}`; `shareSeries(topicCounts, referenceCounts)`. Parameters live in a versioned config
  (`radar-config/v1`: k, window 3, small-count 100).
- `radar-signal/v1` research signals carry `momentum: {method: 'log2-v1', k, windowYears, baselineYear, recentYear,
  baseline, recent, ratio, value, capped, state}` and, separately, `shareMomentum` with its reference population
  (`primary_topic.field = Computer Science`, counts and query URL). Direction/volatility/evidence come from the trend
  engine on the full series, not from the index.
- Snapshots store per-topic yearly counts **and** the CS reference counts in the same fetch, with query URLs.
- SVG radar: fixed 0–100 rings at 30/50/70/90 (= halving, no change, doubling, 4×), labelled in plain words; hollow
  and grey points as in §5; comparison outline = same method one year earlier from the same snapshot.
- Evidence panel per axis: official title + id + link, description, counts B and R with years, ratio, formula with the
  numbers filled in, k, capped or not, share view numbers, snapshot id, fetch date, revisions.
- Judge test: a judge edits synthetic counts; the same `momentumIndex` runs; the before/after shows ratio and index
  for each changed axis.

## 8. User text (EN; BM and 中文 to be added)

Tooltip: "Research Momentum Index: how fast research papers on this topic grew over 3 years. 50 = same as before.
Each doubling adds 20 points; each halving takes 20 away. It counts research papers — it does not measure jobs,
hiring or how good the AI is."

"Why this index?" (next to the chart): "AI research often grows by doubling, so we use doublings, not percentages.
That keeps fast-growing topics apart instead of all hitting the top. We always show the real paper counts too,
because a small topic can grow fast from very few papers."
