import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { AthleteProfile } from "@shared/types";
import { heightDisplay, formatDateShort } from "../../lib/utils";

export default function AdminAthletes({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const [athletes, setAthletes] = useState<(AthleteProfile & { email?: string; userEmail?: string; lastLogin?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AthleteProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<AthleteProfile[]>("/admin/athletes").then((r) => {
      if (r.ok) setAthletes(r.data as typeof athletes);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleToggleFeature = async (athleteId: number, feature: string, current: boolean) => {
    setSaving(true);
    await api.patch(`/athletes/${athleteId}`, { [feature]: !current });
    load();
    setSaving(false);
  };

  const FEATURE_KEYS: [string, string][] = [
    ["draftIntelligence", "Draft Intelligence"],
    ["nilIntelligence", "NIL Intelligence"],
    ["clubDraftIntelligence", "Club Draft Intelligence"],
    ["knowledgeCenter", "Knowledge Center"],
    ["nilMarketingManagement", "NIL / Marketing Management"],
    ["calendar", "Calendar"],
    ["agreements", "Agreements"],
    ["deliverables", "Deliverables"],
    ["socialContentTools", "Social Content Tools"],
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">ATHLETES</h1>
        <p className="text-text-secondary text-sm mt-1">Manage athlete profiles, rankings, and feature access.</p>
      </div>

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {/* Athlete list */}
          <div className="col-span-1 space-y-2">
            {athletes.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`w-full text-left diq-card p-3 hover:bg-bg-elevated transition-colors ${selected?.id === a.id ? "border-teal-border bg-teal-muted" : ""}`}
              >
                <div className="text-sm font-medium text-text-primary">{a.firstName} {a.lastName}</div>
                <div className="text-xs text-text-secondary">{a.position} • {a.school}</div>
                <div className="text-2xs text-text-muted">{a.draftYear}</div>
              </button>
            ))}
          </div>

          {/* Athlete detail */}
          <div className="col-span-2">
            {selected ? (
              <div className="space-y-4">
                {/* Profile summary */}
                <div className="diq-card p-5">
                  <div className="diq-label mb-3">{selected.firstName} {selected.lastName}</div>
                  <div className="grid grid-cols-3 gap-y-2 gap-x-4 text-xs">
                    {[
                      ["Position", selected.position],
                      ["B/T", selected.bats ? `${selected.bats}/${selected.throws}` : "—"],
                      ["Height", selected.heightIn ? heightDisplay(selected.heightIn) : "—"],
                      ["Weight", selected.weightLbs ? `${selected.weightLbs} lbs` : "—"],
                      ["School", selected.school || "—"],
                      ["Conference", selected.conference || "—"],
                      ["Draft Year", selected.draftYear?.toString() || "—"],
                      ["Level", selected.level || "—"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className="text-text-muted">{label}</div>
                        <div className="text-text-primary font-medium">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Feature toggles */}
                <div className="diq-card p-5">
                  <div className="diq-label mb-4">FEATURE ACCESS {saving && <span className="text-text-muted font-normal text-2xs ml-2">Saving...</span>}</div>
                  <div className="space-y-2">
                    {FEATURE_KEYS.map(([key, label]) => {
                      const camelKey = key as keyof typeof selected.featureToggles;
                      const enabled = selected.featureToggles[camelKey];
                      return (
                        <div key={key} className="flex items-center justify-between py-1.5 border-b border-bg-border last:border-0">
                          <span className="text-sm text-text-primary">{label}</span>
                          <button
                            onClick={() => handleToggleFeature(selected.id, key, enabled)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-teal" : "bg-bg-elevated border border-bg-border"}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${enabled ? "left-5" : "left-0.5"}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-2xs text-text-muted">
                    Disabled features disappear completely from the athlete's interface.
                  </div>
                </div>
              </div>
            ) : (
              <div className="diq-card p-8 text-center text-text-muted">
                Select an athlete to view and manage their profile.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
