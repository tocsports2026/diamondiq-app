import { Router } from "express";
import { requireAuth, requireStaff } from "../middleware/auth";
import { query, queryOne } from "../db";

const router = Router();

// GET /api/knowledge — list articles (athlete: published only; admin: all)
router.get("/", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const athleteId = req.session.athleteId;
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;

    let sql: string;
    const params: unknown[] = [];
    let i = 1;

    if (role === "athlete") {
      sql = `
        SELECT ka.id, ka.title, ka.category, ka.summary, ka.published_at, ka.updated_at
        FROM knowledge_articles ka
        WHERE ka.is_published = TRUE
          AND (ka.assigned_to_all = TRUE OR EXISTS (
            SELECT 1 FROM article_assignments aa WHERE aa.article_id = ka.id AND aa.athlete_id = $${i++}
          ))
      `;
      params.push(athleteId);
    } else {
      sql = "SELECT * FROM knowledge_articles WHERE 1=1";
    }

    if (category) {
      sql += ` AND ka.category = $${i++}`;
      params.push(category);
    }
    if (search) {
      sql += ` AND (ka.title ILIKE $${i} OR ka.summary ILIKE $${i++})`;
      params.push(`%${search}%`);
    }

    sql += " ORDER BY ka.updated_at DESC";

    const rows = await query(sql, params);
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// GET /api/knowledge/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole;
    const athleteId = req.session.athleteId;

    const article = await queryOne<Record<string, unknown>>(
      "SELECT * FROM knowledge_articles WHERE id = $1",
      [req.params.id]
    );
    if (!article) return res.status(404).json({ ok: false, error: "Not found" });

    if (role === "athlete" && !article.is_published) {
      return res.status(403).json({ ok: false, error: "Not published" });
    }

    if (role === "athlete" && !article.assigned_to_all) {
      const assignment = await queryOne(
        "SELECT 1 FROM article_assignments WHERE article_id = $1 AND athlete_id = $2",
        [article.id, athleteId]
      );
      if (!assignment) return res.status(403).json({ ok: false, error: "Not assigned" });
    }

    return res.json({ ok: true, data: article });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/knowledge — admin creates article
router.post("/", requireStaff, async (req, res) => {
  try {
    const { title, category, summary, content, assignedToAll = true } = req.body;
    if (!title || !category || !content) {
      return res.status(400).json({ ok: false, error: "title, category, content required" });
    }
    const [row] = await query(
      `INSERT INTO knowledge_articles (title, category, summary, content, assigned_to_all)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, category, summary || null, content, assignedToAll]
    );
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PATCH /api/knowledge/:id
router.patch("/:id", requireStaff, async (req, res) => {
  try {
    const { title, category, summary, content, isPublished, assignedToAll } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (title !== undefined) { updates.push(`title = $${i++}`); values.push(title); }
    if (category !== undefined) { updates.push(`category = $${i++}`); values.push(category); }
    if (summary !== undefined) { updates.push(`summary = $${i++}`); values.push(summary); }
    if (content !== undefined) { updates.push(`content = $${i++}`); values.push(content); }
    if (assignedToAll !== undefined) { updates.push(`assigned_to_all = $${i++}`); values.push(assignedToAll); }
    if (isPublished !== undefined) {
      updates.push(`is_published = $${i++}`);
      values.push(isPublished);
      if (isPublished) {
        updates.push(`published_at = $${i++}`);
        values.push(new Date().toISOString());
      }
    }

    updates.push("updated_at = NOW()");
    values.push(req.params.id);

    await query(
      `UPDATE knowledge_articles SET ${updates.join(", ")} WHERE id = $${i}`,
      values
    );

    const row = await queryOne("SELECT * FROM knowledge_articles WHERE id = $1", [req.params.id]);
    return res.json({ ok: true, data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// DELETE /api/knowledge/:id (archive by unpublishing)
router.delete("/:id", requireStaff, async (req, res) => {
  try {
    await query(
      "UPDATE knowledge_articles SET is_published = FALSE, updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
