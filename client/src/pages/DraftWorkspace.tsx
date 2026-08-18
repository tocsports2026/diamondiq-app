import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { heightDisplay } from "../lib/utils";
import api from "../lib/api";

const RESEARCH_MODES = [
  { key: "players_like_me", label: "Players Like Me" },
  { key: "draft_outcomes", label: "Draft Outcomes" },
  { key: "signing_bonuses", label: "Signing Bonuses" },
  { key: "rankings_vs_outcomes", label: "Rankings vs Outcomes" },
  { key: "school_conference", label: "School / Conference" },
  { key: "position_trends", label: "Position Trends" },
];

const POPULAR_QUESTIONS = [
  "Show me players similar to my profile and where they were drafted.",
  "What did players like me historically sign for?",
  "Show me players from my conference drafted at my position over the last 10 years.",
  "How does being ranked in my current range historically correlate with draft position?",
  "Which MLB clubs draft players with my profile most often?",
  "Which clubs have historically paid the most over slot in my projected draft range?",
  "Show me how teams have allocated their bonus pools across their first 10 picks.",
  "Compare historical draft and signing outcomes of players from my school with similar programs.",
  "Which NIL markets offer the strongest realistic opportunities for an athlete with my profile?",
  "Compare NIL opportunities between the schools or markets I am considering.",
];

export default function DraftWorkspace({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { athlete } = useAuth();
  const [mode, setMode] = useState("players_like_me");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Research params (auto-filled from athlete profile)
  const [params, setParams] = useState({
    position: athlete?.position || "",
    heightRange: athlete?.heightIn
      ? `${Math.max(60, athlete.heightIn - 2)}" - ${athlete.heightIn + 2}"`
      : "",
    weightRange: athlete?.weightLbs
      ? `${Math.max(150, athlete.weightLbs - 15)} - ${athlete.weightLbs + 15} lbs`
      : "",
    level: athlete?.level || "College",
    conference: athlete?.conference || "",
    ranking: "",
    draftYears: "2015 - 2026",
    draftRounds: "1 - 20",
  });

  const updateParam = (key: string, val: string) =>
    setParams((prev) => ({ ...prev, [key]: val }));

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    const modeLabel = RESEARCH_MODES.find((m) => m.key === mode)?.label || mode;
    const title = `${modeLabel} — ${params.conference || "All Conf"} ${params.position} ${params.draftYears}`;

    const res = await api.post<{ report_ref: string }>("/reports", {
      type: "draft",
      title,
      description: `Draft research: ${modeLabel}`,
      researchQuestion: `Historical analysis of ${modeLabel.toLowerCase()} for ${params.position} players${params.conference ? ` from the ${params.conference}` : ""} drafted ${params.draftYears}.`,
      researchParams: params,
    });
    setGenerating(false);
    if (res.ok) {
      onNavigate(`/reports/${(res.data as Record<string, string>).report_ref}`);
    } else {
      setError(res.error || "Failed to generate report");
    }
  };

  const athleteInfo = athlete
    ? [
        { label: "Primary Position", value: athlete.position },
        { label: "Height / Weight", value: athlete.heightIn ? `${heightDisplay(athlete.heightIn)} / ${athlete.weightLbs} lbs` : "—" },
        { label: "Bats / Throws", value: athlete.bats ? `${athlete.bats} / ${athlete.throws}` : "—" },
        { label: "Class", value: athlete.draftYear?.toString() || "—" },
        { label: "School", value: athlete.school || "—" },
        { label: "Conference", value: athlete.conference || "—" },
        { label: "Location", value: athlete.hometown || "—" },
      ]
    : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-teal text-xl">⬡</span>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
            DRAFT INTELLIGENCE
          </h1>
        </div>
        <p className="text-text-secondary text-sm">
          Build custom draft research, analyze outcomes, and uncover the insights that matter.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main column */}
        <div className="col-span-2 space-y-6">
          {/* Entry choice */}
          <div className="diq-label mb-3">CHOOSE HOW YOU WANT TO RESEARCH</div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="diq-card p-5">
              <div className="text-teal text-2xl mb-3">⊞</div>
              <div className="font-semibold text-text-primary text-sm mb-1">BUILD AN INVESTIGATION</div>
              <p className="text-text-secondary text-xs mb-4">
                Use our guided research builder to configure variables and run custom investigations.
              </p>
              <button className="diq-btn-primary text-xs">START BUILDING</button>
            </div>
            <div className="diq-card p-5">
              <div className="text-teal text-2xl mb-3">💬</div>
              <div className="font-semibold text-text-primary text-sm mb-1">ASK A DRAFT QUESTION</div>
              <p className="text-text-secondary text-xs mb-4">
                Ask anything about the draft in natural language and DiamondIQ will do the research for you.
              </p>
              <button
                onClick={() => onNavigate("/ask")}
                className="diq-btn-secondary text-xs"
              >
                ASK DIAMONDIQ
              </button>
            </div>
          </div>

          {/* Research mode tabs */}
          <div className="diq-label mb-2">WHAT ARE YOU INVESTIGATING?</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {RESEARCH_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  mode === m.key
                    ? "bg-teal-muted border border-teal-border text-teal"
                    : "border border-bg-border text-text-secondary hover:border-teal-border hover:text-teal"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-text-secondary mb-4">
            Find historical players similar to your profile and see their draft outcomes.
          </p>

          {/* Athlete profile auto-fill */}
          <div className="diq-card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="diq-label">YOUR PROFILE (AUTO-APPLIED)</div>
              <button
                onClick={() => onNavigate("/profile")}
                className="diq-btn-ghost text-xs"
              >
                EDIT PROFILE ✏
              </button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
              {athleteInfo.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-text-muted w-24 flex-shrink-0">{item.label}</span>
                  <span className="text-text-primary font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Research parameters */}
          <div className="diq-card p-4">
            <div className="diq-label mb-4">RESEARCH PARAMETERS</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Position</label>
                <select
                  value={params.position}
                  onChange={(e) => updateParam("position", e.target.value)}
                  className="diq-select w-full text-xs"
                >
                  {["RHP", "LHP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "OF"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Height Range</label>
                <input
                  value={params.heightRange}
                  onChange={(e) => updateParam("heightRange", e.target.value)}
                  className="diq-input text-xs"
                  placeholder={`6'0" - 6'4"`}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Weight Range</label>
                <input
                  value={params.weightRange}
                  onChange={(e) => updateParam("weightRange", e.target.value)}
                  className="diq-input text-xs"
                  placeholder="180 - 215 lbs"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Level</label>
                <select
                  value={params.level}
                  onChange={(e) => updateParam("level", e.target.value)}
                  className="diq-select w-full text-xs"
                >
                  {["College", "High School", "JUCO", "Independent", "Any"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Conference</label>
                <select
                  value={params.conference}
                  onChange={(e) => updateParam("conference", e.target.value)}
                  className="diq-select w-full text-xs"
                >
                  {["", "SEC", "ACC", "Big 12", "Big Ten", "Pac-12", "AAC", "Sun Belt", "Any"].map((c) => (
                    <option key={c} value={c}>{c || "Any"}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Ranking</label>
                <select
                  value={params.ranking}
                  onChange={(e) => updateParam("ranking", e.target.value)}
                  className="diq-select w-full text-xs"
                >
                  {["Any", "Top 30", "BA 31-100", "BA 101-200", "Unranked"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Draft Years</label>
                <input
                  value={params.draftYears}
                  onChange={(e) => updateParam("draftYears", e.target.value)}
                  className="diq-input text-xs"
                  placeholder="2015 - 2026"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Draft Rounds</label>
                <select
                  value={params.draftRounds}
                  onChange={(e) => updateParam("draftRounds", e.target.value)}
                  className="diq-select w-full text-xs"
                >
                  {["1 - 5", "1 - 10", "1 - 20", "All Rounds"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="mt-3 text-xs text-text-red bg-text-red/10 border border-text-red/30 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-text-secondary">
                Players matching current criteria: <span className="text-text-primary font-semibold">—</span>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="diq-btn-primary text-xs disabled:opacity-50"
              >
                {generating ? "GENERATING..." : "GENERATE INVESTIGATION →"}
              </button>
            </div>
          </div>

          {/* Recent investigations */}
          <div className="diq-label mb-2">RECENT DRAFT INVESTIGATIONS</div>
          <div className="text-xs text-text-muted">
            Your completed investigations will appear here. Generate your first investigation above.
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="diq-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="diq-label">POPULAR DRAFT QUESTIONS</div>
              <span className="text-text-muted text-xs">ⓘ</span>
            </div>
            <p className="text-2xs text-text-muted mb-3">
              Based on questions asked by athletes across DiamondIQ.
            </p>
            <div className="space-y-2">
              {POPULAR_QUESTIONS.slice(0, 8).map((q, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate("/ask")}
                  className="w-full text-left flex items-start gap-2 p-1.5 rounded hover:bg-bg-hover transition-colors"
                >
                  <span className="text-teal text-xs font-bold flex-shrink-0 w-4">{i + 1}</span>
                  <span className="text-xs text-text-secondary leading-relaxed">{q}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="diq-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-teal text-sm">💡</span>
              <div className="diq-label">RESEARCH TIPS</div>
            </div>
            <div className="space-y-2">
              {[
                "Be specific about years, positions, and ranges",
                "Add multiple filters to narrow your results",
                "Save templates for research you run often",
                "Use Ask DiamondIQ for complex questions",
              ].map((tip) => (
                <div key={tip} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-text-green mt-0.5">✓</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between">
        <div className="text-2xs text-text-muted">
          🔒 Your data is secure and never shared. Results are based on proprietary DiamondIQ data and trusted sources.
        </div>
        <div className="text-teal font-condensed text-xs tracking-widest font-semibold">
          GOOD DAY FOR THE BRAND.
        </div>
      </div>
    </div>
  );
}
