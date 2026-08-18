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

Supporting tables: methodology_versions, record_derivations, osm_articles, osm_article_annotations, report_citations.

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
- Stage 5 (commit — write production rows): NOT YET BUILT — awaiting OSM approval of Job #3 commit preview
- Stage 6 (Google Drive connector): NOT STARTED

## Job #3 — Real OSM Workbook
- File: 2021-2026 MLB Draft Payroll and Draft Summaries.xlsx (44K)
- source_file_version_id: 3, dataset_id: 8, ingestion_job_id: 3
- Status: preview (reset by reparse — zero production rows committed)
- File stored at /tmp/diq_uploads/279f43a80afb4d8efa07db33.xlsx

## Job #3 Commit Preview (PENDING OSM APPROVAL — NOT COMMITTED)
Layer 1 Factual Records:  782  (204 payroll rows + 204 spend rows post-unpivot + 36 first-round-pick + 36 pool + misc)
Layer 2 Derived Metrics:  397
Layer 3 OSM Findings:      39
Layer 4 Inferences:       108
Total Records:           1326
Duplicates detected:        2  (cross-sheet metrics appearing in multiple sheets)
Unmapped fields:            3  (need Admin mapping override: 2025 Rank, CBT Tier, Penalty Proxy)
Requires OSM review:        7

## Admin Overrides Needed Before Commit
These auto-classifier ambiguities require Admin override in the mapping UI:
1. "5-Yr CAGR (21→25)" (Payroll + Spend): set Layer 2 → cagr_payroll_5yr / cagr_pool_5yr
2. "2025 Rank (1=largest)" (Draft Spend): set Layer 2 → pool_rank
3. "CBT Payroll Tier" (Trend Analysis): set Layer 2 → cbt_payroll_tier
4. "Times Picked-10-Spots Penalty (proxy)": set Layer 2 → times_penalty_proxy
5. "Draft Pool Tier": set Layer 2 → draft_pool_tier
6. "Payroll ↔ Draft Pool Correlation Direction": set Layer 3 → finding:correlation
7. "Assumed Total-Spend-vs-Pool Rate (%)": set Layer 3 → finding:methodology_assumption
8. "Times Over CBT Threshold" (Payroll sheet): currently L1 — Admin should override to L2

## Ingestion Route Endpoints
- POST /api/admin/ingestion/upload
- GET  /api/admin/ingestion
- GET  /api/admin/ingestion/:jobId
- POST /api/admin/ingestion/:jobId/classify
- POST /api/admin/ingestion/:jobId/reparse
- POST /api/admin/ingestion/:jobId/commit-preview  ← NEW
- DELETE /api/admin/ingestion/:jobId

## Provenance Chain (Full Audit)
Report claim → report_citations (evidence_layer 1-4) → Layer record → record_derivations → Layer 1 source records → source_file_versions (SHA-256) → ingestion_jobs → source_worksheet + excel row/col + preamble

## Dev Credentials
Admin: admin@ocmsports.com / DiamondIQ2024!
Athlete: jackson.miller@demo.com / Athlete2024!
