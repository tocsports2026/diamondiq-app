-- DiamondIQ Database Schema
-- Four-layer evidence architecture:
--   Layer 1 — Canonical Factual Records  (verified_public)
--   Layer 2 — Derived Metrics            (calculated | osm_proprietary)
--   Layer 3 — OSM Research Findings      (osm_proprietary)
--   Layer 4 — DiamondIQ Inferences       (diamondiq_inference)

-- ── Sessions (connect-pg-simple) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'athlete' CHECK (role IN ('athlete','osm_staff','osm_admin')),
  name VARCHAR(255) NOT NULL,
  athlete_id INTEGER,
  last_login TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Athlete profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS athlete_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(100),
  image_url TEXT,
  dob DATE,
  hometown VARCHAR(255),
  position VARCHAR(50) NOT NULL,
  secondary_position VARCHAR(50),
  bats VARCHAR(5),
  throws VARCHAR(5),
  height_in INTEGER,
  weight_lbs INTEGER,
  school VARCHAR(255),
  conference VARCHAR(100),
  level VARCHAR(50),
  draft_year INTEGER,
  draft_eligibility VARCHAR(100),
  -- NIL
  social_links JSONB DEFAULT '{}',
  verified_analytics JSONB DEFAULT '{}',
  personal_interests TEXT,
  causes TEXT,
  travel_preference TEXT,
  category_exclusions TEXT,
  brand_restrictions TEXT,
  -- Feature toggles
  feature_draft_intelligence BOOLEAN NOT NULL DEFAULT TRUE,
  feature_nil_intelligence BOOLEAN NOT NULL DEFAULT TRUE,
  feature_club_draft_intelligence BOOLEAN NOT NULL DEFAULT TRUE,
  feature_knowledge_center BOOLEAN NOT NULL DEFAULT TRUE,
  feature_nil_marketing_management BOOLEAN NOT NULL DEFAULT FALSE,
  feature_social_content_tools BOOLEAN NOT NULL DEFAULT FALSE,
  feature_calendar BOOLEAN NOT NULL DEFAULT FALSE,
  feature_agreements BOOLEAN NOT NULL DEFAULT FALSE,
  feature_deliverables BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Athlete rankings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS athlete_rankings (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  source VARCHAR(100) NOT NULL,
  ranking INTEGER NOT NULL,
  ranking_date DATE NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  source_record TEXT
);

-- ── Reports ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  report_ref VARCHAR(50) UNIQUE NOT NULL,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('draft','nil','club')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','updated','archived')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  research_question TEXT,
  content JSONB,
  admin_notes TEXT,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Intelligence requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_requests (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  missing_data TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  admin_response TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- ── Knowledge center articles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(100) NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMP,
  assigned_to_all BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Article → athlete assignment ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_assignments (
  article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  athlete_id INTEGER REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, athlete_id)
);

-- ── NIL Agreements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nil_agreements (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  brand VARCHAR(255) NOT NULL,
  term VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','expired','completed')),
  compensation_summary TEXT,
  next_obligation TEXT,
  completion_progress INTEGER NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  exclusivity_terms TEXT,
  payment_dates JSONB DEFAULT '[]',
  athlete_visible BOOLEAN NOT NULL DEFAULT TRUE,
  document_url TEXT,
  internal_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── NIL Deliverables ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nil_deliverables (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES nil_agreements(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  platform VARCHAR(100),
  due_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','content_needed','sent_to_brand','awaiting_approval','approved','posted','completed')),
  required_tag TEXT,
  required_language TEXT,
  prohibited_language TEXT,
  post_window_start TIMESTAMP,
  post_window_end TIMESTAMP,
  brand_assets TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Calendar events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'other',
  event_date DATE NOT NULL,
  event_time TIME,
  location VARCHAR(255),
  organization VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Data library ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_library (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('draft','club','nil','osm')),
  source VARCHAR(255) NOT NULL,
  years_covered VARCHAR(100),
  upload_date TIMESTAMP NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  record_count INTEGER,
  processing_status VARCHAR(20) NOT NULL DEFAULT 'ready' CHECK (processing_status IN ('processing','ready','error')),
  confidence VARCHAR(20) NOT NULL DEFAULT 'moderate' CHECK (confidence IN ('strong','moderate','limited','incomplete')),
  reports_using JSONB DEFAULT '[]',
  file_url TEXT,
  notes TEXT
);

-- ── Methodology rules (legacy — superseded by methodology_versions for new work)
CREATE TABLE IF NOT EXISTS methodology_rules (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  scope VARCHAR(100) NOT NULL,
  rule_text TEXT NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  effective_date DATE,
  author VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Popular questions (aggregated) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popular_questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  scope VARCHAR(50) NOT NULL DEFAULT 'all',
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Query log (anonymized) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS query_log (
  id SERIAL PRIMARY KEY,
  scope VARCHAR(50) NOT NULL,
  question_hash VARCHAR(64) NOT NULL,
  question_normalized TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INGESTION & PROVENANCE LAYER
-- ============================================================

-- Immutable record of every source file version ever imported.
-- Re-importing an updated file creates a NEW row here; existing
-- rows (and the records that reference them) are never mutated.
CREATE TABLE IF NOT EXISTS source_file_versions (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,         -- SHA-256 of the file bytes
  file_size_bytes INTEGER,
  file_type TEXT NOT NULL,         -- 'xlsx' | 'csv' | 'xls' | 'pdf' | 'docx'
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  drive_file_id TEXT,              -- Google Drive file ID if Drive-sourced
  drive_revision_id TEXT,          -- Drive internal revision ID
  drive_modified_at TIMESTAMP,     -- Drive last-modified at time of import
  row_count INTEGER,
  notes TEXT
);

-- One row per import attempt (one attempt = one source file version).
-- Tracks worksheet/column mapping decisions and processing status.
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT,                  -- temp storage path on server
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview','mapped','processing','complete','error','cancelled')),
  total_rows INTEGER,
  rows_imported INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  rows_errored INTEGER DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  triggered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parsed_structure JSONB,          -- worksheet names, headers, sample rows
  column_map JSONB,                -- Admin's worksheet/column mapping decisions
  notes TEXT
);

-- Per-row import errors for a job.
CREATE TABLE IF NOT EXISTS ingestion_errors (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  worksheet_name TEXT,
  source_row INTEGER,
  error_type TEXT,
  error_detail TEXT,
  raw_row_data JSONB,
  resolution TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution IN ('pending','ignored','corrected'))
);

-- ============================================================
-- SUPPORTING INFRASTRUCTURE — METHODOLOGY VERSIONS
-- ============================================================
-- Versioned, referenceable methodology definitions.
-- Every derived_metrics and diamondiq_inferences row references one of these
-- so the system can answer "HOW was this value produced?"
CREATE TABLE IF NOT EXISTS methodology_versions (
  id SERIAL PRIMARY KEY,
  methodology_type TEXT NOT NULL
    CHECK (methodology_type IN (
      'calculation',        -- mathematical formula (avg, CAGR, sum)
      'classification',     -- threshold-based tier assignment
      'projection_model',   -- multi-variable forecasting model
      'evidence_threshold', -- sample-size evidence-strength rules
      'scoring_rule',       -- scoring or ranking algorithm
      'osm_judgment_guide'  -- guidance for OSM analyst discretionary calls
    )),
  name TEXT NOT NULL,       -- stable snake_case name: 'avg_5yr_payroll', 'cbt_tier_v1'
  version TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  rule_definition JSONB NOT NULL DEFAULT '{}',
    -- For 'calculation':      { formula, window_years, required_fields }
    -- For 'classification':   { tiers: [{label, min, max}] }
    -- For 'projection_model': { inputs, assumptions, formula_ref }
    -- For 'evidence_threshold': mirrors methodology_rules rule_text structure
  effective_from TIMESTAMP NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMP,   -- NULL = currently active
  authored_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LAYER 1 — CANONICAL FACTUAL RECORDS
-- ============================================================
-- Shared provenance columns (applied via ALTER in migrate.ts where the
-- table already exists, and included inline for new installations):
--   evidence_class         TEXT 'verified_public' (usually)
--   source_excel_column    TEXT  — original column header at import
--   source_preamble        TEXT  — worksheet title/source attribution
--   ingestion_job_id       INTEGER REFERENCES ingestion_jobs(id)

-- Layer 1: canonical historical draft selection records.
CREATE TABLE IF NOT EXISTS draft_players (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_worksheet TEXT,
  source_excel_column TEXT,
  source_preamble TEXT,
  player_name TEXT NOT NULL,
  draft_year INTEGER NOT NULL,
  draft_round INTEGER,
  draft_pick_overall INTEGER,
  draft_pick_in_round INTEGER,
  mlb_org TEXT,
  position TEXT,
  secondary_position TEXT,
  bats VARCHAR(5),
  throws VARCHAR(5),
  height_in INTEGER,
  weight_lbs INTEGER,
  school TEXT,
  school_type TEXT,                -- 'HS' | 'JC' | '4yr'
  conference TEXT,
  state TEXT,
  country TEXT,
  age_at_draft NUMERIC(4,1),
  bonus_reported NUMERIC,          -- NULL = unreported, not zero
  bonus_slot_value NUMERIC,
  bonus_verified BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_source TEXT,
  signed BOOLEAN,
  signing_date DATE,
  career_outcome_summary TEXT,
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  season_applies TEXT,
  evidence_class TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP,
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER REFERENCES draft_players(id) ON DELETE SET NULL,
  osm_notes TEXT,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- Layer 1: official MLB slot values by pick and year.
CREATE TABLE IF NOT EXISTS slot_values (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_excel_column TEXT,
  source_preamble TEXT,
  draft_year INTEGER NOT NULL,
  pick_overall INTEGER NOT NULL,
  slot_value_usd NUMERIC NOT NULL,
  pool_eligible BOOLEAN DEFAULT TRUE,
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_class TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- Layer 1: approved ranking source records.
CREATE TABLE IF NOT EXISTS historical_rankings (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_excel_column TEXT,
  source_preamble TEXT,
  player_name TEXT,
  ranking_source TEXT NOT NULL,
  ranking_year INTEGER,
  ranking_date DATE,
  rank_position INTEGER,
  school TEXT,
  position TEXT,
  notes TEXT,
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_class TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- Layer 1: club-level payroll and CBT (Luxury Tax) history.
-- Rows are normalized: one row per (mlb_org, season).
-- Wide-format workbooks (one column per year) are unpivoted at Stage 5 commit.
CREATE TABLE IF NOT EXISTS club_payroll_history (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_row INTEGER,              -- original Excel row (before unpivot)
  source_worksheet TEXT,
  source_excel_column TEXT,        -- original column header (the year, e.g. "2021")
  source_preamble TEXT,            -- worksheet title/source attribution at import
  mlb_org TEXT NOT NULL,
  season INTEGER NOT NULL,
  total_payroll NUMERIC,           -- total 40-man payroll for the season
  cbt_threshold NUMERIC,           -- official CBT threshold for the season
  cbt_overage NUMERIC,             -- positive = over threshold; negative = under
  luxury_tax_paid NUMERIC,         -- actual tax remitted (NULL if under threshold)
  payroll_rank INTEGER,            -- league-wide payroll rank for the season
  payroll_data_type TEXT NOT NULL DEFAULT 'actual'
    CHECK (payroll_data_type IN ('actual','preliminary','projected')),
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_class TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER REFERENCES club_payroll_history(id) ON DELETE SET NULL,
  osm_notes TEXT,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (mlb_org, season, source_file_version_id)
);

-- Layer 1: club-level draft spending history.
-- Rows are normalized: one row per (mlb_org, draft_year).
-- Wide-format workbooks are unpivoted at Stage 5 commit.
CREATE TABLE IF NOT EXISTS club_draft_spend_history (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_worksheet TEXT,
  source_excel_column TEXT,        -- original column header (the year, e.g. "2021")
  source_preamble TEXT,
  mlb_org TEXT NOT NULL,
  draft_year INTEGER NOT NULL,
  total_draft_spend NUMERIC,       -- total reported draft bonus spend
  pool_allotment NUMERIC,          -- official MLB draft pool for this club/year
  over_under_pool NUMERIC,         -- positive = over pool; negative = under
  penalty_incurred BOOLEAN,        -- TRUE if club paid a penalty for going over
  picks_forfeited BOOLEAN,         -- TRUE if future picks were forfeited
  first_round_pick INTEGER,        -- club's official first-round pick number
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_class TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER REFERENCES club_draft_spend_history(id) ON DELETE SET NULL,
  osm_notes TEXT,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (mlb_org, draft_year, source_file_version_id)
);

-- ============================================================
-- LAYER 2 — DERIVED METRICS
-- ============================================================
-- One row per (entity, metric, time window, methodology version, source version).
-- Multiple calculation windows and methodology versions coexist without overwriting.
-- evidence_class is always 'calculated' or 'osm_proprietary' (for OSM-defined
-- classification judgments like tier assignments).
CREATE TABLE IF NOT EXISTS derived_metrics (
  id SERIAL PRIMARY KEY,
  -- What entity this metric describes
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('mlb_org','player','draft_class','league','draft_pick')),
  entity_key TEXT NOT NULL,        -- the identifying value (e.g. 'New York Yankees')
  -- What metric
  metric_name TEXT NOT NULL,       -- stable snake_case: 'avg_payroll_5yr', 'cbt_payroll_tier', ...
  -- The value (numeric OR text — set whichever applies)
  numeric_value NUMERIC,
  text_value TEXT,                 -- for text classifications: 'High', 'Mid', 'Low'
  -- Time window this metric covers
  period_start INTEGER,            -- year (e.g. 2021)
  period_end INTEGER,              -- year (e.g. 2025)
  period_label TEXT,               -- human label: '2021-2025 (5yr)'
  -- How it was produced
  evidence_class TEXT NOT NULL
    CHECK (evidence_class IN ('calculated','osm_proprietary')),
    -- 'calculated'     = deterministic formula, references methodology_version
    -- 'osm_proprietary' = OSM classification judgment
  methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
  -- Provenance
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_worksheet TEXT,
  source_excel_row INTEGER,        -- the row the aggregate value came from in the source
  source_excel_column TEXT,
  source_preamble TEXT,
  -- Lifecycle
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  calculated_by TEXT,              -- 'ingestion_job' | 'query_engine' | 'osm_staff'
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_derived_metrics_entity
  ON derived_metrics (entity_type, entity_key, metric_name);

-- ============================================================
-- RECORD DERIVATIONS — links derived/inference records to source facts
-- ============================================================
-- Every derived_metrics or diamondiq_inferences record that was computed from
-- Layer 1 factual records has one row here per source record used.
CREATE TABLE IF NOT EXISTS record_derivations (
  id SERIAL PRIMARY KEY,
  -- The derived or inference record
  derived_table TEXT NOT NULL
    CHECK (derived_table IN ('derived_metrics','diamondiq_inferences')),
  derived_record_id INTEGER NOT NULL,
  derived_field TEXT,              -- which metric/field on the derived record
  -- The source factual record
  source_table TEXT NOT NULL,      -- 'club_payroll_history', 'club_draft_spend_history', etc.
  source_record_id INTEGER NOT NULL,
  -- How it was derived
  derivation_method TEXT,          -- 'avg' | 'cagr' | 'sum' | 'model_v1' | 'count' | ...
  derivation_note TEXT,
  methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
  derived_at TIMESTAMP NOT NULL DEFAULT NOW(),
  derived_by TEXT                  -- 'ingestion_job' | 'query_engine' | 'osm_staff'
);

CREATE INDEX IF NOT EXISTS idx_record_derivations_derived
  ON record_derivations (derived_table, derived_record_id);
CREATE INDEX IF NOT EXISTS idx_record_derivations_source
  ON record_derivations (source_table, source_record_id);

-- ============================================================
-- LAYER 3 — OSM RESEARCH FINDINGS
-- ============================================================
-- OSM-authored observations, reads, conclusions, and interpretations.
-- Factually valuable but never presented as independently verified public information.
-- evidence_class is always 'osm_proprietary' (or 'calculated' for OSM-defined
-- deterministic classifications that follow a documented methodology).
CREATE TABLE IF NOT EXISTS osm_research_findings (
  id SERIAL PRIMARY KEY,
  -- What this finding is about
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('mlb_org','player','draft_class','league','draft_pick','general')),
  subject_key TEXT NOT NULL,       -- the entity identifier
  -- What kind of finding
  finding_type TEXT NOT NULL
    CHECK (finding_type IN (
      'pattern_read',               -- qualitative behavioral read on a club/player
      'correlation',                -- OSM's directional correlation observation
      'scouting_note',              -- player or club scouting observation
      'research_note',              -- general research finding
      'methodology_assumption',     -- an OSM model input or assumption
      'behavioral_classification'   -- OSM-defined categorization
    )),
  finding_text TEXT NOT NULL,
  structured_value JSONB,          -- optional structured representation of the finding
  period_description TEXT,         -- '2021-2025', '2026 draft', etc.
  -- Source
  source_type TEXT NOT NULL DEFAULT 'excel_worksheet'
    CHECK (source_type IN ('excel_worksheet','research_article','direct_osm_entry')),
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_worksheet TEXT,
  source_excel_row INTEGER,
  source_excel_column TEXT,
  source_preamble TEXT,
  article_id INTEGER,              -- FK to osm_articles.id (set when sourced from article annotation)
  methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
  -- Authorship
  osm_author TEXT,
  -- Classification
  evidence_class TEXT NOT NULL DEFAULT 'osm_proprietary'
    CHECK (evidence_class IN ('osm_proprietary','calculated')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  -- Lifecycle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_osm_research_findings_subject
  ON osm_research_findings (subject_type, subject_key);

-- ============================================================
-- LAYER 4 — DIAMONDIQ INFERENCES
-- ============================================================
-- System-generated projections and interpretations.
-- NEVER stored as factual evidence. Always explicitly labelled.
-- Requires mandatory OSM review before appearing in athlete-visible reports.
-- evidence_class is always 'diamondiq_inference' — enforced by constraint.
CREATE TABLE IF NOT EXISTS diamondiq_inferences (
  id SERIAL PRIMARY KEY,
  -- What this inference is about
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('mlb_org','player','draft_class','league','draft_pick')),
  subject_key TEXT NOT NULL,
  inference_context TEXT,          -- 'e.g. 2026 MLB Draft spending projection'
  -- What type
  inference_type TEXT NOT NULL
    CHECK (inference_type IN (
      'draft_spend_projection',
      'pool_overage_projection',
      'bonus_projection',
      'signability_estimate',
      'round_probability',
      'outcome_estimate',
      'confidence_label',
      'other'
    )),
  -- Value
  numeric_value NUMERIC,
  text_value TEXT,
  -- Confidence
  confidence_label TEXT
    CHECK (confidence_label IN ('High','Medium','Low')),
  confidence_score NUMERIC CHECK (confidence_score BETWEEN 0 AND 1),
  -- How it was produced
  evidence_class TEXT NOT NULL DEFAULT 'diamondiq_inference'
    CHECK (evidence_class = 'diamondiq_inference'),
  methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
  model_identifier TEXT,           -- 'toc_spend_projection_v1', etc.
  -- Provenance — when imported from a workbook (vs system-generated)
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_worksheet TEXT,
  source_excel_row INTEGER,
  source_excel_column TEXT,
  source_preamble TEXT,
  -- Lifecycle
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  generated_by TEXT,               -- 'system' | 'osm_staff_imported'
  osm_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (osm_review_status IN ('pending','approved','rejected')),
  osm_reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  osm_reviewed_at TIMESTAMP,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_diamondiq_inferences_subject
  ON diamondiq_inferences (subject_type, subject_key);

-- ============================================================
-- ARTICLE INGESTION — separate records for public source vs OSM notes
-- ============================================================

-- Public article/source record (evidence_class = 'verified_public' by default)
CREATE TABLE IF NOT EXISTS osm_articles (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  publisher TEXT,
  source_url TEXT,
  publication_date DATE,
  article_content TEXT,            -- full text or excerpt as permitted
  evidence_class TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','osm_proprietary')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- OSM's proprietary notes/annotations ON a public article.
-- Always evidence_class = 'osm_proprietary' — enforced by constraint.
-- Stored as a separate record so the public article and OSM's analysis
-- can be cited, classified, and displayed independently.
CREATE TABLE IF NOT EXISTS osm_article_annotations (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES osm_articles(id) ON DELETE CASCADE,
  annotation_text TEXT NOT NULL,
  annotation_type TEXT NOT NULL DEFAULT 'research_note'
    CHECK (annotation_type IN (
      'summary','observation','entity_tag','methodology_note','research_note','scouting_note'
    )),
  subjects TEXT[],                 -- topics/entities this annotation addresses
  draft_year_context INTEGER[],    -- which draft years this applies to
  evidence_class TEXT NOT NULL DEFAULT 'osm_proprietary'
    CHECK (evidence_class = 'osm_proprietary'),
  osm_author TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- RECORD SOURCE ASSERTIONS
-- ============================================================
-- When the same verified fact or derived metric appears in multiple worksheets
-- or source files, ONE canonical production record is written.  Every additional
-- source location that asserts the same fact is stored here instead of creating
-- a duplicate canonical row.  Conflicts (asserted value ≠ canonical value) are
-- flagged automatically at commit time.
CREATE TABLE IF NOT EXISTS record_source_assertions (
  id                        SERIAL PRIMARY KEY,
  canonical_record_table    TEXT NOT NULL,     -- e.g. 'club_draft_spend_history'
  canonical_record_id       INTEGER NOT NULL,  -- FK to the canonical row (untyped for flexibility)
  source_file_version_id    INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id          INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  worksheet                 TEXT NOT NULL,
  excel_row                 INTEGER,
  excel_column              TEXT,
  source_preamble           TEXT,
  asserted_value            TEXT,             -- raw cell value as text
  conflicts_with_canonical  BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_delta            TEXT,             -- NULL when values agree
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsa_canonical
  ON record_source_assertions (canonical_record_table, canonical_record_id);
CREATE INDEX IF NOT EXISTS idx_rsa_job
  ON record_source_assertions (ingestion_job_id);

-- ============================================================
-- LEAGUE FACTS — verified-public league-level factual records
-- ============================================================
-- Stores league-wide facts that are not club-specific (e.g. CBT thresholds,
-- league-wide aggregate spend). One fact_type+season per source file version.
CREATE TABLE IF NOT EXISTS league_facts (
  id                     SERIAL PRIMARY KEY,
  fact_type              TEXT NOT NULL,
  season                 INTEGER NOT NULL,
  numeric_value          NUMERIC(20,4),
  text_value             TEXT,
  evidence_class         TEXT NOT NULL DEFAULT 'verified_public'
    CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference')),
  dataset_id             INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  ingestion_job_id       INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  source_worksheet       TEXT,
  source_excel_row       INTEGER,
  source_excel_column    TEXT,
  source_preamble        TEXT,
  is_fixture             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fact_type, season, source_file_version_id)
);
CREATE INDEX IF NOT EXISTS idx_league_facts_type_season
  ON league_facts (fact_type, season);
CREATE INDEX IF NOT EXISTS idx_league_facts_job
  ON league_facts (ingestion_job_id);

-- ============================================================
-- REPORT CITATIONS — full provenance chain for published claims
-- ============================================================
-- Links every factual claim in a published report to its source record
-- in any of the four layers. Every published section must have a citation.
CREATE TABLE IF NOT EXISTS report_citations (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  evidence_label TEXT NOT NULL,
  -- Source layer and record
  evidence_layer INTEGER
    CHECK (evidence_layer IN (1,2,3,4)),
    -- 1=factual, 2=derived, 3=osm_finding, 4=inference
  source_table TEXT NOT NULL,      -- which table the cited records are in
  source_record_ids INTEGER[],     -- array of record IDs in that table
  -- For derived/inference records, links down to the underlying factual records
  underlying_source_table TEXT,
  underlying_source_record_ids INTEGER[],
  -- Additional context
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
  citation_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
