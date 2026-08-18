import { Request, Response, NextFunction } from "express";
import { UserRole } from "../../shared/types";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    userRole?: UserRole;
    athleteId?: number | null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  if (req.session.userRole !== "osm_admin") {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  if (
    req.session.userRole !== "osm_admin" &&
    req.session.userRole !== "osm_staff"
  ) {
    return res.status(403).json({ ok: false, error: "Staff access required" });
  }
  next();
}
