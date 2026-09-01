import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAdmin, requireStaff } from "../middleware/auth";
import { query, queryOne } from "../db";
import { mapAthlete } from "./auth";
import { retrieveAnonymousDraftProfile } from "../evidence/anonymousDraftRetrieval";

const router = Router();

// POST /api/admin/validation/anonymous-draft-retrieval
// Validation-only path: aggregate reads, no athlete association, no persistence.
router.post("/validation/anonymous-draft-retrieval", requireAdmin, async (req, res) => {
  try {
    const result = await retrieveAnonymousDraftProfile(req.body);
    return res.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid anonymous profile";
    if (
      message.includes("must be") ||
      message.includes("Unsupported") ||
      message.includes("values")
    ) {
      return res.status(400).json({ ok: false, error: message });
    }
    console.error(err);
    return res.status(500).json({ ok: false, error: "Anonymous retrieval failed" });
  }
});

// GET /api/admin/dashboard
router.get("/dashboard", requireStaff, async (_req, res) => {
  try {
    const [activeClients] = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM users WHERE is_active = TRUE AND role = 'athlete'"
    );
    const [pendingReports] = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM reports WHERE status = 'pending'"
    );
    const [openRequests] = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM intelligence_requests WHERE status = 'open'"
    );
    const [incompleteDatasets] = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM data_library WHERE processing_status != 'ready'"
    );

    const pendingReportsList = await query(
      `SELECT r.id, r.report_ref, r.type, r.title, r.generated_at,
              ap.first_name, ap.last_name
       FROM reports r
       JOIN athlete_profiles ap ON r.athlete_id = ap.id
       WHERE r.status = 'pending'
       ORDER BY r.generated_at DESC LIMIT 10`
    );

    const requestsList = await query(
      `SELECT ir.*, ap.first_name, ap.last_name
       FROM intelligence_requests ir
       JOIN athlete_profiles ap ON ir.athlete_id = ap.id
       WHERE ir.status = 'open'
       ORDER BY ir.created_at DESC LIMIT 5`
    );

    return res.json({
      ok: true,
      data: {
        activeClients: parseInt(activeClients?.count || "0"),
        pendingReports: parseInt(pendingReports?.count || "0"),
        openRequests: parseInt(openRequests?.count || "0"),
        incompleteDatasets: parseInt(incompleteDatasets?.count || "0"),
        pendingReportsList,
        requestsList,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/admin/users — list all users
router.get("/users", requireAdmin, async (_req, res) => {
  try {
    const users = await query(`
      SELECT u.id, u.email, u.role, u.name, u.athlete_id, u.last_login,
             u.is_active, u.created_at,
             ap.first_name, ap.last_name, ap.position, ap.school
      FROM users u
      LEFT JOIN athlete_profiles ap ON ap.id = u.athlete_id
      ORDER BY u.created_at DESC
    `);
    return res.json({ ok: true, data: users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/admin/users — create user + athlete profile
router.post("/users", requireAdmin, async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      role = "athlete",
      firstName,
      lastName,
      position,
      school,
      conference,
      draftYear,
      level,
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ ok: false, error: "email, password, name required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    }

    const existing = await queryOne("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing) {
      return res.status(409).json({ ok: false, error: "Email already in use" });
    }

    const hash = await bcrypt.hash(password, 12);

    // Create user first (no athlete_id yet)
    const [user] = await query<{ id: number }>(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id`,
      [email.toLowerCase().trim(), hash, role, name]
    );

    let athleteId: number | null = null;

    if (role === "athlete" && firstName && lastName) {
      const [athlete] = await query<{ id: number }>(
        `INSERT INTO athlete_profiles (user_id, first_name, last_name, position, school, conference, draft_year, level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          user.id,
          firstName,
          lastName,
          position || "Unknown",
          school || null,
          conference || null,
          draftYear || null,
          level || "College",
        ]
      );
      athleteId = athlete.id;

      // Link user → athlete
      await query("UPDATE users SET athlete_id = $1 WHERE id = $2", [
        athleteId,
        user.id,
      ]);
    }

    return res.json({ ok: true, data: { userId: user.id, athleteId } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/admin/users/:id — update user
router.patch("/users/:id", requireAdmin, async (req, res) => {
  try {
    const { isActive, role, name } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (isActive !== undefined) { updates.push(`is_active = $${i++}`); values.push(isActive); }
    if (role) { updates.push(`role = $${i++}`); values.push(role); }
    if (name) { updates.push(`name = $${i++}`); values.push(name); }

    if (updates.length === 0) return res.status(400).json({ ok: false, error: "No fields" });

    values.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${i}`, values);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/admin/users/:id/reset-password
router.post("/users/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hash,
      req.params.id,
    ]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/admin/intelligence-requests
router.get("/intelligence-requests", requireStaff, async (req, res) => {
  try {
    const status = req.query.status || "open";
    const rows = await query(
      `SELECT ir.*, ap.first_name, ap.last_name, r.title as report_title, r.type as report_type
       FROM intelligence_requests ir
       JOIN athlete_profiles ap ON ir.athlete_id = ap.id
       LEFT JOIN reports r ON ir.report_id = r.id
       WHERE ir.status = $1
       ORDER BY ir.created_at DESC`,
      [status]
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/admin/intelligence-requests/:id/respond
router.patch("/intelligence-requests/:id/respond", requireStaff, async (req, res) => {
  try {
    const { adminResponse, status } = req.body;
    await query(
      `UPDATE intelligence_requests SET admin_response = $1, status = $2,
       resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END
       WHERE id = $3`,
      [adminResponse, status || "resolved", req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/admin/data-library
router.get("/data-library", requireStaff, async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM data_library ORDER BY upload_date DESC");
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/admin/data-library — add dataset record
router.post("/data-library", requireAdmin, async (req, res) => {
  try {
    const { title, category, source, yearsCovered, recordCount, confidence, notes } = req.body;
    const [row] = await query(
      `INSERT INTO data_library (title, category, source, years_covered, record_count, confidence, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, category, source, yearsCovered, recordCount || null, confidence || "moderate", notes || null]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/admin/methodology
router.get("/methodology", requireStaff, async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM methodology_rules ORDER BY created_at DESC");
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/admin/methodology
router.post("/methodology", requireAdmin, async (req, res) => {
  try {
    const { title, scope, ruleText, version, effectiveDate, author, notes } = req.body;
    const [row] = await query(
      `INSERT INTO methodology_rules (title, scope, rule_text, version, effective_date, author, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, scope, ruleText, version || "1.0", effectiveDate || null, author || null, notes || null]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/admin/athletes — alias
router.get("/athletes", requireStaff, async (_req, res) => {
  try {
    const athletes = await query(`
      SELECT ap.*, u.email, u.name as user_name, u.last_login, u.is_active
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

export default router;
