import React from "react";
import { useAuth } from "../context/AuthContext";

interface TopBarProps {
  onNavigate: (path: string) => void;
  onCreateReport?: () => void;
}

export default function TopBar({ onNavigate, onCreateReport }: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="h-12 flex-shrink-0 border-b border-bg-border bg-bg-deep flex items-center justify-end px-5 gap-4">
      {/* Notifications placeholder */}
      <button className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors text-sm">
        <BellIcon />
        <span className="text-xs">Notifications</span>
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal text-bg-base text-2xs font-bold">
          3
        </span>
      </button>

      {/* User menu */}
      <button className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors text-sm">
        <UserIcon />
        <span className="text-xs font-medium">{user?.name || "OSM Team"}</span>
      </button>

      {/* Create new report */}
      {onCreateReport && (
        <button
          onClick={onCreateReport}
          className="diq-btn-primary text-xs px-3 py-1.5"
        >
          <span className="text-base leading-none">+</span>
          CREATE NEW REPORT
        </button>
      )}
    </header>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
