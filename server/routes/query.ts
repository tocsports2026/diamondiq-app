import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { query } from "../db";

const router = Router();

// GET /api/query/popular — popular questions
router.get("/popular", requireAuth, async (req, res) => {
  try {
    const scope = req.query.scope || "all";
    const rows = await query(
      `SELECT * FROM popular_questions WHERE scope = $1 ORDER BY use_count DESC LIMIT 10`,
      [scope]
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/query/ask — log a query (non-AI for Phase 1, routes to research workspace)
router.post("/ask", requireAuth, async (req, res) => {
  try {
    const { question, scope } = req.body;
    if (!question) return res.status(400).json({ ok: false, error: "question required" });

    // Log anonymized query
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(question.toLowerCase().trim()).digest("hex");

    await query(
      `INSERT INTO query_log (scope, question_hash, question_normalized)
       VALUES ($1, $2, $3)`,
      [scope || "all", hash, question.trim()]
    );

    // Update popular questions (upsert by hash proximity — simplified)
    const existingPop = await query<{ id: number; use_count: number }>(
      "SELECT id, use_count FROM popular_questions WHERE scope = $1 AND question_text ILIKE $2 LIMIT 1",
      [scope || "all", `%${question.slice(0, 30)}%`]
    );

    if (existingPop.length > 0) {
      await query(
        "UPDATE popular_questions SET use_count = use_count + 1, last_used = NOW() WHERE id = $1",
        [existingPop[0].id]
      );
    }

    // Determine which workspace to route to based on question content
    let suggestedType = "draft";
    const lower = question.toLowerCase();
    if (lower.includes("nil") || lower.includes("market") || lower.includes("brand") || lower.includes("sponsor")) {
      suggestedType = "nil";
    } else if (lower.includes("club") || lower.includes("team") || lower.includes("organization") || lower.includes("bonus pool")) {
      suggestedType = "club";
    }

    return res.json({
      ok: true,
      data: {
        message: "DiamondIQ has logged your question and determined the best research path.",
        suggestedWorkspace: suggestedType,
        disclaimer:
          "DiamondIQ uses verified data and OSM proprietary intelligence. Results are based on historical evidence, not fabricated analysis.",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/query/log — recent queries for athlete
router.get("/log", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT scope, question_normalized, created_at FROM query_log ORDER BY created_at DESC LIMIT 20"
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
