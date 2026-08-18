import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { formatDateShort, reportTypeLabel, reportTypeColor, cn } from "../lib/utils";

interface Report {
  id: number;
  report_ref: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  generated_at: string;
  published_at: string | null;
  updated_at: string;
}

const FILTERS = ["ALL", "DRAFT", "NIL", "CLUB", "PENDING", "PUBLISHED"] as const;

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    published: "diq-badge-published",
    pending: "diq-badge-pending",
    updated: "diq-badge-updated",
    archived: "diq-badge-archived",
  };
  return map[status] || "diq-badge";
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: "PENDING ANALYSIS",
    published: "PUBLISHED",
    updated: "UPDATED",
    archived: "ARCHIVED",
  };
  return map[status] || status.toUpperCase();
};

export default function MyReportsPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<typeof FILTERS[number]>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get<Report[]>("/reports").then((r) => {
      if (r.ok) setReports(r.data);
      setLoading(false);
    });
  }, []);

  const filtered = reports.filter((r) => {
    if (filter === "DRAFT" && r.type !== "draft") return false;
    if (filter === "NIL" && r.type !== "nil") return false;
    if (filter === "CLUB" && r.type !== "club") return false;
    if (filter === "PENDING" && r.status !== "pending") return false;
    if (filter === "PUBLISHED" && r.status !== "published") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          MY REPORTS
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          All of your DiamondIQ research in one place.
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports, markets, clubs, or research questions..."
          className="diq-input w-full"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded text-xs font-medium border transition-colors",
              filter === f
                ? "bg-teal-muted border-teal-border text-teal"
                : "border-bg-border text-text-secondary hover:border-teal-border hover:text-teal"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Report list */}
      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading reports...</div>
      ) : filtered.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">
          {search ? "No reports match your search." : "No reports yet. Generate your first report from the research workspaces."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="diq-card p-4 hover:bg-bg-elevated transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-semibold text-text-primary">{r.title}</h3>
                    <span className={statusBadge(r.status)}>{statusLabel(r.status)}</span>
                  </div>
                  <div className={`text-xs ${reportTypeColor(r.type)} mb-1`}>
                    {reportTypeLabel(r.type)}
                  </div>
                  {r.status === "pending" && (
                    <div className="text-xs text-status-pending mt-1">
                      Report content remains hidden until OSM Admin publishes it.
                    </div>
                  )}
                  {r.description && (
                    <div className="text-xs text-text-muted mt-1 truncate">{r.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-text-secondary">
                      {formatDateShort(r.published_at || r.generated_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate(`/reports/${r.report_ref}`)}
                    className="diq-btn-ghost text-xs"
                  >
                    OPEN →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between">
        <div className="text-2xs text-text-muted">
          Evidence-first. Athlete-first. Always.
        </div>
        <div className="text-teal font-condensed text-xs tracking-widest font-semibold">
          GOOD DAY FOR THE BRAND.
        </div>
      </div>
    </div>
  );
}
