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

## record_source_assertions (BUILT)
When the same fact appears in multiple worksheets, ONE canonical production record is written.
Each additional worksheet location is preserved as a record_source_assertions row:
  canonical_record_table, canonical_record_id, worksheet, excel_row, excel_column, asserted_value, conflicts_with_canonical.
Conflict detection is automatic — conflicts_with_canonical=TRUE if value disagrees with canonical.

## Classification vs Calculation Rule
- CBT Payroll Tier / Draft Pool Tier: evidence_class='calculated' if OSM defines thresholds in methodology_versions, 'osm_proprietary' if applied by analyst judgment. Admin decides at ingestion review.
- Assumed Spend Rate: always L3 osm_research_findings / methodology_assumption — NOT a public fact.

## Data-First Retrieval Order (ENGINE RULE)
A → verified_public Layer 1 records (including draft_players)
B → osm_proprietary Layer 3 findings
C → calculated Layer 2 metrics (with methodology + derivation chain)
D → diamondiq_inference Layer 4 (only if osm_review_status='approved', explicitly labelled)
E → DATA GAP → auto-create intelligence_request
NEVER silently substitute AI/model knowledge.

## Ingestion Pipeline Status
- Stage 1–4 (upload, parse, map, preview): BUILT
- Stage 5 (commit — write production rows): BUILT AND IN USE
- Stage 6 (Google Drive connector): NOT STARTED

## Commit Endpoint — Multi-Mode Detection (CRITICAL)
Detection logic (in this order inside POST /:jobId/commit):
1. "SOURCE INDEX" sheet → article transcription path (Job #7)
2. "Drafted 2026" sheet → 2026 draft outcomes path (Job #8)
3. "Rds. 1-20" sheet → draft signings path (Job #5 and future years)
4. else → payroll/dedup path (isFirstImport flag decides first-import vs dedup)

Each path RETURNS early — no fall-through.

## Club Abbreviation → Full Org Name (IMPORTANT)
Draft signings workbooks use abbreviations. Ambiguous short forms:
- CHI → Chicago Cubs (CWS is listed separately for White Sox)
- LA → Los Angeles Dodgers (LAA is listed separately for Angels)
- NY → New York Mets (NYY is listed separately for Yankees)
- ATH → Athletics (Sacramento/Oakland)
Lookup map: ABBREV_TO_ORG in ingestion.ts shared helpers section.

## Draft Players Schema — New Columns (Added)
draft_players: draft_round_label (text), player_class (text), outcome_group (text),
  birthplace (text), dob (date), mlbam_player_id (integer), mlb_rank (integer), ndfa_match_status (text)
club_draft_spend_history: selections_count (integer), signings_count (integer), dollars_committed (numeric)
slot_values: source_worksheet (text)

## club_draft_spend_history — Column Semantics (IMPORTANT)
- total_draft_spend: Slot Total of Spend (sum of assigned pick slots 1-10) from Draft Spend History sheet
  — NOT the same as Dollars Committed (actual total bonus paid including overages)
- pool_allotment: Same value as total_draft_spend for 2021-2025; separately tracked for 2026 from projection
- dollars_committed: Actual signing bonus total paid (= Slot Total + overage). Distinct from total_draft_spend.
- over_under_pool: Dollars above or below pool (Dollars Committed - Slot Total)
- selections_count, signings_count: Filled from 2025 Pools sheet (Job #5) and 2026 Club Pools (Job #8)

## 2026 Actual Spend — DATA GAP NOW RESOLVED
Job #8 (DiamondIQ_2026_Draft_Outcomes_and_Undrafted_Population.xlsx) committed 2026 actual spend
(Dollars Committed) into club_draft_spend_history.total_draft_spend for all 30 clubs.
Example BAL 2026: pool_allotment=$13.11M, total_draft_spend=$13.77M, over_under_pool=$655,200.
The gap "2026 draft actual spend not yet committed" is CLOSED.

## Job Commit Counts (All Complete)

| Job | Mode | Key Counts |
|---|---|---|
| #3 | first-import payroll | 849 canonical rows |
| #4 | dedup payroll | 849 source assertions, 11 league_facts |
| #5 | draft_signings_2025 | 746 draft_players, 615 slot_values, 30 pool updates, 30 RSAs |
| #6 | dedup payroll | 849 source assertions, 11 league_facts |
| #7 | article_transcription | 27 osm_articles, 6,858 transcription lines |
| #8 | draft_outcomes_2026 | 2,377 draft_players, 613 slot_values, 30 pool updates |

## Draft Player outcome_group Values
- "Drafted" — picked in Rule 4 Draft (rounds 1-20 and special rounds)
- "Undrafted" — appeared on undrafted eligibility list, did NOT sign as NDFA
- "Undrafted / NDFA" — either: undrafted player who signed as NDFA (exact name match found),
  or NDFA signing with no undrafted list match (stored as separate row)
Passed-Over Players (Job #5 Rds 11+) → outcome_group = "Undrafted / NDFA"

## NDFA Deduplication Logic (Job #8)
Undrafted 2026 sheet rows with Match Method = "Exact normalized name match":
  → outcome_group updated to "Undrafted / NDFA", NDFA bonus/date/club populated on undrafted row
NDFA Signings 2026 rows with match_status = "No exact-name match — not linked":
  → inserted as additional separate draft_players rows
Result: 1,724 undrafted rows + 57 unmatched NDFA rows = 1,781 non-drafted records in Job #8.

## Evidence Retrieval — clubRetrieval.ts (BUILT AND EXTENDED)
Sections produced for club reports:
  A: Historical Payroll Profile (club_payroll_history)
  B: Historical Draft Spending (club_draft_spend_history)
  B.5: Individual Draft Records (draft_players — NEW)
  C: Derived Trend Metrics (derived_metrics)
  D: OSM Research Findings (osm_research_findings)
  E: DiamondIQ Inferences (diamondiq_inferences)
  F: Relevant External Research (osm_article_transcription_lines)
  G: Data Gaps & Limitations

draft_players query: WHERE mlb_org = $club AND is_fixture=FALSE, ORDER BY draft_year DESC, draft_round ASC.

## Dev Credentials
Admin: admin@ocmsports.com / DiamondIQ2024!
Athlete profile id=1, user_id=2

## Next Priority
- Draft and NIL report types still use buildInitialContent() placeholder — evidence engine not yet extended
- stage 6 (Google Drive connector): NOT STARTED
- OSM article annotations pipeline (osm_article_annotations): NOT STARTED
- No remaining stuck MAPPED jobs — all 7 jobs are complete or preview (job #2 = preview test file)
