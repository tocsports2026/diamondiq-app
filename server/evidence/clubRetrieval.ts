/**
 * Club Evidence Retrieval Module
 *
 * Retrieves and assembles production research evidence for a club-type report.
 * All queries exclude fixture data (is_fixture = FALSE).
 * No model/AI knowledge is used. All claims trace to retrieved database records.
 *
 * Evidence class hierarchy:
 *   L1  verified_public
 *   L2  calculated  (+ osm_proprietary for tier classifications)
 *   L3  osm_proprietary (osm_research_findings)
 *   L4  diamondiq_inference
 *   Ext external_source_content (osm_article_transcription_lines)
 */

import { query } from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClubReportParams {
  club: string;          // e.g. "Baltimore Orioles"
  draftYears?: string;   // e.g. "2015 - 2026" (informational only for now)
  pickRange?: string;    // e.g. "20 - 60"  (informational only for now)
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

export interface ClubReportContent {
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

function fmt$(n: number | null | undefined): string {
  if (n == null) return "Unavailable";
  return "$" + Math.round(Number(n)).toLocaleString("en-US");
}

function fmtM(n: number | null | undefined): string {
  if (n == null) return "Unavailable";
  return "$" + (Number(n) / 1_000_000).toFixed(2) + "M";
}

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "Unavailable";
  return (Number(n) * 100).toFixed(decimals) + "%";
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "Unavailable";
  return Number(n).toLocaleString("en-US");
}

/**
 * Derive keyword variants for article text-search from a full MLB org name.
 * Returns terms to use in ILIKE searches (not regex, just substrings).
 */
function clubSearchTerms(club: string): string[] {
  const terms: string[] = [club]; // always include full name
  const parts = club.trim().split(/\s+/);
  if (parts.length >= 2) {
    // city (first word) and team nickname (last word)
    terms.push(parts[0]);         // e.g. "Baltimore"
    terms.push(parts[parts.length - 1]); // e.g. "Orioles"
  }
  return [...new Set(terms)];
}

// ---------------------------------------------------------------------------
// Core retrieval
// ---------------------------------------------------------------------------

export async function retrieveAndAssembleClubReport(
  params: ClubReportParams
): Promise<ClubReportContent> {
  const { club } = params;
  const tablesQueried: string[] = [];
  const recordsByTable: Record<string, number> = {};

  // ── L1: Payroll history ──────────────────────────────────────────────────
  tablesQueried.push("club_payroll_history");
  const payrollRows = await query<{
    season: number;
    total_payroll: string;
    cbt_overage: string;
    luxury_tax_paid: string;
    payroll_rank: number;
    payroll_data_type: string;
    source_provider: string;
    evidence_class: string;
    source_file_version_id: number;
    ingestion_job_id: number;
    source_worksheet: string;
    source_row: number;
    id: number;
  }>(
    `SELECT id, season, total_payroll, cbt_overage, luxury_tax_paid,
            payroll_rank, payroll_data_type, source_provider, evidence_class,
            source_file_version_id, ingestion_job_id, source_worksheet, source_row
     FROM club_payroll_history
     WHERE mlb_org = $1 AND is_fixture = FALSE
     ORDER BY season`,
    [club]
  );
  recordsByTable["club_payroll_history"] = payrollRows.length;

  // ── L1: Draft spend history ───────────────────────────────────────────────
  tablesQueried.push("club_draft_spend_history");
  const draftSpendRows = await query<{
    id: number;
    draft_year: number;
    total_draft_spend: string;
    pool_allotment: string;
    over_under_pool: string;
    penalty_incurred: boolean;
    picks_forfeited: boolean;
    first_round_pick: number;
    evidence_class: string;
    source_file_version_id: number;
    ingestion_job_id: number;
    source_worksheet: string;
    source_row: number;
  }>(
    `SELECT id, draft_year, total_draft_spend, pool_allotment, over_under_pool,
            penalty_incurred, picks_forfeited, first_round_pick, evidence_class,
            source_file_version_id, ingestion_job_id, source_worksheet, source_row
     FROM club_draft_spend_history
     WHERE mlb_org = $1 AND is_fixture = FALSE
     ORDER BY draft_year`,
    [club]
  );
  recordsByTable["club_draft_spend_history"] = draftSpendRows.length;

  // ── L1: League facts (CBT thresholds + league draft spend) ───────────────
  tablesQueried.push("league_facts");
  const leagueFactRows = await query<{
    fact_type: string;
    season: number;
    numeric_value: string;
    evidence_class: string;
    ingestion_job_id: number;
  }>(
    `SELECT fact_type, season, numeric_value, evidence_class, ingestion_job_id
     FROM league_facts
     WHERE is_fixture = FALSE
     ORDER BY fact_type, season`
  );
  recordsByTable["league_facts"] = leagueFactRows.length;

  // Build lookup maps for league facts
  const cbtThresholds: Record<number, number> = {};
  const leagueDraftSpend: Record<number, number> = {};
  for (const r of leagueFactRows) {
    if (r.fact_type === "cbt_threshold") cbtThresholds[r.season] = Number(r.numeric_value);
    if (r.fact_type === "league_draft_actual_spend") leagueDraftSpend[r.draft_year ?? r.season] = Number(r.numeric_value);
  }

  // ── L2: Derived metrics ───────────────────────────────────────────────────
  tablesQueried.push("derived_metrics");
  const derivedRows = await query<{
    metric_name: string;
    numeric_value: string;
    text_value: string;
    period_label: string;
    evidence_class: string;
    ingestion_job_id: number;
    source_worksheet: string;
    source_excel_row: number;
  }>(
    `SELECT metric_name, numeric_value, text_value, period_label, evidence_class,
            ingestion_job_id, source_worksheet, source_excel_row
     FROM derived_metrics
     WHERE entity_key = $1 AND is_fixture = FALSE
     ORDER BY metric_name`,
    [club]
  );
  recordsByTable["derived_metrics"] = derivedRows.length;

  const metricMap: Record<string, typeof derivedRows[0]> = {};
  for (const r of derivedRows) metricMap[r.metric_name] = r;

  // ── L3: OSM research findings ─────────────────────────────────────────────
  tablesQueried.push("osm_research_findings");
  const findingRows = await query<{
    finding_type: string;
    finding_text: string;
    structured_value: Record<string, unknown>;
    period_description: string;
    evidence_class: string;
    ingestion_job_id: number;
    source_worksheet: string;
    source_excel_row: number;
  }>(
    `SELECT finding_type, finding_text, structured_value, period_description,
            evidence_class, ingestion_job_id, source_worksheet, source_excel_row
     FROM osm_research_findings
     WHERE subject_key = $1 AND is_fixture = FALSE
     ORDER BY finding_type`,
    [club]
  );
  recordsByTable["osm_research_findings"] = findingRows.length;

  // ── L4: DiamondIQ inferences ─────────────────────────────────────────────
  tablesQueried.push("diamondiq_inferences");
  const inferenceRows = await query<{
    inference_type: string;
    inference_context: string;
    numeric_value: string;
    text_value: string;
    confidence_label: string;
    evidence_class: string;
    ingestion_job_id: number;
    source_worksheet: string;
    source_excel_row: number;
  }>(
    `SELECT inference_type, inference_context, numeric_value, text_value,
            confidence_label, evidence_class, ingestion_job_id, source_worksheet, source_excel_row
     FROM diamondiq_inferences
     WHERE subject_key = $1 AND is_fixture = FALSE
     ORDER BY inference_type`,
    [club]
  );
  recordsByTable["diamondiq_inferences"] = inferenceRows.length;

  // ── Provenance: source assertions for this club's draft spend ────────────
  tablesQueried.push("record_source_assertions");
  const rsaRows = await query<{
    canonical_record_table: string;
    canonical_record_id: number;
    source_file_version_id: number;
    ingestion_job_id: number;
    worksheet: string;
    excel_row: number;
    asserted_value: string;
    conflicts_with_canonical: boolean;
  }>(
    `SELECT rsa.canonical_record_table, rsa.canonical_record_id,
            rsa.source_file_version_id, rsa.ingestion_job_id,
            rsa.worksheet, rsa.excel_row, rsa.asserted_value,
            rsa.conflicts_with_canonical
     FROM record_source_assertions rsa
     JOIN club_draft_spend_history cdsh
       ON rsa.canonical_record_table = 'club_draft_spend_history'
      AND rsa.canonical_record_id = cdsh.id
     WHERE cdsh.mlb_org = $1
     UNION ALL
     SELECT rsa.canonical_record_table, rsa.canonical_record_id,
            rsa.source_file_version_id, rsa.ingestion_job_id,
            rsa.worksheet, rsa.excel_row, rsa.asserted_value,
            rsa.conflicts_with_canonical
     FROM record_source_assertions rsa
     JOIN club_payroll_history cph
       ON rsa.canonical_record_table = 'club_payroll_history'
      AND rsa.canonical_record_id = cph.id
     WHERE cph.mlb_org = $1`,
    [club]
  );
  recordsByTable["record_source_assertions"] = rsaRows.length;

  // ── Ext: Article corpus search ────────────────────────────────────────────
  tablesQueried.push("osm_articles");
  tablesQueried.push("osm_article_transcription_lines");

  const searchTerms = clubSearchTerms(club);
  // Build ILIKE conditions: any term must appear in line_text
  // Parameters start at $1 — no leading club parameter
  const termConditions = searchTerms
    .map((_, i) => `l.line_text ILIKE $${i + 1}`)
    .join(" OR ");
  const termParams = searchTerms.map((t) => `%${t}%`);

  const articleHits = await query<{
    line_id: number;
    pdf_page: number;
    pdf_line: number;
    line_text: string;
    evidence_class: string;
    source_number: number;
    publisher: string;
    publication_date: string;
    pdf_filename: string;
    source_worksheet: string;
    article_id: number;
  }>(
    `SELECT l.id AS line_id, l.pdf_page, l.pdf_line, l.line_text, l.evidence_class,
            a.source_number, a.publisher, a.publication_date,
            a.pdf_filename, a.source_worksheet, a.id AS article_id
     FROM osm_article_transcription_lines l
     JOIN osm_articles a ON l.article_id = a.id
     WHERE l.is_fixture = FALSE AND a.is_fixture = FALSE
       AND (${termConditions})
     ORDER BY a.source_number, l.pdf_page, l.pdf_line
     LIMIT 50`,
    termParams
  );
  recordsByTable["osm_article_transcription_lines"] = articleHits.length;
  // Count distinct articles hit
  const distinctArticleIds = new Set(articleHits.map((r) => r.article_id));
  recordsByTable["osm_articles"] = distinctArticleIds.size;

  // ── Source file versions (for citation labels) ────────────────────────────
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
  const sourceKeys = new Set<string>(); // deduplicate sources[]

  function addSource(label: string, title: string, notes?: string) {
    const key = `${label}||${title}`;
    if (sourceKeys.has(key)) return;
    sourceKeys.add(key);
    sources.push({ label, title, notes });
  }

  // ── Section A: Historical Payroll Profile ─────────────────────────────────
  if (payrollRows.length > 0) {
    const metrics: Array<{ label: string; value: string }> = [];

    for (const r of payrollRows) {
      const cbt = cbtThresholds[r.season];
      const payroll = Number(r.total_payroll);
      const overCbt = cbt ? (payroll > cbt ? `▲ $${Math.round((payroll - cbt) / 1_000_000).toLocaleString()}M over CBT` : `Below CBT (threshold ${fmtM(cbt)})`) : "";
      const label = `${r.season} Payroll${r.payroll_data_type === "preliminary" ? " (preliminary)" : ""}`;
      const value = fmtM(payroll) + (overCbt ? `  ·  ${overCbt}` : "");
      metrics.push({ label, value });
    }

    sections.push({
      id: "payroll_profile",
      title: "Historical Payroll Profile",
      content: {
        type: "payment_behavior",
        data: {
          note: `Verified payroll record — ${payrollRows.length} seasons (${payrollRows[0].season}–${payrollRows[payrollRows.length - 1].season}). CBT thresholds from official league facts.`,
          metrics,
        },
      },
      evidenceLabel: "Verified Public Information",
    });

    addSource(
      "Verified Public Information",
      `${sfvMap[payrollRows[0].source_file_version_id] || "MLB Payroll & CBT History workbook"}`,
      `Ingestion Job #${payrollRows[0].ingestion_job_id} · Sheet: ${payrollRows[0].source_worksheet} · Row ${payrollRows[0].source_row}`
    );
    addSource(
      "Verified Public Information",
      "League CBT Thresholds (league_facts)",
      `Ingestion Job #${leagueFactRows.find((r) => r.fact_type === "cbt_threshold")?.ingestion_job_id || "4"} · 6 seasons`
    );
  } else {
    dataGaps.push("Payroll history: no production records found for this club.");
  }

  // ── Section B: Historical Draft Spending / Pool Behavior ──────────────────
  if (draftSpendRows.length > 0) {
    const metrics: Array<{ label: string; value: string }> = [];

    for (const r of draftSpendRows) {
      const spend = r.total_draft_spend != null ? Number(r.total_draft_spend) : null;
      const pool = r.pool_allotment != null ? Number(r.pool_allotment) : null;
      const leagueTotalSpend = leagueDraftSpend[r.draft_year];

      let value: string;
      if (spend != null) {
        const pctOfLeague = leagueTotalSpend
          ? ` · ${((spend / leagueTotalSpend) * 100).toFixed(1)}% of league total`
          : "";
        const poolContext =
          pool != null
            ? `  ·  Pool allotment: ${fmtM(pool)}`
            : r.draft_year === 2026
            ? `  ·  Pool allotment (2026): ${pool != null ? fmtM(pool) : "Unavailable"}`
            : "";
        value = `${fmtM(spend)}${poolContext}${pctOfLeague}`;
        if (r.penalty_incurred) value += "  ·  ⚠ Penalty incurred";
        if (r.picks_forfeited) value += "  ·  Picks forfeited";
      } else if (pool != null) {
        // 2026: pool allotment known, actual spend not yet available
        value = `Actual spend: Not yet available  ·  Pool allotment: ${fmtM(pool)}${r.first_round_pick ? `  ·  Round 1 pick: #${r.first_round_pick}` : ""}`;
        dataGaps.push(`Draft year ${r.draft_year}: actual draft spend not yet committed to database.`);
      } else {
        value = "Unavailable";
        dataGaps.push(`Draft year ${r.draft_year}: no draft spend data.`);
      }

      metrics.push({ label: `${r.draft_year} Draft Spend`, value });
    }

    // Cross-source corroboration summary
    const rsaCount = rsaRows.filter(
      (r) => r.canonical_record_table === "club_draft_spend_history"
    ).length;
    const conflictCount = rsaRows.filter(
      (r) => r.canonical_record_table === "club_draft_spend_history" && r.conflicts_with_canonical
    ).length;

    sections.push({
      id: "draft_spending",
      title: "Historical Draft Spending / Pool Behavior",
      content: {
        type: "payment_behavior",
        data: {
          note: `Verified draft spend record — ${draftSpendRows.length} draft years. Cross-source corroboration: ${rsaCount} source assertion${rsaCount !== 1 ? "s" : ""} across ${new Set(rsaRows.filter((r) => r.canonical_record_table === "club_draft_spend_history").map((r) => r.ingestion_job_id)).size} ingestion jobs. Conflicts with canonical: ${conflictCount}.`,
          metrics,
        },
      },
      evidenceLabel: "Verified Public Information",
    });

    addSource(
      "Verified Public Information",
      `${sfvMap[draftSpendRows[0].source_file_version_id] || "MLB Draft Spend History workbook"}`,
      `Ingestion Job #${draftSpendRows[0].ingestion_job_id} · Sheet: ${draftSpendRows[0].source_worksheet} · Row ${draftSpendRows[0].source_row}`
    );
    // Add Job #4 corroborating source if present
    const job4Rsa = rsaRows.find(
      (r) => r.ingestion_job_id === 4 && r.canonical_record_table === "club_draft_spend_history"
    );
    if (job4Rsa) {
      addSource(
        "Verified Public Information",
        `${sfvMap[job4Rsa.source_file_version_id] || "Club Spending Draft Analysis workbook"} (corroborating)`,
        `Ingestion Job #${job4Rsa.ingestion_job_id} · Sheet: ${job4Rsa.worksheet} · Row ${job4Rsa.excel_row}`
      );
    }
  } else {
    dataGaps.push("Draft spend history: no production records found for this club.");
  }

  // ── Section C: Derived Trend Metrics ─────────────────────────────────────
  if (derivedRows.length > 0) {
    const metrics: Array<{ label: string; value: string }> = [];

    const metricLabels: Record<string, string> = {
      avg_5yr_payroll: "Avg 5-Year MLB Payroll",
      avg_pool_5yr: "Avg 5-Year Draft Pool Spend",
      cagr_payroll_5yr: "Payroll CAGR (5yr)",
      cagr_pool_5yr: "Draft Pool CAGR (5yr)",
      cbt_payroll_tier: "CBT Payroll Tier (OSM classification)",
      draft_pool_tier: "Draft Pool Tier (OSM classification)",
      pct_vs_avg_pool: "Pool Spend vs. League Average",
      pool_rank: "2025 Draft Pool Rank (1 = highest)",
      times_over_cbt: "Times CBT exceeded (5yr window)",
      times_penalty_proxy: "Times penalty-proxy triggered (5yr)",
    };

    for (const r of derivedRows) {
      const label =
        `${metricLabels[r.metric_name] || r.metric_name}` +
        (r.period_label ? ` · ${r.period_label}` : "");
      let value: string;
      if (r.text_value) {
        value = r.text_value;
      } else if (r.metric_name.includes("cagr")) {
        value = fmtPct(r.numeric_value);
      } else if (r.metric_name.includes("pct_vs")) {
        value = fmtPct(r.numeric_value);
      } else if (r.metric_name.includes("avg") && r.metric_name.includes("payroll")) {
        value = fmtM(r.numeric_value);
      } else if (r.metric_name.includes("avg_pool")) {
        value = fmtM(r.numeric_value);
      } else if (r.metric_name === "pool_rank") {
        value = `#${Math.round(Number(r.numeric_value))} of 30 MLB clubs`;
      } else {
        value = fmtNum(r.numeric_value);
      }
      metrics.push({ label, value });
    }

    sections.push({
      id: "derived_metrics",
      title: "Derived Trend Metrics",
      content: {
        type: "payment_behavior",
        data: {
          note: "Calculated from verified L1 payroll and draft spend records. OSM-classified tier assignments are proprietary research.",
          metrics,
        },
      },
      evidenceLabel: "Calculated / Derived Result",
    });

    // Source for derived metrics
    const dmSource = derivedRows[0];
    addSource(
      "Calculated / Derived Result",
      `Derived metrics — ${club}`,
      `Calculated from verified L1 records · Ingestion Job #${dmSource.ingestion_job_id} · Sheet: ${dmSource.source_worksheet}`
    );
  } else {
    dataGaps.push("Derived trend metrics: no production records found for this club.");
  }

  // ── Section D: OSM Research Findings ─────────────────────────────────────
  if (findingRows.length > 0) {
    const lines: string[] = [];

    for (const r of findingRows) {
      const typeLabel =
        r.finding_type === "pattern_read"
          ? "OSM Pattern Read"
          : r.finding_type === "correlation"
          ? "OSM Correlation Finding"
          : r.finding_type === "methodology_assumption"
          ? "OSM Methodology Assumption"
          : r.finding_type;
      const period = r.period_description ? ` [${r.period_description}]` : "";
      lines.push(`${typeLabel}${period}: ${r.finding_text}`);

      if (r.finding_type === "methodology_assumption" && r.structured_value) {
        const sv = r.structured_value as Record<string, unknown>;
        if (sv.rate_pct) lines.push(`  · Applied rate: ${sv.rate_pct} · Source: ${sv.source}`);
      }
    }

    sections.push({
      id: "osm_findings",
      title: "OSM Research Findings",
      content: lines.join("\n\n"),
      evidenceLabel: "OSM Proprietary Research",
    });

    addSource(
      "OSM Proprietary Research",
      `OSM Research Findings — ${club}`,
      `Ingestion Job #${findingRows[0].ingestion_job_id} · Sheet: ${findingRows[0].source_worksheet} · Row ${findingRows[0].source_excel_row}`
    );
  } else {
    dataGaps.push("OSM Research Findings: no proprietary research records found for this club.");
  }

  // ── Section E: DiamondIQ Inferences ──────────────────────────────────────
  if (inferenceRows.length > 0) {
    const metrics: Array<{ label: string; value: string }> = [];

    const inferenceLabels: Record<string, string> = {
      draft_spend_projection: "2026 Draft Spend Projection",
      pool_overage_projection: "2026 Projected Pool Overage",
      confidence_label: "Projection Confidence",
    };

    for (const r of inferenceRows) {
      const label =
        `${inferenceLabels[r.inference_type] || r.inference_type}` +
        (r.inference_context ? ` · ${r.inference_context}` : "");

      let value: string;
      if (r.text_value) {
        value = r.text_value;
      } else if (
        r.inference_type === "draft_spend_projection" ||
        r.inference_type === "pool_overage_projection"
      ) {
        value = fmtM(r.numeric_value);
      } else {
        value = fmtNum(r.numeric_value);
      }

      if (r.confidence_label && r.inference_type !== "confidence_label") {
        value += `  ·  Confidence: ${r.confidence_label}`;
      }

      metrics.push({ label, value });
    }

    sections.push({
      id: "diq_inferences",
      title: "DiamondIQ Inferences",
      content: {
        type: "payment_behavior",
        data: {
          note: "DiamondIQ-generated inference from verified historical data. No new inference was generated for this report. These are existing approved inference records.",
          metrics,
        },
      },
      evidenceLabel: "DiamondIQ Analysis / Inference",
    });

    addSource(
      "DiamondIQ Analysis / Inference",
      `DiamondIQ Inferences — ${club}`,
      `Ingestion Job #${inferenceRows[0].ingestion_job_id} · Sheet: ${inferenceRows[0].source_worksheet} · Row ${inferenceRows[0].source_excel_row}`
    );
  } else {
    dataGaps.push("DiamondIQ Inferences: no inference records found for this club.");
  }

  // ── Section F: Relevant External Research ────────────────────────────────
  if (articleHits.length > 0) {
    const lines: string[] = [
      `${articleHits.length} transcription line${articleHits.length !== 1 ? "s" : ""} matching "${club}" (or name variants) retrieved from ${distinctArticleIds.size} article source${distinctArticleIds.size !== 1 ? "s" : ""}.\n`,
    ];

    // Group by article for readability
    const byArticle: Record<number, typeof articleHits> = {};
    for (const hit of articleHits) {
      if (!byArticle[hit.article_id]) byArticle[hit.article_id] = [];
      byArticle[hit.article_id].push(hit);
    }

    for (const [, hits] of Object.entries(byArticle)) {
      const first = hits[0];
      const pubDateStr = first.publication_date
        ? (typeof first.publication_date === "string"
            ? first.publication_date
            : (first.publication_date as unknown as Date).toISOString().slice(0, 10))
        : null;
      const pubInfo = [
        first.publisher || "(publisher unknown)",
        pubDateStr || "(date unknown)",
        first.pdf_filename,
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(`[Source #${first.source_number} — ${pubInfo}]`);
      for (const h of hits) {
        lines.push(`  p.${h.pdf_page} ln.${h.pdf_line}: ${h.line_text.trim()}`);
      }
      lines.push("");

      // publication_date from pg may be a Date object — normalize to ISO string
      const pubDate = first.publication_date
        ? (typeof first.publication_date === "string"
            ? first.publication_date
            : (first.publication_date as unknown as Date).toISOString().slice(0, 10))
        : "date unknown";
      addSource(
        "External Source Content",
        `${first.publisher || "(publisher unknown)"}: ${first.pdf_filename}`,
        `Source #${first.source_number} · ${pubDate} · evidence_class: external_source_content — not verified facts; raw transcription only`
      );
    }

    lines.push(
      "⚠ EVIDENCE CLASS NOTICE: The above lines are verbatim transcriptions of external publications. " +
      "They carry evidence_class = external_source_content and have NOT been individually verified as factual claims. " +
      "They represent what the publication stated, not a DiamondIQ-endorsed fact."
    );

    sections.push({
      id: "external_research",
      title: "Relevant External Research (Article Corpus)",
      content: lines.join("\n"),
      evidenceLabel: "External Source Content",
    });
  } else {
    sections.push({
      id: "external_research",
      title: "Relevant External Research (Article Corpus)",
      content: `No transcription lines matching "${club}" or its name variants were found in the 27-article research corpus (6,858 lines searched).`,
      evidenceLabel: "External Source Content",
    });
    dataGaps.push(`Article corpus: no transcription lines mention "${club}" or name variants.`);
  }

  // ── Section G: Data Gaps / Limitations ───────────────────────────────────
  {
    // Always include standard limitation statements
    const limitationLines: string[] = [
      "The following data gaps and limitations apply to this report:",
      "",
    ];

    if (dataGaps.length > 0) {
      for (const gap of dataGaps) limitationLines.push(`• ${gap}`);
      limitationLines.push("");
    }

    // Standard standing limitations
    limitationLines.push(
      "• Payroll data reflects official CBT payroll, which may differ from total player compensation including deferrals and incentive clauses.",
      "• Unreported signing bonuses are shown as Unavailable. DiamondIQ does not estimate or fabricate bonus amounts.",
      "• 2026 draft spend data is projection only; actual spend will be updated when committed to the database.",
      "• Article transcription content is verbatim external-source text. No individual claim from the external corpus has been independently verified as fact.",
      "• No model/general AI baseball knowledge was used to fill any missing data in this report."
    );

    sections.push({
      id: "data_gaps",
      title: "Data Gaps & Limitations",
      content: limitationLines.join("\n"),
      evidenceLabel: "Missing / Unverified Information",
    });
  }

  // ── Build methodology string ──────────────────────────────────────────────
  const methodology =
    `Club report assembled from ${Object.values(recordsByTable).reduce((a, b) => a + b, 0)} production records ` +
    `across ${tablesQueried.length} database tables. ` +
    `All queries exclude fixture data (is_fixture = FALSE). ` +
    `No AI/model baseball knowledge was used. ` +
    `Evidence classes: Verified Public Information (L1), Calculated/Derived (L2), ` +
    `OSM Proprietary Research (L3), DiamondIQ Inference (L4), External Source Content.`;

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
