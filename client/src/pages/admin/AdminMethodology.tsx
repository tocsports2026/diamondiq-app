import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface Rule {
  id: number;
  title: string;
  scope: string;
  rule_text: string;
  version: string;
  effective_date: string | null;
  author: string | null;
  notes: string | null;
  created_at: string;
}

export default function AdminMethodology() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", scope: "", ruleText: "", version: "1.0", effectiveDate: "", author: "", notes: "" });

  const load = () => {
    api.get<Rule[]>("/admin/methodology").then((r) => {
      if (r.ok) setRules(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post("/admin/methodology", form);
    if (res.ok) { setAdding(false); load(); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">METHODOLOGY</h1>
          <p className="text-text-secondary text-sm mt-1">
            OSM analytical rules that govern DiamondIQ's research behavior.
          </p>
        </div>
        <button onClick={() => setAdding(!adding)} className="diq-btn-primary text-sm">+ ADD RULE</button>
      </div>

      {adding && (
        <div className="diq-card p-5 mb-6">
          <div className="diq-label mb-4 text-teal">ADD METHODOLOGY RULE</div>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-text-secondary mb-1 block">Title *</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Scope (e.g. "Draft Research", "NIL Reports")</label>
              <input value={form.scope} onChange={(e) => setForm(f => ({ ...f, scope: e.target.value }))} className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Version</label>
              <input value={form.version} onChange={(e) => setForm(f => ({ ...f, version: e.target.value }))} className="diq-input text-xs" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-secondary mb-1 block">Rule Text *</label>
              <textarea value={form.ruleText} onChange={(e) => setForm(f => ({ ...f, ruleText: e.target.value }))} required className="diq-input w-full h-24 resize-none text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Author</label>
              <input value={form.author} onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))} className="diq-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Effective Date</label>
              <input value={form.effectiveDate} onChange={(e) => setForm(f => ({ ...f, effectiveDate: e.target.value }))} type="date" className="diq-input text-xs" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="diq-btn-primary text-xs">ADD RULE</button>
              <button type="button" onClick={() => setAdding(false)} className="diq-btn-secondary text-xs">CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : rules.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">No methodology rules defined yet.</div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id} className="diq-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-semibold text-text-primary">{r.title}</div>
                  <div className="text-xs text-text-secondary">{r.scope} • v{r.version}{r.author ? ` • ${r.author}` : ""}</div>
                </div>
                <div className="text-2xs text-text-muted">{formatDateShort(r.effective_date || r.created_at)}</div>
              </div>
              <div className="text-xs text-text-secondary leading-relaxed">{r.rule_text}</div>
              {r.notes && <div className="mt-2 text-2xs text-text-muted">{r.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
