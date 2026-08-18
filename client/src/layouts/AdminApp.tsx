import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import AdminDashboard from "../pages/admin/AdminDashboard";
import AdminClients from "../pages/admin/AdminClients";
import AdminAthletes from "../pages/admin/AdminAthletes";
import AdminReportReview from "../pages/admin/AdminReportReview";
import AdminIntelRequests from "../pages/admin/AdminIntelRequests";
import AdminDataLibrary from "../pages/admin/AdminDataLibrary";
import AdminIngestionReview from "../pages/admin/AdminIngestionReview";
import AdminKnowledge from "../pages/admin/AdminKnowledge";
import AdminNilManagement from "../pages/admin/AdminNilManagement";
import AdminMethodology from "../pages/admin/AdminMethodology";

const NAV = [
  { path: "/admin", label: "Dashboard", icon: "⊞" },
  { path: "/admin/clients", label: "Clients", icon: "👥" },
  { path: "/admin/athletes", label: "Athletes", icon: "⚾" },
  { path: "/admin/reports", label: "Report Review", icon: "📋" },
  { path: "/admin/requests", label: "Intelligence Requests", icon: "❓" },
  { path: "/admin/data", label: "Data Library", icon: "🗄" },
  { path: "/admin/knowledge", label: "Knowledge Center", icon: "📚" },
  { path: "/admin/nil", label: "NIL Management", icon: "💼" },
  { path: "/admin/methodology", label: "Methodology", icon: "⚙" },
];

export default function AdminApp() {
  const { user, logout } = useAuth();
  const [path, setPath] = useState(window.location.pathname || "/admin");
  const [ingestionJobId, setIngestionJobId] = useState<number | null>(null);

  const navigate = (p: string) => {
    setPath(p);
    window.history.pushState({}, "", p);
  };

  const navigateIngestion = (jobId: number) => {
    setIngestionJobId(jobId);
    navigate(`/admin/ingestion/${jobId}`);
  };

  function renderPage() {
    // Ingestion review — dynamic job ID
    if (path.startsWith("/admin/ingestion/")) {
      const id = ingestionJobId ?? parseInt(path.split("/").pop() ?? "0");
      if (id) {
        return (
          <AdminIngestionReview
            jobId={id}
            onBack={() => navigate("/admin/data")}
          />
        );
      }
    }
    switch (path) {
      case "/admin": return <AdminDashboard onNavigate={navigate} />;
      case "/admin/clients": return <AdminClients />;
      case "/admin/athletes": return <AdminAthletes onNavigate={navigate} />;
      case "/admin/reports": return <AdminReportReview onNavigate={navigate} />;
      case "/admin/requests": return <AdminIntelRequests />;
      case "/admin/data": return <AdminDataLibrary onNavigateIngestion={navigateIngestion} />;
      case "/admin/knowledge": return <AdminKnowledge />;
      case "/admin/nil": return <AdminNilManagement />;
      case "/admin/methodology": return <AdminMethodology />;
      default: return <AdminDashboard onNavigate={navigate} />;
    }
  }

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      {/* Admin sidebar */}
      <aside className="w-[190px] flex-shrink-0 bg-bg-deep border-r border-bg-border flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-bg-border">
          <img
            src="/assets/branding/TOC_White_OFFICIAL.png"
            alt="TOC Sports"
            className="h-8 w-auto object-contain mb-2"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="font-condensed font-bold text-sm text-text-primary tracking-wider">DIAMONDIQ</div>
          <div className="text-2xs text-status-pending font-semibold mt-0.5">OSM ADMIN</div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 pt-3 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={path === item.path ? "diq-nav-item-active w-full text-left" : "diq-nav-item w-full text-left"}
            >
              <span className="text-sm">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-bg-border space-y-1">
          <div className="text-2xs text-text-muted px-2">{user?.name}</div>
          <div className="text-2xs text-text-muted px-2">{user?.email}</div>
          <button
            onClick={() => navigate("/")}
            className="diq-nav-item w-full text-left text-2xs"
          >
            View Client Side
          </button>
          <button
            onClick={logout}
            className="diq-nav-item w-full text-left text-text-muted hover:text-text-red text-2xs"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {renderPage()}
      </div>
    </div>
  );
}
