/**
 * AdminIngestionReview — Four-Layer Evidence Architecture
 *
 * Shows the parsed structure of an uploaded workbook.
 * Admin classifies each worksheet and maps columns across all four layers:
 *   Layer 1 — Canonical Factual Records  (verified_public)
 *   Layer 2 — Derived Metrics            (calculated | osm_proprietary)
 *   Layer 3 — OSM Research Findings      (osm_proprietary)
 *   Layer 4 — DiamondIQ Inferences       (diamondiq_inference)
 *
 * No production records are written here — this is the mapping/preview stage only.
 */

import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ParsedColumn {
  index: number;
  header: string;
  detectedEvidenceLabel: string;
  defaultSkip: boolean;
  suggestedLayer: 1 | 2 | 3 | 4;
  suggestedLayerName: "factual" | "derived" | "osm_finding" | "inference";
  suggestedCanonicalField: string | null;
  suggestedTable: string | null;
  sampleValues: (string | number | boolean | null)[];
  allNull: boolean;
}

interface ParsedWorksheet {
  name: string;
  detectedType: string;
  detectedTypeLabel: string;
  detectedTypeConfidence: "high" | "low";
  detectedHeaderExcelRow?: number;
  detectedHeaderConfidence?: "high" | "low";
  preamble?: { excelRow: number; raw: string[] }[];
  headers: (string | null)[];
  sampleRows: (string | number | boolean | null)[][];
  totalDataRows: number;
  columns: ParsedColumn[];
  isEmpty: boolean;
}

interface IngestionJob {
  id: number;
  file_name: string;
  file_type: string;
  status: string;
  total_rows: number;
  started_at: string;
  dataset_title: string;
  original_filename: string;
  file_hash: string;
  file_size_bytes: number;
  parsed_structure: { worksheets: ParsedWorksheet[] } | null;
  column_map: WorksheetMapping[] | null;
}

interface ColumnMapping {
  header: string;
  canonicalField: string;  // "field|table" for L1, "derived:<metric>" L2, "finding:<type>" L3, "inference:<type>" L4
  evidenceLabel: string;
  layer: 1 | 2 | 3 | 4;
  skip: boolean;
  note: string;
}

interface WorksheetMapping {
  name: string;
  classification: string;
  evidenceLabel: string;
  destinationTable: string;
  skip: boolean;
  columns: ColumnMapping[];
  worksheetNote: string;
}

// Commit preview types
interface CommitPreviewSheet {
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
    isDuplicate: boolean;
    isSkipped: boolean;
    isUnmapped: boolean;
    requiresAdminReview: boolean;
  }>;
}

interface CommitPreview {
  jobId: number;
  status: string;
  fileName: string;
  fileHash: string;
  safetyCheck: {
    club_payroll_history_rows: number;
    club_draft_spend_history_rows: number;
    derived_metrics_rows: number;
    osm_research_findings_rows: number;
    diamondiq_inferences_rows: number;
    allZero: boolean;
  };
  summary: {
    layer1FactualRecords: number;
    layer2DerivedMetrics: number;
    layer3OsmFindings: number;
    layer4Inferences: number;
    totalRecords: number;
    duplicatesDetected: number;
    skippedSheets: number;
    skippedColumns: number;
    unmappedFields: number;
    requiresOsmReview: number;
  };
  provenanceLinks: {
    sourceFileVersionId: number;
    datasetId: number;
    ingestionJobId: number;
    note: string;
  };
  sheets: CommitPreviewSheet[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WORKSHEET_CLASSIFICATIONS = [
  { value: "source",        label: "Source / Verified Factual Data",    color: "text-teal" },
  { value: "calculated",    label: "Calculated Results",                 color: "text-blue-400" },
  { value: "analysis",      label: "Analysis / Projection",              color: "text-status-pending" },
  { value: "documentation", label: "Documentation / Methodology",        color: "text-text-secondary" },
  { value: "chart",         label: "Chart / Presentation Data — Skip",   color: "text-text-muted" },
];

const EVIDENCE_LABELS = [
  "Verified Public Information",
  "Calculated Results",
  "OSM Proprietary Data",
  "OSM-Provided Athlete Information",
  "DiamondIQ Analysis / Inference",
  "Missing / Unverified Information",
];

// Maps evidence label → layer number
function evidenceLabelToLayer(label: string): 1 | 2 | 3 | 4 {
  if (label === "Verified Public Information") return 1;
  if (label === "Calculated Results") return 2;
  if (label === "OSM Proprietary Data" || label === "OSM-Provided Athlete Information") return 3;
  if (label === "DiamondIQ Analysis / Inference") return 4;
  return 1;
}

const LAYER_CONFIG = {
  1: { label: "L1 · Factual",      color: "bg-teal/20 text-teal",              border: "border-teal/40",          desc: "→ canonical fact table" },
  2: { label: "L2 · Derived",       color: "bg-blue-500/20 text-blue-300",      border: "border-blue-500/40",       desc: "→ derived_metrics" },
  3: { label: "L3 · OSM Finding",   color: "bg-status-pending/20 text-status-pending", border: "border-status-pending/40", desc: "→ osm_research_findings" },
  4: { label: "L4 · Inference",     color: "bg-red-900/30 text-red-300",        border: "border-red-800/40",        desc: "→ diamondiq_inferences" },
} as const;

// ── Layer 1 canonical field options ───────────────────────────────────────────

const L1_FIELDS = [
  { value: "", label: "— skip / don't import —" },
  // Identifiers (anchors, not separate records)
  { value: "__identifier__",                       label: "↳ identifier only (Club / entity key)" },
  // draft_players
  { value: "player_name|draft_players",            label: "[draft_players] player_name" },
  { value: "draft_year|draft_players",             label: "[draft_players] draft_year" },
  { value: "draft_round|draft_players",            label: "[draft_players] draft_round" },
  { value: "draft_pick_overall|draft_players",     label: "[draft_players] draft_pick_overall" },
  { value: "draft_pick_in_round|draft_players",    label: "[draft_players] draft_pick_in_round" },
  { value: "mlb_org|draft_players",                label: "[draft_players] mlb_org" },
  { value: "position|draft_players",               label: "[draft_players] position" },
  { value: "secondary_position|draft_players",     label: "[draft_players] secondary_position" },
  { value: "bats|draft_players",                   label: "[draft_players] bats" },
  { value: "throws|draft_players",                 label: "[draft_players] throws" },
  { value: "height_in|draft_players",              label: "[draft_players] height_in (inches)" },
  { value: "weight_lbs|draft_players",             label: "[draft_players] weight_lbs" },
  { value: "school|draft_players",                 label: "[draft_players] school" },
  { value: "school_type|draft_players",            label: "[draft_players] school_type (HS/JC/4yr)" },
  { value: "conference|draft_players",             label: "[draft_players] conference" },
  { value: "state|draft_players",                  label: "[draft_players] state" },
  { value: "country|draft_players",               label: "[draft_players] country" },
  { value: "age_at_draft|draft_players",           label: "[draft_players] age_at_draft" },
  { value: "bonus_reported|draft_players",         label: "[draft_players] bonus_reported ($)" },
  { value: "bonus_slot_value|draft_players",       label: "[draft_players] bonus_slot_value ($)" },
  { value: "bonus_source|draft_players",           label: "[draft_players] bonus_source" },
  { value: "signed|draft_players",                 label: "[draft_players] signed (boolean)" },
  { value: "signing_date|draft_players",           label: "[draft_players] signing_date" },
  { value: "career_outcome_summary|draft_players", label: "[draft_players] career_outcome_summary" },
  // slot_values
  { value: "pick_overall|slot_values",             label: "[slot_values] pick_overall" },
  { value: "slot_value_usd|slot_values",           label: "[slot_values] slot_value_usd ($)" },
  // historical_rankings
  { value: "ranking_source|historical_rankings",   label: "[historical_rankings] ranking_source" },
  { value: "rank_position|historical_rankings",    label: "[historical_rankings] rank_position" },
  // club_payroll_history
  { value: "mlb_org|club_payroll_history",         label: "[club_payroll_history] mlb_org" },
  { value: "season_column__requires_unpivot|club_payroll_history", label: "[club_payroll_history] ★ YEAR COLUMN → unpivot (one record per club/season)" },
  { value: "total_payroll|club_payroll_history",   label: "[club_payroll_history] total_payroll ($)" },
  { value: "cbt_threshold|club_payroll_history",   label: "[club_payroll_history] cbt_threshold ($)" },
  { value: "cbt_overage|club_payroll_history",     label: "[club_payroll_history] cbt_overage ($)" },
  { value: "luxury_tax_paid|club_payroll_history", label: "[club_payroll_history] luxury_tax_paid ($)" },
  // club_draft_spend_history
  { value: "mlb_org|club_draft_spend_history",     label: "[club_draft_spend_history] mlb_org" },
  { value: "season_column__requires_unpivot|club_draft_spend_history", label: "[club_draft_spend_history] ★ YEAR COLUMN → unpivot (one record per club/year)" },
  { value: "pool_allotment|club_draft_spend_history",  label: "[club_draft_spend_history] pool_allotment ($)" },
  { value: "total_draft_spend|club_draft_spend_history", label: "[club_draft_spend_history] total_draft_spend ($)" },
  { value: "over_under_pool|club_draft_spend_history",  label: "[club_draft_spend_history] over_under_pool ($)" },
  { value: "first_round_pick|club_draft_spend_history", label: "[club_draft_spend_history] first_round_pick (#)" },
  { value: "penalty_incurred|club_draft_spend_history", label: "[club_draft_spend_history] penalty_incurred (bool)" },
  { value: "picks_forfeited|club_draft_spend_history",  label: "[club_draft_spend_history] picks_forfeited (bool)" },
];

// Layer 2 derived metric options
const L2_FIELDS = [
  { value: "", label: "— select metric name —" },
  { value: "derived:avg_payroll_5yr",          label: "avg_payroll_5yr — 5-yr average CBT payroll" },
  { value: "derived:cagr_payroll_5yr",         label: "cagr_payroll_5yr — 5-yr payroll CAGR" },
  { value: "derived:times_over_cbt",           label: "times_over_cbt — count of seasons over CBT threshold" },
  { value: "derived:cbt_payroll_tier",         label: "cbt_payroll_tier — CBT payroll tier classification (High/Mid/Low)" },
  { value: "derived:avg_pool_5yr",             label: "avg_pool_5yr — 5-yr average draft pool" },
  { value: "derived:cagr_pool_5yr",            label: "cagr_pool_5yr — 5-yr draft pool CAGR" },
  { value: "derived:pool_vs_5yr_avg_pct",      label: "pool_vs_5yr_avg_pct — current pool vs 5yr avg (%)" },
  { value: "derived:draft_pool_tier",          label: "draft_pool_tier — draft pool tier classification (High/Mid/Low)" },
  { value: "derived:pool_rank",                label: "pool_rank — league-wide pool rank for the year" },
  { value: "derived:times_penalty_proxy",      label: "times_penalty_proxy — proxy count of pick-penalty applications" },
  { value: "derived:spend_vs_pool_rate",       label: "spend_vs_pool_rate — historical actual spend / pool rate (%)" },
  { value: "derived:custom",                   label: "custom — new metric (Admin specifies name in note)" },
];

// Layer 3 OSM finding options
const L3_FIELDS = [
  { value: "", label: "— select finding type —" },
  { value: "finding:pattern_read",             label: "pattern_read — qualitative behavioral read (club/player)" },
  { value: "finding:correlation",              label: "correlation — payroll ↔ draft pool correlation direction" },
  { value: "finding:methodology_assumption",   label: "methodology_assumption — OSM model input / assumption" },
  { value: "finding:behavioral_classification",label: "behavioral_classification — OSM-defined categorization" },
  { value: "finding:scouting_note",            label: "scouting_note — player or club scouting observation" },
  { value: "finding:research_note",            label: "research_note — general OSM research finding" },
];

// Layer 4 inference options
const L4_FIELDS = [
  { value: "", label: "— select inference type —" },
  { value: "inference:draft_spend_projection", label: "draft_spend_projection — projected total draft spend" },
  { value: "inference:pool_overage_projection",label: "pool_overage_projection — projected $ above pool" },
  { value: "inference:bonus_projection",       label: "bonus_projection — projected player bonus" },
  { value: "inference:signability_estimate",   label: "signability_estimate — signability / likelihood estimate" },
  { value: "inference:round_probability",      label: "round_probability — draft round probability" },
  { value: "inference:confidence_label",       label: "confidence_label — model confidence label (High/Mid/Low)" },
  { value: "inference:other",                  label: "other — other inference / projection type" },
];

const DESTINATION_TABLES = [
  { value: "",                      label: "— select destination layer/table —" },
  { value: "club_payroll_history",  label: "L1 · club_payroll_history — atomic annual payroll facts" },
  { value: "club_draft_spend_history", label: "L1 · club_draft_spend_history — atomic annual draft spend facts" },
  { value: "draft_players",         label: "L1 · draft_players — individual draft selections" },
  { value: "slot_values",           label: "L1 · slot_values — official slot values by pick/year" },
  { value: "historical_rankings",   label: "L1 · historical_rankings — ranking source records" },
  { value: "derived_metrics",       label: "L2 · derived_metrics — calculated aggregates (avg, CAGR, tier, ...)" },
  { value: "osm_research_findings", label: "L3 · osm_research_findings — OSM observations and reads" },
  { value: "diamondiq_inferences",  label: "L4 · diamondiq_inferences — system projections (never factual)" },
  { value: "documentation",         label: "Documentation / notes only — no row production" },
  { value: "skip",                  label: "Skip — do not import" },
];

const SKIP_TYPES = new Set(["documentation", "chart"]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function classificationColor(c: string) {
  return WORKSHEET_CLASSIFICATIONS.find((x) => x.value === c)?.color ?? "text-text-muted";
}
function classificationLabel(c: string) {
  return WORKSHEET_CLASSIFICATIONS.find((x) => x.value === c)?.label ?? c;
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function layerFieldsFor(layer: 1 | 2 | 3 | 4) {
  if (layer === 1) return L1_FIELDS;
  if (layer === 2) return L2_FIELDS;
  if (layer === 3) return L3_FIELDS;
  return L4_FIELDS;
}

function buildInitialMapping(worksheets: ParsedWorksheet[]): WorksheetMapping[] {
  return worksheets.map((ws) => {
    const skip = SKIP_TYPES.has(ws.detectedType) || ws.isEmpty;
    const dest = ws.detectedType === "source"
      ? "draft_players"
      : ws.detectedType === "documentation" ? "documentation"
      : ws.detectedType === "chart" ? "skip"
      : ws.detectedType === "calculated" ? "derived_metrics"
      : ws.detectedType === "analysis" ? "diamondiq_inferences"
      : "";
    return {
      name: ws.name,
      classification: ws.detectedType,
      evidenceLabel: ws.detectedType === "calculated" ? "Calculated Results"
        : ws.detectedType === "analysis" ? "DiamondIQ Analysis / Inference"
        : ws.detectedType === "documentation" ? "OSM Proprietary Data"
        : "Verified Public Information",
      destinationTable: dest,
      skip,
      worksheetNote: "",
      columns: ws.columns.map((col) => {
        const layer = col.suggestedLayer ?? evidenceLabelToLayer(col.detectedEvidenceLabel);
        // Build canonical field value for the appropriate layer
        let canonicalField = "";
        if (layer === 1 && col.suggestedCanonicalField && col.suggestedTable) {
          canonicalField = `${col.suggestedCanonicalField}|${col.suggestedTable}`;
        } else if (layer === 2 && col.suggestedCanonicalField) {
          canonicalField = `derived:${col.suggestedCanonicalField}`;
        } else if (layer === 3 && col.suggestedCanonicalField) {
          canonicalField = `finding:pattern_read`;
        }
        return {
          header: col.header,
          canonicalField,
          evidenceLabel: col.detectedEvidenceLabel,
          layer,
          skip: col.allNull || col.defaultSkip,
          note: "",
        };
      }),
    };
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  jobId: number;
  onBack: () => void;
}

export default function AdminIngestionReview({ jobId, onBack }: Props) {
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<WorksheetMapping[]>([]);
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [datasetMeta, setDatasetMeta] = useState({
    title: "",
    category: "draft",
    source: "OSM Research",
    yearsData: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showSampleFor, setShowSampleFor] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api.get<IngestionJob>(`/admin/ingestion/${jobId}`).then((r) => {
      if (r.ok && r.data) {
        setJob(r.data);
        setDatasetMeta((m) => ({ ...m, title: r.data.original_filename }));
        if (r.data.parsed_structure?.worksheets) {
          setMappings(buildInitialMapping(r.data.parsed_structure.worksheets));
          const toExpand = new Set<string>();
          r.data.parsed_structure.worksheets.forEach((ws) => {
            if (!SKIP_TYPES.has(ws.detectedType) && !ws.isEmpty) toExpand.add(ws.name);
          });
          setExpandedSheets(toExpand);
        }
      } else {
        setError("Failed to load ingestion job.");
      }
      setLoading(false);
    });
  }, [jobId]);

  const toggleExpand = (name: string) =>
    setExpandedSheets((prev) => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });

  const toggleSample = (name: string) =>
    setShowSampleFor((prev) => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });

  const updateWorksheet = useCallback((wsName: string, patch: Partial<WorksheetMapping>) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.name === wsName
          ? { ...m, ...patch,
              skip: patch.skip !== undefined ? patch.skip : SKIP_TYPES.has(patch.classification ?? m.classification) }
          : m
      )
    );
  }, []);

  const updateColumn = useCallback((wsName: string, colIdx: number, patch: Partial<ColumnMapping>) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.name === wsName
          ? { ...m, columns: m.columns.map((c, i) => i === colIdx ? { ...c, ...patch } : c) }
          : m
      )
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    const res = await api.post(`/admin/ingestion/${jobId}/classify`, {
      columnMap: { worksheets: mappings },
      datasetTitle: datasetMeta.title || undefined,
      datasetCategory: datasetMeta.category || undefined,
      datasetSource: datasetMeta.source || undefined,
      yearsData: datasetMeta.yearsData || undefined,
    });
    setSaving(false);
    setSaveResult({ ok: res.ok, msg: res.ok ? "Saved" : (res as unknown as { error: string }).error });
  };

  const handleCommitPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setCommitPreview(null);
    setShowPreview(true);
    const res = await api.post<CommitPreview>(`/admin/ingestion/${jobId}/commit-preview`, {});
    setPreviewLoading(false);
    if (res.ok && res.data) {
      setCommitPreview(res.data);
    } else {
      setPreviewError((res as unknown as { error: string }).error ?? "Preview failed.");
    }
  };

  if (loading) return <div className="p-8 text-text-muted text-sm text-center">Loading ingestion job…</div>;
  if (error || !job) return (
    <div className="p-8">
      <div className="text-text-red text-sm mb-4">{error ?? "Job not found."}</div>
      <button onClick={onBack} className="diq-btn-secondary text-xs">← Back</button>
    </div>
  );

  const worksheets = job.parsed_structure?.worksheets ?? [];
  const isMapped = job.status === "mapped";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="text-text-muted text-xs hover:text-teal mb-2 flex items-center gap-1">
            ← Data Library
          </button>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
            INGESTION REVIEW
          </h1>
          <p className="text-text-secondary text-sm mt-1 font-mono">{job.original_filename}</p>
        </div>
        <div className="text-right">
          <span className={`diq-badge text-xs px-2 py-1 rounded font-semibold uppercase ${
            isMapped ? "bg-teal/20 text-teal" :
            job.status === "preview" ? "bg-status-pending/20 text-status-pending" :
            "bg-bg-surface text-text-muted"
          }`}>
            {job.status.toUpperCase()}
          </span>
          <div className="text-2xs text-text-muted mt-1">Job #{job.id}</div>
        </div>
      </div>

      {/* Critical notice */}
      <div className="border border-status-pending/40 bg-status-pending/5 rounded p-4">
        <div className="text-status-pending font-semibold text-xs uppercase tracking-wider mb-1">
          ⚠ Mapping Stage Only — No Production Records Committed
        </div>
        <p className="text-text-secondary text-xs leading-relaxed">
          DiamondIQ has parsed this file and detected the worksheet structure below.
          Each column is classified into one of four evidence layers.
          <strong className="text-text-primary"> No data is written to production tables until OSM explicitly approves a separate commit step (Stage 5).</strong>
        </p>
      </div>

      {/* Four-layer legend */}
      <div className="diq-card p-4">
        <div className="diq-label mb-3 text-teal">FOUR-LAYER EVIDENCE ARCHITECTURE</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-2xs">
          {([1, 2, 3, 4] as const).map((l) => (
            <div key={l} className={`rounded p-2 border ${LAYER_CONFIG[l].border}`}>
              <div className={`font-semibold text-xs mb-0.5 ${LAYER_CONFIG[l].color.split(" ")[1]}`}>
                {LAYER_CONFIG[l].label}
              </div>
              <div className="text-text-muted">{LAYER_CONFIG[l].desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* File summary */}
      <div className="diq-card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="diq-label mb-1">FILE</div>
          <div className="text-text-primary font-medium truncate">{job.file_name}</div>
          <div className="text-text-muted">{formatBytes(job.file_size_bytes)}</div>
        </div>
        <div>
          <div className="diq-label mb-1">WORKSHEETS</div>
          <div className="text-text-primary font-medium">{worksheets.length}</div>
          <div className="text-text-muted">{worksheets.filter(w => !SKIP_TYPES.has(w.detectedType)).length} to classify</div>
        </div>
        <div>
          <div className="diq-label mb-1">TOTAL DATA ROWS</div>
          <div className="text-text-primary font-medium">{job.total_rows?.toLocaleString() ?? "—"}</div>
          <div className="text-text-muted">across all sheets</div>
        </div>
        <div>
          <div className="diq-label mb-1">SHA-256</div>
          <div className="text-text-muted font-mono text-2xs break-all">{job.file_hash?.slice(0, 16)}…</div>
          <div className="text-text-muted">immutable source ID</div>
        </div>
      </div>

      {/* Dataset metadata */}
      <div className="diq-card p-4">
        <div className="diq-label mb-3 text-teal">DATASET CLASSIFICATION</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="col-span-2">
            <label className="text-text-secondary mb-1 block">Dataset Title *</label>
            <input value={datasetMeta.title}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, title: e.target.value }))}
              className="diq-input text-xs w-full" placeholder="e.g. MLB Draft Payroll & Spend 2021–2026" />
          </div>
          <div>
            <label className="text-text-secondary mb-1 block">Category</label>
            <select value={datasetMeta.category}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, category: e.target.value }))}
              className="diq-select w-full text-xs">
              <option value="draft">Draft</option>
              <option value="club">Club</option>
              <option value="nil">NIL</option>
              <option value="osm">OSM</option>
            </select>
          </div>
          <div>
            <label className="text-text-secondary mb-1 block">Years Covered</label>
            <input value={datasetMeta.yearsData}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, yearsData: e.target.value }))}
              className="diq-input text-xs w-full" placeholder="e.g. 2021–2026" />
          </div>
          <div className="col-span-2">
            <label className="text-text-secondary mb-1 block">Source / Provider</label>
            <input value={datasetMeta.source}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, source: e.target.value }))}
              className="diq-input text-xs w-full" placeholder="e.g. OSM Research / Baseball America" />
          </div>
        </div>
      </div>

      {/* Worksheet cards */}
      <div className="space-y-3">
        <div className="diq-label text-teal">WORKSHEET DETECTION ({worksheets.length})</div>

        {worksheets.map((ws, wsIdx) => {
          const mapping = mappings[wsIdx];
          if (!mapping) return null;
          const expanded = expandedSheets.has(ws.name);
          const showSample = showSampleFor.has(ws.name);
          const isSkipped = mapping.skip || SKIP_TYPES.has(mapping.classification);

          // Preamble rows from parsed structure
          const preamble = ws.preamble ?? [];

          return (
            <div key={ws.name} className={`diq-card overflow-hidden border ${isSkipped ? "border-bg-border opacity-60" : "border-bg-border"}`}>
              {/* Sheet header row */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-bg-elevated"
                onClick={() => !isSkipped && toggleExpand(ws.name)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-text-muted text-xs font-mono w-5">{wsIdx + 1}</span>
                  <div>
                    <div className="text-text-primary text-sm font-medium">{ws.name}</div>
                    <div className={`text-2xs mt-0.5 ${classificationColor(mapping.classification)}`}>
                      {classificationLabel(mapping.classification)}
                      {ws.detectedTypeConfidence === "low" && (
                        <span className="text-text-muted ml-1">(auto-detected — confirm)</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {!ws.isEmpty && (
                    <span className="text-text-muted">{ws.totalDataRows.toLocaleString()} rows · {ws.columns.length} cols</span>
                  )}
                  {ws.isEmpty && <span className="text-text-muted">Empty</span>}
                  {ws.detectedHeaderExcelRow && (
                    <span className="text-text-muted">hdr=row {ws.detectedHeaderExcelRow}</span>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={mapping.skip}
                      onChange={(e) => updateWorksheet(ws.name, { skip: e.target.checked })}
                      className="accent-teal" />
                    <span className="text-text-muted">Skip</span>
                  </label>
                  {!isSkipped && (
                    <span className="text-text-muted text-lg leading-none">{expanded ? "▲" : "▼"}</span>
                  )}
                </div>
              </div>

              {/* Expanded worksheet detail */}
              {expanded && !isSkipped && (
                <div className="border-t border-bg-border">
                  {/* Preamble (source attribution rows) */}
                  {preamble.length > 0 && (
                    <div className="px-4 py-2 bg-teal/5 border-b border-teal/20 text-2xs space-y-0.5">
                      <div className="text-teal font-semibold uppercase tracking-wider mb-1">Source Preamble (preserved provenance)</div>
                      {preamble.map((p, pi) => (
                        <div key={pi} className="text-text-secondary font-mono">
                          Row {p.excelRow}: {p.raw.join("  |  ").slice(0, 120)}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Classification controls */}
                  <div className="p-4 bg-bg-surface grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="col-span-2">
                      <label className="text-text-secondary mb-1 block">Sheet Classification *</label>
                      <select value={mapping.classification}
                        onChange={(e) => updateWorksheet(ws.name, { classification: e.target.value, skip: SKIP_TYPES.has(e.target.value) })}
                        className="diq-select w-full text-xs">
                        {WORKSHEET_CLASSIFICATIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-text-secondary mb-1 block">Primary Destination Layer</label>
                      <select value={mapping.destinationTable}
                        onChange={(e) => updateWorksheet(ws.name, { destinationTable: e.target.value })}
                        className="diq-select w-full text-xs">
                        {DESTINATION_TABLES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-text-secondary mb-1 block">Default Evidence Label</label>
                      <select value={mapping.evidenceLabel}
                        onChange={(e) => updateWorksheet(ws.name, { evidenceLabel: e.target.value })}
                        className="diq-select w-full text-xs">
                        {EVIDENCE_LABELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <label className="text-text-secondary mb-1 block">
                        Worksheet Note
                        {ws.detectedType === "analysis" && (
                          <span className="text-status-pending ml-2">
                            — ANALYSIS: values must NOT be presented as verified facts
                          </span>
                        )}
                      </label>
                      <input value={mapping.worksheetNote}
                        onChange={(e) => updateWorksheet(ws.name, { worksheetNote: e.target.value })}
                        placeholder="Optional note about this worksheet's content or limitations"
                        className="diq-input text-xs w-full" />
                    </div>
                  </div>

                  {/* Column mapping table */}
                  {ws.columns.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-2xs text-text-muted uppercase tracking-wider font-semibold">
                          Column Mapping — {ws.columns.length} columns
                        </div>
                        <button onClick={() => toggleSample(ws.name)}
                          className="text-2xs text-teal hover:underline">
                          {showSample ? "Hide sample data" : "Show sample data"}
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-2xs border-collapse">
                          <thead>
                            <tr className="bg-bg-surface border-b border-bg-border">
                              <th className="text-left py-2 px-2 text-text-muted font-semibold w-6">#</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold min-w-[140px]">HEADER</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold w-28">LAYER</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold min-w-[240px]">CANONICAL FIELD / TARGET</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold min-w-[180px]">EVIDENCE LABEL</th>
                              {showSample && ws.sampleRows.map((_, ri) => (
                                <th key={ri} className="text-left py-2 px-2 text-text-muted font-semibold min-w-[80px]">
                                  Row {ri + 2}
                                </th>
                              ))}
                              <th className="text-left py-2 px-2 text-text-muted font-semibold w-12">SKIP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ws.columns.map((col, colIdx) => {
                              const colMap = mapping.columns[colIdx];
                              if (!colMap) return null;
                              const layer = (colMap.layer ?? col.suggestedLayer ?? 1) as 1 | 2 | 3 | 4;
                              const lCfg = LAYER_CONFIG[layer];
                              const fieldOptions = layerFieldsFor(layer);

                              return (
                                <tr key={col.index} className={`border-b border-bg-border ${colMap.skip ? "opacity-40" : "hover:bg-bg-surface"}`}>
                                  <td className="py-1.5 px-2 text-text-muted">{col.index + 1}</td>
                                  <td className="py-1.5 px-2">
                                    <div className="font-medium text-text-primary">{col.header}</div>
                                    {col.suggestedCanonicalField && !colMap.skip && (
                                      <div className="text-teal mt-0.5 opacity-70">↳ {col.suggestedCanonicalField}</div>
                                    )}
                                    {col.header.match(/^Column_\d+$/) && (
                                      <div className="text-text-muted italic mt-0.5">blank/unnamed</div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <select
                                      value={layer}
                                      disabled={colMap.skip}
                                      onChange={(e) => {
                                        const newLayer = parseInt(e.target.value) as 1 | 2 | 3 | 4;
                                        const newLabel = newLayer === 1 ? "Verified Public Information"
                                          : newLayer === 2 ? "Calculated Results"
                                          : newLayer === 3 ? "OSM Proprietary Data"
                                          : "DiamondIQ Analysis / Inference";
                                        updateColumn(ws.name, colIdx, {
                                          layer: newLayer,
                                          evidenceLabel: newLabel,
                                          canonicalField: "",
                                        });
                                      }}
                                      className="diq-select w-full text-2xs"
                                    >
                                      <option value={1}>L1 · Factual</option>
                                      <option value={2}>L2 · Derived</option>
                                      <option value={3}>L3 · OSM Finding</option>
                                      <option value={4}>L4 · Inference</option>
                                    </select>
                                    <div className={`mt-0.5 text-2xs font-mono px-1 rounded ${lCfg.color}`}>{lCfg.desc}</div>
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <select
                                      value={colMap.canonicalField}
                                      disabled={colMap.skip}
                                      onChange={(e) => updateColumn(ws.name, colIdx, { canonicalField: e.target.value })}
                                      className="diq-select w-full text-2xs"
                                    >
                                      {fieldOptions.map((f) => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                      ))}
                                    </select>
                                    {colMap.canonicalField?.includes("unpivot") && (
                                      <div className="text-status-pending text-2xs mt-0.5">★ Requires unpivot at Stage 5</div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <select
                                      value={colMap.evidenceLabel}
                                      disabled={colMap.skip}
                                      onChange={(e) => {
                                        const newLabel = e.target.value;
                                        const newLayer = evidenceLabelToLayer(newLabel);
                                        updateColumn(ws.name, colIdx, {
                                          evidenceLabel: newLabel,
                                          layer: newLayer,
                                          canonicalField: "",
                                        });
                                      }}
                                      className="diq-select w-full text-2xs"
                                    >
                                      {EVIDENCE_LABELS.map((l) => (
                                        <option key={l} value={l}>{l}</option>
                                      ))}
                                    </select>
                                  </td>
                                  {showSample && col.sampleValues.map((v, vi) => (
                                    <td key={vi} className="py-1.5 px-2 text-text-secondary font-mono whitespace-nowrap max-w-[100px] truncate">
                                      {formatVal(v)}
                                    </td>
                                  ))}
                                  <td className="py-1.5 px-2 text-center">
                                    <input type="checkbox" checked={colMap.skip}
                                      onChange={(e) => updateColumn(ws.name, colIdx, { skip: e.target.checked })}
                                      className="accent-teal" />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Commit preview panel */}
      {showPreview && (
        <div className="diq-card p-5 border border-blue-500/30">
          <div className="diq-label mb-3 text-blue-300">FOUR-LAYER COMMIT PREVIEW (READ-ONLY — NO RECORDS COMMITTED)</div>
          {previewLoading && (
            <div className="text-text-muted text-xs text-center py-6">Analysing job structure…</div>
          )}
          {previewError && (
            <div className="text-red-400 text-xs p-3 bg-red-900/20 rounded">{previewError}</div>
          )}
          {commitPreview && !previewLoading && (
            <div className="space-y-4">
              {/* Safety check */}
              <div className={`rounded p-3 text-xs border ${
                commitPreview.safetyCheck.allZero
                  ? "bg-teal/10 border-teal/30 text-teal"
                  : "bg-red-900/20 border-red-700/40 text-red-300"
              }`}>
                {commitPreview.safetyCheck.allZero
                  ? "✓ SAFETY CONFIRMED — Zero production records committed. All tables empty."
                  : "⚠ WARNING — Production tables are not empty. Review before proceeding."}
                <div className="mt-1 font-mono text-2xs opacity-80">
                  club_payroll_history={commitPreview.safetyCheck.club_payroll_history_rows} ·
                  club_draft_spend_history={commitPreview.safetyCheck.club_draft_spend_history_rows} ·
                  derived_metrics={commitPreview.safetyCheck.derived_metrics_rows} ·
                  osm_findings={commitPreview.safetyCheck.osm_research_findings_rows} ·
                  inferences={commitPreview.safetyCheck.diamondiq_inferences_rows}
                </div>
              </div>

              {/* Layer summary grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {([
                  { layer: 1, count: commitPreview.summary.layer1FactualRecords, label: "Layer 1 · Factual Records", note: "club_payroll_history, club_draft_spend_history (post-unpivot)" },
                  { layer: 2, count: commitPreview.summary.layer2DerivedMetrics, label: "Layer 2 · Derived Metrics", note: "derived_metrics" },
                  { layer: 3, count: commitPreview.summary.layer3OsmFindings, label: "Layer 3 · OSM Findings", note: "osm_research_findings" },
                  { layer: 4, count: commitPreview.summary.layer4Inferences, label: "Layer 4 · Inferences", note: "diamondiq_inferences" },
                ] as const).map((item) => {
                  const l = item.layer as 1 | 2 | 3 | 4;
                  const cfg = LAYER_CONFIG[l];
                  return (
                    <div key={item.layer} className={`rounded p-3 border ${cfg.border}`}>
                      <div className={`font-semibold text-lg ${cfg.color.split(" ")[1]}`}>{item.count.toLocaleString()}</div>
                      <div className="text-text-primary font-medium mt-0.5">{item.label}</div>
                      <div className="text-text-muted text-2xs mt-0.5">{item.note}</div>
                    </div>
                  );
                })}
              </div>

              {/* Flags summary */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-2xs">
                {[
                  { label: "Total Records", val: commitPreview.summary.totalRecords, color: "text-text-primary" },
                  { label: "Duplicates", val: commitPreview.summary.duplicatesDetected, color: commitPreview.summary.duplicatesDetected > 0 ? "text-status-pending" : "text-teal" },
                  { label: "Skipped Sheets", val: commitPreview.summary.skippedSheets, color: "text-text-muted" },
                  { label: "Skipped Cols", val: commitPreview.summary.skippedColumns, color: "text-text-muted" },
                  { label: "Unmapped", val: commitPreview.summary.unmappedFields, color: commitPreview.summary.unmappedFields > 0 ? "text-status-pending" : "text-teal" },
                  { label: "Requires Review", val: commitPreview.summary.requiresOsmReview, color: commitPreview.summary.requiresOsmReview > 0 ? "text-status-pending" : "text-teal" },
                ].map((item) => (
                  <div key={item.label} className="bg-bg-surface rounded p-2 text-center">
                    <div className={`font-semibold text-sm ${item.color}`}>{item.val}</div>
                    <div className="text-text-muted mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Provenance links */}
              <div className="text-2xs text-text-muted bg-bg-surface rounded p-3 border border-bg-border">
                <span className="font-semibold text-text-secondary">Provenance chain on commit: </span>
                source_file_version_id={commitPreview.provenanceLinks.sourceFileVersionId} ·
                dataset_id={commitPreview.provenanceLinks.datasetId} ·
                ingestion_job_id={commitPreview.provenanceLinks.ingestionJobId} ·
                + source_worksheet + source_excel_row + source_excel_column on every record
              </div>

              {/* Per-sheet breakdown */}
              <div>
                <div className="text-2xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Per-Sheet Breakdown</div>
                <div className="space-y-1">
                  {commitPreview.sheets.map((s) => (
                    <div key={s.sheet} className={`rounded px-3 py-2 text-2xs border ${s.skipped ? "border-bg-border opacity-50" : "border-bg-border"}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium text-text-primary min-w-[200px]">{s.sheet}</span>
                        {s.skipped
                          ? <span className="text-text-muted">SKIPPED — {s.reason}</span>
                          : <>
                            <span className="text-teal">L1: {s.layer1}</span>
                            <span className="text-blue-300">L2: {s.layer2}</span>
                            <span className="text-status-pending">L3: {s.layer3}</span>
                            <span className="text-red-300">L4: {s.layer4}</span>
                            <span className="text-text-muted">{s.dataRows} source rows</span>
                          </>
                        }
                      </div>
                      {!s.skipped && s.columns.filter(c => !c.isSkipped && c.layer > 0).map((c, ci) => (
                        <div key={ci} className="mt-1 pl-4 flex gap-2 flex-wrap">
                          <span className="text-text-muted">{c.header}:</span>
                          <span className={
                            c.layer === 1 ? "text-teal" :
                            c.layer === 2 ? "text-blue-300" :
                            c.layer === 3 ? "text-status-pending" :
                            c.layer === 4 ? "text-red-300" : "text-text-muted"
                          }>L{c.layer}</span>
                          <span className="text-text-secondary">{c.target}</span>
                          {c.requiresUnpivot && <span className="text-status-pending">★unpivot</span>}
                          {c.isDuplicate && <span className="text-status-pending">⚠ dup</span>}
                          {c.isUnmapped && <span className="text-red-400">⚠ unmapped</span>}
                          {c.requiresAdminReview && <span className="text-yellow-400">⚑ review</span>}
                          <span className="text-text-muted">({c.dataRows} rows)</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-2xs text-text-muted italic border-t border-bg-border pt-3">
                This is a read-only preview. Zero records have been committed.
                Stage 5 (commit) will be built and executed only after explicit OSM Admin approval of this preview.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save controls */}
      <div className="diq-card p-5 border border-teal/30">
        <div className="diq-label mb-3 text-teal">MAPPING ACTIONS</div>
        <p className="text-text-secondary text-xs mb-4 leading-relaxed">
          Save the mapping to record your four-layer classification decisions.
          Then generate the commit preview to see exact record counts before any data is committed.
          <strong className="text-text-primary"> No production records are committed by either action.</strong>
        </p>

        {saveResult && (
          <div className={`mb-4 p-3 rounded text-xs border ${
            saveResult.ok
              ? "bg-text-green/10 border-text-green/30 text-text-green"
              : "bg-text-red/10 border-text-red/30 text-text-red"
          }`}>
            {saveResult.ok
              ? "✓ Mapping saved. Status → MAPPED. Zero production records committed."
              : `Error: ${saveResult.msg}`}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button onClick={handleSave} disabled={saving} className="diq-btn-primary text-xs">
            {saving ? "Saving…" : "SAVE MAPPING"}
          </button>
          <button
            onClick={handleCommitPreview}
            disabled={previewLoading}
            className="diq-btn-secondary text-xs border-blue-500/50 text-blue-300 hover:bg-blue-500/10"
          >
            {previewLoading ? "Analysing…" : "GENERATE COMMIT PREVIEW"}
          </button>
          <button onClick={onBack} className="diq-btn-secondary text-xs">
            BACK TO DATA LIBRARY
          </button>
        </div>
      </div>

      {/* Provenance footer */}
      <div className="p-3 bg-bg-surface border border-bg-border rounded text-2xs text-text-muted space-y-1">
        <div className="font-semibold text-text-secondary">Source Provenance</div>
        <div>File: <span className="font-mono text-text-primary">{job.original_filename}</span></div>
        <div>SHA-256: <span className="font-mono">{job.file_hash}</span></div>
        <div>Imported: {new Date(job.started_at).toLocaleString()}</div>
        <div>Job ID: <span className="font-mono">#{job.id}</span></div>
        <div className="pt-1 text-text-muted italic">
          This file version is preserved immutably. Re-importing an updated file creates a new source_file_versions
          record without altering the provenance of any data or reports generated from this version.
        </div>
      </div>
    </div>
  );
}
