import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort, reportTypeLabel } from "../../lib/utils";

interface PendingReport {
  id: number;
  report_ref: string;
  type: string;
  status: string;
  title: string;
  generated_at: string;
  first_name: string;
  last_name: string;
}

export default function AdminReportReview({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const load = () => {
    api.get<PendingReport[]>(`/reports?status=${filter}`).then((r) => {
      if (r.ok) setReports(r.data.filter((rep) => filter === "all" || rep.status === filter));
      setLoading(false);
    });
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [filter]);

  const handlePublish = async (report: PendingReport) => {
    const res = await api.post(`/reports/${report.id}/publish`, {});
    if (res.ok) load();
  };

  const typeColor: Record<string, string> = {
    draft: "text-teal",
    nil: "text-status-updated",
    club: "text-status-pending",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">REPORT REVIEW</h1>
        <p className="text-text-secondary text-sm mt-1">
          Review and publish athlete reports. Every report is hidden from athletes until published.
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[["pending", "Pending Review"], ["published", "Published"], ["all", "All"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-3 py-1.5 rounded text-xs border transition-colors ${filter === val ? "bg-teal-muted border-teal-border text-teal" : "border-bg-border text-text-secondary hover:border-teal-border"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : reports.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">No reports in this category.</div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="diq-card p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-semibold text-text-primary truncate">{r.title}</h3>
                  <span className={`diq-badge ${r.status === "pending" ? "diq-badge-pending" : "diq-badge-published"}`}>
                    {r.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-text-secondary">
                  <span className={typeColor[r.type]}>{reportTypeLabel(r.type)}</span>
                  <span className="mx-2">•</span>
                  <span>{r.first_name} {r.last_name}</span>
                  <span className="mx-2">•</span>
                  <span>Generated {formatDateShort(r.generated_at)}</span>
                  <span className="mx-2">•</span>
                  <span className="text-text-muted">{r.report_ref}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={() => onNavigate(`/reports/${r.report_ref}`)}
                  className="diq-btn-secondary text-xs"
                >
                  REVIEW
                </button>
                {r.status === "pending" && (
                  <button
                    onClick={() => handlePublish(r)}
                    className="diq-btn-primary text-xs"
                  >
                    PUBLISH
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-bg-surface rounded border border-bg-border text-xs text-text-secondary">
        <div className="font-semibold text-text-primary mb-2">Admin Review Workflow</div>
        <div className="space-y-1">
          <div>1. Review the full internal report content</div>
          <div>2. For each section: Keep, Edit, Replace, or Hide using the section controls</div>
          <div>3. Add internal notes (never shown to athlete)</div>
          <div>4. When satisfied, click Publish — the athlete will then see the published version</div>
        </div>
        <div className="mt-2 text-text-amber">
          ⚠ Publishing makes the report immediately visible to the athlete. This action cannot be auto-undone.
        </div>
      </div>
    </div>
  );
}
