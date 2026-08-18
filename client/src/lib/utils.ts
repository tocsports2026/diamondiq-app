export function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateShort(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatMonthYear(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function heightDisplay(inches: number | null | undefined) {
  if (!inches) return "—";
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft}'${inch}"`;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function getEvidenceClass(label: string | undefined) {
  if (!label) return "evidence-tag";
  if (label.includes("Verified Public")) return "evidence-tag evidence-verified";
  if (label.includes("OSM Proprietary") || label.includes("OSM-Provided")) return "evidence-tag evidence-osm";
  if (label.includes("Calculated")) return "evidence-tag evidence-calculated";
  if (label.includes("Analysis") || label.includes("Inference")) return "evidence-tag evidence-inference";
  if (label.includes("Missing")) return "evidence-tag evidence-missing";
  return "evidence-tag";
}

export function getEvidenceLabelShort(label: string | undefined) {
  if (!label) return "";
  if (label.includes("Verified Public")) return "Verified";
  if (label.includes("OSM Proprietary")) return "OSM Proprietary";
  if (label.includes("OSM-Provided")) return "OSM Data";
  if (label.includes("Calculated")) return "Calculated";
  if (label.includes("Analysis") || label.includes("Inference")) return "Analysis";
  if (label.includes("Missing")) return "Unverified";
  return label;
}

export function reportTypeLabel(type: string) {
  const map: Record<string, string> = {
    draft: "Draft Intelligence",
    nil: "NIL Intelligence",
    club: "Club Draft Intelligence",
  };
  return map[type] || type;
}

export function reportTypeColor(type: string) {
  const map: Record<string, string> = {
    draft: "text-teal",
    nil: "text-status-updated",
    club: "text-status-pending",
  };
  return map[type] || "text-text-secondary";
}
