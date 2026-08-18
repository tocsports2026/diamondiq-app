import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { heightDisplay, formatDateShort } from "../lib/utils";

interface Ranking {
  id: number;
  source: string;
  ranking: number;
  ranking_date: string;
  last_updated: string;
  source_record: string | null;
}

export default function AthleteProfilePage() {
  const { athlete, refresh } = useAuth();
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    personalInterests: athlete?.personalInterests || "",
    causes: athlete?.causes || "",
    travelPreference: athlete?.travelPreference || "",
    categoryExclusions: athlete?.categoryExclusions || "",
    brandRestrictions: athlete?.brandRestrictions || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (athlete?.id) {
      api.get<{ rankings: Ranking[] }>("/athletes/me").then((r) => {
        if (r.ok) setRankings((r.data as { rankings: Ranking[] }).rankings || []);
      });
    }
  }, [athlete?.id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await api.patch("/athletes/me", form);
    if (res.ok) {
      await refresh();
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  if (!athlete) {
    return (
      <div className="p-6 text-text-muted text-sm">No athlete profile found.</div>
    );
  }

  const ft = athlete.featureToggles;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          ATHLETE PROFILE
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Central source for the information DiamondIQ uses in your research.
        </p>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-text-green/10 border border-text-green/30 rounded text-text-green text-sm">
          Profile updated successfully.
        </div>
      )}

      <div className="space-y-4">
        {/* Identity */}
        <div className="diq-card p-5">
          <div className="diq-label mb-4">IDENTITY</div>
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-bg-surface border border-bg-border flex items-center justify-center text-text-muted flex-shrink-0">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 flex-1">
              <ProfileField label="Full Name" value={`${athlete.firstName} ${athlete.lastName}`} />
              {athlete.preferredName && <ProfileField label="Preferred Name" value={athlete.preferredName} />}
              {athlete.dob && <ProfileField label="Date of Birth" value={formatDateShort(athlete.dob)} />}
              {athlete.hometown && <ProfileField label="Hometown" value={athlete.hometown} />}
            </div>
          </div>
        </div>

        {/* Baseball Profile */}
        <div className="diq-card p-5">
          <div className="diq-label mb-4">BASEBALL PROFILE</div>
          <div className="grid grid-cols-3 gap-x-8 gap-y-3">
            <ProfileField label="Primary Position" value={athlete.position} />
            {athlete.secondaryPosition && <ProfileField label="Secondary Position" value={athlete.secondaryPosition} />}
            {athlete.bats && <ProfileField label="Bats" value={athlete.bats} />}
            {athlete.throws && <ProfileField label="Throws" value={athlete.throws} />}
            {athlete.heightIn && <ProfileField label="Height" value={heightDisplay(athlete.heightIn)} />}
            {athlete.weightLbs && <ProfileField label="Weight" value={`${athlete.weightLbs} lbs`} />}
            {athlete.school && <ProfileField label="Current School" value={athlete.school} />}
            {athlete.conference && <ProfileField label="Conference" value={athlete.conference} />}
            {athlete.level && <ProfileField label="Level" value={athlete.level} />}
            {athlete.draftYear && <ProfileField label="Draft Year" value={String(athlete.draftYear)} />}
            {athlete.draftEligibility && <ProfileField label="Draft Eligibility" value={athlete.draftEligibility} />}
          </div>
          <div className="mt-3 text-2xs text-text-muted">
            Baseball profile fields require OSM verification. Contact your OSM team to update.
          </div>
        </div>

        {/* Rankings */}
        <div className="diq-card p-5">
          <div className="diq-label mb-4">RANKINGS / RESEARCH VARIABLES</div>
          {rankings.length === 0 ? (
            <div className="text-text-muted text-sm">No rankings on file. Contact your OSM team to add rankings.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-bg-border">
                    {["SOURCE", "RANKING", "DATE", "LAST UPDATED"].map((h) => (
                      <th key={h} className="text-left py-2 pr-6 text-text-muted font-semibold text-2xs uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r) => (
                    <tr key={r.id} className="border-b border-bg-border">
                      <td className="py-2 pr-6 text-text-primary font-medium">{r.source}</td>
                      <td className="py-2 pr-6 text-text-primary font-bold"># {r.ranking}</td>
                      <td className="py-2 pr-6 text-text-secondary">{formatDateShort(r.ranking_date)}</td>
                      <td className="py-2 pr-6 text-text-secondary">{formatDateShort(r.last_updated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 text-2xs text-text-muted">
            Approved sources: Baseball America, MLB Pipeline, Perfect Game, D1Baseball. Rankings require OSM verification.
          </div>
        </div>

        {/* NIL / Marketing Profile */}
        {ft.nilMarketingManagement || ft.nilIntelligence ? (
          <div className="diq-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="diq-label">NIL / MARKETING PROFILE</div>
              <button
                onClick={() => setEditing(!editing)}
                className="diq-btn-secondary text-xs"
              >
                {editing ? "CANCEL" : "EDIT MY PROFILE"}
              </button>
            </div>

            {editing ? (
              <div className="space-y-4">
                <EditField
                  label="Personal Interests / Causes"
                  value={form.personalInterests}
                  onChange={(v) => setForm((f) => ({ ...f, personalInterests: v }))}
                  multiline
                  placeholder="e.g. community service, youth baseball clinics..."
                />
                <EditField
                  label="Causes You Support"
                  value={form.causes}
                  onChange={(v) => setForm((f) => ({ ...f, causes: v }))}
                  placeholder="e.g. youth athletics, education, local community..."
                />
                <EditField
                  label="Travel Preference / Radius"
                  value={form.travelPreference}
                  onChange={(v) => setForm((f) => ({ ...f, travelPreference: v }))}
                  placeholder="e.g. within 50 miles of school during season..."
                />
                <EditField
                  label="Endorsement Category Exclusions"
                  value={form.categoryExclusions}
                  onChange={(v) => setForm((f) => ({ ...f, categoryExclusions: v }))}
                  placeholder="e.g. alcohol, gambling, tobacco..."
                />
                <EditField
                  label="Existing Brand Restrictions"
                  value={form.brandRestrictions}
                  onChange={(v) => setForm((f) => ({ ...f, brandRestrictions: v }))}
                  placeholder="Any existing exclusivity agreements..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="diq-btn-primary text-xs disabled:opacity-50"
                  >
                    {saving ? "SAVING..." : "SAVE CHANGES"}
                  </button>
                  <button onClick={() => setEditing(false)} className="diq-btn-secondary text-xs">
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <ProfileField label="Personal Interests" value={athlete.personalInterests || "Not provided"} />
                <ProfileField label="Causes" value={athlete.causes || "Not provided"} />
                <ProfileField label="Travel Preference" value={athlete.travelPreference || "Not provided"} />
                <ProfileField label="Category Exclusions" value={athlete.categoryExclusions || "Not provided"} />
                <ProfileField label="Brand Restrictions" value={athlete.brandRestrictions || "Not provided"} />
              </div>
            )}
          </div>
        ) : null}

        {/* Feature toggles (read-only) */}
        <div className="diq-card p-5">
          <div className="diq-label mb-4">ENABLED FEATURES</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "draftIntelligence", label: "Draft Intelligence" },
              { key: "nilIntelligence", label: "NIL Intelligence" },
              { key: "clubDraftIntelligence", label: "Club Draft Intelligence" },
              { key: "knowledgeCenter", label: "Knowledge Center" },
              { key: "nilMarketingManagement", label: "NIL / Marketing Management" },
              { key: "calendar", label: "Calendar" },
              { key: "agreements", label: "Agreements" },
              { key: "deliverables", label: "Deliverables" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    ft[key as keyof typeof ft] ? "bg-text-green" : "bg-text-muted"
                  }`}
                />
                <span className={ft[key as keyof typeof ft] ? "text-text-primary" : "text-text-muted"}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-2xs text-text-muted">
            Feature access is controlled by O'Connell Sports Management.
          </div>
        </div>

        {/* Data completeness */}
        <div className="diq-card p-4 bg-bg-surface">
          <div className="diq-label mb-2">DATA COMPLETENESS</div>
          <div className="text-xs text-text-secondary">
            Missing information that would improve DiamondIQ's research accuracy:
            {!athlete.dob && <span className="block mt-1 text-status-pending">• Date of birth not on file</span>}
            {!athlete.personalInterests && <span className="block mt-1 text-status-pending">• Personal interests not provided</span>}
            {!athlete.categoryExclusions && ft.nilIntelligence && (
              <span className="block mt-1 text-status-pending">• Endorsement category exclusions not specified</span>
            )}
            {rankings.length === 0 && <span className="block mt-1 text-status-pending">• No verified rankings on file</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-2xs text-text-muted uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm text-text-primary">{value || "—"}</div>
    </div>
  );
}

function EditField({
  label, value, onChange, multiline, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="diq-input w-full h-20 resize-none text-xs"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="diq-input text-xs"
        />
      )}
    </div>
  );
}
