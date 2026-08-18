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

// Evidence-First safeguard: ANY header that implies a model output, projection,
// or signability estimate must NEVER auto-classify as Verified Public Information.
// Add new patterns here; do NOT remove existing ones.
const PROJECTION_HEADER_PATTERNS = [
  // Projection / forecast
  /project/i, /forecast/i, /predict/i, /hypothetical/i,
  // Estimation (full word variants — "estim" alone caught separately below)
  /estimat/i,
  // Probability / likelihood — note: "likely" ≠ "likelihood", so both are listed
  /probability/i, /probab/i,
  /likelihood/i, /likely/i,
  // Signability and signing-probability concepts
  /signab/i,           // signability, signable
  /sign.*lik/i,        // signing likelihood, sign likelihood
  /lik.*sign/i,        // likelihood to sign, likelihood of signing
  /prob.*sign/i,       // probability to sign
  /sign.*prob/i,       // signing probability
  /to\s+sign/i,        // "likelihood to sign", "expected to sign"
  // Expected outcome
  /expected\s+outcome/i, /expected/i,
  // Other model/inference indicators
  /model/i, /infer/i, /scenario/i,
];

const CALCULATED_HEADER_PATTERNS = [
  /total/i, /avg/i, /average/i, /median/i, /pct/i, /percent/i,
  /rate/i, /ratio/i, /count/i, /sum/i, /ytd/i, /delta/i, /change/i,
  /trend/i, /index/i,
  // Financial aggregates and growth metrics
  /cagr/i,                    // Compound Annual Growth Rate (e.g. "5-Yr CAGR")
  /yr\s*avg/i,                // "5-Yr Avg", "3-Yr Avg"
  /over.{0,5}under/i,         // "Over/Under CBT", "Over/Under Pool" (net vs threshold)
];

// OSM internal/proprietary notes — always labelled OSM Proprietary Data.
const OSM_PROPRIETARY_PATTERNS = [
  /osm\s*notes?/i,          // "OSM Notes", "OSM Note"
  /osm\s*comment/i,         // "OSM Comments"
  /osm\s*remark/i,          // "OSM Remarks"
  /internal\s*notes?/i,     // "Internal Notes"
  /internal\s*comment/i,
  /proprietary/i,
  /agent\s*notes?/i,        // "Agent Notes"
  /scout\s*notes?/i,        // "Scout Notes"
  // OSM analyst interpretation columns — must NOT fall through to Verified Public Information
  /pattern.*\/.*read/i,     // "Pattern / Read" — OSM analyst's qualitative read on a club
  /pattern.*read/i,
  /analyst\s*notes?/i,
  /analyst\s*read/i,
  /osm\s*read/i,
];

function detectColumnEvidenceLabel(header: string): string {
  // OSM proprietary check runs FIRST — before projection/calculated checks.
  if (OSM_PROPRIETARY_PATTERNS.some((p) => p.test(header))) {
    return "OSM Proprietary Data";
  }
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
  // OSM proprietary notes — prefer osm_notes over generic notes wherever schema supports it
  { patterns: [/osm\s*notes?/i, /osm\s*comment/i, /osm\s*remark/i, /internal\s*notes?/i, /agent\s*notes?/i, /scout\s*notes?/i], field: "osm_notes", table: "draft_players" },
  // ── club_payroll_history ──────────────────────────────────────────────────
  // More-specific patterns FIRST so they shadow the broader ones below.
  // "Times Over CBT Threshold" is a COUNT, not the threshold dollar value —
  // must come before the cbt_threshold hint or it will be shadowed.
  { patterns: [/times\s*over\s*cbt/i, /times.*cbt.*threshold/i, /cbt.*times/i], field: "times_over_cbt", table: "club_payroll_history" },
  { patterns: [/total\s*payroll/i, /payroll\s*total/i], field: "total_payroll", table: "club_payroll_history" },
  { patterns: [/cbt\s*threshold/i, /luxury\s*tax\s*threshold/i], field: "cbt_threshold", table: "club_payroll_history" },
  { patterns: [/luxury\s*tax\s*paid/i, /cbt\s*paid/i], field: "luxury_tax_paid", table: "club_payroll_history" },
  { patterns: [/over.{0,5}under\s*cbt/i, /cbt\s*over/i, /cbt\s*under/i], field: "cbt_overage", table: "club_payroll_history" },
  // Calculated aggregates — labelled Calculated Results at evidence classification time.
  // Pattern: explicit "payroll" variants + generic N-yr-avg (context resolved by sheetContext).
  { patterns: [/\d.yr\s*avg.*payroll/i, /payroll.*\d.yr\s*avg/i, /\d.yr\s*avg\b/i, /\bN.yr\s*avg\b/i], field: "avg_5yr_payroll", table: "club_payroll_history" },
  { patterns: [/cagr.*payroll/i, /payroll.*cagr/i], field: "cagr_5yr_payroll", table: "club_payroll_history" },
  // ── club_draft_spend_history ──────────────────────────────────────────────
  // More-specific vs/percentage patterns FIRST so they shadow the avg_5yr_pool hint.
  { patterns: [/pool\s*vs\s*\d.yr/i, /\d.yr.*pool.*pct/i, /pool.*avg.*pct/i, /pool.*vs.*avg/i, /vs.*\d.yr.*avg/i], field: "pool_vs_5yr_avg_pct", table: "club_draft_spend_history" },
  { patterns: [/total\s*draft\s*spend/i, /draft\s*spend\s*total/i, /draft\s*spending/i], field: "total_draft_spend", table: "club_draft_spend_history" },
  { patterns: [/pool\s*allot/i, /draft\s*pool/i, /bonus\s*pool/i, /^allot/i], field: "pool_allotment", table: "club_draft_spend_history" },
  { patterns: [/over.{0,5}under\s*pool/i, /pool\s*over/i, /pool\s*under/i], field: "over_under_pool", table: "club_draft_spend_history" },
  // Calculated aggregates for draft spend.
  { patterns: [/\d.yr\s*avg.*pool/i, /pool.*\d.yr\s*avg/i, /avg\s*pool/i], field: "avg_5yr_pool", table: "club_draft_spend_history" },
  { patterns: [/cagr.*pool/i, /cagr.*spend/i, /spend.*cagr/i], field: "cagr_5yr_spend", table: "club_draft_spend_history" },
  // OSM analyst qualitative read column — stored as OSM Proprietary Data
  { patterns: [/pattern.*\/.*read/i, /pattern.*read/i, /osm.*read/i, /analyst.*read/i], field: "osm_pattern_read", table: "club_draft_spend_history" },
  // First-round pick in the context of a draft spend projection sheet
  { patterns: [/draft\s*pick.*1st\s*rd/i, /1st\s*rd.*draft\s*pick/i, /first.*round.*pick/i, /draft\s*pick.*first/i], field: "first_round_pick", table: "club_draft_spend_history" },
  // ── Wide-format year columns (e.g. "2021", "2022" as column headers) ──────
  // These mark a columnar/pivoted layout. The commit step must unpivot them
  // into one row per (club, season). The suggested table is resolved at runtime
  // based on sheet context — see suggestCanonicalField() sheetContext logic.
  { patterns: [/^(19|20)\d{2}$/], field: "season_column__requires_unpivot", table: "club_payroll_history" },
];

/**
 * Suggest a canonical field for a column header.
 * Pass `sheetContext` (the worksheet name) for context-sensitive resolution of
 * ambiguous headers like "Club" or year-number columns, which map to different
 * tables depending on whether the sheet contains player data or club-financial data.
 */
function suggestCanonicalField(
  header: string,
  sheetContext?: string
): { field: string; table: string } | null {
  const h = String(header ?? "").trim();
  const ctx = sheetContext ?? "";

  // ── Context-sensitive overrides (run before generic hints) ─────────────────
  const isPayrollSheet = /payroll|cbt|luxury/i.test(ctx);
  const isSpendSheet   = /spend|pool|draft.*hist/i.test(ctx);
  const isProjSheet    = /projection|forecast|estimate/i.test(ctx);
  const isClubFinancial = isPayrollSheet || isSpendSheet || isProjSheet;

  // "Club" in a financial/payroll sheet → correct club table, not draft_players.
  if (isClubFinancial && /^club$/i.test(h)) {
    return isPayrollSheet
      ? { field: "mlb_org", table: "club_payroll_history" }
      : { field: "mlb_org", table: "club_draft_spend_history" };
  }

  // Year-pivot columns: resolve to the table appropriate for the sheet.
  if (/^(19|20)\d{2}$/.test(h)) {
    if (isPayrollSheet) {
      return { field: "season_column__requires_unpivot", table: "club_payroll_history" };
    }
    if (isSpendSheet || isProjSheet) {
      return { field: "season_column__requires_unpivot", table: "club_draft_spend_history" };
    }
    // Generic fallback for year-pivot columns on unclassified sheets.
    return { field: "season_column__requires_unpivot", table: "club_payroll_history" };
  }

  // ── Generic hints ───────────────────────────────────────────────────────────
  for (const hint of CANONICAL_FIELD_HINTS) {
    if (hint.patterns.some((p) => p.test(h))) {
      return { field: hint.field, table: hint.table };
    }
  }
  return null;
}

// ── Header-row detection ──────────────────────────────────────────────────────
// Real-world workbooks frequently have title rows, source attribution, or
// methodology notes above the actual tabular header.  This section detects
// the real header row instead of blindly trusting row 0.

interface RowWithPosition {
  excelRow: number;     // 1-based Excel row number (accounts for sheet start offset)
  arrayIndex: number;   // 0-based index in the blankrows=true read array
  values: (string | number | boolean | null)[];
  isBlank: boolean;
}

/**
 * Score a single row for how likely it is to be a tabular header row.
 * Higher = more header-like.  Single-cell rows always return -10 (title rows).
 */
function scoreRowAsHeader(
  values: (string | number | boolean | null)[],
  maxColCount: number
): number {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  const nonNullCount = nonNull.length;

  // A header must span at least 2 columns.  Single-cell = title / description.
  if (nonNullCount <= 1) return -10;

  const stringCount = nonNull.filter((v) => typeof v === "string").length;
  const stringRatio = stringCount / nonNullCount;
  const spreadRatio = nonNullCount / Math.max(maxColCount, 1);
  const avgLen =
    nonNull.map((v) => String(v)).reduce((s, t) => s + t.length, 0) / nonNullCount;

  let score = 0;

  // Multi-column presence (the more columns filled, the more header-like).
  if (nonNullCount >= 2) score += 2;
  if (nonNullCount >= 4) score += 2;
  if (nonNullCount >= 6) score += 1;

  // String content.  Year-number columns (2021, 2022 …) are valid header cells,
  // so partial string ratios still get credit.
  if (stringRatio >= 0.5) score += 3;
  else if (stringRatio >= 0.1) score += 1;

  // Wide column spread relative to the sheet's populated columns.
  if (spreadRatio >= 0.5) score += 2;
  else if (spreadRatio >= 0.3) score += 1;

  // Short cell values — header labels are terse.
  if (avgLen <= 15) score += 2;
  else if (avgLen <= 35) score += 1;

  return score;
}

/**
 * Scan the first 10 non-blank rows and return the most likely tabular header,
 * along with all rows that precede it (preamble / title / source rows).
 */
function detectHeaderRow(allRows: RowWithPosition[]): {
  headerRow: RowWithPosition;
  preambleRows: RowWithPosition[];
  confidence: "high" | "low";
} {
  const nonBlankRows = allRows.filter((r) => !r.isBlank);

  if (nonBlankRows.length === 0) {
    const fallback = allRows[0] ?? {
      excelRow: 1, arrayIndex: 0, values: [], isBlank: true,
    };
    return { headerRow: fallback, preambleRows: [], confidence: "low" };
  }

  // Max non-null count across first 15 non-blank rows (used for spread ratio).
  const maxColCount = Math.max(
    ...nonBlankRows
      .slice(0, 15)
      .map((r) => r.values.filter((v) => v !== null && v !== undefined && v !== "").length),
    1
  );

  // Score the first 10 non-blank rows.
  const candidates = nonBlankRows.slice(0, 10).map((row) => ({
    row,
    score: scoreRowAsHeader(row.values, maxColCount),
  }));

  const best = candidates.reduce((prev, curr) =>
    curr.score > prev.score ? curr : prev
  );

  // Preamble = every row (blank or non-blank) before the detected header.
  const preambleRows = allRows.filter((r) => r.arrayIndex < best.row.arrayIndex);

  // Confidence: high if we moved past the first non-blank row OR score is strong.
  const movedPastFirst = best.row !== nonBlankRows[0];
  const confidence: "high" | "low" = movedPastFirst || best.score >= 6 ? "high" : "low";

  return { headerRow: best.row, preambleRows, confidence };
}

// ── Parse XLSX/CSV into worksheet preview ────────────────────────────────────

interface ParsedWorksheet {
  name: string;
  detectedType: string;
  detectedTypeLabel: string;
  detectedTypeConfidence: "high" | "low";
  detectedHeaderExcelRow: number;           // 1-based Excel row of detected header
  detectedHeaderConfidence: "high" | "low"; // confidence in the header-row detection
  preamble: { excelRow: number; raw: string[] }[]; // non-blank rows before header
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
  defaultSkip: boolean;   // true when evidence is "DiamondIQ Analysis / Inference"
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
    const ref = sheet["!ref"];

    // Sheet has no populated cells at all — treat as empty/chart.
    if (!ref) {
      worksheets.push({
        name: sheetName,
        detectedType: "chart",
        detectedTypeLabel: "Chart / Presentation Data (skip)",
        detectedTypeConfidence: "high",
        detectedHeaderExcelRow: 1,
        detectedHeaderConfidence: "low",
        preamble: [],
        headers: [],
        sampleRows: [],
        totalDataRows: 0,
        columns: [],
        isEmpty: true,
      });
      continue;
    }

    // Decode starting Excel row so array indices map to real Excel row numbers.
    const range = XLSX.utils.decode_range(ref);
    const startExcelRow = range.s.r + 1; // SheetJS uses 0-based rows; Excel is 1-based

    // Read ALL rows including blank rows to preserve Excel row positions.
    const rawWithBlanks = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      sheet,
      { header: 1, defval: null, blankrows: true }
    );

    const allRows: RowWithPosition[] = (
      rawWithBlanks as (string | number | boolean | null)[][]
    ).map((values, arrayIndex) => ({
      excelRow: startExcelRow + arrayIndex,
      arrayIndex,
      values,
      isBlank: values.every((v) => v === null || v === undefined || v === ""),
    }));

    if (allRows.every((r) => r.isBlank)) {
      worksheets.push({
        name: sheetName,
        detectedType: "chart",
        detectedTypeLabel: "Chart / Presentation Data (skip)",
        detectedTypeConfidence: "high",
        detectedHeaderExcelRow: startExcelRow,
        detectedHeaderConfidence: "low",
        preamble: [],
        headers: [],
        sampleRows: [],
        totalDataRows: 0,
        columns: [],
        isEmpty: true,
      });
      continue;
    }

    // ── Detect the actual tabular header row ──────────────────────────────────
    const { headerRow, preambleRows, confidence: headerConfidence } =
      detectHeaderRow(allRows);

    // Normalise header cell values to strings (year-number columns → "2021" etc.).
    const headerValues = headerRow.values.map((h) =>
      h !== null && h !== undefined ? String(h).trim() : null
    );

    // Data rows = non-blank rows strictly after the detected header row.
    const dataRows = allRows
      .filter((r) => r.arrayIndex > headerRow.arrayIndex && !r.isBlank)
      .map((r) => r.values as (string | number | boolean | null)[]);

    const sampleRows = dataRows.slice(0, 5);
    const totalDataRows = dataRows.length;

    // Preamble rows (non-blank only) preserved as worksheet provenance metadata.
    const preamble = preambleRows
      .filter((r) => !r.isBlank)
      .map((r) => ({
        excelRow: r.excelRow,
        raw: r.values
          .filter((v) => v !== null && v !== undefined && v !== "")
          .map((v) => String(v)),
      }));

    // ── Worksheet-type detection ──────────────────────────────────────────────
    const { type, label, confidence } = detectWorksheetType(sheetName);

    // ── Column metadata ───────────────────────────────────────────────────────
    const columns: ParsedColumn[] = headerValues.map((header, idx) => {
      const h = header ?? `Column_${idx + 1}`;
      const sampleValues = sampleRows.map((row) => row[idx] ?? null);
      const allNull = sampleValues.every((v) => v === null || v === "");
      const suggestion = suggestCanonicalField(h, sheetName);
      const evidenceLabel = detectColumnEvidenceLabel(h);
      return {
        index: idx,
        header: h,
        detectedEvidenceLabel: evidenceLabel,
        defaultSkip: evidenceLabel === "DiamondIQ Analysis / Inference",
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
      detectedHeaderExcelRow: headerRow.excelRow,
      detectedHeaderConfidence: headerConfidence,
      preamble,
      headers: headerValues,
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

// ── POST /api/admin/ingestion/:jobId/reparse — re-parse stored source file ────
// Re-runs the parser against the already-stored file without requiring a
// re-upload.  Updates parsed_structure and total_rows in-place.
// Useful after parser improvements to re-classify a real workbook.
// Does NOT commit any production records.

router.post("/:jobId/reparse", requireAdmin, async (req, res) => {
  try {
    const job = await queryOne<{
      id: number;
      file_path: string;
      file_type: string;
      status: string;
    }>(
      "SELECT id, file_path, file_type, status FROM ingestion_jobs WHERE id = $1",
      [req.params.jobId]
    );
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });
    if (job.status === "complete" || job.status === "cancelled") {
      return res.status(409).json({
        ok: false,
        error: `Cannot reparse a ${job.status} job.`,
      });
    }

    const filePath = (job as Record<string, unknown>).file_path as string;
    const fileType = (job as Record<string, unknown>).file_type as string;

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        ok: false,
        error:
          "Source file is no longer on disk. Please re-upload the original file.",
      });
    }

    let parsedResult: ReturnType<typeof parseWorkbook>;
    try {
      parsedResult = parseWorkbook(filePath, `.${fileType}`);
    } catch (parseErr) {
      return res.status(422).json({
        ok: false,
        error: `Re-parse failed: ${(parseErr as Error).message}`,
      });
    }

    const { worksheets } = parsedResult;
    const totalDataRows = worksheets.reduce((sum, ws) => sum + ws.totalDataRows, 0);

    await query(
      `UPDATE ingestion_jobs
       SET parsed_structure = $1, total_rows = $2, status = 'preview'
       WHERE id = $3`,
      [JSON.stringify({ worksheets }), totalDataRows, (job as Record<string, unknown>).id]
    );

    return res.json({
      ok: true,
      data: {
        jobId: (job as Record<string, unknown>).id,
        totalWorksheets: worksheets.length,
        totalDataRows,
        worksheets: worksheets.map((ws) => ({
          name: ws.name,
          detectedType: ws.detectedType,
          detectedTypeLabel: ws.detectedTypeLabel,
          detectedTypeConfidence: ws.detectedTypeConfidence,
          detectedHeaderExcelRow: ws.detectedHeaderExcelRow,
          detectedHeaderConfidence: ws.detectedHeaderConfidence,
          preambleRowCount: ws.preamble.length,
          totalDataRows: ws.totalDataRows,
          columnCount: ws.columns.length,
          isEmpty: ws.isEmpty,
        })),
      },
    });
  } catch (err) {
    console.error("[ingestion/reparse]", err);
    return res.status(500).json({ ok: false, error: "Server error during re-parse." });
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
