import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { formatDateShort } from "../lib/utils";

interface PopularQuestion {
  id: number;
  question_text: string;
  scope: string;
  use_count: number;
}

interface RecentQuery {
  scope: string;
  question_normalized: string;
  created_at: string;
}

const scopeIcons: Record<string, string> = {
  draft: "⬡",
  nil: "◎",
  club: "⬢",
  all: "◇",
};

const scopeLabels: Record<string, string> = {
  draft: "Draft Intelligence",
  nil: "NIL Intelligence",
  club: "Club Draft Intelligence",
  all: "All Intelligence",
};

export default function AskPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("all");
  const [popularQuestions, setPopularQuestions] = useState<PopularQuestion[]>([]);
  const [recentQueries, setRecentQueries] = useState<RecentQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ suggestedWorkspace: string; message: string } | null>(null);

  useEffect(() => {
    api.get<PopularQuestion[]>("/query/popular?scope=all").then((r) => {
      if (r.ok) setPopularQuestions(r.data);
    });
    api.get<RecentQuery[]>("/query/log").then((r) => {
      if (r.ok) setRecentQueries(r.data.slice(0, 5));
    });
  }, []);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    const res = await api.post<{ suggestedWorkspace: string; message: string }>("/query/ask", {
      question: question.trim(),
      scope,
    });
    setLoading(false);
    if (res.ok) {
      setResult(res.data);
    }
  };

  const handlePopularClick = (q: string) => {
    setQuestion(q);
    setResult(null);
  };

  const navigateToWorkspace = () => {
    if (!result) return;
    const map: Record<string, string> = {
      draft: "/draft",
      nil: "/nil",
      club: "/club",
    };
    onNavigate(map[result.suggestedWorkspace] || "/draft");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          ASK DIAMOND<span className="text-teal">IQ</span>
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Your research assistant. Get answers, create reports, and make smarter decisions.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main column */}
        <div className="col-span-2 space-y-6">
          {/* Question input */}
          <div className="diq-card p-5">
            <div className="diq-label mb-3">WHAT DO YOU WANT TO KNOW?</div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about draft research, NIL markets, club trends, or scenarios..."
              className="diq-input w-full h-28 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAsk();
              }}
            />
            <div className="flex items-center justify-between mt-3">
              <button className="text-xs text-text-secondary border border-bg-border rounded px-3 py-1.5 hover:border-teal-border hover:text-teal transition-colors">
                ⊕ ADD CONTEXT (Optional)
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="diq-select text-xs"
                >
                  <option value="all">All Intelligence</option>
                  <option value="draft">Draft Intelligence</option>
                  <option value="nil">NIL Intelligence</option>
                  <option value="club">Club Draft Intelligence</option>
                </select>
                <button
                  onClick={handleAsk}
                  disabled={loading || !question.trim()}
                  className="diq-btn-primary px-4 py-2 text-sm disabled:opacity-50"
                >
                  {loading ? "..." : "→"}
                </button>
              </div>
            </div>

            {/* Scope chips */}
            <div className="flex items-center gap-4 mt-4 text-xs text-text-secondary">
              <span className="text-text-muted">DiamondIQ can help you with:</span>
              {[
                { key: "draft", label: "Draft Research" },
                { key: "nil", label: "NIL Market Intelligence" },
                { key: "club", label: "Club Draft Analysis" },
              ].map((s) => (
                <div key={s.key} className="flex items-center gap-1">
                  <span className="text-teal">{scopeIcons[s.key]}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Result / routing */}
          {result && (
            <div className="diq-card p-5 border-teal-border bg-teal-muted">
              <div className="diq-label mb-2 text-teal">RESEARCH PATH IDENTIFIED</div>
              <p className="text-text-primary text-sm mb-4">{result.message}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={navigateToWorkspace}
                  className="diq-btn-primary text-sm"
                >
                  OPEN {(scopeLabels[result.suggestedWorkspace] || "Research Workspace").toUpperCase()} →
                </button>
                <span className="text-text-secondary text-xs">
                  Or use the research workspace to configure variables
                </span>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="diq-card p-5">
            <div className="diq-label mb-4">HOW IT WORKS</div>
            <div className="grid grid-cols-4 gap-4">
              {[
                { n: "1", label: "ASK", desc: "Type your question in natural language." },
                { n: "2", label: "ANALYZE", desc: "DiamondIQ searches our proprietary data and trusted sources." },
                { n: "3", label: "GENERATE", desc: "We create insights, analysis, and visual reports." },
                { n: "4", label: "ACT", desc: "Use your report to make smarter, more confident decisions." },
              ].map((s) => (
                <div key={s.n} className="text-center">
                  <div className="w-8 h-8 rounded-full bg-teal-muted border border-teal-border text-teal font-bold text-sm flex items-center justify-center mx-auto mb-2">
                    {s.n}
                  </div>
                  <div className="text-2xs font-bold text-text-teal uppercase tracking-wider mb-1">{s.label}</div>
                  <div className="text-2xs text-text-secondary leading-relaxed">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent queries */}
          {recentQueries.length > 0 && (
            <div className="diq-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="diq-label">RECENT QUERIES</div>
                <button className="diq-btn-ghost text-xs">VIEW ALL QUERIES →</button>
              </div>
              <div className="space-y-3">
                {recentQueries.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-bg-border last:border-0"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-text-muted text-xs">💬</span>
                      <span className="text-sm text-text-primary truncate">{q.question_normalized}</span>
                      <span className={`text-2xs ml-2 flex-shrink-0 ${scopeIcons[q.scope] ? "text-teal" : "text-text-secondary"}`}>
                        {scopeLabels[q.scope] || q.scope}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-2xs text-text-muted">{formatDateShort(q.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Most asked */}
          <div className="diq-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="diq-label">MOST ASKED IN DIAMONDIQ</div>
              <span className="text-text-muted text-xs">ⓘ</span>
            </div>
            <p className="text-2xs text-text-muted mb-3">
              Based on the most common questions asked by athletes across DiamondIQ.
            </p>
            <div className="space-y-2">
              {popularQuestions.slice(0, 10).map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => handlePopularClick(q.question_text)}
                  className="w-full text-left flex items-start gap-2.5 p-2 rounded hover:bg-bg-hover transition-colors"
                >
                  <span className="text-teal text-xs font-bold flex-shrink-0 w-4">{i + 1}</span>
                  <span className="text-xs text-text-secondary leading-relaxed">{q.question_text}</span>
                </button>
              ))}
            </div>
            <button className="diq-btn-ghost text-xs mt-3">VIEW ALL POPULAR QUESTIONS →</button>
          </div>

          {/* Tips */}
          <div className="diq-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-teal text-sm">💡</span>
              <div className="diq-label">TIPS FOR BETTER RESULTS</div>
            </div>
            <div className="space-y-2">
              {[
                "Be specific about years, positions, or conferences",
                'Add "compare" to see side-by-side analysis',
                "Include multiple details for more precise insights",
                "Upload documents or data to add more context",
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
        <div className="text-2xs text-text-muted flex items-center gap-1">
          🔒 Your data is secure and never shared. Results are based on proprietary DiamondIQ data and trusted sources.
        </div>
        <div className="text-teal font-condensed text-xs tracking-widest font-semibold">
          GOOD DAY FOR THE BRAND.
        </div>
      </div>
    </div>
  );
}
