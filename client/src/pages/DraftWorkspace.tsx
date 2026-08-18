import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { heightDisplay } from "../lib/utils";
import api from "../lib/api";

const RESEARCH_MODES: { key: string; label: string; description: string; variables: string[] }[] = [
  {
    key: "players_like_me",
    label: "Players Like Me",
    description:
      "Find historical players who match your physical profile, position, level, and draft class — then see where they were drafted and what they signed for. All comparables are drawn from verified historical records.",
    variables: ["Position", "Height / Weight", "Level", "Conference", "Draft Years", "Round Range"],
  },
  {
    key: "draft_outcomes",
    label: "Draft Outcomes",
    description:
      "Examine historical draft selection patterns for players matching your profile criteria. Results reflect actual historical outcomes — not predictions about your draft position.",
    variables: ["Position", "Level", "Conference", "Ranking Range", "Draft Years", "Round Range"],
  },
  {
    key: "signing_bonuses",
    label: "Signing Bonuses",
    description:
      "Review verified historical signing bonus data for comparable players. Where reported bonuses are available, DiamondIQ will show the historical range and median. This is historical context, not a bonus prediction.",
    variables: ["Position", "Level", "Conference", "Draft Years", "Round Range"],
  },
  {
    key: "rankings_vs_outcomes",
    label: "Rankings vs. Outcomes",
    description:
      "Explore how pre-draft rankings have historically correlated with actual draft selection rounds. Based on verified public ranking and draft data from the research window.",
    variables: ["Position", "Level", "Ranking Source / Range", "Draft Years"],
  },
  {
    key: "school_conference",
    label: "School / Conference",
    description:
      "Analyze historical draft and signing trends at a specific school, conference, or program type. Useful context when weighing transfer or commitment decisions.",
    variables: ["School / Conference", "Position", "Level", "Draft Years", "Round Range"],
  },
  {
    key: "position_trends",
    label: "Position Trends",
    description:
      "Review macro draft trends by position — how many players at your position were drafted per year, in which rounds, and how that has shifted over time.",
    variables: ["Position", "Draft Years", "Round Range"],
  },
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
];

export default function DraftWorkspace({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { athlete } = useAuth();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [mode, setMode] = useState("players_like_me");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const builderRef = useRef<HTMLDivElement>(null);

  const [params, setParams] = useState({
    position: athlete?.position || "",
    heightRange: athlete?.heightIn
      ? `${Math.max(60, athlete.heightIn - 2)}" – ${athlete.heightIn + 2}"`
      : "",
    weightRange: athlete?.weightLbs
      ? `${Math.max(150, athlete.weightLbs - 15)} – ${athlete.weightLbs + 15} lbs`
      : "",
    level: athlete?.level || "College",
    conference: athlete?.conference || "",
    ranking: "Any",
    draftYears: "2015 – 2026",
    draftRounds: "1 – 20",
  });

  const updateParam = (key: string, val: string) =>
    setParams((prev) => ({ ...prev, [key]: val }));

  const openBuilder = () => {
    setBuilderOpen(true);
    setTimeout(() => {
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const selectedMode = RESEARCH_MODES.find((m) => m.key === mode)!;

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    const modeLabel = selectedMode.label;
    const confLabel = params.conference || "All Conf";
    const title = `${modeLabel} — ${confLabel} ${params.position} ${params.draftYears}`;

    const res = await api.post<{ report_ref: string }>("/reports", {
      type: "draft",
      title,
      description: `Draft research: ${modeLabel}`,
      researchQuestion: `Historical analysis of ${modeLabel.toLowerCase()} for ${params.position} players${
        params.conference ? ` from the ${params.conference}` : ""
      } drafted ${params.draftYears}.`,
      researchParams: params,
      researchMode: mode,
    });

    setGenerating(false);
    if (res.ok) {
      onNavigate(`/reports/${(res.data as Record<string, string>).report_ref}`);
    } else {
      setError((res as { ok: false; error: string }).error || "Failed to generate investigation");
    }
  };

  const athleteInfo = athlete
    ? [
        { label: "Position", value: athlete.position || "—" },
        { label: "Height / Weight", value: athlete.heightIn ? `${heightDisplay(athlete.heightIn)} / ${athlete.weightLbs} lbs` : "—" },
        { label: "Bats / Throws", value: athlete.bats ? `${athlete.bats} / ${athlete.throws}` : "—" },
        { label: "Draft Year", value: athlete.draftYear?.toString() || "—" },
        { label: "School", value: athlete.school || "—" },
        { label: "Conference", value: athlete.conference || "—" },
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
          Build custom draft research, analyze historical outcomes, and uncover the insights that matter.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main column */}
        <div className="col-span-2 space-y-6">

          {/* Entry choice cards */}
          <div>
            <div className="diq-label mb-3">CHOOSE HOW YOU WANT TO RESEARCH</div>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`diq-card p-5 transition-colors ${builderOpen ? "border-teal-border bg-teal-muted" : ""}`}
              >
                <div className="text-teal text-2xl mb-3">⊞</div>
                <div className="font-semibold text-text-primary text-sm mb-1">BUILD AN INVESTIGATION</div>
                <p className="text-text-secondary text-xs mb-4">
                  Use the guided research builder to configure variables and run a custom historical investigation.
                </p>
                <button
                  onClick={openBuilder}
                  className="diq-btn-primary text-xs"
                >
                  {builderOpen ? "BUILDER OPEN ↓" : "START BUILDING"}
                </button>
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
          </div>

          {/* ── GUIDED BUILDER (revealed by START BUILDING) ── */}
          {builderOpen && (
            <div ref={builderRef} className="space-y-5">

              {/* Evidence-First notice */}
              <div className="flex items-start gap-3 p-4 bg-teal-muted border border-teal-border rounded">
                <span className="text-teal text-lg flex-shrink-0">🔬</span>
                <div className="text-xs text-text-secondary leading-relaxed">
                  <span className="text-teal font-semibold">Evidence-First research. </span>
                  All results are drawn from verified historical data. DiamondIQ does not predict draft position, generate
                  tool grades, or fabricate information. When data is missing or unverifiable, it will be clearly labelled.
                  Your investigation will be reviewed by your OSM team before you can read it.
                </div>
              </div>

              {/* Research mode selector */}
              <div>
                <div className="diq-label mb-2">WHAT ARE YOU INVESTIGATING?</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {RESEARCH_MODES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        mode === m.key
                          ? "bg-teal-muted border-teal-border text-teal"
                          : "border-bg-border text-text-secondary hover:border-teal-border hover:text-teal"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Mode description + variables */}
                <div className="p-4 bg-bg-surface border border-bg-border rounded space-y-2">
                  <div className="text-xs text-text-primary leading-relaxed">{selectedMode.description}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-2xs text-text-muted mr-1">Key variables:</span>
                    {selectedMode.variables.map((v) => (
                      <span key={v} className="text-2xs bg-bg-elevated text-text-secondary px-2 py-0.5 rounded border border-bg-border">{v}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Athlete profile auto-fill */}
              <div className="diq-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="diq-label">YOUR PROFILE (AUTO-APPLIED)</div>
                  <button onClick={() => onNavigate("/profile")} className="diq-btn-ghost text-xs">
                    EDIT PROFILE ✏
                  </button>
                </div>
                {athlete ? (
                  <div className="grid grid-cols-3 gap-y-2 gap-x-4 text-xs">
                    {athleteInfo.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="text-text-muted flex-shrink-0">{item.label}:</span>
                        <span className="text-text-primary font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted">
                    No profile data. <button onClick={() => onNavigate("/profile")} className="text-teal underline">Complete your profile</button> for better auto-fill.
                  </div>
                )}
                {(!athlete?.position || !athlete?.school) && (
                  <div className="mt-3 flex items-start gap-2 text-2xs text-status-pending bg-status-pending/10 border border-status-pending/30 rounded px-3 py-2">
                    <span className="flex-shrink-0">⚠</span>
                    <span>
                      Your profile is incomplete. OSM has been notified. A more complete profile produces better comparable matches.{" "}
                      <button onClick={() => onNavigate("/profile")} className="underline">Update profile →</button>
                    </span>
                  </div>
                )}
              </div>

              {/* Research parameters */}
              <div className="diq-card p-4">
                <div className="diq-label mb-4">CONFIGURE RESEARCH PARAMETERS</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Position</label>
                    <select
                      value={params.position}
                      onChange={(e) => updateParam("position", e.target.value)}
                      className="diq-select w-full text-xs"
                    >
                      <option value="">Any Position</option>
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
                      placeholder={`e.g. 72" – 76"`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Weight Range</label>
                    <input
                      value={params.weightRange}
                      onChange={(e) => updateParam("weightRange", e.target.value)}
                      className="diq-input text-xs"
                      placeholder="e.g. 180 – 215 lbs"
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
                    <label className="text-xs text-text-secondary mb-1 block">Pre-Draft Ranking</label>
                    <select
                      value={params.ranking}
                      onChange={(e) => updateParam("ranking", e.target.value)}
                      className="diq-select w-full text-xs"
                    >
                      {["Any", "Top 30", "BA 31–100", "BA 101–200", "Unranked"].map((r) => (
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
                      placeholder="2015 – 2026"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Round Range</label>
                    <select
                      value={params.draftRounds}
                      onChange={(e) => updateParam("draftRounds", e.target.value)}
                      className="diq-select w-full text-xs"
                    >
                      {["1 – 5", "1 – 10", "1 – 20", "All Rounds"].map((r) => (
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

                {/* What this investigation will produce */}
                <div className="mt-5 p-3 bg-bg-surface border border-bg-border rounded text-2xs text-text-secondary space-y-1">
                  <div className="text-text-primary font-semibold text-xs mb-1.5">What this investigation produces</div>
                  <div className="flex items-start gap-2"><span className="text-text-green flex-shrink-0">✓</span><span>Historical comparable players matching your parameters</span></div>
                  <div className="flex items-start gap-2"><span className="text-text-green flex-shrink-0">✓</span><span>Verified historical draft selections and reported signing bonuses</span></div>
                  <div className="flex items-start gap-2"><span className="text-text-green flex-shrink-0">✓</span><span>Historical base-rate counts — not round probabilities or predictions</span></div>
                  <div className="flex items-start gap-2"><span className="text-text-muted flex-shrink-0">✗</span><span>No composite scores, generated tool grades, or signability percentages</span></div>
                  <div className="flex items-start gap-2"><span className="text-text-muted flex-shrink-0">✗</span><span>Any fabricated or unverifiable information</span></div>
                  <div className="mt-2 pt-2 border-t border-bg-border flex items-start gap-2 text-status-pending">
                    <span className="flex-shrink-0">🔒</span>
                    <span>Your OSM team reviews this investigation before you can read it. You will see a pending notice until it is published.</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="text-xs text-text-secondary">
                    Research mode: <span className="text-teal font-medium">{selectedMode.label}</span>
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

            </div>
          )}

          {/* Recent investigations (always visible) */}
          <div>
            <div className="diq-label mb-2">RECENT DRAFT INVESTIGATIONS</div>
            <div className="text-xs text-text-muted">
              {builderOpen
                ? "Generate your first investigation using the builder above."
                : "Click START BUILDING above to configure and run a custom draft investigation."}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="diq-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="diq-label">POPULAR DRAFT QUESTIONS</div>
            </div>
            <p className="text-2xs text-text-muted mb-3">
              Based on questions asked by athletes across DiamondIQ.
            </p>
            <div className="space-y-2">
              {POPULAR_QUESTIONS.map((q, i) => (
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
                "Narrower filters produce more directly comparable players",
                "Use Ask DiamondIQ for open-ended or complex questions",
              ].map((tip) => (
                <div key={tip} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-text-green mt-0.5">✓</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="diq-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-status-pending text-sm">ℹ</span>
              <div className="diq-label">ABOUT YOUR REPORT</div>
            </div>
            <div className="text-2xs text-text-secondary space-y-2">
              <p>Every investigation is reviewed by your OSM team before you can read it.</p>
              <p>If additional verified information is needed to complete the analysis, OSM will be notified and you will see a notice in the report.</p>
              <p className="text-text-muted">Questions? Contact your OSM representative.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between">
        <div className="text-2xs text-text-muted">
          🔒 Your data is secure and never shared. Results are based on verified historical data and proprietary DiamondIQ sources.
        </div>
        <div className="text-teal font-condensed text-xs tracking-widest font-semibold">
          GOOD DAY FOR THE BRAND.
        </div>
      </div>
    </div>
  );
}
