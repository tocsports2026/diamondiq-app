import React from "react";
import { useAuth } from "../context/AuthContext";
import { AthleteProfile } from "@shared/types";
import { cn } from "../lib/utils";

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

function NavLink({
  item,
  currentPath,
  onNavigate,
}: {
  item: NavItem;
  currentPath: string;
  onNavigate: (p: string) => void;
}) {
  const active = currentPath === item.path;
  return (
    <button
      onClick={() => onNavigate(item.path)}
      className={active ? "diq-nav-item-active w-full text-left" : "diq-nav-item w-full text-left"}
    >
      {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
      {item.label}
    </button>
  );
}

export default function Sidebar({ currentPath, onNavigate }: SidebarProps) {
  const { user, athlete, logout } = useAuth();
  const ft = athlete?.featureToggles;

  const showMyOSM =
    ft &&
    (ft.calendar || ft.agreements || ft.deliverables || ft.socialContentTools);

  const navItems: (NavItem | { type: "section"; label: string } | { type: "divider" })[] = [
    { path: "/", label: "Home" },
    { path: "/ask", label: "Ask DiamondIQ" },
    { type: "section", label: "Intelligence" },
    { path: "/draft", label: "Draft Intelligence" },
    { path: "/nil", label: "NIL Intelligence" },
    { path: "/club", label: "Club Draft Intelligence" },
  ];

  if (showMyOSM) {
    navItems.push({ type: "section", label: "My OSM" });
    if (ft?.calendar) navItems.push({ path: "/calendar", label: "Calendar" });
    if (ft?.agreements) navItems.push({ path: "/agreements", label: "Agreements" });
    if (ft?.deliverables) navItems.push({ path: "/deliverables", label: "Deliverables" });
    if (ft?.socialContentTools) navItems.push({ path: "/content", label: "Content & Social" });
  }

  navItems.push({ type: "section", label: "Reports & Resources" });
  navItems.push({ path: "/reports", label: "My Reports" });
  navItems.push({ path: "/knowledge", label: "Knowledge Center" });
  navItems.push({ type: "section", label: "Account" });
  navItems.push({ path: "/profile", label: "Athlete Profile" });
  navItems.push({ path: "/settings", label: "Settings" });

  return (
    <aside className="w-[168px] flex-shrink-0 bg-bg-deep border-r border-bg-border flex flex-col h-screen sticky top-0 overflow-y-auto">
      {/* Logo area */}
      <div className="p-4 border-b border-bg-border">
        {/* TOC Sports logo — official asset only */}
        <div className="mb-3">
          <img
            src="/assets/branding/TOC_White_OFFICIAL.png"
            alt="TOC Sports"
            className="h-10 w-auto object-contain"
            onError={(e) => {
              // Per spec: if logo fails to load, show nothing
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="font-condensed font-bold text-base text-text-primary tracking-wider">
          DIAMONDIQ
        </div>
        <div className="text-2xs text-text-secondary leading-tight mt-0.5">
          BASEBALL INTELLIGENCE.
          <br />
          BETTER DECISIONS.
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 pt-3">
        {navItems.map((item, i) => {
          if ("type" in item) {
            if (item.type === "section") {
              return (
                <div key={i} className="diq-section-label mt-3 first:mt-0">
                  {item.label}
                </div>
              );
            }
            return <div key={i} className="my-1 border-t border-bg-border" />;
          }
          return (
            <NavLink
              key={item.path}
              item={item}
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      {/* Log Out */}
      <div className="p-2 border-t border-bg-border">
        <button
          onClick={logout}
          className="diq-nav-item w-full text-left text-text-muted hover:text-text-red"
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}
