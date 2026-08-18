import React, { useState } from "react";
import api from "../lib/api";

const MLB_CLUBS = [
  "Arizona Diamondbacks", "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
  "Chicago Cubs", "Chicago White Sox", "Cincinnati Reds", "Cleveland Guardians",
  "Colorado Rockies", "Detroit Tigers", "Houston Astros", "Kansas City Royals",
  "Los Angeles Angels", "Los Angeles Dodgers", "Miami Marlins", "Milwaukee Brewers",
  "Minnesota Twins", "New York Mets", "New York Yankees", "Oakland Athletics",
  "Philadelphia Phillies", "Pittsburgh Pirates", "San Diego Padres", "San Francisco Giants",
  "Seattle Mariners", "St. Louis Cardinals", "Tampa Bay Rays", "Texas Rangers",
  "Toronto Blue Jays", "Washington Nationals",
];

const RESEARCH_MODES = [
  "Club Draft Strategy Overview",
  "Pick-by-Pick Tendencies",
  "Bonus Pool & Payment Behavior",
  "Player Type & Profile Analysis",
  "Region & Pipeline Analysis",
  "Club Comparisons",
  "Draft Outcome / Historical Success",
];

export default function ClubWorkspace({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [club, setClub] = useState("Boston Red Sox");
  const [draftYears, setDraftYears] = useState("2015 - 2026");
  const [pickRange, setPickRange] = useState("20 - 60");
  const [analysisDepth, setAnalysisDepth] = useState("standard");
  const [compClubs, setCompClubs] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    const title = `${club} — Picks ${pickRange}`;

    const res = await api.post<{ report_ref: string }>("/reports", {
      type: "club",
      title,
      description: `${club} historical draft and payment behavior for picks ${pickRange}`,
      researchQuestion: `How has ${club} historically drafted and compensated players in the picks ${pickRange} range?`,
      researchParams: {
        club,
        draftYears,
        pickRange,
        analysisDepth,
        compClubs,
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
          <span className="text-teal text-xl">⬢</span>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
            CLUB DRAFT INTELLIGENCE
          </h1>
        </div>
        <p className="text-text-secondary text-sm">
          Analyze how MLB organizations have historically drafted and paid players.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          {/* Research focus */}
          <div className="diq-card p-5">
            <div className="diq-label mb-4">RESEARCH FOCUS</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-text-secondary mb-1 block">MLB Club</label>
                <select
                  value={club}
                  onChange={(e) => setClub(e.target.value)}
                  className="diq-select w-full"
                >
                  {MLB_CLUBS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Draft Years</label>
                <input
                  value={draftYears}
                  onChange={(e) => setDraftYears(e.target.value)}
                  className="diq-input text-sm"
                  placeholder="2015 - 2026"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Pick Range</label>
                <input
                  value={pickRange}
                  onChange={(e) => setPickRange(e.target.value)}
                  className="diq-input text-sm"
                  placeholder="20 - 60"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Analysis Depth</label>
                <select
                  value={analysisDepth}
                  onChange={(e) => setAnalysisDepth(e.target.value)}
                  className="diq-select w-full"
                >
                  <option value="overview">Overview</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep Dive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Optional Comparison Clubs (up to 3)</label>
                <div className="flex flex-wrap gap-1.5">
                  {MLB_CLUBS.slice(0, 6).map((c) => (
                    c !== club && (
                      <button
                        key={c}
                        onClick={() =>
                          setCompClubs((prev) =>
                            prev.includes(c)
                              ? prev.filter((x) => x !== c)
                              : prev.length < 3
                              ? [...prev, c]
                              : prev
                          )
                        }
                        className={`text-2xs px-2 py-1 rounded border transition-colors ${
                          compClubs.includes(c)
                            ? "bg-teal-muted border-teal-border text-teal"
                            : "border-bg-border text-text-secondary hover:border-teal-border"
                        }`}
                      >
                        {c}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* What will be included */}
          <div className="diq-card p-4">
            <div className="diq-label mb-3">WHAT THIS REPORT WILL INCLUDE</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { title: "Draft History Overview", desc: "Picks by year, positions, HS vs college, conference & region" },
                { title: "Payment Behavior", desc: "Verified bonuses only — over/under/full slot analysis" },
                { title: "Bonus Pool Allocation", desc: "Pick values, verified spending, known overages" },
                { title: "Pick-Range Analysis", desc: `Historical profiles and tendencies for picks ${pickRange}` },
                { title: "Comparable Selections", desc: "Real players from approved datasets only" },
                { title: "OSM Interpretation", desc: "Analysis derived from verified historical record" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2">
                  <span className="text-teal mt-0.5 flex-shrink-0">✓</span>
                  <div>
                    <div className="text-xs font-medium text-text-primary">{item.title}</div>
                    <div className="text-2xs text-text-muted">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence rules reminder */}
          <div className="diq-card p-4 bg-bg-surface">
            <div className="flex items-start gap-3">
              <span className="text-status-pending text-lg flex-shrink-0">⚠</span>
              <div>
                <div className="text-xs font-semibold text-text-primary mb-1">Evidence Standards Applied</div>
                <div className="text-xs text-text-secondary">
                  This report uses only verified draft history, reported signing bonuses, and official slot values.
                  Unreported bonuses are shown as "unavailable." Club intentions and private scouting preferences are never fabricated.
                  If additional information is needed, an Intelligence Request will be created for OSM Admin.
                </div>
              </div>
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
            {generating ? "GENERATING..." : `GENERATE ${club.toUpperCase()} REPORT →`}
          </button>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="diq-card p-4">
            <div className="diq-label mb-3">RESEARCH MODES</div>
            <div className="space-y-1.5">
              {RESEARCH_MODES.map((m) => (
                <div
                  key={m}
                  className="text-xs text-text-secondary p-2 rounded hover:bg-bg-hover hover:text-teal transition-colors cursor-pointer flex items-center justify-between group"
                >
                  <span>{m}</span>
                  <span className="text-text-muted group-hover:text-teal">›</span>
                </div>
              ))}
            </div>
          </div>

          <div className="diq-card p-4 bg-teal-muted border-teal-border">
            <div className="diq-label mb-2">DATA SOURCES USED</div>
            <div className="space-y-1.5 text-xs text-text-secondary">
              <div className="flex items-start gap-1.5"><span className="text-text-green mt-0.5">✓</span> Verified draft history</div>
              <div className="flex items-start gap-1.5"><span className="text-text-green mt-0.5">✓</span> Reported signing bonuses</div>
              <div className="flex items-start gap-1.5"><span className="text-text-green mt-0.5">✓</span> Official slot values</div>
              <div className="flex items-start gap-1.5"><span className="text-text-green mt-0.5">✓</span> Verified bonus pool data</div>
              <div className="flex items-start gap-1.5"><span className="text-text-green mt-0.5">✓</span> OSM proprietary intelligence</div>
            </div>
            <div className="mt-3 text-2xs text-text-muted">
              Club intentions, private scouting preferences, and current-year undisclosed bonuses are never fabricated.
            </div>
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
