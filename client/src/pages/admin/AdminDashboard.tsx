import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface DashboardData {
  activeClients: number;
  pendingReports: number;
  openRequests: number;
  incompleteDatasets: number;
  pendingReportsList: Array<{
    id: number; report_ref: string; type: string; title: string;
    generated_at: string; first_name: string; last_name: string;
  }>;
  requestsList: Array<{
    id: number; question: string; priority: string;
    first_name: string; last_name: string; created_at: string;
  }>;
}

export default function AdminDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get<DashboardData>("/admin/dashboard").then((r) => {
      if (r.ok) setData(r.data);
    });
  }, []);

  if (!data) return <div className="p-6 text-text-muted text-sm">Loading dashboard...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          OSM ADMIN DASHBOARD
        </h1>
        <p className="text-text-secondary text-sm mt-1">Platform overview and action items.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="ACTIVE CLIENTS" value={data.activeClients} />
        <StatCard label="REPORTS PENDING REVIEW" value={data.pendingReports} alert={data.pendingReports > 0} onClick={() => onNavigate("/admin/reports")} />
        <StatCard label="OPEN INTEL REQUESTS" value={data.openRequests} alert={data.openRequests > 0} onClick={() => onNavigate("/admin/requests")} />
        <StatCard label="INCOMPLETE DATASETS" value={data.incompleteDatasets} alert={data.incompleteDatasets > 0} onClick={() => onNavigate("/admin/data")} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Pending Reports */}
        <div className="diq-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="diq-label text-status-pending">REPORTS PENDING REVIEW</div>
            <button onClick={() => onNavigate("/admin/reports")} className="diq-btn-ghost text-xs">VIEW ALL →</button>
          </div>
          {data.pendingReportsList.length === 0 ? (
            <div className="text-text-muted text-sm py-4 text-center">No pending reports</div>
          ) : (
            <div className="space-y-2">
              {data.pendingReportsList.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text-primary truncate">{r.title}</div>
                    <div className="text-2xs text-text-secondary">{r.first_name} {r.last_name} • {r.type}</div>
                  </div>
                  <div className="text-2xs text-text-muted flex-shrink-0 ml-2">{formatDateShort(r.generated_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Intel Requests */}
        <div className="diq-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="diq-label text-status-pending">INTELLIGENCE REQUESTS</div>
            <button onClick={() => onNavigate("/admin/requests")} className="diq-btn-ghost text-xs">VIEW ALL →</button>
          </div>
          {data.requestsList.length === 0 ? (
            <div className="text-text-muted text-sm py-4 text-center">No open requests</div>
          ) : (
            <div className="space-y-2">
              {data.requestsList.map((r) => (
                <div key={r.id} className="py-2 border-b border-bg-border last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-text-primary truncate">{r.question}</div>
                    <span className={`diq-badge flex-shrink-0 ${r.priority === "high" ? "bg-text-red/10 text-text-red border-text-red/30" : "diq-badge-pending"}`}>
                      {r.priority}
                    </span>
                  </div>
                  <div className="text-2xs text-text-secondary mt-0.5">{r.first_name} {r.last_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Create New Client", path: "/admin/clients", desc: "Add athlete access" },
          { label: "Review Reports", path: "/admin/reports", desc: "Publish pending reports" },
          { label: "Data Library", path: "/admin/data", desc: "Upload datasets" },
        ].map((item) => (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className="diq-card p-4 text-left hover:bg-bg-elevated transition-colors"
          >
            <div className="text-sm font-semibold text-teal mb-1">{item.label}</div>
            <div className="text-xs text-text-secondary">{item.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, alert, onClick }: {
  label: string; value: number; alert?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`diq-card p-4 text-center ${onClick ? "hover:bg-bg-elevated transition-colors cursor-pointer" : "cursor-default"}`}
    >
      <div className={`text-3xl font-bold font-condensed mb-1 ${alert && value > 0 ? "text-status-pending" : "text-text-primary"}`}>
        {value}
      </div>
      <div className="text-2xs text-text-secondary uppercase tracking-wider">{label}</div>
    </button>
  );
}
