---
name: Ingestion & Provenance Layer
description: Schema, pipeline, four-layer architecture, and all key decisions for DiamondIQ's data-first ingestion system.
---

## Four-Layer Evidence Architecture (APPROVED AND IMPLEMENTED)

Every data record belongs to exactly one layer. Evidence class is enforced by CHECK constraint.

| Layer | Table | evidence_class |
|---|---|---|
| 1 — Canonical Facts | club_payroll_history, club_draft_spend_history, draft_players, slot_values, historical_rankings | verified_public |
| 2 — Derived Metrics | derived_metrics | calculated \| osm_proprietary |
| 3 — OSM Research | osm_research_findings | osm_proprietary |
| 4 — Inferences | diamondiq_inferences | diamondiq_inference (enforced) |

Supporting tables: methodology_versions, record_derivations, record_source_assertions, osm_articles, osm_article_annotations, report_citations.

## Layer 1 — Canonical Fact Tables (CLEAN)
- One atomic fact per row. No aggregates, no OSM reads, no model outputs on these tables.
- Every row carries: ingestion_job_id, source_file_version_id, source_worksheet, source_excel_row, source_excel_column, source_preamble, evidence_class, verification_status.
- Wide-format workbooks (year columns) are UNPIVOTED at Stage 5 commit into normalized rows.
- `is_fixture = TRUE` hard wall — fixture rows cannot be published.

## Layer 2 — Derived Metrics
- One row per (entity_type, entity_key, metric_name, period_start, period_end, methodology_version_id, source_file_version_id).
- Multiple calculation windows and methodology versions coexist — never overwrite historical results.
- references methodology_versions.id (HOW it was computed).
- record_derivations links each derived row to its source Layer 1 record IDs.

## Layer 3 — OSM Research Findings
- finding_type CHECK: pattern_read, correlation, scouting_note, research_note, methodology_assumption, behavioral_classification.
- source_type: excel_worksheet | research_article | direct_osm_entry.
- article_id → osm_articles.id when sourced from article annotation.

## Layer 4 — DiamondIQ Inferences
- evidence_class = 'diamondiq_inference' ENFORCED by CHECK constraint (cannot be overridden).
- osm_review_status must be 'approved' before inference appears in athlete-visible reports.
- inference_type CHECK: draft_spend_projection, pool_overage_projection, bonus_projection, signability_estimate, round_probability, outcome_estimate, confidence_label, other.

## Article Ingestion Architecture (APPROVED)
- osm_articles: public source record (evidence_class = verified_public by default)
- osm_article_annotations: OSM's notes ON the article (evidence_class = osm_proprietary — ENFORCED)
- These are ALWAYS separate records with separate evidence classes — never combined.

## Methodology Versions (SEEDED)
Rows seeded on startup: avg_5yr v1.0, cagr_5yr v1.0, count_seasons_over_threshold v1.0, pct_vs_avg v1.0, cbt_payroll_tier v1.0, draft_pool_tier v1.0, sample_size_thresholds v1.0.

## record_source_assertions (NEW TABLE — BUILT)
When the same fact appears in multiple worksheets, ONE canonical production record is written.
Each additional worksheet location is preserved as a record_source_assertions row:
  canonical_record_table, canonical_record_id, worksheet, excel_row, excel_column, asserted_value, conflicts_with_canonical.
Conflict detection is automatic — conflicts_with_canonical=TRUE if value disagrees with canonical.

## Classification vs Calculation Rule
- CBT Payroll Tier / Draft Pool Tier: evidence_class='calculated' if OSM defines thresholds in methodology_versions, 'osm_proprietary' if applied by analyst judgment. Admin decides at ingestion review.
- Assumed Spend Rate: always L3 osm_research_findings / methodology_assumption — NOT a public fact.

## Data-First Retrieval Order (ENGINE RULE — NOT YET BUILT)
A → verified_public Layer 1 records  
B → osm_proprietary Layer 3 findings  
C → calculated Layer 2 metrics (with methodology + derivation chain)  
D → diamondiq_inference Layer 4 (only if osm_review_status='approved', explicitly labelled)  
E → DATA GAP → auto-create intelligence_request  
NEVER silently substitute AI/model knowledge.

## Ingestion Pipeline Status
- Stage 1–4 (upload, parse, map, preview): BUILT
- Stage 5 (commit — write production rows): BUILT AND USED FOR JOB #3
- Stage 6 (Google Drive connector): NOT STARTED

## Stage 5 Commit — Key Implementation Details
- Reads raw workbook from disk via XLSX, NOT from parsed_structure JSON (only has sample rows).
- Filters Club column to MLB_CLUBS set (30 clubs) before any write — LEAGUE TOTAL and note rows are skipped.
- All writes in a single pg BEGIN/COMMIT transaction — full rollback on any error.
- Unpivots year-pivot columns into normalized (club, season) rows.
- Draft Spend History: 2021-2025 → total_draft_spend; 2026 → pool_allotment (official, not yet actual).
- Payroll 2026: payroll_data_type='preliminary' (partial season per source preamble).
- 2026 first_round_pick: UPDATE on existing 2026 draft_spend row from Projection sheet (not a new row).
- record_source_assertions written for 240 cross-sheet repetitions (0 conflicts found in Job #3).
- record_derivations written for all L2 metrics and L4 inferences → L1 source records.
- Requires pool import from db/index.ts (not just query/queryOne) for pg transaction client.

## Job #3 — COMMITTED (2021-2026 MLB Draft Payroll and Draft Summaries.xlsx)
Status: complete  
Committed: 2026-08-18

| Layer | Table | Rows |
|---|---|---|
| L1 | club_payroll_history | 180 |
| L1 | club_draft_spend_history | 180 |
| L2 | derived_metrics | 300 |
| L3 | osm_research_findings | 99 |
| L4 | diamondiq_inferences | 90 |
| — | record_source_assertions | 240 |
| — | record_derivations | 810 |
| **Total production** | | **849** |

## L3 Count: 99 vs Dry-Run Expected 41 — Explanation (NOT AN ERROR)
All 99 are legitimate OSM research findings. Dry-run expected 41 was wrong in three ways:
1. Correction #7 (Correlation Direction → L3) produces 30 per-club correlation findings — not counted in dry-run total.
2. Methodology assumptions written 1 per club (30 rows, preserving exact per-club rates) vs dry-run's 3-per-tier estimate.
3. "KEY LEAGUE-WIDE TRENDS" header row stored as a research_note (9 total, not 8).
Breakdown: 30 pattern_read + 30 correlation + 30 methodology_assumption + 9 research_note = 99.

## L2 Metrics Committed (10 per club × 30 clubs = 300)
avg_5yr_payroll, cagr_payroll_5yr, times_over_cbt, avg_pool_5yr, cagr_pool_5yr, pool_rank, cbt_payroll_tier, times_penalty_proxy, draft_pool_tier, pct_vs_avg_pool

## 9 Admin Mapping Corrections Applied at Stage 5 Commit
1. Payroll CAGR → L2 cagr_payroll_5yr  
2. Draft Spend CAGR → L2 cagr_pool_5yr  
3. 2025 Rank → L2 pool_rank  
4. CBT Payroll Tier → L2 cbt_payroll_tier (osm_proprietary)  
5. Times Picked-10-Spots Penalty proxy → L2 times_penalty_proxy  
6. Draft Pool Tier → L2 draft_pool_tier (osm_proprietary)  
7. Payroll ↔ Draft Pool Correlation → L3 correlation  
8. Assumed Total-Spend-vs-Pool Rate → L3 methodology_assumption (per club)  
9. Times Over CBT Threshold → L2 times_over_cbt (NOT L1)

## Dev Credentials
Admin: admin@ocmsports.com / DiamondIQ2024!
Athlete: jackson.miller@demo.com / Athlete2024!

## league_facts Table (NEW — committed with Job #4)
- Stores league-level L1 verified_public facts (not club-specific)
- Columns: fact_type, season, numeric_value, text_value, evidence_class, full provenance cols, is_fixture
- UNIQUE (fact_type, season, source_file_version_id)
- fact_types used so far: 'cbt_threshold', 'league_draft_actual_spend'
- Indexed on (fact_type, season) and ingestion_job_id

## Commit Endpoint — Dual Mode (IMPORTANT)
- Detects production table state at commit time
- isFirstImport = all five production tables empty → runs original first-import path
- else → runs dedup path: bulk-loads existing canonical IDs, writes source assertions, writes league_facts
- Both paths share UPDATE JOB STATUS + COMMIT + response
- Response includes `mode: "dedup"` field to distinguish

## Job #4 — COMMITTED (2021-2025 Club Spending Draft Analysis.xlsx)
Status: complete
Committed: 2026-08-18

| Item | Count |
|---|---|
| New canonical club-level records | 0 |
| New league_facts records | 11 (6 CBT threshold + 5 actual spend) |
| Source assertions written | 849 |
| Conflicts with Job #3 | 0 |
| Fixture records introduced | 0 |

CBT thresholds: $210M (2021), $230M (2022), $233M (2023), $237M (2024), $241M (2025), $244M (2026)
League actual spend: $291.4M, $327M, $313.9M, $374.3M, $392.5M (2021-2025)

## Next Priority (Per OSM Approval)
- 2 additional Excel workbooks to ingest
- 21 annotated research articles to ingest (osm_articles + osm_article_annotations pipeline not yet built)
- Stage 6 (Google Drive connector): NOT STARTED
