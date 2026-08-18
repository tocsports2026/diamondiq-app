import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const err = await login(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen bg-bg-base flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-1/2 bg-bg-deep border-r border-bg-border p-12 justify-between">
        <div>
          {/* TOC Sports logo */}
          <div className="mb-8">
            <img
              src="/assets/branding/TOC_White_OFFICIAL.png"
              alt="TOC Sports"
              className="h-14 w-auto object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="font-condensed font-bold text-4xl text-text-primary tracking-widest mb-1">
            DIAMONDIQ
          </div>
          <div className="text-text-secondary text-sm tracking-wide">
            BASEBALL INTELLIGENCE. BETTER DECISIONS.
          </div>
          <div className="mt-8 text-text-secondary text-base leading-relaxed max-w-sm">
            Private intelligence platform for O'Connell Sports Management clients.
            <br /><br />
            You have access to this intelligence because you are an OSM client.
          </div>
        </div>

        {/* Feature callouts */}
        <div className="space-y-4">
          {[
            { label: "DATA DRIVEN", desc: "Backed by history. Built for insight." },
            { label: "BUILT FOR BASEBALL", desc: "Deep baseball data. Real-world context." },
            { label: "EVIDENCE FIRST", desc: "No guessing. No fabrication. OSM-verified." },
          ].map((f) => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-teal mt-2 flex-shrink-0" />
              <div>
                <div className="text-2xs font-semibold text-teal uppercase tracking-widest">{f.label}</div>
                <div className="text-xs text-text-secondary mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-2xs text-text-muted">
          All data and insights are proprietary to O'Connell Sports Management.
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <img
              src="/assets/branding/TOC_White_OFFICIAL.png"
              alt="TOC Sports"
              className="h-10 w-auto object-contain mb-3"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="font-condensed font-bold text-2xl text-text-primary tracking-widest">
              DIAMONDIQ
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-condensed text-2xl font-bold text-text-primary tracking-wide">
              SIGN IN
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Access your OSM intelligence platform.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="diq-input"
                placeholder="your@email.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="diq-input"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-text-red/10 border border-text-red/30 rounded px-3 py-2 text-text-red text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full diq-btn-primary justify-center py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "SIGN IN"}
            </button>
          </form>

          <p className="mt-6 text-xs text-text-muted text-center">
            Access is managed by O'Connell Sports Management.
            <br />
            Contact your OSM representative if you need access.
          </p>

          {/* Dev fixture notice */}
          <div className="mt-8 p-3 bg-bg-surface rounded border border-bg-border">
            <div className="text-2xs text-text-secondary uppercase tracking-wider font-semibold mb-2">
              Development Access
            </div>
            <div className="text-2xs text-text-muted space-y-1">
              <div>Admin: <span className="text-text-secondary">admin@ocmsports.com</span></div>
              <div>Password: <span className="text-text-secondary">DiamondIQ2024!</span></div>
              <div className="mt-1">Athlete: <span className="text-text-secondary">jackson.miller@demo.com</span></div>
              <div>Password: <span className="text-text-secondary">Athlete2024!</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
