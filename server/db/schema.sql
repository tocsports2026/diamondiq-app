-- DiamondIQ Database Schema

-- Sessions (connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Users
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

-- Athlete profiles
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

-- Athlete rankings
CREATE TABLE IF NOT EXISTS athlete_rankings (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  source VARCHAR(100) NOT NULL,
  ranking INTEGER NOT NULL,
  ranking_date DATE NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  source_record TEXT
);

-- Reports
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

-- Intelligence requests
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

-- Knowledge center articles
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

-- Article → athlete assignment (when not assigned_to_all)
CREATE TABLE IF NOT EXISTS article_assignments (
  article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  athlete_id INTEGER REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, athlete_id)
);

-- NIL Agreements
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

-- NIL Deliverables
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

-- Calendar events
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

-- Data library
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

-- Methodology rules
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

-- Popular questions (aggregated)
CREATE TABLE IF NOT EXISTS popular_questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  scope VARCHAR(50) NOT NULL DEFAULT 'all',
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Query log (anonymized)
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

-- Canonical historical draft selection records.
-- club_draft_history is NOT a separate table — club queries are
-- SQL filters on this table (mlb_org, draft_year, pick range).
CREATE TABLE IF NOT EXISTS draft_players (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_worksheet TEXT,
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

-- Official MLB slot values by pick and year.
CREATE TABLE IF NOT EXISTS slot_values (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  source_row INTEGER,
  draft_year INTEGER NOT NULL,
  pick_overall INTEGER NOT NULL,
  slot_value_usd NUMERIC NOT NULL,
  pool_eligible BOOLEAN DEFAULT TRUE,
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- Approved ranking source records.
CREATE TABLE IF NOT EXISTS historical_rankings (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  source_row INTEGER,
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
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE
);

-- Club-level payroll and CBT (Luxury Tax) history.
-- Rows are normalized: one row per (mlb_org, season).
-- Source workbooks are often in wide/columnar format (one column per year);
-- the Stage 5 commit step unpivots them into this normalized shape.
CREATE TABLE IF NOT EXISTS club_payroll_history (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  source_row INTEGER,                -- original Excel row (before unpivot)
  source_worksheet TEXT,
  mlb_org TEXT NOT NULL,
  season INTEGER NOT NULL,
  total_payroll NUMERIC,             -- total 40-man payroll for the season
  cbt_threshold NUMERIC,             -- official CBT threshold for the season
  cbt_overage NUMERIC,               -- positive = over threshold; negative = under
  luxury_tax_paid NUMERIC,           -- actual tax remitted (NULL if under threshold)
  payroll_rank INTEGER,              -- league-wide payroll rank for the season
  payroll_data_type TEXT NOT NULL DEFAULT 'actual'
    CHECK (payroll_data_type IN ('actual', 'preliminary', 'projected')),
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'osm_reviewed', 'cross_verified')),
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER REFERENCES club_payroll_history(id) ON DELETE SET NULL,
  osm_notes TEXT,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (mlb_org, season, source_file_version_id)
);

-- Club-level draft spending history.
-- Rows are normalized: one row per (mlb_org, draft_year).
-- Source workbooks are often in wide/columnar format (one column per year);
-- the Stage 5 commit step unpivots them into this normalized shape.
CREATE TABLE IF NOT EXISTS club_draft_spend_history (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_worksheet TEXT,
  mlb_org TEXT NOT NULL,
  draft_year INTEGER NOT NULL,
  total_draft_spend NUMERIC,         -- total reported draft bonus spend
  pool_allotment NUMERIC,            -- official MLB draft pool for this club/year
  over_under_pool NUMERIC,           -- positive = over pool; negative = under
  penalty_incurred BOOLEAN,          -- TRUE if club paid a penalty for going over
  picks_forfeited BOOLEAN,           -- TRUE if future picks were forfeited
  source_provider TEXT,
  import_date TIMESTAMP NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'osm_reviewed', 'cross_verified')),
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  approved_record_id INTEGER REFERENCES club_draft_spend_history(id) ON DELETE SET NULL,
  osm_notes TEXT,
  is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (mlb_org, draft_year, source_file_version_id)
);

-- Links every factual claim in a published report to its source records.
-- Every section that includes real data must have a citation before publish.
CREATE TABLE IF NOT EXISTS report_citations (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  evidence_label TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_record_ids INTEGER[],
  dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
  citation_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
