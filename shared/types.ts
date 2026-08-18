// Shared types between client and server

export type UserRole = "athlete" | "osm_staff" | "osm_admin";

export type ReportType = "draft" | "nil" | "club";
export type ReportStatus = "pending" | "published" | "updated" | "archived";

export type EvidenceLabel =
  | "Verified Public Information"
  | "OSM Proprietary Data"
  | "OSM-Provided Athlete Information"
  | "Calculated Results"
  | "DiamondIQ Analysis / Inference"
  | "Missing / Unverified Information";

export interface User {
  id: number;
  email: string;
  role: UserRole;
  name: string;
  athleteId?: number | null;
  lastLogin?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface FeatureToggles {
  draftIntelligence: boolean;
  nilIntelligence: boolean;
  clubDraftIntelligence: boolean;
  knowledgeCenter: boolean;
  nilMarketingManagement: boolean;
  socialContentTools: boolean;
  calendar: boolean;
  agreements: boolean;
  deliverables: boolean;
}

export interface AthleteProfile {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  imageUrl?: string | null;
  dob?: string | null;
  hometown?: string | null;
  position: string;
  secondaryPosition?: string | null;
  bats?: string | null;
  throws?: string | null;
  heightIn?: number | null;
  weightLbs?: number | null;
  school?: string | null;
  conference?: string | null;
  level?: string | null;
  draftYear?: number | null;
  draftEligibility?: string | null;
  // NIL profile
  socialLinks?: Record<string, string> | null;
  verifiedAnalytics?: Record<string, string> | null;
  personalInterests?: string | null;
  causes?: string | null;
  travelPreference?: string | null;
  categoryExclusions?: string | null;
  brandRestrictions?: string | null;
  featureToggles: FeatureToggles;
}

export interface AthleteRanking {
  id: number;
  athleteId: number;
  source: string;
  ranking: number;
  rankingDate: string;
  lastUpdated: string;
  sourceRecord?: string | null;
}

export interface Report {
  id: number;
  athleteId: number;
  type: ReportType;
  status: ReportStatus;
  title: string;
  description?: string | null;
  researchQuestion?: string | null;
  generatedAt: string;
  publishedAt?: string | null;
  updatedAt: string;
  content?: ReportContent | null;
  adminNotes?: string | null;
  reportRef: string;
}

export interface ReportContent {
  sections: ReportSection[];
  methodology?: string;
  sources?: SourceRecord[];
}

export interface ReportSection {
  id: string;
  title: string;
  content: string | ReportSectionData;
  evidenceLabel?: EvidenceLabel;
  adminReview?: AdminReviewDecision;
  isHidden?: boolean;
}

export interface AdminReviewDecision {
  decision: "keep" | "edit" | "replace" | "hide";
  editedContent?: string;
  replacementContent?: string;
  internalNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ReportSectionData {
  type:
    | "draft_outcomes"
    | "comparable_players"
    | "bonus_range"
    | "opportunity_targets"
    | "market_insights"
    | "decision_makers"
    | "activation_concepts"
    | "action_plan"
    | "club_history"
    | "payment_behavior"
    | "bonus_pool"
    | "text";
  data: unknown;
}

export interface SourceRecord {
  label: EvidenceLabel;
  title: string;
  url?: string;
  date?: string;
  notes?: string;
}

export interface IntelligenceRequest {
  id: number;
  athleteId: number;
  reportId?: number | null;
  question: string;
  missingData: string;
  whyItMatters: string;
  recommendedAction: string;
  priority: "high" | "medium" | "low";
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  resolvedAt?: string | null;
  adminResponse?: string | null;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  category: string;
  summary: string;
  content: string;
  isPublished: boolean;
  publishedAt?: string | null;
  assignedToAll: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NilAgreement {
  id: number;
  athleteId: number;
  brand: string;
  term: string;
  status: "active" | "pending" | "expired" | "completed";
  compensationSummary?: string | null;
  nextObligation?: string | null;
  completionProgress: number;
  startDate?: string | null;
  endDate?: string | null;
  exclusivityTerms?: string | null;
  paymentDates?: string[] | null;
  athleteVisible: boolean;
}

export interface NilDeliverable {
  id: number;
  agreementId: number;
  athleteId: number;
  title: string;
  platform?: string | null;
  dueDate?: string | null;
  status:
    | "scheduled"
    | "content_needed"
    | "sent_to_brand"
    | "awaiting_approval"
    | "approved"
    | "posted"
    | "completed";
  requiredTag?: string | null;
  requiredLanguage?: string | null;
  prohibitedLanguage?: string | null;
  postWindowStart?: string | null;
  postWindowEnd?: string | null;
  brandAssets?: string | null;
}

export interface CalendarEvent {
  id: number;
  athleteId: number;
  title: string;
  type:
    | "appearance"
    | "signing"
    | "post"
    | "payment"
    | "meeting"
    | "shoot"
    | "expiration"
    | "other";
  date: string;
  time?: string | null;
  location?: string | null;
  organization?: string | null;
  notes?: string | null;
  daysUntil?: number;
}

export interface DatasetRecord {
  id: number;
  title: string;
  category: "draft" | "club" | "nil" | "osm";
  source: string;
  yearsCovered: string;
  uploadDate: string;
  lastUpdated: string;
  recordCount?: number | null;
  processingStatus: "processing" | "ready" | "error";
  confidence: "strong" | "moderate" | "limited" | "incomplete";
  reportsUsing: string[];
  notes?: string | null;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AuthSession {
  user: User;
  athlete?: AthleteProfile | null;
}
