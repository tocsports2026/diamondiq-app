/**
 * Validation-safe anonymous Draft Intelligence retrieval.
 *
 * This module intentionally does not share the athlete report persistence path.
 * It accepts only an anonymous profile, reads aggregate evidence, and never
 * returns player identities or writes a report/evidence record.
 */

import { query } from "../db";

export interface AnonymousDraftProfileInput {
  position?: string;
  class?: string;
  classCodes?: string[];
  age?: number;
  ageAtDraft?: number;
  heightIn?: number;
  weightLbs?: number;
  bats?: string;
  throws?: string;
  school?: string;
  schoolType?: string;
  level?: string;
  rankings?: {
    mlb?: number;
    perfectGame?: number;
    baseballAmerica?: number;
  };
  scoutingGrades?: Record<string, number>;
  summerLeagueParticipation?: Record<string, "played" | "did_not_play" | "unknown">;
}

export interface AnonymousDraftRetrievalRequest {
  profile: AnonymousDraftProfileInput;
}

interface SqlFilter {
  id: string;
  label: string;
  field: string;
  sql: string;
  values: unknown[];
  recommendedUse: "required_cohort_criterion" | "secondary_criterion";
  rationale: string;
}

interface CohortSummary {
  recordCount: number;
  outcomeDistribution: Array<{ outcome: string; records: number }>;
  signingEvidence: {
    recordsWithReportedBonus: number;
    recordsMarkedSigned: number;
    recordsWithSigningDate: number;
    recordsWithMlbOrganization: number;
  };
}

const ALLOWED_PROFILE_KEYS = new Set([
  "position",
  "class",
  "classCodes",
  "age",
  "ageAtDraft",
  "heightIn",
  "weightLbs",
  "bats",
  "throws",
  "school",
  "schoolType",
  "level",
  "rankings",
  "scoutingGrades",
  "summerLeagueParticipation",
]);

const ALLOWED_REQUEST_KEYS = new Set([
  "profile",
]);
const ALLOWED_RANKING_KEYS = new Set(["mlb", "perfectGame", "baseballAmerica"]);
const ALLOWED_SUMMER_STATES = new Set(["played", "did_not_play", "unknown"]);
const BASE_CONDITIONS = [
  "dp.is_fixture = FALSE",
  "dp.outcome_group IN ('Drafted', 'Undrafted / NDFA', 'Undrafted')",
];

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function validateString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function validateProfile(input: unknown): AnonymousDraftProfileInput {
  const profile = asRecord(input, "profile");
  for (const key of Object.keys(profile)) {
    if (!ALLOWED_PROFILE_KEYS.has(key)) {
      throw new Error(`Unsupported anonymous profile field: ${key}`);
    }
  }

  if ("classCodes" in profile) {
    if (!Array.isArray(profile.classCodes) || profile.classCodes.length === 0) {
      throw new Error("classCodes must be a non-empty array");
    }
    for (const value of profile.classCodes) validateString(value, "classCodes value");
  }

  if ("rankings" in profile) {
    const rankings = asRecord(profile.rankings, "rankings");
    for (const key of Object.keys(rankings)) {
      if (!ALLOWED_RANKING_KEYS.has(key)) throw new Error(`Unsupported ranking field: ${key}`);
      validateFiniteNumber(rankings[key], `rankings.${key}`);
    }
  }

  if ("summerLeagueParticipation" in profile) {
    const participation = asRecord(
      profile.summerLeagueParticipation,
      "summerLeagueParticipation"
    );
    for (const state of Object.values(participation)) {
      if (typeof state !== "string" || !ALLOWED_SUMMER_STATES.has(state)) {
        throw new Error("summerLeagueParticipation values must be played, did_not_play, or unknown");
      }
    }
  }

  if ("scoutingGrades" in profile) {
    const grades = asRecord(profile.scoutingGrades, "scoutingGrades");
    for (const [key, value] of Object.entries(grades)) {
      validateString(key, "scouting grade name");
      validateFiniteNumber(value, `scoutingGrades.${key}`);
    }
  }

  for (const field of ["age", "ageAtDraft", "heightIn", "weightLbs"]) {
    if (field in profile) validateFiniteNumber(profile[field], field);
  }
  for (const field of ["position", "class", "bats", "throws", "school", "schoolType", "level"]) {
    if (field in profile) validateString(profile[field], field);
  }

  return profile as AnonymousDraftProfileInput;
}

function validateRequest(input: unknown): AnonymousDraftRetrievalRequest {
  const request = asRecord(input, "request");
  for (const key of Object.keys(request)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      throw new Error(`Unsupported anonymous retrieval request field: ${key}`);
    }
  }
  return {
    profile: validateProfile(request.profile),
  };
}

function positionExpression(position: string): { sql: string; values: unknown[] } {
  const upper = position.trim().toUpperCase();
  if (upper === "CATCHER" || upper === "C") {
    return {
      sql: "UPPER(REPLACE(COALESCE(dp.position, ''), CHR(160), ' ')) ~ '(^|[^A-Z])C([^A-Z]|$)'",
      values: [],
    };
  }
  if (upper === "RHP") {
    return {
      sql: "(dp.position IN ('RHS', 'RHR') OR (dp.position = 'P' AND UPPER(TRIM(COALESCE(dp.throws, ''))) = 'R'))",
      values: [],
    };
  }
  if (upper === "LHP") {
    return {
      sql: "(dp.position IN ('LHS', 'LHR') OR (dp.position = 'P' AND UPPER(TRIM(COALESCE(dp.throws, ''))) = 'L'))",
      values: [],
    };
  }
  if (upper === "OF") {
    return { sql: "dp.position IN ('OF', 'CF', 'LF', 'RF')", values: [] };
  }
  if (upper === "P") {
    return { sql: "dp.position IN ('P', 'RHS', 'LHS', 'RHR', 'LHR', 'TWP')", values: [] };
  }
  return {
    sql: "UPPER(TRIM(dp.position)) = UPPER(TRIM($?))",
    values: [position.trim()],
  };
}

function pushFilter(
  filters: SqlFilter[],
  filter: Omit<SqlFilter, "sql" | "values"> & { sql: string; values?: unknown[] }
) {
  filters.push({ ...filter, sql: filter.sql, values: filter.values || [] });
}

function compileFilters(filters: SqlFilter[]): { sql: string[]; params: unknown[] } {
  const params: unknown[] = [];
  const sql = filters.map((filter) => {
    let valueIndex = 0;
    const compiled = filter.sql.replace(/\$\?/g, () => {
      if (valueIndex >= filter.values.length) {
        throw new Error(`Missing SQL parameter for anonymous filter ${filter.id}`);
      }
      params.push(filter.values[valueIndex]);
      valueIndex += 1;
      return `$${params.length}`;
    });
    if (valueIndex !== filter.values.length) {
      throw new Error(`Unused SQL parameter for anonymous filter ${filter.id}`);
    }
    return compiled;
  });
  return { sql, params };
}

function numberValue(value: unknown): number {
  return Number(value);
}

async function summarizeCohort(
  conditions: string[],
  params: unknown[]
): Promise<CohortSummary> {
  const where = conditions.join(" AND ");
  const rows = await query<{
    record_count: string;
    records_with_reported_bonus: string;
    records_marked_signed: string;
    records_with_signing_date: string;
    records_with_mlb_organization: string;
  }>(
    `SELECT
       COUNT(*) AS record_count,
       COUNT(*) FILTER (WHERE dp.bonus_reported IS NOT NULL) AS records_with_reported_bonus,
       COUNT(*) FILTER (WHERE dp.signed = TRUE) AS records_marked_signed,
       COUNT(*) FILTER (WHERE dp.signing_date IS NOT NULL) AS records_with_signing_date,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.mlb_org), '') IS NOT NULL) AS records_with_mlb_organization
     FROM draft_players dp
     WHERE ${where}`,
    params
  );

  const outcomes = await query<{ outcome: string; records: string }>(
    `SELECT CASE
              WHEN dp.outcome_group = 'Drafted'
                THEN 'Drafted'
              WHEN dp.outcome_group = 'Undrafted / NDFA'
                OR dp.ndfa_match_status IN (
                  'Exact normalized name match',
                  'Exact normalized player-name match'
                )
                OR dp.signed = TRUE
                OR dp.signing_date IS NOT NULL
                OR dp.bonus_reported IS NOT NULL
                OR NULLIF(TRIM(dp.mlb_org), '') IS NOT NULL
                THEN 'Undrafted / signed as free agent'
              WHEN dp.school_type = 'HS'
                OR UPPER(TRIM(COALESCE(dp.player_class, ''))) LIKE 'HS %'
                OR UPPER(TRIM(COALESCE(dp.player_class, ''))) IN (
                  '4YR SO',
                  '4YR JR',
                  'JC J1',
                  'JC J2',
                  'JC J3'
                )
                THEN 'Undrafted / continued amateur pathway'
              ELSE 'Undrafted / no professional signing found'
            END AS outcome,
            COUNT(*) AS records
     FROM draft_players dp
     WHERE ${where}
     GROUP BY outcome
     ORDER BY outcome`,
    params
  );

  const row = rows[0] || {
    record_count: "0",
    records_with_reported_bonus: "0",
    records_marked_signed: "0",
    records_with_signing_date: "0",
    records_with_mlb_organization: "0",
  };
  return {
    recordCount: numberValue(row.record_count),
    outcomeDistribution: outcomes.map((item) => ({
      outcome: item.outcome,
      records: numberValue(item.records),
    })),
    signingEvidence: {
      recordsWithReportedBonus: numberValue(row.records_with_reported_bonus),
      recordsMarkedSigned: numberValue(row.records_marked_signed),
      recordsWithSigningDate: numberValue(row.records_with_signing_date),
      recordsWithMlbOrganization: numberValue(row.records_with_mlb_organization),
    },
  };
}

async function evidenceCoverage(profile: AnonymousDraftProfileInput) {
  const draftRows = await query<{
    total: string;
    position: string;
    player_class: string;
    age_at_draft: string;
    height_in: string;
    weight_lbs: string;
    bats: string;
    throws: string;
    school: string;
    school_type: string;
    mlb_rank: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.position), '') IS NOT NULL) AS position,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.player_class), '') IS NOT NULL) AS player_class,
       COUNT(*) FILTER (WHERE dp.age_at_draft IS NOT NULL) AS age_at_draft,
       COUNT(*) FILTER (WHERE dp.height_in IS NOT NULL) AS height_in,
       COUNT(*) FILTER (WHERE dp.weight_lbs IS NOT NULL) AS weight_lbs,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.bats), '') IS NOT NULL) AS bats,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.throws), '') IS NOT NULL) AS throws,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.school), '') IS NOT NULL) AS school,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(dp.school_type), '') IS NOT NULL) AS school_type,
       COUNT(*) FILTER (WHERE dp.mlb_rank IS NOT NULL) AS mlb_rank
     FROM draft_players dp
     WHERE dp.is_fixture = FALSE
        AND dp.outcome_group IN ('Drafted', 'Undrafted / NDFA', 'Undrafted')`
  );
  const rankingRows = await query<{ ranking_source: string; records: string }>(
    `SELECT COALESCE(ranking_source, 'Unavailable') AS ranking_source, COUNT(*) AS records
     FROM historical_rankings
     WHERE is_fixture = FALSE
     GROUP BY ranking_source
     ORDER BY ranking_source`
  );
  const metricRows = await query<{ metric: string; records: string }>(
    `SELECT metric, COUNT(*) AS records
     FROM player_evaluation_observations e
     CROSS JOIN LATERAL jsonb_object_keys(COALESCE(e.metrics, '{}'::jsonb)) AS metric
     WHERE e.is_fixture = FALSE
     GROUP BY metric
     ORDER BY metric`
  );
  const evaluationRows = await query<{
    total: string;
    with_metrics: string;
  }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE e.metrics <> '{}'::jsonb) AS with_metrics
     FROM player_evaluation_observations e
     WHERE e.is_fixture = FALSE`
  );
  const leagueRows = await query<{
    league: string;
    statistic_rows: string;
    deterministically_linked_players: string;
  }>(
    `SELECT COALESCE(NULLIF(TRIM(s.league), ''), 'Unavailable') AS league,
            COUNT(*) AS statistic_rows,
            COUNT(DISTINCT l.candidate_draft_player_id) AS deterministically_linked_players
     FROM player_season_statistics s
     LEFT JOIN source_player_identity_links l
       ON l.source_observation_table = 'player_season_statistics'
      AND l.source_observation_id = s.id
      AND l.link_status = 'deterministic_link'
     WHERE s.is_fixture = FALSE
     GROUP BY s.league
     ORDER BY league`
  );
  const slotValueRows = await query<{ records: string }>(
    `SELECT COUNT(*) AS records
     FROM slot_values
     WHERE is_fixture = FALSE`
  );

  const row = draftRows[0] || {
    total: "0",
    position: "0",
    player_class: "0",
    age_at_draft: "0",
    height_in: "0",
    weight_lbs: "0",
    bats: "0",
    throws: "0",
    school: "0",
    school_type: "0",
    mlb_rank: "0",
  };
  const total = numberValue(row.total);
  const supplied = {
    position: {
      historicalEvidenceRows: numberValue(row.position),
      directOutcomeCohortSupport: true,
      recommendedUse: "required_cohort_criterion",
    },
    class: {
      historicalEvidenceRows: numberValue(row.player_class),
      directOutcomeCohortSupport: Boolean(profile.classCodes?.length),
      recommendedUse: profile.classCodes?.length
        ? "secondary_cohort_criterion"
        : "descriptive_context_only",
      note: "User-facing class labels require an explicit source-code mapping; no mapping is inferred.",
    },
    age: {
      historicalEvidenceRows: numberValue(row.age_at_draft),
      directOutcomeCohortSupport: Boolean(profile.ageAtDraft !== undefined),
      recommendedUse: profile.ageAtDraft !== undefined ? "secondary_differentiating_factor" : "descriptive_context_only",
      note: "Assessment age is not silently treated as age at draft.",
    },
    height: {
      historicalEvidenceRows: numberValue(row.height_in),
      directOutcomeCohortSupport: profile.heightIn !== undefined,
      recommendedUse: profile.heightIn !== undefined ? "secondary_differentiating_factor" : "descriptive_context_only",
    },
    weight: {
      historicalEvidenceRows: numberValue(row.weight_lbs),
      directOutcomeCohortSupport: profile.weightLbs !== undefined,
      recommendedUse: profile.weightLbs !== undefined ? "secondary_differentiating_factor" : "descriptive_context_only",
    },
    bats: {
      historicalEvidenceRows: numberValue(row.bats),
      directOutcomeCohortSupport: profile.bats !== undefined,
      recommendedUse: profile.bats !== undefined ? "secondary_differentiating_factor" : "descriptive_context_only",
    },
    throws: {
      historicalEvidenceRows: numberValue(row.throws),
      directOutcomeCohortSupport: profile.throws !== undefined,
      recommendedUse: profile.throws !== undefined ? "secondary_differentiating_factor" : "descriptive_context_only",
    },
    school: {
      historicalEvidenceRows: numberValue(row.school),
      directOutcomeCohortSupport: profile.school !== undefined,
      recommendedUse: profile.school !== undefined ? "secondary_cohort_criterion" : "descriptive_context_only",
    },
    schoolTypeOrLevel: {
      historicalEvidenceRows: numberValue(row.school_type),
      directOutcomeCohortSupport: profile.schoolType !== undefined,
      recommendedUse: profile.schoolType !== undefined ? "secondary_cohort_criterion" : "descriptive_context_only",
      note: "level is not mapped to school_type without an explicit source mapping.",
    },
    mlbRanking: {
      historicalEvidenceRows: numberValue(row.mlb_rank),
      directOutcomeCohortSupport: profile.rankings?.mlb !== undefined,
      recommendedUse: profile.rankings?.mlb !== undefined ? "secondary_differentiating_factor" : "descriptive_context_only",
    },
    perfectGameRanking: {
      historicalEvidenceRows: rankingRows
        .filter((item) => item.ranking_source.toLowerCase().includes("perfect game"))
        .reduce((sum, item) => sum + numberValue(item.records), 0),
      directOutcomeCohortSupport: false,
      recommendedUse: "descriptive_context_only",
      note: "Ranking rows are preserved separately and are not identity-joined to draft_players.",
    },
    baseballAmericaRanking: {
      historicalEvidenceRows: rankingRows
        .filter((item) => item.ranking_source.toLowerCase().includes("baseball america"))
        .reduce((sum, item) => sum + numberValue(item.records), 0),
      directOutcomeCohortSupport: false,
      recommendedUse: "descriptive_context_only",
      note: "Ranking rows are preserved separately and are not identity-joined to draft_players.",
    },
    scoutingGrades: {
      historicalEvidenceRows: numberValue(evaluationRows[0]?.with_metrics || 0),
      directOutcomeCohortSupport: false,
      recommendedUse: "secondary_differentiating_factor",
      note: "Stored evaluation metrics are exposed as coverage/context only; no grade-to-outcome identity join is performed.",
    },
    summerLeagueParticipation: {
      historicalEvidenceRows: leagueRows.reduce((sum, item) => sum + numberValue(item.statistic_rows), 0),
      directOutcomeCohortSupport: true,
      recommendedUse: "parallel_evidence_cohort",
      note: "Only deterministic production observation links can form a parallel cohort; non-participation is never inferred from absence.",
    },
  };

  return {
    baseHistoricalRecords: total,
    draftPlayersFieldCoverage: {
      total,
      nonNullRows: {
        position: numberValue(row.position),
        playerClass: numberValue(row.player_class),
        ageAtDraft: numberValue(row.age_at_draft),
        heightIn: numberValue(row.height_in),
        weightLbs: numberValue(row.weight_lbs),
        bats: numberValue(row.bats),
        throws: numberValue(row.throws),
        school: numberValue(row.school),
        schoolType: numberValue(row.school_type),
        mlbRank: numberValue(row.mlb_rank),
      },
    },
    suppliedFieldAssessments: supplied,
    rankingSourceCoverage: rankingRows.map((item) => ({
      source: item.ranking_source,
      records: numberValue(item.records),
    })),
    evaluationMetricCoverage: metricRows.map((item) => ({
      metric: item.metric,
      records: numberValue(item.records),
    })),
    slotValueCoverage: {
      records: numberValue(slotValueRows[0]?.records || 0),
      directAnonymousCohortSupport: false,
      note: "Slot values are available as production evidence but are not attached to anonymous profile cohorts without a supported pick/round relationship.",
    },
    summerLeagueCoverage: leagueRows.map((item) => ({
      league: item.league,
      statisticRows: numberValue(item.statistic_rows),
      deterministicallyLinkedPlayers: numberValue(item.deterministically_linked_players),
    })),
  };
}

export async function retrieveAnonymousDraftProfile(input: unknown) {
  const request = validateRequest(input);
  const profile = request.profile;
  const filters: SqlFilter[] = [];

  if (profile.position) {
    const position = positionExpression(profile.position);
    pushFilter(filters, {
      id: "position",
      label: `Position = ${profile.position}`,
      field: "position",
      sql: position.sql,
      values: position.values,
      recommendedUse: "required_cohort_criterion",
      rationale: "Position is directly stored on the historical draft-player records.",
    });
  }
  if (profile.classCodes?.length) {
    const placeholders = profile.classCodes.map(() => "$?");
    filters.push({
      id: "class_codes",
      label: `Source class code in ${profile.classCodes.join(", ")}`,
      field: "player_class",
      sql: `dp.player_class IN (${placeholders.join(", ")})`,
      values: profile.classCodes,
      recommendedUse: "secondary_criterion",
      rationale: "Only explicit source-preserved class codes are accepted.",
    });
  }
  if (profile.ageAtDraft !== undefined) {
    pushFilter(filters, {
      id: "age_at_draft",
      label: `Age at draft = ${profile.ageAtDraft}`,
      field: "age_at_draft",
      sql: "dp.age_at_draft = $?",
      values: [profile.ageAtDraft],
      recommendedUse: "secondary_criterion",
      rationale: "Uses the stored age-at-draft field only when that basis is explicitly supplied.",
    });
  }
  if (profile.heightIn !== undefined) {
    pushFilter(filters, {
      id: "height_in",
      label: `Height = ${profile.heightIn} inches`,
      field: "height_in",
      sql: "dp.height_in = $?",
      values: [profile.heightIn],
      recommendedUse: "secondary_criterion",
      rationale: "Direct source field; nested and parallel counts expose over-filtering.",
    });
  }
  if (profile.weightLbs !== undefined) {
    pushFilter(filters, {
      id: "weight_lbs",
      label: `Weight = ${profile.weightLbs} lbs`,
      field: "weight_lbs",
      sql: "dp.weight_lbs = $?",
      values: [profile.weightLbs],
      recommendedUse: "secondary_criterion",
      rationale: "Direct source field; no tolerance is invented.",
    });
  }
  if (profile.bats) {
    pushFilter(filters, {
      id: "bats",
      label: `Bats = ${profile.bats}`,
      field: "bats",
      sql: "UPPER(TRIM(dp.bats)) = UPPER(TRIM($?))",
      values: [profile.bats],
      recommendedUse: "secondary_criterion",
      rationale: "Direct source field; provider values are not rewritten.",
    });
  }
  if (profile.throws) {
    pushFilter(filters, {
      id: "throws",
      label: `Throws = ${profile.throws}`,
      field: "throws",
      sql: "UPPER(TRIM(dp.throws)) = UPPER(TRIM($?))",
      values: [profile.throws],
      recommendedUse: "secondary_criterion",
      rationale: "Direct source field; provider values are not rewritten.",
    });
  }
  if (profile.school) {
    pushFilter(filters, {
      id: "school",
      label: `School = ${profile.school}`,
      field: "school",
      sql: "LOWER(TRIM(dp.school)) = LOWER(TRIM($?))",
      values: [profile.school],
      recommendedUse: "secondary_criterion",
      rationale: "Exact normalized comparison to the stored school value; no fuzzy school matching.",
    });
  }
  if (profile.schoolType) {
    pushFilter(filters, {
      id: "school_type",
      label: `School type = ${profile.schoolType}`,
      field: "school_type",
      sql: "LOWER(TRIM(dp.school_type)) = LOWER(TRIM($?))",
      values: [profile.schoolType],
      recommendedUse: "secondary_criterion",
      rationale: "Uses the stored school-type value without mapping level labels.",
    });
  }
  if (profile.rankings?.mlb !== undefined) {
    pushFilter(filters, {
      id: "mlb_rank",
      label: `Stored MLB rank = ${profile.rankings.mlb}`,
      field: "mlb_rank",
      sql: "dp.mlb_rank = $?",
      values: [profile.rankings.mlb],
      recommendedUse: "secondary_criterion",
      rationale: "Only the direct stored draft-player MLB rank field is used.",
    });
  }

  const coverage = await evidenceCoverage(
    profile
  );
  const base = await summarizeCohort(BASE_CONDITIONS, []);
  const nestedCohorts: Array<{
    afterFilter: string;
    appliedFilters: string[];
    summary: CohortSummary;
  }> = [];

  for (let index = 0; index < filters.length; index += 1) {
    const compiled = compileFilters(filters.slice(0, index + 1));
    nestedCohorts.push({
      afterFilter: filters[index].label,
      appliedFilters: filters.slice(0, index + 1).map((filter) => filter.label),
      summary: await summarizeCohort(
        [...BASE_CONDITIONS, ...compiled.sql],
        compiled.params
      ),
    });
  }

  const exactCompiled = compileFilters(filters);
  const exact = await summarizeCohort(
    [...BASE_CONDITIONS, ...exactCompiled.sql],
    exactCompiled.params
  );
  const parallelCohorts: Array<{
    filter: string;
    summary: CohortSummary;
  }> = [];
  for (const filter of filters) {
    const compiled = compileFilters([filter]);
    parallelCohorts.push({
      filter: filter.label,
      summary: await summarizeCohort(
        [...BASE_CONDITIONS, ...compiled.sql],
        compiled.params
      ),
    });
  }

  const summerParallelCohorts: Array<{ league: string; state: string; summary: CohortSummary | null }> = [];
  for (const [league, state] of Object.entries(profile.summerLeagueParticipation || {})) {
    if (state !== "played") {
      summerParallelCohorts.push({ league, state, summary: null });
      continue;
    }
    const summerParams = [league];
    summerParallelCohorts.push({
      league,
      state,
      summary: await summarizeCohort(
        [
          ...BASE_CONDITIONS,
          `dp.id IN (
             SELECT l.candidate_draft_player_id
             FROM source_player_identity_links l
             JOIN player_season_statistics s
               ON l.source_observation_table = 'player_season_statistics'
              AND l.source_observation_id = s.id
             WHERE l.link_status = 'deterministic_link'
               AND s.is_fixture = FALSE
                AND LOWER(TRIM(s.league)) = LOWER(TRIM($1))
           )`,
        ],
        summerParams
      ),
    });
  }

  return {
    validationOnly: true,
    persisted: false,
    validationMode:
      "CURRENT-EVIDENCE / YEAR-AGNOSTIC / ANONYMOUS / NEVER-PREVIOUSLY-DRAFTED",
    historicalEvidenceBasis:
      "Current non-fixture production evidence is used as the comparison library; no athlete draft year or assessment date is requested, inferred, or applied.",
    anonymousProfile: profile,
    isolation: {
      canonicalAthleteIdAccepted: false,
      identityFieldsAccepted: false,
      playerNamesReturned: false,
      playerIdsReturned: false,
      identityMatchingPerformed: false,
      futureOutcomeLookupPerformed: false,
      sourceEvidenceModified: false,
      predictiveOrSimilarityScoreGenerated: false,
    },
    evidenceCoverage: coverage,
    cohortConstruction: {
      basePopulation: base,
      appliedFilters: filters.map((filter) => ({
        id: filter.id,
        label: filter.label,
        field: filter.field,
        recommendedUse: filter.recommendedUse,
        rationale: filter.rationale,
      })),
      exactFilteredPopulation: exact,
      nestedCohorts,
      parallelCohorts,
      summerParallelCohorts,
      overFilteringProtection: {
        hiddenBroadening: false,
        hiddenNarrowingByOutcome: false,
        opaqueSimilarityScore: false,
        rule: "The path returns base, nested, and parallel factual populations. It never silently broadens or narrows a cohort based on Draft Results.",
      },
    },
    evidenceRules: {
      missingAttributesRemainMissing: true,
      absentParticipationNotTreatedAsNegative: true,
      providerMetricsReinterpreted: false,
      sourceDrivenOutcomeDistribution: true,
      productionEvidenceGuard: "All draft, ranking, evaluation, statistics, and identity-link reads are restricted to non-fixture evidence; deterministic links are used only for summer parallel-cohort aggregation.",
    },
  };
}