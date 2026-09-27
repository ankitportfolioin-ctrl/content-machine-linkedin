export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  dependencies?: {
    database: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    path: string;
    requestId?: string;
  };
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface Opportunity {
  id: string;
  title: string;
  description?: string;
  status?: string;
  score?: number;
  topicId?: string;
  topic?: string;
  audience?: string;
  evidence?: unknown;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface OpportunitiesResponse {
  opportunities: Opportunity[];
  pagination?: {
    page?: number;
    perPage?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface OpportunityDetailResponse {
  opportunity: Opportunity;
}

export type OpportunityFeedbackKind =
  | 'useful'
  | 'not_useful'
  | 'already_covered'
  | 'wrong_audience'
  | 'weak_evidence'
  | 'not_timely';

export interface OpportunityFeedback {
  id?: string;
  feedback?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface IntelligenceOverview {
  sources?: number;
  topics?: number;
  trends?: number;
  opportunities?: number;
  gaps?: number;
  recentOpportunities?: Opportunity[];
  recentSources?: Source[];
  recentTrends?: TrendSignal[];
  [key: string]: unknown;
}

export interface TrendSignal {
  id: string;
  title?: string;
  description?: string;
  strength?: number;
  [key: string]: unknown;
}

export interface TrendsResponse {
  trends?: TrendSignal[];
  trendSignals?: TrendSignal[];
}

export interface ContentGap {
  id: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
}

export interface GapsResponse {
  gaps: ContentGap[];
}

export interface Source {
  id: string;
  url?: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SourcesResponse {
  sources: Source[];
}

export interface ConvertOpportunityResponse {
  contentIdea: ContentIdea;
  provenance?: {
    opportunityId?: string;
    topicId?: string;
    sourceIds?: string[];
    claimIds?: string[];
    trendSignalIds?: string[];
  };
}

export interface ContentIdea {
  id: string;
  title: string;
  description?: string;
  angle?: string;
  format?: string;
  tags?: string[];
  status?: string;
  opportunityId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ContentIdeasResponse {
  contentIdeas: ContentIdea[];
}

export interface ContentIdeaDetailResponse {
  contentIdea: ContentIdea;
}

export interface ContentPlan {
  id: string;
  thesis?: string;
  audience?: string;
  objective?: string;
  angle?: string;
  format?: string;
  narrativeStructure?: string;
  keyPoints?: string[];
  status?: string;
  contentIdeaId?: string;
  [key: string]: unknown;
}

export interface PlansResponse {
  plans: ContentPlan[];
}

export interface PlanDetailResponse {
  plan: ContentPlan;
}

export interface PlanValidation {
  ok: boolean;
  reasons: string[];
}

export interface ContentDraft {
  id: string;
  body?: string;
  structure?: unknown;
  preview?: string;
  status?: string;
  planId?: string;
  version?: number;
  [key: string]: unknown;
}

export interface ComposeDraftResponse {
  draftId: string;
  body?: string;
  structure?: unknown;
  preview?: string;
  contentDraft?: ContentDraft;
  [key: string]: unknown;
}

export interface DraftDetailResponse {
  contentDraft: ContentDraft;
}

export interface EvidenceBinding {
  id?: string;
  span?: string;
  sourceClaimId?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface BindingsResponse {
  bindings: EvidenceBinding[];
}

export interface DraftValidationResult {
  name?: string;
  check?: string;
  status?: string;
  passed?: boolean;
  score?: number;
  message?: string;
  [key: string]: unknown;
}

export interface DraftValidationResponse {
  validation?: {
    results?: DraftValidationResult[];
    finalStatus?: string;
    overallScore?: number;
    [key: string]: unknown;
  };
  findings?: unknown[];
  results?: DraftValidationResult[];
  finalStatus?: string;
  overallScore?: number;
}

export interface QualityGate {
  id?: string;
  name?: string;
  status?: string;
  score?: number;
  [key: string]: unknown;
}

export interface GatesResponse {
  gates: QualityGate[];
}

export interface DraftPreview {
  preview?: string;
  body?: string;
  internalMarkupFound?: string[];
  [key: string]: unknown;
}

export interface ContentReview {
  id: string;
  draftId?: string;
  note?: string;
  status?: string;
  decision?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ReviewsResponse {
  reviews: ContentReview[];
}

export interface ReviewDetailResponse {
  review: ContentReview;
}

export type ReviewDecision = 'approve' | 'reject' | 'request_changes';

export interface ContentVersion {
  id: string;
  draftId?: string;
  body?: string;
  changeSummary?: string;
  isFinal?: boolean;
  final?: boolean;
  createdAt?: string;
  [key: string]: unknown;
}

export interface VersionsResponse {
  versions: ContentVersion[];
}

export interface VersionDetailResponse {
  contentVersion: ContentVersion;
}

export interface VoiceProfile {
  id?: string;
  role?: string;
  headline?: string;
  professionalContext?: string;
  tone?: string;
  writingStyle?: string;
  bannedWords?: string[];
  preferredVocabulary?: string[];
  contentPillars?: string[];
  [key: string]: unknown;
}

export interface VoiceProfileResponse {
  voiceProfile: VoiceProfile | null;
}

export interface VoiceReceipt {
  id: string;
  fact?: string;
  context?: string;
  [key: string]: unknown;
}

export interface VoiceReceiptsResponse {
  receipts: VoiceReceipt[];
}

export interface VoiceReceiptDetailResponse {
  receipt: VoiceReceipt;
}

export interface VoiceSample {
  id: string;
  title?: string;
  content?: string;
  [key: string]: unknown;
}

export interface VoiceSamplesResponse {
  samples: VoiceSample[];
}

export interface VoiceSampleDetailResponse {
  sample: VoiceSample;
}

export interface UserProfile {
  id: string;
  name?: string;
  email?: string;
  headline?: string;
  bio?: string;
  [key: string]: unknown;
}

export interface ProfileResponse {
  profile: UserProfile;
}

export interface Icp {
  id: string;
  name: string;
  description?: string;
  targetRoles?: string[];
  industries?: string[];
  companySize?: string;
  problems?: string;
  exclusions?: string;
  [key: string]: unknown;
}

export interface IcpsResponse {
  icps: Icp[];
}

export interface IcpDetailResponse {
  icp: Icp;
}
