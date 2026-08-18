import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  athlete_id: number | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  school: string | null;
}

export default function AdminClients() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: "", password: "", name: "", role: "athlete",
    firstName: "", lastName: "", position: "", school: "",
    conference: "", draftYear: "", level: "College",
  });
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const load = () => {
    api.get<UserRecord[]>("/admin/users").then((r) => {
      if (r.ok) setUsers(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    const res = await api.post("/admin/users", {
      ...form,
      draftYear: form.draftYear ? parseInt(form.draftYear) : undefined,
    });
    if (res.ok) {
      setFormSuccess("User created successfully.");
      setForm({ email: "", password: "", name: "", role: "athlete", firstName: "", lastName: "", position: "", school: "", conference: "", draftYear: "", level: "College" });
      setCreating(false);
      load();
    } else {
      setFormError((res as { ok: false; error: string }).error || "Failed to create user");
    }
  };

  const handleToggleActive = async (userId: number, isActive: boolean) => {
    await api.patch(`/admin/users/${userId}`, { isActive: !isActive });
    load();
  };

  const handleResetPassword = async (userId: number) => {
    const newPassword = prompt("Enter new password (min 8 characters):");
    if (!newPassword || newPassword.length < 8) return;
    const res = await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
    if (res.ok) alert("Password reset successfully.");
    else alert("Failed to reset password.");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-condensed text-3xl font-bold text-text-primary tracking-wide">CLIENT ACCESS</h1>
          <p className="text-text-secondary text-sm mt-1">Manage athlete accounts and access.</p>
        </div>
        <button onClick={() => setCreating(!creating)} className="diq-btn-primary text-sm">
          + CREATE USER
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="diq-card p-5 mb-6">
          <div className="diq-label mb-4 text-teal">CREATE NEW USER</div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Email *</label>
                <input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} type="email" required className="diq-input text-xs" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Password * (min 8 chars)</label>
                <input value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} type="password" required minLength={8} className="diq-input text-xs" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Display Name *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required className="diq-input text-xs" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Role</label>
                <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))} className="diq-select w-full text-xs">
                  <option value="athlete">Athlete</option>
                  <option value="osm_staff">OSM Staff</option>
                  <option value="osm_admin">OSM Admin</option>
                </select>
              </div>
            </div>
            {form.role === "athlete" && (
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-bg-border">
                <div className="diq-label col-span-3 text-text-secondary">Athlete Profile</div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">First Name *</label>
                  <input value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} className="diq-input text-xs" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Last Name *</label>
                  <input value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} className="diq-input text-xs" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Position</label>
                  <input value={form.position} onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))} placeholder="RHP, SS, C..." className="diq-input text-xs" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">School</label>
                  <input value={form.school} onChange={(e) => setForm(f => ({ ...f, school: e.target.value }))} className="diq-input text-xs" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Conference</label>
                  <input value={form.conference} onChange={(e) => setForm(f => ({ ...f, conference: e.target.value }))} className="diq-input text-xs" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Draft Year</label>
                  <input value={form.draftYear} onChange={(e) => setForm(f => ({ ...f, draftYear: e.target.value }))} type="number" placeholder="2026" className="diq-input text-xs" />
                </div>
              </div>
            )}
            {formError && <div className="text-text-red text-xs bg-text-red/10 border border-text-red/30 rounded px-3 py-2">{formError}</div>}
            {formSuccess && <div className="text-text-green text-xs bg-text-green/10 border border-text-green/30 rounded px-3 py-2">{formSuccess}</div>}
            <div className="flex gap-2">
              <button type="submit" className="diq-btn-primary text-xs">CREATE USER</button>
              <button type="button" onClick={() => setCreating(false)} className="diq-btn-secondary text-xs">CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
      ) : (
        <div className="diq-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border bg-bg-surface">
                {["ATHLETE / USER", "EMAIL", "ROLE", "STATUS", "LAST LOGIN", "ACTIONS"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-text-muted font-semibold text-2xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-bg-border hover:bg-bg-elevated transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-text-primary">
                      {u.first_name ? `${u.first_name} ${u.last_name}` : u.name}
                    </div>
                    {u.position && <div className="text-text-muted">{u.position} • {u.school}</div>}
                  </td>
                  <td className="py-3 px-4 text-text-secondary">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="diq-badge diq-badge-archived text-2xs">{u.role}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`diq-badge ${u.is_active ? "diq-badge-published" : "bg-text-red/10 text-text-red border-text-red/30"}`}>
                      {u.is_active ? "ACTIVE" : "SUSPENDED"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-muted">{formatDateShort(u.last_login)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(u.id, u.is_active)}
                        className="text-2xs text-text-secondary hover:text-status-pending transition-colors"
                      >
                        {u.is_active ? "SUSPEND" : "ACTIVATE"}
                      </button>
                      <button
                        onClick={() => handleResetPassword(u.id)}
                        className="text-2xs text-text-secondary hover:text-teal transition-colors"
                      >
                        RESET PW
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
