import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const res = await api.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
    setLoading(false);
    if (res.ok) {
      setSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setError((res as { ok: false; error: string }).error || "Failed to change password.");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">
          SETTINGS
        </h1>
        <p className="text-text-secondary text-sm mt-1">Account settings and preferences.</p>
      </div>

      {/* Account info */}
      <div className="diq-card p-5 mb-4">
        <div className="diq-label mb-4">ACCOUNT</div>
        <div className="space-y-3">
          <div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mb-0.5">Name</div>
            <div className="text-sm text-text-primary">{user?.name}</div>
          </div>
          <div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mb-0.5">Email</div>
            <div className="text-sm text-text-primary">{user?.email}</div>
          </div>
          <div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mb-0.5">Account Type</div>
            <div className="text-sm text-text-primary capitalize">{user?.role?.replace("_", " ")}</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="diq-card p-5 mb-4">
        <div className="diq-label mb-4">CHANGE PASSWORD</div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="diq-input"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="diq-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="diq-input"
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="bg-text-red/10 border border-text-red/30 rounded px-3 py-2 text-text-red text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-text-green/10 border border-text-green/30 rounded px-3 py-2 text-text-green text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="diq-btn-primary text-sm disabled:opacity-50"
          >
            {loading ? "Changing..." : "CHANGE PASSWORD"}
          </button>
        </form>
      </div>

      {/* Privacy */}
      <div className="diq-card p-5 mb-4">
        <div className="diq-label mb-3">PRIVACY</div>
        <p className="text-xs text-text-secondary leading-relaxed">
          DiamondIQ is a private platform for O'Connell Sports Management clients. Your data, research queries,
          and report content are never shared with third parties. All research is conducted using verified public
          sources and OSM proprietary intelligence. See our evidence-first standard for details.
        </p>
      </div>

      {/* Sign out */}
      <div className="diq-card p-5">
        <div className="diq-label mb-3">SESSION</div>
        <button
          onClick={logout}
          className="diq-btn-secondary text-sm text-text-red border-text-red/30 hover:bg-text-red/10"
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}
