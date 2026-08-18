import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface Article {
  id: number;
  title: string;
  category: string;
  summary: string | null;
  content: string;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
  assigned_to_all: boolean;
}

const CATEGORIES = ["MLB Draft", "Signing Bonuses", "Professional Baseball", "NIL & Marketing", "College / Transfer Decisions", "OSM Education"];

export default function AdminKnowledge() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState({ title: "", category: CATEGORIES[0], summary: "", content: "", assignedToAll: true });

  const load = () => {
    api.get<Article[]>("/knowledge").then((r) => {
      if (r.ok) setArticles(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post("/knowledge", form);
    if (res.ok) { setCreating(false); load(); }
  };

  const handlePublishToggle = async (article: Article) => {
    await api.patch(`/knowledge/${article.id}`, { isPublished: !article.is_published });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">KNOWLEDGE CENTER</h1>
          <p className="text-text-secondary text-sm mt-1">Manage OSM educational content for athletes.</p>
        </div>
        <button onClick={() => setCreating(!creating)} className="diq-btn-primary text-sm">+ CREATE ARTICLE</button>
      </div>

      {creating && (
        <div className="diq-card p-5 mb-6">
          <div className="diq-label mb-4 text-teal">CREATE ARTICLE</div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-text-secondary mb-1 block">Title *</label>
                <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required className="diq-input text-xs" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Category</label>
                <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="diq-select w-full text-xs">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Summary</label>
                <input value={form.summary} onChange={(e) => setForm(f => ({ ...f, summary: e.target.value }))} className="diq-input text-xs" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-text-secondary mb-1 block">Content *</label>
                <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} required className="diq-input w-full h-40 resize-none text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="diq-btn-primary text-xs">CREATE (UNPUBLISHED)</button>
              <button type="button" onClick={() => setCreating(false)} className="diq-btn-secondary text-xs">CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <div key={a.id} className="diq-card p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-text-primary">{a.title}</span>
                  <span className={`diq-badge ${a.is_published ? "diq-badge-published" : "diq-badge-archived"}`}>
                    {a.is_published ? "PUBLISHED" : "DRAFT"}
                  </span>
                </div>
                <div className="text-xs text-teal">{a.category}</div>
                <div className="text-2xs text-text-muted mt-0.5">Updated {formatDateShort(a.updated_at)}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={() => handlePublishToggle(a)}
                  className={`diq-btn-secondary text-xs ${a.is_published ? "text-status-pending" : "text-text-green"}`}
                >
                  {a.is_published ? "UNPUBLISH" : "PUBLISH"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
