import bcrypt from "bcryptjs";
import { query, queryOne } from "./index";

export async function seedIfEmpty() {
  const existing = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM users"
  );
  if (existing && parseInt(existing.count) > 0) {
    console.log("Database already seeded.");
    return;
  }

  console.log("Seeding database...");

  // Admin user
  const adminHash = await bcrypt.hash("DiamondIQ2024!", 12);
  const [adminUser] = await query<{ id: number }>(
    `INSERT INTO users (email, password_hash, role, name) VALUES ($1,$2,$3,$4) RETURNING id`,
    ["admin@ocmsports.com", adminHash, "osm_admin", "OSM Admin"]
  );

  // Demo athlete user
  const athleteHash = await bcrypt.hash("Athlete2024!", 12);
  const [athleteUser] = await query<{ id: number }>(
    `INSERT INTO users (email, password_hash, role, name) VALUES ($1,$2,$3,$4) RETURNING id`,
    ["jackson.miller@demo.com", athleteHash, "athlete", "Jackson Miller"]
  );

  // Athlete profile — Jackson Miller (fixture data only)
  const [athleteProfile] = await query<{ id: number }>(
    `INSERT INTO athlete_profiles
       (user_id, first_name, last_name, position, bats, throws, height_in, weight_lbs,
        school, conference, level, draft_year, hometown,
        feature_draft_intelligence, feature_nil_intelligence, feature_club_draft_intelligence,
        feature_knowledge_center, feature_nil_marketing_management, feature_social_content_tools,
        feature_calendar, feature_agreements, feature_deliverables)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE)
     RETURNING id`,
    [
      athleteUser.id,
      "Jackson",
      "Miller",
      "RHP",
      "R",
      "R",
      74, // 6'2"
      195,
      "University of Georgia",
      "SEC",
      "College",
      2026,
      "Peachtree City, Georgia",
    ]
  );

  const athleteId = athleteProfile.id;

  // Link user → athlete
  await query("UPDATE users SET athlete_id = $1 WHERE id = $2", [
    athleteId,
    athleteUser.id,
  ]);

  // Athlete rankings (fixture — labeled as development data)
  await query(
    `INSERT INTO athlete_rankings (athlete_id, source, ranking, ranking_date, source_record)
     VALUES ($1,$2,$3,$4,$5)`,
    [athleteId, "Baseball America", 87, "2026-01-15", "DEV FIXTURE — not verified production data"]
  );
  await query(
    `INSERT INTO athlete_rankings (athlete_id, source, ranking, ranking_date, source_record)
     VALUES ($1,$2,$3,$4,$5)`,
    [athleteId, "MLB Pipeline", 95, "2026-02-01", "DEV FIXTURE — not verified production data"]
  );

  // Published Draft Intelligence Report (fixture)
  const [draftReport] = await query<{ id: number }>(
    `INSERT INTO reports
       (report_ref, athlete_id, type, status, title, description, research_question, content, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
    [
      "DIQ-DEMO001",
      athleteId,
      "draft",
      "published",
      "Players Like Me — SEC RHP 2015–2026",
      "Historical comparables for SEC right-handed pitchers drafted 2015–2026",
      "How have historically comparable SEC RHP been drafted and what did verified comparables sign for?",
      JSON.stringify({
        sections: [
          {
            id: "research_question",
            title: "Research Question",
            content:
              "How have historically comparable SEC right-handed pitchers been drafted and what did verified comparables sign for?",
            evidenceLabel: "DiamondIQ Analysis / Inference",
          },
          {
            id: "applied_variables",
            title: "Applied Variables",
            content:
              "Position: RHP • Level: College • Conference: SEC • Draft Years: 2015–2026 • Height: 6'0\"–6'4\" • Weight: 180–215 lbs",
            evidenceLabel: "OSM-Provided Athlete Information",
          },
          {
            id: "draft_outcomes",
            title: "Historical Draft Outcomes",
            content: {
              type: "draft_outcomes",
              data: {
                note: "Calculated Result • Verified dataset • n = 42 comparables",
                disclaimer: "Historical base rates — not an athlete-specific prediction.",
                outcomes: [
                  { round: "Round 1", count: 9, total: 42 },
                  { round: "Rounds 2–3", count: 14, total: 42 },
                  { round: "Rounds 4–5", count: 11, total: 42 },
                  { round: "Later / Undrafted", count: 8, total: 42 },
                ],
                dataAvailability: "DEV FIXTURE — illustrative only, not production data.",
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
                comparableCount: 42,
                reportedBonusCount: 28,
                range: "$485,000 – $4,200,000",
                median: "$1,250,000",
                dataAvailability: "DEV FIXTURE — illustrative only.",
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
                players: [
                  {
                    name: "Comparable A [DEV]",
                    year: 2025,
                    school: "College SS / ACC",
                    draftPick: "Pick 31",
                    bonus: "Verified",
                    rationale:
                      "Included for level, position, physical profile, and research-filter match.",
                  },
                  {
                    name: "Comparable B [DEV]",
                    year: 2023,
                    school: "College SS / SEC",
                    draftPick: "Pick 44",
                    bonus: "Verified",
                    rationale:
                      "Included for level, position, physical profile, and research-filter match.",
                  },
                  {
                    name: "Comparable C [DEV]",
                    year: 2021,
                    school: "College INF / ACC",
                    draftPick: "Pick 57",
                    bonus: "Unavailable",
                    rationale:
                      "Included for level, position, physical profile, and research-filter match.",
                  },
                ],
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
          "Research conducted using verified public draft data, OSM proprietary datasets, and approved ranking sources. DEV FIXTURE: data is illustrative only and not verified production intelligence.",
        sources: [
          {
            label: "Verified Public Information",
            title: "MLB Draft historical results 2015–2026",
            notes: "DEV FIXTURE",
          },
          {
            label: "Verified Public Information",
            title: "Reported signing bonuses from public sources",
            notes: "DEV FIXTURE",
          },
        ],
      }),
    ]
  );

  // Pending NIL Report (fixture)
  await query(
    `INSERT INTO reports
       (report_ref, athlete_id, type, status, title, description, research_question)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      "DIQ-DEMO002",
      athleteId,
      "nil",
      "pending",
      "Chapel Hill NIL Opportunity Analysis",
      "NIL market opportunity research for University of North Carolina market",
      "What are the most realistic NIL opportunities for an SEC baseball player in the Chapel Hill / Triangle region?",
    ]
  );

  // Published Club Report (fixture)
  await query(
    `INSERT INTO reports
       (report_ref, athlete_id, type, status, title, description, research_question, content, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [
      "DIQ-DEMO003",
      athleteId,
      "club",
      "published",
      "Boston Red Sox — Picks 20–60",
      "Boston Red Sox historical draft and payment behavior for picks 20–60",
      "How has the Boston Red Sox historically drafted and compensated players in the picks 20–60 range?",
      JSON.stringify({
        sections: [
          {
            id: "executive_summary",
            title: "Executive Summary",
            content:
              "DEV FIXTURE: Historical Boston Red Sox draft tendencies for picks 20–60 (2015–2025). This is illustrative fixture data only — not verified production intelligence.",
            evidenceLabel: "DiamondIQ Analysis / Inference",
          },
          {
            id: "payment_behavior",
            title: "Payment Behavior",
            content: {
              type: "payment_behavior",
              data: {
                note: "Only verified bonus data shown. Unreported amounts shown as unavailable.",
                metrics: [
                  { label: "Average Signed Bonus (verified)", value: "DEV FIXTURE" },
                  { label: "Over-slot count", value: "DEV FIXTURE" },
                  { label: "Under-slot count", value: "DEV FIXTURE" },
                  { label: "Unavailable / Unreported", value: "DEV FIXTURE" },
                ],
                dataAvailability: "DEV FIXTURE — illustrative only.",
              },
            },
            evidenceLabel: "Verified Public Information",
          },
          {
            id: "osm_interpretation",
            title: "OSM Interpretation",
            content:
              "This section is OSM / DiamondIQ analysis derived from the verified historical record. DEV FIXTURE only.",
            evidenceLabel: "DiamondIQ Analysis / Inference",
          },
          {
            id: "sources",
            title: "Sources & Methodology",
            content:
              "All key figures traceable. DEV FIXTURE: production data to be loaded via Data Library.",
            evidenceLabel: "Verified Public Information",
          },
        ],
        methodology: "Club draft analysis using verified draft history and reported signing bonuses. DEV FIXTURE.",
        sources: [],
      }),
    ]
  );

  // Intelligence request (fixture)
  await query(
    `INSERT INTO intelligence_requests
       (athlete_id, question, missing_data, why_it_matters, recommended_action, priority)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      athleteId,
      "Social media analytics needed for NIL report DIQ-DEMO002",
      "Verified social media follower counts and engagement rates",
      "Accurate NIL opportunity assessment requires verified audience size for brand outreach targeting",
      "Athlete to provide social account access or verified analytics screenshot to OSM",
      "medium",
    ]
  );

  // Calendar events (fixture)
  const now = new Date();
  const events = [
    {
      title: "Collective Appearance",
      type: "appearance",
      days: 9,
      time: "6:00 PM",
      location: "Athens, GA",
      org: "UGA Baseball Collective",
    },
    {
      title: "Instagram Post Due",
      type: "post",
      days: 12,
      time: "4:00 PM",
      location: null,
      org: "Chick-fil-A Collaboration",
    },
    {
      title: "Card Signing",
      type: "signing",
      days: 15,
      location: "Atlanta, GA",
      org: "Fanatics Store Event",
    },
    {
      title: "NIL Payment",
      type: "payment",
      days: 23,
      location: null,
      org: "Rawlings Agreement",
    },
    {
      title: "Photo/Video Shoot",
      type: "shoot",
      days: 28,
      location: "Atlanta, GA",
      org: "New Balance Campaign",
    },
  ];

  for (const e of events) {
    const d = new Date(now);
    d.setDate(d.getDate() + (e.days || 5));
    await query(
      `INSERT INTO calendar_events (athlete_id, title, type, event_date, event_time, location, organization, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        athleteId,
        e.title,
        e.type,
        d.toISOString().slice(0, 10),
        e.time || null,
        e.location || null,
        e.org || null,
        "DEV FIXTURE — not verified production data",
      ]
    );
  }

  // NIL Agreement (fixture)
  const [agreement] = await query<{ id: number }>(
    `INSERT INTO nil_agreements
       (athlete_id, brand, term, status, compensation_summary, next_obligation,
        completion_progress, athlete_visible, internal_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      athleteId,
      "Rawlings [DEV]",
      "Jan 2026 – Dec 2026",
      "active",
      "DEV FIXTURE — not verified production compensation data",
      "Social post by end of month",
      60,
      true,
      "DEV FIXTURE agreement — not a real contract",
    ]
  );

  // Deliverable (fixture)
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 7);
  await query(
    `INSERT INTO nil_deliverables
       (agreement_id, athlete_id, title, platform, due_date, status,
        required_tag, required_language)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      agreement.id,
      athleteId,
      "Instagram post — spring campaign [DEV]",
      "Instagram",
      dueDate.toISOString().slice(0, 10),
      "content_needed",
      "@rawlings",
      "DEV FIXTURE — not verified contractual language",
    ]
  );

  // Knowledge Center articles (fixture)
  const articles = [
    {
      title: "MLB Draft Eligibility: What You Need to Know",
      category: "MLB Draft",
      summary:
        "A complete guide to understanding draft eligibility rules, timing, and advisor communication.",
      content:
        "DEV FIXTURE: This article will contain OSM's proprietary educational content about MLB draft eligibility. Content to be provided by OSM Admin.",
    },
    {
      title: "Understanding Slot Values and Bonus Pools",
      category: "Signing Bonuses",
      summary:
        "How slot values work, what is negotiable, and how bonus pools affect signing decisions.",
      content:
        "DEV FIXTURE: This article will contain OSM's proprietary educational content about slot values. Content to be provided by OSM Admin.",
    },
    {
      title: "NIL Fundamentals for College Athletes",
      category: "NIL & Marketing",
      summary:
        "Core NIL concepts, what you can and cannot do, and how OSM helps you navigate the landscape.",
      content:
        "DEV FIXTURE: This article will contain OSM's proprietary educational content about NIL. Content to be provided by OSM Admin.",
    },
    {
      title: "Minor League Baseball: Structure and Contracts",
      category: "Professional Baseball",
      summary:
        "How minor league contracts work, the level structure, and what to expect after signing.",
      content:
        "DEV FIXTURE: This article will contain OSM's proprietary educational content about minor league structure. Content to be provided by OSM Admin.",
    },
    {
      title: "Transfer Portal Considerations",
      category: "College / Transfer Decisions",
      summary:
        "Market visibility, program fit, and how transfer decisions interact with draft positioning.",
      content:
        "DEV FIXTURE: This article will contain OSM's proprietary educational content about transfer considerations. Content to be provided by OSM Admin.",
    },
  ];

  for (const a of articles) {
    await query(
      `INSERT INTO knowledge_articles (title, category, summary, content, is_published, published_at, assigned_to_all)
       VALUES ($1,$2,$3,$4,TRUE,NOW(),TRUE)`,
      [a.title, a.category, a.summary, a.content]
    );
  }

  // Popular questions seed
  const popularQs = [
    { q: "Show me players similar to my profile and where they were drafted.", scope: "draft" },
    { q: "What did players like me historically sign for?", scope: "draft" },
    { q: "Show me players from my conference drafted at my position over the last 10 years.", scope: "draft" },
    { q: "How does being ranked in my current range historically correlate with draft position?", scope: "draft" },
    { q: "Which MLB clubs draft players with my profile most often?", scope: "club" },
    { q: "Which clubs have historically paid the most over slot in my projected draft range?", scope: "club" },
    { q: "Show me how teams have allocated their bonus pools across their first 10 picks.", scope: "club" },
    { q: "Compare historical draft and signing outcomes of players from my school with similar programs.", scope: "draft" },
    { q: "Which NIL markets offer the strongest realistic opportunities for an athlete with my profile?", scope: "nil" },
    { q: "Compare NIL opportunities between the schools or markets I am considering.", scope: "nil" },
  ];

  for (const pq of popularQs) {
    await query(
      "INSERT INTO popular_questions (question_text, scope, use_count) VALUES ($1,$2,$3)",
      [pq.q, pq.scope, Math.floor(Math.random() * 50) + 5]
    );
    await query(
      "INSERT INTO popular_questions (question_text, scope, use_count) VALUES ($1,$2,$3)",
      [pq.q, "all", Math.floor(Math.random() * 30) + 2]
    );
  }

  // Data library entries (fixture)
  const datasets = [
    {
      title: "MLB Draft Results 2010–2026 [DEV]",
      category: "draft",
      source: "Baseball Reference / Baseball America (DEV FIXTURE)",
      yearsCovered: "2010–2026",
      recordCount: 14000,
      confidence: "strong",
    },
    {
      title: "Reported Signing Bonuses 2010–2026 [DEV]",
      category: "draft",
      source: "Baseball America / MLB.com (DEV FIXTURE)",
      yearsCovered: "2010–2026",
      recordCount: 8400,
      confidence: "moderate",
    },
    {
      title: "MLB Slot Values by Year [DEV]",
      category: "draft",
      source: "MLB.com Official (DEV FIXTURE)",
      yearsCovered: "2012–2026",
      recordCount: 420,
      confidence: "strong",
    },
    {
      title: "NIL Market Research — Southeast [DEV]",
      category: "nil",
      source: "OSM Proprietary Research (DEV FIXTURE)",
      yearsCovered: "2021–2026",
      recordCount: 340,
      confidence: "limited",
    },
    {
      title: "Club Draft History — AL East [DEV]",
      category: "club",
      source: "Baseball Reference (DEV FIXTURE)",
      yearsCovered: "2015–2026",
      recordCount: 2100,
      confidence: "moderate",
    },
  ];

  for (const ds of datasets) {
    await query(
      `INSERT INTO data_library (title, category, source, years_covered, record_count, confidence, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        ds.title,
        ds.category,
        ds.source,
        ds.yearsCovered,
        ds.recordCount,
        ds.confidence,
        "DEV FIXTURE — not verified production data. Load real OSM datasets via Data Library.",
      ]
    );
  }

  console.log("Seed complete.");
  console.log("Admin: admin@ocmsports.com / DiamondIQ2024!");
  console.log("Athlete: jackson.miller@demo.com / Athlete2024!");
}
