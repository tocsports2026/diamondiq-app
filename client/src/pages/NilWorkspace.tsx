import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";

const RESEARCH_MODES = [
  { key: "market_opportunity", label: "Market Opportunity Analysis", desc: "Find overall NIL opportunities in your market" },
  { key: "target_businesses", label: "Target Businesses", desc: "Identify specific businesses to approach" },
  { key: "decision_makers", label: "Decision Makers", desc: "Find key contacts & how to reach them" },
  { key: "deal_ideas", label: "Deal Ideas & Concepts", desc: "Custom NIL concepts for you" },
  { key: "market_comparison", label: "Market Comparison", desc: "Compare schools or cities" },
  { key: "nil_ecosystem", label: "NIL Ecosystem", desc: "Collectives, channels & infrastructure" },
  { key: "precedent_research", label: "Precedent Research", desc: "Real athlete/business examples" },
];

const OPPORTUNITY_TYPES = [
  "Appearances", "Signings", "Social Content", "Camps / Clinics",
  "Brand Partnerships", "Events", "Signature Item", "Other",
];

export default function NilWorkspace({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { athlete } = useAuth();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "Appearances", "Signings", "Social Content",
  ]);
  const [timeframe, setTimeframe] = useState(`Fall ${new Date().getFullYear()} – Spring ${new Date().getFullYear() + 1}`);
  const [radius, setRadius] = useState("25");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const toggleType = (t: string) =>
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    const market = athlete?.school || "Primary Market";
    const title = `${market} NIL Opportunity Analysis`;

    const res = await api.post<{ report_ref: string }>("/reports", {
      type: "nil",
      title,
      description: `NIL market opportunity research for ${market}`,
      researchQuestion: `What are the most realistic NIL opportunities for a ${athlete?.position || "baseball"} player in the ${market} area?`,
      researchParams: {
        market,
        timeframe,
        radius,
        opportunityTypes: selectedTypes,
      },
    });
    setGenerating(false);
    if (res.ok) {
      onNavigate(`/reports/${(res.data as Record<string, string>).report_ref}`);
    } else {
      setError(res.error || "Failed to generate report");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-teal text-xl">◎</span>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
            NIL INTELLIGENCE
          </h1>
        </div>
        <p className="text-text-secondary text-sm">Find NIL opportunities. Build relationships. Maximize your earning potential.</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Research workspace title */}
          <div className="diq-card p-5">
            <div className="font-condensed font-bold text-lg text-text-primary mb-1">NIL INTELLIGENCE RESEARCH WORKSPACE</div>
            <p className="text-text-secondary text-sm mb-4">Define your focus and let DiamondIQ uncover the best NIL opportunities for you.</p>

            {/* Flow steps */}
            <div className="flex items-center gap-3 text-xs text-text-secondary overflow-x-auto pb-2">
              {[
                { n: "①", label: "DEFINE FOCUS", sub: "Who, where & what", active: true },
                { n: "→", label: "", sub: "" },
                { n: "⊙", label: "RESEARCH", sub: "DiamondIQ investigates" },
                { n: "→", label: "", sub: "" },
                { n: "✓", label: "ANALYZE", sub: "Identify opportunities" },
                { n: "→", label: "", sub: "" },
                { n: "📋", label: "REPORT", sub: "Actionable pitch plan" },
              ].map((s, i) =>
                s.label === "" ? (
                  <span key={i} className="text-text-muted flex-shrink-0">→</span>
                ) : (
                  <div key={i} className={`text-center flex-shrink-0 ${s.active ? "text-teal" : ""}`}>
                    <div className="font-medium">{s.label}</div>
                    <div className="text-text-muted text-2xs">{s.sub}</div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Research focus */}
          <div className="diq-card p-4">
            <div className="text-sm font-semibold text-teal mb-4">① YOUR RESEARCH FOCUS</div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Athlete (Auto-filled)</label>
                <div className="diq-input text-xs flex items-center gap-2">
                  <span className="text-text-primary">
                    {athlete ? `${athlete.firstName} ${athlete.lastName}` : "—"}
                  </span>
                  <span className="text-text-muted text-2xs">
                    {athlete?.school} • {athlete?.position}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">School / Primary Market</label>
                <div className="diq-input text-xs">
                  {athlete?.school || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Research Timeframe</label>
                <input
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="diq-input text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Search Radius (miles)</label>
                <select
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  className="diq-select w-full text-xs"
                >
                  {["10", "25", "50", "100", "National"].map((r) => (
                    <option key={r} value={r}>{r === "National" ? "National" : `~${r} Miles`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-2 block">Opportunity Types (Select all that apply)</label>
                <div className="flex flex-wrap gap-1.5">
                  {OPPORTUNITY_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleType(t)}
                      className={`text-2xs px-2 py-1 rounded border transition-colors ${
                        selectedTypes.includes(t)
                          ? "bg-teal-muted border-teal-border text-teal"
                          : "border-bg-border text-text-secondary hover:border-teal-border"
                      }`}
                    >
                      {selectedTypes.includes(t) && "✓ "}{t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* What DiamondIQ knows */}
          <div className="diq-card p-4">
            <div className="text-sm font-semibold text-teal mb-4">② DIAMONDIQ CURRENTLY KNOWS</div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "ATHLETE PROFILE", status: athlete ? "Complete" : "Incomplete", ok: !!athlete },
                { label: "SCHOOL CONTEXT", status: athlete?.school ? "Verified" : "Missing", ok: !!athlete?.school },
                { label: "MARKET DATA", status: "Available", ok: true },
                { label: "OSM INTELLIGENCE", status: "Available", ok: true },
              ].map((item) => (
                <div key={item.label} className="diq-card p-3 text-center">
                  <div className="text-2xl mb-2">{item.ok ? "👤" : "⚠️"}</div>
                  <div className="text-2xs font-semibold text-text-secondary uppercase tracking-wide">{item.label}</div>
                  <div className={`text-2xs mt-1 font-medium ${item.ok ? "text-text-green" : "text-text-amber"}`}>
                    {item.status} {item.ok ? "✓" : ""}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-2xs text-text-secondary">
              DiamondIQ will use verified public sources + OSM intelligence to build your NIL opportunity report.
            </div>
          </div>

          {/* Additional info needed */}
          <div className="diq-card p-4 border-status-pending/20">
            <div className="text-sm font-semibold text-status-pending mb-1">
              ③ ADDITIONAL INFORMATION NEEDED <span className="font-normal text-text-secondary">(To Improve Accuracy)</span>
            </div>
            <p className="text-xs text-text-secondary mb-4">
              DiamondIQ will not guess or assume. The following information would improve the accuracy and depth of your report.
              Your OSM team has been notified. You will be updated when this information is available.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Current Social Media Analytics", desc: "Follower counts, engagement rates, and audience demographics." },
                { label: "Existing NIL / Brand Deals (Outside Collective)", desc: "Active agreements that may create conflicts or exclusivity." },
                { label: "Endorsement Category Restrictions", desc: "Categories or industries we should avoid." },
                { label: "Travel Preference / Radius", desc: "Willingness to travel beyond the primary search radius." },
                { label: "Availability Windows", desc: "Days/times available for appearances, signings, and events." },
                { label: "Personal Interests / Causes", desc: "Community causes, hobbies, or personal brands to align with partnerships." },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2 p-2 rounded bg-bg-surface">
                  <div className="text-lg flex-shrink-0">ℹ️</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary">{item.label}</div>
                    <div className="text-2xs text-text-secondary mt-0.5">{item.desc}</div>
                  </div>
                  <button className="text-teal text-2xs font-medium flex-shrink-0">WHY IT MATTERS</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between p-3 bg-bg-surface rounded border border-bg-border">
              <div>
                <div className="text-xs font-medium text-text-primary">NEED HELP DEFINING THIS?</div>
                <div className="text-2xs text-text-secondary">Book a call with your OSM team to refine your goals and this research focus.</div>
              </div>
              <button className="diq-btn-secondary text-xs">📅 SCHEDULE A CALL</button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-text-red bg-text-red/10 border border-text-red/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="diq-btn-primary w-full justify-center text-sm disabled:opacity-50"
          >
            {generating ? "GENERATING..." : "GENERATE NIL INTELLIGENCE REPORT →"}
          </button>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="diq-card p-4">
            <div className="diq-label mb-3">RESEARCH MODES</div>
            <div className="space-y-2">
              {RESEARCH_MODES.map((m) => (
                <button
                  key={m.key}
                  className="w-full text-left p-2 rounded hover:bg-bg-hover transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs font-medium text-text-primary group-hover:text-teal">{m.label}</div>
                    <div className="text-2xs text-text-muted">{m.desc}</div>
                  </div>
                  <span className="text-text-muted group-hover:text-teal">›</span>
                </button>
              ))}
            </div>
          </div>

          <div className="diq-card p-4">
            <div className="diq-label mb-3">HOW DIAMONDIQ RESEARCHES</div>
            <div className="space-y-2">
              {[
                "Searches thousands of public sources",
                "Analyzes local & regional business data",
                "Identifies proven NIL & marketing activity",
                "Applies OSM proprietary intelligence",
                "Finds true decision makers (where public)",
                "Builds actionable pitch plans",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-teal mt-0.5">✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="diq-card p-4 bg-teal-muted border-teal-border">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-teal">🛡</span>
              <div className="diq-label">EVIDENCE-FIRST AI STANDARD</div>
            </div>
            <p className="text-xs text-text-secondary">
              DiamondIQ never guesses or fabricates. If we can't verify something, we will tell you and request OSM input.
            </p>
            <button className="diq-btn-ghost text-xs mt-2">Learn more about our AI standard →</button>
          </div>
        </div>
      </div>

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
