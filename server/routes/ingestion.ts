/**
 * DiamondIQ — Data Ingestion Routes
 *
 * POST  /api/admin/ingestion/upload              — accept file, parse, return preview
 * GET   /api/admin/ingestion                     — list ingestion jobs
 * GET   /api/admin/ingestion/:jobId              — get single job + parsed structure
 * POST  /api/admin/ingestion/:jobId/classify     — save Admin mapping decisions
 * POST  /api/admin/ingestion/:jobId/reparse      — re-parse stored file (no re-upload)
 * POST  /api/admin/ingestion/:jobId/commit-preview — four-layer record count preview (no commit)
 * DELETE /api/admin/ingestion/:jobId             — cancel / remove job
 *
 * IMPORTANT: These routes stop at the mapping/preview stage.
 * No production records are committed until Stage 5 (commit endpoint) is built
 * and explicitly approved by OSM Admin.
 *
 * Four-layer evidence architecture:
 *   Layer 1 — Canonical Factual Records  (evidence: verified_public)
 *   Layer 2 — Derived Metrics            (evidence: calculated | osm_proprietary)
 *   Layer 3 — OSM Research Findings      (evidence: osm_proprietary)
 *   Layer 4 — DiamondIQ Inferences       (evidence: diamondiq_inference)
 */

import { Router, Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { requireAdmin, requireStaff } from "../middleware/auth";
import pool, { query, queryOne } from "../db";

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

// ── Layer mapping ─────────────────────────────────────────────────────────────

/** Map an evidence label string to a numeric layer (1–4) and a target table. */
function detectLayer(evidenceLabel: string): {
  layer: 1 | 2 | 3 | 4;
  layerName: "factual" | "derived" | "osm_finding" | "inference";
} {
  switch (evidenceLabel) {
    case "Verified Public Information":
      return { layer: 1, layerName: "factual" };
    case "Calculated Results":
      return { layer: 2, layerName: "derived" };
    case "OSM Proprietary Data":
    case "OSM-Provided Athlete Information":
      return { layer: 3, layerName: "osm_finding" };
    case "DiamondIQ Analysis / Inference":
      return { layer: 4, layerName: "inference" };
    default:
      return { layer: 1, layerName: "factual" };
  }
}

interface ParsedColumn {
  index: number;
  header: string;
  detectedEvidenceLabel: string;
  defaultSkip: boolean;       // true when evidence is "DiamondIQ Analysis / Inference"
  suggestedLayer: 1 | 2 | 3 | 4;
  suggestedLayerName: "factual" | "derived" | "osm_finding" | "inference";
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
      const { layer, layerName } = detectLayer(evidenceLabel);
      return {
        index: idx,
        header: h,
        detectedEvidenceLabel: evidenceLabel,
        defaultSkip: evidenceLabel === "DiamondIQ Analysis / Inference",
        suggestedLayer: layer,
        suggestedLayerName: layerName,
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

// ── POST /api/admin/ingestion/:jobId/commit-preview ───────────────────────────
// Analyses parsed_structure (+ column_map if saved) and returns a four-layer
// record count preview.  Does NOT write any production records.
// This is the mandatory sign-off preview before Stage 5 commit.

router.post("/:jobId/commit-preview", requireAdmin, async (req, res) => {
  try {
    const job = await queryOne<Record<string, unknown>>(
      `SELECT ij.id, ij.status, ij.parsed_structure, ij.column_map,
              ij.source_file_version_id, ij.dataset_id,
              sfv.file_hash, sfv.original_filename
       FROM ingestion_jobs ij
       LEFT JOIN source_file_versions sfv ON sfv.id = ij.source_file_version_id
       WHERE ij.id = $1`,
      [req.params.jobId]
    );
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });
    if (job.status === "complete" || job.status === "cancelled") {
      return res.status(409).json({ ok: false, error: `Cannot preview a ${job.status} job.` });
    }

    const ps = job.parsed_structure as { worksheets: ParsedWorksheet[] } | null;
    if (!ps?.worksheets) {
      return res.status(422).json({ ok: false, error: "No parsed structure available. Run reparse first." });
    }

    // Use saved column_map if available, else fall back to auto-detected suggestions.
    type ColMapEntry = { header: string; canonicalField?: string; evidenceLabel?: string; skip?: boolean; layer?: number };
    type WsMapEntry  = { name: string; skip?: boolean; classification?: string; columns?: ColMapEntry[] };
    const columnMap  = job.column_map as { worksheets?: WsMapEntry[] } | null;
    const mapIndex   = new Map<string, WsMapEntry>();
    if (columnMap?.worksheets) {
      for (const wm of columnMap.worksheets) mapIndex.set(wm.name, wm);
    }

    // Counters
    let layer1Factual   = 0;
    let layer2Derived   = 0;
    let layer3OsmFinds  = 0;
    let layer4Inference = 0;
    let skippedCols     = 0;
    let skippedSheets   = 0;
    let unmapped        = 0;
    let requiresReview  = 0;

    // Deduplication tracking: metric_name seen across sheets
    const derivedKeys   = new Map<string, number>();   // "entity_type:metric_name:period" → count
    const factualKeys   = new Map<string, number>();   // "table:mlb_org:year" → count (unpivot)
    const osmFindKeys   = new Map<string, number>();   // "finding_type:col_header" → count

    // Detail breakdown by sheet
    const sheetBreakdown: Array<{
      sheet: string;
      dataRows: number;
      skipped: boolean;
      reason?: string;
      layer1: number;
      layer2: number;
      layer3: number;
      layer4: number;
      columns: Array<{
        header: string;
        layer: number;
        layerName: string;
        target: string;
        dataRows: number;
        requiresUnpivot: boolean;
        dupKey?: string;
        isDuplicate: boolean;
        isSkipped: boolean;
        isUnmapped: boolean;
        requiresAdminReview: boolean;
      }>;
    }> = [];

    const LAYER_LABELS = ["", "Factual", "Derived", "OSM Finding", "Inference"];

    for (const ws of ps.worksheets) {
      const savedWs = mapIndex.get(ws.name);
      const wsSkipped =
        savedWs?.skip === true ||
        ws.detectedType === "chart" ||
        ws.detectedType === "documentation" ||
        ws.isEmpty;

      if (wsSkipped) {
        skippedSheets++;
        sheetBreakdown.push({
          sheet: ws.name,
          dataRows: ws.totalDataRows,
          skipped: true,
          reason: ws.isEmpty ? "Empty" : ws.detectedType === "chart" ? "Chart / Presentation (skip)" : "Documentation",
          layer1: 0, layer2: 0, layer3: 0, layer4: 0,
          columns: [],
        });
        continue;
      }

      // Context flags for sheet
      const sheetCtx = ws.name;
      const isPayrollSheet = /payroll|cbt|luxury/i.test(sheetCtx);
      const isSpendSheet   = /spend|pool|draft.*hist/i.test(sheetCtx);
      const isProjSheet    = /projection|forecast/i.test(sheetCtx);

      let wsL1 = 0, wsL2 = 0, wsL3 = 0, wsL4 = 0;
      const colDetails: typeof sheetBreakdown[0]["columns"] = [];

      for (let ci = 0; ci < ws.columns.length; ci++) {
        const col = ws.columns[ci];
        const savedCol = savedWs?.columns?.[ci];
        const colSkip = savedCol?.skip === true || col.allNull;

        if (colSkip) {
          skippedCols++;
          colDetails.push({
            header: col.header,
            layer: 0, layerName: "Skipped", target: "—",
            dataRows: 0, requiresUnpivot: false, isDuplicate: false,
            isSkipped: true, isUnmapped: false, requiresAdminReview: false,
          });
          continue;
        }

        // Determine evidence label (saved override > auto-detected)
        const evidLabel  = savedCol?.evidenceLabel ?? col.detectedEvidenceLabel;
        const { layer, layerName } = detectLayer(evidLabel);

        // Determine canonical field (saved override > auto-suggested)
        const savedField = savedCol?.canonicalField ?? "";
        const autoField  = col.suggestedCanonicalField;
        const autoTable  = col.suggestedTable;
        const resolvedField = savedField ? savedField.split("|")[0] : (autoField ?? "");
        const resolvedTable = savedField ? savedField.split("|")[1] : (autoTable ?? "");

        // Flag identifier columns (they anchor records but don't produce their own rows)
        const isIdentifier = /^(mlb_org|entity_key|player_name|club)$/i.test(resolvedField) ||
                             col.header.toLowerCase() === "club";

        // Check for year-pivot columns (wide format → require unpivot)
        const requiresUnpivot = resolvedField === "season_column__requires_unpivot";

        // Target label for display
        let target = resolvedField && resolvedTable
          ? `${resolvedTable}.${resolvedField}`
          : resolvedField
          ? resolvedField
          : "(unmapped)";

        // Layer 2/3/4: override target label
        if (layer === 2) target = `derived_metrics [${resolvedField || "metric_name?"}]`;
        if (layer === 3) target = `osm_research_findings [${resolvedField || "finding_text"}]`;
        if (layer === 4) target = `diamondiq_inferences [${resolvedField || "inference_value"}]`;

        // Unmapped check
        const isUnmapped = layer === 1 && !resolvedField && !isIdentifier;
        if (isUnmapped) unmapped++;

        // Requires admin review if no canonical field set, or if evidence label
        // is ambiguous (e.g. OSM tier classification that could be calculated or proprietary)
        const requiresAdminReview =
          isUnmapped ||
          (layer === 2 && !resolvedField) ||
          (layer === 3 && col.header.toLowerCase().includes("tier"));
        if (requiresAdminReview) requiresReview++;

        // Record count calculation
        let rowCount = 0;
        let dupKey: string | undefined;
        let isDuplicate = false;

        if (!isIdentifier) {
          if (requiresUnpivot) {
            // Year column: one record per data row (each row = one club)
            rowCount = ws.totalDataRows;
            const tbl = isPayrollSheet ? "club_payroll_history"
                      : (isSpendSheet || isProjSheet) ? "club_draft_spend_history"
                      : "club_payroll_history";
            dupKey = `${tbl}:year_col:${col.header}`;
            isDuplicate = factualKeys.has(dupKey);
            if (!isDuplicate) factualKeys.set(dupKey, rowCount);
            else factualKeys.set(dupKey, (factualKeys.get(dupKey) ?? 0) + rowCount);
          } else if (layer === 1) {
            rowCount = ws.totalDataRows;
            dupKey = `factual:${resolvedTable}:${resolvedField}`;
            isDuplicate = factualKeys.has(dupKey);
            if (!isDuplicate) factualKeys.set(dupKey, rowCount);
          } else if (layer === 2) {
            rowCount = ws.totalDataRows;
            const metricKey = resolvedField || col.header;
            dupKey = `derived:${metricKey}`;
            isDuplicate = derivedKeys.has(dupKey);
            derivedKeys.set(dupKey, (derivedKeys.get(dupKey) ?? 0) + rowCount);
          } else if (layer === 3) {
            rowCount = ws.totalDataRows;
            const findType = col.header;
            dupKey = `osm:${findType}`;
            isDuplicate = osmFindKeys.has(dupKey);
            osmFindKeys.set(dupKey, (osmFindKeys.get(dupKey) ?? 0) + rowCount);
          } else if (layer === 4) {
            rowCount = ws.totalDataRows;
          }
        }

        // Accumulate sheet counters
        switch (layer) {
          case 1: wsL1 += rowCount; layer1Factual   += rowCount; break;
          case 2: wsL2 += rowCount; layer2Derived   += rowCount; break;
          case 3: wsL3 += rowCount; layer3OsmFinds  += rowCount; break;
          case 4: wsL4 += rowCount; layer4Inference += rowCount; break;
        }

        colDetails.push({
          header: col.header,
          layer,
          layerName: isIdentifier ? "identifier" : LAYER_LABELS[layer],
          target,
          dataRows: rowCount,
          requiresUnpivot,
          dupKey,
          isDuplicate,
          isSkipped: false,
          isUnmapped,
          requiresAdminReview,
        });
      }

      sheetBreakdown.push({
        sheet: ws.name,
        dataRows: ws.totalDataRows,
        skipped: false,
        layer1: wsL1, layer2: wsL2, layer3: wsL3, layer4: wsL4,
        columns: colDetails,
      });
    }

    // Compute duplicate totals from multi-count entries
    let duplicatesDetected = 0;
    for (const count of derivedKeys.values()) if (count > ws_dataRows(ps, count)) duplicatesDetected++;
    // Simpler: flag any key seen more than once
    duplicatesDetected = 0;
    for (const [, count] of derivedKeys.entries()) if (count > 0) {
      // count > one worksheet's rows means it appeared in multiple sheets
      const sheetRowCounts = ps.worksheets.map(w => w.totalDataRows);
      const maxSingle = Math.max(...sheetRowCounts, 1);
      if (count > maxSingle) duplicatesDetected++;
    }
    for (const [, count] of factualKeys.entries()) if (count > 0) {
      const sheetRowCounts = ps.worksheets.map(w => w.totalDataRows);
      const maxSingle = Math.max(...sheetRowCounts, 1);
      if (count > maxSingle) duplicatesDetected++;
    }

    // Safety: confirm production table counts are still zero
    const [ph] = await query<{ n: string }>(
      `SELECT COUNT(*) as n FROM club_payroll_history WHERE is_fixture = FALSE`
    );
    const [ds] = await query<{ n: string }>(
      `SELECT COUNT(*) as n FROM club_draft_spend_history WHERE is_fixture = FALSE`
    );
    const [dm] = await query<{ n: string }>(
      `SELECT COUNT(*) as n FROM derived_metrics WHERE is_fixture = FALSE`
    );
    const [orf] = await query<{ n: string }>(
      `SELECT COUNT(*) as n FROM osm_research_findings WHERE is_fixture = FALSE`
    );
    const [di] = await query<{ n: string }>(
      `SELECT COUNT(*) as n FROM diamondiq_inferences WHERE is_fixture = FALSE`
    );

    return res.json({
      ok: true,
      data: {
        jobId: job.id,
        status: job.status,
        fileName: job.original_filename,
        fileHash: (job.file_hash as string)?.slice(0, 16) + "…",
        safetyCheck: {
          club_payroll_history_rows: parseInt(ph?.n ?? "0"),
          club_draft_spend_history_rows: parseInt(ds?.n ?? "0"),
          derived_metrics_rows: parseInt(dm?.n ?? "0"),
          osm_research_findings_rows: parseInt(orf?.n ?? "0"),
          diamondiq_inferences_rows: parseInt(di?.n ?? "0"),
          allZero:
            parseInt(ph?.n ?? "0") === 0 &&
            parseInt(ds?.n ?? "0") === 0 &&
            parseInt(dm?.n ?? "0") === 0 &&
            parseInt(orf?.n ?? "0") === 0 &&
            parseInt(di?.n ?? "0") === 0,
        },
        summary: {
          layer1FactualRecords: layer1Factual,
          layer2DerivedMetrics: layer2Derived,
          layer3OsmFindings:    layer3OsmFinds,
          layer4Inferences:     layer4Inference,
          totalRecords:         layer1Factual + layer2Derived + layer3OsmFinds + layer4Inference,
          duplicatesDetected,
          skippedSheets,
          skippedColumns: skippedCols,
          unmappedFields: unmapped,
          requiresOsmReview: requiresReview,
        },
        provenanceLinks: {
          sourceFileVersionId: job.source_file_version_id,
          datasetId: job.dataset_id,
          ingestionJobId: job.id,
          note: "Every committed record will reference ingestion_job_id, source_file_version_id, source_worksheet, source_excel_row, and source_excel_column for full audit chain.",
        },
        sheets: sheetBreakdown,
      },
    });
  } catch (err) {
    console.error("[ingestion/commit-preview]", err);
    return res.status(500).json({ ok: false, error: "Server error during commit preview." });
  }
});

// Helper referenced in commit-preview to avoid reference error
function ws_dataRows(_ps: { worksheets: ParsedWorksheet[] }, _n: number): number {
  return 100; // threshold above a single sheet's row count to detect cross-sheet duplication
}

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

// ── POST /api/admin/ingestion/:jobId/commit — Stage 5: write production rows ─
//
// Reads the raw workbook from disk, filters to valid MLB club rows only,
// unpivots year-pivot columns, and writes all four evidence layers plus
// record_source_assertions (cross-sheet provenance) and record_derivations.
//
// All writes happen inside a single transaction — the entire commit rolls back
// on any error.  Zero production records are written until this endpoint succeeds.
//
// The 9 Admin-approved mapping corrections for Job #3 are applied here:
//   1. Payroll CAGR → L2 cagr_payroll_5yr
//   2. Draft Spend CAGR → L2 cagr_pool_5yr
//   3. 2025 Rank → L2 pool_rank
//   4. CBT Payroll Tier → L2 cbt_payroll_tier
//   5. Times Picked-10-Spots Penalty → L2 times_penalty_proxy
//   6. Draft Pool Tier → L2 draft_pool_tier
//   7. Payroll ↔ Draft Pool Correlation → L3 correlation
//   8. Assumed Total-Spend-vs-Pool Rate → L3 methodology_assumption
//   9. Times Over CBT Threshold → L2 times_over_cbt (NOT L1)

const MLB_CLUBS = new Set([
  "Los Angeles Dodgers","New York Mets","New York Yankees","Philadelphia Phillies",
  "Toronto Blue Jays","San Diego Padres","Boston Red Sox","Houston Astros",
  "Texas Rangers","Atlanta Braves","Chicago Cubs","San Francisco Giants",
  "Los Angeles Angels","Arizona Diamondbacks","Seattle Mariners","Detroit Tigers",
  "Kansas City Royals","Baltimore Orioles","St. Louis Cardinals","Colorado Rockies",
  "Cincinnati Reds","Milwaukee Brewers","Minnesota Twins","Washington Nationals",
  "Cleveland Guardians","Athletics","Pittsburgh Pirates","Tampa Bay Rays",
  "Chicago White Sox","Miami Marlins",
]);

router.post("/:jobId/commit", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    // ── 1. Load job ──────────────────────────────────────────────────────────
    const job = await queryOne<{
      id: number; status: string; file_path: string; file_type: string;
      source_file_version_id: number; dataset_id: number;
    }>(
      `SELECT ij.id, ij.status, ij.file_path, ij.file_type,
              ij.source_file_version_id, ij.dataset_id
       FROM ingestion_jobs ij WHERE ij.id = $1`,
      [req.params.jobId]
    );
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });
    if (job.status === "complete")   return res.status(409).json({ ok: false, error: "Job already committed." });
    if (job.status === "cancelled")  return res.status(409).json({ ok: false, error: "Job is cancelled." });

    const filePath = job.file_path;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(422).json({ ok: false, error: "Source file not on disk. Please re-upload." });
    }

    // ── 2. Detect commit mode: first-import (tables empty) vs dedup ─────────
    const existingCounts = await Promise.all([
      queryOne<{n:string}>("SELECT COUNT(*) n FROM club_payroll_history    WHERE is_fixture=FALSE"),
      queryOne<{n:string}>("SELECT COUNT(*) n FROM club_draft_spend_history WHERE is_fixture=FALSE"),
      queryOne<{n:string}>("SELECT COUNT(*) n FROM derived_metrics         WHERE is_fixture=FALSE"),
      queryOne<{n:string}>("SELECT COUNT(*) n FROM osm_research_findings   WHERE is_fixture=FALSE"),
      queryOne<{n:string}>("SELECT COUNT(*) n FROM diamondiq_inferences    WHERE is_fixture=FALSE"),
    ]);
    const existingNums = existingCounts.map(r => parseInt(r?.n ?? "0"));
    const isFirstImport = existingNums.every(n => n === 0);

    // ── 3. Methodology version IDs (first-import path only) ─────────────────
    const mvRows = await query<{id:number; name:string}>("SELECT id, name FROM methodology_versions");
    const mv: Record<string,number> = {};
    for (const r of mvRows) mv[r.name] = r.id;
    // mv.avg_5yr, mv.cagr_5yr, mv.count_seasons_over_threshold, mv.pct_vs_avg,
    // mv.cbt_payroll_tier, mv.draft_pool_tier

    // ── 4. Read workbook ─────────────────────────────────────────────────────
    const wb = XLSX.readFile(filePath, { type: "file", raw: false });
    const sfvId  = job.source_file_version_id;
    const jobId  = job.id;
    const datasetId = job.dataset_id;

    // Helper: read a sheet's rows starting from array index 4 (after preamble + header at idx 3)
    function sheetRows(name: string): (string|number|boolean|null)[][] {
      const ws = wb.Sheets[name];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json<(string|number|boolean|null)[]>(ws, { header: 1, defval: null });
    }

    // ── ARTICLE TRANSCRIPTION COMMIT PATH ────────────────────────────────────
    // Detected by presence of "SOURCE INDEX" sheet.
    // Stores 27 osm_articles records + 6,858 transcription lines.
    // Does NOT create club-level canonical facts or DiamondIQ inferences.
    if (wb.SheetNames.includes("SOURCE INDEX")) {
      await client.query("BEGIN");

      // ── Publisher inference from PDF filename (filename-only, no model knowledge) ──
      function inferPublisher(pdfFilename: string): string | null {
        const f = pdfFilename.toLowerCase();
        if (f.includes("baseball america")) return "Baseball America";
        if (f.includes("perfect game"))     return "Perfect Game";
        if (f.includes("d1baseball") || f.includes("d1base")) return "D1Baseball";
        if (f.includes("usa baseball"))     return "USA Baseball";
        if (f.includes("npi_") || f.startsWith("npi"))       return "NPI";
        if (f.includes("prepbaseballreport") || f.includes("prep baseball")) return "Prep Baseball Report";
        return null; // leave NULL for unidentifiable publishers
      }

      // ── Scan transcription for URL and publication date ───────────────────
      function extractUrlAndDate(rows: (string|number|boolean|null)[][]): { url: string|null; pubDate: string|null } {
        let url: string|null = null;
        let pubDate: string|null = null;
        // Date patterns: "Jun 26, 2026", "May 20, 2026", "June 17, 2026"
        const dateRe = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+20\d\d\b/i;
        // Publication date must NOT be a scrape/access timestamp ("8/14/26" style or "8/18/26, 2:42 PM" style)
        const scrapeDateRe = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d/;

        for (const row of rows) {
          const text = String(row[2] ?? "").trim();
          if (!text) continue;
          // URL: look for https lines
          const urlMatch = text.match(/https?:\/\/[^\s]+/);
          if (urlMatch) url = urlMatch[0].replace(/\s+/g, ""); // collapse extraction spaces
          // Publication date
          if (!pubDate && !scrapeDateRe.test(text)) {
            const dm = text.match(dateRe);
            if (dm) pubDate = dm[0].replace(/\s+/g, " ").trim();
          }
        }
        return { url, pubDate };
      }

      // ── Parse SOURCE INDEX ────────────────────────────────────────────────
      const idxRows = sheetRows("SOURCE INDEX"); // R1 = header, R2+ = data
      // Build map: worksheetName → { sourceNum, pdfFilename, pdfPages, status, method }
      interface SrcMeta { sourceNum: number; pdfFilename: string; pdfPages: number; worksheet: string; }
      const srcIndex = new Map<string, SrcMeta>();
      for (let ri = 1; ri < idxRows.length; ri++) { // skip header at ri=0
        const row = idxRows[ri];
        const sourceNum  = row[0];
        const pdfFile    = row[1];
        const wsName     = row[2];
        const pdfPages   = row[3];
        if (!sourceNum || !pdfFile || !wsName) continue;
        srcIndex.set(String(wsName).trim(), {
          sourceNum:  Number(sourceNum),
          pdfFilename: String(pdfFile).trim(),
          pdfPages:   Number(pdfPages) || 0,
          worksheet:  String(wsName).trim(),
        });
      }

      let articlesCreated = 0;
      let linesInserted   = 0;
      let linesSkipped    = 0;
      let pubNullCount    = 0;
      let dateNullCount   = 0;

      // ── Process each article sheet ────────────────────────────────────────
      for (const sheetName of wb.SheetNames) {
        if (sheetName === "SOURCE INDEX") continue;

        const meta = srcIndex.get(sheetName.trim());
        const allRows = sheetRows(sheetName);
        // Content rows start at index 4 (R5); R1-R4 are metadata/header
        const contentRows = allRows.slice(4);

        // R1: SOURCE PDF / SOURCE #
        const srcPdfFromSheet = String(allRows[0]?.[1] ?? "").trim() || meta?.pdfFilename || null;
        const srcNumFromSheet = allRows[0]?.[3] !== null ? Number(allRows[0]?.[3]) : (meta?.sourceNum ?? null);
        const pdfPages = meta?.pdfPages ?? (allRows[1]?.[3] !== null ? Number(allRows[1]?.[3]) : null);

        const pdfFilename = srcPdfFromSheet || meta?.pdfFilename || null;
        const publisher   = pdfFilename ? inferPublisher(pdfFilename) : null;
        if (!publisher) pubNullCount++;

        // Extract URL and publication date from transcription content
        const { url, pubDate } = extractUrlAndDate(contentRows);
        if (!pubDate) dateNullCount++;

        // Parse publication date to ISO string for PostgreSQL DATE column
        let pubDateIso: string | null = null;
        if (pubDate) {
          const parsed = new Date(pubDate);
          if (!isNaN(parsed.getTime())) pubDateIso = parsed.toISOString().slice(0, 10);
        }

        // Article title: use PDF filename stripped of extension as the title
        const title = pdfFilename
          ? pdfFilename.replace(/\.pdf$/i, "").trim()
          : sheetName.trim();

        // Insert osm_articles record
        const artResult = await client.query<{ id: number }>(
          `INSERT INTO osm_articles
             (dataset_id, source_file_version_id, ingestion_job_id,
              title, publisher, source_url, publication_date,
              evidence_class, verification_status, is_fixture,
              source_number, pdf_filename, pdf_page_count, source_worksheet)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'verified_public','unverified',FALSE,$8,$9,$10,$11)
           RETURNING id`,
          [
            datasetId, sfvId, jobId,
            title, publisher, url, pubDateIso,
            srcNumFromSheet, pdfFilename, pdfPages, sheetName.trim(),
          ]
        );
        const articleId = artResult.rows[0].id;
        articlesCreated++;

        // Insert transcription lines (R5+ where col C is non-empty)
        for (let ri = 0; ri < contentRows.length; ri++) {
          const row = contentRows[ri];
          const lineText = String(row[2] ?? "").trim();
          if (!lineText) { linesSkipped++; continue; }

          const pdfPage = row[0] !== null && row[0] !== "" ? Number(row[0]) : null;
          const pdfLine = row[1] !== null && row[1] !== "" ? Number(row[1]) : null;
          if (pdfPage === null || pdfLine === null) { linesSkipped++; continue; }

          const excelRow = ri + 5; // R5 = index 0 of contentRows

          await client.query(
            `INSERT INTO osm_article_transcription_lines
               (article_id, source_file_version_id, ingestion_job_id,
                source_excel_row, pdf_page, pdf_line, line_text,
                evidence_class, is_fixture)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'external_source_content',FALSE)`,
            [articleId, sfvId, jobId, excelRow, pdfPage, pdfLine, lineText]
          );
          linesInserted++;
        }
      }

      // ── Update job status ─────────────────────────────────────────────────
      await client.query(
        `UPDATE ingestion_jobs SET status='complete', completed_at=NOW(), rows_imported=$1 WHERE id=$2`,
        [articlesCreated + linesInserted, jobId]
      );
      await client.query(
        `UPDATE data_library SET processing_status='ready', last_import_at=NOW() WHERE id=$1`,
        [datasetId]
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        data: {
          jobId,
          status: "complete",
          mode: "article_transcription",
          articlesCreated,
          transcriptionLinesPreserved: linesInserted,
          linesSkipped,
          publisherNullCount: pubNullCount,
          publicationDateNullCount: dateNullCount,
          canonicalBaseballFactsCreated: 0,
          diamondIQInferencesCreated: 0,
        },
      });
    }
    // ── END ARTICLE TRANSCRIPTION PATH ────────────────────────────────────────

    // Get preamble text (rows 0-1 = Excel rows 1-2)
    function getPreamble(name: string): string {
      const rows = sheetRows(name);
      return [rows[0]?.[0], rows[1]?.[0]]
        .filter(v => v !== null && v !== undefined && String(v).trim())
        .map(v => String(v).trim())
        .join(" | ");
    }

    const payrollPreamble = getPreamble("Payroll & CBT History");
    const spendPreamble   = getPreamble("Draft Spend History");
    const trendPreamble   = getPreamble("Trend Analysis");
    const projPreamble    = getPreamble("2026 Draft Projection");

    // ── 5. BEGIN TRANSACTION ─────────────────────────────────────────────────
    await client.query("BEGIN");

    // Track inserted IDs for record_derivations and source_assertions
    // payrollIds[club][year] = club_payroll_history.id
    const payrollIds  = new Map<string, Map<number, number>>();
    // spendIds[club][year] = club_draft_spend_history.id
    const spendIds    = new Map<string, Map<number, number>>();
    // l2Ids[`${club}::${metricName}`] = derived_metrics.id
    const l2Ids       = new Map<string, number>();
    // l3Ids[`${club}::${findingType}`] = osm_research_findings.id (for correlation findings)
    const l3Ids       = new Map<string, number>();
    // l4SpendIds[club] = diamondiq_inferences.id for draft_spend_projection
    const l4SpendIds  = new Map<string, number>();
    const l4OverIds   = new Map<string, number>();

    // Counters
    let l1Payroll = 0, l1Spend = 0, l2Count = 0, l3Count = 0, l4Count = 0;
    let rsaCount = 0, rdCount = 0, leagueFactsCount = 0;

    if (isFirstImport) {
    // ── SHEET 1: Payroll & CBT History ────────────────────────────────────────
    // Header at array index 3. Data rows from index 4.
    // Columns: 0=Club, 1=2021, 2=2022, 3=2023, 4=2024, 5=2025, 6=2026,
    //          7=5-Yr Avg, 8=CAGR, 9=Times Over CBT
    {
      const rows = sheetRows("Payroll & CBT History");
      const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
      const YEAR_COLS = [1, 2, 3, 4, 5, 6];

      for (let ri = 4; ri < rows.length; ri++) {
        const row = rows[ri];
        const club = String(row[0] ?? "").trim();
        if (!MLB_CLUBS.has(club)) continue;

        payrollIds.set(club, new Map());

        // Unpivot: one row per year
        for (let yi = 0; yi < YEARS.length; yi++) {
          const year = YEARS[yi];
          const colIdx = YEAR_COLS[yi];
          const val = row[colIdx];
          if (val === null || val === undefined || val === "") continue;

          const payrollAmt = typeof val === "number" ? val : parseFloat(String(val).replace(/[,$]/g,""));
          if (isNaN(payrollAmt)) continue;

          const dataType = year === 2026 ? "preliminary" : "actual";

          const r = await client.query<{id:number}>(
            `INSERT INTO club_payroll_history
               (dataset_id, source_file_version_id, ingestion_job_id,
                source_row, source_worksheet, source_excel_column, source_preamble,
                mlb_org, season, total_payroll, payroll_data_type,
                evidence_class, verification_status, is_fixture)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'verified_public','unverified',FALSE)
             RETURNING id`,
            [datasetId, sfvId, jobId, ri+1, "Payroll & CBT History", String(year), payrollPreamble,
             club, year, payrollAmt, dataType]
          );
          payrollIds.get(club)!.set(year, r.rows[0].id);
          l1Payroll++;
        }

        // L2: 5-Yr Avg Payroll (col 7)
        const avgVal = row[7];
        if (avgVal !== null && avgVal !== undefined && avgVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'avg_5yr_payroll',$2,2021,2025,'2021-2025 (5yr)',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(avgVal), mv["avg_5yr"] ?? null,
             datasetId, sfvId, jobId, "Payroll & CBT History", ri+1, "5-Yr Avg (21-25)", payrollPreamble]
          );
          l2Ids.set(`${club}::avg_5yr_payroll`, r.rows[0].id);
          l2Count++;
        }

        // L2: CAGR (col 8) — correction #1: cagr_payroll_5yr
        const cagrVal = row[8];
        if (cagrVal !== null && cagrVal !== undefined && cagrVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'cagr_payroll_5yr',$2,2021,2025,'2021-2025 (5yr)',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(cagrVal), mv["cagr_5yr"] ?? null,
             datasetId, sfvId, jobId, "Payroll & CBT History", ri+1, "5-Yr CAGR (21->25)", payrollPreamble]
          );
          l2Ids.set(`${club}::cagr_payroll_5yr`, r.rows[0].id);
          l2Count++;
        }

        // L2: Times Over CBT Threshold (col 9) — correction #9: L2 not L1
        const timesVal = row[9];
        if (timesVal !== null && timesVal !== undefined && timesVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'times_over_cbt',$2,2021,2025,'2021-2025 (5yr)',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(timesVal), mv["count_seasons_over_threshold"] ?? null,
             datasetId, sfvId, jobId, "Payroll & CBT History", ri+1, "Times Over CBT Threshold (21-25)", payrollPreamble]
          );
          l2Ids.set(`${club}::times_over_cbt`, r.rows[0].id);
          l2Count++;
        }
      }
    }

    // ── SHEET 2: Draft Spend History ──────────────────────────────────────────
    // Columns: 0=Club, 1=2021, 2=2022, 3=2023, 4=2024, 5=2025, 6=2026(pool),
    //          7=5-Yr Avg Pool, 8=CAGR, 9=2025 Rank
    // Note: 2021-2025 = actual signing-bonus spend; 2026 = official bonus pool
    {
      const rows = sheetRows("Draft Spend History");
      const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
      const YEAR_COLS = [1, 2, 3, 4, 5, 6];

      for (let ri = 4; ri < rows.length; ri++) {
        const row = rows[ri];
        const club = String(row[0] ?? "").trim();
        if (!MLB_CLUBS.has(club)) continue;

        spendIds.set(club, new Map());

        for (let yi = 0; yi < YEARS.length; yi++) {
          const year = YEARS[yi];
          const colIdx = YEAR_COLS[yi];
          const val = row[colIdx];
          if (val === null || val === undefined || val === "") continue;

          const amt = typeof val === "number" ? val : parseFloat(String(val).replace(/[,$]/g,""));
          if (isNaN(amt)) continue;

          // 2026 is official bonus pool (not actual spend); 2021-2025 are actual spend
          const totalDraftSpend = year !== 2026 ? amt : null;
          const poolAllotment   = year === 2026 ? amt : null;

          const r = await client.query<{id:number}>(
            `INSERT INTO club_draft_spend_history
               (dataset_id, source_file_version_id, ingestion_job_id,
                source_row, source_worksheet, source_excel_column, source_preamble,
                mlb_org, draft_year, total_draft_spend, pool_allotment,
                evidence_class, verification_status, is_fixture)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'verified_public','unverified',FALSE)
             RETURNING id`,
            [datasetId, sfvId, jobId, ri+1, "Draft Spend History", String(year), spendPreamble,
             club, year, totalDraftSpend, poolAllotment]
          );
          spendIds.get(club)!.set(year, r.rows[0].id);
          l1Spend++;
        }

        // L2: 5-Yr Avg Pool (col 7) — canonical source
        const avgPoolVal = row[7];
        if (avgPoolVal !== null && avgPoolVal !== undefined && avgPoolVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'avg_pool_5yr',$2,2021,2025,'2021-2025 (5yr)',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(avgPoolVal), mv["avg_5yr"] ?? null,
             datasetId, sfvId, jobId, "Draft Spend History", ri+1, "5-Yr Avg Pool (21-25)", spendPreamble]
          );
          l2Ids.set(`${club}::avg_pool_5yr`, r.rows[0].id);
          l2Count++;
        }

        // L2: CAGR (col 8) — correction #2: cagr_pool_5yr
        const cagrPoolVal = row[8];
        if (cagrPoolVal !== null && cagrPoolVal !== undefined && cagrPoolVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'cagr_pool_5yr',$2,2021,2025,'2021-2025 (5yr)',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(cagrPoolVal), mv["cagr_5yr"] ?? null,
             datasetId, sfvId, jobId, "Draft Spend History", ri+1, "5-Yr CAGR (21->25)", spendPreamble]
          );
          l2Ids.set(`${club}::cagr_pool_5yr`, r.rows[0].id);
          l2Count++;
        }

        // L2: 2025 Rank (col 9) — correction #3: pool_rank
        const rankVal = row[9];
        if (rankVal !== null && rankVal !== undefined && rankVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'pool_rank',$2,2025,2025,'2025',
                     'calculated',NULL,$3,$4,$5,$6,$7,$8,$9,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(rankVal),
             datasetId, sfvId, jobId, "Draft Spend History", ri+1, "2025 Rank (1=largest)", spendPreamble]
          );
          l2Ids.set(`${club}::pool_rank`, r.rows[0].id);
          l2Count++;
        }
      }
    }

    // ── SHEET 3: Trend Analysis ───────────────────────────────────────────────
    // Columns: 0=Club, 1=5yrAvgCBTPay, 2=CBTTier, 3=TimesOverCBT, 4=Penalty,
    //          5=5yrAvgPool, 6=PoolTier, 7=Correlation, 8=Pool2026, 9=Pool2026vs5yr, 10=Read
    // Non-club bullet rows (array index 36+) = L3 league research_note findings
    {
      const rows = sheetRows("Trend Analysis");

      for (let ri = 4; ri < rows.length; ri++) {
        const row = rows[ri];
        const club = String(row[0] ?? "").trim();
        if (!MLB_CLUBS.has(club)) continue;

        // L2: CBT Payroll Tier (col 2) — correction #4: cbt_payroll_tier (canonical)
        const cbtTierVal = row[2];
        if (cbtTierVal !== null && cbtTierVal !== undefined && String(cbtTierVal).trim()) {
          const tierStr = String(cbtTierVal).trim();
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, text_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'cbt_payroll_tier',$2,2021,2025,'2021-2025 (5yr)',
                     'osm_proprietary',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, tierStr, mv["cbt_payroll_tier"] ?? null,
             datasetId, sfvId, jobId, "Trend Analysis", ri+1, "CBT Payroll Tier", trendPreamble]
          );
          l2Ids.set(`${club}::cbt_payroll_tier`, r.rows[0].id);
          l2Count++;
        }

        // L2: Times Picked-10-Spots Penalty proxy (col 4) — correction #5
        const penaltyVal = row[4];
        if (penaltyVal !== null && penaltyVal !== undefined && penaltyVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'times_penalty_proxy',$2,2021,2025,'2021-2025 (5yr)',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(penaltyVal), mv["count_seasons_over_threshold"] ?? null,
             datasetId, sfvId, jobId, "Trend Analysis", ri+1, "Times Picked-10-Spots Penalty (proxy)", trendPreamble]
          );
          l2Ids.set(`${club}::times_penalty_proxy`, r.rows[0].id);
          l2Count++;
        }

        // L2: Draft Pool Tier (col 6) — correction #6: draft_pool_tier (canonical)
        const poolTierVal = row[6];
        if (poolTierVal !== null && poolTierVal !== undefined && String(poolTierVal).trim()) {
          const tierStr = String(poolTierVal).trim();
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, text_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'draft_pool_tier',$2,2021,2025,'2021-2025 (5yr)',
                     'osm_proprietary',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, tierStr, mv["draft_pool_tier"] ?? null,
             datasetId, sfvId, jobId, "Trend Analysis", ri+1, "Draft Pool Tier", trendPreamble]
          );
          l2Ids.set(`${club}::draft_pool_tier`, r.rows[0].id);
          l2Count++;
        }

        // L2: 2026 Pool vs 5-Yr Avg Pool % (col 9) — canonical source
        const pctVal = row[9];
        if (pctVal !== null && pctVal !== undefined && pctVal !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO derived_metrics
               (entity_type, entity_key, metric_name, numeric_value, period_start, period_end,
                period_label, evidence_class, methodology_version_id,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                calculated_by, is_fixture)
             VALUES ('mlb_org',$1,'pct_vs_avg_pool',$2,2021,2026,'2021-2026',
                     'calculated',$3,$4,$5,$6,$7,$8,$9,$10,'ingestion_job',FALSE)
             RETURNING id`,
            [club, Number(pctVal), mv["pct_vs_avg"] ?? null,
             datasetId, sfvId, jobId, "Trend Analysis", ri+1, "2026 Pool vs 5-Yr Avg Pool (%)", trendPreamble]
          );
          l2Ids.set(`${club}::pct_vs_avg_pool`, r.rows[0].id);
          l2Count++;
        }

        // L3: Payroll ↔ Draft Pool Correlation Direction (col 7) — correction #7
        const corrVal = row[7];
        if (corrVal !== null && corrVal !== undefined && String(corrVal).trim()) {
          const r = await client.query<{id:number}>(
            `INSERT INTO osm_research_findings
               (subject_type, subject_key, finding_type, finding_text, period_description,
                source_type, dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                evidence_class, is_fixture)
             VALUES ('mlb_org',$1,'correlation',$2,'2021-2025',
                     'excel_worksheet',$3,$4,$5,$6,$7,$8,$9,'osm_proprietary',FALSE)
             RETURNING id`,
            [club, String(corrVal).trim(),
             datasetId, sfvId, jobId, "Trend Analysis", ri+1, "Payroll <-> Draft Pool Correlation Direction", trendPreamble]
          );
          l3Ids.set(`${club}::correlation`, r.rows[0].id);
          l3Count++;
        }

        // L3: Pattern / Read (col 10) — qualitative OSM read
        const readVal = row[10];
        if (readVal !== null && readVal !== undefined && String(readVal).trim()) {
          await client.query(
            `INSERT INTO osm_research_findings
               (subject_type, subject_key, finding_type, finding_text, period_description,
                source_type, dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                evidence_class, is_fixture)
             VALUES ('mlb_org',$1,'pattern_read',$2,'2021-2026',
                     'excel_worksheet',$3,$4,$5,$6,$7,$8,$9,'osm_proprietary',FALSE)`,
            [club, String(readVal).trim(),
             datasetId, sfvId, jobId, "Trend Analysis", ri+1, "Pattern / Read", trendPreamble]
          );
          l3Count++;
        }

        // Record source assertions for repeated metrics (already canonical elsewhere)
        // 5-Yr Avg CBT Payroll (col 1) → assertion of avg_5yr_payroll L2 record
        const avgPayCanonId = l2Ids.get(`${club}::avg_5yr_payroll`);
        const taAvgCBT = row[1];
        if (avgPayCanonId && taAvgCBT !== null && taAvgCBT !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('derived_metrics',$1,$2,$3,'Trend Analysis',$4,'5-Yr Avg CBT Payroll',$5,$6)`,
            [avgPayCanonId, sfvId, jobId, ri+1, trendPreamble, String(taAvgCBT)]
          );
          rsaCount++;
        }

        // Times Over CBT (col 3) → assertion of times_over_cbt L2 record
        const timesCanonId = l2Ids.get(`${club}::times_over_cbt`);
        const taTimes = row[3];
        if (timesCanonId && taTimes !== null && taTimes !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('derived_metrics',$1,$2,$3,'Trend Analysis',$4,'Times Over CBT Thresh (21-25)',$5,$6)`,
            [timesCanonId, sfvId, jobId, ri+1, trendPreamble, String(taTimes)]
          );
          rsaCount++;
        }

        // 5-Yr Avg Draft Pool (col 5) → assertion of avg_pool_5yr L2 record
        const avgPoolCanonId = l2Ids.get(`${club}::avg_pool_5yr`);
        const taAvgPool = row[5];
        if (avgPoolCanonId && taAvgPool !== null && taAvgPool !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('derived_metrics',$1,$2,$3,'Trend Analysis',$4,'5-Yr Avg Draft Pool',$5,$6)`,
            [avgPoolCanonId, sfvId, jobId, ri+1, trendPreamble, String(taAvgPool)]
          );
          rsaCount++;
        }

        // 2026 Draft Pool Released (col 8) → assertion of club_draft_spend_history 2026 L1 record
        const spend2026Id = spendIds.get(club)?.get(2026);
        const ta2026Pool = row[8];
        if (spend2026Id && ta2026Pool !== null && ta2026Pool !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('club_draft_spend_history',$1,$2,$3,'Trend Analysis',$4,'2026 Draft Pool (Released)',$5,$6)`,
            [spend2026Id, sfvId, jobId, ri+1, trendPreamble, String(ta2026Pool)]
          );
          rsaCount++;
        }
      }

      // League-wide research bullet points (rows 38-45 in Excel = array index 37-44)
      const bulletTexts: string[] = [];
      for (let ri = 36; ri < Math.min(rows.length, 50); ri++) {
        const row = rows[ri];
        const cell = String(row[0] ?? "").trim();
        if (cell.startsWith("•") || cell.startsWith("KEY LEAGUE")) {
          bulletTexts.push(cell);
        }
      }
      for (const bulletText of bulletTexts) {
        await client.query(
          `INSERT INTO osm_research_findings
             (subject_type, subject_key, finding_type, finding_text, period_description,
              source_type, dataset_id, source_file_version_id, ingestion_job_id,
              source_worksheet, source_preamble, evidence_class, is_fixture)
           VALUES ('league','MLB','research_note',$1,'2021-2026',
                   'excel_worksheet',$2,$3,$4,'Trend Analysis',$5,'osm_proprietary',FALSE)`,
          [bulletText, datasetId, sfvId, jobId, trendPreamble]
        );
        l3Count++;
      }
    }

    // ── SHEET 4: 2026 Draft Projection ────────────────────────────────────────
    // Columns: 0=Club, 1=Pick1stRd, 2=Pool2026, 3=Avg5yrPool, 4=Pool2026vs5yr,
    //          5=AssumedRate, 6=ProjTotalSpend, 7=ProjAbovePool, 8=CBTTier, 9=Confidence
    {
      const rows = sheetRows("2026 Draft Projection");

      for (let ri = 4; ri < rows.length; ri++) {
        const row = rows[ri];
        const club = String(row[0] ?? "").trim();
        if (!MLB_CLUBS.has(club)) continue;

        // Enrich 2026 draft spend row with first_round_pick (col 1)
        const pickVal = row[1];
        const spend2026Id = spendIds.get(club)?.get(2026);
        if (spend2026Id && pickVal !== null && pickVal !== undefined && pickVal !== "") {
          await client.query(
            `UPDATE club_draft_spend_history SET first_round_pick = $1 WHERE id = $2`,
            [parseInt(String(pickVal)), spend2026Id]
          );
        }

        // Source assertion: 2026 Bonus Pool (col 2) → club_draft_spend_history 2026
        const proj2026Pool = row[2];
        if (spend2026Id && proj2026Pool !== null && proj2026Pool !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('club_draft_spend_history',$1,$2,$3,'2026 Draft Projection',$4,'2026 Bonus Pool (Official, $)',$5,$6)`,
            [spend2026Id, sfvId, jobId, ri+1, projPreamble, String(proj2026Pool)]
          );
          rsaCount++;
        }

        // Source assertion: 5-Yr Avg Pool (col 3) → avg_pool_5yr L2
        const avgPoolCanonId = l2Ids.get(`${club}::avg_pool_5yr`);
        const projAvgPool = row[3];
        if (avgPoolCanonId && projAvgPool !== null && projAvgPool !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('derived_metrics',$1,$2,$3,'2026 Draft Projection',$4,'5-Yr Avg Pool (21-25, $)',$5,$6)`,
            [avgPoolCanonId, sfvId, jobId, ri+1, projPreamble, String(projAvgPool)]
          );
          rsaCount++;
        }

        // Source assertion: 2026 Pool vs 5-Yr Avg (col 4) → pct_vs_avg_pool L2
        const pctCanonId = l2Ids.get(`${club}::pct_vs_avg_pool`);
        const projPct = row[4];
        if (pctCanonId && projPct !== null && projPct !== undefined) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('derived_metrics',$1,$2,$3,'2026 Draft Projection',$4,'2026 Pool vs 5-Yr Avg',$5,$6)`,
            [pctCanonId, sfvId, jobId, ri+1, projPreamble, String(projPct)]
          );
          rsaCount++;
        }

        // Source assertion: CBT Payroll Tier (col 8) → cbt_payroll_tier L2
        const cbtTierCanonId = l2Ids.get(`${club}::cbt_payroll_tier`);
        const projCBTTier = row[8];
        if (cbtTierCanonId && projCBTTier !== null && projCBTTier !== undefined && String(projCBTTier).trim()) {
          await client.query(
            `INSERT INTO record_source_assertions
               (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
                worksheet, excel_row, excel_column, source_preamble, asserted_value)
             VALUES ('derived_metrics',$1,$2,$3,'2026 Draft Projection',$4,'CBT Payroll Tier (21-25 Avg)',$5,$6)`,
            [cbtTierCanonId, sfvId, jobId, ri+1, projPreamble, String(projCBTTier)]
          );
          rsaCount++;
        }

        // L3: Assumed Total-Spend-vs-Pool Rate (col 5) — correction #8: methodology_assumption
        const rateVal = row[5];
        if (rateVal !== null && rateVal !== undefined && rateVal !== "") {
          const ratePct = typeof rateVal === "number" ? (rateVal * 100).toFixed(3) + "%" : String(rateVal);
          await client.query(
            `INSERT INTO osm_research_findings
               (subject_type, subject_key, finding_type, finding_text,
                structured_value, period_description,
                source_type, dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                evidence_class, is_fixture)
             VALUES ('mlb_org',$1,'methodology_assumption',
                     'Assumed total-spend-vs-pool rate for 2026 draft projection: ' || $2,
                     $3,'2026','excel_worksheet',$4,$5,$6,$7,$8,$9,$10,'osm_proprietary',FALSE)`,
            [club, ratePct,
             JSON.stringify({ rate: rateVal, rate_pct: ratePct, source: "2026 Draft Projection workbook" }),
             datasetId, sfvId, jobId, "2026 Draft Projection", ri+1,
             "Assumed Total-Spend-vs-Pool Rate (%)", projPreamble]
          );
          l3Count++;
        }

        // L4: Projected 2026 TOTAL Draft Spend (col 6) — draft_spend_projection
        const projSpend = row[6];
        if (projSpend !== null && projSpend !== undefined && projSpend !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO diamondiq_inferences
               (subject_type, subject_key, inference_context, inference_type,
                numeric_value, evidence_class, model_identifier,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                generated_by, osm_review_status, is_fixture)
             VALUES ('mlb_org',$1,'2026 MLB Draft Spending Projection','draft_spend_projection',
                     $2,'diamondiq_inference','toc_spend_projection_v1',
                     $3,$4,$5,$6,$7,$8,$9,'osm_staff_imported','pending',FALSE)
             RETURNING id`,
            [club, Number(projSpend),
             datasetId, sfvId, jobId, "2026 Draft Projection", ri+1,
             "Projected 2026 TOTAL Draft Spend ($)", projPreamble]
          );
          l4SpendIds.set(club, r.rows[0].id);
          l4Count++;
        }

        // L4: Projected $ Above Pool (col 7) — pool_overage_projection
        const projAbove = row[7];
        if (projAbove !== null && projAbove !== undefined && projAbove !== "") {
          const r = await client.query<{id:number}>(
            `INSERT INTO diamondiq_inferences
               (subject_type, subject_key, inference_context, inference_type,
                numeric_value, evidence_class, model_identifier,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                generated_by, osm_review_status, is_fixture)
             VALUES ('mlb_org',$1,'2026 MLB Draft Spending Projection','pool_overage_projection',
                     $2,'diamondiq_inference','toc_spend_projection_v1',
                     $3,$4,$5,$6,$7,$8,$9,'osm_staff_imported','pending',FALSE)
             RETURNING id`,
            [club, Number(projAbove),
             datasetId, sfvId, jobId, "2026 Draft Projection", ri+1,
             "Projected $ Above Pool (Rounds 11-20 + UDFA)", projPreamble]
          );
          l4OverIds.set(club, r.rows[0].id);
          l4Count++;
        }

        // L4: Projection Confidence (col 9) — confidence_label
        const confVal = row[9];
        if (confVal !== null && confVal !== undefined && String(confVal).trim()) {
          const confText = String(confVal).trim();
          // Extract High/Medium/Low from the beginning of the text
          const confLabel = confText.startsWith("High") ? "High"
                          : confText.startsWith("Medium") ? "Medium"
                          : confText.startsWith("Low") ? "Low" : null;
          await client.query(
            `INSERT INTO diamondiq_inferences
               (subject_type, subject_key, inference_context, inference_type,
                text_value, confidence_label, evidence_class, model_identifier,
                dataset_id, source_file_version_id, ingestion_job_id,
                source_worksheet, source_excel_row, source_excel_column, source_preamble,
                generated_by, osm_review_status, is_fixture)
             VALUES ('mlb_org',$1,'2026 MLB Draft Spending Projection','confidence_label',
                     $2,$3,'diamondiq_inference','toc_spend_projection_v1',
                     $4,$5,$6,$7,$8,$9,$10,'osm_staff_imported','pending',FALSE)`,
            [club, confText, confLabel,
             datasetId, sfvId, jobId, "2026 Draft Projection", ri+1,
             "Projection Confidence", projPreamble]
          );
          l4Count++;
        }
      }
    }

    // ── RECORD DERIVATIONS ────────────────────────────────────────────────────
    // Link each L2 derived metric and L4 inference back to its L1 source records.
    for (const club of MLB_CLUBS) {
      const clubPayrollMap = payrollIds.get(club);
      const clubSpendMap   = spendIds.get(club);

      // avg_5yr_payroll → 2021-2025 payroll records
      const avgPayId = l2Ids.get(`${club}::avg_5yr_payroll`);
      if (avgPayId && clubPayrollMap) {
        for (const yr of [2021,2022,2023,2024,2025]) {
          const srcId = clubPayrollMap.get(yr);
          if (srcId) {
            await client.query(
              `INSERT INTO record_derivations
                 (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                  derivation_method, methodology_version_id, derived_by)
               VALUES ('derived_metrics',$1,'numeric_value','club_payroll_history',$2,'avg',$3,'ingestion_job')`,
              [avgPayId, srcId, mv["avg_5yr"] ?? null]
            );
            rdCount++;
          }
        }
      }

      // cagr_payroll_5yr → 2021 and 2025 payroll records
      const cagrPayId = l2Ids.get(`${club}::cagr_payroll_5yr`);
      if (cagrPayId && clubPayrollMap) {
        for (const yr of [2021, 2025]) {
          const srcId = clubPayrollMap.get(yr);
          if (srcId) {
            await client.query(
              `INSERT INTO record_derivations
                 (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                  derivation_method, methodology_version_id, derived_by)
               VALUES ('derived_metrics',$1,'numeric_value','club_payroll_history',$2,'cagr',$3,'ingestion_job')`,
              [cagrPayId, srcId, mv["cagr_5yr"] ?? null]
            );
            rdCount++;
          }
        }
      }

      // times_over_cbt → 2021-2025 payroll records
      const timesId = l2Ids.get(`${club}::times_over_cbt`);
      if (timesId && clubPayrollMap) {
        for (const yr of [2021,2022,2023,2024,2025]) {
          const srcId = clubPayrollMap.get(yr);
          if (srcId) {
            await client.query(
              `INSERT INTO record_derivations
                 (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                  derivation_method, methodology_version_id, derived_by)
               VALUES ('derived_metrics',$1,'numeric_value','club_payroll_history',$2,'count',$3,'ingestion_job')`,
              [timesId, srcId, mv["count_seasons_over_threshold"] ?? null]
            );
            rdCount++;
          }
        }
      }

      // avg_pool_5yr → 2021-2025 spend records
      const avgPoolId = l2Ids.get(`${club}::avg_pool_5yr`);
      if (avgPoolId && clubSpendMap) {
        for (const yr of [2021,2022,2023,2024,2025]) {
          const srcId = clubSpendMap.get(yr);
          if (srcId) {
            await client.query(
              `INSERT INTO record_derivations
                 (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                  derivation_method, methodology_version_id, derived_by)
               VALUES ('derived_metrics',$1,'numeric_value','club_draft_spend_history',$2,'avg',$3,'ingestion_job')`,
              [avgPoolId, srcId, mv["avg_5yr"] ?? null]
            );
            rdCount++;
          }
        }
      }

      // cagr_pool_5yr → 2021 and 2025 spend records
      const cagrPoolId = l2Ids.get(`${club}::cagr_pool_5yr`);
      if (cagrPoolId && clubSpendMap) {
        for (const yr of [2021, 2025]) {
          const srcId = clubSpendMap.get(yr);
          if (srcId) {
            await client.query(
              `INSERT INTO record_derivations
                 (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                  derivation_method, methodology_version_id, derived_by)
               VALUES ('derived_metrics',$1,'numeric_value','club_draft_spend_history',$2,'cagr',$3,'ingestion_job')`,
              [cagrPoolId, srcId, mv["cagr_5yr"] ?? null]
            );
            rdCount++;
          }
        }
      }

      // pct_vs_avg_pool → 2026 spend record + avg_pool_5yr metric (use L1 spend records)
      const pctId = l2Ids.get(`${club}::pct_vs_avg_pool`);
      if (pctId && clubSpendMap) {
        const src2026 = clubSpendMap.get(2026);
        if (src2026) {
          await client.query(
            `INSERT INTO record_derivations
               (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                derivation_method, methodology_version_id, derived_by)
             VALUES ('derived_metrics',$1,'numeric_value','club_draft_spend_history',$2,'pct_vs_avg',$3,'ingestion_job')`,
            [pctId, src2026, mv["pct_vs_avg"] ?? null]
          );
          rdCount++;
        }
      }

      // L4 draft_spend_projection → L1 spend records (2021-2026)
      const l4SpendId = l4SpendIds.get(club);
      if (l4SpendId && clubSpendMap) {
        for (const yr of [2021,2022,2023,2024,2025,2026]) {
          const srcId = clubSpendMap.get(yr);
          if (srcId) {
            await client.query(
              `INSERT INTO record_derivations
                 (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                  derivation_method, derived_by)
               VALUES ('diamondiq_inferences',$1,'numeric_value','club_draft_spend_history',$2,'projection_model','ingestion_job')`,
              [l4SpendId, srcId]
            );
            rdCount++;
          }
        }
      }

      // L4 pool_overage_projection → L1 2026 spend record
      const l4OverId = l4OverIds.get(club);
      if (l4OverId && clubSpendMap) {
        const src2026 = clubSpendMap.get(2026);
        if (src2026) {
          await client.query(
            `INSERT INTO record_derivations
               (derived_table, derived_record_id, derived_field, source_table, source_record_id,
                derivation_method, derived_by)
             VALUES ('diamondiq_inferences',$1,'numeric_value','club_draft_spend_history',$2,'projection_model','ingestion_job')`,
            [l4OverId, src2026]
          );
          rdCount++;
        }
      }
    }

    } else {
      // ── DEDUP COMMIT PATH ──────────────────────────────────────────────────
      // All club-level production records already exist from a prior job.
      // Write one source assertion per existing canonical record that appears
      // in this workbook. League-level facts new to this workbook go to league_facts.

      // ── Bulk-load existing canonical IDs ──────────────────────────────────
      const [phRows, dhRows, dmRows, l3Rows, l4Rows] = await Promise.all([
        client.query<{id:number; mlb_org:string; season:number}>(
          `SELECT id, mlb_org, season FROM club_payroll_history WHERE is_fixture=FALSE`
        ),
        client.query<{id:number; mlb_org:string; draft_year:number}>(
          `SELECT id, mlb_org, draft_year FROM club_draft_spend_history WHERE is_fixture=FALSE`
        ),
        client.query<{id:number; entity_key:string; metric_name:string}>(
          `SELECT id, entity_key, metric_name FROM derived_metrics WHERE is_fixture=FALSE`
        ),
        client.query<{id:number; subject_key:string; subject_type:string; finding_type:string}>(
          `SELECT id, subject_key, subject_type, finding_type FROM osm_research_findings WHERE is_fixture=FALSE`
        ),
        client.query<{id:number; subject_key:string; inference_type:string}>(
          `SELECT id, subject_key, inference_type FROM diamondiq_inferences WHERE is_fixture=FALSE`
        ),
      ]);

      const payrollMap  = new Map<string, number>();
      for (const r of phRows.rows) payrollMap.set(`${r.mlb_org}::${r.season}`, r.id);

      const spendMap    = new Map<string, number>();
      for (const r of dhRows.rows) spendMap.set(`${r.mlb_org}::${r.draft_year}`, r.id);

      const metricsMap  = new Map<string, number>();
      for (const r of dmRows.rows) metricsMap.set(`${r.entity_key}::${r.metric_name}`, r.id);

      const l3OrgMap    = new Map<string, number>(); // mlb_org findings
      const l3NoteIds:  number[] = [];               // league research_notes in insertion order
      for (const r of l3Rows.rows) {
        if (r.subject_type === "mlb_org") {
          l3OrgMap.set(`${r.subject_key}::${r.finding_type}`, r.id);
        } else if (r.subject_type === "league" && r.finding_type === "research_note") {
          l3NoteIds.push(r.id);
        }
      }

      const l4Map       = new Map<string, number>();
      for (const r of l4Rows.rows) l4Map.set(`${r.subject_key}::${r.inference_type}`, r.id);

      // ── Helper: write one source assertion ────────────────────────────────
      const writeRSA = async (
        table: string, canonId: number | undefined,
        worksheet: string, excelRow: number, excelCol: string,
        preamble: string, assertedVal: string
      ) => {
        if (!canonId) return;
        await client.query(
          `INSERT INTO record_source_assertions
             (canonical_record_table, canonical_record_id, source_file_version_id, ingestion_job_id,
              worksheet, excel_row, excel_column, source_preamble, asserted_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [table, canonId, sfvId, jobId, worksheet, excelRow, excelCol, preamble, assertedVal]
        );
        rsaCount++;
      };

      // ── SHEET 1: Payroll & CBT History ───────────────────────────────────
      {
        const rows = sheetRows("Payroll & CBT History");
        const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];

        for (let ri = 4; ri < rows.length; ri++) {
          const row = rows[ri];
          const club = String(row[0] ?? "").trim();
          if (!MLB_CLUBS.has(club)) continue;

          // L1: 6 year-column values → club_payroll_history
          for (let yi = 0; yi < YEARS.length; yi++) {
            const val = row[yi + 1];
            if (val === null || val === undefined || val === "") continue;
            await writeRSA("club_payroll_history",
              payrollMap.get(`${club}::${YEARS[yi]}`),
              "Payroll & CBT History", ri + 1, String(YEARS[yi]), payrollPreamble, String(val));
          }
          // L2: avg_5yr_payroll (col 7)
          const avgVal = row[7];
          if (avgVal !== null && avgVal !== undefined && avgVal !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::avg_5yr_payroll`),
              "Payroll & CBT History", ri + 1, "5-Yr Avg (21-25)", payrollPreamble, String(avgVal));
          }
          // L2: cagr_payroll_5yr (col 8)
          const cagrVal = row[8];
          if (cagrVal !== null && cagrVal !== undefined && cagrVal !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::cagr_payroll_5yr`),
              "Payroll & CBT History", ri + 1, "5-Yr CAGR (21->25)", payrollPreamble, String(cagrVal));
          }
          // L2: times_over_cbt (col 9)
          const timesVal = row[9];
          if (timesVal !== null && timesVal !== undefined && timesVal !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::times_over_cbt`),
              "Payroll & CBT History", ri + 1, "Times Over CBT Threshold (21-25)", payrollPreamble, String(timesVal));
          }
        }

        // NEW: CBT Base Threshold → league_facts (array index 36 = Excel row 37)
        const cbtRow = rows[36];
        if (cbtRow && String(cbtRow[0] ?? "").includes("CBT Base Threshold")) {
          const CBT_YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
          for (let yi = 0; yi < CBT_YEARS.length; yi++) {
            const val = cbtRow[yi + 1];
            if (val === null || val === undefined || val === "") continue;
            await client.query(
              `INSERT INTO league_facts
                 (fact_type, season, numeric_value, evidence_class,
                  dataset_id, source_file_version_id, ingestion_job_id,
                  source_worksheet, source_excel_row, source_excel_column, source_preamble, is_fixture)
               VALUES ('cbt_threshold',$1,$2,'verified_public',$3,$4,$5,$6,$7,$8,$9,FALSE)`,
              [CBT_YEARS[yi], Number(val), datasetId, sfvId, jobId,
               "Payroll & CBT History", 37, String(CBT_YEARS[yi]), payrollPreamble]
            );
            leagueFactsCount++;
          }
        }
      }

      // ── SHEET 2: Draft Spend History ─────────────────────────────────────
      {
        const rows = sheetRows("Draft Spend History");
        const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];

        for (let ri = 4; ri < rows.length; ri++) {
          const row = rows[ri];
          const club = String(row[0] ?? "").trim();
          if (!MLB_CLUBS.has(club)) continue;

          // L1: 6 year-column values → club_draft_spend_history
          for (let yi = 0; yi < YEARS.length; yi++) {
            const val = row[yi + 1];
            if (val === null || val === undefined || val === "") continue;
            await writeRSA("club_draft_spend_history",
              spendMap.get(`${club}::${YEARS[yi]}`),
              "Draft Spend History", ri + 1, String(YEARS[yi]), spendPreamble, String(val));
          }
          // L2: avg_pool_5yr (col 7)
          const avgPoolVal = row[7];
          if (avgPoolVal !== null && avgPoolVal !== undefined && avgPoolVal !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::avg_pool_5yr`),
              "Draft Spend History", ri + 1, "5-Yr Avg Pool (21-25)", spendPreamble, String(avgPoolVal));
          }
          // L2: cagr_pool_5yr (col 8)
          const cagrPoolVal = row[8];
          if (cagrPoolVal !== null && cagrPoolVal !== undefined && cagrPoolVal !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::cagr_pool_5yr`),
              "Draft Spend History", ri + 1, "5-Yr CAGR (21->25)", spendPreamble, String(cagrPoolVal));
          }
          // L2: pool_rank (col 9)
          const rankVal = row[9];
          if (rankVal !== null && rankVal !== undefined && rankVal !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::pool_rank`),
              "Draft Spend History", ri + 1, "2025 Rank (1=largest)", spendPreamble, String(rankVal));
          }
        }

        // NEW: League-wide actual spend → league_facts (array index 36 = Excel row 37)
        const actualRow = rows[36];
        if (actualRow && String(actualRow[0] ?? "").includes("ACTUAL")) {
          const SPEND_YEARS = [2021, 2022, 2023, 2024, 2025];
          for (let yi = 0; yi < SPEND_YEARS.length; yi++) {
            const val = actualRow[yi + 1];
            if (val === null || val === undefined || val === "") continue;
            await client.query(
              `INSERT INTO league_facts
                 (fact_type, season, numeric_value, evidence_class,
                  dataset_id, source_file_version_id, ingestion_job_id,
                  source_worksheet, source_excel_row, source_excel_column, source_preamble, is_fixture)
               VALUES ('league_draft_actual_spend',$1,$2,'verified_public',$3,$4,$5,$6,$7,$8,$9,FALSE)`,
              [SPEND_YEARS[yi], Number(val), datasetId, sfvId, jobId,
               "Draft Spend History", 37, String(SPEND_YEARS[yi]), spendPreamble]
            );
            leagueFactsCount++;
          }
        }
      }

      // ── SHEET 3: Trend Analysis ───────────────────────────────────────────
      {
        const rows = sheetRows("Trend Analysis");

        for (let ri = 4; ri < rows.length; ri++) {
          const row = rows[ri];
          const club = String(row[0] ?? "").trim();
          if (!MLB_CLUBS.has(club)) continue;

          // L2: cbt_payroll_tier (col 2)
          const cbtTier = row[2];
          if (cbtTier !== null && cbtTier !== undefined && String(cbtTier).trim()) {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::cbt_payroll_tier`),
              "Trend Analysis", ri + 1, "CBT Payroll Tier", trendPreamble, String(cbtTier));
          }
          // L2: times_penalty_proxy (col 4)
          const penalty = row[4];
          if (penalty !== null && penalty !== undefined && penalty !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::times_penalty_proxy`),
              "Trend Analysis", ri + 1, "Times Picked-10-Spots Penalty (proxy)", trendPreamble, String(penalty));
          }
          // L2: draft_pool_tier (col 6)
          const poolTier = row[6];
          if (poolTier !== null && poolTier !== undefined && String(poolTier).trim()) {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::draft_pool_tier`),
              "Trend Analysis", ri + 1, "Draft Pool Tier", trendPreamble, String(poolTier));
          }
          // L2: pct_vs_avg_pool (col 9)
          const pct = row[9];
          if (pct !== null && pct !== undefined && pct !== "") {
            await writeRSA("derived_metrics",
              metricsMap.get(`${club}::pct_vs_avg_pool`),
              "Trend Analysis", ri + 1, "2026 Pool vs 5-Yr Avg Pool (%)", trendPreamble, String(pct));
          }
          // L3: correlation (col 7)
          const corr = row[7];
          if (corr !== null && corr !== undefined && String(corr).trim()) {
            await writeRSA("osm_research_findings",
              l3OrgMap.get(`${club}::correlation`),
              "Trend Analysis", ri + 1, "Payroll <-> Draft Pool Correlation Direction", trendPreamble, String(corr));
          }
          // L3: pattern_read (col 10)
          const read = row[10];
          if (read !== null && read !== undefined && String(read).trim()) {
            await writeRSA("osm_research_findings",
              l3OrgMap.get(`${club}::pattern_read`),
              "Trend Analysis", ri + 1, "Pattern / Read", trendPreamble, String(read));
          }
        }

        // League research_notes — match by insertion order (same bullet order as Job #3)
        let noteIdx = 0;
        for (let ri = 36; ri < Math.min(rows.length, 50) && noteIdx < l3NoteIds.length; ri++) {
          const cell = String(rows[ri]?.[0] ?? "").trim();
          if (cell.startsWith("•") || cell.startsWith("KEY LEAGUE")) {
            await writeRSA("osm_research_findings",
              l3NoteIds[noteIdx],
              "Trend Analysis", ri + 1, "A1", trendPreamble, cell.substring(0, 200));
            noteIdx++;
          }
        }
      }

      // ── SHEET 4: 2026 Draft Projection ───────────────────────────────────
      {
        const rows = sheetRows("2026 Draft Projection");

        for (let ri = 4; ri < rows.length; ri++) {
          const row = rows[ri];
          const club = String(row[0] ?? "").trim();
          if (!MLB_CLUBS.has(club)) continue;

          // L3: methodology_assumption (col 5)
          const rate = row[5];
          if (rate !== null && rate !== undefined && rate !== "") {
            await writeRSA("osm_research_findings",
              l3OrgMap.get(`${club}::methodology_assumption`),
              "2026 Draft Projection", ri + 1, "Assumed Total-Spend-vs-Pool Rate (%)", projPreamble, String(rate));
          }
          // L4: draft_spend_projection (col 6)
          const projSpend = row[6];
          if (projSpend !== null && projSpend !== undefined && projSpend !== "") {
            await writeRSA("diamondiq_inferences",
              l4Map.get(`${club}::draft_spend_projection`),
              "2026 Draft Projection", ri + 1, "Projected 2026 TOTAL Draft Spend ($)", projPreamble, String(projSpend));
          }
          // L4: pool_overage_projection (col 7)
          const projAbove = row[7];
          if (projAbove !== null && projAbove !== undefined && projAbove !== "") {
            await writeRSA("diamondiq_inferences",
              l4Map.get(`${club}::pool_overage_projection`),
              "2026 Draft Projection", ri + 1, "Projected $ Above Pool (Rounds 11-20 + UDFA)", projPreamble, String(projAbove));
          }
          // L4: confidence_label (col 9)
          const conf = row[9];
          if (conf !== null && conf !== undefined && String(conf).trim()) {
            await writeRSA("diamondiq_inferences",
              l4Map.get(`${club}::confidence_label`),
              "2026 Draft Projection", ri + 1, "Projection Confidence", projPreamble, String(conf));
          }
        }
      }
    } // end dedup commit path

    // ── UPDATE JOB STATUS ────────────────────────────────────────────────────
    const totalNewRecords = isFirstImport
      ? l1Payroll + l1Spend + l2Count + l3Count + l4Count
      : leagueFactsCount;
    await client.query(
      `UPDATE ingestion_jobs
       SET status='complete', completed_at=NOW(),
           rows_imported=$1
       WHERE id=$2`,
      [totalNewRecords, jobId]
    );

    // Update data_library processing status
    await client.query(
      `UPDATE data_library SET processing_status='ready', last_import_at=NOW() WHERE id=$1`,
      [datasetId]
    );

    await client.query("COMMIT");

    if (isFirstImport) {
      return res.json({
        ok: true,
        data: {
          jobId,
          status: "complete",
          layers: {
            layer1: {
              club_payroll_history: l1Payroll,
              club_draft_spend_history: l1Spend,
              total: l1Payroll + l1Spend,
            },
            layer2: { derived_metrics: l2Count },
            layer3: { osm_research_findings: l3Count },
            layer4: { diamondiq_inferences: l4Count },
          },
          totalProductionRecords: l1Payroll + l1Spend + l2Count + l3Count + l4Count,
          sourceAssertions: rsaCount,
          recordDerivations: rdCount,
          mlbClubsProcessed: MLB_CLUBS.size,
        },
      });
    } else {
      return res.json({
        ok: true,
        data: {
          jobId,
          status: "complete",
          mode: "dedup",
          newClubLevelCanonicalRecords: 0,
          leagueFacts: leagueFactsCount,
          sourceAssertions: rsaCount,
          mlbClubsProcessed: MLB_CLUBS.size,
        },
      });
    }

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[ingestion/commit]", err);
    return res.status(500).json({
      ok: false,
      error: `Commit failed and was rolled back: ${(err as Error).message}`,
    });
  } finally {
    client.release();
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
