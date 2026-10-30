# Task 17 report: Radar strings (EN, BM, 中文)

Branch: worktree-agent-a51664ca3e06e5e4d (reset to claude/future-radar, then one commit).
Worktree: C:\Users\guiro\XH_Cat_Final\.claude\worktrees\agent-a51664ca3e06e5e4d

## Built
246 `rd*` keys appended to shared/strings/en.js, ms.js, zh.js (same order, grouped by comment lines). New test tests/radar/strings.test.js.

## Key groups
- Fixed copy: rdTooltip, rdWhyIndex, rdWhyTitle, rdB1Title, rdContextLabel, rdNoFieldLinks, rdNoRankings, rdIce, rdIceReason ({period},{next}), rdDevStore
- Header, tabs (rdTabSK first, rdTabAI second, with rdTabSKq/rdTabAIq), view all/mine, sources, profile prompt
- Section titles (A1, A2, A5, B2, B5, B6), B2 three columns and notes, linked jobs/groups/axes, units
- Metric toggle, rings (rdRingHalved/Same/Doubled/Four), window labels, few-axes message, tags
- Axis labels rdAxis_* (six; owner review comment)
- rdDir_* (6 incl. insufficient), rdVol_*, rdSuff_* (3), rdQual_* (3)
- rdReason_* : fewer_years, missing_value, dropped_to_zero, zero_baseline, steps_disagree, high_volatility, revision_over_5, small_counts, new_reporting_category, possible_structural_break, not_material, few_clean_steps, possible_break (owner review comment)
- Rule texts: the 10 trend rules (placeholders match the vars in shared/radar/trend.js) and the 8 DOSM rules (rdRuleDosm*; no placeholders)
- Momentum states rdMom_* (ok, no_activity, no_baseline, dropped_to_zero, invalid), rdMomCapped, rdMomSmall
- Five state dimensions: rdDim_* labels and rdAvail_/rdFresh_/rdHealth_/rdServed_ values, plus last fetch, published, period, manifest
- Evidence panel rdEv*
- rdErr_* for all 16 new error codes
- Admin (rdAdmin*, columns rdCol*, approve/reject/confirm/dismiss, statuses) and break review statuses rdBreak_unreviewed/confirmed/dismissed_counts/dismissed_shares
- Judge (rdJudge*)

## TDD
Test written first: 4 of 6 failed. After adding keys: `npx vitest run --dir tests` gives 37 files, 302 tests passed (includes tests/i18n.test.js).
Test checks: exact fixed English copies; required key groups in all 3 languages and non-empty; same {placeholders} in all languages; rule placeholders match trend.js vars; scans only existing radar.js, radarAdmin.js and charts/*.js for `'rd…'` keys (R5); every rdRule and reason code in shared/radar/trend.js has a key.

## Files
shared/strings/en.js, ms.js, zh.js, tests/radar/strings.test.js, this report.

## Self-review
- Files keep CRLF and UTF-8. Axis and reason keys carry `// translation: owner review` in ms/zh.
- Skipped docs/record step as instructed.

## Concerns
- Task 5 was not in the repo, so DOSM rule texts have no placeholders (a wrong placeholder would show raw). If Task 5 passes vars, add placeholders to all three languages.
- Admin/judge/evidence labels are my reading of the mockup; the screen tasks may need a few more keys (the test will flag any missing key they use).
- Strings cannot say "pp" alone in BM/中文 beyond rdPpUnit; check on screen.
