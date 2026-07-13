export type EvidenceStatus = "confirmed" | "probable" | "unverified" | "contradicted";

export type Evidence = {
  status: EvidenceStatus;
  label: string;
  detail: string;
  sourceUrl?: string;
};

export type CategoryKey = "dental" | "physio" | "car_dealer" | "custom";

export type SearchFilters = {
  requireReviewRange: boolean;
  minReviews: number;
  maxReviews: number;
  minProfessionals: number;
  maxProfessionals: number;
  requireOperational: boolean;
  requirePublicContact: boolean;
  requireReception: boolean;
  requireOwnerPresent: boolean;
  requireNoItTeam: boolean;
  acceptProbable: boolean;
};

export type SearchRequest = {
  provider: "osm" | "google";
  category: CategoryKey;
  customQuery?: string;
  area: string;
  locationMode: "country" | "area" | "cities";
  locations: string[];
  maxPages: number;
  filters: SearchFilters;
};

export type LeadSignals = {
  professionals: Evidence & { count?: number };
  reception: Evidence;
  ownerPresent: Evidence;
  noItTeam: Evidence;
  noApp: Evidence;
  manualContact: Evidence;
  publicContact: Evidence;
  operational: Evidence;
  websiteQuality: Evidence;
};

export type ScoreComponent = {
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
};

export type Lead = {
  id: string;
  name: string;
  category: CategoryKey;
  address: string;
  area: string;
  rating?: number;
  reviewCount: number;
  reviewCountKnown: boolean;
  website?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  mapsUrl?: string;
  businessStatus?: string;
  verifiedAt: string;
  source: "google" | "osm" | "demo";
  signals: LeadSignals;
  score: number;
  scoreBreakdown?: ScoreComponent[];
  qualification: "qualified" | "review" | "rejected";
  qualificationReasons: string[];
};

export type OutreachRecipient = {
  leadId: string;
  name: string;
  area: string;
  email: string;
  website?: string;
  contactSourceUrl?: string;
  contactCollectedAt: string;
};

export type OutreachCampaign = {
  subject: string;
  message: string;
  senderName: string;
  companyName: string;
  postalAddress: string;
  recipients: OutreachRecipient[];
};

export type CategoryConfig = {
  key: CategoryKey;
  name: string;
  shortName: string;
  query: string;
  icon: string;
  professionalLabel?: string;
  roleTerms: string[];
  receptionTerms: string[];
  ownerTerms: string[];
};
