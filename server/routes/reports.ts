import { Router } from "express";
import { requireAuth, requireStaff } from "../middleware/auth";
import { query, queryOne } from "../db";
import { v4 as uuidv4 } from "uuid";
import { retrieveAndAssembleClubReport, type ClubReportParams } from "../evidence/clubRetrieval";
import { retrieveAndAssembleDraftReport, type DraftReportParams } from "../evidence/draftRetrieval";

const router = Router();

// GET /api/reports — athlete gets their own; staff gets all or by athleteId
router.get("/", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const athleteId = req.session.athleteId;

    let rows;
    if (role === "athlete") {
      if (!athleteId) return res.json({ ok: true, data: [] });
      // Athlete only sees published reports (full) + pending (shell only)
      rows = await query(
        `SELECT id, report_ref, athlete_id, type, status, title, description,
                research_question, generated_at, published_at, updated_at
         FROM reports
         WHERE athlete_id = $1 AND status != 'archived'
         ORDER BY generated_at DESC`,
        [athleteId]
      );
    } else {
      // Staff/admin sees all
      const filterAthleteId = req.query.athleteId
        ? parseInt(req.query.athleteId as string)
        : null;
      if (filterAthleteId) {
        rows = await query(
          `SELECT r.*, ap.first_name, ap.last_name FROM reports r
           JOIN athlete_profiles ap ON r.athlete_id = ap.id
           WHERE r.athlete_id = $1 ORDER BY r.generated_at DESC`,
          [filterAthleteId]
        );
      } else {
        rows = await query(
          `SELECT r.*, ap.first_name, ap.last_name FROM reports r
           JOIN athlete_profiles ap ON r.athlete_id = ap.id
           ORDER BY r.generated_at DESC LIMIT 100`
        );
      }
    }

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/reports/:ref — get single report
router.get("/:ref", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const row = await queryOne<Record<string, unknown>>(
      "SELECT * FROM reports WHERE report_ref = $1 OR id::text = $1",
      [req.params.ref]
    );
    if (!row) return res.status(404).json({ ok: false, error: "Not found" });

    // Athlete can only access their own reports
    if (role === "athlete" && row.athlete_id !== req.session.athleteId) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    // Athlete sees pending report as shell (no content)
    if (role === "athlete" && row.status === "pending") {
      return res.json({
        ok: true,
        data: {
          id: row.id,
          reportRef: row.report_ref,
          athleteId: row.athlete_id,
          type: row.type,
          status: row.status,
          title: row.title,
          description: row.description,
          researchQuestion: row.research_question,
          generatedAt: row.generated_at,
          publishedAt: row.published_at,
          updatedAt: row.updated_at,
          content: null, // hidden
          isPending: true,
        },
      });
    }

    // Build visible content for athlete (apply admin review decisions)
    let content = row.content as Record<string, unknown> | null;
    if (role === "athlete" && content && Array.isArray(content.sections)) {
      content = {
        ...content,
        sections: (content.sections as Record<string, unknown>[]).filter(
          (s) => {
            const review = s.adminReview as Record<string, unknown> | undefined;
            if (s.isHidden) return false;
            if (review?.decision === "hide") return false;
            return true;
          }
        ).map((s) => {
          const review = s.adminReview as Record<string, unknown> | undefined;
          if (review?.decision === "edit") {
            return { ...s, content: review.editedContent };
          }
          if (review?.decision === "replace") {
            return { ...s, content: review.replacementContent };
          }
          return s;
        }),
      };
    }

    return res.json({
      ok: true,
      data: {
        id: row.id,
        reportRef: row.report_ref,
        athleteId: row.athlete_id,
        type: row.type,
        status: row.status,
        title: row.title,
        description: row.description,
        researchQuestion: row.research_question,
        generatedAt: row.generated_at,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        content,
        adminNotes: role !== "athlete" ? row.admin_notes : undefined,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/reports — generate a new report (athlete initiates)
router.post("/", requireAuth, async (req, res) => {
  try {
    const { type, title, description, researchQuestion, researchParams } =
      req.body;

    if (!type || !title) {
      return res.status(400).json({ ok: false, error: "type and title required" });
    }

    const athleteId =
      req.session.userRole === "athlete"
        ? req.session.athleteId
        : req.body.athleteId;

    if (!athleteId) {
      return res.status(400).json({ ok: false, error: "athleteId required" });
    }

    // Check feature toggle
    if (req.session.userRole === "athlete") {
      const profile = await queryOne<Record<string, unknown>>(
        "SELECT * FROM athlete_profiles WHERE id = $1",
        [athleteId]
      );
      if (profile) {
        const featureMap: Record<string, string> = {
          draft: "feature_draft_intelligence",
          nil: "feature_nil_intelligence",
          club: "feature_club_draft_intelligence",
        };
        const featureKey = featureMap[type as string];
        if (featureKey && !profile[featureKey]) {
          return res
            .status(403)
            .json({ ok: false, error: "Feature not enabled" });
        }
      }
    }

    const ref = `DIQ-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Build report content — evidence-backed for club and draft; placeholder for nil
    let content: Record<string, unknown>;
    if (type === "club") {
      // Evidence-backed path: retrieve from production research database
      const clubParams: ClubReportParams = {
        club: (researchParams as Record<string, string>)?.club || "",
        draftYears: (researchParams as Record<string, string>)?.draftYears,
        pickRange: (researchParams as Record<string, string>)?.pickRange,
      };
      if (!clubParams.club) {
        return res.status(400).json({ ok: false, error: "researchParams.club is required for club reports" });
      }
      content = await retrieveAndAssembleClubReport(clubParams) as unknown as Record<string, unknown>;
    } else if (type === "draft") {
      // Evidence-backed path: retrieve player-level draft records from production database.
      // Undrafted-population comparison (task #7) is intentionally deferred.
      const draftParams: DraftReportParams = {
        position:     (researchParams as Record<string, string>)?.position,
        player_class: (researchParams as Record<string, string>)?.player_class,
        level:        (researchParams as Record<string, string>)?.level,
        school_type:  (researchParams as Record<string, string>)?.school_type,
        school:       (researchParams as Record<string, string>)?.school,
        draftYears:   (researchParams as Record<string, string>)?.draftYears,
        conference:   (researchParams as Record<string, string>)?.conference,
        mlbRank:      (researchParams as Record<string, string>)?.mlbRank,
        rankingRange: (researchParams as Record<string, string>)?.rankingRange,
        heightRange:  (researchParams as Record<string, string>)?.heightRange,
        weightRange:  (researchParams as Record<string, string>)?.weightRange,
      };
      content = await retrieveAndAssembleDraftReport(draftParams, researchQuestion || undefined) as unknown as Record<string, unknown>;
    } else {
      // Placeholder path for unsupported types (nil) — retained until evidence engine extended
      content = buildInitialContent(
        type as string,
        researchParams || {},
        researchQuestion || ""
      );
    }

    const [report] = await query(
      `INSERT INTO reports (report_ref, athlete_id, type, status, title, description, research_question, content)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7) RETURNING *`,
      [ref, athleteId, type, title, description || null, researchQuestion || null, JSON.stringify(content)]
    );

    // Create intelligence requests for any missing data
    const missingInfo = identifyMissingData(type as string, researchParams || {});
    for (const missing of missingInfo) {
      await query(
        `INSERT INTO intelligence_requests (athlete_id, report_id, question, missing_data, why_it_matters, recommended_action, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          athleteId,
          (report as Record<string, unknown>).id,
          missing.question,
          missing.missingData,
          missing.whyItMatters,
          missing.recommendedAction,
          missing.priority,
        ]
      );
    }

    return res.json({ ok: true, data: report });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/reports/:id/review — admin reviews a report section
router.patch("/:id/review", requireStaff, async (req, res) => {
  try {
    const { sectionId, decision, editedContent, replacementContent, internalNote } =
      req.body;

    const report = await queryOne<Record<string, unknown>>(
      "SELECT * FROM reports WHERE id = $1",
      [req.params.id]
    );
    if (!report) return res.status(404).json({ ok: false, error: "Not found" });

    const content = (report.content as Record<string, unknown>) || { sections: [] };
    const sections = (content.sections as Record<string, unknown>[]) || [];

    const updated = sections.map((s) => {
      if (s.id === sectionId) {
        return {
          ...s,
          adminReview: {
            decision,
            editedContent: editedContent || null,
            replacementContent: replacementContent || null,
            internalNote: internalNote || null,
            reviewedAt: new Date().toISOString(),
          },
          isHidden: decision === "hide",
        };
      }
      return s;
    });

    await query(
      "UPDATE reports SET content = $1, updated_at = NOW() WHERE id = $2",
      [JSON.stringify({ ...content, sections: updated }), req.params.id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/reports/:id/publish — admin publishes a report
router.post("/:id/publish", requireStaff, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    await query(
      `UPDATE reports SET status = 'published', published_at = NOW(), updated_at = NOW(), admin_notes = $1 WHERE id = $2`,
      [adminNotes || null, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/reports/:id/notes — admin adds/updates internal notes
router.patch("/:id/notes", requireStaff, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    await query(
      "UPDATE reports SET admin_notes = $1, updated_at = NOW() WHERE id = $2",
      [adminNotes, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// DELETE /api/reports/:id (archive)
router.delete("/:id", requireStaff, async (req, res) => {
  try {
    await query(
      "UPDATE reports SET status = 'archived', updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/reports/pending/count — admin: count pending reports
router.get("/pending/count", requireStaff, async (req, res) => {
  try {
    const row = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM reports WHERE status = 'pending'"
    );
    return res.json({ ok: true, data: { count: parseInt(row?.count || "0") } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

function buildInitialContent(
  type: string,
  params: Record<string, unknown>,
  researchQuestion: string
) {
  if (type === "draft") {
    return {
      sections: [
        {
          id: "research_question",
          title: "Research Question",
          content: researchQuestion || "Historical comparable analysis based on applied research parameters.",
          evidenceLabel: "DiamondIQ Analysis / Inference",
        },
        {
          id: "applied_variables",
          title: "Applied Variables",
          content: buildVariablesSummary(params),
          evidenceLabel: "OSM-Provided Athlete Information",
        },
        {
          id: "draft_outcomes",
          title: "Historical Draft Outcomes",
          content: {
            type: "draft_outcomes",
            data: {
              note: "Calculated Result • Verified dataset • n = comparables pending data load",
              disclaimer: "Historical base rates — not an athlete-specific prediction.",
              outcomes: [
                { round: "Round 1", count: null, total: null },
                { round: "Rounds 2–3", count: null, total: null },
                { round: "Rounds 4–5", count: null, total: null },
                { round: "Later / Undrafted", count: null, total: null },
              ],
              dataAvailability: "Pending OSM dataset load. OSM Admin has been notified.",
            },
          },
          evidenceLabel: "Calculated Results",
        },
        {
          id: "bonus_range",
          title: "Historical Signing Bonus Analysis",
          content: {
            type: "bonus_range",
            data: {
              note: "Verified Public Information + Calculated Results",
              disclaimer: "No confidence percentage. Not a projected bonus.",
              comparableCount: null,
              reportedBonusCount: null,
              range: null,
              median: null,
              dataAvailability: "Pending OSM dataset load.",
            },
          },
          evidenceLabel: "Verified Public Information",
        },
        {
          id: "comparable_players",
          title: "Historical Comparable Players",
          content: {
            type: "comparable_players",
            data: {
              note: "No numeric Comp Score. Inclusion requires a plain-language rationale.",
              players: [],
              dataAvailability: "Pending OSM dataset load.",
            },
          },
          evidenceLabel: "Verified Public Information",
        },
        {
          id: "osm_context",
          title: "OSM Context & Methodology",
          content:
            "Historical results provide context, not a guaranteed draft projection. Any interpretation is reviewed by OSM Admin before athlete publication. DiamondIQ does not generate scouting grades, signability percentages, athlete-specific round probabilities, or predictive bonus confidence in Phase 1.",
          evidenceLabel: "DiamondIQ Analysis / Inference",
        },
      ],
      methodology:
        "Research conducted using verified public draft data, OSM proprietary datasets, and approved ranking sources. Evidence labels identify each data type.",
      sources: [],
    };
  }

  if (type === "nil") {
    return {
      sections: [
        {
          id: "research_question",
          title: "Research Question",
          content: researchQuestion || "NIL market opportunity analysis.",
          evidenceLabel: "DiamondIQ Analysis / Inference",
        },
        {
          id: "opportunity_targets",
          title: "Opportunity Targets",
          content: {
            type: "opportunity_targets",
            data: {
              note: "Research-based targets only. No fabricated contacts or undisclosed deal amounts.",
              targets: [],
              dataAvailability: "Pending market research load.",
            },
          },
          evidenceLabel: "Verified Public Information",
        },
        {
          id: "market_insights",
          title: "Market Insights",
          content: {
            type: "market_insights",
            data: { insights: [], dataAvailability: "Pending." },
          },
          evidenceLabel: "Verified Public Information",
        },
        {
          id: "action_plan",
          title: "Action Plan",
          content: {
            type: "action_plan",
            data: {
              steps: [],
              note: "Recommendations only. OSM will execute outreach.",
            },
          },
          evidenceLabel: "DiamondIQ Analysis / Inference",
        },
        {
          id: "research_evidence",
          title: "Research & Evidence",
          content: "Sources will be listed once OSM Admin completes review and publishes this report.",
          evidenceLabel: "Missing / Unverified Information",
        },
      ],
      methodology: "NIL opportunity research based on verified public sources and OSM proprietary intelligence.",
      sources: [],
    };
  }

  // club
  return {
    sections: [
      {
        id: "executive_summary",
        title: "Executive Summary",
        content: "Club draft and payment intelligence analysis pending OSM data load and Admin review.",
        evidenceLabel: "DiamondIQ Analysis / Inference",
      },
      {
        id: "draft_history",
        title: "Draft History Overview",
        content: {
          type: "club_history",
          data: { picks: [], note: "Historical data only.", dataAvailability: "Pending." },
        },
        evidenceLabel: "Verified Public Information",
      },
      {
        id: "payment_behavior",
        title: "Payment Behavior",
        content: {
          type: "payment_behavior",
          data: {
            note: "Only verified bonus data shown. Unreported amounts shown as unavailable.",
            metrics: [],
            dataAvailability: "Pending.",
          },
        },
        evidenceLabel: "Verified Public Information",
      },
      {
        id: "osm_interpretation",
        title: "OSM Interpretation",
        content: "This section is OSM / DiamondIQ analysis derived from the verified historical record. Pending Admin review.",
        evidenceLabel: "DiamondIQ Analysis / Inference",
      },
      {
        id: "sources",
        title: "Sources & Methodology",
        content: "All key figures are traceable. Sources listed after Admin review.",
        evidenceLabel: "Verified Public Information",
      },
    ],
    methodology: "Club draft analysis using verified draft history, reported signing bonuses, and official slot values.",
    sources: [],
  };
}

function buildVariablesSummary(params: Record<string, unknown>) {
  const parts: string[] = [];
  if (params.position) parts.push(`Position: ${params.position}`);
  if (params.level) parts.push(`Level: ${params.level}`);
  if (params.conference) parts.push(`Conference: ${params.conference}`);
  if (params.draftYears) parts.push(`Draft Years: ${params.draftYears}`);
  if (params.rankingRange) parts.push(`Ranking Range: ${params.rankingRange}`);
  if (params.heightRange) parts.push(`Height: ${params.heightRange}`);
  if (params.weightRange) parts.push(`Weight: ${params.weightRange}`);
  return parts.join(" • ") || "Research parameters as configured.";
}

function identifyMissingData(type: string, params: Record<string, unknown>) {
  const requests = [];

  if (type === "nil") {
    if (!params.socialAnalytics) {
      requests.push({
        question: "Social media analytics needed for NIL report",
        missingData: "Verified social media follower counts and engagement rates",
        whyItMatters: "Accurate NIL opportunity assessment requires verified audience size",
        recommendedAction: "Athlete to provide social account access or verified analytics screenshot",
        priority: "medium",
      });
    }
    if (!params.existingDeals) {
      requests.push({
        question: "Existing brand agreements or restrictions",
        missingData: "Active NIL agreements and exclusivity restrictions",
        whyItMatters: "Prevents recommending conflicting or prohibited categories",
        recommendedAction: "Review athlete's existing agreement portfolio",
        priority: "high",
      });
    }
  }

  if (type === "draft") {
    if (!params.ranking) {
      requests.push({
        question: "Current ranking verification",
        missingData: "Most recent approved ranking source and position",
        whyItMatters: "Ranking is a key research variable for comparable player selection",
        recommendedAction: "Confirm ranking source and current position with athlete profile",
        priority: "medium",
      });
    }
  }

  return requests;
}

export default router;
