import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import HomePage from "../pages/HomePage";
import AskPage from "../pages/AskPage";
import DraftWorkspace from "../pages/DraftWorkspace";
import NilWorkspace from "../pages/NilWorkspace";
import ClubWorkspace from "../pages/ClubWorkspace";
import MyReportsPage from "../pages/MyReportsPage";
import KnowledgePage from "../pages/KnowledgePage";
import AthleteProfilePage from "../pages/AthleteProfilePage";
import SettingsPage from "../pages/SettingsPage";
import NilManagementPage from "../pages/NilManagementPage";
import ReportViewPage from "../pages/ReportViewPage";
import { useAuth } from "../context/AuthContext";

export default function ClientApp() {
  const { athlete } = useAuth();
  const [path, setPath] = useState(() => {
    const p = window.location.pathname;
    return p === "/" || p === "" ? "/" : p;
  });
  const [reportRef, setReportRef] = useState<string | null>(null);

  const navigate = (p: string) => {
    if (p.startsWith("/reports/")) {
      const ref = p.slice("/reports/".length);
      setReportRef(ref);
      setPath("/report-view");
    } else {
      setReportRef(null);
      setPath(p);
    }
    window.history.pushState({}, "", p);
  };

  const ft = athlete?.featureToggles;

  function renderPage() {
    // Feature guard helpers
    const featureEnabled = (key: keyof typeof ft) => ft?.[key] !== false;

    switch (path) {
      case "/":
        return <HomePage onNavigate={navigate} />;
      case "/ask":
        return <AskPage onNavigate={navigate} />;
      case "/draft":
        if (!featureEnabled("draftIntelligence")) return <FeatureDisabled />;
        return <DraftWorkspace onNavigate={navigate} />;
      case "/nil":
        if (!featureEnabled("nilIntelligence")) return <FeatureDisabled />;
        return <NilWorkspace onNavigate={navigate} />;
      case "/club":
        if (!featureEnabled("clubDraftIntelligence")) return <FeatureDisabled />;
        return <ClubWorkspace onNavigate={navigate} />;
      case "/reports":
        return <MyReportsPage onNavigate={navigate} />;
      case "/knowledge":
        if (!featureEnabled("knowledgeCenter")) return <FeatureDisabled />;
        return <KnowledgePage />;
      case "/profile":
        return <AthleteProfilePage />;
      case "/settings":
        return <SettingsPage />;
      case "/report-view":
        return <ReportViewPage reportRef={reportRef} onBack={() => navigate("/reports")} />;
      // NIL Management routes
      case "/calendar":
      case "/agreements":
      case "/deliverables":
      case "/content":
        if (!featureEnabled("nilMarketingManagement")) return <FeatureDisabled />;
        return <NilManagementPage initialTab={pathToTab(path)} onNavigate={navigate} />;
      default:
        return <HomePage onNavigate={navigate} />;
    }
  }

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <Sidebar currentPath={path} onNavigate={navigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onNavigate={navigate}
          onCreateReport={() => navigate("/draft")}
        />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

function pathToTab(p: string) {
  const map: Record<string, string> = {
    "/calendar": "calendar",
    "/agreements": "agreements",
    "/deliverables": "deliverables",
    "/content": "content",
  };
  return map[p] || "overview";
}

function FeatureDisabled() {
  return (
    <div className="flex items-center justify-center h-full text-text-secondary text-sm">
      This feature is not enabled for your account. Contact your OSM team.
    </div>
  );
}
