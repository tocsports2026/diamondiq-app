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
