import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { formatDate, formatDateShort, heightDisplay } from "../lib/utils";

interface UpcomingEvent {
  id: number;
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  organization: string | null;
  days_until: number;
}

interface RecentReport {
  id: number;
  report_ref: string;
  type: string;
  title: string;
  status: string;
  generated_at: string;
}

const typeIcon: Record<string, string> = {
  appearance: "🎤",
  signing: "✍️",
  post: "📱",
  payment: "💰",
  meeting: "📅",
  shoot: "📸",
  other: "📌",
};

const reportTypeColors: Record<string, string> = {
  draft: "text-teal",
  nil: "text-status-updated",
  club: "text-status-pending",
};
const reportTypeLabels: Record<string, string> = {
  draft: "Draft Intelligence",
  nil: "NIL Intelligence",
  club: "Club Draft Intelligence",
};

export default function HomePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user, athlete } = useAuth();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [reports, setReports] = useState<RecentReport[]>([]);

  useEffect(() => {
    api.get<UpcomingEvent[]>("/nil/calendar").then((r) => {
      if (r.ok) setEvents(r.data.slice(0, 6));
    });
    api.get<RecentReport[]>("/reports").then((r) => {
      if (r.ok) setReports(r.data.slice(0, 5));
    });
  }, []);

  const ft = athlete?.featureToggles;
  const showUpcoming = ft?.calendar || ft?.nilMarketingManagement;

  const heightStr = athlete?.heightIn ? heightDisplay(athlete.heightIn) : null;
  const displayName = athlete
    ? `${athlete.firstName} ${athlete.lastName}`
    : user?.name || "Athlete";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header welcome */}
      <div className="flex items-start gap-6 mb-8">
        <div className="flex-1">
          <div className="diq-label mb-1">WELCOME BACK,</div>
          <h1 className="font-condensed text-4xl font-bold text-text-primary tracking-wide mb-3">
            {displayName.toUpperCase()}
          </h1>

          <div className="flex flex-wrap gap-4 text-sm text-text-secondary mb-3">
            {athlete?.position && (
              <span className="font-medium text-text-primary">{athlete.position}</span>
            )}
            {heightStr && (
              <span>{heightStr} | {athlete?.weightLbs} LBS</span>
            )}
            {athlete?.bats && athlete.throws && (
              <span>B/T: {athlete.bats} / {athlete.throws}</span>
            )}
            {athlete?.draftYear && <span>Age {new Date().getFullYear() - (athlete.draftYear - 21)}</span>}
          </div>

          <div className="space-y-1 text-sm text-text-secondary">
            {athlete?.school && (
              <div className="flex items-center gap-2">
                <span className="text-text-muted">🏫</span>
                <span>{athlete.school}</span>
              </div>
            )}
            {athlete?.draftYear && (
              <div className="flex items-center gap-2">
                <span className="text-text-muted">📅</span>
                <span>Class of {athlete.draftYear}</span>
              </div>
            )}
            {athlete?.hometown && (
              <div className="flex items-center gap-2">
                <span className="text-text-muted">📍</span>
                <span>{athlete.hometown}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate("/profile")}
            className="diq-btn-ghost mt-3 text-xs"
          >
            VIEW FULL PROFILE →
          </button>
        </div>

        {/* Avatar placeholder */}
        <div className="w-20 h-20 rounded-full bg-bg-surface border border-bg-border flex items-center justify-center text-text-muted flex-shrink-0">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      </div>

      {/* Description */}
      <p className="text-text-secondary text-sm mb-8 max-w-lg">
        DiamondIQ gives you access to OSM's proprietary research, historical data, and market intelligence so you can make smarter decisions throughout your baseball career.
      </p>

      {/* Intelligence entry cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <IntelCard
          icon="⬡"
          title="DRAFT INTELLIGENCE"
          desc="Investigate historical MLB Draft outcomes using the variables that matter to you."
          cta="START DRAFT RESEARCH"
          onClick={() => onNavigate("/draft")}
          enabled={ft?.draftIntelligence !== false}
        />
        <IntelCard
          icon="◎"
          title="NIL INTELLIGENCE"
          desc="Explore NIL opportunities, markets, schools, and brand potential to maximize your value."
          cta="EXPLORE NIL MARKETS"
          onClick={() => onNavigate("/nil")}
          enabled={ft?.nilIntelligence !== false}
        />
        <IntelCard
          icon="⬢"
          title="CLUB DRAFT INTELLIGENCE"
          desc="Analyze MLB club draft trends, bonus history and payment behavior to understand team tendencies."
          cta="ANALYZE CLUBS"
          onClick={() => onNavigate("/club")}
          enabled={ft?.clubDraftIntelligence !== false}
        />
      </div>

      {/* Ask DiamondIQ bar */}
      <div className="diq-card p-5 mb-8">
        <div className="flex items-start gap-3 mb-3">
          <div className="text-teal text-xl">💬</div>
          <div>
            <div className="font-semibold text-text-primary text-sm">ASK DIAMONDIQ</div>
            <div className="text-text-secondary text-xs">Get answers, run analysis, or generate custom reports.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask anything about draft research, NIL markets, club trends, or scenarios..."
            className="diq-input flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") onNavigate("/ask");
            }}
            readOnly
            onClick={() => onNavigate("/ask")}
          />
          <button
            onClick={() => onNavigate("/ask")}
            className="diq-btn-primary px-4"
          >
            →
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {["Draft Comparables", "Club Tendencies", "Bonus Pool Lookup", "NIL Market Analysis", "School Impact"].map((q) => (
            <button
              key={q}
              onClick={() => onNavigate("/ask")}
              className="text-2xs border border-bg-border text-text-secondary px-2.5 py-1 rounded hover:border-teal-border hover:text-teal transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom grid: Upcoming + Recent Reports */}
      <div className={`grid gap-6 ${showUpcoming ? "grid-cols-2" : "grid-cols-1"}`}>
        {/* Upcoming */}
        {showUpcoming && (
          <div className="diq-card p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="diq-label">UPCOMING</div>
              <button onClick={() => onNavigate("/calendar")} className="diq-btn-ghost text-xs">
                VIEW CALENDAR →
              </button>
            </div>
            {events.length === 0 ? (
              <div className="text-text-muted text-sm py-4 text-center">No upcoming events</div>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-bg-surface flex items-center justify-center text-sm flex-shrink-0">
                      {typeIcon[ev.type] || "📌"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary font-medium truncate">{ev.title}</div>
                      <div className="text-xs text-text-secondary truncate">{ev.organization}</div>
                      {ev.event_time && <div className="text-xs text-text-muted">{ev.event_time}{ev.location ? ` • ${ev.location}` : ""}</div>}
                    </div>
                    <div className="text-xs text-text-secondary text-right flex-shrink-0">
                      <div className="text-text-primary font-medium">{ev.days_until} DAYS</div>
                      <div className="text-text-muted">{formatDateShort(ev.event_date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => onNavigate("/calendar")} className="mt-4 w-full diq-btn-ghost text-xs justify-center">
              VIEW FULL CALENDAR →
            </button>
          </div>
        )}

        {/* Recent Reports */}
        <div className="diq-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="diq-label">RECENT REPORTS</div>
            <button onClick={() => onNavigate("/reports")} className="diq-btn-ghost text-xs">
              VIEW ALL →
            </button>
          </div>
          {reports.length === 0 ? (
            <div className="text-text-muted text-sm py-4 text-center">No reports yet</div>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 border-b border-bg-border last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-text-muted text-xs">📄</span>
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">{r.title}</div>
                      <div className={`text-2xs ${reportTypeColors[r.type] || "text-text-secondary"}`}>
                        {reportTypeLabels[r.type] || r.type}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <div className="text-2xs text-text-muted">{formatDateShort(r.generated_at)}</div>
                    <button
                      onClick={() => onNavigate(`/reports/${r.report_ref}`)}
                      className="diq-btn-ghost text-xs"
                    >
                      OPEN
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer tagline */}
      <div className="mt-8 pt-4 border-t border-bg-border flex items-center justify-between">
        <div className="text-2xs text-text-muted">
          All data and insights are proprietary to O'Connell Sports Management.
        </div>
        <div className="text-teal font-condensed text-xs tracking-widest font-semibold">
          GOOD DAY FOR THE BRAND.
        </div>
      </div>
    </div>
  );
}

function IntelCard({
  icon, title, desc, cta, onClick, enabled,
}: {
  icon: string;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  enabled: boolean;
}) {
  return (
    <div className={`diq-card p-5 flex flex-col gap-4 ${!enabled ? "opacity-40" : ""}`}>
      <div className="text-teal text-2xl">{icon}</div>
      <div>
        <div className="font-condensed font-bold text-lg text-text-primary tracking-wide mb-2">
          {title}
        </div>
        <p className="text-text-secondary text-xs leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={enabled ? onClick : undefined}
        disabled={!enabled}
        className="diq-btn-ghost text-xs mt-auto disabled:opacity-50"
      >
        {cta} →
      </button>
    </div>
  );
}
