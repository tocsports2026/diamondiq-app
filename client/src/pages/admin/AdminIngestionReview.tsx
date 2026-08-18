/**
 * AdminIngestionReview
 * Shows the parsed structure of an uploaded workbook.
 * Admin classifies each worksheet and maps columns before any rows are committed.
 * No production records are written here — this is the mapping/preview stage only.
 */

import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SampleValues {
  [key: number]: (string | number | boolean | null);
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
  canonicalField: string;
  evidenceLabel: string;
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

// ── Constants ──────────────────────────────────────────────────────────────────

const WORKSHEET_CLASSIFICATIONS = [
  { value: "source",        label: "Source / Verified Factual Data",       color: "text-teal" },
  { value: "calculated",   label: "Calculated Results",                     color: "text-blue-400" },
  { value: "analysis",     label: "Analysis / Projection (not factual)",    color: "text-status-pending" },
  { value: "documentation",label: "Documentation / Methodology",            color: "text-text-secondary" },
  { value: "chart",        label: "Chart / Presentation Data — Skip",       color: "text-text-muted" },
];

const EVIDENCE_LABELS = [
  "Verified Public Information",
  "OSM Proprietary Data",
  "OSM-Provided Athlete Information",
  "Calculated Results",
  "DiamondIQ Analysis / Inference",
  "Missing / Unverified Information",
];

const DRAFT_PLAYER_FIELDS = [
  { value: "", label: "— skip / don't import —" },
  { value: "player_name|draft_players",       label: "[draft_players] player_name" },
  { value: "draft_year|draft_players",        label: "[draft_players] draft_year" },
  { value: "draft_round|draft_players",       label: "[draft_players] draft_round" },
  { value: "draft_pick_overall|draft_players",label: "[draft_players] draft_pick_overall" },
  { value: "draft_pick_in_round|draft_players",label:"[draft_players] draft_pick_in_round" },
  { value: "mlb_org|draft_players",           label: "[draft_players] mlb_org" },
  { value: "position|draft_players",          label: "[draft_players] position" },
  { value: "secondary_position|draft_players",label: "[draft_players] secondary_position" },
  { value: "bats|draft_players",              label: "[draft_players] bats" },
  { value: "throws|draft_players",            label: "[draft_players] throws" },
  { value: "height_in|draft_players",         label: "[draft_players] height_in (inches)" },
  { value: "weight_lbs|draft_players",        label: "[draft_players] weight_lbs" },
  { value: "school|draft_players",            label: "[draft_players] school" },
  { value: "school_type|draft_players",       label: "[draft_players] school_type (HS/JC/4yr)" },
  { value: "conference|draft_players",        label: "[draft_players] conference" },
  { value: "state|draft_players",             label: "[draft_players] state" },
  { value: "country|draft_players",           label: "[draft_players] country" },
  { value: "age_at_draft|draft_players",      label: "[draft_players] age_at_draft" },
  { value: "bonus_reported|draft_players",    label: "[draft_players] bonus_reported ($)" },
  { value: "bonus_slot_value|draft_players",  label: "[draft_players] bonus_slot_value ($)" },
  { value: "bonus_source|draft_players",      label: "[draft_players] bonus_source" },
  { value: "signed|draft_players",            label: "[draft_players] signed (boolean)" },
  { value: "signing_date|draft_players",      label: "[draft_players] signing_date" },
  { value: "career_outcome_summary|draft_players", label: "[draft_players] career_outcome_summary" },
  { value: "pick_overall|slot_values",        label: "[slot_values] pick_overall" },
  { value: "slot_value_usd|slot_values",      label: "[slot_values] slot_value_usd ($)" },
  { value: "ranking_source|historical_rankings", label: "[historical_rankings] ranking_source" },
  { value: "rank_position|historical_rankings",  label: "[historical_rankings] rank_position" },
  { value: "notes|annotation",                label: "[annotation] notes / metadata" },
  { value: "custom|tbd",                      label: "[TBD] custom / new table needed" },
];

const DESTINATION_TABLES = [
  { value: "",              label: "— select destination table —" },
  { value: "draft_players", label: "draft_players — individual draft selections" },
  { value: "slot_values",   label: "slot_values — official slot values by pick/year" },
  { value: "historical_rankings", label: "historical_rankings — ranking source records" },
  { value: "payroll_tbd",   label: "payroll_history — team payroll (table TBD, new table needed)" },
  { value: "draft_spend_tbd", label: "draft_spend — aggregate team draft spend (table TBD)" },
  { value: "documentation", label: "documentation / notes only" },
  { value: "skip",          label: "skip — do not import" },
];

const SKIP_TYPES = new Set(["documentation", "chart"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Build initial mapping state from parsed worksheet structure
function buildInitialMapping(worksheets: ParsedWorksheet[]): WorksheetMapping[] {
  return worksheets.map((ws) => {
    const skip = SKIP_TYPES.has(ws.detectedType) || ws.isEmpty;
    const dest = ws.detectedType === "source" ? "draft_players"
               : ws.detectedType === "documentation" ? "documentation"
               : ws.detectedType === "chart" ? "skip"
               : "";
    return {
      name: ws.name,
      classification: ws.detectedType,
      evidenceLabel: ws.detectedType === "calculated"
        ? "Calculated Results"
        : ws.detectedType === "analysis"
        ? "DiamondIQ Analysis / Inference"
        : ws.detectedType === "documentation"
        ? "OSM Proprietary Data"
        : "Verified Public Information",
      destinationTable: dest,
      skip,
      worksheetNote: "",
      columns: ws.columns.map((col) => ({
        header: col.header,
        canonicalField: col.suggestedCanonicalField
          ? `${col.suggestedCanonicalField}|${col.suggestedTable ?? "draft_players"}`
          : "",
        evidenceLabel: col.detectedEvidenceLabel,
        skip: col.allNull,
        note: "",
      })),
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    api.get<IngestionJob>(`/admin/ingestion/${jobId}`).then((r) => {
      if (r.ok && r.data) {
        setJob(r.data);
        setDatasetMeta((m) => ({ ...m, title: r.data.original_filename }));
        if (r.data.parsed_structure?.worksheets) {
          setMappings(buildInitialMapping(r.data.parsed_structure.worksheets));
          // Auto-expand non-skip sheets
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

  const toggleExpand = (name: string) => {
    setExpandedSheets((prev) => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });
  };

  const toggleSample = (name: string) => {
    setShowSampleFor((prev) => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });
  };

  const updateWorksheet = useCallback((wsName: string, patch: Partial<WorksheetMapping>) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.name === wsName
          ? { ...m, ...patch, skip: patch.skip !== undefined ? patch.skip : SKIP_TYPES.has(patch.classification ?? m.classification) }
          : m
      )
    );
  }, []);

  const updateColumn = useCallback(
    (wsName: string, colIdx: number, patch: Partial<ColumnMapping>) => {
      setMappings((prev) =>
        prev.map((m) =>
          m.name === wsName
            ? {
                ...m,
                columns: m.columns.map((c, i) =>
                  i === colIdx ? { ...c, ...patch } : c
                ),
              }
            : m
        )
      );
    },
    []
  );

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
    setSaveResult({ ok: res.ok, msg: res.ok ? res.data as string : (res as unknown as { error: string }).error });
  };

  if (loading) {
    return (
      <div className="p-8 text-text-muted text-sm text-center">Loading ingestion job…</div>
    );
  }
  if (error || !job) {
    return (
      <div className="p-8">
        <div className="text-text-red text-sm mb-4">{error ?? "Job not found."}</div>
        <button onClick={onBack} className="diq-btn-secondary text-xs">← Back</button>
      </div>
    );
  }

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
          Review and classify each worksheet and its columns, then save the mapping.
          <strong className="text-text-primary"> No data will be written to production tables until OSM explicitly approves a separate commit step (Stage 5).</strong>
        </p>
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
            <input
              value={datasetMeta.title}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, title: e.target.value }))}
              className="diq-input text-xs w-full"
              placeholder="e.g. MLB Draft Payroll & Spend 2021–2026"
            />
          </div>
          <div>
            <label className="text-text-secondary mb-1 block">Category</label>
            <select
              value={datasetMeta.category}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, category: e.target.value }))}
              className="diq-select w-full text-xs"
            >
              <option value="draft">Draft</option>
              <option value="club">Club</option>
              <option value="nil">NIL</option>
              <option value="osm">OSM</option>
            </select>
          </div>
          <div>
            <label className="text-text-secondary mb-1 block">Years Covered</label>
            <input
              value={datasetMeta.yearsData}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, yearsData: e.target.value }))}
              className="diq-input text-xs w-full"
              placeholder="e.g. 2021–2026"
            />
          </div>
          <div className="col-span-2">
            <label className="text-text-secondary mb-1 block">Source / Provider</label>
            <input
              value={datasetMeta.source}
              onChange={(e) => setDatasetMeta((m) => ({ ...m, source: e.target.value }))}
              className="diq-input text-xs w-full"
              placeholder="e.g. OSM Research / Baseball America"
            />
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

          return (
            <div
              key={ws.name}
              className={`diq-card overflow-hidden border ${
                isSkipped ? "border-bg-border opacity-60" : "border-bg-border"
              }`}
            >
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
                    <span className="text-text-muted">
                      {ws.totalDataRows.toLocaleString()} rows · {ws.columns.length} cols
                    </span>
                  )}
                  {ws.isEmpty && <span className="text-text-muted">Empty</span>}
                  <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={mapping.skip}
                      onChange={(e) => updateWorksheet(ws.name, { skip: e.target.checked })}
                      className="accent-teal"
                    />
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
                  {/* Classification controls */}
                  <div className="p-4 bg-bg-surface grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="col-span-2">
                      <label className="text-text-secondary mb-1 block">Sheet Classification *</label>
                      <select
                        value={mapping.classification}
                        onChange={(e) =>
                          updateWorksheet(ws.name, {
                            classification: e.target.value,
                            skip: SKIP_TYPES.has(e.target.value),
                          })
                        }
                        className="diq-select w-full text-xs"
                      >
                        {WORKSHEET_CLASSIFICATIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-text-secondary mb-1 block">Destination Table</label>
                      <select
                        value={mapping.destinationTable}
                        onChange={(e) => updateWorksheet(ws.name, { destinationTable: e.target.value })}
                        className="diq-select w-full text-xs"
                      >
                        {DESTINATION_TABLES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-text-secondary mb-1 block">Default Evidence Label</label>
                      <select
                        value={mapping.evidenceLabel}
                        onChange={(e) => updateWorksheet(ws.name, { evidenceLabel: e.target.value })}
                        className="diq-select w-full text-xs"
                      >
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
                            — ANALYSIS/PROJECTION: values in this sheet must NOT be presented as verified facts
                          </span>
                        )}
                      </label>
                      <input
                        value={mapping.worksheetNote}
                        onChange={(e) => updateWorksheet(ws.name, { worksheetNote: e.target.value })}
                        placeholder="Optional note about this worksheet's content or limitations"
                        className="diq-input text-xs w-full"
                      />
                    </div>
                  </div>

                  {/* Column mapping table */}
                  {ws.columns.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-2xs text-text-muted uppercase tracking-wider font-semibold">
                          Column Mapping ({ws.columns.length} columns)
                        </div>
                        <button
                          onClick={() => toggleSample(ws.name)}
                          className="text-2xs text-teal hover:underline"
                        >
                          {showSample ? "Hide sample data" : "Show sample data"}
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-2xs border-collapse">
                          <thead>
                            <tr className="bg-bg-surface border-b border-bg-border">
                              <th className="text-left py-2 px-2 text-text-muted font-semibold w-6">#</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold min-w-[140px]">HEADER (original)</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold min-w-[220px]">CANONICAL FIELD → TABLE</th>
                              <th className="text-left py-2 px-2 text-text-muted font-semibold min-w-[200px]">EVIDENCE LABEL</th>
                              {showSample && ws.sampleRows.map((_, ri) => (
                                <th key={ri} className="text-left py-2 px-2 text-text-muted font-semibold min-w-[90px]">
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
                              return (
                                <tr
                                  key={col.index}
                                  className={`border-b border-bg-border ${
                                    colMap.skip ? "opacity-40" : "hover:bg-bg-surface"
                                  }`}
                                >
                                  <td className="py-1.5 px-2 text-text-muted">{col.index + 1}</td>
                                  <td className="py-1.5 px-2">
                                    <div className="font-medium text-text-primary">{col.header}</div>
                                    {col.suggestedCanonicalField && !colMap.skip && (
                                      <div className="text-teal mt-0.5">↳ auto: {col.suggestedCanonicalField}</div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <select
                                      value={colMap.canonicalField}
                                      onChange={(e) =>
                                        updateColumn(ws.name, colIdx, { canonicalField: e.target.value })
                                      }
                                      disabled={colMap.skip}
                                      className="diq-select w-full text-2xs"
                                    >
                                      {DRAFT_PLAYER_FIELDS.map((f) => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <select
                                      value={colMap.evidenceLabel}
                                      onChange={(e) =>
                                        updateColumn(ws.name, colIdx, { evidenceLabel: e.target.value })
                                      }
                                      disabled={colMap.skip}
                                      className="diq-select w-full text-2xs"
                                    >
                                      {EVIDENCE_LABELS.map((l) => (
                                        <option key={l} value={l}>{l}</option>
                                      ))}
                                    </select>
                                  </td>
                                  {showSample && col.sampleValues.map((v, vi) => (
                                    <td key={vi} className="py-1.5 px-2 text-text-secondary font-mono whitespace-nowrap max-w-[120px] truncate">
                                      {formatVal(v)}
                                    </td>
                                  ))}
                                  <td className="py-1.5 px-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={colMap.skip}
                                      onChange={(e) =>
                                        updateColumn(ws.name, colIdx, { skip: e.target.checked })
                                      }
                                      className="accent-teal"
                                    />
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

      {/* Save controls */}
      <div className="diq-card p-5 border border-teal/30">
        <div className="diq-label mb-3 text-teal">SAVE WORKSHEET MAPPING</div>
        <p className="text-text-secondary text-xs mb-4 leading-relaxed">
          Saving the mapping records your classification decisions. <strong className="text-text-primary">No production
          records are committed.</strong> A separate commit step (Stage 5) requires explicit OSM Admin approval
          and will be implemented once you have reviewed and approved this mapping.
        </p>

        {saveResult && (
          <div className={`mb-4 p-3 rounded text-xs border ${
            saveResult.ok
              ? "bg-text-green/10 border-text-green/30 text-text-green"
              : "bg-text-red/10 border-text-red/30 text-text-red"
          }`}>
            {saveResult.ok
              ? "✓ Mapping saved successfully. Status updated to MAPPED. No production records committed."
              : `Error: ${saveResult.msg}`}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="diq-btn-primary text-xs"
          >
            {saving ? "Saving…" : "SAVE MAPPING"}
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
          This file version is preserved immutably. Re-importing an updated file creates a new version record
          without altering the provenance of any reports generated from this version.
        </div>
      </div>
    </div>
  );
}
