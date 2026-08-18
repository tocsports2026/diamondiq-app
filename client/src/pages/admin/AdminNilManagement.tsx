import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface Agreement {
  id: number;
  brand: string;
  status: string;
  athlete_id: number;
  first_name: string;
  last_name: string;
  start_date: string | null;
  end_date: string | null;
  completion_progress: number;
  next_obligation: string | null;
}

export default function AdminNilManagement() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [deliverables, setDeliverables] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Agreement[]>("/nil/agreements"),
      api.get<unknown[]>("/nil/deliverables"),
    ]).then(([a, d]) => {
      if (a.ok) setAgreements(a.data);
      if (d.ok) setDeliverables(d.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">NIL MANAGEMENT</h1>
        <p className="text-text-secondary text-sm mt-1">Agency-wide NIL agreement and obligation overview.</p>
      </div>

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="diq-card p-4">
            <div className="diq-label mb-3">ACTIVE AGREEMENTS</div>
            {agreements.filter(a => a.status === "active").length === 0 ? (
              <div className="text-text-muted text-sm py-4 text-center">No active agreements.</div>
            ) : (
              <div className="space-y-2">
                {agreements.filter(a => a.status === "active").map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
                    <div>
                      <div className="text-sm font-medium text-text-primary">{a.first_name} {a.last_name} — {a.brand}</div>
                      {a.next_obligation && <div className="text-xs text-status-pending">Next: {a.next_obligation}</div>}
                    </div>
                    <div className="text-xs text-text-secondary">{a.completion_progress}% complete</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="diq-card p-4">
            <div className="diq-label mb-2">DELIVERABLES OVERVIEW</div>
            <div className="text-xs text-text-secondary">
              {deliverables.length} deliverables on file. Use athlete view for individual management.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
