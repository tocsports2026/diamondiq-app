import { Router } from "express";
import { requireAuth, requireStaff } from "../middleware/auth";
import { query, queryOne } from "../db";

const router = Router();

// GET /api/nil/agreements
router.get("/agreements", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const athleteId = req.session.athleteId;

    let rows;
    if (role === "athlete") {
      if (!athleteId) return res.json({ ok: true, data: [] });
      rows = await query(
        `SELECT * FROM nil_agreements WHERE athlete_id = $1 AND athlete_visible = TRUE ORDER BY updated_at DESC`,
        [athleteId]
      );
    } else {
      const filterAthleteId = req.query.athleteId;
      if (filterAthleteId) {
        rows = await query(
          "SELECT * FROM nil_agreements WHERE athlete_id = $1 ORDER BY updated_at DESC",
          [filterAthleteId]
        );
      } else {
        rows = await query(
          `SELECT na.*, ap.first_name, ap.last_name FROM nil_agreements na
           JOIN athlete_profiles ap ON na.athlete_id = ap.id
           ORDER BY na.updated_at DESC LIMIT 100`
        );
      }
    }

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/nil/agreements — admin creates
router.post("/agreements", requireStaff, async (req, res) => {
  try {
    const {
      athleteId, brand, term, status, compensationSummary,
      nextObligation, completionProgress, startDate, endDate,
      exclusivityTerms, paymentDates, athleteVisible, internalNotes,
    } = req.body;

    const [row] = await query(
      `INSERT INTO nil_agreements
         (athlete_id, brand, term, status, compensation_summary, next_obligation,
          completion_progress, start_date, end_date, exclusivity_terms, payment_dates,
          athlete_visible, internal_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        athleteId, brand, term || null, status || "active",
        compensationSummary || null, nextObligation || null,
        completionProgress || 0, startDate || null, endDate || null,
        exclusivityTerms || null,
        JSON.stringify(paymentDates || []),
        athleteVisible !== false, internalNotes || null,
      ]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/nil/agreements/:id
router.patch("/agreements/:id", requireStaff, async (req, res) => {
  try {
    const { status, completionProgress, nextObligation, athleteVisible, internalNotes } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (status !== undefined) { updates.push(`status = $${i++}`); values.push(status); }
    if (completionProgress !== undefined) { updates.push(`completion_progress = $${i++}`); values.push(completionProgress); }
    if (nextObligation !== undefined) { updates.push(`next_obligation = $${i++}`); values.push(nextObligation); }
    if (athleteVisible !== undefined) { updates.push(`athlete_visible = $${i++}`); values.push(athleteVisible); }
    if (internalNotes !== undefined) { updates.push(`internal_notes = $${i++}`); values.push(internalNotes); }

    if (updates.length === 0) return res.status(400).json({ ok: false, error: "No fields" });

    updates.push("updated_at = NOW()");
    values.push(req.params.id);
    await query(`UPDATE nil_agreements SET ${updates.join(", ")} WHERE id = $${i}`, values);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/nil/deliverables
router.get("/deliverables", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const athleteId = req.session.athleteId;

    let rows;
    if (role === "athlete") {
      if (!athleteId) return res.json({ ok: true, data: [] });
      rows = await query(
        "SELECT * FROM nil_deliverables WHERE athlete_id = $1 ORDER BY due_date ASC NULLS LAST",
        [athleteId]
      );
    } else {
      const filterAthleteId = req.query.athleteId;
      rows = await query(
        `SELECT nd.*, ap.first_name, ap.last_name FROM nil_deliverables nd
         JOIN athlete_profiles ap ON nd.athlete_id = ap.id
         ${filterAthleteId ? "WHERE nd.athlete_id = $1" : ""}
         ORDER BY nd.due_date ASC NULLS LAST LIMIT 100`,
        filterAthleteId ? [filterAthleteId] : []
      );
    }
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/nil/deliverables
router.post("/deliverables", requireStaff, async (req, res) => {
  try {
    const {
      agreementId, athleteId, title, platform, dueDate, status,
      requiredTag, requiredLanguage, prohibitedLanguage,
      postWindowStart, postWindowEnd, brandAssets,
    } = req.body;

    const [row] = await query(
      `INSERT INTO nil_deliverables
         (agreement_id, athlete_id, title, platform, due_date, status,
          required_tag, required_language, prohibited_language,
          post_window_start, post_window_end, brand_assets)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        agreementId, athleteId, title, platform || null, dueDate || null,
        status || "scheduled", requiredTag || null, requiredLanguage || null,
        prohibitedLanguage || null, postWindowStart || null,
        postWindowEnd || null, brandAssets || null,
      ]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/nil/deliverables/:id/status
router.patch("/deliverables/:id/status", requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    await query(
      "UPDATE nil_deliverables SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/nil/calendar
router.get("/calendar", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const athleteId = req.session.athleteId;

    let rows;
    if (role === "athlete") {
      if (!athleteId) return res.json({ ok: true, data: [] });
      rows = await query(
        `SELECT *, (event_date - CURRENT_DATE) AS days_until
         FROM calendar_events WHERE athlete_id = $1
         ORDER BY event_date ASC`,
        [athleteId]
      );
    } else {
      const filterAthleteId = req.query.athleteId;
      rows = await query(
        `SELECT ce.*, ap.first_name, ap.last_name,
                (ce.event_date - CURRENT_DATE) AS days_until
         FROM calendar_events ce
         JOIN athlete_profiles ap ON ce.athlete_id = ap.id
         ${filterAthleteId ? "WHERE ce.athlete_id = $1" : ""}
         ORDER BY ce.event_date ASC LIMIT 100`,
        filterAthleteId ? [filterAthleteId] : []
      );
    }
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/nil/calendar
router.post("/calendar", requireStaff, async (req, res) => {
  try {
    const { athleteId, title, type, eventDate, eventTime, location, organization, notes } = req.body;
    const [row] = await query(
      `INSERT INTO calendar_events (athlete_id, title, type, event_date, event_time, location, organization, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [athleteId, title, type || "other", eventDate, eventTime || null, location || null, organization || null, notes || null]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
