import { Router } from "express";
import bcrypt from "bcryptjs";
import { queryOne, query } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await queryOne<{
      id: number;
      email: string;
      role: string;
      name: string;
      athlete_id: number | null;
      last_login: string | null;
      is_active: boolean;
      created_at: string;
    }>(
      "SELECT id, email, role, name, athlete_id, last_login, is_active, created_at FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (!user || !user.is_active) {
      req.session.destroy(() => {});
      return res.status(401).json({ ok: false, error: "Account not active" });
    }

    let athlete = null;
    if (user.athlete_id) {
      athlete = await queryOne(
        `SELECT * FROM athlete_profiles WHERE id = $1`,
        [user.athlete_id]
      );
    }

    return res.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          athleteId: user.athlete_id,
          lastLogin: user.last_login,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
        athlete: athlete ? mapAthlete(athlete) : null,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password required" });
    }

    const user = await queryOne<{
      id: number;
      email: string;
      password_hash: string;
      role: string;
      name: string;
      athlete_id: number | null;
      is_active: boolean;
    }>(
      "SELECT id, email, password_hash, role, name, athlete_id, is_active FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (!user || !user.is_active) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid credentials" });
    }

    // Update last login
    await query("UPDATE users SET last_login = NOW() WHERE id = $1", [
      user.id,
    ]);

    req.session.userId = user.id;
    req.session.userRole = user.role as "athlete" | "osm_staff" | "osm_admin";
    req.session.athleteId = user.athlete_id;

    let athlete = null;
    if (user.athlete_id) {
      athlete = await queryOne(
        "SELECT * FROM athlete_profiles WHERE id = $1",
        [user.athlete_id]
      );
    }

    return res.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          athleteId: user.athlete_id,
          isActive: user.is_active,
        },
        athlete: athlete ? mapAthlete(athlete) : null,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.json({ ok: true });
  });
});

// POST /api/auth/change-password (for athletes to change their own)
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid password data" });
    }

    const user = await queryOne<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.session.userId]
    );
    if (!user) return res.status(404).json({ ok: false, error: "Not found" });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res
        .status(401)
        .json({ ok: false, error: "Current password incorrect" });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hash,
      req.session.userId,
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

function mapAthlete(a: Record<string, unknown>) {
  return {
    id: a.id,
    userId: a.user_id,
    firstName: a.first_name,
    lastName: a.last_name,
    preferredName: a.preferred_name,
    imageUrl: a.image_url,
    dob: a.dob,
    hometown: a.hometown,
    position: a.position,
    secondaryPosition: a.secondary_position,
    bats: a.bats,
    throws: a.throws,
    heightIn: a.height_in,
    weightLbs: a.weight_lbs,
    school: a.school,
    conference: a.conference,
    level: a.level,
    draftYear: a.draft_year,
    draftEligibility: a.draft_eligibility,
    socialLinks: a.social_links,
    verifiedAnalytics: a.verified_analytics,
    personalInterests: a.personal_interests,
    causes: a.causes,
    travelPreference: a.travel_preference,
    categoryExclusions: a.category_exclusions,
    brandRestrictions: a.brand_restrictions,
    featureToggles: {
      draftIntelligence: a.feature_draft_intelligence,
      nilIntelligence: a.feature_nil_intelligence,
      clubDraftIntelligence: a.feature_club_draft_intelligence,
      knowledgeCenter: a.feature_knowledge_center,
      nilMarketingManagement: a.feature_nil_marketing_management,
      socialContentTools: a.feature_social_content_tools,
      calendar: a.feature_calendar,
      agreements: a.feature_agreements,
      deliverables: a.feature_deliverables,
    },
  };
}

export { mapAthlete };
export default router;
