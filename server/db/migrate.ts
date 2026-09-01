/**
 * DiamondIQ schema migrations.
 * Runs after initDb() (which creates tables via schema.sql).
 * All statements are idempotent — safe to run on every startup.
 *
 * Migration order:
 *   1. Supporting infrastructure (methodology_versions)
 *   2. Layer 1 canonical table additions
 *   3. Layer 2 derived_metrics + record_derivations
 *   4. Layer 3 osm_research_findings
 *   5. Layer 4 diamondiq_inferences
 *   6. Article ingestion tables
 *   7. report_citations enhancements
 *   8. data_library / ingestion_jobs columns
 *   9. Fixture + report flag back-fills
 *  10. Seed data
 */
import { query } from "./index";

export async function runMigrations() {

  // ── 1. methodology_versions ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS methodology_versions (
      id SERIAL PRIMARY KEY,
      methodology_type TEXT NOT NULL
        CHECK (methodology_type IN (
          'calculation','classification','projection_model',
          'evidence_threshold','scoring_rule','osm_judgment_guide'
        )),
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      description TEXT,
      rule_definition JSONB NOT NULL DEFAULT '{}',
      effective_from TIMESTAMP NOT NULL DEFAULT NOW(),
      effective_to TIMESTAMP,
      authored_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ── 2a. Layer 1: provenance columns on existing tables ─────────────────────

  // club_payroll_history
  await query(`ALTER TABLE club_payroll_history
    ADD COLUMN IF NOT EXISTS ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE club_payroll_history
    ADD COLUMN IF NOT EXISTS source_excel_column TEXT`);
  await query(`ALTER TABLE club_payroll_history
    ADD COLUMN IF NOT EXISTS source_preamble TEXT`);
  await query(`ALTER TABLE club_payroll_history
    ADD COLUMN IF NOT EXISTS evidence_class TEXT NOT NULL DEFAULT 'verified_public'`);
  // Add check constraint only if it doesn't exist (pg doesn't support IF NOT EXISTS for constraints)
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'club_payroll_history_evidence_class_check'
      ) THEN
        ALTER TABLE club_payroll_history
          ADD CONSTRAINT club_payroll_history_evidence_class_check
          CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference'));
      END IF;
    END $$
  `);

  // club_draft_spend_history
  await query(`ALTER TABLE club_draft_spend_history
    ADD COLUMN IF NOT EXISTS ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE club_draft_spend_history
    ADD COLUMN IF NOT EXISTS source_excel_column TEXT`);
  await query(`ALTER TABLE club_draft_spend_history
    ADD COLUMN IF NOT EXISTS source_preamble TEXT`);
  await query(`ALTER TABLE club_draft_spend_history
    ADD COLUMN IF NOT EXISTS first_round_pick INTEGER`);
  await query(`ALTER TABLE club_draft_spend_history
    ADD COLUMN IF NOT EXISTS evidence_class TEXT NOT NULL DEFAULT 'verified_public'`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'club_draft_spend_history_evidence_class_check'
      ) THEN
        ALTER TABLE club_draft_spend_history
          ADD CONSTRAINT club_draft_spend_history_evidence_class_check
          CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference'));
      END IF;
    END $$
  `);

  // draft_players
  await query(`ALTER TABLE draft_players
    ADD COLUMN IF NOT EXISTS ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE draft_players
    ADD COLUMN IF NOT EXISTS source_excel_column TEXT`);
  await query(`ALTER TABLE draft_players
    ADD COLUMN IF NOT EXISTS source_preamble TEXT`);
  await query(`ALTER TABLE draft_players
    ADD COLUMN IF NOT EXISTS evidence_class TEXT NOT NULL DEFAULT 'verified_public'`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'draft_players_evidence_class_check'
      ) THEN
        ALTER TABLE draft_players
          ADD CONSTRAINT draft_players_evidence_class_check
          CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference'));
      END IF;
    END $$
  `);

  // slot_values
  await query(`ALTER TABLE slot_values
    ADD COLUMN IF NOT EXISTS ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE slot_values
    ADD COLUMN IF NOT EXISTS source_excel_column TEXT`);
  await query(`ALTER TABLE slot_values
    ADD COLUMN IF NOT EXISTS source_preamble TEXT`);
  await query(`ALTER TABLE slot_values
    ADD COLUMN IF NOT EXISTS evidence_class TEXT NOT NULL DEFAULT 'verified_public'`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'slot_values_evidence_class_check'
      ) THEN
        ALTER TABLE slot_values
          ADD CONSTRAINT slot_values_evidence_class_check
          CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference'));
      END IF;
    END $$
  `);

  // historical_rankings
  await query(`ALTER TABLE historical_rankings
    ADD COLUMN IF NOT EXISTS ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE historical_rankings
    ADD COLUMN IF NOT EXISTS source_excel_column TEXT`);
  await query(`ALTER TABLE historical_rankings
    ADD COLUMN IF NOT EXISTS source_preamble TEXT`);
  await query(`ALTER TABLE historical_rankings
    ADD COLUMN IF NOT EXISTS evidence_class TEXT NOT NULL DEFAULT 'verified_public'`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'historical_rankings_evidence_class_check'
      ) THEN
        ALTER TABLE historical_rankings
          ADD CONSTRAINT historical_rankings_evidence_class_check
          CHECK (evidence_class IN ('verified_public','calculated','osm_proprietary','diamondiq_inference'));
      END IF;
    END $$
  `);

  // ── 2b. Layer 1: CREATE tables for new environments ────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS club_payroll_history (
      id SERIAL PRIMARY KEY,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_row INTEGER,
      source_worksheet TEXT,
      source_excel_column TEXT,
      source_preamble TEXT,
      mlb_org TEXT NOT NULL,
      season INTEGER NOT NULL,
      total_payroll NUMERIC,
      cbt_threshold NUMERIC,
      cbt_overage NUMERIC,
      luxury_tax_paid NUMERIC,
      payroll_rank INTEGER,
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
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS club_draft_spend_history (
      id SERIAL PRIMARY KEY,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_row INTEGER,
      source_worksheet TEXT,
      source_excel_column TEXT,
      source_preamble TEXT,
      mlb_org TEXT NOT NULL,
      draft_year INTEGER NOT NULL,
      total_draft_spend NUMERIC,
      pool_allotment NUMERIC,
      over_under_pool NUMERIC,
      penalty_incurred BOOLEAN,
      picks_forfeited BOOLEAN,
      first_round_pick INTEGER,
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
    )
  `);

  // ── 3. Layer 2: derived_metrics + record_derivations ───────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS derived_metrics (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL
        CHECK (entity_type IN ('mlb_org','player','draft_class','league','draft_pick')),
      entity_key TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      numeric_value NUMERIC,
      text_value TEXT,
      period_start INTEGER,
      period_end INTEGER,
      period_label TEXT,
      evidence_class TEXT NOT NULL
        CHECK (evidence_class IN ('calculated','osm_proprietary')),
      methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_worksheet TEXT,
      source_excel_row INTEGER,
      source_excel_column TEXT,
      source_preamble TEXT,
      calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      calculated_by TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_derived_metrics_entity
    ON derived_metrics (entity_type, entity_key, metric_name)`);

  await query(`
    CREATE TABLE IF NOT EXISTS record_derivations (
      id SERIAL PRIMARY KEY,
      derived_table TEXT NOT NULL
        CHECK (derived_table IN ('derived_metrics','diamondiq_inferences')),
      derived_record_id INTEGER NOT NULL,
      derived_field TEXT,
      source_table TEXT NOT NULL,
      source_record_id INTEGER NOT NULL,
      derivation_method TEXT,
      derivation_note TEXT,
      methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
      derived_at TIMESTAMP NOT NULL DEFAULT NOW(),
      derived_by TEXT
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_record_derivations_derived
    ON record_derivations (derived_table, derived_record_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_record_derivations_source
    ON record_derivations (source_table, source_record_id)`);

  // ── 4. Layer 3: osm_research_findings ─────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS osm_research_findings (
      id SERIAL PRIMARY KEY,
      subject_type TEXT NOT NULL
        CHECK (subject_type IN ('mlb_org','player','draft_class','league','draft_pick','general')),
      subject_key TEXT NOT NULL,
      finding_type TEXT NOT NULL
        CHECK (finding_type IN (
          'pattern_read','correlation','scouting_note','research_note',
          'methodology_assumption','behavioral_classification'
        )),
      finding_text TEXT NOT NULL,
      structured_value JSONB,
      period_description TEXT,
      source_type TEXT NOT NULL DEFAULT 'excel_worksheet'
        CHECK (source_type IN ('excel_worksheet','research_article','direct_osm_entry')),
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_worksheet TEXT,
      source_excel_row INTEGER,
      source_excel_column TEXT,
      source_preamble TEXT,
      article_id INTEGER,
      methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
      osm_author TEXT,
      evidence_class TEXT NOT NULL DEFAULT 'osm_proprietary'
        CHECK (evidence_class IN ('osm_proprietary','calculated')),
      verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_osm_research_findings_subject
    ON osm_research_findings (subject_type, subject_key)`);

  // ── 5. Layer 4: diamondiq_inferences ──────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS diamondiq_inferences (
      id SERIAL PRIMARY KEY,
      subject_type TEXT NOT NULL
        CHECK (subject_type IN ('mlb_org','player','draft_class','league','draft_pick')),
      subject_key TEXT NOT NULL,
      inference_context TEXT,
      inference_type TEXT NOT NULL
        CHECK (inference_type IN (
          'draft_spend_projection','pool_overage_projection','bonus_projection',
          'signability_estimate','round_probability','outcome_estimate',
          'confidence_label','other'
        )),
      numeric_value NUMERIC,
      text_value TEXT,
      confidence_label TEXT CHECK (confidence_label IN ('High','Medium','Low')),
      confidence_score NUMERIC CHECK (confidence_score BETWEEN 0 AND 1),
      evidence_class TEXT NOT NULL DEFAULT 'diamondiq_inference'
        CHECK (evidence_class = 'diamondiq_inference'),
      methodology_version_id INTEGER REFERENCES methodology_versions(id) ON DELETE SET NULL,
      model_identifier TEXT,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_worksheet TEXT,
      source_excel_row INTEGER,
      source_excel_column TEXT,
      source_preamble TEXT,
      generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      generated_by TEXT,
      osm_review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (osm_review_status IN ('pending','approved','rejected')),
      osm_reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      osm_reviewed_at TIMESTAMP,
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_diamondiq_inferences_subject
    ON diamondiq_inferences (subject_type, subject_key)`);

  // ── 6. Article ingestion tables ────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS osm_articles (
      id SERIAL PRIMARY KEY,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      publisher TEXT,
      source_url TEXT,
      publication_date DATE,
      article_content TEXT,
      evidence_class TEXT NOT NULL DEFAULT 'verified_public'
        CHECK (evidence_class IN ('verified_public','osm_proprietary')),
      verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
      import_date TIMESTAMP NOT NULL DEFAULT NOW(),
      imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS osm_article_annotations (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES osm_articles(id) ON DELETE CASCADE,
      annotation_text TEXT NOT NULL,
      annotation_type TEXT NOT NULL DEFAULT 'research_note'
        CHECK (annotation_type IN (
          'summary','observation','entity_tag','methodology_note','research_note','scouting_note'
        )),
      subjects TEXT[],
      draft_year_context INTEGER[],
      evidence_class TEXT NOT NULL DEFAULT 'osm_proprietary'
        CHECK (evidence_class = 'osm_proprietary'),
      osm_author TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  // ── 6b. record_source_assertions ──────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS record_source_assertions (
      id                        SERIAL PRIMARY KEY,
      canonical_record_table    TEXT NOT NULL,
      canonical_record_id       INTEGER NOT NULL,
      source_file_version_id    INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id          INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      worksheet                 TEXT NOT NULL,
      excel_row                 INTEGER,
      excel_column              TEXT,
      source_preamble           TEXT,
      asserted_value            TEXT,
      conflicts_with_canonical  BOOLEAN NOT NULL DEFAULT FALSE,
      conflict_delta            TEXT,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rsa_canonical
    ON record_source_assertions (canonical_record_table, canonical_record_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rsa_job
    ON record_source_assertions (ingestion_job_id)`);

  // ── 6c. league_facts — verified-public league-level facts ─────────────────
  await query(`
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
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_league_facts_type_season
    ON league_facts (fact_type, season)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_league_facts_job
    ON league_facts (ingestion_job_id)`);

  // ── 6d. osm_article_transcription_lines + provenance cols on osm_articles ──
  await query(`
    CREATE TABLE IF NOT EXISTS osm_article_transcription_lines (
      id                     SERIAL PRIMARY KEY,
      article_id             INTEGER NOT NULL REFERENCES osm_articles(id) ON DELETE CASCADE,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id       INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_excel_row       INTEGER NOT NULL,
      pdf_page               INTEGER NOT NULL,
      pdf_line               INTEGER NOT NULL,
      line_text              TEXT NOT NULL,
      evidence_class         TEXT NOT NULL DEFAULT 'external_source_content'
        CHECK (evidence_class = 'external_source_content'),
      is_fixture             BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_transcription_lines_article
    ON osm_article_transcription_lines (article_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_transcription_lines_job
    ON osm_article_transcription_lines (ingestion_job_id)`);

  // Four SOURCE INDEX provenance columns on osm_articles
  await query(`ALTER TABLE osm_articles ADD COLUMN IF NOT EXISTS source_number    INTEGER`);
  await query(`ALTER TABLE osm_articles ADD COLUMN IF NOT EXISTS pdf_filename     TEXT`);
  await query(`ALTER TABLE osm_articles ADD COLUMN IF NOT EXISTS pdf_page_count   INTEGER`);
  await query(`ALTER TABLE osm_articles ADD COLUMN IF NOT EXISTS source_worksheet TEXT`);

  // ── 7. report_citations: add evidence_layer + methodology columns ──────────
  await query(`ALTER TABLE report_citations
    ADD COLUMN IF NOT EXISTS evidence_layer INTEGER
      CHECK (evidence_layer IN (1,2,3,4))`);
  await query(`ALTER TABLE report_citations
    ADD COLUMN IF NOT EXISTS underlying_source_table TEXT`);
  await query(`ALTER TABLE report_citations
    ADD COLUMN IF NOT EXISTS underlying_source_record_ids INTEGER[]`);
  await query(`ALTER TABLE report_citations
    ADD COLUMN IF NOT EXISTS methodology_version_id INTEGER
      REFERENCES methodology_versions(id) ON DELETE SET NULL`);

  // ── 8. data_library: add ingestion/provenance columns ─────────────────────
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS is_fixture BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMP`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS drive_file_id TEXT`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS drive_folder_id TEXT`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS drive_modified_at TIMESTAMP`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS source_file_hash TEXT`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS ingestion_error_count INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS column_map JSONB`);

  // ── 9. reports: add is_fixture flag ────────────────────────────────────────
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_fixture BOOLEAN NOT NULL DEFAULT FALSE`);

  // ── 9a. Mark all seeded DEV FIXTURE data_library rows ─────────────────────
  await query(`
    UPDATE data_library
    SET is_fixture = TRUE
    WHERE notes LIKE '%DEV FIXTURE%'
      AND is_fixture = FALSE
  `);

  // ── 9b. Mark all seeded DEV FIXTURE reports ───────────────────────────────
  await query(`
    UPDATE reports
    SET is_fixture = TRUE
    WHERE report_ref IN ('DIQ-DEMO001','DIQ-DEMO002','DIQ-DEMO003')
      AND is_fixture = FALSE
  `);

  // ── 10. Seed methodology_rules (legacy evidence thresholds) ────────────────
  const existingRules = await query(
    `SELECT id FROM methodology_rules WHERE scope = 'sample_size_thresholds' LIMIT 1`
  );
  if (existingRules.length === 0) {
    await query(`
      INSERT INTO methodology_rules (title, scope, rule_text, version, effective_date, author, notes)
      VALUES (
        'Evidence Strength — Sample Size Thresholds',
        'sample_size_thresholds',
        $1,
        '1.0',
        NOW()::date,
        'DiamondIQ System',
        'Default thresholds configurable by OSM Admin. Governs query engine evidence-strength labels.'
      )
    `, [JSON.stringify({
      data_gap: { max: 0, label: "DATA GAP", description: "No matching records. Intelligence Request auto-created." },
      limited:  { min: 1, max: 4, label: "LIMITED SAMPLE", description: "Directional only. Disclose n prominently." },
      moderate: { min: 5, max: 19, label: "MODERATE SAMPLE", description: "Historical patterns for this group. Individual outcomes vary." },
      strong:   { min: 20, label: "STRONG SAMPLE", description: "Standard disclaimer applies." },
    })]);
  }

  // ── 10a. Seed methodology_versions — initial calculation definitions ────────
  const existingMV = await query(
    `SELECT id FROM methodology_versions WHERE name = 'avg_5yr' AND version = '1.0' LIMIT 1`
  );
  if (existingMV.length === 0) {
    const seeds = [
      {
        methodology_type: 'calculation',
        name: 'avg_5yr',
        version: '1.0',
        description: '5-year simple average of an annual numeric value',
        rule_definition: { formula: 'SUM(values) / n', window_years: 5, min_seasons: 3, note: 'Seasons with NULL values are excluded from both numerator and denominator' },
      },
      {
        methodology_type: 'calculation',
        name: 'cagr_5yr',
        version: '1.0',
        description: '5-year compound annual growth rate',
        rule_definition: { formula: '(end_value / start_value)^(1/n) - 1', window_years: 5, requires: ['start_value','end_value'], note: 'Returns NULL when start_value = 0' },
      },
      {
        methodology_type: 'calculation',
        name: 'count_seasons_over_threshold',
        version: '1.0',
        description: 'Count of seasons where a value exceeded a given threshold',
        rule_definition: { formula: 'COUNT(value > threshold)', window_years: 5, threshold_source: 'cbt_threshold per season' },
      },
      {
        methodology_type: 'calculation',
        name: 'pct_vs_avg',
        version: '1.0',
        description: 'Percentage difference of a current value versus a historical average',
        rule_definition: { formula: '(current - avg) / avg * 100', note: 'Positive = above average; negative = below average' },
      },
      {
        methodology_type: 'classification',
        name: 'cbt_payroll_tier',
        version: '1.0',
        description: 'OSM CBT payroll tier classification based on 5-year average payroll',
        rule_definition: {
          tiers: [
            { label: 'High', min: 200000000, description: 'Consistently above $200M CBT' },
            { label: 'Mid', min: 150000000, description: '$150M–$200M CBT range' },
            { label: 'Low', min: 0, description: 'Below $150M CBT' },
          ],
          note: 'Thresholds subject to OSM review annually. Classification may be overridden by analyst judgment (evidence_class → osm_proprietary).',
        },
      },
      {
        methodology_type: 'classification',
        name: 'draft_pool_tier',
        version: '1.0',
        description: 'OSM draft pool tier classification based on 5-year average pool allotment',
        rule_definition: {
          tiers: [
            { label: 'High', min: 12000000, description: 'Above $12M 5yr avg pool' },
            { label: 'Mid', min: 8000000, description: '$8M–$12M 5yr avg pool' },
            { label: 'Low', min: 0, description: 'Below $8M 5yr avg pool' },
          ],
          note: 'Thresholds subject to OSM review. May be overridden by analyst judgment.',
        },
      },
      {
        methodology_type: 'evidence_threshold',
        name: 'sample_size_thresholds',
        version: '1.0',
        description: 'Evidence-strength thresholds by sample size — governs query engine disclosure labels',
        rule_definition: {
          data_gap: { max: 0, label: 'DATA GAP' },
          limited:  { min: 1, max: 4, label: 'LIMITED SAMPLE' },
          moderate: { min: 5, max: 19, label: 'MODERATE SAMPLE' },
          strong:   { min: 20, label: 'STRONG SAMPLE' },
        },
      },
    ];

    for (const seed of seeds) {
      await query(
        `INSERT INTO methodology_versions
           (methodology_type, name, version, description, rule_definition)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [seed.methodology_type, seed.name, seed.version, seed.description, JSON.stringify(seed.rule_definition)]
      );
    }
  }

  // ── 11. draft_players: player-level ingestion columns ────────────────────────
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS draft_round_label TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS player_class TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS outcome_group TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS birthplace TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS dob DATE`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS mlbam_player_id INTEGER`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS mlb_rank INTEGER`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS ndfa_match_status TEXT`);

  // ── 12. club_draft_spend_history: pool-level detail columns ──────────────────
  await query(`ALTER TABLE club_draft_spend_history ADD COLUMN IF NOT EXISTS selections_count INTEGER`);
  await query(`ALTER TABLE club_draft_spend_history ADD COLUMN IF NOT EXISTS signings_count INTEGER`);
  await query(`ALTER TABLE club_draft_spend_history ADD COLUMN IF NOT EXISTS dollars_committed NUMERIC`);

  // ── 13. slot_values: source worksheet tracking ────────────────────────────────
  await query(`ALTER TABLE slot_values ADD COLUMN IF NOT EXISTS source_worksheet TEXT`);

  // ── 14. Job #9 historical draft database: factual source preservation ─────────
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS source_unique_id TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS source_drafting_organization TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS draft_date DATE`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS bonus_over_under NUMERIC`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS college_commitment TEXT`);
  await query(`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS source_public_notes JSONB`);

  // Slot metadata remains factual even when the source does not provide a dollar value.
  await query(`ALTER TABLE slot_values ALTER COLUMN slot_value_usd DROP NOT NULL`);
  await query(`ALTER TABLE slot_values ADD COLUMN IF NOT EXISTS slot_round INTEGER`);
  await query(`ALTER TABLE slot_values ADD COLUMN IF NOT EXISTS slot_round_label TEXT`);
  await query(`ALTER TABLE slot_values ADD COLUMN IF NOT EXISTS drafting_organization TEXT`);

  await query(`ALTER TABLE historical_rankings ADD COLUMN IF NOT EXISTS source_worksheet TEXT`);
  await query(`ALTER TABLE historical_rankings ADD COLUMN IF NOT EXISTS source_unique_id TEXT`);
  await query(`ALTER TABLE historical_rankings ADD COLUMN IF NOT EXISTS ranking_context JSONB NOT NULL DEFAULT '{}'`);

  // ── 15. Supplemental evidence observations: preserve pre-draft evidence separately ─
  await query(`
    CREATE TABLE IF NOT EXISTS player_evaluation_observations (
      id SERIAL PRIMARY KEY,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_worksheet TEXT NOT NULL,
      source_excel_row INTEGER NOT NULL,
      source_excel_column TEXT,
      source_preamble TEXT,
      source_file TEXT,
      source_url TEXT,
      source_provider TEXT NOT NULL,
      source_unique_id TEXT,
      source_event_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      class_year INTEGER,
      state TEXT,
      school TEXT,
      position TEXT,
      commitment TEXT,
      observation_scope TEXT NOT NULL CHECK (observation_scope IN ('hitter','pitcher','other')),
      metrics JSONB NOT NULL DEFAULT '{}',
      source_context JSONB NOT NULL DEFAULT '{}',
      evidence_class TEXT NOT NULL DEFAULT 'verified_public' CHECK (evidence_class = 'verified_public'),
      verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_event_key)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_player_evaluation_observations_job
    ON player_evaluation_observations (ingestion_job_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS player_season_statistics (
      id SERIAL PRIMARY KEY,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_worksheet TEXT NOT NULL,
      source_excel_row INTEGER NOT NULL,
      source_excel_column TEXT,
      source_preamble TEXT,
      source_file TEXT,
      source_url TEXT,
      source_provider TEXT NOT NULL,
      source_unique_id TEXT,
      source_event_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      league TEXT,
      season_year INTEGER,
      class_year INTEGER,
      team TEXT,
      position TEXT,
      statistic_type TEXT NOT NULL CHECK (statistic_type IN ('batting','pitching')),
      sample_scope TEXT,
      statistics JSONB NOT NULL DEFAULT '{}',
      source_context JSONB NOT NULL DEFAULT '{}',
      evidence_class TEXT NOT NULL DEFAULT 'verified_public' CHECK (evidence_class = 'verified_public'),
      verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','osm_reviewed','cross_verified')),
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_event_key)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_player_season_statistics_job
    ON player_season_statistics (ingestion_job_id)`);

  // Existing deployments created the observation tables before source-event
  // identity was approved. The current tables are empty; fail closed rather
  // than inventing keys for any unexpected pre-existing rows.
  await query(`
    ALTER TABLE player_evaluation_observations
      ADD COLUMN IF NOT EXISTS source_event_key TEXT
  `);
  await query(`
    ALTER TABLE player_season_statistics
      ADD COLUMN IF NOT EXISTS source_event_key TEXT
  `);
  await query(`
    ALTER TABLE player_evaluation_observations
      ALTER COLUMN source_event_key SET NOT NULL
  `);
  await query(`
    ALTER TABLE player_season_statistics
      ALTER COLUMN source_event_key SET NOT NULL
  `);
  await query(`
    ALTER TABLE player_evaluation_observations
      DROP CONSTRAINT IF EXISTS player_evaluation_observation_source_file_version_id_source_key
  `);
  await query(`
    ALTER TABLE player_season_statistics
      DROP CONSTRAINT IF EXISTS player_season_statistics_source_file_version_id_source_work_key
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'player_evaluation_observations_source_event_key_key'
      ) THEN
        ALTER TABLE player_evaluation_observations
          ADD CONSTRAINT player_evaluation_observations_source_event_key_key
          UNIQUE (source_event_key);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'player_season_statistics_source_event_key_key'
      ) THEN
        ALTER TABLE player_season_statistics
          ADD CONSTRAINT player_season_statistics_source_event_key_key
          UNIQUE (source_event_key);
      END IF;
    END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS source_player_identity_links (
      id SERIAL PRIMARY KEY,
      dataset_id INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_observation_table TEXT NOT NULL
        CHECK (source_observation_table IN ('player_evaluation_observations','player_season_statistics')),
      source_observation_id INTEGER,
      source_event_key TEXT NOT NULL,
      source_worksheet TEXT NOT NULL,
      source_excel_row INTEGER NOT NULL,
      source_file TEXT,
      source_url TEXT,
      source_provider TEXT NOT NULL,
      source_unique_id TEXT,
      player_name TEXT NOT NULL,
      source_identity_key TEXT NOT NULL,
      candidate_draft_player_id INTEGER REFERENCES draft_players(id) ON DELETE SET NULL,
      link_status TEXT NOT NULL
        CHECK (link_status IN ('deterministic_link','candidate_link','unlinked','rejected')),
      matching_fields JSONB NOT NULL DEFAULT '{}',
      link_reason TEXT NOT NULL,
      source_context JSONB NOT NULL DEFAULT '{}',
      is_fixture BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_source_player_identity_links_job
    ON source_player_identity_links (ingestion_job_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_source_player_identity_links_candidate
    ON source_player_identity_links (candidate_draft_player_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS ingestion_review_holds (
      id                     SERIAL PRIMARY KEY,
      dataset_id             INTEGER REFERENCES data_library(id) ON DELETE SET NULL,
      source_file_version_id INTEGER REFERENCES source_file_versions(id) ON DELETE SET NULL,
      ingestion_job_id       INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
      source_worksheet       TEXT NOT NULL,
      source_excel_row       INTEGER,
      source_unique_id       TEXT,
      player_name            TEXT,
      draft_year             INTEGER,
      hold_reason            TEXT NOT NULL,
      source_row_data        JSONB NOT NULL,
      is_fixture             BOOLEAN NOT NULL DEFAULT FALSE,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ingestion_review_holds_job
    ON ingestion_review_holds (ingestion_job_id)`);

  console.log("Database migrations complete.");
}
