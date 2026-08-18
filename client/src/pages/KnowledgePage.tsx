import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { formatDateShort } from "../lib/utils";

interface Article {
  id: number;
  title: string;
  category: string;
  summary: string | null;
  published_at: string | null;
  updated_at: string;
  content?: string;
}

const CATEGORIES = [
  "All",
  "MLB Draft",
  "Signing Bonuses",
  "Professional Baseball",
  "NIL & Marketing",
  "College / Transfer Decisions",
  "OSM Education",
];

const categoryIcons: Record<string, string> = {
  "MLB Draft": "⬡",
  "Signing Bonuses": "💰",
  "Professional Baseball": "⚾",
  "NIL & Marketing": "◎",
  "College / Transfer Decisions": "🎓",
  "OSM Education": "🏫",
};

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Article | null>(null);

  useEffect(() => {
    api.get<Article[]>("/knowledge").then((r) => {
      if (r.ok) setArticles(r.data);
      setLoading(false);
    });
  }, []);

  const filtered = articles.filter((a) => {
    if (category !== "All" && a.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || (a.summary || "").toLowerCase().includes(q);
    }
    return true;
  });

  const openArticle = async (article: Article) => {
    const res = await api.get<Article>(`/knowledge/${article.id}`);
    if (res.ok) setSelected(res.data);
    else setSelected(article);
  };

  if (selected) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button onClick={() => setSelected(null)} className="diq-btn-ghost text-xs mb-6">
          ← BACK TO KNOWLEDGE CENTER
        </button>
        <div className="diq-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-teal">{categoryIcons[selected.category] || "📄"}</span>
            <div className="diq-label">{selected.category}</div>
          </div>
          <h1 className="font-condensed text-2xl font-bold text-text-primary tracking-wide mb-3">
            {selected.title}
          </h1>
          {selected.summary && (
            <p className="text-text-secondary text-sm mb-4 border-l-2 border-teal pl-3">{selected.summary}</p>
          )}
          <div className="text-2xs text-text-muted mb-6">
            Last updated: {formatDateShort(selected.updated_at)}
          </div>
          <div className="prose prose-invert max-w-none text-sm text-text-secondary leading-relaxed">
            {selected.content?.split("\n").map((para, i) => (
              para.trim() ? <p key={i} className="mb-3">{para}</p> : null
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          KNOWLEDGE CENTER
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          OSM client education library — proprietary intelligence and guidance.
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles..."
          className="diq-input w-full"
        />
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Category sidebar */}
        <div>
          <div className="diq-label mb-3">CATEGORIES</div>
          <div className="space-y-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  category === cat
                    ? "bg-teal-muted border border-teal-border text-teal"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                {cat !== "All" && <span>{categoryIcons[cat]}</span>}
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Article list */}
        <div className="col-span-3">
          {loading ? (
            <div className="text-text-muted text-sm py-8 text-center">Loading articles...</div>
          ) : filtered.length === 0 ? (
            <div className="text-text-muted text-sm py-8 text-center">No articles found.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((article) => (
                <div
                  key={article.id}
                  className="diq-card p-4 cursor-pointer hover:bg-bg-elevated transition-colors"
                  onClick={() => openArticle(article)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-teal text-lg flex-shrink-0">
                      {categoryIcons[article.category] || "📄"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-text-primary">{article.title}</h3>
                      </div>
                      <div className="text-2xs text-teal mb-1">{article.category}</div>
                      {article.summary && (
                        <p className="text-xs text-text-secondary line-clamp-2">{article.summary}</p>
                      )}
                      <div className="text-2xs text-text-muted mt-2">
                        {formatDateShort(article.updated_at)}
                      </div>
                    </div>
                    <button className="diq-btn-ghost text-xs flex-shrink-0">READ →</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
