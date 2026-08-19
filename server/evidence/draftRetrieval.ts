/**
 * Draft Evidence Retrieval Module
 *
 * Retrieves and assembles production research evidence for a draft-type report.
 * All queries exclude fixture data (is_fixture = FALSE).
 * No model/AI knowledge is used. All claims trace to retrieved database records.
 *
 * Evidence class hierarchy (same as clubRetrieval):
 *   L1  verified_public
 *   L2  calculated  (derived_metrics — not yet used here)
 *   L3  osm_proprietary (osm_research_findings — not yet used here)
 *   L4  diamondiq_inference  (not used — retrieval only per Phase 1 design)
 *   Ext external_source_content (osm_article_transcription_lines)
 *
 * Scope note: This module retrieves drafted players, documented free-agent signings,
 * and the 2026 undrafted comparison population. Outcomes are source-driven:
 * - Drafted
 * - Undrafted / signed as free agent
 * - Undrafted / continued amateur pathway
 * - Undrafted / no professional signing found
 *
 * "No professional signing found" means no professional signing appears in
 * the currently ingested production source data. It does not assert that the
 * player did not sign elsewhere.
 */

import { query } from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftReportParams {
  /**
   * Athlete position string (e.g. "RHP", "OF", "SS").
   * Used as a ILIKE filter against draft_players.position.
   * Absent → no position filter (all positions returned).
   */
  position?: string;

  /**
   * Player eligibility class (e.g. "HS", "College", "JUCO").
   * Maps to draft_players.player_class.
   * The "level" field from the legacy params is treated identically.
   */
  player_class?: string;
  level?: string; // synonym for player_class from legacy researchParams

  /**
   * Draft year scope. Supported formats:
   *   "2025"         → [2025]
   *   "2025, 2026"   → [2025, 2026]
   *   "2024-2026"    → [2024, 2025, 2026]
   *   "2020 - 2026"  → [2020 … 2026]
   * Absent → all available draft years.
   */
  draftYears?: string;

  /** School type filter (e.g. "HS", "College"). Applied against school_type column. */
  school_type?: string;
  /** School-name filter. Applied against draft_players.school when supplied. */
  school?: string;
  /** Exact MLB rank or inclusive rank range, e.g. "25" or "1-100". */
  mlbRank?: string;

  // Other legacy fields passed through buildVariablesSummary — captured but not filtered on.
  conference?: string;
  rankingRange?: string;
  heightRange?: string;
  weightRange?: string;
  [key: string]: unknown;
}

interface ReportSection {
  id: string;
  title: string;
  content: string | Record<string, unknown>;
  evidenceLabel: string;
}

interface ReportSource {
  label: string;
  title: string;
  notes?: string;
}

export interface DraftReportContent {
  sections: ReportSection[];
  methodology: string;
  sources: ReportSource[];
  _evidenceSummary: {
    tablesQueried: string[];
    recordsByTable: Record<string, number>;
    fixtureRecordsUsed: number;
    modelKnowledgeUsed: boolean;
    newInferencesGenerated: boolean;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt$(n: number | string | null | undefined): string {
  if (n == null) return "Unavailable";
  return "$" + Math.round(Number(n)).toLocaleString("en-US");
}

function fmtM(n: number | null | undefined): string {
  if (n == null) return "Unavailable";
  return "$" + (Number(n) / 1_000_000).toFixed(2) + "M";
}

/**
 * Parse a draftYears string into an array of integer years.
 * Handles: "2025", "2025, 2026", "2024-2026", "2020 - 2026".
 * Returns [] if input is absent or unparseable (treated as no filter).
 */
function parseDraftYears(raw: string | undefined): number[] {
  if (!raw || !raw.trim()) return [];
  const s = raw.trim();

  // Range: "2024-2026" or "2020 - 2026"
  const rangeMatch = s.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    if (to < from) return [];
    const years: number[] = [];
    for (let y = from; y <= to; y++) years.push(y);
    return years;
  }

  // Comma-separated or single: "2025" or "2025, 2026"
  const parts = s.split(/[\s,]+/).filter(Boolean);
  const years = parts.map((p) => parseInt(p, 10)).filter((y) => !isNaN(y) && y > 1900 && y < 2100);
  return years;
}

/**
 * Parse a source-rank filter. It accepts a single rank ("25") or inclusive
 * numeric range ("1-100"). Invalid values deliberately do not create a filter.
 */
function parseRankFilter(raw: string | undefined): { min: number; max: number } | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/#/g, "").trim();
  const range = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min > 0 && max >= min ? { min, max } : null;
  }
  const exact = cleaned.match(/^\d+$/);
  if (!exact) return null;
  const value = Number(cleaned);
  return value > 0 ? { min: value, max: value } : null;
}

type RetrievalOutcome =
  | "Drafted"
  | "Undrafted / signed as free agent"
  | "Undrafted / continued amateur pathway"
  | "Undrafted / no professional signing found";

/**
 * A documented professional-signing signal must be present before classifying
 * an undrafted athlete as a free-agent signing. The source row may establish
 * that through a linked NDFA record, or through direct signing fields already
 * stored on the production record.
 */
function hasDocumentedProfessionalSigning(row: {
  outcome_group: string | null;
  ndfa_match_status: string | null;
  signed: boolean | null;
  signing_date: string | null;
  bonus_reported: string | null;
  mlb_org: string | null;
}): boolean {
  const exactNormalizedLink = row.ndfa_match_status === "Exact normalized name match"
    || row.ndfa_match_status === "Exact normalized player-name match";
  return row.outcome_group === "Undrafted / NDFA"
    || exactNormalizedLink
    || row.signed === true
    || row.signing_date != null
    || row.bonus_reported != null
    || row.mlb_org != null;
}

/**
 * Returns true only when the stored player class explicitly supports an
 * available amateur-school pathway. It is intentionally conservative:
 * seniors, graduates, fifth-years, unspecified, and missing classes remain
 * unresolved rather than being described as returning to school.
 */
function hasStoredAmateurEligibility(row: {
  player_class: string | null;
  school_type: string | null;
}): boolean {
  const playerClass = row.player_class?.trim().toUpperCase() || "";
  if (!playerClass) return false;
  if (row.school_type === "HS" || playerClass.startsWith("HS ")) return true;
  return ["4YR SO", "4YR JR", "JC J1", "JC J2", "JC J3"].includes(playerClass);
}

/**
 * Preserve source rows while giving reports a precise, human-readable pathway.
 *
 * Job #8's verified exact normalized-name matches live on the undrafted
 * population row itself; those records remain source outcome_group='Undrafted'
 * but carry a documented professional-signing signal. They are therefore
 * presented as signed free agents without inserting or merging any record.
 */
function retrievalOutcomeFor(row: {
  outcome_group: string | null;
  ndfa_match_status: string | null;
  signed: boolean | null;
  signing_date: string | null;
  bonus_reported: string | null;
  mlb_org: string | null;
  player_class: string | null;
  school_type: string | null;
}): RetrievalOutcome {
  if (row.outcome_group === "Drafted") return "Drafted";
  if (hasDocumentedProfessionalSigning(row)) return "Undrafted / signed as free agent";
  if (hasStoredAmateurEligibility(row)) return "Undrafted / continued amateur pathway";
  return "Undrafted / no professional signing found";
}

/**
 * Build a human-readable summary of applied research parameters for display.
 */
function buildParamsSummary(params: DraftReportParams): string {
  const lines: string[] = [];
  const cls = params.player_class || params.level;
  if (cls) lines.push(`Player class: ${cls}`);
  if (params.position) lines.push(`Position: ${params.position}`);
  if (params.school_type) lines.push(`School type: ${params.school_type}`);
  if (params.school) lines.push(`School: ${params.school}`);
  if (params.conference) lines.push(`Conference: ${params.conference}`);
  if (params.draftYears) lines.push(`Draft years: ${params.draftYears}`);
  if (params.mlbRank || params.rankingRange) lines.push(`MLB rank: ${params.mlbRank || params.rankingRange}`);
  if (params.heightRange) lines.push(`Height range: ${params.heightRange}`);
  if (params.weightRange) lines.push(`Weight range: ${params.weightRange}`);
  return lines.length > 0 ? lines.join(" · ") : "No specific filters applied — returning all available draft records.";
}

// ---------------------------------------------------------------------------
// Core retrieval
// ---------------------------------------------------------------------------

export async function retrieveAndAssembleDraftReport(
  params: DraftReportParams,
  researchQuestion?: string
): Promise<DraftReportContent> {

  const tablesQueried: string[] = [];
  const recordsByTable: Record<string, number> = {};

  const cls = params.player_class || params.level;
  const draftYearList = parseDraftYears(params.draftYears);
  const rankFilter = parseRankFilter(params.mlbRank || params.rankingRange);
  const comparisonFiltersApplied = Boolean(
    params.position ||
    cls ||
    params.school_type ||
    params.school ||
    draftYearList.length ||
    rankFilter
  );

  // ── Build dynamic WHERE conditions ────────────────────────────────────────
  const conditions: string[] = ["dp.is_fixture = FALSE"];
  if (comparisonFiltersApplied) {
    // Do not flood an unscoped report with the full undrafted population.
    // Factual filters are required before comparison-population rows enter it.
    conditions.push("dp.outcome_group IN ('Drafted', 'Undrafted / NDFA', 'Undrafted')");
  } else {
    conditions.push("dp.outcome_group IN ('Drafted', 'Undrafted / NDFA')");
  }
  const sqlParams: unknown[] = [];

  function addCondition(sql: string, value: unknown) {
    sqlParams.push(value);
    conditions.push(sql.replace("$?", `$${sqlParams.length}`));
  }

  /**
   * Map user-facing position shorthands to the DB-stored codes.
   * Workbook codes: RHS (RH Starter), RHR (RH Reliever), LHS (LH Starter),
   * LHR (LH Reliever), TWP (Two-way). Fielding codes stored as-is: OF, SS, C, etc.
   */
  function addPositionCondition(pos: string) {
    const upper = pos.trim().toUpperCase();
    if (upper === "RHP") { conditions.push(`dp.position IN ('RHS', 'RHR')`); return; }
    if (upper === "LHP") { conditions.push(`dp.position IN ('LHS', 'LHR')`); return; }
    if (upper === "SP")  { conditions.push(`dp.position IN ('RHS', 'LHS')`); return; }
    if (upper === "RP")  { conditions.push(`dp.position IN ('RHR', 'LHR')`); return; }
    if (upper === "P")   { conditions.push(`dp.position IN ('P', 'RHS', 'LHS', 'RHR', 'LHR', 'TWP')`); return; }
    if (upper === "OF")  { conditions.push(`dp.position IN ('OF', 'CF', 'LF', 'RF')`); return; }
    // Exact DB code or partial — use ILIKE
    addCondition("dp.position ILIKE $?", `%${pos}%`);
  }

  // Position filter — normalises common shorthands before hitting the DB
  if (params.position) {
    addPositionCondition(params.position);
  }

  // Player class filter (player_class or level — same column)
  if (cls) {
    addCondition("dp.player_class ILIKE $?", `%${cls}%`);
  }

  // School type filter
  if (params.school_type) {
    addCondition("dp.school_type ILIKE $?", `%${params.school_type}%`);
  }

  // School-name filter
  if (params.school) {
    addCondition("dp.school ILIKE $?", `%${params.school}%`);
  }

  // Draft years filter
  if (draftYearList.length > 0) {
    // Build parameterized IN list
    const placeholders = draftYearList.map(() => {
      sqlParams.push(null); // placeholder, replaced below
      return `$${sqlParams.length}`;
    });
    // Replace the null placeholders with actual values
    const startIdx = sqlParams.length - draftYearList.length;
    for (let i = 0; i < draftYearList.length; i++) {
      sqlParams[startIdx + i] = draftYearList[i];
    }
    conditions.push(`dp.draft_year IN (${placeholders.join(", ")})`);
  }

  // Rank filter only includes records where the source provides an MLB rank.
  if (rankFilter) {
    sqlParams.push(rankFilter.min, rankFilter.max);
    conditions.push(`dp.mlb_rank BETWEEN $${sqlParams.length - 1} AND $${sqlParams.length}`);
  }

  const whereClause = conditions.join(" AND ");

  // ── Query: draft_players + slot_values (LEFT JOIN) ─────────────────────────
  tablesQueried.push("draft_players", "slot_values");

  const draftPlayerRows = await query<{
    // Identity
    id: number;
    // Draft position
    draft_year: number;
    draft_round: number | null;
    draft_round_label: string | null;
    draft_pick_overall: number | null;
    // Player info
    player_name: string;
    position: string | null;
    school: string | null;
    school_type: string | null;
    player_class: string | null;
    // Org
    mlb_org: string | null;
    // Rankings / outcomes
    mlb_rank: number | null;
    mlbam_player_id: number | null;
    outcome_group: string | null;
    ndfa_match_status: string | null;
    // Bonus / signing
    bonus_reported: string | null;
    signed: boolean | null;
    signing_date: string | null;
    // Slot value (from slot_values join)
    slot_value_usd: string | null;
    sv_ingestion_job_id: number | null;
    sv_source_file_version_id: number | null;
    sv_source_worksheet: string | null;
    // Provenance
    evidence_class: string;
    ingestion_job_id: number;
    source_worksheet: string | null;
    source_row: number | null;
    source_file_version_id: number | null;
  }>(
    `SELECT dp.id,
            dp.draft_year, dp.draft_round, dp.draft_round_label, dp.draft_pick_overall,
            dp.player_name, dp.position, dp.school, dp.school_type, dp.player_class,
            dp.mlb_org,
            dp.mlb_rank, dp.mlbam_player_id,
            dp.outcome_group, dp.ndfa_match_status,
            dp.bonus_reported, dp.signed, dp.signing_date,
            sv.slot_value_usd,
            sv.ingestion_job_id   AS sv_ingestion_job_id,
            sv.source_file_version_id AS sv_source_file_version_id,
            sv.source_worksheet   AS sv_source_worksheet,
            dp.evidence_class, dp.ingestion_job_id,
            dp.source_worksheet, dp.source_row, dp.source_file_version_id
     FROM draft_players dp
     LEFT JOIN slot_values sv
       ON sv.draft_year = dp.draft_year
       AND sv.pick_overall = dp.draft_pick_overall
       AND sv.is_fixture = FALSE
     WHERE ${whereClause}
     ORDER BY dp.draft_year DESC, dp.draft_round ASC NULLS LAST, dp.draft_pick_overall ASC NULLS LAST`,
    sqlParams
  );

  recordsByTable["draft_players"] = draftPlayerRows.length;
  const slotHits = draftPlayerRows.filter((r) => r.slot_value_usd != null).length;
  recordsByTable["slot_values"] = slotHits;

  // ── Source file versions (for citation labels) ─────────────────────────────
  tablesQueried.push("source_file_versions");
  const sfvRows = await query<{ id: number; original_filename: string }>(
    `SELECT id, original_filename FROM source_file_versions`
  );
  recordsByTable["source_file_versions"] = sfvRows.length;
  const sfvMap: Record<number, string> = {};
  for (const r of sfvRows) sfvMap[r.id] = r.original_filename;

  // =========================================================================
  // ASSEMBLY — build report sections from retrieved evidence
  // =========================================================================

  const sections: ReportSection[] = [];
  const sources: ReportSource[] = [];
  const dataGaps: string[] = [];
  const sourceKeys = new Set<string>();

  function addSource(label: string, title: string, notes?: string) {
    const key = `${label}||${title}`;
    if (sourceKeys.has(key)) return;
    sourceKeys.add(key);
    sources.push({ label, title, notes });
  }

  // ── Section 0: Research Question (if provided) ────────────────────────────
  if (researchQuestion) {
    sections.push({
      id: "research_question",
      title: "Research Question",
      content: researchQuestion,
      evidenceLabel: "OSM-Provided Research Directive",
    });
  }

  // ── Section 1: Applied Research Parameters ────────────────────────────────
  sections.push({
    id: "applied_variables",
    title: "Applied Research Variables",
    content: {
      type: "applied_variables",
      data: {
        parameterSummary: buildParamsSummary(params),
        note: "Records retrieved from production database using the parameters above. No model baseball knowledge was used.",
        totalRecordsRetrieved: draftPlayerRows.length,
        draftYearsInResults: [...new Set(draftPlayerRows.map((r) => r.draft_year))].sort((a, b) => b - a),
      },
    },
    evidenceLabel: "OSM-Provided Athlete Information",
  });

  // ── Section 2: Historical Draft & Undrafted Comparison Records ───────────
  if (draftPlayerRows.length > 0) {
    const outcomeGroups: Array<{
      outcome: RetrievalOutcome;
      label: string;
      count: number;
      rows: Array<{
        player: string;
        round: string | null;
        pick: number | null;
        org: string | null;
        position: string | null;
        school: string | null;
        player_class: string | null;
        outcome_group: string | null;
        source_outcome_group: string | null;
        ndfa_status: string | null;
        professional_signing_documented: boolean;
        amateur_pathway_supported_by_source: boolean;
        mlb_rank: number | null;
        slot_value: string | null;
        signing_bonus: string | null;
        signing_date: string | null;
        source: string;
        provenance: {
          ingestion_job_id: number;
          source_filename: string;
          source_worksheet: string | null;
          source_row: number | null;
          source_file_version_id: number | null;
        };
      }>;
    }> = [];

    // Track which ingestion jobs contributed
    const jobsSeen = new Set<number>();
    const slotJobsSeen = new Set<number>();

    const outcomeOrder: RetrievalOutcome[] = [
      "Drafted",
      "Undrafted / signed as free agent",
      "Undrafted / continued amateur pathway",
      "Undrafted / no professional signing found",
    ];
    const outcomeLabels: Record<RetrievalOutcome, string> = {
      Drafted: "Drafted",
      "Undrafted / signed as free agent": "Undrafted / signed as free agent",
      "Undrafted / continued amateur pathway": "Undrafted / continued amateur pathway",
      "Undrafted / no professional signing found": "Undrafted / no professional signing found",
    };

    for (const outcome of outcomeOrder) {
      const players = draftPlayerRows.filter((p) => retrievalOutcomeFor(p) === outcome);
      const rows = players.map((p) => {
        const reportOutcome = retrievalOutcomeFor(p);
        // Round label
        const round = p.draft_round_label
          ? `Rd. ${p.draft_round_label}`
          : p.draft_round != null
          ? `Rd. ${p.draft_round}`
          : reportOutcome === "Undrafted / signed as free agent"
          ? "NDFA"
          : null;

        // Slot value (from joined slot_values row — NULL if no match)
        const slot_value = p.slot_value_usd != null ? fmt$(p.slot_value_usd) : null;

        // Signing bonus (source-provided only — no inference)
        const signing_bonus = p.bonus_reported != null ? fmt$(p.bonus_reported) : null;

        // Provenance label for this record
        const sfvLabel = p.source_file_version_id ? (sfvMap[p.source_file_version_id] || `SFV #${p.source_file_version_id}`) : "Unknown source";
        const source = `Job #${p.ingestion_job_id} · ${sfvLabel}${p.source_worksheet ? ` · Sheet: ${p.source_worksheet}` : ""}${p.source_row ? ` · Row ${p.source_row}` : ""}`;

        // Track ingestion jobs for top-level source list
        jobsSeen.add(p.ingestion_job_id);
        if (p.sv_ingestion_job_id != null) slotJobsSeen.add(p.sv_ingestion_job_id);

        return {
          player: p.player_name,
          round,
          pick: p.draft_pick_overall ?? null,
          org: p.mlb_org ?? null,
          position: p.position ?? null,
          school: p.school ?? null,
          player_class: p.player_class ?? null,
          outcome_group: reportOutcome,
          source_outcome_group: p.outcome_group ?? null,
          ndfa_status: p.ndfa_match_status ?? null,
          professional_signing_documented: hasDocumentedProfessionalSigning(p),
          amateur_pathway_supported_by_source: !hasDocumentedProfessionalSigning(p) && hasStoredAmateurEligibility(p),
          mlb_rank: p.mlb_rank ?? null,
          slot_value,
          signing_bonus,
          signing_date: p.signing_date ?? null,
          source,
          provenance: {
            ingestion_job_id: p.ingestion_job_id,
            source_filename: sfvLabel,
            source_worksheet: p.source_worksheet ?? null,
            source_row: p.source_row ?? null,
            source_file_version_id: p.source_file_version_id ?? null,
          },
        };
      });

      outcomeGroups.push({
        outcome,
        label: outcomeLabels[outcome],
        count: rows.length,
        rows,
      });
    }

    const missingFieldsByOutcome = Object.fromEntries(
      outcomeOrder.map((outcome) => {
        const rows = draftPlayerRows.filter((r) => retrievalOutcomeFor(r) === outcome);
        return [outcome, {
          school: rows.filter((r) => !r.school || !r.school.trim()).length,
          player_class: rows.filter((r) => !r.player_class || !r.player_class.trim()).length,
          position: rows.filter((r) => !r.position || !r.position.trim()).length,
          mlb_rank: rows.filter((r) => r.mlb_rank == null).length,
        }];
      })
    );
    const exactNormalizedNdfaLinks = draftPlayerRows.filter(
      (r) => r.outcome_group === "Undrafted" &&
        r.ndfa_match_status === "Exact normalized player-name match"
    ).length;
    const separateNdfaRows = draftPlayerRows.filter(
      (r) => r.outcome_group === "Undrafted / NDFA"
    );

    sections.push({
      id: "historical_draft_and_undrafted_records",
      title: "Historical Draft & Undrafted Comparison Records",
      content: {
        type: "draft_player_records",
        data: {
          note: `${draftPlayerRows.length} player record${draftPlayerRows.length !== 1 ? "s" : ""} retrieved from production database. Outcomes remain source-driven; "no professional signing found" means no professional signing is documented in currently available production sources, not that a player definitively did not sign.`,
          outcomeGroups,
          outcomeDefinitions: {
            Drafted: "Player was selected in the MLB Draft.",
            "Undrafted / signed as free agent": "Player was not drafted and has a documented professional free-agent signing in the production record, either on a separate source row or through an existing verified NDFA linkage.",
            "Undrafted / continued amateur pathway": "Player was not drafted, has no documented professional signing, and the stored player class explicitly supports a remaining amateur-school pathway. This describes pathway availability from stored eligibility data; it does not assert an enrollment decision.",
            "Undrafted / no professional signing found": "Player appears in the 2026 undrafted source population with no documented professional signing, but the stored eligibility/class data does not safely establish a continuing amateur pathway.",
          },
          ndfaLinkage: {
            exactNormalizedNdfaLinks,
            separateNdfaSigningRows: separateNdfaRows.length,
            separateNdfaNoExactMatchRows: separateNdfaRows.filter((r) => r.ndfa_match_status === "No exact-name match — not linked").length,
            separateNdfaAmbiguousMatchRows: separateNdfaRows.filter((r) => r.ndfa_match_status === "Ambiguous exact-name match — not linked").length,
            rule: "A player is shown as signed only when the production row contains a documented signing signal: source outcome_group='Undrafted / NDFA', existing exact normalized-name linkage, signed=true, signing date, reported bonus, or linked MLB organization. Ambiguous and no-exact-match NDFA rows stay separate; no new matching or merging is performed during retrieval.",
          },
          fieldCoverage: {
            totalRecords: draftPlayerRows.length,
            withSigningBonus: draftPlayerRows.filter((r) => r.bonus_reported != null).length,
            withSlotValue: slotHits,
            withMlbRank: draftPlayerRows.filter((r) => r.mlb_rank != null).length,
            missingFieldsByOutcome,
          },
        },
      },
      evidenceLabel: "Verified Public Information",
    });

    // Add sources for each contributing ingestion job
    for (const p of draftPlayerRows) {
      if (!jobsSeen.has(p.ingestion_job_id)) continue; // already tracked in the map loop above
      const sfvLabel = p.source_file_version_id ? (sfvMap[p.source_file_version_id] || `SFV #${p.source_file_version_id}`) : "Unknown source";
      addSource(
        "Verified Public Information",
        sfvLabel,
        `Ingestion Job #${p.ingestion_job_id} · Sheet: ${p.source_worksheet || "Unknown"}`
      );
      jobsSeen.delete(p.ingestion_job_id); // only add once per job
    }

    // Add slot_values source if any slot values were found
    if (slotHits > 0) {
      for (const p of draftPlayerRows.filter((r) => r.sv_ingestion_job_id != null)) {
        if (!slotJobsSeen.has(p.sv_ingestion_job_id!)) continue;
        const sfvLabel = p.sv_source_file_version_id ? (sfvMap[p.sv_source_file_version_id] || `SFV #${p.sv_source_file_version_id}`) : "MLB Slot Values";
        addSource(
          "Verified Public Information",
          `${sfvLabel} (slot values)`,
          `Ingestion Job #${p.sv_ingestion_job_id} · Sheet: ${p.sv_source_worksheet || "Slot Values"}`
        );
        slotJobsSeen.delete(p.sv_ingestion_job_id!); // only add once per slot job
      }
    }

    // ── Section 3: Bonus Summary (aggregate — computed from retrieved rows) ────
    const draftedWithBonus = draftPlayerRows.filter(
      (r) => r.outcome_group === "Drafted" && r.bonus_reported != null
    );

    if (draftedWithBonus.length >= 2) {
      const bonuses = draftedWithBonus.map((r) => Number(r.bonus_reported)).sort((a, b) => a - b);
      const min = bonuses[0];
      const max = bonuses[bonuses.length - 1];
      const sorted = [...bonuses].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

      sections.push({
        id: "bonus_summary",
        title: "Signing Bonus Range (Retrieved Records)",
        content: {
          type: "bonus_range",
          data: {
            note: `Calculated from ${draftedWithBonus.length} drafted player record${draftedWithBonus.length !== 1 ? "s" : ""} with reported signing bonuses. Source-provided values only — no estimates.`,
            disclaimer: "Historical base rates from this filtered dataset only. Not an athlete-specific projection.",
            comparableCount: draftPlayerRows.filter((r) => r.outcome_group === "Drafted").length,
            reportedBonusCount: draftedWithBonus.length,
            range: `${fmt$(min)} – ${fmt$(max)}`,
            median: fmt$(median),
          },
        },
        evidenceLabel: "Calculated Results (from Verified Public Information)",
      });
    } else if (draftedWithBonus.length === 1) {
      sections.push({
        id: "bonus_summary",
        title: "Signing Bonus (Retrieved Records)",
        content: {
          type: "bonus_range",
          data: {
            note: `Only 1 drafted player record with a reported signing bonus — range cannot be computed. Value: ${fmt$(draftedWithBonus[0].bonus_reported)}.`,
            disclaimer: "Single observation — not a range or statistical estimate.",
            comparableCount: draftPlayerRows.filter((r) => r.outcome_group === "Drafted").length,
            reportedBonusCount: 1,
          },
        },
        evidenceLabel: "Verified Public Information",
      });
    } else {
      dataGaps.push("Signing bonus range: no drafted player records with reported bonus values in this filtered set.");
    }

  } else {
    // No records returned
    dataGaps.push(
      params.position || params.player_class || params.level || params.draftYears || params.school || params.school_type
        ? `No player-level draft or undrafted records found matching the applied filters (${buildParamsSummary(params)}).`
        : "No player-level draft records found in the production database for this query."
    );
  }

  // ── Section: Data Gaps ────────────────────────────────────────────────────
  if (dataGaps.length > 0) {
    sections.push({
      id: "data_gaps",
      title: "Data Gaps",
      content: {
        type: "data_gaps",
        data: {
          gaps: dataGaps,
          note: "Missing data reflects the current state of the DiamondIQ production database. OSM Admin has been notified of any active intelligence requests.",
        },
      },
      evidenceLabel: "DiamondIQ Data Gap Registry",
    });
  }

  // =========================================================================
  // METHODOLOGY NOTE
  // =========================================================================

  const filterDesc = buildParamsSummary(params);
  const methodology = [
    `Draft report generated from DiamondIQ production database.`,
    `Applied filters: ${filterDesc}`,
    `Data sources: draft_players (${recordsByTable["draft_players"] ?? 0} records), slot_values (${recordsByTable["slot_values"] ?? 0} matched).`,
    `All records verified via is_fixture = FALSE guard.`,
    comparisonFiltersApplied
      ? `Scope: drafted players, documented free-agent signings, and matching undrafted population records separated by stored signing and eligibility facts.`
      : `Scope: drafted players and documented free-agent signings only; undrafted comparison rows require at least one factual filter to avoid flooding an unscoped report.`,
    `No model/AI baseball knowledge was used. No new inferences were generated.`,
    `Evidence class: verified_public (Layer 1). Bonus range is a calculated aggregate of source-provided values.`,
  ].join(" ");

  return {
    sections,
    methodology,
    sources,
    _evidenceSummary: {
      tablesQueried,
      recordsByTable,
      fixtureRecordsUsed: 0,
      modelKnowledgeUsed: false,
      newInferencesGenerated: false,
    },
  };
}
