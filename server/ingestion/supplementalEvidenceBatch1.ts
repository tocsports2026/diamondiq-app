import * as XLSX from "xlsx";

type Cell = string | number | boolean | null | undefined;
type SourceRecord = Record<string, Cell>;

export interface ProductionDraftPlayer {
  id: number;
  player_name: string;
  draft_year: number | null;
  school: string | null;
  position: string | null;
  state: string | null;
}

export interface SupplementalBatchContext {
  datasetId: number;
  sourceFileVersionId: number;
  ingestionJobId: number;
}

interface SourceReference {
  sourceWorksheet: string;
  sourceExcelRow: number;
  sourceFile: string | null;
  sourceUrl: string | null;
  provider: string;
  batchWorksheet: string;
  batchExcelRow: number;
  sourcePreamble: string;
}

export interface RankingPlan {
  eventKey: string;
  playerName: string;
  rankingSource: string;
  rankingYear: number | null;
  rankPosition: number;
  school: string | null;
  position: string | null;
  sourceUniqueId: string | null;
  sourceColumn: string;
  rankingContext: Record<string, unknown>;
  sourceReferences: SourceReference[];
}

export interface EvaluationPlan {
  eventKey: string;
  playerName: string;
  classYear: number | null;
  state: string | null;
  school: string | null;
  position: string | null;
  commitment: string | null;
  observationScope: "hitter" | "pitcher";
  metrics: Record<string, Cell>;
  sourceContext: Record<string, unknown>;
  sourceReference: SourceReference;
}

export interface StatisticPlan {
  eventKey: string;
  playerName: string;
  sourceUniqueId: string | null;
  provider: string;
  league: string | null;
  seasonYear: number | null;
  classYear: number | null;
  team: string | null;
  position: string | null;
  statisticType: "batting" | "pitching";
  sampleScope: string | null;
  statistics: Record<string, Cell>;
  sourceContext: Record<string, unknown>;
  sourceReferences: SourceReference[];
}

export interface IdentityLinkPlan {
  sourceEventKey: string;
  sourceObservationKind: "evaluation" | "statistic";
  sourceReference: SourceReference;
  sourceUniqueId: string | null;
  playerName: string;
  identityKey: string;
  candidateDraftPlayerId: number | null;
  linkStatus: "deterministic_link" | "candidate_link" | "unlinked";
  matchingFields: Record<string, unknown>;
  linkReason: string;
  sourceContext: Record<string, unknown>;
}

export interface ReviewHoldPlan {
  sourceReference: SourceReference;
  sourceUniqueId: string | null;
  playerName: string | null;
  sourceYear: number | null;
  reason: string;
  sourceRecord: SourceRecord;
}

export interface SupplementalEvidenceBatch1Plan {
  rankings: RankingPlan[];
  evaluations: EvaluationPlan[];
  statistics: StatisticPlan[];
  identityLinks: IdentityLinkPlan[];
  reviewHolds: ReviewHoldPlan[];
  sourceDuplicateAssertions: Array<{
    statisticEventKey: string;
    sourceReference: SourceReference;
    assertedValue: string;
  }>;
  summary: {
    inputSourceRows: number;
    rankings: number;
    evaluations: number;
    playerSeasonStatistics: number;
    deterministicSourceObservations: number;
    candidateSourceObservations: number;
    unlinkedSourceObservations: number;
    deterministicIdentityLinks: number;
    candidateIdentityLinks: number;
    unlinkedIdentityLinks: number;
    reviewHolds: number;
    exactSourceDuplicatesCollapsed: number;
    sourceAssertions: number;
  };
}

const DATA_SHEETS = new Set([
  "PBR HITTERS",
  "PBR PITCHERS",
  "PG BATTING",
  "PG PITCHING",
  "CAPE HIT 2012-22",
  "CAPE PIT 2012-22",
  "CAPE HIT 2024-26",
  "CAPE PIT 2024-26",
  "APPY HIT 2022-26",
  "APPY PIT 2022-26",
]);

const PROVENANCE_FIELDS = new Set([
  "Source Worksheet",
  "Source Row",
  "Source File",
  "Source URL",
  "Source Provider",
]);

export function isSupplementalEvidenceBatch1(workbook: XLSX.WorkBook): boolean {
  return [...DATA_SHEETS].every((sheetName) => workbook.SheetNames.includes(sheetName));
}

function text(value: Cell): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function integer(value: Cell): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? Math.trunc(parsed) : null;
}

function normalizeName(value: string): string {
  const name = value.trim();
  const ordered = name.includes(",")
    ? `${name.split(",").slice(1).join(" ")} ${name.split(",")[0]}`
    : name;
  return ordered.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string | null): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function upper(value: string | null): string {
  return String(value ?? "").trim().toUpperCase();
}

function isBlankRow(row: Cell[]): boolean {
  return row.every((value) => value === null || value === undefined || value === "");
}

function recordForRow(headers: string[], row: Cell[]): SourceRecord {
  const record: SourceRecord = {};
  headers.forEach((header, index) => {
    if (header) record[header] = row[index] ?? null;
  });
  return record;
}

function sourceReference(
  record: SourceRecord,
  batchWorksheet: string,
  batchExcelRow: number,
  fallbackProvider: string
): SourceReference {
  const sourceWorksheet = text(record["Source Worksheet"]) ?? batchWorksheet;
  const sourceExcelRow = integer(record["Source Row"]) ?? batchExcelRow;
  const provider = text(record["Source Provider"]) ?? fallbackProvider;
  const sourceFile = text(record["Source File"]);
  const sourceUrl = text(record["Source URL"]);
  return {
    sourceWorksheet,
    sourceExcelRow,
    sourceFile,
    sourceUrl,
    provider,
    batchWorksheet,
    batchExcelRow,
    sourcePreamble: sourceFile
      ? `${provider} | ${sourceFile} | ${sourceWorksheet}`
      : `${provider} | ${sourceWorksheet}`,
  };
}

function metricPayload(record: SourceRecord, excluded: string[]): Record<string, Cell> {
  const excludedFields = new Set([...PROVENANCE_FIELDS, ...excluded]);
  const metrics: Record<string, Cell> = {};
  for (const [field, value] of Object.entries(record)) {
    if (!excludedFields.has(field)) metrics[field] = value ?? null;
  }
  return metrics;
}

function stableSourceFingerprint(record: SourceRecord): string {
  const values = Object.keys(record)
    .filter((field) => !PROVENANCE_FIELDS.has(field))
    .sort()
    .map((field) => [field, record[field] ?? null]);
  return JSON.stringify(values);
}

function sourceEventKey(reference: SourceReference, kind: "evaluation" | "statistic"): string {
  return [
    kind,
    reference.provider,
    reference.sourceFile ?? "",
    reference.sourceWorksheet,
    reference.sourceExcelRow,
  ].join("|");
}

function compatiblePbrContext(
  candidate: ProductionDraftPlayer,
  school: string | null,
  position: string | null
): boolean {
  const schoolMatch =
    normalizeText(school) !== "" && normalizeText(candidate.school) === normalizeText(school);
  const positionMatch = upper(position) !== "" && upper(candidate.position) === upper(position);
  return schoolMatch || positionMatch;
}

function identityLinkRows(
  kind: "evaluation" | "statistic",
  eventKey: string,
  sourceReferenceValue: SourceReference,
  sourceUniqueId: string | null,
  playerName: string,
  identityKey: string,
  sourceContext: Record<string, unknown>,
  productionByName: Map<string, ProductionDraftPlayer[]>,
  matchingMode: "pbr" | "perfect_game" | "summer",
  contextYear: number | null,
  school: string | null,
  position: string | null
): IdentityLinkPlan[] {
  const normalized = normalizeName(playerName);
  const sameNameCandidates = productionByName.get(normalized) ?? [];
  const sameYearCandidates = sameNameCandidates.filter(
    (candidate) => candidate.draft_year === contextYear
  );

  let deterministicCandidate: ProductionDraftPlayer | null = null;
  if (matchingMode === "pbr") {
    const compatible = sameYearCandidates.filter((candidate) =>
      compatiblePbrContext(candidate, school, position)
    );
    if (compatible.length === 1) deterministicCandidate = compatible[0];
  } else if (matchingMode === "perfect_game") {
    if (sameYearCandidates.length === 1) deterministicCandidate = sameYearCandidates[0];
  } else if (position) {
    const compatible = sameYearCandidates.filter((candidate) => upper(candidate.position) === upper(position));
    if (compatible.length === 1) deterministicCandidate = compatible[0];
  }

  const base = {
    sourceEventKey: eventKey,
    sourceObservationKind: kind,
    sourceReference: sourceReferenceValue,
    sourceUniqueId,
    playerName,
    identityKey,
    sourceContext,
  };

  if (deterministicCandidate) {
    return [{
      ...base,
      candidateDraftPlayerId: deterministicCandidate.id,
      linkStatus: "deterministic_link",
      matchingFields: {
        normalized_name: true,
        source_year: contextYear,
        candidate_draft_year: deterministicCandidate.draft_year,
        source_school: school,
        candidate_school: deterministicCandidate.school,
        source_position: position,
        candidate_position: deterministicCandidate.position,
        matching_mode: matchingMode,
      },
      linkReason: "Exactly one production draft-player identity met the documented deterministic criteria.",
    }];
  }

  if (sameNameCandidates.length === 0) {
    return [{
      ...base,
      candidateDraftPlayerId: null,
      linkStatus: "unlinked",
      matchingFields: { normalized_name: true, matching_mode: matchingMode },
      linkReason: "No exact normalized production player-name candidate exists.",
    }];
  }

  const reason = sameYearCandidates.length === 0
    ? "Exact name candidate exists, but no compatible production draft-year candidate exists."
    : "Exact name candidate exists, but the documented deterministic criteria do not produce exactly one compatible production identity.";

  return sameNameCandidates.map((candidate) => ({
    ...base,
    candidateDraftPlayerId: candidate.id,
    linkStatus: "candidate_link" as const,
    matchingFields: {
      normalized_name: true,
      source_year: contextYear,
      candidate_draft_year: candidate.draft_year,
      source_school: school,
      candidate_school: candidate.school,
      source_position: position,
      candidate_position: candidate.position,
      matching_mode: matchingMode,
    },
    linkReason: reason,
  }));
}

export function buildSupplementalEvidenceBatch1Plan(
  workbook: XLSX.WorkBook,
  productionDraftPlayers: ProductionDraftPlayer[]
): SupplementalEvidenceBatch1Plan {
  if (!isSupplementalEvidenceBatch1(workbook)) {
    throw new Error("Workbook does not match the approved Supplemental Evidence Batch 1 layout.");
  }

  const productionByName = new Map<string, ProductionDraftPlayer[]>();
  for (const player of productionDraftPlayers) {
    const key = normalizeName(player.player_name);
    productionByName.set(key, [...(productionByName.get(key) ?? []), player]);
  }

  const rankings: RankingPlan[] = [];
  const evaluations: EvaluationPlan[] = [];
  const statistics: StatisticPlan[] = [];
  const reviewHolds: ReviewHoldPlan[] = [];
  const sourceDuplicateAssertions: SupplementalEvidenceBatch1Plan["sourceDuplicateAssertions"] = [];
  const identityEvents: Array<{
    kind: "evaluation" | "statistic";
    eventKey: string;
    sourceReference: SourceReference;
    sourceUniqueId: string | null;
    playerName: string;
    identityKey: string;
    sourceContext: Record<string, unknown>;
    matchingMode: "pbr" | "perfect_game" | "summer";
    contextYear: number | null;
    school: string | null;
    position: string | null;
  }> = [];
  const pgRankings = new Map<string, RankingPlan>();
  const statisticDedup = new Map<string, StatisticPlan>();
  let inputSourceRows = 0;

  for (const sheetName of workbook.SheetNames) {
    if (!DATA_SHEETS.has(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: true });
    const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
    const isPbr = sheetName.startsWith("PBR");
    const isPg = sheetName.startsWith("PG");
    const isCape = sheetName.startsWith("CAPE");
    const provider = isPbr ? "Prep Baseball Report"
      : isPg ? "Perfect Game"
      : isCape ? "Cape Cod Baseball League"
      : "Appalachian League";
    const statisticType: "batting" | "pitching" =
      /HIT|BATT/.test(sheetName) ? "batting" : "pitching";

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (isBlankRow(row)) continue;
      inputSourceRows++;
      const record = recordForRow(headers, row);
      const reference = sourceReference(record, sheetName, rowIndex + 1, provider);

      if (isPbr) {
        const playerName = text(record.Name);
        const classYear = integer(record["Season/Class Year"]);
        if (!playerName) {
          reviewHolds.push({
            sourceReference: reference,
            sourceUniqueId: null,
            playerName: null,
            sourceYear: classYear,
            reason: "Missing required source player name for PBR evaluation observation.",
            sourceRecord: record,
          });
          continue;
        }
        const scope = sheetName === "PBR HITTERS" ? "hitter" : "pitcher";
        const eventKey = sourceEventKey(reference, "evaluation");
        const school = text(record.School);
        const position = text(record.Position);
        const evaluation: EvaluationPlan = {
          eventKey,
          playerName,
          classYear,
          state: text(record.State),
          school,
          position,
          commitment: text(record.Commitment),
          observationScope: scope,
          metrics: metricPayload(record, [
            "Rank", "Name", "State", "School", "Position", "Commitment", "Season/Class Year",
          ]),
          sourceContext: {
            source_family: "PBR",
            list_scope: scope,
            class_year: classYear,
            raw_position_code: position,
          },
          sourceReference: reference,
        };
        evaluations.push(evaluation);
        identityEvents.push({
          kind: "evaluation",
          eventKey,
          sourceReference: reference,
          sourceUniqueId: null,
          playerName,
          identityKey: `${normalizeName(playerName)}|${classYear ?? ""}`,
          sourceContext: evaluation.sourceContext,
          matchingMode: "pbr",
          contextYear: classYear,
          school,
          position,
        });

        const rank = integer(record.Rank);
        if (rank !== null) {
          rankings.push({
            eventKey: `ranking|${eventKey}`,
            playerName,
            rankingSource: "Prep Baseball Report",
            rankingYear: classYear,
            rankPosition: rank,
            school,
            position,
            sourceUniqueId: null,
            sourceColumn: "Rank",
            rankingContext: {
              source_family: "PBR",
              class_year: classYear,
              list_scope: scope,
              state: text(record.State),
              commitment: text(record.Commitment),
              raw_position_code: position,
            },
            sourceReferences: [reference],
          });
        }
        continue;
      }

      if (isPg) {
        const playerName = text(record.FullName);
        const playerId = text(record.PlayerID);
        const gradYear = integer(record.GradYear);
        const seasonYear = integer(record.SeasonYear);
        if (!playerName) {
          reviewHolds.push({
            sourceReference: reference,
            sourceUniqueId: playerId,
            playerName: null,
            sourceYear: seasonYear,
            reason: "Missing required source player name for Perfect Game player-season observation.",
            sourceRecord: record,
          });
          continue;
        }
        const eventKey = sourceEventKey(reference, "statistic");
        const stats: StatisticPlan = {
          eventKey,
          playerName,
          sourceUniqueId: playerId,
          provider: "Perfect Game",
          league: null,
          seasonYear,
          classYear: gradYear,
          team: text(record.TeamName),
          position: null,
          statisticType,
          sampleScope: "Top-100 selected population",
          statistics: metricPayload(record, [
            "PlayerID", "FullName", "GradYear", "State", "BestPGGrade", "BestRank",
            "TeamName", "SeasonYear",
          ]),
          sourceContext: {
            source_family: "Perfect Game",
            graduation_year: gradYear,
            state: text(record.State),
            best_pg_grade: record.BestPGGrade ?? null,
            best_rank: record.BestRank ?? null,
            sample_scope: "Top-100 selected population",
          },
          sourceReferences: [reference],
        };
        statistics.push(stats);
        identityEvents.push({
          kind: "statistic",
          eventKey,
          sourceReference: reference,
          sourceUniqueId: playerId,
          playerName,
          identityKey: playerId ?? `${normalizeName(playerName)}|${gradYear ?? ""}`,
          sourceContext: stats.sourceContext,
          matchingMode: "perfect_game",
          contextYear: gradYear,
          school: null,
          position: null,
        });

        const rank = integer(record.BestRank);
        if (rank !== null) {
          const grade = text(record.BestPGGrade);
          const rankKey = [
            playerId ?? normalizeName(playerName),
            gradYear ?? "",
            rank,
            grade ?? "",
            "Top-100 selected population",
          ].join("|");
          const existingRanking = pgRankings.get(rankKey);
          if (existingRanking) {
            existingRanking.sourceReferences.push(reference);
          } else {
            const ranking: RankingPlan = {
              eventKey: `ranking|perfect-game|${rankKey}`,
              playerName,
              rankingSource: "Perfect Game",
              rankingYear: gradYear,
              rankPosition: rank,
              school: null,
              position: null,
              sourceUniqueId: playerId,
              sourceColumn: "BestRank",
              rankingContext: {
                source_family: "Perfect Game",
                ranking_type: "BestRank",
                graduation_year: gradYear,
                best_pg_grade: grade,
                sample_scope: "Top-100 selected population",
              },
              sourceReferences: [reference],
            };
            pgRankings.set(rankKey, ranking);
            rankings.push(ranking);
          }
        }
        continue;
      }

      // Older Cape source tabs use Name; recent Cape and Appalachian tabs use Player.
      const playerName = text(record.Player) ?? text(record.Name);
      const seasonYear = integer(record["Season/Class Year"]);
      const position = text(record.Pos);
      if (!playerName) {
        reviewHolds.push({
          sourceReference: reference,
          sourceUniqueId: null,
          playerName: null,
          sourceYear: seasonYear,
          reason: "Missing required source player name for league player-season observation.",
          sourceRecord: record,
        });
        continue;
      }
      const eventKey = sourceEventKey(reference, "statistic");
      const statistic: StatisticPlan = {
        eventKey,
        playerName,
        sourceUniqueId: null,
        provider,
        league: isCape ? "Cape Cod Baseball League" : "Appalachian League",
        seasonYear,
        classYear: null,
        team: text(record.Team),
        position,
        statisticType,
        sampleScope: null,
        statistics: metricPayload(record, [
          "Player", "Name", "Team", "Pos", "Season/Class Year",
        ]),
        sourceContext: {
          source_family: isCape ? "Cape Cod League" : "Appalachian League",
          source_schema: /2012-22/.test(sheetName) ? "older" : "recent",
          raw_position_code: position,
        },
        sourceReferences: [reference],
      };
      const fingerprint = `${sheetName}|${stableSourceFingerprint(record)}`;
      const duplicateOf = statisticDedup.get(fingerprint);
      if (duplicateOf) {
        duplicateOf.sourceReferences.push(reference);
        sourceDuplicateAssertions.push({
          statisticEventKey: duplicateOf.eventKey,
          sourceReference: reference,
          assertedValue: JSON.stringify(statistic.statistics),
        });
        continue;
      }
      statisticDedup.set(fingerprint, statistic);
      statistics.push(statistic);
      identityEvents.push({
        kind: "statistic",
        eventKey,
        sourceReference: reference,
        sourceUniqueId: null,
        playerName,
        identityKey: `${normalizeName(playerName)}|${seasonYear ?? ""}|${text(record.Team) ?? ""}`,
        sourceContext: statistic.sourceContext,
        matchingMode: "summer",
        contextYear: seasonYear,
        school: null,
        position,
      });
    }
  }

  const identityLinks: IdentityLinkPlan[] = [];
  let deterministicSourceObservations = 0;
  let candidateSourceObservations = 0;
  let unlinkedSourceObservations = 0;
  for (const event of identityEvents) {
    const rows = identityLinkRows(
      event.kind,
      event.eventKey,
      event.sourceReference,
      event.sourceUniqueId,
      event.playerName,
      event.identityKey,
      event.sourceContext,
      productionByName,
      event.matchingMode,
      event.contextYear,
      event.school,
      event.position
    );
    identityLinks.push(...rows);
    if (rows[0]?.linkStatus === "deterministic_link") deterministicSourceObservations++;
    else if (rows[0]?.linkStatus === "candidate_link") candidateSourceObservations++;
    else unlinkedSourceObservations++;
  }

  for (const ranking of rankings) {
    ranking.rankingContext.supporting_source_rows = ranking.sourceReferences.map((reference) => ({
      worksheet: reference.sourceWorksheet,
      excel_row: reference.sourceExcelRow,
      source_file: reference.sourceFile,
      source_url: reference.sourceUrl,
      batch_worksheet: reference.batchWorksheet,
      batch_excel_row: reference.batchExcelRow,
    }));
  }

  const pgRankingAssertions = rankings.reduce(
    (sum, ranking) => sum + Math.max(0, ranking.sourceReferences.length - 1),
    0
  );
  const deterministicIdentityLinks = identityLinks.filter((link) => link.linkStatus === "deterministic_link").length;
  const candidateIdentityLinks = identityLinks.filter((link) => link.linkStatus === "candidate_link").length;
  const unlinkedIdentityLinks = identityLinks.filter((link) => link.linkStatus === "unlinked").length;

  return {
    rankings,
    evaluations,
    statistics,
    identityLinks,
    reviewHolds,
    sourceDuplicateAssertions,
    summary: {
      inputSourceRows,
      rankings: rankings.length,
      evaluations: evaluations.length,
      playerSeasonStatistics: statistics.length,
      deterministicSourceObservations,
      candidateSourceObservations,
      unlinkedSourceObservations,
      deterministicIdentityLinks,
      candidateIdentityLinks,
      unlinkedIdentityLinks,
      reviewHolds: reviewHolds.length,
      exactSourceDuplicatesCollapsed: sourceDuplicateAssertions.length,
      sourceAssertions: sourceDuplicateAssertions.length + pgRankingAssertions,
    },
  };
}