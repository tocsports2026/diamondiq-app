---
name: Ingestion & Provenance Layer
description: Architecture, schema, and pipeline decisions for the DiamondIQ data ingestion system.
---

## Core architectural decisions

**No AI fallback for missing data.** If the query engine finds zero matching records, it returns a DATA GAP and auto-creates an Intelligence Request. Never fabricates.

**Single canonical table for draft selections.** `draft_players` is the one source of truth. Club draft queries, comparable-player queries, and bonus queries are all SQL filters on this table. `club_draft_history` does NOT exist as a separate table.

**Worksheet-level + column-level classification required.** The 2021-2026 MLB Draft Payroll workbook is the first real ingestion case and demonstrates why each column needs its own evidence label. Example: on the "2026 Draft Projection" sheet, "Slot Value" is Verified Public Information (skip=false) while "Projected Bonus" is DiamondIQ Analysis/Inference (skip=true — never import as fact).

**Verification gate for athlete-visible reports.** `unverified` records may be used internally/by Admin only. Athlete-visible reports require `osm_reviewed` or `cross_verified` unless Admin explicitly overrides during report review.

**Evidence-strength tiers (configurable via methodology_rules).** n=0 → DATA GAP. n=1–4 → LIMITED SAMPLE (disclosed prominently). n=5–19 → MODERATE. n≥20 → STRONG. All thresholds are configurable by OSM Admin, not hard-coded.

**is_fixture hard wall.** Every data table has `is_fixture BOOLEAN NOT NULL DEFAULT FALSE`. Query engine always appends `AND is_fixture = FALSE`. Fixture reports have Publish disabled in the UI. A hard server error fires if a fixture record reaches the production report builder.

**Source file version immutability.** `source_file_versions` table stores SHA-256 hash of every imported file. Re-importing an updated file creates a NEW row. Records from the old version retain their `source_file_version_id` forever — provenance for previously generated reports is never overwritten.

**Conflict flagging.** When two sources disagree on the same player/year/pick, both rows are stored, both get `conflict_flag = TRUE`, an Admin notification is created, and neither can be used in athlete-visible reports until OSM designates the `approved_record_id`.

## New tables added
- `source_file_versions` — immutable record of each imported file version
- `ingestion_jobs` — one per import attempt; holds `parsed_structure` JSONB and `column_map` JSONB
- `ingestion_errors` — per-row validation errors
- `draft_players` — canonical draft selection records with full provenance columns
- `slot_values` — official slot values by pick/year
- `historical_rankings` — approved ranking source records
- `report_citations` — links every report section to its source record IDs

## Migration (server/db/migrate.ts)
- Runs on every startup after `initDb()`, before `seedIfEmpty()`
- ALTER TABLE data_library: 8 new columns (is_fixture, last_import_at, drive_file_id, etc.)
- ALTER TABLE reports: is_fixture column
- UPDATE fixture data: marks DEV FIXTURE data_library rows and DIQ-DEMO001/002/003 reports as is_fixture=TRUE
- Seeds default sample_size_thresholds methodology rule

## Ingestion pipeline (server/routes/ingestion.ts)
- POST /api/admin/ingestion/upload — multer (50MB), SHA-256, XLSX.readFile, worksheet parsing, type detection
- GET /api/admin/ingestion — list jobs
- GET /api/admin/ingestion/:jobId — job + parsed_structure
- POST /api/admin/ingestion/:jobId/classify — save Admin mapping, status → 'mapped', NO rows committed
- DELETE /api/admin/ingestion/:jobId — cancel + cleanup temp file

## Worksheet type detection (confidence)
Heuristic name-based matching:
- readme/notes/methodology → documentation (high)
- chart/graph → chart (high)
- projection/forecast/model → analysis (high)
- trend/analysis/calculated → calculated (high)
- anything else → source (low — requires Admin confirmation)

## Column detection working examples (test workbook)
- Team → mlb_org (draft_players) ✓
- Year → draft_year (draft_players) ✓
- Pick → draft_pick_overall (draft_players) ✓
- Player → player_name (draft_players) ✓
- Slot Value → bonus_slot_value (draft_players) ✓
- "Projected Bonus" → detectedEvidenceLabel: "DiamondIQ Analysis / Inference" ✓ (PROJECTION_ pattern match)
- "Avg Team Payroll" → detectedEvidenceLabel: "Calculated Results" ✓ (avg_ pattern match)

## Admin UI
- AdminDataLibrary: ⬆ UPLOAD FILE button → file picker → POST /upload → auto-navigate to review
- AdminIngestionReview: per-worksheet classification + per-column mapping + evidence label overrides + dataset metadata + Save Mapping
- DEV FIXTURE badge shown on all fixture datasets in the registry table
- Publish disabled on fixture reports (enforced in AdminReportReview)

## What is NOT yet built
- Stage 5 (commit): POST /api/admin/ingestion/:jobId/commit — inserts rows into draft_players etc. Intentionally not built yet. Requires OSM review of mapping first.
- Google Drive inventory connector (Stage 6)
- Conflict resolution UI (Stage 10)
- Data health dashboard (Stage 13)
