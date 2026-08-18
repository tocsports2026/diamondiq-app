import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import pool, { initDb } from "./db";
import authRoutes from "./routes/auth";
import athleteRoutes from "./routes/athletes";
import reportRoutes from "./routes/reports";
import adminRoutes from "./routes/admin";
import knowledgeRoutes from "./routes/knowledge";
import nilRoutes from "./routes/nil";
import queryRoutes from "./routes/query";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

const PgSession = connectPgSimple(session);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Session
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || "diamondiq-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/athletes", athleteRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/nil", nilRoutes);
app.use("/api/query", queryRoutes);

// Serve official branding asset (read-only)
app.use(
  "/assets",
  express.static(path.join(process.cwd(), "assets"), {
    index: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

// Serve client build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(process.cwd(), "dist/client")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "dist/client/index.html"));
  });
}

async function start() {
  try {
    await initDb();
    const { seedIfEmpty } = await import("./db/seed");
    await seedIfEmpty();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`DiamondIQ server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
