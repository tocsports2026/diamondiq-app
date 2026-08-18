import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface Request {
  id: number;
  question: string;
  missing_data: string;
  why_it_matters: string;
  recommended_action: string;
  priority: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  report_title: string | null;
  report_type: string | null;
}

export default function AdminIntelRequests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [responding, setResponding] = useState<number | null>(null);
  const [response, setResponse] = useState("");

  const load = () => {
    api.get<Request[]>(`/admin/intelligence-requests?status=${statusFilter}`).then((r) => {
      if (r.ok) setRequests(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { setLoading(true); load(); }, [statusFilter]);

  const handleRespond = async (reqId: number) => {
    await api.patch(`/admin/intelligence-requests/${reqId}/respond`, {
      adminResponse: response,
      status: "resolved",
    });
    setResponding(null);
    setResponse("");
    load();
  };

  const priorityColor: Record<string, string> = {
    high: "bg-text-red/10 text-text-red border-text-red/30",
    medium: "diq-badge-pending",
    low: "diq-badge-archived",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          INTELLIGENCE REQUESTS
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          System-generated requests for missing information that would improve report accuracy.
          Admin-only — not visible to athletes.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {[["open", "Open"], ["in_progress", "In Progress"], ["resolved", "Resolved"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            className={`px-3 py-1.5 rounded text-xs border transition-colors ${statusFilter === val ? "bg-teal-muted border-teal-border text-teal" : "border-bg-border text-text-secondary hover:border-teal-border"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">No requests in this status.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="diq-card p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`diq-badge ${priorityColor[r.priority] || "diq-badge-archived"}`}>
                      {r.priority.toUpperCase()}
                    </span>
                    <span className="text-xs text-text-secondary">{r.first_name} {r.last_name}</span>
                    {r.report_title && (
                      <span className="text-2xs text-text-muted">→ {r.report_title}</span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-text-primary mb-2">{r.question}</div>
                </div>
                <div className="text-2xs text-text-muted flex-shrink-0">{formatDateShort(r.created_at)}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
                <div>
                  <div className="text-text-muted mb-1">MISSING DATA</div>
                  <div className="text-text-secondary">{r.missing_data}</div>
                </div>
                <div>
                  <div className="text-text-muted mb-1">WHY IT MATTERS</div>
                  <div className="text-text-secondary">{r.why_it_matters}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-text-muted mb-1">RECOMMENDED ACTION</div>
                  <div className="text-text-secondary">{r.recommended_action}</div>
                </div>
              </div>

              {r.admin_response && (
                <div className="mt-3 p-3 bg-text-green/5 border border-text-green/20 rounded">
                  <div className="text-2xs text-text-green font-semibold mb-1">RESOLVED — ADMIN RESPONSE</div>
                  <div className="text-xs text-text-secondary">{r.admin_response}</div>
                </div>
              )}

              {r.status === "open" && (
                responding === r.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder="Describe the action taken or information provided..."
                      className="diq-input w-full h-20 resize-none text-xs"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleRespond(r.id)} className="diq-btn-primary text-xs">RESOLVE</button>
                      <button onClick={() => setResponding(null)} className="diq-btn-secondary text-xs">CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setResponding(r.id); setResponse(""); }}
                    className="mt-3 diq-btn-secondary text-xs"
                  >
                    RESPOND & RESOLVE
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
