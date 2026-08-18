/**
 * DiamondIQ schema migrations.
 * Runs after initDb() (which creates tables via schema.sql).
 * All statements are idempotent — safe to run on every startup.
 */
import { query } from "./index";

export async function runMigrations() {
  // ── data_library: add ingestion/provenance columns ─────────────────────────
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS is_fixture BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMP`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS drive_file_id TEXT`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS drive_folder_id TEXT`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS drive_modified_at TIMESTAMP`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS source_file_hash TEXT`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS ingestion_error_count INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE data_library ADD COLUMN IF NOT EXISTS column_map JSONB`);

  // ── reports: add is_fixture flag ────────────────────────────────────────────
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_fixture BOOLEAN NOT NULL DEFAULT FALSE`);

  // ── Mark all seeded DEV FIXTURE data_library rows ──────────────────────────
  // Any row whose notes field contains 'DEV FIXTURE' was inserted by seed.ts
  await query(`
    UPDATE data_library
    SET is_fixture = TRUE
    WHERE notes LIKE '%DEV FIXTURE%'
      AND is_fixture = FALSE
  `);

  // ── Mark all seeded DEV FIXTURE reports ────────────────────────────────────
  await query(`
    UPDATE reports
    SET is_fixture = TRUE
    WHERE report_ref IN ('DIQ-DEMO001', 'DIQ-DEMO002', 'DIQ-DEMO003')
      AND is_fixture = FALSE
  `);

  // ── Seed sample-size methodology thresholds if not present ─────────────────
  const existing = await query(
    `SELECT id FROM methodology_rules WHERE scope = 'sample_size_thresholds' LIMIT 1`
  );
  if (existing.length === 0) {
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

  console.log("Database migrations complete.");
}
