import { Router } from "express";
import { requireAuth, requireStaff } from "../middleware/auth";
import { query, queryOne } from "../db";
import { mapAthlete } from "./auth";

const router = Router();

// GET /api/athletes/me — current athlete's profile
router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!req.session.athleteId) {
      return res.status(404).json({ ok: false, error: "No athlete profile" });
    }
    const a = await queryOne(
      "SELECT * FROM athlete_profiles WHERE id = $1",
      [req.session.athleteId]
    );
    if (!a) return res.status(404).json({ ok: false, error: "Not found" });

    const rankings = await query(
      "SELECT * FROM athlete_rankings WHERE athlete_id = $1 ORDER BY ranking_date DESC",
      [req.session.athleteId]
    );

    return res.json({
      ok: true,
      data: { ...mapAthlete(a as Record<string, unknown>), rankings },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/athletes/me — athlete updates allowed personal fields
router.patch("/me", requireAuth, async (req, res) => {
  try {
    if (!req.session.athleteId) {
      return res.status(403).json({ ok: false, error: "No athlete profile" });
    }
    const allowed = [
      "personal_interests",
      "causes",
      "travel_preference",
      "category_exclusions",
      "brand_restrictions",
      "social_links",
    ];
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const key of allowed) {
      const clientKey = toCamel(key);
      if (clientKey in req.body) {
        updates.push(`${key} = $${i++}`);
        values.push(req.body[clientKey]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid fields" });
    }
    values.push(req.session.athleteId);
    await query(
      `UPDATE athlete_profiles SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${i}`,
      values
    );
    const a = await queryOne(
      "SELECT * FROM athlete_profiles WHERE id = $1",
      [req.session.athleteId]
    );
    return res.json({ ok: true, data: mapAthlete(a as Record<string, unknown>) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/athletes — admin/staff: list all athletes
router.get("/", requireStaff, async (req, res) => {
  try {
    const athletes = await query(`
      SELECT ap.*, u.email, u.name as user_name, u.last_login, u.is_active, u.role
      FROM athlete_profiles ap
      LEFT JOIN users u ON u.athlete_id = ap.id
      ORDER BY ap.last_name, ap.first_name
    `);
    return res.json({
      ok: true,
      data: athletes.map((a) => mapAthlete(a as Record<string, unknown>)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/athletes/:id — admin/staff: get specific athlete
router.get("/:id", requireStaff, async (req, res) => {
  try {
    const a = await queryOne(
      "SELECT ap.*, u.email, u.name as user_name, u.last_login, u.is_active FROM athlete_profiles ap LEFT JOIN users u ON u.athlete_id = ap.id WHERE ap.id = $1",
      [req.params.id]
    );
    if (!a) return res.status(404).json({ ok: false, error: "Not found" });

    const rankings = await query(
      "SELECT * FROM athlete_rankings WHERE athlete_id = $1 ORDER BY ranking_date DESC",
      [req.params.id]
    );

    return res.json({
      ok: true,
      data: { ...mapAthlete(a as Record<string, unknown>), rankings },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/athletes/:id — admin/staff updates
router.patch("/:id", requireStaff, async (req, res) => {
  try {
    const allowedAdmin = [
      "first_name", "last_name", "preferred_name", "dob", "hometown",
      "position", "secondary_position", "bats", "throws", "height_in",
      "weight_lbs", "school", "conference", "level", "draft_year",
      "draft_eligibility", "personal_interests", "causes",
      "travel_preference", "category_exclusions", "brand_restrictions",
      "social_links", "verified_analytics",
      "feature_draft_intelligence", "feature_nil_intelligence",
      "feature_club_draft_intelligence", "feature_knowledge_center",
      "feature_nil_marketing_management", "feature_social_content_tools",
      "feature_calendar", "feature_agreements", "feature_deliverables",
    ];
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const key of allowedAdmin) {
      const clientKey = toCamel(key);
      if (clientKey in req.body) {
        updates.push(`${key} = $${i++}`);
        values.push(req.body[clientKey]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid fields" });
    }
    values.push(req.params.id);
    await query(
      `UPDATE athlete_profiles SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${i}`,
      values
    );
    const a = await queryOne(
      "SELECT * FROM athlete_profiles WHERE id = $1",
      [req.params.id]
    );
    return res.json({ ok: true, data: mapAthlete(a as Record<string, unknown>) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/athletes/:id/rankings — add ranking
router.post("/:id/rankings", requireStaff, async (req, res) => {
  try {
    const { source, ranking, rankingDate, sourceRecord } = req.body;
    const [row] = await query(
      `INSERT INTO athlete_rankings (athlete_id, source, ranking, ranking_date, source_record)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, source, ranking, rankingDate, sourceRecord || null]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/athletes/me/calendar — upcoming events
router.get("/me/calendar", requireAuth, async (req, res) => {
  try {
    if (!req.session.athleteId) return res.status(404).json({ ok: false, error: "No profile" });
    const events = await query(
      `SELECT *, (event_date - CURRENT_DATE) AS days_until
       FROM calendar_events WHERE athlete_id = $1 AND event_date >= CURRENT_DATE
       ORDER BY event_date LIMIT 20`,
      [req.session.athleteId]
    );
    return res.json({ ok: true, data: events });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

function toCamel(snake: string) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export default router;
