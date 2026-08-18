import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateShort, getEvidenceClass, getEvidenceLabelShort, reportTypeLabel } from "../lib/utils";

interface ReportSection {
  id: string;
  title: string;
  content: string | Record<string, unknown>;
  evidenceLabel?: string;
  isHidden?: boolean;
  adminReview?: { decision: string; internalNote?: string };
}

interface ReportData {
  id: number;
  reportRef: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  researchQuestion: string | null;
  generatedAt: string;
  publishedAt: string | null;
  updatedAt: string;
  content: { sections: ReportSection[]; methodology?: string; sources?: unknown[] } | null;
  adminNotes?: string;
  isPending?: boolean;
}

export default function ReportViewPage({
  reportRef,
  onBack,
}: {
  reportRef: string | null;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const isStaff = user?.role === "osm_admin" || user?.role === "osm_staff";

  useEffect(() => {
    if (!reportRef) { setLoading(false); return; }
    api.get<ReportData>(`/reports/${reportRef}`).then((r) => {
      if (r.ok) {
        setReport(r.data);
        setAdminNotes(r.data.adminNotes || "");
      } else {
        setError(r.error || "Report not found");
      }
      setLoading(false);
    });
  }, [reportRef]);

  const handlePublish = async () => {
    if (!report) return;
    const res = await api.post(`/reports/${report.id}/publish`, { adminNotes });
    if (res.ok) {
      setReport((prev) => prev ? { ...prev, status: "published" } : prev);
    }
  };

  const handleSaveNotes = async () => {
    if (!report) return;
    setSavingNotes(true);
    await api.patch(`/reports/${report.id}/notes`, { adminNotes });
    setSavingNotes(false);
  };

  const handleSectionDecision = async (
    sectionId: string,
    decision: string,
    editedContent?: string,
    internalNote?: string
  ) => {
    if (!report) return;
    const res = await api.patch(`/reports/${report.id}/review`, {
      sectionId,
      decision,
      editedContent,
      internalNote,
    });
    if (res.ok) {
      setReport((prev) => {
        if (!prev?.content?.sections) return prev;
        return {
          ...prev,
          content: {
            ...prev.content,
            sections: prev.content.sections.map((s) =>
              s.id === sectionId
                ? { ...s, adminReview: { decision }, isHidden: decision === "hide" }
                : s
            ),
          },
        };
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-text-muted">
        Loading report...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="diq-btn-ghost text-xs mb-4">← BACK TO REPORTS</button>
        <div className="text-text-red text-sm">{error || "Report not found"}</div>
      </div>
    );
  }

  // Pending state for athlete
  if (report.isPending && !isStaff) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={onBack} className="diq-btn-ghost text-xs mb-6">← BACK TO REPORTS</button>
        <div className="diq-card p-5 mb-6">
          <ReportHeader report={report} />
        </div>
        {/* Pending overlay */}
        <div className="relative">
          <div className="pending-overlay diq-card p-8 space-y-4">
            <div className="h-4 bg-bg-elevated rounded w-3/4" />
            <div className="h-4 bg-bg-elevated rounded w-1/2" />
            <div className="h-4 bg-bg-elevated rounded w-2/3" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-8 bg-bg-card/95 rounded-lg border border-bg-border max-w-md mx-auto">
              <div className="font-condensed text-xl font-bold text-text-primary mb-2">
                PENDING ANALYSIS
              </div>
              <div className="text-sm text-status-pending font-medium mb-3">
                OSM Admin Review Required
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                DiamondIQ has completed the initial analysis. Your OSM team is reviewing the report
                for accuracy, context, and appropriate presentation. You will be notified when the
                report is ready.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sections = report.content?.sections || [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={onBack} className="diq-btn-ghost text-xs mb-6">← BACK TO REPORTS</button>

      {/* Report header */}
      <div className="diq-card p-5 mb-6">
        <ReportHeader report={report} />

        {/* Admin controls */}
        {isStaff && report.status === "pending" && (
          <div className="mt-4 pt-4 border-t border-bg-border">
            <div className="diq-label mb-2 text-status-pending">ADMIN REVIEW</div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePublish}
                className="diq-btn-primary text-xs"
              >
                ✓ PUBLISH REPORT
              </button>
              <span className="text-xs text-text-muted">
                Publishing makes this report visible to the athlete.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Admin notes */}
      {isStaff && (
        <div className="diq-card p-4 mb-6 border-status-pending/20 bg-status-pending/5">
          <div className="diq-label mb-2 text-status-pending">INTERNAL ADMIN NOTES</div>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Internal notes visible to OSM staff only — never shown to athlete..."
            className="diq-input w-full h-20 resize-none text-xs"
          />
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes}
            className="mt-2 diq-btn-secondary text-xs"
          >
            {savingNotes ? "Saving..." : "SAVE NOTES"}
          </button>
        </div>
      )}

      {/* Report sections */}
      <div className="space-y-4">
        {sections.filter((s) => !s.isHidden || isStaff).map((section) => (
          <ReportSection
            key={section.id}
            section={section}
            isStaff={isStaff}
            onDecision={handleSectionDecision}
          />
        ))}
      </div>

      {/* Methodology */}
      {report.content?.methodology && (
        <div className="diq-card p-4 mt-4">
          <div className="diq-label mb-2">SOURCES & METHODOLOGY</div>
          <p className="text-xs text-text-secondary">{report.content.methodology}</p>
          {Array.isArray(report.content.sources) && report.content.sources.length > 0 && (
            <div className="mt-3 space-y-1">
              {(report.content.sources as Array<{ label: string; title: string; notes?: string }>).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-2xs">
                  <span className={getEvidenceClass(s.label)}>{getEvidenceLabelShort(s.label)}</span>
                  <span className="text-text-secondary">{s.title}</span>
                  {s.notes && <span className="text-text-muted">({s.notes})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historical context warning (draft reports) */}
      {report.type === "draft" && (
        <div className="mt-4 p-3 bg-bg-surface rounded border border-bg-border text-xs text-text-secondary">
          Historical results provide context, not a guaranteed draft projection. Your OSM team will interpret these findings in the context of your individual situation.
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <div className="text-2xs text-text-muted">Evidence-first. Athlete-first. Always.</div>
        <div className="text-teal font-condensed text-xs tracking-widest font-semibold">
          GOOD DAY FOR THE BRAND.
        </div>
      </div>
    </div>
  );
}

function ReportHeader({ report }: { report: ReportData }) {
  const typeColors: Record<string, string> = {
    draft: "text-teal",
    nil: "text-status-updated",
    club: "text-status-pending",
  };

  return (
    <div>
      <div className={`text-xs font-semibold ${typeColors[report.type] || "text-text-secondary"} mb-1`}>
        {reportTypeLabel(report.type)}
      </div>
      <h1 className="font-condensed text-2xl font-bold text-text-primary tracking-wide mb-2">
        {report.title}
      </h1>
      {report.researchQuestion && (
        <p className="text-sm text-text-secondary mb-3">{report.researchQuestion}</p>
      )}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span>ID: {report.reportRef}</span>
        <span>Generated: {formatDateShort(report.generatedAt)}</span>
        {report.publishedAt && <span>Published: {formatDateShort(report.publishedAt)}</span>}
        <span className={`font-medium ${
          report.status === "published" ? "text-status-published" :
          report.status === "pending" ? "text-status-pending" :
          report.status === "updated" ? "text-status-updated" : "text-text-muted"
        }`}>
          {report.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function ReportSection({
  section,
  isStaff,
  onDecision,
}: {
  section: ReportSection;
  isStaff: boolean;
  onDecision: (id: string, decision: string, editedContent?: string, note?: string) => void;
}) {
  const [showAdminControls, setShowAdminControls] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [internalNote, setInternalNote] = useState(section.adminReview?.internalNote || "");

  const isHidden = section.isHidden || section.adminReview?.decision === "hide";
  const decision = section.adminReview?.decision;

  return (
    <div className={`diq-card p-5 ${isHidden && isStaff ? "opacity-50 border-text-red/20" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
          {isHidden && isStaff && (
            <span className="diq-badge bg-text-red/10 text-text-red border border-text-red/30">HIDDEN FROM ATHLETE</span>
          )}
          {decision === "edit" && <span className="diq-badge diq-badge-updated">EDITED</span>}
          {decision === "replace" && <span className="diq-badge diq-badge-updated">REPLACED</span>}
        </div>
        <div className="flex items-center gap-2">
          {section.evidenceLabel && (
            <span className={getEvidenceClass(section.evidenceLabel)} title={section.evidenceLabel}>
              {getEvidenceLabelShort(section.evidenceLabel)}
            </span>
          )}
          {isStaff && (
            <button
              onClick={() => setShowAdminControls(!showAdminControls)}
              className="text-2xs text-text-muted hover:text-status-pending transition-colors"
            >
              ⋯ REVIEW
            </button>
          )}
        </div>
      </div>

      {/* Section content */}
      <SectionContent content={section.content} />

      {/* Admin controls */}
      {isStaff && showAdminControls && (
        <div className="mt-4 pt-4 border-t border-bg-border bg-status-pending/5 rounded p-3">
          <div className="diq-label mb-3 text-status-pending">ADMIN REVIEW — SECTION: {section.title}</div>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => onDecision(section.id, "keep")}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${decision === "keep" ? "bg-text-green/20 border-text-green/50 text-text-green" : "border-bg-border text-text-secondary hover:border-text-green/50 hover:text-text-green"}`}
            >
              ✓ KEEP
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${decision === "edit" ? "bg-status-updated/20 border-status-updated/50 text-status-updated" : "border-bg-border text-text-secondary hover:border-status-updated/50"}`}
            >
              ✏ EDIT
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${decision === "replace" ? "bg-status-pending/20 border-status-pending/50 text-status-pending" : "border-bg-border text-text-secondary hover:border-status-pending/50"}`}
            >
              ↺ REPLACE
            </button>
            <button
              onClick={() => onDecision(section.id, "hide")}
              className="text-xs px-3 py-1.5 rounded border border-text-red/30 text-text-red hover:bg-text-red/10 transition-colors"
            >
              👁 HIDE
            </button>
          </div>

          {editMode && (
            <div className="space-y-2 mb-3">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                placeholder="Enter edited or replacement content..."
                className="diq-input w-full h-24 resize-none text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onDecision(section.id, "edit", editedContent, internalNote);
                    setEditMode(false);
                  }}
                  className="diq-btn-primary text-xs"
                >
                  APPLY EDIT
                </button>
                <button
                  onClick={() => {
                    onDecision(section.id, "replace", editedContent, internalNote);
                    setEditMode(false);
                  }}
                  className="diq-btn-secondary text-xs"
                >
                  APPLY REPLACEMENT
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-2xs text-text-muted mb-1 block">Internal note (not shown to athlete)</label>
            <input
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="Add internal note..."
              className="diq-input text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionContent({ content }: { content: string | Record<string, unknown> }) {
  if (typeof content === "string") {
    return <p className="text-sm text-text-secondary leading-relaxed">{content}</p>;
  }

  const type = content.type as string;
  const data = content.data as Record<string, unknown>;

  if (type === "draft_outcomes") {
    const outcomes = data.outcomes as Array<{ round: string; count: number | null; total: number | null }>;
    return (
      <div>
        {data.note && <div className="text-2xs text-teal mb-2">{data.note as string}</div>}
        <div className="space-y-2">
          {outcomes?.map((o) => (
            <div key={o.round} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
              <span className="text-sm text-text-primary">{o.round}</span>
              <span className="text-sm font-semibold text-text-primary">
                {o.count !== null && o.total !== null ? `${o.count} of ${o.total}` : "—"}
              </span>
            </div>
          ))}
        </div>
        {data.disclaimer && (
          <div className="mt-2 text-2xs text-status-pending">{data.disclaimer as string}</div>
        )}
        {data.dataAvailability && (
          <div className="mt-1 dev-fixture-notice">{data.dataAvailability as string}</div>
        )}
      </div>
    );
  }

  if (type === "bonus_range") {
    return (
      <div>
        {data.note && <div className="text-2xs text-teal mb-2">{data.note as string}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-surface rounded p-3">
            <div className="text-2xs text-text-muted mb-1">Comparable Count</div>
            <div className="text-lg font-bold text-text-primary">{data.comparableCount ?? "—"}</div>
          </div>
          <div className="bg-bg-surface rounded p-3">
            <div className="text-2xs text-text-muted mb-1">With Reported Bonuses</div>
            <div className="text-lg font-bold text-text-primary">{data.reportedBonusCount ?? "—"}</div>
          </div>
          {data.range && (
            <div className="bg-bg-surface rounded p-3">
              <div className="text-2xs text-text-muted mb-1">Verified Historical Range</div>
              <div className="text-base font-bold text-text-primary">{data.range as string}</div>
            </div>
          )}
          {data.median && (
            <div className="bg-bg-surface rounded p-3">
              <div className="text-2xs text-text-muted mb-1">Median</div>
              <div className="text-base font-bold text-text-primary">{data.median as string}</div>
            </div>
          )}
        </div>
        {data.disclaimer && (
          <div className="mt-2 text-2xs text-status-pending">{data.disclaimer as string}</div>
        )}
        {data.dataAvailability && (
          <div className="mt-1 dev-fixture-notice">{data.dataAvailability as string}</div>
        )}
      </div>
    );
  }

  if (type === "comparable_players") {
    const players = data.players as Array<{
      name: string; year: number; school: string; draftPick: string; bonus: string; rationale: string;
    }>;
    return (
      <div>
        {data.note && <div className="text-2xs text-text-secondary mb-3 italic">{data.note as string}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border">
                {["PLAYER", "YEAR", "PROFILE", "DRAFT", "BONUS"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 text-text-muted font-semibold text-2xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players?.map((p, i) => (
                <React.Fragment key={i}>
                  <tr className="border-b border-bg-border">
                    <td className="py-2 pr-4 text-text-primary font-medium">{p.name}</td>
                    <td className="py-2 pr-4 text-text-secondary">{p.year}</td>
                    <td className="py-2 pr-4 text-text-secondary">{p.school}</td>
                    <td className="py-2 pr-4 text-text-primary">{p.draftPick}</td>
                    <td className={`py-2 pr-4 ${p.bonus === "Unavailable" ? "text-text-muted" : "text-text-secondary"}`}>
                      {p.bonus}
                    </td>
                  </tr>
                  <tr className="border-b border-bg-border">
                    <td colSpan={5} className="pb-3 pt-1 text-2xs text-text-muted italic">{p.rationale}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {data.dataAvailability && (
          <div className="mt-2 dev-fixture-notice">{data.dataAvailability as string}</div>
        )}
      </div>
    );
  }

  if (type === "payment_behavior") {
    const metrics = data.metrics as Array<{ label: string; value: string }>;
    return (
      <div>
        {data.note && <div className="text-2xs text-teal mb-3">{data.note as string}</div>}
        <div className="space-y-2">
          {metrics?.map((m, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
              <span className="text-xs text-text-secondary">{m.label}</span>
              <span className="text-xs font-medium text-text-primary">{m.value}</span>
            </div>
          ))}
        </div>
        {data.dataAvailability && (
          <div className="mt-2 dev-fixture-notice">{data.dataAvailability as string}</div>
        )}
      </div>
    );
  }

  // Fallback: show JSON summary
  return (
    <div className="text-xs text-text-secondary">
      {data.dataAvailability ? (
        <div className="dev-fixture-notice">{data.dataAvailability as string}</div>
      ) : (
        <pre className="text-2xs text-text-muted overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
