import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { formatDateShort, cn } from "../lib/utils";

interface Agreement {
  id: number;
  brand: string;
  term: string | null;
  status: string;
  compensation_summary: string | null;
  next_obligation: string | null;
  completion_progress: number;
  start_date: string | null;
  end_date: string | null;
}

interface Deliverable {
  id: number;
  title: string;
  platform: string | null;
  due_date: string | null;
  status: string;
  required_tag: string | null;
  required_language: string | null;
}

interface CalendarEvent {
  id: number;
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  organization: string | null;
  days_until: number;
}

const TABS = ["overview", "calendar", "agreements", "deliverables", "content"] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  calendar: "Calendar",
  agreements: "Agreements",
  deliverables: "Deliverables",
  content: "Content & Social",
};

const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  scheduled: "SCHEDULED",
  content_needed: "CONTENT NEEDED",
  sent_to_brand: "SENT TO BRAND",
  awaiting_approval: "AWAITING APPROVAL",
  approved: "APPROVED",
  posted: "POSTED",
  completed: "COMPLETED",
};

const DELIVERABLE_STATUS_COLORS: Record<string, string> = {
  scheduled: "text-text-secondary border-bg-border",
  content_needed: "text-status-pending border-status-pending/30",
  sent_to_brand: "text-status-updated border-status-updated/30",
  awaiting_approval: "text-status-pending border-status-pending/30",
  approved: "text-text-green border-text-green/30",
  posted: "text-text-green border-text-green/30",
  completed: "text-text-muted border-text-muted/30",
};

export default function NilManagementPage({
  initialTab,
  onNavigate,
}: {
  initialTab?: string;
  onNavigate?: (p: string) => void;
}) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || "overview");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Agreement[]>("/nil/agreements"),
      api.get<Deliverable[]>("/nil/deliverables"),
      api.get<CalendarEvent[]>("/nil/calendar"),
    ]).then(([a, d, c]) => {
      if (a.ok) setAgreements(a.data);
      if (d.ok) setDeliverables(d.data);
      if (c.ok) setEvents(c.data);
      setLoading(false);
    });
  }, []);

  const upcomingEvents = events.filter((e) => e.days_until >= 0).slice(0, 10);
  const activeAgreements = agreements.filter((a) => a.status === "active");
  const pendingDeliverables = deliverables.filter((d) =>
    ["content_needed", "awaiting_approval", "scheduled"].includes(d.status)
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          NIL / MARKETING MANAGEMENT
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Manage your NIL agreements, deliverables, and upcoming obligations.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-bg-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === t
                ? "border-teal text-teal"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : (
        <>
          {/* Overview */}
          {tab === "overview" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="ACTIVE AGREEMENTS" value={activeAgreements.length.toString()} />
                <SummaryCard
                  label="UPCOMING OBLIGATIONS"
                  value={upcomingEvents.filter((e) => e.days_until <= 30).length.toString()}
                />
                <SummaryCard
                  label="DELIVERABLES DUE"
                  value={pendingDeliverables.length.toString()}
                  alert={pendingDeliverables.length > 0}
                />
                <SummaryCard
                  label="NEXT APPEARANCE"
                  value={
                    events.find((e) => e.type === "appearance" && e.days_until >= 0)
                      ? `${events.find((e) => e.type === "appearance" && e.days_until >= 0)!.days_until} DAYS`
                      : "—"
                  }
                />
              </div>

              {/* Active agreements */}
              {activeAgreements.length > 0 && (
                <div className="diq-card p-4">
                  <div className="diq-label mb-3">ACTIVE AGREEMENTS</div>
                  <div className="space-y-3">
                    {activeAgreements.map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
                        <div>
                          <div className="text-sm font-medium text-text-primary">{a.brand}</div>
                          {a.term && <div className="text-xs text-text-secondary">{a.term}</div>}
                          {a.next_obligation && (
                            <div className="text-xs text-status-pending mt-0.5">Next: {a.next_obligation}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-text-secondary mb-1">
                            {a.completion_progress}% complete
                          </div>
                          <div className="w-24 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal rounded-full"
                              style={{ width: `${a.completion_progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming */}
              {upcomingEvents.length > 0 && (
                <div className="diq-card p-4">
                  <div className="diq-label mb-3">UPCOMING</div>
                  <div className="space-y-2">
                    {upcomingEvents.slice(0, 5).map((e) => (
                      <div key={e.id} className="flex items-center justify-between py-1.5">
                        <div>
                          <div className="text-sm text-text-primary">{e.title}</div>
                          <div className="text-xs text-text-secondary">{e.organization}</div>
                        </div>
                        <div className="text-xs text-text-secondary text-right">
                          <div className="text-text-primary font-medium">{e.days_until} days</div>
                          <div className="text-text-muted">{formatDateShort(e.event_date)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calendar */}
          {tab === "calendar" && (
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-text-muted text-sm py-8 text-center">No calendar events.</div>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="diq-card p-4 flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded bg-bg-surface flex items-center justify-center text-lg flex-shrink-0">
                        {e.type === "appearance" ? "🎤" :
                         e.type === "signing" ? "✍️" :
                         e.type === "post" ? "📱" :
                         e.type === "payment" ? "💰" :
                         e.type === "shoot" ? "📸" : "📅"}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">{e.title}</div>
                        {e.organization && <div className="text-xs text-text-secondary">{e.organization}</div>}
                        {e.event_time && <div className="text-xs text-text-muted">{e.event_time}{e.location ? ` • ${e.location}` : ""}</div>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-text-primary">{e.days_until} DAYS</div>
                      <div className="text-xs text-text-muted">{formatDateShort(e.event_date)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Agreements */}
          {tab === "agreements" && (
            <div className="space-y-3">
              {agreements.length === 0 ? (
                <div className="text-text-muted text-sm py-8 text-center">No agreements on file.</div>
              ) : (
                agreements.map((a) => (
                  <div key={a.id} className="diq-card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{a.brand}</div>
                        {a.term && <div className="text-xs text-text-secondary">{a.term}</div>}
                      </div>
                      <span className={cn("diq-badge", a.status === "active" ? "diq-badge-published" : "diq-badge-archived")}>
                        {a.status.toUpperCase()}
                      </span>
                    </div>
                    {a.next_obligation && (
                      <div className="text-xs text-status-pending mb-2">Next obligation: {a.next_obligation}</div>
                    )}
                    {a.compensation_summary && (
                      <div className="text-xs text-text-secondary mb-3">{a.compensation_summary}</div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-text-muted">{a.completion_progress}% complete</div>
                      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                        <div className="h-full bg-teal rounded-full" style={{ width: `${a.completion_progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Deliverables */}
          {tab === "deliverables" && (
            <div className="space-y-3">
              {deliverables.length === 0 ? (
                <div className="text-text-muted text-sm py-8 text-center">No deliverables on file.</div>
              ) : (
                deliverables.map((d) => (
                  <div key={d.id} className="diq-card p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary mb-1">{d.title}</div>
                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        {d.platform && <span>{d.platform}</span>}
                        {d.due_date && <span>Due: {formatDateShort(d.due_date)}</span>}
                        {d.required_tag && <span>Tag: {d.required_tag}</span>}
                      </div>
                    </div>
                    <span className={cn(
                      "diq-badge flex-shrink-0 ml-3",
                      DELIVERABLE_STATUS_COLORS[d.status] || ""
                    )}>
                      {DELIVERABLE_STATUS_LABELS[d.status] || d.status.toUpperCase()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Content & Social */}
          {tab === "content" && (
            <div className="diq-card p-6 text-center">
              <div className="text-4xl mb-3">📱</div>
              <div className="font-condensed text-lg font-bold text-text-primary mb-2">
                CONTENT & SOCIAL
              </div>
              <p className="text-sm text-text-secondary max-w-md mx-auto">
                Connected social accounts and content execution tools appear here. This feature helps
                you execute approved OSM obligations — not replace professional social media management.
                Contact your OSM team to connect accounts.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label, value, alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="diq-card p-4 text-center">
      <div className={`text-2xl font-bold font-condensed mb-1 ${alert ? "text-status-pending" : "text-text-primary"}`}>
        {value}
      </div>
      <div className="text-2xs text-text-secondary uppercase tracking-wider">{label}</div>
    </div>
  );
}
