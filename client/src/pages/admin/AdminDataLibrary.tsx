import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface Dataset {
  id: number;
  title: string;
  category: string;
  source: string;
  years_covered: string | null;
  upload_date: string;
  last_updated: string;
  record_count: number | null;
  processing_status: string;
  confidence: string;
  notes: string | null;
}

const confidenceColor: Record<string, string> = {
  strong: "text-text-green",
  moderate: "text-teal",
  limited: "text-status-pending",
  incomplete: "text-text-red",
};

export default function AdminDataLibrary() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", category: "draft", source: "", yearsCovered: "", recordCount: "", confidence: "moderate", notes: "" });
  const [formSuccess, setFormSuccess] = useState("");

  const load = () => {
    api.get<Dataset[]>("/admin/data-library").then((r) => {
      if (r.ok) setDatasets(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post("/admin/data-library", {
      ...form,
      recordCount: form.recordCount ? parseInt(form.recordCount) : undefined,
    });
    if (res.ok) {
      setFormSuccess("Dataset added.");
      setAdding(false);
      setForm({ title: "", category: "draft", source: "", yearsCovered: "", recordCount: "", confidence: "moderate", notes: "" });
      load();
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">DATA LIBRARY</h1>
          <p className="text-text-secondary text-sm mt-1">OSM intelligence datasets and data health.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="diq-btn-primary text-sm">+ ADD DATASET</button>
      </div>

      {formSuccess && (
        <div className="mb-4 p-3 bg-text-green/10 border border-text-green/30 rounded text-text-green text-sm">{formSuccess}</div>
      )}

      {adding && (
        <div className="diq-card p-5 mb-6">
          <div className="diq-label mb-4 text-teal">ADD DATASET RECORD</div>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-text-secondary mb-1 block">Title *</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Category</label>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="diq-select w-full text-xs">
                <option value="draft">Draft</option>
                <option value="club">Club</option>
                <option value="nil">NIL</option>
                <option value="osm">OSM</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Source *</label>
              <input value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))} required className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Years Covered</label>
              <input value={form.yearsCovered} onChange={(e) => setForm(f => ({ ...f, yearsCovered: e.target.value }))} placeholder="e.g. 2015–2026" className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Record Count</label>
              <input value={form.recordCount} onChange={(e) => setForm(f => ({ ...f, recordCount: e.target.value }))} type="number" className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Confidence</label>
              <select value={form.confidence} onChange={(e) => setForm(f => ({ ...f, confidence: e.target.value }))} className="diq-select w-full text-xs">
                <option value="strong">Strong</option>
                <option value="moderate">Moderate</option>
                <option value="limited">Limited</option>
                <option value="incomplete">Incomplete</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-secondary mb-1 block">Notes</label>
              <input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="diq-input text-xs" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="diq-btn-primary text-xs">ADD DATASET</button>
              <button type="button" onClick={() => setAdding(false)} className="diq-btn-secondary text-xs">CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : (
        <div className="diq-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border bg-bg-surface">
                {["DATASET", "CATEGORY", "SOURCE", "YEARS", "RECORDS", "CONFIDENCE", "UPDATED"].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-text-muted font-semibold text-2xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id} className="border-b border-bg-border hover:bg-bg-elevated transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-medium text-text-primary">{d.title}</div>
                    {d.notes && <div className="text-2xs text-text-muted mt-0.5 truncate max-w-xs">{d.notes}</div>}
                  </td>
                  <td className="py-3 px-3 text-text-secondary capitalize">{d.category}</td>
                  <td className="py-3 px-3 text-text-secondary">{d.source}</td>
                  <td className="py-3 px-3 text-text-secondary">{d.years_covered || "—"}</td>
                  <td className="py-3 px-3 text-text-secondary">{d.record_count?.toLocaleString() || "—"}</td>
                  <td className="py-3 px-3">
                    <span className={`font-medium capitalize ${confidenceColor[d.confidence] || ""}`}>{d.confidence}</span>
                  </td>
                  <td className="py-3 px-3 text-text-muted">{formatDateShort(d.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 p-3 bg-bg-surface rounded border border-bg-border text-xs text-text-secondary">
        <div className="font-semibold text-text-primary mb-1">Data Library Note</div>
        The Data Library tracks what datasets are available to DiamondIQ. Upload source files via the OSM Drive structure.
        Never treat dev fixture data as verified production intelligence.
      </div>
    </div>
  );
}
