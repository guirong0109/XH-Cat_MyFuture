# Radar output contract `radar-signal/v1`

This is what the Future Skills Radar publishes for other modules, above all the later Matching module. It is built by
`shared/radar/contract.js` (`buildSignal`, `validateSignal`) inside `shared/radar/pipeline.js` (`runPipeline`). The
binding definition is spec §10 (`docs/superpowers/specs/2026-10-30-future-radar-round1-design.md`).

`GET /api/radar/export` returns the active manifest's signals (each passing `validateSignal`) and the reference data
they rest on: topics, versions, the occupation bridge step statuses and the **decided** field ↔ topic records
(`reviewStatus` `approved` or `rejected`; pending proposals are never exported).

## One signal

Keys always appear in this order. Keys marked optional are left out when they do not apply.

| Field | Meaning |
|---|---|
| `contract` | Always `"radar-signal/v1"`. |
| `signalId` | Stable across manifests: `openalex:<topic id>` (e.g. `openalex:T10028`) or `dosm:masco2020:<major group>` (e.g. `dosm:masco2020:2`). |
| `manifestId` | The manifest this signal was published in. One screen never mixes manifests. |
| `evidenceKind` | `research_indicator` (OpenAlex), `occupation_group` (DOSM major group), `occupation_direct` (reserved; not produced in Round 1), `skill_posting_flag` (O\*NET skill flags and Hot Technologies posting counts; US job ads, software and technology skills only). |
| `entity` | `{type, system, code, name, sourceUrl}`. `type` is `ai_topic`, `occupation_group`, `occupation` or `skill`. OpenAlex: system `OpenAlex topics`, code `T…`, name = OpenAlex official title. DOSM: system `MASCO 2020 major group`, code `1`–`9`, name as DOSM prints it. O\*NET skills: type `skill`, system `O*NET Software Skills` (flags) or `O*NET Hot Technologies` (counts), code the O\*NET technology class id (flags) or the technology name (counts), name the software example, e.g. `Go`. |
| `granularity` | `{level}` with level `topic`, `group`, `occupation`, `occupation_skill` (a skill flagged for one O\*NET job; also carries `occupationCode`) or `skill` (a Hot Technology across all jobs). Group signals also carry `groupSystem: "MASCO 2020 major group"` and `groupCode`. |
| `metric`, `unit` | OpenAlex: `works_primary_topic`, `papers`. DOSM: `share_of_online_job_offerings`, `percent` (share of DOSM's total). O\*NET: `in_demand_flag` and `hot_technology_flag`, unit `flag` (0 or 1); `postings`, unit `postings` (count of US job ads). |
| `baseline`, `recent` | `{period, value}`. OpenAlex: counts for year Y−3 and Y. DOSM: shares for quarter Q−4 and Q. O\*NET flags: the two releases compared, as `{period: "30.2", value}` and `{period: "30.3", value}` with value 0 or 1; Hot Technologies counts: the counting window (e.g. `1/25–12/25`). `value` may be `null` when the source has no number. |
| `change` | `{value, unit, relativePercent}`. OpenAlex: `log2` of recent ÷ baseline. DOSM: `pp` (percentage points, year on year). O\*NET flags: `flag` (+1 added, −1 dropped), `relativePercent` `null`; Hot Technologies counts: `postings`, value `null`. `null` when it cannot be computed. |
| `momentum` (optional, OpenAlex only) | Research Momentum Index `{method: "log2-v1", k: 20, windowYears: 3, value, ratio, capped, state}`. A chart value only. |
| `shareMomentum` (optional, OpenAlex only) | Same formula on topic ÷ Computer Science counts: `{referencePopulation, value, ratio}`. Never blended with `momentum`. |
| `direction` | `rising`, `declining`, `stable`, `emerging`, `mixed` or `null` (no direction when evidence is insufficient). `emerging` is OpenAlex only. |
| `volatility` | `{value, unit, label}` or `null`. Unit `log_points` (OpenAlex) or `pp` (DOSM); label `low`, `moderate`, `high`. |
| `evidenceSufficiency` | `sufficient`, `insufficient_evidence`, `insufficient_comparable_evidence` (a possible structural break lies inside the comparison). |
| `evidenceQuality` | `strong`, `moderate`, `limited`; `null` unless sufficient. |
| `reasons` | Machine codes explaining the result, e.g. `possible_break`, `new_reporting_category`, `small_counts`, `few_clean_steps`, `steps_disagree`, `high_volatility`, `revision_over_5`, `zero_baseline`, `fewer_years`, `missing_value`, `dropped_to_zero`. |
| `rule` (optional) | `{key, vars}`: the trend rule that decided the result. `key` is an i18n string key (e.g. `rdRuleRising`, `rdRuleDosmBreak`); `vars` holds the numbers and limits it used, for the evidence panel's plain-words explanation. |
| `steps` (optional) | The step changes the rule checked. OpenAlex (in time order): `log2` of the three annual changes Y−3→Y−2, Y−2→Y−1, Y−1→Y. DOSM (latest first): YoY pp of Q, Q−1, Q−2. `null` where a step cannot be computed or is not clean; `[]` when evidence is insufficient before steps are read. |
| `breaks` | Possible structural breaks that touch this signal's comparisons: `{period, status, reviewId?}`, status `unreviewed`, `confirmed`, `dismissed_counts`, `dismissed_shares`. |
| `revisions` | `{count, items: [{period, old, new}]}`: changed historical values found against the previous snapshot. |
| `classification` | `{system, version, readAt, countingRule?}` of the source's classification. |
| `mappingPath` (optional) | `[{system, code, version, source, sourceUrl, status}]` when the entity was reached through a mapping. Not produced in Round 1: OpenAlex topics and DOSM groups are read directly. |
| `sourceSnapshotIds` | The immutable snapshots the numbers came from. |
| `evidenceLinks` | `[{label, url}]`, never empty: the OpenAlex topic page (`https://openalex.org/T…`) and its works query, or DOSM's release page and data file. |
| `publishedAt`, `fetchedAt` | Source publication date (DOSM) and fetch time. |
| `methodVersion` | `openalex-count-v1`, `dosm-share-v1`, `onet-flag-v1` (flags) or `onet-postings-v1` (Hot Technologies counts). |
| `configVersion` | `radar-config/v1` (all thresholds). |
| `mappingVersion` | Topic signals: the field ↔ topic mapping version, and once the owner has stored decisions, the file version plus the decisions version, e.g. `radar-field-topics/v1+decisions:decisions-0123456789abcdef` (`fieldTopicMappingVersion` in `shared/radar/pipeline.js`). A field ↔ topic decision is applied at once by the same recalculation as a break review (a new manifest; if that cannot publish, at the next refresh), so the manifest's `mappingVersion` and its topic signals name the decisions they were built with. Group signals: the occupation bridge version. |

There is **no** `score`, `weight`, `rank`, `match`, `opportunityScore` or `fitScore` field at any depth, and no key
containing score, weight, rank, match or opportunit… (any case, e.g. `matchScore`, `opportunityIndex`).
`validateSignal` rejects a signal that has one, that lacks evidence links, that has no `mappingVersion` (or other
version string), or that uses an unknown enum value.

Same snapshots, references, reviews and versions → byte-identical signals.

## O\*NET skill signals (skill trends)

Spec: `docs/superpowers/specs/2026-10-30-radar-skill-trends-design.md` (D23–D27). Labels that always go with them:
"US job ads (Lightcast via O\*NET), not Malaysian" and "Software and technology skills only".

| Signal id | What it says |
|---|---|
| `onet:indemand:<O*NET code>:<software example>` | A software or technology skill became (`rising`) or stopped being (`declining`) "In Demand" for that O\*NET job between two releases. Level `occupation_skill`, metric `in_demand_flag`. `evidenceSufficiency` `sufficient`, `evidenceQuality` `limited`, reasons `us_postings`, `software_only`. |
| `onet:hot:<technology>` | A technology became or stopped being a Hot Technology between two releases. Level `skill`, metric `hot_technology_flag`. Same sufficiency, quality and reasons. |
| `onet:postings:<technology>` | Posting count of one Hot Technology for a counting window. Level `skill`, metric `postings`, `direction` `null`, `insufficient_evidence`, reason `first_snapshot` while the snapshot holds a single window (**no direction rule yet**, see below). No `__total__` signal. |

Rules (do not infer more):
- **Comparison rule (D25):** a release is compared with the most recent earlier release whose flags differ, and both
  release numbers are shown. 31.0 has the same file as 30.3, so the current comparison is 30.2 → 30.3 and the screen
  says "unchanged in 31.0". Measured 30.2 → 30.3: 5 newly Hot (Google Looker Analytics, Grafana Labs Grafana Cloud,
  Intuit TurboTax, Microsoft Power Platform software, Prometheus), 0 dropped; In Demand: 151 added, 219 dropped.
- **Only changes become signals (D26).** Skills that stayed "In Demand" are reference data in the export, not signals.
- **eMASCO jobs have no official link to O\*NET (D27):** "skill list not available". Matching must not invent a
  crosswalk.
- **A flag is not a score.** "In Demand" is O\*NET's yes/no mark, and the data are US job ads, software and technology
  skills only: no Malaysian demand, no general or soft skills.
- **Hot Technologies direction (B)** stays `null` until a second counting window exists. Which rule then decides
  rising or falling needs the owner's decision (D24); no threshold exists.

`references.onetSkills` in the export: `{release, comparedWith, inDemand, hot}`. `release` is the latest release (e.g.
`31.0`), `comparedWith` the earlier set id it was compared with (`30.2`), `inDemand` the still-in-demand lists (kept,
reference data), `hot` the current Hot Technologies. It is `null` or empty when no O\*NET data is loaded. `GET
/api/radar/skills` gives the screen the release, the changes per job, the Hot lists, the posting counts, the labels
and the source links.

## Pipeline output

`runPipeline({snapshots: {openalex, dosm}, references, reviews, config, manifestId})` returns
`{signals, breaks, context: {dosm}, momentum: {[axisId]: {counts, share}}}`. `context.dosm` is DOSM's
quarter-on-quarter change in total online job advertisements: **context only**, never used to classify anything.

## Dependency report

`dependencyReport(before, after, references)` says what a change reaches:

- `changedSignals`: `[{signalId, before, after, changes}]`; `changes` from `added`, `removed`, `direction`,
  `evidenceSufficiency`, `evidenceQuality`, `values`, `reasons`, `breaks`, `revisions`, `versions`.
- `affected.groups`: changed DOSM groups.
- `affected.occupations`: eMASCO jobs in a changed group, each `level: "group"` with its mapping path (eMASCO code →
  first digit → MASCO 2020 major group). O\*NET jobs reach a group only once every bridge step is sourced; in Round 1
  they do not.
- `affected.fields`: ISCED-F fields linked to a changed topic through an **approved** field ↔ topic record only:
  `{iscedCode, axisId, mappingId, level, excludes}`. `level` is `broad`, `narrow` or `detailed`. A broad or narrow
  approval applies to every field under it, except the more detailed codes in `excludes`, where a rejection on the
  same axis decides instead (spec §4.2, the same rule as personal relevance). An approval that is itself overridden
  at its own code by another decision is not listed.
- `affected.skills`: always `[{reason: "skill_demand_insufficient_evidence"}]` in Round 1.

Arrays are sorted by id and keys keep a fixed order, so the same inputs give an identical report.

## What Matching may read

- `direction`, `evidenceSufficiency`, `evidenceQuality`, `reasons`, `volatility`, `change` and the periods, always
  together with `evidenceKind` and `granularity`.
- The approved field ↔ topic records and the occupation bridge from the references, to say *how* a profile item
  connects to a signal, showing the path.
- **Field ↔ topic links must be resolved with the `effectiveFieldTopics` rule** (`shared/radar/relevance.js`): a
  record at a broad (2-digit) or narrow (3-digit) ISCED-F level applies to every field under it, and per axis the most
  detailed approved or rejected record decides. So a detailed rejection (e.g. `0613` × language) overrides a broader
  approval (`06` × language) for that field. Never treat an exported record as a link on its own: rejected records
  are there only to cancel broader approvals.

## What Matching must not infer

- **A group signal is not a job signal.** A DOSM major-group trend says nothing about one job inside the group. Jobs
  reached through a group must be shown as group level, with the path.
- **Research is not hiring.** An OpenAlex topic rising means more papers, not more jobs or more demand for a skill.
- **No skill demand.** Round 1 has no evidence about demand for any skill.
- **Insufficient means no direction.** A `null` direction or `insufficient_*` must not be read as stable or as zero.
- **The momentum index is a chart value**, never a direction or a ranking. Signals are not to be turned into a score,
  weight or rank of a person, a job or a field.
- **Pending or rejected field ↔ topic proposals link nothing.**
- **The DOSM context indicator** classifies nothing.
