/**
 * DiamondIQ — Data Ingestion Routes
 *
 * POST  /api/admin/ingestion/upload   — accept file, parse, return preview
 * GET   /api/admin/ingestion          — list ingestion jobs
 * GET   /api/admin/ingestion/:jobId   — get single job + parsed structure
 * POST  /api/admin/ingestion/:jobId/classify  — save Admin mapping decisions
 * DELETE /api/admin/ingestion/:jobId  — cancel / remove job
 *
 * IMPORTANT: These routes stop at the mapping/preview stage.
 * No production records are committed until Stage 5 (commit endpoint) is built
 * and explicitly approved by OSM Admin.
 */

import { Router, Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { requireAdmin, requireStaff } from "../middleware/auth";
import { query, queryOne } from "../db";

const router = Router();

// ── Upload directory ──────────────────────────────────────────────────────────
const UPLOAD_DIR = "/tmp/diq_uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls", ".csv"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only XLSX, XLS, and CSV files are accepted."));
    }
  },
});

// ── Worksheet type detection ──────────────────────────────────────────────────

const WORKSHEET_TYPE_RULES: Array<{
  patterns: RegExp[];
  type: string;
  label: string;
}> = [
  {
    patterns: [/readme/i, /notes/i, /methodology/i, /instructions/i, /about/i, /overview/i],
    type: "documentation",
    label: "Documentation / Methodology",
  },
  {
    patterns: [/chart/i, /graph/i, /viz/i, /visual/i, /figure/i],
    type: "chart",
    label: "Chart / Presentation Data (skip)",
  },
  {
    patterns: [/projection/i, /forecast/i, /model/i, /predicted/i, /estimate/i],
    type: "analysis",
    label: "Analysis / Projection",
  },
  {
    patterns: [/trend/i, /derived/i, /calculated/i, /computed/i],
    type: "calculated",
    label: "Calculated Results",
  },
];

function detectWorksheetType(sheetName: string): {
  type: string;
  label: string;
  confidence: "high" | "low";
} {
  for (const rule of WORKSHEET_TYPE_RULES) {
    if (rule.patterns.some((p) => p.test(sheetName))) {
      return { type: rule.type, label: rule.label, confidence: "high" };
    }
  }
  return {
    type: "source",
    label: "Source / Verified Factual Data",
    confidence: "low",
  };
}

// ── Column-level evidence detection ──────────────────────────────────────────

const PROJECTION_HEADER_PATTERNS = [
  /project/i, /forecast/i, /estim/i, /predict/i, /model/i,
  /likely/i, /probability/i, /expected/i, /hypothetical/i,
];

const CALCULATED_HEADER_PATTERNS = [
  /total/i, /avg/i, /average/i, /median/i, /pct/i, /percent/i,
  /rate/i, /ratio/i, /count/i, /sum/i, /ytd/i, /delta/i, /change/i,
  /trend/i, /index/i,
];

function detectColumnEvidenceLabel(header: string): string {
  if (PROJECTION_HEADER_PATTERNS.some((p) => p.test(header))) {
    return "DiamondIQ Analysis / Inference";
  }
  if (CALCULATED_HEADER_PATTERNS.some((p) => p.test(header))) {
    return "Calculated Results";
  }
  return "Verified Public Information";
}

// ── Canonical field suggestions ───────────────────────────────────────────────

// Maps header patterns → canonical field name in draft_players
const CANONICAL_FIELD_HINTS: Array<{ patterns: RegExp[]; field: string; table: string }> = [
  { patterns: [/^player$/i, /^name$/i, /player\s*name/i, /full\s*name/i, /^athlete/i], field: "player_name", table: "draft_players" },
  { patterns: [/^year$/i, /draft\s*year/i, /^season$/i], field: "draft_year", table: "draft_players" },
  { patterns: [/^round$/i, /draft\s*round/i, /^rd$/i], field: "draft_round", table: "draft_players" },
  { patterns: [/^pick$/i, /overall\s*pick/i, /pick\s*#/i, /pick\s*num/i, /pick\s*overall/i, /^overall$/i], field: "draft_pick_overall", table: "draft_players" },
  { patterns: [/pick\s*in\s*round/i, /round\s*pick/i], field: "draft_pick_in_round", table: "draft_players" },
  { patterns: [/^team$/i, /^club$/i, /^org/i, /organization/i, /mlb\s*team/i, /^franchise/i], field: "mlb_org", table: "draft_players" },
  { patterns: [/^pos(ition)?$/i, /^pos$/i], field: "position", table: "draft_players" },
  { patterns: [/^school$/i, /^college$/i, /^university/i, /institution/i], field: "school", table: "draft_players" },
  { patterns: [/school\s*type/i, /^level$/i, /hs\s*vs/i], field: "school_type", table: "draft_players" },
  { patterns: [/^conference$/i, /^conf$/i], field: "conference", table: "draft_players" },
  { patterns: [/^state$/i, /home\s*state/i], field: "state", table: "draft_players" },
  { patterns: [/^country$/i], field: "country", table: "draft_players" },
  { patterns: [/^age$/i, /age\s*at/i], field: "age_at_draft", table: "draft_players" },
  { patterns: [/^bonus$/i, /signing\s*bonus/i, /reported\s*bonus/i, /bonus\s*\(/i, /bonus\s*amt/i, /bonus\s*amount/i], field: "bonus_reported", table: "draft_players" },
  { patterns: [/slot\s*value/i, /^slot$/i, /slot\s*\(/i], field: "bonus_slot_value", table: "draft_players" },
  { patterns: [/bonus\s*source/i, /source\s*of\s*bonus/i], field: "bonus_source", table: "draft_players" },
  { patterns: [/^signed$/i, /signing\s*status/i], field: "signed", table: "draft_players" },
  { patterns: [/^height$/i, /^ht$/i], field: "height_in", table: "draft_players" },
  { patterns: [/^weight$/i, /^wt$/i, /^wt\s*\(/i], field: "weight_lbs", table: "draft_players" },
  { patterns: [/^bats$/i, /bats\s*\//i], field: "bats", table: "draft_players" },
  { patterns: [/^throws$/i, /^throws\s*\//i], field: "throws", table: "draft_players" },
  // slot_values table
  { patterns: [/slot\s*val/i, /^slot\s*\$/i], field: "slot_value_usd", table: "slot_values" },
  { patterns: [/pick\s*#?$/i, /pick\s*overall/i], field: "pick_overall", table: "slot_values" },
];

function suggestCanonicalField(header: string): { field: string; table: string } | null {
  const h = String(header ?? "").trim();
  for (const hint of CANONICAL_FIELD_HINTS) {
    if (hint.patterns.some((p) => p.test(h))) {
      return { field: hint.field, table: hint.table };
    }
  }
  return null;
}

// ── Parse XLSX/CSV into worksheet preview ────────────────────────────────────

interface ParsedWorksheet {
  name: string;
  detectedType: string;
  detectedTypeLabel: string;
  detectedTypeConfidence: "high" | "low";
  headers: (string | null)[];
  sampleRows: (string | number | boolean | null)[][];
  totalDataRows: number;
  columns: ParsedColumn[];
  isEmpty: boolean;
}

interface ParsedColumn {
  index: number;
  header: string;
  detectedEvidenceLabel: string;
  suggestedCanonicalField: string | null;
  suggestedTable: string | null;
  sampleValues: (string | number | boolean | null)[];
  allNull: boolean;
}

function parseWorkbook(filePath: string, fileExt: string): {
  worksheets: ParsedWorksheet[];
  workbookTitle: string | null;
} {
  let workbook: XLSX.WorkBook;

  if (fileExt === ".csv") {
    workbook = XLSX.readFile(filePath, { type: "file", raw: false });
  } else {
    workbook = XLSX.readFile(filePath, { type: "file", raw: false, cellDates: true });
  }

  const worksheets: ParsedWorksheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Get as array-of-arrays (header:1 gives raw rows)
    const rawData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    if (rawData.length === 0) {
      worksheets.push({
        name: sheetName,
        detectedType: "chart",
        detectedTypeLabel: "Chart / Presentation Data (skip)",
        detectedTypeConfidence: "high",
        headers: [],
        sampleRows: [],
        totalDataRows: 0,
        columns: [],
        isEmpty: true,
      });
      continue;
    }

    // The first non-empty row is treated as the header row
    const headerRow = (rawData[0] as (string | number | boolean | null)[]).map(
      (h) => (h !== null && h !== undefined ? String(h).trim() : null)
    );
    const dataRows = rawData.slice(1) as (string | number | boolean | null)[][];
    const sampleRows = dataRows.slice(0, 5);
    const totalDataRows = dataRows.length;

    // Detect worksheet type
    const { type, label, confidence } = detectWorksheetType(sheetName);

    // Build column metadata
    const columns: ParsedColumn[] = headerRow.map((header, idx) => {
      const h = header ?? `Column_${idx + 1}`;
      const sampleValues = sampleRows.map((row) => row[idx] ?? null);
      const allNull = sampleValues.every((v) => v === null || v === "");
      const suggestion = suggestCanonicalField(h);
      return {
        index: idx,
        header: h,
        detectedEvidenceLabel: detectColumnEvidenceLabel(h),
        suggestedCanonicalField: suggestion?.field ?? null,
        suggestedTable: suggestion?.table ?? null,
        sampleValues,
        allNull,
      };
    });

    worksheets.push({
      name: sheetName,
      detectedType: type,
      detectedTypeLabel: label,
      detectedTypeConfidence: confidence,
      headers: headerRow,
      sampleRows,
      totalDataRows,
      columns,
      isEmpty: false,
    });
  }

  // Try to get workbook title from built-in properties
  const workbookTitle = workbook.Props?.Title ?? null;

  return { worksheets, workbookTitle };
}

// ── POST /api/admin/ingestion/upload ─────────────────────────────────────────

router.post(
  "/upload",
  requireAdmin,
  (req: Request, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      next();
    });
  },
  async (req: Request, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file uploaded." });
      }

      const { path: filePath, originalname, size } = req.file;
      const fileExt = path.extname(originalname).toLowerCase().replace(".", "");

      // Compute SHA-256 hash
      const fileBuffer = fs.readFileSync(filePath);
      const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Check for duplicate (same hash already ingested)
      const existing = await queryOne<{ id: number; job_id: number }>(
        `SELECT sfv.id, ij.id as job_id
         FROM source_file_versions sfv
         LEFT JOIN ingestion_jobs ij ON ij.source_file_version_id = sfv.id
         WHERE sfv.file_hash = $1
         LIMIT 1`,
        [fileHash]
      );
      if (existing) {
        fs.unlinkSync(filePath);
        return res.status(409).json({
          ok: false,
          error: "This exact file has already been uploaded (identical SHA-256 hash).",
          existingJobId: (existing as Record<string, unknown>).job_id,
        });
      }

      // Parse the workbook
      let parsedResult: ReturnType<typeof parseWorkbook>;
      try {
        parsedResult = parseWorkbook(filePath, `.${fileExt}`);
      } catch (parseErr) {
        fs.unlinkSync(filePath);
        return res.status(422).json({
          ok: false,
          error: `Failed to parse file: ${(parseErr as Error).message}`,
        });
      }

      const { worksheets } = parsedResult;
      const totalDataRows = worksheets.reduce((sum, ws) => sum + ws.totalDataRows, 0);

      // Create dataset_library entry (Admin will update title/category after review)
      const [dl] = await query<{ id: number }>(
        `INSERT INTO data_library
           (title, category, source, processing_status, confidence, notes, is_fixture)
         VALUES ($1, 'draft', 'Pending Admin classification', 'processing', 'moderate',
                 'Awaiting Admin mapping and classification.', FALSE)
         RETURNING id`,
        [originalname]
      );

      // Create source_file_versions row
      const [sfv] = await query<{ id: number }>(
        `INSERT INTO source_file_versions
           (dataset_id, original_filename, file_hash, file_size_bytes, file_type,
            imported_by, row_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [dl.id, originalname, fileHash, size, fileExt,
         req.session.userId ?? null, totalDataRows]
      );

      // Create ingestion_job
      const [job] = await query<{ id: number }>(
        `INSERT INTO ingestion_jobs
           (dataset_id, source_file_version_id, file_name, file_type, file_path,
            status, total_rows, triggered_by, parsed_structure)
         VALUES ($1, $2, $3, $4, $5, 'preview', $6, $7, $8)
         RETURNING id`,
        [
          dl.id,
          sfv.id,
          originalname,
          fileExt,
          filePath,
          totalDataRows,
          req.session.userId ?? null,
          JSON.stringify({ worksheets }),
        ]
      );

      return res.json({
        ok: true,
        data: {
          jobId: job.id,
          datasetId: dl.id,
          sourceFileVersionId: sfv.id,
          fileName: originalname,
          fileHash,
          fileSizeBytes: size,
          totalWorksheets: worksheets.length,
          totalDataRows,
          worksheets: worksheets.map((ws) => ({
            name: ws.name,
            detectedType: ws.detectedType,
            detectedTypeLabel: ws.detectedTypeLabel,
            detectedTypeConfidence: ws.detectedTypeConfidence,
            totalDataRows: ws.totalDataRows,
            columnCount: ws.columns.length,
            isEmpty: ws.isEmpty,
          })),
        },
      });
    } catch (err) {
      console.error("[ingestion/upload]", err);
      return res.status(500).json({ ok: false, error: "Server error during ingestion." });
    }
  }
);

// ── GET /api/admin/ingestion — list jobs ─────────────────────────────────────

router.get("/", requireStaff, async (_req, res) => {
  try {
    const jobs = await query(`
      SELECT ij.id, ij.file_name, ij.file_type, ij.status,
             ij.total_rows, ij.rows_imported, ij.rows_errored,
             ij.started_at, ij.completed_at,
             dl.title as dataset_title, dl.category,
             u.name as triggered_by_name,
             sfv.file_hash, sfv.file_size_bytes
      FROM ingestion_jobs ij
      LEFT JOIN data_library dl ON ij.dataset_id = dl.id
      LEFT JOIN users u ON ij.triggered_by = u.id
      LEFT JOIN source_file_versions sfv ON ij.source_file_version_id = sfv.id
      ORDER BY ij.started_at DESC
      LIMIT 50
    `);
    return res.json({ ok: true, data: jobs });
  } catch (err) {
    console.error("[ingestion/list]", err);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ── GET /api/admin/ingestion/:jobId — get job + full parsed structure ─────────

router.get("/:jobId", requireStaff, async (req, res) => {
  try {
    const job = await queryOne<Record<string, unknown>>(
      `SELECT ij.*, dl.title as dataset_title, dl.category as dataset_category,
              sfv.original_filename, sfv.file_hash, sfv.file_size_bytes,
              sfv.imported_at, u.name as triggered_by_name
       FROM ingestion_jobs ij
       LEFT JOIN data_library dl ON ij.dataset_id = dl.id
       LEFT JOIN source_file_versions sfv ON ij.source_file_version_id = sfv.id
       LEFT JOIN users u ON ij.triggered_by = u.id
       WHERE ij.id = $1`,
      [req.params.jobId]
    );
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });

    return res.json({ ok: true, data: job });
  } catch (err) {
    console.error("[ingestion/get]", err);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ── POST /api/admin/ingestion/:jobId/classify — save Admin mapping ────────────
// Saves worksheet/column classification decisions to the job record.
// Does NOT commit any production rows. Status → 'mapped'.

router.post("/:jobId/classify", requireAdmin, async (req, res) => {
  try {
    const { columnMap, datasetTitle, datasetCategory, datasetSource, yearsData } = req.body;

    if (!columnMap || !Array.isArray(columnMap.worksheets)) {
      return res.status(400).json({ ok: false, error: "columnMap.worksheets array required." });
    }

    const job = await queryOne<{ id: number; dataset_id: number; status: string }>(
      "SELECT id, dataset_id, status FROM ingestion_jobs WHERE id = $1",
      [req.params.jobId]
    );
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });
    if (job.status === "complete" || job.status === "cancelled") {
      return res.status(409).json({ ok: false, error: `Job is already ${job.status}.` });
    }

    // Save mapping to job
    await query(
      `UPDATE ingestion_jobs
       SET column_map = $1, status = 'mapped'
       WHERE id = $2`,
      [JSON.stringify(columnMap), job.id]
    );

    // Update dataset_library metadata if provided
    if (datasetTitle || datasetCategory || datasetSource || yearsData) {
      const updates: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (datasetTitle)    { updates.push(`title = $${i++}`);          vals.push(datasetTitle); }
      if (datasetCategory) { updates.push(`category = $${i++}`);       vals.push(datasetCategory); }
      if (datasetSource)   { updates.push(`source = $${i++}`);         vals.push(datasetSource); }
      if (yearsData)       { updates.push(`years_covered = $${i++}`);  vals.push(yearsData); }
      updates.push(`processing_status = $${i++}`);
      vals.push("ready");
      vals.push(job.dataset_id);
      await query(
        `UPDATE data_library SET ${updates.join(", ")} WHERE id = $${i}`,
        vals
      );
    }

    return res.json({
      ok: true,
      message: "Mapping saved. No production records have been committed. Stage 5 (commit) is pending OSM approval.",
    });
  } catch (err) {
    console.error("[ingestion/classify]", err);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ── DELETE /api/admin/ingestion/:jobId — cancel job ──────────────────────────

router.delete("/:jobId", requireAdmin, async (req, res) => {
  try {
    const job = await queryOne<{ id: number; file_path: string; status: string }>(
      "SELECT id, file_path, status FROM ingestion_jobs WHERE id = $1",
      [req.params.jobId]
    );
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });
    if (job.status === "complete") {
      return res.status(409).json({ ok: false, error: "Cannot cancel a completed job." });
    }

    await query(
      "UPDATE ingestion_jobs SET status = 'cancelled', completed_at = NOW() WHERE id = $1",
      [job.id]
    );

    // Clean up temp file if it still exists
    if (job.file_path && fs.existsSync(job.file_path)) {
      try { fs.unlinkSync(job.file_path); } catch { /* ignore */ }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[ingestion/cancel]", err);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

export default router;
